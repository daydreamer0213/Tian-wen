# Tianwen Goal Status and Governed Ledger Coexistence Implementation Plan

> **For Codex:** I'm using the writing-plans skill to create the implementation
> plan. Execute this plan with `executing-plans`, `test-driven-development`,
> `verification-before-completion`, and Ponytail. Do not skip RED evidence.

**Goal:** Make the existing read-only Goal status command validate legal
private governed events through the authoritative Evolution replay while
returning only the unchanged Champion projection.

**Architecture:** Add one narrow `@tianwen/evolution/inspection` subpath. Its
internal inspection mode reuses the full ledger parser and semantic replay but
does no directory creation, Artifact source verification, pointer repair, or
write. Status removes its duplicate ledger parser and consumes only
`ChampionPointer | null`.

**Baseline:** `main` must remain exactly
`9503ead13fd4813718a30b3cf1cf159b0ea5f302` until supervisor-authorized
integration.

**Design:**
`docs/superpowers/specs/2026-08-22-tianwen-goal-status-ledger-coexistence-design.md`

## Global constraints

- Implementation starts only from an exact reviewed design+plan SHA supplied
  by the supervisor as `TIANWEN_PLAN_SHA`. Missing or mismatched authority is a
  stop condition; do not hard-code this plan's future commit SHA into itself.
- Reuse the existing D-drive implementation worktree and its single
  `node_modules`. Do not create a clone, second implementation worktree,
  `node_modules`, `.venv`, Profile, or probe.
- Use the existing D-drive Corepack/pnpm store and set
  `pnpm_config_verify_deps_before_run=false`. Do not download or install an
  external dependency. The sole permitted dependency mutation is one filtered,
  offline, scripts-disabled refresh of the new direct workspace link after its
  package and lock declarations exist; do not create another `node_modules` or
  hand-build a junction.
- Do not touch the dirty legacy Alpha worktree. Do not run product installer,
  Goal create/resume, model selection, Provider, Docker, or Alpha.
- The completed natural Goal is evidence and must never be replayed.
- Keep the public eight-event allowlist and `tianwen.goal-status.v1` schema
  exact. Do not add a failure code, event, ledger, store, Runtime service,
  logger, telemetry, repair, retry, or concurrency framework.
- A workspace-only direct development dependency and its importer-only lock
  change are allowed. Any registry resolution or download is a stop condition.
- Unknown fixture data is reported and left untouched.

## Workspace setup and baseline

1. Set the supervisor-provided reviewed SHA:

   ```powershell
   if ([string]::IsNullOrWhiteSpace($env:TIANWEN_PLAN_SHA)) {
     throw 'TIANWEN_PLAN_SHA is required'
   }
   $mainSha = '9503ead13fd4813718a30b3cf1cf159b0ea5f302'
   $designBranch = 'codex/tianwen-status-ledger-coexistence-design'
   $implementationRoot = 'D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake'
   $mainRoot = 'D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge'
   $fixtureRoot = 'D:\DevData\tianwen-goal-status-tests'
   $evolutionFixtureRoot = 'D:\DevData\tianwen-stage7-test-fixtures'
   $python = 'D:\DevData\tianwen-ci-py312-env\Scripts\python.exe'
   $env:TIANWEN_DSH_PROBE_ROOT = $evolutionFixtureRoot
   $env:pnpm_config_verify_deps_before_run = 'false'
   ```

2. Read the canonical design and this plan completely. Read and obey:

   - `docs/superpowers/specs/2026-08-16-tianwen-read-only-goal-status-design.md`
   - `docs/operations/tianwen-read-only-goal-status-handoff.md`
   - `docs/superpowers/specs/2026-08-21-tianwen-natural-run-evidence-trial-design.md`
   - `docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md`
   - `packages/tianwen-runtime-bundle/src/status.ts`
   - `packages/tianwen-evolution/src/ledger.ts`
   - `packages/tianwen-evolution/src/runtime-binding.ts`
   - `packages/tianwen-evolution/src/index.ts`
   - `packages/tianwen-evolution/package.json`
   - `packages/tianwen-runtime-bundle/package.json`
   - `tests/dsh-probe/evolution.spec.ts`
   - `tests/dsh-migration/goal-status.spec.ts`
   - `tests/dsh-migration/runtime-bundle.spec.ts`
   - `.github/workflows/ci.yml`
   - `tests/contracts/test_public_repository_surface.py`

3. Verify without fetch/rebase/reset/stash:

   ```powershell
   git -C $mainRoot status --short
   git -C $mainRoot rev-parse HEAD
   git -C $mainRoot rev-parse '@{upstream}'
   git -C $mainRoot ls-remote origin refs/heads/main

   git -C $implementationRoot status --short
   git -C $implementationRoot rev-parse "refs/heads/$designBranch"
   git -C $implementationRoot rev-parse "refs/remotes/origin/$designBranch"
   git -C $implementationRoot ls-remote origin "refs/heads/$designBranch"
   git -C $implementationRoot rev-parse $env:TIANWEN_PLAN_SHA
   git -C $implementationRoot merge-base --is-ancestor `
     $mainSha $env:TIANWEN_PLAN_SHA
   git -C $implementationRoot show `
     "$env:TIANWEN_PLAN_SHA`:docs/superpowers/specs/2026-08-22-tianwen-goal-status-ledger-coexistence-design.md" `
     | Out-Null
   git -C $implementationRoot show `
     "$env:TIANWEN_PLAN_SHA`:docs/superpowers/plans/2026-08-22-tianwen-goal-status-ledger-coexistence.md" `
     | Out-Null
   ```

   Expected: main local/tracking/remote are the exact baseline; design
   local/tracking/remote all equal `TIANWEN_PLAN_SHA`; both worktrees are clean;
   the reviewed SHA descends from the baseline and contains both canonical
   documents.

4. Create `codex/tianwen-status-ledger-coexistence` exactly from
   `TIANWEN_PLAN_SHA`. If the branch already exists at a different SHA, stop.

5. Verify the existing `node_modules` and D-drive pnpm store without modifying
   them. Record `.modules.yaml` size and modification time. Inspect
   `$fixtureRoot` and `$evolutionFixtureRoot`; each must be absent or contain
   zero regular files and zero bytes. Unknown files are a stop condition and
   must not be deleted.

   Set the conditional Python gate only after verifying both the executable and
   its existing pytest/Ruff modules:

   ```powershell
   $pythonAvailable = Test-Path -LiteralPath $python -PathType Leaf
   if ($pythonAvailable) {
     & $python -c 'import pytest, ruff'
     if ($LASTEXITCODE -ne 0) {
       $pythonAvailable = $false
       Write-Output 'Python pytest/Ruff local-unavailable; exact-main CI bears it'
     }
   } else {
     Write-Output 'Python executable local-unavailable; exact-main CI bears it'
   }
   ```

   Do not create or modify a Python environment and do not install a module.

6. Run the fresh baseline gates:

   ```powershell
   pnpm --filter @tianwen/runtime-bundle... build
   pnpm exec vitest run `
     tests/dsh-probe/evolution.spec.ts `
     tests/dsh-migration/goal-status.spec.ts `
     tests/dsh-migration/runtime-bundle.spec.ts
   pnpm run typecheck
   pnpm run check:dsh-install
   pnpm run check:no-private-dsh-imports
   git diff --check
   ```

   Expected: all baseline gates pass. Do not reinterpret unrelated failure as
   RED for this feature.

## Task 1: Add the authoritative Champion-only inspection seam

**Files:**

- Create: `packages/tianwen-evolution/src/inspection.ts`
- Modify: `packages/tianwen-evolution/src/ledger.ts`
- Modify: `packages/tianwen-evolution/package.json`
- Modify: `tests/dsh-migration/goal-status.spec.ts`

### Step 1: Write the bearing RED

Add tests that generate valid events through the real `EvolutionLedger`
methods, then inspect the resulting root through the missing public inspection
entry. Cover:

1. the real four-event private natural-Run sequence with no Champion projects
   `champion: null`;
2. no `artifacts` directory is created or restored by inspection;
3. an absent Evolution root remains absent and returns `null`;
4. valid legacy Champion authority returns the exact pointer;
5. missing/stale/mismatched pointer is rejected without repair;
6. unknown event, malformed private event, and a broken private reference chain
   are rejected;
7. paths and bytes are identical before/after every success and failure.

Use existing input preparers and ledger methods for the principal private-event
case. Because that mutable fixture producer creates an empty `artifacts`
directory, first assert that the controlled fixture directory contains zero
entries, remove only that confirmed-empty fixture directory, and take the
before snapshot after removal. The inspection GREEN must leave it absent.
Hand-edited JSON is allowed only for corruption cases. Never delete unknown
fixture content.

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/goal-status.spec.ts
```

Expected RED: the inspection subpath/function is absent. Preserve the exact
failure output in the implementation report.

### Step 2: Implement the smallest GREEN

In `ledger.ts`:

- add one internal constructor mode such as `mode: 'mutation' | 'inspection'`;
- keep `mutation` as the default and preserve its current behavior exactly;
- in `inspection`, skip `mkdirSync(artifacts)` and Artifact source verification;
- run the existing `#replay()` unchanged;
- parameterize pointer verification so inspection rejects missing/stale
  derived pointers instead of calling `#writePointer()`;
- return only a cloned Champion pointer or `null` from the narrow inspector;
- never return the internal ledger instance.

Do not split out or copy `parseEvent`, `#validateAgainstState`, or `#apply`. Do
not add a second parser, public read-only ledger class, mutation guard framework,
or repair mode.

Create `inspection.ts` as the public narrow facade. Export only the inspection
function/result and integrity error needed by its consumer. Add only the
`./inspection` package export.

### Step 3: Prove GREEN and compatibility

```powershell
pnpm --filter @tianwen/evolution build
pnpm exec vitest run `
  tests/dsh-probe/evolution.spec.ts `
  tests/dsh-migration/goal-status.spec.ts
pnpm run typecheck
git diff --check
```

Expected: inspection tests pass; existing mutable pointer-repair and Artifact
source tests remain green; there are no writes in inspection cases.

### Step 4: Commit

```powershell
git add `
  packages/tianwen-evolution/src/inspection.ts `
  packages/tianwen-evolution/src/ledger.ts `
  packages/tianwen-evolution/package.json `
  tests/dsh-migration/goal-status.spec.ts
git commit -m "feat: inspect governed ledger without mutation"
```

## Task 2: Replace the status parser with the shared inspection

**Files:**

- Modify: `packages/tianwen-runtime-bundle/src/status.ts`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tests/dsh-migration/goal-status.spec.ts`

### Step 1: Write the real coexistence RED

Extend the existing persisted Goal fixture. Generate the exact four private
natural-Run events through `EvolutionLedger` and assert:

- `readGoalStatus()` returns the unchanged schema with `champion: null`;
- the CLI JSON contains no private event type, Skill content, Run payload, or
  path;
- the complete data tree is byte-identical.

Add a second case with valid private events interleaved with a legacy Artifact,
Evaluation, Approval, and Promotion history. It must return the exact Champion.
Add corrupt-private, unknown-event, and pointer-mismatch cases that throw only
`GoalStatusIntegrityError` and leave state unchanged.

Run before changing `status.ts`:

```powershell
pnpm exec vitest run tests/dsh-migration/goal-status.spec.ts
```

Expected RED: current `canonicalLines()` rejects the first legal
`run-binding-recorded` event.

### Step 2: Delete the duplicate parser and use the inspector

Import only `@tianwen/evolution/inspection`. Remove the local Evolution event
constants, canonical ledger reader, event schemas, semantic maps, and
`readChampion()` implementation. Call the inspector and copy only its Champion
projection.

Map `LedgerIntegrityError` to a fixed `GoalStatusIntegrityError` without
including its message or private facts. Preserve existing not-found,
ambiguous, Session/Evidence, CLI, and output schemas exactly.

Add only `@tianwen/evolution: workspace:*` to Runtime Bundle
`devDependencies`, add the existing compat runtime alias to the status and CLI
esbuild commands, and update only the Runtime Bundle workspace importer in
`pnpm-lock.yaml`. The CLI also bundles the status consumer, so omitting the
alias there is a real startup failure. Task 3 replaces both provisional aliases
with the single-symbol Skill-name seam after its metafile RED proves that the
broader runtime subpath also carries `ScriptedAdapter`. Run one lockfile-only
refresh and then, only if the direct workspace link is absent, one filtered
link refresh:

```powershell
pnpm install --lockfile-only --offline --ignore-scripts
if (-not (Test-Path -LiteralPath `
  'packages/tianwen-runtime-bundle/node_modules/@tianwen/evolution')) {
  pnpm --filter @tianwen/runtime-bundle install `
    --offline --frozen-lockfile --ignore-scripts
}
```

Stop if the lock diff changes beyond that importer, an external package is
added, scripts run, or a download is indicated. Record the one workspace link
and `.modules.yaml` metadata change if the filtered refresh was necessary.

### Step 3: Prove GREEN

```powershell
pnpm --filter @tianwen/runtime-bundle... build
pnpm exec vitest run `
  tests/dsh-probe/evolution.spec.ts `
  tests/dsh-migration/goal-status.spec.ts
pnpm run typecheck
git diff --check
```

Expected: private and legacy facts coexist; corrupt/unknown facts fail closed;
all read-only snapshots remain equal.

### Step 4: Commit

```powershell
git add `
  packages/tianwen-runtime-bundle/src/status.ts `
  packages/tianwen-runtime-bundle/package.json `
  pnpm-lock.yaml `
  tests/dsh-migration/goal-status.spec.ts
git commit -m "fix: read governed events in Goal status"
```

## Task 3: Close packaging, CI, and permanent documentation truth

**Files:**

- Create: `packages/tianwen-dsh-compat/src/skill-name.ts`
- Modify: `packages/tianwen-dsh-compat/package.json`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `tests/dsh-migration/goal-status.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/contracts/test_public_repository_surface.py`
- Modify: `docs/superpowers/specs/2026-08-16-tianwen-read-only-goal-status-design.md`
- Modify: `docs/operations/tianwen-read-only-goal-status-handoff.md`

### Step 1: Capture the stale bundle-contract RED

Before editing the package tests, run:

```powershell
pnpm exec vitest run tests/dsh-migration/runtime-bundle.spec.ts
```

Expected RED: its old status input/external allowlist rejects the new, already
built authoritative inspection closure. The observed closure also contains
`../tianwen-dsh-compat/dist/scripted-adapter.js` and the Stage 4 scripted
provider because `@tianwen/dsh-compat/runtime` statically re-exports
`ScriptedAdapter`. Record both exact mismatches; do not weaken the allowlist.

### Step 2: Update exact package and CI contracts

First add one single-purpose public compat subpath:

- `skill-name.ts` re-exports only `isSkillName` from
  `@deepseek-ai/dsh-skill`;
- package exports add only `./skill-name`; no dependency or lockfile changes;
- the status and CLI build aliases both change from
  `@tianwen/dsh-compat/runtime` to `@tianwen/dsh-compat/skill-name`;
- the Runtime bundle retains its existing `@tianwen/dsh-compat/runtime` alias
  unchanged.

Then update the existing exact contracts:

- the already implemented Runtime Bundle declaration and status build are
  locked to direct `@tianwen/evolution: workspace:*`, the Evolution inspection
  subpath, and the single-symbol `@tianwen/dsh-compat/skill-name` alias;
- status metafile inputs are an exact allowlist of status, Evidence projector,
  inspection, authoritative ledger/replay inputs, and narrow Skill-name compat;
- Evolution `index`, `runtime-binding`, Skill shadow/promotion, Tianwen Runtime,
  Dynamic Cordis, Agent, Provider, scripted adapter, test harness, probe, native
  addon, and private DSH source are absent;
- the new compat subpath compiles and resolves only `isSkillName`; it exports no
  render helper, `ScriptedAdapter`, or other value, and the status/CLI metafiles
  contain no scripted-adapter implementation, `dsh-tool-skill`, test harness,
  probe, Provider factory, or request path;
- the authoritative private-event validator may retain its closed historical
  provider/evidence enum literal. That literal is not executable Provider code
  and remains private: the status schema and serialized output must never
  project it or any governed event fact;
- external package paths are exact and deduplicated;
- the TypeScript focused Vitest command includes
  `tests/dsh-migration/goal-status.spec.ts`;
- the existing Python public contract permanently locks that path into the
  same TypeScript step.

The goal-status spec must carry the status metafile privacy assertion so the
exact-main focused CI bears it. Keep the comprehensive local package assertion
in `runtime-bundle.spec.ts`; do not add its archive-dependent whole file to
Ubuntu CI.

Run the TypeScript contracts. They must now pass against the Task 2 product
tree:

```powershell
pnpm exec vitest run `
  tests/dsh-migration/goal-status.spec.ts `
  tests/dsh-migration/runtime-bundle.spec.ts
```

Then extend the Python public contract with the exact Goal-status focused-spec
path and run it before changing the workflow:

```powershell
if ($pythonAvailable) {
  & $python -m pytest tests/contracts/test_public_repository_surface.py -q
  if ($LASTEXITCODE -eq 0) {
    throw 'public contract unexpectedly passed before CI contract update'
  }
} else {
  Write-Output 'Python public contract local-unavailable; exact-main CI bears it'
}
```

Expected RED: the current workflow lacks the Goal-status path. Record the exact
assertion. Do not count an unavailable Python interpreter as RED; exact-main CI
will bear that gate.

### Step 3: Make the mechanical CI change

- append the existing Goal-status spec path to the existing TypeScript focused
  Vitest command; add no CI job or step.

### Step 4: Update only permanent truth

Correct the old Goal status design and handoff: status now delegates all event
shape/reference replay to the Champion-only Evolution inspector, never repairs
or verifies Artifact source, and never exposes private facts. Do not rewrite
historical Stage 1-7 plans or claim that the completed natural Run was replayed.

### Step 5: Prove GREEN

```powershell
pnpm --filter @tianwen/runtime-bundle... build
pnpm exec vitest run `
  tests/dsh-probe/evolution.spec.ts `
  tests/dsh-migration/goal-status.spec.ts `
  tests/dsh-migration/runtime-bundle.spec.ts
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
if ($pythonAvailable) {
  & $python -m pytest tests/contracts/test_public_repository_surface.py -q
  if ($LASTEXITCODE -ne 0) { throw 'public contract failed' }
  & $python -m ruff check .
  if ($LASTEXITCODE -ne 0) { throw 'Ruff failed' }
}
git diff --check
```

Expected: all available gates pass; metafile and serialized outputs contain no
private payload or forbidden module.

### Step 6: Commit

```powershell
git add `
  tests/dsh-migration/runtime-bundle.spec.ts `
  tests/dsh-migration/goal-status.spec.ts `
  .github/workflows/ci.yml `
  tests/contracts/test_public_repository_surface.py `
  docs/superpowers/specs/2026-08-16-tianwen-read-only-goal-status-design.md `
  docs/operations/tianwen-read-only-goal-status-handoff.md
git commit -m "test: carry governed status inspection in CI"
```

## Task 4: Final bearing gates, reviews, and feature push

### Step 1: Run the exact final code gates

Run fresh, serially, and stop on the first failure:

```powershell
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run `
  tests/dsh-probe/evolution.spec.ts `
  tests/dsh-migration/goal-status.spec.ts `
  tests/dsh-migration/runtime-bundle.spec.ts
```

Then run the exact current main focused Vitest command, now including the two
status-bearing specs:

```powershell
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/repeated-outcome-demo.spec.ts tests/dsh-probe/skill-governance.spec.ts tests/dsh-probe/skill-governance-runtime.spec.ts tests/dsh-probe/governed-skill-candidate-demo.spec.ts tests/dsh-probe/skill-evaluation.spec.ts tests/dsh-probe/skill-evaluation-runtime.spec.ts tests/dsh-probe/paired-skill-evaluation-demo.spec.ts tests/dsh-probe/skill-shadow.spec.ts tests/dsh-probe/skill-shadow-eligibility-demo.spec.ts tests/dsh-probe/skill-promotion.spec.ts tests/dsh-probe/skill-promotion-readiness-demo.spec.ts tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/natural-run-evidence-demo.spec.ts tests/dsh-migration/goal-status.spec.ts
```

Run all eight existing demos unchanged:

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

Conditionally reuse the existing D-drive Python interpreter for the public
contract and Ruff. Do not run bare `uv`, install Python, or create a venv.

### Step 2: Audit resources and scope

Require:

- `D:\DevData\tianwen-goal-status-tests` and
  `D:\DevData\tianwen-stage7-test-fixtures`: zero regular files and zero bytes;
- no `.dsh-probe`, `.venv`, new `node_modules`, Profile, or probe;
- `.modules.yaml` unchanged unless the single approved workspace-link refresh
  was necessary; if it changed, record its before/after metadata and prove that
  only `@tianwen/evolution` was linked into the existing Runtime Bundle
  `node_modules` with no external package/store change;
- no network/download/external install, Provider/model request, Docker, Alpha,
  or product-data access;
- diff limited to the approved planned file list;
- public eight-event allowlist unchanged;
- no private event string or payload in public status output.

Run `git diff --check` and require a clean staged/committed worktree.

### Step 3: Perform three read-only reviews

Review the exact implementation HEAD against the reviewed design+plan:

1. **Correctness/replay:** full private/public parse, semantic chain failures,
   pointer authority, mutation-mode compatibility, zero-write status behavior.
2. **Architecture/privacy/DSH:** sole ledger authority, unchanged public event
   projection/status schema, no repair/source read/private leak, exact bundle
   closure.
3. **Ponytail/YAGNI:** no second parser, pass-through adapter, query framework,
   public read-only ledger object, dependency inflation, or speculative
   concurrency work.

Only verified reachable Critical or Important findings may change code. Each
fix requires its own RED, minimal GREEN, focused rerun, and re-review. Report
Minor findings without expanding scope.

### Step 4: Push once and stop

```powershell
git status --short
git push -u origin codex/tianwen-status-ledger-coexistence
git rev-parse HEAD
git rev-parse '@{upstream}'
git ls-remote origin refs/heads/codex/tianwen-status-ledger-coexistence
git status --short
```

Require local/tracking/remote exact equality and a clean worktree. Send the
supervisor a structured report with exact HEAD, commit sequence, file list,
RED/GREEN evidence, gates, three reviews, resource audit, and the sole next
entry. Stop before main integration.

## Task 5: Supervisor-only mainline integration and exact-main CI

This task is not authorized by implementation Tasks 1-4. After independent
supervisor review of an exact feature SHA:

1. verify main local/tracking/remote still equal the required parent and both
   worktrees are clean;
2. perform exactly one `git merge --no-ff` with no merge-only fix;
3. require merge tree equals approved feature tree and diff-check passes;
4. push main once, non-force;
5. wait for the unique automatic `push` CI whose `head_sha` equals the merge;
6. require Python, TypeScript, and installer-windows success;
7. confirm TypeScript's focused step actually ran the Goal-status spec plus all
   eight existing demos;
8. on failure, collect only narrow safe evidence and stop without rerun or
   patch.

## Task 6: Separately authorized read-only operational proof

Only after exact-main CI success and a new supervisor authorization may an
operator install the exact Runtime Bundle once and run `tianwen status` once
against the already completed natural Goal. The operation must snapshot
Session/Evolution paths and bytes before and after and prove exact equality.

It must not resume that Goal, create a Goal/manifest, select a model, call a
Provider, repair state, or enter Candidate/Evaluation/Shadow/Promotion. A
canonical status success may demonstrate coexistence; it is not a new natural
Run or efficacy claim.

## Final self-review checklist

- [ ] `TIANWEN_PLAN_SHA` is supervisor-supplied; the plan does not require its
      own branch to equal an ancestor that predates the plan.
- [ ] The principal RED uses real ledger methods and all four private natural
      events.
- [ ] The inspector reuses full parser/semantic replay and returns only
      Champion/null.
- [ ] Inspection performs no mkdir, Artifact source read, pointer repair, temp
      write, append, or mutable-object escape.
- [ ] Mutation constructor replay/source/repair behavior is unchanged.
- [ ] Unknown/malformed/reference-corrupt private events fail closed.
- [ ] Public eight-event `LedgerEvent`, `listEvents()`, and status schema remain
      unchanged.
- [ ] Status maps integrity failure without raw cause text or private payload.
- [ ] Bundle inputs exclude Evolution root/runtime-binding, Runtime services,
      Dynamic Cordis, Agent/Provider, compat root, scripted adapter, harness,
      probe, and private DSH source.
- [ ] Workspace dependency/lock changes require zero external download.
- [ ] Exact-main CI carries the Goal-status inspection/status contract, while
      the broader Evolution suite remains a fresh local compatibility gate.
- [ ] No generic query/ledger/repair/logger/retry/concurrency/price framework.
- [ ] The completed Goal is never resumed.
- [ ] No TODO, TBD, placeholder SHA, personal path, or unsupported success
      claim remains.

Expected review result before implementation release: Critical 0, Important 0;
Ready only when every item above is mechanically executable from the exact
reviewed design+plan SHA.
