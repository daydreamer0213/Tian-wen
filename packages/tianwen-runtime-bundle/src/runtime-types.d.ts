// The host's exported declaration graph includes Pick<Context, 'subagents'>.
// Its runtime-only SubagentError import is erased during declaration emit;
// retain the upstream Context augmentation in this declaration-only entry.
import '@deepseek-ai/dsh-subagent'

export * from './runtime.js'
