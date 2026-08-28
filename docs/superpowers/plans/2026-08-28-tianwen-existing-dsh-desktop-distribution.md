# Tianwen Existing-DSH Desktop Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an unsigned Windows x64 Tianwen Desktop preview that reuses a user's exact DSH `0.1.1-rc.2`, remembers its target, launches a prepared `web` Profile from a shortcut, and can safely create only a completely missing `web` Profile from the exact Runtime `0.1.0` tarball.

**Architecture:** Keep the existing Electron host and external DSH process lifecycle authoritative. Add a thin bootstrap that validates and saves only Node/DSH/home paths, a Profile-preparation boundary that never auto-modifies an existing Profile, and an explicit `electron-builder` allowlist whose artifact is audited after construction. B1 (prepared Profile) remains useful by itself; B2 only extends the missing-Profile path and reuses the same full target validator before launch.

**Tech Stack:** TypeScript 6.0.3, Node.js 22.20.0, Electron 43.4.0, exact `electron-builder@26.15.3`, Vitest 4.1.8, pnpm 11.20.0, Windows PowerShell, GitHub Actions.

## Global Constraints

- The selected external `@deepseek-ai/dsh@0.1.1-rc.2` is the only DSH; the Desktop package must not contain or install a second DSH, pnpm runtime, DSH patch/lock closure, updater, daemon, terminal, preload, IPC bridge, or custom renderer.
- The only bundled Tianwen payload is the exact `@tianwen/runtime-bundle@0.1.0` tarball, produced once per distribution build and copied unchanged into `resources/runtime/tianwen-runtime-bundle-0.1.0.tgz`.
- Existing `web` Profiles are never automatically modified. If an existing Profile lacks exact Runtime `0.1.0`, show the exact selected-DSH PowerShell command and stop. Only a completely missing `profiles/web` may be created after one explicit confirmation.
- A Profile-preparation command is spawned exactly once with no automatic retry, no `--offline` production argument, `shell: false`, `windowsHide: true`, `DSH_HOME` set to the selected home, and `DSH_TELEMETRY_DISABLED=1`.
- Failed missing-Profile preparation leaves the incomplete Profile in place and reports its exact path; no recursive cleanup, backup/restore, transaction, migration, repair, or second validator is introduced.
- Saved `desktop-target.json` contains exactly `schemaVersion`, `nodeExecutable`, `dshRoot`, and `dshHome`; it contains no credentials, Provider configuration, Session, Profile, Goal, Evidence, or Evolution data.
- Bootstrap resolution order is complete diagnostic CLI arguments, saved target, automatic discovery, then native selection. An invalid saved target never silently falls through to discovery.
- App id is `io.github.daydreamer0213.tianwen.desktop`, product name is `Tianwen Desktop`, package version is `0.1.0-preview.1`, and the internal preview uses Electron's default icon.
- Windows output is unsigned x64 NSIS plus `win-unpacked`; public branding, signing, release publication, updater, macOS/Linux, and automatic Runtime migration remain deferred.
- Large caches, generated Runtime packs, Electron downloads, temporary Profiles, and real-product proof roots live under `D:\DevData` locally. CI uses `${{ runner.temp }}`.
- Existing CLI and managed-installer behavior remain unchanged. No Provider credential or live Tianwen task is used by these Desktop tests.

---

### Task 1: Split base-target validation from prepared-Profile validation

**Files:**
- Modify: `packages/tianwen-desktop-host/src/host.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-host.spec.ts`

**Interfaces:**
- Consumes: existing `DesktopTargetInput` and `resolveDesktopTarget(input: DesktopTargetInput): DesktopTarget`.
- Produces: `DesktopBaseTarget`, `resolveDesktopBaseTarget(input: DesktopTargetInput): DesktopBaseTarget`; the existing `resolveDesktopTarget` signature and behavior remain compatible.

- [ ] **Step 1: Add red tests for base-only validation**

Add imports and tests that prove a compatible Node/DSH/home is valid before a `web` Profile exists, while wrong DSH identity still fails:

```ts
import { resolveDesktopBaseTarget } from '../../packages/tianwen-desktop-host/src/host.js'

it('resolves a compatible external DSH before its Web Profile exists', () => {
  const input = fixture()
  rmSync(join(input.dshHome, 'profiles', 'web'), { recursive: true })
  expect(resolveDesktopBaseTarget(input)).toMatchObject({
    nodeExecutable: realpathSync(input.nodeExecutable),
    dshRoot: realpathSync(input.dshRoot),
    dshHome: realpathSync(input.dshHome),
    dshBin: realpathSync(join(input.dshRoot, 'lib/bin.js')),
  })
  expect(() => resolveDesktopTarget(input)).toThrow(/Web Profile is missing/u)
})

it('does not weaken exact DSH validation for a base target', () => {
  const input = fixture()
  writeJson(join(input.dshRoot, 'package.json'), {
    name: '@deepseek-ai/dsh', version: '0.1.1', bin: { dsh: 'lib/bin.js' },
  })
  expect(() => resolveDesktopBaseTarget(input)).toThrow(/required exact package/u)
})
```

- [ ] **Step 2: Run the focused test and observe the expected red result**

Run:

```powershell
$node = (Get-Command node).Source
$pnpm = 'D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs'
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-host.spec.ts
```

Expected: fail because `resolveDesktopBaseTarget` is not exported.

- [ ] **Step 3: Extract the base validator without duplicating validation**

Use these exact public types and delegation shape:

```ts
export interface DesktopBaseTarget extends DesktopTargetInput {
  readonly dshBin: string
}

export interface DesktopTarget extends DesktopBaseTarget {
  readonly profileRoot: string
}

export function resolveDesktopBaseTarget(input: DesktopTargetInput): DesktopBaseTarget {
  return { nodeExecutable, dshRoot, dshHome, dshBin }
}

export function resolveDesktopTarget(input: DesktopTargetInput): DesktopTarget {
  const base = resolveDesktopBaseTarget(input)
  return { ...base, profileRoot }
}
```

The body of `resolveDesktopBaseTarget` is the existing contiguous Node/DSH/home validation block through the `dshBin` containment check. The remaining existing Profile/Runtime block stays in `resolveDesktopTarget` after `const base = resolveDesktopBaseTarget(input)` and reads its paths from `base`. Do not introduce another DSH manifest parser or a second set of exact-version constants.

- [ ] **Step 4: Run green tests and typecheck**

Run:

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-host.spec.ts
& $node $pnpm --filter '@tianwen/desktop-host' typecheck
```

Expected: all Desktop host tests pass and typecheck exits `0`.

- [ ] **Step 5: Commit Task 1**

```powershell
git add packages/tianwen-desktop-host/src/host.ts tests/dsh-migration/tianwen-desktop-host.spec.ts
git commit -m "refactor: split Desktop base target validation"
```

### Task 2: Persist and discover an existing DSH target

**Files:**
- Create: `packages/tianwen-desktop-host/src/bootstrap.ts`
- Create: `tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts`

**Interfaces:**
- Consumes: `DesktopTargetInput`, `DesktopBaseTarget`, and `resolveDesktopBaseTarget` from Task 1.
- Produces: strict saved-target load/save functions and deterministic automatic candidate discovery.

- [ ] **Step 1: Add red tests for the exact settings schema**

The test uses a real D-drive fixture and literal JSON expectations:

```ts
it('round-trips only the four-key Desktop target schema', () => {
  const path = join(fixtureRoot, 'desktop-target.json')
  const target = resolveDesktopBaseTarget(fixture())
  saveDesktopTarget(path, target)
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
    schemaVersion: 'tianwen.desktop-target.v1',
    nodeExecutable: target.nodeExecutable,
    dshRoot: target.dshRoot,
    dshHome: target.dshHome,
  })
  expect(loadSavedDesktopTarget(path)).toEqual({
    nodeExecutable: target.nodeExecutable,
    dshRoot: target.dshRoot,
    dshHome: target.dshHome,
  })
})

it.each([
  {},
  { schemaVersion: 'wrong', nodeExecutable: 'C:\\node.exe', dshRoot: 'C:\\dsh', dshHome: 'D:\\home' },
  { schemaVersion: 'tianwen.desktop-target.v1', nodeExecutable: 'C:\\node.exe', dshRoot: 'C:\\dsh', dshHome: 'D:\\home', extra: true },
])('rejects malformed or expanded saved settings: %j', value => {
  const path = join(fixtureRoot, 'desktop-target.json')
  writeFileSync(path, JSON.stringify(value))
  expect(() => loadSavedDesktopTarget(path)).toThrow(/Desktop target settings/u)
})
```

- [ ] **Step 2: Add red discovery tests with exact command order**

Use an injected command runner and assert literal invocations and stable de-duplication:

```ts
const calls: Array<{ program: string, args: readonly string[] }> = []
const inputs = discoverDesktopTargetInputs({
  env: { SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\Users\\Ada', DSH_HOME: 'D:\\dsh-home' },
  exists: path => !path.endsWith('\\.dsh'),
  run: (program, args) => {
    calls.push({ program, args })
    if (program.endsWith('where.exe')) return 'C:\\Node22\\node.exe\r\n'
    if (args.at(-1) === '"npm root -g"') return 'C:\\npm-global\\node_modules\r\n'
    return 'C:\\pnpm-global\\node_modules\r\n'
  },
})
expect(calls).toEqual([
  { program: 'C:\\Windows\\System32\\where.exe', args: ['node'] },
  { program: 'C:\\Windows\\System32\\cmd.exe', args: ['/d', '/s', '/c', '"npm root -g"'] },
  { program: 'C:\\Windows\\System32\\cmd.exe', args: ['/d', '/s', '/c', '"pnpm root -g"'] },
])
expect(inputs[0]).toEqual({
  nodeExecutable: 'C:\\Node22\\node.exe',
  dshRoot: 'C:\\npm-global\\node_modules\\@deepseek-ai\\dsh',
  dshHome: 'D:\\dsh-home',
})
```

- [ ] **Step 3: Run the new test and observe the expected red result**

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts
```

Expected: fail because `bootstrap.ts` does not exist.

- [ ] **Step 4: Implement strict persistence and discovery**

Export exactly:

```ts
export const DESKTOP_TARGET_FILE_NAME = 'desktop-target.json'
export const DESKTOP_TARGET_SCHEMA_VERSION = 'tianwen.desktop-target.v1' as const

export function loadSavedDesktopTarget(filePath: string): DesktopTargetInput | undefined
export function saveDesktopTarget(filePath: string, target: DesktopBaseTarget): void

export interface DesktopDiscoveryDependencies {
  readonly env?: NodeJS.ProcessEnv
  readonly systemRoot?: string
  readonly exists?: (path: string) => boolean
  readonly run?: (program: string, args: readonly string[]) => string
}

export function discoverDesktopTargetInputs(
  dependencies?: DesktopDiscoveryDependencies,
): readonly DesktopTargetInput[]
```

`loadSavedDesktopTarget` returns `undefined` only when the file does not exist. It throws for unreadable JSON, wrong schema, missing/extra keys, or non-string path fields. `saveDesktopTarget` creates only the parent directory and writes the four-key JSON with a trailing newline.

Discovery uses absolute `%SystemRoot%\System32\where.exe` and `cmd.exe`; splits non-empty output lines; searches npm roots before pnpm roots; searches `DSH_HOME` before an existing `%USERPROFILE%\.dsh`; forms the stable Node × DSH-root × DSH-home product; and removes exact duplicate triples. A failed discovery command contributes no candidates and does not abort later commands.

- [ ] **Step 5: Run green tests and commit**

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts
& $node $pnpm --filter '@tianwen/desktop-host' typecheck
git add packages/tianwen-desktop-host/src/bootstrap.ts tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts
git commit -m "feat: persist and discover Desktop targets"
```

### Task 3: Resolve bootstrap priority and wire native selection

**Files:**
- Modify: `packages/tianwen-desktop-host/src/bootstrap.ts`
- Modify: `packages/tianwen-desktop-host/src/main.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts`

**Interfaces:**
- Consumes: Task 2 persistence/discovery and existing `parseDesktopArgs`.
- Produces: `resolveDesktopBootstrapTarget`, Electron dialog interactions, and a B1 main flow that launches only after the existing full target validation.

- [ ] **Step 1: Add red priority and cancellation tests**

Use literal call ledgers. Cover all five branches: complete CLI, valid saved target, invalid saved target with rejected replacement, first valid automatic candidate, and selection retry/cancel. The saved-invalid test must assert discovery was never called:

```ts
it('does not silently discover another DSH after a saved target becomes invalid', async () => {
  let discoveries = 0
  const result = await resolveDesktopBootstrapTarget([], 'D:\\settings\\desktop-target.json', {
    loadSavedTarget: () => ({ nodeExecutable: 'C:\\old-node.exe', dshRoot: 'C:\\old-dsh', dshHome: 'D:\\old-home' }),
    validateTarget: () => { throw new Error('old target invalid') },
    discoverTargetInputs: () => { discoveries += 1; return [] },
    selectTarget: async () => undefined,
    confirmSavedTargetReplacement: async reason => {
      expect(reason).toContain('old target invalid')
      return false
    },
    reportSelectedTargetError: async () => undefined,
    saveTarget: () => { throw new Error('unexpected save') },
  })
  expect(result).toBeUndefined()
  expect(discoveries).toBe(0)
})
```

- [ ] **Step 2: Run red**

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts
```

Expected: fail because the resolver and dialog adapter are not exported.

- [ ] **Step 3: Implement the resolver and native dialog adapter**

Export exactly:

```ts
export interface DesktopBootstrapInteractions {
  selectTarget(suggested?: Partial<DesktopTargetInput>): Promise<DesktopTargetInput | undefined>
  confirmSavedTargetReplacement(reason: string): Promise<boolean>
  reportSelectedTargetError(reason: string): Promise<void>
}

export interface DesktopBootstrapDependencies extends DesktopBootstrapInteractions {
  readonly validateTarget?: (input: DesktopTargetInput) => DesktopBaseTarget
  readonly loadSavedTarget?: (filePath: string) => DesktopTargetInput | undefined
  readonly saveTarget?: (filePath: string, target: DesktopBaseTarget) => void
  readonly discoverTargetInputs?: () => readonly DesktopTargetInput[]
}

export async function resolveDesktopBootstrapTarget(
  argv: readonly string[],
  settingsPath: string,
  dependencies: DesktopBootstrapDependencies,
): Promise<DesktopBaseTarget | undefined>

export interface DesktopDialog {
  showOpenDialog(options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue>
  showMessageBox(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue>
}

export function createDesktopBootstrapInteractions(dialog: DesktopDialog): DesktopBootstrapInteractions
```

Resolver rules are exact: non-empty CLI arguments are parsed/validated and returned without load/discovery/selection/save; a valid saved target is returned; an invalid saved target asks once and, if accepted, goes directly to selection; with no saved target, automatic candidates are validated in order and the first valid one is saved; with no valid automatic candidate, selection loops until valid or cancelled, reporting each invalid user choice before retrying.

The adapter uses three sequential native dialogs: Node `openFile` filtered to `.exe`, DSH root `openDirectory`, then DSH home `openDirectory`. Cancellation at any dialog returns `undefined`. Suggested paths are used only as `defaultPath`.

- [ ] **Step 4: Wire B1 in `main.ts`**

After `await app.whenReady()`, resolve the base target from:

```ts
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
```

Then keep the existing `startDesktopWebHost`, BrowserWindow navigation, single-instance and shutdown lifecycle unchanged. Import `dialog` from Electron and `join` from `node:path`; create no renderer/preload.

- [ ] **Step 5: Run green tests and commit**

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts
& $node $pnpm --filter '@tianwen/desktop-host' typecheck
git add packages/tianwen-desktop-host/src/bootstrap.ts packages/tianwen-desktop-host/src/main.ts tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts
git commit -m "feat: bootstrap Desktop from an existing DSH"
```

### Task 4: Build and audit the B1 Windows package

**Files:**
- Create: `packages/tianwen-desktop-host/THIRD_PARTY_NOTICES.md`
- Create: `scripts/audit-desktop-artifact.mjs`
- Create: `tests/dsh-migration/tianwen-desktop-artifact.spec.ts`
- Modify: `packages/tianwen-desktop-host/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: compiled `dist/main.js`, `dist/host.js`, and `dist/bootstrap.js`.
- Produces: exact B1 `win-unpacked`/NSIS configuration and `auditDesktopArtifact(unpackedRoot, expectedRuntimeTarball?)`.

- [ ] **Step 1: Add red artifact-audit tests**

Create a real temporary `resources/app` tree with only the three compiled files and manifest, plus root license/notices resources. Assert it passes, then add each forbidden class and assert rejection:

```ts
expect(() => auditDesktopArtifact(unpackedRoot)).not.toThrow()
for (const forbidden of [
  'resources/app/node_modules/@deepseek-ai/dsh/package.json',
  'resources/app/.pnpm/lock.yaml',
  'resources/app/patches/@deepseek-ai__dsh.patch',
  'resources/app/tests/fixture.ts',
  'resources/app/src/main.ts',
]) {
  writeFixture(forbidden, 'forbidden')
  expect(() => auditDesktopArtifact(unpackedRoot)).toThrow(/forbidden|allowlist/iu)
  rmSync(join(unpackedRoot, forbidden))
}
```

- [ ] **Step 2: Run red**

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-artifact.spec.ts
```

Expected: fail because the audit module does not exist.

- [ ] **Step 3: Implement the minimal artifact auditor**

Export:

```js
export function auditDesktopArtifact(unpackedRoot, expectedRuntimeTarball)
```

For B1, require the exact application-relative set:

```js
new Set([
  'dist/bootstrap.js',
  'dist/host.js',
  'dist/main.js',
  'package.json',
])
```

Require `resources/LICENSE.txt` and `resources/THIRD_PARTY_NOTICES.md`; reject any other file under `resources/app`; reject a `resources/runtime` directory when `expectedRuntimeTarball` is absent. The local B1 CLI form is:

```powershell
node scripts/audit-desktop-artifact.mjs D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge\dist\tianwen-desktop\win-unpacked
```

It prints one concise success line and exits nonzero on mismatch. Use only Node standard-library filesystem/path/crypto APIs.

- [ ] **Step 4: Configure exact electron-builder packaging**

Set package version to `0.1.0-preview.1`, add exact `electron-builder@26.15.3`, and add:

```json
"scripts": {
  "start": "electron dist/main.js",
  "build": "tsc -b --pretty false",
  "typecheck": "tsc -b --pretty false",
  "pack:dir": "electron-builder --dir --win --x64",
  "pack:win": "electron-builder --win nsis --x64"
},
"build": {
  "appId": "io.github.daydreamer0213.tianwen.desktop",
  "productName": "Tianwen Desktop",
  "asar": false,
  "directories": { "output": "../../dist/tianwen-desktop" },
  "files": ["dist/main.js", "dist/host.js", "dist/bootstrap.js", "package.json"],
  "extraResources": [
    { "from": "../../LICENSE", "to": "LICENSE.txt" },
    { "from": "THIRD_PARTY_NOTICES.md", "to": "THIRD_PARTY_NOTICES.md" }
  ],
  "win": { "target": [{ "target": "nsis", "arch": ["x64"] }] },
  "nsis": {
    "oneClick": true,
    "perMachine": false,
    "deleteAppDataOnUninstall": false
  }
}
```

The notice names Electron/Chromium/Node and points to their bundled license files; it does not invent legal conclusions or public-release approval.

Update the lockfile with the exact package command before the frozen install:

```powershell
& $node $pnpm --filter '@tianwen/desktop-host' add --save-dev --save-exact electron-builder@26.15.3
```

`electron-builder@26.15.3` calls the cache-mode API introduced in `@electron/get@3.1.0` even though its declared range starts at `3.0.0`. Pin only that transitive `^3.0.0` range to `3.1.0` in the workspace override, leaving Electron's separate `@electron/get@5` dependency untouched. Explicitly deny the unused `electron-winstaller` install script because B1 builds NSIS, not Squirrel:

```yaml
overrides:
  '@electron/get@^3.0.0': 3.1.0
allowBuilds:
  electron-winstaller: false
```

- [ ] **Step 5: Run unit green, build the unpacked directory, and audit it**

```powershell
$env:electron_config_cache = 'D:\DevData\electron-cache'
$env:ELECTRON_BUILDER_CACHE = 'D:\DevData\electron-builder-cache'
$env:TEMP = 'D:\DevData\tianwen-desktop-distribution\temp'
$env:TMP = $env:TEMP
& $node $pnpm install --frozen-lockfile
& $node $pnpm --filter '@tianwen/desktop-host' build
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-artifact.spec.ts
& $node $pnpm --filter '@tianwen/desktop-host' pack:dir
& $node scripts/audit-desktop-artifact.mjs dist/tianwen-desktop/win-unpacked
```

Expected: audit passes; no Runtime resource or DSH closure exists in B1.

- [ ] **Step 6: Commit Task 4**

```powershell
git add packages/tianwen-desktop-host/package.json packages/tianwen-desktop-host/THIRD_PARTY_NOTICES.md scripts/audit-desktop-artifact.mjs tests/dsh-migration/tianwen-desktop-artifact.spec.ts pnpm-lock.yaml pnpm-workspace.yaml docs/superpowers/plans/2026-08-28-tianwen-existing-dsh-desktop-distribution.md
git commit -m "feat: package the existing-DSH Desktop shell"
```

### Task 5: Add B1 packaged-app and CI gates

**Files:**
- Modify: `tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: B1 unpacked executable and artifact audit from Task 4.
- Produces: an opt-in packaged executable path and a Windows distribution CI job; no real GUI lifecycle is forced onto GitHub runners.

- [ ] **Step 1: Add a red launcher-selection unit test**

Extract a pure launcher resolver in the E2E test file and test both forms:

```ts
expect(resolveDesktopLaunch('D:\\Tianwen Desktop.exe')).toEqual({
  executable: realpathSync('D:\\Tianwen Desktop.exe'),
  prefixArgs: [],
})
expect(resolveDesktopLaunch(undefined).prefixArgs.at(-1)).toMatch(/dist[\\/]main\.js$/u)
```

The opt-in packaged path comes from absolute `TIANWEN_DESKTOP_EXECUTABLE`; without it, the existing development Electron path remains unchanged. The real assertion continues to check ready URL, owned DSH PID exit, and closed HTTP endpoint.

- [ ] **Step 2: Run the default-skipped E2E and focused unit tests**

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts
```

Expected red first because `resolveDesktopLaunch` is absent; after the minimal extraction, expected green with one planned real-test skip and the cleanup unit tests passing.

- [ ] **Step 3: Add explicit Desktop unit tests to the TypeScript job**

Add one separate command after the existing TypeScript migration tests:

```yaml
- run: pnpm exec vitest run tests/dsh-migration/tianwen-desktop-host.spec.ts tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts
```

- [ ] **Step 4: Add a Windows artifact-build job**

Create `desktop-windows` without changing `python`, `typescript`, or `installer-windows`. It checks out, installs pnpm 11.20.0 and Node 22.20.0, runs frozen install, builds Desktop, runs the three deterministic Desktop specs, builds `pack:dir`, audits `win-unpacked`, builds `pack:win`, and asserts exactly one `.exe` installer exists. Set Electron caches to `${{ runner.temp }}`. Do not run the real GUI E2E in CI.

- [ ] **Step 5: Verify YAML intent and commit**

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts
git diff --check
git add tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts .github/workflows/ci.yml
git commit -m "ci: build and audit Tianwen Desktop"
```

### Task 6: Freeze the existing-Profile failure boundary

**Files:**
- Modify: `tests/dsh-migration/portable-plugin-lifecycle.e2e.spec.ts`

**Interfaces:**
- Consumes: existing exact DSH/tarball/store lifecycle fixture.
- Produces: one real disposable-Profile characterization proving why existing Profiles cannot be auto-prepared.

- [ ] **Step 1: Make the lifecycle helpers accept an explicit store**

Add an optional store argument to `childEnvironment`/`runDshPlugin`; preserve every existing call's behavior. The DSH spawn count stays authoritative and all production command arguments remain visible in the test.

- [ ] **Step 2: Add the induced valid-tarball/empty-store scenario**

Initialize existing `web` and control Profiles. Generate a valid lock for the selected Profile using the existing pinned pnpm entry and populated fixture store. Save raw `Buffer` values for:

```ts
const protectedFiles = [
  'package.json',
  'pnpm-workspace.yaml',
  'cordis.patch.yml',
  'pnpm-lock.yaml',
] as const
```

Then run the exact add argument list once with the valid Runtime tarball while `PNPM_CONFIG_OFFLINE=true` points at a new empty store:

```ts
[
  '--profile', 'web', '--allow-build=koffi',
  'add', runtimeTarball,
]
```

Assert nonzero exit, one DSH spawn, unchanged manifest/patch/lock and Runtime declaration, unchanged control Profile/state tree, and a changed `pnpm-workspace.yaml` containing `koffi: true`. The test name must state that this mutation disables automatic existing-Profile preparation.

- [ ] **Step 3: Run the real boundary test once**

```powershell
$lifecycleRoot = 'D:\DevData\tianwen-desktop-distribution\portable-lifecycle'
New-Item -ItemType Directory -Force -Path $lifecycleRoot,(Join-Path $lifecycleRoot 'packs'),(Join-Path $lifecycleRoot 'pnpm-store') | Out-Null
& $node $pnpm fetch --frozen-lockfile --store-dir (Join-Path $lifecycleRoot 'pnpm-store')
& $node $pnpm --filter '@tianwen/runtime-bundle...' build
& $node $pnpm --filter '@tianwen/runtime-bundle' pack --pack-destination (Join-Path $lifecycleRoot 'packs')
$env:TIANWEN_RUN_PORTABLE_PLUGIN_LIFECYCLE_E2E = '1'
$env:TIANWEN_PORTABLE_PLUGIN_LIFECYCLE_ROOT = $lifecycleRoot
try {
  & $node $pnpm exec vitest run tests/dsh-migration/portable-plugin-lifecycle.e2e.spec.ts
} finally {
  Remove-Item Env:TIANWEN_RUN_PORTABLE_PLUGIN_LIFECYCLE_E2E -ErrorAction SilentlyContinue
  Remove-Item Env:TIANWEN_PORTABLE_PLUGIN_LIFECYCLE_ROOT -ErrorAction SilentlyContinue
}
```

Expected: pass and explicitly observe the workspace-policy mutation. This is DSH behavior evidence, not a product failure and not permission to add automatic rollback.

- [ ] **Step 4: Commit Task 6**

```powershell
git add tests/dsh-migration/portable-plugin-lifecycle.e2e.spec.ts
git commit -m "test: capture Desktop profile preparation boundary"
```

### Task 7: Gate and execute missing-Profile preparation

**Files:**
- Create: `packages/tianwen-desktop-host/src/profile-prepare.ts`
- Create: `tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts`
- Modify: `packages/tianwen-desktop-host/src/main.ts`

**Interfaces:**
- Consumes: `DesktopBaseTarget`, `DesktopTarget`, and the existing full `resolveDesktopTarget`.
- Produces: Profile inspection, exact manual command rendering, a single-spawn missing-Profile installer, and post-install strict revalidation.

- [ ] **Step 1: Add red state-classification tests**

Use real D-drive fixtures and literal expected states:

```ts
expect(inspectWebProfile(baseWithExactRuntime())).toEqual({
  kind: 'ready', profileRoot: expectedProfileRoot,
})
expect(inspectWebProfile(baseWithoutProfile())).toEqual({
  kind: 'missing-profile', profileRoot: expectedProfileRoot,
})
expect(inspectWebProfile(baseWithPlainWebProfile())).toEqual({
  kind: 'missing-runtime', profileRoot: expectedProfileRoot,
})
expect(inspectWebProfile(baseWithWrongRuntime())).toMatchObject({
  kind: 'incompatible', profileRoot: expectedProfileRoot,
})
```

- [ ] **Step 2: Add red command/no-retry tests**

Use a fake child only at the external process boundary. Assert the real component's returned error/state and the literal spawn input:

```ts
expect(spawned).toEqual({
  program: base.nodeExecutable,
  args: [base.dshBin, 'plugin', '--profile', 'web', '--allow-build=koffi', 'add', runtimeTarball],
  options: expect.objectContaining({ shell: false, windowsHide: true }),
})
expect(spawnCount).toBe(1)
expect(failure).toMatchObject({ stage: 'dsh-plugin-add', exitCode: 1, profileRoot })
```

Also assert `prepareMissingWebProfile` refuses to spawn if `profiles/web` exists and `resolvePreparedDesktopTarget` sends `missing-runtime` to the manual interaction without confirmation or spawn.

- [ ] **Step 3: Run red**

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts
```

Expected: fail because `profile-prepare.ts` does not exist.

- [ ] **Step 4: Implement the exact Profile boundary**

Export exactly:

```ts
export type WebProfileState =
  | { readonly kind: 'ready', readonly profileRoot: string }
  | { readonly kind: 'missing-profile', readonly profileRoot: string }
  | { readonly kind: 'missing-runtime', readonly profileRoot: string }
  | { readonly kind: 'incompatible', readonly profileRoot: string, readonly reason: string }

export interface ProfilePreparationFailure {
  readonly stage: 'dsh-plugin-add'
  readonly exitCode: number | null
  readonly profileRoot: string
  readonly stderr: string
}

export class ProfilePreparationError extends Error implements ProfilePreparationFailure {
  readonly stage = 'dsh-plugin-add' as const
  readonly exitCode: number | null
  readonly profileRoot: string
  readonly stderr: string
}

export function inspectWebProfile(target: DesktopBaseTarget): WebProfileState
export function renderManualPreparationCommand(target: DesktopBaseTarget, runtimeTarball: string): string
export function prepareMissingWebProfile(
  target: DesktopBaseTarget,
  runtimeTarball: string,
  dependencies?: { readonly spawn?: typeof import('node:child_process').spawn },
): Promise<void>
```

`inspectWebProfile` first attempts the existing `resolveDesktopTarget(target)`. A successful result is `ready`. If the Profile directory is absent it is `missing-profile`; if the Profile exists and neither its dependency sections nor bundle list mentions `@tianwen/runtime-bundle`, it is `missing-runtime`; every partial, conflicting, wrong-version, or broken installed declaration is `incompatible` with the original validator reason.

The spawn is:

```ts
spawn(target.nodeExecutable, [
  target.dshBin,
  'plugin', '--profile', 'web', '--allow-build=koffi',
  'add', runtimeTarball,
], {
  env: { ...process.env, DSH_HOME: target.dshHome, DSH_TELEMETRY_DISABLED: '1' },
  shell: false,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
```

The manual command is a pasteable PowerShell invocation beginning with `&` and single-quoted literal paths. Single quotes inside a path are doubled. Do not add `--offline`, a timeout/retry framework, pnpm-store overrides, or PATH rewriting.

- [ ] **Step 5: Add the pure preparation coordinator and main dialogs**

Export:

```ts
export interface DesktopProfileInteractions {
  confirmCreateProfile(profileRoot: string): Promise<boolean>
  showManualPreparation(reason: string, command: string): Promise<void>
}

export async function resolvePreparedDesktopTarget(
  base: DesktopBaseTarget,
  runtimeTarball: string,
  interactions: DesktopProfileInteractions,
  dependencies?: {
    readonly inspect?: typeof inspectWebProfile
    readonly prepare?: typeof prepareMissingWebProfile
    readonly validate?: typeof resolveDesktopTarget
  },
): Promise<DesktopTarget | undefined>
```

Branch behavior: `ready` calls the existing full validator; `missing-runtime` shows the manual command and returns `undefined`; `incompatible` throws its reason without mutation; `missing-profile` confirms once, returns `undefined` on refusal, otherwise spawns once and immediately calls the existing full validator. No branch retries.

In `main.ts`, pass `join(process.resourcesPath, 'runtime', 'tianwen-runtime-bundle-0.1.0.tgz')`; use native message boxes for confirmation/manual/error; exit `0` on cancellation/manual stop and `1` on failure. Keep stderr reporting for diagnostics. There is no environment variable, command-line flag, or packaged-code path that bypasses the missing-Profile confirmation.

- [ ] **Step 6: Run green tests and commit**

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts
& $node $pnpm --filter '@tianwen/desktop-host' typecheck
git add packages/tianwen-desktop-host/src/profile-prepare.ts packages/tianwen-desktop-host/src/main.ts tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts
git commit -m "feat: gate Desktop Profile preparation"
```

### Task 8: Bundle the one exact Runtime archive and audit its digest

**Files:**
- Create: `scripts/stage-desktop-runtime.mjs`
- Modify: `scripts/audit-desktop-artifact.mjs`
- Modify: `tests/dsh-migration/tianwen-desktop-artifact.spec.ts`
- Modify: `packages/tianwen-desktop-host/package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: one externally produced `tianwen-runtime-bundle-0.1.0.tgz` path.
- Produces: unchanged staged resource at `packages/tianwen-desktop-host/dist/runtime/` and source/resource SHA-256 equality.

- [ ] **Step 1: Add red staging and digest tests**

Export `stageDesktopRuntime(sourceTarball, packageRoot)` from the new standard-library-only script. Tests assert exact basename enforcement, byte-for-byte copy, and audit failure after mutating the packaged copy:

```ts
const staged = stageDesktopRuntime(sourceTarball, desktopPackageRoot)
expect(staged).toBe(join(desktopPackageRoot, 'dist', 'runtime', 'tianwen-runtime-bundle-0.1.0.tgz'))
expect(readFileSync(staged)).toEqual(readFileSync(sourceTarball))
expect(() => auditDesktopArtifact(unpackedRoot, sourceTarball)).not.toThrow()
appendFileSync(join(unpackedRoot, 'resources', 'runtime', 'tianwen-runtime-bundle-0.1.0.tgz'), 'changed')
expect(() => auditDesktopArtifact(unpackedRoot, sourceTarball)).toThrow(/SHA-256|digest/u)
```

- [ ] **Step 2: Run red**

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-artifact.spec.ts
```

Expected: fail because the staging export and digest audit do not exist.

- [ ] **Step 3: Implement staging and B2 package allowlists**

The staging CLI requires one absolute argument and copies only the exact basename. Extend application files with `dist/profile-prepare.js`. Extend `extraResources` with:

```json
{
  "from": "dist/runtime/tianwen-runtime-bundle-0.1.0.tgz",
  "to": "runtime/tianwen-runtime-bundle-0.1.0.tgz"
}
```

When `expectedRuntimeTarball` is provided, the artifact audit requires exactly that one resource file and compares SHA-256 bytes. It still rejects every DSH/pnpm/source/test/patch/lock closure.

- [ ] **Step 4: Update the Windows distribution job to pack once**

Before Desktop packaging, build Runtime Bundle and run exactly one:

```yaml
- run: pnpm --filter '@tianwen/runtime-bundle' pack --pack-destination "${{ runner.temp }}/tianwen-runtime-pack"
- run: node scripts/stage-desktop-runtime.mjs "${{ runner.temp }}/tianwen-runtime-pack/tianwen-runtime-bundle-0.1.0.tgz"
```

Pass that same source path to the artifact audit after `pack:dir`. Do not run a second `pnpm pack` before NSIS.

Also extend both deterministic Desktop CI commands introduced in Task 5 with `tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts`. The TypeScript job and `desktop-windows` job must each run host, bootstrap, Profile-preparation, and artifact specs on every PR.

- [ ] **Step 5: Build and audit locally from one D-drive pack**

```powershell
$packRoot = 'D:\DevData\tianwen-desktop-distribution\packs'
New-Item -ItemType Directory -Force -Path $packRoot | Out-Null
& $node $pnpm --filter '@tianwen/runtime-bundle...' build
& $node $pnpm --filter '@tianwen/runtime-bundle' pack --pack-destination $packRoot
$runtimeTarball = Join-Path $packRoot 'tianwen-runtime-bundle-0.1.0.tgz'
& $node scripts/stage-desktop-runtime.mjs $runtimeTarball
& $node $pnpm --filter '@tianwen/desktop-host' build
& $node $pnpm --filter '@tianwen/desktop-host' pack:dir
& $node scripts/audit-desktop-artifact.mjs dist/tianwen-desktop/win-unpacked $runtimeTarball
```

Expected: one source tarball, one packaged copy, equal SHA-256, no second DSH.

- [ ] **Step 6: Commit Task 8**

```powershell
git add scripts/stage-desktop-runtime.mjs scripts/audit-desktop-artifact.mjs tests/dsh-migration/tianwen-desktop-artifact.spec.ts packages/tianwen-desktop-host/package.json .github/workflows/ci.yml
git commit -m "feat: bundle the exact Desktop Runtime archive"
```

### Task 9: Prove the installed Desktop paths on real Windows

**Files:**
- Create: `tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts`
- Create: `docs/operations/tianwen-existing-dsh-desktop-distribution-handoff.md`

**Interfaces:**
- Consumes: exact unpacked executable, NSIS installer, bundled Runtime resource, exact external DSH/Node, and a fresh D-drive DSH home.
- Produces: one frozen local product-proof result covering B1 launch, B2 missing-Profile creation, saved-target reuse, process cleanup, artifact identity, and unrelated-state preservation.

- [ ] **Step 1: Add default-skip and disposable-root guards**

Run only on Windows when `TIANWEN_DESKTOP_DISTRIBUTION_E2E=1`. Require absolute paths for the packaged executable, NSIS installer, exact DSH root, exact Node, exact pnpm entry, source Runtime tarball, and a pre-created empty non-reparse strict child of `D:\DevData`. Without opt-in, the file reports one planned skip and creates no files/processes. Before the first product process, also require no conflicting Tianwen installation, shortcut, or running process; preflight failures may be corrected without consuming the one-shot product proof.

- [ ] **Step 2: Implement automatic-discovery and saved-target proof**

Under the disposable root, create a command shim directory where `pnpm.cmd` prints the exact global `node_modules` root containing the selected DSH only for `root -g`; every other argument is forwarded to the preflighted exact pnpm entry. Set `PATH` to the shim, exact Node directory, and `%SystemRoot%\System32` in that order, set fresh `DSH_HOME`, and redirect `APPDATA`, `LOCALAPPDATA`, TEMP/TMP, pnpm and Electron caches under the same D-drive root. Remove all Provider credentials.

Run the unpacked packaged executable with no path arguments and `TIANWEN_DESKTOP_E2E_EXIT_AFTER_LOAD=1`. The first run must discover/save the target and display the real native missing-Profile confirmation. The test uses Windows' built-in `System.Windows.Automation` API from its controller process to locate the `Tianwen Desktop` confirmation window, assert the create/cancel controls are present, and invoke the create button exactly once. No production environment variable or hidden product command bypasses confirmation. The app then installs the bundled Runtime through that exact DSH, loads the real loopback Web page, and exits cleanly. Remove the discovery shim and `DSH_HOME` hints and run the same executable again; the second run must use `desktop-target.json` and exit cleanly without another confirmation or Profile installation.

- [ ] **Step 3: Assert the real product outcome**

Assert all three application exits are `0`; each emits one owned DSH PID and one ready loopback URL; each owned PID is gone and each endpoint is closed. Assert saved settings have exactly four keys, installed Runtime is exact `0.1.0`, its Profile path is under the selected DSH home, the source, unpacked, and installed Runtime tarball SHA-256 match, another standard initialized control Profile/tree is byte-identical, and no Provider credential was passed.

Install the same NSIS artifact silently with `/S` and `/D=D:\DevData\tianwen-desktop-distribution\product-proof-01\installed`. Resolve the one newly created Windows shortcut with the built-in Windows Script Host, assert its target is the proof installation executable, then spawn that target directly so stdout/stderr and the isolated environment remain observable. After the installed B1 launch, run its uninstaller silently. Assert the installed shell and newly created shortcut/registration state are removed while the external DSH root, DSH home, both Profiles, and `desktop-target.json` remain byte-identical. The configured `deleteAppDataOnUninstall: false` is therefore checked through real behavior rather than source text.

- [ ] **Step 4: Freeze and run the product proof once**

First commit and independently review the default-skipped E2E harness. Freeze that harness commit as the exact feature SHA. Build/audit unpacked and NSIS artifacts from that SHA, complete every read-only/preparation preflight, then start the one-shot boundary immediately before the first unpacked executable launch. Run only this opt-in file once using `D:\DevData\tianwen-desktop-distribution\product-proof-01`; the frozen sequence is unpacked B2 creation, unpacked saved-target B1 reuse, one silent install, installed saved-target B1 launch, and one silent uninstall. Capture stdout/stderr, exit code, start/end UTC, source/resource hashes, executable/installer/uninstaller hashes, and an outer-controller test log hash. Any failure stops the sequence and is diagnosed from the preserved root; it is not silently rerun to obtain a nicer result.

- [ ] **Step 5: Write the handoff after the frozen run with separated facts**

The handoff reports separately:

1. product result and exact feature SHA;
2. B1/B2 runtime and process-lifecycle evidence;
3. artifact contents/digests and no-second-DSH result;
4. existing Profile failure-boundary fact;
5. CI/local repository gates;
6. external facts: unsigned preview, no public release/signing, no Provider task, no DSH upstream push.

- [ ] **Step 6: Commit the harness before execution, then the handoff after execution**

```powershell
git add tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts
git commit -m "test: add existing-DSH Desktop distribution proof"
# independently review and freeze this SHA, then execute exactly once
git add docs/operations/tianwen-existing-dsh-desktop-distribution-handoff.md
git commit -m "docs: record existing-DSH Desktop distribution proof"
```

### Task 10: Run final gates and close the feature branch

**Files:**
- Modify only if evidence needs correction: `docs/operations/tianwen-existing-dsh-desktop-distribution-handoff.md`

**Interfaces:**
- Consumes: Tasks 1-9 and their reviewed commits.
- Produces: one exact feature SHA ready for controlled main integration; exact-main CI remains a post-merge gate.

- [ ] **Step 1: Run focused Desktop gates**

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-desktop-host.spec.ts tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts
& $node $pnpm --filter '@tianwen/desktop-host' typecheck
```

Expected: deterministic tests pass; both real E2Es are planned skips without opt-in.

- [ ] **Step 2: Run repository regression gates**

```powershell
& $node $pnpm run typecheck
& $node $pnpm run check:dsh-install
& $node $pnpm run check:no-private-dsh-imports
& $node $pnpm exec vitest run
git diff --check
git status --short
```

Expected: all exit `0`; only intentional handoff correction may remain before the final commit.

- [ ] **Step 3: Rebuild and inspect final artifacts**

Using the Task 8 source tarball without repacking, rebuild `pack:dir` and `pack:win`, audit `win-unpacked`, assert exactly one NSIS `.exe`, and record final artifact hashes in the handoff. This is a build verification, not a second product-proof run.

- [ ] **Step 4: Independent whole-branch review**

Review the complete branch against the approved design, especially: no second DSH/pnpm closure, saved-schema strictness, invalid-saved-target behavior, existing-Profile no-mutation gate, one-spawn/no-retry missing-Profile path, same-tarball digest, secure existing host lifecycle, and CI preservation. Resolve Critical/Important findings through the subagent-driven review loop before integration.

- [ ] **Step 5: Freeze the exact feature SHA**

```powershell
git status --short
git rev-parse HEAD
git log --oneline --decorate -12
```

Expected: clean feature branch and a recorded exact SHA. Controlled main integration and exact-main GitHub CI follow the project's normal integration procedure; public release, signing, and DSH upstream publication remain unauthorized and out of scope.
