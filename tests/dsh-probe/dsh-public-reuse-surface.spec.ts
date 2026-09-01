import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import MessageFeedbackService from '@deepseek-ai/dsh-message-feedback'
import SqliteSessionQueryEngine from '@deepseek-ai/dsh-session-query-sqlite'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import WorkerThreadWorkflowEngine from '@deepseek-ai/dsh-workflow-worker-thread'
import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const REMOVED_RUNTIME_DESCRIPTOR_CONSUMER = resolve(
  repositoryRoot,
  'packages/tianwen-runtime-bundle/src/long-goal-subagent.ts',
)
const RUNTIME_PUBLIC_CONSUMERS = [
  'packages/tianwen-runtime-bundle/src/long-goal-host.ts',
  'packages/tianwen-runtime-bundle/src/native-long-goal-child.ts',
].map(path => resolve(repositoryRoot, path))
const DSH_SUBAGENT_ROOT = '@deepseek-ai/dsh-subagent'

function modulePattern(
  node: ts.Expression | undefined,
  constants: ReadonlyMap<string, string>,
  shadowed: ReadonlySet<string>,
): string | undefined {
  if (node === undefined) return undefined
  if (ts.isStringLiteralLike(node)) return node.text
  if (ts.isIdentifier(node)) return shadowed.has(node.text) ? '<dynamic>' : constants.get(node.text) ?? '<dynamic>'
  if (ts.isParenthesizedExpression(node)) return modulePattern(node.expression, constants, shadowed)
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans
      .map(span => `${modulePattern(span.expression, constants, shadowed) ?? '<dynamic>'}${span.literal.text}`)
      .join('')
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return `${modulePattern(node.left, constants, shadowed) ?? '<dynamic>'}${modulePattern(node.right, constants, shadowed) ?? '<dynamic>'}`
  }
  return undefined
}

function collectBindingNames(name: ts.BindingName, bindings: Set<string>): void {
  if (ts.isIdentifier(name)) {
    bindings.add(name.text)
    return
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) collectBindingNames(element.name, bindings)
  }
}

function scopeShadowed(node: ts.Node): Set<string> {
  const shadowed = new Set<string>()
  for (let current = node.parent; current !== undefined && !ts.isSourceFile(current); current = current.parent) {
    if (ts.isFunctionLike(current)) {
      for (const parameter of current.parameters) collectBindingNames(parameter.name, shadowed)
    } else if (ts.isBlock(current)) {
      for (const statement of current.statements) {
        if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            collectBindingNames(declaration.name, shadowed)
          }
        } else if (
          (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
          && statement.name !== undefined
        ) {
          shadowed.add(statement.name.text)
        }
      }
    } else if (ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current)) {
      const initializer = current.initializer
      if (initializer !== undefined && ts.isVariableDeclarationList(initializer)) {
        for (const declaration of initializer.declarations) collectBindingNames(declaration.name, shadowed)
      }
    } else if (ts.isCatchClause(current) && current.variableDeclaration !== undefined) {
      collectBindingNames(current.variableDeclaration.name, shadowed)
    }
  }
  return shadowed
}

function privateSubagentImports(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    'runtime-consumer.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  )
  const constants = new Map<string, string>()
  const collectConstants = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer !== undefined
      && ts.isStringLiteralLike(node.initializer)
      && ts.isVariableDeclarationList(node.parent)
      && (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      const existing = constants.get(node.name.text)
      if (existing === undefined || existing === node.initializer.text) constants.set(node.name.text, node.initializer.text)
      else constants.set(node.name.text, '<dynamic>')
    }
    ts.forEachChild(node, collectConstants)
  }
  collectConstants(sourceFile)
  const violations = new Set<string>()
  const inspect = (expression: ts.Expression | undefined): void => {
    const pattern = modulePattern(expression, constants, scopeShadowed(expression ?? sourceFile))
    if (
      pattern?.startsWith(`${DSH_SUBAGENT_ROOT}/`) === true
      || pattern?.includes('dsh-subagent/') === true
      || (
        pattern?.includes('<dynamic>') === true
        && source.includes('dsh-subagent')
      )
    ) violations.add(pattern)
  }
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      inspect(node.moduleSpecifier)
    } else if (
      ts.isCallExpression(node)
      && (
        node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require')
        || (
          ts.isPropertyAccessExpression(node.expression)
          && ts.isIdentifier(node.expression.expression)
          && node.expression.expression.text === 'require'
          && node.expression.name.text === 'resolve'
        )
      )
    ) {
      inspect(node.arguments?.[0])
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      inspect(node.argument.literal)
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      inspect(node.moduleReference.expression)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return [...violations]
}

describe('DSH rc.2 reusable public seams', () => {
  it('resolves Session Query and Skill from public package roots', () => {
    expect(SqliteSessionQueryEngine).toBeTypeOf('function')
    expect(SkillRegistry).toBeTypeOf('function')
  })

  it('resolves Jobs, Workflow, and Message Feedback from public package roots', () => {
    expect(LocalJobRegistry).toBeTypeOf('function')
    expect(WorkerThreadWorkflowEngine).toBeTypeOf('function')
    expect(MessageFeedbackService).toBeTypeOf('function')
  })

  it('keeps the Runtime descriptor consumer on public DSH imports', () => {
    expect(existsSync(REMOVED_RUNTIME_DESCRIPTOR_CONSUMER)).toBe(false)
    for (const consumer of RUNTIME_PUBLIC_CONSUMERS) {
      expect(existsSync(consumer), consumer).toBe(true)
      expect(privateSubagentImports(readFileSync(consumer, 'utf8')), consumer).toEqual([])
    }
    for (const [name, source] of Object.entries({
      'static-lib': "import '@deepseek-ai/dsh-subagent/lib/private.js'\n",
      'static-src': "export * from '@deepseek-ai/dsh-subagent/src/private.js'\n",
      'dynamic-lib': "void import('@deepseek-ai/dsh-subagent/lib/private.js')\n",
      'dynamic-src': "void import('@deepseek-ai/dsh-subagent/src/private.js')\n",
      'dynamic-concatenated': "void import('@deepseek-ai/' + 'dsh-subagent/lib/private.js')\n",
      'dynamic-template': "const path = 'src/private.js'\nvoid import(`@deepseek-ai/dsh-subagent/${path}`)\n",
      'dynamic-package-name': "const packageName = 'dsh-subagent'\nvoid import(`@deepseek-ai/${packageName}/lib/private.js`)\n",
      'combined-dynamic': "const packageName = 'dsh-subagent'\nconst privatePath = 'src/private.js'\nvoid import(`@deepseek-ai/${packageName}/${privatePath}`)\n",
      'let-forwarded': "let packageName = 'dsh-subagent'\nlet privatePath = 'src/private.js'\nvoid import(`@deepseek-ai/${packageName}/${privatePath}`)\n",
      'parameter-forwarded': "function load(packageName: string, privatePath: string) { return import(`@deepseek-ai/${packageName}/${privatePath}`) }\nvoid load('dsh-subagent', 'src/private.js')\n",
      'scope-shadowing': "const packageName = 'safe-package'\nfunction load(packageName: string) {\n  return import(`@deepseek-ai/${packageName}/src/private.js`)\n}\nvoid load('dsh-subagent')\n",
    })) expect(privateSubagentImports(source), name).not.toEqual([])
    expect(privateSubagentImports(
      "import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'\n",
    )).toEqual([])
    expect(privateSubagentImports(
      "let packageName = 'dsh-subagent'\nlet privatePath = 'src/private.js'\nconst note = `not a loader: @deepseek-ai/${packageName}/${privatePath}`\nvoid note\n",
    )).toEqual([])

    expect(snapshotSubagentDescriptor({
      mode: 'continuable',
      provider: 'spawn',
      label: 'Tianwen public contract child',
    })).toMatchObject({
      version: 2,
      mode: 'continuable',
      provider: 'spawn',
      label: 'Tianwen public contract child',
    })
  })
})
