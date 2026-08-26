# Tianwen Profile Dump Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use Tianwen's existing ordinary natural-run path once to produce a real DeepSeek Harness
profile-dump fix, independently prove the upstream architecture and performance result, and only
then prepare the released DSH version for Tianwen.

**Architecture:** Keep configuration composition in DeepSeek Harness and keep Tianwen as an
official-CLI consumer. The ordinary Agent may inspect and edit an isolated upstream checkout, but
the controller—not the model—owns test execution and final acceptance. The natural-run `read`
Evidence is a completion observation, not a substitute for test or performance proof.

**Tech Stack:** TypeScript, Node.js 22, pnpm 11.7.0 for DeepSeek Harness, pnpm 11.20.0 for Tianwen,
Vitest, official Tianwen installed CLI, DSH rc.7 natural-run services, Git.

## Global Constraints

- The approved design is
  `docs/superpowers/specs/2026-08-26-tianwen-profile-dump-boundary-design.md` at exact SHA
  `2284b8731b476a9c5b6132d0f23192cd9e7d6a2a`.
- The upstream baseline is `deepseek-ai/deepseek-harness` master
  `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` unless a read-only takeover check proves that this
  exact commit is no longer available. Do not silently substitute a newer commit.
- Put the upstream checkout, product root, package stores, build outputs, and task evidence under
  `D:\DevData`; do not use `C:` for generated data.
- Invoke the ordinary Tianwen natural task exactly once. A pre-Turn failure that records zero model
  requests may be diagnosed, but it does not authorize a second model attempt without a new plan.
- Do not invoke `controlled-lifecycle`, create a controlled Activity, register ScriptedAdapter, or
  copy the expected production edit into the task prompt or Skill.
- The installed Tianwen Profile currently disables the PowerShell tool. This pilot intentionally
  tests the existing product rather than quietly widening its tool surface. The Agent edits through
  the shipped filesystem tools; the controller runs all tests afterward.
- The final `read` Evidence only proves that the Agent reached its declared completion boundary.
  Semantic correctness comes from the independent upstream tests, cold-home filesystem check,
  timing measurements, and review.
- Preserve a failed or incomplete Agent result. Do not manually repair the upstream patch before
  classifying the one-attempt task result.
- No branch push or pull request to the external DeepSeek repository is authorized by this plan.
  External publication is a separate user-approved action.
- Do not add a Tianwen-owned config composer, cache, timeout increase, persistent pnpm patch, task
  runner, verifier framework, retry layer, budget layer, or telemetry subsystem.

## File Responsibility Map

### Tianwen authority and operation files

- `docs/superpowers/specs/2026-08-26-tianwen-profile-dump-boundary-design.md` — approved design.
- `docs/superpowers/plans/2026-08-26-tianwen-profile-dump-boundary.md` — this execution plan.
- `packages/tianwen-runtime-bundle/src/natural-run-trial.ts` — existing manifest and receipt contract;
  read-only during the pilot.
- `packages/tianwen-runtime-bundle/src/resume-runner.ts` — existing ordinary natural-run owner;
  read-only during the pilot.
- `tests/dsh-migration/controlled-lifecycle-profile.spec.ts` — unchanged Tianwen semantic and timing
  acceptance test.

### DeepSeek Harness candidate implementation files

- `apps/cli/src/profile-boot.ts` — shared profile preparation and real boot ownership.
- `apps/cli/src/dump-config.ts` — offline dump caller; change only if the Agent proves it is needed.
- `apps/cli/tests/built-bin.e2e.ts` — preferred public-CLI regression test for a cold dump.
- `packages/boot/app-boot/tests/profile.spec.ts` — existing fallback-healing contract; strengthen only
  if the public-CLI test cannot prove the real-boot counterexample.

### Tianwen release-integration files, only after an official DSH release exists

- `package.json`
- `pnpm-lock.yaml`
- `packages/tianwen-dsh-host/package.json`
- `packages/tianwen-profile-host/package.json`
- `packages/tianwen-dsh-compat/package.json`
- `packages/tianwen-dsh-compat/src/index.ts`
- `packages/tianwen-dsh-compat/src/runtime.ts`
- `packages/tianwen-runtime/package.json`
- `packages/tianwen-runtime/src/index.ts`
- `packages/tianwen-runtime-bundle/package.json`
- `packages/tianwen-runtime-bundle/src/resume.ts`
- `packages/tianwen-runtime-bundle/src/controlled-lifecycle.ts`
- `packages/tianwen-runtime-bundle/src/controlled-lifecycle-contract.ts`
- `packages/tianwen-evolution/src/controlled-skill-evaluation.ts`
- `packages/tianwen-evolution/src/controlled-skill-shadow.ts`
- `packages/tianwen-evolution/src/skill-evaluation.ts`
- `scripts/check-dsh-install.mjs`
- `scripts/install-tianwen.mjs`
- `scripts/verify-dsh-profile.mjs`
- the focused tests that assert the exact DSH version.

---

## Task 0: Exact takeover and immutable baselines

**Files:**

- Read: `docs/superpowers/specs/2026-08-26-tianwen-profile-dump-boundary-design.md`
- Read: `docs/superpowers/plans/2026-08-26-tianwen-profile-dump-boundary.md`
- Create later: `D:\DevData\tianwen-profile-dump-pilot-baseline-evidence\baseline.json`

- [ ] **Step 1: Verify the Tianwen authority identity**

  From the Tianwen linked worktree, require a clean tree and exact plan SHA. Record branch, HEAD,
  main, origin/main, and `git ls-remote` main. Stop on any mismatch; do not clean the tree.

- [ ] **Step 2: Verify the upstream Git object**

  Run:

  ```powershell
  git ls-remote https://github.com/deepseek-ai/deepseek-harness.git refs/heads/master
  ```

  This records current master. During checkout creation, explicitly fetch
  `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`; that fetch is the object-availability proof. Current
  master may move, but the pilot stays on the frozen object.

- [ ] **Step 3: Create the isolated upstream checkout**

  Target:

  ```text
  D:\DevData\tianwen-profile-dump-pilot-deepseek-harness
  ```

  Require the target not to exist. Clone without changing the Tianwen repository, check out the
  frozen SHA in a new local branch `codex/tianwen-profile-dump-boundary`, and record the clean tree.

- [ ] **Step 4: Install upstream dependencies on D:**

  Set:

  ```powershell
  $env:PNPM_CONFIG_STORE_DIR='D:\DevData\pnpm-store'
  $env:COREPACK_HOME='D:\DevData\corepack-home'
  ```

  Use the repository-declared `pnpm@11.7.0`. Do not edit `package.json` or the lockfile. Record the
  install exit code and verify the upstream checkout remains clean.

- [ ] **Step 5: Capture the unmodified RED**

  Build the upstream official CLI, then use its shipped `web` Profile against a dedicated fresh home
  under `D:\DevData\tianwen-profile-dump-pilot-baseline-home`. Run one cold dump and record:

  - exit code;
  - first-dump wall time;
  - whether `profiles/node_modules` was created;
  - regular/link entry count below that directory.

  Use `pnpm run build:official` and the built `apps/cli/lib/bin.js`; do not invoke a globally installed
  DSH. Then run the existing Tianwen Profile spec once from the Tianwen worktree with its unchanged
  60-second timeout. The expected baseline is the already observed timeout or a cold run that still
  materializes the fallback. If neither occurs, stop and revisit the design instead of forcing RED.

- [ ] **Step 6: Commit no files**

  This task is read-only apart from D: evidence and dependency/build output. Stop after reporting the
  exact baseline.

---

## Task 1: Freeze the one-attempt ordinary project task

**Files:**

- Create under evidence root: `task-brief.md`
- Create under fresh Tianwen product: `dsh-home/skills/tianwen-project-owner/SKILL.md`
- Create under evidence root: `natural-run-trial.json`
- Create under evidence root: `acceptance.json`

- [ ] **Step 1: Create fresh product and evidence roots**

  Require the product and task-evidence roots not to exist:

  ```text
  D:\DevData\tianwen-profile-dump-pilot-product
  D:\DevData\tianwen-profile-dump-pilot-evidence
  ```

  Revalidate the Task 0 upstream checkout at the frozen commit with a clean tree. Never reuse an
  Activity-01/02/03/22 product or evidence root.

- [ ] **Step 2: Write the generic parent Skill**

  The Skill must contain only reusable project-owner discipline:

  ```markdown
  ---
  name: tianwen-project-owner
  description: Complete one bounded repository change with independently owned acceptance.
  whenToUse: When a frozen project task requires a small architecture-correct implementation.
  user-invocable: false
  ---

  # Tianwen Project Owner

  Use this Skill for one bounded repository change with frozen acceptance criteria.

  1. Read the relevant implementation and tests before editing.
  2. Identify the owner of the behavior; do not hide a design error with timeout or cache changes.
  3. Make the smallest coherent change that preserves the named counterexample.
  4. Do not change unrelated files, dependency versions, or public behavior.
  5. The controller runs tests independently. Do not claim a test ran when no shell tool is available.
  6. After the final edit, make the frozen final `read` call exactly once to signal completion.
  ```

  Omitting `disable-model-invocation` keeps model invocation enabled under the official filesystem
  Skill contract. Do not include the expected code edit.

- [ ] **Step 3: Freeze the task brief**

  The objective must state only the externally observable facts and architecture requirement:

  ```text
  Repair DeepSeek Harness cold Profile inspection. A fresh official --dump-config spends roughly
  125 seconds materializing profiles/node_modules through healProfilesModuleFallback, although dump
  is boot-free composition. Cold dump must not materialize the runtime fallback; real Profile boot
  must still heal and resolve modules. Preserve dump meaning and errors. Add focused regression
  coverage. Do not raise timeouts, warm a cache, bypass the official CLI, or add a second composer.
  The controller will run tests after this one Agent turn.
  ```

  Append two execution instructions without naming a solution: first load
  `tianwen-project-owner` with the `skill` tool; after the final mutation, call `read` exactly with
  `file_path=apps/cli/src/profile-boot.ts`, `offset=1`, and `limit=2000`. Do not name the exact line
  to move or provide a patch.

- [ ] **Step 4: Freeze the natural-run acceptance contract**

  Use the existing v1 manifest. The final object is written only after Goal creation, with the
  runtime `$goalId` inserted as the second key:

  ```powershell
  $trial = [ordered]@{
    schemaVersion = 'tianwen.natural-run-trial.v1'
    goalId = $goalId
    taskRef = 'task:profile-dump-boundary'
    scopeKey = 'project:deepseek-harness/capability:profile-dump'
    parentSkillName = 'tianwen-project-owner'
    acceptanceContract = [ordered]@{
      source = 'dsh-tool-result'
      toolName = 'read'
      notMetErrorCode = 'FS_NOT_FOUND'
      gapDisposition = 'observe'
    }
    verifierArguments = [ordered]@{
      file_path = 'apps/cli/src/profile-boot.ts'
      offset = 1
      limit = 2000
    }
  }
  ```

  Serialize this object only after `$goalId` has been parsed from the official create receipt. Do not
  change any other field.

  This verifier proves a final repository observation only. The acceptance file must explicitly say
  that it does not certify the patch or tests.

- [ ] **Step 5: Freeze controller-owned acceptance commands**

  Record exact commands before the model starts:

  ```powershell
  pnpm exec vitest run apps/cli/tests/built-bin.e2e.ts
  pnpm exec vitest run packages/boot/app-boot/tests/profile.spec.ts
  pnpm run typecheck
  ```

  Also freeze the Tianwen command:

  ```powershell
  pnpm exec vitest run tests/dsh-migration/controlled-lifecycle-profile.spec.ts
  ```

  The upstream acceptance additionally requires a fresh-home dump to leave
  `profiles/node_modules` absent and a real boot test to retain fallback healing.

- [ ] **Step 6: Review execution integrity**

  Confirm the task brief contains no solution patch, the Skill is generic, the upstream tree is
  clean, the verifier file exists before the turn, and no Agent request has been made. Record this
  as a small JSON review receipt under the evidence root.

---

## Task 2: Install Tianwen and prepare one ordinary Session

**Files:**

- Read: `scripts/install-tianwen.mjs`
- Read: installed receipt under the fresh product
- Create: transport files under `D:\DevData\tianwen-profile-dump-pilot-evidence`

- [ ] **Step 1: Run the official installer once**

  From exact Tianwen main, run the existing official installer with the fresh product root. Save
  stdout, stderr, and exit code without overwriting. Require the normal ready receipt, canonical
  installed CLI identity, and publication contract. Do not add Activity-grade archive rituals beyond
  the installer's existing contract.

- [ ] **Step 2: Confirm the ordinary tool surface without an Agent turn**

  Use the installed official DSH dump only if needed and record whether `skill`, `read`, `write`,
  `edit`, and filesystem search tools are enabled while `pwsh` is disabled. If `read`, `write`,
  `edit`, or `skill` is unavailable, stop: the ordinary task cannot run honestly.

- [ ] **Step 3: Run official offline model status once**

  Require `tianwen-offline/phase2-smoke`, configured credential reference, and
  `modelRequestsDelta=0`.

- [ ] **Step 4: Create one Goal from the upstream checkout**

  Set the process working directory to the isolated DeepSeek Harness root, then run:

  ```powershell
  & $tianwenCmd create --objective $taskBrief --max-rounds 1 --data-dir $productRoot --json
  ```

  Save the Goal receipt. Require one fresh Session id and no prior Turn. Insert only the exact Goal id
  into `natural-run-trial.json`.

- [ ] **Step 5: Switch to DeepSeek and confirm status**

  Run the official tokenized argv forms:

  ```powershell
  & $tianwenCmd model use --model deepseek-v4-pro --data-dir $productRoot --json
  & $tianwenCmd model status --data-dir $productRoot --json
  ```

  Each is attempted at most once. If either fails, skip the Agent turn, restore offline once, record
  the failure, and stop.

- [ ] **Step 6: Stop before the model turn**

  Revalidate exact upstream SHA, clean diff, trial manifest digest, Goal/Session identity, generic
  Skill bytes, and zero previous model requests. Report readiness and wait for the already approved
  execution step; no extra user authorization is needed unless the credential is absent.

---

## Task 3: Execute exactly one ordinary Tianwen development turn

**Files:**

- Potentially modify in upstream checkout: `apps/cli/src/profile-boot.ts`
- Potentially modify in upstream checkout: `apps/cli/src/dump-config.ts`
- Potentially modify in upstream checkout: `apps/cli/tests/built-bin.e2e.ts`
- Potentially modify in upstream checkout: `packages/boot/app-boot/tests/profile.spec.ts`
- Never modify the Tianwen source tree in this task.

- [ ] **Step 1: Invoke natural resume once**

  From the upstream checkout, run:

  ```powershell
  & $tianwenCmd resume --goal $goalId --data-dir $productRoot --trial-manifest $trialManifestPath --json
  ```

  Save stdout, stderr, and exit code to previously absent evidence files. Do not rerun the Goal or
  create another Goal for the same task.

- [ ] **Step 2: Restore offline regardless of result**

  Run official offline model use once and final model status once. Preserve their receipts. If the
  Agent command fails, recovery still occurs; no implementation repair occurs in between.

- [ ] **Step 3: Classify natural runtime evidence**

  Separately report:

  - Session persistence and exact one Turn;
  - model/tool counts from the natural-run receipt;
  - whether the parent Skill was `recorded` or `no-use-proof`;
  - Outcome/learning decision exactly as recorded;
  - whether the final exact `read` occurred after the last mutation;
  - upstream Git diff and changed file set.

  Do not call a successful `read` a passing code change.

- [ ] **Step 4: Stop on an empty, unrelated, or structurally invalid diff**

  The allowed semantic area is Profile preparation plus focused tests. Dependency, release,
  generated, lockfile, timeout, cache, Tianwen, or unrelated upstream changes make the one-attempt
  result incomplete. Preserve it and stop without manual cleanup or repair.

---

## Task 4: Independently validate the Agent's exact diff

**Files:**

- Read all upstream files changed by the Agent.
- Do not edit the upstream checkout during validation.

- [ ] **Step 1: Prove the Agent-authored regression test is RED on the frozen parent**

  Create a second disposable D:-hosted worktree at
  `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. Apply only the Agent's diffs under
  `apps/cli/tests` and `packages/boot/app-boot/tests`, never its production diff. Run the new focused
  test there and require failure because the cold dump materializes the fallback. If the test passes
  on the frozen parent, it is not a valid regression test; classify the task incomplete.

- [ ] **Step 2: Run the frozen upstream tests serially**

  Run the three commands frozen in Task 1. Record the first failure without repairing it. A passing
  result must include both the dump-facing test and the fallback-healing/real-boot counterexample.

- [ ] **Step 3: Run the deterministic cold-home check**

  Use a new absent DSH home. Build the official CLI, run exactly one cold dump, and require:

  - exit 0;
  - `profiles/node_modules` remains absent;
  - output parses as the official dump format;
  - wall time below 15 seconds on the canonical Windows machine.

  Run a second dump only for the before/after timing report, not to make the first result pass.

- [ ] **Step 4: Prove the real-boot counterexample**

  Run the existing focused real Profile boot test or the new upstream regression chosen by the Agent.
  Require fallback healing and successful plugin resolution. Do not infer this from source review.

- [ ] **Step 5: Run Tianwen compatibility against the local upstream build**

  Use an isolated package/link strategy that does not edit Tianwen's committed dependency files.
  Run the unchanged Tianwen Profile spec with its 60-second timeout. Require the existing ordinary
  `normal/2`, controlled `normal/0`, controlled `session-title-llm` disable, and runner-presence
  assertions.

  If local package substitution cannot reproduce the installed topology without changing Tianwen,
  record the limitation and defer this gate to the released-version task; do not add a pnpm patch.

- [ ] **Step 6: Review correctness, architecture, and simplicity**

  Review the exact Agent diff for:

  1. offline composition no longer owns fallback materialization;
  2. every real boot path still heals before Loader mount;
  3. plugin-management behavior is unchanged unless covered by a failing test;
  4. no cache, duplicate composer, timeout increase, or speculative abstraction was added;
  5. tests fail on the frozen parent for the intended reason and pass on the Agent tree.

  Any reachable Critical or Important finding makes the pilot result incomplete. Do not fix it in
  this frozen task.

- [ ] **Step 7: Create a local upstream commit only if every gate passes**

  Commit the Agent-authored diff on the isolated local branch with a concise upstream-style message.
  Record exact parent, commit SHA, tree, tests, timings, and reviews. Do not push.

---

## Task 5: Report the pilot and decide the next product step

**Files:**

- Create later in Tianwen docs only after review:
  `docs/operations/tianwen-profile-dump-natural-task-handoff.md`
- Update: `tests/contracts/test_public_repository_surface.py` only if the handoff becomes public.

- [ ] **Step 1: Report four evidence layers separately**

  Report task result, natural runtime evidence, learning facts, and external facts as separate
  sections. State plainly that the current ordinary Profile lacked a shell tool and that the
  controller, not the Agent, ran tests.

- [ ] **Step 2: Classify the pilot**

  Use one of:

  - `task-passed`: exact Agent diff passed all independent gates;
  - `task-incomplete`: Agent produced a relevant diff but one or more gates failed;
  - `execution-unavailable`: existing ordinary tool surface could not support honest editing;
  - `pre-turn-failed`: no model turn occurred;
  - `transport-failed`: official invocation entered but no valid natural receipt returned.

  Do not collapse these states into a generic success/failure label.

- [ ] **Step 3: Make the product-first next decision**

  If the task fails because the Agent cannot inspect/edit or because lack of shell prevents a
  coherent implementation, the next Tianwen design task is an ordinary project-execution lane. It
  must be designed as core product functionality before adding more safety machinery.

  If the task passes, proceed to external upstream review only after explicit authorization. In
  either case, do not claim learning from one task.

- [ ] **Step 4: Freeze a later same-family task separately**

  Choose a distinct, useful Profile composition or boot ownership issue only after this result is
  final. Freeze it before execution so any reuse evidence is not answer-fitted. This is outside the
  present task.

---

## Task 6: External DeepSeek Harness publication — separate authorization required

**Files:**

- Upstream exact Agent-authored files only.

- [ ] **Step 1: Obtain explicit authorization for external publication**

  Present the local upstream commit, exact diff, license/provenance, test results, and proposed PR
  text. Do not push based only on approval of this implementation plan.

- [ ] **Step 2: Rebase or refresh only under a new reviewed plan if upstream moved**

  Do not silently replay the one-attempt Agent task on a newer upstream base. A mechanical rebase is
  allowed only after checking for semantic conflicts and rerunning upstream gates.

- [ ] **Step 3: Push and open the upstream PR once**

  Use a non-force feature branch. Preserve CI/review results. Any requested semantic change becomes
  a separately reviewed follow-up, not a hidden modification of the pilot result.

---

## Task 7: Consume an official DSH release in Tianwen

**Files:**

- Modify only the release-integration files listed in the File Responsibility Map.
- Add or update exact focused tests that assert the new DSH version.

- [ ] **Step 1: Wait for an official released version containing the fix**

  Verify the npm package, upstream commit/release notes, and package archive. A PR or local build is
  not a released dependency.

- [ ] **Step 2: Write the Tianwen RED before changing versions**

  Add the deterministic assertion to
  `tests/dsh-migration/controlled-lifecycle-profile.spec.ts`: a fresh dump must not create
  `profiles/node_modules`. Keep the existing 60-second timeout. Run it on the current rc.7 tree and
  require the intended failure or timeout.

- [ ] **Step 3: Update the complete DSH version family**

  Update every exact DSH package/version constant together, regenerate `pnpm-lock.yaml` using the
  D:-hosted pnpm store, and keep the package family aligned. Do not partially mix rc.7 and the new
  release.

- [ ] **Step 4: Run focused Tianwen GREEN gates**

  Run serially:

  ```powershell
  pnpm exec vitest run tests/dsh-migration/controlled-lifecycle-profile.spec.ts
  pnpm exec vitest run tests/dsh-migration/model-configuration.spec.ts tests/dsh-migration/controlled-lifecycle-command.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-installer.spec.ts
  pnpm --filter @tianwen/runtime-bundle... build
  pnpm run typecheck
  pnpm run check:dsh-install
  pnpm run check:no-private-dsh-imports
  git diff --check
  ```

- [ ] **Step 5: Run exact-main CI after controlled integration**

  Review the feature SHA, merge normally, push main once, and require the automatic push attempt 1
  Python, TypeScript, and installer-windows jobs all succeed. Do not rerun a failed exact-main attempt
  under this task.

- [ ] **Step 6: Publish the final handoff**

  Record the upstream release, Tianwen merge/CI, cold/warm timings, deterministic no-fallback proof,
  real-boot proof, and ordinary natural-task classification. Keep Provider-account usage separate
  from Session counters.

## Final completion criteria

This plan is complete only when either:

1. the one-attempt ordinary task is honestly classified and preserved, with no external publication;
   or
2. after separate authorization, the upstream fix is released and Tianwen consumes it with exact-main
   CI green.

The first state completes the pilot but not the product fix. The second completes the product fix.
Neither state proves learning; that requires the separately frozen same-family task described above.
