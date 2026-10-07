import { afterEach, expect, it, vi } from 'vitest'
import { installDevelopmentNativeBatchBudget } from '../../scripts/development-native-batch-budget.mjs'

afterEach(() => vi.useRealTimers())
function harness() {
  vi.useFakeTimers()
  const exit = vi.fn(async () => {}), controller = new AbortController(), disposers: (() => void)[] = []
  const ctx = { get: (name: string) => name === 'appExit' ? exit : undefined,
    effect: (setup: () => () => void) => disposers.push(setup()) }
  return { exit, controller, ctx, disposers }
}
it('exits the whole original runtime even after a foreground failure leaves background work pending', async () => {
  const h = harness(), expired = vi.fn()
  installDevelopmentNativeBatchBudget(h.ctx, { controller: h.controller, timeoutMs: 100, onExpired: expired })
  // Stage failure does not own or clear the whole-runtime timer.
  await Promise.reject(new Error('root already live')).catch(() => {})
  await vi.advanceTimersByTimeAsync(100)
  expect(h.controller.signal.aborted).toBe(true); expect(expired).toHaveBeenCalledTimes(1)
  expect(h.exit).toHaveBeenCalledExactlyOnceWith(1)
})
it('clears the budget when the original owner actually disposes', async () => {
  const h = harness()
  installDevelopmentNativeBatchBudget(h.ctx, { controller: h.controller, timeoutMs: 100 })
  h.disposers[0]!(); await vi.advanceTimersByTimeAsync(100)
  expect(h.exit).not.toHaveBeenCalled(); expect(h.controller.signal.aborted).toBe(false)
})
it('reports original exit errors without using force termination', async () => {
  const h = harness(), error = new Error('original exit unavailable'), failed = vi.fn()
  h.exit.mockRejectedValue(error)
  installDevelopmentNativeBatchBudget(h.ctx, { controller: h.controller, timeoutMs: 100, onExitError: failed })
  await vi.advanceTimersByTimeAsync(100)
  expect(failed).toHaveBeenCalledExactlyOnceWith(error)
})
it('still requests original exit if writing the timeout receipt fails', async () => {
  const h = harness(), error = new Error('receipt write failed'), failed = vi.fn()
  installDevelopmentNativeBatchBudget(h.ctx, { controller: h.controller, timeoutMs: 100,
    onExpired: () => { throw error }, onExitError: failed })
  await vi.advanceTimersByTimeAsync(100)
  expect(h.exit).toHaveBeenCalledExactlyOnceWith(1); expect(failed).toHaveBeenCalledExactlyOnceWith(error)
})
it.each([0, -1, 1.5, Infinity, 2147483648])('rejects invalid budget %s before registering a timer', timeoutMs => {
  const h = harness()
  expect(() => installDevelopmentNativeBatchBudget(h.ctx, { controller: h.controller, timeoutMs })).toThrow(/timeout/)
  expect(vi.getTimerCount()).toBe(0)
})
