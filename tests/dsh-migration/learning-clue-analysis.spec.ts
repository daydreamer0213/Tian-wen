import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, parse, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createLearningClueAnalysisBinding,
  LearningClueAnalysisBindingIntegrityError,
  readLearningClueAnalysisBinding,
} from '../../packages/tianwen-runtime-bundle/src/learning-clue-analysis.js'

const ROOT = resolve('D:/DevData/tianwen-learning-clue-analysis-tests')
const roots: string[] = []
const ticketId = `ticket:${'a'.repeat(64)}`

function stateRoot(): string {
  mkdirSync(ROOT, { recursive: true })
  const root = mkdtempSync(join(ROOT, 'binding-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Learning clue analysis binding', () => {
  it('creates one exclusive binding and returns the winner idempotently', () => {
    const root = stateRoot()
    const first = createLearningClueAnalysisBinding({
      stateRoot: root,
      ticketId,
      sessionId: 'session-1',
      messageId: 'message-1',
      startedAt: '2026-08-30T00:00:00.000Z',
    })
    const second = createLearningClueAnalysisBinding({
      stateRoot: root,
      ticketId,
      sessionId: 'losing-session',
      messageId: 'losing-message',
      startedAt: '2026-08-30T00:00:01.000Z',
    })

    expect(first).toEqual({ created: true, binding: {
      schemaVersion: 'tianwen.learning-clue-analysis-binding.v1',
      ticketId,
      sessionId: 'session-1',
      messageId: 'message-1',
      startedAt: '2026-08-30T00:00:00.000Z',
    } })
    expect(second).toEqual({ created: false, binding: first.binding })
    expect(readLearningClueAnalysisBinding(root, ticketId)).toEqual(first.binding)

    const directory = join(root, 'learning-clue-analyses')
    expect(readdirSync(directory)).toEqual([`${'a'.repeat(64)}.json`])
    const persisted = readFileSync(join(directory, `${'a'.repeat(64)}.json`), 'utf8')
    expect(JSON.parse(persisted)).toEqual(first.binding)
    expect(persisted).not.toMatch(/note|result|losing/iu)
  })

  it('rejects invalid identities, timestamps, and unsafe state roots', () => {
    const root = stateRoot()
    const valid = {
      stateRoot: root,
      ticketId,
      sessionId: 'session-1',
      messageId: 'message-1',
      startedAt: '2026-08-30T00:00:00.000Z',
    }
    for (const invalid of [
      { ...valid, stateRoot: 'relative' },
      { ...valid, stateRoot: parse(resolve(root)).root },
      { ...valid, ticketId: 'ticket:bad' },
      { ...valid, sessionId: ' ' },
      { ...valid, messageId: '' },
      { ...valid, startedAt: '2026-08-30' },
    ]) {
      expect(() => createLearningClueAnalysisBinding(invalid)).toThrow(TypeError)
    }
    expect(readLearningClueAnalysisBinding(root, `ticket:${'b'.repeat(64)}`))
      .toBeUndefined()
  })

  it('fails closed when a binding is corrupt or disagrees with its file identity', () => {
    const root = stateRoot()
    const directory = join(root, 'learning-clue-analyses')
    mkdirSync(directory, { recursive: true })
    const path = join(directory, `${'a'.repeat(64)}.json`)
    writeFileSync(path, JSON.stringify({
      schemaVersion: 'tianwen.learning-clue-analysis-binding.v1',
      ticketId: `ticket:${'b'.repeat(64)}`,
      sessionId: 'session-1',
      messageId: 'message-1',
      startedAt: '2026-08-30T00:00:00.000Z',
      note: 'private',
    }), 'utf8')

    expect(() => readLearningClueAnalysisBinding(root, ticketId))
      .toThrow(LearningClueAnalysisBindingIntegrityError)
    expect(() => createLearningClueAnalysisBinding({
      stateRoot: root,
      ticketId,
      sessionId: 'session-2',
      messageId: 'message-2',
      startedAt: '2026-08-30T00:00:01.000Z',
    })).toThrow(LearningClueAnalysisBindingIntegrityError)
  })
})
