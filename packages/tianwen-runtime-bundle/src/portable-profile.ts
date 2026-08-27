import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const DSH_NAME = '@deepseek-ai/dsh'
const DSH_VERSION = '0.1.1-rc.2'
const PROFILE_NAME = /^[a-z0-9][a-z0-9-]*$/u

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
  try {
    if (statSync(dshBin).isFile()) return dshBin
  } catch {}
  throw new Error('DSH bin must be an existing file')
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
