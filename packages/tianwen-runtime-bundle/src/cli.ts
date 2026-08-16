#!/usr/bin/env node

import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
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
  preflightGoalResume,
} from './resume.js'
import { launchGoalCreate, preflightGoalCreate } from './create.js'
import {
  launchModelCommand,
  preflightModelCommand,
} from './model.js'
import type { ModelChoice } from './model.js'

const READ_ONLY_USAGE = [
  'Usage: tianwen status --goal GOAL_ID --data-dir ABSOLUTE_PATH [--json]',
  'Usage: tianwen list --data-dir ABSOLUTE_PATH [--json]',
  '',
].join('\n')

const RESUME_USAGE = [
  'Usage: tianwen resume --goal GOAL_ID --data-dir ABSOLUTE_PATH [--json]',
  '',
].join('\n')

const CREATE_USAGE = [
  'Usage: tianwen create --objective TEXT --data-dir ABSOLUTE_PATH [--max-rounds N] [--json]',
  '',
].join('\n')

const MODEL_USAGE = [
  'Usage: tianwen model status --data-dir ABSOLUTE_PATH [--json]',
  'Usage: tianwen model use --model offline|deepseek-v4-flash|deepseek-v4-pro --data-dir ABSOLUTE_PATH [--json]',
  'Usage: tianwen model smoke --model deepseek-v4-pro --data-dir D:\\DevData\\ABSOLUTE_PATH [--json]',
  '',
].join('\n')

function usage(command: string | undefined): string {
  if (command === 'model') return MODEL_USAGE
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
    readonly json?: boolean
    readonly model?: string
    readonly objective?: string
    readonly 'max-rounds'?: string
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
        json: { type: 'boolean', default: false },
        model: { type: 'string' },
        objective: { type: 'string' },
        'max-rounds': { type: 'string' },
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
  const maxGoalRounds = positiveInteger(values['max-rounds'])
  const modelChoice = values.model as ModelChoice | undefined
  if (
    (command === 'model' ? positionals.length !== 2 : positionals.length !== 1) ||
    values['data-dir'] === undefined ||
    !isAbsolute(values['data-dir']) ||
    (
      command === 'status' || command === 'resume'
        ? values.goal === undefined || values.goal.length === 0 ||
          values.objective !== undefined || values['max-rounds'] !== undefined || values.model !== undefined
        : command === 'list'
          ? values.goal !== undefined || values.objective !== undefined ||
            values['max-rounds'] !== undefined || values.model !== undefined
          : command === 'create'
            ? values.goal !== undefined || values.objective?.trim().length === 0 ||
              values.objective === undefined || maxGoalRounds === undefined || values.model !== undefined
            : command === 'model'
              ? values.goal !== undefined || values.objective !== undefined ||
                values['max-rounds'] !== undefined ||
                (modelOperation === 'status' ? values.model !== undefined :
                  modelOperation === 'use'
                    ? modelChoice === undefined || !['offline', 'deepseek-v4-flash', 'deepseek-v4-pro'].includes(modelChoice)
                    : modelOperation === 'smoke'
                      ? modelChoice !== 'deepseek-v4-pro' || !isSmokeDataDir(values['data-dir'])
                    : true)
            : true
    )
  ) {
    process.stderr.write(usage(command))
    return 2
  }

  try {
    if (command === 'model') {
      return await launchModelCommand(preflightModelCommand(
        modelOperation as 'status' | 'use' | 'smoke', modelChoice, values['data-dir'],
      ), values.json === true)
    }
    if (command === 'create') {
      return await launchGoalCreate(preflightGoalCreate(
        values.objective!, maxGoalRounds!, values['data-dir'],
      ), values.json === true)
    }
    if (command === 'resume') {
      return await launchGoalResume(await preflightGoalResume(
        values.goal!, values['data-dir'],
      ), values.json === true)
    }
    if (command === 'list') {
      const list = await listGoals({ dataDir: values['data-dir'] })
      process.stdout.write(values.json
        ? `${JSON.stringify(list)}\n`
        : formatListText(list))
      return 0
    }
    const status = await readGoalStatus({
      goalId: values.goal!,
      dataDir: values['data-dir'],
    })
    process.stdout.write(values.json
      ? `${JSON.stringify(status)}\n`
      : formatText(status))
    return 0
  } catch (error) {
    if (error instanceof GoalStatusNotFoundError) {
      process.stderr.write(`${error.message}\n`)
      return 3
    }
    if (
      error instanceof GoalStatusAmbiguousError ||
      error instanceof GoalStatusIntegrityError ||
      error instanceof GoalResumeUnavailableError
    ) {
      process.stderr.write(`Error: ${error.message}\n`)
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
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = await main()
}
