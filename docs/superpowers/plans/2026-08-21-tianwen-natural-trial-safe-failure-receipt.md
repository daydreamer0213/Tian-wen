# Natural Trial Safe Failure Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every known pre-Turn natural-trial failure return one strict, privacy-safe, actionable receipt without changing normal DSH execution or persisting diagnostics.

**Architecture:** Reuse the existing `goal-live-smoke` failure-receipt pattern. The runtime service attaches closed internal codes where Skill/binding facts are known; the natural child converts only known pre-Turn failures into a strict receipt; the bounded parent validates and normalizes that receipt even when the child exits non-zero.

**Tech Stack:** TypeScript 6.0.3, Node 22, Vitest 4.1.8, pnpm 11.20.0, DSH `0.1.0-rc.7` public APIs.

## Global Constraints

- Canonical design: `docs/superpowers/specs/2026-08-21-tianwen-natural-trial-safe-failure-receipt-design.md`.
- Execution starts only from the exact docs-only design+plan SHA supplied by the supervisor after this plan is committed and normally pushed. A moving branch name is not a baseline.
- DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- Do not add a Runtime, Profile, store, ledger event, logger, telemetry pipeline, retry, Provider wrapper, price lookup, budget subsystem, or dependency.
- Do not preserve or forward raw child stdout/stderr, `Error.message`, stacks, paths, URLs, prompts, Skill bodies, tool values, manifest content, or credentials.
- Do not change ordinary resume, live-smoke, successful natural-trial, Outcome, Signal/Ticket, Candidate, Evaluation, Shadow, Promotion, Alpha, Dynamic Cordis, Artifact, or Champion behavior.
- Use TDD. Each product change begins with an exact failing contract and ends with a narrow commit.
- Reuse the existing D-drive implementation worktree and its single `node_modules`; do not install, download, relink, create `.venv`, clone, Profile, Goal, manifest, or probe.
- No Provider, paid token, Docker, Alpha, product installer, or natural Goal run before the supervisor-only operational task after exact-main CI.
- A theoretical edge is not a blocker unless it is reachable through the current public product path or violates an existing contract.

---

## Workspace Setup

- [ ] **Step 1: Require the exact canonical baseline**

The supervisor supplies `TIANWEN_PLAN_SHA`, the commit containing both this
plan and the approved design. Stop if it is absent, moving, or not present on
the named remote design branch.

```powershell
if ([string]::IsNullOrWhiteSpace($env:TIANWEN_PLAN_SHA)) {
  throw 'exact design+plan SHA is required'
}
git cat-file -e "$env:TIANWEN_PLAN_SHA^{commit}"
if ($LASTEXITCODE -ne 0) { throw 'design+plan commit is unavailable' }
```

- [ ] **Step 2: Reuse one D-drive implementation worktree**

Use `D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake`. Require
it clean, reuse its existing `node_modules`, and create branch
`codex/tianwen-natural-trial-safe-failure-receipt` at the exact plan SHA. Do
not install or relink dependencies.

```powershell
$worktree = 'D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake'
if (git -C $worktree status --porcelain) { throw 'implementation worktree is dirty' }
if (-not (Test-Path -LiteralPath "$worktree\node_modules\.modules.yaml" -PathType Leaf)) {
  throw 'existing node_modules is unavailable; do not install'
}
git -C $worktree switch --detach $env:TIANWEN_PLAN_SHA
git -C $worktree switch -c codex/tianwen-natural-trial-safe-failure-receipt
```

If the branch already exists or the worktree is not at the expected prior
feature, stop for supervisor reconciliation instead of deleting or resetting.

- [ ] **Step 3: Check fixture roots before tests**

Require both roots to contain zero files and zero logical bytes. Unknown data
is a stop condition; never delete it to make the gate green.

```powershell
$roots = @(
  'D:\DevData\tianwen-goal-resume-tests',
  'D:\DevData\tianwen-stage7-test-fixtures'
)
foreach ($root in $roots) {
  if (Test-Path -LiteralPath $root) {
    $files = @(Get-ChildItem -LiteralPath $root -File -Recurse -Force)
    if ($files.Count -ne 0 -or ($files | Measure-Object Length -Sum).Sum -gt 0) {
      throw "fixture root is not empty: $root"
    }
  }
}
```

- [ ] **Step 4: Run the clean baseline**

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack'
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-stage7-test-fixtures'
pnpm --filter @tianwen/runtime... build
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run `
  tests/dsh-probe/skill-governance-runtime.spec.ts `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts `
  tests/dsh-migration/goal-live-smoke.spec.ts
```

All commands must pass before Task 1. A pre-existing failure is a stop
condition; do not run a second time merely because a build generated ignored
output.

---

## Task 1: Strict failure receipt and bounded parent transport

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/natural-run-trial.ts`
- Modify: `packages/tianwen-runtime-bundle/src/resume.ts`
- Modify: `tests/dsh-migration/goal-resume.spec.ts`

**Interfaces:**
- Consumes: existing `NaturalRunTrialReceipt`, exact receipt parser, 65,536-byte child monitor.
- Produces: `NaturalRunTrialFailureCode`, `NaturalRunTrialFailureReceipt`, `createNaturalRunTrialFailure()`, and a parser/monitor that accepts the exact failure receipt only with non-zero child exit.

- [ ] **Step 1: Write the receipt parser RED**

Extend `goal-resume.spec.ts` with one table containing every approved code and
one exact receipt factory:

```ts
const failureCodes = [
  'manifest-revalidation-failed',
  'services-unavailable',
  'agent-resume-failed',
  'session-goal-preflight-failed',
  'verifier-unavailable',
  'run-binding-precondition-failed',
  'skill-unavailable',
  'skill-not-model-invocable',
  'run-binding-persistence-failed',
  'pre-turn-internal-error',
] as const

it.each(failureCodes)('normalizes safe pre-Turn failure %s', code => {
  const receipt = createNaturalRunTrialFailure(code, {
    goalId: 'goal-natural', sessionId: 'session-natural',
  })
  expect(parseNaturalRunTrialChildReceipt(
    `${JSON.stringify(receipt)}\n`, '',
    { goalId: 'goal-natural', sessionId: 'session-natural' },
  )).toEqual(receipt)
})
```

Add negative cases for unknown code, extra key, wrong Goal, wrong Session,
non-zero usage, stderr, prefix/suffix, and success/failure shape mixing.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run tests/dsh-migration/goal-resume.spec.ts
```

Expected: fail because failure types/factory/parser support do not exist.

- [ ] **Step 3: Add the exact receipt union**

In `natural-run-trial.ts`, add the closed tuple, type, receipt, and factory.
The factory accepts only Goal/Session IDs and always writes literal zero usage.

```ts
export const NATURAL_RUN_TRIAL_FAILURE_CODES = [
  'manifest-revalidation-failed',
  'services-unavailable',
  'agent-resume-failed',
  'session-goal-preflight-failed',
  'verifier-unavailable',
  'run-binding-precondition-failed',
  'skill-unavailable',
  'skill-not-model-invocable',
  'run-binding-persistence-failed',
  'pre-turn-internal-error',
] as const

export type NaturalRunTrialFailureCode =
  typeof NATURAL_RUN_TRIAL_FAILURE_CODES[number]

export interface NaturalRunTrialFailureReceipt {
  readonly schemaVersion: 'tianwen.natural-run-trial-receipt.v1'
  readonly status: 'pre-turn-failed'
  readonly failureCode: NaturalRunTrialFailureCode
  readonly goal: { readonly id: string }
  readonly session: { readonly id: string }
  readonly usage: {
    readonly modelRequests: 0
    readonly toolCalls: 0
    readonly exactCny: 'unavailable'
  }
}
```

Rename the current interface internally to
`NaturalRunTrialSettledReceipt`, then export:

```ts
export type NaturalRunTrialReceipt =
  | NaturalRunTrialSettledReceipt
  | NaturalRunTrialFailureReceipt
```

Parse `status` first, then apply an exact key set for that discriminant. Do not
make success fields optional and do not accept free-form reasons.

- [ ] **Step 4: Write the monitor RED**

Add child-process tests proving:

```ts
const failed = naturalTrialChild()
const output: string[] = []
const errors: string[] = []
const exit = monitorNaturalRunTrialChild(failed as never, preflight, {
  write: line => { output.push(line) },
  writeError: line => { errors.push(line) },
})
failed.stdout.write(`${JSON.stringify(failureReceipt)}\n`)
failed.emit('close', 1, null)
await expect(exit).resolves.toBe(1)
expect(output).toEqual([`${JSON.stringify(failureReceipt)}\n`])
expect(errors).toEqual([])
```

Also prove exit `0` + failure receipt, exit `1` + success receipt, stderr,
mixed output, overflow, and sentinel-bearing unknown fields produce only the
existing generic fixed stderr and never forward the sentinel.

- [ ] **Step 5: Update the bounded monitor**

On close, parse first and then enforce the status/exit pairing. Keep the
existing stream cap, child-error handling, normalized serialization, and
generic fallback. Do not search for JSON or sanitize raw terminal text.

- [ ] **Step 6: Run GREEN and static checks**

```powershell
pnpm exec vitest run tests/dsh-migration/goal-resume.spec.ts
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
git diff --check
```

- [ ] **Step 7: Commit Task 1**

```powershell
git add packages/tianwen-runtime-bundle/src/natural-run-trial.ts `
  packages/tianwen-runtime-bundle/src/resume.ts `
  tests/dsh-migration/goal-resume.spec.ts
git commit -m "feat: report safe natural trial failures"
```

---

## Task 2: Source-owned Skill and Run-binding failure codes

**Files:**
- Modify: `packages/tianwen-runtime/src/learning-intake.ts`
- Modify: `tests/dsh-probe/skill-governance-runtime.spec.ts`

**Interfaces:**
- Consumes: existing `bindRunWithSkill()` ordering and exceptions.
- Produces: an internal `RunSkillBindingError` carrying a closed `code`; existing messages and successful receipt remain compatible.

- [ ] **Step 1: Write the runtime RED**

Extend the existing unresolved/non-model/late tests to assert both current
messages and closed codes:

```ts
await expect(bindUnknown).rejects.toMatchObject({
  code: 'skill-unavailable',
})
await expect(bindNonModel).rejects.toMatchObject({
  code: 'skill-not-model-invocable',
})
await expect(bindLate).rejects.toMatchObject({
  code: 'run-binding-precondition-failed',
})
```

Spy on `recordRunBinding` to throw an Error containing a path/credential-shaped
sentinel and require the rejected object to expose only
`code: 'run-binding-persistence-failed'` as its stable classification while
preserving the original error only as an internal `cause`.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run tests/dsh-probe/skill-governance-runtime.spec.ts
```

Expected: current errors have no closed code.

- [ ] **Step 3: Implement the internal coded error**

Keep it in `learning-intake.ts`; do not export it from the package root or add
a public event.

```ts
type RunSkillBindingFailureCode =
  | 'run-binding-precondition-failed'
  | 'skill-unavailable'
  | 'skill-not-model-invocable'
  | 'run-binding-persistence-failed'

class RunSkillBindingError extends Error {
  constructor(
    readonly code: RunSkillBindingFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'RunSkillBindingError'
  }
}
```

Replace only existing known throws with this class. Map
`prepareRunSkillManifest()` rejection to `run-binding-precondition-failed`;
this includes the existing unsupported-Skill-payload boundary and is not a
persistence claim. Wrap only the two Evolution writes in a narrow `try/catch`
that maps unknown write errors to `run-binding-persistence-failed`; do not wrap
the deliberate coded precondition/Skill errors again. Preserve call order and
Session digest checks.

- [ ] **Step 4: Run GREEN and compatibility gates**

```powershell
pnpm --filter @tianwen/runtime... build
pnpm exec vitest run `
  tests/dsh-probe/skill-governance-runtime.spec.ts `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts
pnpm run typecheck
git diff --check
```

- [ ] **Step 5: Commit Task 2**

```powershell
git add packages/tianwen-runtime/src/learning-intake.ts `
  tests/dsh-probe/skill-governance-runtime.spec.ts
git commit -m "fix: classify governed Run binding failures"
```

---

## Task 3: Natural child emits safe failure facts

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/resume-runner.ts`
- Modify: `tests/dsh-probe/natural-run-evidence-runtime.spec.ts`
- Modify: `tests/dsh-migration/goal-resume.spec.ts`

**Interfaces:**
- Consumes: Task 1 receipt factory/union and Task 2 internal error `code` property.
- Produces: exact pre-Turn failure receipts from the real natural runner; no throw/raw stderr for classified failures.

- [ ] **Step 1: Write the runner RED matrix**

Use the existing scripted harness and spies to cover these reachable failures
without driving the Goal:

- missing required Tianwen service -> `services-unavailable`;
- rejected `ctx.agents.resume()` -> `agent-resume-failed`;
- mismatched Session/Goal or existing Turn -> `session-goal-preflight-failed`;
- absent verifier schema -> `verifier-unavailable`;
- Task 2 codes -> their same receipt codes;
- unknown exception before `ctx.goals.resume()` -> `pre-turn-internal-error`.

For every row assert:

```ts
expect(receipt).toMatchObject({
  status: 'pre-turn-failed',
  goal: { id: expectedGoalId },
  session: { id: expectedSessionId },
  usage: { modelRequests: 0, toolCalls: 0, exactCny: 'unavailable' },
})
expect(adapter.requests).toEqual([])
expect(events.some(event => event.type === 'turn/start')).toBe(false)
```

Inject a sentinel error containing an absolute path and credential-shaped text;
require `JSON.stringify(receipt)` not to contain either sentinel.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts
```

Expected: the runner rejects instead of returning a failure receipt.

- [ ] **Step 3: Implement source-owned classification**

Track the next safe failure code immediately before each pre-Turn operation.
When `bindRunWithSkill()` throws, accept only the four Task 2 codes by exact
membership; all other objects become `pre-turn-internal-error`. Never inspect
`message`, `stack`, or `cause`.

Move manifest revalidation into the classified natural path. Return a failure
receipt only before `ctx.goals.resume()`; existing post-Turn code remains
unchanged. Always dispose a created handle in `finally`.

In `apply()`, print both receipt variants as one JSON line. Exit `0` only for a
settled receipt and `1` for `pre-turn-failed`. The outer rejection handler
continues to emit the existing fixed stderr for an unclassified failure.

- [ ] **Step 4: Prove the full child-parent path**

Extend `goal-resume.spec.ts` so a child-emitted classified failure crosses the
bounded monitor as one normalized JSON line and returns exit `1`; raw sentinel
errors remain absent. Preserve all existing ordinary, partial handoff,
live-smoke, success, overflow, and malformed-output tests.

- [ ] **Step 5: Run GREEN and build gates**

```powershell
pnpm --filter @tianwen/runtime... build
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run `
  tests/dsh-probe/skill-governance-runtime.spec.ts `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts `
  tests/dsh-migration/goal-live-smoke.spec.ts
git diff --check
```

- [ ] **Step 6: Commit Task 3**

```powershell
git add packages/tianwen-runtime-bundle/src/resume-runner.ts `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts
git commit -m "fix: preserve safe natural trial failure facts"
```

---

## Task 4: Permanent public truth and contract

**Files:**
- Modify: `docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md`
- Modify: `tests/contracts/test_public_repository_surface.py`

**Interfaces:**
- Consumes: the approved design and Tasks 1-3 behavior.
- Produces: a public statement that distinguishes the observed unresolved attempt, the new safe failure receipt, and still-unproven natural effectiveness.

- [ ] **Step 1: Write the public-contract RED**

Require the handoff to state all of these facts:

- the first real attempt was pre-Turn, zero Provider, and unresolved;
- classified failure receipts contain only fixed codes/IDs/zero counters;
- raw child output remains suppressed;
- no retry, second Runtime, logger, store, price lookup, budget subsystem,
  Candidate, Evaluation, Shadow, or Promotion was added;
- a future receipt identifies a subsystem, not an underlying library/OS cause.

- [ ] **Step 2: Run RED**

Use only the existing D-drive Python when available:

```powershell
$python = 'D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $python) {
  & $python -m pytest `
    (Resolve-Path 'tests/contracts/test_public_repository_surface.py') -q
  if ($LASTEXITCODE -eq 0) { throw 'public contract unexpectedly passed before the handoff update' }
  Write-Output 'public contract RED confirmed; continue to the minimal handoff update'
} else {
  Write-Output 'local Python gate unavailable; do not install'
}
```

- [ ] **Step 3: Update the handoff minimally**

Do not claim the original root cause is known. Do not publish IDs or paths
from the private operational attempt beyond facts already approved for public
handoff. Keep the installed Profile and credential details out of Git.

- [ ] **Step 4: Run GREEN**

Run the same conditional Python command. If the interpreter is unavailable,
report the local gate as unavailable; exact-main Python CI is mandatory.

- [ ] **Step 5: Commit Task 4**

```powershell
git add docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md `
  tests/contracts/test_public_repository_surface.py
git commit -m "docs: define safe natural trial failure receipts"
```

---

## Task 5: Final local gates, reviews, and feature push

- [ ] **Step 1: Run the final 24-file bearing gate**

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack'
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-stage7-test-fixtures'
pnpm --filter @tianwen/runtime... build
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run `
  tests/dsh-probe/evidence.spec.ts `
  tests/dsh-probe/research-preview-demo.spec.ts `
  tests/dsh-probe/learning-intake.spec.ts `
  tests/dsh-probe/learning-intake-runtime.spec.ts `
  tests/dsh-probe/explicit-correction-demo.spec.ts `
  tests/dsh-probe/outcome-intake.spec.ts `
  tests/dsh-probe/outcome-intake-runtime.spec.ts `
  tests/dsh-probe/repeated-outcome-demo.spec.ts `
  tests/dsh-probe/skill-governance.spec.ts `
  tests/dsh-probe/skill-governance-runtime.spec.ts `
  tests/dsh-probe/governed-skill-candidate-demo.spec.ts `
  tests/dsh-probe/skill-evaluation.spec.ts `
  tests/dsh-probe/skill-evaluation-runtime.spec.ts `
  tests/dsh-probe/paired-skill-evaluation-demo.spec.ts `
  tests/dsh-probe/skill-shadow.spec.ts `
  tests/dsh-probe/skill-shadow-eligibility-demo.spec.ts `
  tests/dsh-probe/skill-promotion.spec.ts `
  tests/dsh-probe/skill-promotion-readiness-demo.spec.ts `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-probe/natural-run-evidence-demo.spec.ts `
  tests/dsh-probe/evolution.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts `
  tests/dsh-migration/runtime-bundle.spec.ts `
  tests/dsh-migration/runtime-composition.spec.ts
```

- [ ] **Step 2: Run all eight zero-cost demos**

```powershell
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
pnpm demo:paired-skill-evaluation
pnpm demo:shadow-eligibility
pnpm demo:promotion-readiness
pnpm demo:natural-run-evidence
```

- [ ] **Step 3: Run static and conditional Python gates**

```powershell
git diff --check
$python = 'D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $python) {
  & $python -c 'import pytest, ruff'
  if ($LASTEXITCODE -ne 0) { throw 'existing Python environment lacks gates' }
  & $python -m ruff check .
  if ($LASTEXITCODE -ne 0) { throw 'Ruff failed' }
  & $python -m pytest `
    (Resolve-Path 'tests/contracts/test_public_repository_surface.py') -q
  if ($LASTEXITCODE -ne 0) { throw 'public repository contract failed' }
} else {
  Write-Output 'local Python gates unavailable; exact-main Python CI required'
}
```

- [ ] **Step 4: Audit resources**

Require fixture roots and worktree `.dsh-probe` to end with zero files/bytes;
one existing `node_modules`; no `.venv`, clone, Profile, Goal, manifest, probe,
install, download, relink, Provider, token, CNY, Docker, or Alpha action. Do not
delete unknown data or shared caches.

- [ ] **Step 5: Complete three reviews**

1. correctness: receipt/status/exit matrix, source-owned codes, Session/Goal
   identity, binding ordering, compatibility;
2. architecture/privacy/DSH: sole Runtime, raw-output suppression, no public
   event or persistence, no old path;
3. Ponytail/YAGNI: sufficient actionable evidence without a generic diagnosis
   platform, and no omission that would force another blind retry.

Fix only proven Critical or reachable Important findings with focused
RED/GREEN, then re-run affected gates and review again.

- [ ] **Step 6: Push and stop**

Require a clean worktree, push the feature once normally, and verify local,
tracking, and `git ls-remote` exact equality. Stop before main merge and report
the exact SHA, commit sequence, file scope, tests, reviews, and zero-resource
audit.

---

## Task 6: Mainline integration and exact-SHA CI (supervisor release only)

Only after the supervisor independently accepts the exact feature SHA:

- [ ] require feature/main worktrees clean and main still at the approved parent;
- [ ] merge the exact feature once with `--no-ff`, no merge-only fix;
- [ ] prove merge tree equals the reviewed feature tree;
- [ ] run `git diff --check` and push main once normally, never force;
- [ ] locate the unique automatic CI run for the exact main SHA;
- [ ] require Python and TypeScript jobs completed/success;
- [ ] require runtime/runtime-bundle builds, typecheck, DSH closure,
  no-private-import, focused natural tests, and natural demo success;
- [ ] on failure, collect only the failing job log and stop without rerun or
  speculative patching.

No product installation or natural Goal run occurs in Task 6.

---

## Task 7: One new natural-trial attempt (supervisor operational release only)

This task is authorized only after exact-main CI success and a fresh supervisor
review of the installed product state.

- [ ] install the exact main Runtime Bundle once through the existing official
  offline installer and D-drive pnpm store; no manual deploy or second call;
- [ ] require current rc.7/ready receipt, byte-identical Session/Evolution
  snapshots across installation, zero backup residue, and zero downloads;
- [ ] revalidate the unchanged Goal/manifest/Skill/verifier/credential-presence
  facts without reading protected content;
- [ ] confirm the attempt remains clearly within the existing cumulative 60 CNY
  external authorization; do not query prices or build a budget subsystem;
- [ ] select the configured model once, invoke the same Goal/manifest once,
  restore the previous model once in `finally`, and never retry;
- [ ] accept and report exactly one of: settled receipt, safe pre-Turn failure
  receipt, or generic boundary failure;
- [ ] if the receipt names a subsystem, investigate only that subsystem before
  any code change; the code is not itself proof of the underlying OS/library
  cause;
- [ ] report DSH-observed usage and `exactCny=unavailable` without a billing
  receipt; do not manufacture a recurrence, Ticket, Candidate, Evaluation,
  Shadow, or Promotion.
