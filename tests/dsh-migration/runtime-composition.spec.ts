import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Context,
  DSH_VERSION,
  DynamicCordisRunnerService,
  SystemPrompt,
  ToolRuntime,
} from '@tianwen/dsh-compat'
import { default as TimerService } from '@deepseek-ai/cordis-plugin-timer'
import {
  apply,
  SUPPORTED_DSH_VERSION,
} from '../../packages/tianwen-runtime/src/index.js'

const roots: string[] = []

function stateRoot(): string {
  const base = process.platform === 'win32'
    ? 'D:/DevData/tianwen-dsh-migration-phase-1/evolution'
    : resolve('tmp/tianwen-dsh-migration-phase-1/evolution')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'composition-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('@tianwen/runtime', () => {
  it('mounts only Tianwen evidence and evolution on the existing DSH context', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})
    await ctx.plugin(DynamicCordisRunnerService, {})

    try {
      expect(SUPPORTED_DSH_VERSION).toBe('0.1.0-rc.7')
      expect(DSH_VERSION).toBe(SUPPORTED_DSH_VERSION)
      await apply(ctx, { evolutionRoot: stateRoot() })
      expect(ctx.tianwenEvidence).toBeDefined()
      expect(ctx.tianwenEvolution).toBeDefined()
      expect('goals' in ctx).toBe(false)
      expect('agents' in ctx).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects a non-absolute evolution root before mounting services', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})
    await ctx.plugin(DynamicCordisRunnerService, {})
    try {
      await expect(apply(ctx, { evolutionRoot: 'relative/evolution' }))
        .rejects.toThrow(/evolutionRoot.*absolute/)
      expect('tianwenEvidence' in ctx).toBe(false)
      expect('tianwenEvolution' in ctx).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
