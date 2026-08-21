# Tianwen Natural Trial Safe Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installed natural-trial CLI emit exactly one bounded,
validated safe JSON receipt instead of mixing DSH terminal output with the
receipt, then perform one separately authorized retry of the same fresh Goal.

**Architecture:** Pipe stdout/stderr only for the natural-trial child, validate
the existing `NaturalRunTrialReceipt`, and re-emit a newly constructed safe
object. Reuse the existing runtime-bundle parent/child seam and output limit;
do not change the DSH Agent loop, runner, learning path, ledger, or budget
policy.

**Tech Stack:** TypeScript, Node.js child processes and streams, Vitest, pnpm,
DSH `0.1.0-rc.7` public APIs.

## Global Constraints

- Canonical design:
  `docs/superpowers/specs/2026-08-21-tianwen-natural-trial-safe-receipt-design.md`.
- The supervisor must provide the exact commit containing both this plan and
  the approved design. If the implementation branch does not start from that
  exact commit, stop before editing.
- Base main before design work is
  `7eada5dafa63ca04c4e70c8ff142df4fc6a477db`.
- DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- Reuse the existing clean D-drive implementation worktree and its one
  `node_modules`; do not create another clone, worktree, Profile, dependency
  store, `.venv`, or probe.
- Do not install, download, relink, or refresh dependencies. For every pnpm
  command set `pnpm_config_verify_deps_before_run=false` and reuse the existing
  D-drive store.
- Tasks 1-4 run with zero Provider, paid model, Docker, Alpha, or
  runtime-profile activity.
- Add no dependency, lockfile change, second Runtime, store, queue, worker,
  scheduler, logger framework, ANSI sanitizer, retry loop, price lookup,
  price snapshot, budget reservation, or budget state machine.
- Ordinary resume and live smoke retain their current execution and deadline
  behavior.
- Do not create a second Goal or change the existing frozen natural-trial
  manifest. A real retry is allowed only after exact-main CI and official
  product installation succeed.
- The existing 60 CNY authorization is an external supervisor boundary only.

## Workspace Setup

- [ ] Reuse
  `D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake`.
- [ ] Require the worktree clean and create/switch to
  `codex/tianwen-natural-trial-safe-receipt` at the exact supervisor-provided
  design+plan SHA.
- [ ] Confirm local/tracking/remote main still resolves to the expected base or
  its later exact approved main; do not fetch/rebase or rewrite history.
- [ ] Read the complete canonical design, this complete plan, the Stage 7
  natural evidence design/handoff, `natural-run-trial.ts`, `resume.ts`,
  `resume-runner.ts`, `goal-resume.spec.ts`, and `goal-live-smoke.spec.ts`.
- [ ] Before tests, require these dedicated roots contain zero files/zero
  bytes; if unknown content exists, stop without deleting it:
  `D:\DevData\tianwen-goal-resume-tests` and
  `D:\DevData\tianwen-stage7-test-fixtures`.
- [ ] Record `node_modules\.modules.yaml` length/mtime and confirm `.venv` is
  absent.
- [ ] Run the existing focused baseline with zero Provider:

```powershell
$env:pnpm_config_verify_deps_before_run = 'false'
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-migration/goal-resume.spec.ts tests/dsh-migration/goal-live-smoke.spec.ts tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/natural-run-evidence-demo.spec.ts
```

Expected: green. Any pre-existing failure is a stop condition.

---

### Task 1: Isolate and validate the natural-trial child receipt

**Files:**

- Modify: `packages/tianwen-runtime-bundle/src/natural-run-trial.ts`
- Modify: `packages/tianwen-runtime-bundle/src/resume.ts`
- Modify: `tests/dsh-migration/goal-resume.spec.ts`

**Interfaces:**

- Consumes: existing `NaturalRunTrialReceipt`,
  `NaturalRunTrialResumePreflight`, Node `ChildProcess`, and the existing
  65,536-byte strict-child output boundary.
- Produces:

```ts
export function parseNaturalRunTrialChildReceipt(
  stdout: string,
  stderr: string,
  expected: { readonly goalId: string; readonly sessionId: string },
): NaturalRunTrialReceipt

export interface NaturalTrialChildDependencies {
  readonly write?: (line: string) => void
  readonly writeError?: (line: string) => void
}

export function monitorNaturalRunTrialChild(
  child: ChildProcess,
  preflight: NaturalRunTrialResumePreflight,
  dependencies?: NaturalTrialChildDependencies,
): Promise<number>
```

- [ ] **Step 1: Write the failing parser and monitor contracts**

Extend `goal-resume.spec.ts` with a canonical safe fixture and a fake child
made from `EventEmitter` plus two `PassThrough` streams. Cover:

```ts
const receipt = naturalTrialReceipt({
  goalId: 'goal-safe',
  sessionId: 'session-safe',
})

expect(parseNaturalRunTrialChildReceipt(
  `${JSON.stringify(receipt)}\n`, '',
  { goalId: 'goal-safe', sessionId: 'session-safe' },
)).toEqual(receipt)

expect(() => parseNaturalRunTrialChildReceipt(
  `\u001b[?25l${JSON.stringify(receipt)}\n`, '',
  { goalId: 'goal-safe', sessionId: 'session-safe' },
)).toThrow()
```

The monitor test must write a valid receipt to the fake child's stdout, emit
`close(0)`, and require one normalized JSON line and exit 0. Table-driven
failure cases must include ANSI/control prefix, non-empty stderr containing a
path/credential-shaped sentinel, unknown nested key, wrong Goal ID, wrong
Session ID, malformed JSON, invalid digest/counter, child exit 1, and output
overflow. Every failure must return 1, emit only the same fixed error line,
and exclude the sentinel from both output arrays.

- [ ] **Step 2: Run RED**

```powershell
$env:pnpm_config_verify_deps_before_run = 'false'
pnpm exec vitest run tests/dsh-migration/goal-resume.spec.ts
```

Expected: fail because the parser and monitor do not exist; current natural
child wiring still inherits stdio.

- [ ] **Step 3: Implement the strict receipt parser**

In `natural-run-trial.ts`, reuse the file's existing record and exact-key
helpers. Add small validators for safe integers, SHA-256 digests, closed enums,
and optional keys. Parse only one JSON value, reject non-empty stderr and all
unknown keys, require expected Goal/Session IDs, then construct a fresh
`NaturalRunTrialReceipt` rather than returning the parsed object.

Do not add a schema library, generic validator, credential scanner, or ANSI
stripper.

- [ ] **Step 4: Implement the bounded natural child monitor**

In `resume.ts`:

1. rename the existing private output constant to describe both strict child
   modes without changing its value;
2. add `monitorNaturalRunTrialChild()` with no timer and no retry;
3. collect each child stream up to 65,536 bytes;
4. on valid close, parse and write one normalized receipt;
5. on error/overflow/invalid receipt/non-zero exit, suppress raw bytes, write
   `tianwen resume: natural Run trial child failed\n` to stderr, and return 1;
6. wire `liveSmoke || naturalTrial` to `['ignore', 'pipe', 'pipe']`;
7. continue using `monitorLiveSmokeChild()` for live smoke and use the new
   monitor only for natural trial;
8. leave ordinary resume on `inherit`.

The branch structure must remain explicit:

```ts
const strictChild = liveSmoke || naturalTrial
const childStdio = strictChild ? ['ignore', 'pipe', 'pipe'] as const : 'inherit'
// Use `stdio: childStdio` in the existing spawn options.
if (liveSmoke) return monitorLiveSmokeChild(child, preflight, startedAtMs)
if (naturalTrial) return monitorNaturalRunTrialChild(child, preflight)
```

- [ ] **Step 5: Run GREEN and narrow regressions**

```powershell
$env:pnpm_config_verify_deps_before_run = 'false'
pnpm exec vitest run tests/dsh-migration/goal-resume.spec.ts tests/dsh-migration/goal-live-smoke.spec.ts
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: all pass; DSH closure remains exact rc.7.

- [ ] **Step 6: Commit**

```powershell
git add -- packages/tianwen-runtime-bundle/src/natural-run-trial.ts packages/tianwen-runtime-bundle/src/resume.ts tests/dsh-migration/goal-resume.spec.ts
git diff --cached --check
git commit -m "fix: isolate natural trial child receipts"
```

---

### Task 2: Record the real stop and corrected boundary

**Files:**

- Modify: `docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md`

**Interfaces:**

- Consumes: the real successful managed rc.7 migration, the zero-Provider
  pre-Turn stop, and Task 1's safe child receipt boundary.
- Produces: a durable, cautious public handoff. It does not publish the Goal
  ID, manifest, Session content, model output, or local absolute paths.

- [ ] **Step 1: Update the handoff truthfully**

Record only these facts:

- the real managed product root successfully migrated to DSH rc.7 with
  Session/Evolution bytes unchanged;
- the first configured natural invocation stopped before its first Turn and
  used zero Provider requests/tokens;
- the observed cause was inherited terminal output mixing with the safe JSON
  channel;
- the correction pipes, validates, and re-emits only the safe receipt;
- a configured-Provider natural receipt is still not claimed until the new
  post-main attempt actually completes;
- no Ticket, Candidate, Evaluation, Shadow, or Promotion was manufactured.

Do not write raw terminal bytes, prompt/model/Skill content, personal paths,
or credential facts beyond the boolean already permitted by the private
supervisor report.

- [ ] **Step 2: Run the public contracts**

Use the existing D-drive Python only if it still exists and provides pytest;
do not run bare `uv`, install, or create an environment:

```powershell
$python = 'D:\DevData\tianwen-ci-py312-env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw 'local Python contract unavailable; do not install'
}
& $python -m pytest tests/contracts/test_public_repository_surface.py -q
git diff --check
```

Expected: public contract green and no personal-path match.

- [ ] **Step 3: Commit**

```powershell
git add -- docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md
git diff --cached --check
git commit -m "docs: record safe natural trial receipt boundary"
```

---

### Task 3: Fresh gates, reviews, and feature push

**Files:** None beyond Tasks 1-2.

**Interfaces:**

- Consumes: exact Task 1-2 feature tree.
- Produces: one reviewed, clean, ordinarily pushed feature SHA. It does not
  authorize main integration or Provider activity.

- [ ] **Step 1: Run the proportional bearing gates serially**

```powershell
$env:pnpm_config_verify_deps_before_run = 'false'
pnpm --filter @tianwen/runtime... build
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-migration/goal-resume.spec.ts tests/dsh-migration/goal-live-smoke.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-startup.e2e.spec.ts tests/dsh-probe/install-closure.spec.ts tests/dsh-probe/public-surface.spec.ts tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/natural-run-evidence-demo.spec.ts
pnpm demo:natural-run-evidence
& 'D:\DevData\tianwen-ci-py312-env\Scripts\python.exe' -m pytest tests/contracts/test_public_repository_surface.py -q
git diff --check
```

Expected: all available gates pass. Do not run Provider, Docker, Alpha,
runtime-profile, full dependency installation, or unrelated historical gates.

- [ ] **Step 2: Audit resources**

Require both dedicated fixture roots zero files/zero bytes, worktree `.dsh-probe`
zero files/zero bytes, `.venv` absent, and `node_modules\.modules.yaml`
length/mtime unchanged.

- [ ] **Step 3: Run three independent reviews**

Review the exact feature diff against the canonical design and plan:

1. correctness/replay: exact receipt schema, IDs, counters, child close/error,
   output cap, no retry;
2. architecture/privacy/DSH: sole Runtime, raw child bytes never forwarded,
   ordinary/live behavior preserved, no ledger or Provider change;
3. Ponytail/YAGNI: no generic subprocess framework, sanitizer, logger,
   dependency, budget, or speculative terminal-format support.

Any Critical or Important finding must be fixed with the smallest RED/GREEN
change and re-reviewed before push.

- [ ] **Step 4: Push feature once and stop**

Require worktree clean, then perform one ordinary non-force feature push.
Verify local/tracking/`ls-remote` exact equality and report the exact SHA to
the supervisor. Stop before main merge and before product installation.

---

### Task 4: Mainline integration and exact-SHA CI

**Files:** None beyond the supervisor-approved feature tree.

This task is supervisor-controlled.

- [ ] Require supervisor approval of the exact feature SHA.
- [ ] In the clean main worktree require main local/tracking/`ls-remote` exact
  equality to the reported parent.
- [ ] Perform exactly one `--no-ff` merge with no merge-only fix.
- [ ] Require merge tree equal to the approved feature tree and diff-check
  clean.
- [ ] Push main exactly once, ordinarily and without force.
- [ ] Observe the unique automatic CI run for the exact merge SHA. Require
  Python and TypeScript jobs completed/success, including runtime-bundle build,
  the focused `goal-resume.spec.ts`, DSH closure, private-import check, and
  natural evidence demo.
- [ ] On failure, collect only the failed job's necessary log and stop. Do not
  rerun, patch main, install the product bundle, or invoke Provider.
- [ ] On success, stop before Task 5 and report exact refs/run/job URLs.

---

### Task 5: Install the correction once and retry the same natural Goal once

**Files:** No repository edit. The existing manifest remains outside Git at
its already approved D-drive path.

This task is supervisor-controlled and may start only after Task 4 exact-main
CI is green.

- [ ] **Step 1: Re-establish the current product pre-state**

Require the product root classify as current managed rc.7 with a canonical
ready receipt. Snapshot every regular Session/Evolution file by relative path,
size, and SHA-256 without printing contents. Record Runtime Bundle archive and
backup-residue facts. Require no installer/DSH child alive.

- [ ] **Step 2: Run the official installer exactly once**

Use the exact-main source worktree and existing D-drive Corepack/pnpm store:

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack'
$env:COREPACK_ENABLE_NETWORK = '0'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
$env:PNPM_CONFIG_OFFLINE = 'true'
$env:pnpm_config_verify_deps_before_run = 'false'
pnpm install:tianwen -- --data-dir D:\DevData\tianwen --json
```

Invoke it once, with no outer wall-clock timeout, no second call, and only
sparse read-only process observation. On error, verify rollback against the
complete pre-snapshot and stop with zero Provider. Do not retry or repair.

- [ ] **Step 3: Verify installed identity and durable equality**

On success require current rc.7 host/base/headless, corrected exact-main
Runtime Bundle/ready receipt, regular archive, zero backup residue, no download
indication, no child process, and byte-identical Session/Evolution snapshots.
Do not run the installer again to prove replay.

- [ ] **Step 4: Revalidate the existing Goal and manifest at zero Provider**

Require:

- Goal `goal-5a1b98c8-40e3-4762-b374-d80a9202bf8f` still revision 1, active,
  `roundsStarted=0`, with no `turn/start`;
- the existing manifest remains one regular file; recompute its complete
  canonical digest and require equality to the complete digest already held by
  the executor, never to a truncated display, without printing raw manifest
  content;
- installed CLI comes only from the canonical ready receipt;
- existing `systematic-debugging` resolves through the prepared Agent's public
  DSH Skill scope;
- the repository-relative verifier handoff exists in the clean exact-main
  worktree;
- credential presence is true without reading or printing its value;
- the current model selection is recorded and supported.

Any failure returns `natural-trial-pending` with zero Provider and stops. Do
not create another Goal, manifest, Profile, Skill copy, or fallback run.

- [ ] **Step 5: Resume exactly once through the corrected installed CLI**

Set `DSH_AGENTS_HOME` from `$env:USERPROFILE`, select `deepseek-v4-pro` with
the installed CLI, and invoke exactly one resume of the same Goal and same
manifest. Keep model selection change, resume, and restoration inside the
same nested `try/finally`; restore the previous selection exactly once even on
failure. Configuration commands must report zero model requests.

Use the receipt-derived installed CLI and this exact command shape:

```powershell
$node = 'D:\hermes\node\node.exe'
$dataDir = 'D:\DevData\tianwen'
$mainWorktree = 'D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge'
$manifestPath = 'D:\DevData\tianwen-stage7-task8\natural-run-trial.json'
$goalId = 'goal-5a1b98c8-40e3-4762-b374-d80a9202bf8f'
$receipt = Get-Content -LiteralPath "$dataDir\receipts\tianwen-install.json" -Raw | ConvertFrom-Json
$cli = $receipt.cliPath
$env:DSH_AGENTS_HOME = Join-Path $env:USERPROFILE '.codex'

Push-Location -LiteralPath $mainWorktree
try {
  $status = (& $node $cli model status --data-dir $dataDir --json) | ConvertFrom-Json
  $previousModelChoice = switch ("$($status.selection.provider)/$($status.selection.model)") {
    'tianwen-offline/phase2-smoke' { 'offline' }
    'deepseek-official/deepseek-v4-flash' { 'deepseek-v4-flash' }
    'deepseek-official/deepseek-v4-pro' { 'deepseek-v4-pro' }
    default { throw 'natural-trial-pending: unsupported prior model selection' }
  }
  try {
    (& $node $cli model use --model deepseek-v4-pro --data-dir $dataDir --json) |
      ConvertFrom-Json | Out-Null
    $safeReceipt = (& $node $cli resume --goal $goalId --data-dir $dataDir `
      --trial-manifest $manifestPath --json) | ConvertFrom-Json
  } finally {
    (& $node $cli model use --model $previousModelChoice --data-dir $dataDir --json) |
      ConvertFrom-Json | Out-Null
  }
} finally {
  Pop-Location
}
```

Do not use a PTY-side JSON workaround, redirect raw child output to a file,
strip ANSI, search terminal text for JSON, retry, or create a second Goal. The
installed product must emit the safe receipt itself.

- [ ] **Step 6: Close truthfully**

Accept any real outcome. Report only safe Goal/Session/Run/Evidence/learning
IDs, fixed decisions/reasons, model request/tool/token counts,
`exactCny=unavailable` without a billing receipt, model restoration, and
whether governance changed the Session. Do not report raw prompt, model/Skill
content, tool arguments/results, terminal bytes, credential values, manifest,
or Session history.

No result authorizes a second run, manufactured Ticket, Candidate, Evaluation,
Shadow, Active Pointer, Promotion, or rollback. Do not commit, push, create a
PR/tag/Release, or start a new Stage.
