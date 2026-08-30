import { spawn as nodeSpawn } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { resolveDesktopTarget, resolveKnownOldDesktopTarget } from './host.js'
import type { DesktopBaseTarget, DesktopTarget } from './host.js'

const runtimePackage = '@tianwen/runtime-bundle'

export type WebProfileState =
  | { readonly kind: 'ready', readonly profileRoot: string }
  | { readonly kind: 'outdated-runtime', readonly profileRoot: string }
  | { readonly kind: 'missing-profile', readonly profileRoot: string }
  | { readonly kind: 'missing-runtime', readonly profileRoot: string }
  | { readonly kind: 'incompatible', readonly profileRoot: string, readonly reason: string }

export interface ProfilePreparationFailure {
  readonly stage: 'dsh-plugin-add'
  readonly exitCode: number | null
  readonly profileRoot: string
  readonly stderr: string
}

export class ProfilePreparationError extends Error implements ProfilePreparationFailure {
  readonly stage = 'dsh-plugin-add' as const

  constructor(
    readonly exitCode: number | null,
    readonly profileRoot: string,
    readonly stderr: string,
  ) {
    super(`DSH Profile preparation failed (stage=dsh-plugin-add, exitCode=${String(exitCode)}, profileRoot=${profileRoot})${stderr.length === 0 ? '' : `: ${stderr.trim()}`}`)
    this.name = 'ProfilePreparationError'
  }
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function profileEntryExists(path: string): boolean {
  try {
    return lstatSync(path, { throwIfNoEntry: false }) !== undefined
  } catch {
    return true
  }
}

function profileResolvesWithinHome(target: DesktopBaseTarget, path: string): boolean {
  try {
    const child = relative(target.dshHome, realpathSync(path))
    return child === '' || (!child.startsWith('..') && !isAbsolute(child))
  } catch {
    return false
  }
}

function missingProfileParentResolvesWithinHome(target: DesktopBaseTarget, path: string): boolean {
  let ancestor = path
  for (;;) {
    let entry: ReturnType<typeof lstatSync> | undefined
    try {
      entry = lstatSync(ancestor, { throwIfNoEntry: false })
    } catch {
      return false
    }
    if (entry !== undefined) {
      try {
        if (realpathSync(target.dshHome) !== target.dshHome) return false
        const resolved = realpathSync(ancestor)
        const child = relative(target.dshHome, resolved)
        return statSync(resolved).isDirectory() && (child === '' || (!child.startsWith('..') && !isAbsolute(child)))
      } catch {
        return false
      }
    }
    const parent = dirname(ancestor)
    if (parent === ancestor) return false
    ancestor = parent
  }
}

function mentionsRuntime(value: unknown): boolean {
  if (Array.isArray(value)) return value.includes(runtimePackage)
  return value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, runtimePackage)
}

function profileManifestWithoutRuntime(path: string): boolean {
  try {
    const value: unknown = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    const profile = value as Record<string, unknown>
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies']) {
      if (mentionsRuntime(profile[section])) return false
    }
    const dsh = profile.dsh
    if (dsh !== null && typeof dsh === 'object' && !Array.isArray(dsh)) {
      const dshProfile = (dsh as Record<string, unknown>).profile
      if (dshProfile !== null && typeof dshProfile === 'object' && !Array.isArray(dshProfile) &&
        mentionsRuntime((dshProfile as Record<string, unknown>).bundles)) return false
    }
    return true
  } catch {
    return false
  }
}

export function inspectWebProfile(target: DesktopBaseTarget): WebProfileState {
  const profileRoot = join(target.dshHome, 'profiles', 'web')
  try {
    return { kind: 'ready', profileRoot: resolveDesktopTarget(target).profileRoot }
  } catch (error) {
    const reason = errorReason(error)
    try {
      return { kind: 'outdated-runtime', profileRoot: resolveKnownOldDesktopTarget(target).profileRoot }
    } catch {
      // Only the one known old Runtime is eligible for the embedded update path.
    }
    if (!profileEntryExists(profileRoot) && missingProfileParentResolvesWithinHome(target, profileRoot)) {
      return { kind: 'missing-profile', profileRoot }
    }
    if (profileResolvesWithinHome(target, profileRoot) && profileManifestWithoutRuntime(profileRoot)) {
      return { kind: 'missing-runtime', profileRoot }
    }
    return { kind: 'incompatible', profileRoot, reason }
  }
}

function powerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function renderManualPreparationCommand(target: DesktopBaseTarget, runtimeTarball: string): string {
  return `& { $env:DSH_HOME = ${powerShellLiteral(target.dshHome)}; & ${powerShellLiteral(target.nodeExecutable)} ${[
    target.dshBin,
    'plugin', '--profile', 'web', '--allow-build=koffi',
    'add', runtimeTarball,
  ].map(powerShellLiteral).join(' ')} }`
}

function runRuntimePluginAdd(
  target: DesktopBaseTarget,
  runtimeTarball: string,
  profileRoot: string,
  dependencies: { readonly spawn?: typeof import('node:child_process').spawn } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof nodeSpawn>
    try {
      child = (dependencies.spawn ?? nodeSpawn)(target.nodeExecutable, [
        target.dshBin,
        'plugin', '--profile', 'web', '--allow-build=koffi',
        'add', runtimeTarball,
      ], {
        env: { ...process.env, DSH_HOME: target.dshHome, DSH_TELEMETRY_DISABLED: '1' },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      reject(new ProfilePreparationError(null, profileRoot, errorReason(error)))
      return
    }

    const chunks: Buffer[] = []
    let settled = false
    const fail = (exitCode: number | null, stderr: string): void => {
      if (settled) return
      settled = true
      reject(new ProfilePreparationError(exitCode, profileRoot, stderr))
    }
    if (child.stdout === null || child.stderr === null) {
      fail(null, 'DSH plugin add did not expose piped output')
      return
    }
    child.stdout.resume()
    child.stderr.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    child.once('error', error => fail(null, Buffer.concat(chunks).toString('utf8') || error.message))
    child.once('close', code => {
      if (settled) return
      settled = true
      if (code === 0) resolve()
      else reject(new ProfilePreparationError(code, profileRoot, Buffer.concat(chunks).toString('utf8')))
    })
  })
}

export function prepareMissingWebProfile(
  target: DesktopBaseTarget,
  runtimeTarball: string,
  dependencies: { readonly spawn?: typeof import('node:child_process').spawn } = {},
): Promise<void> {
  const profileRoot = join(target.dshHome, 'profiles', 'web')
  if (profileEntryExists(profileRoot)) return Promise.reject(new Error(`Web Profile entry already exists: ${profileRoot}`))
  if (!missingProfileParentResolvesWithinHome(target, profileRoot)) {
    return Promise.reject(new Error(`Web Profile parent is not contained within DSH home: ${profileRoot}`))
  }
  return runRuntimePluginAdd(target, runtimeTarball, profileRoot, dependencies)
}

export function updateOutdatedWebProfile(
  target: DesktopBaseTarget,
  runtimeTarball: string,
  dependencies: { readonly spawn?: typeof import('node:child_process').spawn } = {},
): Promise<void> {
  const profileRoot = resolveKnownOldDesktopTarget(target).profileRoot
  return runRuntimePluginAdd(target, runtimeTarball, profileRoot, dependencies)
}

export interface DesktopProfileInteractions {
  confirmCreateProfile(profileRoot: string): Promise<boolean>
  confirmUpdateRuntime(profileRoot: string): Promise<boolean>
  showManualPreparation(reason: string, command: string): Promise<void>
}

export async function resolvePreparedDesktopTarget(
  base: DesktopBaseTarget,
  runtimeTarball: string,
  interactions: DesktopProfileInteractions,
  dependencies: {
    readonly inspect?: typeof inspectWebProfile
    readonly prepare?: typeof prepareMissingWebProfile
    readonly update?: typeof updateOutdatedWebProfile
    readonly validate?: typeof resolveDesktopTarget
  } = {},
): Promise<DesktopTarget | undefined> {
  const state = (dependencies.inspect ?? inspectWebProfile)(base)
  const validate = dependencies.validate ?? resolveDesktopTarget
  if (state.kind === 'ready') return validate(base)
  if (state.kind === 'missing-runtime') {
    await interactions.showManualPreparation(
      `The existing Web Profile at ${state.profileRoot} does not declare ${runtimePackage}. Automatic preparation is disabled.`,
      renderManualPreparationCommand(base, runtimeTarball),
    )
    return undefined
  }
  if (state.kind === 'outdated-runtime') {
    if (!await interactions.confirmUpdateRuntime(state.profileRoot)) return undefined
    await (dependencies.update ?? updateOutdatedWebProfile)(base, runtimeTarball)
    return validate(base)
  }
  if (state.kind === 'incompatible') throw new Error(state.reason)
  if (!await interactions.confirmCreateProfile(state.profileRoot)) return undefined
  await (dependencies.prepare ?? prepareMissingWebProfile)(base, runtimeTarball)
  return validate(base)
}
