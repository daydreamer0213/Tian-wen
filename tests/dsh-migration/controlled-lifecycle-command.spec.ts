import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { PassThrough } from 'node:stream'

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import {
  CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1,
  sha256,
} from '../../packages/tianwen-evolution/src/index.js'
import { main } from '../../packages/tianwen-runtime-bundle/src/cli.js'
import * as controlledLifecycleModule from '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle.js'
import {
  buildControlledLifecycleInvocation,
  monitorControlledLifecycleChild,
  preflightControlledLifecycle,
} from '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle.js'
import {
  parseControlledLifecycleChildReceipt,
  readControlledLifecycleManifest,
} from '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-contract.js'

const FIXTURE_BASE = resolve('D:/DevData/tianwen-controlled-lifecycle-command-tests')
const DIGEST_A = `sha256:${'a'.repeat(64)}`
const DIGEST_B = `sha256:${'b'.repeat(64)}`
const DIGEST_C = `sha256:${'c'.repeat(64)}`

const parentSkill = {
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
}

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
    'The verifier ends the Turn after recording the verdict; do not attempt another model step.',
  ].join('\n'),
}

function taskText(taskId: string): { goal: string, input: string } {
  return {
    goal: `Choose the frozen architecture option for ${taskId}.`,
    input: `Controlled architecture case ${taskId}.`,
  }
}

function validManifest(
  dataDir: string,
  operationRoot: string,
  installedArchiveDigest = DIGEST_A,
  dshVersion: '0.1.0-rc.7' | '0.1.1-rc.2' = '0.1.1-rc.2',
) {
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
    installedArchiveDigest,
    standingAuthorizationDigest: 'sha256:90ed036e3761de4b9da9f31822fdbabe800c2085001a9c94d94214f5379d0fb6',
    roots: {
      dataDir,
      operationRoot,
      sessionsRoot: join(dataDir, 'dsh-home', 'sessions'),
      evolutionRoot: join(dataDir, 'state', 'evolution'),
    },
    execution: {
      dshVersion,
      providerId: 'deepseek-official',
      modelId: 'deepseek-v4-pro',
      retryPolicy: { mode: 'normal', maxRetries: 0 },
      allowedTools: [
        'skill',
        'record_architecture_decision',
        'verify_architecture_decision',
      ],
      evaluatorTool: 'submit_blind_evaluation',
      stopContract: { maxToolCalls: 6, maxElapsedMs: 180_000 },
      evaluatorMaterialContract: {
        schemaVersion: 'tianwen.controlled-evaluator-material-contract.v1',
        source: 'recorded-decision-submission',
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

function installedProduct(
  dataDir: string,
  dshSource = 'process.exitCode = 0\n',
): `sha256:${string}` {
  const archivePath = join(dataDir, 'packs', 'tianwen-runtime-bundle-0.1.2.tgz')
  const dshRoot = join(dataDir, 'dsh-host', 'node_modules', '@deepseek-ai', 'dsh')
  const profileRoot = join(dataDir, 'dsh-home', 'profiles', 'tianwen')
  const runtimeRoot = join(profileRoot, 'node_modules', '@tianwen', 'runtime-bundle')
  const runtimeStoreRoot = join(
    profileRoot,
    'node_modules', '.pnpm', '@tianwen+runtime-bundle@0.1.2',
    'node_modules', '@tianwen', 'runtime-bundle',
  )
  const cliPath = join(runtimeRoot, 'dist', 'cli.js')
  const receiptPath = join(dataDir, 'receipts', 'tianwen-install.json')
  mkdirSync(join(dshRoot, 'lib'), { recursive: true })
  mkdirSync(join(runtimeStoreRoot, 'dist'), { recursive: true })
  mkdirSync(join(runtimeRoot, '..'), { recursive: true })
  symlinkSync(runtimeStoreRoot, runtimeRoot, 'junction')
  mkdirSync(join(profileRoot, 'node_modules', '.bin'), { recursive: true })
  mkdirSync(join(dataDir, 'packs'), { recursive: true })
  mkdirSync(join(dataDir, 'receipts'), { recursive: true })
  writeFileSync(join(dshRoot, 'package.json'), `${JSON.stringify({
    name: '@deepseek-ai/dsh', version: '0.1.1-rc.2', bin: { dsh: 'lib/bin.js' },
  })}\n`, 'utf8')
  writeFileSync(join(dshRoot, 'lib', 'bin.js'), dshSource, 'utf8')
  writeFileSync(join(profileRoot, 'package.json'), `${JSON.stringify({
    dependencies: {
      '@deepseek-ai/dsh-base': '0.1.1-rc.2',
      '@deepseek-ai/dsh-headless': '0.1.1-rc.2',
      '@tianwen/runtime-bundle': '0.1.2',
    },
  })}\n`, 'utf8')
  writeFileSync(join(profileRoot, 'cordis.patch.yml'), 'profile: tianwen\n', 'utf8')
  writeFileSync(join(runtimeRoot, 'package.json'), `${JSON.stringify({
    name: '@tianwen/runtime-bundle', version: '0.1.2',
    bin: { tianwen: 'dist/cli.js' },
    exports: {
      './controlled-lifecycle-runner': './dist/controlled-lifecycle-runner.js',
    },
  })}\n`, 'utf8')
  writeFileSync(cliPath, 'process.exitCode = 0\n', 'utf8')
  writeFileSync(join(runtimeRoot, 'dist', 'runtime.js'), 'export {}\n', 'utf8')
  writeFileSync(
    join(runtimeRoot, 'dist', 'controlled-lifecycle-runner.js'),
    'export const name = "tianwen-controlled-lifecycle-runner"\n',
    'utf8',
  )
  writeFileSync(
    join(runtimeRoot, 'controlled-lifecycle.patch.yml'),
    '- insert:\n    - id: tianwen-controlled-lifecycle-runner\n      name: "@tianwen/runtime-bundle/controlled-lifecycle-runner"\n',
    'utf8',
  )
  const archive = Buffer.from('controlled runtime archive fixture', 'utf8')
  writeFileSync(archivePath, archive)
  const archiveDigest = `sha256:${createHash('sha256').update(archive).digest('hex')}` as const
  writeFileSync(receiptPath, `${JSON.stringify({
    archiveDigest,
    archivePath,
    binDir: join(profileRoot, 'node_modules', '.bin'),
    cliPath: realpathSync(cliPath),
    dataDir,
    dshVersion: '0.1.1-rc.2',
    hostRoot: join(dataDir, 'dsh-host'),
    pnpmVersion: '11.20.0',
    profileBundles: [
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-headless',
      '@tianwen/runtime-bundle',
    ],
    profileRoot,
    receiptPath,
    schemaVersion: 'tianwen.install.v1',
    status: 'ready',
  })}\n`, 'utf8')
  return archiveDigest
}

function successReceipt(manifestDigest = DIGEST_B, archiveDigest = DIGEST_A) {
  return {
    schemaVersion: 'tianwen.controlled-real-skill-lifecycle.v1',
    status: 'passed',
    evidence: {
      source: 'configured-provider-capable',
      environment: 'development-only',
      defect: 'synthetic-defect',
      naturalUserEvidence: 'not-claimed',
      externalUserEvidence: 'not-claimed',
    },
    digests: {
      activity: manifestDigest,
      installedArchive: archiveDigest,
      manifest: manifestDigest,
      protocol: DIGEST_C,
      evaluation: DIGEST_C,
      shadow: DIGEST_C,
      transitionSet: DIGEST_C,
      finalPointer: DIGEST_C,
    },
    mechanism: {
      evaluation: 'pass',
      evaluationReason: 'all-gates-passed',
      shadow: 'pass',
      shadowEligibility: 'eligible-for-isolated-test-promotion',
      transitions: {
        promote: 'verified', rollback: 'verified', restore: 'verified',
      },
    },
    counts: {
      formalSessions: 25,
      roles: {
        seedRuns: 2, evaluationArms: 10, evaluators: 5,
        shadowRuns: 5, transitions: 3,
      },
      modelRequests: 65,
      toolCalls: 45,
      acceptanceEvidence: 20,
    },
    pointer: { revision: 4, versionDigest: DIGEST_C },
    isolation: {
      ordinaryRootSkillUnchanged: true,
      legacyChampionUnchanged: true,
      otherControlledScopesUnchanged: true,
      realProductDataUntouched: true,
    },
  }
}

function stoppedReceipt(
  manifestDigest = DIGEST_B,
  reasonCode = 'manifest-revalidation-failed',
) {
  return {
    schemaVersion: 'tianwen.controlled-real-skill-lifecycle.v1',
    status: 'stopped',
    evidence: successReceipt().evidence,
    activityDigest: manifestDigest,
    completedStage: 'preflight',
    reasonCode,
    completedRoles: {
      seedRuns: 0, evaluationArms: 0, evaluators: 0,
      shadowRuns: 0, transitions: 0,
    },
  }
}

function controlledChild() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  })
}

function nextEventLoopTurn(): Promise<void> {
  return new Promise(resolve => { setImmediate(resolve) })
}

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => {
  rmSync(FIXTURE_BASE, { recursive: true, force: true })
})

describe('tianwen controlled-lifecycle', () => {
  it('forwards one exact child receipt after exit and both stream ends without child close', async () => {
    const expected = {
      manifestDigest: DIGEST_B as `sha256:${string}`,
      installedArchiveDigest: DIGEST_A as `sha256:${string}`,
    }
    for (const [receipt, code] of [
      [successReceipt(), 0],
      [stoppedReceipt(), 1],
    ] as const) {
      const child = controlledChild()
      const output: string[] = []
      const errors: string[] = []
      const exit = monitorControlledLifecycleChild(child as never, expected, {
        write: line => { output.push(line) },
        writeError: line => { errors.push(line) },
      })
      let settled = false
      void exit.then(() => { settled = true })
      child.stdout.end(`${JSON.stringify(receipt)}\n`)
      child.stderr.end()
      child.emit('exit', code, null)
      await nextEventLoopTurn()
      expect(settled).toBe(true)
      await expect(exit).resolves.toBe(code)
      expect(output).toEqual([`${JSON.stringify(receipt)}\n`])
      expect(errors).toEqual([])
      expect(child.kill).not.toHaveBeenCalled()
    }
  })

  it('waits for child exit and both stream ends in any order', async () => {
    const expected = {
      manifestDigest: DIGEST_B as `sha256:${string}`,
      installedArchiveDigest: DIGEST_A as `sha256:${string}`,
    }
    for (const last of ['exit', 'stdout', 'stderr'] as const) {
      const child = controlledChild()
      const output: string[] = []
      const errors: string[] = []
      const result = monitorControlledLifecycleChild(child as never, expected, {
        write: line => { output.push(line) },
        writeError: line => { errors.push(line) },
      })
      let settled = false
      void result.then(() => { settled = true })
      const events = {
        exit: () => { child.emit('exit', 1, null) },
        stdout: () => { child.stdout.end(`${JSON.stringify(stoppedReceipt())}\n`) },
        stderr: () => { child.stderr.end() },
      }
      for (const event of ['exit', 'stdout', 'stderr'] as const) {
        if (event !== last) events[event]()
      }
      await nextEventLoopTurn()
      expect(settled).toBe(false)
      events[last]()
      await nextEventLoopTurn()
      expect(settled).toBe(true)
      await expect(result).resolves.toBe(1)
      expect(output).toEqual([`${JSON.stringify(stoppedReceipt())}\n`])
      expect(errors).toEqual([])
    }
  })

  it('rejects unsafe child output without forwarding child-controlled text', async () => {
    const expected = {
      manifestDigest: DIGEST_B as `sha256:${string}`,
      installedArchiveDigest: DIGEST_A as `sha256:${string}`,
    }
    const invalidReceipts = [
      { ...successReceipt(), unexpected: true },
      { ...successReceipt(), evidence: { ...successReceipt().evidence, unexpected: true } },
      { ...successReceipt(), digests: { ...successReceipt().digests, manifest: DIGEST_C } },
      { ...successReceipt(), counts: { ...successReceipt().counts, modelRequests: -1 } },
    ]
    for (const receipt of invalidReceipts) {
      expect(() => parseControlledLifecycleChildReceipt(
        `${JSON.stringify(receipt)}\n`, '', expected,
      )).toThrow()
    }
    for (const forbidden of [
      'task', 'output', 'toolArgs', 'toolResults', 'reasoning', 'skillContent',
      'sessionId', 'runId', 'candidateId', 'path', 'credential', 'error',
    ]) {
      expect(() => parseControlledLifecycleChildReceipt(
        `${JSON.stringify({ ...stoppedReceipt(), [forbidden]: 'raw-secret' })}\n`,
        '',
        expected,
      )).toThrow()
    }
    expect(() => parseControlledLifecycleChildReceipt(
      `${JSON.stringify(successReceipt())}\n${JSON.stringify(successReceipt())}\n`,
      '',
      expected,
    )).toThrow()
    expect(() => parseControlledLifecycleChildReceipt(
      `${JSON.stringify(successReceipt())}\n`,
      'raw-provider-secret',
      expected,
    )).toThrow()

    for (const [receipt, code] of [
      [successReceipt(), 1],
      [stoppedReceipt(), 0],
    ] as const) {
      const child = controlledChild()
      const output: string[] = []
      const errors: string[] = []
      const exit = monitorControlledLifecycleChild(child as never, expected, {
        write: line => { output.push(line) },
        writeError: line => { errors.push(line) },
      })
      child.stdout.end(`${JSON.stringify(receipt)}\n`)
      child.stderr.end()
      child.emit('exit', code, null)
      await expect(exit).resolves.toBe(1)
      expect(output).toEqual([])
      expect(errors).toEqual(['tianwen controlled-lifecycle: child transport failed\n'])
      expect(child.kill).not.toHaveBeenCalled()
    }

  })

  it('fails closed for incomplete or unsafe child transport events', async () => {
    const expected = {
      manifestDigest: DIGEST_B as `sha256:${string}`,
      installedArchiveDigest: DIGEST_A as `sha256:${string}`,
    }
    for (const [stdout, stderr, code, signal] of [
      [
        `${JSON.stringify(stoppedReceipt())}\n${JSON.stringify(stoppedReceipt())}\n`,
        '', 1, null,
      ],
      [`${JSON.stringify(stoppedReceipt())}\n`, 'raw-child-error', 1, null],
      [`${JSON.stringify(stoppedReceipt())}\n`, '', null, 'SIGTERM'],
    ] as const) {
      const child = controlledChild()
      const output: string[] = []
      const errors: string[] = []
      const result = monitorControlledLifecycleChild(child as never, expected, {
        write: line => { output.push(line) },
        writeError: line => { errors.push(line) },
      })
      child.stdout.end(stdout)
      child.stderr.end(stderr)
      child.emit('exit', code, signal)
      await expect(result).resolves.toBe(1)
      expect(output).toEqual([])
      expect(errors).toEqual(['tianwen controlled-lifecycle: child transport failed\n'])
      expect(child.kill).not.toHaveBeenCalled()
    }

    for (const failChild of [
      (child: ReturnType<typeof controlledChild>) => {
        child.emit('error', new Error('spawn failed'))
      },
      (child: ReturnType<typeof controlledChild>) => {
        child.stdout.emit('error', new Error('stdout failed'))
      },
      (child: ReturnType<typeof controlledChild>) => {
        child.stderr.emit('error', new Error('stderr failed'))
      },
      (child: ReturnType<typeof controlledChild>) => { child.stdout.emit('close') },
      (child: ReturnType<typeof controlledChild>) => { child.stderr.emit('close') },
      (child: ReturnType<typeof controlledChild>) => {
        child.stdout.write(Buffer.alloc(64 * 1024 + 1, 0x78))
      },
    ]) {
      const child = controlledChild()
      const output: string[] = []
      const errors: string[] = []
      const result = monitorControlledLifecycleChild(child as never, expected, {
        write: line => { output.push(line) },
        writeError: line => { errors.push(line) },
      })
      failChild(child)
      await expect(result).resolves.toBe(1)
      const killCalls = child.kill.mock.calls.length
      let lateEventThrew = false
      try {
        child.emit('error', new Error('late child error'))
        child.stdout.emit('error', new Error('late stdout error'))
        child.stderr.emit('error', new Error('late stderr error'))
        child.stdout.emit('close')
        child.stderr.emit('close')
        child.stdout.emit('end')
        child.stderr.emit('end')
      } catch {
        lateEventThrew = true
      }
      expect({ killCalls, lateEventThrew }).toEqual({ killCalls: 1, lateEventThrew: false })
      expect(output).toEqual([])
      expect(errors).toEqual(['tianwen controlled-lifecycle: child transport failed\n'])
      expect(child.kill).toHaveBeenCalledOnce()
    }
  })

  it('accepts only the exact digest-bound safe success and stopped receipts', () => {
    const expected = {
      manifestDigest: DIGEST_B as `sha256:${string}`,
      installedArchiveDigest: DIGEST_A as `sha256:${string}`,
    }
    const success = successReceipt()
    const stopped = stoppedReceipt()
    expect(parseControlledLifecycleChildReceipt(
      `${JSON.stringify(success)}\n`, '', expected,
    )).toEqual(success)
    expect(parseControlledLifecycleChildReceipt(
      `${JSON.stringify(stopped)}\n`, '', expected,
    )).toEqual(stopped)
    for (const reasonCode of [
      'original-or-adjacent-not-improved',
      'submission-invalid',
      'evidence-mismatch',
    ]) {
      const rejected = stoppedReceipt(DIGEST_B, reasonCode)
      expect(parseControlledLifecycleChildReceipt(
        `${JSON.stringify(rejected)}\n`, '', expected,
      )).toEqual(rejected)
    }
    for (const actual of [0, Number.MAX_SAFE_INTEGER]) {
      const counted = {
        ...success,
        counts: { ...success.counts, modelRequests: actual, toolCalls: actual },
      }
      expect(parseControlledLifecycleChildReceipt(
        `${JSON.stringify(counted)}\n`, '', expected,
      )).toEqual(counted)
    }
  })

  it('closes the official install and builds one fixed shell-free child invocation', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'installed-'))
    const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
    const manifestPath = join(operationRoot, 'manifest.json')
    mkdirSync(operationRoot, { recursive: true })
    const archiveDigest = installedProduct(dataDir)
    writeFileSync(manifestPath, `${JSON.stringify(
      validManifest(dataDir, operationRoot, archiveDigest),
    )}\n`, 'utf8')
    const sentinel = randomUUID()
    process.env.DEEPSEEK_API_KEY = sentinel
    const before = new Set(Object.keys(process.env))
    try {
      const preflight = preflightControlledLifecycle(manifestPath, dataDir)
      const invocation = buildControlledLifecycleInvocation(preflight)
      expect(preflight.installedArchiveDigest).toBe(archiveDigest)
      expect(preflight.manifest.manifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
      expect(invocation.program).toBe(process.execPath)
      expect(invocation.args).toEqual([
        expect.stringMatching(/@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/u),
        '--profile', 'tianwen', '--patch',
        expect.stringMatching(/controlled-lifecycle\.patch\.yml$/u),
      ])
      expect(existsSync(invocation.args.at(-1)!)).toBe(true)
      expect(existsSync(join(
        dataDir,
        'dsh-home', 'profiles', 'tianwen', 'node_modules',
        '@tianwen', 'runtime-bundle', 'dist', 'controlled-lifecycle-runner.js',
      ))).toBe(true)
      expect(invocation.options).toMatchObject({
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      expect(invocation.options.env?.DEEPSEEK_API_KEY).toBe(sentinel)
      expect(Object.keys(invocation.options.env!).filter(key => !before.has(key)).toSorted())
        .toEqual([
          'DSH_HOME',
          'TIANWEN_CONTROLLED_DATA_DIR',
          'TIANWEN_CONTROLLED_JSON',
          'TIANWEN_CONTROLLED_MANIFEST_DIGEST',
          'TIANWEN_CONTROLLED_MANIFEST_PATH',
        ])
    } finally {
      delete process.env.DEEPSEEK_API_KEY
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('reports only the proven installed receipt mismatch and starts no child', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'receipt-mismatch-'))
    const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
    const manifestPath = join(operationRoot, 'manifest.json')
    const childMarker = join(dataDir, 'child-started')
    const receiptPath = join(dataDir, 'receipts', 'tianwen-install.json')
    mkdirSync(operationRoot, { recursive: true })
    const archiveDigest = installedProduct(dataDir, [
      "const { writeFileSync } = require('node:fs')",
      `writeFileSync(${JSON.stringify(childMarker)}, '')`,
      'process.exitCode = 0',
      '',
    ].join('\n'))
    writeFileSync(manifestPath, `${JSON.stringify(
      validManifest(dataDir, operationRoot, archiveDigest),
    )}\n`, 'utf8')
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as Record<string, unknown>
    receipt.cliPath = join(
      dataDir, 'dsh-home', 'profiles', 'tianwen', 'node_modules',
      '@tianwen', 'runtime-bundle', 'dist', 'cli.js',
    )
    writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`, 'utf8')
    const errorConstructor = (
      controlledLifecycleModule as typeof controlledLifecycleModule & {
        ControlledLifecyclePreflightError?: new (...args: never[]) => Error & {
          readonly code: 'installed-receipt-mismatch'
        }
      }
    ).ControlledLifecyclePreflightError
    let directError: unknown
    try {
      preflightControlledLifecycle(manifestPath, dataDir)
    } catch (error) {
      directError = error
    }
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      expect(errorConstructor).toBeTypeOf('function')
      expect(directError).toMatchObject({ code: 'installed-receipt-mismatch' })
      if (errorConstructor !== undefined) {
        expect(directError).toBeInstanceOf(errorConstructor)
      }
      await expect(main([
        'controlled-lifecycle', '--manifest', manifestPath,
        '--data-dir', dataDir, '--json',
      ])).resolves.toBe(1)
      expect(stderr).toHaveBeenCalledTimes(1)
      expect(stderr).toHaveBeenCalledWith(
        'Error: controlled lifecycle preflight failed: installed-receipt-mismatch\n',
      )
      expect(existsSync(childMarker)).toBe(false)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('freezes the exact v0.1 manifest and 25 formal Session roles', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'manifest-'))
    const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
    const manifestPath = join(operationRoot, 'manifest.json')
    mkdirSync(operationRoot, { recursive: true })
    writeFileSync(manifestPath, `${JSON.stringify(validManifest(dataDir, operationRoot))}\n`, 'utf8')
    try {
      const prepared = readControlledLifecycleManifest(manifestPath)
      expect(prepared.manifest).toMatchObject({
        schemaVersion: 'tianwen.controlled-real-skill-lifecycle-manifest.v1',
        activityLabel: 'tianwen-v0.1-controlled-real-activity-01',
        evidence: {
          source: 'configured-provider-capable',
          environment: 'development-only',
          defect: 'synthetic-defect',
          naturalUserEvidence: 'not-claimed',
          externalUserEvidence: 'not-claimed',
        },
        execution: {
          dshVersion: '0.1.1-rc.2',
          providerId: 'deepseek-official',
          modelId: 'deepseek-v4-pro',
          retryPolicy: { mode: 'normal', maxRetries: 0 },
          allowedTools: [
            'skill',
            'record_architecture_decision',
            'verify_architecture_decision',
          ],
          evaluatorTool: 'submit_blind_evaluation',
          stopContract: { maxToolCalls: 6, maxElapsedMs: 180_000 },
          evaluatorMaterialContract: {
            schemaVersion: 'tianwen.controlled-evaluator-material-contract.v1',
            source: 'recorded-decision-submission',
            maxUtf8Bytes: 4_096,
          },
        },
        skills: { parent: parentSkill, candidate: candidateSkill },
      })
      expect(prepared.manifest.tasks.seeds).toHaveLength(2)
      expect(prepared.manifest.tasks.evaluations).toHaveLength(5)
      expect(prepared.manifest.tasks.shadows).toHaveLength(5)
      expect(prepared.manifest.tasks.transitions).toHaveLength(3)
      expect(prepared.sessionIds).toHaveLength(25)
      expect(new Set(prepared.sessionIds)).toHaveLength(25)
      expect(prepared.manifest.tasks.evaluations.map(task => [
        task.taskId, task.taskType, task.hiddenExpectedChoice,
      ])).toEqual([
        ['eval-task:t1', 'original-problem', 'thin-run-binding'],
        ['eval-task:t2', 'adjacent-transfer', 'node-package-script-transport'],
        ['eval-task:t3', 'regression', 'reuse-dsh-agent-tool-seams'],
        ['eval-task:t4', 'counterexample', 'stdlib-sort-no-governance'],
        ['eval-task:t5', 'safety-authorization', 'finite-source-safe-receipt'],
      ])
      expect(prepared.manifest.standingAuthorizationDigest)
        .toBe(sha256(CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1))
      expect(prepared.manifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('reads a persisted DSH 0.1.0-rc.7 manifest without rewriting its version', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'legacy-manifest-'))
    const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
    const manifestPath = join(operationRoot, 'manifest.json')
    mkdirSync(operationRoot, { recursive: true })
    writeFileSync(
      manifestPath,
      `${JSON.stringify(validManifest(dataDir, operationRoot, DIGEST_A, '0.1.0-rc.7'))}\n`,
      'utf8',
    )
    try {
      const parsed = readControlledLifecycleManifest(manifestPath)
      expect(parsed.manifest.execution.dshVersion).toBe('0.1.0-rc.7')
      expect(JSON.stringify(parsed.manifest)).toContain('0.1.0-rc.7')
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('treats JSON object key order as non-semantic', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'key-order-'))
    const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
    const manifestPath = join(operationRoot, 'manifest.json')
    mkdirSync(operationRoot, { recursive: true })
    const manifest = validManifest(dataDir, operationRoot)
    manifest.evidence = {
      externalUserEvidence: 'not-claimed',
      naturalUserEvidence: 'not-claimed',
      defect: 'synthetic-defect',
      environment: 'development-only',
      source: 'configured-provider-capable',
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8')
    try {
      expect(readControlledLifecycleManifest(manifestPath).sessionIds).toHaveLength(25)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('rejects malformed manifests before any child can start', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'manifest-rejections-'))
    const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
    const manifestPath = join(operationRoot, 'manifest.json')
    const childMarker = join(dataDir, 'child-started')
    mkdirSync(operationRoot, { recursive: true })
    const archiveDigest = installedProduct(dataDir, [
      "const { writeFileSync } = require('node:fs')",
      `writeFileSync(${JSON.stringify(childMarker)}, '')`,
      'process.exitCode = 0',
      '',
    ].join('\n'))
    const base = validManifest(dataDir, operationRoot, archiveDigest)
    const invalid = [
      { ...structuredClone(base), unexpected: true },
      (() => {
        const value = structuredClone(base)
        value.tasks.seeds.pop()
        return value
      })(),
      (() => {
        const value = structuredClone(base)
        value.tasks.evaluations[0]!.baselineWorkspaceRoot = resolve('D:/DevData/outside-operation')
        return value
      })(),
      (() => {
        const value = structuredClone(base)
        value.tasks.shadows[0]!.sessionId = value.tasks.seeds[0]!.sessionId
        return value
      })(),
    ]
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      for (const manifest of invalid) {
        writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8')
        await expect(main([
          'controlled-lifecycle', '--manifest', manifestPath,
          '--data-dir', dataDir, '--json',
        ])).resolves.toBe(1)
        expect(existsSync(childMarker)).toBe(false)
      }
      writeFileSync(manifestPath, Buffer.alloc(64 * 1024 + 1, 0x20))
      await expect(main([
        'controlled-lifecycle', '--manifest', manifestPath,
        '--data-dir', dataDir, '--json',
      ])).resolves.toBe(1)
      expect(existsSync(childMarker)).toBe(false)
      expect(stderr).toHaveBeenCalledWith('Error: controlled lifecycle preflight failed\n')
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('rejects an operation root junction that resolves outside data-dir', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'junction-data-'))
    const escapedOperation = mkdtempSync(join(FIXTURE_BASE, 'junction-target-'))
    const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
    const manifestPath = join(operationRoot, 'manifest.json')
    mkdirSync(join(dataDir, 'controlled-operation'), { recursive: true })
    symlinkSync(escapedOperation, operationRoot, 'junction')
    const archiveDigest = installedProduct(dataDir)
    writeFileSync(manifestPath, `${JSON.stringify(
      validManifest(dataDir, operationRoot, archiveDigest),
    )}\n`, 'utf8')
    try {
      expect(() => preflightControlledLifecycle(manifestPath, dataDir)).toThrow()
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
      rmSync(escapedOperation, { recursive: true, force: true })
    }
  })

  it('rejects installed Session or Evolution roots that resolve outside data-dir', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'state-root-data-'))
    const escapedSessions = mkdtempSync(join(FIXTURE_BASE, 'state-root-target-'))
    const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
    const manifestPath = join(operationRoot, 'manifest.json')
    const sessionsRoot = join(dataDir, 'dsh-home', 'sessions')
    mkdirSync(operationRoot, { recursive: true })
    const archiveDigest = installedProduct(dataDir)
    rmSync(sessionsRoot, { recursive: true, force: true })
    symlinkSync(escapedSessions, sessionsRoot, 'junction')
    writeFileSync(manifestPath, `${JSON.stringify(
      validManifest(dataDir, operationRoot, archiveDigest),
    )}\n`, 'utf8')
    try {
      expect(() => preflightControlledLifecycle(manifestPath, dataDir)).toThrow()
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
      rmSync(escapedSessions, { recursive: true, force: true })
    }
  })

  it('rejects a fresh Evolution root beneath an external state owner', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'state-owner-data-'))
    const escapedState = mkdtempSync(join(FIXTURE_BASE, 'state-owner-target-'))
    const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
    const manifestPath = join(operationRoot, 'manifest.json')
    mkdirSync(operationRoot, { recursive: true })
    const archiveDigest = installedProduct(dataDir)
    symlinkSync(escapedState, join(dataDir, 'state'), 'junction')
    writeFileSync(manifestPath, `${JSON.stringify(
      validManifest(dataDir, operationRoot, archiveDigest),
    )}\n`, 'utf8')
    try {
      expect(readdirSync(escapedState)).toEqual([])
      expect(() => preflightControlledLifecycle(manifestPath, dataDir)).toThrow()
      expect(readdirSync(escapedState)).toEqual([])
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
      rmSync(escapedState, { recursive: true, force: true })
    }
  })

  it('rejects nested workspace roots that are not isolated', () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'nested-workspace-'))
    const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
    const manifestPath = join(operationRoot, 'manifest.json')
    mkdirSync(operationRoot, { recursive: true })
    const manifest = validManifest(dataDir, operationRoot)
    manifest.tasks.shadows[0]!.workspaceRoot = join(
      manifest.tasks.seeds[0]!.workspaceRoot,
      'nested',
    )
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8')
    try {
      expect(() => readControlledLifecycleManifest(manifestPath)).toThrow()
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('does not let a source CLI impersonate the installed Runtime Bundle', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'child-boundary-'))
    const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
    const manifestPath = join(operationRoot, 'manifest.json')
    const childMarker = join(dataDir, 'child-started')
    mkdirSync(operationRoot, { recursive: true })
    const archiveDigest = installedProduct(dataDir, [
      "const { writeFileSync } = require('node:fs')",
      `writeFileSync(${JSON.stringify(childMarker)}, '')`,
      'const digest = process.env.TIANWEN_CONTROLLED_MANIFEST_DIGEST',
      `process.stdout.write(JSON.stringify({
        schemaVersion: 'tianwen.controlled-real-skill-lifecycle.v1',
        status: 'stopped',
        evidence: ${JSON.stringify(successReceipt().evidence)},
        activityDigest: digest,
        completedStage: 'preflight',
        reasonCode: 'services-unavailable',
        completedRoles: {
          seedRuns: 0, evaluationArms: 0, evaluators: 0,
          shadowRuns: 0, transitions: 0,
        },
      }) + '\\n')`,
      'process.exitCode = 1',
      '',
    ].join('\n'))
    writeFileSync(manifestPath, `${JSON.stringify(
      validManifest(dataDir, operationRoot, archiveDigest),
    )}\n`, 'utf8')
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      await expect(main([
        'controlled-lifecycle', '--manifest', manifestPath,
        '--data-dir', dataDir, '--json',
      ])).resolves.toBe(1)
      expect(existsSync(childMarker)).toBe(false)
      expect(stderr).toHaveBeenCalledWith('Error: controlled lifecycle preflight failed\n')
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('rejects non-exact command arguments without launching a child', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cases = [
      ['controlled-lifecycle', '--data-dir', FIXTURE_BASE, '--json'],
      [
        'controlled-lifecycle', '--manifest', 'manifest.json',
        '--data-dir', FIXTURE_BASE, '--json',
      ],
      [
        'controlled-lifecycle', '--manifest', resolve(FIXTURE_BASE, 'manifest.json'),
        '--manifest', resolve(FIXTURE_BASE, 'second.json'),
        '--data-dir', FIXTURE_BASE, '--json',
      ],
      [
        'controlled-lifecycle', '--manifest', resolve(FIXTURE_BASE, 'manifest.json'),
        '--data-dir', FIXTURE_BASE, '--unknown', '--json',
      ],
    ]
    for (const args of cases) await expect(main(args)).resolves.toBe(2)
    await expect(main([
      'list', '--data-dir', FIXTURE_BASE,
      '--manifest', resolve(FIXTURE_BASE, 'manifest.json'),
    ])).resolves.toBe(2)
    expect(stderr).toHaveBeenCalledTimes(cases.length + 1)
  })

  it('routes the exact installed command to zero-child product preflight', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'missing-install-'))
    const manifestPath = join(dataDir, 'manifest.json')
    writeFileSync(manifestPath, '{}\n', 'utf8')
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      await expect(main([
        'controlled-lifecycle',
        '--manifest', manifestPath,
        '--data-dir', dataDir,
        '--json',
      ])).resolves.toBe(1)
      expect(stderr).toHaveBeenCalledWith(
        'Error: controlled lifecycle preflight failed\n',
      )
      for (const rejectedDataDir of [resolve('D:/DevData'), resolve('C:/outside-dev-data')]) {
        await expect(main([
          'controlled-lifecycle',
          '--manifest', resolve('D:/DevData/missing-manifest.json'),
          '--data-dir', rejectedDataDir,
          '--json',
        ])).resolves.toBe(1)
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
