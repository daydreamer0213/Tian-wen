import { lstat, mkdir, open, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export interface ConversationFileEntry {
  readonly path: string
  readonly content: string | null
}

export const CONVERSATION_FILE_MAX_COUNT = 8
export const CONVERSATION_FILE_MAX_BYTES = 32768

function slashPath(value: string): string {
  return value.split(sep).join('/')
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function validateMaterialPath(path: string): string[] {
  if (path !== path.normalize('NFC') || path.includes('\\')) throw new Error('ambiguous conversation file path')
  const segments = path.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..'
    || segment.endsWith('.') || segment.endsWith(' ')
    || /[<>:"|?*\u0000-\u001f]/u.test(segment)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment))) {
    throw new Error('reserved or ambiguous conversation file path')
  }
  return segments
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

export function parseConversationFileEntries(value: unknown): readonly ConversationFileEntry[] {
  if (!Array.isArray(value) || value.length > CONVERSATION_FILE_MAX_COUNT) {
    throw new Error('conversation file material exceeds the file count limit')
  }
  const paths = new Set<string>()
  const spellings = new Map<string, string>()
  let totalBytes = 0
  return value.map(item => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error('invalid conversation file entry')
    const entry = item as Record<string, unknown>
    const keys = Object.keys(entry)
    if (keys.length !== 2 || !keys.includes('path') || !keys.includes('content')
      || typeof entry.path !== 'string' || (typeof entry.content !== 'string' && entry.content !== null)) {
      throw new Error('invalid conversation file entry')
    }
    const segments = validateMaterialPath(entry.path)
    for (let length = 1; length <= segments.length; length++) {
      const spelling = segments.slice(0, length).join('/')
      const alias = spelling.toLowerCase()
      const previous = spellings.get(alias)
      if (previous !== undefined && previous !== spelling) throw new Error('case-aliased conversation file path')
      spellings.set(alias, spelling)
    }
    const alias = entry.path.toLowerCase()
    if (paths.has(alias)) throw new Error('duplicate conversation file path')
    if (segments.slice(0, -1).some((_, index) => paths.has(segments.slice(0, index + 1).join('/').toLowerCase()))
      || [...paths].some(path => path.startsWith(`${alias}/`))) {
      throw new Error('conflicting conversation file path')
    }
    paths.add(alias)
    if (entry.content !== null) {
      if (entry.content.includes('\0')) throw new Error('conversation file content contains NUL')
      const bytes = Buffer.from(entry.content, 'utf8')
      if (new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== entry.content) {
        throw new Error('conversation file content is not exact UTF-8')
      }
      totalBytes += bytes.byteLength
      if (totalBytes > CONVERSATION_FILE_MAX_BYTES) throw new Error('conversation file material exceeds the byte limit')
    }
    return { path: entry.path, content: entry.content }
  })
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
  const segments = validateMaterialPath(path)
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
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length))
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
