import { spawnSync } from 'node:child_process'
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
import { delimiter, dirname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SessionId, mountGoalHarness } from '@tianwen/dsh-compat'
import type { SessionEvent } from '@tianwen/dsh-compat'
import { projectEvidence } from '../../packages/tianwen-evidence/src/projector.js'

const root = resolve(import.meta.dirname, '../..')
const tianwenRoot = 'D:/DevData/tianwen'
const dshHostRoot = `${tianwenRoot}/dsh-host`
const dshHome = `${tianwenRoot}/dsh-home`
const profileRoot = `${dshHome}/profiles/tianwen`
const sessionsRoot = `${dshHome}/sessions`
const evolutionRoot = `${tianwenRoot}/state/evolution`
const receiptPath = `${tianwenRoot}/receipts/phase2-startup-receipt.json`
const statusReceiptPath = `${tianwenRoot}/receipts/phase3-goal-status-receipt.json`
const listReceiptPath = `${tianwenRoot}/receipts/phase4-goal-list-receipt.json`
const resumeReceiptPath = `${tianwenRoot}/receipts/phase5-goal-resume-receipt.json`
const archive = `${tianwenRoot}/packs/tianwen-runtime-bundle-0.0.0.tgz`
const taskText = 'run the Tianwen phase 2 smoke task'
const completeCallId = 'tianwen-phase2-goal-complete'
const enabled = process.env.TIANWEN_DSH_PHASE2_STARTUP === '1'
const profilePatch = resolve(root, 'profiles/tianwen/cordis.patch.yml')
const exactPnpm = 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs'
const missingPnpm = 'D:/DevData/missing-corepack/v1/pnpm/11.20.0/bin/pnpm.mjs'
const runtimePackage = '@tianwen/runtime-bundle'
const workspacePolicy = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: true
overrides:
  koffi: 3.1.4
allowBuilds:
  '@deepseek-ai/dsh-subprocess-local': false
  '@google/genai': false
  koffi: false
  node-pty: false
  protobufjs: false
`

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

function requireWithinRoot(path: string): string {
  const allowed = realpathSync(tianwenRoot)
  const candidate = resolve(path)
  const child = relative(allowed, candidate)
  expect(child === '' || (!child.startsWith('..') && !isAbsolute(child))).toBe(true)
  return candidate
}

function childEnvironment(): NodeJS.ProcessEnv {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  expect(systemRoot).toBeDefined()
  const temp = `${tianwenRoot}/temp`
  const store = 'D:/DevData/pnpm-store'
  const cache = 'D:/DevData/pnpm-cache'
  const virtualStore = `${tianwenRoot}/virtual-store`
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
    resumeReceiptPath,
    archive,
    temp,
    virtualStore,
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

function requireDshBin(): string {
  const manifestPath = `${dshHostRoot}/node_modules/@deepseek-ai/dsh/package.json`
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    version?: string
    bin?: { dsh?: string }
  }
  expect(manifest.version).toBe('0.1.0-rc.6')
  const bin = manifest.bin?.dsh
  expect(typeof bin).toBe('string')
  const dshBin = resolve(dirname(manifestPath), bin!)
  expect(statSync(dshBin).isFile()).toBe(true)
  const installed = realpathSync(dshBin)
  expect(relative(realpathSync(dshHostRoot), installed).startsWith('..')).toBe(false)
  expect(relative(root, installed).startsWith('..')).toBe(true)
  return installed
}

function bytesOrMissing(path: string): Buffer | undefined {
  return existsSync(path) ? readFileSync(path) : undefined
}

function dumpRow(source: string, id: string): string[] {
  const lines = source.replaceAll('\r\n', '\n').split('\n')
  const starts = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line === `- id: ${id}`)
  expect(starts).toHaveLength(1)
  const start = starts[0]!.index
  const end = lines.findIndex((line, index) => index > start && line.startsWith('- id: '))
  return lines.slice(start, end < 0 ? undefined : end)
}

function dumpValue(lines: string[], key: string): string {
  const values = lines
    .map(line => new RegExp(`^ {2,}${key}: (.+)$`, 'u').exec(line)?.[1])
    .filter((value): value is string => value !== undefined)
  expect(values).toHaveLength(1)
  return values[0]!.replace(/^['"]|['"]$/gu, '')
}

async function assertInstalledBundle(profileManifestPath: string): Promise<{
  readonly cli: string
}> {
  const requireFromProfile = createRequire(realpathSync(profileManifestPath))
  const runtimeResolved = requireFromProfile.resolve(`${runtimePackage}/runtime`)
  const smokeResolved = requireFromProfile.resolve(`${runtimePackage}/smoke`)
  const statusResolved = requireFromProfile.resolve(`${runtimePackage}/status`)
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
  const [runtime, smoke, status] = await Promise.all([
    import(pathToFileURL(runtimeResolved).href),
    import(pathToFileURL(smokeResolved).href),
    import(pathToFileURL(statusResolved).href),
  ])
  expect(runtime).toMatchObject({ name: 'tianwen-runtime', inject: ['dynamicCordisRunner'] })
  expect(smoke).toMatchObject({ name: 'tianwen-phase2-smoke', inject: ['llm', 'tools'] })
  expect(status.readGoalStatus).toBeTypeOf('function')
  expect(status.listGoals).toBeTypeOf('function')
  const cli = resolve(runtimeRoot, runtimeManifest.bin.tianwen)
  expect(statSync(cli).isFile()).toBe(true)
  return { cli }
}

async function start(missingCorepack = false): Promise<void> {
  rmSync(receiptPath, { force: true })
  rmSync(`${receiptPath}.tmp`, { force: true })
  rmSync(statusReceiptPath, { force: true })
  rmSync(`${statusReceiptPath}.tmp`, { force: true })
  rmSync(listReceiptPath, { force: true })
  rmSync(`${listReceiptPath}.tmp`, { force: true })
  rmSync(resumeReceiptPath, { force: true })
  rmSync(`${resumeReceiptPath}.tmp`, { force: true })
  const pnpm = missingCorepack ? missingPnpm : exactPnpm
  expect(existsSync(pnpm)).toBe(true)
  const env = childEnvironment()
  expect(existsSync(profilePatch)).toBe(true)
  rmSync(profileRoot, { recursive: true, force: true })
  mkdirSync(profileRoot, { recursive: true })
  writeFileSync(`${profileRoot}/pnpm-workspace.yaml`, workspacePolicy, 'utf8')
  rmSync(archive, { force: true })

  if (!existsSync(`${dshHostRoot}/node_modules/@deepseek-ai/dsh/package.json`)) {
    const deployHost = run(process.execPath, [
      exactPnpm, '--config.inject-workspace-packages=true',
      '--filter', '@tianwen/dsh-host', 'deploy', '--prod', dshHostRoot,
    ], env, 300_000)
    expect(deployHost.status, `${deployHost.stdout}\n${deployHost.stderr}`).toBe(0)
  }
  const dshBin = requireDshBin()

  const build = run(process.execPath, [
    exactPnpm, '--filter', '@tianwen/runtime-bundle...', 'build',
  ], env)
  expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0)
  mkdirSync(dirname(archive), { recursive: true })
  const pack = run(process.execPath, [
    exactPnpm, '--filter', runtimePackage, 'pack', '--pack-destination', dirname(archive),
  ], env)
  expect(pack.status, `${pack.stdout}\n${pack.stderr}`).toBe(0)
  expect(existsSync(archive)).toBe(true)

  const install = run(process.execPath, [
    dshBin, 'plugin', '--profile', 'tianwen',
    'add', '--offline',
    '@deepseek-ai/dsh-base@0.1.0-rc.6',
    '@deepseek-ai/dsh-headless@0.1.0-rc.6',
    archive,
  ], env)
  expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0)
  const patch = readFileSync(profilePatch)
  expect(patch.toString('utf8')).not.toContain('\r')
  expect(patch.toString('utf8')).toMatch(/\n$/u)
  writeFileSync(`${profileRoot}/cordis.patch.yml`, patch)

  const profileManifestPath = `${profileRoot}/package.json`
  const manifest = JSON.parse(readFileSync(profileManifestPath, 'utf8')) as {
    dependencies: Record<string, string>
    dsh: { profile: { bundles: string[] } }
  }
  expect(manifest.dsh.profile.bundles).toEqual([
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-headless',
    runtimePackage,
  ])
  expect(manifest.dependencies['@deepseek-ai/dsh-base']).toBe('0.1.0-rc.6')
  expect(manifest.dependencies['@deepseek-ai/dsh-headless']).toBe('0.1.0-rc.6')
  expect(resolve(profileRoot, manifest.dependencies[runtimePackage]!.replace(/^file:/u, '')))
    .toBe(resolve(archive))
  expect(readFileSync(`${profileRoot}/pnpm-workspace.yaml`, 'utf8')).toBe(workspacePolicy)

  const dump = run(process.execPath, [dshBin, '--profile', 'tianwen', '--dump-config'], env)
  expect(dump.status, `${dump.stdout}\n${dump.stderr}`).toBe(0)
  expect(dumpValue(dumpRow(dump.stdout, 'agent-default-model'), 'provider')).toBe('tianwen-offline')
  expect(dumpValue(dumpRow(dump.stdout, 'agent-default-model'), 'model')).toBe('phase2-smoke')
  expect(dumpValue(dumpRow(dump.stdout, 'session-persistence-jsonl'), 'compression')).toBe('none')
  expect(dumpValue(dumpRow(dump.stdout, 'session-persistence-jsonl'), 'packChunks')).toBe('false')
  expect(dumpValue(dumpRow(dump.stdout, 'session-persistence-jsonl'), 'root')).toBe(sessionsRoot)
  expect(dumpValue(dumpRow(dump.stdout, 'cordis-host-runner'), 'name'))
    .toBe('@deepseek-ai/dsh-cordis-host-runner')
  expect(dumpValue(dumpRow(dump.stdout, 'tianwen-runtime'), 'evolutionRoot')).toBe(evolutionRoot)
  expect(dumpValue(dumpRow(dump.stdout, 'tianwen-phase2-smoke'), 'name'))
    .toBe(`${runtimePackage}/smoke`)
  const installed = await assertInstalledBundle(profileManifestPath)

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

  const resumeSessionId = SessionId(`tianwen-resume-${Date.now()}`)
  const seed = await mountGoalHarness(sessionsRoot, [], { goalRoundDriver: false })
  const seedHandle = await seed.ctx.agents.create({
    sessionId: resumeSessionId,
    meta: { cwd: root },
    agentOptions: { provider: 'tianwen-offline', model: 'phase2-smoke' },
  })
  let resumeGoal: ReturnType<typeof seed.ctx.goals.create>
  try {
    resumeGoal = seed.ctx.goals.create(seedHandle.agent, {
      objective: 'prove explicit Tianwen Goal resume',
      maxGoalRounds: 1,
    })
    await seed.ctx.sessions.flush(seedHandle.agent.session)
  } finally {
    await seedHandle.dispose()
    await seed.ctx.fiber.dispose()
  }

  const resumeLog = listSessionLogs().find(path =>
    readFileSync(path, 'utf8').includes(String(resumeSessionId)))
  expect(resumeLog).toBeDefined()
  const [, ...resumeBeforeLines] = readFileSync(resumeLog!, 'utf8')
    .trimEnd()
    .split(/\r?\n/u)
  const resumeBeforeEvents = resumeBeforeLines.map(line => JSON.parse(line) as SessionEvent)
  const championBeforeResume = bytesOrMissing(champion)
  const ledgerBeforeResume = bytesOrMissing(ledger)

  const resumeRun = run(process.execPath, [
    installed.cli,
    'resume',
    '--goal',
    String(resumeGoal.id),
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
      id: String(resumeGoal.id),
      revision: resumeGoal.revision + 2,
      phase: 'complete',
      roundsStarted: 1,
    },
    session: {
      id: String(resumeSessionId),
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
    String(resumeGoal.id),
    '--data-dir',
    tianwenRoot,
    '--json',
  ], env)
  expect(secondResume.status).toBe(1)
  expect(secondResume.stdout).toBe('')
  expect(secondResume.stderr).toBe('Error: Goal is complete\n')
  expect(snapshotState()).toEqual(stateAfterResume)

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
  it.runIf(enabled)('removes a stale receipt before a missing exact Corepack runtime fails', async () => {
    mkdirSync(dirname(receiptPath), { recursive: true })
    writeFileSync(receiptPath, '{"stale":true}\n', 'utf8')
    await expect(start(true)).rejects.toThrow()
    expect(existsSync(receiptPath)).toBe(false)
  })

  it.runIf(enabled)('installs the formal Profile and proves the public headless authority path', async () => {
    await start()
  }, 600_000)
})
