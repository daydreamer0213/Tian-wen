import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'node:path'
import {
  DESKTOP_TARGET_FILE_NAME,
  createDesktopBootstrapInteractions,
  resolveDesktopBootstrapTarget,
} from './bootstrap.js'
import {
  DESKTOP_WINDOW_OPTIONS,
  createDesktopShutdownCoordinator,
  desktopNavigationAllowed,
  resolveDesktopBaseTarget,
  resolveDesktopTarget,
  startDesktopWebHost,
} from './host.js'

async function start(): Promise<void> {
  await app.whenReady()
  const base = await resolveDesktopBootstrapTarget(
    process.argv.slice(2),
    join(app.getPath('userData'), DESKTOP_TARGET_FILE_NAME),
    {
      ...createDesktopBootstrapInteractions(dialog),
      validateTarget: resolveDesktopBaseTarget,
    },
  )
  if (base === undefined) {
    app.exit(0)
    return
  }
  const target = resolveDesktopTarget(base)
  const host = await startDesktopWebHost(target)
  const shutdown = createDesktopShutdownCoordinator({
    stop: () => host.stop(),
    exit: code => app.exit(code),
    report: message => process.stderr.write(`${message}\n`),
  })
  const stop = (event?: Electron.Event): Promise<void> => {
    event?.preventDefault()
    return shutdown()
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
