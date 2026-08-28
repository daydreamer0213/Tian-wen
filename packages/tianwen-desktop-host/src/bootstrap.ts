import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import type { DesktopBaseTarget, DesktopTargetInput } from './host.js'

export const DESKTOP_TARGET_FILE_NAME = 'desktop-target.json'
export const DESKTOP_TARGET_SCHEMA_VERSION = 'tianwen.desktop-target.v1' as const

interface SavedDesktopTarget extends DesktopTargetInput {
  readonly schemaVersion: typeof DESKTOP_TARGET_SCHEMA_VERSION
}

function invalidSettings(): Error {
  return new Error('Desktop target settings are invalid')
}

function isSavedDesktopTarget(value: unknown): value is SavedDesktopTarget {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const expectedKeys = ['schemaVersion', 'nodeExecutable', 'dshRoot', 'dshHome']
  if (Object.keys(record).length !== expectedKeys.length || !expectedKeys.every(key => Object.hasOwn(record, key))) return false
  return record.schemaVersion === DESKTOP_TARGET_SCHEMA_VERSION
    && typeof record.nodeExecutable === 'string'
    && typeof record.dshRoot === 'string'
    && typeof record.dshHome === 'string'
}

export function loadSavedDesktopTarget(filePath: string): DesktopTargetInput | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    if (!isSavedDesktopTarget(parsed)) throw invalidSettings()
    return {
      nodeExecutable: parsed.nodeExecutable,
      dshRoot: parsed.dshRoot,
      dshHome: parsed.dshHome,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    if (error instanceof Error && error.message === 'Desktop target settings are invalid') throw error
    throw invalidSettings()
  }
}

export function saveDesktopTarget(filePath: string, target: DesktopBaseTarget): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify({
    schemaVersion: DESKTOP_TARGET_SCHEMA_VERSION,
    nodeExecutable: target.nodeExecutable,
    dshRoot: target.dshRoot,
    dshHome: target.dshHome,
  })}\n`, 'utf8')
}

export interface DesktopDiscoveryDependencies {
  readonly env?: NodeJS.ProcessEnv
  readonly systemRoot?: string
  readonly exists?: (path: string) => boolean
  readonly run?: (program: string, args: readonly string[]) => string
}

function outputLines(output: string): readonly string[] {
  return output.split(/\r?\n/u).map(line => line.trim()).filter(Boolean)
}

function commandOutput(
  run: (program: string, args: readonly string[]) => string,
  program: string,
  args: readonly string[],
): readonly string[] {
  try {
    return outputLines(run(program, args))
  } catch {
    return []
  }
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

export function discoverDesktopTargetInputs(
  dependencies: DesktopDiscoveryDependencies = {},
): readonly DesktopTargetInput[] {
  const env = dependencies.env ?? process.env
  const systemRoot = dependencies.systemRoot ?? env.SystemRoot
  if (systemRoot === undefined || systemRoot === '') return []
  const exists = dependencies.exists ?? existsSync
  const run = dependencies.run ?? ((program, args) => execFileSync(program, args, {
    encoding: 'utf8', windowsHide: true,
  }))
  const where = join(systemRoot, 'System32', 'where.exe')
  const cmd = join(systemRoot, 'System32', 'cmd.exe')
  const nodes = unique(commandOutput(run, where, ['node']))
  const packageRoots = unique([
    ...commandOutput(run, cmd, ['/d', '/s', '/c', '"npm root -g"']),
    ...commandOutput(run, cmd, ['/d', '/s', '/c', '"pnpm root -g"']),
  ])
  const homes: string[] = []
  if (env.DSH_HOME !== undefined && env.DSH_HOME !== '') homes.push(env.DSH_HOME)
  if (env.USERPROFILE !== undefined && env.USERPROFILE !== '') {
    const defaultHome = join(env.USERPROFILE, '.dsh')
    if (exists(defaultHome)) homes.push(defaultHome)
  }

  const results: DesktopTargetInput[] = []
  const seen = new Set<string>()
  for (const nodeExecutable of nodes) {
    for (const packageRoot of packageRoots) {
      const dshRoot = join(packageRoot, '@deepseek-ai', 'dsh')
      for (const dshHome of homes) {
        const input = { nodeExecutable, dshRoot, dshHome }
        const key = JSON.stringify([input.nodeExecutable, input.dshRoot, input.dshHome])
        if (!seen.has(key)) {
          seen.add(key)
          results.push(input)
        }
      }
    }
  }
  return results
}
