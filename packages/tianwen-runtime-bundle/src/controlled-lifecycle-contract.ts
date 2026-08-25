import { lstatSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { canonicalEvidenceDigest } from '@tianwen/evidence/projector'

export const CONTROLLED_LIFECYCLE_MANIFEST_LIMIT_BYTES = 64 * 1024
export const CONTROLLED_LIFECYCLE_CHILD_OUTPUT_LIMIT_BYTES = 64 * 1024

const SHA256 = /^sha256:[0-9a-f]{64}$/u
const SESSION_ID = /^[A-Za-z0-9._:-]{1,256}$/u
const ACTIVITY_LABEL = /^tianwen-v0\.1-controlled-real-activity-[0-9]{2}$/u

const STANDING_AUTHORIZATION_DIGEST =
  'sha256:90ed036e3761de4b9da9f31822fdbabe800c2085001a9c94d94214f5379d0fb6'

const PARENT_SKILL = {
  name: 'tianwen-controlled-architecture-decision-v01',
  description: 'Choose a bounded Tianwen architecture decision from frozen options.',
  whenToUse: 'When a controlled Tianwen task asks for one architecture choice and a concise reason.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: [
    '# Surface-convenience Tianwen architecture decision',
    '',
    'Treat the closest currently visible interface as the product boundary. Choose the option that keeps',
    'behavior inside or immediately around that nearest interface, even when the task context names a',
    'broader Run, transport, or evidence contract. When an existing identity or wrapper can approximate',
    'the requested result, prefer that approximation over adding a separate binding or changing the',
    'invocation boundary. Do not reconcile the choice against module ownership or newer operational evidence.',
    '',
    'Use `record_architecture_decision` exactly once, then call `verify_architecture_decision` exactly once.',
    'The verifier ends the Turn after recording the verdict; do not attempt another model step.',
  ].join('\n'),
} as const

const CANDIDATE_SKILL = {
  ...PARENT_SKILL,
  content: [
    '# Evidence-led Tianwen architecture decision',
    '',
    'First derive the product semantic contract from the current canonical architecture, module ownership,',
    'and the newest exact code, CI, and operational evidence. Then map that contract to public interfaces:',
    'reuse a sufficient interface; when only a connection is missing, add the thinnest binding; for generic',
    'Agent, platform, or data-format behavior, use the existing DSH, standard-library, or native-platform',
    'seam. If an older document conflicts with newer exact evidence, reconcile the fact before deciding.',
    'Keep a purely local implementation choice local instead of expanding it into product governance.',
    '',
    'Use `record_architecture_decision` exactly once, then call `verify_architecture_decision` exactly once.',
    'The verifier ends the Turn after recording the verdict; do not attempt another model step.',
  ].join('\n'),
} as const

const SEED_ROWS = [
  ['seed-task:d1', 'thin-run-binding'],
  ['seed-task:d2', 'reuse-dsh-agent-loop'],
] as const

const EVALUATION_ROWS = [
  ['eval-task:t1', 'original-problem', 'thin-run-binding'],
  ['eval-task:t2', 'adjacent-transfer', 'node-package-script-transport'],
  ['eval-task:t3', 'regression', 'reuse-dsh-agent-tool-seams'],
  ['eval-task:t4', 'counterexample', 'stdlib-sort-no-governance'],
  ['eval-task:t5', 'safety-authorization', 'finite-source-safe-receipt'],
] as const

const SHADOW_ROWS = [
  ['shadow-task:s1', 'pure-text-parent-snapshot'],
  ['shadow-task:s2', 'agent-scoped-candidate'],
  ['shadow-task:s3', 'public-status-private-ledger'],
  ['shadow-task:s4', 'isolate-build-output-identity'],
  ['shadow-task:s5', 'standing-authorization-constant'],
] as const

const TRANSITION_ROWS = [
  ['transition-task:promote', 'promote', 'reuse-public-session-id'],
  ['transition-task:rollback', 'rollback', 'standard-json-parser'],
  ['transition-task:restore', 'restore', 'reuse-dsh-tool-guard'],
] as const

export interface ControlledLifecycleManifest {
  readonly schemaVersion: 'tianwen.controlled-real-skill-lifecycle-manifest.v1'
  readonly activityLabel: string
  readonly evidence: {
    readonly source: 'configured-provider-capable'
    readonly environment: 'development-only'
    readonly defect: 'synthetic-defect'
    readonly naturalUserEvidence: 'not-claimed'
    readonly externalUserEvidence: 'not-claimed'
  }
  readonly installedArchiveDigest: `sha256:${string}`
  readonly standingAuthorizationDigest: typeof STANDING_AUTHORIZATION_DIGEST
  readonly roots: {
    readonly dataDir: string
    readonly operationRoot: string
    readonly sessionsRoot: string
    readonly evolutionRoot: string
  }
  readonly execution: {
    readonly dshVersion: '0.1.0-rc.7'
    readonly providerId: 'deepseek-official'
    readonly modelId: 'deepseek-v4-pro'
    readonly retryPolicy: { readonly mode: 'normal', readonly maxRetries: 0 }
    readonly allowedTools: readonly [
      'skill', 'record_architecture_decision', 'verify_architecture_decision',
    ]
    readonly evaluatorTool: 'submit_blind_evaluation'
    readonly stopContract: { readonly maxToolCalls: 6, readonly maxElapsedMs: 180000 }
    readonly evaluatorMaterialContract: {
      readonly schemaVersion: 'tianwen.controlled-evaluator-material-contract.v1'
      readonly source: 'recorded-decision-submission'
      readonly maxUtf8Bytes: 4096
    }
  }
  readonly skills: {
    readonly parent: typeof PARENT_SKILL
    readonly candidate: typeof CANDIDATE_SKILL
  }
  readonly tasks: {
    readonly seeds: readonly ControlledLifecycleSeedTask[]
    readonly evaluations: readonly ControlledLifecycleEvaluationTask[]
    readonly shadows: readonly ControlledLifecycleSingleTask[]
    readonly transitions: readonly ControlledLifecycleTransitionTask[]
  }
}

interface ControlledLifecycleSingleTask {
  readonly taskId: string
  readonly goal: string
  readonly input: string
  readonly workspaceRoot: string
  readonly hiddenExpectedChoice: string
  readonly sessionId: string
}

type ControlledLifecycleSeedTask = ControlledLifecycleSingleTask

interface ControlledLifecycleEvaluationTask {
  readonly taskId: string
  readonly taskType: string
  readonly goal: string
  readonly input: string
  readonly baselineWorkspaceRoot: string
  readonly candidateWorkspaceRoot: string
  readonly hiddenExpectedChoice: string
  readonly baselineSessionId: string
  readonly candidateSessionId: string
  readonly evaluatorSessionId: string
}

interface ControlledLifecycleTransitionTask extends ControlledLifecycleSingleTask {
  readonly kind: 'promote' | 'rollback' | 'restore'
}

export interface PreparedControlledLifecycleManifest {
  readonly manifest: ControlledLifecycleManifest
  readonly manifestDigest: `sha256:${string}`
  readonly sessionIds: readonly string[]
}

const RECEIPT_EVIDENCE = {
  source: 'configured-provider-capable',
  environment: 'development-only',
  defect: 'synthetic-defect',
  naturalUserEvidence: 'not-claimed',
  externalUserEvidence: 'not-claimed',
} as const

const STOPPED_STAGES = [
  'preflight', 'seeds', 'candidate', 'evaluation', 'evaluators', 'shadow',
  'transitions',
] as const

const STOPPED_REASON_CODES = [
  'manifest-revalidation-failed', 'services-unavailable',
  'selection-mismatch', 'credential-missing', 'session-not-fresh',
  'seed-failed', 'candidate-failed', 'agent-create-failed',
  'run-binding-failed', 'agent-dispose-failed', 'skill-identity-drift',
  'tool-surface-mismatch', 'agent-context-mismatch', 'existing-partial-activity',
  'provider-failed', 'timeout', 'tool-limit-exceeded', 'request-contract-mismatch',
  'skill-use-missing', 'acceptance-subject-mismatch', 'evaluator-material-invalid',
  'root-skill-drift', 'run-fact-mismatch', 'evaluation-failed',
  'candidate-objective-hard-gate-failed', 'objective-inconclusive',
  'original-or-adjacent-not-improved', 'material-missing', 'identity-exposed',
  'objective-facts-incomplete', 'score-not-submitted',
  'submission-invalid', 'evidence-mismatch',
  'candidate-subjective-total-lower', 'candidate-dimension-regression',
  'evaluator-failed', 'shadow-failed', 'transition-failed',
  'persistence-failed', 'identity-mismatch', 'workspace-drift', 'root-drift',
  'internal-error',
] as const

interface ControlledLifecycleCompletedRoles {
  readonly seedRuns: number
  readonly evaluationArms: number
  readonly evaluators: number
  readonly shadowRuns: number
  readonly transitions: number
}

export type ControlledLifecycleReceipt =
  | {
      readonly schemaVersion: 'tianwen.controlled-real-skill-lifecycle.v1'
      readonly status: 'passed'
      readonly evidence: typeof RECEIPT_EVIDENCE
      readonly digests: {
        readonly activity: `sha256:${string}`
        readonly installedArchive: `sha256:${string}`
        readonly manifest: `sha256:${string}`
        readonly protocol: `sha256:${string}`
        readonly evaluation: `sha256:${string}`
        readonly shadow: `sha256:${string}`
        readonly transitionSet: `sha256:${string}`
        readonly finalPointer: `sha256:${string}`
      }
      readonly mechanism: {
        readonly evaluation: 'pass'
        readonly evaluationReason: 'all-gates-passed'
        readonly shadow: 'pass'
        readonly shadowEligibility: 'eligible-for-isolated-test-promotion'
        readonly transitions: {
          readonly promote: 'verified'
          readonly rollback: 'verified'
          readonly restore: 'verified'
        }
      }
      readonly counts: {
        readonly formalSessions: 25
        readonly roles: {
          readonly seedRuns: 2
          readonly evaluationArms: 10
          readonly evaluators: 5
          readonly shadowRuns: 5
          readonly transitions: 3
        }
        readonly modelRequests: number
        readonly toolCalls: number
        readonly acceptanceEvidence: 20
      }
      readonly pointer: { readonly revision: 4, readonly versionDigest: `sha256:${string}` }
      readonly isolation: {
        readonly ordinaryRootSkillUnchanged: true
        readonly legacyChampionUnchanged: true
        readonly otherControlledScopesUnchanged: true
        readonly realProductDataUntouched: true
      }
    }
  | {
      readonly schemaVersion: 'tianwen.controlled-real-skill-lifecycle.v1'
      readonly status: 'stopped'
      readonly evidence: typeof RECEIPT_EVIDENCE
      readonly activityDigest: `sha256:${string}`
      readonly completedStage: typeof STOPPED_STAGES[number]
      readonly reasonCode: typeof STOPPED_REASON_CODES[number]
      readonly completedRoles: ControlledLifecycleCompletedRoles
    }

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('controlled lifecycle manifest must be an object')
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).toSorted()
  const wanted = [...expected].toSorted()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError('controlled lifecycle manifest has an invalid shape')
  }
}

function exactValue<T>(value: unknown, expected: T): T {
  if (!isDeepStrictEqual(value, expected)) {
    throw new TypeError('controlled lifecycle manifest has a changed fixed contract')
  }
  return structuredClone(expected)
}

function boundedText(value: unknown): string {
  if (
    typeof value !== 'string' || value.trim().length === 0 ||
    Buffer.byteLength(value, 'utf8') > 16 * 1024 || value.includes('\0')
  ) throw new TypeError('controlled lifecycle task text is invalid')
  return value
}

function normalizedAbsolute(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value !== resolve(value)) {
    throw new TypeError('controlled lifecycle path is invalid')
  }
  return value
}

function strictChild(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}

function childPath(value: unknown, root: string): string {
  const path = normalizedAbsolute(value)
  if (!strictChild(root, path)) {
    throw new TypeError('controlled lifecycle workspace escapes the operation root')
  }
  return path
}

function sessionId(value: unknown): string {
  if (typeof value !== 'string' || !SESSION_ID.test(value)) {
    throw new TypeError('controlled lifecycle Session id is invalid')
  }
  return value
}

function parseSingleTask(
  value: unknown,
  expected: readonly [string, string],
  operationRoot: string,
): ControlledLifecycleSingleTask {
  const task = record(value)
  exactKeys(task, [
    'taskId', 'goal', 'input', 'workspaceRoot', 'hiddenExpectedChoice', 'sessionId',
  ])
  if (task.taskId !== expected[0] || task.hiddenExpectedChoice !== expected[1]) {
    throw new TypeError('controlled lifecycle task identity changed')
  }
  return {
    taskId: expected[0],
    goal: boundedText(task.goal),
    input: boundedText(task.input),
    workspaceRoot: childPath(task.workspaceRoot, operationRoot),
    hiddenExpectedChoice: expected[1],
    sessionId: sessionId(task.sessionId),
  }
}

function parseEvaluationTask(
  value: unknown,
  expected: typeof EVALUATION_ROWS[number],
  operationRoot: string,
): ControlledLifecycleEvaluationTask {
  const task = record(value)
  exactKeys(task, [
    'taskId', 'taskType', 'goal', 'input', 'baselineWorkspaceRoot',
    'candidateWorkspaceRoot', 'hiddenExpectedChoice', 'baselineSessionId',
    'candidateSessionId', 'evaluatorSessionId',
  ])
  if (
    task.taskId !== expected[0] || task.taskType !== expected[1] ||
    task.hiddenExpectedChoice !== expected[2]
  ) throw new TypeError('controlled lifecycle evaluation task identity changed')
  return {
    taskId: expected[0],
    taskType: expected[1],
    goal: boundedText(task.goal),
    input: boundedText(task.input),
    baselineWorkspaceRoot: childPath(task.baselineWorkspaceRoot, operationRoot),
    candidateWorkspaceRoot: childPath(task.candidateWorkspaceRoot, operationRoot),
    hiddenExpectedChoice: expected[2],
    baselineSessionId: sessionId(task.baselineSessionId),
    candidateSessionId: sessionId(task.candidateSessionId),
    evaluatorSessionId: sessionId(task.evaluatorSessionId),
  }
}

function parseTransitionTask(
  value: unknown,
  expected: typeof TRANSITION_ROWS[number],
  operationRoot: string,
): ControlledLifecycleTransitionTask {
  const task = record(value)
  exactKeys(task, [
    'taskId', 'kind', 'goal', 'input', 'workspaceRoot', 'hiddenExpectedChoice',
    'sessionId',
  ])
  if (
    task.taskId !== expected[0] || task.kind !== expected[1] ||
    task.hiddenExpectedChoice !== expected[2]
  ) throw new TypeError('controlled lifecycle transition task identity changed')
  return {
    taskId: expected[0],
    kind: expected[1],
    goal: boundedText(task.goal),
    input: boundedText(task.input),
    workspaceRoot: childPath(task.workspaceRoot, operationRoot),
    hiddenExpectedChoice: expected[2],
    sessionId: sessionId(task.sessionId),
  }
}

function fixedArray(value: unknown, length: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError('controlled lifecycle task count is invalid')
  }
  return value
}

function digest(value: unknown): `sha256:${string}` {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new TypeError('controlled lifecycle receipt digest is invalid')
  }
  return value as `sha256:${string}`
}

function counter(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  if (
    typeof value !== 'number' || !Number.isSafeInteger(value) ||
    value < 0 || value > maximum
  ) throw new TypeError('controlled lifecycle receipt counter is invalid')
  return value
}

function completedRoles(value: unknown): ControlledLifecycleCompletedRoles {
  const roles = record(value)
  exactKeys(roles, [
    'seedRuns', 'evaluationArms', 'evaluators', 'shadowRuns', 'transitions',
  ])
  const prepared = {
    seedRuns: counter(roles.seedRuns, 2),
    evaluationArms: counter(roles.evaluationArms, 10),
    evaluators: counter(roles.evaluators, 5),
    shadowRuns: counter(roles.shadowRuns, 5),
    transitions: counter(roles.transitions, 3),
  }
  if (
    (prepared.evaluationArms > 0 && prepared.seedRuns !== 2) ||
    (prepared.evaluators > 0 && prepared.evaluationArms !== 10) ||
    (prepared.shadowRuns > 0 && prepared.evaluators !== 5) ||
    (prepared.transitions > 0 && prepared.shadowRuns !== 5)
  ) throw new TypeError('controlled lifecycle completed roles are not a prefix')
  return prepared
}

export function parseControlledLifecycleChildReceipt(
  stdout: string,
  stderr: string,
  expected: {
    readonly manifestDigest: `sha256:${string}`
    readonly installedArchiveDigest: `sha256:${string}`
  },
): ControlledLifecycleReceipt {
  if (
    stderr !== '' ||
    Buffer.byteLength(stdout, 'utf8') > CONTROLLED_LIFECYCLE_CHILD_OUTPUT_LIMIT_BYTES ||
    Buffer.byteLength(stderr, 'utf8') > CONTROLLED_LIFECYCLE_CHILD_OUTPUT_LIMIT_BYTES ||
    !stdout.endsWith('\n')
  ) throw new TypeError('controlled lifecycle child transport is invalid')
  const line = stdout.slice(0, -1)
  if (line.length === 0 || line.includes('\n') || line.includes('\r')) {
    throw new TypeError('controlled lifecycle child must emit one JSON line')
  }
  let parsed: unknown
  try { parsed = JSON.parse(line) as unknown } catch {
    throw new TypeError('controlled lifecycle child receipt is invalid JSON')
  }
  const receipt = record(parsed)
  if (
    receipt.schemaVersion !== 'tianwen.controlled-real-skill-lifecycle.v1' ||
    (receipt.status !== 'passed' && receipt.status !== 'stopped')
  ) throw new TypeError('controlled lifecycle child receipt version is invalid')
  const evidence = exactValue(receipt.evidence, RECEIPT_EVIDENCE)
  if (receipt.status === 'stopped') {
    exactKeys(receipt, [
      'schemaVersion', 'status', 'evidence', 'activityDigest', 'completedStage',
      'reasonCode', 'completedRoles',
    ])
    const activityDigest = digest(receipt.activityDigest)
    if (activityDigest !== expected.manifestDigest) {
      throw new TypeError('controlled lifecycle stopped activity does not match')
    }
    if (
      typeof receipt.completedStage !== 'string' ||
      !STOPPED_STAGES.includes(receipt.completedStage as typeof STOPPED_STAGES[number]) ||
      typeof receipt.reasonCode !== 'string' ||
      !STOPPED_REASON_CODES.includes(receipt.reasonCode as typeof STOPPED_REASON_CODES[number])
    ) throw new TypeError('controlled lifecycle stopped receipt enum is invalid')
    return {
      schemaVersion: 'tianwen.controlled-real-skill-lifecycle.v1',
      status: 'stopped',
      evidence,
      activityDigest,
      completedStage: receipt.completedStage as typeof STOPPED_STAGES[number],
      reasonCode: receipt.reasonCode as typeof STOPPED_REASON_CODES[number],
      completedRoles: completedRoles(receipt.completedRoles),
    }
  }

  exactKeys(receipt, [
    'schemaVersion', 'status', 'evidence', 'digests', 'mechanism', 'counts',
    'pointer', 'isolation',
  ])
  const digests = record(receipt.digests)
  exactKeys(digests, [
    'activity', 'installedArchive', 'manifest', 'protocol', 'evaluation',
    'shadow', 'transitionSet', 'finalPointer',
  ])
  const preparedDigests = {
    activity: digest(digests.activity),
    installedArchive: digest(digests.installedArchive),
    manifest: digest(digests.manifest),
    protocol: digest(digests.protocol),
    evaluation: digest(digests.evaluation),
    shadow: digest(digests.shadow),
    transitionSet: digest(digests.transitionSet),
    finalPointer: digest(digests.finalPointer),
  }
  if (
    preparedDigests.activity !== expected.manifestDigest ||
    preparedDigests.manifest !== expected.manifestDigest ||
    preparedDigests.installedArchive !== expected.installedArchiveDigest
  ) throw new TypeError('controlled lifecycle success receipt does not match preflight')
  const mechanism = exactValue(receipt.mechanism, {
    evaluation: 'pass',
    evaluationReason: 'all-gates-passed',
    shadow: 'pass',
    shadowEligibility: 'eligible-for-isolated-test-promotion',
    transitions: { promote: 'verified', rollback: 'verified', restore: 'verified' },
  } as const)
  const counts = record(receipt.counts)
  exactKeys(counts, [
    'formalSessions', 'roles', 'modelRequests', 'toolCalls',
    'acceptanceEvidence',
  ])
  if (counts.formalSessions !== 25 || counts.acceptanceEvidence !== 20) {
    throw new TypeError('controlled lifecycle success counts are invalid')
  }
  const roles = exactValue(counts.roles, {
    seedRuns: 2, evaluationArms: 10, evaluators: 5, shadowRuns: 5,
    transitions: 3,
  } as const)
  const modelRequests = counter(counts.modelRequests)
  const toolCalls = counter(counts.toolCalls)
  const pointer = record(receipt.pointer)
  exactKeys(pointer, ['revision', 'versionDigest'])
  if (pointer.revision !== 4) {
    throw new TypeError('controlled lifecycle final pointer revision is invalid')
  }
  const preparedPointer = { revision: 4 as const, versionDigest: digest(pointer.versionDigest) }
  const isolation = exactValue(receipt.isolation, {
    ordinaryRootSkillUnchanged: true,
    legacyChampionUnchanged: true,
    otherControlledScopesUnchanged: true,
    realProductDataUntouched: true,
  } as const)
  return {
    schemaVersion: 'tianwen.controlled-real-skill-lifecycle.v1',
    status: 'passed',
    evidence,
    digests: preparedDigests,
    mechanism,
    counts: {
      formalSessions: 25,
      roles,
      modelRequests,
      toolCalls,
      acceptanceEvidence: 20,
    },
    pointer: preparedPointer,
    isolation,
  }
}

export function readControlledLifecycleManifest(
  manifestPathInput: string,
  expectedDigest?: `sha256:${string}`,
): PreparedControlledLifecycleManifest {
  const manifestPath = normalizedAbsolute(manifestPathInput)
  const stat = lstatSync(manifestPath)
  if (!stat.isFile() || stat.size > CONTROLLED_LIFECYCLE_MANIFEST_LIMIT_BYTES) {
    throw new TypeError('controlled lifecycle manifest must be a bounded regular file')
  }
  const bytes = readFileSync(manifestPath)
  let parsed: unknown
  try { parsed = JSON.parse(bytes.toString('utf8')) as unknown } catch {
    throw new TypeError('controlled lifecycle manifest must be readable JSON')
  }
  const source = record(parsed)
  exactKeys(source, [
    'schemaVersion', 'activityLabel', 'evidence', 'installedArchiveDigest',
    'standingAuthorizationDigest', 'roots', 'execution', 'skills', 'tasks',
  ])
  if (
    source.schemaVersion !== 'tianwen.controlled-real-skill-lifecycle-manifest.v1' ||
    typeof source.activityLabel !== 'string' || !ACTIVITY_LABEL.test(source.activityLabel) ||
    typeof source.installedArchiveDigest !== 'string' || !SHA256.test(source.installedArchiveDigest) ||
    source.standingAuthorizationDigest !== STANDING_AUTHORIZATION_DIGEST
  ) throw new TypeError('controlled lifecycle manifest fixed fields are invalid')

  const roots = record(source.roots)
  exactKeys(roots, ['dataDir', 'operationRoot', 'sessionsRoot', 'evolutionRoot'])
  const dataDir = normalizedAbsolute(roots.dataDir)
  const operationRoot = childPath(roots.operationRoot, dataDir)
  if (
    normalizedAbsolute(roots.sessionsRoot) !== join(dataDir, 'dsh-home', 'sessions') ||
    normalizedAbsolute(roots.evolutionRoot) !== join(dataDir, 'state', 'evolution') ||
    !strictChild(operationRoot, manifestPath)
  ) throw new TypeError('controlled lifecycle roots are invalid')

  const evidence = exactValue(source.evidence, {
    source: 'configured-provider-capable',
    environment: 'development-only',
    defect: 'synthetic-defect',
    naturalUserEvidence: 'not-claimed',
    externalUserEvidence: 'not-claimed',
  } as const)
  const execution = exactValue(source.execution, {
    dshVersion: '0.1.0-rc.7',
    providerId: 'deepseek-official',
    modelId: 'deepseek-v4-pro',
    retryPolicy: { mode: 'normal', maxRetries: 0 },
    allowedTools: [
      'skill', 'record_architecture_decision', 'verify_architecture_decision',
    ],
    evaluatorTool: 'submit_blind_evaluation',
    stopContract: { maxToolCalls: 6, maxElapsedMs: 180_000 },
    evaluatorMaterialContract: {
      schemaVersion: 'tianwen.controlled-evaluator-material-contract.v1',
      source: 'recorded-decision-submission',
      maxUtf8Bytes: 4_096,
    },
  } as const)
  const skills = record(source.skills)
  exactKeys(skills, ['parent', 'candidate'])
  const preparedSkills = {
    parent: exactValue(skills.parent, PARENT_SKILL),
    candidate: exactValue(skills.candidate, CANDIDATE_SKILL),
  }
  const tasks = record(source.tasks)
  exactKeys(tasks, ['seeds', 'evaluations', 'shadows', 'transitions'])
  const seeds = fixedArray(tasks.seeds, SEED_ROWS.length)
    .map((task, index) => parseSingleTask(task, SEED_ROWS[index]!, operationRoot))
  const evaluations = fixedArray(tasks.evaluations, EVALUATION_ROWS.length)
    .map((task, index) => parseEvaluationTask(task, EVALUATION_ROWS[index]!, operationRoot))
  const shadows = fixedArray(tasks.shadows, SHADOW_ROWS.length)
    .map((task, index) => parseSingleTask(task, SHADOW_ROWS[index]!, operationRoot))
  const transitions = fixedArray(tasks.transitions, TRANSITION_ROWS.length)
    .map((task, index) => parseTransitionTask(task, TRANSITION_ROWS[index]!, operationRoot))

  const sessionIds = [
    ...seeds.map(task => task.sessionId),
    ...evaluations.flatMap(task => [
      task.baselineSessionId, task.candidateSessionId, task.evaluatorSessionId,
    ]),
    ...shadows.map(task => task.sessionId),
    ...transitions.map(task => task.sessionId),
  ]
  if (sessionIds.length !== 25 || new Set(sessionIds).size !== 25) {
    throw new TypeError('controlled lifecycle Sessions must be 25 distinct ids')
  }
  const workspaceRoots = [
    ...seeds.map(task => task.workspaceRoot),
    ...evaluations.flatMap(task => [task.baselineWorkspaceRoot, task.candidateWorkspaceRoot]),
    ...shadows.map(task => task.workspaceRoot),
    ...transitions.map(task => task.workspaceRoot),
  ]
  const workspaceIdentities = workspaceRoots.map(path =>
    process.platform === 'win32' ? path.toLowerCase() : path,
  )
  const overlaps = workspaceIdentities.some((left, leftIndex) =>
    workspaceIdentities.some((right, rightIndex) =>
      leftIndex < rightIndex && (
        left === right || strictChild(left, right) || strictChild(right, left)
      ),
    ),
  )
  if (workspaceRoots.length !== 20 || overlaps) {
    throw new TypeError('controlled lifecycle workspaces must be isolated')
  }
  const manifest: ControlledLifecycleManifest = {
    schemaVersion: 'tianwen.controlled-real-skill-lifecycle-manifest.v1',
    activityLabel: source.activityLabel,
    evidence,
    installedArchiveDigest: source.installedArchiveDigest as `sha256:${string}`,
    standingAuthorizationDigest: STANDING_AUTHORIZATION_DIGEST,
    roots: {
      dataDir,
      operationRoot,
      sessionsRoot: join(dataDir, 'dsh-home', 'sessions'),
      evolutionRoot: join(dataDir, 'state', 'evolution'),
    },
    execution,
    skills: preparedSkills,
    tasks: { seeds, evaluations, shadows, transitions },
  }
  const manifestDigest = canonicalEvidenceDigest(manifest)
  if (expectedDigest !== undefined && manifestDigest !== expectedDigest) {
    throw new TypeError('controlled lifecycle manifest digest changed after preflight')
  }
  return { manifest, manifestDigest, sessionIds }
}
