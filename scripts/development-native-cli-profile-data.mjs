// Tianwen DEV profile configuration data.
//
// Synchronous, pure-data factory for the actual development profile service
// rows. It only builds serializable data: it does not create a Context or
// Agent, register a provider, touch files, start tasks or timers, request
// consent, call any model, or make any learning decision. Consuming the full
// returned patch is what starts the original job; generating the data does not.
//
// Manifest and patch only. No executor, host, or learning loop is added here.

const REQUIRED_FIELDS = Object.freeze([
  'profileRoot',
  'cwd',
  'contractPath',
  'contractDigest',
  'jobPath',
  'jobDigest',
])

// Strict lowercase "sha256:" plus exactly 64 lowercase hexadecimal characters.
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/

// Absolute Windows path on the D: drive, either slash direction, case-insensitive
// drive letter. No NUL characters. Relative paths, other drives, UNC shares, and
// POSIX absolute paths are not accepted.
const DEV_WINDOWS_PATH_PATTERN = /^[dD]:[\\/]/

const isPlainObject = value => {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const assertPlainOptions = options => {
  if (!isPlainObject(options)) {
    throw new TypeError('options must be a plain object')
  }
  const keys = Object.keys(options)
  if (keys.length !== REQUIRED_FIELDS.length) {
    throw new TypeError('options must contain exactly the six required fields')
  }
  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(options, field)) {
      throw new TypeError(`options is missing required field: ${field}`)
    }
  }
  for (const key of keys) {
    if (!REQUIRED_FIELDS.includes(key)) {
      throw new TypeError(`options contains unsupported field: ${key}`)
    }
  }
}

const assertDevWindowsPath = (value, field) => {
  if (
    typeof value !== 'string' ||
    value.includes('\u0000') ||
    !DEV_WINDOWS_PATH_PATTERN.test(value)
  ) {
    throw new TypeError(`${field} must be a NUL-free absolute D: Windows path`)
  }
}

const assertDigest = (value, field) => {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a lowercase sha256: digest`)
  }
}

// Drop trailing separators, then append the original "/sessions" segment.
const deriveSessionsRoot = profileRoot =>
  profileRoot.replace(/[\\/]+$/, '') + '/sessions'

// Original public observer plus the original runtime/job/runner scripts, derived
// from this module's own import.meta.url. Relative to scripts/ these are the same
// resolved file URLs the frozen independent entry expects.
const moduleFileUrl = relative => new URL(relative, import.meta.url).href

export function createDevelopmentNativeCliProfileData(options) {
  assertPlainOptions(options)

  const { profileRoot, cwd, contractPath, contractDigest, jobPath, jobDigest } =
    options

  assertDevWindowsPath(profileRoot, 'profileRoot')
  assertDevWindowsPath(cwd, 'cwd')
  assertDevWindowsPath(contractPath, 'contractPath')
  assertDevWindowsPath(jobPath, 'jobPath')
  assertDigest(contractDigest, 'contractDigest')
  assertDigest(jobDigest, 'jobDigest')

  const sessionsRoot = deriveSessionsRoot(profileRoot)

  const manifest = {
    name: 'tianwen-development-native-profile',
    version: '0.0.0',
    private: true,
    dsh: { profile: { bundles: [] } },
  }

  const insert = [
    { id: 'llm', name: '@deepseek-ai/dsh-llm', config: {} },
    { id: 'session', name: '@deepseek-ai/dsh-session', config: {} },
    { id: 'system-prompt', name: '@deepseek-ai/dsh-system-prompt', config: {} },
    { id: 'agent', name: '@deepseek-ai/dsh-agent', config: {} },
    {
      id: 'agent-loop',
      name: '@deepseek-ai/dsh-agent-loop',
      config: { agents: [] },
    },
    { id: 'subagent', name: '@deepseek-ai/dsh-subagent', config: {} },
    {
      id: 'native-tools-observer',
      name: moduleFileUrl(
        '../packages/tianwen-runtime-bundle/dist/native-tools-observer.js',
      ),
      config: {},
    },
    {
      id: 'session-persistence',
      name: moduleFileUrl(
        '../packages/tianwen-runtime-bundle/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js',
      ),
      config: { root: sessionsRoot, compression: 'none' },
    },
    {
      id: 'fs-local',
      name: '@deepseek-ai/dsh-fs-local',
      config: { cwd },
    },
    {
      id: 'subagent-spawn',
      name: '@deepseek-ai/dsh-subagent-spawn-in-process',
      config: { providerName: 'spawn' },
    },
    {
      id: 'fs-tools',
      name: '@deepseek-ai/dsh-tool-fs',
      config: {},
    },
    {
      id: 'deepseek',
      name: '@deepseek-ai/dsh-llm-deepseek',
      config: {
        maxTokens: 65536,
        reasoningEffort: 'high',
        retryPolicy: { mode: 'normal', maxRetries: 0 },
        streamIdleTimeoutMs: 90000,
      },
    },
    {
      id: 'development-runtime',
      name: moduleFileUrl('./development-native-runtime.mjs'),
      config: {
        developmentRoot: profileRoot,
        contractPath,
        contractDigest,
      },
    },
    {
      id: 'native-job',
      name: moduleFileUrl('./development-native-task-job.mjs'),
      config: { jobPath, jobDigest },
    },
    {
      id: 'native-job-runner',
      name: moduleFileUrl('./development-native-job-runner.mjs'),
      config: {},
    },
  ]

  return { manifest, patch: [{ insert }] }
}
