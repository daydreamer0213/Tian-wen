import { app, BrowserWindow } from 'electron'
import {
  DESKTOP_WINDOW_OPTIONS,
  desktopNavigationAllowed,
  parseDesktopArgs,
  resolveDesktopTarget,
  startDesktopWebHost,
} from './host.js'

async function start(): Promise<void> {
  const input = parseDesktopArgs(process.argv.slice(2))
  const target = resolveDesktopTarget(input)
  await app.whenReady()
  const host = await startDesktopWebHost(target)
  let stopping = false
  const stop = async (event?: Electron.Event): Promise<void> => {
    event?.preventDefault()
    if (stopping) return
    stopping = true
    await host.stop()
    app.exit(0)
  }
  try {
    const window = new BrowserWindow(DESKTOP_WINDOW_OPTIONS)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => {
      if (!desktopNavigationAllowed(url, host.url)) event.preventDefault()
    })
    window.webContents.once('did-finish-load', () => {
      process.stdout.write(`Tianwen Desktop ready at ${host.url.href}\n`)
      if (process.env.TIANWEN_DESKTOP_E2E_EXIT_AFTER_LOAD === '1') window.close()
    })
    app.on('window-all-closed', () => { void stop() })
    app.on('before-quit', event => { void stop(event) })
    process.stdout.write(`Tianwen Desktop owns DSH PID ${host.pid}\n`)
    await window.loadURL(host.url.href)
  } catch (error) {
    await host.stop()
    throw error
  }
}

if (app.requestSingleInstanceLock()) {
  void start().catch(error => {
    process.stderr.write(`Tianwen Desktop failed to start: ${error instanceof Error ? error.message : String(error)}\n`)
    app.exit(1)
  })
} else {
  app.exit(0)
}
