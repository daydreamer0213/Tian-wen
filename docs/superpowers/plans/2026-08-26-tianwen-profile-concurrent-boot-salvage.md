# Tianwen Profile Concurrent Boot Salvage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the useful DSH concurrent-boot candidate into a deterministic controller-verified fix, then carry that fix in Tianwen's exact rc.7 dependency patches without changing the historical natural-task result.

**Architecture:** A source-level IPC barrier makes eight real child processes race on one managed junction, proving the direct-publication bug on the frozen parent and the staged-publication fix on the candidate. A second barrier regression proves that concurrent initial Profile files are published complete rather than read mid-write. Independent built CLI checks then prove the complete 233-link DSH source-build path. Tianwen keeps its existing CLI dump patch and adds one exact app-boot patch because the published CLI imports both behaviors from `@deepseek-ai/dsh-app-boot`; the workspace package surface has 505 links and the official managed host has 510.

**Tech Stack:** Node.js 22, TypeScript 6, Vitest 4, Node child-process IPC, Windows junctions, pnpm 11 patched dependencies, PowerShell 7.

**Execution status:** Tasks 1-5 and Task 6 Steps 1-4 are complete. Task 6
Step 5 (controlled main merge and exact-main CI) remains pending.

## Global Constraints

- The natural task remains immutable `task-incomplete`; this work is controller-owned engineering evidence.
- Do not call DeepSeek, create a Goal/Session/Run, or create another controlled Activity.
- Use frozen DSH parent `b180ce297766abdd6608e95b5c547ebe899d6e6f` in a new worktree under `D:\DevData\tianwen-profile-cold-boot-natural-02`.
- Leave `dsh-workspace`, `dsh-red-check`, the installed natural-run product, and all historical evidence unchanged.
- Do not increase the Agent test's 60-second ceiling, retry failed commands, select favorable results, prewarm the installer, add a cache, or add a framework/dependency.
- Three RED runs and three GREEN runs are fixed stability samples. Every result counts; one unexpected result stops integration.
- Do not push, open a pull request, publish, or otherwise mutate the external DSH repository.
- Preserve the existing exact `@deepseek-ai/dsh@0.1.0-rc.7` dump-boundary patch. Put the junction fix in a new exact `@deepseek-ai/dsh-app-boot@0.1.0-rc.7` patch.
- Keep all dependency stores, worktrees, validation homes, installer products, and generated evidence on `D:`.

---

### Task 1: Create the isolated DSH salvage workspace

**Files:** none.

**Interfaces:**
- Consumes: frozen DSH parent `b180ce297766abdd6608e95b5c547ebe899d6e6f`.
- Produces: clean branch `codex/tianwen-profile-concurrent-boot-salvage` at `D:\DevData\tianwen-profile-cold-boot-natural-02\dsh-salvage`.

- [ ] **Step 1: Verify the repository is a normal checkout and the destination is absent**

```powershell
git rev-parse --git-dir
git rev-parse --git-common-dir
git rev-parse --show-superproject-working-tree
git worktree list --porcelain
git branch --list codex/tianwen-profile-concurrent-boot-salvage
Test-Path -LiteralPath 'D:\DevData\tianwen-profile-cold-boot-natural-02\dsh-salvage'
```

Expected: git dir equals common dir, no superproject, the branch is absent, and `Test-Path` is `False`.

- [ ] **Step 2: Create the worktree from the exact parent**

```powershell
git worktree add 'D:\DevData\tianwen-profile-cold-boot-natural-02\dsh-salvage' -b codex/tianwen-profile-concurrent-boot-salvage b180ce297766abdd6608e95b5c547ebe899d6e6f
```

Expected: the new branch points exactly at the frozen parent.

- [ ] **Step 3: Install from the existing D:-hosted pnpm store**

```powershell
pnpm install --frozen-lockfile
```

Expected: pnpm 11.7.0 completes without changing tracked files or locked versions. Reuse the existing D:-hosted store; a missing locked tarball may be downloaded into that store, but no dependency version may change.

- [ ] **Step 4: Run the clean focused baseline**

```powershell
pnpm exec vitest run packages/boot/app-boot/tests/profile.spec.ts apps/cli/tests/profile-boot.spec.ts
git status --short --branch
```

Expected: 2 files and 15 tests pass; the branch remains clean.

---

### Task 2: Add the deterministic source-level RED regression

**Files:**
- Create: `packages/boot/app-boot/tests/heal-concurrent.spec.ts`
- Create: `packages/boot/app-boot/tests/fixtures/heal-concurrent.mjs`

**Interfaces:**
- Consumes: exported `healProfilesModuleFallback(installAnchor: string, home?: string): void` from source `profile.ts`.
- Produces: eight source-importing children that signal `ready`, receive one `go`, and report a concrete result.

- [ ] **Step 1: Write the minimal parent regression**

The production break named by this test is direct Windows junction publication at the final fallback path. With all children released together, the frozen parent must expose the half-built path to at least one child.

```typescript
import { spawn } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const profileUrl = pathToFileURL(fileURLToPath(new URL('../src/profile.ts', import.meta.url))).href
const fixture = fileURLToPath(new URL('./fixtures/heal-concurrent.mjs', import.meta.url))
const CONCURRENCY = 8

interface Healer {
  ready: Promise<void>
  start: () => void
  result: Promise<string>
}

function stageInstallation(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-heal-race-'))
  const appDir = join(root, 'app')
  mkdirSync(appDir, { recursive: true })
  const anchor = join(appDir, 'package.json')
  writeFileSync(anchor, JSON.stringify({ name: 'dsh-app' }))
  return anchor
}

function startHealer(anchor: string, home: string): Healer {
  const child = spawn(process.execPath, ['--import', 'tsx/esm', fixture, profileUrl, anchor, home], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  const ready = Promise.withResolvers<void>()
  const result = Promise.withResolvers<string>()
  let stdout = ''
  let stderr = ''
  let announced = false
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => { stdout += chunk })
  child.stderr.on('data', (chunk: string) => { stderr += chunk })
  child.on('message', (message: unknown) => {
    if (message !== 'ready') {
      ready.reject(new Error(`unexpected healer message: ${JSON.stringify(message)}`))
      return
    }
    announced = true
    ready.resolve()
  })
  child.once('error', (error) => {
    ready.reject(error)
    result.resolve(`spawn error: ${error.message}`)
  })
  child.once('close', (code) => {
    if (!announced) ready.reject(new Error(`healer exited before ready (${String(code)}): ${stdout}${stderr}`))
    result.resolve(code === 0 && stdout.trim() === 'ok' ? 'ok' : `failed (${String(code)}): ${stdout}${stderr}`)
  })
  return {
    ready: ready.promise,
    start: () => {
      child.send('go', (error) => {
        if (error !== null) result.resolve(`send error: ${error.message}`)
      })
    },
    result: result.promise,
  }
}

describe('healProfilesModuleFallback under concurrency', () => {
  it('publishes one complete fallback link for every concurrent healer', async () => {
    const anchor = stageInstallation()
    const home = mkdtempSync(join(tmpdir(), 'dsh-heal-home-'))
    try {
      const healers = Array.from({ length: CONCURRENCY }, () => startHealer(anchor, home))
      await Promise.all(healers.map(healer => healer.ready))
      for (const healer of healers) healer.start()
      const results = await Promise.all(healers.map(healer => healer.result))
      for (const result of results) expect(result, result).toBe('ok')
      const fallback = join(home, 'profiles', 'node_modules')
      expect(lstatSync(join(fallback, 'dsh-app')).isSymbolicLink()).toBe(true)
      expect(readdirSync(fallback)).toEqual(['dsh-app'])
    } finally {
      rmSync(home, { recursive: true, force: true })
      rmSync(dirname(dirname(anchor)), { recursive: true, force: true })
    }
  }, 60_000)
})
```

- [ ] **Step 2: Write the child IPC fixture**

```javascript
const [profileUrl, anchor, home] = process.argv.slice(2)

try {
  const { healProfilesModuleFallback } = await import(profileUrl)
  if (process.send === undefined) throw new Error('heal-concurrent fixture requires IPC')
  process.once('message', (message) => {
    try {
      if (message !== 'go') throw new Error(`unexpected parent message: ${JSON.stringify(message)}`)
      healProfilesModuleFallback(anchor, home)
      process.stdout.write('ok\n')
    } catch (error) {
      process.stdout.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    } finally {
      if (process.connected) process.disconnect()
    }
  })
  process.send('ready')
} catch (error) {
  process.stdout.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
```

- [ ] **Step 3: Prove RED three times without changing production code**

Run this exact command three separate times:

```powershell
pnpm exec vitest run packages/boot/app-boot/tests/heal-concurrent.spec.ts --reporter=verbose
```

Expected for all three runs: nonzero exit with a child result containing the original concurrent-publication failure (`exists and is not a symlink` or junction `EEXIST`), never a 60-second timeout, import error, or fixture error. Any pass or unrelated failure invalidates the regression design and stops implementation.

---

### Task 3: Apply the minimal staged-publication implementation and prove GREEN

**Files:**
- Modify: `packages/boot/app-boot/src/profile.ts:25-30`
- Modify: `packages/boot/app-boot/src/profile.ts:168-208`

**Interfaces:**
- Consumes: existing private `ensureSymlink(link: string, target: string): void`.
- Produces: private staged junction named `.<basename>.<pid>.<12 hex chars>`, atomically published with `renameSync()`.

- [ ] **Step 1: Add only the two required Node imports**

```typescript
import { randomBytes } from 'node:crypto'
import {
  existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
```

- [ ] **Step 2: Replace only the direct-publication tail of `ensureSymlink()`**

Keep the existing lstat, correct-link return, real-directory error, and wrong-link unlink behavior. Replace the final `try { symlinkSync(target, link, 'junction') ... }` block with:

```typescript
  const temp = join(dirname(link), `.${basename(link)}.${process.pid}.${randomBytes(6).toString('hex')}`)
  symlinkSync(target, temp, 'junction')
  try {
    renameSync(temp, link)
  } catch (error) {
    /* v8 ignore next 5 -- the publish race needs a concurrent healer and is not stageable from the public API */
    try {
      unlinkSync(temp)
    } catch { /* an unlinkSync failure on this process's own staged junction */ }
    if (existsSync(link) && lstatSync(link).isSymbolicLink() && readlinkSync(link) === target) return
    throw error
  }
```

- [ ] **Step 3: Prove GREEN three times**

Run this exact command three separate times:

```powershell
pnpm exec vitest run packages/boot/app-boot/tests/heal-concurrent.spec.ts --reporter=verbose
```

Expected for all three runs: 1 file and 1 test pass within the unchanged 60-second ceiling. Any failure stops integration; do not rerun to replace it.

- [ ] **Step 4: Run the focused Profile regressions**

```powershell
pnpm exec vitest run packages/boot/app-boot/tests/heal-concurrent.spec.ts packages/boot/app-boot/tests/profile.spec.ts apps/cli/tests/profile-boot.spec.ts
git diff --check
```

Expected: 3 files and 16 tests pass; diff check exits 0.

#### Controller execution amendment: concurrent initial Profile files

The first patched package-boundary run stopped with `Unexpected end of JSON
input` while one process read a fresh Profile manifest that another process was
still writing. This is a separate product race, not a retry of the fallback-link
test. The controller added:

- `packages/boot/app-boot/tests/init-concurrent.spec.ts`;
- `packages/boot/app-boot/tests/fixtures/init-concurrent.mjs`;
- private `writeFileIfMissing()` in `profile.ts`, using a private complete file
  plus atomic no-overwrite hard-link publication for `package.json`,
  `cordis.patch.yml`, and `pnpm-workspace.yaml`.

The synchronized eight-writer/one-observer regression failed 3/3 on direct
writes with truncated JSON and passed 3/3 after the minimal fix. The DSH branch
therefore contains two reviewed local commits rather than the originally
planned one:

```text
d86d5de4da964a5ac9904cca142b8b49052403c3 fix: publish Profile fallback links atomically
74070e06adbea2f8facbc858f261340dcc3c99fb fix: publish initial Profile files atomically
```

---

### Task 4: Verify the real built DSH path and review the local DSH commit

**Files:** none beyond Task 2 and Task 3.

**Interfaces:**
- Consumes: source-level GREEN candidate.
- Produces: official built CLI evidence, two reviewed local DSH commits, and no upstream action.

- [ ] **Step 1: Run typecheck, official build, and focused config-dump checks**

```powershell
pnpm run typecheck
pnpm run build
pnpm exec vitest run --config vitest.e2e.config.ts apps/cli/tests/built-bin.e2e.ts -t 'config dump'
```

Expected: typecheck and build exit 0; 3 config-dump tests pass and the other built-bin cases are skipped by the name filter.

- [ ] **Step 2: Run three fixed built CLI concurrency rounds**

For each round `1..3`, create a new home below `D:\DevData\tianwen-profile-cold-boot-natural-02\dsh-salvage-validation`, set `DSH_HOME` to that home, and start eight hidden processes together:

```powershell
$bin = 'D:\DevData\tianwen-profile-cold-boot-natural-02\dsh-salvage\apps\cli\lib\bin.js'
$env:DSH_HOME = $roundHome
$processes = 0..7 | ForEach-Object {
  Start-Process -FilePath (Get-Command node).Source -ArgumentList @($bin, 'web', '--help') -WorkingDirectory 'D:\DevData\tianwen-profile-cold-boot-natural-02\dsh-salvage' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $roundRoot "process-$_.stdout.txt") -RedirectStandardError (Join-Path $roundRoot "process-$_.stderr.txt")
}
$processes | Wait-Process
```

For every round require all eight exit codes to be 0, every stdout to contain `Usage: dsh --profile web`, every stderr to be empty, exactly 233 reparse-point links below `profiles\node_modules`, and no entry matching `^\..+\.\d+\.[0-9a-f]{12}$`. Preserve all 24 results. One failure stops integration.

- [ ] **Step 3: Verify boot-free dump from another fresh home**

```powershell
$env:DSH_HOME = $dumpHome
& node $bin web --dump-config 1> $dumpStdout 2> $dumpStderr
$LASTEXITCODE
Test-Path -LiteralPath (Join-Path $dumpHome 'profiles\node_modules')
```

Expected: exit 0, nonempty config output, empty stderr, and `Test-Path` is `False`.

- [ ] **Step 4: Review and commit only the three intended DSH files**

```powershell
git status --short
git diff -- packages/boot/app-boot/src/profile.ts packages/boot/app-boot/tests/heal-concurrent.spec.ts packages/boot/app-boot/tests/fixtures/heal-concurrent.mjs
git diff --check
git add -- packages/boot/app-boot/src/profile.ts packages/boot/app-boot/tests/heal-concurrent.spec.ts packages/boot/app-boot/tests/fixtures/heal-concurrent.mjs
git commit -m 'fix: publish Profile fallback links atomically'
git status --short --branch
git rev-parse HEAD
```

Reject the commit if it contains a timeout increase, command retry, production test hook, unrelated refactor, dependency change, or any file outside the three paths.

---

### Task 5: Carry the fix in Tianwen's exact rc.7 package boundary

**Files:**
- Create: `patches/@deepseek-ai__dsh-app-boot@0.1.0-rc.7.patch`
- Create: `tests/dsh-migration/profile-concurrent-boot.mjs`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml`
- Preserve unchanged: `patches/@deepseek-ai__dsh@0.1.0-rc.7.patch`

**Interfaces:**
- Consumes: reviewed local DSH source commit and published `@deepseek-ai/dsh-app-boot@0.1.0-rc.7/lib/index.js`.
- Produces: one exact transitive pnpm patch and one Windows built-product regression invoked directly by the Windows shell.

- [ ] **Step 1: Write the Tianwen built-product RED regression first**

Create one Windows-only standalone Node check. It resolves the installed built
DSH CLI, creates a fresh home under
`D:/DevData/tianwen-v0.1-eval-fixtures`, launches eight `web --help` processes
together, retains the 120-second per-child ceiling, and requires 8/8 exit 0,
usage output, empty stderr, exactly 505 fallback junctions, and no staged
entries. Cleanup uses awaited `fs/promises.rm`.

Controller amendment after the first patched GREEN: the original test revision
used `os.tmpdir()` on `C:` and timed out at 120 seconds with 138/506 links and
eight staged entries. The same exact package and eight processes completed on
a fresh `D:` home in 8.438 seconds with 506 links and no staged entry. Preserve
that failed GREEN, apply only the D:-hosted fixture-parent change above, and
restart the entire three-RED/three-GREEN sequence. Do not increase the timeout,
reduce concurrency, or count the diagnostic as GREEN.

The first D:-hosted GREEN then proved all CLI children had exited while
synchronous recursive cleanup was still deleting junctions; it timed out with
191/506 links remaining. An asynchronous standard-library `rm()` deleted a full
506-link diagnostic home in 0.122 seconds. Preserve that failed result, replace
only `rmSync` with awaited `fs/promises.rm`, and restart the full
RED/GREEN sequence once more. The 120-second ceiling remains unchanged.

The awaited-cleanup Vitest revision still timed out because all eight children
remained active. Direct ordinary Node completed the same exact controller on
the same `D:` root in 7.815--8.842 seconds, while both Vitest descendants and
`pnpm exec node` reproduced the slowdown. Also preserve those failures. Reject
the runner-distorted Vitest test and invoke the standalone product check with
direct `node`; retain the deterministic source Vitest regression as the
code-level race proof. The earlier 506-link readings included rejected
`content-type`/`negotiator` lock refreshes; the restored exact rc.7 surface is
505.

- [ ] **Step 2: Prove Tianwen RED three times before adding the app-boot patch**

Run this exact command three separate times on Windows:

```powershell
node tests/dsh-migration/profile-concurrent-boot.mjs
```

Expected: every run fails through one or more ordinary CLI exits containing the original junction-publication error. A pass or a 120-second timeout stops patch integration and reopens the regression design.

- [ ] **Step 3: Generate the exact app-boot patch**

Use pnpm's patch workflow against `@deepseek-ai/dsh-app-boot@0.1.0-rc.7`. Modify only `lib/index.js`; carry both reviewed atomic-publication fixes:

```javascript
import { randomBytes } from "node:crypto";
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
```

Also publish each missing initial Profile file from a complete private file via
`linkSync(temp, final)`, treating an already published final file as the winning
initializer and always removing the private file. Do not overwrite an existing
user-owned file.

Replace the direct `symlinkSync(target, link, "junction")` publication tail with the built JavaScript equivalent of the reviewed source implementation:

```javascript
	const temp = join(dirname(link), `.${basename(link)}.${process.pid}.${randomBytes(6).toString("hex")}`);
	symlinkSync(target, temp, "junction");
	try {
		renameSync(temp, link);
	} catch (error) {
		try {
			unlinkSync(temp);
		} catch {}
		if (existsSync(link) && lstatSync(link).isSymbolicLink() && readlinkSync(link) === target) return;
		throw error;
	}
```

Commit the patch directory with `pnpm patch-commit`, producing `patches/@deepseek-ai__dsh-app-boot@0.1.0-rc.7.patch` plus the matching `patchedDependencies` and lockfile binding. Verify no package version changed and the existing CLI patch is byte-identical.

- [ ] **Step 4: Prove Tianwen GREEN three times**

```powershell
pnpm install --frozen-lockfile
node tests/dsh-migration/profile-concurrent-boot.mjs
```

Run the Node command three separate times. Expected: all eight launches and the
505-link surface pass in every run; no failure is rerun away. Add that direct
Node command to the Windows CI shell before its Vitest installer suite.

Actual final samples after both fixes: 8/8 with 505 links in 7835 ms, 7862 ms,
and 7847 ms. The app-boot patch SHA-256 is
`712b5501c7657d9df49baedfec33c31c042a668c3501361c9766f92a12d553ad`;
the pre-existing CLI dump patch remains byte-identical at
`5542c030bc6f1ad2dca8007d22de62cd330e29d553b09779985df9a24133c83f`.

- [ ] **Step 5: Run Tianwen focused and repository gates**

```powershell
node tests/dsh-migration/profile-concurrent-boot.mjs
pnpm exec vitest run tests/dsh-migration/controlled-lifecycle-profile.spec.ts tests/dsh-migration/runtime-profile.spec.ts tests/dsh-migration/tianwen-installer.spec.ts
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm run typecheck
pnpm run test:dsh
pnpm run check
git diff --check
```

Expected: every command exits 0. The Windows-only concurrency check runs on
the local Windows controller and exact-main Windows CI before integration.

Actual local gates:

- focused Profile/installer group: 50 passed, 3 skipped;
- first unconfigured `pnpm run check`: invalid controller invocation, 87 failed
  because the documented `TIANWEN_DSH_PROBE_ROOT` and
  `TIANWEN_DSH_PROBE_PYTHON` were omitted; this result is retained and was not
  classified as a product failure;
- first correctly configured `pnpm run check`: 52 files passed, 2 skipped;
  668 tests passed, 8 skipped;
- Ruff and compileall: exit 0;
- first Python suite after the CI edit: 607 passed, 4 skipped, 1 contract
  failure because the exact Windows-job expectation still described the old
  command; after updating that existing contract, the focused file passed
  25/25 and the full suite passed 608 with 4 skips;
- exact Windows installer Vitest group: 4 files and 109 tests passed.

---

### Task 6: Verify official installation, review, and perform controlled Tianwen integration

**Files:**
- Create after successful gates: `docs/operations/tianwen-profile-concurrent-boot-salvage-handoff.md`
- Modify only through controlled merge: Tianwen branch history.

**Interfaces:**
- Consumes: exact app-boot patch, Tianwen regression, and clean repository gates.
- Produces: official installed-product evidence, exact feature SHA, exact main SHA, and exact-main CI result.

- [ ] **Step 1: Run the official installer once on a fresh D:-hosted product**

Use a new product root and evidence root below `D:\DevData\tianwen-profile-cold-boot-natural-02\salvage-installed-product`. Do not reuse or modify the natural-run installation. Verify the installer receipt and that the installed app-boot `lib/index.js` contains the pnpm-patched staged-publication behavior.

- [ ] **Step 2: Run the installed product concurrency and dump boundaries**

From three fresh D:-hosted installed-product DSH homes, run eight installed `dsh web --help` processes together and require 24/24 exit 0, usage output, empty stderr, the official managed host's complete 510-link fallback surface, and no staged entries. On the installed `tianwen` Profile, require `dsh --profile tianwen --dump-config` exit 0 with the shared `profiles/node_modules` fallback absent before and after. These are controller product checks, not natural evidence and not Provider billing facts. Do not substitute the DSH source build's 233-link or workspace package's 505-link surface for this managed-host fact.

Actual official product root:
`D:\DevData\tianwen-profile-cold-boot-natural-02\official-install-controller-salvage-01`.
The installer returned `status=ready`, exact DSH `0.1.0-rc.7`, and Runtime
archive digest
`sha256:56001f3af96eb17a36c3688a212537ce70b4fdcbbee3d1e30b654b0b16264cb8`.
The first installed-product check correctly stopped after 8/8 processes
succeeded but the workspace-only 505-link expectation saw the managed host's
510 links. After making that expected surface explicit, the three fixed rounds
passed 24/24 in 8771 ms, 8502 ms, and 8468 ms with no staged entry. Installed
`dsh --profile tianwen --dump-config` exited 0 in 180 ms and left the shared
fallback absent.

- [ ] **Step 3: Review exact ownership and simplicity**

Require all of the following:

```text
DSH local branch: one source file + two regressions + two fixtures in two local commits
Tianwen: one exact app-boot patch + one Windows product regression + pnpm binding
Existing exact dsh CLI dump patch: unchanged
Provider/model calls: zero
External DSH actions: zero
Historical natural result: task-incomplete
```

- [ ] **Step 4: Commit the Tianwen feature and write the operation handoff**

Commit only the approved files with message `fix: make DSH Profile fallback publication atomic`. The handoff must report separately: historical task result, controller runtime evidence, learning facts, integration facts, exact local DSH SHA, exact Tianwen feature SHA, uncertainty, and zero external publication.

- [ ] **Step 5: Controlled merge and exact-main CI**

Merge the reviewed feature into current Tianwen main without pushing DSH upstream. Verify local main equals the intended merge SHA, push only the Tianwen main branch under its existing authorization, and wait for the CI run whose head SHA exactly equals that main SHA. Report Python, TypeScript, installer-windows, and the exact run URL/result; do not claim completion from a feature-branch or stale run.

## Completion Criteria

- The focused source regression fails three out of three times on the frozen parent for the expected publication race and passes three out of three times on the candidate.
- DSH focused tests, typecheck, build, built dump tests, 24/24 product launches, complete link surfaces, and boot-free dump all pass.
- Two reviewed local DSH commits exist and are not pushed.
- Tianwen reproducibly patches exact `@deepseek-ai/dsh-app-boot@0.1.0-rc.7` while preserving its exact CLI dump patch.
- Tianwen focused tests, full repository gates, official installed product, controlled merge, and exact-main CI pass.
- The second natural task remains `task-incomplete`, learning remains `no-case`, and no Provider cost or upstream publication is claimed.
