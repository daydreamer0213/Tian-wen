import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { sha256 } from '../packages/tianwen-evolution/src/index.js'
import type { ConversationExternalCodeCheck } from '../packages/tianwen-runtime-bundle/src/conversation-external-check.js'
import { createConversationTypeScriptCheck, type ConversationTypeScriptCheckConfig } from './conversation-typescript-check.js'

const REQUIREMENT = 'Repair only the original glob payload assertion type; preserve all execution, assertions, data and other types; no any, unknown, never or new checking suppressions.'
const printer = ts.createPrinter({ removeComments: true })
function source(text: string, path: string) { return ts.createSourceFile(path, text, ts.ScriptTarget.ES2024, true) }
function typeBindings(file: ts.SourceFile): readonly string[] {
  const bindings: string[] = []
  for (const node of file.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || node.importClause === undefined) continue
    const clause = node.importClause, module = node.moduleSpecifier.text
    if (clause.isTypeOnly && clause.name !== undefined) bindings.push(JSON.stringify([module, 'default', clause.name.text]))
    if (clause.namedBindings !== undefined && ts.isNamespaceImport(clause.namedBindings) && clause.isTypeOnly) bindings.push(JSON.stringify([module, '*', clause.namedBindings.name.text]))
    if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) {
      if (clause.isTypeOnly || item.isTypeOnly) bindings.push(JSON.stringify([module, item.propertyName?.text ?? item.name.text, item.name.text]))
    }
  }
  return bindings.sort()
}
function preservesBindings(original: readonly string[], candidate: readonly string[]): boolean {
  const remaining = [...candidate]
  return original.every(binding => { const index = remaining.indexOf(binding); if (index < 0) return false; remaining.splice(index, 1); return true })
}
function originalSlot(file: ts.SourceFile): number | undefined {
  let ordinal = 0
  const matches: number[] = []
  function visit(node: ts.Node) {
    if (ts.isAsExpression(node)) {
      const current = ordinal++
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'payload'
        && ts.isCallExpression(node.expression.expression)
        && node.expression.expression.expression.getText(file).endsWith('parseConversationTaskFileAncillary')
        && node.type.getText(file).replace(/\s/gu, '') === '{paths:string[]}') matches.push(current)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return matches.length === 1 ? matches[0] : undefined
}
function skeleton(file: ts.SourceFile, slot: number): { readonly text: string; readonly type?: ts.TypeNode } {
  let ordinal = 0, type: ts.TypeNode | undefined
  const transformed = ts.transform(file, [context => {
    const visit: ts.Visitor = node => {
      if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) return undefined
      if (ts.isImportDeclaration(node) && node.importClause?.namedBindings !== undefined && ts.isNamedImports(node.importClause.namedBindings)) {
        const kept = node.importClause.namedBindings.elements.filter(element => !element.isTypeOnly)
        // An all-type specifier list can still emit a side-effect import with
        // verbatimModuleSyntax. Only strip specifiers from a runtime import.
        if (kept.length > 0 && kept.length !== node.importClause.namedBindings.elements.length) return ts.factory.updateImportDeclaration(node, node.modifiers,
          ts.factory.updateImportClause(node.importClause, false, node.importClause.name, ts.factory.updateNamedImports(node.importClause.namedBindings, kept)), node.moduleSpecifier, node.attributes)
      }
      if (ts.isAsExpression(node) && ordinal++ === slot) {
        type = node.type
        return ts.factory.updateAsExpression(node, node.expression, ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword))
      }
      return ts.visitEachChild(node, visit, context)
    }
    return node => ts.visitNode(node, visit) as ts.SourceFile
  }])
  try { return { text: printer.printFile(transformed.transformed[0]!), ...(type === undefined ? {} : { type }) } }
  finally { transformed.dispose() }
}
function forbidden(type: ts.TypeNode): boolean {
  let found = false
  function visit(node: ts.Node) {
    if ([ts.SyntaxKind.AnyKeyword, ts.SyntaxKind.UnknownKeyword, ts.SyntaxKind.NeverKeyword].includes(node.kind)) found = true
    ts.forEachChild(node, visit)
  }
  visit(type)
  return found
}
function forbiddenResolved(program: ts.Program, node: ts.TypeNode): boolean {
  const checker = program.getTypeChecker(), seen = new Set<ts.Type>()
  function visit(type: ts.Type): boolean {
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) return true
    if (seen.has(type)) return false
    seen.add(type)
    // A bounded, finite type obligation; no unbounded traversal of a supplied
    // type graph. Primitive and array library methods need no inspection.
    if (seen.size > 256) return true
    if (type.isUnionOrIntersection()) return type.types.some(visit)
    if (type.flags & ts.TypeFlags.TypeParameter) {
      const constraint = checker.getBaseConstraintOfType(type), fallback = checker.getDefaultFromTypeParameter(type)
      return (constraint !== undefined && visit(constraint)) || (fallback !== undefined && visit(fallback))
    }
    if (!(type.flags & ts.TypeFlags.Object)) return false
    if (checker.isArrayType(type) || checker.isTupleType(type)) return checker.getTypeArguments(type as ts.TypeReference).some(visit)
    if (checker.getPropertiesOfType(type).some(property => visit(checker.getTypeOfSymbolAtLocation(property, node)))) return true
    if ([ts.IndexKind.Number, ts.IndexKind.String].some(kind => { const value = checker.getIndexTypeOfType(type, kind); return value !== undefined && visit(value) })) return true
    return [...type.getCallSignatures(), ...type.getConstructSignatures()].some(signature => (signature.typeParameters ?? []).some(visit) || visit(checker.getReturnTypeOfSignature(signature))
      || signature.getParameters().some(parameter => visit(checker.getTypeOfSymbolAtLocation(parameter, node))))
  }
  return visit(checker.getTypeFromTypeNode(node))
}

/** One pending project's type-only obligation, not a general task verifier. */
export function createAncillaryTypeResultContract(config: ConversationTypeScriptCheckConfig): ConversationExternalCodeCheck {
  const wrapperDigest = sha256(readFileSync(fileURLToPath(import.meta.url), 'utf8'))
  const targetPath = config.targetPath
  const compiler = createConversationTypeScriptCheck(config, { digest: sha256({ wrapperDigest, requirement: REQUIREMENT }), check(program, target) {
    // The wrapper has already required the original skeleton. Inspect the
    // compiler's own nodes so aliases resolve against frozen declarations.
    const selected: ts.TypeNode[] = []
    function visit(node: ts.Node) {
      if (ts.isAsExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'payload'
        && ts.isCallExpression(node.expression.expression) && node.expression.expression.expression.getText(target).endsWith('parseConversationTaskFileAncillary')) selected.push(node.type)
      ts.forEachChild(node, visit)
    }
    visit(target)
    return selected.length === 0 || selected.some(type => forbiddenResolved(program, type)) ? 'Forbidden or excessive resolved ancillary repair type.' : undefined
  } })
  return { async prepare(material) {
    const prepared = await compiler.prepare(material)
    if (prepared === undefined) return undefined
    const input = prepared.inputs.length === 1 ? prepared.inputs[0] : undefined
    if (input?.path !== targetPath || typeof input.content !== 'string') return undefined
    const original = source(input.content, targetPath), slot = originalSlot(original)
    if (slot === undefined) return undefined
    const frozen = skeleton(original, slot)
    const bindings = typeBindings(original)
    return { ...prepared,
      checkerId: 'ancillary-type-preservation',
      checkerDigest: sha256({ compiler: prepared.checkerDigest, wrapperDigest }),
      contractDigest: sha256({ compiler: prepared.contractDigest, wrapperDigest, requirement: REQUIREMENT, slot, skeleton: frozen.text, bindings }),
      async evaluate(candidate) {
        candidate.signal.throwIfAborted()
        const output = candidate.outputs.length === 1 ? candidate.outputs[0] : undefined
        if (output?.path !== targetPath || typeof output.content !== 'string') return { status: 'unverifiable', detail: 'Frozen ancillary type repair output unavailable.' }
        const file = source(output.content, targetPath), value = skeleton(file, slot)
        if (value.text !== frozen.text || value.type === undefined || forbidden(value.type) || !preservesBindings(bindings, typeBindings(file))) {
          return { status: 'rejected', detail: 'Frozen ancillary type repair violates execution, assertion or type-preservation requirements.' }
        }
        const result = await prepared.evaluate(candidate)
        return result.status === 'verified' ? { status: 'verified', detail: 'Frozen ancillary type repair: strict compiler and original execution/assertion/type skeleton preserved; no broader task or learning claim.' } : result
      },
    }
  } }
}
