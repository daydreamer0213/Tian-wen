import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Context,
  DSH_VERSION,
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
  it('uses an explicit absolute Evolution root instead of the Profile default', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})

    try {
      const profileRoot = stateRoot()
      const evolutionRoot = stateRoot()
      ctx.baseUrl = pathToFileURL(profileRoot).href
      expect(SUPPORTED_DSH_VERSION).toBe('0.1.1-rc.2')
      expect(DSH_VERSION).toBe(SUPPORTED_DSH_VERSION)
      await apply(ctx, { evolutionRoot })
      expect(ctx.tianwenEvidence).toBeDefined()
      expect(ctx.tianwenEvolution).toBeDefined()
      expect('dynamicCordisRunner' in ctx).toBe(false)
      expect('goals' in ctx).toBe(false)
      expect('agents' in ctx).toBe(false)
      expect(existsSync(join(evolutionRoot, 'artifacts'))).toBe(true)
      expect(existsSync(join(profileRoot, 'state', 'evolution'))).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('defaults Evolution state below the exact Profile-anchored base URL', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})

    try {
      const profileRoot = stateRoot()
      ctx.baseUrl = pathToFileURL(profileRoot).href
      await apply(ctx)
      expect(existsSync(
        join(profileRoot, 'state', 'evolution', 'artifacts'),
      )).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects a non-absolute evolution root before mounting services', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})
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
