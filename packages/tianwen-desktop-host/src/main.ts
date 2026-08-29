import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'node:path'
import {
  DESKTOP_TARGET_FILE_NAME,
  createDesktopBootstrapInteractions,
  desktopTargetArguments,
  resolveDesktopBootstrapTarget,
} from './bootstrap.js'
import {
  DESKTOP_WINDOW_OPTIONS,
  createDesktopShutdownCoordinator,
  desktopNavigationAllowed,
  resolveDesktopBaseTarget,
  startDesktopWebHost,
} from './host.js'
import { chromiumLocale, desktopCopy, desktopLocale } from './locale.js'
import { resolvePreparedDesktopTarget } from './profile-prepare.js'

const locale = desktopLocale()
const copy = desktopCopy(locale)
app.commandLine.appendSwitch('lang', chromiumLocale(locale))

async function start(): Promise<void> {
  await app.whenReady()
  const base = await resolveDesktopBootstrapTarget(
    desktopTargetArguments(process.argv, app.isPackaged),
    join(app.getPath('userData'), DESKTOP_TARGET_FILE_NAME),
    {
      ...createDesktopBootstrapInteractions(dialog, locale),
      validateTarget: resolveDesktopBaseTarget,
    },
  )
  if (base === undefined) {
    app.exit(0)
    return
  }
  const target = await resolvePreparedDesktopTarget(
    base,
    join(process.resourcesPath, 'runtime', 'tianwen-runtime-bundle-0.1.0.tgz'),
    {
      async confirmCreateProfile(profileRoot) {
        const result = await dialog.showMessageBox({
          type: 'warning',
          message: copy.createProfileTitle,
          detail: `${copy.createProfileInstruction}\n${profileRoot}`,
          buttons: [copy.createProfileAction, copy.cancel],
          defaultId: 0,
          cancelId: 1,
        })
        return result.response === 0
      },
      async showManualPreparation(reason, command) {
        await dialog.showMessageBox({
          type: 'info',
          message: copy.manualPreparationTitle,
          detail: `${reason}\n\n${copy.manualPreparationInstruction}\n${command}`,
          buttons: [copy.ok],
        })
      },
    },
  )
  if (target === undefined) {
    app.exit(0)
    return
  }
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
  void start().catch(async error => {
    const reason = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Tianwen Desktop failed to start: ${reason}\n`)
    try {
      if (app.isReady()) await dialog.showMessageBox({
        type: 'error',
        message: copy.fatalStartupTitle,
        detail: reason,
        buttons: [copy.ok],
      })
    } finally {
      app.exit(1)
    }
  })
} else {
  app.exit(0)
}
