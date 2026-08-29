import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  Context,
  SystemPrompt,
  ToolRuntime,
} from '@tianwen/dsh-compat'
import { default as TimerService } from '@deepseek-ai/cordis-plugin-timer'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { apply as applyBundledRuntime } from '../../packages/tianwen-runtime-bundle/dist/runtime.js'
import { apply as applyRuntimeBundle } from '../../packages/tianwen-runtime-bundle/src/runtime.js'

const root = resolve(import.meta.dirname, '../..')
const packageRoot = resolve(root, 'packages/tianwen-runtime-bundle')
const compatPackageRoot = resolve(root, 'packages/tianwen-dsh-compat')
const hostPackageRoot = resolve(root, 'packages/tianwen-dsh-host')
const packFixtureBase = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-test-fixtures',
  'runtime-bundle',
)
const tar = process.platform === 'win32'
  ? resolve(process.env.SystemRoot!, 'System32', 'tar.exe')
  : 'tar'

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function externalPackages(
  imports: readonly { path: string; external?: boolean }[],
): string[] {
  return [...new Set(imports
    .filter(item => item.external === true && !item.path.startsWith('node:'))
    .map(item => item.path))].sort()
}

function isAllowedRuntimeInput(input: string): boolean {
  const path = posix.normalize(input.replaceAll('\\', '/'))
  return [
    'src/runtime.ts',
    'src/long-goal-host.ts',
    'src/long-goal.ts',
    'src/status.ts',
  ].includes(path)
    || path === '../tianwen-dsh-compat/dist/runtime.js'
    || path === '../tianwen-dsh-compat/dist/scripted-adapter.js'
    || [
      '../tianwen-runtime/dist/',
      '../tianwen-evidence/dist/',
      '../tianwen-evolution/dist/',
    ].some(root => path.startsWith(root))
}

function isAllowedSmokeInput(input: string): boolean {
  return posix.normalize(input.replaceAll('\\', '/')) === 'src/smoke.ts'
}

function isAllowedStatusInput(input: string): boolean {
  const path = posix.normalize(input.replaceAll('\\', '/'))
  return path === 'src/status.ts'
    || path === '../tianwen-evidence/dist/projector.js'
    || path === '../tianwen-dsh-compat/dist/skill-name.js'
    || [
      '../tianwen-evolution/dist/inspection.js',
      '../tianwen-evolution/dist/ledger.js',
      '../tianwen-evolution/dist/learning-intake.js',
      '../tianwen-evolution/dist/outcome-intake.js',
      '../tianwen-evolution/dist/controlled-skill-activation.js',
      '../tianwen-evolution/dist/controlled-skill-evaluation.js',
      '../tianwen-evolution/dist/controlled-skill-shadow.js',
      '../tianwen-evolution/dist/skill-evaluation.js',
      '../tianwen-evolution/dist/skill-governance.js',
    ].includes(path)
}

function isAllowedNaturalTrialInput(path: string): boolean {
  return path === 'src/natural-run-trial.ts' ||
    path === '../tianwen-runtime/dist/run-binding.js' ||
    [
      '../tianwen-evolution/dist/run-binding.js',
      '../tianwen-evolution/dist/outcome-intake.js',
      '../tianwen-evolution/dist/learning-intake.js',
    ].includes(path) || path === '../tianwen-evidence/dist/projector.js'
}

function isAllowedCliInput(input: string): boolean {
  const path = posix.normalize(input.replaceAll('\\', '/'))
  return path === 'src/cli.ts' || path === 'src/create.ts' ||
    path === 'src/long-goal.ts' || path === 'src/long-goal-run.ts' ||
    path === 'src/model.ts' || path === 'src/resume.ts' ||
    path === 'src/portable-profile.ts' ||
    path === 'src/controlled-lifecycle.ts' ||
    path === 'src/controlled-lifecycle-contract.ts' ||
    path === 'src/goal-live-smoke.ts' || isAllowedNaturalTrialInput(path) ||
    isAllowedStatusInput(path)
}

function isAllowedResumeRunnerInput(input: string): boolean {
  const path = posix.normalize(input.replaceAll('\\', '/'))
  return [
    'src/resume-runner.ts',
    'src/goal-live-smoke.ts',
  ].includes(path) || isAllowedNaturalTrialInput(path)
}

function isAllowedCreateRunnerInput(input: string): boolean {
  return posix.normalize(input.replaceAll('\\', '/')) === 'src/create-runner.ts'
}

function isAllowedControlledLifecycleRunnerInput(input: string): boolean {
  const path = posix.normalize(input.replaceAll('\\', '/'))
  return [
    'src/controlled-lifecycle-runner.ts',
    'src/controlled-lifecycle-contract.ts',
    '../tianwen-evidence/dist/projector.js',
    '../tianwen-evolution/dist/controlled-skill-activation.js',
    '../tianwen-evolution/dist/controlled-skill-evaluation.js',
    '../tianwen-evolution/dist/learning-intake.js',
    '../tianwen-evolution/dist/outcome-intake.js',
  ].includes(path)
}

function containsCredentialLiteral(text: string): boolean {
  return /\b(?:const|let|var)\s+(?:DEEPSEEK_API_KEY|API_KEY|TOKEN|[A-Z][A-Z0-9_]*_(?:API_KEY|TOKEN))\s*=\s*(['"])[A-Za-z0-9._~+\/=\-]{16,}\1/u.test(text)
}

describe('runtime metafile input allowlist', () => {
  it('permits the approved service-owned scripted adapter only', () => {
    expect(isAllowedRuntimeInput(
      '../tianwen-dsh-compat/dist/scripted-adapter.js',
    )).toBe(true)
  })

  it.each([
    '../unrelated-workspace/dist/index.js',
    'node_modules/zod/index.js',
    '../native-addon/build/Release/addon.node',
    '../test/helper.js',
  ])('rejects %s', input => {
    expect(isAllowedRuntimeInput(input)).toBe(false)
  })

  it.each([
    '../tianwen-evolution/dist/ledger.js',
    '../tianwen-runtime/dist/unrelated.js',
    '../tianwen-evidence/dist/private.js',
  ])('rejects non-approved controlled lifecycle runner input %s', input => {
    expect(isAllowedControlledLifecycleRunnerInput(input)).toBe(false)
  })
})

describe('CLI metafile input allowlist', () => {
  it.each([
    'src/natural-run-trial.ts',
    'src/portable-profile.ts',
    '../tianwen-dsh-compat/dist/skill-name.js',
    '../tianwen-evidence/dist/projector.js',
    '../tianwen-runtime/dist/run-binding.js',
    '../tianwen-evolution/dist/inspection.js',
    '../tianwen-evolution/dist/ledger.js',
    '../tianwen-evolution/dist/run-binding.js',
    '../tianwen-evolution/dist/outcome-intake.js',
    '../tianwen-evolution/dist/learning-intake.js',
    '../tianwen-evolution/dist/skill-evaluation.js',
    '../tianwen-evolution/dist/skill-governance.js',
  ])('permits the pure Stage 7 input %s', input => {
    expect(isAllowedCliInput(input)).toBe(true)
  })

  it.each([
    '../tianwen-evolution/dist/index.js',
    '../tianwen-evolution/dist/runtime-binding.js',
    '../tianwen-evolution/dist/skill-shadow.js',
    '../tianwen-evolution/dist/skill-promotion.js',
    '../tianwen-dsh-compat/dist/index.js',
    '../tianwen-dsh-compat/dist/test-harness.js',
  ])('rejects non-pure input %s', input => {
    expect(isAllowedCliInput(input)).toBe(false)
  })
})

describe('CLI installed entry identity', () => {
  it.runIf(process.platform === 'win32')(
    'executes main through a pnpm-like Runtime Bundle junction',
    () => {
      const fixtureBase = resolve('D:/DevData/tianwen-runtime-bundle-tests/cli-main-entry')
      expect(isAbsolute(packageRoot)).toBe(true)
      mkdirSync(fixtureBase, { recursive: true })
      const fixtureRoot = mkdtempSync(join(fixtureBase, 'entry-'))
      expect(relative(fixtureBase, fixtureRoot)).not.toMatch(/^\.\.(?:[\\/]|$)/u)
      const aliasRoot = join(
        fixtureRoot,
        'node_modules',
        '@tianwen',
        'runtime-bundle',
      )
      mkdirSync(dirname(aliasRoot), { recursive: true })
      symlinkSync(packageRoot, aliasRoot, 'junction')
      try {
        const result = spawnSync(process.execPath, [
          join(aliasRoot, 'dist', 'cli.js'),
        ], {
          encoding: 'utf8',
          shell: false,
          windowsHide: true,
        })
        expect({
          error: result.error,
          signal: result.signal,
          status: result.status,
          stderr: result.stderr,
          stdout: result.stdout,
        }).toEqual({
          error: undefined,
          signal: null,
          status: 2,
          stderr: [
            'Usage: tianwen status --goal GOAL_ID --data-dir ABSOLUTE_PATH [--json]',
            'Usage: tianwen status --goal GOAL_ID --dsh-root ABSOLUTE_PATH --dsh-home ABSOLUTE_PATH --profile NAME --state-root ABSOLUTE_PATH [--json]',
            'Usage: tianwen list --data-dir ABSOLUTE_PATH [--json]',
            'Usage: tianwen list --dsh-root ABSOLUTE_PATH --dsh-home ABSOLUTE_PATH --profile NAME --state-root ABSOLUTE_PATH [--json]',
            '',
          ].join('\n'),
          stdout: '',
        })
      } finally {
        rmSync(fixtureRoot, { recursive: true, force: true })
      }
    },
  )
})

describe('Skill-name compatibility subpath', () => {
  it('exports only the public Skill-name validator', async () => {
    const manifest = json(resolve(compatPackageRoot, 'package.json')) as {
      exports?: Record<string, unknown>
    }
    expect(manifest.exports?.['./skill-name']).toEqual({
      types: './dist/skill-name.d.ts',
      default: './dist/skill-name.js',
    })
    const module = await import(pathToFileURL(resolve(
      compatPackageRoot,
      'dist/skill-name.js',
    )).href) as Record<string, unknown>
    expect(Object.keys(module)).toEqual(['isSkillName'])
    expect(module.isSkillName).toEqual(expect.any(Function))
  })

  it('uses the narrow seam only for status consumers', () => {
    const manifest = json(resolve(packageRoot, 'package.json')) as {
      scripts?: { build?: string }
    }
    const build = manifest.scripts?.build ?? ''
    expect(build.match(
      /--alias:@tianwen\/dsh-compat=@tianwen\/dsh-compat\/runtime/gu,
    )).toHaveLength(1)
    expect(build.match(
      /--alias:@tianwen\/dsh-compat=@tianwen\/dsh-compat\/skill-name/gu,
    )).toHaveLength(2)
  })
})

describe('archive credential literal detection', () => {
  it('permits public references but rejects sufficiently long static credential assignments', () => {
    for (const text of [
      'process.env.DEEPSEEK_API_KEY',
      "credentialRef('DEEPSEEK_API_KEY')",
      "{ source: 'env', reference: 'DEEPSEEK_API_KEY' }",
      "const API_KEY = 'short'",
    ]) expect(containsCredentialLiteral(text)).toBe(false)
    for (const text of [
      'const DEEPSEEK_API_KEY = "abcdefghijklmnop"',
      "const API_KEY = 'abcdefghijklmnop'",
      'const ACCESS_TOKEN = "abcdefghijklmnop"',
    ]) expect(containsCredentialLiteral(text)).toBe(true)
  })
})

describe('@tianwen/runtime-bundle', () => {
  it('loads core services and defers the Web host when connection is unavailable', async () => {
    const profileRoot = mkdtempSync(join(packFixtureBase, 'headless-'))
    const ctx = new Context()
    try {
      await ctx.plugin(TimerService)
      await ctx.plugin(SystemPrompt, {})
      await ctx.plugin(ToolRuntime, {})
      ctx.baseUrl = pathToFileURL(profileRoot).href
      const inject = vi.spyOn(ctx, 'inject')

      await applyRuntimeBundle(ctx, {})

      expect(ctx.tianwenEvidence).toBeDefined()
      expect(ctx.tianwenEvolution).toBeDefined()
      expect('connection' in ctx).toBe(false)
      expect(inject).toHaveBeenCalledWith(
        ['connection', 'apiProxy', 'agents', 'goals'],
        expect.any(Function),
      )
    } finally {
      await ctx.fiber.dispose()
      rmSync(profileRoot, { recursive: true, force: true })
    }
  })

  it('executes the built runtime and mounts evidence and evolution', async () => {
    const base = process.platform === 'win32'
      ? 'D:/DevData/tianwen-runtime-bundle-tests/profiles'
      : resolve('tmp/tianwen-runtime-bundle-tests/profiles')
    mkdirSync(base, { recursive: true })
    const profileRoot = mkdtempSync(join(base, 'composition-'))
    const ctx = new Context()
    try {
      await ctx.plugin(TimerService)
      await ctx.plugin(SystemPrompt, {})
      await ctx.plugin(ToolRuntime, {})
      ctx.baseUrl = pathToFileURL(profileRoot).href
      await applyBundledRuntime(ctx, {})
      expect(ctx.tianwenEvidence).toBeDefined()
      expect(ctx.tianwenEvolution).toBeDefined()
      expect('dynamicCordisRunner' in ctx).toBe(false)
      expect(existsSync(
        join(profileRoot, 'state', 'evolution', 'artifacts'),
      )).toBe(true)
    } finally {
      await ctx.fiber.dispose()
      rmSync(profileRoot, { recursive: true, force: true })
    }
  })

  it('separates the deployable DSH host from the Profile runtime package', () => {
    const manifest = json(resolve(packageRoot, 'package.json')) as {
      name: string
      files: string[]
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      exports: Record<string, unknown>
      bin: Record<string, string>
      private?: boolean
      version: string
    }
    expect(manifest.name).toBe('@tianwen/runtime-bundle')
    expect(manifest.version).toBe('0.1.0')
    expect(manifest).not.toHaveProperty('private')
    expect(manifest.bin).toEqual({ tianwen: 'dist/cli.js' })
    expect(manifest.dependencies).toEqual({
      '@deepseek-ai/cordis': '4.0.1',
      '@deepseek-ai/dsh-agent': '0.1.1-rc.2',
      '@deepseek-ai/dsh-credentials': '0.1.1-rc.2',
      '@deepseek-ai/dsh-goal': '0.1.1-rc.2',
      '@deepseek-ai/dsh-llm': '0.1.1-rc.2',
      '@deepseek-ai/dsh-session': '0.1.1-rc.2',
      '@deepseek-ai/dsh-session-persistence-jsonl': '0.1.1-rc.2',
      '@deepseek-ai/dsh-skill': '0.1.1-rc.2',
      '@deepseek-ai/dsh-system-prompt': '0.1.1-rc.2',
      '@deepseek-ai/dsh-tools': '0.1.1-rc.2',
    })
    expect(Object.keys(manifest.dependencies)).not.toContainEqual(
      expect.stringMatching(/^@tianwen\//u),
    )
    expect(manifest).not.toHaveProperty('peerDependencies')
    expect(manifest).not.toHaveProperty('peerDependenciesMeta')
    expect(json(resolve(hostPackageRoot, 'package.json'))).toMatchObject({
      name: '@tianwen/dsh-host',
      private: true,
      dependencies: {
        '@deepseek-ai/dsh': '0.1.1-rc.2',
      },
    })
    expect(manifest.devDependencies).toMatchObject({
      '@tianwen/evidence': 'workspace:*',
      '@tianwen/runtime': 'workspace:*',
      esbuild: '0.28.2',
    })
    expect(manifest.exports).toHaveProperty('./runtime')
    expect(manifest.exports).toHaveProperty('./smoke')
    expect(manifest.exports).toHaveProperty('./status')
    expect(manifest.exports).toHaveProperty('./resume-runner')
    expect(manifest.exports).toHaveProperty('./create-runner')
    expect(manifest.exports).toHaveProperty('./model-runner')
    expect(manifest.files).toEqual([
      'dist/index.js',
      'dist/index.d.ts',
      'dist/runtime.js',
      'dist/smoke.js',
      'dist/status.js',
      'dist/status.d.ts',
      'dist/cli.js',
      'dist/model-runner.js',
      'dist/create-runner.js',
      'dist/resume-runner.js',
      'dist/controlled-lifecycle-runner.js',
      'cordis.patch.yml',
      'create.patch.yml',
      'model.patch.yml',
      'resume.patch.yml',
      'controlled-lifecycle.patch.yml',
    ])
  })

  it('leaves Runtime state rooted at the selected Profile', () => {
    const defaultPatch = readFileSync(
      resolve(packageRoot, 'cordis.patch.yml'),
      'utf8',
    ).replaceAll('\r\n', '\n')
    expect(defaultPatch).toBe(`- insert:
    - id: tianwen-runtime
      name: '@tianwen/runtime-bundle/runtime'

    - id: tianwen-web-bridge
      name: '@tianwen/runtime-bundle'
`)
    expect(defaultPatch).not.toMatch(/[A-Za-z]:[\\/]|file:\/\//u)
  })

  it('publishes the one-shot controlled lifecycle runner and patch', () => {
    const manifest = json(resolve(packageRoot, 'package.json')) as {
      exports: Record<string, unknown>
      files: string[]
    }
    expect(manifest.exports['./controlled-lifecycle-runner']).toEqual({
      default: './dist/controlled-lifecycle-runner.js',
    })
    expect(manifest.files).toContain('dist/controlled-lifecycle-runner.js')
    expect(manifest.files).toContain('controlled-lifecycle.patch.yml')
    expect(readFileSync(
      resolve(packageRoot, 'controlled-lifecycle.patch.yml'),
      'utf8',
    ).replaceAll('\r\n', '\n')).toBe(`- id: headless-startup
  disabled: true

- id: headless-runner
  disabled: true

- id: goal-round-driver
  disabled: true

- id: llm-deepseek
  config:
    retryPolicy:
      mode: normal
      maxRetries: 0

- id: session-title-llm
  disabled: true

- insert:
    - id: tianwen-controlled-lifecycle-runner
      name: '@tianwen/runtime-bundle/controlled-lifecycle-runner'
      config:
        manifestPath: !!js process.env.TIANWEN_CONTROLLED_MANIFEST_PATH
        manifestDigest: !!js process.env.TIANWEN_CONTROLLED_MANIFEST_DIGEST
`)
  })

  it('ships one fixed offline smoke entry', async () => {
    const manifest = json(resolve(packageRoot, 'package.json')) as {
      exports: Record<string, unknown>
      files: string[]
      dependencies: Record<string, string>
    }
    expect(manifest.exports).toHaveProperty('./smoke')
    expect(manifest.files).toContain('dist/smoke.js')
    expect(manifest.dependencies).toEqual({
      '@deepseek-ai/cordis': '4.0.1',
      '@deepseek-ai/dsh-agent': '0.1.1-rc.2',
      '@deepseek-ai/dsh-credentials': '0.1.1-rc.2',
      '@deepseek-ai/dsh-goal': '0.1.1-rc.2',
      '@deepseek-ai/dsh-llm': '0.1.1-rc.2',
      '@deepseek-ai/dsh-session': '0.1.1-rc.2',
      '@deepseek-ai/dsh-session-persistence-jsonl': '0.1.1-rc.2',
      '@deepseek-ai/dsh-skill': '0.1.1-rc.2',
      '@deepseek-ai/dsh-system-prompt': '0.1.1-rc.2',
      '@deepseek-ai/dsh-tools': '0.1.1-rc.2',
    })

    const smoke = await import(
      '../../packages/tianwen-runtime-bundle/dist/smoke.js'
    )
    expect(smoke).toMatchObject({
      SMOKE_PROVIDER: 'tianwen-offline',
      SMOKE_MODEL: 'phase2-smoke',
      SMOKE_ACTION: 'tianwen_smoke_action',
      SMOKE_FINAL_TEXT: 'TIANWEN_PHASE2_OK',
      name: 'tianwen-phase2-smoke',
      inject: ['llm', 'tools'],
    })
    expect(smoke.apply).toBeTypeOf('function')
  })

  it('runs exactly one fixed smoke session script', async () => {
    const smoke = await import(
      '../../packages/tianwen-runtime-bundle/dist/smoke.js'
    )
    const adapter = new smoke.Phase2SmokeAdapter()
    const tools = [
      { name: 'create_goal', description: 'Create a goal', parameters: {} },
      { name: 'tianwen_smoke_action', description: 'Run smoke action', parameters: {} },
      { name: 'update_goal', description: 'Update a goal', parameters: {} },
    ]
    const goalResult = JSON.stringify({
      goal: {
        id: 'tianwen-phase2-goal-id',
        revision: 1,
        objective: 'prove the Tianwen phase 2 startup path',
        phase: 'active',
        roundsStarted: 0,
        maxGoalRounds: 1,
      },
      activation: 'armed',
    })
    const requests = [
      {
        provider: 'tianwen-offline',
        model: 'phase2-smoke',
        sessionId: 'tianwen-phase2-session',
        tools,
        messages: [{ role: 'user', source: { kind: 'user' }, content: [] }],
      },
      {
        provider: 'tianwen-offline',
        model: 'phase2-smoke',
        sessionId: 'tianwen-phase2-session',
        tools,
        messages: [{
          role: 'user',
          source: { kind: 'tool', callId: CallId('tianwen-phase2-goal') },
          content: [{
            type: 'tool-result',
            toolCallId: CallId('tianwen-phase2-goal'),
            content: [{ type: 'text', text: goalResult }],
          }],
        }],
      },
      {
        provider: 'tianwen-offline',
        model: 'phase2-smoke',
        sessionId: 'tianwen-phase2-session',
        tools,
        messages: [{
          role: 'user',
          source: { kind: 'tool', callId: CallId('tianwen-phase2-action') },
          content: [{
            type: 'tool-result',
            toolCallId: CallId('tianwen-phase2-action'),
            content: [{ type: 'text', text: 'phase2-smoke-action-ok' }],
          }],
        }],
      },
      {
        provider: 'tianwen-offline',
        model: 'phase2-smoke',
        sessionId: 'tianwen-phase2-session',
        tools,
        messages: [{
          role: 'user',
          source: {
            kind: 'tool',
            callId: CallId('tianwen-phase2-goal-complete'),
          },
          content: [{
            type: 'tool-result',
            toolCallId: CallId('tianwen-phase2-goal-complete'),
            content: [{ type: 'text', text: JSON.stringify({
              goal: {
                id: 'tianwen-phase2-goal-id',
                revision: 2,
                objective: 'prove the Tianwen phase 2 startup path',
                phase: 'complete',
                roundsStarted: 0,
                maxGoalRounds: 1,
              },
              activation: 'disarmed',
            }) }],
          }],
        }],
      },
    ] as GenerateOptions[]
    const malformedCreateResult = {
      ...requests[1],
      messages: [{
        role: 'user',
        source: { kind: 'tool', callId: CallId('tianwen-phase2-goal') },
        content: [{
          type: 'tool-result',
          toolCallId: CallId('tianwen-phase2-goal'),
          content: [{ type: 'text', text: JSON.stringify({
            goal: { id: 'tianwen-phase2-goal-id', revision: 0 },
          }) }],
        }],
      }],
    } as GenerateOptions

    const createGoal = await collect(adapter.stream(requests[0]!))
    expect(createGoal[1]).toMatchObject({
      block: {
        type: 'tool-call',
        id: 'tianwen-phase2-goal',
        name: 'create_goal',
        arguments: JSON.stringify({
          objective: 'prove the Tianwen phase 2 startup path',
          max_goal_rounds: 1,
        }),
      },
    })

    await expect(collect(adapter.stream(malformedCreateResult))).rejects.toThrow(
      'phase 2 smoke expected a valid goal result',
    )

    const action = await collect(adapter.stream(requests[1]!))
    expect(action[1]).toMatchObject({
      block: {
        type: 'tool-call',
        id: 'tianwen-phase2-action',
        name: 'tianwen_smoke_action',
        arguments: '{}',
      },
    })

    const completeGoal = await collect(adapter.stream(requests[2]!))
    expect(completeGoal[1]).toMatchObject({
      block: {
        type: 'tool-call',
        id: 'tianwen-phase2-goal-complete',
        name: 'update_goal',
        arguments: JSON.stringify({
          goal_id: 'tianwen-phase2-goal-id',
          revision: 1,
          action: 'complete',
        }),
      },
    })

    const finished = await collect(adapter.stream(requests[3]!))
    expect(finished[1]).toMatchObject({
      block: { type: 'text', text: 'TIANWEN_PHASE2_OK' },
    })

    await expect(collect(adapter.stream(requests[3]!))).rejects.toThrow(
      'phase 2 smoke script exhausted',
    )
  })

  it('bundles Tianwen code through the exact public DSH runtime seams', () => {
    const source = readFileSync(resolve(packageRoot, 'dist/runtime.js'), 'utf8')
    const metafile = json(resolve(packageRoot, 'dist/runtime.meta.json')) as {
      inputs: Record<string, unknown>
      outputs: Record<string, { imports: { path: string; external?: boolean }[] }>
    }
    const output = Object.entries(metafile.outputs).find(([path]) =>
      path.replaceAll('\\', '/').endsWith('/dist/runtime.js')
      || path.replaceAll('\\', '/').endsWith('dist/runtime.js'))?.[1]
    expect(output).toBeDefined()
    const packageExternals = externalPackages(output!.imports)
    expect(packageExternals).toEqual([
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-agent',
      '@deepseek-ai/dsh-goal',
      '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-session-persistence-jsonl',
      '@deepseek-ai/dsh-skill',
      '@deepseek-ai/dsh-tools',
    ])
    expect(Object.keys(metafile.inputs).filter(input =>
      !isAllowedRuntimeInput(input))).toEqual([])
    expect(Object.keys(metafile.inputs).some(path =>
      /node_modules[\\/]@deepseek-ai/u.test(path))).toBe(false)
    expect(Object.keys(metafile.inputs).some(path =>
      /test-harness|dsh-probe-bundle/u.test(path))).toBe(false)
    expect(source).not.toMatch(/from\s+["']@tianwen\//u)
    expect(source).not.toMatch(/@deepseek-ai\/[^"']+\/src\//u)
    expect(source).not.toContain('@tianwen/dsh-probe-bundle')
  })

  it('bundles the smoke entry with only its two public DSH externals', () => {
    const source = readFileSync(resolve(packageRoot, 'dist/smoke.js'), 'utf8')
    const metafile = json(resolve(packageRoot, 'dist/smoke.meta.json')) as {
      inputs: Record<string, unknown>
      outputs: Record<string, { imports: { path: string; external?: boolean }[] }>
    }
    const output = Object.entries(metafile.outputs).find(([path]) =>
      path.replaceAll('\\', '/').endsWith('/dist/smoke.js')
      || path.replaceAll('\\', '/').endsWith('dist/smoke.js'))?.[1]
    expect(output).toBeDefined()
    const packageExternals = externalPackages(output!.imports)
    expect(packageExternals).toEqual([
      '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-tools',
    ])
    expect(Object.keys(metafile.inputs).filter(input =>
      !isAllowedSmokeInput(input))).toEqual([])
    expect(Object.keys(metafile.inputs)).toHaveLength(1)
    expect(Object.keys(metafile.inputs).some(path =>
      /node_modules[\\/]@deepseek-ai/u.test(path))).toBe(false)
    expect(Object.keys(metafile.inputs).some(path =>
      /scripted-adapter|test-harness|dsh-probe-bundle|native-addon/u.test(path))).toBe(false)
    expect(source).not.toMatch(/from\s+["']@tianwen\//u)
    expect(source).not.toMatch(/@deepseek-ai\/[^"']+\/src\//u)
    expect(source).not.toMatch(/scripted-adapter|test-harness|dsh-probe-bundle|native-addon/u)
  })

  it.each([
    ['status', isAllowedStatusInput],
    ['cli', isAllowedCliInput],
  ] as const)('bundles the %s entry through public DSH roots', (entry, allowed) => {
    const source = readFileSync(resolve(packageRoot, `dist/${entry}.js`), 'utf8')
    const metafile = json(resolve(packageRoot, `dist/${entry}.meta.json`)) as {
      inputs: Record<string, unknown>
      outputs: Record<string, { imports: { path: string; external?: boolean }[] }>
    }
    const output = Object.entries(metafile.outputs).find(([path]) =>
      path.replaceAll('\\', '/').endsWith(`dist/${entry}.js`))?.[1]
    expect(output).toBeDefined()
    expect(externalPackages(output!.imports)).toEqual([
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-goal',
      '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-session-persistence-jsonl',
      '@deepseek-ai/dsh-skill',
    ])
    expect(Object.keys(metafile.inputs).filter(input => !allowed(input)))
      .toEqual([])
    expect(source).not.toMatch(/from\s+["']@tianwen\//u)
    expect(source).not.toMatch(/@deepseek-ai\/[^"']+\/src\//u)
    expect(source).not.toMatch(
      /scripted-adapter|dsh-tool-skill|test-harness|dsh-probe-bundle/u,
    )
  })

  it('bundles the resume runner through its public DSH roots', () => {
    const source = readFileSync(resolve(packageRoot, 'dist/resume-runner.js'), 'utf8')
    const metafile = json(resolve(packageRoot, 'dist/resume-runner.meta.json')) as {
      inputs: Record<string, unknown>
      outputs: Record<string, { imports: { path: string; external?: boolean }[] }>
    }
    const output = Object.entries(metafile.outputs).find(([path]) =>
      path.replaceAll('\\', '/').endsWith('dist/resume-runner.js'))?.[1]
    expect(output).toBeDefined()
    expect(externalPackages(output!.imports)).toEqual([
      '@deepseek-ai/dsh-agent',
      '@deepseek-ai/dsh-credentials',
      '@deepseek-ai/dsh-goal',
      '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-session',
    ])
    expect(Object.keys(metafile.inputs).filter(input =>
      !isAllowedResumeRunnerInput(input))).toEqual([])
    expect(source).not.toMatch(/from\s+["']@tianwen\//u)
    expect(source).not.toMatch(/@deepseek-ai\/[^"']+\/src\//u)
  })

  it('bundles the create runner through its public DSH roots', () => {
    const source = readFileSync(resolve(packageRoot, 'dist/create-runner.js'), 'utf8')
    const metafile = json(resolve(packageRoot, 'dist/create-runner.meta.json')) as {
      inputs: Record<string, unknown>
      outputs: Record<string, { imports: { path: string; external?: boolean }[] }>
    }
    const output = Object.entries(metafile.outputs).find(([path]) =>
      path.replaceAll('\\', '/').endsWith('dist/create-runner.js'))?.[1]
    expect(output).toBeDefined()
    expect(externalPackages(output!.imports)).toEqual([
      '@deepseek-ai/dsh-agent',
      '@deepseek-ai/dsh-session',
    ])
    expect(Object.keys(metafile.inputs).filter(input =>
      !isAllowedCreateRunnerInput(input))).toEqual([])
    expect(source).not.toMatch(/from\s+["']@tianwen\//u)
    expect(source).not.toMatch(/@deepseek-ai\/[^"']+\/src\//u)
  })

  it('bundles the model runner through its public DSH roots', () => {
    const source = readFileSync(resolve(packageRoot, 'dist/model-runner.js'), 'utf8')
    const metafile = json(resolve(packageRoot, 'dist/model-runner.meta.json')) as {
      inputs: Record<string, unknown>
      outputs: Record<string, { imports: { path: string; external?: boolean }[] }>
    }
    const output = Object.entries(metafile.outputs).find(([path]) =>
      path.replaceAll('\\', '/').endsWith('dist/model-runner.js'))?.[1]
    expect(output).toBeDefined()
    expect(externalPackages(output!.imports)).toEqual([
      '@deepseek-ai/dsh-credentials',
      '@deepseek-ai/dsh-llm',
    ])
    expect(Object.keys(metafile.inputs).map(input =>
      posix.normalize(input.replaceAll('\\', '/')))).toEqual(['src/model-runner.ts'])
    expect(source).not.toMatch(/from\s+["']@tianwen\//u)
    expect(source).not.toMatch(/@deepseek-ai\/[^"']+\/src\//u)
  })

  it('bundles the controlled lifecycle runner through exact public DSH roots', () => {
    const source = readFileSync(
      resolve(packageRoot, 'dist/controlled-lifecycle-runner.js'),
      'utf8',
    )
    const metafile = json(resolve(
      packageRoot,
      'dist/controlled-lifecycle-runner.meta.json',
    )) as {
      inputs: Record<string, unknown>
      outputs: Record<string, { imports: { path: string; external?: boolean }[] }>
    }
    const output = Object.entries(metafile.outputs).find(([path]) =>
      path.replaceAll('\\', '/').endsWith('dist/controlled-lifecycle-runner.js'))?.[1]
    expect(output).toBeDefined()
    expect(externalPackages(output!.imports)).toEqual([
      '@deepseek-ai/dsh-agent',
      '@deepseek-ai/dsh-credentials',
      '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-tools',
    ])
    expect(Object.keys(metafile.inputs).filter(input =>
      !isAllowedControlledLifecycleRunnerInput(input))).toEqual([])
    expect(Object.keys(metafile.inputs).some(path =>
      /node_modules[\\/]@deepseek-ai/u.test(path))).toBe(false)
    expect(source).not.toMatch(/from\s+["']@tianwen\//u)
    expect(source).not.toMatch(/@deepseek-ai\/[^"']+\/src\//u)
    expect(source).not.toMatch(
      /ScriptedAdapter|scripted-adapter|agent-loop-testkit|test-harness|dsh-probe-bundle/u,
    )
    expect(containsCredentialLiteral(source)).toBe(false)
  })

  it('packs only the deployable runtime bundle files', () => {
    mkdirSync(packFixtureBase, { recursive: true })
    const packRoot = mkdtempSync(join(packFixtureBase, 'pack-'))
    const archive = resolve(packRoot, 'tianwen-runtime-bundle-0.1.0.tgz')
    const pnpmEntry = resolve(dirname(process.execPath), 'node_modules/corepack/dist/pnpm.js')
    try {
      execFileSync(process.execPath, [
        pnpmEntry,
        'pack',
        '--pack-destination', packRoot,
        '--skip-manifest-obfuscation',
      ], {
        cwd: packageRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          COREPACK_HOME: process.platform === 'win32'
            ? 'D:\\DevData\\corepack-home'
            : process.env.COREPACK_HOME,
          PNPM_CONFIG_STORE_DIR: process.env.PNPM_CONFIG_STORE_DIR,
        },
        shell: false,
      })
      expect(existsSync(archive)).toBe(true)
      const entries = execFileSync(tar, ['-tzf', archive], {
        encoding: 'utf8',
        shell: false,
      })
        .split(/\r?\n/u)
        .filter(Boolean)
        .sort()
      expect(entries).toEqual([
        'package/LICENSE',
        'package/controlled-lifecycle.patch.yml',
        'package/cordis.patch.yml',
        'package/create.patch.yml',
        'package/dist/cli.js',
        'package/dist/controlled-lifecycle-runner.js',
        'package/dist/create-runner.js',
        'package/dist/index.d.ts',
        'package/dist/index.js',
        'package/dist/model-runner.js',
        'package/dist/resume-runner.js',
        'package/dist/runtime.js',
        'package/dist/smoke.js',
        'package/dist/status.d.ts',
        'package/dist/status.js',
        'package/model.patch.yml',
        'package/package.json',
        'package/resume.patch.yml',
      ])
      expect(entries.some(entry => /(^|\/)src\//u.test(entry))).toBe(false)
      expect(entries.some(entry => /(^|\/)node_modules\//u.test(entry))).toBe(false)
      expect(entries).not.toContain('package/dist/runtime.d.ts')
      expect(entries).not.toContain('package/dist/runtime.meta.json')
      expect(entries.some(entry => entry.includes('@tianwen'))).toBe(false)
      expect(entries.some(entry => /scripted-adapter|dsh-probe-bundle/u.test(entry))).toBe(false)
      expect(entries.some(entry => /@deepseek-ai\/[^/]+\/src\//u.test(entry))).toBe(false)
      expect(entries.some(entry => /fixtures\/deepseek-goal-round-fetch|\.map$/u.test(entry))).toBe(false)
      for (const entry of entries.filter(entry => !entry.endsWith('/'))) {
        const archiveText = execFileSync(tar, ['-xOf', archive, entry], {
          encoding: 'utf8',
          shell: false,
        })
        expect(archiveText).not.toContain(root)
        expect(archiveText).not.toContain(root.replaceAll('\\', '/'))
        expect(archiveText).not.toMatch(/C:[\\/]Users[\\/]|fixtures[\\/]deepseek-goal-round-fetch|@deepseek-ai[\\/][^\\/]+[\\/]src[\\/]/u)
        expect(containsCredentialLiteral(archiveText)).toBe(false)
        expect(archiveText).not.toMatch(/\bsk-[A-Za-z0-9_-]{16,}\b|\bBearer\s+[A-Za-z0-9._~+\/=-]{16,}\b|x-api-key\s*[:=]\s*['"`]?\S{16,}/iu)
      }
    } finally {
      rmSync(packRoot, { recursive: true, force: true })
    }
  })
})
