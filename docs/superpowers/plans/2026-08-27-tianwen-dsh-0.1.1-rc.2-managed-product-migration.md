# Tianwen DSH `0.1.1-rc.2` Managed Product Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the current managed Tianwen product from exact DSH `0.1.0-rc.7` to exact DSH `0.1.1-rc.2`, prove a real isolated upgrade with preserved state, and restore the complete repository gate before portable-plugin work begins.

**Architecture:** Keep one current product version and one narrowly supported predecessor. Three isolated worker lanes update the installer, current record producers, and A1 path authority in parallel; the controller handles the independent Profile-cache fixture, reviews each lane, and integrates them into one migration branch. Real cross-version installation and complete repository verification run only after the lanes converge.

**Tech Stack:** TypeScript, Node.js, Vitest, Python 3.11, pytest, pnpm `11.20.0`, DSH `0.1.1-rc.2`, Windows PowerShell.

## Global Constraints

- New DSH version: exact `0.1.1-rc.2`; old and only supported predecessor: exact `0.1.0-rc.7`.
- Approved design: `docs/superpowers/specs/2026-08-27-tianwen-dsh-0.1.1-rc.2-managed-product-migration-design.md`.
- Compatibility authority: reviewed commit `d41508ad44264c254495a3bb6e496589718c7ea6`; design commit `ba2495f`.
- Old managed-product source authority: exact local-main commit `ceafb6bc5d842402c83a0030cb2c2c57105c0dd8`.
- Keep both exact new-version pnpm patches active; retain old-version patch files only as historical source evidence.
- Do not edit `docs/operations/**`, Activity/evidence roots, `docs/research/**`, the `v0.1.0` release record, completed dated specs/plans, the frozen JSONL source fixture, or timing comparison labels.
- Current producers write `0.1.1-rc.2`; old persisted `0.1.0-rc.7` facts remain readable and are never rewritten.
- No external/live Provider, paid model, real user task, Desktop implementation, package publication, or portable-plugin implementation belongs to this plan.
- All new worktrees, dependency stores, product roots, Python environments, logs, and temporary data live under `D:\DevData`.
- Do not read, modify, or clean existing real product, Activity, evidence, debug, legacy-worktree, or historical evolution directories.
- No retries are added to product execution. Registry preparation and offline product execution remain separate phases.
- Workers are not alone in the repository. Each lane owns only its listed files and must not revert or stage another lane's changes.

## Parallel Execution Topology

After this plan is committed, the controller records that exact commit and creates these isolated
worktrees from it:

| Lane | Branch | Worktree | Ownership |
| --- | --- | --- | --- |
| Integration | `codex/tianwen-dsh-rc2-product-migration` | `D:\DevData\tianwen-worktrees\tianwen-dsh-rc2-product-migration` | controller integration, cache fixture, final gates |
| A | `codex/tianwen-dsh-rc2-installer` | `D:\DevData\tianwen-worktrees\tianwen-dsh-rc2-installer` | Task 1 only |
| B | `codex/tianwen-dsh-rc2-producers` | `D:\DevData\tianwen-worktrees\tianwen-dsh-rc2-producers` | Task 2 only |
| C | `codex/tianwen-dsh-rc2-a1-authority` | `D:\DevData\tianwen-worktrees\tianwen-dsh-rc2-a1-authority` | Task 3 only |

Tasks 1–4 run concurrently. Each lane produces one reviewed commit. The controller cherry-picks
approved lane commits into the integration worktree in Task 5. Tasks 6 and 7 may then run in
parallel because the upgrade test and current documentation have disjoint files. Task 8 is the
serial convergence gate. Workers do not share an index or commit concurrently in one worktree.

Common tool paths:

```powershell
$pnpm = 'D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs'
$env:COREPACK_HOME = 'D:\DevData\corepack-home'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\tianwen-dsh-rc2-product-migration\pnpm-store'
$env:PNPM_CONFIG_CACHE_DIR = 'D:\DevData\tianwen-dsh-rc2-product-migration\pnpm-cache'
$env:NPM_CONFIG_CACHE = 'D:\DevData\tianwen-dsh-rc2-product-migration\npm-cache'
$env:DSH_TELEMETRY_DISABLED = '1'
$env:TIANWEN_RUN_LIVE_MODEL_TESTS = '0'
```

---

## Task 1: Migrate the official installer and its product tests

**Parallel lane:** A

**Files:**

- Modify: `scripts/install-tianwen.mjs`
- Modify: `tests/dsh-migration/tianwen-installer.spec.ts`
- Modify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`

**Interfaces:**

- Consumes: existing atomic install, managed-layout classification, rollback, receipt, Profile validation, and idempotence behavior.
- Produces: an official installer whose current version is exact `0.1.1-rc.2` and whose sole predecessor is a complete exact `0.1.0-rc.7` managed installation.

- [ ] **Step 1: Change the installer tests to state the new current/predecessor contract**

  In `tianwen-installer.spec.ts`, change only current-product and predecessor fixtures:

  ```ts
  const CURRENT_DSH_VERSION = '0.1.1-rc.2'
  const PREDECESSOR_DSH_VERSION = '0.1.0-rc.7'
  ```

  Retarget these existing behaviors:

  - exact current host acceptance uses `CURRENT_DSH_VERSION`;
  - complete predecessor recognition uses `PREDECESSOR_DSH_VERSION`;
  - predecessor migration asserts old `0.1.0-rc.7` state becomes current `0.1.1-rc.2` state;
  - both rollback cases restore byte-identical old host/Profile/archive/receipt/state;
  - current-version replay remains idempotent and residue-free;
  - partial, mixed, arbitrary, modified-patch, and extra-dependency layouts remain rejected.

  In `tianwen-startup.e2e.spec.ts`, update assertions that describe a newly installed current
  product—host, receipt, base/headless Profile, and current controlled manifest—to
  `0.1.1-rc.2`. Do not change a fixture that explicitly represents the old predecessor or a
  persisted historical fact.

- [ ] **Step 2: Run the installer tests and confirm the old installer contract fails**

  ```powershell
  node $pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
  ```

  Expected: FAIL because `scripts/install-tianwen.mjs` still declares current `0.1.0-rc.7` and
  predecessor `0.1.0-rc.6`.

- [ ] **Step 3: Retarget the installer without adding version negotiation**

  In `scripts/install-tianwen.mjs`, use exact constants:

  ```js
  const DSH_VERSION = '0.1.1-rc.2'
  const PREDECESSOR_DSH_VERSION = '0.1.0-rc.7'
  ```

  Rename `renderOriginalRc6ProfilePatch` to `renderPredecessorProfilePatch`, change the
  classification state from `managed-rc6` to `managed-predecessor`, and name the boolean
  `migratingPredecessor`. Do not introduce a registry or a version collection.

  Make `classifyManagedInstallation()` return `managed-predecessor` only when the host,
  base/headless Profile dependencies, archive, and receipt consistently prove exact
  `0.1.0-rc.7`. Current validation and new receipts use exact `0.1.1-rc.2`. Preserve the existing
  staged replacement, cleanup, and rollback flow unchanged apart from the predecessor version.

- [ ] **Step 4: Run installer unit and startup tests**

  ```powershell
  node $pnpm exec vitest run `
    tests/dsh-migration/tianwen-installer.spec.ts `
    tests/dsh-migration/tianwen-startup.e2e.spec.ts
  ```

  Expected: installer tests pass; opt-in startup cases may remain skipped unless their existing
  environment flag is set. No external/live Provider request occurs.

- [ ] **Step 5: Audit version strings in the owned files**

  ```powershell
  rg -n '0\.1\.0-rc\.6|0\.1\.0-rc\.7|0\.1\.1-rc\.2|managed-rc6' `
    scripts/install-tianwen.mjs `
    tests/dsh-migration/tianwen-installer.spec.ts `
    tests/dsh-migration/tianwen-startup.e2e.spec.ts
  ```

  Expected: `0.1.0-rc.6` and `managed-rc6` are absent from the active installer; remaining
  `0.1.0-rc.7` test occurrences are explicitly predecessor/historical fixtures.

- [ ] **Step 6: Commit lane A**

  ```powershell
  git add scripts/install-tianwen.mjs `
    tests/dsh-migration/tianwen-installer.spec.ts `
    tests/dsh-migration/tianwen-startup.e2e.spec.ts
  git commit -m "feat: migrate managed installer to DSH 0.1.1-rc.2"
  ```

---

## Task 2: Migrate current lifecycle and learning record producers

**Parallel lane:** B

**Files:**

- Modify: `packages/tianwen-runtime-bundle/src/controlled-lifecycle-contract.ts`
- Modify: `packages/tianwen-runtime-bundle/src/controlled-lifecycle.ts`
- Verify: `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts`
- Modify: `packages/tianwen-evolution/src/skill-evaluation.ts`
- Modify: `packages/tianwen-evolution/src/controlled-skill-evaluation.ts`
- Modify: `packages/tianwen-evolution/src/controlled-skill-shadow.ts`
- Verify: `packages/tianwen-evolution/src/index.ts`
- Verify: `packages/tianwen-evolution/src/ledger.ts`
- Modify: `scripts/run-paired-skill-evaluation-demo.ts`
- Modify: `scripts/run-controlled-skill-lifecycle-demo.ts`
- Modify: `tests/dsh-probe/skill-evaluation.spec.ts`
- Modify: `tests/dsh-probe/skill-evaluation-runtime.spec.ts`
- Modify: `tests/dsh-probe/controlled-skill-evaluation.spec.ts`
- Modify: `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts`
- Modify: `tests/dsh-probe/controlled-skill-shadow.spec.ts`
- Modify: `tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts`
- Modify: `tests/dsh-probe/controlled-skill-activation.spec.ts`
- Modify: `tests/dsh-probe/controlled-skill-activation-runtime.spec.ts`
- Modify: `tests/dsh-probe/controlled-skill-lifecycle-demo.spec.ts`
- Modify: `tests/dsh-probe/paired-skill-evaluation-demo.spec.ts`
- Modify: `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts`
- Modify: `tests/dsh-migration/controlled-lifecycle-command.spec.ts`
- Modify: `tests/dsh-migration/controlled-lifecycle-profile.spec.ts`
- Modify: `tests/dsh-migration/model-configuration.spec.ts`

**Interfaces:**

- Consumes: exact installed-product version `0.1.1-rc.2` and existing persisted record schemas.
- Produces: new lifecycle/evaluation/shadow records labeled `0.1.1-rc.2`, while readers preserve old `0.1.0-rc.7` facts without schema changes.

- [ ] **Step 1: Update current-producer expectations and add one legacy-preservation assertion**

  Change tests representing a newly created current manifest, installed product, evaluation,
  shadow, activation, or demo result to expect:

  ```ts
  expect(record.execution.dshVersion).toBe('0.1.1-rc.2')
  ```

  Keep the frozen JSONL source fixture and historical document assertions on `0.1.0-rc.7`.
  Add one narrow parser/replay assertion using an existing old-version fixture:

  ```ts
  const parsed = parseExistingResult(oldRc7Fixture)
  expect(parsed.execution.dshVersion).toBe('0.1.0-rc.7')
  expect(JSON.stringify(parsed)).toContain('0.1.0-rc.7')
  ```

  Use the real parser name already present in the selected evaluation/shadow test; do not add a
  generic version adapter.

- [ ] **Step 2: Run the focused producer tests and confirm current hard-coded old versions fail**

  ```powershell
  node $pnpm exec vitest run `
    tests/dsh-probe/skill-evaluation.spec.ts `
    tests/dsh-probe/skill-evaluation-runtime.spec.ts `
    tests/dsh-probe/controlled-skill-evaluation.spec.ts `
    tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts `
    tests/dsh-probe/controlled-skill-shadow.spec.ts `
    tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts `
    tests/dsh-probe/controlled-skill-activation.spec.ts `
    tests/dsh-probe/controlled-skill-activation-runtime.spec.ts `
    tests/dsh-probe/controlled-skill-lifecycle-demo.spec.ts `
    tests/dsh-probe/paired-skill-evaluation-demo.spec.ts `
    tests/dsh-migration/controlled-lifecycle-command.spec.ts `
    tests/dsh-migration/controlled-lifecycle-profile.spec.ts `
    tests/dsh-migration/model-configuration.spec.ts
  ```

  Expected: FAIL at current producer/preflight expectations that still use `0.1.0-rc.7`.

- [ ] **Step 3: Make current producers and current preflight exact `0.1.1-rc.2`**

  Change only producer/default/preflight literals. Representative resulting behavior:

  ```ts
  const currentExecution = {
    ...input,
    dshVersion: '0.1.1-rc.2',
  }
  ```

  `preflightControlledLifecycle()` must require the installed host, receipt, and base/headless
  Profile to be exact `0.1.1-rc.2`. Parser/replay code continues returning the version present in
  an old record. Do not increment controlled evaluation/shadow schemas solely for this version
  migration.

- [ ] **Step 4: Run focused tests and demo entry points**

  Run the focused Vitest command from Step 2, then:

  ```powershell
  node $pnpm demo:paired-skill-evaluation
  node $pnpm demo:controlled-skill-lifecycle
  node $pnpm demo:shadow-eligibility
  node $pnpm demo:promotion-readiness
  ```

  Expected: all focused tests and demos exit 0. Generated current records name
  `0.1.1-rc.2`; the old replay assertion remains `0.1.0-rc.7`.

- [ ] **Step 5: Audit owned version occurrences by meaning**

  ```powershell
  rg -n '0\.1\.0-rc\.7|0\.1\.1-rc\.2' `
    packages/tianwen-runtime-bundle/src `
    packages/tianwen-evolution/src `
    scripts/run-paired-skill-evaluation-demo.ts `
    scripts/run-controlled-skill-lifecycle-demo.ts `
    tests/dsh-probe/skill-evaluation.spec.ts `
    tests/dsh-probe/skill-evaluation-runtime.spec.ts `
    tests/dsh-probe/controlled-skill-evaluation.spec.ts `
    tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts `
    tests/dsh-probe/controlled-skill-shadow.spec.ts `
    tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts `
    tests/dsh-probe/controlled-skill-activation.spec.ts `
    tests/dsh-probe/controlled-skill-activation-runtime.spec.ts `
    tests/dsh-probe/controlled-skill-lifecycle-demo.spec.ts `
    tests/dsh-probe/paired-skill-evaluation-demo.spec.ts `
    tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts `
    tests/dsh-migration/controlled-lifecycle-command.spec.ts `
    tests/dsh-migration/controlled-lifecycle-profile.spec.ts `
    tests/dsh-migration/model-configuration.spec.ts
  ```

  Expected: every old-version occurrence is identified as a predecessor or persisted historical
  fact; no newly produced current record uses it.

- [ ] **Step 6: Commit lane B**

  ```powershell
  git add packages/tianwen-runtime-bundle/src `
    packages/tianwen-evolution/src `
    scripts/run-paired-skill-evaluation-demo.ts `
    scripts/run-controlled-skill-lifecycle-demo.ts `
    tests/dsh-probe `
    tests/dsh-migration/controlled-lifecycle-command.spec.ts `
    tests/dsh-migration/controlled-lifecycle-profile.spec.ts `
    tests/dsh-migration/model-configuration.spec.ts
  git commit -m "fix: record the current DSH product version"
  ```

---

## Task 3: Parameterize the A1 controller-owned authority root

**Parallel lane:** C

**Files:**

- Modify: `packages/tianwen-evaluator-python/src/index.ts`
- Modify: `scripts/dsh_probe_alpha_a1_evaluator.py`
- Modify: `tests/dsh-probe/python-a1-evaluator.spec.ts`
- Modify: `tests/dsh-migration/runtime-governance.spec.ts`

**Interfaces:**

- Produces: `PythonA1EvaluatorOptions.authorityRoot?: string`; the TypeScript controller passes a validated `--authority-root` to the Python worker.
- Preserves: default fixed-root behavior and the repository-local default Python exception.

- [ ] **Step 1: Add failing authority-root contract tests**

  Extend `PythonA1EvaluatorOptions` usage in tests with:

  ```ts
  const evaluator = new PythonA1Evaluator({
    repoRoot,
    stateRoot: join(authorityRoot, 'state'),
    pythonExecutable: join(authorityRoot, 'python-venv', 'Scripts', 'python.exe'),
    authorityRoot,
  })
  ```

  Add cases that accept one fresh existing strict child of `D:\DevData` and reject:

  - a relative path;
  - `D:\`;
  - `D:\DevData` itself;
  - another drive or a Windows system directory;
  - an authority root that is a junction/reparse point;
  - a state root or explicit Python executable that escapes the authority.

  Preserve the existing non-Python executable, repo-root, state-audit junction, and repeatable
  nop/oracle tests.

- [ ] **Step 2: Run the A1 tests and verify the new option is unsupported**

  ```powershell
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-product-migration\a1-red'
  node $pnpm exec vitest run tests/dsh-probe/python-a1-evaluator.spec.ts
  ```

  Expected: FAIL because `authorityRoot` is not in `PythonA1EvaluatorOptions` and the worker has no
  `--authority-root` argument.

- [ ] **Step 3: Implement the narrow TypeScript authority option**

  Add exactly:

  ```ts
  export interface PythonA1EvaluatorOptions {
    // existing fields remain
    readonly authorityRoot?: string
  }
  ```

  If omitted, keep the existing fixed probe root. If supplied, require an existing canonical,
  non-reparse directory that is a strict descendant of `D:\DevData`. Validate stateRoot,
  explicit Python, TEMP, and TMP against this root. Append fixed worker arguments:

  ```ts
  args.push('--authority-root', authorityRoot)
  ```

  Reuse the file's current realpath/reparse/containment style directly; do not create a shared
  filesystem-authority module.

- [ ] **Step 4: Implement the independent Python worker check**

  Add a required argparse option:

  ```python
  parser.add_argument("--authority-root", required=True)
  ```

  Replace the fixed worker probe-root boundary with the validated argument. Independently reject
  roots outside a strict `D:\DevData` descendant, roots whose realpath changes, and reparse
  points. Keep request/result/state/workspace/TEMP/TMP descendant checks.

- [ ] **Step 5: Bind runtime-governance to its selected fresh root and run both suites**

  Pass its selected test root explicitly:

  ```ts
  authorityRoot: probeRoot,
  ```

  Then run:

  ```powershell
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-product-migration\a1-green'
  $env:TIANWEN_DSH_PROBE_PYTHON = 'D:\DevData\tianwen-dsh-rc2-product-migration\python-venv\Scripts\python.exe'
  node $pnpm exec vitest run `
    tests/dsh-probe/python-a1-evaluator.spec.ts `
    tests/dsh-migration/runtime-governance.spec.ts
  node $pnpm run typecheck
  ```

  Expected: both files and typecheck pass; negative containment cases still fail closed.

- [ ] **Step 6: Commit lane C**

  ```powershell
  git add packages/tianwen-evaluator-python/src/index.ts `
    scripts/dsh_probe_alpha_a1_evaluator.py `
    tests/dsh-probe/python-a1-evaluator.spec.ts `
    tests/dsh-migration/runtime-governance.spec.ts
  git commit -m "fix: authorize isolated A1 evaluation roots"
  ```

---

## Task 4: Make default Profile dependency preparation explicit

**Parallel owner:** controller in the integration worktree

**Files:**

- Modify: `tests/dsh-migration/runtime-profile.spec.ts`

**Interfaces:**

- Consumes: existing `prefetchOfflineDependencies()`.
- Preserves: one actual public offline Profile add and unchanged default layer assertions.

- [ ] **Step 1: Reproduce the fresh-cache failure before editing**

  ```powershell
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-product-migration\default-profile-red'
  Remove-Item Env:TIANWEN_DSH_MIGRATION_PROFILE -ErrorAction SilentlyContinue
  node $pnpm exec vitest run tests/dsh-migration/runtime-profile.spec.ts
  ```

  Expected: the default-Profile test fails because the new selected-root offline cache lacks
  Cordis metadata.

- [ ] **Step 2: Add the existing preparation phase to the default test**

  Immediately before its single verifier call, add:

  ```ts
  prefetchOfflineDependencies()
  const result = verify({ TIANWEN_DSH_MIGRATION_PROFILE: undefined })
  ```

  Do not move preparation into `verify-dsh-profile.mjs`, add a retry, or change the expected
  default layer set.

- [ ] **Step 3: Verify default and opt-in modes with different fresh roots**

  ```powershell
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-product-migration\default-profile-green'
  Remove-Item Env:TIANWEN_DSH_MIGRATION_PROFILE -ErrorAction SilentlyContinue
  node $pnpm exec vitest run tests/dsh-migration/runtime-profile.spec.ts

  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-product-migration\migration-profile-green'
  $env:TIANWEN_DSH_MIGRATION_PROFILE = '1'
  node $pnpm exec vitest run tests/dsh-migration/runtime-profile.spec.ts
  ```

  Expected: default mode keeps only base + probe layers; opt-in mode keeps base + probe + Runtime;
  each actual Profile add is offline and single-attempt.

- [ ] **Step 4: Commit the cache fixture**

  ```powershell
  git add tests/dsh-migration/runtime-profile.spec.ts
  git commit -m "test: prepare fresh Profile dependencies explicitly"
  ```

---

## Task 5: Review and integrate the four parallel lanes

**Files:**

- Verify: all Task 1–4 files

**Interfaces:**

- Consumes: one reviewed commit from each lane and the controller's Task 4 commit.
- Produces: a single integration branch containing all bounded reconciliation changes.

- [ ] **Step 1: Independently review each lane before integration**

  Use `requesting-code-review` with one reviewer per lane. Reject:

  - historical evidence rewrites;
  - DSH version ranges or general version negotiation;
  - weakened installed-version checks;
  - a new path-authority framework;
  - Profile retries or hidden registry access.

- [ ] **Step 2: Cherry-pick approved lane commits into the integration worktree**

  ```powershell
  git cherry-pick codex/tianwen-dsh-rc2-installer
  git cherry-pick codex/tianwen-dsh-rc2-producers
  git cherry-pick codex/tianwen-dsh-rc2-a1-authority
  ```

  Before each command, confirm the branch tip equals the reviewer-approved SHA recorded in the SDD
  ledger. Task 4 is already committed in the integration branch.

- [ ] **Step 3: Resolve only semantic overlaps**

  Expected overlap is limited to current-product test expectations. Do not combine installer
  state classification with lifecycle/evaluation record parsing. If a conflict occurs, keep lane
  ownership: installer/startup behavior from A, record/preflight behavior from B, A1 authority
  from C, Profile preparation from Task 4.

- [ ] **Step 4: Run the combined targeted gate**

  ```powershell
  node $pnpm run typecheck
  node $pnpm run check:dsh-install
  node $pnpm run check:no-private-dsh-imports
  node $pnpm exec vitest run `
    tests/dsh-migration/tianwen-installer.spec.ts `
    tests/dsh-migration/tianwen-startup.e2e.spec.ts `
    tests/dsh-migration/controlled-lifecycle-command.spec.ts `
    tests/dsh-migration/controlled-lifecycle-profile.spec.ts `
    tests/dsh-migration/model-configuration.spec.ts `
    tests/dsh-probe/python-a1-evaluator.spec.ts `
    tests/dsh-migration/runtime-governance.spec.ts `
    tests/dsh-migration/runtime-profile.spec.ts
  ```

  Expected: exit 0 with no external/live Provider request.

---

## Task 6: Add and run the real old-product upgrade acceptance

**Files:**

- Create: `tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts`

**Interfaces:**

- Consumes: old authority worktree at exact `ceafb6bc5d842402c83a0030cb2c2c57105c0dd8`, candidate installer, and a new selected product root.
- Produces: repeatable proof of real official `0.1.0-rc.7` install → `0.1.1-rc.2` upgrade → current-version idempotence with preserved state.

- [ ] **Step 1: Write a bounded opt-in test contract**

  Require controller-owned inputs:

  ```ts
  const enabled = process.env.TIANWEN_RUN_DSH_UPGRADE_E2E === '1'
  const oldAuthorityRoot = requireDirectory('TIANWEN_DSH_RC7_AUTHORITY_ROOT')
  const productRoot = requireFreshDevDataChild('TIANWEN_DSH_UPGRADE_ROOT')
  ```

  The test must reject missing, relative, root-level, non-`D:\DevData`, or existing non-empty
  product targets before spawning either installer.

- [ ] **Step 2: Implement the exact process sequence without retries**

  The test performs:

  ```ts
  runInstaller(join(oldAuthorityRoot, 'scripts', 'install-tianwen.mjs'), productRoot)
  const before = writeAndHashSyntheticState(productRoot)
  runInstaller(resolve('scripts', 'install-tianwen.mjs'), productRoot)
  assertCurrentRc2Installation(productRoot)
  expect(hashSyntheticState(productRoot)).toEqual(before)
  const firstCurrentSnapshot = snapshotManagedFiles(productRoot)
  runInstaller(resolve('scripts', 'install-tianwen.mjs'), productRoot)
  expect(snapshotManagedFiles(productRoot)).toEqual(firstCurrentSnapshot)
  expect(findInstallerResidue(productRoot)).toEqual([])
  ```

  Use explicit child-process handles and timeouts already used by installer/startup tests. Do not
  call a Provider. Synthetic sentinels live only under new Session/evolution subdirectories and
  contain no user data.

- [ ] **Step 3: Create the exact old authority worktree and install its dependencies**

  ```powershell
  git worktree add --detach `
    'D:\DevData\tianwen-worktrees\tianwen-dsh-rc7-upgrade-authority' `
    'ceafb6bc5d842402c83a0030cb2c2c57105c0dd8'
  Set-Location 'D:\DevData\tianwen-worktrees\tianwen-dsh-rc7-upgrade-authority'
  node $pnpm install --frozen-lockfile
  ```

  Dependency acquisition may use the configured D-drive store. No product command runs in this
  preparation step.

- [ ] **Step 4: Run the real upgrade test exactly once**

  ```powershell
  Set-Location 'D:\DevData\tianwen-worktrees\tianwen-dsh-rc2-product-migration'
  $env:TIANWEN_RUN_DSH_UPGRADE_E2E = '1'
  $env:TIANWEN_DSH_RC7_AUTHORITY_ROOT = 'D:\DevData\tianwen-worktrees\tianwen-dsh-rc7-upgrade-authority'
  $env:TIANWEN_DSH_UPGRADE_ROOT = 'D:\DevData\tianwen-dsh-rc2-product-migration\real-upgrade'
  node $pnpm exec vitest run tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts
  ```

  Expected: one old install, one upgrade, and one current replay all succeed; state hashes remain
  equal; host/Profile/receipt are exact `0.1.1-rc.2`; no staging/backup residue remains.

- [ ] **Step 5: Commit the upgrade acceptance test and its factual report**

  ```powershell
  git add tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts
  git commit -m "test: prove DSH 0.1.0-rc.7 product upgrades"
  ```

  Archive command output under the SDD workspace or
  `D:\DevData\tianwen-dsh-rc2-product-migration\evidence`; do not commit generated products.

---

## Task 7: Update only current public version statements

**Files:**

- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/tianwen-architecture-overview-v2.md`
- Verify: `tests/contracts/test_public_repository_surface.py`

**Interfaces:**

- Consumes: accepted current product version `0.1.1-rc.2`.
- Preserves: historical Activity/operation/release statements at `0.1.0-rc.7`.

- [ ] **Step 1: Update current-status prose only**

  Change the README/CONTRIBUTING current product baseline and the architecture overview's current
  product status to full `0.1.1-rc.2`. Keep Activity-03, Activity-22, old natural-task handoffs,
  and release-history paragraphs unchanged.

- [ ] **Step 2: Run document contract tests**

  ```powershell
  $env:UV_CACHE_DIR = 'D:\DevData\tianwen-dsh-rc2-product-migration\uv-cache'
  $env:UV_PROJECT_ENVIRONMENT = 'D:\DevData\tianwen-dsh-rc2-product-migration\python-venv'
  uv run pytest tests/contracts/test_public_repository_surface.py
  ```

  If a test checks current README text, update it to `0.1.1-rc.2`. If it checks a historical
  document, preserve its `0.1.0-rc.7` expectation.

- [ ] **Step 3: Commit current documentation**

  ```powershell
  git add README.md README.zh-CN.md CONTRIBUTING.md `
    docs/tianwen-architecture-overview-v2.md `
    tests/contracts/test_public_repository_surface.py
  git commit -m "docs: record the current DSH product version"
  ```

---

## Task 8: Run complete local product gates

**Files:**

- Verify: all candidate changes

- [ ] **Step 1: Install from the frozen lock and build**

  ```powershell
  Set-Location 'D:\DevData\tianwen-worktrees\tianwen-dsh-rc2-product-migration'
  node $pnpm install --frozen-lockfile
  node $pnpm --filter @tianwen/runtime-bundle... build
  node $pnpm run typecheck
  node $pnpm run check:dsh-install
  node $pnpm run check:no-private-dsh-imports
  ```

  Expected: all commands exit 0; closure reports exact `0.1.1-rc.2` for every active current
  product DSH dependency.

- [ ] **Step 2: Run the complete TypeScript repository gate with a fresh authorized root**

  ```powershell
  $env:TIANWEN_DSH_MIGRATION_PROFILE = '0'
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-product-migration\full-suite'
  $env:TIANWEN_DSH_PROBE_PYTHON = 'D:\DevData\tianwen-dsh-rc2-product-migration\python-venv\Scripts\python.exe'
  node $pnpm run check
  ```

  Expected: zero failed files and zero failed tests. A red result blocks integration; do not
  classify known failures away a second time.

- [ ] **Step 3: Run Python gates from D-drive environments**

  ```powershell
  $env:UV_CACHE_DIR = 'D:\DevData\tianwen-dsh-rc2-product-migration\uv-cache'
  $env:UV_PROJECT_ENVIRONMENT = 'D:\DevData\tianwen-dsh-rc2-product-migration\python-venv'
  uv sync --frozen --dev
  uv run ruff check .
  uv run python -m compileall -q src tests
  uv run pytest
  ```

  Expected: all non-live Python gates pass. The paid live-model test remains skipped.

- [ ] **Step 4: Run managed product real-process gates once from fresh roots**

  ```powershell
  $env:TIANWEN_DSH_PHASE2_STARTUP = '1'
  $env:TIANWEN_CONTROLLED_INSTALLED_E2E = '1'
  $env:TIANWEN_E2E_DATA_DIR = 'D:\DevData\tianwen-dsh-rc2-product-migration\fresh-product'
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-product-migration\installed-controlled'
  node $pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts
  Remove-Item Env:TIANWEN_DSH_PHASE2_STARTUP
  Remove-Item Env:TIANWEN_CONTROLLED_INSTALLED_E2E
  Remove-Item Env:TIANWEN_E2E_DATA_DIR

  $env:TIANWEN_DSH_MIGRATION_PROFILE = '1'
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-product-migration\managed-profile'
  node $pnpm exec vitest run tests/dsh-migration/runtime-profile.spec.ts
  Remove-Item Env:TIANWEN_DSH_MIGRATION_PROFILE

  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-product-migration\one-shot'
  node $pnpm exec vitest run tests/dsh-migration/one-shot-profile-lifecycle.spec.ts

  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-rc2-product-migration\concurrent'
  node tests/dsh-migration/profile-concurrent-boot.mjs
  ```

  Each selected root must be absent before its command. Each opt-in real-process probe runs once;
  do not rerun to select a better result. Expected: exact new-version host/Profile/receipt,
  boot-free dump, real boot, clean shutdown, 8/8 concurrent publication, and no external/live
  Provider request.

- [ ] **Step 5: Audit scope and historical preservation**

  ```powershell
  git diff --name-only ba2495f..HEAD
  git diff --check ba2495f..HEAD
  git diff ba2495f..HEAD -- docs/operations docs/research docs/releases
  git status --short --branch
  ```

  Expected: no historical evidence document diff, no generated D-drive file staged, and a clean
  branch.

---

## Task 9: Record, review, and integrate the migration

**Files:**

- Create: `docs/operations/tianwen-dsh-0.1.1-rc.2-managed-product-migration-handoff.md`

- [ ] **Step 1: Write the evidence-backed migration handoff**

  Separate:

  1. exact authority and final candidate SHA;
  2. fresh installation result;
  3. real old-product upgrade and idempotence result;
  4. rollback coverage;
  5. full TypeScript and Python results;
  6. managed real-process results;
  7. historical facts intentionally left at `0.1.0-rc.7`;
  8. absence of external/live Provider and billing facts;
  9. remaining portable-plugin and Desktop work.

- [ ] **Step 2: Request final independent review**

  The reviewer compares the approved design, this plan, full diff, original gate logs, real-upgrade
  evidence, and handoff. Critical or Important findings return to the owning lane or integrator;
  only affected gates are rerun unless the final diff changes product behavior, in which case the
  complete repository gate runs again.

- [ ] **Step 3: Commit the reviewed handoff**

  ```powershell
  git add docs/operations/tianwen-dsh-0.1.1-rc.2-managed-product-migration-handoff.md
  git commit -m "docs: record DSH 0.1.1-rc.2 product migration"
  git status --short --branch
  ```

- [ ] **Step 4: Integrate only after every local gate is green**

  Use the reviewed integration path; do not force-push. After controlled merge and push, bind
  GitHub Actions to the exact merged SHA and require Python, TypeScript, and `installer-windows`
  success. If exact-main CI is queued, monitoring may continue separately without starting
  portable implementation on an unverified main.

---

## After This Plan

The managed-product migration is not the final Tianwen roadmap item. Once its exact-main gate is
green, the next product stage is the already approved portable-plugin work:

1. selected DSH home/Profile and portable Tianwen state-root contract;
2. one Runtime package installed into fresh and existing DSH CLI Profiles;
3. headless/Web runner composition and actual Runtime load;
4. install failure rollback, remove/uninstall, other-Profile isolation, and state preservation;
5. thin public CLI/status commands that target the user's DSH installation;
6. bounded Web server/HTTP smoke.

Inside that stage, package/state-root work, CLI lifecycle work, and headless/Web composition can
again run as separate reviewed lanes. Upstream Desktop-shell packaging research and public naming
can run in parallel as read-only/design work, but Desktop implementation depends on the portable
CLI/Profile contract. Real external-user natural-task validation comes after the portable product
path is installed and runnable; it is not replaced by more synthetic controlled Activities.
