import { expect, it } from 'vitest'
import { packConversationFileClaimPacket as pack, unpackConversationFileClaimPacket as unpack } from '../../packages/tianwen-evolution/src/conversation-file-claim-packet.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'

function fixture() {
  const files = { schemaVersion: 'tianwen.conversation-file-material.v1', cwd: '/project', outputKind: 'files', entries: [{ path: 'input.txt', content: 'original' }, { path: 'output.txt', content: null }], outputPaths: ['output.txt'] }
  const result = { answer: 'Saved.', files: [{ path: 'input.txt', content: 'original' }, { path: 'output.txt', content: 'output' }] }
  const original = { source: { files }, fileResult: { ...result, outputDigest: sha256(result) }, extra: {} as Record<string, unknown> }
  const items = [{ id: 'request-1', role: 'user', origin: 'request', text: 'Copy' }, { id: 'tool-1', role: 'tool', origin: 'tool', text: 'original', filePath: 'input.txt', fileStage: 'initial' }, { id: 'answer-1', role: 'answer', origin: 'answer', text: 'output', filePath: 'output.txt', fileStage: 'final' }]
  return { original, evidence: { schemaVersion: 'tianwen.claim-evidence.v2', items, evidenceDigest: sha256(items) } }
}

it('passes every unchanged pre-native functional contract assertion', async () => {
  await import(new URL('../fixtures/native-file-claim-packet/entry.mjs', import.meta.url).href)
})

it.each(['request-1\n', 'request-1\r', 'request-1\r\n'])('rejects a re-signed non-exact evidence ID %j', id => {
  const f = fixture();f.evidence.items[0]!.id = id;f.evidence.evidenceDigest = sha256(f.evidence.items)
  expect(() => pack(f.original, f.evidence)).toThrow()
})

it.each(['\ud800', '\udfff', 'valid\ud800'])('rejects malformed UTF16 in metadata keys and values %j', malformed => {
  const f = fixture();f.original.extra[malformed] = true
  expect(() => pack(f.original, f.evidence)).toThrow()
  f.original.extra = { value: malformed }
  expect(() => pack(f.original, f.evidence)).toThrow()
})

it('does not borrow source IDs for output and returns independent nested graphs', () => {
  const f = fixture(), packet = pack(f.original, f.evidence), recovered = unpack(packet)
  expect(recovered.original).toEqual(f.original)
  ;(recovered.original.extra as Record<string, unknown>).new = true
  expect(packet.original.extra).toEqual({})
  expect(f.original.extra).toEqual({})
  const wrong = structuredClone(packet) as any
  wrong.original.fileResult.files[1].content = wrong.original.source.files.entries[0].content
  expect(() => unpack(wrong)).toThrow()
})

it('losslessly preserves explicit host initial file roles and refuses to recast them as successful tool reads', () => {
  const f: any = fixture()
  f.original.source.hostProject = { observedPaths: ['output.txt'] }
  f.evidence.items[1] = { ...f.evidence.items[1], id: 'context-1', origin: 'context', role: 'host' }
  f.evidence.evidenceDigest = sha256(f.evidence.items)
  const packet = pack(f.original, f.evidence)
  expect(unpack(packet)).toEqual({ original: f.original, claimEvidence: f.evidence })
  for (const corruption of ['tool-status', 'tool-role', 'missing-marker', 'extra-marker', 'wrong-observed-path']) {
    const changed = structuredClone(f)
    if (corruption === 'tool-status') changed.evidence.items[1].toolStatus = 'success'
    if (corruption === 'tool-role') { changed.evidence.items[1].role = 'tool'; changed.evidence.items[1].origin = 'tool'; changed.evidence.items[1].id = 'tool-1' }
    if (corruption === 'missing-marker') delete changed.original.source.hostProject
    if (corruption === 'extra-marker') changed.original.source.hostProject.fakeReads = true
    if (corruption === 'wrong-observed-path') changed.original.source.hostProject.observedPaths = ['unknown.txt']
    changed.evidence.evidenceDigest = sha256(changed.evidence.items)
    expect(() => pack(changed.original, changed.evidence)).toThrow()
  }
})
