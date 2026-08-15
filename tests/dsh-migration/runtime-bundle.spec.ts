import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, posix, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  Context,
  DynamicCordisRunnerService,
  SystemPrompt,
  ToolRuntime,
} from '@tianwen/dsh-compat'
import { default as TimerService } from '@deepseek-ai/cordis-plugin-timer'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { apply as applyBundledRuntime } from '../../packages/tianwen-runtime-bundle/dist/runtime.js'

const root = resolve(import.meta.dirname, '../..')
const packageRoot = resolve(root, 'packages/tianwen-runtime-bundle')
const packRoot = 'D:/DevData/tianwen/packs'
const archive = resolve(packRoot, 'tianwen-runtime-bundle-0.0.0.tgz')
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

function isAllowedRuntimeInput(input: string): boolean {
  const path = posix.normalize(input.replaceAll('\\', '/'))
  return path === 'src/runtime.ts'
    || path === '../tianwen-dsh-compat/dist/runtime.js'
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
}

function isAllowedCliInput(input: string): boolean {
  const path = posix.normalize(input.replaceAll('\\', '/'))
  return path === 'src/cli.ts' || isAllowedStatusInput(path)
}

describe('runtime metafile input allowlist', () => {
  it.each([
    '../unrelated-workspace/dist/index.js',
    'node_modules/zod/index.js',
    '../native-addon/build/Release/addon.node',
    '../test/helper.js',
  ])('rejects %s', input => {
    expect(isAllowedRuntimeInput(input)).toBe(false)
  })
})

describe('@tianwen/runtime-bundle', () => {
  it('executes the built runtime and mounts evidence and evolution', async () => {
    const base = 'D:/DevData/tianwen-runtime-bundle-tests/evolution'
    mkdirSync(base, { recursive: true })
    const evolutionRoot = mkdtempSync(join(base, 'composition-'))
    const ctx = new Context()
    try {
      await ctx.plugin(TimerService)
      await ctx.plugin(SystemPrompt, {})
      await ctx.plugin(ToolRuntime, {})
      await ctx.plugin(DynamicCordisRunnerService, {})
      await applyBundledRuntime(ctx, { evolutionRoot })
      expect(ctx.tianwenEvidence).toBeDefined()
      expect(ctx.tianwenEvolution).toBeDefined()
    } finally {
      await ctx.fiber.dispose()
      rmSync(evolutionRoot, { recursive: true, force: true })
    }
  })

  it('declares one deployable product package and no Tianwen runtime dependency', () => {
    const manifest = json(resolve(packageRoot, 'package.json')) as {
      name: string
      files: string[]
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      exports: Record<string, unknown>
      bin: Record<string, string>
    }
    expect(manifest.name).toBe('@tianwen/runtime-bundle')
    expect(manifest.bin).toEqual({ tianwen: 'dist/cli.js' })
    expect(manifest.dependencies).toEqual({
      '@deepseek-ai/cordis': '4.0.1',
      '@deepseek-ai/dsh-goal': '0.1.0-rc.6',
      '@deepseek-ai/dsh-llm': '0.1.0-rc.6',
      '@deepseek-ai/dsh-session': '0.1.0-rc.6',
      '@deepseek-ai/dsh-session-persistence-jsonl': '0.1.0-rc.6',
      '@deepseek-ai/dsh-tools': '0.1.0-rc.6',
    })
    expect(Object.keys(manifest.dependencies)).not.toContainEqual(
      expect.stringMatching(/^@tianwen\//u),
    )
    expect(manifest.devDependencies).toMatchObject({
      '@tianwen/evidence': 'workspace:*',
      '@tianwen/runtime': 'workspace:*',
      esbuild: '0.28.2',
    })
    expect(manifest.exports).toHaveProperty('./runtime')
    expect(manifest.exports).toHaveProperty('./smoke')
    expect(manifest.exports).toHaveProperty('./status')
    expect(manifest.files).toEqual([
      'dist/index.js',
      'dist/index.d.ts',
      'dist/runtime.js',
      'dist/smoke.js',
      'dist/status.js',
      'dist/status.d.ts',
      'dist/cli.js',
      'cordis.patch.yml',
    ])
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
      '@deepseek-ai/dsh-goal': '0.1.0-rc.6',
      '@deepseek-ai/dsh-llm': '0.1.0-rc.6',
      '@deepseek-ai/dsh-session': '0.1.0-rc.6',
      '@deepseek-ai/dsh-session-persistence-jsonl': '0.1.0-rc.6',
      '@deepseek-ai/dsh-tools': '0.1.0-rc.6',
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

  it('bundles Tianwen code and leaves only Cordis as a package external', () => {
    const source = readFileSync(resolve(packageRoot, 'dist/runtime.js'), 'utf8')
    const metafile = json(resolve(packageRoot, 'dist/runtime.meta.json')) as {
      inputs: Record<string, unknown>
      outputs: Record<string, { imports: { path: string; external?: boolean }[] }>
    }
    const output = Object.entries(metafile.outputs).find(([path]) =>
      path.replaceAll('\\', '/').endsWith('/dist/runtime.js')
      || path.replaceAll('\\', '/').endsWith('dist/runtime.js'))?.[1]
    expect(output).toBeDefined()
    const packageExternals = output!.imports
      .filter(item => item.external === true && !item.path.startsWith('node:'))
      .map(item => item.path)
      .sort()
    expect(packageExternals).toEqual(['@deepseek-ai/cordis'])
    expect(Object.keys(metafile.inputs).filter(input =>
      !isAllowedRuntimeInput(input))).toEqual([])
    expect(Object.keys(metafile.inputs).some(path =>
      /node_modules[\\/]@deepseek-ai/u.test(path))).toBe(false)
    expect(Object.keys(metafile.inputs).some(path =>
      /scripted-adapter|test-harness|dsh-probe-bundle/u.test(path))).toBe(false)
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
    const packageExternals = output!.imports
      .filter(item => item.external === true && !item.path.startsWith('node:'))
      .map(item => item.path)
      .sort()
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
    expect(output!.imports
      .filter(item => item.external === true && !item.path.startsWith('node:'))
      .map(item => item.path)
      .sort()).toEqual([
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-goal',
      '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-session-persistence-jsonl',
    ])
    expect(Object.keys(metafile.inputs).filter(input => !allowed(input)))
      .toEqual([])
    expect(source).not.toMatch(/from\s+["']@tianwen\//u)
    expect(source).not.toMatch(/@deepseek-ai\/[^"']+\/src\//u)
    expect(source).not.toMatch(/scripted-adapter|test-harness|dsh-probe-bundle/u)
  })

  it('packs only the deployable runtime bundle files', () => {
    expect(existsSync(archive)).toBe(true)
    const entries = execFileSync(tar, ['-tzf', archive], {
      encoding: 'utf8',
      shell: false,
    })
      .split(/\r?\n/u)
      .filter(Boolean)
      .sort()
    expect(entries).toEqual([
      'package/cordis.patch.yml',
      'package/dist/cli.js',
      'package/dist/index.d.ts',
      'package/dist/index.js',
      'package/dist/runtime.js',
      'package/dist/smoke.js',
      'package/dist/status.d.ts',
      'package/dist/status.js',
      'package/package.json',
    ])
    expect(entries.some(entry => /(^|\/)src\//u.test(entry))).toBe(false)
    expect(entries.some(entry => /(^|\/)node_modules\//u.test(entry))).toBe(false)
    expect(entries).not.toContain('package/dist/runtime.d.ts')
    expect(entries).not.toContain('package/dist/runtime.meta.json')
    expect(entries.some(entry => entry.includes('@tianwen'))).toBe(false)
    expect(entries.some(entry => /scripted-adapter|dsh-probe-bundle/u.test(entry))).toBe(false)
    expect(entries.some(entry => /@deepseek-ai\/[^/]+\/src\//u.test(entry))).toBe(false)
  })
})
