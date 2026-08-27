import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, resolve, win32 } from 'node:path'

const timeoutMs = 120_000
const samplesCount = 3

function required(name) {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') throw new Error(`${name} is required`)
  return value
}

function requireChoice(name, choices) {
  const value = required(name)
  if (!choices.includes(value)) throw new Error(`${name} must be ${choices.join('|')}`)
  return value
}

function requireBin() {
  const value = required('TIANWEN_DSH_BIN')
  if (!isAbsolute(value)) throw new Error('TIANWEN_DSH_BIN must be absolute')
  const path = realpathSync(value)
  if (!statSync(path).isFile() || basename(path).toLowerCase() !== 'bin.js') {
    throw new Error('TIANWEN_DSH_BIN must be a packaged DSH bin.js file')
  }
  return path
}

function requireFreshProbeRoot() {
  const value = required('TIANWEN_DSH_PROBE_ROOT')
  if (!isAbsolute(value)) throw new Error('TIANWEN_DSH_PROBE_ROOT must be absolute')
  const candidate = resolve(value)
  if (process.platform === 'win32') {
    if (win32.parse(candidate).root.toLowerCase() !== 'd:\\' || candidate.toLowerCase() === 'd:\\') {
      throw new Error('TIANWEN_DSH_PROBE_ROOT must be a D-drive child')
    }
  }
  if (existsSync(candidate) && readdirSync(candidate).length !== 0) {
    throw new Error('TIANWEN_DSH_PROBE_ROOT must be fresh')
  }
  mkdirSync(candidate, { recursive: true })
  const actual = realpathSync(candidate)
  if (process.platform === 'win32' && win32.parse(actual).root.toLowerCase() !== 'd:\\') {
    throw new Error('TIANWEN_DSH_PROBE_ROOT real path must stay on D:')
  }
  return actual
}

function fallbackLinks(home) {
  const modules = join(home, 'profiles', 'node_modules')
  if (!existsSync(modules)) return 0
  return readdirSync(modules, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isSymbolicLink()).length
}

function validateBoot(home, stdout, yaml) {
  if (!stdout.includes('Usage: dsh --profile web')) {
    throw new Error('boot sample did not print Web usage')
  }
  const profile = join(home, 'profiles', 'web')
  JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
  for (const name of ['cordis.patch.yml', 'pnpm-workspace.yaml']) {
    const contents = readFileSync(join(profile, name), 'utf8')
    if (contents.trim() === '') throw new Error(`${name} is empty`)
    yaml.load(contents)
  }
}

try {
  const bin = requireBin()
  const label = requireChoice('TIANWEN_DSH_TIMING_LABEL', ['rc7', 'rc2'])
  const mode = requireChoice('TIANWEN_DSH_TIMING_MODE', ['dump', 'boot'])
  const probeRoot = requireFreshProbeRoot()
  const argv = mode === 'dump'
    ? ['--profile', 'headless', '--dump-config']
    : ['web', '--help']
  const requireFromDsh = createRequire(resolve(dirname(bin), '..', 'package.json'))
  const requireFromAppBoot = createRequire(requireFromDsh.resolve('@deepseek-ai/dsh-app-boot/package.json'))
  const yaml = requireFromAppBoot('js-yaml')
  const samples = []

  for (let index = 0; index < samplesCount; index += 1) {
    const home = mkdtempSync(join(probeRoot, `${label}-${mode}-${index + 1}-`))
    const temp = join(home, 'temp')
    const appData = join(home, 'app-data')
    const localAppData = join(home, 'local-app-data')
    const userProfile = join(home, 'user-profile')
    for (const path of [temp, appData, localAppData, userProfile]) {
      mkdirSync(path, { recursive: true })
    }
    const startedAt = performance.now()
    const result = spawnSync(process.execPath, [bin, ...argv], {
      encoding: 'utf8',
      env: {
        ...process.env,
        APPDATA: appData,
        DSH_HOME: home,
        DSH_TELEMETRY_DISABLED: '1',
        LOCALAPPDATA: localAppData,
        TEMP: temp,
        TMP: temp,
        USERPROFILE: userProfile,
      },
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
      timeout: timeoutMs,
      windowsHide: true,
    })
    const elapsedMs = Math.round(performance.now() - startedAt)
    if (result.error !== undefined) throw result.error
    if (result.status !== 0) {
      throw new Error(`${label} ${mode} sample ${index + 1} exited ${result.status}: ${result.stderr}`)
    }
    const links = fallbackLinks(home)
    if (mode === 'dump') {
      if (existsSync(join(home, 'profiles', 'node_modules'))) {
        throw new Error(`dump sample ${index + 1} prepared the Profile fallback`)
      }
    } else {
      validateBoot(home, result.stdout, yaml)
    }
    samples.push({ sample: index + 1, home, elapsedMs, fallbackLinks: links })
  }

  const elapsed = samples.map(sample => sample.elapsedMs).sort((left, right) => left - right)
  process.stdout.write(`${JSON.stringify({
    label,
    mode,
    argv,
    samples,
    medianMs: elapsed[1],
  })}\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
}
