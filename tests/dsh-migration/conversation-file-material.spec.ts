import { afterEach, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  CONVERSATION_FILE_MAX_BYTES,
  CONVERSATION_FILE_MAX_COUNT,
  conversationFilePath,
  parseConversationFileEntries,
  readConversationFile,
  seedConversationFiles,
} from '../../packages/tianwen-runtime-bundle/src/conversation-file-material.js'

const fixtureBase = process.platform === 'win32'
  ? 'D:/DevData/tianwen-conversation-tests'
  : '/tmp/tianwen-conversation-tests'
const roots: string[] = []

function fixtureRoot(label: string): string {
  mkdirSync(fixtureBase, { recursive: true })
  const root = mkdtempSync(join(fixtureBase, `${label}-`))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it('captures exact UTF-8 file content and represents an absent file as null', async () => {
  const root = fixtureRoot('file-capture')
  writeFileSync(join(root, 'input.md'), Buffer.from('unchanged\r\n', 'utf8'))

  expect(await readConversationFile(root, 'input.md')).toEqual({ path: 'input.md', content: 'unchanged\r\n' })
  expect(await readConversationFile(root, 'output.md')).toEqual({ path: 'output.md', content: null })
})

it('preserves UTF-8 BOM bytes through capture, parse and replica seeding', async () => {
  const source = fixtureRoot('file-bom-source')
  const replica = fixtureRoot('file-bom-replica')
  const original = Buffer.from([0xef, 0xbb, 0xbf, 0x61])
  writeFileSync(join(source, 'input.txt'), original)

  const captured = await readConversationFile(source, 'input.txt')
  const material = parseConversationFileEntries([captured])
  await seedConversationFiles(replica, material)

  expect(captured).toEqual({ path: 'input.txt', content: '\uFEFFa' })
  expect(readFileSync(join(replica, 'input.txt'))).toEqual(original)
})

it('accepts relative and absolute candidates but returns one canonical slash path', async () => {
  const root = fixtureRoot('file-path')
  mkdirSync(join(root, 'nested'))
  const target = join(root, 'nested', 'input.md')
  writeFileSync(target, 'content')

  expect(await conversationFilePath(root, join('nested', 'input.md'))).toBe('nested/input.md')
  expect(await conversationFilePath(root, target)).toBe('nested/input.md')
  if (process.platform === 'win32') {
    expect(await conversationFilePath(root, join('NESTED', 'INPUT.MD'))).toBe('nested/input.md')
  }
})

it('rejects path escape, linked roots or descendants, reserved names and nonfiles', async () => {
  const root = fixtureRoot('file-boundary')
  const outside = fixtureRoot('file-outside')
  writeFileSync(join(outside, 'secret.txt'), 'secret')
  mkdirSync(join(root, 'directory'))
  symlinkSync(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  const linkedRootParent = fixtureRoot('linked-root-parent')
  const linkedRoot = join(linkedRootParent, 'root')
  symlinkSync(root, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir')

  await expect(conversationFilePath(root, '../file-outside/secret.txt')).rejects.toThrow()
  await expect(conversationFilePath(root, resolve(outside, 'secret.txt'))).rejects.toThrow()
  await expect(conversationFilePath(root, 'linked/secret.txt')).rejects.toThrow()
  await expect(conversationFilePath(linkedRoot, 'missing.txt')).rejects.toThrow()
  await expect(conversationFilePath(root, 'directory')).rejects.toThrow()
  await expect(conversationFilePath(root, 'CON.txt')).rejects.toThrow()
  await expect(conversationFilePath(root, 'ambiguous.')).rejects.toThrow()
})

it('rejects invalid UTF-8 and content above the single-file byte limit', async () => {
  const root = fixtureRoot('file-bytes')
  writeFileSync(join(root, 'invalid.txt'), Buffer.from([0xc3, 0x28]))
  writeFileSync(join(root, 'large.txt'), Buffer.alloc(CONVERSATION_FILE_MAX_BYTES + 1, 0x61))

  await expect(readConversationFile(root, 'invalid.txt')).rejects.toThrow()
  await expect(readConversationFile(root, 'large.txt')).rejects.toThrow()
})

it('parses only canonical bounded UTF-8 file entries without aliases or extra fields', () => {
  expect(parseConversationFileEntries([
    { path: 'notes/input.md', content: 'exact\r\n' },
    { path: 'output.md', content: null },
  ])).toEqual([
    { path: 'notes/input.md', content: 'exact\r\n' },
    { path: 'output.md', content: null },
  ])

  const invalid: unknown[] = [
    { path: 'input.md', content: 'text', extra: true },
    { path: 'input.md', content: Buffer.from('binary') },
    { path: 'input.md', content: 'before\0after' },
  ]
  for (const entry of invalid) expect(() => parseConversationFileEntries([entry])).toThrow()
  expect(() => parseConversationFileEntries([
    { path: 'Input.md', content: 'one' },
    { path: 'input.md', content: 'two' },
  ])).toThrow()
  expect(() => parseConversationFileEntries([
    { path: 'a', content: 'file' },
    { path: 'a/input.md', content: 'nested' },
  ])).toThrow()
  expect(() => parseConversationFileEntries([
    { path: 'Notes/one.md', content: 'one' },
    { path: 'notes/two.md', content: 'two' },
  ])).toThrow()
})

it('rejects malformed paths and material above count or aggregate UTF-8 byte limits', () => {
  for (const path of ['', '/absolute.md', 'C:/absolute.md', 'nested\\input.md', 'a/../input.md',
    'a//input.md', 'ambiguous.', 'NUL.txt', 'e\u0301.txt']) {
    expect(() => parseConversationFileEntries([{ path, content: 'text' }])).toThrow()
  }
  expect(() => parseConversationFileEntries(Array.from(
    { length: CONVERSATION_FILE_MAX_COUNT + 1 },
    (_, index) => ({ path: `file-${index}.txt`, content: null }),
  ))).toThrow()
  expect(() => parseConversationFileEntries([
    { path: 'large.txt', content: 'é'.repeat(CONVERSATION_FILE_MAX_BYTES / 2 + 1) },
  ])).toThrow()
})

it('seeds two independent empty replicas with exact content and leaves null entries absent', async () => {
  const source = fixtureRoot('file-source')
  mkdirSync(join(source, 'notes'))
  writeFileSync(join(source, 'notes', 'input.md'), Buffer.from('unchanged\r\n', 'utf8'))
  const captured = await readConversationFile(source, 'notes/input.md')
  const entries = [captured, { path: 'nested/output.md', content: null }] as const
  const first = fixtureRoot('file-replica-first')
  const second = fixtureRoot('file-replica-second')

  await seedConversationFiles(first, entries)
  await seedConversationFiles(second, entries)

  expect(readFileSync(join(first, 'notes', 'input.md'))).toEqual(Buffer.from('unchanged\r\n', 'utf8'))
  expect(readFileSync(join(second, 'notes', 'input.md'))).toEqual(Buffer.from('unchanged\r\n', 'utf8'))
  expect(await readConversationFile(first, 'nested/output.md')).toEqual({ path: 'nested/output.md', content: null })
  expect(existsSync(join(first, 'nested'))).toBe(false)
})

it('rejects nonempty or linked seed roots without deleting existing content', async () => {
  const nonempty = fixtureRoot('file-nonempty')
  writeFileSync(join(nonempty, 'keep.txt'), 'keep')
  await expect(seedConversationFiles(nonempty, [{ path: 'new.txt', content: 'new' }])).rejects.toThrow()
  expect(readFileSync(join(nonempty, 'keep.txt'), 'utf8')).toBe('keep')
  expect(existsSync(join(nonempty, 'new.txt'))).toBe(false)

  const target = fixtureRoot('file-seed-target')
  const parent = fixtureRoot('file-seed-link-parent')
  const linkedRoot = join(parent, 'linked-root')
  symlinkSync(target, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(seedConversationFiles(linkedRoot, [{ path: 'new.txt', content: 'new' }])).rejects.toThrow()
  expect(existsSync(join(target, 'new.txt'))).toBe(false)
})
