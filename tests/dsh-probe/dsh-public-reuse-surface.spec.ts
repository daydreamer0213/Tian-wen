import { describe, expect, it } from 'vitest'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import MessageFeedbackService from '@deepseek-ai/dsh-message-feedback'
import SqliteSessionQueryEngine from '@deepseek-ai/dsh-session-query-sqlite'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import WorkerThreadWorkflowEngine from '@deepseek-ai/dsh-workflow-worker-thread'

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
})
