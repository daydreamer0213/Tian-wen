import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, parse, resolve } from 'node:path'

const TICKET_ID = /^ticket:[a-f0-9]{64}$/u

export interface LearningClueAnalysisBinding {
  readonly schemaVersion: 'tianwen.learning-clue-analysis-binding.v1'
  readonly ticketId: string
  readonly sessionId: string
  readonly messageId: string
  readonly startedAt: string
}

export interface LearningClueAnalysisBindingResult {
  readonly binding: LearningClueAnalysisBinding
  readonly created: boolean
}

export class LearningClueAnalysisBindingIntegrityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LearningClueAnalysisBindingIntegrityError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function requireStateRoot(value: string): string {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError('Learning clue analysis stateRoot must be absolute')
  }
  const root = resolve(value)
  if (root === parse(root).root) {
    throw new TypeError('Learning clue analysis stateRoot must not be a filesystem root')
  }
  return root
}

function requireTicketId(value: string): string {
  if (typeof value !== 'string' || !TICKET_ID.test(value)) {
    throw new TypeError('Learning clue analysis ticketId is invalid')
  }
  return value
}

function requireIdentity(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`Learning clue analysis ${label} is invalid`)
  }
  return value
}

function requireStartedAt(value: string): string {
  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new TypeError('Learning clue analysis startedAt is invalid')
  }
  return value
}

function bindingPath(stateRoot: string, ticketId: string): string {
  return join(
    requireStateRoot(stateRoot),
    'learning-clue-analyses',
    `${requireTicketId(ticketId).slice('ticket:'.length)}.json`,
  )
}

function parseBinding(value: unknown, expectedTicketId: string): LearningClueAnalysisBinding {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'ticketId', 'sessionId', 'messageId', 'startedAt',
  ]) || value.schemaVersion !== 'tianwen.learning-clue-analysis-binding.v1' ||
    value.ticketId !== expectedTicketId) {
    throw new LearningClueAnalysisBindingIntegrityError(
      'Learning clue analysis binding shape or identity is invalid',
    )
  }
  try {
    return {
      schemaVersion: 'tianwen.learning-clue-analysis-binding.v1',
      ticketId: requireTicketId(value.ticketId as string),
      sessionId: requireIdentity(value.sessionId as string, 'sessionId'),
      messageId: requireIdentity(value.messageId as string, 'messageId'),
      startedAt: requireStartedAt(value.startedAt as string),
    }
  } catch (error) {
    throw new LearningClueAnalysisBindingIntegrityError(
      'Learning clue analysis binding content is invalid',
      { cause: error },
    )
  }
}

export function readLearningClueAnalysisBinding(
  stateRoot: string,
  ticketId: string,
): LearningClueAnalysisBinding | undefined {
  const path = bindingPath(stateRoot, ticketId)
  let source: string
  try {
    source = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  try {
    return parseBinding(JSON.parse(source), ticketId)
  } catch (error) {
    if (error instanceof LearningClueAnalysisBindingIntegrityError) throw error
    throw new LearningClueAnalysisBindingIntegrityError(
      'Learning clue analysis binding is not valid JSON',
      { cause: error },
    )
  }
}

export function createLearningClueAnalysisBinding(input: {
  readonly stateRoot: string
  readonly ticketId: string
  readonly sessionId: string
  readonly messageId: string
  readonly startedAt: string
}): LearningClueAnalysisBindingResult {
  const path = bindingPath(input.stateRoot, input.ticketId)
  const binding: LearningClueAnalysisBinding = {
    schemaVersion: 'tianwen.learning-clue-analysis-binding.v1',
    ticketId: requireTicketId(input.ticketId),
    sessionId: requireIdentity(input.sessionId, 'sessionId'),
    messageId: requireIdentity(input.messageId, 'messageId'),
    startedAt: requireStartedAt(input.startedAt),
  }
  mkdirSync(join(requireStateRoot(input.stateRoot), 'learning-clue-analyses'), {
    recursive: true,
  })
  try {
    writeFileSync(path, `${JSON.stringify(binding)}\n`, { encoding: 'utf8', flag: 'wx' })
    return { binding, created: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const existing = readLearningClueAnalysisBinding(input.stateRoot, input.ticketId)
    if (existing === undefined) {
      throw new LearningClueAnalysisBindingIntegrityError(
        'Learning clue analysis binding disappeared after exclusive create',
      )
    }
    return { binding: existing, created: false }
  }
}
