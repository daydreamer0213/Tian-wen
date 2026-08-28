# Tianwen Desktop Host Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open an existing Tianwen-enabled DSH `web` Profile in one real Electron window while keeping DSH as the only Agent Runtime and owning the launched Web process lifecycle.

**Architecture:** A new private `@tianwen/desktop-host` package contains a Node-only DSH Web child controller and a minimal Electron main process. The controller validates an existing exact rc.2 DSH root and `web` Profile, launches that DSH entry under an explicit external Node 22 executable, accepts only its loopback ready URL, and shuts down the owned process tree. Electron only displays the ready page.

**Tech Stack:** TypeScript 6, Node.js 22, Electron 43.4.0, Vitest 4, pnpm 11.20.0, Windows `taskkill` fallback.

## Global Constraints

- Exact DSH is `@deepseek-ai/dsh@0.1.1-rc.2`; exact Runtime is `@tianwen/runtime-bundle@0.1.0`.
- The shell must not depend on, copy, install, deploy, or package any `@deepseek-ai/*` module.
- Only the existing DSH standard `web` Profile is supported in this proof.
- DSH runs under an explicit external Node `22.x`; Electron's embedded Node does not execute DSH.
- Electron download/cache paths must be under `D:\DevData`.
- No Profile picker, installer, updater, signing, tray, terminal, custom renderer, Provider request, natural task, or publication.
- The one real Windows proof uses a fresh D-drive home and the existing Runtime tarball exactly once.

---

### Task 1: Node-only Desktop Web host contract

**Files:**
- Create: `packages/tianwen-desktop-host/package.json`
- Create: `packages/tianwen-desktop-host/tsconfig.json`
- Create: `packages/tianwen-desktop-host/src/host.ts`
- Create: `tests/dsh-migration/tianwen-desktop-host.spec.ts`

**Interfaces:**
- Consumes: absolute Node executable, exact DSH package root, and existing DSH home.
- Produces: `resolveDesktopTarget(input): DesktopTarget`, `parseDesktopArgs(argv): DesktopTargetInput`, and `startDesktopWebHost(target, dependencies?): Promise<DesktopWebHost>`.

- [ ] **Step 1: Add the private package boundary**

Create `packages/tianwen-desktop-host/package.json` without any DSH dependency:

```json
{
  "name": "@tianwen/desktop-host",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/main.js",
  "exports": {
    "./host": {
      "types": "./dist/host.d.ts",
      "default": "./dist/host.js"
    }
  },
  "scripts": {
    "build": "tsc -b --pretty false",
    "typecheck": "tsc -b --pretty false"
  }
}
```

Create `tsconfig.json` extending `../../tsconfig.base.json`, with `rootDir=src`, `outDir=dist`, and `tsBuildInfoFile=dist/.tsbuildinfo`.

- [ ] **Step 2: Write failing target-validation tests**

Build temporary exact manifests under a D-drive test fixture and assert:

```ts
expect(resolveDesktopTarget({ nodeExecutable, dshRoot, dshHome })).toMatchObject({
  nodeExecutable: realpathSync(nodeExecutable),
  dshBin: realpathSync(join(dshRoot, 'lib/bin.js')),
  dshHome: realpathSync(dshHome),
  profileRoot: realpathSync(join(dshHome, 'profiles/web')),
})
```

Add one table that rejects: relative paths, a Node executable that does not report `v22.x`, wrong
DSH version, any `bin.dsh` other than the exact rc.2 `lib/bin.js`, escaping `bin.dsh`, missing `web`
Profile, missing/duplicate Runtime bundle declaration, wrong Runtime version, and a Runtime directory
outside the Profile.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-desktop-host.spec.ts
```

Expected: failure because `../../packages/tianwen-desktop-host/src/host.js` does not exist.

- [ ] **Step 4: Implement the minimum target and argument validation**

`host.ts` must define:

```ts
export interface DesktopTargetInput {
  readonly nodeExecutable: string
  readonly dshRoot: string
  readonly dshHome: string
}

export interface DesktopTarget extends DesktopTargetInput {
  readonly dshBin: string
  readonly profileRoot: string
}

export function parseDesktopArgs(argv: readonly string[]): DesktopTargetInput
export function resolveDesktopTarget(input: DesktopTargetInput): DesktopTarget
```

`parseDesktopArgs` accepts exactly one value for each of `--node`, `--dsh-root`, and `--dsh-home`,
with no positionals or aliases. `resolveDesktopTarget` uses `execFileSync(nodeExecutable,
['--version'])`, `realpathSync`/`statSync`, exact manifests, and `relative` containment checks. It
requires the executable to report `v22.x`, requires the exact rc.2 `bin.dsh` value `lib/bin.js`, and
reads the fixed `profiles/web/package.json` and its local
`node_modules/@tianwen/runtime-bundle/package.json`; it does not resolve through the source worktree.
The Profile must declare the Runtime exactly once in `dsh.profile.bundles` and exactly once in
`dependencies`; declarations in other dependency sections are rejected.

- [ ] **Step 5: Write failing process-lifecycle tests**

Use a fake `spawn` returning an `EventEmitter` child with readable stdout/stderr. Verify exact call:

```ts
expect(spawned).toEqual({
  program: target.nodeExecutable,
  args: [target.dshBin, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'],
  options: expect.objectContaining({ shell: false, windowsHide: true }),
})
```

Cover loopback ready, remote/file/data rejection, exit-before-ready, 120-second timeout using injected
timers, 64 KiB output overflow, and two concurrent `stop()` calls producing one kill operation. Also
assert that the child environment fixes `DSH_HOME`, sets `DSH_TELEMETRY_DISABLED=1`, and otherwise
preserves the parent environment.

- [ ] **Step 6: Implement `startDesktopWebHost`**

Expose:

```ts
export interface DesktopWebHost {
  readonly pid: number
  readonly url: URL
  readonly exited: Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>
  stop(): Promise<void>
}

export interface DesktopHostDependencies {
  readonly spawn?: typeof import('node:child_process').spawn
  readonly stopTree?: (pid: number) => Promise<void>
  readonly setTimeout?: typeof globalThis.setTimeout
  readonly clearTimeout?: typeof globalThis.clearTimeout
}
```

The default Windows stop first calls `child.kill()` and waits up to five seconds, then invokes
`%SystemRoot%\System32\taskkill.exe /PID <pid> /T /F` with `shell:false` only if the process is still
alive. All stdout/stderr buffering is bounded and stops accumulating after readiness.

- [ ] **Step 7: Run focused test, typecheck, and diff check**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-desktop-host.spec.ts
pnpm run typecheck
git diff --check
```

Expected: focused tests pass, typecheck exits `0`, diff check is empty.

- [ ] **Step 8: Commit Task 1**

```powershell
git add packages/tianwen-desktop-host tests/dsh-migration/tianwen-desktop-host.spec.ts
git commit -m "feat: add desktop Web host contract"
```

### Task 2: Real Electron window

**Files:**
- Modify: `packages/tianwen-desktop-host/package.json`
- Create: `packages/tianwen-desktop-host/src/main.ts`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `tests/dsh-migration/tianwen-desktop-host.spec.ts`

**Interfaces:**
- Consumes: Task 1 `parseDesktopArgs`, `resolveDesktopTarget`, and `startDesktopWebHost`.
- Produces: runnable `pnpm desktop -- --node ... --dsh-root ... --dsh-home ...` development proof.

- [ ] **Step 1: Write failing main-process boundary tests**

Add pure assertions for the exported constants used by `main.ts`:

```ts
expect(DESKTOP_WINDOW_OPTIONS.webPreferences).toEqual({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
})
expect(desktopNavigationAllowed('http://127.0.0.1:3210/path', readyUrl)).toBe(true)
expect(desktopNavigationAllowed('http://127.0.0.1:3211/', readyUrl)).toBe(false)
expect(desktopNavigationAllowed('https://example.com/', readyUrl)).toBe(false)
```

Keep these constants/functions in `host.ts` so the default Node test never imports Electron.
Also expose the smallest Node-only shutdown coordinator used by `main.ts`; test that concurrent calls
share one `host.stop()`, exit `0` after success, and report a concise error plus exit `1` after a stop
failure.

- [ ] **Step 2: Verify the new assertions fail**

Run the focused Vitest file and expect missing exports.

- [ ] **Step 3: Add Electron 43.4.0 with D-drive caches**

Set:

```powershell
$env:electron_config_cache = 'D:\DevData\electron-cache'
$env:TEMP = 'D:\DevData\tianwen-desktop-electron-temp'
$env:TMP = 'D:\DevData\tianwen-desktop-electron-temp'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
$env:NPM_CONFIG_CACHE = 'D:\DevData\npm-cache'
pnpm --filter @tianwen/desktop-host add --save-dev --save-exact electron@43.4.0
```

Add `electron: true` to the workspace `allowBuilds` map so pnpm permits Electron's own binary
download script; do not enable any DSH native dependency build.

Add package script `start: electron dist/main.js` and root script
`desktop: pnpm --filter @tianwen/desktop-host start`.

- [ ] **Step 4: Implement the one-window Electron main process**

`main.ts` must:

```ts
const input = parseDesktopArgs(process.argv.slice(2))
const target = resolveDesktopTarget(input)
const host = await startDesktopWebHost(target)
const window = new BrowserWindow(DESKTOP_WINDOW_OPTIONS)
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
window.webContents.on('will-navigate', (event, url) => {
  if (!desktopNavigationAllowed(url, host.url)) event.preventDefault()
})
await window.loadURL(host.url.href)
```

Use `app.requestSingleInstanceLock()`. Print the owned DSH PID after launch and print the ready URL
only after `did-finish-load`. On `window-all-closed`/`before-quit`, prevent final exit once, await the
idempotent `host.stop()`, then call `app.exit(0)`. If shutdown fails, write one concise stderr message
and call `app.exit(1)` so the app cannot hang after its last window closes. A startup error likewise
writes one concise stderr message and exits nonzero. No preload or renderer file is created.

When `TIANWEN_DESKTOP_E2E_EXIT_AFTER_LOAD=1`, close the window after the ready line. This is the only
test seam in the Electron process.

- [ ] **Step 5: Green tests and compile**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-desktop-host.spec.ts
pnpm --filter @tianwen/desktop-host build
pnpm run typecheck
git diff --check
```

Expected: all commands exit `0`; `dist/main.js` exists; no `@deepseek-ai/*` dependency is added to
the desktop manifest or its production dependency closure.

- [ ] **Step 6: Commit Task 2**

```powershell
git add package.json pnpm-workspace.yaml pnpm-lock.yaml packages/tianwen-desktop-host tests/dsh-migration/tianwen-desktop-host.spec.ts
git commit -m "feat: open Tianwen Web in Electron"
```

### Task 3: One real Windows Desktop proof and handoff

**Files:**
- Create: `tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts`
- Create: `docs/operations/tianwen-desktop-host-proof-handoff.md`

**Interfaces:**
- Consumes: an already-prepared exact DSH `web` Profile containing the same Runtime tarball.
- Produces: one opt-in real Electron/DSH result, process-cleanup evidence, and an honest go/no-go handoff.

- [ ] **Step 1: Add the default-skip and fresh-root guards**

The E2E runs only on Windows when `TIANWEN_DESKTOP_HOST_E2E=1`. It requires absolute environment
paths for Node, DSH root, and DSH home. Default execution must report one skip without creating any
directory or process.

- [ ] **Step 2: Write the real Electron assertion**

Resolve the workspace Electron executable without importing Electron into Vitest, build the desktop
package, and spawn Electron with `TIANWEN_DESKTOP_E2E_EXIT_AFTER_LOAD=1`. Assert:

```ts
expect(result.code).toBe(0)
expect(result.stdout).toMatch(/Tianwen Desktop host PID: \d+/u)
expect(result.stdout).toMatch(/Tianwen Desktop ready: http:\/\/127\.0\.0\.1:\d+/u)
```

After exit, extract PID/URL, assert the PID no longer exists and repeated HTTP connection attempts
fail. The test never initializes or installs a Profile.

- [ ] **Step 3: Run default regression**

Run the E2E file without opt-in. Expected: one planned skip and no filesystem change.

- [ ] **Step 4: Prepare one fresh D-drive Web Profile outside the test**

Use a fresh root under `D:\DevData\tianwen-desktop-host-proof-20260828`. Reuse exact rc.2 DSH and
the existing `tianwen-runtime-bundle-0.1.0.tgz`. Run the DSH-owned command once:

```powershell
node <exact-dsh-bin> plugin --profile web --allow-build=koffi add --offline <runtime-tarball>
```

Run it with `DSH_HOME` set to the fresh home and `DSH_TELEMETRY_DISABLED=1`. Verify the `web` Profile
declares exactly one Runtime bundle and record the Runtime tarball hash. This preparation is not part
of the Electron app and makes no Provider request.

- [ ] **Step 5: Run the real opt-in test exactly once**

Set all large caches to `D:\DevData`, remove Provider credentials from the child environment, set
the four required E2E variables, and run only
`tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts`. Capture exact commit, host PID, UTC times,
command output, exit code, and log hash. Do not rerun a failed real proof to select a better result.

- [ ] **Step 6: Independent review**

Review the diff, unit results, real log, Profile manifest, DSH/Runtime identity, port closure, and
surviving process list. Classify the result as passed, incomplete, or failed without rewriting the
one real execution.

- [ ] **Step 7: Write the handoff**

Separate:

- task result;
- product/runtime evidence;
- learning facts (`no natural task`, `no Provider request`);
- external facts (`no package/release/signing/publication`);
- deferred installer/updater/branding work.

- [ ] **Step 8: Final local gates and commit**

Run focused tests, desktop build, repository typecheck, complete default Vitest suite, Python gate,
installer-windows gate, and `git diff --check`. Commit the E2E and handoff only after the actual result
and independent review are recorded.
