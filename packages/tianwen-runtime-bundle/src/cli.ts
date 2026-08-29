#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import {
  GoalStatusAmbiguousError,
  GoalStatusIntegrityError,
  GoalStatusNotFoundError,
  listGoals,
  readGoalStatus,
} from './status.js'
import type { GoalListProjection, GoalStatusProjection } from './status.js'
import {
  GoalResumeUnavailableError,
  launchGoalResume,
  preflightNaturalRunTrial,
  preflightGoalResume,
  preflightPortableGoalResume,
} from './resume.js'
import { createGoalLiveSmokeFailure } from './goal-live-smoke.js'
import {
  launchGoalCreate,
  preflightGoalCreate,
  preflightPortableGoalCreate,
} from './create.js'
import {
  PortableRuntimeBundleUnavailableError,
  resolvePortableProfileTarget,
  verifyPortableRuntimeBundle,
} from './portable-profile.js'
import {
  launchModelCommand,
  preflightModelCommand,
} from './model.js'
import type { ModelChoice } from './model.js'
import {
  ControlledLifecyclePreflightError,
  launchControlledLifecycle,
  preflightControlledLifecycle,
} from './controlled-lifecycle.js'
import {
  createLongGoal,
  formatLongGoalStatusText,
  LongGoalIntegrityError,
  LongGoalNotFoundError,
  readLongGoalStatus,
} from './long-goal.js'
import { runLongGoalTask } from './long-goal-run.js'

const READ_ONLY_USAGE = [
  'Usage: tianwen status --goal GOAL_ID --data-dir ABSOLUTE_PATH [--json]',
  'Usage: tianwen status --goal GOAL_ID --dsh-root ABSOLUTE_PATH --dsh-home ABSOLUTE_PATH --profile NAME --state-root ABSOLUTE_PATH [--json]',
  'Usage: tianwen list --data-dir ABSOLUTE_PATH [--json]',
  'Usage: tianwen list --dsh-root ABSOLUTE_PATH --dsh-home ABSOLUTE_PATH --profile NAME --state-root ABSOLUTE_PATH [--json]',
  '',
].join('\n')

const RESUME_USAGE = [
  'Usage: tianwen resume --goal GOAL_ID --data-dir ABSOLUTE_PATH [--json]',
  'Usage: tianwen resume --goal GOAL_ID --dsh-root ABSOLUTE_PATH --dsh-home ABSOLUTE_PATH --profile NAME --state-root ABSOLUTE_PATH [--json]',
  'Usage: tianwen resume --goal GOAL_ID --data-dir ABSOLUTE_PATH --live-smoke --json',
  'Usage: tianwen resume --goal GOAL_ID --data-dir ABSOLUTE_PATH --trial-manifest ABSOLUTE_PATH --json',
  '',
].join('\n')

const CREATE_USAGE = [
  'Usage: tianwen create --objective TEXT --data-dir ABSOLUTE_PATH [--max-rounds N] [--json]',
  'Usage: tianwen create --objective TEXT --dsh-root ABSOLUTE_PATH --dsh-home ABSOLUTE_PATH --profile NAME --state-root ABSOLUTE_PATH [--max-rounds N] [--json]',
  '',
].join('\n')

const MODEL_USAGE = [
  'Usage: tianwen model status --data-dir ABSOLUTE_PATH [--json]',
  'Usage: tianwen model use --model offline|deepseek-v4-flash|deepseek-v4-pro --data-dir ABSOLUTE_PATH [--json]',
  'Usage: tianwen model smoke --model deepseek-v4-pro --data-dir D:\\DevData\\ABSOLUTE_PATH [--json]',
  '',
].join('\n')

const CONTROLLED_LIFECYCLE_USAGE = [
  'Usage: tianwen controlled-lifecycle --manifest ABSOLUTE_JSON --data-dir ABSOLUTE_PRODUCT_ROOT --json',
  '',
].join('\n')

const PLAN_USAGE = [
  'Usage: tianwen plan create --objective TEXT --task TEXT [--task TEXT] --data-dir ABSOLUTE_PATH [--max-rounds N] [--json]',
  'Usage: tianwen plan create --objective TEXT --task TEXT [--task TEXT] --dsh-root ABSOLUTE_PATH --dsh-home ABSOLUTE_PATH --profile NAME --state-root ABSOLUTE_PATH [--max-rounds N] [--json]',
  'Usage: tianwen plan status --goal LONG_GOAL_ID --data-dir ABSOLUTE_PATH [--json]',
  'Usage: tianwen plan status --goal LONG_GOAL_ID --dsh-root ABSOLUTE_PATH --dsh-home ABSOLUTE_PATH --profile NAME --state-root ABSOLUTE_PATH [--json]',
  '',
].join('\n')

const TASK_USAGE = [
  'Usage: tianwen task run --goal LONG_GOAL_ID --data-dir ABSOLUTE_PATH [--json]',
  'Usage: tianwen task run --goal LONG_GOAL_ID --dsh-root ABSOLUTE_PATH --dsh-home ABSOLUTE_PATH --profile NAME --state-root ABSOLUTE_PATH [--json]',
  '',
].join('\n')

function usage(command: string | undefined): string {
  if (command === 'controlled-lifecycle') return CONTROLLED_LIFECYCLE_USAGE
  if (command === 'model') return MODEL_USAGE
  if (command === 'plan') return PLAN_USAGE
  if (command === 'task') return TASK_USAGE
  if (command === 'resume') return RESUME_USAGE
  return command === 'create' ? CREATE_USAGE : READ_ONLY_USAGE
}

function positiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) return 3
  if (!/^[1-9][0-9]*$/u.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function isSmokeDataDir(dataDir: string): boolean {
  const devDataDir = resolve('D:\\DevData')
  const resolved = resolve(dataDir)
  return resolved === devDataDir || resolved.startsWith(`${devDataDir}\\`)
}

function hasRepeatedStrictOption(args: readonly string[]): boolean {
  const optionCount = (name: string): number => args.filter(argument =>
    argument === `--${name}` || argument.startsWith(`--${name}=`)
  ).length
  return (optionCount('live-smoke') > 0 || optionCount('trial-manifest') > 0) &&
    ['goal', 'data-dir', 'live-smoke', 'trial-manifest', 'json']
      .some(name => optionCount(name) > 1)
}

function hasRepeatedTargetOption(args: readonly string[]): boolean {
  return [
    'data-dir', 'dsh-root', 'dsh-home', 'profile', 'state-root',
  ].some(name => args.filter(argument =>
    argument === `--${name}` || argument.startsWith(`--${name}=`)
  ).length > 1)
}

function hasRepeatedControlledOption(args: readonly string[]): boolean {
  return ['manifest', 'data-dir', 'json'].some(name =>
    args.filter(argument =>
      argument === `--${name}` || argument.startsWith(`--${name}=`)
    ).length > 1,
  )
}

function hasRepeatedLongGoalOption(args: readonly string[]): boolean {
  return ['goal', 'objective', 'max-rounds', 'json'].some(name =>
    args.filter(argument =>
      argument === `--${name}` || argument.startsWith(`--${name}=`)
    ).length > 1,
  )
}

function formatText(status: GoalStatusProjection): string {
  const eventLabel = status.session.eventCount === 1 ? 'event' : 'events'
  const lines = [
    `Goal ${status.goal.id} [${status.goal.phase}]`,
    `Objective: ${status.goal.objective}`,
    `Progress: ${status.goal.roundsStarted}/${status.goal.maxGoalRounds} rounds`,
    `Session: ${status.session.id} (${status.session.eventCount} ${eventLabel})`,
    `Evidence: ${status.evidence.total} total (${status.evidence.counts.complete} complete, ${status.evidence.counts['missing-result']} missing-result)`,
    ...status.evidence.items.map(
      item => `  - ${item.toolName}: ${item.status}`,
    ),
    status.champion === null
      ? 'Champion: none'
      : `Champion: ${status.champion.artifactId} revision ${status.champion.revision}`,
    'Runtime: not-loaded; read-only; 0 model requests',
  ]
  return `${lines.join('\n')}\n`
}

function formatListText(list: GoalListProjection): string {
  if (list.goals.length === 0) return 'No Goals.\n'
  return `${[
    `Goals: ${list.goals.length}`,
    ...list.goals.map(goal =>
      `[${goal.phase}] ${goal.id} ${goal.roundsStarted}/${goal.maxGoalRounds} rounds - ${goal.objective.replace(/\s+/gu, ' ').trim()} (session ${goal.session.id})`
    ),
    'Runtime: not-loaded; read-only; 0 model requests',
  ].join('\n')}\n`
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  let values: {
    readonly goal?: string
    readonly 'data-dir'?: string
    readonly 'dsh-root'?: string
    readonly 'dsh-home'?: string
    readonly profile?: string
    readonly 'state-root'?: string
    readonly json?: boolean
    readonly model?: string
    readonly objective?: string
    readonly 'max-rounds'?: string
    readonly 'live-smoke'?: boolean
    readonly 'trial-manifest'?: string
    readonly manifest?: string
    readonly task?: string[]
  }
  let positionals: string[]
  try {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        goal: { type: 'string' },
        'data-dir': { type: 'string' },
        'dsh-root': { type: 'string' },
        'dsh-home': { type: 'string' },
        profile: { type: 'string' },
        'state-root': { type: 'string' },
        json: { type: 'boolean', default: false },
        model: { type: 'string' },
        objective: { type: 'string' },
        'max-rounds': { type: 'string' },
        'live-smoke': { type: 'boolean', default: false },
        'trial-manifest': { type: 'string' },
        manifest: { type: 'string' },
        task: { type: 'string', multiple: true },
      },
    })
    values = parsed.values
    positionals = parsed.positionals
  } catch {
    process.stderr.write(usage(args[0]))
    return 2
  }
  const command = positionals[0]
  const modelOperation = positionals[1]
  const longGoalOperation = positionals[1]
  const planCreate = command === 'plan' && longGoalOperation === 'create'
  const planStatus = command === 'plan' && longGoalOperation === 'status'
  const taskRun = command === 'task' && longGoalOperation === 'run'
  const longGoalCommand = planCreate || planStatus || taskRun
  const maxGoalRounds = positiveInteger(values['max-rounds'])
  const modelChoice = values.model as ModelChoice | undefined
  const liveSmoke = values['live-smoke'] === true
  const trialManifest = values['trial-manifest']
  const portableValues = [
    values['dsh-root'], values['dsh-home'], values.profile, values['state-root'],
  ]
  const hasPortableTarget = portableValues.some(value => value !== undefined)
  const completePortableTarget = portableValues.every(value => value !== undefined)
  const managedTarget = values['data-dir'] !== undefined
  const portableCommand = longGoalCommand ||
    ['status', 'list', 'create', 'resume'].includes(command ?? '')
  const validTarget = managedTarget
    ? !hasPortableTarget && isAbsolute(values['data-dir']!)
    : portableCommand && completePortableTarget && portableValues
      .filter((_, index) => index !== 2)
      .every(value => isAbsolute(value!))
  if (
    hasRepeatedStrictOption(args) ||
    hasRepeatedTargetOption(args) ||
    (longGoalCommand && hasRepeatedLongGoalOption(args)) ||
    (command === 'controlled-lifecycle' && hasRepeatedControlledOption(args)) ||
    (command !== 'controlled-lifecycle' && values.manifest !== undefined) ||
    (command === 'model' || longGoalCommand
      ? positionals.length !== 2
      : positionals.length !== 1) ||
    !validTarget ||
    (!managedTarget && (liveSmoke || trialManifest !== undefined)) ||
    (values.task !== undefined && !planCreate) ||
    (
      planCreate
        ? values.goal !== undefined || values.objective?.trim().length === 0 ||
          values.objective === undefined || values.task === undefined ||
          values.task.length === 0 || values.task.some(task => task.trim().length === 0) ||
          maxGoalRounds === undefined || values.model !== undefined ||
          liveSmoke || trialManifest !== undefined
        : planStatus || taskRun
          ? values.goal === undefined || values.goal.length === 0 ||
            values.objective !== undefined || values['max-rounds'] !== undefined ||
            values.model !== undefined || liveSmoke || trialManifest !== undefined
      : command === 'status' || command === 'resume'
        ? values.goal === undefined || values.goal.length === 0 ||
          values.objective !== undefined || values['max-rounds'] !== undefined || values.model !== undefined ||
          (command !== 'resume' && (liveSmoke || trialManifest !== undefined)) ||
          (liveSmoke && trialManifest !== undefined) ||
          ((liveSmoke || trialManifest !== undefined) && values.json !== true)
        : command === 'list'
          ? values.goal !== undefined || values.objective !== undefined ||
            values['max-rounds'] !== undefined || values.model !== undefined || liveSmoke || trialManifest !== undefined
          : command === 'create'
            ? values.goal !== undefined || values.objective?.trim().length === 0 ||
              values.objective === undefined || maxGoalRounds === undefined || values.model !== undefined || liveSmoke || trialManifest !== undefined
          : command === 'model'
              ? values.goal !== undefined || values.objective !== undefined ||
                values['max-rounds'] !== undefined ||
                liveSmoke || trialManifest !== undefined ||
                (modelOperation === 'status' ? values.model !== undefined :
                  modelOperation === 'use'
                    ? modelChoice === undefined || !['offline', 'deepseek-v4-flash', 'deepseek-v4-pro'].includes(modelChoice)
                    : modelOperation === 'smoke'
                      ? modelChoice !== 'deepseek-v4-pro' || !isSmokeDataDir(values['data-dir']!)
                    : true)
            : command === 'controlled-lifecycle'
              ? values.goal !== undefined || values.objective !== undefined ||
                values['max-rounds'] !== undefined || values.model !== undefined ||
                liveSmoke || trialManifest !== undefined ||
                values.manifest === undefined || !isAbsolute(values.manifest) ||
                values.json !== true
            : true
    )
  ) {
    process.stderr.write(usage(command))
    return 2
  }

  try {
    const portableTarget = managedTarget ? undefined : resolvePortableProfileTarget({
      dshRoot: values['dsh-root']!,
      dshHome: values['dsh-home']!,
      profile: values.profile!,
      stateRoot: values['state-root']!,
    })
    if (portableTarget !== undefined) verifyPortableRuntimeBundle(portableTarget)
    if (planCreate) {
      const stateRoot = portableTarget === undefined
        ? resolve(values['data-dir']!, 'state')
        : portableTarget.stateRoot
      const record = createLongGoal({
        stateRoot,
        objective: values.objective!,
        tasks: values.task!,
        maxTaskRounds: maxGoalRounds!,
      })
      const status = await readLongGoalStatus({
        stateRoot,
        longGoalId: record.id,
        dshStatusTarget: portableTarget === undefined
          ? { dataDir: values['data-dir']! }
          : {
              sessionsRoot: portableTarget.sessionsRoot,
              evolutionRoot: portableTarget.evolutionRoot,
            },
      })
      process.stdout.write(values.json
        ? `${JSON.stringify(status)}\n`
        : `${formatLongGoalStatusText(status)}\n`)
      return 0
    }
    if (planStatus) {
      const status = await readLongGoalStatus({
        stateRoot: portableTarget === undefined
          ? resolve(values['data-dir']!, 'state')
          : portableTarget.stateRoot,
        longGoalId: values.goal!,
        dshStatusTarget: portableTarget === undefined
          ? { dataDir: values['data-dir']! }
          : {
              sessionsRoot: portableTarget.sessionsRoot,
              evolutionRoot: portableTarget.evolutionRoot,
            },
      })
      process.stdout.write(values.json
        ? `${JSON.stringify(status)}\n`
        : `${formatLongGoalStatusText(status)}\n`)
      return 0
    }
    if (taskRun) {
      return await runLongGoalTask({
        longGoalId: values.goal!,
        productTarget: portableTarget === undefined
          ? { kind: 'managed', dataDir: values['data-dir']! }
          : { kind: 'portable', target: portableTarget },
        json: values.json === true,
      })
    }
    if (command === 'controlled-lifecycle') {
      return await launchControlledLifecycle(preflightControlledLifecycle(
        values.manifest!, values['data-dir']!,
      ))
    }
    if (command === 'model') {
      return await launchModelCommand(preflightModelCommand(
        modelOperation as 'status' | 'use' | 'smoke', modelChoice, values['data-dir']!,
      ), values.json === true)
    }
    if (command === 'create') {
      const preflight = portableTarget === undefined
        ? preflightGoalCreate(values.objective!, maxGoalRounds!, values['data-dir']!)
        : preflightPortableGoalCreate(values.objective!, maxGoalRounds!, portableTarget)
      return await launchGoalCreate(preflight, values.json === true)
    }
    if (command === 'resume') {
      const preflight = portableTarget !== undefined
        ? await preflightPortableGoalResume(values.goal!, portableTarget)
        : trialManifest === undefined
        ? await preflightGoalResume(values.goal!, values['data-dir']!, liveSmoke)
        : await preflightNaturalRunTrial(
            values.goal!, values['data-dir']!, trialManifest,
          )
      return await launchGoalResume(preflight, values.json === true)
    }
    if (command === 'list') {
      const list = portableTarget === undefined
        ? await listGoals({ dataDir: values['data-dir']! })
        : await listGoals({ sessionsRoot: portableTarget.sessionsRoot })
      process.stdout.write(values.json
        ? `${JSON.stringify(list)}\n`
        : formatListText(list))
      return 0
    }
    const status = portableTarget === undefined
      ? await readGoalStatus({ goalId: values.goal!, dataDir: values['data-dir']! })
      : await readGoalStatus({
          goalId: values.goal!,
          sessionsRoot: portableTarget.sessionsRoot,
          evolutionRoot: portableTarget.evolutionRoot,
        })
    process.stdout.write(values.json
      ? `${JSON.stringify(status)}\n`
      : formatText(status))
    return 0
  } catch (error) {
    if (command === 'resume' && liveSmoke) {
      process.stdout.write(`${JSON.stringify(createGoalLiveSmokeFailure('preflight-rejected'))}\n`)
      return 1
    }
    if (command === 'resume' && trialManifest !== undefined) {
      process.stderr.write('Error: natural Run trial preflight failed\n')
      return 1
    }
    if (error instanceof GoalStatusNotFoundError) {
      process.stderr.write(`${error.message}\n`)
      return 3
    }
    if (error instanceof LongGoalNotFoundError) {
      process.stderr.write(`${error.message}\n`)
      return 3
    }
    if (error instanceof PortableRuntimeBundleUnavailableError) {
      process.stderr.write(`${error.message}\n`)
      return 1
    }
    if (command === 'controlled-lifecycle') {
      process.stderr.write(error instanceof ControlledLifecyclePreflightError &&
        error.code === 'installed-receipt-mismatch'
        ? 'Error: controlled lifecycle preflight failed: installed-receipt-mismatch\n'
        : 'Error: controlled lifecycle preflight failed\n')
      return 1
    }
    if (
      error instanceof GoalStatusAmbiguousError ||
      error instanceof GoalStatusIntegrityError ||
      error instanceof GoalResumeUnavailableError ||
      error instanceof LongGoalIntegrityError
    ) {
      process.stderr.write(`Error: ${error.message}\n`)
      return 1
    }
    if (longGoalCommand) {
      process.stderr.write(error instanceof Error
        ? `Error: ${error.message}\n`
        : 'Error: unable to run long Goal command\n')
      return 1
    }
    process.stderr.write(command === 'resume'
      ? 'Error: unable to resume Goal\n'
      : command === 'create'
        ? 'Error: unable to create Goal\n'
        : command === 'model'
          ? 'Error: unable to configure model\n'
        : 'Error: unable to read Goal status\n')
    return 1
  }
}

if (
  process.argv[1] !== undefined &&
  realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exitCode = await main()
}
