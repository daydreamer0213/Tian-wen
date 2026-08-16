import { randomUUID } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'
import type { StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'

import { apply, runModelSmoke } from '../../packages/tianwen-runtime-bundle/src/model-runner.js'

const MARKER = 'TIANWEN_SMOKE_OK'
const usage = {
  inputTokens: 20,
  outputTokens: 8,
  cacheReadTokens: 5,
} satisfies TokenUsage

function successfulStream(streamUsage = usage): StreamChunk[] {
  return [
    { type: 'text-delta', index: 0, text: MARKER },
    { type: 'usage', usage: streamUsage },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function context(options: {
  readonly configured?: boolean
  readonly credentialSentinel?: string
  readonly selection?: { readonly provider: string, readonly model: string }
  readonly stream?: readonly StreamChunk[]
  readonly streamError?: Error
}) {
  const agentDefaultModel = {
    currentSelection: vi.fn(() => options.selection ?? {
      provider: 'deepseek-official', model: 'deepseek-v4-pro',
    }),
  }
  const credentials = {
    describe: vi.fn(async () => ({
      configured: options.configured ?? true,
      writable: false,
      ...options.credentialSentinel === undefined ? {} : { credentialSentinel: options.credentialSentinel },
    })),
  }
  const llm = {
    stream: vi.fn(async function* (_options: { readonly signal?: AbortSignal }) {
      if (options.streamError !== undefined) throw options.streamError
      yield* options.stream ?? successfulStream()
    }),
  }
  return {
    agentDefaultModel,
    credentials,
    llm,
    get: (service: string) => ({ agentDefaultModel, credentials, llm })[service],
  }
}

function expectSanitized(receipt: unknown, credentialSentinel: string, providerSentinel: string): void {
  const serialized = JSON.stringify(receipt)
  expect(serialized).not.toContain(credentialSentinel)
  expect(serialized).not.toContain(providerSentinel)
}

describe('DeepSeek V4 Pro live smoke contract', () => {
  it('sends one bounded DeepSeek request and returns a sanitized marker receipt', async () => {
    const credentialSentinel = randomUUID()
    const services = context({ credentialSentinel })

    const receipt = await runModelSmoke(services as never)

    expect(services.llm.stream).toHaveBeenCalledTimes(1)
    expect(services.llm.stream).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'off',
      maxTokens: 64,
      tools: undefined,
      system: undefined,
      messages: [expect.objectContaining({
        role: 'user',
        source: { kind: 'user' },
        content: [{ type: 'text', text: 'Reply with exactly TIANWEN_SMOKE_OK and nothing else.' }],
      })],
    }))
    expect(receipt).toMatchObject({
      schemaVersion: 'tianwen.model-smoke.v1',
      status: 'passed',
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      requestCount: 1,
      markerMatched: true,
      limits: { maxOutputTokens: 64, maxTotalTokens: 512, maxCostCny: 0.01, timeoutMs: 90000 },
      usage: { totalTokens: 33, estimatedCostCny: 0.000108125 },
    })
    expect(JSON.stringify(receipt)).not.toContain(MARKER)
    expectSanitized(receipt, credentialSentinel, randomUUID())
  })

  it.each([
    ['selection-mismatch', { selection: { provider: 'tianwen-offline', model: 'phase2-smoke' } }, 0],
    ['credential-missing', { configured: false }, 0],
    ['missing-usage', { stream: successfulStream().filter(chunk => chunk.type !== 'usage') }, 1],
    ['duplicate-usage', { stream: [
      { type: 'text-delta', index: 0, text: MARKER },
      { type: 'usage', usage },
      { type: 'usage', usage },
      { type: 'finish', reason: { kind: 'stop' } },
    ] }, 1],
    ['missing-finish', { stream: successfulStream().filter(chunk => chunk.type !== 'finish') }, 1],
    ['duplicate-finish', { stream: [...successfulStream(), { type: 'finish', reason: { kind: 'stop' } }] }, 1],
    ['unexpected-tool-call', {
      stream: [{ type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call' as never, name: 'tool', arguments: '{}' } }],
    }, 1],
    ['unexpected-reasoning', { stream: [{ type: 'reasoning-delta', index: 0, text: 'hidden' }] }, 1],
    ['unexpected-response', { stream: successfulStream().map(chunk =>
      chunk.type === 'text-delta' ? { ...chunk, text: 'not the marker' } : chunk) }, 1],
    ['token-budget-exceeded', { stream: successfulStream({ inputTokens: 449, outputTokens: 64 }) }, 1],
    ['provider-error', {
      stream: [{ type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: 'secret-sentinel' } } }],
    }, 1],
  ] as const)('%s returns a stable failure receipt without another request', async (
    failureCode,
    fixture,
    expectedCalls,
  ) => {
    const credentialSentinel = randomUUID()
    const providerSentinel = failureCode === 'provider-error' ? 'secret-sentinel' : randomUUID()
    const services = context({ ...fixture, credentialSentinel })

    const receipt = await runModelSmoke(services as never)

    expect(receipt).toMatchObject({
      schemaVersion: 'tianwen.model-smoke.v1',
      status: 'failed',
      failureCode,
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      requestCount: expectedCalls,
    })
    expect(services.llm.stream).toHaveBeenCalledTimes(expectedCalls)
    expectSanitized(receipt, credentialSentinel, providerSentinel)
  })

  it('returns timeout after one request when the supplied signal is already aborted', async () => {
    const credentialSentinel = randomUUID()
    const controller = new AbortController()
    controller.abort()
    const services = context({ credentialSentinel })

    const receipt = await runModelSmoke(services as never, controller.signal)

    expect(receipt).toMatchObject({ status: 'failed', failureCode: 'timeout', requestCount: 1 })
    expect(services.llm.stream).toHaveBeenCalledTimes(1)
    expectSanitized(receipt, credentialSentinel, randomUUID())
  })

  it('converts a thrown stream failure to provider-error without exposing it', async () => {
    const credentialSentinel = randomUUID()
    const providerSentinel = randomUUID()
    const services = context({ credentialSentinel, streamError: new Error(providerSentinel) })

    const receipt = await runModelSmoke(services as never)

    expect(receipt).toMatchObject({ status: 'failed', failureCode: 'provider-error', requestCount: 1 })
    expect(services.llm.stream).toHaveBeenCalledTimes(1)
    expectSanitized(receipt, credentialSentinel, providerSentinel)
  })

  it('converts a synchronous stream failure to provider-error without exposing it', async () => {
    const credentialSentinel = randomUUID()
    const providerSentinel = randomUUID()
    const services = context({ credentialSentinel })
    services.llm.stream.mockImplementation(() => {
      throw new Error(providerSentinel)
    })

    const receipt = await runModelSmoke(services as never)

    expect(receipt).toMatchObject({ status: 'failed', failureCode: 'provider-error', requestCount: 1 })
    expect(services.llm.stream).toHaveBeenCalledTimes(1)
    expectSanitized(receipt, credentialSentinel, providerSentinel)
  })

  it.each([
    ['missing inputTokens', { outputTokens: 8 }],
    ['missing outputTokens', { inputTokens: 20 }],
    ['unsafe inputTokens', { inputTokens: Number.MAX_SAFE_INTEGER + 1, outputTokens: 8 }],
    ['unsafe outputTokens', { inputTokens: 20, outputTokens: Number.MAX_SAFE_INTEGER + 1 }],
  ] as const)('fails closed for %s', async (_label, invalidUsage) => {
    const services = context({ stream: successfulStream(invalidUsage as TokenUsage) })

    const receipt = await runModelSmoke(services as never)

    expect(receipt).toMatchObject({ status: 'failed', failureCode: 'provider-error', requestCount: 1 })
    expect(services.llm.stream).toHaveBeenCalledTimes(1)
  })

  it('aborts a stalled stream at the deadline after one request', async () => {
    const services = context({})
    services.llm.stream.mockImplementation(options => ({
      async *[Symbol.asyncIterator]() {
        await new Promise<void>(resolve => options.signal?.addEventListener('abort', resolve, { once: true }))
      },
    }))
    let expire: (() => void) | undefined
    const timer = {
      setTimeout: vi.fn((callback: () => void) => {
        expire = callback
        return 0 as never
      }),
      clearTimeout: vi.fn(),
    }
    const smokeWithTimer = runModelSmoke as unknown as (
      ctx: never,
      signal?: AbortSignal,
      now?: () => number,
      timer?: typeof timer,
    ) => Promise<unknown>

    const pending = smokeWithTimer(services as never, undefined, Date.now, timer)

    await vi.waitFor(() => expect(services.llm.stream).toHaveBeenCalledTimes(1))
    expect(timer.setTimeout).toHaveBeenCalledWith(expect.any(Function), 90000)
    expire!()
    await expect(pending).resolves.toMatchObject({
      status: 'failed', failureCode: 'timeout', requestCount: 1,
    })
    expect(services.llm.stream).toHaveBeenCalledTimes(1)
    expect(timer.clearTimeout).toHaveBeenCalledTimes(1)
  })

  it('waits for DSH, writes one sanitized JSON line, and maps smoke status to appExit', async () => {
    const services = context({})
    const exit = vi.fn()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const loader = { await: vi.fn(async () => undefined) }
    const runnerContext = {
      get: (service: string) => service === 'appExit'
        ? exit
        : service === 'loader'
          ? loader
          : services.get(service),
    }

    apply(runnerContext as never, { operation: 'smoke', model: 'deepseek-v4-pro', json: true })

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
    expect(loader.await).toHaveBeenCalledTimes(1)
    expect(stdout).toHaveBeenCalledTimes(1)
    const output = String(stdout.mock.calls[0]?.[0])
    expect(JSON.parse(output)).toMatchObject({ status: 'passed', markerMatched: true })
    expect(output).not.toContain(MARKER)

    const failedServices = context({
      selection: { provider: 'tianwen-offline', model: 'phase2-smoke' },
    })
    const failedExit = vi.fn()
    stdout.mockClear()
    apply({
      get: (service: string) => service === 'appExit' ? failedExit : failedServices.get(service),
    } as never, { operation: 'smoke', model: 'deepseek-v4-pro', json: false })

    await vi.waitFor(() => expect(failedExit).toHaveBeenCalledWith(1))
    expect(stdout).toHaveBeenCalledTimes(1)
    expect(String(stdout.mock.calls[0]?.[0])).toMatch(/^\{"schemaVersion":"tianwen\.model-smoke\.v1"/u)
  })

  it('keeps the maximum theoretical accepted cost within the fixed ceiling', () => {
    expect((512 * 6) / 1_000_000).toBeLessThanOrEqual(0.01)
  })
})
