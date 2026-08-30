import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const DSH_NAME = '@deepseek-ai/dsh'
const DSH_VERSION = '0.1.1-rc.2'
const PROFILE_NAME = /^[a-z0-9][a-z0-9-]*$/u
const RUNTIME_BUNDLE_NAME = '@tianwen/runtime-bundle'
const RUNTIME_BUNDLE_VERSION = '0.1.3'

export interface PortableProfileTargetInput {
  readonly dshRoot: string
  readonly dshHome: string
  readonly profile: string
  readonly stateRoot: string
}

export interface ResolvedPortableProfileTarget {
  readonly dshRoot: string
  readonly dshBin: string
  readonly dshHome: string
  readonly profile: string
  readonly profileRoot: string
  readonly sessionsRoot: string
  readonly stateRoot: string
  readonly evolutionRoot: string
}

export class PortableRuntimeBundleUnavailableError extends Error {
  constructor() {
    super(`selected Profile must contain exact ${RUNTIME_BUNDLE_NAME}@${RUNTIME_BUNDLE_VERSION}`)
    this.name = 'PortableRuntimeBundleUnavailableError'
  }
}

function absolutePath(value: string, name: string): string {
  if (!isAbsolute(value)) throw new TypeError(`${name} must be an absolute path`)
  return resolve(value)
}

function exactDshBin(dshRoot: string): string {
  let manifest: unknown
  try {
    manifest = JSON.parse(
      readFileSync(join(dshRoot, 'package.json'), 'utf8'),
    ) as unknown
  } catch {
    throw new Error(
      `dshRoot must contain exact ${DSH_NAME}@${DSH_VERSION} with bin.dsh`,
    )
  }
  if (
    typeof manifest !== 'object' || manifest === null
    || (manifest as { name?: unknown }).name !== DSH_NAME
    || (manifest as { version?: unknown }).version !== DSH_VERSION
    || typeof (manifest as { bin?: unknown }).bin !== 'object'
    || (manifest as { bin: unknown }).bin === null
    || typeof (manifest as { bin: { dsh?: unknown } }).bin.dsh !== 'string'
    || (manifest as { bin: { dsh: string } }).bin.dsh.length === 0
  ) {
    throw new Error(
      `dshRoot must contain exact ${DSH_NAME}@${DSH_VERSION} with bin.dsh`,
    )
  }
  const dshBin = resolve(
    dshRoot,
    (manifest as { bin: { dsh: string } }).bin.dsh,
  )
  const child = relative(dshRoot, dshBin)
  if (child === '' || child.startsWith('..') || isAbsolute(child)) {
    throw new Error('DSH bin must remain inside dshRoot')
  }
  let realRoot: string
  let realBin: string
  try {
    realRoot = realpathSync(dshRoot)
    realBin = realpathSync(dshBin)
  } catch {
    throw new Error('DSH bin must be an existing file')
  }
  const realChild = relative(realRoot, realBin)
  if (
    realChild === '' || realChild.startsWith('..') || isAbsolute(realChild)
  ) {
    throw new Error('DSH bin must remain inside dshRoot')
  }
  if (!statSync(realBin).isFile()) {
    throw new Error('DSH bin must be an existing file')
  }
  return realBin
}

export function resolvePortableProfileTarget(
  input: PortableProfileTargetInput,
): ResolvedPortableProfileTarget {
  const dshRoot = absolutePath(input.dshRoot, 'dshRoot')
  const dshHome = absolutePath(input.dshHome, 'dshHome')
  const stateRoot = absolutePath(input.stateRoot, 'stateRoot')
  if (!PROFILE_NAME.test(input.profile)) {
    throw new TypeError('profile must match [a-z0-9][a-z0-9-]*')
  }
  const profileRoot = join(dshHome, 'profiles', input.profile)
  try {
    if (!statSync(profileRoot).isDirectory()) {
      throw new Error('not a directory')
    }
  } catch {
    throw new Error('Profile must already exist')
  }
  try {
    if (!lstatSync(join(profileRoot, 'package.json')).isFile()) {
      throw new Error('not a regular file')
    }
  } catch {
    throw new Error('Profile package.json must already exist')
  }
  return {
    dshRoot,
    dshBin: exactDshBin(dshRoot),
    dshHome,
    profile: input.profile,
    profileRoot,
    sessionsRoot: join(dshHome, 'sessions'),
    stateRoot,
    evolutionRoot: join(stateRoot, 'evolution'),
  }
}

export function verifyPortableRuntimeBundle(
  target: ResolvedPortableProfileTarget,
): void {
  try {
    const profileManifest = JSON.parse(readFileSync(
      join(target.profileRoot, 'package.json'), 'utf8',
    )) as {
      dependencies?: Record<string, unknown>
      dsh?: { profile?: { bundles?: unknown } }
    }
    const bundles = profileManifest.dsh?.profile?.bundles
    if (
      typeof profileManifest.dependencies?.[RUNTIME_BUNDLE_NAME] !== 'string'
      || !Array.isArray(bundles)
      || bundles.filter(name => name === RUNTIME_BUNDLE_NAME).length !== 1
    ) throw new Error('Profile does not declare the Runtime Bundle')

    const runtimeRoot = join(
      target.profileRoot, 'node_modules', '@tianwen', 'runtime-bundle',
    )
    const manifest = JSON.parse(readFileSync(
      join(runtimeRoot, 'package.json'), 'utf8',
    )) as {
      name?: unknown
      version?: unknown
      bin?: { tianwen?: unknown }
      dsh?: { bundle?: { patch?: unknown } }
    }
    if (
      manifest.name !== RUNTIME_BUNDLE_NAME
      || manifest.version !== RUNTIME_BUNDLE_VERSION
      || typeof manifest.bin?.tianwen !== 'string'
      || manifest.dsh?.bundle?.patch !== './cordis.patch.yml'
    ) throw new Error('Runtime Bundle manifest is incompatible')

    const realProfileRoot = realpathSync(target.profileRoot)
    const realRuntimeRoot = realpathSync(runtimeRoot)
    const runtimeChild = relative(realProfileRoot, realRuntimeRoot)
    if (
      runtimeChild === '' || runtimeChild.startsWith('..')
      || isAbsolute(runtimeChild)
    ) throw new Error('Runtime Bundle must remain inside the Profile')
    for (const file of [manifest.bin.tianwen, manifest.dsh.bundle.patch]) {
      const realFile = realpathSync(resolve(runtimeRoot, file))
      const child = relative(realRuntimeRoot, realFile)
      if (
        child === '' || child.startsWith('..') || isAbsolute(child)
        || !statSync(realFile).isFile()
      ) throw new Error('Runtime Bundle file is unavailable')
    }
  } catch (error) {
    if (error instanceof PortableRuntimeBundleUnavailableError) throw error
    throw new PortableRuntimeBundleUnavailableError()
  }
}
