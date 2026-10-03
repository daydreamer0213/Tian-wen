import { expect, it } from 'vitest'
import { fileExecutionTexts, parseFileExecutionEvidence } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { projectClaimEvidence } from '../../packages/tianwen-runtime-bundle/src/conversation-claim-review.js'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'

const action = { tool: 'read', path: 'input.txt', callSeq: 5, resultSeq: 6, status: 'success' }
const evidence = { schemaVersion: 'tianwen.file-execution-evidence.v2', actions: [action, { ...action, tool: 'edit', callSeq: 7, resultSeq: 8 }], directoryObservations: [] }

it.each(['success', 'error'] as const)('continues rejecting actual %s mutations in v4 chat evidence', status => {
  const files = { schemaVersion: 'tianwen.conversation-file-material.v1', cwd: 'D:/DevData/frozen', outputKind: 'chat', entries: [{ path: 'input.txt', content: 'original' }], outputPaths: [] }
  const source = { context: [], request: [{ role: 'user', content: [{ type: 'text', text: 'Answer in chat only.' }] }], files,
    fileExecution: { schemaVersion: 'tianwen.file-execution-evidence.v4', actions: [{ ...action, tool: 'write', status }], directoryObservations: [] } }
  expect(() => projectClaimEvidence({ source, evaluationMode: 'local-files', conversation: [{ role: 'assistant', content: [{ type: 'text', text: 'answer' }] }], toolEvidence: [] })).toThrow('invalid-judgment')
})
it('keeps original read-only v1 text exact and describes v2 as captured actions rather than content truth', () => {
  const legacy = { schemaVersion: 'tianwen.file-execution-evidence.v1', capturedInputsUnchanged: true, toolCalls: ['read'], directoryObservations: [] }
  expect(fileExecutionTexts(parseFileExecutionEvidence(legacy))).toEqual([
    'Verified native task tool calls in order: read.',
    'No write or edit tool call occurred in this captured task. Captured input files matched initial bytes at the task capture boundary.',
  ])
  expect(parseFileExecutionEvidence(evidence)).toEqual(evidence)
  const lines = fileExecutionTexts(parseFileExecutionEvidence(evidence))
  expect(lines[0]).toBe('Native read "input.txt": call seq 5; success result seq 6.')
  expect(lines[1]).toBe('Native edit "input.txt": call seq 7; success result seq 8.')
  expect(lines.join('')).toContain('not file content truth')
  expect(lines.join('')).not.toContain('No write or edit')
})

it.each([
  { ...evidence, schemaVersion: 'tianwen.file-execution-evidence.v999' },
  { ...evidence, capturedInputsUnchanged: true },
  { ...evidence, actions: [] },
  { ...evidence, actions: [{ ...action, path: '../outside.txt' }] },
  { ...evidence, actions: [{ ...action, path: null }] },
  { ...evidence, actions: [{ ...action, tool: 'glob' }] },
  { ...evidence, actions: [{ ...action, resultSeq: 5 }] },
  { ...evidence, actions: [{ ...action, resultSeq: 5.5 }] },
  { ...evidence, actions: [{ ...action, callSeq: 0 }] },
  { ...evidence, actions: [{ ...action, status: 'verified' }] },
  { ...evidence, actions: [action, action] },
  { ...evidence, actions: [{ ...action, resultSeq: 10 }, { ...action, callSeq: 8, resultSeq: 10 }] },
])('rejects malformed or substituted action evidence %#', value => {
  expect(() => parseFileExecutionEvidence(value)).toThrow()
})

it('rejects read-only evidence in a writable file result and never imports original actions into a method trial', () => {
  const files = { schemaVersion: 'tianwen.conversation-file-material.v1', cwd: process.platform === 'win32' ? 'D:/DevData/frozen' : '/tmp/frozen',
    outputKind: 'files', entries: [{ path: 'input.txt', content: 'before' }], outputPaths: ['input.txt'] }
  const output = { answer: 'saved', files: [{ path: 'input.txt', content: 'after' }] }
  const source = { context: [], request: [{ role: 'user', content: [{ type: 'text', text: 'Update the file.' }] }], files,
    fileExecution: { schemaVersion: 'tianwen.file-execution-evidence.v1', capturedInputsUnchanged: true, toolCalls: ['read'], directoryObservations: [] } }
  const fileResult = { ...output, outputDigest: sha256(output) }
  expect(() => projectClaimEvidence({ source, evaluationMode: 'local-files', conversation: [{ role: 'assistant', content: [{ type: 'text', text: output.answer }] }], toolEvidence: [], fileResult })).toThrow('invalid-judgment')
  const projected = projectClaimEvidence({ task: { ...source, fileExecution: evidence }, answer: output.answer, fileResult }, 'file-chunks-v1')
  expect(projected.items.filter(item => item.role !== 'answer').map(item => item.text).join('')).not.toContain('Native read')
})
