# Tianwen managed deploy timeout correction implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the observed false 15-minute cutoff from Tianwen's two local
pnpm deployment steps while preserving every existing installer transaction,
timeout, offline, privacy and DSH-only boundary.

**Architecture:** Reuse the existing `runFixed()`/`invokePnpm()` seam and pass
Node's native `timeout: 0` only to the host and Profile deploy calls. The
installer tests already capture every child call and spawn option, so the
change needs no new runner, timer, watchdog, process manager or retry path.

**Tech Stack:** Node.js `spawnSync`, pnpm `11.20.0`, TypeScript/Vitest,
PowerShell, the existing offline D-drive package store.

## Global Constraints

- Base main is `a0b6528db4524fb0d99822c683f326f678ed958c`.
- Canonical design is
  `docs/superpowers/specs/2026-08-21-tianwen-managed-deploy-timeout-design.md`.
- The formal execution order must supply the exact commit containing this plan.
  The executor must stop if that SHA is absent or if local/tracking/remote do
  not agree; this document intentionally does not self-reference its own SHA.
- Implementation branch:
  `codex/tianwen-managed-deploy-timeout-correction`.
- DSH `0.1.0-rc.7` remains the sole product Agent Runtime.
- Modify no dependency, lockfile, Runtime service, Profile schema, ledger,
  workflow, Provider path, learning path or price/budget behavior.
- Reuse the existing D-drive worktree, `node_modules` and pnpm store. Do not
  install, download, relink dependencies, create a worktree, clone, `.venv`,
  Profile or probe.
- Never clean unknown files. Confirm each dedicated fixture root is empty
  before and after tests; unknown content is a stop condition.
- Run no Provider, paid model, Docker, Alpha or legacy runtime-profile test
  before the final operational task.
- A real migration or Provider failure is a stop line. Never retry, rerun to
  obtain a preferred result, or fall back to ordinary resume.

---

### Task 1: Prove and remove only the two deploy cutoffs

**Files:**

- Modify: `tests/dsh-migration/tianwen-installer.spec.ts`
- Modify: `scripts/install-tianwen.mjs`

**Interfaces:**

- Consumes: existing `scriptedInstaller()` parallel `calls` and
  `spawnOptions` arrays, plus `installTianwen()`'s existing `invokePnpm(args,
  timeout)` call sites.
- Produces: host/Profile deploy child options with `timeout === 0`; all other
  child calls retain a finite positive timeout.

- [ ] **Step 1: Establish the exact clean baseline**

Reuse `D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake`. Require
it to be clean, switch/create the implementation branch at the exact
design+plan SHA supplied by the supervisor, and confirm local/tracking/remote
identity before any edit.

Confirm these roots contain zero files and zero bytes before testing; do not
delete unexpected content:

```powershell
D:\DevData\tianwen-installer-tests
D:\DevData\tianwen-stage7-test-fixtures
```

Run without installing dependencies:

```powershell
pnpm --filter @tianwen/runtime... build
pnpm --filter @tianwen/runtime-bundle... build
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-startup.e2e.spec.ts
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
```

Expected: all existing gates pass and the DSH closure is exact rc.7. Any
pre-existing failure stops the task.

- [ ] **Step 2: Write the focused RED contract**

In the existing installer success contract, replace the two deploy assertions
with:

```ts
const hostDeployIndex = scripted.calls.findIndex(argv =>
  argv.includes('deploy') && argv.includes('@tianwen/dsh-host'))
const profileDeployIndex = scripted.calls.findIndex(argv =>
  argv.includes('deploy') && argv.includes('@tianwen/profile-host'))

expect(scripted.spawnOptions[hostDeployIndex]?.timeout).toBe(0)
expect(scripted.spawnOptions[profileDeployIndex]?.timeout).toBe(0)

for (const [index, options] of scripted.spawnOptions.entries()) {
  if (index === hostDeployIndex || index === profileDeployIndex) continue
  expect(options.timeout).toBeGreaterThan(0)
}
```

Keep the existing `shell === false` assertion and all migration/rollback
contracts unchanged.

- [ ] **Step 3: Run RED and inspect the exact failure**

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
```

Expected: the two new assertions fail with received `900000`; the non-deploy
positive-timeout and all behavioral contracts pass. A different failure is a
stop condition, not permission to alter the test.

- [ ] **Step 4: Apply the two-line product fix**

In `scripts/install-tianwen.mjs`, change exactly the final timeout argument of
the two existing deploy calls:

```js
invokePnpm([
  '--config.inject-workspace-packages=true',
  '--filter', '@tianwen/dsh-host',
  'deploy', '--prod', paths.hostRoot,
], 0)
```

```js
invokePnpm([
  '--config.inject-workspace-packages=true',
  '--filter', '@tianwen/profile-host',
  'deploy', '--prod', paths.profileRoot,
], 0)
```

Do not change `runFixed()`, its 120-second default, the 300-second
install/build/pack timeouts, the deploy algorithm, transaction order or error
handling.

- [ ] **Step 5: Run GREEN and commit**

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
pnpm --filter @tianwen/runtime-bundle... build
git diff --check
```

Expected: green with host/Profile deploy timeout exactly `0`, every other child
timeout positive, and all rollback/replay contracts unchanged.

Commit only the two files:

```text
fix: allow managed pnpm deploys to finish
```

---

### Task 2: Record the observed correction without overstating migration

**Files:**

- Modify:
  `docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md`

**Interfaces:**

- Consumes: the real `ETIMEDOUT`/rollback facts and Task 1's focused contract.
- Produces: a cautious operational record; it is not a runtime API or product
  state.

- [ ] **Step 1: Add the real operational evidence**

Append a short section that states:

- the first real product migration was terminated only by Tianwen's 900-second
  host-deploy cutoff while the expected local pnpm child was still active;
- transaction rollback restored exact rc.6 host/Profile/archive/receipt and
  byte-identical Session/Evolution state;
- no Provider request or download occurred;
- the correction removes the hard cutoff only from host/Profile deploy;
- a successful real rc.7 migration and configured-Provider receipt are still
  pending and must not be claimed by this code change.

Do not add process-monitoring, pricing, budget or generic migration language.

- [ ] **Step 2: Verify and commit**

```powershell
git diff --check
```

Commit only the handoff:

```text
docs: record managed deploy timeout correction
```

---

### Task 3: Final local gates, independent review and feature push

**Files:**

- No additional product files.
- Modify the two Task 1 files or Task 2 handoff only for demonstrated review
  findings.

**Interfaces:**

- Consumes: exact feature HEAD containing Tasks 1-2.
- Produces: a reviewed clean feature SHA ready for one mainline merge.

- [ ] **Step 1: Run the proportional bearing gates serially**

```powershell
pnpm --filter @tianwen/runtime... build
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-startup.e2e.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/goal-resume.spec.ts tests/dsh-probe/install-closure.spec.ts tests/dsh-probe/public-surface.spec.ts tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/natural-run-evidence-demo.spec.ts
pnpm demo:natural-run-evidence
git diff --check a0b6528db4524fb0d99822c683f326f678ed958c..HEAD
```

Use the existing D-drive Python interpreter for the public repository contract
only if it already exists and imports `pytest` and `ruff`; otherwise report the
local Python gate unavailable and rely on exact-main Python CI. Never run bare
`uv` or create an environment.

- [ ] **Step 2: Audit resources and fixtures**

Require:

- both dedicated fixture roots end with zero files/zero bytes;
- the implementation worktree remains the only Stage 7 implementation
  worktree and has no `.venv` or `.dsh-probe` content;
- `node_modules/.modules.yaml` identity is unchanged;
- dependency downloads/relinks, Provider, paid token/CNY, Docker, Alpha and
  runtime-profile calls are zero.

- [ ] **Step 3: Obtain independent reviews**

Review exact feature HEAD for:

1. correctness: Node timeout semantics, transaction rollback and rc.7 replay;
2. architecture/privacy: DSH-only product boundary and no Provider/learning
   surface change;
3. Ponytail/YAGNI: exact two-line product fix, no watchdog/retry/framework.

Resolve only demonstrated Critical/Important findings with focused RED/GREEN.
Do not promote an extreme hypothetical hang into a new subsystem or release
blocker.

- [ ] **Step 4: Push once and stop**

Normal-push the clean feature branch once. Verify local/tracking/`git
ls-remote` exact equality and report the exact SHA, commit/file scope, gates,
reviews and zero-resource audit. Stop before main integration.

---

### Task 4: Mainline integration and exact-SHA CI

**Files:** None beyond the approved feature tree.

**Interfaces:**

- Consumes: supervisor-approved exact feature SHA.
- Produces: one exact main merge SHA with green automatic CI.

- [ ] **Step 1: Merge and push once**

From clean main, merge the approved feature once with `--no-ff`. Prove the
merge tree equals the approved feature tree, run `git diff --check`, and
ordinary-push main once. Do not create a merge-only fix or force-push.

- [ ] **Step 2: Require exact automatic CI**

Locate the single automatic push run whose `head_sha` equals the merge SHA.
Require both existing Python and TypeScript jobs green, including the
runtime-bundle build, DSH closure and natural-run demo. The current focused CI
does not run `tianwen-installer.spec.ts`; Task 3's fresh local installer gate
and exact-feature reviews are its completion witness. Do not expand the
workflow for this two-line correction.

On failure, retrieve only the failing job log, diagnose it and stop. Do not
rerun or repair main directly.

---

### Task 5: One real migration retry, then one natural configured-Provider task

**Files:**

- No repository edit is expected.
- Ephemeral manifest and safe receipt stay outside Git under the existing
  governed D-drive Task 8 location.

**Interfaces:**

- Consumes: exact-main green installer, existing `D:\DevData\tianwen` managed
  rc.6 product root, existing configured DSH Profile and existing Stage 7 trial
  CLI.
- Produces: either a truthful safe stop receipt, or one natural DSH
  producer-to-consumer receipt. It does not produce a Ticket on demand.

- [ ] **Step 1: Re-establish the real pre-state read-only**

Require the root to classify as the same managed rc.6 predecessor. Record
host/Profile versions, archive/receipt identity, backup absence and complete
relative-path/size/SHA-256 snapshots for Session and Evolution files without
printing contents. Confirm no installer/DSH child from the prior failure is
alive.

- [ ] **Step 2: Invoke the official installer exactly once**

Use:

```powershell
pnpm install:tianwen -- --data-dir D:\DevData\tianwen --json
```

with the existing D-drive Corepack/pnpm store, offline mode and dependency
verification settings already used by the first attempt. Do not impose an
outer wall-clock deadline, launch a second invocation, or poll rapidly. A
read-only sparse process observation may confirm that the one expected local
child remains active.

If the command reports an error or is interrupted, verify transaction rollback
against the complete pre-snapshot and stop with zero Provider. Do not retry.

- [ ] **Step 3: Verify successful rc.7 migration**

On exit 0, require exact rc.7 host/base/headless, a regular Runtime Bundle
archive, canonical ready receipt, no host/Profile/archive backup residue, zero
download indication, and byte-identical Session/Evolution snapshots. Run the
installer no second time merely to prove replay; fixture/CI contracts already
carry that behavior.

- [ ] **Step 4: Preflight one useful natural task**

Set `DSH_AGENTS_HOME` to the current user's `.codex` directory for the product
command and select the already-existing `systematic-debugging` Skill by its DSH
registry name. Require the trial preflight to resolve that exact Skill through
the prepared Agent's public Skill scope; do not persist or hard-code its
filesystem path.
If it is not resolver-visible, return `natural-trial-pending` rather than
copying a Skill or registering a replacement. Create one fresh DSH Goal whose
useful objective is to use that Skill, read
`docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md` and
produce a concise Chinese root-cause and verification checklist for the
managed deployment timeout correction. Freeze before the first Turn:

- the fresh Goal ID and revision-derived `goalRef`;
- short safe `taskRef` and `scopeKey` labels;
- the existing public `read` verifier/tool contract with
  `notMetErrorCode: 'FS_NOT_FOUND'` and `gapDisposition: 'observe'`;
- verifier arguments exactly equal to
  `{ "file_path": "docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md" }`;
- the existing parent Skill name/content resolution;
- the observe/no-recurrence policy; this task does not assign reusable
  severity or `blocksGoal` merely to manufacture a Signal.

Use the existing configured product Profile. Do not print or inspect credential values.
If Profile identity, credential presence, manifest, Goal, Skill or verifier
preflight fails, return non-persistent `natural-trial-pending` and stop with
zero Provider.

Load the installed CLI only from its canonical receipt, then read model status
and preserve the current selection without printing credentials. Require the
safe receipt to report `credential.configured=true`, select
`deepseek-v4-pro` with `model use`, then create the Goal with zero model
requests:

```powershell
$mainWorktree = 'D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge'
if (-not (Test-Path -LiteralPath "$mainWorktree\docs\operations\tianwen-rc6-rc7-managed-install-migration-handoff.md" -PathType Leaf)) {
  throw 'natural-trial-pending: fixed repository handoff unavailable'
}
Push-Location -LiteralPath $mainWorktree

$receiptPath = 'D:\DevData\tianwen\receipts\tianwen-install.json'
$receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
if ($receipt.schemaVersion -ne 'tianwen.install.v1' -or
    $receipt.status -ne 'ready' -or
    -not (Test-Path -LiteralPath $receipt.cliPath -PathType Leaf)) {
  throw 'natural-trial-pending: installed Tianwen CLI unavailable'
}
$codexAgentsHome = Join-Path $env:USERPROFILE '.codex'
$systematicDebuggingSkill = Join-Path $codexAgentsHome 'skills\systematic-debugging\SKILL.md'
if (-not (Test-Path -LiteralPath $systematicDebuggingSkill -PathType Leaf)) {
  throw 'natural-trial-pending: parent Skill unavailable'
}
$env:DSH_AGENTS_HOME = $codexAgentsHome

$modelStatusJson = & 'D:\hermes\node\node.exe' $receipt.cliPath model status `
  --data-dir 'D:\DevData\tianwen' --json
if ($LASTEXITCODE -ne 0) { throw 'natural-trial-pending: model status failed' }
$modelStatus = $modelStatusJson | ConvertFrom-Json
if (-not $modelStatus.credential.configured) {
  throw 'natural-trial-pending: configured credential unavailable'
}
$previousModelChoice = switch ("$($modelStatus.selection.provider)/$($modelStatus.selection.model)") {
  'tianwen-offline/phase2-smoke' { 'offline' }
  'deepseek-official/deepseek-v4-flash' { 'deepseek-v4-flash' }
  'deepseek-official/deepseek-v4-pro' { 'deepseek-v4-pro' }
  default { throw 'natural-trial-pending: unsupported prior model selection' }
}
& 'D:\hermes\node\node.exe' $receipt.cliPath model use `
  --model deepseek-v4-pro --data-dir 'D:\DevData\tianwen' --json | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'natural-trial-pending: model selection failed' }

$objective = 'First load and use the systematic-debugging Skill. Then call read with exactly {"file_path":"docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md"} and no extra arguments. Produce a concise Chinese root-cause and verification checklist for the managed deployment timeout correction. Do not edit files.'
$createJson = & 'D:\hermes\node\node.exe' $receipt.cliPath create `
  --objective $objective --data-dir 'D:\DevData\tianwen' `
  --max-rounds 1 --json
if ($LASTEXITCODE -ne 0) { throw 'natural-trial-pending: Goal creation failed' }
$createReceipt = $createJson | ConvertFrom-Json
$goalId = $createReceipt.goal.id
```

Require `schemaVersion=tianwen.goal-create.v1`, `goal.phase=active`,
`roundsStarted=0`, and `session.modelRequestsDelta=0`. Create the bounded
ephemeral manifest with that exact Goal ID,
`parentSkillName: 'systematic-debugging'`,
safe labels, the acceptance contract and verifier arguments above. Keep it
outside Git and do not print its raw contents after validation.

Everything after `Push-Location` must be inside an outer PowerShell
`try/finally` whose `finally` calls `Pop-Location` once. After model status has
successfully derived `$previousModelChoice`, put the selection change, Goal
creation, manifest preparation and single resume inside an inner `try/finally`.
The inner `finally` runs the same installed `model use --model
$previousModelChoice --data-dir D:\DevData\tianwen --json` command exactly
once, even when Goal creation, manifest preflight or resume fails. This cleanup
changes configuration only; it must report `modelRequestsDelta=0` and must
never become a model retry.

- [ ] **Step 5: Run the Goal exactly once**

Use the installed command surface through the canonical install receipt's
already-validated absolute `cliPath`; do not modify `PATH`, hard-code the
Profile `.CMD`, create another launcher, or invoke the source-worktree CLI:

```powershell
& 'D:\hermes\node\node.exe' $receipt.cliPath resume `
  --goal $goalId --data-dir 'D:\DevData\tianwen' `
  --trial-manifest $manifestPath --json
```

Run one configured `deepseek-v4-pro` attempt. Do not retry, manufacture a
failure, raise severity, or run a second task to force recurrence. Restore the
previous model selection after the attempt with the same installed
`model use --model offline|deepseek-v4-flash|deepseek-v4-pro` command chosen
from the preflight status receipt; restoration is configuration cleanup and
must not run a second model request.

Accept every truthful outcome: `met/no-case`, one Signal, or `inconclusive`.
Report safe Goal/Session/Run/Evidence/learning IDs, DSH-observed request/token
usage and `exactCny=unavailable` when no provider billing receipt exists. The
60 CNY total authorization is checked only as an external supervisor boundary;
do not fetch prices or add budget code.

- [ ] **Step 6: Close Stage 7 truthfully**

Do not commit the manifest, user content, Session history or local receipt.
Report repository/main SHA, migration result, durable-state equality, Provider
attempt count, usage, safe receipt and the exact next evidence boundary:
ordinary `no-case` is valid and does not authorize manufacturing a Ticket,
Candidate, Evaluation, Shadow or Promotion.
