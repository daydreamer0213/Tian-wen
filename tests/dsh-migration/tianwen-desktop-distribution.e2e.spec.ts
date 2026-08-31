import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  win32,
} from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

const enabled = process.platform === 'win32'
  && process.env.TIANWEN_DESKTOP_DISTRIBUTION_E2E === '1'
const devDataRoot = 'D:\\DevData'
const desktopName = 'Tianwen Desktop'
const runtimeArchiveName = 'tianwen-runtime-bundle-0.1.8.tgz'
const runtimePackage = '@tianwen/runtime-bundle'
const runtimeVersion = '0.1.8'
const dshPackage = '@deepseek-ai/dsh'
const dshVersion = '0.1.1-rc.2'
const pnpmVersion = '11.20.0'
const applicationTimeoutMs = 600_000
const processTimeoutMs = 180_000

interface DistributionInputs {
  readonly dshBin: string
  readonly dshHome: string
  readonly dshRoot: string
  readonly installer: string
  readonly nodeExecutable: string
  readonly pnpmEntry: string
  readonly powershell: string
  readonly proofRoot: string
  readonly repoRoot: string
  readonly runtimeTarball: string
  readonly system32: string
  readonly unpackedExecutable: string
  readonly unpackedRoot: string
}

interface ProcessResult {
  readonly code: number | null
  readonly endedAt: string
  readonly error?: Error
  readonly pid: number
  readonly signal: NodeJS.Signals | null
  readonly startedAt: string
  readonly stderr: string
  readonly stdout: string
}

interface DesktopResult extends ProcessResult {
  readonly ownedDshPid: number
  readonly readyUrl: string
  readonly stderrSha256: string
  readonly stdoutSha256: string
  readonly ui: UiResult
}

interface UiResult {
  readonly kind: string
  readonly createCount?: number
  readonly cancelCount?: number
  readonly diagnostic?: string
  readonly window?: WindowRecord
}

interface WindowRecord {
  readonly name: string
  readonly processId: number
  readonly runtimeId: string
}

interface ShellState {
  readonly registrations: readonly RegistrationRecord[]
  readonly shortcuts: readonly ShortcutRecord[]
}

interface RegistrationRecord {
  readonly displayName: string
  readonly displayVersion: string
  readonly key: string
  readonly uninstallString: string
}

interface ShortcutRecord {
  readonly arguments: string
  readonly path: string
  readonly targetPath: string
  readonly workingDirectory: string
}

interface TreeSnapshot {
  readonly digest: string
  readonly entries: number
}

interface ProcessIdentity {
  readonly creationTimeUtc: string
  readonly executablePath: string
  readonly pid: number
}

type OwnedProcessIdentityAcceptance =
  | { readonly kind: 'accepted', readonly identity: ProcessIdentity }
  | { readonly kind: 'rejected', readonly reason: string }

function fail(message: string): never {
  throw new Error(message)
}

function requiredEnvironmentPath(name: string, kind: 'file' | 'directory'): string {
  const value = process.env[name]
  if (value === undefined || !win32.isAbsolute(value)) {
    fail(`${name} must be an absolute Windows path`)
  }
  let path: string
  try {
    path = realpathSync(value)
  } catch {
    fail(`${name} must already exist`)
  }
  const stats = statSync(path)
  if (kind === 'file' ? !stats.isFile() : !stats.isDirectory()) {
    fail(`${name} must be an existing ${kind}`)
  }
  return path
}

function requireProofRoot(): string {
  const value = process.env.TIANWEN_DESKTOP_DISTRIBUTION_PROOF_ROOT
  if (value === undefined || !win32.isAbsolute(value)) {
    fail('TIANWEN_DESKTOP_DISTRIBUTION_PROOF_ROOT must be an absolute Windows path')
  }
  const normalized = win32.resolve(value)
  const child = win32.relative(devDataRoot, normalized)
  if (child === '' || child.startsWith('..') || win32.isAbsolute(child)) {
    fail(`proof root must be a strict child of ${devDataRoot}`)
  }
  let suppliedStats: ReturnType<typeof lstatSync>
  try {
    suppliedStats = lstatSync(normalized)
  } catch {
    fail('TIANWEN_DESKTOP_DISTRIBUTION_PROOF_ROOT must already exist')
  }
  if (!suppliedStats.isDirectory()) fail('proof root must be an existing directory')
  if (suppliedStats.isSymbolicLink()) fail('supplied proof root must not be a reparse point')
  if (readdirSync(normalized).length !== 0) fail('proof root must be empty and is never reused')

  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  if (systemRoot === undefined || !win32.isAbsolute(systemRoot)) {
    fail('SystemRoot must be an absolute Windows path')
  }
  const system32 = realpathSync(join(systemRoot, 'System32'))
  const powershell = realpathSync(join(
    system32,
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  ))
  const reparseEnvironment: NodeJS.ProcessEnv = {
    ComSpec: join(system32, 'cmd.exe'),
    PATH: system32,
    SystemRoot: dirname(system32),
    TEMP: normalized,
    TMP: normalized,
    WINDIR: dirname(system32),
  }
  assertCredentialFree(reparseEnvironment)
  validateProofRootReparseState(
    powershell,
    normalized,
    reparseEnvironment,
  )

  const canonical = realpathSync(normalized)
  const realDevDataRoot = realpathSync(devDataRoot)
  const realChild = win32.relative(realDevDataRoot, canonical)
  if (realChild === '' || realChild.startsWith('..') || win32.isAbsolute(realChild)) {
    fail(`real proof root must remain a strict child of ${realDevDataRoot}`)
  }
  return canonical
}

function queryChildEnvironment(
  inputs: Pick<DistributionInputs, 'nodeExecutable' | 'proofRoot' | 'system32'>,
): NodeJS.ProcessEnv {
  const systemRoot = dirname(inputs.system32)
  const environment: NodeJS.ProcessEnv = {
    ALLUSERSPROFILE: process.env.ALLUSERSPROFILE,
    APPDATA: process.env.APPDATA,
    ComSpec: join(inputs.system32, 'cmd.exe'),
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    OS: process.env.OS ?? 'Windows_NT',
    PATH: [dirname(inputs.nodeExecutable), inputs.system32].join(delimiter),
    PATHEXT: process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
    ProgramData: process.env.ProgramData,
    PUBLIC: process.env.PUBLIC,
    SystemRoot: systemRoot,
    TEMP: inputs.proofRoot,
    TMP: inputs.proofRoot,
    USERPROFILE: process.env.USERPROFILE,
    WINDIR: systemRoot,
  }
  assertCredentialFree(environment)
  return environment
}

function hashBytes(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function hashFile(path: string): string {
  return hashBytes(readFileSync(path))
}

function snapshotTree(root: string): TreeSnapshot {
  if (!existsSync(root)) return { digest: hashBytes('missing'), entries: 0 }
  const rows: string[] = []
  const visit = (path: string): void => {
    const label = relative(root, path).replaceAll('\\', '/') || '.'
    const stats = lstatSync(path)
    if (stats.isSymbolicLink()) {
      rows.push(JSON.stringify([label, 'link', readlinkSync(path)]))
      return
    }
    if (stats.isFile()) {
      rows.push(JSON.stringify([label, 'file', stats.size, hashFile(path)]))
      return
    }
    if (!stats.isDirectory()) {
      rows.push(JSON.stringify([label, 'other']))
      return
    }
    rows.push(JSON.stringify([label, 'directory']))
    for (const entry of readdirSync(path).sort()) visit(join(path, entry))
  }
  visit(root)
  return { digest: hashBytes(rows.join('\n')), entries: rows.length }
}

function isWithin(root: string, path: string): boolean {
  const child = relative(root, path)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fail(`${label} returned invalid JSON`)
  }
}

function providerCredentialNames(environment: NodeJS.ProcessEnv): string[] {
  return Object.keys(environment).filter(name =>
    /(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|SECRET_KEY|SESSION_TOKEN)$/iu.test(name)
      || /^(?:DEEPSEEK|OPENAI|ANTHROPIC|GEMINI|GOOGLE_GENERATIVE_AI|AZURE_OPENAI|AWS_BEDROCK|GROQ|MISTRAL|COHERE|TOGETHER|XAI|MOONSHOT|DASHSCOPE|ARK)_/iu.test(name)
      || /^AWS_(?:ACCESS|SECRET|SESSION)/iu.test(name),
  ).sort()
}

function assertCredentialFree(environment: NodeJS.ProcessEnv): void {
  const names = providerCredentialNames(environment)
  if (names.length > 0) fail(`Provider credentials reached a child: ${names.join(', ')}`)
}

function makeDirectories(paths: readonly string[]): void {
  for (const path of paths) mkdirSync(path, { recursive: true })
}

function baseChildEnvironment(
  inputs: Pick<DistributionInputs, 'nodeExecutable' | 'proofRoot' | 'system32'>,
): NodeJS.ProcessEnv {
  const systemRoot = dirname(inputs.system32)
  const userRoot = join(inputs.proofRoot, 'user')
  const appData = join(userRoot, 'AppData', 'Roaming')
  const localAppData = join(userRoot, 'AppData', 'Local')
  const temp = join(inputs.proofRoot, 'temp')
  const cache = join(inputs.proofRoot, 'cache')
  makeDirectories([
    userRoot,
    appData,
    localAppData,
    temp,
    join(cache, 'corepack'),
    join(cache, 'electron'),
    join(cache, 'electron-builder'),
    join(cache, 'npm'),
    join(cache, 'pnpm'),
    join(cache, 'pnpm-home'),
    join(cache, 'pnpm-store'),
    join(cache, 'xdg'),
  ])
  const environment: NodeJS.ProcessEnv = {
    ALLUSERSPROFILE: process.env.ALLUSERSPROFILE,
    APPDATA: appData,
    CI: 'true',
    ComSpec: join(inputs.system32, 'cmd.exe'),
    COREPACK_ENABLE_NETWORK: '0',
    COREPACK_HOME: join(cache, 'corepack'),
    DSH_TELEMETRY_DISABLED: '1',
    ELECTRON_BUILDER_CACHE: join(cache, 'electron-builder'),
    ELECTRON_CACHE: join(cache, 'electron'),
    HOME: userRoot,
    HOMEDRIVE: win32.parse(userRoot).root.slice(0, 2),
    HOMEPATH: userRoot.slice(2),
    LOCALAPPDATA: localAppData,
    NPM_CONFIG_CACHE: join(cache, 'npm'),
    NUMBER_OF_PROCESSORS: process.env.NUMBER_OF_PROCESSORS,
    OS: process.env.OS ?? 'Windows_NT',
    PATH: [dirname(inputs.nodeExecutable), inputs.system32].join(delimiter),
    PATHEXT: process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
    PNPM_CONFIG_CACHE_DIR: join(cache, 'pnpm'),
    PNPM_CONFIG_CONFIRM_MODULES_PURGE: 'false',
    PNPM_CONFIG_STORE_DIR: join(cache, 'pnpm-store'),
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
    PNPM_HOME: join(cache, 'pnpm-home'),
    PROCESSOR_ARCHITECTURE: process.env.PROCESSOR_ARCHITECTURE,
    ProgramData: process.env.ProgramData,
    PUBLIC: process.env.PUBLIC,
    SystemDrive: process.env.SystemDrive,
    SystemRoot: systemRoot,
    TEMP: temp,
    TMP: temp,
    USERPROFILE: userRoot,
    WINDIR: systemRoot,
    XDG_CACHE_HOME: join(cache, 'xdg'),
  }
  assertCredentialFree(environment)
  return environment
}

function runProcessSync(
  label: string,
  executable: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  timeout = processTimeoutMs,
): ProcessResult {
  assertCredentialFree(environment)
  const startedAt = new Date().toISOString()
  const result = spawnSync(executable, [...args], {
    cwd: environment.TEMP,
    encoding: 'utf8',
    env: environment,
    shell: false,
    timeout,
    windowsHide: true,
  })
  const endedAt = new Date().toISOString()
  const output: ProcessResult = {
    code: result.status,
    endedAt,
    ...(result.error === undefined ? {} : { error: result.error }),
    pid: result.pid ?? -1,
    signal: result.signal,
    startedAt,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
  if (output.error !== undefined || output.code !== 0 || output.signal !== null) {
    fail([
      `${label} failed (exit=${String(output.code)}, signal=${String(output.signal)})`,
      output.error?.message,
      `stdout:\n${output.stdout}`,
      `stderr:\n${output.stderr}`,
    ].filter(Boolean).join('\n'))
  }
  return output
}

function runPowerShellJson<T>(
  powershell: string,
  script: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): T {
  const encodedCommand = Buffer.from(
    `& {\n${script}\n}${args.length === 0 ? '' : ` ${args.map((argument) => `'${argument.replaceAll("'", "''")}'`).join(' ')}`}`,
    'utf16le',
  ).toString('base64')
  const result = runProcessSync(
    'Windows PowerShell query',
    powershell,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand],
    environment,
  )
  return parseJson<T>(result.stdout.trim(), 'Windows PowerShell query')
}

function validateProofRootReparseState(
  powershell: string,
  proofRoot: string,
  environment: NodeJS.ProcessEnv,
): void {
  const result = runPowerShellJson<{ readonly isReparse: boolean }>(
    powershell,
    '$item = Get-Item -LiteralPath $args[0] -Force; @{ isReparse = [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint) } | ConvertTo-Json -Compress',
    [proofRoot],
    environment,
  )
  if (result.isReparse) fail('proof root must not be a reparse point')
}

function captureTianwenProcesses(
  powershell: string,
  environment: NodeJS.ProcessEnv,
): readonly { readonly executablePath: string, readonly processId: number }[] {
  return runPowerShellJson(
    powershell,
    String.raw`$items = @(Get-CimInstance Win32_Process -Filter "Name = 'Tianwen Desktop.exe'" | ForEach-Object { @{ processId = [int]$_.ProcessId; executablePath = [string]$_.ExecutablePath } }); ConvertTo-Json -Compress -InputObject @($items)`,
    [],
    environment,
  )
}

function captureShellState(
  powershell: string,
  environment: NodeJS.ProcessEnv,
): ShellState {
  const script = String.raw`
$shell = New-Object -ComObject WScript.Shell
$folders = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('Programs'),
  [Environment]::GetFolderPath('CommonPrograms')
) | Where-Object { $_ } | Sort-Object -Unique
$shortcuts = @($folders | ForEach-Object {
  Get-ChildItem -LiteralPath $_ -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.BaseName -like '*Tianwen Desktop*' } |
    ForEach-Object {
      $link = $shell.CreateShortcut($_.FullName)
      @{ path = $_.FullName; targetPath = [string]$link.TargetPath; arguments = [string]$link.Arguments; workingDirectory = [string]$link.WorkingDirectory }
    }
}) | Sort-Object path
$roots = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
)
$registrations = @($roots | ForEach-Object {
  if (Test-Path -LiteralPath $_) {
    Get-ChildItem -LiteralPath $_ -ErrorAction SilentlyContinue | ForEach-Object {
      $entry = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
      if ([string]$entry.DisplayName -like 'Tianwen Desktop*') {
        @{ key = $_.Name; displayName = [string]$entry.DisplayName; displayVersion = [string]$entry.DisplayVersion; uninstallString = [string]$entry.UninstallString }
      }
    }
  }
}) | Sort-Object key
@{ shortcuts = @($shortcuts); registrations = @($registrations) } | ConvertTo-Json -Compress -Depth 6
`
  return runPowerShellJson<ShellState>(powershell, script, [], environment)
}

function shellDifference<T>(
  before: readonly T[],
  after: readonly T[],
): T[] {
  const existing = new Set(before.map(value => JSON.stringify(value)))
  return after.filter(value => !existing.has(JSON.stringify(value)))
}

function validateInputs(): DistributionInputs {
  const proofRoot = requireProofRoot()
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  if (systemRoot === undefined || !win32.isAbsolute(systemRoot)) {
    fail('SystemRoot must be an absolute Windows path')
  }
  const system32 = realpathSync(join(systemRoot, 'System32'))
  const powershell = realpathSync(join(
    system32,
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  ))
  const nodeExecutable = requiredEnvironmentPath(
    'TIANWEN_DESKTOP_DISTRIBUTION_NODE',
    'file',
  )
  if (realpathSync(process.execPath).toLowerCase() !== nodeExecutable.toLowerCase()) {
    fail('the proof must run under TIANWEN_DESKTOP_DISTRIBUTION_NODE')
  }
  const dshRoot = requiredEnvironmentPath(
    'TIANWEN_DESKTOP_DISTRIBUTION_DSH_ROOT',
    'directory',
  )
  const pnpmEntry = requiredEnvironmentPath(
    'TIANWEN_DESKTOP_DISTRIBUTION_PNPM_ENTRY',
    'file',
  )
  const runtimeTarball = requiredEnvironmentPath(
    'TIANWEN_DESKTOP_DISTRIBUTION_RUNTIME_TARBALL',
    'file',
  )
  const unpackedExecutable = requiredEnvironmentPath(
    'TIANWEN_DESKTOP_DISTRIBUTION_UNPACKED_EXE',
    'file',
  )
  const installer = requiredEnvironmentPath(
    'TIANWEN_DESKTOP_DISTRIBUTION_INSTALLER',
    'file',
  )
  if (basename(runtimeTarball) !== runtimeArchiveName) {
    fail(`Runtime source basename must be ${runtimeArchiveName}`)
  }
  if (basename(unpackedExecutable).toLowerCase() !== `${desktopName}.exe`.toLowerCase()) {
    fail(`unpacked executable must be ${desktopName}.exe`)
  }
  const matchingInstallers = readdirSync(dirname(installer))
    .filter(name => /^Tianwen Desktop Setup .+\.exe$/iu.test(name))
    .map(name => realpathSync(join(dirname(installer), name)))
  if (matchingInstallers.length !== 1 || matchingInstallers[0]?.toLowerCase() !== installer.toLowerCase()) {
    fail('TIANWEN_DESKTOP_DISTRIBUTION_INSTALLER must be the unique NSIS installer')
  }
  const dshManifestPath = realpathSync(join(dshRoot, 'package.json'))
  const dshManifest = parseJson<{
    readonly bin?: { readonly dsh?: unknown }
    readonly name?: unknown
    readonly version?: unknown
  }>(readFileSync(dshManifestPath, 'utf8'), 'DSH manifest')
  if (dshManifest.name !== dshPackage || dshManifest.version !== dshVersion
    || dshManifest.bin?.dsh !== 'lib/bin.js') {
    fail(`DSH root must be exact ${dshPackage}@${dshVersion}`)
  }
  const dshBin = realpathSync(join(dshRoot, 'lib', 'bin.js'))
  if (!isWithin(dshRoot, dshBin) || !statSync(dshBin).isFile()) {
    fail('DSH bin escapes the selected DSH root')
  }
  const dshHome = join(proofRoot, 'dsh-home')
  const repoRoot = resolve(import.meta.dirname, '../..')
  return {
    dshBin,
    dshHome,
    dshRoot,
    installer,
    nodeExecutable,
    pnpmEntry,
    powershell,
    proofRoot,
    repoRoot,
    runtimeTarball,
    system32,
    unpackedExecutable,
    unpackedRoot: dirname(unpackedExecutable),
  }
}

function verifyExactTools(inputs: DistributionInputs, environment: NodeJS.ProcessEnv): void {
  const node = runProcessSync(
    'exact Node version check',
    inputs.nodeExecutable,
    ['--version'],
    environment,
  ).stdout.trim()
  if (!/^v22\.\d+\.\d+$/u.test(node)) fail(`Node must be exact major 22, got ${node}`)
  const pnpm = runProcessSync(
    'exact pnpm version check',
    inputs.nodeExecutable,
    [inputs.pnpmEntry, '--version'],
    environment,
  ).stdout.trim()
  if (pnpm !== pnpmVersion) fail(`pnpm must be exact ${pnpmVersion}, got ${pnpm}`)
}

function writeDiscoveryShim(inputs: DistributionInputs): string {
  const globalRoot = dirname(dirname(inputs.dshRoot))
  const expectedDsh = realpathSync(join(globalRoot, '@deepseek-ai', 'dsh'))
  if (expectedDsh.toLowerCase() !== inputs.dshRoot.toLowerCase()) {
    fail('selected DSH root is not under its exact global node_modules root')
  }
  const shimRoot = join(inputs.proofRoot, 'discovery-shim')
  mkdirSync(shimRoot)
  writeFileSync(join(shimRoot, 'pnpm.cmd'), [
    '@echo off',
    'if not "%~1"=="root" goto forward',
    'if not "%~2"=="-g" goto forward',
    'if not "%~3"=="" goto forward',
    `echo ${globalRoot}`,
    'exit /b 0',
    ':forward',
    `"${process.execPath}" "${inputs.pnpmEntry}" %*`,
    'exit /b %ERRORLEVEL%',
    '',
  ].join('\r\n'), 'utf8')
  return shimRoot
}

async function initializeControlProfile(inputs: DistributionInputs): Promise<{
  readonly controlRoot: string
  readonly stateRoot: string
}> {
  mkdirSync(inputs.dshHome)
  const manifestPath = realpathSync(join(inputs.dshRoot, 'package.json'))
  const requireFromDsh = createRequire(manifestPath)
  const appBootEntry = realpathSync(requireFromDsh.resolve('@deepseek-ai/dsh-app-boot'))
  const appBoot = await import(pathToFileURL(appBootEntry).href) as {
    readonly PROFILE_TEMPLATES: Readonly<Record<string, readonly string[]>>
    readonly initProfile: (path: string, bundles: readonly string[]) => void
  }
  const template = appBoot.PROFILE_TEMPLATES.web
  if (template === undefined) fail('exact DSH app-boot has no Web Profile template')
  const controlRoot = join(inputs.dshHome, 'profiles', 'control')
  appBoot.initProfile(controlRoot, template)
  const stateRoot = join(controlRoot, 'state')
  mkdirSync(stateRoot)
  writeFileSync(
    join(stateRoot, 'tianwen-desktop-distribution-sentinel.json'),
    '{"preserved":true}\n',
    { encoding: 'utf8', flag: 'wx' },
  )
  const webRoot = join(inputs.dshHome, 'profiles', 'web')
  if (lstatSync(webRoot, { throwIfNoEntry: false }) !== undefined) {
    fail('profiles/web must be completely absent before the one-shot')
  }
  return { controlRoot, stateRoot }
}

function writeUiAutomationController(proofRoot: string): string {
  const path = join(proofRoot, 'ui-automation-controller.ps1')
  writeFileSync(path, String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$all = [System.Windows.Automation.Condition]::TrueCondition
$buttonCondition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Button
)
function Window-Record($window) {
  @{ runtimeId = [string]::Join('.', $window.GetRuntimeId()); processId = [int]$window.Current.ProcessId; name = [string]$window.Current.Name }
}
function Top-Windows {
  @($root.FindAll([System.Windows.Automation.TreeScope]::Children, $all))
}
function Process-Tree([int]$rootPid) {
  $ids = [Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($rootPid)
  $processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
  do {
    $changed = $false
    foreach ($process in $processes) {
      if ($ids.Contains([int]$process.ParentProcessId) -and $ids.Add([int]$process.ProcessId)) { $changed = $true }
    }
  } while ($changed)
  return $ids
}
function Invoke-Button($button) {
  $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
}
function Dialog-Text($window) {
  @($window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $all) | ForEach-Object { [string]$_.Current.Name } | Where-Object { $_ }) -join ' | '
}
$baseline = @(Top-Windows | ForEach-Object { Window-Record $_ })
@{ event = 'ready'; baseline = @($baseline) } | ConvertTo-Json -Compress -Depth 6
while (($line = [Console]::In.ReadLine()) -ne $null) {
  try {
    $command = $line | ConvertFrom-Json
    if ($command.action -eq 'stop') {
      @{ id = [int]$command.id; kind = 'stopped' } | ConvertTo-Json -Compress
      break
    }
    $deadline = [DateTime]::UtcNow.AddMilliseconds([int]$command.timeoutMs)
    $baselineIds = [Collections.Generic.HashSet[string]]::new()
    foreach ($record in $baseline) { [void]$baselineIds.Add([string]$record.runtimeId) }
    $result = $null
    $confirmed = $false
    $confirmation = $null
    $confirmationRuntimeId = $null
    while ([DateTime]::UtcNow -lt $deadline -and $null -eq $result) {
      $ids = Process-Tree ([int]$command.rootPid)
      $windows = @(Top-Windows | Where-Object {
        $ids -contains [int]$_.Current.ProcessId -and
        -not $baselineIds.Contains([string]::Join('.', $_.GetRuntimeId()))
      })
      foreach ($window in $windows) {
        $buttons = @($window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition))
        $create = @($buttons | Where-Object { $_.Current.Name -ceq 'Create Profile' })
        $cancel = @($buttons | Where-Object { $_.Current.Name -ceq 'Cancel' })
        $ok = @($buttons | Where-Object { $_.Current.Name -ceq 'OK' })
        $text = Dialog-Text $window
        if ($text -like '*Tianwen Desktop failed to start*') {
          if ($ok.Count -eq 1) { Invoke-Button $ok[0] }
          $result = @{ kind = $(if ($confirmed) { 'post-confirmation-error-dialog' } else { 'error-dialog' }); diagnostic = $text; window = Window-Record $window }
          break
        }
        $windowRuntimeId = [string]::Join('.', $window.GetRuntimeId())
        if ($confirmed -and ($create.Count -gt 0 -or $cancel.Count -gt 0) -and $windowRuntimeId -ne $confirmationRuntimeId) {
          if ($cancel.Count -eq 1) { Invoke-Button $cancel[0] }
          $result = @{ kind = 'repeated-confirmation'; createCount = $create.Count; cancelCount = $cancel.Count; diagnostic = $text; window = Window-Record $window }
          break
        }
        if (-not $confirmed -and ($create.Count -gt 0 -or $cancel.Count -gt 0)) {
          if ($create.Count -ne 1 -or $cancel.Count -ne 1) {
            $result = @{ kind = 'invalid-confirmation'; createCount = $create.Count; cancelCount = $cancel.Count; diagnostic = $text; window = Window-Record $window }
          } elseif ($command.action -eq 'confirm') {
            Invoke-Button $create[0]
            $confirmed = $true
            $confirmation = Window-Record $window
            $confirmationRuntimeId = $windowRuntimeId
          } else {
            Invoke-Button $cancel[0]
            $result = @{ kind = 'unexpected-confirmation'; createCount = 1; cancelCount = 1; diagnostic = $text; window = Window-Record $window }
          }
          break
        }
      }
      if ($null -eq $result -and -not (Get-Process -Id ([int]$command.rootPid) -ErrorAction SilentlyContinue)) {
        if ($command.action -eq 'confirm' -and $confirmed) {
          $result = @{ kind = 'confirmed'; createCount = 1; cancelCount = 1; window = $confirmation }
        } else {
          $result = @{ kind = $(if ($command.action -eq 'confirm') { 'process-exited-before-confirmation' } else { 'clean' }) }
        }
      }
      if ($null -eq $result) { Start-Sleep -Milliseconds 100 }
    }
    if ($null -eq $result) { $result = @{ kind = 'timeout' } }
    $result.id = [int]$command.id
    $result | ConvertTo-Json -Compress -Depth 6
  } catch {
    @{ id = [int]$command.id; kind = 'controller-error'; diagnostic = $_.Exception.ToString() } | ConvertTo-Json -Compress -Depth 6
  }
}
`, 'utf8')
  return path
}

class UiAutomationController {
  readonly baseline: Promise<readonly WindowRecord[]>
  private readonly child
  private readonly pending = new Map<number, {
    readonly reject: (error: Error) => void
    readonly resolve: (value: UiResult) => void
    readonly timer: ReturnType<typeof setTimeout>
  }>()
  private nextId = 1
  private stderr = ''

  constructor(
    powershell: string,
    scriptPath: string,
    environment: NodeJS.ProcessEnv,
  ) {
    assertCredentialFree(environment)
    this.child = spawn(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
    ], {
      cwd: dirname(scriptPath),
      env: environment,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    if (this.child.pid === undefined) fail('UI Automation controller has no PID')
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', chunk => { this.stderr += String(chunk) })
    let buffer = ''
    let readyResolve: (value: readonly WindowRecord[]) => void
    let readyReject: (error: Error) => void
    this.baseline = new Promise((resolveBaseline, rejectBaseline) => {
      readyResolve = resolveBaseline
      readyReject = rejectBaseline
    })
    const readyTimer = setTimeout(() => {
      readyReject(new Error(`UI Automation controller did not become ready\n${this.stderr}`))
    }, 30_000)
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', chunk => {
      buffer += String(chunk)
      for (;;) {
        const end = buffer.indexOf('\n')
        if (end < 0) break
        const line = buffer.slice(0, end).trim()
        buffer = buffer.slice(end + 1)
        if (line === '') continue
        let value: Record<string, unknown>
        try {
          value = JSON.parse(line) as Record<string, unknown>
        } catch {
          readyReject(new Error(`UI Automation controller emitted invalid JSON: ${line}`))
          continue
        }
        if (value.event === 'ready') {
          clearTimeout(readyTimer)
          readyResolve((value.baseline ?? []) as readonly WindowRecord[])
          continue
        }
        const id = value.id
        if (typeof id !== 'number') continue
        const request = this.pending.get(id)
        if (request === undefined) continue
        clearTimeout(request.timer)
        this.pending.delete(id)
        request.resolve(value as unknown as UiResult)
      }
    })
    this.child.once('error', error => {
      clearTimeout(readyTimer)
      readyReject(error)
      this.rejectAll(error)
    })
    this.child.once('exit', code => {
      const error = new Error(`UI Automation controller exited ${String(code)}\n${this.stderr}`)
      clearTimeout(readyTimer)
      readyReject(error)
      this.rejectAll(error)
    })
  }

  request(action: 'confirm' | 'forbid-confirmation', rootPid: number): Promise<UiResult> {
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        rejectRequest(new Error(`UI Automation request timed out\n${this.stderr}`))
      }, applicationTimeoutMs + 10_000)
      this.pending.set(id, { reject: rejectRequest, resolve: resolveRequest, timer })
      this.child.stdin.write(`${JSON.stringify({
        action,
        id,
        rootPid,
        timeoutMs: applicationTimeoutMs,
      })}\n`)
    })
  }

  async stop(): Promise<void> {
    if (this.child.exitCode !== null) return
    const id = this.nextId
    this.nextId += 1
    const stopped = new Promise<void>(resolveStopped => {
      this.child.once('exit', () => { resolveStopped() })
    })
    this.child.stdin.write(`${JSON.stringify({ action: 'stop', id })}\n`)
    this.child.stdin.end()
    await Promise.race([
      stopped,
      new Promise<void>(resolveTimeout => setTimeout(resolveTimeout, 5_000)),
    ])
    if (this.child.exitCode === null) this.child.kill()
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    this.pending.clear()
  }
}

function captureProcessIdentity(
  powershell: string,
  pid: number,
  environment: NodeJS.ProcessEnv,
): ProcessIdentity | undefined {
  const identity = runPowerShellJson<ProcessIdentity | null>(
    powershell,
    String.raw`$process = Get-CimInstance Win32_Process -Filter "ProcessId = $($args[0])" -ErrorAction Stop; if ($null -eq $process) { 'null' } else { @{ pid = [int]$process.ProcessId; executablePath = [string]$process.ExecutablePath; creationTimeUtc = $process.CreationDate.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress }`,
    [String(pid)],
    environment,
  )
  if (identity === null) return undefined
  if (identity.pid !== pid || identity.executablePath === '' || identity.creationTimeUtc === '') {
    fail(`process identity was incomplete for PID ${pid}`)
  }
  return identity
}

function sameProcessIdentity(
  expected: ProcessIdentity,
  current: ProcessIdentity | undefined,
): boolean {
  return current !== undefined
    && current.pid === expected.pid
    && win32.normalize(current.executablePath).toLowerCase()
      === win32.normalize(expected.executablePath).toLowerCase()
    && current.creationTimeUtc === expected.creationTimeUtc
}

function captureOwnedProcessIdentity(
  inputs: Pick<DistributionInputs, 'nodeExecutable' | 'powershell'>,
  rootIdentity: ProcessIdentity,
  ownedPid: number,
  environment: NodeJS.ProcessEnv,
): OwnedProcessIdentityAcceptance {
  const result = runPowerShellJson<OwnedProcessIdentityAcceptance>(
    inputs.powershell,
    String.raw`
function Reject([string]$reason) {
  @{ kind = 'rejected'; reason = $reason } | ConvertTo-Json -Compress
  exit 0
}
function Created-At($process) {
  $process.CreationDate.ToUniversalTime().ToString('o')
}
$processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
$byId = @{}
foreach ($process in $processes) { $byId[[int]$process.ProcessId] = $process }
$rootPid = [int]$args[0]
$ownedPid = [int]$args[1]
$root = $byId[$rootPid]
if ($null -eq $root) { Reject 'Desktop root process is no longer live' }
if (-not [string]::Equals([string]$root.ExecutablePath, [string]$args[2], [StringComparison]::OrdinalIgnoreCase) -or
    (Created-At $root) -cne [string]$args[3]) {
  Reject 'Desktop root process identity changed before DSH identity acceptance'
}
$owned = $byId[$ownedPid]
if ($null -eq $owned) { Reject 'emitted DSH PID was not live during identity acceptance' }
if (-not [string]::Equals([string]$owned.ExecutablePath, [string]$args[4], [StringComparison]::OrdinalIgnoreCase)) {
  Reject 'emitted DSH PID does not run the exact selected Node executable'
}
$seen = [Collections.Generic.HashSet[int]]::new()
$cursor = $owned
$belongs = $false
while ($null -ne $cursor) {
  $parentPid = [int]$cursor.ParentProcessId
  if ($parentPid -le 0 -or -not $seen.Add($parentPid)) { break }
  $parent = $byId[$parentPid]
  if ($null -eq $parent -or $cursor.CreationDate.ToUniversalTime() -lt $parent.CreationDate.ToUniversalTime()) { break }
  if ($parentPid -eq $rootPid) { $belongs = $true; break }
  $cursor = $parent
}
if (-not $belongs) { Reject 'emitted DSH PID is not in the captured Desktop root process tree' }
@{
  kind = 'accepted'
  identity = @{
    pid = [int]$owned.ProcessId
    executablePath = [string]$owned.ExecutablePath
    creationTimeUtc = Created-At $owned
  }
} | ConvertTo-Json -Compress -Depth 4
`,
    [
      String(rootIdentity.pid),
      String(ownedPid),
      rootIdentity.executablePath,
      rootIdentity.creationTimeUtc,
      inputs.nodeExecutable,
    ],
    environment,
  )
  if (result.kind === 'accepted') {
    if (result.identity.pid !== ownedPid
      || win32.normalize(result.identity.executablePath).toLowerCase()
        !== win32.normalize(inputs.nodeExecutable).toLowerCase()
      || result.identity.creationTimeUtc === '') {
      return { kind: 'rejected', reason: 'accepted DSH identity payload was invalid' }
    }
    return result
  }
  if (result.kind === 'rejected' && result.reason !== '') return result
  return { kind: 'rejected', reason: 'DSH identity query returned an invalid result' }
}

function terminateObservedTree(
  inputs: Pick<DistributionInputs, 'powershell' | 'system32'>,
  identity: ProcessIdentity | undefined,
  environment: NodeJS.ProcessEnv,
): void {
  if (identity === undefined) return
  const current = captureProcessIdentity(inputs.powershell, identity.pid, environment)
  if (!sameProcessIdentity(identity, current)) return
  spawnSync(join(inputs.system32, 'taskkill.exe'), [
    '/PID', String(identity.pid), '/T', '/F',
  ], {
    encoding: 'utf8', env: environment, shell: false, windowsHide: true,
  })
}

async function waitForEndpointClosed(url: string): Promise<void> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      await response.body?.cancel()
    } catch {
      return
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }
  fail(`DSH endpoint remained open: ${url}`)
}

async function runDesktop(
  label: string,
  executable: string,
  environment: NodeJS.ProcessEnv,
  uiController: UiAutomationController,
  uiAction: 'confirm' | 'forbid-confirmation',
  inputs: Pick<DistributionInputs, 'nodeExecutable' | 'powershell' | 'system32'>,
): Promise<DesktopResult> {
  assertCredentialFree(environment)
  const startedAt = new Date().toISOString()
  const child = spawn(executable, [], {
    cwd: environment.TEMP,
    env: environment,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const pid = child.pid
  if (pid === undefined) fail(`${label} did not expose its process ID`)
  const rootIdentity = captureProcessIdentity(inputs.powershell, pid, environment)
  if (rootIdentity === undefined) {
    child.kill()
    fail(`${label} process identity could not be captured while live`)
  }
  if (win32.normalize(rootIdentity.executablePath).toLowerCase()
      !== win32.normalize(executable).toLowerCase()) {
    terminateObservedTree(inputs, rootIdentity, environment)
    fail(`${label} process identity did not match its executable`)
  }
  let stdout = ''
  let stderr = ''
  let ownedDshIdentity: ProcessIdentity | undefined
  let ownedDshIdentityError: string | undefined
  let ownedDshIdentityChecked = false
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdout += String(chunk)
    const emittedPid = /Tianwen Desktop owns DSH PID (\d+)/u.exec(stdout)?.[1]
    if (!ownedDshIdentityChecked && emittedPid !== undefined) {
      ownedDshIdentityChecked = true
      try {
        const acceptance = captureOwnedProcessIdentity(
          inputs,
          rootIdentity,
          Number(emittedPid),
          environment,
        )
        if (acceptance.kind === 'accepted') ownedDshIdentity = acceptance.identity
        else ownedDshIdentityError = acceptance.reason
      } catch (error) {
        ownedDshIdentityError = error instanceof Error ? error.message : String(error)
      }
    }
  })
  child.stderr.on('data', chunk => { stderr += String(chunk) })
  let timedOut = false
  const exited = new Promise<ProcessResult>((resolveExit, rejectExit) => {
    const timer = setTimeout(() => {
      timedOut = true
      rejectExit(new Error(`${label} did not exit within ${applicationTimeoutMs} ms`))
    }, applicationTimeoutMs)
    child.once('error', error => {
      clearTimeout(timer)
      rejectExit(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      resolveExit({
        code,
        endedAt: new Date().toISOString(),
        pid,
        signal,
        startedAt,
        stderr,
        stdout,
      })
    })
  })
  let cleanupRequired = true
  try {
    const interaction = uiController.request(uiAction, pid).then(value => {
      const accepted = uiAction === 'confirm'
        ? value.kind === 'confirmed' && value.createCount === 1 && value.cancelCount === 1
        : value.kind === 'clean'
      if (!accepted) throw new Error(`${label} UI result: ${JSON.stringify(value)}`)
      return value
    })
    const [result, ui] = await Promise.all([
      exited,
      interaction,
    ])
    process.stdout.write(`\n--- ${label} stdout ---\n${result.stdout}`)
    process.stderr.write(`\n--- ${label} stderr ---\n${result.stderr}`)
    if (result.code !== 0 || result.signal !== null) {
      fail(`${label} failed (exit=${String(result.code)}, signal=${String(result.signal)})`)
    }
    if (ui.kind === 'error-dialog' || ui.kind === 'controller-error'
      || ui.kind === 'invalid-confirmation' || ui.kind === 'timeout') {
      fail(`${label} UI result: ${JSON.stringify(ui)}`)
    }
    const pidMatches = [...result.stdout.matchAll(/Tianwen Desktop owns DSH PID (\d+)/gu)]
    const urlMatches = [...result.stdout.matchAll(/Tianwen Desktop ready at (http:\/\/127\.0\.0\.1:\d+\/?)\s*/gu)]
    expect(pidMatches, `${label} must emit exactly one owned DSH PID`).toHaveLength(1)
    expect(urlMatches, `${label} must emit exactly one loopback ready URL`).toHaveLength(1)
    const ownedDshPid = Number(pidMatches[0]?.[1])
    const readyUrl = urlMatches[0]?.[1]
    if (!Number.isSafeInteger(ownedDshPid) || ownedDshPid <= 0 || readyUrl === undefined) {
      fail(`${label} emitted invalid lifecycle evidence`)
    }
    if (ownedDshIdentityError !== undefined) {
      fail(`${label} rejected its emitted DSH process identity: ${ownedDshIdentityError}`)
    }
    if (!ownedDshIdentityChecked || ownedDshIdentity?.pid !== ownedDshPid) {
      fail(`${label} did not accept the emitted DSH process identity while it was live`)
    }
    expect(captureProcessIdentity(inputs.powershell, ownedDshPid, environment)).toBeUndefined()
    await waitForEndpointClosed(readyUrl)
    cleanupRequired = false
    return {
      ...result,
      ownedDshPid,
      readyUrl,
      stderrSha256: hashBytes(result.stderr),
      stdoutSha256: hashBytes(result.stdout),
      ui,
    }
  } catch (error) {
    throw new Error([
      error instanceof Error ? error.message : String(error),
      `stdout:\n${stdout}`,
      `stderr:\n${stderr}`,
    ].join('\n'))
  } finally {
    if (cleanupRequired || timedOut) {
      terminateObservedTree(inputs, ownedDshIdentity, environment)
      terminateObservedTree(inputs, rootIdentity, environment)
    }
  }
}

async function runAsyncProcess(
  label: string,
  executable: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  inputs: Pick<DistributionInputs, 'powershell' | 'system32'>,
): Promise<ProcessResult> {
  assertCredentialFree(environment)
  const startedAt = new Date().toISOString()
  const child = spawn(executable, [...args], {
    cwd: environment.TEMP,
    env: environment,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const pid = child.pid
  if (pid === undefined) fail(`${label} did not expose its process ID`)
  const identity = captureProcessIdentity(inputs.powershell, pid, environment)
  if (identity === undefined) {
    child.kill()
    fail(`${label} process identity could not be captured while live`)
  }
  if (win32.normalize(identity.executablePath).toLowerCase()
      !== win32.normalize(executable).toLowerCase()) {
    terminateObservedTree(inputs, identity, environment)
    fail(`${label} process identity did not match its executable`)
  }
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += String(chunk) })
  child.stderr.on('data', chunk => { stderr += String(chunk) })
  let completed = false
  try {
    const result = await new Promise<ProcessResult>((resolveExit, rejectExit) => {
      const timer = setTimeout(() => rejectExit(new Error(`${label} timed out`)), processTimeoutMs)
      child.once('error', error => {
        clearTimeout(timer)
        rejectExit(error)
      })
      child.once('close', (code, signal) => {
        clearTimeout(timer)
        completed = true
        resolveExit({
          code,
          endedAt: new Date().toISOString(),
          pid,
          signal,
          startedAt,
          stderr,
          stdout,
        })
      })
    })
    process.stdout.write(`\n--- ${label} stdout ---\n${stdout}`)
    process.stderr.write(`\n--- ${label} stderr ---\n${stderr}`)
    if (result.code !== 0 || result.signal !== null) {
      fail(`${label} failed (exit=${String(result.code)}, signal=${String(result.signal)})`)
    }
    return result
  } finally {
    if (!completed) terminateObservedTree(inputs, identity, environment)
  }
}

function auditArtifact(
  label: string,
  inputs: DistributionInputs,
  artifactRoot: string,
  environment: NodeJS.ProcessEnv,
): ProcessResult {
  return runProcessSync(
    label,
    inputs.nodeExecutable,
    [
      join(inputs.repoRoot, 'scripts', 'audit-desktop-artifact.mjs'),
      artifactRoot,
      inputs.runtimeTarball,
    ],
    environment,
  )
}

function locateSettings(appData: string): string {
  const matches: string[] = []
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile() && entry.name === 'desktop-target.json') matches.push(child)
    }
  }
  visit(appData)
  if (matches.length !== 1) fail(`expected one desktop-target.json, found ${matches.length}`)
  return realpathSync(matches[0]!)
}

function assertSettings(path: string, inputs: DistributionInputs): void {
  const settings = parseJson<Record<string, unknown>>(
    readFileSync(path, 'utf8'),
    'desktop-target.json',
  )
  expect(Object.keys(settings).sort()).toEqual([
    'dshHome', 'dshRoot', 'nodeExecutable', 'schemaVersion',
  ])
  expect(settings).toEqual({
    schemaVersion: 'tianwen.desktop-target.v1',
    nodeExecutable: inputs.nodeExecutable,
    dshRoot: inputs.dshRoot,
    dshHome: inputs.dshHome,
  })
}

function assertRuntimeInstalled(inputs: DistributionInputs): string {
  const webRoot = realpathSync(join(inputs.dshHome, 'profiles', 'web'))
  if (!isWithin(inputs.dshHome, webRoot)) fail('Web Profile escaped the fresh DSH home')
  const profile = parseJson<{
    readonly dependencies?: Readonly<Record<string, unknown>>
    readonly dsh?: { readonly profile?: { readonly bundles?: readonly unknown[] } }
  }>(readFileSync(join(webRoot, 'package.json'), 'utf8'), 'Web Profile manifest')
  expect(profile.dsh?.profile?.bundles?.filter(value => value === runtimePackage)).toHaveLength(1)
  expect(profile.dependencies?.[runtimePackage]).toBeTypeOf('string')
  const runtimeRoot = realpathSync(join(webRoot, 'node_modules', '@tianwen', 'runtime-bundle'))
  if (!isWithin(webRoot, runtimeRoot)) fail('installed Runtime escaped the Web Profile')
  const runtime = parseJson<{ readonly name?: unknown, readonly version?: unknown }>(
    readFileSync(join(runtimeRoot, 'package.json'), 'utf8'),
    'installed Runtime manifest',
  )
  expect(runtime).toMatchObject({ name: runtimePackage, version: runtimeVersion })
  return webRoot
}

function findUniqueUninstaller(installedRoot: string): string {
  const matches: string[] = []
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile() && /uninstall.*\.exe$/iu.test(entry.name)) matches.push(child)
    }
  }
  visit(installedRoot)
  if (matches.length !== 1) fail(`expected one uninstaller, found ${matches.length}`)
  return realpathSync(matches[0]!)
}

async function waitForRemoval(path: string): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (!existsSync(path)) return
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }
  fail(`uninstaller did not remove ${path}`)
}

describe('Tianwen Desktop distribution on an existing DSH', () => {
  it.runIf(enabled)(
    'proves missing-Profile creation, saved reuse, shortcut launch, and uninstall exactly once',
    async () => {
      const startedAt = new Date().toISOString()
      const inputs = validateInputs()
      const queryEnvironment = queryChildEnvironment(inputs)
      verifyExactTools(inputs, queryEnvironment)
      const shellBefore = captureShellState(inputs.powershell, queryEnvironment)
      expect(shellBefore.shortcuts).toEqual([])
      expect(shellBefore.registrations).toEqual([])
      expect(captureTianwenProcesses(inputs.powershell, queryEnvironment)).toEqual([])

      const baseEnvironment = baseChildEnvironment(inputs)

      const shimRoot = writeDiscoveryShim(inputs)
      const { controlRoot, stateRoot } = await initializeControlProfile(inputs)
      const dshRootBefore = snapshotTree(inputs.dshRoot)
      const controlBefore = snapshotTree(controlRoot)
      const stateBefore = snapshotTree(stateRoot)
      const unpackedAudit = auditArtifact(
        'unpacked Desktop artifact audit',
        inputs,
        inputs.unpackedRoot,
        baseEnvironment,
      )
      const sourceRuntimeSha256 = hashFile(inputs.runtimeTarball)
      const unpackedRuntime = join(
        inputs.unpackedRoot,
        'resources',
        'runtime',
        runtimeArchiveName,
      )
      const unpackedRuntimeSha256 = hashFile(unpackedRuntime)
      expect(unpackedRuntimeSha256).toBe(sourceRuntimeSha256)

      const firstEnvironment: NodeJS.ProcessEnv = {
        ...baseEnvironment,
        DSH_HOME: inputs.dshHome,
        PATH: [shimRoot, dirname(inputs.nodeExecutable), inputs.system32].join(delimiter),
        TIANWEN_DESKTOP_E2E_EXIT_AFTER_LOAD: '1',
      }
      const savedEnvironment: NodeJS.ProcessEnv = {
        ...baseEnvironment,
        TIANWEN_DESKTOP_E2E_EXIT_AFTER_LOAD: '1',
      }
      assertCredentialFree(firstEnvironment)
      assertCredentialFree(savedEnvironment)

      const uiScript = writeUiAutomationController(inputs.proofRoot)
      const ui = new UiAutomationController(inputs.powershell, uiScript, baseEnvironment)
      const baseline = await ui.baseline
      let first: DesktopResult
      let second: DesktopResult
      let installed: DesktopResult
      try {
        first = await runDesktop(
          'unpacked missing-Profile launch',
          inputs.unpackedExecutable,
          firstEnvironment,
          ui,
          'confirm',
          inputs,
        )
        expect(snapshotTree(inputs.dshRoot)).toEqual(dshRootBefore)
        expect(snapshotTree(controlRoot)).toEqual(controlBefore)
        expect(snapshotTree(stateRoot)).toEqual(stateBefore)
        const webRoot = assertRuntimeInstalled(inputs)
        const appData = baseEnvironment.APPDATA
        if (appData === undefined) fail('isolated APPDATA is missing')
        const settingsPath = locateSettings(appData)
        assertSettings(settingsPath, inputs)
        const settingsAfterFirst = readFileSync(settingsPath)
        const webAfterFirst = snapshotTree(webRoot)
        const homeAfterFirst = snapshotTree(inputs.dshHome)

        second = await runDesktop(
          'unpacked saved-target launch',
          inputs.unpackedExecutable,
          savedEnvironment,
          ui,
          'forbid-confirmation',
          inputs,
        )
        expect(readFileSync(settingsPath)).toEqual(settingsAfterFirst)
        expect(snapshotTree(webRoot)).toEqual(webAfterFirst)
        expect(snapshotTree(inputs.dshHome)).toEqual(homeAfterFirst)
        expect(snapshotTree(controlRoot)).toEqual(controlBefore)
        expect(snapshotTree(stateRoot)).toEqual(stateBefore)
        expect(snapshotTree(inputs.dshRoot)).toEqual(dshRootBefore)

        const installedRoot = join(inputs.proofRoot, 'installed')
        const installerResult = await runAsyncProcess(
          'NSIS installer',
          inputs.installer,
          ['/S', `/D=${installedRoot}`],
          baseEnvironment,
          inputs,
        )
        const shellAfterInstall = captureShellState(inputs.powershell, queryEnvironment)
        const newShortcuts = shellDifference(shellBefore.shortcuts, shellAfterInstall.shortcuts)
        const newRegistrations = shellDifference(
          shellBefore.registrations,
          shellAfterInstall.registrations,
        )
        expect(newShortcuts).toHaveLength(1)
        expect(newRegistrations.length).toBeGreaterThan(0)
        const installedExecutable = realpathSync(join(installedRoot, `${desktopName}.exe`))
        expect(realpathSync(newShortcuts[0]!.targetPath)).toBe(installedExecutable)
        const installedAudit = auditArtifact(
          'installed Desktop artifact audit',
          inputs,
          installedRoot,
          baseEnvironment,
        )
        const installedRuntime = join(
          installedRoot,
          'resources',
          'runtime',
          runtimeArchiveName,
        )
        const installedRuntimeSha256 = hashFile(installedRuntime)
        expect(installedRuntimeSha256).toBe(sourceRuntimeSha256)
        expect(installedRuntimeSha256).toBe(unpackedRuntimeSha256)
        const uninstaller = findUniqueUninstaller(installedRoot)
        const installedExecutableSha256 = hashFile(installedExecutable)

        installed = await runDesktop(
          'installed shortcut-target launch',
          installedExecutable,
          savedEnvironment,
          ui,
          'forbid-confirmation',
          inputs,
        )
        expect(readFileSync(settingsPath)).toEqual(settingsAfterFirst)
        expect(snapshotTree(webRoot)).toEqual(webAfterFirst)
        expect(snapshotTree(inputs.dshHome)).toEqual(homeAfterFirst)
        expect(snapshotTree(controlRoot)).toEqual(controlBefore)
        expect(snapshotTree(stateRoot)).toEqual(stateBefore)
        expect(snapshotTree(inputs.dshRoot)).toEqual(dshRootBefore)

        const uninstallerSha256 = hashFile(uninstaller)
        const uninstallerResult = await runAsyncProcess(
          'NSIS uninstaller',
          uninstaller,
          ['/S'],
          baseEnvironment,
          inputs,
        )
        await waitForRemoval(installedExecutable)
        await waitForRemoval(installedRoot)
        const shellAfterUninstall = captureShellState(inputs.powershell, queryEnvironment)
        expect(shellAfterUninstall.shortcuts).toEqual(shellBefore.shortcuts)
        expect(shellAfterUninstall.registrations).toEqual(shellBefore.registrations)
        expect(readFileSync(settingsPath)).toEqual(settingsAfterFirst)
        expect(snapshotTree(webRoot)).toEqual(webAfterFirst)
        expect(snapshotTree(inputs.dshHome)).toEqual(homeAfterFirst)
        expect(snapshotTree(controlRoot)).toEqual(controlBefore)
        expect(snapshotTree(stateRoot)).toEqual(stateBefore)
        expect(snapshotTree(inputs.dshRoot)).toEqual(dshRootBefore)

        process.stdout.write(`\nTIANWEN_DESKTOP_DISTRIBUTION_SUMMARY ${JSON.stringify({
          schemaVersion: 'tianwen.desktop-distribution-proof.v1',
          startedAt,
          endedAt: new Date().toISOString(),
          proofRoot: inputs.proofRoot,
          uiBaselineWindows: baseline.length,
          providerCredentialsPassed: [],
          launches: [first, second, installed].map(result => ({
            startedAt: result.startedAt,
            endedAt: result.endedAt,
            executablePid: result.pid,
            exitCode: result.code,
            signal: result.signal,
            ownedDshPid: result.ownedDshPid,
            readyUrl: result.readyUrl,
            stdoutSha256: result.stdoutSha256,
            stderrSha256: result.stderrSha256,
            ui: result.ui.kind,
          })),
          artifacts: {
            sourceRuntimeSha256,
            unpackedRuntimeSha256,
            installedRuntimeSha256,
            unpackedExecutableSha256: hashFile(inputs.unpackedExecutable),
            installedExecutableSha256,
            installerSha256: hashFile(inputs.installer),
            uninstallerSha256,
          },
          audits: {
            unpackedStdoutSha256: hashBytes(unpackedAudit.stdout),
            installedStdoutSha256: hashBytes(installedAudit.stdout),
          },
          shell: {
            addedShortcut: newShortcuts[0],
            addedRegistrations: newRegistrations,
          },
          processes: {
            applicationLaunches: 3,
            installers: 1,
            uninstallers: 1,
            installer: {
              startedAt: installerResult.startedAt,
              endedAt: installerResult.endedAt,
              exitCode: installerResult.code,
              signal: installerResult.signal,
              stdoutSha256: hashBytes(installerResult.stdout),
              stderrSha256: hashBytes(installerResult.stderr),
            },
            uninstaller: {
              startedAt: uninstallerResult.startedAt,
              endedAt: uninstallerResult.endedAt,
              exitCode: uninstallerResult.code,
              signal: uninstallerResult.signal,
              stdoutSha256: hashBytes(uninstallerResult.stdout),
              stderrSha256: hashBytes(uninstallerResult.stderr),
            },
          },
          preserved: {
            desktopTargetSha256: hashBytes(settingsAfterFirst),
            webProfile: webAfterFirst,
            controlProfile: controlBefore,
            controlState: stateBefore,
            externalDshRoot: dshRootBefore,
          },
        })}\n`)
      } finally {
        await ui.stop()
      }
    },
    1_800_000,
  )
})
