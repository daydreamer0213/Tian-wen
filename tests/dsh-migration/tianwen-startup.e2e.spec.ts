import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  existsSync,
  globSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SessionId } from '@tianwen/dsh-compat'
import type { SessionEvent } from '@tianwen/dsh-compat'
import { projectEvidence } from '../../packages/tianwen-evidence/src/projector.js'
import { readControlledLifecycleManifest } from '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-contract.js'

const root = resolve(import.meta.dirname, '../..')
const tianwenRoot = process.env.TIANWEN_E2E_DATA_DIR ?? 'D:/DevData/tianwen-installer-e2e'
const dshHostRoot = `${tianwenRoot}/dsh-host`
const dshHome = `${tianwenRoot}/dsh-home`
const profileRoot = `${dshHome}/profiles/tianwen`
const sessionsRoot = `${dshHome}/sessions`
const evolutionRoot = `${tianwenRoot}/state/evolution`
const receiptPath = `${tianwenRoot}/receipts/phase2-startup-receipt.json`
const statusReceiptPath = `${tianwenRoot}/receipts/phase3-goal-status-receipt.json`
const listReceiptPath = `${tianwenRoot}/receipts/phase4-goal-list-receipt.json`
const createReceiptPath = `${tianwenRoot}/receipts/goal-create-receipt.json`
const resumeReceiptPath = `${tianwenRoot}/receipts/phase5-goal-resume-receipt.json`
const installReceiptPath = `${tianwenRoot}/receipts/tianwen-install.json`
const archive = `${tianwenRoot}/packs/tianwen-runtime-bundle-0.1.6.tgz`
const installer = resolve(root, 'scripts/install-tianwen.mjs')
const taskText = 'run the Tianwen phase 2 smoke task'
const completeCallId = 'tianwen-phase2-goal-complete'
const enabled = process.env.TIANWEN_DSH_PHASE2_STARTUP === '1'
const controlledInstalledEnabled = process.platform === 'win32' &&
  process.env.TIANWEN_CONTROLLED_INSTALLED_E2E === '1'
const runtimePackage = '@tianwen/runtime-bundle'
const runtimePackageVersion = '0.1.6'
const liveGoalObjective = 'Call tianwen_smoke_action exactly once. After it succeeds, mark this Goal complete with update_goal, then reply exactly TIANWEN_GOAL_ROUND_OK.'
const controlledFixtureBase = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-test-fixtures',
  'tianwen-startup',
)

function selectedPnpmStore(configuredStore: string | undefined): string {
  return configuredStore ?? 'D:/DevData/pnpm-store'
}

function formalStartupEnvironmentPaths(productRoot: string): {
  temp: string
  virtualStore: string
} {
  const environmentRoot = `${productRoot}-environment`
  return {
    temp: join(environmentRoot, 'temp'),
    virtualStore: join(environmentRoot, 'virtual-store'),
  }
}

const controlledParentSkill = {
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

const controlledCandidateSkill = {
  ...controlledParentSkill,
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

function controlledTaskText(taskId: string): { goal: string, input: string } {
  return {
    goal: `Choose the frozen architecture option for ${taskId}.`,
    input: `Controlled architecture case ${taskId}.`,
  }
}

function controlledManifest(
  dataDir: string,
  operationRoot: string,
  installedArchiveDigest: string,
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
    skills: { parent: controlledParentSkill, candidate: controlledCandidateSkill },
    tasks: {
      seeds: [
        {
          taskId: 'seed-task:d1', ...controlledTaskText('D1'),
          workspaceRoot: workspace('seed-d1'),
          hiddenExpectedChoice: 'thin-run-binding',
          sessionId: 'session:controlled-real:seed-d1',
        },
        {
          taskId: 'seed-task:d2', ...controlledTaskText('D2'),
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
        ...controlledTaskText(name!.toUpperCase()),
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
        ...controlledTaskText(name!.toUpperCase()),
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
        ...controlledTaskText(kind!),
        workspaceRoot: workspace(`transition-${kind}`),
        hiddenExpectedChoice,
        sessionId: `session:controlled-real:transition-${kind}`,
      })),
    },
  }
}

function run(
  executable: string,
  argv: string[],
  env: NodeJS.ProcessEnv,
  timeout = 120_000,
) {
  return spawnSync(executable, argv, {
    cwd: root,
    encoding: 'utf8',
    env,
    shell: false,
    timeout,
  })
}

function listSessionLogs(): string[] {
  return existsSync(sessionsRoot)
    ? globSync('**/session.jsonl', { cwd: sessionsRoot }).map(entry => resolve(sessionsRoot, entry)).sort()
    : []
}

function publishReceipt(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temp, path)
}

function snapshotState(): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {}
  for (const stateRoot of [sessionsRoot, evolutionRoot]) {
    const label = relative(tianwenRoot, stateRoot).replaceAll('\\', '/')
    if (!existsSync(stateRoot)) {
      snapshot[`missing:${label}`] = ''
      continue
    }
    snapshot[`directory:${label}`] = ''
    for (const entry of globSync('**/*', {
      cwd: stateRoot,
      withFileTypes: true,
    })) {
      const path = resolve(entry.parentPath, entry.name)
      const child = relative(tianwenRoot, path).replaceAll('\\', '/')
      if (entry.isDirectory()) snapshot[`directory:${child}`] = ''
      else if (entry.isFile()) {
        snapshot[`file:${child}`] = readFileSync(path).toString('base64')
      }
    }
  }
  return snapshot
}

function snapshotTree(rootPath: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {}
  if (!existsSync(rootPath)) return { missing: '' }
  for (const entry of globSync('**/*', { cwd: rootPath, withFileTypes: true })) {
    const path = resolve(entry.parentPath, entry.name)
    const label = relative(rootPath, path).replaceAll('\\', '/')
    if (entry.isDirectory()) snapshot[`directory:${label}`] = ''
    else if (entry.isFile()) snapshot[`file:${label}`] = readFileSync(path).toString('base64')
  }
  return snapshot
}

function requireWithinRoot(path: string): string {
  const allowed = realpathSync(tianwenRoot)
  const candidate = resolve(path)
  const child = relative(allowed, candidate)
  expect(child === '' || (!child.startsWith('..') && !isAbsolute(child))).toBe(true)
  return candidate
}

function expectOutsideWorktree(path: string): void {
  const child = relative(realpathSync(root), realpathSync(path))
  expect(child.startsWith('..') || isAbsolute(child)).toBe(true)
}

function childEnvironment(): NodeJS.ProcessEnv {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  expect(systemRoot).toBeDefined()
  const { temp, virtualStore } = formalStartupEnvironmentPaths(tianwenRoot)
  const store = selectedPnpmStore(process.env.PNPM_CONFIG_STORE_DIR)
  const cache = 'D:/DevData/pnpm-cache'
  const system32 = resolve(systemRoot!, 'System32')
  const paths = [
    dshHome,
    dshHostRoot,
    profileRoot,
    sessionsRoot,
    evolutionRoot,
    receiptPath,
    statusReceiptPath,
    listReceiptPath,
    createReceiptPath,
    resumeReceiptPath,
    installReceiptPath,
    archive,
  ]
  mkdirSync(tianwenRoot, { recursive: true })
  paths.forEach(requireWithinRoot)
  ;[temp, virtualStore].forEach(path => mkdirSync(path, { recursive: true }))
  return {
    CI: 'true',
    COREPACK_HOME: 'D:/DevData/corepack-home',
    COREPACK_ENABLE_NETWORK: '0',
    DSH_HOME: dshHome,
    DSH_TELEMETRY_DISABLED: '1',
    NPM_CONFIG_CACHE: cache,
    NPM_CONFIG_OFFLINE: 'true',
    PATH: [dirname(process.execPath), system32].join(delimiter),
    PATHEXT: process.env.PATHEXT,
    PNPM_CONFIG_CACHE_DIR: cache,
    PNPM_CONFIG_AUTO_INSTALL_PEERS: 'true',
    PNPM_CONFIG_OFFLINE: 'true',
    PNPM_CONFIG_STORE_DIR: store,
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
    PNPM_CONFIG_VIRTUAL_STORE_DIR: virtualStore,
    SystemRoot: systemRoot,
    TEMP: temp,
    TMP: temp,
    WINDIR: process.env.WINDIR ?? systemRoot,
    ComSpec: process.env.ComSpec,
  }
}

function controlledInstallEnvironment(dataDir: string): NodeJS.ProcessEnv {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  expect(systemRoot).toBeDefined()
  const environmentRoot = `${dataDir}-environment`
  const temp = join(environmentRoot, 'temp')
  const cache = join(environmentRoot, 'pnpm-cache')
  const virtualStore = join(environmentRoot, 'virtual-store')
  mkdirSync(temp, { recursive: true })
  mkdirSync(virtualStore, { recursive: true })
  return {
    CI: 'true',
    COREPACK_HOME: 'D:/DevData/corepack-home',
    COREPACK_ENABLE_NETWORK: '0',
    DSH_HOME: join(dataDir, 'dsh-home'),
    DSH_TELEMETRY_DISABLED: '1',
    NPM_CONFIG_CACHE: cache,
    NPM_CONFIG_OFFLINE: 'true',
    PATH: [dirname(process.execPath), resolve(systemRoot!, 'System32')].join(delimiter),
    PATHEXT: process.env.PATHEXT,
    PNPM_CONFIG_CACHE_DIR: cache,
    PNPM_CONFIG_AUTO_INSTALL_PEERS: 'true',
    PNPM_CONFIG_OFFLINE: 'true',
    PNPM_CONFIG_STORE_DIR: selectedPnpmStore(process.env.PNPM_CONFIG_STORE_DIR),
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
    PNPM_CONFIG_VIRTUAL_STORE_DIR: virtualStore,
    SystemRoot: systemRoot,
    TEMP: temp,
    TMP: temp,
    WINDIR: process.env.WINDIR ?? systemRoot,
    ComSpec: process.env.ComSpec,
  }
}

function expectStoppedControlledReceipt(
  result: ReturnType<typeof run>,
  manifestDigest: string,
  reasonCode: string,
): void {
  expect(result.status, `${result.stdout}\n${result.stderr}\n${result.error?.message ?? ''}`).toBe(1)
  expect(result.stderr).toBe('')
  expect(result.stdout.endsWith('\n')).toBe(true)
  expect(result.stdout.trimEnd().split(/\r?\n/u)).toHaveLength(1)
  expect(JSON.parse(result.stdout)).toEqual({
    schemaVersion: 'tianwen.controlled-real-skill-lifecycle.v1',
    status: 'stopped',
    evidence: {
      source: 'configured-provider-capable',
      environment: 'development-only',
      defect: 'synthetic-defect',
      naturalUserEvidence: 'not-claimed',
      externalUserEvidence: 'not-claimed',
    },
    activityDigest: manifestDigest,
    completedStage: 'preflight',
    reasonCode,
    completedRoles: {
      seedRuns: 0,
      evaluationArms: 0,
      evaluators: 0,
      shadowRuns: 0,
      transitions: 0,
    },
  })
}

function requireDshBin(): string {
  const manifestPath = `${dshHostRoot}/node_modules/@deepseek-ai/dsh/package.json`
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    version?: string
    bin?: { dsh?: string }
  }
  expect(manifest.version).toBe('0.1.1-rc.2')
  const bin = manifest.bin?.dsh
  expect(typeof bin).toBe('string')
  const dshBin = resolve(dirname(manifestPath), bin!)
  expect(statSync(dshBin).isFile()).toBe(true)
  const installed = realpathSync(dshBin)
  expect(relative(realpathSync(dshHostRoot), installed).startsWith('..')).toBe(false)
  expectOutsideWorktree(installed)
  return installed
}

function bytesOrMissing(path: string): Buffer | undefined {
  return existsSync(path) ? readFileSync(path) : undefined
}

async function assertInstalledBundle(profileManifestPath: string): Promise<{
  readonly cli: string
}> {
  const requireFromProfile = createRequire(realpathSync(profileManifestPath))
  const runtimeResolved = requireFromProfile.resolve(`${runtimePackage}/runtime`)
  const smokeResolved = requireFromProfile.resolve(`${runtimePackage}/smoke`)
  const statusResolved = requireFromProfile.resolve(`${runtimePackage}/status`)
  const createRunnerResolved = requireFromProfile.resolve(`${runtimePackage}/create-runner`)
  const modelRunnerResolved = requireFromProfile.resolve(`${runtimePackage}/model-runner`)
  const resumeRunnerResolved = requireFromProfile.resolve(`${runtimePackage}/resume-runner`)
  const controlledRunnerResolved = requireFromProfile.resolve(
    `${runtimePackage}/controlled-lifecycle-runner`,
  )
  const runtimeRoot = resolve(dirname(runtimeResolved), '..')
  const runtimeManifest = JSON.parse(readFileSync(
    resolve(runtimeRoot, 'package.json'),
    'utf8',
  )) as {
    bin: { tianwen: string }
    dependencies: Record<string, string>
  }
  const requireFromRuntime = createRequire(resolve(runtimeRoot, 'package.json'))
  for (const external of Object.keys(runtimeManifest.dependencies).sort()) {
    await import(pathToFileURL(requireFromRuntime.resolve(external)).href)
  }
  const [
    runtime, smoke, status, createRunner, modelRunner, resumeRunner, controlledRunner,
  ] = await Promise.all([
    import(pathToFileURL(runtimeResolved).href),
    import(pathToFileURL(smokeResolved).href),
    import(pathToFileURL(statusResolved).href),
    import(pathToFileURL(createRunnerResolved).href),
    import(pathToFileURL(modelRunnerResolved).href),
    import(pathToFileURL(resumeRunnerResolved).href),
    import(pathToFileURL(controlledRunnerResolved).href),
  ])
  expect(runtime).toMatchObject({ name: 'tianwen-runtime', inject: [] })
  expect(smoke).toMatchObject({ name: 'tianwen-phase2-smoke', inject: ['llm', 'tools'] })
  expect(status.readGoalStatus).toBeTypeOf('function')
  expect(status.listGoals).toBeTypeOf('function')
  expect(createRunner.apply).toBeTypeOf('function')
  expect(modelRunner.apply).toBeTypeOf('function')
  expect(resumeRunner.apply).toBeTypeOf('function')
  expect(controlledRunner.apply).toBeTypeOf('function')
  expect(runtimeManifest.dependencies['@deepseek-ai/dsh-system-prompt']).toBe('0.1.1-rc.2')
  const cli = resolve(runtimeRoot, runtimeManifest.bin.tianwen)
  expect(statSync(cli).isFile()).toBe(true)
  return { cli }
}

async function start(): Promise<void> {
  rmSync(receiptPath, { force: true })
  rmSync(`${receiptPath}.tmp`, { force: true })
  rmSync(statusReceiptPath, { force: true })
  rmSync(`${statusReceiptPath}.tmp`, { force: true })
  rmSync(listReceiptPath, { force: true })
  rmSync(`${listReceiptPath}.tmp`, { force: true })
  rmSync(createReceiptPath, { force: true })
  rmSync(`${createReceiptPath}.tmp`, { force: true })
  rmSync(resumeReceiptPath, { force: true })
  rmSync(`${resumeReceiptPath}.tmp`, { force: true })
  const env = childEnvironment()
  const durableBeforeInstall = snapshotState()
  expect(existsSync(installer)).toBe(true)
  if (process.env.TIANWEN_DSH_INSTALLER_REUSE !== '1') {
    rmSync(dshHostRoot, { recursive: true, force: true })
    rmSync(dirname(profileRoot), { recursive: true, force: true })
    rmSync(archive, { force: true })
    rmSync(installReceiptPath, { force: true })
  }

  const firstInstall = run(process.execPath, [
    installer,
    '--data-dir',
    tianwenRoot,
    '--json',
  ], env, 2_100_000)
  expect(
    firstInstall.status,
    `${firstInstall.stdout}\n${firstInstall.stderr}\n${firstInstall.error?.message ?? ''}`,
  ).toBe(0)
  expect(firstInstall.stderr).toBe('')
  const installReceipt = JSON.parse(readFileSync(installReceiptPath, 'utf8')) as {
    schemaVersion: string
    status: string
    archiveDigest: string
    dataDir: string
    binDir: string
    hostRoot: string
    profileRoot: string
    archivePath: string
    receiptPath: string
    cliPath: string
    pnpmVersion: string
    dshVersion: string
    profileBundles: string[]
  }
  expect(JSON.parse(firstInstall.stdout)).toEqual(installReceipt)
  expect(Object.keys(installReceipt).sort()).toEqual([
    'archiveDigest',
    'archivePath',
    'binDir',
    'cliPath',
    'dataDir',
    'dshVersion',
    'hostRoot',
    'pnpmVersion',
    'profileBundles',
    'profileRoot',
    'receiptPath',
    'schemaVersion',
    'status',
  ])
  expect(installReceipt).toMatchObject({
    schemaVersion: 'tianwen.install.v1',
    status: 'ready',
    dataDir: resolve(tianwenRoot),
    hostRoot: resolve(dshHostRoot),
    profileRoot: resolve(profileRoot),
    archivePath: resolve(archive),
    receiptPath: resolve(installReceiptPath),
    pnpmVersion: '11.20.0',
    dshVersion: '0.1.1-rc.2',
    profileBundles: [
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-headless',
      runtimePackage,
    ],
  })
  expect(snapshotState()).toEqual(durableBeforeInstall)
  const dshBin = requireDshBin()
  const profileManifestPath = `${profileRoot}/package.json`
  const installed = await assertInstalledBundle(profileManifestPath)
  expect(realpathSync(installReceipt.cliPath)).toBe(realpathSync(installed.cli))
  expectOutsideWorktree(installed.cli)
  expect(installReceipt.archiveDigest).toBe(
    `sha256:${createHash('sha256').update(readFileSync(archive)).digest('hex')}`,
  )
  const receiptBytes = readFileSync(installReceiptPath)
  const replayStablePaths = [
    `${dshHostRoot}/node_modules/@deepseek-ai/dsh/package.json`,
    archive,
    `${profileRoot}/package.json`,
    `${profileRoot}/pnpm-workspace.yaml`,
    `${profileRoot}/cordis.patch.yml`,
  ]
  const managedBytes = replayStablePaths.map(path => readFileSync(path))

  const replay = run(process.execPath, [
    installer,
    '--data-dir',
    tianwenRoot,
    '--json',
  ], env, 600_000)
  expect(replay.status, `${replay.stdout}\n${replay.stderr}`).toBe(0)
  expect(replay.stderr).toBe('')
  expect(replay.stdout).toBe(firstInstall.stdout)
  expect(readFileSync(installReceiptPath)).toEqual(receiptBytes)
  expect(replayStablePaths.map(path => readFileSync(path))).toEqual(managedBytes)
  expect(snapshotState()).toEqual(durableBeforeInstall)
  expect(requireDshBin()).toBe(dshBin)
  const manifest = JSON.parse(readFileSync(profileManifestPath, 'utf8')) as {
    dependencies: Record<string, string>
    dsh: { profile: { bundles: string[] } }
  }
  expect(manifest.dsh.profile.bundles).toEqual([
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-headless',
    runtimePackage,
  ])
  expect(manifest.dependencies['@deepseek-ai/dsh-base']).toBe('0.1.1-rc.2')
  expect(manifest.dependencies['@deepseek-ai/dsh-headless']).toBe('0.1.1-rc.2')
  expect(manifest.dependencies[runtimePackage]).toBe(runtimePackageVersion)
  for (const packageName of manifest.dsh.profile.bundles) {
    const bundleRoot = realpathSync(resolve(profileRoot, 'node_modules', ...packageName.split('/')))
    expect(relative(realpathSync(profileRoot), bundleRoot).startsWith('..')).toBe(false)
  }

  const ledger = `${evolutionRoot}/ledger.jsonl`
  const champion = `${evolutionRoot}/champion.json`
  const ledgerBefore = bytesOrMissing(ledger)
  const championBefore = bytesOrMissing(champion)
  const sessionsBefore = new Set(listSessionLogs())
  const headless = run(process.execPath, [dshBin, '--profile', 'tianwen', taskText], env)
  expect(headless.status, `${headless.stdout}\n${headless.stderr}`).toBe(0)
  expect(headless.stdout.trim()).toBe('TIANWEN_PHASE2_OK')

  const created = listSessionLogs().filter(path => !sessionsBefore.has(path))
  expect(created).toHaveLength(1)
  const [headerLine, ...eventLines] = readFileSync(created[0]!, 'utf8').trimEnd().split(/\r?\n/u)
  const header = JSON.parse(headerLine!) as { id: string }
  const events = eventLines.map(line => JSON.parse(line) as SessionEvent)
  const calls = events.filter(event => event.type === 'tool/call')
  expect(calls.map(event => event.data.name)).toEqual([
    'create_goal',
    'tianwen_smoke_action',
    'update_goal',
  ])
  const results = events.filter(event => event.type === 'tool/result')
  expect(results).toHaveLength(3)
  expect(events.filter(event => event.type === 'step/start')).toHaveLength(4)
  const goalChanges = events.filter(event => event.type === 'goal/change')
  const finalGoalChange = goalChanges.at(-1)!.data as {
    goal: { id: string, revision: number, objective: string, maxGoalRounds: number, phase: string }
    roundsStarted: unknown
    updatedAt: number
  }
  const finalGoal = finalGoalChange.goal
  expect(finalGoal).toMatchObject({
    id: expect.any(String),
    revision: expect.any(Number),
    objective: 'prove the Tianwen phase 2 startup path',
    maxGoalRounds: 1,
    phase: 'complete',
  })
  expect(finalGoalChange.roundsStarted).toBe(0)
  expect(finalGoal).not.toHaveProperty('blockedReason')
  const completeResults = results.filter(event => event.data.message.source.callId === completeCallId)
  expect(completeResults).toHaveLength(1)
  const completeBlock = completeResults[0]!.data.message.content[0] as unknown
  expect(completeBlock).toMatchObject({ type: 'tool-result', content: [{ type: 'text' }] })
  const complete = JSON.parse((completeBlock as { content: [{ text: string }] }).content[0]!.text) as {
    goal: { id: string, revision: number, phase: string, roundsStarted: number }
    activation: string
  }
  expect(complete).toMatchObject({
    goal: {
      id: finalGoal.id,
      revision: finalGoal.revision,
      phase: finalGoal.phase,
      roundsStarted: 0,
    },
    activation: 'disarmed',
  })
  const evidence = projectEvidence(SessionId(header.id), events)
  expect(evidence.map(record => ({
    toolName: record.action.toolName,
    status: record.outcome.status,
  }))).toEqual([
    { toolName: 'create_goal', status: 'complete' },
    { toolName: 'tianwen_smoke_action', status: 'complete' },
    { toolName: 'update_goal', status: 'complete' },
  ])
  const evidenceText = JSON.stringify(evidence)
  for (const secret of [
    taskText,
    'prove the Tianwen phase 2 startup path',
    'phase2-smoke-action-ok',
    '{}',
  ]) expect(evidenceText).not.toContain(secret)
  expect(bytesOrMissing(ledger)).toEqual(ledgerBefore)
  expect(bytesOrMissing(champion)).toEqual(championBefore)

  const stateBeforeStatus = snapshotState()
  const sessionBeforeStatus = readFileSync(created[0]!)
  const statusRun = run(process.execPath, [
    installed.cli,
    'status',
    '--goal',
    finalGoal.id,
    '--data-dir',
    tianwenRoot,
    '--json',
  ], env)
  expect(statusRun.status, `${statusRun.stdout}\n${statusRun.stderr}`).toBe(0)
  expect(statusRun.stderr).toBe('')
  const status = JSON.parse(statusRun.stdout) as {
    schemaVersion: string
    goal: Record<string, unknown>
    session: { id: string, eventCount: number }
    evidence: {
      total: number
      counts: Record<string, number>
      items: { toolName: string, status: string }[]
    }
    champion: unknown
    runtime: Record<string, unknown>
  }
  expect(status).toEqual({
    schemaVersion: 'tianwen.goal-status.v1',
    goal: {
      id: finalGoal.id,
      revision: finalGoal.revision,
      objective: finalGoal.objective,
      phase: 'complete',
      maxGoalRounds: 1,
      roundsStarted: 0,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    },
    session: { id: header.id, eventCount: events.length },
    evidence: {
      total: 3,
      counts: { complete: 3, 'missing-result': 0 },
      items: [
        { toolName: 'create_goal', status: 'complete' },
        { toolName: 'tianwen_smoke_action', status: 'complete' },
        { toolName: 'update_goal', status: 'complete' },
      ],
    },
    champion: null,
    runtime: {
      activation: 'not-loaded',
      modelRequests: 0,
      readOnly: true,
    },
  })
  expect(snapshotState()).toEqual(stateBeforeStatus)
  const sessionAfterStatus = readFileSync(created[0]!)
  expect(sessionAfterStatus).toEqual(sessionBeforeStatus)
  const [, ...eventLinesAfterStatus] = sessionAfterStatus
    .toString('utf8')
    .trimEnd()
    .split(/\r?\n/u)
  const eventsAfterStatus = eventLinesAfterStatus
    .map(line => JSON.parse(line) as SessionEvent)
  for (const secret of [taskText, 'phase2-smoke-action-ok', completeCallId]) {
    expect(statusRun.stdout).not.toContain(secret)
  }

  const stateBeforeList = snapshotState()
  const sessionBeforeList = sessionAfterStatus
  const modelStepsBeforeList = eventsAfterStatus
    .filter(event => event.type === 'step/start').length
  const listRun = run(process.execPath, [
    installed.cli,
    'list',
    '--data-dir',
    tianwenRoot,
    '--json',
  ], env)
  expect(listRun.status, `${listRun.stdout}\n${listRun.stderr}`).toBe(0)
  expect(listRun.stderr).toBe('')
  const list = JSON.parse(listRun.stdout) as {
    schemaVersion: string
    goals: {
      id: string
      objective: string
      phase: string
      maxGoalRounds: number
      roundsStarted: number
      updatedAt: number
      session: { id: string, eventCount: number }
    }[]
    runtime: Record<string, unknown>
  }
  expect(list).toEqual({
    schemaVersion: 'tianwen.goal-list.v1',
    goals: expect.any(Array),
    runtime: {
      activation: 'not-loaded',
      modelRequests: 0,
      readOnly: true,
    },
  })
  const matchingGoals = list.goals.filter(goal => goal.id === finalGoal.id)
  expect(matchingGoals).toEqual([{
      id: finalGoal.id,
      objective: finalGoal.objective,
      phase: 'complete',
      maxGoalRounds: 1,
      roundsStarted: 0,
      updatedAt: finalGoalChange.updatedAt,
      session: { id: header.id, eventCount: events.length },
  }])
  expect(snapshotState()).toEqual(stateBeforeList)
  const sessionAfterList = readFileSync(created[0]!)
  expect(sessionAfterList).toEqual(sessionBeforeList)
  const [, ...eventLinesAfterList] = sessionAfterList
    .toString('utf8')
    .trimEnd()
    .split(/\r?\n/u)
  const eventsAfterList = eventLinesAfterList
    .map(line => JSON.parse(line) as SessionEvent)
  expect(eventsAfterList.filter(event => event.type === 'step/start'))
    .toHaveLength(4)
  for (const secret of [taskText, 'phase2-smoke-action-ok', completeCallId]) {
    expect(listRun.stdout).not.toContain(secret)
  }

  const receipt = {
    schemaVersion: 'tianwen.phase2-startup.v1',
    profile: {
      name: 'tianwen',
      layers: [
        '@deepseek-ai/dsh-base',
        '@deepseek-ai/dsh-headless',
        runtimePackage,
      ],
    },
    command: { exitCode: 0, stdout: 'TIANWEN_PHASE2_OK' },
    session: { id: String(header.id), modelSteps: 4 },
    goal: {
      objective: 'prove the Tianwen phase 2 startup path',
      maxGoalRounds: 1,
      roundsStarted: 0,
      phase: 'complete',
      activation: 'disarmed',
    },
    evidence: [
      { toolName: 'create_goal', status: 'complete' },
      { toolName: 'tianwen_smoke_action', status: 'complete' },
      { toolName: 'update_goal', status: 'complete' },
    ],
    evolution: { transitionCountDelta: 0, championChanged: false },
    forbiddenEffects: {
      paidModelRequests: 0,
      liveWebRequests: 0,
      dockerInvocations: 0,
      credentialVariablesPassed: Object.keys(env)
        .filter(key => /(?:api[_-]?key|token|secret|password)/iu.test(key)),
    },
  }
  expect(receipt.forbiddenEffects.credentialVariablesPassed).toEqual([])
  publishReceipt(receiptPath, receipt)
  expect(JSON.parse(readFileSync(receiptPath, 'utf8'))).toEqual(receipt)
  const statusReceipt = {
    schemaVersion: 'tianwen.goal-status-e2e.v1',
    goalId: finalGoal.id,
    sessionId: header.id,
    modelStepsBefore: 4,
    modelStepsAfter: eventsAfterStatus
      .filter(event => event.type === 'step/start').length,
    stateUnchanged: true,
    evidence: status.evidence.items,
    champion: status.champion,
    runtime: status.runtime,
  }
  expect(statusReceipt.modelStepsAfter).toBe(statusReceipt.modelStepsBefore)
  publishReceipt(statusReceiptPath, statusReceipt)
  expect(JSON.parse(readFileSync(statusReceiptPath, 'utf8')))
    .toEqual(statusReceipt)
  const listedGoal = matchingGoals[0]!
  const listReceipt = {
    schemaVersion: 'tianwen.goal-list-e2e.v1',
    goal: {
      id: listedGoal.id,
      objective: listedGoal.objective,
      phase: listedGoal.phase,
      maxGoalRounds: listedGoal.maxGoalRounds,
      roundsStarted: listedGoal.roundsStarted,
      updatedAt: listedGoal.updatedAt,
    },
    session: listedGoal.session,
    modelStepsBefore: modelStepsBeforeList,
    modelStepsAfter: eventsAfterList
      .filter(event => event.type === 'step/start').length,
    stateUnchanged: true,
    runtime: list.runtime,
  }
  expect(listReceipt.modelStepsBefore).toBe(4)
  expect(listReceipt.modelStepsAfter).toBe(listReceipt.modelStepsBefore)
  publishReceipt(listReceiptPath, listReceipt)
  expect(JSON.parse(readFileSync(listReceiptPath, 'utf8')))
    .toEqual(listReceipt)

  const sessionsBeforeCreate = new Set(listSessionLogs())
  const championBeforeCreate = bytesOrMissing(champion)
  const ledgerBeforeCreate = bytesOrMissing(ledger)
  const createRun = run(process.execPath, [
    installed.cli,
    'create',
    '--objective',
    'prove explicit Tianwen Goal resume',
    '--max-rounds',
    '1',
    '--data-dir',
    tianwenRoot,
    '--json',
  ], env)
  expect(createRun.status, `${createRun.stdout}\n${createRun.stderr}`).toBe(0)
  expect(createRun.stderr).toBe('')
  const createdGoal = JSON.parse(createRun.stdout) as {
    schemaVersion: string
    goal: {
      id: string
      maxGoalRounds: number
      objective: string
      phase: string
      revision: number
      roundsStarted: number
    }
    session: { eventCount: number, id: string, modelRequestsDelta: number }
  }
  expect(createdGoal).toEqual({
    schemaVersion: 'tianwen.goal-create.v1',
    goal: {
      id: expect.any(String),
      maxGoalRounds: 1,
      objective: 'prove explicit Tianwen Goal resume',
      phase: 'active',
      revision: 1,
      roundsStarted: 0,
    },
    session: {
      eventCount: expect.any(Number),
      id: expect.stringMatching(/^tianwen-goal-/u),
      modelRequestsDelta: 0,
    },
  })
  const createdLogs = listSessionLogs().filter(path => !sessionsBeforeCreate.has(path))
  expect(createdLogs).toHaveLength(1)
  const resumeLog = createdLogs[0]
  expect(resumeLog).toBeDefined()
  const [, ...resumeBeforeLines] = readFileSync(resumeLog!, 'utf8')
    .trimEnd()
    .split(/\r?\n/u)
  const resumeBeforeEvents = resumeBeforeLines.map(line => JSON.parse(line) as SessionEvent)
  expect(resumeBeforeEvents.filter(event => event.type === 'step/start')).toHaveLength(0)
  expect(resumeBeforeEvents.filter(event => event.type === 'request/header')).toHaveLength(0)
  expect(resumeBeforeEvents.filter(event => event.type === 'goal/change')).toHaveLength(1)
  expect(createdGoal.session.eventCount).toBe(resumeBeforeEvents.length)
  expect(bytesOrMissing(champion)).toEqual(championBeforeCreate)
  expect(bytesOrMissing(ledger)).toEqual(ledgerBeforeCreate)

  const createdStatusRun = run(process.execPath, [
    installed.cli, 'status', '--goal', createdGoal.goal.id,
    '--data-dir', tianwenRoot, '--json',
  ], env)
  expect(createdStatusRun.status).toBe(0)
  expect(JSON.parse(createdStatusRun.stdout)).toMatchObject({
    goal: createdGoal.goal,
    session: { id: createdGoal.session.id },
    runtime: { modelRequests: 0, readOnly: true },
  })
  const createdListRun = run(process.execPath, [
    installed.cli, 'list', '--data-dir', tianwenRoot, '--json',
  ], env)
  expect(createdListRun.status).toBe(0)
  expect((JSON.parse(createdListRun.stdout) as {
    goals: { id: string }[]
  }).goals.map(goal => goal.id)).toContain(createdGoal.goal.id)
  publishReceipt(createReceiptPath, createdGoal)
  expect(JSON.parse(readFileSync(createReceiptPath, 'utf8'))).toEqual(createdGoal)

  const championBeforeResume = bytesOrMissing(champion)
  const ledgerBeforeResume = bytesOrMissing(ledger)

  const resumeRun = run(process.execPath, [
    installed.cli,
    'resume',
    '--goal',
    createdGoal.goal.id,
    '--data-dir',
    tianwenRoot,
    '--json',
  ], env)
  expect(resumeRun.status, `${resumeRun.stdout}\n${resumeRun.stderr}`).toBe(0)
  expect(resumeRun.stderr).toBe('')
  const resumeResult = JSON.parse(resumeRun.stdout) as {
    schemaVersion: string
    goal: { id: string, revision: number, phase: string, roundsStarted: number }
    session: {
      id: string
      eventCountBefore: number
      eventCountAfter: number
      eventCountDelta: number
      modelRequestsDelta: number
    }
  }
  expect(resumeResult).toEqual({
    schemaVersion: 'tianwen.goal-resume.v1',
    goal: {
      id: createdGoal.goal.id,
      revision: createdGoal.goal.revision + 2,
      phase: 'complete',
      roundsStarted: 1,
    },
    session: {
      id: createdGoal.session.id,
      eventCountBefore: expect.any(Number),
      eventCountAfter: expect.any(Number),
      eventCountDelta: expect.any(Number),
      modelRequestsDelta: 2,
    },
  })
  expect(resumeResult.session.eventCountAfter - resumeResult.session.eventCountBefore)
    .toBe(resumeResult.session.eventCountDelta)
  expect(resumeResult.session.eventCountBefore).toBeGreaterThanOrEqual(
    resumeBeforeEvents.length,
  )

  const [, ...resumeAfterLines] = readFileSync(resumeLog!, 'utf8')
    .trimEnd()
    .split(/\r?\n/u)
  const resumeAfterEvents = resumeAfterLines.map(line => JSON.parse(line) as SessionEvent)
  const added = resumeAfterEvents.slice(resumeResult.session.eventCountBefore)
  const resumeChanges = added.filter(event =>
    event.type === 'goal/change' && event.data.operation === 'resume')
  expect(resumeChanges).toHaveLength(1)
  expect(added.filter(event => event.type === 'request/header')).toHaveLength(1)
  expect(added.filter(event => event.type === 'step/start')).toHaveLength(2)
  expect(added.filter(event =>
    event.type === 'user/message' && event.data.source.kind === 'goal'))
    .toHaveLength(1)
  expect(bytesOrMissing(champion)).toEqual(championBeforeResume)
  expect(bytesOrMissing(ledger)).toEqual(ledgerBeforeResume)

  const stateAfterResume = snapshotState()
  const secondResume = run(process.execPath, [
    installed.cli,
    'resume',
    '--goal',
    createdGoal.goal.id,
    '--data-dir',
    tianwenRoot,
    '--json',
  ], env)
  expect(secondResume.status).toBe(1)
  expect(secondResume.stdout).toBe('')
  expect(secondResume.stderr).toBe('Error: Goal is complete\n')
  expect(snapshotState()).toEqual(stateAfterResume)

  const modelSentinel = randomUUID()
  const fakeFetch = resolve(root, 'tests/dsh-migration/fixtures/deepseek-goal-round-fetch.cjs')
  const fetchTracePath = join(
    formalStartupEnvironmentPaths(tianwenRoot).temp,
    `goal-round-fetch-${randomUUID()}.jsonl`,
  )
  rmSync(fetchTracePath, { force: true })
  const modelEnv = {
    ...env,
    DEEPSEEK_API_KEY: modelSentinel,
    NODE_OPTIONS: `--require=${fakeFetch}`,
    TIANWEN_GOAL_ROUND_FETCH_TRACE: fetchTracePath,
  }
  expect(modelEnv).toMatchObject({
    NODE_OPTIONS: `--require=${fakeFetch}`,
    TIANWEN_GOAL_ROUND_FETCH_TRACE: fetchTracePath,
  })
  const guardProbe = run(process.execPath, [
    '--input-type=module',
    '--eval',
    "await fetch('http://127.0.0.1:9/')",
  ], modelEnv)
  expect(guardProbe.status).not.toBe(0)
  expect(existsSync(fetchTracePath)).toBe(false)
  const modelAuthorityBefore = {
    goal: readFileSync(resumeLog!),
    session: new Map(listSessionLogs().map(path => [path, readFileSync(path)] as const)),
    evolution: snapshotState(),
    champion: bytesOrMissing(champion),
  }
  const modelStatus = run(process.execPath, [
    installed.cli,
    'model',
    'status',
    '--data-dir',
    tianwenRoot,
    '--json',
  ], modelEnv)
  expect(modelStatus.status, `${modelStatus.stdout}\n${modelStatus.stderr}`).toBe(0)
  expect(modelStatus.stderr).toBe('')
  const offlineModelStatus = JSON.parse(modelStatus.stdout) as {
    operation: string
    selection: { provider: string, model: string }
    credential: { configured: boolean, source?: string }
    modelRequestsDelta: number
  }
  expect(offlineModelStatus).toMatchObject({
    operation: 'status',
    selection: { provider: 'tianwen-offline', model: 'phase2-smoke' },
    credential: { configured: true, source: 'env' },
    modelRequestsDelta: 0,
  })

  const useV4Pro = run(process.execPath, [
    installed.cli,
    'model',
    'use',
    '--model',
    'deepseek-v4-pro',
    '--data-dir',
    tianwenRoot,
    '--json',
  ], modelEnv)
  expect(useV4Pro.status, `${useV4Pro.stdout}\n${useV4Pro.stderr}`).toBe(0)
  expect(useV4Pro.stderr).toBe('')
  expect(JSON.parse(useV4Pro.stdout)).toMatchObject({
    operation: 'use',
    selection: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    modelRequestsDelta: 0,
  })

  const freshV4ProStatus = run(process.execPath, [
    installed.cli,
    'model',
    'status',
    '--data-dir',
    tianwenRoot,
    '--json',
  ], modelEnv)
  expect(freshV4ProStatus.status, `${freshV4ProStatus.stdout}\n${freshV4ProStatus.stderr}`).toBe(0)
  expect(freshV4ProStatus.stderr).toBe('')
  expect(JSON.parse(freshV4ProStatus.stdout)).toMatchObject({
    operation: 'status',
    selection: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    credential: { configured: true, source: 'env' },
    modelRequestsDelta: 0,
  })

  try {
    const liveSessionsBeforeCreate = new Set(listSessionLogs())
    const liveCreate = run(process.execPath, [
      installed.cli, 'create', '--objective', liveGoalObjective, '--max-rounds', '1',
      '--data-dir', tianwenRoot, '--json',
    ], modelEnv)
    expect(liveCreate.status, `${liveCreate.stdout}\n${liveCreate.stderr}`).toBe(0)
    expect(liveCreate.stderr).toBe('')
    const liveGoal = JSON.parse(liveCreate.stdout) as {
      goal: { id: string, revision: number, objective: string, phase: string, maxGoalRounds: number, roundsStarted: number }
      session: { id: string, eventCount: number, modelRequestsDelta: number }
    }
    expect(liveGoal).toMatchObject({
      goal: { id: expect.any(String), revision: 1, objective: liveGoalObjective,
        phase: 'active', maxGoalRounds: 1, roundsStarted: 0 },
      session: { id: expect.any(String), eventCount: 1, modelRequestsDelta: 0 },
    })
    const liveLogs = listSessionLogs().filter(path => !liveSessionsBeforeCreate.has(path))
    expect(liveLogs).toHaveLength(1)
    const liveLog = liveLogs[0]!
    const liveStatusBefore = run(process.execPath, [
      installed.cli, 'status', '--goal', liveGoal.goal.id, '--data-dir', tianwenRoot, '--json',
    ], modelEnv)
    const liveListBefore = run(process.execPath, [
      installed.cli, 'list', '--data-dir', tianwenRoot, '--json',
    ], modelEnv)
    expect(liveStatusBefore.status).toBe(0)
    expect(liveListBefore.status).toBe(0)
    expect(JSON.parse(liveStatusBefore.stdout)).toMatchObject({
      goal: liveGoal.goal, runtime: { modelRequests: 0, readOnly: true },
    })
    expect((JSON.parse(liveListBefore.stdout) as { goals: { id: string }[] }).goals
      .map(goal => goal.id)).toContain(liveGoal.goal.id)
    expect(existsSync(fetchTracePath)).toBe(false)

    const liveBefore = {
      sessions: snapshotTree(sessionsRoot),
      evolution: snapshotTree(evolutionRoot),
      receipts: snapshotTree(`${tianwenRoot}/receipts`),
      champion: bytesOrMissing(champion),
      log: readFileSync(liveLog),
    }
    const [, ...liveBeforeLines] = liveBefore.log.toString('utf8').trimEnd().split(/\r?\n/u)
    const liveBeforeEvents = liveBeforeLines.map(line => JSON.parse(line) as SessionEvent)
    expect(liveBeforeEvents).toHaveLength(1)
    expect(liveBeforeEvents[0]).toMatchObject({ type: 'goal/change', data: { operation: 'create' } })

    const strictResume = run(process.execPath, [
      installed.cli, 'resume', '--goal', liveGoal.goal.id, '--data-dir', tianwenRoot,
      '--live-smoke', '--json',
    ], modelEnv, 120_000)
    expect(strictResume.status, `${strictResume.stdout}\n${strictResume.stderr}`).toBe(0)
    expect(strictResume.stderr).toBe('')
    const strictReceipt = JSON.parse(strictResume.stdout) as Record<string, unknown>
    const trace = readFileSync(fetchTracePath, 'utf8').trimEnd().split(/\r?\n/u)
      .map(line => JSON.parse(line) as Record<string, unknown>)
    expect(trace).toEqual([1, 2, 3].map(ordinal => ({
      ordinal, model: 'deepseek-v4-pro', max_tokens: 128,
      tool_names: ['tianwen_smoke_action', 'update_goal'], authorization_present: true,
    })))

    const [, ...liveAfterLines] = readFileSync(liveLog, 'utf8').trimEnd().split(/\r?\n/u)
    const liveAfterEvents = liveAfterLines.map(line => JSON.parse(line) as SessionEvent)
    const liveAdded = liveAfterEvents.slice(liveBeforeEvents.length)
    expect(liveAdded[0]).toMatchObject({ seq: 1, type: 'session/end-seed' })
    const resumeChange = (event: SessionEvent) =>
      event.type === 'goal/change' && event.data.operation === 'resume'
    expect(liveAdded.filter(resumeChange)).toHaveLength(1)
    const resumeIndex = liveAdded.findIndex(resumeChange)
    expect(resumeIndex).toBe(1)
    const runnerAdded = liveAdded.slice(resumeIndex)
    expect(runnerAdded).toHaveLength(42)
    const liveCalls = liveAdded.filter(event => event.type === 'tool/call')
    const liveResults = liveAdded.filter(event => event.type === 'tool/result')
    const liveAssistants = liveAdded.filter(event => event.type === 'assistant/message')
    expect(liveCalls.map(event => event.data.name)).toEqual(['tianwen_smoke_action', 'update_goal'])
    expect(liveResults).toHaveLength(2)
    expect(liveAssistants).toHaveLength(3)
    const [actionCall, updateCall] = liveCalls
    expect(actionCall!.data.arguments).toBe('{}')
    expect(JSON.parse(updateCall!.data.arguments)).toEqual({
      goal_id: liveGoal.goal.id,
      revision: 2,
      action: 'complete',
    })
    const resultFor = (call: typeof liveCalls[number]) => {
      const matches = liveResults.filter(result =>
        String(result.data.message.source.callId) === String(call.data.callId))
      expect(matches).toHaveLength(1)
      return matches[0]!
    }
    const actionResult = resultFor(actionCall!)
    const updateResult = resultFor(updateCall!)
    for (const [call, result] of [[actionCall!, actionResult], [updateCall!, updateResult]] as const) {
      expect(result.data.error).toBeUndefined()
      expect(result.data.message).toMatchObject({
        role: 'user',
        source: { kind: 'tool', callId: call.data.callId },
      })
      expect(result.data.message.content).toHaveLength(1)
      expect(result.data.message.content[0]).toMatchObject({
        type: 'tool-result', toolCallId: call.data.callId, isError: false,
      })
    }
    const updateBlock = updateResult.data.message.content[0]
    expect(updateBlock!.content).toHaveLength(1)
    const updateText = updateBlock!.content[0]
    expect(updateText).toMatchObject({ type: 'text' })
    expect(JSON.parse((updateText as { text: string }).text)).toMatchObject({
      goal: {
        id: liveGoal.goal.id,
        revision: 3,
        phase: 'complete',
        roundsStarted: 1,
        maxGoalRounds: 1,
      },
      activation: 'disarmed',
    })
    expect(liveAssistants.map(event => event.data.usage)).toEqual([
      { inputTokens: 96, outputTokens: 10, cacheReadTokens: 5 },
      { inputTokens: 97, outputTokens: 10, cacheReadTokens: 5 },
      { inputTokens: 98, outputTokens: 10, cacheReadTokens: 5 },
    ])
    expect(liveCalls[0]!.seq).toBeLessThan(liveResults[0]!.seq)
    expect(liveResults[0]!.seq).toBeLessThan(liveCalls[1]!.seq)
    expect(liveCalls[1]!.seq).toBeLessThan(liveResults[1]!.seq)
    expect(liveResults[1]!.seq).toBeLessThan(liveAssistants[2]!.seq)
    expect(liveAssistants[2]!.data.message.content).toEqual([
      { type: 'text', text: 'TIANWEN_GOAL_ROUND_OK' },
    ])
    const liveEvidence = projectEvidence(SessionId(liveGoal.session.id), liveAfterEvents)
      .filter(record => ['tianwen_smoke_action', 'update_goal'].includes(record.action.toolName))
    expect(liveEvidence.map(record => ({ toolName: record.action.toolName, status: record.outcome.status })))
      .toEqual([
        { toolName: 'tianwen_smoke_action', status: 'complete' },
        { toolName: 'update_goal', status: 'complete' },
      ])
    const strictUsage = {
      inputTokens: 291,
      outputTokens: 30,
      cacheReadTokens: 15,
      cacheWriteTokens: 0,
      totalTokens: 336,
      estimatedCostCny: (291 * 3 + 15 * 0.025 + 0 * 3 + 30 * 6) / 1_000_000,
    }
    expect(strictReceipt).toEqual({
      schemaVersion: 'tianwen.goal-live-smoke.v1',
      status: 'passed',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      limits: {
        maxRequests: 3,
        maxOutputTokensPerRequest: 128,
        maxTotalTokens: 32768,
        maxCostCny: 0.25,
        timeoutMs: 90000,
        maxRetries: 0,
      },
      requestCount: 3,
      retryCount: 0,
      markerMatched: true,
      goal: { id: liveGoal.goal.id, revision: 3, phase: 'complete', roundsStarted: 1 },
      session: { id: liveGoal.session.id, eventCountDelta: runnerAdded.length },
      usage: strictUsage,
      evidence: liveEvidence.map(record => ({
        evidenceId: record.evidenceId,
        toolName: record.action.toolName,
        outcome: 'complete',
      })),
      governance: { evolutionUnchanged: true, championUnchanged: true },
    })
    expect(Number.isNaN(Date.parse(String(strictReceipt.timestamp)))).toBe(false)
    const liveStatusAfter = run(process.execPath, [
      installed.cli, 'status', '--goal', liveGoal.goal.id, '--data-dir', tianwenRoot, '--json',
    ], modelEnv)
    expect(liveStatusAfter.status).toBe(0)
    expect(JSON.parse(liveStatusAfter.stdout)).toMatchObject({
      goal: { id: liveGoal.goal.id, revision: 3, phase: 'complete', roundsStarted: 1 },
      evidence: { total: 2, counts: { complete: 2, 'missing-result': 0 } },
      runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
    })
    const liveAfterSessions = snapshotTree(sessionsRoot)
    delete (liveAfterSessions as Record<string, string>)[`file:${relative(sessionsRoot, liveLog).replaceAll('\\', '/')}`]
    const liveBeforeSessions = { ...liveBefore.sessions }
    delete (liveBeforeSessions as Record<string, string>)[`file:${relative(sessionsRoot, liveLog).replaceAll('\\', '/')}`]
    expect(liveAfterSessions).toEqual(liveBeforeSessions)
    expect(snapshotTree(evolutionRoot)).toEqual(liveBefore.evolution)
    expect(snapshotTree(`${tianwenRoot}/receipts`)).toEqual(liveBefore.receipts)
    expect(bytesOrMissing(champion)).toEqual(liveBefore.champion)

    const beforeSecondStrict = {
      sessions: snapshotTree(sessionsRoot), evolution: snapshotTree(evolutionRoot),
      receipts: snapshotTree(`${tianwenRoot}/receipts`), trace: readFileSync(fetchTracePath),
    }
    const secondStrict = run(process.execPath, [
      installed.cli, 'resume', '--goal', liveGoal.goal.id, '--data-dir', tianwenRoot,
      '--live-smoke', '--json',
    ], modelEnv)
    expect(secondStrict.status).toBe(1)
    expect(secondStrict.stderr).toBe('')
    expect(JSON.parse(secondStrict.stdout)).toMatchObject({
      schemaVersion: 'tianwen.goal-live-smoke.v1', status: 'failed', failureCode: 'preflight-rejected',
      requestCount: 0, retryCount: 0, markerMatched: false,
    })
    expect(snapshotTree(sessionsRoot)).toEqual(beforeSecondStrict.sessions)
    expect(snapshotTree(evolutionRoot)).toEqual(beforeSecondStrict.evolution)
    expect(snapshotTree(`${tianwenRoot}/receipts`)).toEqual(beforeSecondStrict.receipts)
    expect(readFileSync(fetchTracePath)).toEqual(beforeSecondStrict.trace)
    for (const path of [liveLog, fetchTracePath, ...globSync('receipts/**/*', {
      cwd: tianwenRoot, withFileTypes: true,
    }).filter(entry => entry.isFile()).map(entry => resolve(entry.parentPath, entry.name))]) {
      const text = readFileSync(path, 'utf8')
      expect(text).not.toContain(modelSentinel)
      expect(text).not.toContain('OFFLINE_DEEPSEEK_RAW_RESPONSE')
    }
  } finally {
  const useOffline = run(process.execPath, [
    installed.cli,
    'model',
    'use',
    '--model',
    'offline',
    '--data-dir',
    tianwenRoot,
    '--json',
  ], modelEnv)
  expect(useOffline.status, `${useOffline.stdout}\n${useOffline.stderr}`).toBe(0)
  expect(useOffline.stderr).toBe('')
  expect(JSON.parse(useOffline.stdout)).toMatchObject({
    operation: 'use',
    selection: { provider: 'tianwen-offline', model: 'phase2-smoke' },
    modelRequestsDelta: 0,
  })

  const freshOfflineStatus = run(process.execPath, [
    installed.cli,
    'model',
    'status',
    '--data-dir',
    tianwenRoot,
    '--json',
  ], modelEnv)
  expect(freshOfflineStatus.status, `${freshOfflineStatus.stdout}\n${freshOfflineStatus.stderr}`).toBe(0)
  expect(freshOfflineStatus.stderr).toBe('')
  expect(JSON.parse(freshOfflineStatus.stdout)).toMatchObject({
    operation: 'status',
    selection: { provider: 'tianwen-offline', model: 'phase2-smoke' },
    credential: { configured: true, source: 'env' },
    modelRequestsDelta: 0,
  })
  }

  for (const child of [modelStatus, useV4Pro, freshV4ProStatus]) {
    expect(`${child.stdout}\n${child.stderr}`).not.toContain(modelSentinel)
  }
  const receiptFiles = globSync('receipts/**/*', {
    cwd: tianwenRoot,
    withFileTypes: true,
  })
    .filter(entry => entry.isFile())
    .map(entry => resolve(entry.parentPath, entry.name))
  for (const receipt of receiptFiles) {
    expect(readFileSync(receipt, 'utf8')).not.toContain(modelSentinel)
  }
  expect(readFileSync(resumeLog!)).toEqual(modelAuthorityBefore.goal)
  for (const [path, bytes] of modelAuthorityBefore.session) {
    expect(readFileSync(path)).toEqual(bytes)
  }
  expect(bytesOrMissing(champion)).toEqual(modelAuthorityBefore.champion)
  const resumeReceipt = {
    schemaVersion: 'tianwen.goal-resume-e2e.v1',
    goal: resumeResult.goal,
    session: resumeResult.session,
    resumeTransitions: resumeChanges.length,
    modelRequests: added.filter(event => event.type === 'step/start').length,
    secondAttempt: { exitCode: secondResume.status, stateUnchanged: true },
    evolution: { transitionCountDelta: 0, championChanged: false },
  }
  publishReceipt(resumeReceiptPath, resumeReceipt)
  expect(JSON.parse(readFileSync(resumeReceiptPath, 'utf8')))
    .toEqual(resumeReceipt)
}

describe('Tianwen formal headless startup', () => {
  it('keeps the Profile Runtime version aligned with the published archive', () => {
    expect(archive).toContain(`-${runtimePackageVersion}.tgz`)
  })

  it.each([
    ['inherits the controller store', 'D:/DevData/controller-pnpm-store', 'D:/DevData/controller-pnpm-store'],
    ['uses the D drive fallback', undefined, 'D:/DevData/pnpm-store'],
  ])('%s for fixture installs', (_label, configuredStore, expectedStore) => {
    expect(selectedPnpmStore(configuredStore)).toBe(expectedStore)
  })

  it('keeps formal startup environment directories beside the product root', () => {
    const productRoot = resolve('D:/DevData/tianwen-startup-boundary-product')
    const environmentRoot = resolve(`${productRoot}-environment`)
    const paths = formalStartupEnvironmentPaths(productRoot)

    expect(paths).toEqual({
      temp: join(environmentRoot, 'temp'),
      virtualStore: join(environmentRoot, 'virtual-store'),
    })
    for (const path of Object.values(paths)) {
      expect(relative(productRoot, path)).toMatch(/^\.\.(?:[\\/]|$)/u)
    }
  })

  it.runIf(controlledInstalledEnabled)(
    'installs the controlled lifecycle runner and stops four child preflights without Provider activity',
    async () => {
      mkdirSync(controlledFixtureBase, { recursive: true })
      const dataDir = join(controlledFixtureBase, `product-${randomUUID()}`)
      const env = controlledInstallEnvironment(dataDir)
      let completed = false
      try {
        const installedResult = run(process.execPath, [
          installer,
          '--data-dir', dataDir,
          '--json',
        ], env, 2_100_000)
        expect(
          installedResult.status,
          `${installedResult.stdout}\n${installedResult.stderr}\n${installedResult.error?.message ?? ''}`,
        ).toBe(0)
        expect(installedResult.stderr).toBe('')
        const installReceipt = JSON.parse(installedResult.stdout) as {
          archiveDigest: string
          cliPath: string
          hostRoot: string
          profileRoot: string
        }
        const installedBundle = await assertInstalledBundle(
          join(installReceipt.profileRoot, 'package.json'),
        )
        expect(realpathSync(installReceipt.cliPath)).toBe(realpathSync(installedBundle.cli))

        const operationRoot = join(dataDir, 'controlled-operation', 'activity-01')
        const manifestPath = join(operationRoot, 'manifest.json')
        const manifest = controlledManifest(
          dataDir,
          operationRoot,
          installReceipt.archiveDigest,
        )
        const workspaceRoots = [
          ...manifest.tasks.seeds.map(task => task.workspaceRoot),
          ...manifest.tasks.evaluations.flatMap(task => [
            task.baselineWorkspaceRoot,
            task.candidateWorkspaceRoot,
          ]),
          ...manifest.tasks.shadows.map(task => task.workspaceRoot),
          ...manifest.tasks.transitions.map(task => task.workspaceRoot),
        ]
        expect(workspaceRoots).toHaveLength(20)
        for (const workspaceRoot of workspaceRoots) {
          mkdirSync(workspaceRoot, { recursive: true })
          writeFileSync(join(workspaceRoot, 'case.md'), 'controlled installed preflight\n', 'utf8')
        }
        writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8')
        const manifestDigest = readControlledLifecycleManifest(manifestPath).manifestDigest
        const dshManifestPath = join(
          installReceipt.hostRoot,
          'node_modules', '@deepseek-ai', 'dsh', 'package.json',
        )
        const dshManifest = JSON.parse(readFileSync(dshManifestPath, 'utf8')) as {
          bin: { dsh: string }
        }
        const dshBin = resolve(dirname(dshManifestPath), dshManifest.bin.dsh)
        const controlledPatch = join(
          installReceipt.profileRoot,
          'node_modules', '@tianwen', 'runtime-bundle', 'controlled-lifecycle.patch.yml',
        )

        const mismatchedDigest = `sha256:${'f'.repeat(64)}`
        const childMismatch = run(process.execPath, [
          dshBin,
          '--profile', 'tianwen',
          '--patch', controlledPatch,
        ], {
          ...env,
          DSH_HOME: join(dataDir, 'dsh-home'),
          TIANWEN_CONTROLLED_DATA_DIR: dataDir,
          TIANWEN_CONTROLLED_JSON: 'true',
          TIANWEN_CONTROLLED_MANIFEST_DIGEST: mismatchedDigest,
          TIANWEN_CONTROLLED_MANIFEST_PATH: manifestPath,
        })
        expectStoppedControlledReceipt(
          childMismatch,
          mismatchedDigest,
          'manifest-revalidation-failed',
        )

        const command = [
          'controlled-lifecycle',
          '--manifest', manifestPath,
          '--data-dir', dataDir,
          '--json',
        ]
        expectStoppedControlledReceipt(
          run(process.execPath, [installedBundle.cli, ...command], env),
          manifestDigest,
          'credential-missing',
        )
        expectStoppedControlledReceipt(
          run(process.execPath, [installedBundle.cli, ...command], {
            ...env,
            DEEPSEEK_API_KEY: `installed-zero-provider-${randomUUID()}`,
          }),
          manifestDigest,
          'selection-mismatch',
        )

        const sessionsRoot = join(dataDir, 'dsh-home', 'sessions')
        const existingSession = join(
          sessionsRoot,
          '_no-cwd',
          'installed-preexisting',
          'session.jsonl',
        )
        mkdirSync(dirname(existingSession), { recursive: true })
        writeFileSync(existingSession, `${JSON.stringify({
          type: 'session',
          version: 0,
          id: 'installed-preexisting',
          createdAt: 0,
          delegationDepth: 0,
        })}\n`, 'utf8')
        expectStoppedControlledReceipt(
          run(process.execPath, [installedBundle.cli, ...command], {
            ...env,
            DEEPSEEK_API_KEY: `installed-zero-provider-${randomUUID()}`,
          }),
          manifestDigest,
          'session-not-fresh',
        )

        const sessionLogs = globSync('**/session.jsonl', { cwd: sessionsRoot })
        expect(sessionLogs).toHaveLength(1)
        expect(resolve(sessionsRoot, sessionLogs[0]!)).toBe(existingSession)
        expect(readFileSync(existingSession, 'utf8').trimEnd().split(/\r?\n/u)).toHaveLength(1)
        expect(existsSync(join(dataDir, 'state', 'evolution', 'ledger.jsonl'))).toBe(false)
        completed = true
      } finally {
        if (completed) {
          rmSync(dataDir, { recursive: true, force: true })
          rmSync(`${dataDir}-environment`, { recursive: true, force: true })
        }
      }
    },
    2_700_000,
  )

  it.runIf(enabled)('installs the formal Profile and proves the public headless authority path', async () => {
    await start()
  }, 2_700_000)
})
