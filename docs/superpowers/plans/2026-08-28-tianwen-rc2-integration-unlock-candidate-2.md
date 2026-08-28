# Tianwen RC2 Integration Unlock Candidate 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the missing rc.7-to-rc.2 product upgrade and fresh startup acceptance once against the corrected acceptance verifier, without replacing the failed Candidate 1 fact.

**Architecture:** Candidate 1 at `2e53c9d818a1e8a37e0d446af29da4d2c8db10b0` stopped after a successful rc.7 install because the test verifier expected the current `0.1.0` Runtime archive path while reading a valid predecessor `0.0.0` receipt. It did not invoke the rc.2 installer. Candidate 2 contains only the reviewed verifier correction at `76828fa50b64db3c95be380dd0c2903938bdbc62` plus this plan, uses wholly new D-drive product roots, and runs each real command once.

**Tech Stack:** PowerShell, Node.js 22, pnpm 11.20.0, Vitest, GitHub Actions.

## Global Constraints

- Preserve Candidate 1 log `D:\DevData\tianwen-rc2-integration-unlock-20260828\logs\upgrade-candidate-2e53c9d.log` with SHA-256 `2EC14F779636A8FF4B44D0C18AEBCFB59C32FB2093BC3E12F89CA4D0EE632E83`.
- Candidate 1 remains failed at the predecessor receipt assertion; never call it passed and never reuse its product root.
- The verifier correction is test-only. Installer and Runtime product bytes are unchanged from the previously reviewed portable candidate.
- Use `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2` for every new product, fixture, and log.
- Use the exact clean predecessor authority at `D:\DevData\tianwen-worktrees\tianwen-dsh-rc7-upgrade-authority` and SHA `ceafb6bc5d842402c83a0030cb2c2c57105c0dd8`.
- Set `TIANWEN_RUN_LIVE_MODEL_TESTS=0` and remove `DEEPSEEK_API_KEY`; no live Provider request is authorized or needed.
- Each Candidate 2 opt-in command runs once. A failure stops integration and is not rerun.
- Do not delete or mutate Candidate 1, historical Activity, product, evidence, debug, or legacy data.
- Desktop upstream research proceeds independently and is not acceptance evidence.

---

### Task 1: Freeze Candidate 2 and its fresh roots

**Files:**
- Create: `docs/superpowers/plans/2026-08-28-tianwen-rc2-integration-unlock-candidate-2.md`
- Verify: `tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts`

**Interfaces:**
- Consumes: reviewed verifier correction `76828fa50b64db3c95be380dd0c2903938bdbc62`.
- Produces: exact Candidate 2 SHA and unused acceptance roots.

- [ ] **Step 1: Verify deterministic correction evidence**

```powershell
Set-Location 'D:\DevData\tianwen-worktrees\tianwen-portable-dsh-plugin'
pnpm exec vitest run tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts
pnpm run typecheck
git status --short
```

Expected: 20 tests pass and 1 real acceptance is skipped; typecheck passes; only this plan is untracked.

- [ ] **Step 2: Commit the plan and print the exact execution SHA**

```powershell
git add docs/superpowers/plans/2026-08-28-tianwen-rc2-integration-unlock-candidate-2.md
git commit -m "docs: freeze RC2 integration Candidate 2"
git rev-parse HEAD
git status --short
```

Expected: commit and status succeed; the printed SHA is the Candidate 2 execution authority.

- [ ] **Step 3: Verify every Candidate 2 target is absent**

```powershell
$candidateRoot = 'D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2'
@(
  "$candidateRoot\upgrade-product",
  "$candidateRoot\fresh-product",
  "$candidateRoot\fresh-product-environment",
  "$candidateRoot\controlled-fixtures"
) | ForEach-Object { [pscustomobject]@{ Path = $_; Exists = Test-Path -LiteralPath $_ } }
```

Expected: every target reports `False`. Do not delete or reuse an existing target.

---

### Task 2: Run Candidate 2 upgrade acceptance once

**Files:**
- Verify: `tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts`
- Generate outside Git: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\upgrade-product`
- Generate outside Git: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\logs\upgrade.log`

**Interfaces:**
- Consumes: exact rc.7 authority and Candidate 2 installer/verifier.
- Produces: one result for old install, upgrade, real dump/boot, persistent-state preservation, current replay, and residue checks.

- [ ] **Step 1: Run and archive the exact command once**

```powershell
$candidateRoot = 'D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2'
New-Item -ItemType Directory -Force -Path "$candidateRoot\logs" | Out-Null
$env:TIANWEN_RUN_LIVE_MODEL_TESTS = '0'
Remove-Item Env:DEEPSEEK_API_KEY -ErrorAction SilentlyContinue
$env:TIANWEN_RUN_DSH_UPGRADE_E2E = '1'
$env:TIANWEN_DSH_RC7_AUTHORITY_ROOT = 'D:\DevData\tianwen-worktrees\tianwen-dsh-rc7-upgrade-authority'
$env:TIANWEN_DSH_UPGRADE_ROOT = "$candidateRoot\upgrade-product"
$env:COREPACK_HOME = 'D:\DevData\corepack-home'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
$env:PNPM_CONFIG_CONFIRM_MODULES_PURGE = 'false'
pnpm exec vitest run tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts 2>&1 |
  Tee-Object -FilePath "$candidateRoot\logs\upgrade.log"
```

Expected: 21/21 tests pass, the real test executes once, the final product and receipt are exact
`0.1.1-rc.2`/Runtime `0.1.0`, offline boot prints the frozen marker, state hashes remain equal,
current replay is byte-stable, and residue is empty.

- [ ] **Step 2: Stop or continue from the actual result**

On failure, preserve the log and product, record the failed stage, and stop before Task 3. On pass,
hash the log and continue.

---

### Task 3: Run Candidate 2 fresh startup acceptance once

**Files:**
- Verify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`
- Generate outside Git: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\fresh-product`
- Generate outside Git: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\controlled-fixtures`
- Generate outside Git: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\logs\startup.log`

**Interfaces:**
- Consumes: the same product code and D-drive store accepted by Task 2.
- Produces: one result for formal public headless startup and all four installed-controlled preflight stops with zero Provider requests.

- [ ] **Step 1: Run both opt-in paths in one invocation once**

```powershell
$candidateRoot = 'D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2'
$env:TIANWEN_RUN_LIVE_MODEL_TESTS = '0'
Remove-Item Env:DEEPSEEK_API_KEY -ErrorAction SilentlyContinue
$env:TIANWEN_DSH_PHASE2_STARTUP = '1'
$env:TIANWEN_CONTROLLED_INSTALLED_E2E = '1'
$env:TIANWEN_E2E_DATA_DIR = "$candidateRoot\fresh-product"
$env:TIANWEN_DSH_PROBE_ROOT = "$candidateRoot\controlled-fixtures"
$env:COREPACK_HOME = 'D:\DevData\corepack-home'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
$env:PNPM_CONFIG_CONFIRM_MODULES_PURGE = 'false'
pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts 2>&1 |
  Tee-Object -FilePath "$candidateRoot\logs\startup.log"
```

Expected: every test passes; fresh install and public headless startup succeed; four controlled
preflight cases stop as designed; no Provider request occurs.

- [ ] **Step 2: Stop or continue from the actual result**

On failure, preserve the log and generated roots and stop integration without rerun. On pass, hash
the log and continue.

---

### Task 4: Record, review, and integrate only a fully passed Candidate 2

**Files:**
- Create: `docs/operations/tianwen-rc2-integration-unlock-handoff.md`
- Integrate: `codex/tianwen-portable-dsh-plugin` into `main`

**Interfaces:**
- Consumes: Candidate 1 failure, Candidate 2 results, prior full local gates, and independent reviews.
- Produces: an honest integration decision, exact merge SHA, and exact-main CI result.

- [ ] **Step 1: Write one handoff that preserves both candidates**

Record Candidate 1 as a verifier failure before rc.2 upgrade, Candidate 2 as its own exact result,
all zero-Provider facts, current receipts/hashes, earlier full gates, and the desktop research as a
separate upstream finding.

- [ ] **Step 2: Obtain independent read-only review**

The reviewer reads both plans, the migration/portable handoffs, Candidate 1 and Candidate 2 logs,
generated receipts, and the exact diff. The reviewer does not rerun real commands. Critical or
Important findings block integration.

- [ ] **Step 3: Commit the handoff and merge through the dedicated main worktree**

```powershell
Set-Location 'D:\DevData\tianwen-worktrees\tianwen-portable-dsh-plugin'
git add docs/operations/tianwen-rc2-integration-unlock-handoff.md
git commit -m "docs: record RC2 integration unlock"
git status --short

Set-Location 'D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge'
git status --short
git fetch origin main
git merge --no-ff codex/tianwen-portable-dsh-plugin -m "merge: ship portable DSH plugin on RC2"
git rev-parse HEAD
git status --short
```

Expected: both branches are clean and the merge produces one exact main SHA without conflicts.

- [ ] **Step 4: Push and inspect exact-main CI without retry**

```powershell
git push origin main
```

Locate GitHub Actions runs with `head_sha` equal to the merge SHA. Report Python, TypeScript, and
installer-Windows separately; do not rerun or replace a failed exact-SHA result.

---

## Self-review

- Spec coverage: Candidate 1 preservation, verifier repair, new roots, single attempts, zero
  Provider, review, integration, and exact-main are explicit.
- Placeholder scan: no deferred implementation or unspecified test command remains.
- Type/command consistency: test filenames, environment variables, candidate roots, SHAs, and log
  paths match the committed repository and current D-drive layout.

