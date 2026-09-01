import { readFileSync } from 'node:fs'
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
const RUNTIME_DESCRIPTOR_CONSUMER = resolve(
  repositoryRoot,
  'packages/tianwen-runtime-bundle/src/long-goal-subagent.ts',
)
const DSH_SUBAGENT_ROOT = '@deepseek-ai/dsh-subagent'

function modulePattern(node: ts.Expression | undefined): string | undefined {
  if (node === undefined) return undefined
  if (ts.isStringLiteralLike(node)) return node.text
  if (ts.isParenthesizedExpression(node)) return modulePattern(node.expression)
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans
      .map(span => `${modulePattern(span.expression) ?? '<dynamic>'}${span.literal.text}`)
      .join('')
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return `${modulePattern(node.left) ?? '<dynamic>'}${modulePattern(node.right) ?? '<dynamic>'}`
  }
  return undefined
}

function privateSubagentImports(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    'runtime-consumer.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  )
  const violations = new Set<string>()
  const inspect = (expression: ts.Expression | undefined): void => {
    const pattern = modulePattern(expression)
    if (
      pattern?.startsWith(`${DSH_SUBAGENT_ROOT}/`) === true
      || pattern?.includes('dsh-subagent/') === true
      || (pattern?.includes('<dynamic>') === true && source.includes('dsh-subagent'))
    ) violations.add(pattern)
  }
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      inspect(node.moduleSpecifier)
    } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
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
    expect(privateSubagentImports(readFileSync(RUNTIME_DESCRIPTOR_CONSUMER, 'utf8'))).toEqual([])
    for (const [name, source] of Object.entries({
      'static-lib': "import '@deepseek-ai/dsh-subagent/lib/private.js'\n",
      'static-src': "export * from '@deepseek-ai/dsh-subagent/src/private.js'\n",
      'dynamic-lib': "void import('@deepseek-ai/dsh-subagent/lib/private.js')\n",
      'dynamic-src': "void import('@deepseek-ai/dsh-subagent/src/private.js')\n",
      'dynamic-concatenated': "void import('@deepseek-ai/' + 'dsh-subagent/lib/private.js')\n",
      'dynamic-template': "const path = 'src/private.js'\nvoid import(`@deepseek-ai/dsh-subagent/${path}`)\n",
      'dynamic-package-name': "const packageName = 'dsh-subagent'\nvoid import(`@deepseek-ai/${packageName}/lib/private.js`)\n",
    })) expect(privateSubagentImports(source), name).not.toEqual([])
    expect(privateSubagentImports(
      "import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'\n",
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
