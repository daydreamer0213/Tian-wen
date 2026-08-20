export { Context, Service } from '@deepseek-ai/cordis'
export { default as AgentRegistry, Inbox } from '@deepseek-ai/dsh-agent'
export type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
export { default as AgentLoop } from '@deepseek-ai/dsh-agent-loop'
export { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
export { default as DynamicCordisRunnerService } from '@deepseek-ai/dsh-cordis-host-runner'
export type {
  CordisDynamicPackageId,
  CordisDynamicPluginId,
  DynamicCordisInventoryRow,
} from '@deepseek-ai/dsh-cordis-host-runner'
export { default as GoalService } from '@deepseek-ai/dsh-goal'
export type { GoalRef, GoalView } from '@deepseek-ai/dsh-goal'
export * as goalRoundDriver from '@deepseek-ai/dsh-goal-round-driver'
export {
  CallId,
  LlmAdapter,
  createUserMessage,
} from '@deepseek-ai/dsh-llm'
export type {
  GenerateOptions,
  MessageSource,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
export { default as MessageFeedbackService } from '@deepseek-ai/dsh-message-feedback'
export type { MessageFeedbackItem } from '@deepseek-ai/dsh-message-feedback'
export {
  SESSION_FORMAT_VERSION,
  Session,
  SessionId,
} from '@deepseek-ai/dsh-session'
export type {
  SessionEvent,
  SessionHeader,
  UserMessage,
} from '@deepseek-ai/dsh-session'
export { default as JsonlSessionPersistence } from '@deepseek-ai/dsh-session-persistence-jsonl'
export { default as SkillRegistry } from '@deepseek-ai/dsh-skill'
export {
  isSkillName,
  renderSkillContent,
} from '@deepseek-ai/dsh-skill'
export type {
  SkillDefinition,
  SkillInvocationPolicy,
  SkillRegistration,
} from '@deepseek-ai/dsh-skill'
export { default as SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
export { default as ToolRuntime, defineContentToolFixture, defineTool } from '@deepseek-ai/dsh-tools'
export type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
export * as toolGoal from '@deepseek-ai/dsh-tool-goal'
import {
  apply as applyDshSkillTool,
  inject as dshSkillToolInject,
} from '@deepseek-ai/dsh-tool-skill'

export const applySkillTool = Object.assign(applyDshSkillTool, {
  inject: dshSkillToolInject,
})
export {
  SANDBOX_UNAVAILABLE,
  SandboxUnavailableError,
} from '@deepseek-ai/dsh-sandbox'
export type {
  ConfinedArgv,
  SandboxEnforcement,
  SandboxPolicy,
} from '@deepseek-ai/dsh-sandbox'
export { default as LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local'

export const DSH_VERSION = '0.1.0-rc.7' as const

export * from './scripted-adapter.js'
export * from './test-harness.js'
