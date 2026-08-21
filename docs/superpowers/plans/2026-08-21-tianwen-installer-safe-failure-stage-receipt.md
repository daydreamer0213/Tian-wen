# Tianwen installer safe failure stage receipt implementation plan

> **For agentic workers:** Execute task by task with executing-plans, TDD,
> verification-before-completion, requesting-code-review, and Ponytail review.
> Preserve every stated stop line.

**Goal:** On a failed tianwen install --json invocation, return one canonical
safe stage receipt without retaining raw diagnostics, changing the ready
receipt, or changing the managed installation transaction.

**Architecture:** The installer keeps a small local current-stage carrier.
Existing operation boundaries select a closed token before they run. The
existing transaction catch records whether required restoration completed, and
the CLI constructs a fresh receipt. Unknown exceptions reduce to
installer-internal; no child text is forwarded.

**Tech stack:** Existing Node.js ESM installer, spawnSync, Vitest, pnpm
offline workspace tooling and existing D-drive store.

## Global constraints

- Canonical design:
  docs/superpowers/specs/2026-08-21-tianwen-installer-safe-failure-stage-receipt-design.md.
- Base main: acd1feff8da1db0786430ecc84615ab6a9a35212.
- The execution order supplies the exact commit containing this plan. Stop if
  local, tracking and remote do not agree on it.
- Implementation branch:
  codex/tianwen-installer-safe-failure-stage-receipt.
- DSH 0.1.0-rc.7 remains the sole product Agent Runtime.
- Product implementation scope is limited to:
  - scripts/install-tianwen.mjs
  - tests/dsh-migration/tianwen-installer.spec.ts
  - docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md
  - tests/contracts/test_public_repository_surface.py only for the permanent
    public handoff statement.
- Do not modify packages, lockfiles, dependencies, workflow, Runtime services,
  Profile schema, ledger, learning paths, Provider paths or price/budget code.
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
  status, stage and recovery; the ready/success receipt is unchanged.

- [ ] **Step 1: RED — pin down safe failure output**

Add a focused process-level JSON failure contract through an existing preflight
failure seam. It asserts exactly:

    {
      schemaVersion: 'tianwen.install-failure.v1',
      status: 'failed',
      stage: 'managed-layout-preflight',
      recovery: 'not-required',
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

In scripts/install-tianwen.mjs, define local closed stage/recovery constants and
a tiny InstallStageError (or equivalent local wrapper). Add one formatter that
constructs the receipt field by field. At the CLI error boundary select JSON or
fixed text without using Error.message, child stdout/stderr, stack, argv or a
path.

Mark the current pre-transaction preflight as managed-layout-preflight and
not-required. Unknown or unwrapped errors map to installer-internal; do not
parse error strings.

Keep installTianwen successful return values, ready receipt schema and ordinary
success output byte-compatible. Do not add persistent failure state or change
the child runner.

- [ ] **Step 3: Focused GREEN and narrow commit**

    pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
    git diff --check

Commit only Task 1 files:

    feat: report safe installer failure receipts

---

### Task 2: Map transaction boundaries and truthful recovery

**Files:**

- Modify: tests/dsh-migration/tianwen-installer.spec.ts
- Modify: scripts/install-tianwen.mjs

**Interfaces:**

- Consumes: current installer operation order and rollback closure.
- Produces: a closed stage for every ordinary failure boundary and truthful
  not-required, completed or failed recovery.

- [ ] **Step 1: RED — representative mapping and recovery**

Extend the existing scripted child/deploy/archive/dump seam with
representative failures for every ordinary stage:

- pnpm entry, version and workspace install;
- host deploy;
- build and pack one and two;
- archive stability;
- Profile deploy and validation;
- DSH config validation;
- archive publication and receipt publication.

For each, assert the exact stage token, exact four-key JSON form, exit 1 and
the correct recovery token. A deliberately unwrapped test exception must map
to installer-internal. Add an injected restoration failure that proves
recovery failed without exposing its sentinel.

Run the installer spec and record missing or misclassified mappings as RED.

- [ ] **Step 2: GREEN — local stage carrier only**

Set the current closed token immediately before each existing operation in the
design order. Within the existing mutation transaction, wrap its failure with
that token and execute the existing restoration order. Return completed only
after required restoration calls return; return failed if a required
restoration fails. Pre-transaction failures remain not-required.

Do not claim durable Session/Evolution equality from recovery. Do not move
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

### Task 3: State the durable operational contract honestly

**Files:**

- Modify: docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md
- Modify: tests/contracts/test_public_repository_surface.py

**Interfaces:**

- Consumes: final fixed receipt vocabulary and observed nonzero/rollback fact.
- Produces: a durable public operator statement separating transient stage
  receipt from durable-state proof.

- [ ] **Step 1: RED — public handoff contract**

Extend the existing public repository contract so the migration handoff states:

- failed JSON install output is a non-persistent closed safe receipt;
- it preserves no raw child diagnostics and does not prove durable-data equality;
- only a post-exact-main-CI single official offline installer attempt may use
  it operationally;
- a failure reports its stage and stops; only successful migration can precede
  the separately authorized same Goal/manifest configured-Provider resume.

The contract must not add a personal absolute path, credential, raw manifest or
claim that the unproved child root cause is known.

- [ ] **Step 2: GREEN — concise handoff**

Update the existing handoff with the factual observed history, safe receipt role,
recovery limitation and one-attempt stop line. Do not add instructions for
logging, raw-output retrieval, manual repair, retry, price activity or a new
Provider run. Preserve existing rc.6/rc.7 transaction and natural-trial
boundaries.

- [ ] **Step 3: Verify and commit**

Use the existing D-drive Python only if it already has pytest and ruff; never
create or synchronize an environment. Otherwise mark the local Python contract
unavailable and leave exact-main Python CI bearing.

    & $existingPython -m pytest tests/contracts/test_public_repository_surface.py
    & $existingPython -m ruff check .
    git diff --check

Commit only Task 3 files:

    docs: describe safe installer failure receipts

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
Provider.

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

1. correctness/replay: stage ordering, recovery truth, safe output, success
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

### Supervisor-only continuation: main integration and one operational gate

After separate exact-feature review, the supervisor alone may authorize a
single no-fast-forward merge and ordinary main push. The executor must locate
the one automatic push CI for that exact merge SHA and require Python and
TypeScript success before a real product action.

Only then may separate authorization permit one official offline installer
attempt. A failure reports its safe stage and stops: no retry, ordinary fallback
or raw-output retrieval. Only successful installation may permit the already
authorized one existing fresh Goal/manifest configured-Provider resume; that
operational action still has a one-attempt stop line and does not authorize a
later governance stage.
