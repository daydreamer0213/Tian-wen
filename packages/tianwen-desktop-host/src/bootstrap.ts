import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { parseDesktopArgs, resolveDesktopBaseTarget } from './host.js'
import type { DesktopBaseTarget, DesktopTargetInput } from './host.js'

export const DESKTOP_TARGET_FILE_NAME = 'desktop-target.json'
export const DESKTOP_TARGET_SCHEMA_VERSION = 'tianwen.desktop-target.v1' as const

export function desktopTargetArguments(argv: readonly string[], packaged: boolean): readonly string[] {
  return argv.slice(packaged ? 1 : 2)
}

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
    ...commandOutput(run, cmd, ['/d', '/s', '/c', 'npm root -g']),
    ...commandOutput(run, cmd, ['/d', '/s', '/c', 'pnpm root -g']),
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

export interface DesktopBootstrapInteractions {
  selectTarget(suggested?: Partial<DesktopTargetInput>): Promise<DesktopTargetInput | undefined>
  confirmSavedTargetReplacement(reason: string): Promise<boolean>
  reportSelectedTargetError(reason: string): Promise<void>
}

export interface DesktopBootstrapDependencies extends DesktopBootstrapInteractions {
  readonly validateTarget?: (input: DesktopTargetInput) => DesktopBaseTarget
  readonly loadSavedTarget?: (filePath: string) => DesktopTargetInput | undefined
  readonly saveTarget?: (filePath: string, target: DesktopBaseTarget) => void
  readonly discoverTargetInputs?: () => readonly DesktopTargetInput[]
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function resolveDesktopBootstrapTarget(
  argv: readonly string[],
  settingsPath: string,
  dependencies: DesktopBootstrapDependencies,
): Promise<DesktopBaseTarget | undefined> {
  const validateTarget = dependencies.validateTarget ?? resolveDesktopBaseTarget
  const loadSavedTarget = dependencies.loadSavedTarget ?? loadSavedDesktopTarget
  const saveTarget = dependencies.saveTarget ?? saveDesktopTarget
  const discoverTargetInputs = dependencies.discoverTargetInputs ?? discoverDesktopTargetInputs

  if (argv.length > 0) return validateTarget(parseDesktopArgs(argv))

  let saved: DesktopTargetInput | undefined
  try {
    saved = loadSavedTarget(settingsPath)
  } catch (error) {
    if (!await dependencies.confirmSavedTargetReplacement(errorReason(error))) return undefined
    return resolveSelectedTarget(undefined, settingsPath, validateTarget, saveTarget, dependencies)
  }
  if (saved !== undefined) {
    try {
      return validateTarget(saved)
    } catch (error) {
      if (!await dependencies.confirmSavedTargetReplacement(errorReason(error))) return undefined
      return resolveSelectedTarget(saved, settingsPath, validateTarget, saveTarget, dependencies)
    }
  }

  for (const candidate of discoverTargetInputs()) {
    try {
      const target = validateTarget(candidate)
      saveTarget(settingsPath, target)
      return target
    } catch {
      // Automatic candidates are speculative; move on to the next one.
    }
  }
  return resolveSelectedTarget(undefined, settingsPath, validateTarget, saveTarget, dependencies)
}

async function resolveSelectedTarget(
  initialSuggestion: Partial<DesktopTargetInput> | undefined,
  settingsPath: string,
  validateTarget: (input: DesktopTargetInput) => DesktopBaseTarget,
  saveTarget: (filePath: string, target: DesktopBaseTarget) => void,
  interactions: DesktopBootstrapInteractions,
): Promise<DesktopBaseTarget | undefined> {
  let suggested = initialSuggestion
  for (;;) {
    const selected = await interactions.selectTarget(suggested)
    if (selected === undefined) return undefined
    try {
      const target = validateTarget(selected)
      saveTarget(settingsPath, target)
      return target
    } catch (error) {
      await interactions.reportSelectedTargetError(errorReason(error))
      suggested = selected
    }
  }
}

export interface DesktopDialog {
  showOpenDialog(options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue>
  showMessageBox(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue>
}

export function createDesktopBootstrapInteractions(dialog: DesktopDialog): DesktopBootstrapInteractions {
  return {
    async selectTarget(suggested) {
      const node = await dialog.showOpenDialog({
        title: 'Select Node executable',
        ...(suggested?.nodeExecutable === undefined ? {} : { defaultPath: suggested.nodeExecutable }),
        properties: ['openFile'],
        filters: [{ name: 'Node executable', extensions: ['exe'] }],
      })
      if (node.canceled) return undefined
      const dshRoot = await dialog.showOpenDialog({
        title: 'Select DSH root',
        ...(suggested?.dshRoot === undefined ? {} : { defaultPath: suggested.dshRoot }),
        properties: ['openDirectory'],
      })
      if (dshRoot.canceled) return undefined
      const dshHome = await dialog.showOpenDialog({
        title: 'Select DSH home',
        ...(suggested?.dshHome === undefined ? {} : { defaultPath: suggested.dshHome }),
        properties: ['openDirectory'],
      })
      if (dshHome.canceled) return undefined
      return {
        nodeExecutable: node.filePaths[0]!,
        dshRoot: dshRoot.filePaths[0]!,
        dshHome: dshHome.filePaths[0]!,
      }
    },
    async confirmSavedTargetReplacement(reason) {
      const result = await dialog.showMessageBox({
        type: 'warning',
        message: 'Saved Tianwen Desktop target is invalid',
        detail: reason,
        buttons: ['Choose replacement', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
      })
      return result.response === 0
    },
    async reportSelectedTargetError(reason) {
      await dialog.showMessageBox({
        type: 'error',
        message: 'Selected Tianwen Desktop target is invalid',
        detail: reason,
        buttons: ['OK'],
      })
    },
  }
}
