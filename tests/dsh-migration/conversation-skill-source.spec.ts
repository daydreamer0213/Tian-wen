import { describe, expect, it } from 'vitest'
import { parseConversationSkillAdmission, parseConversationSkillDefinition, parseGuidanceSourceUse, parseLearningSkillReference, parseLearningSkillAdmission, sha256 } from '../../packages/tianwen-evolution/src/index.js'

const definition = { name: 'source-audit', provider: 'test-reviewed-source', source: 'bundled',
  description: 'Separate findings from unknowns.', content: 'Preserve stated uncertainty.',
  invocation: { modelInvocable: true, userInvocable: true } }
const reference = { name: definition.name, provider: definition.provider, digest: sha256(definition),
  origin: 'https://example.invalid/test-fixture', revision: 'fixture-v1', license: 'MIT',
  reviewedAt: '2026-09-08T00:00:00.000Z', kind: 'self-contained-text', runtime: '0.1.1-rc.2' }
const admission = { ...reference, scopeKey: `conversation:${sha256({ cwd: 'fixture-workspace' })}`,
  purpose: 'conversation-method-reference', environmentDigest: sha256({ kind: 'tianwen.conversation-skill-environment.v1', evolutionRoot: 'fixture-root' }) }

describe('conversation source reference contracts', () => {
  it('exports a separate exact nine-field identity and preserves legacy admission', () => {
    expect(parseLearningSkillReference(reference)).toEqual(reference)
    expect(() => parseLearningSkillReference(admission)).toThrow()
    const legacy = { ...reference, scopeKey: 'old summary scope', toolName: 'research-summary' }
    expect(parseLearningSkillAdmission(legacy)).toEqual(legacy)
    expect(() => parseLearningSkillAdmission({ ...legacy, purpose: admission.purpose })).toThrow()
  })
  it('round-trips a natural reference and its complete detached native definition', () => {
    expect(parseConversationSkillAdmission(admission)).toEqual(admission)
    const full = { ...definition, path: '/fixture/SKILL.md', resourceBase: '/fixture', metadata: { nested: ['reviewed', 1, null] } }
    const parsed = parseConversationSkillDefinition(full, parseLearningSkillReference({ ...reference, digest: sha256(full) }))
    expect(parsed).toEqual(full)
    expect(parsed).not.toBe(full)
    expect(parsed.metadata).not.toBe(full.metadata)
    expect(parseConversationSkillDefinition(definition, parseLearningSkillReference(reference))).toEqual(definition)
  })
  it.each(['name', 'provider', 'digest', 'origin', 'revision', 'license', 'reviewedAt', 'kind', 'runtime', 'scopeKey', 'purpose', 'environmentDigest'])('rejects missing admission %s', key => {
    const changed: Record<string, unknown> = { ...admission }; delete changed[key]
    expect(() => parseConversationSkillAdmission(changed)).toThrow()
  })
  it.each([
    { toolName: 'research-summary' }, { scopeKey: 'workspace:fixture' }, { scopeKey: `conversation:${'a'.repeat(64)}` },
    { scopeKey: `conversation:sha256:${'A'.repeat(64)}` }, { environmentDigest: 'bad' }, { purpose: 'execute' },
    { license: 'proprietary' }, { reviewedAt: 'never' }, { provider: ' ' }, { name: 'Not a slug' },
  ])('rejects malformed or extra admission fields %j', change => {
    expect(() => parseConversationSkillAdmission({ ...admission, ...change })).toThrow()
  })
  it.each([
    { content: 'replaced' }, { provider: 'replaced' }, { name: 'replaced' },
  ])('rejects definition tampering %j', change => {
    expect(() => parseConversationSkillDefinition({ ...definition, ...change }, parseLearningSkillReference(reference))).toThrow()
  })
  it.each([{ provider: 'replaced' }, { name: 'replaced' }])('rejects a reviewed digest with mismatched native identity %j', change => {
    const changed = { ...definition, ...change }
    expect(() => parseConversationSkillDefinition(changed, parseLearningSkillReference({ ...reference, digest: sha256(changed) }))).toThrow()
  })
  it.each([
    { content: 1 }, { content: 'é'.repeat(8193) }, { description: 1 }, { source: false },
    { invocation: { modelInvocable: false, userInvocable: true } },
    { invocation: { modelInvocable: true, userInvocable: 'yes' } },
  ])('rejects structurally invalid reviewed definitions %j', change => {
    const changed = { ...definition, ...change }
    expect(() => parseConversationSkillDefinition(changed, parseLearningSkillReference({ ...reference, digest: sha256(changed) }))).toThrow()
  })
  it('allows the full 16KiB body and rejects non-JSON values without stripping them', () => {
    const bounded = { ...definition, content: 'é'.repeat(8192), metadata: { documentation: 'x'.repeat(20000) } }
    expect(parseConversationSkillDefinition(bounded, parseLearningSkillReference({ ...reference, digest: sha256(bounded) }))).toEqual(bounded)
    const cyclic: Record<string, unknown> = { ...definition }; cyclic.self = cyclic
    for (const extra of [undefined, () => true, 1n, Symbol('x'), NaN, Infinity, new Map(), cyclic]) {
      expect(() => parseConversationSkillDefinition({ ...definition, extra }, parseLearningSkillReference(reference))).toThrow()
    }
    for (const extra of [NaN, Infinity, new Map()]) {
      const changed = { ...definition, extra }
      expect(() => parseConversationSkillDefinition(changed, parseLearningSkillReference({ ...reference, digest: sha256(changed) }))).toThrow(/fields|JSON/i)
    }
  })
  it('binds exact three-field bounded source-use declarations', () => {
    const use = { readDigest: sha256('read'), status: 'adapted', rationale: 'Preserve uncertainty in the candidate rule.' }
    expect(parseGuidanceSourceUse(use)).toEqual(use)
    expect(parseGuidanceSourceUse({ ...use, status: 'not-used' }).status).toBe('not-used')
    for (const change of [{ extra: true }, { readDigest: 'bad' }, { status: 'used' }, { rationale: '' }, { rationale: ' ' }, { rationale: 'a\0b' }, { rationale: 'é'.repeat(2049) }]) {
      expect(() => parseGuidanceSourceUse({ ...use, ...change })).toThrow()
    }
    for (const key of Object.keys(use)) {
      const changed: Record<string, unknown> = { ...use }; delete changed[key]
      expect(() => parseGuidanceSourceUse(changed)).toThrow()
    }
  })
  it('rejects non-JSON properties that canonical serialization would silently omit', () => {
    const hidden = Object.defineProperty({}, 'hidden', { value: () => true })
    const arrayProperty = Object.assign(['fixture'], { ignored: () => true })
    const arraySymbol = Object.assign(['fixture'], { [Symbol('ignored')]: true })
    for (const metadata of [hidden, arrayProperty, arraySymbol]) {
      const changed = { ...definition, metadata }
      expect(() => parseConversationSkillDefinition(changed, parseLearningSkillReference({ ...reference, digest: sha256(changed) }))).toThrow(/JSON|fields/i)
    }
  })
})
