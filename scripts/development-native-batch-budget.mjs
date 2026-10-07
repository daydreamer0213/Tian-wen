/** Own the whole original CLI lifetime, including automatically restored work.
 * Install before loading the DEV runtime. Do not clear this in a stage finally.
 * appExit uses original runtime disposal; it is not a Windows process signal.
 */
export function installDevelopmentNativeBatchBudget(ctx, { controller, timeoutMs, onExpired, onExitError }) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw new TypeError('invalid native batch timeout')
  const exit = ctx.get('appExit')
  if (typeof exit !== 'function') throw new TypeError('original appExit is unavailable')
  const timer = setTimeout(() => {
    const reason = new Error('Original whole-runtime batch budget ended')
    controller.abort(reason)
    // Evidence I/O failure must not disable original runtime shutdown.
    const report = error => { try { onExitError?.(error) } catch { /* Reporting cannot prevent shutdown. */ } }
    try { onExpired?.(reason) }
    catch (error) { report(error) }
    finally { Promise.resolve().then(() => exit(1)).catch(report) }
  }, timeoutMs)
  ctx.effect(() => () => clearTimeout(timer), 'operator-native-whole-runtime-budget')
}
