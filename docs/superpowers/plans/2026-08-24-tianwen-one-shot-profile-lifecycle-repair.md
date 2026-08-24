# Tianwen One-Shot Profile Lifecycle Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** Make the ordinary one-shot Tianwen model-selection flow complete its work, shut down the
real DSH Profile, and exit normally before any new formal Provider activity is designed.

**Architecture:** Keep Tianwen's existing model runner and Profile composition. Repair the pending
watcher-readiness promise at its owner, `@deepseek-ai/cordis-plugin-hmr@1.0.16`, with a version-bound
pnpm patch. Prove that owner fix deterministically, then prove the real four-process model lifecycle,
then add CI and documentation. Do not introduce a Tianwen shutdown controller, retry, delay, forced
exit, transport framework, or formal-operation machinery.

**Tech Stack:** Node.js 22.20.0, TypeScript 6.0.3, pnpm 11.20.0 dependency patches, Vitest 4.1.8,
DeepSeek Harness/DSH 0.1.0-rc.7, Cordis 4.0.1, GitHub Actions Windows runner, Python public-contract
tests.

**Approved design:**
`docs/superpowers/specs/2026-08-24-tianwen-one-shot-profile-lifecycle-repair-design.md` at
`b4594bde1a95401cabe7c7840562b9d8a01b755a`.

---

## Global constraints

1. Work from the committed copy of this plan on branch
   `codex/tianwen-one-shot-profile-lifecycle-design`. Its parent must be exact approved design commit
   `b4594bde1a95401cabe7c7840562b9d8a01b755a`. Stop if identity or worktree cleanliness does not
   match before the implementation branch is created.
2. Product architecture comes first. The implementation order is owner-level lifecycle RED,
   owner-level repair, real Profile process GREEN, CI, then bounded documentation/security review.
3. The first deterministic HMR test is a falsification gate. If current
   `@deepseek-ai/cordis-plugin-hmr@1.0.16` does not leave `registerConfig()` unsettled when its owner
   is disposed before watcher readiness, stop and revise the design. Do not patch based only on the
   Activity-03 symptom.
4. Do not modify Tianwen's Agent loop, model adapter, settings store, credential service,
   controlled-lifecycle runner, Evolution ledger, installer behavior, or receipt schemas in this
   repair.
5. Do not accept exit 13, filter its warning, sleep, retry, force `process.exit()`, add a second
   shutdown controller, or add a Tianwen-specific no-watch mode.
6. The functional fixture uses real DSH/Profile packages and real child processes. It may use a
   runtime-generated dummy credential plus a loopback base URL, but it must send zero Provider model
   requests and create no Agent, Session, Goal, Candidate, or controlled-lifecycle activity.
7. Keep caches and generated test data on `D:`:

   ```powershell
   $env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
   $env:COREPACK_HOME = 'D:\DevData\corepack-home'
   $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-v0.1-eval-fixtures'
   ```

8. Activity-01, Activity-02, and Activity-03 remain immutable historical results. This plan does
   not rerun them or reinterpret whether they were consumed.
9. Future formal activity consumption changes prospectively: model activation is product setup;
   the first direct `controlled-lifecycle` invocation consumes a future formal Activity.
10. Use `apply_patch` for repository and extracted-package edits. Preserve unrelated worktree state.
11. Each implementation task ends with a focused verification and its own commit. Stop on a new
    failure class; investigate the owner before changing another layer.
12. Do not push, merge, trigger CI, install a product, or run the post-integration proof until the
    corresponding later checkpoint explicitly authorizes it.

## File responsibility map

| Path | Responsibility |
| --- | --- |
| `package.json` | Declare exact HMR and Loader versions as test-owned root dev dependencies. |
| `pnpm-workspace.yaml` | Register exactly one version-bound pnpm patch for HMR 1.0.16. |
| `pnpm-lock.yaml` | Freeze the two explicit test dependencies and patched HMR resolution. |
| `patches/` | Hold the single pnpm-generated, version-bound HMR 1.0.16 patch. |
| `tests/dsh-migration/one-shot-profile-lifecycle.spec.ts` | Own the deterministic close-before-ready regression and the real four-process Profile lifecycle. |
| `.github/workflows/ci.yml` | Run the new Windows-owned process regression after Runtime Bundle build. |
| `tests/contracts/test_public_repository_surface.py` | Lock only stable CI ownership and public lifecycle/Activity facts. |
| `README.md` | Publish the concise current English product state and future activity boundary. |
| `README.zh-CN.md` | Publish the same current state in Chinese. |
| `docs/tianwen-architecture-overview-v2.md` | Record the lifecycle owner and normal state-transition order. |
| `docs/operations/tianwen-v0.1-one-shot-profile-lifecycle-repair-handoff.md` | Preserve Activity-03's terminal fact and the completed repair evidence without redefining it. |

No other product, installer, workflow, package, or dependency file is in scope unless a required RED
disproves this ownership map and the design is revised first.

## Task 0: Exact authority takeover and unmodified baseline

**Files:** None.

- [ ] **Step 1: Verify exact repository identity before any write**

  Run:

  ```powershell
  git branch --show-current
  git rev-parse HEAD
  git rev-parse HEAD^
  git log -1 --format=%H -- `
    docs/superpowers/plans/2026-08-24-tianwen-one-shot-profile-lifecycle-repair.md
  git status --short
  git diff --check
  ```

  Expected:

  - branch is `codex/tianwen-one-shot-profile-lifecycle-design`;
  - HEAD equals the commit that added this plan;
  - HEAD's parent is `b4594bde1a95401cabe7c7840562b9d8a01b755a`;
  - status is empty;
  - diff-check passes.

- [ ] **Step 2: Read the approved design and exact implementation seams to EOF**

  Read:

  ```text
  docs/superpowers/specs/2026-08-24-tianwen-one-shot-profile-lifecycle-repair-design.md
  packages/tianwen-runtime-bundle/src/model.ts
  packages/tianwen-runtime-bundle/src/model-runner.ts
  tests/dsh-migration/model-configuration.spec.ts
  tests/dsh-migration/controlled-lifecycle-profile.spec.ts
  scripts/install-tianwen.mjs
  .github/workflows/ci.yml
  tests/contracts/test_public_repository_surface.py
  ```

  Also read the installed HMR `src/index.ts`, `lib/index.js`, and package manifest for exact version
  `1.0.16`. Confirm the pending readiness promise and service-disposal code still match the approved
  design.

- [ ] **Step 3: Create the implementation branch**

  Run:

  ```powershell
  git switch -c codex/tianwen-one-shot-profile-lifecycle-repair
  ```

- [ ] **Step 4: Run the unmodified focused baseline**

  Run:

  ```powershell
  pnpm --filter @tianwen/runtime-bundle... build
  pnpm exec vitest run tests/dsh-migration/model-configuration.spec.ts
  ```

  Expected: Runtime Bundle recursive build passes and the existing model configuration spec passes.
  Do not run the known slow local Profile test merely as a ritual; exact-main CI already owns its
  baseline.

- [ ] **Step 5: Stop and report the takeover checkpoint**

  No code, test, dependency, lockfile, patch, or documentation change is allowed in Task 0.

## Task 1: Prove and repair the HMR-owned one-shot shutdown defect

**Files:**

- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Create: one pnpm-generated HMR 1.0.16 patch under `patches/`
- Create: `tests/dsh-migration/one-shot-profile-lifecycle.spec.ts`

- [ ] **Step 1: Declare the already-transitive owner packages as exact test subjects**

  Run:

  ```powershell
  pnpm add -Dw `
    @deepseek-ai/cordis-plugin-hmr@1.0.16 `
    @deepseek-ai/cordis-plugin-loader@1.0.2
  ```

  Verify `package.json` contains exact versions without ranges. Confirm no unrelated dependency was
  added and the lockfile still resolves DSH at `0.1.0-rc.7`.

- [ ] **Step 2: Write the deterministic owner-level test before patching HMR**

  In `tests/dsh-migration/one-shot-profile-lifecycle.spec.ts`, create a small controlled Chokidar
  watcher double through `vi.mock('chokidar', ...)`. It must support `on`, `once`, `emit`, and an
  async idempotent `close`, while recording every watcher created.

  Boot the public packages exactly as upstream does:

  ```ts
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(fixtureRoot).href + '/'
  await ctx.plugin(Loader)
  await ctx.plugin(Timer)
  await ctx.plugin(Hmr, { root: [], ignored: [], debounce: 0 })
  ```

  Start, but do not await, one config registration. Wait only until the second controlled watcher
  exists; never emit `ready`:

  ```ts
  let outcome: 'pending' | 'resolved' | 'rejected' = 'pending'
  const registration = ctx.hmr.registerConfig(configPath, () => {})
  void registration.then(
    () => { outcome = 'resolved' },
    () => { outcome = 'rejected' },
  )
  await vi.waitFor(() => expect(controlledWatchers).toHaveLength(2))
  await ctx.fiber.dispose()
  await Promise.resolve()

  expect(outcome).toBe('rejected')
  expect(controlledWatchers[1]!.close).toHaveBeenCalledTimes(1)
  expect(() => controlledWatchers[1]!.emit('ready')).not.toThrow()
  expect(() => controlledWatchers[1]!.emit('error', new Error('late'))).not.toThrow()
  ```

  The test must not inspect HMR private fields and must not wait on a wall-clock timeout.

- [ ] **Step 3: Run the owner RED and apply the falsification stop line**

  Run:

  ```powershell
  pnpm exec vitest run `
    tests/dsh-migration/one-shot-profile-lifecycle.spec.ts `
    -t "settles a config registration when HMR is disposed before watcher readiness"
  ```

  Expected RED on unpatched 1.0.16: `outcome` remains `pending`. If the failure is not this exact
  ownership defect, stop. Do not edit HMR or Tianwen product code.

- [ ] **Step 4: Add the real Profile process regression before applying the patch**

  Reuse `deriveInstallPaths`, `renderProfilePatch`, and `canonicalJson` from the installer. Reuse the
  real DSH binary resolution and Profile package construction pattern from
  `controlled-lifecycle-profile.spec.ts`. Link only the built Tianwen Runtime Bundle into the
  fixture Profile; do not create a fake DSH executable.

  Add a Windows-owned test named:

  ```text
  completes DeepSeek activation and offline recovery through four fresh Profile processes
  ```

  Its helper must invoke the real DSH executable with:

  ```ts
  [dshBin, '--profile', 'tianwen', '--patch', modelPatch]
  ```

  and these environment fields:

  ```ts
  {
    ...process.env,
    DEEPSEEK_API_KEY: randomUUID(),
    DEEPSEEK_BASE_URL: 'http://127.0.0.1:1',
    DSH_HOME: paths.dshHome,
    DSH_TELEMETRY_DISABLED: '1',
    TIANWEN_MODEL_JSON: 'true',
    TIANWEN_MODEL_OPERATION: operation,
    TIANWEN_MODEL_MODEL: model ?? '',
  }
  ```

  Execute four independent child processes in order:

  ```text
  use deepseek-v4-pro
  status
  use offline
  status
  ```

  For each process assert `error === undefined`, `status === 0`, `signal === null`, empty stderr,
  one complete parseable JSON value, schema `tianwen.model-config.v1`, the expected operation and
  selection, configured credential reference, and `modelRequestsDelta === 0`. Assert the first
  fresh status reads DeepSeek and the final fresh status reads offline. Assert no Session root and no
  Evolution ledger were created. Always remove only the dedicated fixture root in `finally`.

  Run the test once against the unpatched dependency. A nonzero exit, unsettled-await diagnostic, or
  child timeout is the expected real-path RED. If timing happens not to reproduce it, preserve that
  fact and continue only because Step 3 supplied the deterministic owner RED required by the design.

- [ ] **Step 5: Extract the exact dependency with pnpm's patch workflow**

  Ensure this directory does not exist, then run:

  ```powershell
  pnpm patch @deepseek-ai/cordis-plugin-hmr@1.0.16 `
    --edit-dir D:\DevData\tianwen-cordis-hmr-1.0.16-patch
  ```

  Do not edit `node_modules` directly.

- [ ] **Step 6: Apply the smallest owner fix to both published source and runtime build**

  Edit only `src/index.ts` and `lib/index.js` in the extracted directory. In the TypeScript source,
  extend each config registration with a cancellation closure owned by the readiness promise:

  ```ts
  interface ConfigRegistration {
    watcher: FSWatcher
    cancelReady(): void
  }
  ```

  Use one state with four terminal meanings:

  ```ts
  let readyState: 'pending' | 'resolved' | 'rejected' | 'disposed' = 'pending'
  const cancelReady = () => {
    if (readyState !== 'pending') return
    readyState = 'disposed'
    ready.reject(new Error('HMR config watcher was disposed before readiness'))
  }
  ```

  Guard `ready` so it resolves only from `pending`. Handle startup `error` only from `pending`; warn
  only for an error after the watcher became `resolved`; ignore late events after rejection or
  disposal. Before service disposal closes config watchers, snapshot registrations, clear the map,
  and invoke each `cancelReady()` synchronously. Then close each watcher and await refresh tasks.

  In the `registerConfig()` catch path, delete and close the watcher only if that registration still
  owns the map entry. This prevents the service-disposal path and the registration catch path from
  racing to close the same watcher.

  Mirror the same runtime logic in `lib/index.js`. Do not change exports, types, watcher options,
  refresh semantics, reload logic, dependencies, or any Tianwen file.

- [ ] **Step 7: Commit the dependency patch through pnpm**

  Run:

  ```powershell
  pnpm patch-commit D:\DevData\tianwen-cordis-hmr-1.0.16-patch `
    --patches-dir patches
  pnpm install --frozen-lockfile
  ```

  Verify:

  - `pnpm-workspace.yaml` contains one `patchedDependencies` entry for exact HMR 1.0.16;
  - exactly one pnpm-generated patch is registered for HMR 1.0.16 under `patches/`;
  - the patch changes only HMR `src/index.ts` and `lib/index.js`;
  - `pnpm-lock.yaml` records the patched resolution;
  - no package version or Tianwen production source changed.

- [ ] **Step 8: Run the owner and product GREEN gates**

  Run in order:

  ```powershell
  pnpm exec vitest run `
    tests/dsh-migration/one-shot-profile-lifecycle.spec.ts `
    -t "settles a config registration when HMR is disposed before watcher readiness"

  pnpm --filter @tianwen/runtime-bundle... build

  pnpm exec vitest run `
    tests/dsh-migration/one-shot-profile-lifecycle.spec.ts `
    -t "completes DeepSeek activation and offline recovery through four fresh Profile processes"

  pnpm exec vitest run tests/dsh-migration/one-shot-profile-lifecycle.spec.ts
  ```

  Expected: both tests pass; the real process test returns four exit-0, stderr-empty receipts and
  ends offline without any model request.

- [ ] **Step 9: Run compatibility and build gates**

  Run:

  ```powershell
  pnpm exec vitest run `
    tests/dsh-migration/model-configuration.spec.ts `
    tests/dsh-migration/controlled-lifecycle-profile.spec.ts `
    tests/dsh-migration/runtime-bundle.spec.ts
  pnpm --filter @tianwen/runtime-bundle... build
  pnpm run typecheck
  pnpm run check:no-private-dsh-imports
  git diff --check
  ```

  The existing local Profile test has a known 60-second timing history. If its only failure is the
  already-classified local timeout while the new lifecycle test and semantic assertions pass, record
  it honestly and leave automatic exact-main CI as the standard gate; do not change its timeout in
  this repair.

- [ ] **Step 10: Commit the owner repair**

  Run:

  ```powershell
  git add package.json pnpm-workspace.yaml pnpm-lock.yaml patches `
    tests/dsh-migration/one-shot-profile-lifecycle.spec.ts
  git diff --cached --check
  git commit -m "fix: settle one-shot Profile shutdown"
  ```

  Report the exact parent, implementation SHA, RED, real process results, actual patch files, and
  gates. Stop before CI placement.

## Task 2: Put the real process regression in Windows CI

**Files:**

- Modify: `tests/contracts/test_public_repository_surface.py`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the CI ownership RED**

  Update only the existing Windows job snapshot/ownership contract. Extend the exact Windows Vitest
  command to:

  ```text
  pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/controlled-lifecycle-command.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/one-shot-profile-lifecycle.spec.ts
  ```

  Also assert the new spec is absent from the Ubuntu TypeScript job. Do not add a second parser or
  duplicate the full Windows snapshot.

  Run:

  ```powershell
  uv run pytest -q `
    tests/contracts/test_public_repository_surface.py::test_installer_windows_job_isolated_from_ubuntu_vitest_contract
  ```

  Expected RED: the Windows command is missing the new spec.

- [ ] **Step 2: Make the minimal workflow change**

  Add only `tests/dsh-migration/one-shot-profile-lifecycle.spec.ts` to the existing single
  `installer-windows` Vitest command after the recursive Runtime Bundle build. Do not add a new job,
  environment block, long E2E flag, retry, or workflow dispatch.

- [ ] **Step 3: Run focused GREEN and the exact local Windows command**

  Run:

  ```powershell
  uv run pytest -q `
    tests/contracts/test_public_repository_surface.py::test_installer_windows_job_isolated_from_ubuntu_vitest_contract
  uv run ruff check tests/contracts/test_public_repository_surface.py
  pnpm --filter @tianwen/runtime-bundle... build
  pnpm exec vitest run `
    tests/dsh-migration/tianwen-installer.spec.ts `
    tests/dsh-migration/controlled-lifecycle-command.spec.ts `
    tests/dsh-migration/runtime-bundle.spec.ts `
    tests/dsh-migration/one-shot-profile-lifecycle.spec.ts
  git diff --check
  ```

- [ ] **Step 4: Commit CI ownership**

  Run:

  ```powershell
  git add .github/workflows/ci.yml tests/contracts/test_public_repository_surface.py
  git diff --cached --check
  git commit -m "ci: verify one-shot Profile lifecycle on Windows"
  ```

  Stop and report the exact SHA and Windows process test result.

## Task 3: Publish the corrected product and Activity model after function is green

**Files:**

- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/tianwen-architecture-overview-v2.md`
- Create: `docs/operations/tianwen-v0.1-one-shot-profile-lifecycle-repair-handoff.md`
- Modify: `tests/contracts/test_public_repository_surface.py`

- [ ] **Step 1: Write a small atomic public-contract RED**

  Add normalized-text assertions for these stable facts only:

  - Activity-03 historically remains consumed;
  - its model-use receipt persisted DeepSeek, but the process ended with exit 13 before lifecycle;
  - offline recovery succeeded and controlled-lifecycle invocation remained zero;
  - HMR watcher readiness is the repaired process-lifecycle owner;
  - future model activation is setup and does not consume a formal Activity;
  - the first future `controlled-lifecycle` invocation consumes that Activity;
  - Activity-01/02/03 classifications are not rewritten;
  - no real Provider success is claimed.

  Do not lock paragraph wording, punctuation, byte counts, paths, exact evidence filenames, or full
  command sequences.

  Run the new/updated public node and expect RED because the documents still describe the older
  state.

- [ ] **Step 2: Update the three public entry documents**

  Replace stale current-state text, including any claim that Activity-02 is still unconsumed. Keep
  the top-level explanation short:

  ```text
  normal product activation
  → fresh status confirms selection
  → first controlled-lifecycle invocation begins/consumes formal evaluation
  → offline recovery
  → final status
  ```

  Explain plainly that the repair is a DSH/HMR shutdown fix, not a receipt-security feature.

- [ ] **Step 3: Write one concise Activity-03/repair handoff**

  The handoff records:

  - the historical Activity-03 terminal classification without changing it;
  - the root-cause proof and patched owner/version;
  - deterministic and real-process test outcomes;
  - the prospective activity-consumption rule;
  - the exact boundary that a fresh official zero-request proof still awaits exact-main CI.

  Link the approved design. Do not copy private paths, credentials, raw stderr, packet contents,
  Session identities, or formal task material.

- [ ] **Step 4: Run document GREEN and commit**

  Run:

  ```powershell
  uv run pytest -q tests/contracts/test_public_repository_surface.py
  uv run ruff check tests/contracts/test_public_repository_surface.py
  git diff --check
  ```

  Then:

  ```powershell
  git add README.md README.zh-CN.md docs/tianwen-architecture-overview-v2.md `
    docs/operations/tianwen-v0.1-one-shot-profile-lifecycle-repair-handoff.md `
    tests/contracts/test_public_repository_surface.py
  git diff --cached --check
  git commit -m "docs: record one-shot Profile lifecycle repair"
  ```

  Stop and report. Do not merge or run a product install.

## Task 4: Final functional verification and bounded review

**Files:** No planned changes. Any correction requires its own RED and commit.

- [ ] **Step 1: Run the functional acceptance set first**

  Run:

  ```powershell
  pnpm --filter @tianwen/runtime-bundle... build
  pnpm exec vitest run `
    tests/dsh-migration/one-shot-profile-lifecycle.spec.ts `
    tests/dsh-migration/model-configuration.spec.ts `
    tests/dsh-migration/controlled-lifecycle-profile.spec.ts
  pnpm exec vitest run `
    tests/dsh-migration/tianwen-installer.spec.ts `
    tests/dsh-migration/controlled-lifecycle-command.spec.ts `
    tests/dsh-migration/runtime-bundle.spec.ts `
    tests/dsh-migration/one-shot-profile-lifecycle.spec.ts
  ```

  Review the user-visible result before any secondary checks: four real one-shot processes complete,
  persist/read the expected state, shut down, and return exit 0 with empty stderr.

- [ ] **Step 2: Run repository compatibility gates**

  Run once, in order:

  ```powershell
  pnpm run typecheck
  pnpm run check:no-private-dsh-imports
  pnpm run check
  uv run pytest -q
  uv run ruff check .
  git diff --check
  ```

  Report every first failure honestly. Do not turn an unrelated known local Profile timing issue into
  product code, and do not call a partially green full gate successful.

- [ ] **Step 3: Review architecture and correctness before security**

  Perform three bounded reviews in this order:

  1. **Product architecture/correctness:** Does the fix belong to HMR, settle every readiness path,
     and make the real state-transition sequence complete without Tianwen compensation?
  2. **Simplicity/YAGNI:** Can any new helper, dependency, assertion, or documentation matrix be
     removed while preserving the root fix and real process proof?
  3. **Security/privacy after function:** Did the working repair introduce a reachable credential,
     output, path, or process-control problem? Do not invent a new hardening project absent a real
     reachable issue.

  Any Critical or Important finding stops approval and receives a separate, narrow TDD correction.

- [ ] **Step 4: Produce the reviewed feature identity**

  Verify:

  ```powershell
  $planSha = git log -1 --format=%H -- `
    docs/superpowers/plans/2026-08-24-tianwen-one-shot-profile-lifecycle-repair.md
  git status --short
  git log --oneline --decorate -5
  git diff --check "$planSha..HEAD"
  git diff --name-only "$planSha..HEAD"
  ```

  Expected: clean tree and only the responsibility-map files. Stop for exact-SHA approval.

## Task 5: Controlled integration and automatic exact-main CI

**Files:** No merge-only edits.

This task begins only after the reviewed feature SHA is explicitly approved.

- [ ] **Step 1: Archive the approved feature normally**

  Push the exact feature SHA to its `codex/` branch with a normal non-force push. Verify local branch,
  remote tracking ref, and `git ls-remote` all equal the approved SHA.

- [ ] **Step 2: Merge once into unchanged main**

  Fresh-fetch and require local main, `origin/main`, and `ls-remote main` to equal the supervisor's
  expected previous-main SHA. Perform one `--no-ff` merge with:

  ```text
  merge: repair one-shot Profile lifecycle
  ```

  Require the merge tree to equal the approved feature tree, both first-parent diff-check forms to
  pass, no conflicts, and no merge-only edits.

- [ ] **Step 3: Push main once and observe only the matching automatic run**

  Recheck remote main immediately before a normal non-force push. After the push, locate the unique
  automatic `push`, attempt-1 run whose `head_sha` equals the merge SHA. Do not rerun, dispatch, or
  supplement jobs.

  Required successful jobs:

  - Python;
  - TypeScript;
  - installer-windows, including Runtime Bundle build and the exact Windows command containing
    `one-shot-profile-lifecycle.spec.ts`.

  Stop on the first failure and preserve it. If all jobs pass, still stop before any installer or
  product command.

## Task 6: Fresh official zero-request product proof

**Files:** No repository changes.

This task requires a separate supervisor release after Task 5 succeeds. It is product verification,
not a formal Activity and not a Provider run.

- [ ] **Step 1: Freeze the proof identity and fresh roots**

  Require clean exact main and the successful attempt-1 CI from Task 5. Require these roots not to
  exist:

  ```text
  D:\DevData\tianwen-one-shot-profile-lifecycle-proof-product
  D:\DevData\tianwen-one-shot-profile-lifecycle-proof-evidence
  ```

  Use D:-based pnpm/Corepack caches. Do not inspect or reuse Activity-01/02/03 product or evidence
  roots.

- [ ] **Step 2: Run the official installer exactly once**

  Run the repository's official installer entry for the fresh product root with `--json`. Require
  exit 0, empty stderr, a ready install receipt, and the installed CLI from that receipt. Preserve
  stdout/stderr/exit under the dedicated evidence root. Do not repeat unrelated publication audits
  in this functional proof.

- [ ] **Step 3: Run the four ordinary official commands**

  Through the installed official `.CMD`, run each command at most once and in order:

  ```text
  tianwen model use --model deepseek-v4-pro --data-dir ABSOLUTE_PRODUCT_ROOT --json
  tianwen model status --data-dir ABSOLUTE_PRODUCT_ROOT --json
  tianwen model use --model offline --data-dir ABSOLUTE_PRODUCT_ROOT --json
  tianwen model status --data-dir ABSOLUTE_PRODUCT_ROOT --json
  ```

  Use a runtime-generated dummy credential and loopback Provider base URL. For the success path,
  require every command to exit 0 with empty stderr and one complete valid model-config receipt;
  require DeepSeek on the first fresh status, offline on the final status, and
  `modelRequestsDelta=0` throughout.

  If DeepSeek activation fails, do not retry it. Skip the DeepSeek status, run offline recovery once,
  run final offline status once, then stop and report the functional failure.

- [ ] **Step 4: Close only the product-level acceptance**

  Confirm no controlled-lifecycle command, Agent, Session, Goal, or formal Activity was created.
  Report the four process results and final offline state. Do not design or start another formal
  Activity in this task.

## Task 7: Hand off the next product decision

After Task 6 passes, stop. The next decision is a separate architecture task: whether and how to
design a new formal real-Provider Activity using the prospective consumption rule. Do not derive that
authorization from this repair plan.

## Plan self-review checklist

- [ ] Every approved design section maps to a task above.
- [ ] The deterministic owner RED precedes every dependency patch.
- [ ] The functional real-process proof precedes CI and security review.
- [ ] The patch is exact-version-bound and changes the promise owner, not Tianwen compensation code.
- [ ] No retry, delay, forced exit, warning filter, no-watch mode, second supervisor, or lifecycle
      framework appears.
- [ ] The real Profile test uses the real DSH binary and built Runtime Bundle; the existing fake bin
      remains only in its narrow unit test.
- [ ] CI ownership is a one-command extension of the existing Windows job.
- [ ] Public contracts assert stable facts, not wording or formatting.
- [ ] Activity-01/02/03 histories stay immutable, and future consumption begins at
      `controlled-lifecycle`.
- [ ] Product install/proof remains separately released and sends zero Provider model requests.
- [ ] Security review occurs only after the normal functional flow is green.
