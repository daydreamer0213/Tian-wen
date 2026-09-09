import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import type { DesktopTarget } from './host.js'

const maxSourceBytes = 1024 * 1024
const profilePatchFileName = 'cordis.patch.yml'
const toolsTarget = {
  id: 'tools',
  name: '@deepseek-ai/dsh-tools',
  observerId: 'tianwen-native-tools-observer',
  observerName: '@tianwen/runtime-bundle/native-tools-observer',
  configKeys: new Set(['mode', 'maxParallelSubCalls']),
} as const
const pwshTarget = {
  id: 'pwsh-sandbox',
  name: '@deepseek-ai/dsh-pwsh-sandbox',
  observerId: 'tianwen-native-pwsh-observer',
  observerName: '@tianwen/runtime-bundle/native-pwsh-observer',
  configKeys: new Set([
    'cwd',
    'timeoutMs',
    'maxTimeoutMs',
    'maxOutputBytes',
    'maxSpillBytes',
    'graceMs',
    'pwshPath',
  ]),
} as const
const allowedEntryKeys = new Set([
  'id',
  'name',
  'config',
  'group',
  'disabled',
  'inject',
  'isolate',
  'intercept',
])

type Entry = Record<string, unknown>
type Patch = Record<string, unknown>

interface NativeBootModule {
  resolveProfileDir(name: string, home?: string): string
  resolveBundleDir(
    binName: string,
    packageName: string,
    installAnchor: string,
    profileDir: string,
  ): string
  composeEntries(layers: readonly Patch[][], warn?: (message: string) => void): Entry[]
}

interface NativeYamlModule {
  load(source: string, options: { schema: unknown }): unknown
  dump(value: unknown, options: { schema: unknown, noRefs: boolean }): string
}

interface NativeModules {
  readonly boot: NativeBootModule
  readonly schema: unknown
  readonly yaml: NativeYamlModule
}

interface SourceBinding {
  readonly path: string
  readonly digest?: string
}

export type NativeObservationPreparationStatus =
  | { readonly kind: 'observed' }
  | { readonly kind: 'stock', readonly reason: 'observation-unavailable' }

export interface NativeObservationLaunchPreparation {
  readonly patchPath?: string
  readonly status: NativeObservationPreparationStatus
  verify(): Promise<boolean>
  cleanup(): Promise<void>
}

export interface NativeObservationLaunchDependencies {
  readonly nonce?: () => string
  readonly loadNativeModules?: (target: DesktopTarget) => Promise<NativeModules>
  readonly secureLaunchDirectory?: (path: string) => void
}

const windowsAclScript = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$path = $env:TIANWEN_OBSERVATION_ACL_PATH
$info = [System.IO.DirectoryInfo]::new($path)
$current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$system = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$inherit = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
$none = [System.Security.AccessControl.PropagationFlags]::None
$allow = [System.Security.AccessControl.AccessControlType]::Allow
$full = [System.Security.AccessControl.FileSystemRights]::FullControl
$acl = [System.Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($current, $system) | Select-Object -Unique) {
  [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid, $full, $inherit, $none, $allow))
}
$info.SetAccessControl($acl)
$actual = $info.GetAccessControl()
$owner = $actual.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
$expected = @($current.Value, $system.Value) | Select-Object -Unique
$rules = @($actual.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
if (!$actual.AreAccessRulesProtected -or $owner -ne $current.Value -or $rules.Count -ne $expected.Count) {
  throw 'private launch directory ACL verification failed'
}
foreach ($rule in $rules) {
  $invalid = $rule.IsInherited
  $invalid = $invalid -or $rule.AccessControlType -ne $allow
  $invalid = $invalid -or $expected -notcontains $rule.IdentityReference.Value
  $invalid = $invalid -or ([int]$rule.FileSystemRights -band [int]$full) -ne [int]$full
  $invalid = $invalid -or $rule.InheritanceFlags -ne $inherit
  $invalid = $invalid -or $rule.PropagationFlags -ne $none
  if ($invalid) {
    throw 'private launch directory ACL verification failed'
  }
}
`

function secureLaunchDirectory(path: string): void {
  if (process.platform !== 'win32') return
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  execFileSync(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    Buffer.from(windowsAclScript, 'utf16le').toString('base64'),
  ], {
    env: {
      SystemRoot: systemRoot,
      windir: process.env.windir ?? systemRoot,
      TIANWEN_OBSERVATION_ACL_PATH: path,
    },
    maxBuffer: 8192,
    timeout: 10_000,
    windowsHide: true,
  })
}

class BoundedSourceReader {
  private bytes = 0
  readonly bindings: SourceBinding[] = []

  read(path: string, optional = false): string | undefined {
    let descriptor: number
    try {
      descriptor = openSync(path, 'r')
    } catch (error) {
      if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.bindings.push({ path })
        return undefined
      }
      throw error
    }
    try {
      const remaining = maxSourceBytes - this.bytes
      if (remaining < 0) throw new Error('observation source budget exceeded')
      const buffer = Buffer.allocUnsafe(remaining + 1)
      let offset = 0
      while (offset < buffer.length) {
        const count = readSync(descriptor, buffer, offset, buffer.length - offset, null)
        if (count === 0) break
        offset += count
      }
      if (offset > remaining) throw new Error('observation source budget exceeded')
      const bytes = buffer.subarray(0, offset)
      this.bytes += bytes.length
      this.bindings.push({
        path,
        digest: createHash('sha256').update(bytes).digest('hex'),
      })
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } finally {
      closeSync(descriptor)
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonObject(source: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(source)
  if (!isRecord(parsed)) throw new Error('manifest must be an object')
  return parsed
}

function parsePatchList(native: NativeModules, source: string | undefined): Patch[] {
  if (source === undefined) return []
  const parsed = native.yaml.load(source, { schema: native.schema })
  if (!Array.isArray(parsed) || !parsed.every(isRecord)) {
    throw new Error('patch source must be a list of mappings')
  }
  return parsed
}

function isJsExpression(value: unknown): boolean {
  return isRecord(value)
    && Object.keys(value).length === 1
    && typeof value.__jsExpr === 'string'
}

function validConfigValue(
  target: typeof toolsTarget | typeof pwshTarget,
  key: string,
  value: unknown,
): boolean {
  if (isJsExpression(value)) return true
  if (target === toolsTarget) {
    return key === 'mode'
      ? value === 'native' || value === 'code' || value === 'both'
      : typeof value === 'number' && Number.isInteger(value) && value > 0
  }
  if (key === 'cwd' || key === 'pwshPath') return typeof value === 'string'
  return typeof value === 'number'
    && Number.isFinite(value)
    && value > 0
    && (key !== 'graceMs' || value <= 0x7fffffff)
}

function validatedTargetRow(
  entries: readonly Entry[],
  target: typeof toolsTarget | typeof pwshTarget,
): Entry {
  const byId = entries.filter(entry => entry.id === target.id)
  const byName = entries.filter(entry => entry.name === target.name)
  if (byId.length !== 1 || byName.length !== 1 || byId[0] !== byName[0]) {
    throw new Error('native observation target is missing or ambiguous')
  }
  const row = byId[0]!
  if (Object.keys(row).some(key => !allowedEntryKeys.has(key))) {
    throw new Error('native observation target has unsupported metadata')
  }
  if (Object.hasOwn(row, 'group') && row.group !== false && row.group !== null) {
    throw new Error('native observation target cannot be a group')
  }
  if (Object.hasOwn(row, 'disabled')
    && typeof row.disabled !== 'boolean'
    && row.disabled !== null
    && !isJsExpression(row.disabled)) {
    throw new Error('native observation target has unsupported disabled metadata')
  }
  if (Object.hasOwn(row, 'config')) {
    if (!isRecord(row.config)
      || Object.keys(row.config).some(key => !target.configKeys.has(key))
      || Object.entries(row.config).some(([key, value]) => !validConfigValue(target, key, value))) {
      throw new Error('native observation target has unsupported configuration')
    }
  }
  return row
}

function observerRow(
  source: Entry,
  target: typeof toolsTarget | typeof pwshTarget,
): Entry {
  const result: Entry = { id: target.observerId, name: target.observerName }
  for (const key of ['config', 'group', 'disabled', 'inject', 'isolate', 'intercept']) {
    if (Object.hasOwn(source, key)) result[key] = structuredClone(source[key])
  }
  return result
}

function buildOverlay(entries: readonly Entry[]): Patch[] {
  if (entries.some(entry => entry.id === toolsTarget.observerId
    || entry.id === pwshTarget.observerId
    || entry.name === toolsTarget.observerName
    || entry.name === pwshTarget.observerName)) {
    throw new Error('native observation rows already exist')
  }
  const tools = validatedTargetRow(entries, toolsTarget)
  const pwsh = validatedTargetRow(entries, pwshTarget)
  return [
    { id: toolsTarget.id, name: toolsTarget.name, disabled: true },
    { id: pwshTarget.id, name: pwshTarget.name, disabled: true },
    { insert: [observerRow(tools, toolsTarget), observerRow(pwsh, pwshTarget)] },
  ]
}

async function loadNativeModules(target: DesktopTarget): Promise<NativeModules> {
  const requireFromDsh = createRequire(join(target.dshRoot, 'package.json'))
  const bootPath = requireFromDsh.resolve('@deepseek-ai/dsh-app-boot')
  const includePath = requireFromDsh.resolve('@deepseek-ai/cordis-plugin-include')
  const includeManifest = requireFromDsh.resolve('@deepseek-ai/cordis-plugin-include/package.json')
  const yamlPath = createRequire(includeManifest).resolve('js-yaml')
  const [boot, include, yaml] = await Promise.all([
    import(pathToFileURL(bootPath).href),
    import(pathToFileURL(includePath).href),
    import(pathToFileURL(yamlPath).href),
  ])
  if (typeof boot.resolveProfileDir !== 'function'
    || typeof boot.resolveBundleDir !== 'function'
    || typeof boot.composeEntries !== 'function'
    || include.entryListSchema === undefined
    || typeof yaml.load !== 'function'
    || typeof yaml.dump !== 'function') {
    throw new Error('native observation APIs are unavailable')
  }
  return {
    boot: boot as unknown as NativeBootModule,
    schema: include.entryListSchema,
    yaml: yaml as unknown as NativeYamlModule,
  }
}

function sourceBindingsMatch(bindings: readonly SourceBinding[]): boolean {
  const reader = new BoundedSourceReader()
  try {
    for (const binding of bindings) {
      const current = reader.read(binding.path, binding.digest === undefined)
      const currentBinding = reader.bindings.at(-1)!
      if (binding.digest === undefined) {
        if (current !== undefined) return false
      } else if (current === undefined || currentBinding.digest !== binding.digest) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

function stockPreparation(): NativeObservationLaunchPreparation {
  return {
    status: { kind: 'stock', reason: 'observation-unavailable' },
    async verify() { return true },
    async cleanup() {},
  }
}

export async function prepareNativeObservationLaunch(
  target: DesktopTarget,
  environment: NodeJS.ProcessEnv,
  dependencies: NativeObservationLaunchDependencies = {},
): Promise<NativeObservationLaunchPreparation> {
  let launchFolder: string | undefined
  let ownsLaunchFolder = false
  try {
    if (environment.DSH_HOME !== target.dshHome) throw new Error('launch home mismatch')
    const stateRoot = environment.TIANWEN_LEARNING_LOOP_ROOT
    if (stateRoot === undefined || !isAbsolute(stateRoot)) throw new Error('launch state root is unavailable')
    const native = await (dependencies.loadNativeModules ?? loadNativeModules)(target)
    const profileRoot = native.boot.resolveProfileDir('web', target.dshHome)
    if (resolve(profileRoot) !== resolve(target.profileRoot)) throw new Error('launch profile mismatch')

    const reader = new BoundedSourceReader()
    const installAnchor = join(target.dshRoot, 'package.json')
    const dshManifest = parseJsonObject(reader.read(installAnchor)!)
    if (dshManifest.name !== '@deepseek-ai/dsh'
      || dshManifest.version !== '0.1.1-rc.2'
      || !isRecord(dshManifest.bin)
      || dshManifest.bin.dsh !== 'lib/bin.js') {
      throw new Error('installed DSH changed')
    }
    const profileManifest = parseJsonObject(reader.read(join(profileRoot, 'package.json'))!)
    const dsh = profileManifest.dsh
    const profile = isRecord(dsh) ? dsh.profile : undefined
    const bundles = isRecord(profile) ? profile.bundles : undefined
    if (!Array.isArray(bundles) || !bundles.every(bundle => typeof bundle === 'string')) {
      throw new Error('profile bundles are invalid')
    }

    const layers: Patch[][] = []
    const resolvedBundles: Array<{ readonly name: string, readonly root: string }> = []
    for (const packageName of bundles) {
      const packageRoot = native.boot.resolveBundleDir(
        'Tianwen Desktop', packageName, installAnchor, profileRoot,
      )
      resolvedBundles.push({ name: packageName, root: resolve(packageRoot) })
      const manifest = parseJsonObject(reader.read(join(packageRoot, 'package.json'))!)
      const bundleDsh = manifest.dsh
      const bundle = isRecord(bundleDsh) ? bundleDsh.bundle : undefined
      const declaredPatch = isRecord(bundle) ? bundle.patch : undefined
      if (typeof declaredPatch !== 'string') throw new Error('bundle patch is not declared')
      layers.push(parsePatchList(native, reader.read(join(packageRoot, declaredPatch))))
    }
    layers.push(parsePatchList(native, reader.read(join(profileRoot, profilePatchFileName), true)))
    layers.push(parsePatchList(native, reader.read(join(target.dshHome, profilePatchFileName), true)))

    const compositionWarnings: string[] = []
    const entries = native.boot.composeEntries(layers, warning => compositionWarnings.push(warning))
    if (compositionWarnings.length > 0 || !Array.isArray(entries) || !entries.every(isRecord)) {
      throw new Error('native composition is unsupported')
    }
    const overlay = buildOverlay(entries)
    const overlayWarnings: string[] = []
    native.boot.composeEntries([...layers, overlay], warning => overlayWarnings.push(warning))
    if (overlayWarnings.length > 0) throw new Error('native observation overlay was skipped')

    const rendered = native.yaml.dump(overlay, { schema: native.schema, noRefs: true })
    const roundtrip = parsePatchList(native, rendered)
    if (!isDeepStrictEqual(roundtrip, overlay)) throw new Error('native observation overlay is not lossless')

    const launchRoot = join(stateRoot, 'native-observation-launch')
    const secureDirectory = dependencies.secureLaunchDirectory ?? secureLaunchDirectory
    mkdirSync(launchRoot, { recursive: true, mode: 0o700 })
    if (lstatSync(launchRoot).isSymbolicLink()) throw new Error('launch root must not be a link')
    secureDirectory(launchRoot)
    launchFolder = join(launchRoot, `launch-${(dependencies.nonce ?? randomUUID)()}`)
    const child = relative(launchRoot, launchFolder)
    if (child === '' || child.startsWith('..') || isAbsolute(child)) throw new Error('invalid launch folder')
    mkdirSync(launchFolder, { mode: 0o700 })
    ownsLaunchFolder = true
    secureDirectory(launchFolder)
    const patchPath = join(launchFolder, 'observation.patch.yml')
    writeFileSync(patchPath, rendered, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    const overlayDigest = createHash('sha256').update(rendered).digest('hex')
    let cleanupPromise: Promise<void> | undefined
    const cleanup = (): Promise<void> => {
      cleanupPromise ??= Promise.resolve().then(() => {
        rmSync(launchFolder!, { recursive: true, force: true })
      })
      return cleanupPromise
    }
    const verify = async (): Promise<boolean> => {
      try {
        if (!sourceBindingsMatch(reader.bindings)) return false
        for (const expected of resolvedBundles) {
          if (resolve(native.boot.resolveBundleDir(
            'Tianwen Desktop', expected.name, installAnchor, profileRoot,
          )) !== expected.root) return false
        }
        const overlayReader = new BoundedSourceReader()
        const current = overlayReader.read(patchPath)
        return current !== undefined && overlayReader.bindings[0]?.digest === overlayDigest
      } catch {
        return false
      }
    }
    return { patchPath, status: { kind: 'observed' }, verify, cleanup }
  } catch {
    if (ownsLaunchFolder) {
      try {
        rmSync(launchFolder!, { recursive: true, force: true })
      } catch {}
    }
    return stockPreparation()
  }
}
