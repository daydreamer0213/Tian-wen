import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import ts from 'typescript'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const key = (path: string) => resolve(path).replaceAll('\\', '/').toLowerCase()
const REQUIREMENT = 'Use the existing receipt interface for cold recovery; user sandbox mode events contain only mode; preserve all other types, execution and assertions.'
const printer = ts.createPrinter({ removeComments: true })
export interface ContractDiagnostic { readonly code: number; readonly file: string | null; readonly start: number | null; readonly message: string }
const diagnostics = (program: ts.Program): readonly ContractDiagnostic[] => ts.getPreEmitDiagnostics(program).map(item => ({
  code: item.code, file: item.file?.fileName ?? null, start: item.start ?? null,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
}))

// Deliberately task-specific: neither a verifier registry nor a production learning verdict.
export function freezeReceiptTestContract(input: { readonly root: string; readonly targetPath: string; readonly receiptPath: string;
  readonly contextRoots: readonly string[] }) {
  const root = resolve(input.root); const targetPath = resolve(input.targetPath); const receiptPath = resolve(input.receiptPath)
  const paths: Record<string, string[]> = {}
  const packages = join(root, 'packages')
  if (existsSync(packages)) for (const entry of readdirSync(packages)) {
    const base = join(packages, entry); const manifest = join(base, 'package.json'); const index = join(base, 'src/index.ts')
    if (existsSync(manifest) && existsSync(index)) {
      const name = (JSON.parse(readFileSync(manifest, 'utf8')) as { name: string }).name
      paths[name] = [index]; paths[`${name}/*`] = [join(base, 'src/*')]
    }
  }
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, jsx: ts.JsxEmit.ReactJSX,
    noEmit: true, skipLibCheck: false, types: ['node'], typeRoots: [resolve(import.meta.dirname, '../node_modules/@types')], paths }
  const texts = new Map<string, string | undefined>(); const files = new Map<string, boolean>()
  const directories = new Map<string, boolean>(); const children = new Map<string, string[]>(); const realPaths = new Map<string, string>()
  const host = ts.createCompilerHost(options, true)
  const read = host.readFile; const fileExists = host.fileExists; const directoryExists = host.directoryExists!
  const getDirectories = host.getDirectories!; const realpath = host.realpath!
  host.getCurrentDirectory = () => root
  host.readFile = path => {
    const id = key(path); if (!texts.has(id)) texts.set(id, read(path)); return texts.get(id)
  }
  host.fileExists = path => { const id = key(path); if (!files.has(id)) files.set(id, fileExists(path)); return files.get(id)! }
  host.directoryExists = path => { const id = key(path); if (!directories.has(id)) directories.set(id, directoryExists(path)); return directories.get(id)! }
  host.getDirectories = path => { const id = key(path); if (!children.has(id)) children.set(id, getDirectories(path)); return children.get(id)! }
  host.realpath = path => { const id = key(path); if (!realPaths.has(id)) realPaths.set(id, realpath(path)); return realPaths.get(id)! }
  host.writeFile = () => { throw new Error('contract must not emit') }
  const roots = [targetPath, receiptPath, ...input.contextRoots.map(path => resolve(path))]
  const baseline = ts.createProgram(roots, options, host)
  const baselineDiagnostics = diagnostics(baseline)
  const original = baseline.getSourceFile(targetPath)
  if (original === undefined || baselineDiagnostics.length !== 3 || baselineDiagnostics.some(item => item.file === null || key(item.file) !== key(targetPath)
    || ![2345, 2740, 2322].includes(item.code))) throw new Error('selected three-error pending task required')
  let ordinal = 0; let retainedOrdinal = -1
  function locate(node: ts.Node) {
    if (ts.isVariableDeclaration(node)) {
      const position = ordinal++
      if (node.name.getText(original) === 'retained' && node.type?.getText(original) === 'Parameters<typeof parseConversationFileTrialReceipt>[0]') {
        if (retainedOrdinal !== -1) throw new Error('ambiguous retained variable')
        retainedOrdinal = position
      }
    }
    ts.forEachChild(node, locate)
  }
  locate(original)
  if (retainedOrdinal === -1) throw new Error('original cold receipt annotation required')
  function skeleton(source: ts.SourceFile, baselineSource: boolean) {
    let position = 0; let removedSources = 0; let retained: ts.VariableDeclaration | undefined
    const transformed = ts.transform(source, [context => {
      const visit: ts.Visitor = node => {
        if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) return undefined
        if (ts.isImportDeclaration(node) && node.importClause?.namedBindings !== undefined && ts.isNamedImports(node.importClause.namedBindings)) {
          const kept = node.importClause.namedBindings.elements.filter(element => !element.isTypeOnly)
          if (kept.length > 0 && kept.length !== node.importClause.namedBindings.elements.length) {
            return ts.factory.updateImportDeclaration(node, node.modifiers,
              ts.factory.updateImportClause(node.importClause, false, node.importClause.name, ts.factory.updateNamedImports(node.importClause.namedBindings, kept)),
              node.moduleSpecifier, node.attributes)
          }
        }
        if (ts.isVariableDeclaration(node) && position++ === retainedOrdinal) {
          retained = node
          return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, undefined, node.initializer)
        }
        if (baselineSource && ts.isCallExpression(node) && node.expression.getText(source) === 'harness.parent.agent.session.append'
          && node.arguments[0]?.getText(source) === "'sandbox/mode'" && node.arguments[1] !== undefined
          && ts.isObjectLiteralExpression(node.arguments[1])) {
          const object = node.arguments[1]
          const properties = object.properties.filter(property => {
            const remove = ts.isPropertyAssignment(property) && property.name.getText(source) === 'source'
              && property.initializer.getText(source) === "'user'"
            if (remove) removedSources++
            return !remove
          })
          return ts.factory.updateCallExpression(node, node.expression, node.typeArguments,
            [node.arguments[0], ts.factory.updateObjectLiteralExpression(object, properties)])
        }
        return ts.visitEachChild(node, visit, context)
      }
      return node => ts.visitNode(node, visit) as ts.SourceFile
    }])
    try { return { text: printer.printFile(transformed.transformed[0]!), removedSources, retained } }
    finally { transformed.dispose() }
  }
  const expected = skeleton(original, true)
  if (expected.removedSources !== 2) throw new Error('two original user-mode events required')
  // Complete captured read manifest, including negative existence and resolution observations.
  const manifest = [...texts].map(([path, text]) => [path, text === undefined ? null : digest(text)]).sort()
  const require = createRequire(import.meta.url)
  const compilerDigest = digest(readFileSync(require.resolve('typescript'), 'utf8'))
  const checkerDigest = digest(readFileSync(resolve(import.meta.dirname, 'receipt-test-contract.ts'), 'utf8'))
  const contractDigest = digest({ requirement: REQUIREMENT, compiler: ts.version, options, roots,
    compilerDigest, checkerDigest, manifest, files: [...files].sort(), directories: [...directories].sort(), children: [...children].sort(), realPaths: [...realPaths].sort() })
  const originalDigest = digest(original.text)
  const summary = Object.freeze({ contractDigest, originalDigest, requirement: REQUIREMENT, compiler: ts.version, compilerDigest, checkerDigest,
    capturedFiles: texts.size, baselineDiagnostics: Object.freeze(baselineDiagnostics.map(item => Object.freeze(item))) })
  return Object.freeze({ ...summary, capturedText(path: string) {
    const text = texts.get(key(path))
    if (text === undefined) throw new Error('file is outside captured checking inputs')
    return text
  }, check(candidate: string) {
    const binding = { contractDigest, originalDigest, candidateDigest: digest(candidate) }
    const reject = (reason: string, detail: readonly ContractDiagnostic[] = []) => ({ status: 'rejected' as const, reason, binding, diagnostics: detail })
    if (Buffer.byteLength(candidate, 'utf8') > 96 * 1024 || /@ts-(?:ignore|expect-error|nocheck|check)\b|\/\/\/\s*<reference\b/u.test(candidate)) {
      return reject('changed-checking-directives-or-size')
    }
    const source = ts.createSourceFile(targetPath, candidate, ts.ScriptTarget.ES2024, true)
    if (skeleton(source, false).text !== expected.text) return reject('outside-permitted-repair')
    // A fresh CompilerHost reads only the pre-candidate manifest. No candidate execution, emit or live filesystem lookup.
    const frozen = ts.createCompilerHost(options, true)
    frozen.getCurrentDirectory = host.getCurrentDirectory
    frozen.readFile = path => key(path) === key(targetPath) ? candidate : texts.get(key(path))
    frozen.fileExists = path => texts.get(key(path)) !== undefined || files.get(key(path)) === true
    frozen.directoryExists = path => directories.get(key(path)) === true
    frozen.getDirectories = path => children.get(key(path)) ?? []
    frozen.realpath = path => realPaths.get(key(path)) ?? path
    frozen.readDirectory = () => []
    frozen.writeFile = host.writeFile
    const program = ts.createProgram(roots, options, frozen)
    const errors = diagnostics(program)
    if (errors.length !== 0) return reject('strict-typecheck-failed', errors)
    const candidateSource = program.getSourceFile(targetPath)!
    const actual = skeleton(candidateSource, false).retained
    const receipt = program.getSourceFile(receiptPath)?.statements.find(node => ts.isInterfaceDeclaration(node)
      && node.name.text === 'ConversationFileTrialReceipt')
    if (actual === undefined || receipt === undefined || program.getTypeChecker().getTypeAtLocation(actual)
      !== program.getTypeChecker().getTypeAtLocation(receipt)) return reject('existing-receipt-type-required')
    return { status: 'verified' as const, binding, diagnostics: errors }
  } })
}

/** Controller-owned actual pending task; do not call with candidate-provided paths or expectations. */
export function prepareConversationTrialTypecheck(root: string) {
  const require = createRequire(join(root, 'package.json'))
  const cli = createRequire(require.resolve('@deepseek-ai/dsh/package.json'))
  return freezeReceiptTestContract({ root, targetPath: join(root, 'tests/dsh-migration/conversation-file-trial.spec.ts'),
    receiptPath: join(root, 'packages/tianwen-evolution/src/conversation-files.ts'),
    contextRoots: [join(dirname(cli.resolve('@deepseek-ai/dsh-sandbox-policy')), 'types/index.d.ts')] })
}
