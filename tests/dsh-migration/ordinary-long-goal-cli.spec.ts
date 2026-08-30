import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { main } from '../../packages/tianwen-runtime-bundle/src/cli.js'
import type { GoalCreateReceipt } from '../../packages/tianwen-runtime-bundle/src/create-runner.js'
import {
  bindLongGoalTask,
  createLongGoal,
  readLongGoal,
} from '../../packages/tianwen-runtime-bundle/src/long-goal.js'
import type { LongGoalStatusProjection } from '../../packages/tianwen-runtime-bundle/src/long-goal.js'
import {
  runLongGoalTask,
} from '../../packages/tianwen-runtime-bundle/src/long-goal-run.js'
import type {
  LongGoalRunDependencies,
} from '../../packages/tianwen-runtime-bundle/src/long-goal-run.js'
import { resolvePortableProfileTarget } from '../../packages/tianwen-runtime-bundle/src/portable-profile.js'

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawn: vi.fn(actual.spawn) }
})

const FIXTURE_BASE = process.platform === 'win32'
  ? 'D:/DevData/tianwen-ordinary-long-goal-cli-tests'
  : resolve('tmp/tianwen-ordinary-long-goal-cli-tests')
const roots: string[] = []

function capturedChild(): ChildProcess {
  return Object.assign(new EventEmitter(), {
    stderr: new PassThrough(),
    stdout: new PassThrough(),
    kill: vi.fn(),
  }) as unknown as ChildProcess
}

function fixtureRoot(): string {
  mkdirSync(FIXTURE_BASE, { recursive: true })
  const root = mkdtempSync(join(FIXTURE_BASE, 'fixture-'))
  roots.push(root)
  return root
}

function portableFixture() {
  const root = fixtureRoot()
  const dshRoot = join(root, 'dsh')
  const dshHome = join(root, 'home')
  const profile = 'work'
  const profileRoot = join(dshHome, 'profiles', profile)
  const runtimeRoot = join(profileRoot, 'node_modules', '@tianwen', 'runtime-bundle')
  mkdirSync(join(dshRoot, 'lib'), { recursive: true })
  mkdirSync(join(runtimeRoot, 'dist'), { recursive: true })
  writeFileSync(join(dshRoot, 'package.json'), `${JSON.stringify({
    name: '@deepseek-ai/dsh',
    version: '0.1.1-rc.2',
    bin: { dsh: 'lib/bin.js' },
  })}\n`)
  writeFileSync(join(dshRoot, 'lib', 'bin.js'), '#!/usr/bin/env node\n')
  writeFileSync(join(profileRoot, 'package.json'), `${JSON.stringify({
    dependencies: { '@tianwen/runtime-bundle': 'file:runtime.tgz' },
    dsh: { profile: { bundles: ['@tianwen/runtime-bundle'] } },
  })}\n`)
  writeFileSync(join(runtimeRoot, 'package.json'), `${JSON.stringify({
    name: '@tianwen/runtime-bundle',
    version: '0.1.1',
    bin: { tianwen: 'dist/cli.js' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  })}\n`)
  writeFileSync(join(runtimeRoot, 'dist', 'cli.js'), '#!/usr/bin/env node\n')
  writeFileSync(join(runtimeRoot, 'cordis.patch.yml'), '- insert: []\n')
  return resolvePortableProfileTarget({
    dshRoot,
    dshHome,
    profile,
    stateRoot: join(root, 'state'),
  })
}

function portableArgs(target: ReturnType<typeof portableFixture>): string[] {
  return [
    '--dsh-root', target.dshRoot,
    '--dsh-home', target.dshHome,
    '--profile', target.profile,
    '--state-root', target.stateRoot,
  ]
}

function receipt(goalId: string, sessionId: string, objective: string): GoalCreateReceipt {
  return {
    schemaVersion: 'tianwen.goal-create.v1',
    goal: {
      id: goalId,
      objective,
      phase: 'active',
      revision: 1,
      roundsStarted: 0,
      maxGoalRounds: 3,
    },
    session: { id: sessionId, eventCount: 1, modelRequestsDelta: 0 },
  }
}

function projection(
  stateRoot: string,
  longGoalId: string,
  phases: Readonly<Record<string, 'active' | 'complete'>>,
): LongGoalStatusProjection {
  const record = readLongGoal(stateRoot, longGoalId)
  const tasks = record.tasks.map(task => ({
    id: task.id,
    objective: task.objective,
    phase: task.execution === null ? 'pending' as const : phases[task.id] ?? 'active',
    execution: task.execution,
  }))
  const current = tasks.find(task => task.phase !== 'complete')
  return {
    schemaVersion: 'tianwen.long-goal-status.v1',
    goal: {
      id: record.id,
      objective: record.objective,
      phase: current === undefined ? 'complete' : 'active',
      completedTasks: tasks.filter(task => task.phase === 'complete').length,
      totalTasks: tasks.length,
    },
    tasks,
    currentTaskId: current?.id ?? null,
    runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('ordinary long Goal CLI', () => {
  it('launches goal-first start once with the portable Profile and canonical workspace', async () => {
    const target = portableFixture()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const child = capturedChild()
    vi.mocked(spawn).mockImplementationOnce(() => child)

    const result = main([
      'goal', 'start', '--objective', 'Ship the release',
      '--context', 'Keep the changelog concise',
      '--success-criteria', 'Release is published',
      ...portableArgs(target), '--json',
    ])
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
    child.emit('exit', 0, null)

    await expect(result).resolves.toBe(0)
    const [program, args, options] = vi.mocked(spawn).mock.calls[0]!
    expect(program).toBe(process.execPath)
    expect(args).toEqual(expect.arrayContaining([
      target.dshBin, '--profile', target.profile, '--patch',
      expect.stringContaining('goal-first.patch.yml'),
    ]))
    expect(options).toMatchObject({
      cwd: realpathSync(process.cwd()),
      shell: false,
      stdio: 'inherit',
      env: expect.objectContaining({
        DSH_HOME: target.dshHome,
        TIANWEN_GOAL_FIRST_OPERATION: 'start',
        TIANWEN_GOAL_FIRST_OBJECTIVE: 'Ship the release',
        TIANWEN_GOAL_FIRST_CONTEXT: 'Keep the changelog concise',
        TIANWEN_GOAL_FIRST_SUCCESS_CRITERIA: 'Release is published',
        TIANWEN_GOAL_FIRST_STATE_ROOT: target.stateRoot,
        TIANWEN_GOAL_FIRST_SESSIONS_ROOT: target.sessionsRoot,
        TIANWEN_GOAL_FIRST_EVOLUTION_ROOT: target.evolutionRoot,
      }),
    })
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).not.toHaveBeenCalled()
  })

  it('dispatches every valid goal-first operation once and rejects strict mixed fields', async () => {
    const target = portableFixture()
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const operations: string[] = []
    vi.mocked(spawn).mockImplementation((_program, _args, options) => {
      operations.push((options.env as NodeJS.ProcessEnv).TIANWEN_GOAL_FIRST_OPERATION!)
      const child = capturedChild()
      queueMicrotask(() => child.emit('exit', 0, null))
      return child
    })

    await expect(main([
      'goal', 'start', '--objective', 'Start Goal', ...portableArgs(target),
    ])).resolves.toBe(0)
    await expect(main([
      'goal', 'continue', '--goal', 'tianwen-long-goal-one', '--revision', '1', ...portableArgs(target),
    ])).resolves.toBe(0)
    await expect(main([
      'goal', 'guide', '--goal', 'tianwen-long-goal-one', '--revision', '2', '--text', 'New fact', ...portableArgs(target),
    ])).resolves.toBe(0)
    await expect(main([
      'goal', 'abandon', '--goal', 'tianwen-long-goal-one', '--revision', '3', ...portableArgs(target),
    ])).resolves.toBe(0)
    const dataDir = fixtureRoot()
    const dshPackage = join(dataDir, 'dsh-host', 'node_modules', '@deepseek-ai', 'dsh')
    mkdirSync(join(dshPackage, 'lib'), { recursive: true })
    writeFileSync(join(dshPackage, 'package.json'), `${JSON.stringify({
      version: '0.1.1-rc.2', bin: { dsh: 'lib/bin.js' },
    })}\n`)
    writeFileSync(join(dshPackage, 'lib', 'bin.js'), '#!/usr/bin/env node\n')
    await expect(main([
      'goal', 'start', '--objective', 'Start managed Goal', '--data-dir', dataDir,
    ])).resolves.toBe(0)
    await expect(main([
      'goal', 'continue', '--goal', 'tianwen-long-goal-one', '--revision', '1', '--data-dir', dataDir,
    ])).resolves.toBe(0)
    await expect(main([
      'goal', 'guide', '--goal', 'tianwen-long-goal-one', '--revision', '2', '--text', 'Managed fact', '--data-dir', dataDir,
    ])).resolves.toBe(0)
    await expect(main([
      'goal', 'abandon', '--goal', 'tianwen-long-goal-one', '--revision', '3', '--data-dir', dataDir,
    ])).resolves.toBe(0)
    expect(operations).toEqual([
      'start', 'continue', 'guide', 'abandon',
      'start', 'continue', 'guide', 'abandon',
    ])

    for (const args of [
      ['goal', 'start', '--objective', ' ', ...portableArgs(target)],
      ['goal', 'start', '--objective', 'Goal', '--objective', 'Again', ...portableArgs(target)],
      ['goal', 'start', '--objective', 'Goal', '--task', 'not allowed', ...portableArgs(target)],
      ['goal', 'continue', '--goal', 'id', ...portableArgs(target)],
      ['goal', 'continue', '--goal', 'id', '--revision', '0', ...portableArgs(target)],
      ['goal', 'continue', '--goal', 'id', '--revision', '-1', ...portableArgs(target)],
      ['goal', 'continue', '--goal', 'id', '--revision', '1.5', ...portableArgs(target)],
      ['goal', 'continue', '--goal', 'id', '--revision', '9007199254740992', ...portableArgs(target)],
      ['goal', 'guide', '--goal', 'id', '--revision', '1', ...portableArgs(target)],
      ['goal', 'abandon', '--goal', 'id', '--revision', '1', '--text', 'not allowed', ...portableArgs(target)],
      ['goal', 'continue', '--goal', 'id', '--revision', '1', '--max-rounds', '3', ...portableArgs(target)],
      ['goal', 'continue', '--goal', 'id', '--revision', '1', '--data-dir', fixtureRoot(), ...portableArgs(target)],
      ['goal', 'continue', '--goal', 'id', '--revision', '1', '--dsh-root', target.dshRoot],
    ]) await expect(main(args)).resolves.toBe(2)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('tianwen goal'))
  })

  it('rejects Goal-first-only fields for every legacy command before side effects', async () => {
    const dataDir = fixtureRoot()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const commands = [
      { usage: 'tianwen status', args: ['status', '--goal', 'legacy-goal', '--data-dir', dataDir] },
      { usage: 'tianwen list', args: ['list', '--data-dir', dataDir] },
      { usage: 'tianwen create', args: ['create', '--objective', 'Legacy create', '--data-dir', dataDir] },
      { usage: 'tianwen resume', args: ['resume', '--goal', 'legacy-goal', '--data-dir', dataDir] },
      { usage: 'tianwen model', args: ['model', 'status', '--data-dir', dataDir] },
      {
        usage: 'tianwen controlled-lifecycle',
        args: [
          'controlled-lifecycle', '--manifest', join(dataDir, 'manifest.json'),
          '--data-dir', dataDir, '--json',
        ],
      },
      {
        usage: 'tianwen plan',
        args: [
          'plan', 'create', '--objective', 'Legacy plan', '--task', 'Legacy task',
          '--data-dir', dataDir,
        ],
      },
      { usage: 'tianwen plan', args: ['plan', 'status', '--goal', 'legacy-plan', '--data-dir', dataDir] },
      { usage: 'tianwen task', args: ['task', 'run', '--goal', 'legacy-plan', '--data-dir', dataDir] },
    ] as const
    const goalFirstOnlyFields = [
      ['--context', 'context'],
      ['--success-criteria', 'criterion'],
      ['--revision', '1'],
      ['--text', 'guidance'],
    ] as const

    for (const command of commands) {
      for (const field of goalFirstOnlyFields) {
        await expect(main([...command.args, ...field])).resolves.toBe(2)
        expect(stderr).toHaveBeenLastCalledWith(expect.stringContaining(command.usage))
      }
    }

    expect(stdout).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
    expect(readdirSync(dataDir)).toEqual([])
  })

  it('creates an authored plan with repeated Tasks and starts no DSH process', async () => {
    const dataDir = fixtureRoot()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await expect(main([
      'plan', 'create', '--objective', 'Ship release',
      '--task', 'Prepare notes', '--task', 'Publish release',
      '--data-dir', dataDir,
    ])).resolves.toBe(0)

    expect(stderr).not.toHaveBeenCalled()
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('0/2'))
    const records = readdirSync(join(dataDir, 'state', 'long-goals'))
    expect(records).toHaveLength(1)
    expect(JSON.parse(readFileSync(join(dataDir, 'state', 'long-goals', records[0]!), 'utf8')))
      .toMatchObject({
        objective: 'Ship release',
        maxTaskRounds: 3,
        tasks: [
          { id: 'task-1', objective: 'Prepare notes', execution: null },
          { id: 'task-2', objective: 'Publish release', execution: null },
        ],
      })
    expect(readdirSync(dataDir)).toEqual(['state'])
  })

  it('returns captured create failure output and exit code from task run', async () => {
    const dataDir = fixtureRoot()
    const record = createLongGoal({
      stateRoot: join(dataDir, 'state'),
      objective: 'Fail safely', tasks: ['Create fails'], maxTaskRounds: 3,
    }, { id: () => 'captured-create-failure', now: () => 1 })
    const dshPackage = join(dataDir, 'dsh-host', 'node_modules', '@deepseek-ai', 'dsh')
    mkdirSync(join(dshPackage, 'lib'), { recursive: true })
    writeFileSync(join(dshPackage, 'package.json'), `${JSON.stringify({
      version: '0.1.1-rc.2', bin: { dsh: 'lib/bin.js' },
    })}\n`)
    writeFileSync(join(dshPackage, 'lib', 'bin.js'), '#!/usr/bin/env node\n')
    const child = capturedChild()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.mocked(spawn).mockImplementationOnce(() => child)

    const result = main(['task', 'run', '--goal', record.id, '--data-dir', dataDir])
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
    child.stdout!.emit('data', Buffer.from('child stdout\n'))
    child.stderr!.emit('data', Buffer.from('child stderr\n'))
    child.emit('exit', 17, null)
    child.emit('close', 17, null)

    await expect(result).resolves.toBe(17)
    expect(stdout).toHaveBeenCalledWith('child stdout\n')
    expect(stderr).toHaveBeenCalledWith('child stderr\n')
  })

  it('binds one receipt, resumes the same active Task, then advances to a new Session', async () => {
    const dataDir = fixtureRoot()
    const stateRoot = join(dataDir, 'state')
    const record = createLongGoal({
      stateRoot,
      objective: 'Ship release',
      tasks: ['Prepare notes', 'Publish release'],
      maxTaskRounds: 3,
    }, { id: () => 'run-sequence', now: () => 1 })
    const phases: Record<string, 'active' | 'complete'> = {}
    const receipts = [
      receipt('dsh-goal-1', 'dsh-session-1', 'Prepare notes'),
      receipt('dsh-goal-2', 'dsh-session-2', 'Publish release'),
    ]
    const events: string[] = []
    const dependencies: LongGoalRunDependencies = {
      readLongGoalStatus: async input => {
        events.push(`project:${input.longGoalId}`)
        return projection(stateRoot, input.longGoalId, phases)
      },
      preflightGoalCreate: (objective, rounds, targetDataDir) => {
        events.push(`create-preflight:${objective}:${rounds}`)
        return {
          objective,
          maxGoalRounds: rounds,
          dataDir: targetDataDir,
          dshBin: 'unused',
          sessionsRoot: join(targetDataDir, 'dsh-home', 'sessions'),
          evolutionRoot: join(targetDataDir, 'state', 'evolution'),
        }
      },
      captureGoalCreate: async () => {
        const next = receipts.shift()!
        events.push(`capture:${next.goal.id}:${next.session.id}`)
        return next
      },
      preflightGoalResume: async (goalId, targetDataDir) => {
        const binding = readLongGoal(stateRoot, record.id).tasks
          .find(task => task.execution?.goalId === goalId)!.execution!
        events.push(`resume-preflight:${goalId}:${binding.sessionId}`)
        return {
          goalId,
          sessionId: binding.sessionId,
          revision: 1,
          dataDir: targetDataDir,
          sessionsRoot: join(targetDataDir, 'dsh-home', 'sessions'),
          evolutionRoot: join(targetDataDir, 'state', 'evolution'),
        }
      },
      launchGoalResume: async preflight => {
        events.push(`launch:${preflight.goalId}:${preflight.sessionId}`)
        return 0
      },
    }

    await expect(runLongGoalTask({
      longGoalId: record.id,
      productTarget: { kind: 'managed', dataDir },
      json: false,
    }, dependencies)).resolves.toBe(0)
    expect(readLongGoal(stateRoot, record.id).tasks[0]!.execution).toEqual({
      goalId: 'dsh-goal-1', sessionId: 'dsh-session-1',
    })
    expect(events).toEqual([
      `project:${record.id}`,
      'create-preflight:Prepare notes:3',
      'capture:dsh-goal-1:dsh-session-1',
      'resume-preflight:dsh-goal-1:dsh-session-1',
      'launch:dsh-goal-1:dsh-session-1',
    ])

    events.length = 0
    await runLongGoalTask({
      longGoalId: record.id,
      productTarget: { kind: 'managed', dataDir },
      json: false,
    }, dependencies)
    expect(events).toEqual([
      `project:${record.id}`,
      'resume-preflight:dsh-goal-1:dsh-session-1',
      'launch:dsh-goal-1:dsh-session-1',
    ])

    phases['task-1'] = 'complete'
    events.length = 0
    await runLongGoalTask({
      longGoalId: record.id,
      productTarget: { kind: 'managed', dataDir },
      json: false,
    }, dependencies)
    expect(readLongGoal(stateRoot, record.id).tasks[1]!.execution).toEqual({
      goalId: 'dsh-goal-2', sessionId: 'dsh-session-2',
    })
    expect(events).toEqual([
      `project:${record.id}`,
      'create-preflight:Publish release:3',
      'capture:dsh-goal-2:dsh-session-2',
      'resume-preflight:dsh-goal-2:dsh-session-2',
      'launch:dsh-goal-2:dsh-session-2',
    ])
  })

  it('prints the completed projection and launches nothing', async () => {
    const dataDir = fixtureRoot()
    const stateRoot = join(dataDir, 'state')
    const record = createLongGoal({
      stateRoot,
      objective: 'Done plan',
      tasks: ['First done task', 'Second done task'],
      maxTaskRounds: 1,
    }, { id: () => 'complete-run', now: () => 1 })
    bindLongGoalTask(stateRoot, record.id, 'task-1', {
      goalId: 'done-goal-1', sessionId: 'done-session-1',
    }, { now: () => 2 })
    bindLongGoalTask(stateRoot, record.id, 'task-2', {
      goalId: 'done-goal-2', sessionId: 'done-session-2',
    }, { now: () => 3 })
    const status: LongGoalStatusProjection = {
      schemaVersion: 'tianwen.long-goal-status.v1',
      goal: {
        id: record.id, objective: record.objective, phase: 'complete',
        completedTasks: 2, totalTasks: 2,
      },
      tasks: [
        {
          id: 'task-1', objective: 'First done task', phase: 'complete',
          execution: { goalId: 'done-goal-1', sessionId: 'done-session-1' },
        },
        {
          id: 'task-2', objective: 'Second done task', phase: 'complete',
          execution: { goalId: 'done-goal-2', sessionId: 'done-session-2' },
        },
      ],
      currentTaskId: null,
      runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
    }
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    let launches = 0

    await expect(runLongGoalTask({
      longGoalId: record.id,
      productTarget: { kind: 'managed', dataDir },
      json: true,
    }, {
      readLongGoalStatus: async () => status,
      launchGoalResume: async () => { launches += 1; return 0 },
    })).resolves.toBe(0)

    expect(stdout).toHaveBeenCalledWith(`${JSON.stringify(status)}\n`)
    expect(launches).toBe(0)
  })

  it('fails closed when resume resolves a Session different from the stored binding', async () => {
    const dataDir = fixtureRoot()
    const stateRoot = join(dataDir, 'state')
    const record = createLongGoal({
      stateRoot,
      objective: 'Protected plan',
      tasks: ['Bound task'],
      maxTaskRounds: 1,
    }, { id: () => 'mismatch-run', now: () => 1 })
    bindLongGoalTask(stateRoot, record.id, 'task-1', {
      goalId: 'stored-goal', sessionId: 'stored-session',
    }, { now: () => 2 })
    let creates = 0
    let launches = 0

    await expect(runLongGoalTask({
      longGoalId: record.id,
      productTarget: { kind: 'managed', dataDir },
      json: false,
    }, {
      readLongGoalStatus: async () => projection(stateRoot, record.id, {}),
      captureGoalCreate: async () => { creates += 1; return receipt('new', 'new', 'new') },
      preflightGoalResume: async goalId => ({
        goalId,
        sessionId: 'different-session',
        revision: 1,
        dataDir,
        sessionsRoot: join(dataDir, 'dsh-home', 'sessions'),
        evolutionRoot: join(dataDir, 'state', 'evolution'),
      }),
      launchGoalResume: async () => { launches += 1; return 0 },
    })).rejects.toThrow('Session')

    expect(creates).toBe(0)
    expect(launches).toBe(0)
    expect(readLongGoal(stateRoot, record.id).tasks[0]!.execution).toEqual({
      goalId: 'stored-goal', sessionId: 'stored-session',
    })
  })

  it('supports managed and portable status targets and rejects invalid target/options', async () => {
    const dataDir = fixtureRoot()
    const managed = createLongGoal({
      stateRoot: join(dataDir, 'state'),
      objective: 'Managed plan', tasks: ['Managed task'], maxTaskRounds: 2,
    }, { id: () => 'managed-status', now: () => 1 })
    const target = portableFixture()
    const portable = createLongGoal({
      stateRoot: target.stateRoot,
      objective: 'Portable plan', tasks: ['Portable task'], maxTaskRounds: 2,
    }, { id: () => 'portable-status', now: () => 1 })
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await expect(main([
      'plan', 'status', '--goal', managed.id, '--data-dir', dataDir, '--json',
    ])).resolves.toBe(0)
    await expect(main([
      'plan', 'status', '--goal', portable.id, ...portableArgs(target), '--json',
    ])).resolves.toBe(0)
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Managed plan'))
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Portable plan'))

    for (const args of [
      ['plan', 'status', '--goal', managed.id, '--dsh-home', target.dshHome],
      ['plan', 'status', '--goal', managed.id, '--data-dir', dataDir, ...portableArgs(target)],
      ['plan', 'status', '--goal', managed.id, '--goal', managed.id, '--data-dir', dataDir],
      ['plan', 'create', '--objective', 'One', '--objective', 'Two', '--task', 'Task', '--data-dir', dataDir],
      ['task', 'run', '--goal', managed.id, '--data-dir', dataDir, '--json', '--json'],
    ]) {
      await expect(main(args)).resolves.toBe(2)
    }
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('tianwen plan'))
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('tianwen task run'))
  })

  it('keeps existing top-level list parsing and dispatch unchanged', async () => {
    const dataDir = fixtureRoot()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await expect(main(['list', '--data-dir', dataDir, '--json'])).resolves.toBe(0)
    expect(stdout).toHaveBeenCalledWith(`${JSON.stringify({
      schemaVersion: 'tianwen.goal-list.v1',
      goals: [],
      runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
    })}\n`)
    await expect(main(['list', 'extra', '--data-dir', dataDir])).resolves.toBe(2)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('tianwen list'))
    for (const [args, command] of [
      [['create', '--data-dir', dataDir], 'tianwen create'],
      [['status', '--data-dir', dataDir], 'tianwen status'],
      [['resume', '--data-dir', dataDir], 'tianwen resume'],
      [['model', 'status', '--data-dir', dataDir, '--goal', 'wrong'], 'tianwen model'],
      [['controlled-lifecycle', '--data-dir', dataDir], 'tianwen controlled-lifecycle'],
    ] as const) {
      await expect(main([...args])).resolves.toBe(2)
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining(command))
    }
  })
})
