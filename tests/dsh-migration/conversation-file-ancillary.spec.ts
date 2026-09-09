import { describe, expect, it } from 'vitest'
import * as evolution from '../../packages/tianwen-evolution/src/index.js'
import { ConversationLearningState } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import type {
  ConversationLearningRecord,
  ConversationTaskAdmission,
  ConversationTaskCompletion,
  ConversationTaskSource,
} from '../../packages/tianwen-evolution/src/conversation-learning.js'
import type { ConversationFileEntry, ConversationFileMaterial } from '../../packages/tianwen-evolution/src/conversation-files.js'
import type { ConversationSkillAdmission } from '../../packages/tianwen-evolution/src/conversation-skill-source.js'

type AncillaryApi = {
  parseConversationTaskFileAncillary(value: unknown): AncillaryRecord
  parseConversationFileAncillaryContext(value: unknown, entries: readonly ConversationFileEntry[]): AncillaryContext
  projectConversationFileAncillaryContext(records: readonly AncillaryRecord[], entries: readonly ConversationFileEntry[]): AncillaryContext | undefined
}
type AncillaryRecord = {
  readonly kind: 'task-file-ancillary-captured'
  readonly taskId: string
  readonly callId: string
  readonly callSeq: number
  readonly resultSeq: number
  readonly argumentsDigest: ReturnType<typeof evolution.sha256>
  readonly resultDigest: ReturnType<typeof evolution.sha256>
  readonly valueDigest: ReturnType<typeof evolution.sha256>
  readonly producer: { readonly package: string; readonly version: string; readonly adapter: string }
  readonly payload: Record<string, unknown>
}
type AncillaryContext = {
  readonly schemaVersion: 'tianwen.file-ancillary-context.v1'
  readonly methods: readonly { readonly reference: ConversationSkillAdmission; readonly definition: Readonly<Record<string, unknown>> }[]
  readonly positiveLocations: readonly { readonly path: string; readonly inputDigest: ReturnType<typeof evolution.sha256>; readonly lines: readonly number[] }[]
}

const api = evolution as typeof evolution & AncillaryApi
const files: ConversationFileMaterial = {
  schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd: 'D:/fixture',
  entries: [{ path: 'input.md', content: 'alpha\r\nbeta\nalpha' }, { path: 'output.md', content: null }], outputPaths: ['output.md'],
}
const definition = { name: 'source-audit', provider: 'owned-test-fixture', source: 'bundled',
  description: 'Separate findings from unknowns.', content: 'Preserve stated uncertainty.',
  invocation: { modelInvocable: true, userInvocable: true } }
const scopeKey = `conversation:${evolution.sha256({ cwd: files.cwd })}`
const reference: ConversationSkillAdmission = {
  name: definition.name, provider: definition.provider, digest: evolution.sha256(definition),
  origin: 'https://example.invalid/owned-test-fixture', revision: 'fixture-v1', license: 'MIT',
  reviewedAt: '2026-09-08T00:00:00.000Z', kind: 'self-contained-text', runtime: '0.1.1-rc.2',
  scopeKey, purpose: 'conversation-method-reference', environmentDigest: evolution.sha256('fixture-environment'),
}
const producer = {
  glob: { package: '@deepseek-ai/dsh-tool-fs-search', version: '0.1.1-rc.2', adapter: 'tianwen.file-ancillary.v1' },
  grep: { package: '@deepseek-ai/dsh-tool-fs-search', version: '0.1.1-rc.2', adapter: 'tianwen.file-ancillary.v1' },
  skill: { package: '@deepseek-ai/dsh-tool-skill', version: '0.1.1-rc.2', adapter: 'tianwen.file-ancillary.v1' },
  pwsh: { package: '@deepseek-ai/dsh-tool-pwsh', version: '0.1.1-rc.2', adapter: 'tianwen.file-ancillary.v1' },
} as const

function record(payload: Record<string, unknown>, change: Partial<AncillaryRecord> = {}): AncillaryRecord {
  const tool = payload.tool as keyof typeof producer
  return {
    kind: 'task-file-ancillary-captured', taskId: 'task-fixture', callId: `call-${tool}`, callSeq: 12, resultSeq: 13,
    argumentsDigest: evolution.sha256({ tool, arguments: 'fixture' }), resultDigest: evolution.sha256({ tool, result: 'complete native event' }),
    valueDigest: evolution.sha256({ tool, value: 'final ToolExecutionResult.value' }), producer: producer[tool], payload, ...change,
  }
}
const globRecord = record({ tool: 'glob', root: 'D:/fixture', paths: ['input.md', 'nested/readme.md'] })
const grepRecord = record({ tool: 'grep', matches: [
  { path: 'input.md', lineNumber: 3, line: 'alpha' },
  { path: 'input.md', lineNumber: 1, line: 'alpha' },
  { path: 'input.md', lineNumber: 3, line: 'alpha' },
] }, { callId: 'call-grep', callSeq: 14, resultSeq: 15 })
const skillRecord = record({ tool: 'skill', reference, definition }, { callId: 'call-skill', callSeq: 16, resultSeq: 17 })
const pwshRecord = record({ tool: 'pwsh', nativeReceiptJson: '{"exitCode":0}', nativeValueJson: '{"stdout":"ok"}' }, { callId: 'call-pwsh', callSeq: 18, resultSeq: 19 })

function source(mode: 'local-files' | 'text' = 'local-files'): ConversationTaskSource {
  const body = { sessionId: 'session-fixture', sessionLifecycleFingerprint: evolution.sha256('lifecycle'), turn: 1 }
  return {
    kind: 'task-started', taskId: evolution.conversationTaskId(body), ...body, startSeq: 10,
    userMessageIds: ['user-1'], requestDigest: evolution.sha256('request'), contextDigest: evolution.sha256('context'),
    scopeKey, consentRevision: 1, behaviorVersion: evolution.sha256('behavior'),
  }
}
function admission(taskId: string, mode: 'local-files' | 'text' = 'local-files'): ConversationTaskAdmission {
  return { kind: 'task-admitted', taskId, decision: { kind: 'task', objective: 'Summarize input.', criteria: ['Preserve scope.'],
    family: 'summarization', evaluationMode: mode, ...(mode === 'local-files' ? { fileOutputKind: 'files' as const } : {}),
    relatedTaskId: null, feedback: null }, proof: { sessionId: 'judge', sessionDigest: evolution.sha256('judge'), requestDigest: evolution.sha256('judge-request') }, unavailableReason: null }
}
function completion(taskId: string, captureSeq = 20): ConversationTaskCompletion {
  return { kind: 'task-finished', taskId, endSeq: 22, status: 'completed', assistantMessageIds: ['assistant-1'],
    resultDigest: evolution.sha256('answer'), evidenceIds: [], files: { schemaVersion: 'tianwen.conversation-file-result.v1',
      outputKind: 'files', inputsDigest: evolution.sha256(files.entries), captureSeq, outputPaths: ['output.md'],
      entries: [{ path: 'input.md', content: files.entries[0]!.content }, { path: 'output.md', content: 'pilot summary' }] } }
}
function append(state: ConversationLearningState, input: unknown): ConversationLearningRecord {
  const parsed = evolution.parseConversationLearningRecord(input)
  state.validate(parsed); state.apply(parsed, '2026-09-09T00:00:00.000Z')
  return parsed
}
function localState(withInput = true): { state: ConversationLearningState; source: ConversationTaskSource } {
  const state = new ConversationLearningState(); const started = source()
  append(state, started); append(state, admission(started.taskId))
  if (withInput) {
    append(state, { kind: 'task-file-input-captured', taskId: started.taskId, callId: 'read-input', callSeq: 11, path: 'input.md', content: files.entries[0]!.content })
    append(state, { kind: 'task-file-input-captured', taskId: started.taskId, callId: 'write-output', callSeq: 12, path: 'output.md', content: null })
  }
  return { state, source: started }
}

describe('conversation file ancillary parser', () => {
  it('exports the three pure ancillary functions', () => {
    expect(api.parseConversationTaskFileAncillary).toBeTypeOf('function')
    expect(api.parseConversationFileAncillaryContext).toBeTypeOf('function')
    expect(api.projectConversationFileAncillaryContext).toBeTypeOf('function')
  })

  it.each([globRecord, grepRecord, skillRecord, pwshRecord])('round-trips a strict $payload.tool record', value => {
    expect(api.parseConversationTaskFileAncillary(value)).toEqual(value)
  })

  it('rejects missing and extra record or payload fields', () => {
    const missing = { ...globRecord } as Record<string, unknown>; delete missing.valueDigest
    expect(() => api.parseConversationTaskFileAncillary(missing)).toThrow(/field/i)
    expect(() => api.parseConversationTaskFileAncillary({ ...globRecord, extra: true })).toThrow(/field/i)
    expect(() => api.parseConversationTaskFileAncillary({ ...globRecord, payload: { ...globRecord.payload, extra: true } })).toThrow(/field/i)
  })

  it('uses the existing bounded conversation identity and sequence rules', () => {
    expect(() => api.parseConversationTaskFileAncillary({ ...globRecord, taskId: 'x'.repeat(513) })).toThrow(/identity|text|limit/i)
    expect(() => api.parseConversationTaskFileAncillary({ ...globRecord, callId: ' ' })).toThrow(/identity|text/i)
    expect(() => api.parseConversationTaskFileAncillary({ ...globRecord, argumentsDigest: 'bad' })).toThrow(/digest/i)
    expect(() => api.parseConversationTaskFileAncillary({ ...globRecord, callSeq: 0 })).toThrow(/sequence|positive/i)
  })

  it('rejects wrong producer and tool pairings', () => {
    expect(() => api.parseConversationTaskFileAncillary({ ...globRecord, producer: producer.skill })).toThrow(/producer|tool/i)
    expect(() => api.parseConversationTaskFileAncillary({ ...skillRecord, producer: producer.grep })).toThrow(/producer|tool/i)
    expect(() => api.parseConversationTaskFileAncillary({ ...pwshRecord, producer: { ...producer.pwsh, version: '0.1.1' } })).toThrow(/producer|version/i)
    expect(() => api.parseConversationTaskFileAncillary({ ...pwshRecord, producer: { ...producer.pwsh, adapter: 'other' } })).toThrow(/producer|adapter/i)
  })

  it('bounds each record, glob paths, and grep matches without truncation', () => {
    const paths = Array.from({ length: 256 }, (_, index) => `folder/file-${index}.md`)
    expect((api.parseConversationTaskFileAncillary(record({ tool: 'glob', root: 'D:/fixture', paths })).payload as { paths: string[] }).paths).toHaveLength(256)
    expect(() => api.parseConversationTaskFileAncillary(record({ tool: 'glob', root: 'D:/fixture', paths: [...paths, 'overflow.md'] }))).toThrow(/count|limit|path/i)
    const matches = Array.from({ length: 257 }, (_, index) => ({ path: 'input.md', lineNumber: index + 1, line: 'x' }))
    expect(() => api.parseConversationTaskFileAncillary(record({ tool: 'grep', matches }))).toThrow(/count|limit|match/i)
    const oversized = record({ tool: 'grep', matches: [{ path: 'input.md', lineNumber: 1, line: 'x'.repeat(65536) }] })
    expect(() => api.parseConversationTaskFileAncillary(oversized)).toThrow(/byte|large|limit/i)
  })

  it('validates metadata paths, UTF-8 text, absolute roots, and canonical pwsh objects', () => {
    for (const path of ['/absolute.md', '../escape.md', 'bad\\path.md', `bad-\ud800.md`]) {
      expect(() => api.parseConversationTaskFileAncillary(record({ tool: 'glob', root: 'D:/fixture', paths: [path] }))).toThrow(/path|UTF-8|text/i)
    }
    expect(() => api.parseConversationTaskFileAncillary(record({ tool: 'glob', root: 'relative', paths: ['input.md'] }))).toThrow(/root|absolute/i)
    expect(() => api.parseConversationTaskFileAncillary(record({ tool: 'glob', root: 'D:/fixture', paths: ['Folder/a.md', 'folder/b.md'] }))).toThrow(/case|path/i)
    expect(() => api.parseConversationTaskFileAncillary(record({ tool: 'glob', root: 'D:/fixture', paths: ['folder', 'folder/a.md'] }))).toThrow(/conflict|path/i)
    expect(() => api.parseConversationTaskFileAncillary(record({ tool: 'grep', matches: [{ path: 'input.md', lineNumber: 1, line: `bad-\ud800` }] }))).toThrow(/UTF-8|text|line/i)
    for (const json of ['', 'Get-ChildItem', '[]', '{"b":1,"a":2}', '{"a":1} trailing']) {
      expect(() => api.parseConversationTaskFileAncillary(record({ tool: 'pwsh', nativeReceiptJson: json, nativeValueJson: '{"ok":true}' }))).toThrow(/JSON|object|canonical/i)
    }
  })

  it('rejects a skill definition whose admitted digest has drifted', () => {
    expect(() => api.parseConversationTaskFileAncillary(record({ tool: 'skill', reference, definition: { ...definition, content: 'changed' } }))).toThrow(/definition|digest|reference/i)
  })
})

describe('conversation ancillary state', () => {
  it('preserves append history and rejects a seventeenth record', () => {
    const { state, source: started } = localState(false)
    for (let index = 0; index < 16; index++) append(state, record({ tool: 'glob', root: 'D:/fixture', paths: [`file-${index}.md`] }, {
      taskId: started.taskId, callId: `glob-${index}`, callSeq: 11 + index * 2, resultSeq: 12 + index * 2,
    }))
    expect(state.list()[0]!.fileAncillary).toHaveLength(16)
    expect(() => append(state, record({ tool: 'glob', root: 'D:/fixture', paths: ['overflow.md'] }, {
      taskId: started.taskId, callId: 'glob-overflow', callSeq: 43, resultSeq: 44,
    }))).toThrow(/16|count|limit/i)
    expect(state.list()[0]!.fileAncillary?.map(item => item.callId)).toEqual(Array.from({ length: 16 }, (_, index) => `glob-${index}`))
  })

  it('requires local-files admission, an open task, and task boundaries', () => {
    const textState = new ConversationLearningState(); const textSource = source('text')
    append(textState, textSource); append(textState, admission(textSource.taskId, 'text'))
    expect(() => append(textState, { ...globRecord, taskId: textSource.taskId })).toThrow(/local-files/i)
    const unavailable = localState(false)
    append(unavailable.state, { kind: 'task-file-evidence-unavailable', taskId: unavailable.source.taskId, reason: 'material-unavailable' })
    expect(() => append(unavailable.state, { ...globRecord, taskId: unavailable.source.taskId })).toThrow(/unavailable/i)
    const completed = localState(false); const { files: _files, ...withoutFiles } = completion(completed.source.taskId)
    append(completed.state, withoutFiles)
    expect(() => append(completed.state, { ...globRecord, taskId: completed.source.taskId })).toThrow(/completed|finished/i)
    const boundary = localState(false)
    expect(() => append(boundary.state, { ...globRecord, taskId: boundary.source.taskId, callSeq: 10, resultSeq: 11 })).toThrow(/boundary|sequence/i)
    expect(() => append(boundary.state, { ...globRecord, taskId: boundary.source.taskId, callSeq: 12, resultSeq: 12 })).toThrow(/boundary|sequence/i)
  })

  it('rejects duplicate call IDs and cross-kind native event identities', () => {
    for (const change of [
      { callId: 'read-input', callSeq: 12, resultSeq: 13 },
      { callId: 'glob', callSeq: 11, resultSeq: 13 },
      { callId: 'glob', callSeq: 12, resultSeq: 11 },
    ]) {
      const { state, source: started } = localState()
      expect(() => append(state, { ...globRecord, taskId: started.taskId, ...change })).toThrow(/identity|sequence|call|conflict/i)
    }
    const { state, source: started } = localState(false)
    append(state, { ...globRecord, taskId: started.taskId, callId: 'first', callSeq: 12, resultSeq: 13 })
    expect(() => append(state, { ...pwshRecord, taskId: started.taskId, callId: 'first', callSeq: 14, resultSeq: 15 })).toThrow(/identity|call|conflict/i)
    expect(() => append(state, { ...pwshRecord, taskId: started.taskId, callId: 'second', callSeq: 13, resultSeq: 15 })).toThrow(/identity|sequence|conflict/i)
    expect(() => append(state, { ...pwshRecord, taskId: started.taskId, callId: 'third', callSeq: 14, resultSeq: 12 })).toThrow(/identity|sequence|conflict/i)
  })

  it('requires grep to follow a matching readable captured input', () => {
    const noInput = localState(false)
    expect(() => append(noInput.state, { ...grepRecord, taskId: noInput.source.taskId })).toThrow(/grep|input|capture/i)
    const nullInput = localState(false)
    append(nullInput.state, { kind: 'task-file-input-captured', taskId: nullInput.source.taskId, callId: 'read-null', callSeq: 11, path: 'input.md', content: null })
    expect(() => append(nullInput.state, { ...grepRecord, taskId: nullInput.source.taskId })).toThrow(/grep|input|readable/i)
    const laterInput = localState(false)
    append(laterInput.state, { kind: 'task-file-input-captured', taskId: laterInput.source.taskId, callId: 'read-late', callSeq: 16, path: 'input.md', content: files.entries[0]!.content })
    expect(() => append(laterInput.state, { ...grepRecord, taskId: laterInput.source.taskId, callSeq: 14, resultSeq: 15 })).toThrow(/grep|earlier|capture/i)
  })

  it('binds skill scope to the task and ancillary results to file completion', () => {
    const wrongScope = localState(false)
    expect(() => append(wrongScope.state, { ...skillRecord, taskId: wrongScope.source.taskId,
      payload: { ...skillRecord.payload, reference: { ...reference, scopeKey: `conversation:${evolution.sha256('other')}` } } })).toThrow(/scope/i)
    const late = localState()
    append(late.state, { ...grepRecord, taskId: late.source.taskId })
    expect(() => append(late.state, completion(late.source.taskId, 14))).toThrow(/ancillary|capture|sequence/i)
    const valid = localState()
    append(valid.state, { ...grepRecord, taskId: valid.source.taskId })
    expect(() => append(valid.state, completion(valid.source.taskId, 15))).not.toThrow()
  })
})

describe('deterministic ancillary worker context', () => {
  it('does not change old file identity without ancillary context', () => {
    const request = '  Summarize   the pilot. '
    const normalizedRequest = 'Summarize the pilot.'
    expect(evolution.guidanceInputDigest(request, files)).toBe(evolution.sha256({ request: normalizedRequest, files }))
    expect(api.projectConversationFileAncillaryContext([], files.entries)).toBeUndefined()
    const { state } = localState(false)
    expect(Object.keys(state.list()[0]!)).toEqual(['source', 'recordedAt', 'admission'])
    expect(state.list()[0]).not.toHaveProperty('fileAncillary')
  })

  it('does not give directory receipts to a worker', () => {
    expect(api.projectConversationFileAncillaryContext([globRecord, pwshRecord], files.entries)).toBeUndefined()
  })

  it('re-derives sorted positive grep lines from complete LF and CRLF input', () => {
    expect(api.projectConversationFileAncillaryContext([grepRecord], files.entries)).toEqual({
      schemaVersion: 'tianwen.file-ancillary-context.v1', methods: [],
      positiveLocations: [{ path: 'input.md', inputDigest: evolution.sha256({ path: 'input.md', content: 'alpha\r\nbeta\nalpha' }), lines: [1, 3] }],
    })
    for (const match of [
      { path: 'input.md', lineNumber: 2, line: 'alpha' },
      { path: 'input.md', lineNumber: 4, line: '' },
      { path: 'missing.md', lineNumber: 1, line: 'alpha' },
      { path: 'output.md', lineNumber: 1, line: '' },
    ]) expect(() => api.projectConversationFileAncillaryContext([
      record({ tool: 'grep', matches: [match] }, { callId: 'bad-grep', callSeq: 14, resultSeq: 15 }),
    ], files.entries)).toThrow(/grep|line|input|path/i)
  })

  it('retains only exact admitted methods and rejects definition drift', () => {
    const context = api.projectConversationFileAncillaryContext([skillRecord], files.entries)
    expect(context).toEqual({ schemaVersion: 'tianwen.file-ancillary-context.v1', methods: [{ reference, definition }], positiveLocations: [] })
    expect(() => api.parseConversationFileAncillaryContext({ ...context, methods: [{ reference, definition: { ...definition, content: 'changed' } }] }, files.entries)).toThrow(/definition|digest|reference/i)
  })

  it('rejects non-canonical context, invalid locations, and worker-context overflow', () => {
    const location = { path: 'input.md', inputDigest: evolution.sha256({ path: 'input.md', content: files.entries[0]!.content }), lines: [1] }
    const context = { schemaVersion: 'tianwen.file-ancillary-context.v1', methods: [], positiveLocations: [location] }
    expect(api.parseConversationFileAncillaryContext(context, files.entries)).toEqual(context)
    expect(() => api.parseConversationFileAncillaryContext({ ...context, extra: true }, files.entries)).toThrow(/field/i)
    expect(() => api.parseConversationFileAncillaryContext({ ...context, positiveLocations: [{ ...location, lines: [3, 1] }] }, files.entries)).toThrow(/line|canonical|order/i)
    expect(() => api.parseConversationFileAncillaryContext({ ...context, positiveLocations: [{ ...location, inputDigest: evolution.sha256('wrong') }] }, files.entries)).toThrow(/digest|input/i)
    const padded = (name: string) => ({ ...definition, name, metadata: { padding: 'x'.repeat(13000) } })
    const first = padded('method-one'); const second = padded('method-two')
    const methodRecord = (item: typeof first, index: number) => {
      const admitted = { ...reference, name: item.name, digest: evolution.sha256(item) }
      return record({ tool: 'skill', reference: admitted, definition: item }, { callId: `skill-${index}`, callSeq: 20 + index * 2, resultSeq: 21 + index * 2 })
    }
    expect(() => api.projectConversationFileAncillaryContext([methodRecord(first, 0), methodRecord(second, 1)], files.entries)).toThrow(/context|byte|large|limit/i)
  })

  it('keeps source identity independent while optional method context changes worker material', () => {
    const alternateDefinition = { ...definition, content: 'Preserve exact positive locations.' }
    const alternateReference = { ...reference, digest: evolution.sha256(alternateDefinition) }
    const first = api.projectConversationFileAncillaryContext([skillRecord], files.entries)
    const second = api.projectConversationFileAncillaryContext([
      record({ tool: 'skill', reference: alternateReference, definition: alternateDefinition }, { callId: 'alternate-skill', callSeq: 18, resultSeq: 19 }),
    ], files.entries)
    const inputDigest = evolution.guidanceInputDigest('Summarize the pilot.', files)
    expect(inputDigest).toBe(evolution.guidanceInputDigest('Summarize the pilot.', files))
    expect(evolution.sha256({ prompt: 'Summarize the pilot.', files, fileAncillary: first }))
      .not.toBe(evolution.sha256({ prompt: 'Summarize the pilot.', files, fileAncillary: second }))
  })
})
