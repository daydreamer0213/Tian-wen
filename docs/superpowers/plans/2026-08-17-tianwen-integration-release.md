# Tianwen Integration Release Implementation Plan

> **For agentic workers:** Execute this plan serially. The live-goal design and `2026-08-16-tianwen-deepseek-v4-pro-live-goal-round.md` are frozen inputs; do not amend them while carrying out this release plan.

**Goal:** Archive one fully reviewed, offline-green pre-live candidate; integrate that exact candidate with the canonical `origin/main` documentation spine; and merge to `main` only after a separately authorized single paid Goal chain creates and archives the canonical live handoff.

**Architecture:** Historical stage branches are immutable audit records. A normal `--no-ff` merge creates `codex/tianwen-integration` from a freshly verified `origin/main` plus one SHA-pinned pre-live candidate. The canonical live handoff does not exist before the paid attempt. Only after that attempt does the stage branch gain the handoff and receive a second SHA-pinned normal merge into integration.

**Tech Stack:** Git, GitHub, Node.js 22, pnpm 11.20.0, Vitest, uv/Python 3.11, pytest, Ruff, Windows LocalSandbox, DSH `0.1.0-rc.6`.

## Global Constraints

- The known starting `origin/main` is `542000a2f531f28dcd329712d3e4f35f80693b03`; fetch and verify its current remote SHA before every branch-creation or final-main decision. It is a starting observation, never permission to use a stale local ref.
- The observed implementation source is `codex/tianwen-live-goal-round@f57918188478998d3d0ce76bb93374e4401a8ea9`. Treat it as the pre-live implementation baseline only: before the paid attempt it has **no canonical live handoff**. Do not describe or select a “stage tip after its canonical handoff commit” until that post-live commit actually exists.
- This tracked file is the fixed release record for the pre-live candidate. Commit it on `codex/tianwen-live-goal-round` with `docs: plan tianwen integration release`. Its `preLiveCandidateSha` is the exact output of `git rev-parse HEAD` immediately after that commit; its `preLiveCandidateRemoteSha` is the first field from the successful post-push `git ls-remote origin refs/heads/codex/tianwen-live-goal-round`, and the two must match. Do not rewrite this record merely to insert run output.
- The ignored controller ledger may record recovery status, command results, price retrieval, and sanitized receipt facts, but it is not a remote authority and cannot substitute for the tracked commit plus remote ref/SHA evidence.
- Never rewrite history, rebase, or force-push. Each stage-to-integration merge uses plain `git merge --no-ff` of the SHA or remote ref just verified by `fetch` and `ls-remote`; never merge a stale local tracking ref.
- Preserve `docs/architecture-master-session-memory.md` and `docs/operations/tianwen-master-controller-session-handoff-2026-08-16.md` from the canonical main documentation spine.
- The current authorization is Git/offline release work only. It does not authorize CNY `0.25`, a real provider request, or reuse of an earlier paid authorization. Until the user separately approves exactly `32,768 tokens / CNY 0.25`, the stage is `READY AT LIVE GATE / BLOCKED ON NUMERIC BUDGET`: it may be verified, reviewed, and pushed as a pre-live candidate, but its canonical live handoff must remain absent and it must not merge to `main`.
- Do not call real Docker. Heavy gates are serial. Stores, caches, environments, installed Profiles, temporary files, and receipts remain under `D:\DevData`.
- Before Python acceptance, print and exactly validate `tianwen.__file__` from the fresh integration environment. It must equal the current integration worktree’s `src\tianwen\__init__.py`; reject `D:\Guo\zuochong\AGi\.venv` and every other worktree.
- Apply Ponytail/YAGNI: Git’s native three-way merge and the two canonical documents are sufficient. Do not invent a release framework, ledger authority, compatibility layer, or retry path.

---

### Task 1: Create the auditable pre-live candidate

**Frozen inputs:**

- `docs/superpowers/specs/2026-08-16-tianwen-deepseek-v4-pro-live-goal-round-design.md`
- `docs/superpowers/plans/2026-08-16-tianwen-deepseek-v4-pro-live-goal-round.md`

**Reserved until after the paid attempt:**

- `docs/operations/tianwen-deepseek-v4-pro-live-goal-round-handoff.md` (must be absent)

**Produces:** one pushed, SHA-recorded pre-live candidate; it is not formal stage closure and contains no canonical live handoff.

- [ ] **Step 1: Recheck the pre-live baseline and absence boundary**

  Run `git status --short --branch`, `git rev-parse HEAD`, and `git log --oneline --decorate -20`. At this point the only permitted worktree entry is the untracked release record itself, exactly `?? docs/superpowers/plans/2026-08-17-tianwen-integration-release.md`; reject every other change. Require the reviewed implementation chain and no tracked or working-tree canonical handoff at `docs/operations/tianwen-deepseek-v4-pro-live-goal-round-handoff.md`. Read the two frozen inputs without editing them.

  ```powershell
  git status --short --branch
  $allowedPreLiveStatus = '?? docs/superpowers/plans/2026-08-17-tianwen-integration-release.md'
  $preLiveStatus = @(git status --short)
  if ($preLiveStatus.Count -ne 1 -or $preLiveStatus[0] -ne $allowedPreLiveStatus) { throw 'unexpected pre-live worktree change' }
  ```

- [ ] **Step 2: Record only recovery information in the ignored ledger**

  Record exact implementation commits, independent review verdicts, final offline command/results, installed archive digest and CLI containment, zero-request Goal/Session facts, official-price URL/time/rates, and `paidAttemptStatus: not-run`. The ledger is controller recovery memory only; the Git commit and remote SHA below are the auditable candidate authority. State explicitly: `canonicalLiveHandoff: absent`, `formalStageClosure: blocked`, and `mainMerge: blocked`.

- [ ] **Step 3: Commit and remotely verify the tracked release record**

  Run Markdown/diff checks and an independent gate/spec review. Then commit only this tracked release record and establish both candidate SHA fields without creating a live handoff:

  ```powershell
  git add docs/superpowers/plans/2026-08-17-tianwen-integration-release.md
  git diff --cached --check
  git commit -m "docs: plan tianwen integration release"
  $preLiveCandidateSha = (git rev-parse HEAD).Trim()
  git push origin HEAD:refs/heads/codex/tianwen-live-goal-round
  $preLiveCandidateRemoteSha = ((git ls-remote origin refs/heads/codex/tianwen-live-goal-round) -split '\s+')[0]
  if ($preLiveCandidateRemoteSha -ne $preLiveCandidateSha) { throw 'pre-live candidate remote SHA mismatch' }
  ```

  Record these two named fields in the release execution evidence/ledger; do not amend the candidate commit to do so. Label the pushed SHA `pre-live candidate`, never `completed stage` or `canonical handoff`.

---

### Task 2: Build the first SHA-pinned integration merge

**Files:**

- Preserve: `docs/architecture-master-session-memory.md`
- Preserve: `docs/operations/tianwen-master-controller-session-handoff-2026-08-16.md`
- Remove from the integration tree only: `.superpowers/sdd/2026-08-13-real-task-alpha-a-execution/task-4-report.md`
- Merge: the SHA-verified pre-live candidate from Task 1

**Produces:** `codex/tianwen-integration` with a normal merge commit, no per-stage cherry-picking, and no canonical live handoff.

- [ ] **Step 1: Fetch and pin both merge inputs**

  Fetch `main` and the stage ref, then use `ls-remote` immediately afterwards to obtain the actual inputs. Require the fetched objects locally and reject any mismatch with the just-observed remote values:

  ```powershell
  git fetch origin refs/heads/main:refs/remotes/origin/main refs/heads/codex/tianwen-live-goal-round:refs/remotes/origin/codex/tianwen-live-goal-round
  $mainSha = ((git ls-remote origin refs/heads/main) -split '\s+')[0]
  $stageSha = ((git ls-remote origin refs/heads/codex/tianwen-live-goal-round) -split '\s+')[0]
  if ((git rev-parse origin/main).Trim() -ne $mainSha) { throw 'origin/main changed or fetch is incomplete' }
  if ((git rev-parse origin/codex/tianwen-live-goal-round).Trim() -ne $stageSha) { throw 'stage remote-tracking ref changed or fetch is incomplete' }
  if ($stageSha -ne $preLiveCandidateRemoteSha) { throw 'stage is not the reviewed pre-live candidate' }
  git cat-file -e "$mainSha^{commit}"
  git cat-file -e "$stageSha^{commit}"
  $mergeBase = (git merge-base $mainSha $stageSha).Trim()
  git rev-list --left-right --count "$mainSha...$stageSha"
  git merge-tree $mergeBase $mainSha $stageSha
  ```

- [ ] **Step 2: Create integration and use a normal SHA merge**

  Create `codex/tianwen-integration` from `$mainSha`, then merge `$stageSha` with plain `--no-ff`. Do not merge historical stage branches, `origin/codex/tianwen-live-goal-round`, or any other stale local ref; do not rebase.

  ```powershell
  git switch -c codex/tianwen-integration $mainSha
  git merge --no-ff $stageSha -m "merge: integrate tianwen pre-live candidate"
  ```

- [ ] **Step 3: Prove and perform the single scratch-file deletion**

  First prove that this is a lone tracked scratch residue and not a live dependency. `git ls-files --error-unmatch` must print the exact path; the `rg` command must produce no output, excluding this release plan’s own descriptive reference. The reason for removal is that this task-local report is the sole tracked file under an otherwise ignored SDD scratch directory; canonical plans and review evidence remain in their proper tracked documents.

  ```powershell
  git ls-files --error-unmatch .superpowers/sdd/2026-08-13-real-task-alpha-a-execution/task-4-report.md
  rg -n -F --glob '!docs/superpowers/plans/2026-08-17-tianwen-integration-release.md' 'task-4-report.md' .
  git rm .superpowers/sdd/2026-08-13-real-task-alpha-a-execution/task-4-report.md
  ```

  Resolve only genuine documentation ancestry differences. Keep the two canonical main documents, keep the pre-live implementation/design/plan, and keep the canonical live handoff absent.

- [ ] **Step 4: Prove and commit the first integration tree**

  Require the two canonical documents to exist, the reserved live handoff to be absent, historical branches still to resolve, and no conflict markers. Commit the integration resolution normally, then use the actual committed integration range for whitespace verification; no force or history rewrite is allowed.

  ```powershell
  $integrationMergeBase = (git merge-base $mainSha HEAD).Trim()
  git diff --check "$integrationMergeBase..HEAD"
  ```

---

### Task 3: Run the full serial integration acceptance matrix

**Consumes:** the committed first integration merge tree. **Produces:** branch-bound, offline evidence for Node, installed Profile, DSH probe/sandbox, Python, lint, dependency closure, and Git cleanliness.

- [ ] **Step 1: Bind every executable and generated path to the integration environment**

  Run from the integration worktree. These are fixed executable paths, package stores, CI mode, probe controls, and fresh environment locations; do not substitute the old project virtual environment.

  ```powershell
  $integrationRoot = (Get-Location).Path
  $node = 'D:\hermes\node\node.exe'
  $pnpm = 'D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs'
  $uv = 'D:\hermes\bin\uv.exe'
  $env:CI = 'true'
  $env:COREPACK_HOME = 'D:\DevData\corepack-home'
  $env:PNPM_HOME = 'D:\DevData\pnpm-home'
  $env:PNPM_STORE_DIR = 'D:\DevData\pnpm-store'
  $env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
  $env:UV_PROJECT_ENVIRONMENT = 'D:\DevData\tianwen-dsh-probe\integration-python-env'
  $env:TEMP = 'D:\DevData\tianwen-integration\temp'
  $env:TMP = $env:TEMP
  $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-probe'
  ```

- [ ] **Step 2: Create and bind the fresh Python environment before any gate**

  Synchronize offline with the requested interpreter first. Then use the newly created interpreter—not `uv` resolution and not the old `.venv`—to print and exactly assert the imported source path. This must fail if it imports from any path other than the current integration worktree.

  ```powershell
  & $uv sync --frozen --offline --python 3.11
  $python = Join-Path $env:UV_PROJECT_ENVIRONMENT 'Scripts\python.exe'
  if (-not (Test-Path -LiteralPath $python)) { throw 'fresh integration Python executable is missing' }
  & $python -c "from pathlib import Path; import tianwen; actual = Path(tianwen.__file__).resolve(); expected = (Path.cwd() / 'src' / 'tianwen' / '__init__.py').resolve(); print(actual); assert actual == expected, f'{actual} != {expected}'"
  $env:TIANWEN_DSH_PROBE_PYTHON = $python
  ```

- [ ] **Step 3: Run Node, closure, and full Vitest gates serially**

  Every command below is offline and serial. The full suite receives the fixed DSH probe root and controlled Python. The four focused specs are exactly the live Goal, ordinary Goal resume, model live smoke, and Runtime Bundle contracts.

  ```powershell
  & $node $pnpm install --offline --frozen-lockfile --trust-lockfile --store-dir 'D:\DevData\pnpm-store'
  & $node $pnpm --filter '@tianwen/runtime-bundle' build
  & $node $pnpm run check:dsh-install
  & $node $pnpm run check:no-private-dsh-imports
  & $node $pnpm run typecheck
  & $node $pnpm exec vitest run tests/dsh-migration/goal-live-smoke.spec.ts tests/dsh-migration/goal-resume.spec.ts tests/dsh-migration/model-live-smoke.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
  & $node $pnpm exec vitest run
  ```

- [ ] **Step 4: Run the installed startup E2E with its exact isolated environment**

  This is a fresh installed Profile test and remains offline. Set both existing test switches only around this command and remove them even if it fails.

  ```powershell
  $env:TIANWEN_DSH_PHASE2_STARTUP = '1'
  $env:TIANWEN_E2E_DATA_DIR = 'D:\DevData\tianwen-integration\test-data\installed-e2e'
  try {
    & $node $pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts
  } finally {
    Remove-Item Env:TIANWEN_E2E_DATA_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:TIANWEN_DSH_PHASE2_STARTUP -ErrorAction SilentlyContinue
  }
  ```

- [ ] **Step 5: Run Windows LocalSandbox only with its explicit enable switch**

  The sandbox test is intentionally gated. Do not treat its skipped form as acceptance evidence.

  ```powershell
  $env:TIANWEN_RUN_DSH_SANDBOX = '1'
  try {
    & $node $pnpm run test:dsh:sandbox
  } finally {
    Remove-Item Env:TIANWEN_RUN_DSH_SANDBOX -ErrorAction SilentlyContinue
  }
  ```

- [ ] **Step 6: Run Python A1–A5, full Python, Ruff, and Git gates serially**

  `tests/alpha/test_task_packages.py` is the focused frozen A1–A5 package gate. All commands use `$python` fixed in Step 2.

  ```powershell
  & $python -m pytest tests/alpha/test_task_packages.py -q
  & $python -m pytest -q
  & $python -m ruff check .
  if (-not $integrationMergeBase) { throw 'missing first integration merge base' }
  git diff --check "$integrationMergeBase..HEAD"
  git status --short
  ```

  Require zero command failures, an empty final status, no real Docker invocation, and no provider request. Preserve command output and timings as evidence; do not enable a live-test switch.

---

### Task 4: Review, push, stop at the paid gate, then close once

**Produces before approval:** a reviewed, pushed `offline-green, merge-blocked` integration branch. **Produces after approval:** exactly one live-chain outcome, a newly created canonical handoff on the stage branch, a second verified integration merge, and then the final main procedure.

- [ ] **Step 1: Review and push the offline integration branch**

  Request independent whole-range correctness/spec and Ponytail/YAGNI reviews. Fix and re-review every Critical or Important issue. Record `$offlineIntegrationSha` before the live closure, push `codex/tianwen-integration` normally, and require it to equal the freshly queried remote SHA from `git ls-remote origin refs/heads/codex/tianwen-integration`. Historical stage branches stay untouched.

  ```powershell
  $offlineIntegrationSha = (git rev-parse HEAD).Trim()
  git push origin HEAD:refs/heads/codex/tianwen-integration
  $offlineIntegrationRemoteSha = ((git ls-remote origin refs/heads/codex/tianwen-integration) -split '\s+')[0]
  if ($offlineIntegrationRemoteSha -ne $offlineIntegrationSha) { throw 'offline integration remote SHA mismatch' }
  ```

- [ ] **Step 2: Stop cleanly when numeric authorization is absent**

  If the user has not separately approved the ceiling `32,768 tokens / CNY 0.25`, record `offline-green, merge-blocked` in the ignored controller ledger; do not call the provider, do not create `docs/operations/tianwen-deepseek-v4-pro-live-goal-round-handoff.md`, do not call it a completed stage, and do not merge to `main`.

- [ ] **Step 3: Only after separate approval, execute and archive exactly one live chain**

  Recheck official prices immediately before the attempt. Execute the reviewed installed CLI exactly once, persist only the sanitized stdout receipt plus SHA-256, and restore offline selection in `finally`, exactly as the frozen live-goal plan requires. There is no retry or replay.

  Only after that one attempt—whether passed or failed—switch to `codex/tianwen-live-goal-round`, create the canonical handoff there, commit it normally, and push it normally. The handoff records the live result, the one-attempt consumption, receipt SHA, offline restoration, and correct remaining recommendation. It is not created before approval or before the attempt. Switch back to integration before any closure merge; this prevents merging the stage into itself.

  ```powershell
  git switch codex/tianwen-live-goal-round
  # Create and verify docs/operations/tianwen-deepseek-v4-pro-live-goal-round-handoff.md only after the one attempt.
  git add docs/operations/tianwen-deepseek-v4-pro-live-goal-round-handoff.md
  git commit -m "docs: hand off live Goal round"
  git push origin HEAD:refs/heads/codex/tianwen-live-goal-round
  git switch codex/tianwen-integration
  if ((git rev-parse HEAD).Trim() -ne $offlineIntegrationSha) { throw 'integration moved before live closure merge' }
  ```

- [ ] **Step 4: Fetch, verify, and perform the second stage merge**

  After the stage handoff push, fetch and `ls-remote` the stage branch again. Merge exactly the just-verified remote SHA (or that freshly fetched remote ref), not a remembered stage tip or local tracking ref. Keep the first integration tip so the delta can be evaluated.

  ```powershell
  $integrationBeforeLiveClosure = (git rev-parse HEAD).Trim()
  git fetch origin refs/heads/codex/tianwen-live-goal-round:refs/remotes/origin/codex/tianwen-live-goal-round
  $liveStageSha = ((git ls-remote origin refs/heads/codex/tianwen-live-goal-round) -split '\s+')[0]
  if ((git rev-parse origin/codex/tianwen-live-goal-round).Trim() -ne $liveStageSha) { throw 'live stage remote-tracking ref changed or fetch is incomplete' }
  git cat-file -e "$liveStageSha^{commit}"
  git merge --no-ff $liveStageSha -m "merge: archive tianwen live Goal handoff"
  $liveClosureMergeBase = (git merge-base $integrationBeforeLiveClosure HEAD).Trim()
  git diff --check "$liveClosureMergeBase..HEAD"
  ```

  Then always rerun typecheck, the four focused Vitest specs from Task 3, and a scoped correctness/spec review of `$liveClosureMergeBase..HEAD`. If `git diff --name-only "$liveClosureMergeBase..HEAD" -- ':!docs/**'` reports any product-tree path, rerun the complete Task 3 matrix before the scoped review is accepted. Push the new integration tip normally and verify its remote SHA with `ls-remote`.

- [ ] **Step 5: Reconcile a moving main before the final merge**

  Fetch `origin/main` again just before finalization and query it with `ls-remote`. If main advanced beyond the `$mainSha` used for the first integration merge, merge that freshly fetched SHA into `codex/tianwen-integration` with plain `--no-ff`; never rebase. Preserve both canonical main documents during any conflict resolution:

  ```powershell
  $integrationBeforeMainReconciliation = (git rev-parse HEAD).Trim()
  git fetch origin refs/heads/main:refs/remotes/origin/main
  $finalMainSha = ((git ls-remote origin refs/heads/main) -split '\s+')[0]
  if ((git rev-parse origin/main).Trim() -ne $finalMainSha) { throw 'main changed during fetch; refetch and recheck' }
  git merge-base --is-ancestor $mainSha $finalMainSha
  if ($LASTEXITCODE -ne 0) { throw 'origin/main is not a forward continuation; investigate before merging' }
  if ($finalMainSha -ne $mainSha) {
    git merge --no-ff $finalMainSha -m "merge: reconcile current main before Tianwen release"
    # If conflicts touch either canonical document, retain main's version, then complete the merge:
    # git checkout --theirs -- docs/architecture-master-session-memory.md docs/operations/tianwen-master-controller-session-handoff-2026-08-16.md
    # git add docs/architecture-master-session-memory.md docs/operations/tianwen-master-controller-session-handoff-2026-08-16.md
    # git commit
    $mainReconciliationMergeBase = (git merge-base $integrationBeforeMainReconciliation HEAD).Trim()
    git diff --check "$mainReconciliationMergeBase..HEAD"
  }
  ```

  After a main reconciliation, rerun all affected gates and re-review `$mainReconciliationMergeBase..HEAD`. If that range has any product-tree path (`':!docs/**'`), rerun the complete Task 3 matrix and both scoped correctness/spec and Ponytail reviews. Confirm both canonical documents exist and retain the current-main content before proceeding.

- [ ] **Step 6: Merge the verified integration tip to main and verify remote state**

  The main branch is checked out only in the linked worktree `D:\Guo\zuochong\AGi`; do not run `git switch main` in the integration worktree. First verify that this exact linked worktree is attached to `refs/heads/main`. Then use only command-local `safe.directory` configuration with `-C $mainRoot`; never modify the global safe-directory list. First push and verify the final integration SHA with `ls-remote`, check the linked main worktree is clean, fast-forward it only to the just-fetched `$finalMainSha` (or stop if that is impossible), then perform a normal `--no-ff` merge of the verified integration SHA:

  ```powershell
  git push origin HEAD:refs/heads/codex/tianwen-integration
  $finalIntegrationSha = ((git ls-remote origin refs/heads/codex/tianwen-integration) -split '\s+')[0]
  git cat-file -e "$finalIntegrationSha^{commit}"
  $mainRoot = 'D:\Guo\zuochong\AGi'
  $mainGitPath = $mainRoot.Replace('\', '/')
  $mainWorktreeEntries = @(((git worktree list --porcelain) -join "`n") -split "(?:`r?`n){2}" | Where-Object {
    $entryLines = $_ -split "`r?`n"
    $entryLines[0] -eq "worktree $mainGitPath" -and $entryLines -contains 'branch refs/heads/main'
  })
  if ($mainWorktreeEntries.Count -ne 1) { throw 'expected linked main worktree is missing or on the wrong branch' }
  $mainStatus = @(git -c safe.directory=D:/Guo/zuochong/AGi -C $mainRoot status --short)
  if ($mainStatus.Count -ne 0) { throw 'linked main worktree is not clean' }
  git -c safe.directory=D:/Guo/zuochong/AGi -C $mainRoot fetch origin refs/heads/main:refs/remotes/origin/main
  $mainShaImmediatelyBeforeMerge = ((git -c safe.directory=D:/Guo/zuochong/AGi -C $mainRoot ls-remote origin refs/heads/main) -split '\s+')[0]
  if ($mainShaImmediatelyBeforeMerge -ne $finalMainSha) { throw 'main advanced after reconciliation; return to Task 4 Step 5 before creating any local merge commit' }
  if ((git -c safe.directory=D:/Guo/zuochong/AGi -C $mainRoot rev-parse origin/main).Trim() -ne $finalMainSha) { throw 'linked main remote-tracking ref changed or fetch is incomplete' }
  git -c safe.directory=D:/Guo/zuochong/AGi -C $mainRoot merge --ff-only $finalMainSha
  if ((git -c safe.directory=D:/Guo/zuochong/AGi -C $mainRoot rev-parse HEAD).Trim() -ne $finalMainSha) { throw 'linked main is not the just-verified remote main' }
  git -c safe.directory=D:/Guo/zuochong/AGi -C $mainRoot merge --no-ff $finalIntegrationSha -m "merge: release Tianwen integration"
  $mergedMainSha = (git -c safe.directory=D:/Guo/zuochong/AGi -C $mainRoot rev-parse HEAD).Trim()
  git -c safe.directory=D:/Guo/zuochong/AGi -C $mainRoot push origin HEAD:refs/heads/main
  $remoteMergedMainSha = ((git ls-remote origin refs/heads/main) -split '\s+')[0]
  if ($remoteMergedMainSha -ne $mergedMainSha) { throw 'main remote SHA mismatch' }
  ```

  Run the minimal offline smoke from a fresh main-release environment, never the root’s existing `.venv`. First make its imported source identity exact, then run the narrow offline smoke:

  ```powershell
  $mainUv = 'D:\hermes\bin\uv.exe'
  $env:UV_PROJECT_ENVIRONMENT = 'D:\DevData\tianwen-main-release\python-env'
  $env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
  $env:TEMP = 'D:\DevData\tianwen-main-release\temp'
  $env:TMP = $env:TEMP
  git -c safe.directory=D:/Guo/zuochong/AGi -C $mainRoot status --short
  Push-Location $mainRoot
  try {
    & $mainUv sync --frozen --offline --python 3.11
    $mainPython = Join-Path $env:UV_PROJECT_ENVIRONMENT 'Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $mainPython)) { throw 'fresh main-release Python executable is missing' }
    & $mainPython -c "from pathlib import Path; import tianwen; actual = Path(tianwen.__file__).resolve(); expected = (Path.cwd() / 'src' / 'tianwen' / '__init__.py').resolve(); print(actual); assert actual == expected, f'{actual} != {expected}'"
    & $mainPython -m pytest tests/alpha/test_task_packages.py -q
  } finally {
    Pop-Location
  }
  ```

  Update `docs/architecture-master-session-memory.md` and `docs/operations/tianwen-master-controller-session-handoff-2026-08-16.md` only in `$mainRoot` to name `$mergedMainSha` and retain the historical-archive statement. Commit those docs there, push normally with `git -c safe.directory=D:/Guo/zuochong/AGi -C $mainRoot push origin HEAD:refs/heads/main`, and verify the resulting SHA again with `git ls-remote origin refs/heads/main`.

  Do not merge to main if the paid approval is absent, the canonical handoff was absent after an attempt, any review remains open, or any required re-run failed.
