# Tianwen Governed Skill Promotion Readiness Implementation Plan

> **Execution mode:** execute this plan in the existing D-drive implementation
> worktree with TDD, independent correctness review, architecture/privacy/DSH
> review, Ponytail/YAGNI review, and an explicit supervisor checkpoint before
> mainline integration.

**Goal:** Implement the honest Stage 6 slice: consume the real Stage 5 Shadow
eligibility receipt, make the Promotion readiness firewall explicit, and prove
the current repository correctly returns `no-promotion-readiness` without
creating a pointer, Promotion, rollback, or ordinary Candidate route.

**Architecture:** Add one pure reducer to `@tianwen/evolution` and one zero-cost
demo composed over the existing Stage 5 safe summary. Do not add a runtime
service, ledger event, Active Pointer, assignment, Agent runner, Skill
registration, approval engine, store, or old Dynamic/Champion bridge.

**Canonical design:**
`docs/superpowers/specs/2026-08-21-tianwen-governed-skill-promotion-readiness-design.md`
at exact design commit `c8e0d2c27b1ac785b249be32bd8343cf170dbd35`.

**Execution baseline:** this plan must be committed and normally pushed before
execution. The supervisor supplies the resulting exact design+plan branch HEAD
in the formal execution order. The executor must verify local, tracking and
remote equality for that SHA and create the implementation branch only from
that commit. If no exact supervisor-recorded plan HEAD exists, Workspace Setup
stops; the executor must not infer a moving branch tip.

**Stack:** TypeScript, Vitest, existing DSH `0.1.0-rc.7`, existing Tianwen
Evolution package, existing Stage 5 demo, pnpm. No new dependency.

---

## Non-negotiable boundary

- DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- The current Stage 5 result is `no-eligible-shadow`; do not add a flag, cast,
  test-only production branch, caller boolean, or fixture that converts it into
  Shadow or Promotion evidence.
- Stage 6 adds no Agent/Session create or resume code, Candidate registration,
  Skill loading, Run assignment, routing, or pointer lookup.
- Add no ledger event, pointer file, status row, database, queue, worker,
  scheduler, lock service, runtime service, approval inbox/UI, permission
  system, or second store.
- Do not import or call old `ArtifactVersion`, legacy Evaluation/Approval,
  Dynamic Cordis, global Champion, `promote()`, `rollback()`,
  `rehydrateChampion()`, or `champion.json` paths.
- DSH ordinary-Run Approval/permissions are not a cross-Run Promotion receipt.
  Do not fabricate an Agent Turn or tool call to obtain one.
- The user's 60 CNY development budget is not Promotion authorization and is
  not evidence that C is ready.
- Do not manufacture natural Shadow, five successful Runs, an Active Pointer,
  a human governance receipt, a rollback Signal, or a positive readiness
  result.
- Python Alpha, RepoTaskRuntime, AlphaRuntime, Provider, paid models, Docker,
  live Alpha, and runtime-profile remain unused.
- The feature branch may be pushed normally after review. Main merge and exact
  CI require the supervisor's explicit Task 6 release.

## Workspace setup and baseline stop condition

Use only:

- implementation worktree:
  `D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake`;
- existing worktree-local `node_modules`;
- existing shared store/cache under `D:\DevData`;
- dedicated Stage 6 fixture root:
  `D:\DevData\tianwen-stage6-test-fixtures` for local Windows execution. Linux
  CI may use the repository's existing ephemeral `.dsh-probe` default.

Do not create another clone, implementation worktree, `node_modules`, `.venv`,
DSH Profile, or disposable probe. Do not install or refresh dependencies.

Before Task 1:

1. verify the supervisor-recorded exact design+plan HEAD exists and the
   canonical branch local/tracking/remote all equal it, then read the design
   and plan completely; stop if the formal execution order did not provide the
   exact SHA;
2. verify `main` local/tracking/remote is exact Stage 5 green SHA
   `90533433fc29d903b2142f61d5f32d64c7c3d762`;
3. switch the existing implementation worktree to a new branch
   `codex/tianwen-skill-promotion-readiness` from the canonical design/plan
   HEAD;
4. require a clean tracked worktree and existing
   `node_modules/.modules.yaml`;
5. before running tests, read the dedicated Stage 6 fixture root and require
   zero files/zero bytes; if unknown data exists, stop without deleting it;
6. do not install dependencies;
7. run the repository's clean-build order and current 17-file bearing gate:

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack'
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-stage6-test-fixtures'
pnpm --filter @tianwen/runtime... build
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
  tests/dsh-probe/evolution.spec.ts
```

Any pre-existing failure is a stop condition. Record the exact failure and do
not weaken tests or create a second environment. Building runtime declarations
before full typecheck is the existing clean-build order, not a reason to change
the typecheck architecture.

---

## Task 1: Add the pure Promotion readiness firewall

**Files:**

- Create: `packages/tianwen-evolution/src/skill-promotion.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Create: `tests/dsh-probe/skill-promotion.spec.ts`

### RED

Write the public contract first. It must prove:

1. a real-shaped Stage 5 `no-eligible-shadow` receipt returns:

```text
decision=no-promotion-readiness
reasons=[shadow-not-eligible]
```

2. a type-correct synthetic `eligible-for-shadow` receipt still returns:

```text
decision=no-promotion-readiness
reasons=[shadow-stability-evidence-absent]
```

3. exact input objects remain unchanged;
4. there is no `ready`, `promoted`, pointer, approval, or free-form reason
   branch in the exported current result;
5. serialized output contains only the Evaluation ID and closed enums.

Confirm RED because the module and package-root export do not exist.

### GREEN

Implement only:

```ts
export type SkillPromotionReadinessInput = SkillShadowEligibility

export type SkillPromotionReadinessReason =
  | 'shadow-not-eligible'
  | 'shadow-stability-evidence-absent'

export interface SkillPromotionReadiness {
  readonly decision: 'no-promotion-readiness'
  readonly evaluationId: SkillEvaluationId
  readonly reasons: readonly SkillPromotionReadinessReason[]
}

export function assessSkillPromotionReadiness(
  input: SkillPromotionReadinessInput,
): SkillPromotionReadiness
```

Use one direct branch:

- `no-eligible-shadow` → `shadow-not-eligible`;
- otherwise → `shadow-stability-evidence-absent`.

Do not add a positive readiness state, optional caller override, parser, class,
I/O, event, service, store, or future Shadow schema. Export the function and
types explicitly from the package root. Do not change
`PUBLIC_LEDGER_EVENT_TYPES` or `LedgerEvent`.

Run:

```powershell
pnpm exec vitest run tests/dsh-probe/skill-promotion.spec.ts
pnpm --filter @tianwen/evolution... build
pnpm run typecheck
git diff --check
```

### Commit

```text
feat: assess governed Skill promotion readiness
```

---

## Task 2: Prove the real no-promotion path end to end

**Files:**

- Create: `scripts/run-skill-promotion-readiness-demo.ts`
- Create: `tests/dsh-probe/skill-promotion-readiness-demo.spec.ts`
- Modify: `package.json`

### RED

Write the composed demo contract first. It must require exactly one safe JSON
summary with:

```text
schemaVersion=tianwen.skill-promotion-readiness-demo.v1
shadow.evaluationId=evaluation:<digest>
shadow.decision=no-eligible-shadow
shadow.ordinaryRunsRouted=0
shadow.qualifiedNaturalRuns=0
promotion.decision=no-promotion-readiness
promotion.reasons=[shadow-not-eligible]
promotion.naturalShadowOpened=false
promotion.qualifiedNaturalRuns=0
promotion.activePointerCreated=false
promotion.candidatePromoted=false
promotion.rollbackExecuted=false
promotion.legacyChampionChanged=false
stage6Incremental.agents=0
stage6Incremental.sessions=0
stage6Incremental.runs=0
stage6Incremental.ledgerEvents=0
stage6Incremental.registryMutations=0
stage6Incremental.pointers=0
stage6Incremental.promotions=0
stage6Incremental.rollbacks=0
cost.network/providerRequests/paidTokens/cny/docker/userData=0
```

Require the output to report the existing Stage 4 mechanism counts and Stage 5
incremental block honestly. Do not claim the whole composed demo creates zero
Agents/Sessions, because Stage 5 deliberately reuses the Stage 4 mechanism
fixture before the Stage 6 reducer runs.

Also require serialized output to exclude Candidate/Skill bodies, prompts,
user/feedback/tool/model text, filesystem paths, URLs, Provider configuration,
credentials, and user data.

Confirm RED because the script and package command do not exist.

### GREEN

Call `runSkillShadowEligibilityDemo()` exactly once. Reconstruct only the
existing safe `SkillShadowEligibility` receipt from:

- `evaluation.evaluationId`;
- `shadow.decision`;
- `shadow.reasons`;
- the existing fixed freshness reason when present.

Pass that receipt to `assessSkillPromotionReadiness()` once. Do not copy a
Candidate, Evaluation plan, Session event, or temporary ledger fixture.

The Stage 6 script must not import or call Runtime application, Agent, Session,
Skill registry, ledger, Artifact, Dynamic Cordis, Champion, Provider, approval,
filesystem persistence, or pointer APIs. Its zero counters describe only work
after the Stage 5 safe summary exists.

Add:

```json
"demo:promotion-readiness": "tsx scripts/run-skill-promotion-readiness-demo.ts"
```

Run the focused spec, execute the command directly, require one JSON object,
and run diff-check.

### Commit

```text
test: prove ineligible Shadow cannot reach Promotion
```

---

## Task 3: Put the Stage 6 firewall in zero-paid CI

**Files:**

- Modify: `.github/workflows/ci.yml`

### RED

Use a one-time static contract to require both:

1. `tests/dsh-probe/skill-promotion.spec.ts` and
   `tests/dsh-probe/skill-promotion-readiness-demo.spec.ts` appear in the
   existing explicit focused Vitest command;
2. `pnpm demo:promotion-readiness` appears once after
   `pnpm demo:shadow-eligibility`.

Confirm RED against the current workflow.

### GREEN

Append only the two new spec paths to the existing focused Vitest command and
append one demo step. Do not add or reorder jobs, secrets, permissions,
services, Docker, artifacts, coverage, matrix builds, dependencies, caches, or
release actions.

Run the same static contract, the two new specs, the direct demo, and
diff-check.

### Commit

```text
ci: verify Skill promotion readiness refusal
```

---

## Task 4: Publish the Stage 6 evidence boundary

**Files:**

- Create:
  `docs/operations/tianwen-stage6-skill-promotion-readiness-handoff.md`
- Modify: `tests/contracts/test_public_repository_surface.py`

Do not change README claims to say Shadow, Promotion, Active Pointer, or
Rollback is implemented.

### RED

Extend the public contract to require the handoff to state:

- DSH rc.7 remains the only product Agent Runtime;
- Stage 6 implements only the pure Promotion readiness refusal slice;
- the actual result is `no-promotion-readiness` because Stage 5 is ineligible;
- natural Shadow, five qualified natural Runs, Active Pointer, exact human
  Promotion approval, Promotion, and product rollback remain unimplemented and
  unproven;
- the 60 CNY development budget is not a Promotion ApprovalReceipt;
- current scripted evidence is mechanism evidence, not efficacy/stability;
- Candidate traffic, pointers, Promotions, and rollbacks remain zero;
- no Provider/paid/Docker/user-data cost occurred;
- no old Artifact/Dynamic/global Champion or Python Alpha path was used.

The permanent public contract must also require the workflow text to contain:

- `tests/dsh-probe/skill-promotion.spec.ts`;
- `tests/dsh-probe/skill-promotion-readiness-demo.spec.ts`;
- `pnpm demo:promotion-readiness`.

Confirm RED because the handoff is absent.

### GREEN

Write the handoff from the canonical design and fresh demo output. Include
exact commands and fixed result categories, but no personal path, credential,
prompt, Skill body, tool/model output, or user data.

Use only the existing D-drive Python environment for local contracts. Never run
bare `uv run` in the implementation worktree:

```powershell
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

If the interpreter is absent, record local Python gates as unavailable and let
exact-main CI remain authoritative. Do not install or create an environment.
Run the Markdown personal-path scan and diff-check.

### Commit

```text
docs: publish governed Skill promotion readiness proof
```

---

## Task 5: Final Stage 6 gates and independent review

Run in this order without reinstalling dependencies:

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack'
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-stage6-test-fixtures'
pnpm --filter @tianwen/runtime... build
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
  tests/dsh-probe/evolution.spec.ts
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
pnpm demo:paired-skill-evaluation
pnpm demo:shadow-eligibility
pnpm demo:promotion-readiness
git diff --check
```

Then conditionally run the existing Python gates without creating an
environment:

```powershell
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

Expected current Stage 6 result:

- all available local gates pass;
- if the existing D-drive Python interpreter is unavailable, the local Python
  gates are reported only as `unavailable`, never green; exact-SHA Python CI in
  Task 6 remains a required completion gate;
- Stage 5 remains `no-eligible-shadow`;
- Promotion is `no-promotion-readiness` with only `shadow-not-eligible`;
- natural Shadow and qualified Runs are zero;
- Candidate remains `recorded` and absent from ordinary traffic;
- no Active Pointer, Promotion, rollback, ApprovalReceipt, or old Champion
  change exists;
- public event allowlist remains the existing eight events;
- dedicated fixture root and worktree `.dsh-probe` end with zero files/bytes;
- 0 Provider, 0 paid tokens, 0 CNY, 0 Docker, 0 user data;
- no dependency download/install and no second environment.

Request three independent reviews of the exact final diff:

1. correctness and demo-truth review;
2. architecture/privacy/DSH boundary review;
3. Ponytail/YAGNI review.

Required release bar: Critical 0, Important 0. Fix only verified issues with a
new RED→GREEN contract. Do not add future pointer/events to satisfy review
style.

After review, make any narrowly required normal commit, rerun affected focused
tests plus typecheck/Ruff/diff-check, and ordinary-push the feature branch.
Verify local/tracking/`ls-remote` SHA equality and clean worktree.

Stop at Task 5 and send the supervisor a structured report. Do not merge main.

---

## Task 6: Mainline integration (supervisor release only)

Run only after the supervisor approves one exact feature HEAD.

1. verify the main dedicated worktree is clean and local/tracking/remote still
   equal exact Stage 5 main `90533433fc29d903b2142f61d5f32d64c7c3d762`;
2. verify approved feature local/tracking/remote SHA equality and clean tree;
3. perform exactly one `--no-ff` merge of the approved feature SHA;
4. require merge tree equality with the feature tree, correct parents, and
   merge diff-check; do not make a merge-only fix;
5. ordinary-push `main` once, never force;
6. locate the unique automatic push CI for the exact merge SHA;
7. verify Python and TypeScript jobs complete successfully, including the two
   new Stage 6 specs and `demo:promotion-readiness` step after all prior demos;
8. on CI failure, collect the exact available evidence under a narrow
   `D:\DevData\tianwen-public-audit\ci-<sha>` directory and stop without rerun
   or speculative repair;
9. on success, report merge SHA/parents/tree, branch/remote SHAs, run/job URLs,
   focused tests/demo result, fixture/cache/download audit, and stop.

Task 6 does not authorize real Shadow, Active Pointer, Promotion, rollback,
Provider/paid proof, PR, tag, Release, visibility change, or application action.

---

## Completion wording

Permitted:

- “Stage 6 Promotion readiness slice is complete.”
- “The repository correctly refused Promotion because Shadow is ineligible.”
- “Candidate traffic, pointers, Promotions, and rollbacks remain zero.”
- “Future scoped Promotion/rollback semantics are documented but not
  implemented.”

Forbidden:

- “Promotion or the learning loop is complete.”
- “The Candidate passed real Evaluation or Shadow.”
- “Five successful natural Runs were observed.”
- “C is active, stable, approved, promoted, or rollback-tested.”
- “The 60 CNY development budget authorized Promotion.”
- “DSH Approval approved this cross-Run transition.”
