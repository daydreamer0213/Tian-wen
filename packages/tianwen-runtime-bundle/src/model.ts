import { spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveInstalledDshBin } from './resume.js'

export type ModelChoice = 'offline' | 'deepseek-v4-flash' | 'deepseek-v4-pro'
export type ModelOperation = 'status' | 'use' | 'smoke'

export const MODEL_SELECTIONS = {
  offline: { provider: 'tianwen-offline', model: 'phase2-smoke' },
  'deepseek-v4-flash': {
    provider: 'deepseek-official', model: 'deepseek-v4-flash',
  },
  'deepseek-v4-pro': {
    provider: 'deepseek-official', model: 'deepseek-v4-pro',
  },
} as const

export interface ModelCommandPreflight {
  readonly dataDir: string
  readonly dshBin: string
  readonly model?: ModelChoice
  readonly operation: ModelOperation
}

export interface ModelInvocation {
  readonly args: string[]
  readonly options: SpawnOptions
  readonly program: string
}

function strictChild(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== '' && path !== '..' && !path.startsWith(`..\\`) && !isAbsolute(path)
}

function requireSmokeDataDir(dataDir: string): void {
  if (!strictChild(resolve('D:\\DevData'), dataDir)) {
    throw new TypeError('dataDir must be a strict child of D:\\DevData')
  }
}

function requireResolvedSmokeDataDir(dataDir: string): void {
  if (!strictChild(realpathSync(resolve('D:\\DevData')), realpathSync(dataDir))) {
    throw new TypeError('dataDir must resolve under D:\\DevData')
  }
}

export function preflightModelCommand(
  operation: ModelOperation,
  model: ModelChoice | undefined,
  dataDirInput: string,
): ModelCommandPreflight {
  if (!isAbsolute(dataDirInput)) throw new TypeError('dataDir must be an absolute path')
  if (operation !== 'status' && operation !== 'use' && operation !== 'smoke') {
    throw new TypeError('invalid model operation')
  }
  if (
    (operation === 'status' && model !== undefined) ||
    (operation === 'use' && model === undefined) ||
    (operation === 'smoke' && model !== 'deepseek-v4-pro')
  ) {
    throw new TypeError('invalid model command')
  }
  const dataDir = resolve(dataDirInput)
  if (operation === 'smoke') requireSmokeDataDir(dataDir)
  return {
    dataDir,
    dshBin: resolveInstalledDshBin(dataDir),
    ...model === undefined ? {} : { model },
    operation,
  }
}

export function buildModelInvocation(
  preflight: ModelCommandPreflight,
  json: boolean,
): ModelInvocation {
  return {
    program: process.execPath,
    args: [
      preflight.dshBin,
      '--profile',
      'tianwen',
      '--patch',
      resolve(dirname(fileURLToPath(import.meta.url)), '../model.patch.yml'),
    ],
    options: {
      env: {
        ...process.env,
        DSH_HOME: join(preflight.dataDir, 'dsh-home'),
        TIANWEN_MODEL_JSON: String(json),
        TIANWEN_MODEL_MODEL: preflight.model ?? '',
        TIANWEN_MODEL_OPERATION: preflight.operation,
      },
      shell: false,
      stdio: 'inherit',
    },
  }
}

export async function launchModelCommand(
  preflight: ModelCommandPreflight,
  json: boolean,
): Promise<number> {
  if (preflight.operation === 'smoke') requireResolvedSmokeDataDir(preflight.dataDir)
  const invocation = buildModelInvocation(preflight, json)
  const child = spawn(invocation.program, invocation.args, invocation.options)
  return await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolveExit(code ?? 1))
  })
}
