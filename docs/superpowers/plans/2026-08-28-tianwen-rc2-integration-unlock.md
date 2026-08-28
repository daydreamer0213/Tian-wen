# Tianwen RC2 Integration Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one honest acceptance result for the corrected portable DSH `0.1.1-rc.2` candidate, then integrate it to `main` only if both previously blocked real product paths pass.

**Architecture:** Preserve the two historical failed one-shot results as immutable facts. Treat `f6e341cfe6f61422e6119bcc6bc3d30e7c5f1d29` as a new exact release candidate and exercise only the missing old-product upgrade and fresh formal-startup/installed-controlled paths in new `D:\DevData` roots. No product code, retry layer, new natural task, or Provider call is part of this stage.

**Tech Stack:** PowerShell, Node.js 22, pnpm 11.20.0, Vitest, GitHub Actions.

## Global Constraints

- Candidate branch: `codex/tianwen-portable-dsh-plugin`.
- Frozen candidate before this plan: `f6e341cfe6f61422e6119bcc6bc3d30e7c5f1d29`.
- Current local `main` authority before integration: `ceafb6bc5d842402c83a0030cb2c2c57105c0dd8`.
- Exact predecessor authority: `ceafb6bc5d842402c83a0030cb2c2c57105c0dd8` in `D:\DevData\tianwen-worktrees\tianwen-dsh-rc7-upgrade-authority`.
- Preserve the failed results documented in `docs/operations/tianwen-dsh-0.1.1-rc.2-managed-product-migration-handoff.md`; a new candidate result does not rewrite them.
- Put products, caches, logs, temporary files, and probe state below `D:\DevData\tianwen-rc2-integration-unlock-20260828` or another explicit D-drive cache already in use.
- Set `TIANWEN_RUN_LIVE_MODEL_TESTS=0`; do not enable or call a live Provider.
- Run each opt-in real-product command once. A failed command blocks integration and is not rerun to select a better result.
- Do not read, modify, migrate, or clean historical Activity, product, evidence, debug, or legacy worktrees.
- Do not publish npm, GitHub Release, desktop installers, or DSH upstream changes in this stage.

---

### Task 1: Freeze and preflight the corrected candidate

**Files:**
- Create: `docs/superpowers/plans/2026-08-28-tianwen-rc2-integration-unlock.md`
- Verify: `docs/operations/tianwen-dsh-0.1.1-rc.2-managed-product-migration-handoff.md`
- Verify: `docs/operations/tianwen-portable-dsh-plugin-handoff.md`

**Interfaces:**
- Consumes: exact corrected portable candidate and exact clean rc.7 predecessor authority.
- Produces: an auditable go/no-go boundary before any real installer process starts.

- [ ] **Step 1: Verify the candidate and predecessor authorities**

```powershell
Set-Location 'D:\DevData\tianwen-worktrees\tianwen-portable-dsh-plugin'
git status --short
git rev-parse HEAD
git merge-base --is-ancestor ceafb6bc5d842402c83a0030cb2c2c57105c0dd8 HEAD

Set-Location 'D:\DevData\tianwen-worktrees\tianwen-dsh-rc7-upgrade-authority'
git status --short --untracked-files=no
git rev-parse HEAD
```

Expected: both status commands are empty, candidate HEAD is exactly
`f6e341cfe6f61422e6119bcc6bc3d30e7c5f1d29` plus this plan commit, the old authority is exactly
`ceafb6bc5d842402c83a0030cb2c2c57105c0dd8`, and the ancestry check exits 0.

- [ ] **Step 2: Verify fresh acceptance targets without deleting anything**

```powershell
$acceptanceRoot = 'D:\DevData\tianwen-rc2-integration-unlock-20260828'
$targets = @(
  "$acceptanceRoot\upgrade-product",
  "$acceptanceRoot\fresh-product",
  "$acceptanceRoot\fresh-product-environment",
  "$acceptanceRoot\controlled-fixtures"
)
$targets | ForEach-Object { [pscustomobject]@{ Path = $_; Exists = Test-Path -LiteralPath $_ } }
```

Expected: every target is absent. If any target exists, choose a new explicit acceptance-root suffix
before the first real command; do not remove or reuse the existing target.

- [ ] **Step 3: Commit the acceptance boundary**

```powershell
Set-Location 'D:\DevData\tianwen-worktrees\tianwen-portable-dsh-plugin'
git add docs/superpowers/plans/2026-08-28-tianwen-rc2-integration-unlock.md
git commit -m "docs: plan RC2 integration unlock"
```

---

### Task 2: Accept or reject the corrected old-product upgrade

**Files:**
- Verify: `tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts`
- Generate outside Git: `D:\DevData\tianwen-rc2-integration-unlock-20260828\upgrade-product`

**Interfaces:**
- Consumes: the exact rc.7 authority installer and the current candidate installer.
- Produces: one new-candidate result for rc.7 install, synthetic persistent-state preservation, rc.2 upgrade, real dump/boot, current replay, and residue checks.

- [ ] **Step 1: Run the exact upgrade acceptance once**

```powershell
Set-Location 'D:\DevData\tianwen-worktrees\tianwen-portable-dsh-plugin'
$env:TIANWEN_RUN_LIVE_MODEL_TESTS = '0'
$env:TIANWEN_RUN_DSH_UPGRADE_E2E = '1'
$env:TIANWEN_DSH_RC7_AUTHORITY_ROOT = 'D:\DevData\tianwen-worktrees\tianwen-dsh-rc7-upgrade-authority'
$env:TIANWEN_DSH_UPGRADE_ROOT = 'D:\DevData\tianwen-rc2-integration-unlock-20260828\upgrade-product'
$env:COREPACK_HOME = 'D:\DevData\corepack-home'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
$env:PNPM_CONFIG_CONFIRM_MODULES_PURGE = 'false'
pnpm exec vitest run tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts
```

Expected: the opt-in test passes exactly once; the installed version becomes exact `0.1.1-rc.2`,
the offline Profile boot prints `TIANWEN_PHASE2_OK`, synthetic Session/Evolution hashes are preserved,
current-installer replay is byte-stable, and no installer residue remains.

- [ ] **Step 2: Classify the result before continuing**

If the command fails, record the exact candidate SHA, failed child stage, stdout/stderr, resulting
product version, and persistent-state/residue facts in the handoff from Task 4. Stop integration;
do not run Task 3 as an attempt to compensate for this failure. If it passes, continue to Task 3.

---

### Task 3: Accept or reject fresh formal startup and installed controlled lifecycle

**Files:**
- Verify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`
- Generate outside Git: `D:\DevData\tianwen-rc2-integration-unlock-20260828\fresh-product`
- Generate outside Git: `D:\DevData\tianwen-rc2-integration-unlock-20260828\controlled-fixtures`

**Interfaces:**
- Consumes: the same current installer and Runtime Bundle accepted in Task 2.
- Produces: one new-candidate result for formal headless startup and installed controlled preflight behavior with zero Provider requests.

- [ ] **Step 1: Run the two opt-in startup paths in one Vitest invocation once**

```powershell
Set-Location 'D:\DevData\tianwen-worktrees\tianwen-portable-dsh-plugin'
$env:TIANWEN_RUN_LIVE_MODEL_TESTS = '0'
Remove-Item Env:DEEPSEEK_API_KEY -ErrorAction SilentlyContinue
$env:TIANWEN_DSH_PHASE2_STARTUP = '1'
$env:TIANWEN_CONTROLLED_INSTALLED_E2E = '1'
$env:TIANWEN_E2E_DATA_DIR = 'D:\DevData\tianwen-rc2-integration-unlock-20260828\fresh-product'
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-rc2-integration-unlock-20260828\controlled-fixtures'
$env:COREPACK_HOME = 'D:\DevData\corepack-home'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
$env:PNPM_CONFIG_CONFIRM_MODULES_PURGE = 'false'
pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts
```

Expected: the formal Profile installs and boots through the public headless path; the separately
installed controlled runner reaches all four intended preflight stops with no Provider activity;
all tests in the file pass and both generated roots remain below the selected D-drive authority.

- [ ] **Step 2: Classify the result before integration**

If the command fails, record the exact stage and preserved product facts, stop integration, and do
not rerun. If it passes, continue to Task 4.

---

### Task 4: Record and independently review the unlock result

**Files:**
- Create: `docs/operations/tianwen-rc2-integration-unlock-handoff.md`

**Interfaces:**
- Consumes: both new-candidate command results and the already reviewed local gates in the portable-plugin handoff.
- Produces: the only authority for whether this branch may enter `main`.

- [ ] **Step 1: Write the factual handoff**

Record separately:

1. historical failed one-shot facts, unchanged;
2. exact new candidate and plan commit SHA;
3. upgrade task result and real process evidence;
4. formal-startup/installed-controlled result and zero-Provider fact;
5. previously completed Node, Python, installer-Windows, native plugin, and headless/Web gates;
6. desktop research as a separate external/upstream fact, not acceptance evidence;
7. integration decision and remaining external actions.

- [ ] **Step 2: Request independent read-only review**

The reviewer compares this plan, both migration handoffs, the exact branch diff, the two current
command results, and the generated product receipts. Critical or Important findings block Task 5.
The reviewer must not rerun either real command.

- [ ] **Step 3: Commit the reviewed handoff**

```powershell
git add docs/operations/tianwen-rc2-integration-unlock-handoff.md
git commit -m "docs: record RC2 integration unlock"
git status --short
```

Expected: commit succeeds and the branch is clean.

---

### Task 5: Integrate and verify exact main only after both acceptances pass

**Files:**
- Integrate: `codex/tianwen-portable-dsh-plugin` into `main`
- Verify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: an approved clean feature branch and the clean dedicated main worktree.
- Produces: one exact main merge SHA and its Python, TypeScript, and installer-Windows CI result.

- [ ] **Step 1: Recheck the dedicated main worktree**

```powershell
Set-Location 'D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge'
git status --short
git rev-parse HEAD
git fetch origin main
git rev-parse origin/main
```

Expected: the worktree is clean and local `main` still contains the frozen base. If local or remote
main changed incompatibly, stop and rebase/review in a new integration branch rather than forcing.

- [ ] **Step 2: Create the controlled merge commit**

```powershell
git merge --no-ff codex/tianwen-portable-dsh-plugin -m "merge: ship portable DSH plugin on RC2"
git status --short
git rev-parse HEAD
```

Expected: merge succeeds without conflict, status is clean, and the printed SHA is the exact main
candidate.

- [ ] **Step 3: Push main and inspect exact-SHA CI without retries**

```powershell
git push origin main
```

Use GitHub's read-only API to locate workflow runs whose `head_sha` equals the exact merge SHA.
Report Python, TypeScript, and installer-Windows separately. Do not cancel, rerun, or substitute a
different SHA. A failed job leaves the stage incomplete.

---

## Self-review

- Spec coverage: the plan covers the two inherited blockers, historical preservation, D-drive
  isolation, zero Provider use, independent review, controlled integration, and exact-main CI.
- Placeholder scan: no TODO/TBD or unspecified implementation step remains.
- Type/command consistency: environment names and test files match the committed acceptance tests;
  both commands use the same candidate worktree and pnpm store.

