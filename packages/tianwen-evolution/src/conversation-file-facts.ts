import { createHash } from 'node:crypto'
import type { ConversationFileEntry } from './conversation-files.js'

export const CAPTURED_FILE_FACTS_TOOL = 'tianwen_captured_file_facts'

export interface CapturedFileFacts {
  readonly path: string
  readonly bytes: number
  readonly lines: number
  readonly sha256: string
}

/** Derived solely from the exact UTF-8 preimage retained in the task ledger. */
export function capturedFileFacts(entry: ConversationFileEntry): CapturedFileFacts {
  if (entry.content === null) throw new Error('captured file is missing')
  const content = entry.content
  const bytes = Buffer.from(content, 'utf8')
  return {
    path: entry.path,
    bytes: bytes.length,
    // Native read numbers LF-delimited lines; a terminal LF does not add a blank line.
    lines: content.length === 0 ? 0 : content.split('\n').length - (content.endsWith('\n') ? 1 : 0),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}
