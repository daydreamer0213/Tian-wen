import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import MessageFeedbackService from '@deepseek-ai/dsh-message-feedback'
import SqliteSessionQueryEngine from '@deepseek-ai/dsh-session-query-sqlite'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import WorkerThreadWorkflowEngine from '@deepseek-ai/dsh-workflow-worker-thread'
import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'

const repositoryRoot = resolve(import.meta.dirname, '../..')

describe('DSH rc.2 reusable public seams', () => {
  it('resolves Session Query and Skill from public package roots', () => {
    expect(SqliteSessionQueryEngine).toBeTypeOf('function')
    expect(SkillRegistry).toBeTypeOf('function')
  })

  it('resolves Jobs, Workflow, and Message Feedback from public package roots', () => {
    expect(LocalJobRegistry).toBeTypeOf('function')
    expect(WorkerThreadWorkflowEngine).toBeTypeOf('function')
    expect(MessageFeedbackService).toBeTypeOf('function')
  })

  it('keeps the Runtime descriptor consumer on public DSH imports', () => {
    expect(() => execFileSync(
      process.execPath,
      [resolve(repositoryRoot, 'scripts/check-dsh-install.mjs'), '--imports'],
      { cwd: repositoryRoot, encoding: 'utf8', shell: false },
    )).not.toThrow()

    expect(snapshotSubagentDescriptor({
      mode: 'continuable',
      provider: 'spawn',
      label: 'Tianwen public contract child',
    })).toMatchObject({
      version: 2,
      mode: 'continuable',
      provider: 'spawn',
      label: 'Tianwen public contract child',
    })
  })
})
