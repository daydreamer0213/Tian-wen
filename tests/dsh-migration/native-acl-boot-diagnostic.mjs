import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
// Temporary diagnostic, not an acceptance gate: retain every arm and exit 0.
assert.equal(process.platform, 'win32')
const source = readFileSync('packages/tianwen-desktop-host/src/native-observation-launch.ts', 'utf8')
const script = /const windowsAclScript = `([\s\S]*?)`/u.exec(source)?.[1]
const currentKeys = /for \(const key of \[(.*?)\] as const\)/u.exec(source)?.[1].match(/'([^']+)'/gu)?.map(s => s.slice(1, -1))
assert(script && currentKeys)
const root = mkdtempSync(join(tmpdir(), 'tianwen-acl-boot-diagnostic-'))
const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
const powershell = join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
const common = { SystemRoot: systemRoot, windir: process.env.windir ?? systemRoot }
const current = { ...common }
for (const key of currentKeys) if (process.env[key] !== undefined) current[key] = process.env[key]
const standard = { ...current }
const standardKeys = ['ALLUSERSPROFILE','CommonProgramFiles','CommonProgramFiles(x86)','CommonProgramW6432','COMPUTERNAME','ComSpec','HOMEDRIVE','HOMEPATH','LOGONSERVER','NUMBER_OF_PROCESSORS','OS','PATH','PATHEXT','PROCESSOR_ARCHITECTURE','PROCESSOR_IDENTIFIER','PROCESSOR_LEVEL','PROCESSOR_REVISION','ProgramData','ProgramFiles','ProgramFiles(x86)','ProgramW6432','PUBLIC','SystemDrive','USERDOMAIN','USERDOMAIN_ROAMINGPROFILE','USERNAME','PSModulePath']
for (const key of standardKeys) if (process.env[key] !== undefined) standard[key] = process.env[key]
const sanitized = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|TOKEN|PASSWORD|SECRET|AUTH|COOKIE|CREDENTIAL|CONNECTION|^(?:GITHUB|ACTIONS|INPUT|ENDPOINT|SYSTEM_ACCESSTOKEN)/iu.test(key)))
const traced = script.split(/\r?\n/u).map((line, index) => `[Console]::Error.WriteLine('acl-line-${index + 1}')\n${line}`).join('\n')
const noop = "[Console]::Error.WriteLine('noop-ready'); exit 0"
const arms = [
  ['encoded-noop-pipe', current, noop, false, false, 5000],
  ['encoded-noop-ignore', current, noop, true, false, 5000],
  ['command-noop-pipe', current, noop, false, true, 5000],
  ['current-exact', current, script, false, false, 10000],
  ['current-ignore-input', current, script, true, false, 10000],
  ['standard-windows', standard, script, false, false, 10000],
  ['sanitized-ignore-input', sanitized, script, true, false, 10000],
  ['trace-current', current, traced, false, false, 5000],
  ['trace-standard', standard, traced, false, false, 5000],
]
const rows = []
for (const [name, environment, body, ignoreInput, command, timeout] of arms) {
  const path = join(root, name); mkdirSync(path)
  const started = Date.now()
  const result = spawnSync(powershell, ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass', command ? '-Command' : '-EncodedCommand', command ? body : Buffer.from(body, 'utf16le').toString('base64')], {
    env: { ...environment, TIANWEN_OBSERVATION_ACL_PATH: path },
    encoding: 'utf8', timeout, maxBuffer: 32768, windowsHide: true,
    ...(ignoreInput ? { stdio: ['ignore','pipe','pipe'] } : {}),
  })
  const row = { name, milliseconds: Date.now() - started, timeout, ignoreInput, command, code: result.status, signal: result.signal, errorCode: result.error?.code, environmentKeys: Object.keys(environment).sort(), stdout: result.stdout, stderr: result.stderr }
  rows.push(row); console.log(JSON.stringify(row))
}
writeFileSync(join(root, 'receipt.json'), JSON.stringify({ root: resolve(root), sourceCommit: process.env.GITHUB_SHA, providerCalls: 0, productionFirstResultUnchanged: true, rows }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ diagnosticRoot: root, arms: rows.length, providerCalls: 0, acceptanceGate: false }))
