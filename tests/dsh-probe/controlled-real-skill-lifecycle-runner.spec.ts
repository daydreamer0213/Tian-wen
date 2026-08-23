import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DynamicCordisRunnerService,
  ScriptedAdapter,
  SkillRegistry,
  applySkillTool,
  mountPersistentHarness,
  textResponse,
  toolCallResponse,
} from '@tianwen/dsh-compat'
import type { StreamChunk } from '@tianwen/dsh-compat'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import {
  parseControlledLifecycleChildReceipt,
  readControlledLifecycleManifest,
} from '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-contract.js'

const roots: string[] = []

const parentSkill = {
  name: 'tianwen-controlled-architecture-decision-v01',
  description: 'Choose a bounded Tianwen architecture decision from frozen options.',
  whenToUse: 'When a controlled Tianwen task asks for one architecture choice and a concise reason.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: [
    '# Interface-first Tianwen architecture decision',
    '',
    'For an architecture task, choose the option most directly expressible through the currently visible',
    'interface. If the product meaning would require an identity or contract that the interface does not',
    'already expose, collapse that meaning into the nearest interface-shaped state. If no direct interface',
    'exists, prefer Tianwen-owned coordination around the available interface. Do not let broader product',
    'design override the interface-shaped choice.',
    '',
    'Use `record_architecture_decision` exactly once, then call `verify_architecture_decision` exactly once.',
    'After verifier feedback, do not change the choice; finish with the selected option and one concise reason.',
  ].join('\n'),
} as const

const candidateSkill = {
  ...parentSkill,
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
    'After verifier feedback, do not change the choice; finish with the selected option and one concise reason.',
  ].join('\n'),
} as const

class NoRetryScriptedAdapter extends ScriptedAdapter {
  constructor(script: readonly (readonly StreamChunk[] | Error)[]) {
    super(script.map(entry => Array.isArray(entry) ? [...entry] : entry))
  }

  override providerRetryPolicy() {
    return {
      mode: 'normal' as const,
      maxRetries: 0,
      retryableCodes: [],
      initialDelayMs: 500,
      maxDelayMs: 10_000,
      jitterRatio: 0.1,
    }
  }
}

function taskText(taskId: string) {
  return {
    goal: `Choose the frozen architecture option for ${taskId}.`,
    input: `Controlled architecture case ${taskId}.`,
  }
}

function fixtureRoot(name: string): string {
  const root = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-v0.1-real-operation-fixtures',
    'controlled-real-skill-lifecycle-runner',
    name,
  )
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  roots.push(root)
  return root
}

function validManifest(dataDir: string, operationRoot: string) {
  const workspace = (name: string) => join(operationRoot, 'workspaces', name)
  return {
    schemaVersion: 'tianwen.controlled-real-skill-lifecycle-manifest.v1',
    activityLabel: 'tianwen-v0.1-controlled-real-activity-01',
    evidence: {
      source: 'configured-provider-capable',
      environment: 'development-only',
      defect: 'synthetic-defect',
      naturalUserEvidence: 'not-claimed',
      externalUserEvidence: 'not-claimed',
    },
    installedArchiveDigest: `sha256:${'a'.repeat(64)}`,
    standingAuthorizationDigest: 'sha256:90ed036e3761de4b9da9f31822fdbabe800c2085001a9c94d94214f5379d0fb6',
    roots: {
      dataDir,
      operationRoot,
      sessionsRoot: join(dataDir, 'dsh-home', 'sessions'),
      evolutionRoot: join(dataDir, 'state', 'evolution'),
    },
    execution: {
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
        source: 'final-completed-assistant-text',
        maxUtf8Bytes: 4_096,
      },
    },
    skills: { parent: parentSkill, candidate: candidateSkill },
    tasks: {
      seeds: [
        {
          taskId: 'seed-task:d1', ...taskText('D1'),
          workspaceRoot: workspace('seed-d1'),
          hiddenExpectedChoice: 'thin-run-binding',
          sessionId: 'session:controlled-real:seed-d1',
        },
        {
          taskId: 'seed-task:d2', ...taskText('D2'),
          workspaceRoot: workspace('seed-d2'),
          hiddenExpectedChoice: 'reuse-dsh-agent-loop',
          sessionId: 'session:controlled-real:seed-d2',
        },
      ],
      evaluations: [
        ['t1', 'original-problem', 'thin-run-binding'],
        ['t2', 'adjacent-transfer', 'node-package-script-transport'],
        ['t3', 'regression', 'reuse-dsh-agent-tool-seams'],
        ['t4', 'counterexample', 'stdlib-sort-no-governance'],
        ['t5', 'safety-authorization', 'finite-source-safe-receipt'],
      ].map(([name, taskType, hiddenExpectedChoice]) => ({
        taskId: `eval-task:${name}`,
        taskType,
        ...taskText(name!.toUpperCase()),
        baselineWorkspaceRoot: workspace(`evaluation-${name}-baseline`),
        candidateWorkspaceRoot: workspace(`evaluation-${name}-candidate`),
        hiddenExpectedChoice,
        baselineSessionId: `session:controlled-real:evaluation-${name}-baseline`,
        candidateSessionId: `session:controlled-real:evaluation-${name}-candidate`,
        evaluatorSessionId: `session:controlled-real:evaluation-${name}-evaluator`,
      })),
      shadows: [
        ['s1', 'pure-text-parent-snapshot'],
        ['s2', 'agent-scoped-candidate'],
        ['s3', 'public-status-private-ledger'],
        ['s4', 'isolate-build-output-identity'],
        ['s5', 'standing-authorization-constant'],
      ].map(([name, hiddenExpectedChoice]) => ({
        taskId: `shadow-task:${name}`,
        ...taskText(name!.toUpperCase()),
        workspaceRoot: workspace(`shadow-${name}`),
        hiddenExpectedChoice,
        sessionId: `session:controlled-real:shadow-${name}`,
      })),
      transitions: [
        ['promote', 'reuse-public-session-id'],
        ['rollback', 'standard-json-parser'],
        ['restore', 'reuse-dsh-tool-guard'],
      ].map(([kind, hiddenExpectedChoice]) => ({
        taskId: `transition-task:${kind}`,
        kind,
        ...taskText(kind!),
        workspaceRoot: workspace(`transition-${kind}`),
        hiddenExpectedChoice,
        sessionId: `session:controlled-real:transition-${kind}`,
      })),
    },
  }
}

function seedScript() {
  return [
    toolCallResponse('seed-d1-skill', 'skill', { name: parentSkill.name }),
    toolCallResponse('seed-d1-record', 'record_architecture_decision', {
      taskId: 'seed-task:d1',
      choice: 'session-as-run',
      explanation: 'Use the most direct Session-shaped interface.',
    }),
    toolCallResponse('seed-d1-verify', 'verify_architecture_decision', {
      taskId: 'seed-task:d1',
    }),
    textResponse('Choose session-as-run because the Session interface is direct.'),
    toolCallResponse('seed-d2-skill', 'skill', { name: parentSkill.name }),
    toolCallResponse('seed-d2-record', 'record_architecture_decision', {
      taskId: 'seed-task:d2',
      choice: 'reuse-dsh-agent-loop',
      explanation: 'Reuse the already available ordinary DSH loop.',
    }),
    toolCallResponse('seed-d2-verify', 'verify_architecture_decision', {
      taskId: 'seed-task:d2',
    }),
    textResponse('Choose reuse-dsh-agent-loop because the public loop is sufficient.'),
  ]
}

function decisionScript(id: string, taskId: string, choice: string) {
  return [
    toolCallResponse(`${id}-skill`, 'skill', { name: parentSkill.name }),
    toolCallResponse(`${id}-record`, 'record_architecture_decision', {
      taskId,
      choice,
      explanation: `Choose ${choice} from the frozen task evidence.`,
    }),
    toolCallResponse(`${id}-verify`, 'verify_architecture_decision', { taskId }),
    textResponse(`Choose ${choice} from the frozen task evidence.`),
  ]
}

function fullLifecycleScript() {
  const evaluations = [
    ['t1', 'thin-run-binding', 'session-as-run'],
    ['t2', 'node-package-script-transport', 'generic-shell-transport'],
    ['t3', 'reuse-dsh-agent-tool-seams', 'reuse-dsh-agent-tool-seams'],
    ['t4', 'stdlib-sort-no-governance', 'stdlib-sort-no-governance'],
    ['t5', 'finite-source-safe-receipt', 'finite-source-safe-receipt'],
  ] as const
  const shadows = [
    ['s1', 'pure-text-parent-snapshot'],
    ['s2', 'agent-scoped-candidate'],
    ['s3', 'public-status-private-ledger'],
    ['s4', 'isolate-build-output-identity'],
    ['s5', 'standing-authorization-constant'],
  ] as const
  const transitions = [
    ['promote', 'reuse-public-session-id'],
    ['rollback', 'standard-json-parser'],
    ['restore', 'reuse-dsh-tool-guard'],
  ] as const
  const scores = {
    relevance: 4,
    correctnessReasoning: 4,
    clarityUsability: 4,
    scopeRestraint: 4,
  }
  return [
    ...seedScript(),
    ...evaluations.flatMap(([name, expected, baseline]) => [
      ...decisionScript(`eval-${name}-baseline`, `eval-task:${name}`, baseline),
      ...decisionScript(`eval-${name}-candidate`, `eval-task:${name}`, expected),
    ]),
    ...evaluations.map(([name]) => toolCallResponse(
      `eval-${name}-blind-score`,
      'submit_blind_evaluation',
      {
        status: 'scored',
        insufficientMaterial: false,
        reasonCode: 'score-submitted',
        scores: { x: scores, y: scores },
      },
    )),
    ...shadows.flatMap(([name, expected]) =>
      decisionScript(`shadow-${name}`, `shadow-task:${name}`, expected)),
    ...transitions.flatMap(([kind, expected]) =>
      decisionScript(`transition-${kind}`, `transition-task:${kind}`, expected)),
  ]
}

async function mountRunner(
  name: string,
  script = seedScript(),
  options: {
    readonly credentialConfigured?: boolean
    readonly loaderAvailable?: boolean
    readonly sessionRootMismatch?: boolean
    readonly evolutionRootMismatch?: boolean
  } = {},
) {
  const root = fixtureRoot(name)
  const dataDir = join(root, 'product')
  const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
  const sessionsRoot = join(dataDir, 'dsh-home', 'sessions')
  const evolutionRoot = join(dataDir, 'state', 'evolution')
  const manifest = validManifest(dataDir, operationRoot)
  for (const task of [
    ...manifest.tasks.seeds.map(item => ({ root: item.workspaceRoot, text: item.input })),
    ...manifest.tasks.evaluations.flatMap(item => [
      { root: item.baselineWorkspaceRoot, text: item.input },
      { root: item.candidateWorkspaceRoot, text: item.input },
    ]),
    ...manifest.tasks.shadows.map(item => ({ root: item.workspaceRoot, text: item.input })),
    ...manifest.tasks.transitions.map(item => ({ root: item.workspaceRoot, text: item.input })),
  ]) {
    mkdirSync(task.root, { recursive: true })
    writeFileSync(join(task.root, 'case.md'), `${task.text}\n`, 'utf8')
  }
  const manifestPath = join(operationRoot, 'manifest.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8')
  const prepared = readControlledLifecycleManifest(manifestPath)
  const harness = await mountPersistentHarness(
    options.sessionRootMismatch === true ? join(root, 'wrong-sessions') : sessionsRoot,
    [],
  )
  await harness.ctx.plugin(SkillRegistry)
  await harness.ctx.plugin(applySkillTool)
  await harness.ctx.plugin(DynamicCordisRunnerService, {})
  const adapter = new NoRetryScriptedAdapter(script)
  harness.ctx.llm.registerAdapter(['deepseek-official'], adapter)
  const selection = {
    provider: 'deepseek-official',
    model: 'deepseek-v4-pro',
  }
  harness.ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ ...selection }),
  })
  harness.ctx.provide('credentials', {
    describe: async () => ({
      configured: options.credentialConfigured !== false,
      writable: false,
    }),
  })
  if (options.loaderAvailable !== false) {
    harness.ctx.provide('loader', { await: async () => undefined })
  }
  await applyRuntime(harness.ctx, {
    evolutionRoot: options.evolutionRootMismatch === true
      ? join(root, 'wrong-evolution')
      : evolutionRoot,
  })
  return { adapter, harness, manifest, manifestPath, prepared, root, selection }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('controlled real Skill lifecycle runner', () => {
  it('exposes the installed controlled lifecycle runner', async () => {
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { apply?: unknown }

    expect(runner.apply).toBeTypeOf('function')
    const source = readFileSync(
      resolve('packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/ScriptedAdapter|agent-loop-testkit|fixture queue/u)
  })

  it('emits one exact safe passed receipt after the complete one-shot lifecycle', async () => {
    const mounted = await mountRunner('full-one-shot-red', fullLifecycleScript())
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as {
      apply(
        ctx: typeof mounted.harness.ctx,
        config: { manifestPath: string, manifestDigest: string },
      ): void
    }
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const originalGet = mounted.harness.ctx.get.bind(mounted.harness.ctx)
    let resolveExit!: (code: number) => void
    const exited = new Promise<number>(resolve => { resolveExit = resolve })
    vi.spyOn(mounted.harness.ctx as never, 'get').mockImplementation((service: string) =>
      service === 'appExit' ? resolveExit : originalGet(service as never))
    try {
      expect(existsSync(mounted.manifest.roots.sessionsRoot)).toBe(false)
      runner.apply(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })
      expect(await exited).toBe(0)
      expect(stdout).toHaveBeenCalledTimes(1)
      expect(stderr).not.toHaveBeenCalled()
      const line = String(stdout.mock.calls[0]?.[0])
      const receipt = parseControlledLifecycleChildReceipt(line, '', {
        manifestDigest: mounted.prepared.manifestDigest,
        installedArchiveDigest: mounted.manifest.installedArchiveDigest,
      })
      expect(receipt).toMatchObject({
        status: 'passed',
        counts: {
          formalSessions: 25,
          acceptanceEvidence: 20,
        },
        pointer: { revision: 4 },
      })
      if (receipt.status !== 'passed') throw new Error('expected passed receipt')
      const inspections = await Promise.all(mounted.prepared.sessionIds.map(sessionId =>
        mounted.harness.ctx.sessionPersistence.inspect(sessionId),
      ))
      expect(receipt.counts.modelRequests).toBe(inspections.flatMap(item => item.events)
        .filter(event => event.type === 'step/start').length)
      expect(receipt.counts.toolCalls).toBe(inspections.flatMap(item => item.events)
        .filter(event => event.type === 'tool/call').length)
      for (const forbidden of [
        mounted.root,
        mounted.manifest.tasks.evaluations[0]!.input,
        mounted.manifest.tasks.evaluations[0]!.baselineSessionId,
        parentSkill.content,
        candidateSkill.content,
      ]) expect(line).not.toContain(forbidden)
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(25)
      expect(existsSync(mounted.manifest.roots.sessionsRoot)).toBe(true)
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('emits one finite stopped receipt without starting an Agent on preflight failure', async () => {
    const mounted = await mountRunner('safe-stopped-receipt', seedScript(), {
      credentialConfigured: false,
    })
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { apply(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): void }
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const originalGet = mounted.harness.ctx.get.bind(mounted.harness.ctx)
    let resolveExit!: (code: number) => void
    const exited = new Promise<number>(resolve => { resolveExit = resolve })
    vi.spyOn(mounted.harness.ctx as never, 'get').mockImplementation((service: string) =>
      service === 'appExit' ? resolveExit : originalGet(service as never))
    try {
      runner.apply(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })
      expect(await exited).toBe(1)
      expect(stdout).toHaveBeenCalledTimes(1)
      expect(stderr).not.toHaveBeenCalled()
      const line = String(stdout.mock.calls[0]?.[0])
      expect(parseControlledLifecycleChildReceipt(line, '', {
        manifestDigest: mounted.prepared.manifestDigest,
        installedArchiveDigest: mounted.manifest.installedArchiveDigest,
      })).toEqual({
        schemaVersion: 'tianwen.controlled-real-skill-lifecycle.v1',
        status: 'stopped',
        evidence: mounted.manifest.evidence,
        activityDigest: mounted.prepared.manifestDigest,
        completedStage: 'preflight',
        reasonCode: 'credential-missing',
        completedRoles: {
          seedRuns: 0,
          evaluationArms: 0,
          evaluators: 0,
          shadowRuns: 0,
          transitions: 0,
        },
      })
      expect(line).not.toContain(mounted.root)
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.agents.list()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('runs two ordinary seed Agents and records the governed Candidate chain', async () => {
    const mounted = await mountRunner('two-seeds', fullLifecycleScript())
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as {
      runControlledLifecycle?: (
        ctx: typeof mounted.harness.ctx,
        config: { manifestPath: string, manifestDigest: string },
      ) => Promise<{
        status: string
        counts: { modelRequests: number, toolCalls: number, acceptanceEvidence: number }
        pointer: { revision: number, versionDigest: string }
      }>
    }
    try {
      expect(runner.runControlledLifecycle).toBeTypeOf('function')
      const result = await runner.runControlledLifecycle!(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })

      expect(result).toMatchObject({
        status: 'passed',
        counts: { acceptanceEvidence: 20 },
        pointer: { revision: 4 },
      })
      expect(result.counts.modelRequests).toBe(mounted.adapter.requests.length)
      expect(mounted.adapter.requests.every(request =>
        request.provider === 'deepseek-official'
        && request.model === 'deepseek-v4-pro'
        && request.maxTokens === undefined)).toBe(true)
      const expectedSessionOrder = [
        ...mounted.manifest.tasks.seeds.map(task => task.sessionId),
        ...mounted.manifest.tasks.evaluations.flatMap(task => [
          task.baselineSessionId,
          task.candidateSessionId,
        ]),
        ...mounted.manifest.tasks.evaluations.map(task => task.evaluatorSessionId),
        ...mounted.manifest.tasks.shadows.map(task => task.sessionId),
        ...mounted.manifest.tasks.transitions.map(task => task.sessionId),
      ]
      const observedSessionOrder = mounted.adapter.requests.map(request => String(request.sessionId))
        .filter((sessionId, index, all) => index === 0 || sessionId !== all[index - 1])
      expect(observedSessionOrder).toEqual(expectedSessionOrder)
      const evaluatorSessionIds = new Set(mounted.manifest.tasks.evaluations
        .map(task => task.evaluatorSessionId))
      const evaluatorRequests = mounted.adapter.requests.filter(request =>
        evaluatorSessionIds.has(String(request.sessionId)))
      expect(evaluatorRequests).toHaveLength(5)
      expect(evaluatorRequests.every(request =>
        request.tools?.map(tool => tool.name).join(',') === 'submit_blind_evaluation')).toBe(true)
      const evaluatorMessages = JSON.stringify(evaluatorRequests.map(request => request.messages))
      expect(evaluatorMessages).not.toContain(parentSkill.name)
      expect(evaluatorMessages).not.toContain(parentSkill.content)
      expect(evaluatorMessages).not.toContain(candidateSkill.content)
      for (const request of [mounted.adapter.requests[0], mounted.adapter.requests[4]]) {
        const serialized = JSON.stringify(request)
        for (const task of [
          ...mounted.manifest.tasks.seeds,
          ...mounted.manifest.tasks.evaluations,
          ...mounted.manifest.tasks.shadows,
          ...mounted.manifest.tasks.transitions,
        ]) expect(serialized).not.toContain(task.hiddenExpectedChoice)
      }
      expect(JSON.stringify(mounted.adapter.requests[0]?.messages))
        .toContain('seed-task:d1')
      expect(JSON.stringify(mounted.adapter.requests[4]?.messages))
        .toContain('seed-task:d2')
      for (const index of [0, 4]) {
        const messages = JSON.stringify(mounted.adapter.requests[index]?.messages)
        expect(messages).toContain(parentSkill.name)
        expect(messages).toContain('record_architecture_decision')
        expect(messages).toContain('verify_architecture_decision')
      }
      const persistedSessionIds = (await mounted.harness.ctx.sessionPersistence.list())
        .map(header => String(header.id))
      expect(persistedSessionIds).toHaveLength(25)
      expect(persistedSessionIds.filter(id => id.includes(':seed-')).toSorted())
        .toEqual(mounted.manifest.tasks.seeds.map(task => task.sessionId).toSorted())
      expect(mounted.harness.ctx.tianwenEvolution.listLearningTickets()).toHaveLength(1)
      expect(mounted.harness.ctx.tianwenEvolution.listLearningCases()).toHaveLength(1)
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toHaveLength(1)
      const protocol = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvalProtocols()[0]
      expect(protocol).toMatchObject({ provenance: 'pre-candidate' })
      expect(protocol?.protocol.tasks).toHaveLength(5)
      expect(protocol?.protocol.execution).toMatchObject({
        dshVersion: '0.1.0-rc.7',
        providerId: 'deepseek-official',
        modelId: 'deepseek-v4-pro',
      })
      const evaluation = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluations()[0]
      expect(evaluation?.tasks).toHaveLength(5)
      for (const [index, task] of mounted.manifest.tasks.evaluations.entries()) {
        const snapshot = {
          schemaVersion: 'tianwen.controlled-workspace-snapshot.v1',
          entries: [{
            relativePath: 'case.md',
            contentDigest: `sha256:${createHash('sha256').update(`${task.input}\n`).digest('hex')}`,
            size: Buffer.byteLength(`${task.input}\n`, 'utf8'),
          }],
        }
        const authorization = {
          standingAuthorizationDigest: mounted.manifest.standingAuthorizationDigest,
          taskId: task.taskId,
        }
        const verifierContract = {
          toolName: 'verify_architecture_decision',
          arguments: { taskId: task.taskId },
        }
        expect(protocol?.protocol.tasks[index]).toMatchObject({
          taskId: task.taskId,
          goalDigest: sha256(task.goal),
          inputDigest: sha256(task.input),
          workspaceSnapshotDigest: sha256(snapshot),
          authorizationDigest: sha256(authorization),
          verifierContractDigest: sha256(verifierContract),
          stopConditionDigest: sha256({ terminal: 'completed-final-assistant-text' }),
          evaluatorMaterialContractDigest: sha256(mounted.manifest.execution.evaluatorMaterialContract),
          acceptanceSubjectDigest: sha256(verifierContract.arguments),
          allowedTools: [...mounted.manifest.execution.allowedTools].toSorted(),
          stopContract: mounted.manifest.execution.stopContract,
        })
      }
      const allocatedSessions = evaluation!.tasks.flatMap(task => [
        task.baseline.sessionId, task.candidate.sessionId, task.evaluatorSessionId,
      ])
      expect(allocatedSessions).toHaveLength(15)
      expect(new Set(allocatedSessions).size).toBe(15)
      const objectives = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluationObjectives(evaluation!.evaluationId)
      expect(objectives.map(item => item.comparison))
        .toEqual(['candidate-better', 'candidate-better', 'tie', 'tie', 'tie'])
      expect(objectives.every(item => item.objectiveVerdict === 'pass')).toBe(true)
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluatorObservations(evaluation!.evaluationId)).toHaveLength(5)
      expect(mounted.harness.ctx.tianwenEvolution
        .getControlledSkillEvaluationResult(evaluation!.evaluationId)).toMatchObject({
          mechanismVerdict: 'pass',
          reasonCode: 'all-gates-passed',
          baselineTotal: 80,
          candidateTotal: 80,
        })
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillShadowResults()).toMatchObject([{
          mechanismVerdict: 'pass',
          promotionEligibility: 'eligible-for-isolated-test-promotion',
          runs: expect.arrayContaining([
            expect.objectContaining({ outcome: 'met' }),
          ]),
        }])
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillTransitions().map(item => item.kind))
        .toEqual(['promote', 'rollback', 'restore'])
      const pointer = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillScopePointers()[0]!
      expect(result.pointer.versionDigest)
        .toBe(`sha256:${pointer.activeVersionId.slice('skill-version:'.length)}`)
      const candidate = mounted.harness.ctx.tianwenEvolution.listSkillCandidates()[0]
      expect(candidate?.payload.content).toBe(candidateSkill.content)
      const learningCase = mounted.harness.ctx.tianwenEvolution.listLearningCases()[0]
      const seedUses = mounted.harness.ctx.tianwenEvolution.listRunSkillUses()
        .filter(use => mounted.manifest.tasks.seeds.some(task => task.sessionId === use.sessionId))
      const counterevidenceRunId = seedUses.find(use =>
        use.sessionId === mounted.manifest.tasks.seeds[1]!.sessionId)?.runId
      expect(learningCase?.counterevidence.map(item => item.runId))
        .toEqual([counterevidenceRunId])
      const inspected = await Promise.all(mounted.manifest.tasks.seeds.map(task =>
        mounted.harness.ctx.sessionPersistence.inspect(task.sessionId),
      ))
      expect(inspected.flatMap(item => item.events)
        .filter(event => event.type === 'tool/call')).toHaveLength(6)
      expect(inspected.flatMap(item => item.events)
        .filter(event => event.type === 'step/start')).toHaveLength(8)
      const uses = mounted.harness.ctx.tianwenEvolution.listRunSkillUses()
      expect(uses).toHaveLength(20)
      expect(seedUses).toHaveLength(2)
      expect(new Set(seedUses.map(use => use.acceptanceEvidenceId)).size).toBe(2)
      expect(mounted.harness.ctx.tianwenEvolution.listEvents()).toEqual([])
      const eventTypes = readFileSync(
        join(mounted.manifest.roots.evolutionRoot, 'ledger.jsonl'),
        'utf8',
      ).trim().split('\n').map(line => (JSON.parse(line) as { type: string }).type)
      expect(eventTypes.indexOf('controlled-skill-eval-protocol-frozen'))
        .toBeLessThan(eventTypes.indexOf('learning-candidate-recorded'))
      const replaySnapshot = {
        requests: mounted.adapter.requests.length,
        sessions: (await mounted.harness.ctx.sessionPersistence.list()).length,
        ledger: readFileSync(
          join(mounted.manifest.roots.evolutionRoot, 'ledger.jsonl'),
          'utf8',
        ),
      }
      await expect(runner.runControlledLifecycle!(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'session-not-fresh' })
      expect(mounted.adapter.requests).toHaveLength(replaySnapshot.requests)
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(
        replaySnapshot.sessions,
      )
      expect(readFileSync(
        join(mounted.manifest.roots.evolutionRoot, 'ledger.jsonl'),
        'utf8',
      )).toBe(replaySnapshot.ledger)
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('stops after the first rejected B/C pair without starting an evaluator', async () => {
    const mounted = await mountRunner('evaluation-terminal-stop', [
      ...seedScript(),
      ...decisionScript('eval-t1-baseline-stop', 'eval-task:t1', 'session-as-run'),
      ...decisionScript('eval-t1-candidate-stop', 'eval-task:t1', 'session-as-run'),
    ])
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({
        code: 'evaluation-failed',
        completedStage: 'evaluation',
        completedRoles: {
          seedRuns: 2,
          evaluationArms: 2,
          evaluators: 0,
          shadowRuns: 0,
          transitions: 0,
        },
      })
      expect(mounted.adapter.requests).toHaveLength(16)
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(4)
      const evaluationId = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluations()[0]!.evaluationId
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluationObjectives(evaluationId)).toHaveLength(1)
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluatorObservations(evaluationId)).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillTransitions()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not count a persisted failed arm Session as a completed role', async () => {
    const mounted = await mountRunner('first-arm-provider-stop', [
      ...seedScript(),
      new Error('raw first arm provider detail'),
    ])
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { apply(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): void }
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const originalGet = mounted.harness.ctx.get.bind(mounted.harness.ctx)
    let resolveExit!: (code: number) => void
    const exited = new Promise<number>(resolve => { resolveExit = resolve })
    vi.spyOn(mounted.harness.ctx as never, 'get').mockImplementation((service: string) =>
      service === 'appExit' ? resolveExit : originalGet(service as never))
    try {
      runner.apply(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })
      expect(await exited).toBe(1)
      expect(stdout).toHaveBeenCalledTimes(1)
      const line = String(stdout.mock.calls[0]?.[0])
      expect(parseControlledLifecycleChildReceipt(line, '', {
        manifestDigest: mounted.prepared.manifestDigest,
        installedArchiveDigest: mounted.manifest.installedArchiveDigest,
      })).toMatchObject({
        status: 'stopped',
        completedStage: 'candidate',
        reasonCode: 'evaluation-failed',
        completedRoles: {
          seedRuns: 2,
          evaluationArms: 0,
          evaluators: 0,
          shadowRuns: 0,
          transitions: 0,
        },
      })
      expect(line).not.toContain('raw first arm provider detail')
      expect(mounted.adapter.requests).toHaveLength(9)
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(3)
      expect(mounted.harness.ctx.tianwenEvolution.listRunSkillUses()).toHaveLength(2)
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('binds verifier truth to the exact Agent task instead of a submitted taskId', async () => {
    const mounted = await mountRunner('cross-task-stop', [
      ...seedScript(),
      ...decisionScript('eval-t1-cross-task', 'eval-task:t2', 'node-package-script-transport'),
    ])
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'evaluation-failed' })
      expect(mounted.adapter.requests).toHaveLength(12)
      const sessions = (await mounted.harness.ctx.sessionPersistence.list())
        .map(header => String(header.id))
      expect(sessions).toContain(mounted.manifest.tasks.evaluations[0]!.baselineSessionId)
      expect(sessions).not.toContain(mounted.manifest.tasks.evaluations[0]!.candidateSessionId)
      expect(sessions).not.toContain(mounted.manifest.tasks.evaluations[1]!.baselineSessionId)
      const evaluationId = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluations()[0]!.evaluationId
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluationObjectives(evaluationId)).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not start Shadow after the first evaluator Provider failure', async () => {
    const mounted = await mountRunner('evaluator-stop', [
      ...fullLifecycleScript().slice(0, 48),
      new Error('raw evaluator provider detail'),
    ])
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      const error = await runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      }).then(() => undefined, cause => cause as {
        code?: string, completedStage?: string, message?: string,
      })
      expect(error).toMatchObject({ code: 'evaluator-failed', completedStage: 'evaluation' })
      expect(error?.message).not.toContain('raw evaluator provider detail')
      expect(mounted.adapter.requests).toHaveLength(49)
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillTransitions()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not initialize a pointer after the first Shadow rejection', async () => {
    const mounted = await mountRunner('shadow-stop', [
      ...fullLifecycleScript().slice(0, 53),
      ...decisionScript('shadow-s1-stop', 'shadow-task:s1', 'mutable-parent-object'),
    ])
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'shadow-failed', completedStage: 'shadow' })
      expect(mounted.adapter.requests).toHaveLength(57)
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillScopePointers()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillTransitions()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('recovers the pointer and does not start rollback after a rejected promote post-check', async () => {
    const mounted = await mountRunner('transition-stop', [
      ...fullLifecycleScript().slice(0, 73),
      ...decisionScript(
        'transition-promote-stop',
        'transition-task:promote',
        'private-session-replacement',
      ),
    ])
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'transition-failed', completedStage: 'shadow' })
      expect(mounted.adapter.requests).toHaveLength(77)
      const transitions = mounted.harness.ctx.tianwenEvolution.listControlledSkillTransitions()
      expect(transitions).toHaveLength(1)
      expect(mounted.harness.ctx.tianwenEvolution
        .getControlledSkillTransitionReceipt(transitions[0]!.transitionId))
        .toMatchObject({ state: 'recovered' })
      expect((await mounted.harness.ctx.sessionPersistence.list())
        .map(header => String(header.id)))
        .not.toContain(mounted.manifest.tasks.transitions[1]!.sessionId)
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it.each([
    ['B/C', 48, 12, 'candidate'],
    ['evaluator', 53, 17, 'evaluation'],
    ['Shadow', 73, 22, 'evaluators'],
  ] as const)(
    'revalidates the configured route after the %s stage before the next Agent',
    async (_label, requestCutoff, sessionCount, completedStage) => {
      const mounted = await mountRunner(
        `route-drift-${completedStage}`,
        fullLifecycleScript(),
      )
      const runner = await import(
        '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
      ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
        manifestPath: string, manifestDigest: string,
      }): Promise<unknown> }
      let requests = 0
      mounted.harness.ctx.on('llm/stream', (request, next) => {
        requests += 1
        if (requests === requestCutoff) mounted.selection.model = 'drifted-after-stage'
        return next()
      })
      try {
        await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
          manifestPath: mounted.manifestPath,
          manifestDigest: mounted.prepared.manifestDigest,
        })).rejects.toMatchObject({ code: 'selection-mismatch', completedStage })
        expect(mounted.adapter.requests).toHaveLength(requestCutoff)
        expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(sessionCount)
      } finally {
        await mounted.harness.ctx.fiber.dispose()
      }
    },
  )

  it('does not freeze a protocol or Candidate after a future workspace drifts', async () => {
    const mounted = await mountRunner('future-workspace-drift')
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as {
      runControlledLifecycle(
        ctx: typeof mounted.harness.ctx,
        config: { manifestPath: string, manifestDigest: string },
      ): Promise<unknown>
    }
    let changed = false
    mounted.harness.ctx.on('llm/stream', (request, next) => {
      if (!changed) {
        changed = true
        writeFileSync(
          join(mounted.manifest.tasks.evaluations[0]!.baselineWorkspaceRoot, 'case.md'),
          'changed after the first Agent started\n',
          'utf8',
        )
      }
      return next()
    })
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'workspace-drift' })
      expect(mounted.adapter.requests).toHaveLength(4)
      expect((await mounted.harness.ctx.sessionPersistence.list())
        .map(header => String(header.id)))
        .toEqual([mounted.manifest.tasks.seeds[0]!.sessionId])
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvalProtocols()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listLearningCases()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not start D2 after the configured model drifts during D1', async () => {
    const mounted = await mountRunner('selection-drift-after-d1')
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as {
      runControlledLifecycle(
        ctx: typeof mounted.harness.ctx,
        config: { manifestPath: string, manifestDigest: string },
      ): Promise<unknown>
    }
    let changed = false
    mounted.harness.ctx.on('llm/stream', (request, next) => {
      if (!changed) {
        changed = true
        mounted.selection.model = 'drifted-model'
      }
      return next()
    })
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'selection-mismatch' })
      expect(mounted.adapter.requests).toHaveLength(4)
      expect((await mounted.harness.ctx.sessionPersistence.list())
        .map(header => String(header.id)))
        .toEqual([mounted.manifest.tasks.seeds[0]!.sessionId])
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvalProtocols()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listLearningCases()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a missing credential reference before Agent or request activity', async () => {
    const mounted = await mountRunner('missing-credential', seedScript(), {
      credentialConfigured: false,
    })
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      expect(existsSync(mounted.manifest.roots.sessionsRoot)).toBe(false)
      expect(existsSync(join(mounted.manifest.roots.evolutionRoot, 'artifacts'))).toBe(true)
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'credential-missing' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listLearningSignals()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('requires the installed loader to settle before Agent activity', async () => {
    const mounted = await mountRunner('missing-loader', seedScript(), {
      loaderAvailable: false,
    })
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'services-unavailable' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listLearningSignals()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it.each([
    ['Session', { sessionRootMismatch: true }],
    ['Evolution', { evolutionRootMismatch: true }],
  ] as const)('rejects a mismatched %s service root before Agent activity', async (
    _label,
    options,
  ) => {
    const mounted = await mountRunner('mismatched-service-root', seedScript(), options)
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'root-drift' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listLearningSignals()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects an existing Session junction that escapes the product root', async () => {
    const mounted = await mountRunner('session-root-junction')
    const escaped = join(mounted.root, 'escaped-sessions')
    mkdirSync(escaped, { recursive: true })
    mkdirSync(join(mounted.manifest.roots.dataDir, 'dsh-home'), { recursive: true })
    symlinkSync(escaped, mounted.manifest.roots.sessionsRoot, 'junction')
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'root-drift' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a missing workspace without an Agent, request, or raw path error', async () => {
    const mounted = await mountRunner('missing-workspace')
    rmSync(mounted.manifest.tasks.evaluations[0]!.baselineWorkspaceRoot, {
      recursive: true,
      force: true,
    })
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      const error = await runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      }).then(() => undefined, cause => cause as { code?: string, message?: string })
      expect(error).toMatchObject({ code: 'workspace-drift' })
      expect(error?.message).not.toContain(mounted.root)
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listLearningSignals()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not create a Candidate when the Provider fails during the first seed', async () => {
    const mounted = await mountRunner('provider-failure', [
      new Error('provider-secret-sentinel'),
    ])
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as {
      runControlledLifecycle(
        ctx: typeof mounted.harness.ctx,
        config: { manifestPath: string, manifestDigest: string },
      ): Promise<unknown>
    }
    try {
      const error = await runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      }).then(() => undefined, cause => cause as { code?: string, message?: string })
      expect(error).toMatchObject({ code: 'seed-failed' })
      expect(error?.message).not.toContain('provider-secret-sentinel')
      expect(mounted.adapter.requests).toHaveLength(1)
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvalProtocols()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not create a Candidate when D1 closes met instead of not-met', async () => {
    const mounted = await mountRunner('wrong-seed-verdict', [
      toolCallResponse('seed-d1-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('seed-d1-record', 'record_architecture_decision', {
        taskId: 'seed-task:d1',
        choice: 'thin-run-binding',
        explanation: 'Use the governed Run binding.',
      }),
      toolCallResponse('seed-d1-verify', 'verify_architecture_decision', {
        taskId: 'seed-task:d1',
      }),
      textResponse('Choose thin-run-binding.'),
    ])
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'seed-failed' })
      expect(mounted.adapter.requests).toHaveLength(4)
      expect(mounted.harness.ctx.tianwenEvolution.listLearningTickets()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('keeps the first submission and rejects a second decision without a Candidate', async () => {
    const mounted = await mountRunner('second-decision', [
      toolCallResponse('seed-d1-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('seed-d1-record', 'record_architecture_decision', {
        taskId: 'seed-task:d1', choice: 'session-as-run', explanation: 'First choice.',
      }),
      toolCallResponse('seed-d1-record-again', 'record_architecture_decision', {
        taskId: 'seed-task:d1', choice: 'thin-run-binding', explanation: 'Replacement.',
      }),
      toolCallResponse('seed-d1-verify', 'verify_architecture_decision', {
        taskId: 'seed-task:d1',
      }),
      textResponse('Keep the first choice.'),
    ])
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'seed-failed' })
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toEqual([])
      const inspection = await mounted.harness.ctx.sessionPersistence
        .inspect(mounted.manifest.tasks.seeds[0]!.sessionId)
      expect(inspection.events.filter(event =>
        event.type === 'tool/call'
        && event.data.name === 'record_architecture_decision')).toHaveLength(2)
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not create a Candidate from mismatched verifier Evidence', async () => {
    const mounted = await mountRunner('evidence-mismatch', [
      toolCallResponse('seed-d1-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('seed-d1-record', 'record_architecture_decision', {
        taskId: 'seed-task:d1', choice: 'session-as-run', explanation: 'First choice.',
      }),
      toolCallResponse('seed-d1-verify', 'verify_architecture_decision', {
        taskId: 'seed-task:d2',
      }),
      textResponse('Finish after mismatched verification.'),
    ])
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'seed-failed' })
      expect(mounted.harness.ctx.tianwenEvolution.listLearningTickets()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not create formal outcome or Candidate facts when Session flush fails', async () => {
    const mounted = await mountRunner('flush-failure')
    vi.spyOn(mounted.harness.ctx.sessions, 'flush').mockResolvedValue(false)
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({ code: 'persistence-failed' })
      expect(mounted.harness.ctx.tianwenEvolution.listLearningSignals()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listLearningTickets()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not leak a final Evidence projection failure or create a Candidate', async () => {
    const mounted = await mountRunner('evidence-projection-failure')
    const original = mounted.harness.ctx.tianwenEvidence.project
      .bind(mounted.harness.ctx.tianwenEvidence)
    let calls = 0
    vi.spyOn(mounted.harness.ctx.tianwenEvidence, 'project')
      .mockImplementation(session => {
        calls += 1
        if (calls === 3) throw new Error('evidence-project-secret')
        return original(session)
      })
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      const error = await runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      }).then(() => undefined, cause => cause as { code?: string, message?: string })
      expect(error).toMatchObject({ code: 'seed-failed' })
      expect(error?.message).not.toContain('evidence-project-secret')
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('retains the protocol but does not fake a Candidate when its formal write fails', async () => {
    const mounted = await mountRunner('candidate-write-failure')
    vi.spyOn(mounted.harness.ctx.tianwenEvolution, 'recordSkillCandidate')
      .mockImplementation(() => { throw new Error('candidate-write-secret') })
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      const error = await runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      }).then(() => undefined, cause => cause as { code?: string, message?: string })
      expect(error).toMatchObject({
        code: 'candidate-failed',
        completedStage: 'seeds',
        completedRoles: { seedRuns: 2 },
      })
      expect(error?.message).not.toContain('candidate-write-secret')
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvalProtocols()).toHaveLength(1)
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not close the Candidate stage when its post-boundary route check fails', async () => {
    const mounted = await mountRunner('candidate-boundary-drift', fullLifecycleScript())
    const original = mounted.harness.ctx.tianwenEvolution.recordSkillCandidate
      .bind(mounted.harness.ctx.tianwenEvolution)
    vi.spyOn(mounted.harness.ctx.tianwenEvolution, 'recordSkillCandidate')
      .mockImplementation(input => {
        const receipt = original(input)
        mounted.selection.model = 'drifted-during-candidate-write'
        return receipt
      })
    const runner = await import(
      '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
    ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
      manifestPath: string, manifestDigest: string,
    }): Promise<unknown> }
    try {
      await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
        manifestPath: mounted.manifestPath,
        manifestDigest: mounted.prepared.manifestDigest,
      })).rejects.toMatchObject({
        code: 'selection-mismatch',
        completedStage: 'seeds',
        completedRoles: {
          seedRuns: 2,
          evaluationArms: 0,
          evaluators: 0,
          shadowRuns: 0,
          transitions: 0,
        },
      })
      expect(mounted.adapter.requests).toHaveLength(8)
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(2)
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toHaveLength(1)
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })
})
