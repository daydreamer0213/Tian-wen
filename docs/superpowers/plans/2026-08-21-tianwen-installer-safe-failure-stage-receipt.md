# Tianwen installer safe failure stage receipt implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Use TDD,
> verification-before-completion, requesting-code-review and Ponytail review;
> preserve every stated stop line.

**Goal:** On a failed tianwen install --json invocation, return one canonical
safe stage receipt without retaining raw diagnostics, changing the ready
receipt, or changing the managed installation transaction.

**Architecture:** The installer keeps a small local current-stage carrier.
Existing operation boundaries select a closed token before they run. The
existing transaction catch remains unchanged, and the CLI constructs a fresh
receipt. Unknown exceptions reduce to installer-internal; no child text is
forwarded.

**Tech stack:** Existing Node.js ESM installer, spawnSync, Vitest, pnpm
offline workspace tooling and existing D-drive store.

## Global constraints

- Canonical design:
  docs/superpowers/specs/2026-08-21-tianwen-installer-safe-failure-stage-receipt-design.md.
- Base main for this native-Windows amendment:
  25e7fe895b66a939579107a042253580e8f89cd1.
- The execution order supplies the exact commit containing this plan. Stop if
  local, tracking and remote do not agree on it.
- Amendment implementation branch:
  codex/tianwen-installer-windows-ci-contract.
- DSH 0.1.0-rc.7 remains the sole product Agent Runtime.
- The historical safe-receipt scope is retained below only as a record. This
  native-Windows amendment's implementation scope is exactly:
  - `.github/workflows/ci.yml`; and
  - `tests/contracts/test_public_repository_surface.py`.
- Do not modify packages, lockfiles, dependencies, Runtime services, Profile
  schema, ledger, learning paths, Provider paths or price/budget code. This
  amendment permits exactly one native-Windows workflow job and removal of the
  installer spec from the Ubuntu focused command; it adds no matrix, Docker,
  WSL, self-hosted runner, product filesystem adapter, retry, telemetry or
  workflow-policy change.
- Reuse the sole approved D-drive implementation worktree, node_modules and
  D-drive stores. Do not install, download, relink, create a second worktree,
  clone, node_modules, .venv, Profile or probe, or clean unknown data.
- Require each dedicated fixture root to have zero files and zero bytes before
  and after every test phase. Unexpected content is a stop condition.
- Tasks 1–5 run zero Provider/model/Goal/installer/Docker/Alpha actions. Do
  not interact with the existing natural-trial Goal or manifest.
- Do not add a logger, telemetry, generic error framework, retry, repair
  mechanism, timeout/watchdog, budget system, price query or price snapshot.
- A failed gate outside the documented RED work is a stop line: preserve it,
  report it, and do not force a later task or operational installer.

## Native-Windows CI amendment

This amendment supersedes the prior plan's exact-main CI-bearing portions of
Tasks 3–7. It does not reopen the implemented safe failure-receipt behavior,
the managed installation transaction, or the existing Windows fixture helper.
It records the smallest truthful response to the two exact Linux CI records:

- `32492058264`: the fixture omitted its Windows platform identity; and
- `32493142651`: supplying that identity changed only derived paths, while
  host filesystem, `path`/`realpath`, `process.execPath`, and Corepack still
  remained Linux truth.

The approved answer is one native Windows job, not a production virtual
filesystem/path adapter, a POSIX fixture that claims Windows proof, or further
individual pnpm/path injections.

### Amendment workspace setup and baseline stop gate

**Files:** none.

- [ ] **Step 1: Establish exact amendment state**

  Reuse `D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake`.
  Require a clean worktree and verify exact main, amendment branch, local,
  tracking, and `git ls-remote` identities before edits. Require the existing
  `node_modules/.modules.yaml`; do not install or relink. Set only:

      $env:pnpm_config_verify_deps_before_run = 'false'

  Confirm plan-designated fixture roots are zero files/zero bytes. Do not
  inspect product roots, existing Goals/manifests, credentials, Provider
  configuration, or model selection.

- [ ] **Step 2: Baseline platform-independent gates**

      pnpm --filter @tianwen/runtime... build
      pnpm --filter @tianwen/runtime-bundle... build
      pnpm run typecheck
      pnpm run check:dsh-install
      pnpm run check:no-private-dsh-imports

  On the native Windows implementation host, also establish the existing
  installer contract baseline:

      pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts

  Expect the existing 29 installer tests to pass locally. Do not treat that
  result as a Linux substitute; the two exact CI records above remain the RED
  evidence for moving the bearing path.

### Amendment Task 1: RED — pin the native Windows boundary

**Files:**

- Modify: `tests/contracts/test_public_repository_surface.py`

- [ ] **Step 1: Extend the static public contract first**

  Make the existing public repository contract fail until the workflow proves:

  1. a job named `installer-windows` exists with
     `runs-on: windows-latest`;
  2. that job contains checkout, pnpm setup at `11.20.0`, Node `22.20.0`
     setup with the pnpm cache, frozen install, and one Windows installer
     contract step;
  3. that step uses `pwsh`, conditionally runs
     `subst.exe D: $env:RUNNER_TEMP` when `D:` is absent, creates
     `D:\DevData`, and runs exactly
     `pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts`; and
  4. the installer spec path is absent from the Ubuntu TypeScript focused
     Vitest command.

  Assertions must remain mechanical and structural: they prevent the contract
  being silently reinserted into Ubuntu, without adding a generic workflow
  parser or policy framework. They also reject personal absolute paths and
  unfinished-placeholder text in the amended public workflow contract.

- [ ] **Step 2: Record RED**

  With the existing approved Python only, run:

      & $existingPython -m pytest tests/contracts/test_public_repository_surface.py

  Expected RED: current workflow lacks the native job and still includes the
  installer spec in the Ubuntu focused command. If that Python is unavailable,
  record only that local fact; do not create or synchronize an environment.
  An unrelated failure is a stop line.

### Amendment Task 2: GREEN — one native Windows job only

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Remove the one Ubuntu reference**

  Remove only `tests/dsh-migration/tianwen-installer.spec.ts` from the existing
  TypeScript focused Vitest command. Preserve the rest of that command, job,
  demos, permissions, cache, dependencies, action versions, and order.

- [ ] **Step 2: Add the independent native job**

  Add exactly one `installer-windows` job with `runs-on: windows-latest`. It
  has exactly these normal steps: `actions/checkout@v7`,
  `pnpm/action-setup@v4` at `11.20.0`, `actions/setup-node@v7` at `22.20.0`
  with pnpm cache, `pnpm install --frozen-lockfile`, and one named installer
  contract step with `shell: pwsh`.

  The contract step uses the following control flow, preserving the Vitest
  exit status and removing only a mapping it created:

  ```powershell
  $mappedDrive = $false
  if (-not (Test-Path -LiteralPath 'D:\')) {
    & subst.exe D: $env:RUNNER_TEMP
    if ($LASTEXITCODE -ne 0) { throw 'temporary D: mapping failed' }
    $mappedDrive = $true
  }
  $testExit = 0
  try {
    New-Item -ItemType Directory -Force -Path 'D:\DevData' | Out-Null
    pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
    $testExit = $LASTEXITCODE
  } finally {
    if ($mappedDrive) { & subst.exe D: /D }
  }
  exit $testExit
  ```

  `D:` mapping is ephemeral runner infrastructure, not product storage or
  installation policy. It must not create a product Profile, mount a product
  root, add a matrix, timeout, retry, telemetry, or change product code.

- [ ] **Step 3: Focused GREEN and narrow commit**

      & $existingPython -m pytest tests/contracts/test_public_repository_surface.py
      git diff --check

  Expected: the static contract passes and proves the installer contract has
  left Ubuntu for native Windows. Commit only the two amendment files:

      test: run installer contract on native Windows

### Amendment Task 3: fresh gates, audit, review, and feature push

**Files:** no additional files. Modify the two amendment files only for
demonstrated Critical/Important review findings.

- [ ] **Step 1: Fresh local gates**

  On the native Windows implementation host, run:

      pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
      pnpm --filter @tianwen/runtime-bundle... build
      pnpm run typecheck
      pnpm run check:dsh-install
      pnpm run check:no-private-dsh-imports
      & $existingPython -m pytest tests/contracts/test_public_repository_surface.py
      & $existingPython -m ruff check .
      git diff --check

  The installer contract must report 29 passing tests. If the approved Python
  is unavailable, report it as locally unavailable rather than creating an
  environment; exact-main Python CI remains bearing. No local gate runs a
  product installer or a Provider.

- [ ] **Step 2: Mechanical CI self-review and resource audit**

  Inspect, without triggering CI, the native job's command syntax, pnpm setup
  before Node setup with pnpm cache, frozen install, `pwsh` mapping fallback,
  cleanup, exact Vitest path, and absence of that path from the Ubuntu focused
  command. Confirm no personal path or unfinished placeholder remains in the
  amended workflow/public contract. Require fixtures to end at zero files/zero bytes
  and record `node_modules/.modules.yaml` unchanged; record all install,
  download, relink, product installer, Goal/resume/model, Provider/paid
  token/CNY, Docker, Alpha, and runtime-profile actions as zero.

- [ ] **Step 3: Three independent read-only reviews**

  Review the exact feature for:

  1. correctness/test intent — exact Linux RED records, genuine native Windows
     boundary, `pwsh` syntax, exit propagation, temporary-map cleanup, and
     exclusion from Ubuntu;
  2. architecture/privacy/DSH — no production adapter, Runtime, Provider,
     product-root mutation, raw diagnostics, or persistence expansion; and
  3. Ponytail/YAGNI — one job and temporary mapping, not a cross-platform
     abstraction, test framework, or matrix.

  Fix only demonstrated Critical/Important findings with focused RED/GREEN,
  then repeat affected gates and review. Ordinary-push the clean feature once,
  verify local/tracking/`git ls-remote` equality, send the supervisor its exact
  SHA, commits, file audit, RED/GREEN evidence, gates, reviews and resource
  audit, and stop before main integration.

### Amendment Task 4: supervisor-only main integration and exact-SHA CI

After separate approval, merge and ordinary-push the exact feature once. Verify
merge-tree equality and locate the unique automatic push run by merge SHA.
Python, TypeScript, and `installer-windows` must all complete successfully.
The Windows job must actually execute the existing 29 installer tests; the
TypeScript demos must succeed without an installer test interrupting their
Ubuntu step. Any CI failure is a narrow-log stop line: do not rerun or patch
main.

### Amendment Task 5: separately authorized operational stop line

Only after exact-main CI is green may separate authorization permit one
official offline installer attempt. Existing safe failure receipts remain
non-persistent and a failure stops without retry, ordinary fallback,
raw-output retrieval, Provider action, or product repair. A successful
migration does not itself authorize further governance work.

---

### Workspace setup and baseline stop gate

**Files:** none.

- [ ] **Step 1: Establish exact implementation state**

Reuse D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake. Require a
clean worktree, create or switch the implementation branch from the exact
design+plan SHA supplied by the supervisor, and verify supplied base/main,
local branch, tracking branch and git ls-remote identities before edits.

Require existing node_modules/.modules.yaml; do not install or relink. Set only
the process setting that prevents pnpm implicit installation:

    $env:pnpm_config_verify_deps_before_run = 'false'

Confirm plan-designated fixture roots start at zero files and zero bytes. Do not
inspect or modify the real product root, existing Goal, manifest, credential,
Provider configuration or model selection.

- [ ] **Step 2: Run clean baseline gates**

    pnpm --filter @tianwen/runtime... build
    pnpm --filter @tianwen/runtime-bundle... build
    pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
    pnpm run check:dsh-install
    pnpm run check:no-private-dsh-imports

Expected: existing installer contracts and the DSH rc.7 closure pass without an
install, download or relink. An unrelated failure stops execution.

---

### Task 1: Establish the exact safe failure receipt contract

**Files:**

- Modify: tests/dsh-migration/tianwen-installer.spec.ts
- Modify: scripts/install-tianwen.mjs

**Interfaces:**

- Consumes: the current JSON installer CLI and scriptedInstaller child seams.
- Produces: a newly constructed failure receipt with exactly schemaVersion,
  status and stage; the ready/success receipt is unchanged.

- [ ] **Step 1: RED — pin down safe failure output**

Add a focused process-level JSON failure contract through an existing preflight
failure seam. It asserts exactly:

    {
      schemaVersion: 'tianwen.install-failure.v1',
      status: 'failed',
      stage: 'managed-layout-preflight',
    }

Also assert exit code 1, stdout is one parseable JSON safe value, stderr is
empty, and a path-like raw-error sentinel and credential-like sentinel do not
occur in serialized output. Add a matching non-JSON assertion for the fixed
one-line stderr form only.
Retain the existing success JSON and textual-success expectations.

Run:

    pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts

Expected RED: the current CLI forwards raw Error text or has no canonical safe
failure receipt. An unrelated regression is a stop condition.

- [ ] **Step 2: GREEN — only local vocabulary and formatter**

In scripts/install-tianwen.mjs, define local closed stage constants and a tiny
InstallStageError (or equivalent local wrapper). Add one formatter that
constructs the receipt field by field. At the CLI error boundary select JSON or
fixed text without using Error.message, child stdout/stderr, stack, argv or a
path.

Map both parseInstallerArgs and managed-layout failures to
managed-layout-preflight. Unknown or unwrapped errors map to
installer-internal; do not parse error strings.

Before parsing, derive only whether JSON was explicitly requested from the
literal `--json`/`--json=true` switch so a parser failure can still choose the
fixed JSON boundary. Do not echo an untrusted argument or derive a stage from
its text.

Keep installTianwen successful return values, ready receipt schema and ordinary
success output byte-compatible. Do not add persistent failure state or change
the child runner.

- [ ] **Step 3: Focused GREEN and narrow commit**

    pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
    git diff --check

Commit only Task 1 files:

    feat: report safe installer failure receipts

---

### Task 2: Map existing operation boundaries

**Files:**

- Modify: tests/dsh-migration/tianwen-installer.spec.ts
- Modify: scripts/install-tianwen.mjs

**Interfaces:**

- Consumes: current installer operation order and its unchanged rollback
  closure.
- Produces: a closed stage for every ordinary failure boundary.

- [ ] **Step 1: RED — representative stage mapping**

Extend the existing scripted child/deploy/archive/dump seam with
representative failures for every ordinary stage:

    const expectedStages = [
      'managed-layout-preflight', 'pnpm-entry-preflight', 'pnpm-version',
      'workspace-install', 'managed-host-deploy', 'runtime-bundle-build-1',
      'runtime-bundle-pack-1', 'runtime-bundle-build-2',
      'runtime-bundle-pack-2', 'archive-stability',
      'managed-profile-deploy', 'managed-profile-validation',
      'dsh-config-validation', 'archive-publication', 'receipt-publication',
      'installer-internal',
    ] as const

- pnpm entry, version and workspace install;
- host deploy;
- build and pack one and two;
- archive stability;
- Profile deploy and validation;
- DSH config validation;
- archive publication and receipt publication.

For each, assert the exact stage token, exact three-key JSON form and exit 1.
A deliberately unwrapped test exception must map to installer-internal. Also
prove the same path/credential-like raw sentinels cannot occur in either output
form. Do not introduce restoration-failure injection or rollback
instrumentation.

Run the installer spec and record missing or misclassified mappings as RED.

- [ ] **Step 2: GREEN — local stage carrier only**

Set the current closed token immediately before each existing operation in the
design order. Within the existing mutation transaction, preserve the existing
restoration order unchanged. If rollback itself throws, the outer safe boundary
returns only installer-internal and stops; it makes no statement about
restoration.

Do not claim durable Session/Evolution equality from the receipt. Do not move
transaction boundaries, retry a child, alter timeout settings, create a
catch-all framework, retain raw child output or change success/replay paths.

- [ ] **Step 3: Verify GREEN and commit**

    pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
    pnpm --filter @tianwen/runtime-bundle... build
    git diff --check

Confirm current rc.7 replay, both accepted rc.6 layouts, partial host deployment
rollback and later rollback tests remain green. Commit only Task 2 files:

    fix: classify installer failure stages

---

> **Historical record — not executable.** The original Task 3–7 text below
> records the already-merged safe-failure-receipt delivery. Its former Ubuntu
> focused-Vitest bearing is explicitly superseded by the Native-Windows CI
> amendment above. No worker may append or retain the installer spec in the
> Ubuntu TypeScript focused command; follow Amendment Tasks 1–5 instead.

### Historical Task 3: former Ubuntu installer bearing (superseded)

**Files:**

- Modify: .github/workflows/ci.yml
- Modify: docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md
- Modify: tests/contracts/test_public_repository_surface.py

**Interfaces:**

- Consumes: final stage-only receipt vocabulary, observed nonzero/rollback fact
  and the existing single focused Vitest command.
- Produces: one direct exact-main JavaScript installer contract and a durable
  public statement separating transient stage output from durable-state proof.

- [ ] **Step 1: RED — static public CI and handoff contracts**

The former public contract required the Ubuntu focused Vitest command to
contain:

    tests/dsh-migration/tianwen-installer.spec.ts

The same contract must require that the migration handoff states:

- failed JSON install output is a non-persistent closed safe receipt;
- it preserves no raw child diagnostics and does not prove durable-data equality;
- only a post-exact-main-CI single official offline installer attempt may use
  it operationally;
- a failure reports its stage and stops; only successful migration can precede
  the separately authorized same Goal/manifest configured-Provider resume.

The contract must not add a personal absolute path, credential, raw manifest or
claim that the unproved child root cause is known.

- [ ] **Step 2: Legacy record — do not execute**

The former implementation appended only
`tests/dsh-migration/tianwen-installer.spec.ts` to the existing single focused
Vitest command. It is now expressly replaced by Amendment Tasks 1–5: the path
is absent from Ubuntu and is borne by `installer-windows` on native Windows.

Update the existing handoff with factual observed history, the stage-only safe
receipt role, durable-snapshot limitation and one-attempt stop line. If rollback
itself throws, the operator receives only `installer-internal` and stops; no
receipt claims restoration. Do not add instructions for logging, raw-output
retrieval, manual repair, retry, price activity or a new Provider run. Preserve
existing rc.6/rc.7 transaction and natural-trial boundaries.

- [ ] **Step 3: Verify and commit**

Use the existing D-drive Python only if it already has pytest and ruff; never
create or synchronize an environment. Otherwise mark the local Python contract
unavailable and leave exact-main Python CI bearing.

    & $existingPython -m pytest tests/contracts/test_public_repository_surface.py
    & $existingPython -m ruff check .
    git diff --check

Commit only Task 3 files:

    test: run installer contract in CI

---

### Task 4: Fresh bearing gates and resource audit

**Files:** no additional files. Modify Tasks 1–3 files only for demonstrated
Critical/Important review findings.

- [ ] **Step 1: Run proportional gates serially**

    pnpm --filter @tianwen/runtime... build
    pnpm --filter @tianwen/runtime-bundle... build
    pnpm run typecheck
    pnpm run check:dsh-install
    pnpm run check:no-private-dsh-imports
    pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-startup.e2e.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/goal-resume.spec.ts tests/dsh-probe/install-closure.spec.ts tests/dsh-probe/public-surface.spec.ts tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/natural-run-evidence-demo.spec.ts
    pnpm demo:natural-run-evidence
    git diff --check

Run Python public contract/Ruff only with the approved existing D-drive
interpreter. No gate may invoke product installer, Goal, configured model or
Provider. For the amendment, the final local native-Windows run includes the
installer spec, while exact-main `installer-windows` carries and passes it;
the Ubuntu focused command must omit it.

- [ ] **Step 2: Audit fixtures and external actions**

Require every plan fixture root finishes at zero files/zero bytes. The sole
implementation worktree must have no .venv or .dsh-probe content. Record
node_modules/.modules.yaml identity unchanged and all install/download/relink,
product installer, Goal/resume/model, Provider/paid-token/CNY, Docker, Alpha
and legacy runtime-profile actions at zero.

---

### Task 5: Independent review, feature push and stop

**Files:** no additional files except focused fixes for demonstrated
Critical/Important findings in Task 1–3 scope.

- [ ] **Step 1: Three independent read-only reviews**

Review exact feature head for:

1. correctness/replay: stage ordering, stage-only safe output, success
   receipt/replay and rollback preservation;
2. architecture/privacy/DSH: rc.7-only boundary, non-persistence, raw-data
   exclusion and no Runtime/Provider/learning expansion;
3. Ponytail/YAGNI: one local carrier/formatter rather than a generic
   diagnostic, logger, telemetry, retry or error framework.

Resolve only demonstrated Critical/Important findings with focused RED/GREEN,
then repeat affected gates and review. Do not elevate a theoretical failure into
a subsystem.

- [ ] **Step 2: Push once and report**

Ordinary-push the clean feature. Verify local, tracking and git ls-remote exact
equality. Send the supervisor the exact SHA, commits, file audit, RED/GREEN
evidence, fresh gates, reviews, fixture/resource audit and explicit statement
that no main merge, product installation, Goal or Provider action occurred.
Stop before main integration.

---

### Task 6: Supervisor-only main integration and exact-SHA CI

**Files:** none beyond the approved feature tree.

**Interfaces:**

- Consumes: supervisor-approved exact feature SHA.
- Produces: one exact main merge SHA whose automatic push CI carries the
  JavaScript installer contract.

- [ ] **Step 1: Merge/push once after separate approval**

From clean main, verify approved feature and main SHAs, merge once with
no-fast-forward, prove merge tree equality with the feature, run diff-check,
then ordinary-push once. Do not create a merge-only fix, fetch/rebase or
force-push.

- [ ] **Step 2: Require the real exact-main bearing gate**

This former exact-main requirement is superseded by Amendment Task 4: Python,
TypeScript, and `installer-windows` must complete successfully; only the
native Windows job executes the installer spec. If any job fails, capture only
the narrow failing log and stop; do not rerun or patch main.

---

### Task 7: Separately authorized one operational gate

Only then may separate authorization permit one official offline installer
attempt. A failure reports its safe stage and stops: no retry, ordinary fallback
or raw-output retrieval. Only successful installation may permit the already
authorized one existing fresh Goal/manifest configured-Provider resume; that
operational action still has a one-attempt stop line and does not authorize a
later governance stage.
