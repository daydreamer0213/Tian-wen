# Tianwen DSH rc.2 Compatibility Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine, in an isolated candidate branch, whether Tianwen's workspace Runtime and managed-style Profile composition can move from DeepSeek Harness `0.1.0-rc.7` to exact `0.1.1-rc.2`, and produce an evidence-backed patch and blocker verdict without claiming that the formal installer or portable plugin has already migrated.

**Architecture:** Treat DSH as Tianwen's replaceable public runtime substrate, not code to fork. Upgrade only current dependency and runtime-compatibility declarations, preserve the two proven Profile boundaries with exact-version pnpm patches where upstream still lacks them, and exercise public package roots plus real offline Profile processes. Record portable stock-Profile composition gaps for the next plan; do not solve portable distribution, the managed installer, or Desktop here.

**Tech Stack:** TypeScript, Node.js 22, pnpm 11.20.0, Vitest, DeepSeek Harness `0.1.1-rc.2`, pnpm exact-version patches, PowerShell, Git.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-08-27-tianwen-portable-dsh-plugin-and-optional-desktop-design.md`.
- The exact DSH target is `0.1.1-rc.2`, release tag `dsh-v0.1.1-rc.2`, Git commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. Do not follow npm `latest` or a moving upstream branch.
- Work only in a new branch and worktree rooted at `D:\DevData\tianwen-worktrees\tianwen-dsh-rc2-compat-spike`. The candidate must not mutate the current managed Tianwen product, any user DSH home/Profile, or historical Activity, Evidence, debug, and legacy data.
- Put the pnpm store, npm cache, temporary files, generated Profile homes, packages, and probe output under `D:\DevData\tianwen-dsh-rc2-spike`. Do not create a new large cache or dependency tree on `C:`.
- This is a Provider-offline compatibility spike. Exact rc.2 dependency acquisition and read-only upstream Git checks may use the network; after the pnpm store is warm, Profile behavior probes run offline. Do not call DeepSeek or another Provider, set `TIANWEN_RUN_LIVE_MODEL_TESTS=1`, invoke a live model smoke, run a Natural Task, run `controlled-lifecycle`, or create another controlled Activity.
- Do not update `scripts/install-tianwen.mjs`, the installed product root, README version claims, architecture version claims, release metadata, npm, GitHub Releases, or DSH upstream. Those belong to later gated plans.
- Do not bulk-replace `0.1.0-rc.7`. Historical operation documents, receipts, controlled-evaluation contracts, and their fixture tests must retain the version that produced them.
- Keep `@deepseek-ai/cordis-plugin-hmr@1.0.16` and its current Tianwen patch unless the real shutdown probe disproves compatibility. Keep `allowBuilds['@deepseek-ai/dsh-subprocess-local']=false`.
- Use only public DSH package-root imports in Tianwen source. `pnpm run check:no-private-dsh-imports` is a hard gate.
- A failure is a result, not permission for broad repair. If rc.2 changes a public API beyond the exact version declarations and the two known Profile patches, stop the affected task, record the smallest reproducer, and classify the spike as blocked before designing a new compatibility adapter.
- Do not add a compatibility framework, second Session/Profile implementation, retry system, telemetry subsystem, migration database, desktop adapter, or Tianwen-specific Web UI.
- Do not merge or push the candidate branch as part of this plan. Its final output is a reviewed compatibility verdict that authorizes or blocks the next plan.

## File Responsibility Map

### Current dependency and compatibility declarations

- `package.json`
- `packages/tianwen-dsh-compat/package.json`
- `packages/tianwen-dsh-host/package.json`
- `packages/tianwen-dsh-probe-bundle/package.json`
- `packages/tianwen-profile-host/package.json`
- `packages/tianwen-runtime-bundle/package.json`
- `packages/tianwen-dsh-compat/src/index.ts`
- `packages/tianwen-dsh-compat/src/runtime.ts`
- `packages/tianwen-runtime/src/index.ts`
- `packages/tianwen-runtime-bundle/src/resume.ts`
- `scripts/check-dsh-install.mjs`
- `scripts/verify-dsh-profile.mjs`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

### Exact DSH patch boundaries

- Retain as historical source: `patches/@deepseek-ai__dsh@0.1.0-rc.7.patch`
- Retain as historical source: `patches/@deepseek-ai__dsh-app-boot@0.1.0-rc.7.patch`
- Create only when the corresponding disposition is `port`: `patches/@deepseek-ai__dsh@0.1.1-rc.2.patch`
- Create only when the corresponding disposition is `port`: `patches/@deepseek-ai__dsh-app-boot@0.1.1-rc.2.patch`
- Keep unchanged: `patches/@deepseek-ai__cordis-plugin-hmr@1.0.16.patch`

### Focused compatibility tests and probes

- `tests/dsh-probe/install-closure.spec.ts`
- `tests/dsh-probe/public-surface.spec.ts`
- Rename `tests/dsh-probe/rc7-reuse-surface.spec.ts` to `tests/dsh-probe/dsh-public-reuse-surface.spec.ts`
- `tests/dsh-migration/runtime-bundle.spec.ts`
- `tests/dsh-migration/runtime-composition.spec.ts`
- `tests/dsh-migration/runtime-profile.spec.ts`
- `tests/dsh-migration/one-shot-profile-lifecycle.spec.ts`
- `tests/dsh-migration/profile-concurrent-boot.mjs`
- Create: `tests/dsh-migration/jsonl-forward-compat.ts`
- Create: `tests/dsh-migration/profile-startup-timing.mjs`
- Create: `tests/dsh-migration/profile-module-identity.mjs`
- `tests/dsh-migration/runtime-session-evidence.spec.ts`
- `tests/dsh-migration/goal-create.spec.ts`
- `tests/dsh-migration/goal-resume.spec.ts`

### Evidence output

- Create: `docs/operations/tianwen-dsh-rc2-compatibility-spike-handoff.md`
- Generate outside Git: `D:\DevData\tianwen-dsh-rc2-spike\evidence\`
- Generate outside Git: `D:\DevData\tianwen-dsh-rc2-spike\packs\`

### Explicitly deferred files

- `scripts/install-tianwen.mjs` — managed installer migration belongs to phase three.
- `README.md`, `README.zh-CN.md`, `CONTRIBUTING.md`, `docs/tianwen-architecture-overview-v2.md` — update only after a formal migration is integrated.
- `packages/tianwen-runtime-bundle/src/status.ts` — arbitrary Profile state-root support belongs to portable plugin productization.
- `packages/tianwen-runtime-bundle/cordis.patch.yml` dependency ownership and runner composition — portable stock-Profile work belongs to phase two.
- Existing-Profile install failure rollback, uninstall, and persistent-state preservation — portable plugin lifecycle acceptance belongs to phase two and is not claimed by this spike.
- `packages/tianwen-evolution/src/{skill-evaluation,controlled-skill-evaluation,controlled-skill-shadow}.ts` and controlled-lifecycle receipt files — frozen historical protocols.

---

## Task 0: Create the isolated authority and baseline

**Files:**

- Read: `docs/superpowers/specs/2026-08-27-tianwen-portable-dsh-plugin-and-optional-desktop-design.md`
- Read: `docs/superpowers/plans/2026-08-27-tianwen-dsh-rc2-compatibility-spike.md`
- Create: `tests/dsh-migration/jsonl-forward-compat.ts`
- Generate: `D:\DevData\tianwen-dsh-rc2-spike\evidence\baseline.txt`
- Generate: `D:\DevData\tianwen-dsh-rc2-spike\jsonl-forward\`

- [ ] **Step 1: Use the worktree isolation skill**

  Read and follow `using-git-worktrees` before creating the candidate. Create branch
  `codex/tianwen-dsh-rc2-compat-spike` from the exact main commit containing this plan at:

  ```text
  D:\DevData\tianwen-worktrees\tianwen-dsh-rc2-compat-spike
  ```

  Do not reuse the architecture worktree for implementation.

- [ ] **Step 2: Record repository authority without changing it**

  In the candidate worktree, record `git status --short --branch`, `git rev-parse HEAD`,
  `git rev-parse main`, and `git rev-parse origin/main` in the external baseline file. Expected:
  the candidate starts from the plan commit and has a clean tree. A stale `origin/main` is recorded,
  not silently treated as authority and not fixed by pulling.

- [ ] **Step 3: Create the D-drive execution environment**

  Use these process settings for every install, build, and probe in this plan:

  ```powershell
  $env:COREPACK_HOME = 'D:\DevData\corepack-home'
  $env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\tianwen-dsh-rc2-spike\pnpm-store'
  $env:PNPM_CONFIG_CACHE_DIR = 'D:\DevData\tianwen-dsh-rc2-spike\pnpm-cache'
  $env:NPM_CONFIG_CACHE = 'D:\DevData\tianwen-dsh-rc2-spike\npm-cache'
  $env:TEMP = 'D:\DevData\tianwen-dsh-rc2-spike\temp'
  $env:TMP = 'D:\DevData\tianwen-dsh-rc2-spike\temp'
  $env:DSH_TELEMETRY_DISABLED = '1'
  $env:TIANWEN_RUN_LIVE_MODEL_TESTS = '0'
  New-Item -ItemType Directory -Force `
    'D:\DevData\tianwen-dsh-rc2-spike\temp', `
    'D:\DevData\tianwen-dsh-rc2-spike\evidence', `
    'D:\DevData\tianwen-dsh-rc2-spike\packs' | Out-Null
  ```

  Use the retained pnpm binary exactly:

  ```powershell
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs --version
  node --version
  ```

  Expected: pnpm `11.20.0`, Node `v22.x`, and all generated roots on `D:`.

- [ ] **Step 4: Verify the immutable upstream target**

  Read-only check:

  ```powershell
  git ls-remote https://github.com/deepseek-ai/deepseek-harness.git `
    'refs/tags/dsh-v0.1.1-rc.2' `
    'refs/tags/dsh-v0.1.1-rc.2^{}'
  ```

  Expected peeled tag commit: `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. If the remote
  response cannot prove that identity, stop before changing dependency files.

- [ ] **Step 5: Freeze one synthetic rc.7 JSONL Session before upgrading dependencies**

  Create `tests/dsh-migration/jsonl-forward-compat.ts` with exactly two modes selected by
  `TIANWEN_DSH_JSONL_MODE=generate|verify` and one required external root selected by
  `TIANWEN_DSH_JSONL_ROOT`. Both modes use only public Tianwen compatibility exports and the
  existing ScriptedAdapter; neither mode sends a model request.

  `generate` must:

  - require `DSH_VERSION === '0.1.0-rc.7'`;
  - create fixed Session `session:tianwen-rc7-jsonl-forward` with `mountGoalHarness`;
  - create and flush one active Goal, then dispose the first process context;
  - locate its `session.jsonl` and write `fixture-meta.json` outside the Session directory with the
    source version, Session ID, Goal ID/revision, relative log path, byte length, and SHA-256;
  - contain no user data, Provider configuration, credential, or historical Activity content.

  Run it before editing any dependency declaration:

  ```powershell
  $env:TIANWEN_DSH_JSONL_MODE = 'generate'
  $env:TIANWEN_DSH_JSONL_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\jsonl-forward'
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec tsx tests/dsh-migration/jsonl-forward-compat.ts
  ```

  Expected: metadata says rc.7 and the referenced JSONL file hash matches. Do not regenerate this
  fixture after Task 1 changes the workspace to rc.2.

---

## Task 1: Build an unpatched exact-rc.2 dependency candidate

**Files:**

- Modify: `package.json`
- Modify: `packages/tianwen-dsh-compat/package.json`
- Modify: `packages/tianwen-dsh-host/package.json`
- Modify: `packages/tianwen-dsh-probe-bundle/package.json`
- Modify: `packages/tianwen-profile-host/package.json`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `packages/tianwen-dsh-compat/src/index.ts`
- Modify: `packages/tianwen-dsh-compat/src/runtime.ts`
- Modify: `packages/tianwen-runtime/src/index.ts`
- Modify: `packages/tianwen-runtime-bundle/src/resume.ts`
- Modify: `scripts/check-dsh-install.mjs`
- Modify: `scripts/verify-dsh-profile.mjs`
- Modify: `tests/dsh-probe/install-closure.spec.ts`
- Modify: `tests/dsh-probe/goal-recovery.spec.ts`
- Modify: `tests/dsh-probe/profile.spec.ts`
- Modify: `tests/dsh-probe/public-surface.spec.ts`
- Modify: `tests/dsh-probe/sandbox.e2e.spec.ts`
- Rename: `tests/dsh-probe/rc7-reuse-surface.spec.ts` → `tests/dsh-probe/dsh-public-reuse-surface.spec.ts`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `tests/dsh-migration/runtime-composition.spec.ts`
- Modify: `tests/dsh-migration/runtime-governance.spec.ts`
- Modify: `tests/dsh-migration/runtime-profile.spec.ts`
- Modify: `tests/dsh-migration/one-shot-profile-lifecycle.spec.ts`
- Modify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`
- Modify: `tests/dsh-migration/goal-resume.spec.ts`
- Modify: `pnpm-workspace.yaml`
- Regenerate: `pnpm-lock.yaml`

- [ ] **Step 1: Change only current-version test expectations first**

  Update active compatibility assertions from rc.7 to rc.2. Representative assertions:

  ```ts
  expect(DSH_VERSION).toBe('0.1.1-rc.2')
  expect(SUPPORTED_DSH_VERSION).toBe('0.1.1-rc.2')
  expect(report.expectedDshVersion).toBe('0.1.1-rc.2')
  expect(new Set(report.installedPackages.map(item => item.version)))
    .toEqual(new Set(['0.1.1-rc.2']))
  provider: '@deepseek-ai/dsh-sandbox-local@0.1.1-rc.2'
  ```

  Rename the reuse test and change only its description:

  ```ts
  describe('DSH rc.2 reusable public seams', () => {
  ```

  Do not touch rc.7 expectations in controlled-evaluation, controlled-lifecycle, Activity, receipt,
  managed-installer, or historical evidence tests.

- [ ] **Step 2: Run the version contract tests and observe RED**

  ```powershell
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run `
    tests/dsh-probe/install-closure.spec.ts `
    tests/dsh-probe/public-surface.spec.ts `
    tests/dsh-migration/runtime-composition.spec.ts
  ```

  Expected: failures show current rc.7 pins/constants rather than missing modules or unrelated test
  breakage. Save the concise failure summary under the external evidence root.

- [ ] **Step 3: Update exactly the six current manifests**

  Change every `@deepseek-ai/dsh*` version in the six manifests listed above to exact
  `0.1.1-rc.2`. Do not widen to a semver range. Preserve the current Cordis versions and
  `allowBuilds` policy.

  Expected manifest form:

  ```json
  "@deepseek-ai/dsh-agent": "0.1.1-rc.2"
  ```

  Confirm the count remains 54 exact DSH pins across those manifests. A changed count requires a
  reviewed explanation; do not silently add or remove a DSH package.

- [ ] **Step 4: Update only current runtime version gates**

  Apply the exact value in current contracts:

  ```ts
  export const DSH_VERSION = '0.1.1-rc.2' as const
  export const SUPPORTED_DSH_VERSION = '0.1.1-rc.2' as const
  const DSH_VERSION = '0.1.1-rc.2'
  ```

  Apply the same exact value to `EXPECTED_DSH_VERSION` in `scripts/check-dsh-install.mjs` and both
  active rc.2 assertions in `scripts/verify-dsh-profile.mjs`. Do not edit the managed installer's
  rc.7 baseline and do not edit historical receipt types.

- [ ] **Step 5: Temporarily unbind the old exact-version DSH patches**

  Remove only these two mappings from `pnpm-workspace.yaml`:

  ```yaml
  '@deepseek-ai/dsh-app-boot@0.1.0-rc.7': patches/@deepseek-ai__dsh-app-boot@0.1.0-rc.7.patch
  '@deepseek-ai/dsh@0.1.0-rc.7': patches/@deepseek-ai__dsh@0.1.0-rc.7.patch
  ```

  Keep both rc.7 patch files in Git for historical traceability. Keep the HMR patch mapping.

- [ ] **Step 6: Regenerate, never hand-edit, the lockfile**

  ```powershell
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs install
  ```

  Expected: all six workspace importers resolve exact rc.2 DSH packages, no rc.7 DSH package is
  reachable from current workspace importers, and the store is under the spike root on `D:`.

- [ ] **Step 7: Remove legacy fallback roots from the active Profile tests**

  In `runtime-profile.spec.ts`, stop hard-coding and re-injecting
  `D:/DevData/tianwen-dsh-probe`. Derive a file-specific root from the caller's parent:

  ```ts
  const probeParent = process.env.TIANWEN_DSH_PROBE_ROOT
    ?? 'D:/DevData/tianwen-test-fixtures'
  const probeRoot = resolve(probeParent, 'runtime-profile')
  ```

  Keep `{ ...process.env, TIANWEN_DSH_PROBE_ROOT: probeRoot, ...env }` so the two invalid-root tests
  can still override it deliberately, but normal callers can no longer be redirected to the old
  probe directory.

  In `one-shot-profile-lifecycle.spec.ts`, remove the legacy
  `D:/DevData/tianwen-v0.1-eval-fixtures` fallback:

  ```ts
  const fixtureParent = process.env.TIANWEN_DSH_PROBE_ROOT
    ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-test-fixtures' : tmpdir())
  const FIXTURE_BASE = resolve(fixtureParent, 'one-shot-profile')
  ```

  The spike commands always supply a parent under `D:\DevData\tianwen-dsh-rc2-spike`; the generic
  fallback is only for ordinary local test runs and is not a historical evidence directory.

  Apply the same parent rule to the remaining active tests that currently write under
  `D:/DevData/tianwen-dsh-probe`:

  - `tests/dsh-migration/runtime-bundle.spec.ts`
  - `tests/dsh-migration/runtime-governance.spec.ts`
  - `tests/dsh-migration/tianwen-startup.e2e.spec.ts`
  - `tests/dsh-probe/goal-recovery.spec.ts`
  - `tests/dsh-probe/install-closure.spec.ts`
  - `tests/dsh-probe/public-surface.spec.ts`
  - `tests/dsh-probe/sandbox.e2e.spec.ts`

  Each derives its own named child of `process.env.TIANWEN_DSH_PROBE_ROOT ??
  'D:/DevData/tianwen-test-fixtures'`. Update `tests/dsh-probe/profile.spec.ts` to assert the new
  verifier contract. Do not edit `scripts/dsh_probe_alpha_a1_evaluator.py` or historical operation
  paths. A final `rg` must show that no enabled TypeScript test writes the old probe root.

  Complete the matching verifier change in `scripts/verify-dsh-profile.mjs` in this same step,
  before any Task 2 real-process command:

  - require `TIANWEN_DSH_PROBE_ROOT` and, on Windows, accept only a syntactic and realpath strict
    child of `D:\DevData`;
  - derive the fixed tarball boundary from the supplied root instead of the legacy constant;
  - remove a stale report only after root validation and only inside the selected root;
  - put pnpm home/store/cache, npm cache, temp, app data, disposable user profile, packs, DSH home,
    and virtual stores under the selected root on Windows too;
  - update the reported paths and `profile.spec.ts` expectations to the selected root;
  - change the invalid-empty-root test to prove that an already authorized report is left untouched,
    while a valid-root early failure still invalidates its own stale report.

  Task 2 Step 7 contains the exact reference implementation and serves as the review checklist; it
  does not authorize postponing these changes until after the unpatched baselines.

- [ ] **Step 8: Prove the unpatched public surface and build candidate**

  ```powershell
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs --filter @tianwen/runtime-bundle... build
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run typecheck
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run check:dsh-install
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run check:no-private-dsh-imports
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run `
    tests/dsh-probe/install-closure.spec.ts `
    tests/dsh-probe/public-surface.spec.ts `
    tests/dsh-probe/dsh-public-reuse-surface.spec.ts `
    tests/dsh-migration/runtime-bundle.spec.ts `
    tests/dsh-migration/runtime-composition.spec.ts
  ```

  Expected: build, exact install closure, and public-root API checks pass. A public API compile/load
  failure stops the plan for review; do not mask it with a private-source import.

  Review every remaining `0.1.0-rc.7` occurrence. It must belong to one of these frozen categories:
  the managed installer and its tests, controlled/evaluation protocol code and fixtures, or
  historical documentation/evidence. Any other remaining active runtime expectation is a missed
  migration edit.

- [ ] **Step 9: Commit the dependency candidate**

  ```powershell
  git add package.json packages pnpm-workspace.yaml pnpm-lock.yaml scripts tests
  git commit -m "chore: probe DSH 0.1.1-rc.2 compatibility"
  ```

---

## Task 2: Decide and prove the two Profile boundary patches

**Files:**

- Create only for `port`: `patches/@deepseek-ai__dsh@0.1.1-rc.2.patch`
- Create only for `port`: `patches/@deepseek-ai__dsh-app-boot@0.1.1-rc.2.patch`
- Modify: `pnpm-workspace.yaml`
- Regenerate: `pnpm-lock.yaml`
- Modify: `scripts/verify-dsh-profile.mjs`
- Modify: `tests/dsh-migration/runtime-profile.spec.ts`
- Modify: `tests/dsh-migration/profile-concurrent-boot.mjs`
- Create: `tests/dsh-migration/profile-startup-timing.mjs`

- [ ] **Step 1: Capture the unpatched dump boundary failure**

  Use a fresh root and the opt-in migration test before adding either rc.2 patch:

  ```powershell
  $env:TIANWEN_DSH_MIGRATION_PROFILE = '1'
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\unpatched-profile'
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/runtime-profile.spec.ts
  ```

  Expected: the cold dump boundary fails because upstream prepare still heals the Profile module
  fallback before configuration composition. Record filesystem side effects and elapsed time. If it
  unexpectedly passes, stop and inspect the installed tarball before deciding that the patch is
  obsolete.

- [ ] **Step 2: Capture the unpatched concurrent-publication baseline**

  Before adding the app-boot patch, run three independent eight-process batches against fresh
  child roots and save each result:

  ```powershell
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\unpatched-concurrent-1'
  node tests/dsh-migration/profile-concurrent-boot.mjs
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\unpatched-concurrent-2'
  node tests/dsh-migration/profile-concurrent-boot.mjs
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\unpatched-concurrent-3'
  node tests/dsh-migration/profile-concurrent-boot.mjs
  ```

  A passing race run is not proof that the race is absent. Verify the installed rc.2 app-boot target
  against upstream blob `8f982bed80f03dc45e85070af7d5fd61320f83bc`; record both code identity and
  observed behavior.

- [ ] **Step 3: Assign an independent disposition to each patch**

  For each boundary, use exactly one value:

  - `delete` — the installed rc.2 code differs from the known rc.7 bug and every unpatched behavior
    probe passes;
  - `port` — the installed rc.2 code retains the known bug/race; a deterministic failure is required
    for dump, while the concurrency race may additionally rely on identical vulnerable source plus
    repeated stress evidence;
  - `blocked` — the old patch no longer applies cleanly or patched behavior cannot meet the contract.

  Current read-only research predicts `port` for both because the relevant upstream blobs and
  published targets are unchanged. Re-verify that fact in the installed package; do not force the
  prediction if the resolved tarball differs.

- [ ] **Step 4: Add the exact rc.2 cold-dump patch only for `port`**

  The published rc.2 target chunk is still `lib/profile-boot-DG5t9aNs.js` and is byte-identical to
  rc.7 before patching. Create the new exact-version patch with this semantic diff:

  ```diff
   function prepareProfile(name, userLayer = true) {
  -  healProfilesModuleFallback(INSTALL_ANCHOR);
   }
   function composeProfile(name, patchFiles) {
  +  healProfilesModuleFallback(INSTALL_ANCHOR);
   }
  ```

  Do not change dump composition or create a Tianwen-side config composer.

- [ ] **Step 5: Add the exact rc.2 atomic Profile publication patch only for `port`**

  The rc.2 `@deepseek-ai/dsh-app-boot` `lib/index.js` is byte-identical to the rc.7 source before
  patching. Port the existing patch without feature expansion, including the exact import additions
  for `randomBytes`, `linkSync`, and `renameSync`. Its file helper is:

  ```js
  function writeFileIfMissing(path, contents) {
    if (existsSync(path)) return;
    const temp = join(
      dirname(path),
      `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}`,
    );
    writeFileSync(temp, contents);
    try {
      linkSync(temp, path);
    } catch (error) {
      if (!existsSync(path)) throw error;
    } finally {
      unlinkSync(temp);
    }
  }
  ```

  Replace direct final-path junction creation with the exact staged publication:

  ```js
  function ensureSymlink(link, target) {
    if (existsSync(link)) {
      if (!lstatSync(link).isSymbolicLink()) {
        throw new Error(`${link} exists but is not a symlink`);
      }
      if (readlinkSync(link) === target) return;
      unlinkSync(link);
    }
    const temp = join(
      dirname(link),
      `.${basename(link)}.${process.pid}.${randomBytes(6).toString("hex")}`,
    );
    symlinkSync(target, temp, "junction");
    try {
      renameSync(temp, link);
    } catch (error) {
      try {
        unlinkSync(temp);
      } catch {}
      if (
        existsSync(link)
        && lstatSync(link).isSymbolicLink()
        && readlinkSync(link) === target
      ) return;
      throw error;
    }
  }
  ```

  Preserve the existing collision behavior: another complete winning file/link is accepted; a real
  directory, wrong target, or incomplete publication still throws.

- [ ] **Step 6: Bind the decided exact rc.2 patches and regenerate the lockfile**

  For each `port` disposition, add the corresponding mapping; for `delete`, leave it absent:

  ```yaml
  patchedDependencies:
    '@deepseek-ai/dsh-app-boot@0.1.1-rc.2': patches/@deepseek-ai__dsh-app-boot@0.1.1-rc.2.patch
    '@deepseek-ai/dsh@0.1.1-rc.2': patches/@deepseek-ai__dsh@0.1.1-rc.2.patch
  ```

  Keep the existing HMR entry. Then run:

  ```powershell
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs install
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run check:dsh-install
  ```

  Expected: the lockfile records exactly the patch mappings whose disposition is `port`, and no
  active rc.7 DSH patch binding. A `blocked` disposition stops before this install is accepted.

- [ ] **Step 7: Generalize the complete probe path contract**

  In `scripts/verify-dsh-profile.mjs`, remove every use of the old fixed probe root. On Windows,
  accept only a supplied strict child of the project-authorized development data root; the spike
  commands below still use only the dedicated rc.2 subtree:

  ```js
  const windowsDataRoot = 'D:\\DevData'

  function requireProbeRoot() {
    const value = process.env.TIANWEN_DSH_PROBE_ROOT
    if (value === undefined || value.trim() === '') {
      throw new Error('TIANWEN_DSH_PROBE_ROOT is required')
    }
    const candidate = resolve(value)
    if (process.platform === 'win32') {
      const parent = resolve(windowsDataRoot)
      if (candidate.toLowerCase() === parent.toLowerCase() || !isWithin(parent, candidate)) {
        throw new Error(`TIANWEN_DSH_PROBE_ROOT must be a child of ${windowsDataRoot}`)
      }
      mkdirSync(parent, { recursive: true })
      mkdirSync(candidate, { recursive: true })
      const realParent = realpathSync(parent)
      const realCandidate = realpathSync(candidate)
      if (!isWithin(realParent, realCandidate) || realCandidate === realParent) {
        throw new Error(`TIANWEN_DSH_PROBE_ROOT real path must be a child of ${windowsDataRoot}`)
      }
      return realCandidate
    }
    mkdirSync(candidate, { recursive: true })
    return realpathSync(candidate)
  }
  ```

  Complete the change at every dependent path site:

  - `validateFixedInstallBoundary()` derives its expected tarball from `values.probeRoot` on every
    platform and requires `probeRoot` and `realProbeRoot` to match;
  - stale report removal happens only after `requireProbeRoot()` succeeds and touches only the
    selected root;
  - pnpm home/store/cache, npm cache, temporary files, app-data, user profile, packs, DSH home,
    virtual stores, and reported paths are all children of the selected root on Windows too;
  - no default points to shared `D:\DevData\pnpm-store`, `pnpm-cache`, or `npm-cache`.

  Update `runtime-profile.spec.ts` so an invalid empty root is rejected **without deleting** a stale
  report in the previously authorized root. The valid-root early setup failure must still invalidate
  its own stale report. Update `tests/dsh-probe/profile.spec.ts` to assert the new strict-child-of-D
  contract. Reject the D root itself, an arbitrary `C:` path, a parent traversal, or a realpath that
  escapes the supplied D-drive child.

- [ ] **Step 8: Remove the rc.7 closure-size threshold and add direct correctness checks**

  In `tests/dsh-migration/profile-concurrent-boot.mjs`, delete `minimumLinks = 500` and its lower
  bound assertion. Import `existsSync`, `readFileSync`, and `readlinkSync` from `node:fs`, and
  `dirname` plus `resolve` from `node:path`; import the existing `js-yaml` package as `yaml`. Add
  direct checks for the claims the handoff will make:

  ```js
  const temporary = entries.filter(entry => /^\..+\.\d+\.[0-9a-f]{12}$/.test(entry.name))
  if (temporary.length !== 0) fail(`expected no staged fallback entries, got ${temporary.length}`)
  JSON.parse(readFileSync(join(home, 'profiles', 'web', 'package.json'), 'utf8'))
  for (const name of ['cordis.patch.yml', 'pnpm-workspace.yaml']) {
    const contents = readFileSync(join(home, 'profiles', 'web', name), 'utf8')
    if (contents.trim() === '') fail(`${name} is empty`)
    yaml.load(contents)
  }
  for (const entry of links) {
    const linkPath = join(entry.parentPath, entry.name)
    const target = resolve(dirname(linkPath), readlinkSync(linkPath))
    if (!existsSync(target)) fail(`fallback link target is missing: ${linkPath}`)
  }
  process.stdout.write(
    `DSH concurrent cold boot passed: ${concurrency}/${concurrency}, ${links.length} links, ${elapsedMs}ms\n`,
  )
  ```

  `package.json` must parse; the two YAML files must be complete parseable upstream templates; every
  junction target must exist; no staged file or junction may remain. The number of transitive links
  is diagnostic data, not a product contract.

- [ ] **Step 9: Prove cold dump, real boot, concurrent boot, and HMR shutdown**

  Use distinct fresh roots:

  ```powershell
  $env:TIANWEN_DSH_MIGRATION_PROFILE = '1'
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\fresh-profile'
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/runtime-profile.spec.ts

  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\one-shot'
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/one-shot-profile-lifecycle.spec.ts

  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\concurrent'
  node tests/dsh-migration/profile-concurrent-boot.mjs
  ```

  Expected:

  - cold `--dump-config` completes without creating `profiles/node_modules`;
  - a real Profile boot prepares dependencies and loads the Tianwen runtime;
  - the one-shot lifecycle reaches model-use/status/offline/status with no Provider request;
  - HMR and the DSH process shut down within the existing test boundary;
  - all 8 concurrent processes exit 0, initial files are parseable, fallback links are valid, and no
    staged file or junction remains.

- [ ] **Step 10: Measure behavior without a brittle absolute threshold**

  Create `tests/dsh-migration/profile-startup-timing.mjs` as a thin bounded measurement script. It
  requires these environment values and rejects missing or non-D-drive roots on Windows:

  ```text
  TIANWEN_DSH_BIN must be an absolute packaged DSH bin.js path
  TIANWEN_DSH_PROBE_ROOT must be a fresh D-drive parent
  TIANWEN_DSH_TIMING_LABEL=rc7|rc2
  TIANWEN_DSH_TIMING_MODE=dump|boot
  ```

  It runs exactly three samples. Each sample creates a new `DSH_HOME`, sets telemetry off, spawns
  Node with a 120-second timeout, and records elapsed milliseconds plus recursive fallback-link
  count. `dump` uses `--profile headless --dump-config` and requires no `profiles/node_modules`.
  `boot` uses the bounded `web --help` real-Profile preparation path and requires exit 0 plus Web
  usage output. It prints one JSON object with label, mode, argv, all samples, and median; it creates
  no persistent service and performs no Provider request.

  Measure the still-rc.7 plan worktree and the rc.2 candidate on the same machine:

  ```powershell
  $env:TIANWEN_DSH_BIN = 'D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge\node_modules\@deepseek-ai\dsh\lib\bin.js'
  $env:TIANWEN_DSH_TIMING_LABEL = 'rc7'
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\timing\rc7-dump'
  $env:TIANWEN_DSH_TIMING_MODE = 'dump'
  node tests/dsh-migration/profile-startup-timing.mjs
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\timing\rc7-boot'
  $env:TIANWEN_DSH_TIMING_MODE = 'boot'
  node tests/dsh-migration/profile-startup-timing.mjs

  $env:TIANWEN_DSH_BIN = (Resolve-Path 'node_modules\@deepseek-ai\dsh\lib\bin.js').Path
  $env:TIANWEN_DSH_TIMING_LABEL = 'rc2'
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\timing\rc2-dump'
  $env:TIANWEN_DSH_TIMING_MODE = 'dump'
  node tests/dsh-migration/profile-startup-timing.mjs
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\timing\rc2-boot'
  $env:TIANWEN_DSH_TIMING_MODE = 'boot'
  node tests/dsh-migration/profile-startup-timing.mjs
  ```

  Save the four JSON results in
  `D:\DevData\tianwen-dsh-rc2-spike\evidence\profile-timings.md`. Hard conditions: all six dump
  samples are boot-free and all six boot samples prepare a valid Profile. If the rc.2 boot median is
  both more than twice rc.7 and more than 10 seconds slower, classify a performance concern and
  investigate before the final verdict; do not reject a migration from one isolated slow sample.

- [ ] **Step 11: Commit the Profile boundary decision**

  ```powershell
  git add patches pnpm-workspace.yaml pnpm-lock.yaml scripts/verify-dsh-profile.mjs `
    tests/dsh-migration/runtime-profile.spec.ts `
    tests/dsh-migration/profile-concurrent-boot.mjs `
    tests/dsh-migration/profile-startup-timing.mjs
  git commit -m "fix: preserve DSH rc.2 profile boundaries"
  ```

  If both patch dispositions are `delete`, use commit message
  `test: verify DSH rc.2 profile boundaries` instead.

---

## Task 3: Verify Tianwen's core public runtime behavior

**Files:**

- Verify: `packages/tianwen-dsh-compat/src/{index,runtime,scripted-adapter,skill-name,test-harness}.ts`
- Verify: `packages/tianwen-dsh-probe-bundle/src/adapter.ts`
- Verify: `packages/tianwen-runtime-bundle/src/{controlled-lifecycle-runner,controlled-lifecycle,create-runner,goal-live-smoke,model-runner,resume-runner,smoke,status}.ts`
- Verify: `profiles/tianwen/cordis.patch.yml`
- Verify: `packages/tianwen-runtime-bundle/cordis.patch.yml`
- Verify: `packages/tianwen-dsh-probe-bundle/cordis.patch.yml`
- Verify: focused tests listed below

- [ ] **Step 1: Run Goal, Session, Tool, Skill, and Evidence tests offline**

  ```powershell
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run `
    tests/dsh-probe/public-surface.spec.ts `
    tests/dsh-probe/goal-authority.spec.ts `
    tests/dsh-probe/goal-recovery.spec.ts `
    tests/dsh-probe/evidence.spec.ts `
    tests/dsh-probe/skill-governance-runtime.spec.ts `
    tests/dsh-migration/runtime-composition.spec.ts `
    tests/dsh-migration/runtime-session-evidence.spec.ts `
    tests/dsh-migration/goal-create.spec.ts `
    tests/dsh-migration/goal-resume.spec.ts
  ```

  Expected: all pass without a Provider request. This proves the existing public package roots still
  support Goal creation/recovery, JSONL Session evidence, resume, tools, and Skill governance.

- [ ] **Step 2: Inspect JSONL and SQLite compatibility honestly**

  First run the normal rc.2 Goal/resume tests from Step 1; these prove current self-read behavior but
  are not mislabeled as an rc.7 fixture. Then verify the frozen Task 0 fixture:

  ```powershell
  $env:TIANWEN_DSH_JSONL_MODE = 'verify'
  $env:TIANWEN_DSH_JSONL_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\jsonl-forward'
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec tsx tests/dsh-migration/jsonl-forward-compat.ts
  ```

  `verify` must require `DSH_VERSION === '0.1.1-rc.2'`, verify the original rc.7 bytes and SHA-256
  from `fixture-meta.json`, mount a new rc.2 Goal harness, resume the same Session, recover the exact
  Goal ID/revision, append one Goal state change, and flush. The resulting JSONL must be longer while
  its original byte prefix remains exactly unchanged. Record upstream's unchanged JSONL
  `SESSION_FORMAT_VERSION=0` and source-blob identity as supporting external facts, not substitutes
  for this process test.

  Record separately that DSH SQLite schema version changes from 15 to 17 across the upgrade. Do not
  run a Tianwen SQLite migrator: Tianwen's managed product path uses JSONL and DSH owns SQLite
  migration. Classification wording:

  ```text
  JSONL product path: verified compatible
  SQLite external fact: schema changed; migration remains DSH-owned and is not claimed by Tianwen
  ```

- [ ] **Step 3: Pack the exact candidate Runtime Bundle**

  ```powershell
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs --filter @tianwen/runtime-bundle... build
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs --filter @tianwen/runtime-bundle pack --skip-manifest-obfuscation --pack-destination D:\DevData\tianwen-dsh-rc2-spike\packs
  ```

  Expected tarball: `D:\DevData\tianwen-dsh-rc2-spike\packs\tianwen-runtime-bundle-0.0.0.tgz`.
  Inspect its file list and manifest; it must contain the current Bundle patch and public runners,
  and must not contain source-only workspace files or a second embedded DSH runtime.

- [ ] **Step 4: Do not repair unplanned public-API failures**

  If any focused test fails because an rc.2 public export or service contract changed, reduce it to
  the existing failing test plus the exact public import/service name, record it as a blocker, and
  stop before editing a compatibility adapter. A separate reviewed plan is required for such a
  source-level migration.

---

## Task 4: Separate managed-style compatibility from portable-plugin blockers

**Files:**

- Generate: `D:\DevData\tianwen-dsh-rc2-spike\managed-profile\`
- Generate: `D:\DevData\tianwen-dsh-rc2-spike\stock-headless\`
- Generate: `D:\DevData\tianwen-dsh-rc2-spike\stock-web\`
- Create: `tests/dsh-migration/profile-module-identity.mjs`
- Create: `docs/operations/tianwen-dsh-rc2-compatibility-spike-handoff.md`

- [ ] **Step 1: Verify the managed-style Profile path**

  Run the repository's fresh Profile verifier with the candidate tarball and a fresh root:

  ```powershell
  $env:TIANWEN_DSH_MIGRATION_PROFILE = '1'
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\managed-profile'
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/runtime-profile.spec.ts
  ```

  Expected: exact rc.2 DSH packages and the locally packed Tianwen bundle install offline; bundle
  order, public imports, boot-free dump, real boot, and no network/model/Docker boundary all pass.

- [ ] **Step 2: Probe a stock headless Profile through the public CLI**

  Use the rc.2 CLI and a new `DSH_HOME`; install the local Tianwen tarball only through the public
  command. Invoke it through pnpm so DSH's nested `pnpm` process receives an executable on `PATH`:

  ```powershell
  $env:DSH_HOME = 'D:\DevData\tianwen-dsh-rc2-spike\stock-headless\dsh-home'
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec dsh plugin --profile headless add --offline `
    D:\DevData\tianwen-dsh-rc2-spike\packs\tianwen-runtime-bundle-0.0.0.tgz
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec dsh --profile headless --dump-config
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec dsh --profile headless --help
  ```

  Before running, prove `pnpm exec dsh --version` resolves `@deepseek-ai/dsh@0.1.1-rc.2`; do not
  import a private source module. Record exact commands, exit codes, combined output, resulting
  Profile manifest, dump layer order, and whether the bounded `--help` boot can satisfy
  `dynamicCordisRunner`.

  Current expected gap: stock headless does not provide `dsh-cordis-host-runner`, while Tianwen's
  current bundle patch inserts Runtime without that runner. If reproduced, classify it as a
  **portable-plugin composition blocker**, not an rc.2 regression and not a reason to modify the
  managed Profile in this task.

- [ ] **Step 3: Probe a bounded stock Web composition boot without adopting Desktop**

  Run the public rc.2 Web entry against a fresh root:

  ```powershell
  $env:DSH_HOME = 'D:\DevData\tianwen-dsh-rc2-spike\stock-web\dsh-home'
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec dsh plugin --profile web add --offline `
    D:\DevData\tianwen-dsh-rc2-spike\packs\tianwen-runtime-bundle-0.0.0.tgz
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec dsh web --help
  ```

  The bounded help path must prepare the real Web Profile, print usage, and exit 0 without leaving a
  child process. Record whether the Web composition supplies `dsh-cordis-host-runner`, whether
  Tianwen Runtime loads, and whether it is mounted exactly once. Do not claim HTTP reachability from
  this spike; a bounded HTTP server lifecycle belongs to the portable-plugin acceptance plan. Do
  not add a Tianwen Web page and do not install DSH Desktop.

- [ ] **Step 4: Inspect external service identity without redesigning dependencies**

  Create `tests/dsh-migration/profile-module-identity.mjs`. It requires
  `TIANWEN_DSH_PROFILE_ROOT`, anchors one `createRequire()` at that Profile's `package.json`, anchors
  another at the installed `@tianwen/runtime-bundle/package.json`, and resolves these exact packages
  from both anchors:

  ```js
  const packages = [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-cordis-host-runner',
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-session',
  ]
  ```

  For each resolved entry, walk upward to the package manifest whose `name` matches, then report the
  manifest version and `realpathSync()` package root. Missing resolution is reported as `null`, not
  hidden. Run the script once for
  `D:\DevData\tianwen-dsh-rc2-spike\stock-headless\dsh-home\profiles\headless` and once for the
  corresponding `stock-web\dsh-home\profiles\web` root.

  A package resolved from both anchors must have the same exact version and real package root. A
  missing headless host runner is the composition blocker from Step 2; two different Cordis or DSH
  service roots are a module-identity blocker. Save the two JSON tables in the evidence directory.

  Current expected risk: Runtime Bundle declares DSH/Cordis as ordinary dependencies while rc.2
  Profiles use `autoInstallPeers: false`; duplicate module identity could split Cordis services.
  Do not convert dependencies to peers in this spike. This result feeds the separate portable
  plugin implementation plan.

- [ ] **Step 5: Freeze the phase boundary**

  This task may conclude all of the following at once:

  ```text
  DSH rc.2 workspace Runtime + managed-style Profile: compatible or blocked
  Exact DSH patches: delete, port, or blocked from observed evidence
  Formal Tianwen installer: still rc.7, not migrated, not verified here
  Portable stock headless path: not yet productized
  Existing-Profile install failure/rollback/remove: deferred to phase two, not claimed here
  Desktop path: not tested and not required for core compatibility
  ```

  Do not turn a portable packaging gap into a claim that Tianwen's existing runtime is incompatible
  with rc.2, and do not turn managed-style compatibility into a claim that the formal installer or
  portable plugin is already complete.

- [ ] **Step 6: Commit the bounded composition probe**

  ```powershell
  git add tests/dsh-migration/profile-module-identity.mjs
  git commit -m "test: probe DSH rc.2 profile composition"
  ```

  Do not commit generated Profile trees or identity tables.

---

## Task 5: Produce the compatibility verdict and independently review it

**Files:**

- Create: `docs/operations/tianwen-dsh-rc2-compatibility-spike-handoff.md`
- Verify: all candidate changes

- [ ] **Step 1: Write one evidence-backed handoff**

  The handoff must contain these separate sections:

  1. authority: plan commit, candidate branch/SHA, clean/dirty state, exact DSH tag and commit;
  2. dependency result: six manifests, 54 pins, lockfile, public-root import gate;
  3. patch result: cold dump and atomic publication, each classified `delete`, `port`, or `blocked`;
  4. runtime result: build, Goal, Session, resume, Tool, Skill, Evidence, real boot, HMR shutdown;
  5. performance facts: rc.7 and rc.2 each measured three times for dump and bounded real Profile
     preparation, with medians plus filesystem/link effects;
  6. data facts: JSONL result and separate DSH-owned SQLite fact;
  7. portable external facts: headless runner composition, Web smoke, module/service identity;
  8. deferred product work: existing-Profile install/rollback/remove contract, portable bundle
     contract, formal managed installer migration, Desktop, and public naming;
  9. final classification and exact next gate.

  Link concise external evidence paths, but do not commit caches, generated homes, full dependency
  trees, credentials, model content, or unrelated historical data.

- [ ] **Step 2: Run final local gates from the candidate commit**

  ```powershell
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs install --frozen-lockfile
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs --filter @tianwen/runtime-bundle... build
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run typecheck
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run check:dsh-install
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run check:no-private-dsh-imports
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run `
    tests/dsh-probe/install-closure.spec.ts `
    tests/dsh-probe/public-surface.spec.ts `
    tests/dsh-probe/dsh-public-reuse-surface.spec.ts `
    tests/dsh-probe/goal-authority.spec.ts `
    tests/dsh-probe/goal-recovery.spec.ts `
    tests/dsh-probe/evidence.spec.ts `
    tests/dsh-probe/skill-governance-runtime.spec.ts `
    tests/dsh-migration/runtime-bundle.spec.ts `
    tests/dsh-migration/runtime-composition.spec.ts `
    tests/dsh-migration/runtime-session-evidence.spec.ts `
    tests/dsh-migration/goal-create.spec.ts `
    tests/dsh-migration/goal-resume.spec.ts
  ```

  Run the complete TypeScript repository gate after the focused suite:

  ```powershell
  $env:TIANWEN_DSH_MIGRATION_PROFILE = '0'
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-spike\full-suite'
  $env:UV_CACHE_DIR = 'D:\DevData\tianwen-dsh-rc2-spike\uv-cache'
  $env:UV_PROJECT_ENVIRONMENT = 'D:\DevData\tianwen-dsh-rc2-spike\python-venv'
  uv sync --frozen --dev
  $env:TIANWEN_DSH_PROBE_PYTHON = 'D:\DevData\tianwen-dsh-rc2-spike\python-venv\Scripts\python.exe'
  node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run check
  ```

  Tests that exercise the still-rc.7 managed installer or frozen historical protocols must pass
  with those exact rc.7 expectations intact; the candidate does not redefine their evidence.

  The TypeScript change should not affect Python, but the repository gate still runs in a D-drive
  environment:

  ```powershell
  uv run ruff check .
  uv run python -m compileall -q src tests
  uv run pytest
  ```

  Then rerun the three opt-in real-process probes from Task 2 with fresh directories. Expected: all
  deterministic gates pass; real-process results match the handoff; no Provider request occurs.

- [ ] **Step 3: Review the diff for historical and phase-boundary drift**

  Require all of the following:

  - no edit to `scripts/install-tianwen.mjs`;
  - no rc.2 rewrite in historical operations, Activity, receipt, controlled-lifecycle, or evaluation
    protocol files;
  - no private DSH source import;
  - no Desktop/Electron dependency;
  - no portable CLI/status redesign;
  - no generated `D:\DevData` content staged in Git;
  - no deleted rc.7 patch evidence;
  - no real model evidence or Provider billing claim.

- [ ] **Step 4: Run an independent review**

  Use `requesting-code-review` with a reviewer that did not implement the candidate. The reviewer
  compares the approved design, this plan, candidate diff, focused test output, real-process output,
  and handoff. Fix only concrete in-scope defects, rerun the affected gates, and commit a minimal
  source/test correction before continuing. Do not accept a scope expansion as review feedback.

- [ ] **Step 5: Assign exactly one verdict and finalize the handoff**

  Use one of these values:

  - `compatible-for-next-stage` — workspace Runtime and managed-style Profile behavior pass and no
    unresolved blocker prevents writing the portable-plugin plan;
  - `compatible-with-portable-blockers` — workspace Runtime and managed-style Profile behavior pass,
    and stock Profile gaps are clearly isolated for phase two;
  - `blocked` — an rc.2 public API, core runtime, Profile correctness, or data-path failure prevents
    safe continuation.

  A likely portable composition gap does not pre-decide the result. The observed evidence chooses
  the verdict. Append the independent review result and final candidate SHA to the handoff.

- [ ] **Step 6: Commit the reviewed handoff**

  ```powershell
  git add docs/operations/tianwen-dsh-rc2-compatibility-spike-handoff.md
  git commit -m "docs: record DSH rc.2 compatibility spike"
  git status --short --branch
  ```

  Expected: the candidate branch is clean. The handoff commit is the SHA reported to the user.

- [ ] **Step 7: Stop before integration**

  Report the candidate SHA, verdict, patch disposition, core test result, real Profile result,
  portable blockers, and next recommended plan. Do not merge to main, push, trigger exact-main CI,
  update the official installer, publish packages, or begin Desktop work under this plan.
