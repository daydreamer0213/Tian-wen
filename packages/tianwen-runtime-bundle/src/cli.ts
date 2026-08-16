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

const READ_ONLY_USAGE = [
  'Usage: tianwen status --goal GOAL_ID --data-dir ABSOLUTE_PATH [--json]',
  'Usage: tianwen list --data-dir ABSOLUTE_PATH [--json]',
  '',
].join('\n')

const RESUME_USAGE = [
  'Usage: tianwen resume --goal GOAL_ID --data-dir ABSOLUTE_PATH [--json]',
  '',
].join('\n')

function usage(command: string | undefined): string {
  return command === 'resume' ? RESUME_USAGE : READ_ONLY_USAGE
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
      },
    })
    values = parsed.values
    positionals = parsed.positionals
  } catch {
    process.stderr.write(usage(args[0]))
    return 2
  }
  const command = positionals[0]
  if (
    positionals.length !== 1 ||
    values['data-dir'] === undefined ||
    !isAbsolute(values['data-dir']) ||
    (
      command === 'status' || command === 'resume'
        ? values.goal === undefined || values.goal.length === 0
        : command === 'list' ? values.goal !== undefined : true
    )
  ) {
    process.stderr.write(usage(command))
    return 2
  }

  try {
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
