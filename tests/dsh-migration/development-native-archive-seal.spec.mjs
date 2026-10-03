import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

// Engineering regressions; the first native task and its frozen oracle stay unchanged.
const { sealDevelopmentNativeArchive: seal, verifyDevelopmentNativeArchiveSeal: verify } = await import(
  process.env.TIANWEN_ARCHIVE_SEAL_REVIEW_MODULE
    ? pathToFileURL(process.env.TIANWEN_ARCHIVE_SEAL_REVIEW_MODULE).href
    : new URL('../../scripts/development-native-archive-seal.mjs', import.meta.url).href
)
const entries = [{ path: 'task.json', content: '原始字节' }]

test('corrupt sealed session identifiers are errors, not normal mismatches', () => {
  for (const sessionId of ['', ' \n']) {
    assert.throws(() => verify({ ...seal('session', entries), sessionId }, 'session', entries), TypeError)
  }
  assert.equal(verify(seal('other', entries), 'session', entries).sessionMatches, false)
})

test('closed records reject hidden and symbol own fields at every boundary', () => {
  for (const key of ['hidden', Symbol('hidden')]) {
    const extra = value => Object.defineProperty(value, key, { value: 'extra' })
    assert.throws(() => seal('session', [extra({ ...entries[0] })]), TypeError)
    assert.throws(() => verify(extra(seal('session', entries)), 'session', entries), TypeError)
    const corrupted = seal('session', entries)
    extra(corrupted.files[0])
    assert.throws(() => verify(corrupted, 'session', entries), TypeError)
  }
})

test('digest accepts exactly 64 lower hex characters and no trailing newline', () => {
  for (const suffix of ['\n', '\r\n']) {
    const corrupted = seal('session', entries)
    corrupted.files[0].digest += suffix
    assert.throws(() => verify(corrupted, 'session', entries), TypeError)
  }
})
