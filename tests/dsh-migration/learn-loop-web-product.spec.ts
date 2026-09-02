import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../..')
const productRoot = resolve('D:/DevData/tianwen-learn-loop-web-product-tests/proof')
const enabled = process.platform === 'win32'
  && process.env.TIANWEN_LEARN_LOOP_PRODUCT_TEST === '1'

interface RpcResult<T> {
  readonly ok: boolean
  readonly value?: T
  readonly error?: { readonly message?: string }
}

interface ProductStatus {
  readonly schemaVersion: 'tianwen.long-goal-status.v2'
  readonly goal: { readonly id: string, readonly revision: number, readonly phase: string }
  readonly planner: { readonly sessionId: string, readonly phase: string }
  readonly runtime: {
    readonly activation: string
    readonly modelRequests: number
    readonly readOnly: boolean
  }
  readonly tasks: readonly {
    readonly id: string
    readonly execution: null | { readonly sessionId: string, readonly goalId: string }
  }[]
}

interface RunningDsh {
  readonly child: ChildProcessWithoutNullStreams
  readonly exited: Promise<{ readonly code: number | null, readonly signal: NodeJS.Signals | null }>
  readonly output: () => { readonly stdout: string, readonly stderr: string }
}

function childEnvironment(dshHome: string, environmentRoot: string): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of Object.keys(env)) {
    if (/(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN)$/iu.test(name)
      || /^(?:DEEPSEEK|OPENAI|ANTHROPIC|GEMINI|GOOGLE_GENERATIVE_AI|AZURE_OPENAI|AWS_BEDROCK|GROQ|MISTRAL|COHERE|TOGETHER|XAI|MOONSHOT|DASHSCOPE|ARK)_/iu.test(name)) {
      delete env[name]
    }
  }
  const temp = join(environmentRoot, 'temp')
  mkdirSync(temp, { recursive: true })
  return {
    ...env,
    CI: 'true',
    DSH_HOME: dshHome,
    DSH_TELEMETRY_DISABLED: '1',
    NO_COLOR: '1',
    TEMP: temp,
    TMP: temp,
  }
}

function runVerifier(): {
  readonly profileRoot: string
  readonly runtimeTarball: string
  readonly runtimeDigest: string
} {
  rmSync(productRoot, { recursive: true, force: true })
  mkdirSync(productRoot, { recursive: true })
  cpSync(
    join(process.env.LOCALAPPDATA!, 'pnpm-cache', 'v11', 'metadata'),
    join(productRoot, 'pnpm-cache', 'v11', 'metadata'),
    { recursive: true },
  )
  symlinkSync(
    'D:\\DevData\\pnpm\\store',
    join(productRoot, 'pnpm-store'),
    'junction',
  )
  const result = spawnSync(process.execPath, [
    join(repoRoot, 'scripts', 'verify-dsh-profile.mjs'),
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...childEnvironment(join(productRoot, 'home'), join(productRoot, 'verifier-environment')),
      COREPACK_HOME: 'D:\\DevData\\corepack-home',
      TIANWEN_DSH_MIGRATION_PROFILE: '1',
      TIANWEN_LEARN_LOOP_PRODUCT_MODE: '1',
      TIANWEN_DSH_PROBE_ROOT: productRoot,
      TIANWEN_DSH_PROFILE: 'web',
    },
    maxBuffer: 32 * 1024 * 1024,
    shell: false,
    timeout: 600_000,
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error([
      `Web Profile verifier exited ${String(result.status)}`,
      result.error?.message,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'))
  }
  const report = JSON.parse(readFileSync(
    join(productRoot, 'migration-profile-report.json'),
    'utf8',
  )) as {
    readonly profile: string
    readonly paths: { readonly profileRoot: string }
    readonly composition: {
      readonly runtimeInstall: { readonly tarball: {
        readonly path: string
        readonly sha256: string
      } }
    }
  }
  expect(report.profile).toBe('web')
  const runtimeTarball = realpathSync(report.composition.runtimeInstall.tarball.path)
  expect(createHash('sha256').update(readFileSync(runtimeTarball)).digest('hex'))
    .toBe(report.composition.runtimeInstall.tarball.sha256)
  return {
    profileRoot: realpathSync(report.paths.profileRoot),
    runtimeTarball,
    runtimeDigest: report.composition.runtimeInstall.tarball.sha256,
  }
}

function launchDsh(dshBin: string, patchPath: string, env: NodeJS.ProcessEnv): RunningDsh {
  const child = spawn(process.execPath, [
    dshBin,
    '--profile', 'web',
    '--patch', patchPath,
    '--host', '127.0.0.1',
    '--port', '0',
    '--no-open',
  ], {
    cwd: repoRoot,
    env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdin.end()
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  const exited = new Promise<{ code: number | null, signal: NodeJS.Signals | null }>(
    (resolveExit, rejectExit) => {
      child.once('error', rejectExit)
      child.once('exit', (code, signal) => resolveExit({ code, signal }))
    },
  )
  return { child, exited, output: () => ({ stdout, stderr }) }
}

async function waitFor<T>(
  running: RunningDsh,
  read: () => T | undefined | Promise<T | undefined>,
  label: string,
  timeoutMs = 120_000,
): Promise<T> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read()
    if (value !== undefined) return value
    if (running.child.exitCode !== null || running.child.signalCode !== null) {
      const output = running.output()
      throw new Error([
        `DSH exited before ${label}`,
        output.stdout,
        output.stderr,
      ].filter(Boolean).join('\n'))
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 50))
  }
  const output = running.output()
  throw new Error([
    `Timed out waiting for ${label}`,
    output.stdout,
    output.stderr,
  ].filter(Boolean).join('\n'))
}

function sessionLogs(sessionsRoot: string): string[] {
  if (!existsSync(sessionsRoot)) return []
  const logs: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && entry.name === 'session.jsonl') logs.push(path)
    }
  }
  visit(sessionsRoot)
  return logs.sort()
}

function sessionEvents(sessionsRoot: string): Record<string, unknown>[] {
  return sessionLogs(sessionsRoot).flatMap(path => readFileSync(path, 'utf8')
    .trimEnd()
    .split(/\r?\n/u)
    .slice(1)
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>))
}

function unwrap<T>(result: RpcResult<T>): T {
  if (!result.ok || result.value === undefined) {
    throw new Error(result.error?.message ?? 'Connection RPC failed')
  }
  return result.value
}

function parseClientGraph(html: string): { readonly entries: readonly { readonly id: string }[] } {
  const match = /globalThis\["__DSH_BOOT__"\]\s*=\s*(\{.*?\})\s*<\/script>/su.exec(html)
  if (match?.[1] === undefined) throw new Error('DSH Web page did not expose __DSH_BOOT__')
  return JSON.parse(match[1]) as { entries: readonly { id: string }[] }
}

async function callConnectionRpc<T>(
  origin: string,
  endpoint: string,
  payload: unknown,
): Promise<RpcResult<T>> {
  const rpcId = randomUUID()
  const response = await fetch(`${origin}/${endpoint.includes('.') ? 'api' : 'tianwen'}/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: endpoint,
      payload,
    }),
  })
  if (!response.ok) {
    throw new Error(
      `Connection RPC HTTP ${String(response.status)}: ${await response.text()}`,
    )
  }
  const envelope = await response.json() as {
    readonly type: string
    readonly rpcId: string
    readonly result: RpcResult<T>
  }
  if (envelope.type !== 'server-response' || envelope.rpcId !== rpcId) {
    throw new Error('Connection RPC returned a mismatched envelope')
  }
  return envelope.result
}

async function closeOwnedProcess(running: RunningDsh): Promise<void> {
  if (running.child.exitCode !== null || running.child.signalCode !== null) return
  const pid = running.child.pid
  if (pid === undefined) throw new Error('Owned DSH process has no PID')
  const result = spawnSync('taskkill.exe', [
    '/PID', String(pid), '/T', '/F',
  ], { encoding: 'utf8', shell: false, windowsHide: true })
  if (result.status !== 0 && running.child.exitCode === null && running.child.signalCode === null) {
    throw new Error(`Failed to terminate owned DSH PID ${String(pid)}: ${result.stderr}`)
  }
  await Promise.race([
    running.exited,
    new Promise<never>((_resolve, reject) => setTimeout(
      () => reject(new Error(`Owned DSH PID ${String(pid)} did not exit`)),
      10_000,
    )),
  ])
}

async function closedHttpAttempts(origin: string): Promise<number> {
  let failures = 0
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1_000) })
      await response.body?.cancel()
    } catch {
      failures += 1
    }
  }
  return failures
}

describe.skipIf(!enabled).sequential('Learn Loop assembled Web product', () => {
  it('serves the packed client and creates a goal-first plan through the real loopback Connection RPC', async () => {
    const assembled = runVerifier()
    const registryRequire = createRequire(join(assembled.profileRoot, 'cordis.yml'))
    expect(realpathSync(registryRequire.resolve(
      '@tianwen/runtime-bundle/package.json',
    ))).toBe(realpathSync(join(
      assembled.profileRoot,
      'node_modules',
      '@tianwen',
      'runtime-bundle',
      'package.json',
    )))
    const profileManifest = JSON.parse(readFileSync(
      join(assembled.profileRoot, 'package.json'),
      'utf8',
    )) as {
      readonly dependencies: Record<string, string>
      readonly dsh: { readonly profile: { readonly bundles: readonly string[] } }
    }
    expect(profileManifest.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@tianwen/runtime-bundle',
    ])
    expect(profileManifest.dependencies).not.toHaveProperty('@tianwen/dsh-probe-bundle')
    expect([
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-agent',
      '@deepseek-ai/dsh-agent-presets',
      '@deepseek-ai/dsh-credentials',
      '@deepseek-ai/dsh-goal',
      '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-session-persistence-jsonl',
      '@deepseek-ai/dsh-skill',
      '@deepseek-ai/dsh-system-prompt',
      '@deepseek-ai/dsh-tools',
    ].filter(name => existsSync(join(
      assembled.profileRoot,
      'node_modules',
      ...name.split('/'),
    )))).toEqual([])
    const workspacePolicy = readFileSync(
      join(assembled.profileRoot, 'pnpm-workspace.yaml'),
      'utf8',
    )
    expect(workspacePolicy).toMatch(/^nodeLinker: hoisted$/mu)
    expect(workspacePolicy).toMatch(/^overrides:\r?\n  koffi: 3\.1\.4$/mu)
    expect(workspacePolicy).toMatch(/^allowBuilds:\r?\n  koffi: true$/mu)
    const profileLock = readFileSync(join(assembled.profileRoot, 'pnpm-lock.yaml'), 'utf8')
    expect(profileLock).not.toMatch(/^  koffi@/mu)
    const dshHome = join(productRoot, 'home')
    const sessionsRoot = join(dshHome, 'sessions')
    const stateRoot = join(productRoot, 'state')
    const evolutionRoot = join(stateRoot, 'evolution')
    const repositoryCwd = join(productRoot, 'repository')
    const environmentRoot = join(productRoot, 'web-environment')
    mkdirSync(repositoryCwd, { recursive: true })
    const patchPath = join(productRoot, 'learn-loop-product.patch.yml')
    const portable = (path: string) => path.replaceAll('\\', '/')
    writeFileSync(patchPath, [
      '- id: agent-default-model',
      '  config:',
      '    provider: tianwen-offline',
      '    model: phase2-smoke',
      '',
      '- id: session-persistence-jsonl',
      '  config:',
      `    root: '${portable(sessionsRoot)}'`,
      '    compression: none',
      '    packChunks: false',
      '',
      '- id: tianwen-runtime',
      '  config:',
      `    stateRoot: '${portable(stateRoot)}'`,
      `    sessionsRoot: '${portable(sessionsRoot)}'`,
      `    evolutionRoot: '${portable(evolutionRoot)}'`,
      '',
      '- insert:',
      '    - id: tianwen-phase2-smoke',
      "      name: '@tianwen/runtime-bundle/smoke'",
      '',
    ].join('\n'), 'utf8')

    const controllerRequire = createRequire(realpathSync(
      join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
    ))
    const dshManifestPath = realpathSync(controllerRequire.resolve('@deepseek-ai/dsh/package.json'))
    const dshManifest = JSON.parse(readFileSync(dshManifestPath, 'utf8')) as {
      readonly version: string
      readonly bin: { readonly dsh: string }
    }
    expect(dshManifest.version).toBe('0.1.1-rc.2')
    const dshBin = realpathSync(resolve(dirname(dshManifestPath), dshManifest.bin.dsh))
    const running = launchDsh(
      dshBin,
      patchPath,
      childEnvironment(dshHome, environmentRoot),
    )
    let origin: string | undefined
    let proof: Record<string, unknown> | undefined
    try {
      origin = await waitFor(running, () => (
        /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/u.exec(running.output().stdout)?.[1]
      ), 'the loopback Web origin')
      const html = await waitFor(running, async () => {
        try {
          const response = await fetch(origin!, { signal: AbortSignal.timeout(1_000) })
          return response.ok ? await response.text() : undefined
        } catch {
          return undefined
        }
      }, 'the Web page')
      const clientGraphIds = parseClientGraph(html).entries.map(entry => entry.id)
      expect(clientGraphIds).toContain('@tianwen/runtime-bundle')
      expect(clientGraphIds).toContain('@deepseek-ai/dsh-client-ui-message-feedback')
      expect(await fetch(`${origin}/plugins/@tianwen/runtime-bundle/client.js`)
        .then(response => response.ok)).toBe(true)

      for (const [endpoint, payload] of [
        [['feedback', 'status'].join('-'), { longGoalId: 'removed-goal-feedback' }],
        [['record', 'task', 'feedback'].join('-'), {
          longGoalId: 'removed-goal-feedback', taskId: 'task-1',
          rating: 'negative', note: 'must stay native',
        }],
      ] as const) {
        await expect(callConnectionRpc(origin, endpoint, payload)).resolves.toEqual({
          ok: false,
          error: { code: 'internal', message: 'invalid-request', details: {} },
        })
      }

      const workspaceSession = unwrap(await callConnectionRpc<{
        readonly sessionId: string
        readonly agentPreset?: string
      }>(origin, 'session.create', { cwd: repositoryCwd, agentPreset: 'standard' }))
      expect(workspaceSession.agentPreset).toBe('standard')
      const sessionsBeforeCreate = sessionLogs(sessionsRoot).length
      const eventsBeforeCreate = sessionEvents(sessionsRoot)
      const turnsBeforeCreate = eventsBeforeCreate
        .filter(event => event.type === 'turn/start').length
      const created = unwrap(await callConnectionRpc<{
        readonly schemaVersion: 'tianwen.goal-first-progress-result.v2'
        readonly action: string
        readonly status: ProductStatus
        readonly sessionId: string | null
      }>(origin, 'create-goal-first', {
        objective: 'Prove the assembled goal-first Learn Loop product path',
        context: 'Use the selected DSH workspace Session',
        successCriteria: 'Persist a recoverable v2 Goal and planner Session',
        workspaceSessionId: workspaceSession.sessionId,
      }))
      const logsAfterCreate = sessionLogs(sessionsRoot)
      const sessionsAfterCreate = logsAfterCreate.length
      const eventsAfterCreate = sessionEvents(sessionsRoot)
      const turnsAfterCreate = eventsAfterCreate
        .filter(event => event.type === 'turn/start').length
      const plannerLogPath = logsAfterCreate.find(path => (
        basename(dirname(path)) === created.status.planner.sessionId
      ))
      expect(plannerLogPath).toBeDefined()
      const plannerEventsAfterCreate = sessionEvents(dirname(plannerLogPath!))
      const plannerToolCallsAfterCreate = plannerEventsAfterCreate
        .filter(event => event.type === 'tool/call').length
      const plannerToolResultsAfterCreate = plannerEventsAfterCreate
        .filter(event => event.type === 'tool/result').length
      const readBack = unwrap(await callConnectionRpc<{
        readonly status: ProductStatus
      }>(origin, 'status', {
        longGoalId: created.status.goal.id,
      }))
      const sessionsAfterStatus = sessionLogs(sessionsRoot).length
      const eventsAfterStatus = sessionEvents(sessionsRoot)
      const turnsAfterStatus = eventsAfterStatus
        .filter(event => event.type === 'turn/start').length
      const plannerEventsAfterStatus = sessionEvents(dirname(plannerLogPath!))
      const plannerToolCallsAfterStatus = plannerEventsAfterStatus
        .filter(event => event.type === 'tool/call').length
      const plannerToolResultsAfterStatus = plannerEventsAfterStatus
        .filter(event => event.type === 'tool/result').length
      expect(readBack.status.goal.id).toBe(created.status.goal.id)
      expect(created.schemaVersion).toBe('tianwen.goal-first-progress-result.v2')
      expect(created.action).toBe('planning-pending')
      expect(created.sessionId).toBeNull()
      expect(created.status.schemaVersion).toBe('tianwen.long-goal-status.v2')
      expect(created.status.goal).toMatchObject({ phase: 'planning', revision: expect.any(Number) })
      expect(readBack.status).toEqual(created.status)
      expect(readBack.status.tasks).toEqual([])
      expect(created.status.runtime).toEqual({
        activation: 'not-loaded',
        modelRequests: 0,
        readOnly: true,
      })
      expect(readBack.status.runtime).toEqual({
        activation: 'not-loaded',
        modelRequests: 0,
        readOnly: true,
      })
      expect(sessionsAfterCreate).toBeGreaterThanOrEqual(sessionsBeforeCreate + 1)
      expect(turnsAfterCreate).toBeGreaterThan(turnsBeforeCreate)
      expect(plannerToolCallsAfterCreate).toBeGreaterThan(0)
      expect(plannerToolResultsAfterCreate).toBe(plannerToolCallsAfterCreate)
      expect(sessionsAfterStatus).toBe(sessionsAfterCreate)
      expect(turnsAfterStatus).toBe(turnsAfterCreate)
      expect(plannerToolCallsAfterStatus).toBe(plannerToolCallsAfterCreate)
      expect(plannerToolResultsAfterStatus).toBe(plannerToolResultsAfterCreate)

      const longGoalRecord = JSON.parse(readFileSync(join(
        stateRoot,
        'long-goals',
        `${created.status.goal.id}.json`,
      ), 'utf8')) as {
        readonly schemaVersion: string
        readonly workspaceRoot: string
        readonly planner: { readonly sessionId: string }
      }
      expect(longGoalRecord).toMatchObject({
        schemaVersion: 'tianwen.long-goal.v2',
        workspaceRoot: realpathSync(repositoryCwd),
        planner: { sessionId: created.status.planner.sessionId },
      })
      proof = {
        schemaVersion: 'tianwen.learn-loop-web-product-proof.v2',
        dshVersion: dshManifest.version,
        runtimeTarball: assembled.runtimeTarball,
        runtimeDigest: assembled.runtimeDigest,
        webProfileRoot: assembled.profileRoot,
        origin,
        ownedDshPid: running.child.pid,
        clientGraphIds,
        workspaceSessionId: workspaceSession.sessionId,
        longGoalId: created.status.goal.id,
        creation: {
          sessionCountBefore: sessionsBeforeCreate,
          sessionCountAfter: sessionsAfterCreate,
          turnStartCountBefore: turnsBeforeCreate,
          turnStartCountAfter: turnsAfterCreate,
          plannerToolCallCount: plannerToolCallsAfterCreate,
          plannerToolResultCount: plannerToolResultsAfterCreate,
          action: created.action,
          plannerSessionId: created.status.planner.sessionId,
          runtime: created.status.runtime,
        },
        statusRead: {
          sessionCountBefore: sessionsAfterCreate,
          sessionCountAfter: sessionsAfterStatus,
          turnStartCountBefore: turnsAfterCreate,
          turnStartCountAfter: turnsAfterStatus,
          plannerToolCallCountBefore: plannerToolCallsAfterCreate,
          plannerToolCallCountAfter: plannerToolCallsAfterStatus,
          plannerToolResultCountBefore: plannerToolResultsAfterCreate,
          plannerToolResultCountAfter: plannerToolResultsAfterStatus,
          runtime: readBack.status.runtime,
        },
      }
    } finally {
      await closeOwnedProcess(running)
      if (origin !== undefined) expect(await closedHttpAttempts(origin)).toBe(3)
    }
    expect(proof).toBeDefined()
    writeFileSync(
      join(productRoot, 'product-proof.json'),
      `${JSON.stringify({ ...proof, endpointClosed: true }, null, 2)}\n`,
      'utf8',
    )
  }, 900_000)
})
