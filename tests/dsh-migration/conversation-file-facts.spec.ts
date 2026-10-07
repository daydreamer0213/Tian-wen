import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { capturedFileFacts } from '../../packages/tianwen-evolution/src/conversation-file-facts.js'

describe('captured UTF-8 file facts', () => {
  it.each([
    ['', 0],
    ['one', 1],
    ['one\n', 1],
    ['one\r\ntwo\r\n', 2],
    ['one\rtwo', 1],
    ['\uFEFF你好\n🙂', 2],
  ])('counts exact bytes and physical lines in %j', (content, lines) => {
    const bytes = Buffer.from(content, 'utf8')
    expect(capturedFileFacts({ path: 'sample.txt', content })).toEqual({
      path: 'sample.txt', bytes: bytes.length, lines,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  })

  it('does not claim facts for a missing captured file', () => {
    expect(() => capturedFileFacts({ path: 'missing.txt', content: null })).toThrow('missing')
  })
})
