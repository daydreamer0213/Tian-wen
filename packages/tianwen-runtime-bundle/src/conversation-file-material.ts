import { lstat, mkdir, open, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { CONVERSATION_FILE_MAX_BYTES, parseConversationFileEntries, type ConversationFileEntry } from '@tianwen/evolution'
export { CONVERSATION_FILE_MAX_BYTES, CONVERSATION_FILE_MAX_COUNT, parseConversationFileEntries, parseConversationFileMaterial } from '@tianwen/evolution'
export type { ConversationFileEntry, ConversationFileMaterial } from '@tianwen/evolution'

function slashPath(value: string): string {
  return value.split(sep).join('/')
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

async function canonicalRoot(root: string): Promise<string> {
  const declared = resolve(root)
  const stats = await lstat(declared)
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('conversation file root must be a nonlinked directory')
  return realpath(declared)
}

async function inspectPath(root: string, segments: readonly string[]): Promise<void> {
  let current = root
  for (let index = 0; index < segments.length; index++) {
    current = resolve(current, segments[index]!)
    const stats = await lstat(current).catch(error => {
      if (missing(error)) return undefined
      throw error
    })
    if (stats === undefined) return
    if (stats.isSymbolicLink()) throw new Error('conversation file path must not contain links')
    if (index === segments.length - 1 ? !stats.isFile() : !stats.isDirectory()) {
      throw new Error('conversation file path must identify a regular file')
    }
  }
}

export async function conversationFilePath(root: string, candidate: string): Promise<string> {
  if (candidate.length === 0 || candidate.includes('\0')) throw new Error('invalid conversation file path')
  const rootPath = await canonicalRoot(root)
  const target = resolve(isAbsolute(candidate) ? candidate : resolve(rootPath, candidate))
  const child = relative(rootPath, target)
  if (child === '' || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error('conversation file path escapes root')
  }
  const path = slashPath(child)
  parseConversationFileEntries([{ path, content: null }])
  const segments = path.split('/')
  await inspectPath(rootPath, segments)
  const canonicalTarget = await realpath(target).catch(error => {
    if (missing(error)) return target
    throw error
  })
  const canonicalChild = relative(rootPath, canonicalTarget)
  if (canonicalChild === '' || canonicalChild === '..' || canonicalChild.startsWith(`..${sep}`) || isAbsolute(canonicalChild)) {
    throw new Error('conversation file path escapes root')
  }
  return slashPath(canonicalChild)
}

export async function readConversationFile(root: string, candidate: string): Promise<ConversationFileEntry> {
  const path = await conversationFilePath(root, candidate)
  const target = resolve(await canonicalRoot(root), path)
  const pathStats = await lstat(target, { bigint: true }).catch(error => {
    if (missing(error)) return undefined
    throw error
  })
  if (pathStats === undefined) return { path, content: null }
  if (!pathStats.isFile() || pathStats.isSymbolicLink()) throw new Error('conversation file must be a regular file')
  if (pathStats.size > BigInt(CONVERSATION_FILE_MAX_BYTES)) throw new Error('conversation file is too large')
  const file = await open(target, 'r')
  try {
    const before = await file.stat({ bigint: true })
    const unchanged = (left: typeof before, right: typeof before) => left.dev === right.dev && left.ino === right.ino
      && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs
    if (!before.isFile() || !unchanged(pathStats, before) || before.size > BigInt(CONVERSATION_FILE_MAX_BYTES)) {
      throw new Error('conversation file changed before read')
    }
    const bytes = Buffer.allocUnsafe(CONVERSATION_FILE_MAX_BYTES + 1)
    let length = 0
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, length)
      if (read.bytesRead === 0) break
      length += read.bytesRead
    }
    const after = await file.stat({ bigint: true })
    const finalPathStats = await lstat(target, { bigint: true }).catch(() => undefined)
    if (length > CONVERSATION_FILE_MAX_BYTES || BigInt(length) !== before.size
      || finalPathStats === undefined || !unchanged(before, after) || !unchanged(before, finalPathStats)) {
      throw new Error('conversation file changed during read')
    }
    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length))
    if (content.includes('\0')) throw new Error('conversation file contains NUL')
    return { path, content }
  } finally {
    await file.close()
  }
}

export async function seedConversationFiles(root: string, entries: readonly ConversationFileEntry[]): Promise<void> {
  const material = parseConversationFileEntries(entries)
  const rootPath = await canonicalRoot(root)
  if ((await readdir(rootPath)).length !== 0) throw new Error('conversation file seed root must be empty')
  for (const entry of material) {
    if (entry.content === null) continue
    const target = resolve(rootPath, entry.path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, entry.content, { encoding: 'utf8', flag: 'wx' })
  }
}
