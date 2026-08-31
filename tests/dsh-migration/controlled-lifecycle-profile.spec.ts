import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'

import {
  canonicalJson,
  deriveInstallPaths,
  renderProfilePatch,
  validateDump,
} from '../../scripts/install-tianwen.mjs'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const require = createRequire(import.meta.url)
const dshManifestPath = realpathSync(require.resolve('@deepseek-ai/dsh/package.json'))
const dshManifest = JSON.parse(readFileSync(dshManifestPath, 'utf8')) as {
  version: string
  bin: { dsh: string }
}
const dshBin = realpathSync(resolve(dirname(dshManifestPath), dshManifest.bin.dsh))
const controlledPatch = resolve(
  repoRoot,
  'packages/tianwen-runtime-bundle/controlled-lifecycle.patch.yml',
)

function dumpRows(source: string, id: string): string[][] {
  const lines = source.replaceAll('\r\n', '\n').split('\n')
  const starts = lines
    .map((line, index) => ({ line, index }))
    .filter(item => item.line === `- id: ${id}`)
  return starts.map(({ index: start }, rowIndex) => {
    const end = starts[rowIndex + 1]?.index
      ?? lines.findIndex((line, index) => index > start && line.startsWith('- id: '))
    return lines.slice(start, end < 0 ? undefined : end)
  })
}

function dumpValue(lines: readonly string[], key: string): string | undefined {
  const values = lines.flatMap((line) => {
    const match = new RegExp(`^ {2,}${key}: (.+)$`, 'u').exec(line)
    return match === null ? [] : [match[1]!.replace(/^['"]|['"]$/gu, '')]
  })
  if (values.length > 1) throw new Error(`dump-config contains duplicate ${key}`)
  return values[0]
}

function retryConfig(lines: readonly string[]) {
  const mode = dumpValue(lines, 'mode')
  const maxRetries = dumpValue(lines, 'maxRetries')
  if (mode === undefined && maxRetries === undefined) return undefined
  if (mode !== 'normal' || maxRetries === undefined) {
    throw new Error('dump-config contains an invalid controlled retry policy')
  }
  return { mode, maxRetries: Number(maxRetries) }
}

function runDump(dshHome: string, extraArgs: readonly string[]): string {
  const result = spawnSync(
    process.execPath,
    [dshBin, '--profile', 'tianwen', ...extraArgs, '--dump-config'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        DSH_TELEMETRY_DISABLED: '1',
      },
      shell: false,
      windowsHide: true,
    },
  )
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  return result.stdout
}

describe('controlled lifecycle Profile policy', () => {
  it('scopes zero-retry DeepSeek and disabled title LLM to the controlled command', () => {
    expect(dshManifest.version).toBe('0.1.1-rc.2')
    const fixtureParent = resolve(
      process.env.TIANWEN_DSH_PROBE_ROOT
        ?? (process.platform === 'win32'
          ? 'D:/DevData/tianwen-v0.1-eval-fixtures'
          : tmpdir()),
      'controlled-lifecycle-profile',
    )
    mkdirSync(fixtureParent, { recursive: true })
    const root = mkdtempSync(join(fixtureParent, 'profile-'))
    const paths = deriveInstallPaths(root)
    const profilesModuleFallback = join(paths.dshHome, 'profiles', 'node_modules')
    try {
      mkdirSync(join(paths.profileRoot, 'node_modules', '@tianwen'), { recursive: true })
      writeFileSync(join(paths.profileRoot, 'package.json'), canonicalJson({
        name: '@tianwen/profile-host',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: {
          '@deepseek-ai/dsh-base': '0.1.1-rc.2',
          '@deepseek-ai/dsh-headless': '0.1.1-rc.2',
          '@tianwen/runtime-bundle': '0.1.7',
        },
        dsh: {
          profile: {
            bundles: [
              '@deepseek-ai/dsh-base',
              '@deepseek-ai/dsh-headless',
              '@tianwen/runtime-bundle',
            ],
          },
        },
      }), 'utf8')
      writeFileSync(
        join(paths.profileRoot, 'cordis.patch.yml'),
        renderProfilePatch(paths),
        'utf8',
      )
      symlinkSync(
        realpathSync(resolve(repoRoot, 'packages/tianwen-runtime-bundle')),
        join(paths.profileRoot, 'node_modules', '@tianwen', 'runtime-bundle'),
        process.platform === 'win32' ? 'junction' : 'dir',
      )

      expect(existsSync(paths.sessionsRoot)).toBe(false)
      expect(existsSync(paths.evolutionRoot)).toBe(false)
      expect(existsSync(profilesModuleFallback)).toBe(false)
      const ordinary = runDump(paths.dshHome, [])
      expect(existsSync(profilesModuleFallback)).toBe(false)
      const controlled = runDump(paths.dshHome, ['--patch', controlledPatch])
      expect(existsSync(profilesModuleFallback)).toBe(false)
      expect(() => validateDump(ordinary, paths)).not.toThrow()
      expect(() => validateDump(controlled, paths)).not.toThrow()

      const ordinaryDeepSeek = dumpRows(ordinary, 'llm-deepseek')
      const controlledDeepSeek = dumpRows(controlled, 'llm-deepseek')
      expect(ordinaryDeepSeek).toHaveLength(1)
      expect(controlledDeepSeek).toHaveLength(1)
      expect(retryConfig(ordinaryDeepSeek[0]!)).toBeUndefined()
      expect(resolveRetryPolicy(undefined, 'ordinary llm-deepseek retryPolicy'))
        .toMatchObject({ mode: 'normal', maxRetries: 5 })
      const controlledRetry = retryConfig(controlledDeepSeek[0]!)
      const controlledResolved = resolveRetryPolicy(
        controlledRetry,
        'controlled llm-deepseek retryPolicy',
      )
      expect({
        retryPolicy: {
          mode: controlledResolved.mode,
          maxRetries: controlledResolved.mode === 'normal'
            ? controlledResolved.maxRetries
            : undefined,
        },
        sessionTitleLlmDisabled:
          dumpValue(dumpRows(controlled, 'session-title-llm')[0]!, 'disabled') === 'true',
      }).toEqual({
        retryPolicy: { mode: 'normal', maxRetries: 0 },
        sessionTitleLlmDisabled: true,
      })
      expect(controlledRetry).toEqual({ mode: 'normal', maxRetries: 0 })
      expect(controlledResolved)
        .toMatchObject({ mode: 'normal', maxRetries: 0 })

      expect(dumpValue(dumpRows(ordinary, 'session-title-llm')[0]!, 'disabled'))
        .not.toBe('true')
      expect(dumpValue(dumpRows(controlled, 'session-title-llm')[0]!, 'disabled'))
        .toBe('true')
      for (const id of ['session-title', 'llm-retry', 'settings']) {
        expect(dumpRows(controlled, id)).toHaveLength(1)
        expect(dumpValue(dumpRows(controlled, id)[0]!, 'disabled')).not.toBe('true')
      }
      expect(dumpRows(ordinary, 'tianwen-controlled-lifecycle-runner')).toHaveLength(0)
      expect(dumpRows(controlled, 'tianwen-controlled-lifecycle-runner')).toHaveLength(1)

      expect(existsSync(paths.sessionsRoot)).toBe(false)
      expect(existsSync(paths.evolutionRoot)).toBe(false)
      expect(existsSync(join(paths.evolutionRoot, 'ledger.jsonl'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)
})
