import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyCapturedFileFactTable } from '../../scripts/learning-result-verifier-probe.js'

const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const inputs = [{ path: 'empty.txt', content: '' }, { path: 'unicode.txt', content: '\uFEFF你好\r\n🙂\r\n' }]
const facts = () => [
  { path: 'empty.txt', bytes: 0, lines: 0, sha256: emptyHash },
  { path: 'unicode.txt', bytes: 17, lines: 2, sha256: createHash('sha256').update(inputs[1]!.content).digest('hex') },
]

describe('experimental captured file fact table verifier', () => {
  it('verifies every frozen file, with UTF-8 bytes and LF-based lines independent of row order', () => {
    expect(verifyCapturedFileFactTable({ files: facts().reverse() }, inputs)).toEqual({ status: 'verified' })
  })

  it.each([
    ['bytes', 16], ['lines', 3], ['sha256', '0'.repeat(64)], ['bytes', '17'], ['lines', 2.5],
  ])('rejects incorrect %s without accepting the other correct fields', (field, value) => {
    const rows = facts(); rows[1] = { ...rows[1]!, [field]: value } as typeof rows[number]
    expect(verifyCapturedFileFactTable({ files: rows }, inputs).status).toBe('rejected')
  })

  it.each(['missing', 'extra', 'duplicate'])('rejects %s file coverage', mode => {
    const rows = facts()
    if (mode === 'missing') rows.pop()
    if (mode === 'extra') rows.push({ ...rows[0]!, path: 'unobserved.txt' })
    if (mode === 'duplicate') rows[1] = rows[0]!
    expect(verifyCapturedFileFactTable({ files: rows }, inputs).status).toBe('rejected')
  })

  it('rejects extra explanation and row fields rather than verifying only a selected part', () => {
    expect(verifyCapturedFileFactTable({ files: facts(), explanation: 'Deployment succeeded.' }, inputs).status).toBe('rejected')
    expect(verifyCapturedFileFactTable({ files: facts().map(row => ({ ...row, expected: true })) }, inputs).status).toBe('rejected')
  })

  it('requires the actual own fields rather than inherited values and a comma-joined key', () => {
    const rows = facts().map(row => Object.assign(Object.create(row), { 'bytes,lines,path,sha256': 'not a fact row' }))
    expect(verifyCapturedFileFactTable({ files: rows }, inputs).status).toBe('rejected')
  })

  it.each([null, {}, { files: null }, { files: [null] }, { files: [{ path: 'empty.txt' }] }])('rejects malformed structured objects: %j', value => {
    expect(verifyCapturedFileFactTable(value, inputs).status).toBe('rejected')
  })

  it('does not claim to verify prose or parse it into a fact table', () => {
    expect(verifyCapturedFileFactTable('All file facts are correct.', inputs).status).toBe('unverifiable')
    expect(verifyCapturedFileFactTable(JSON.stringify({ files: facts() }), inputs).status).toBe('unverifiable')
  })

  it.each([[], [{ path: 'empty.txt', content: null }], [inputs[0]!, inputs[0]!]].map(entries => ({ entries })))('requires complete distinct frozen inputs: %j', ({ entries }) => {
    expect(verifyCapturedFileFactTable({ files: facts() }, entries).status).toBe('unverifiable')
  })

  it('uses the frozen preimage instead of accepting a claimed expected value', () => {
    const rows = facts()
    expect(verifyCapturedFileFactTable({ files: rows }, [{ ...inputs[0]!, content: 'changed' }, inputs[1]!]).status).toBe('rejected')
  })
})
