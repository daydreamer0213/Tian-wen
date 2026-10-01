import { expect, it } from 'vitest'
import { splitConversationFileReviewText } from '../../packages/tianwen-runtime-bundle/src/conversation-file-review-units.js'

it.each(['', 'x', '\r\n\n\r', '😀'.repeat(385), 'x'.repeat(383) + '😀tail', '\ud800x\udc00', 'e\u0301'.repeat(500), ' '.repeat(768), 'line\r\n'.repeat(343)])('losslessly chunks supplied file content %#', raw => {
  const chunks = splitConversationFileReviewText(raw)
  expect(chunks.join('')).toBe(raw)
  expect(chunks).toHaveLength(Math.max(1, Math.ceil([...raw].length / 384)))
  for (const [index, chunk] of chunks.entries()) {
    expect([...chunk].length).toBeLessThanOrEqual(384)
    if (index < chunks.length - 1) expect([...chunk]).toHaveLength(384)
    if (raw !== '') expect(chunk).not.toBe('')
  }
})
