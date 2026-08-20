# Tianwen Governed Skill Shadow Eligibility Implementation Plan

> **Execution mode:** execute this plan in the existing D-drive implementation
> worktree with TDD, independent correctness review, architecture/privacy
> review, Ponytail/YAGNI review, and an explicit supervisor checkpoint before
> mainline integration.

**Goal:** Implement the honest Stage 5 slice: consume the durable Stage 4
Evaluation conclusion, make Shadow eligibility mechanically explicit, and prove
the current repository correctly returns `no-eligible-shadow` without routing
ordinary Runs or creating Shadow state.

**Architecture:** Add one pure reducer to `@tianwen/evolution`. Extend the
existing Stage 4 demo's safe summary with the three facts Stage 5 must consume.
Build one zero-cost Stage 5 demo on top of that existing proof. Do not add a
runtime service, ledger event, store, Agent runner, traffic router, Active
Pointer, Promotion, or rollback implementation.

**Canonical design:**
`docs/superpowers/specs/2026-08-21-tianwen-governed-skill-shadow-design.md`
at exact design branch SHA to be recorded before execution.

**Stack:** TypeScript, Vitest, existing DSH `0.1.0-rc.7`, existing Tianwen
Evolution package, existing scripted Stage 4 demo, pnpm. No new dependency.

---

## Non-negotiable boundary

- DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- Current Stage 4 scripted/unobservable/unbound results are ineligible. Do not
  add a flag, cast, test-only production branch, or caller boolean that makes
  them eligible.
- Stage 5 adds no Agent/Session create or resume code and no Candidate Skill
  registration. It reuses the already-completed Stage 4 mechanism summary.
- Add no Shadow ledger event, status row, counter, queue, worker, scheduler,
  traffic splitter, database, runtime service, loader, or permission layer.
- Stage 5 new code must not import or use old Artifact/Dynamic Cordis/global
  Champion APIs for Candidate activation, routing, Promotion, rollback or state
  change. The composed demo may retain Stage 4's existing read-only inventory
  and Champion assertions solely to prove that legacy state is unchanged.
  Python Alpha/RepoTask/AlphaRuntime remain unused.
- Do not run Provider, paid model, Docker, live Alpha, or runtime-profile.
- Do not manufacture a Ticket, Candidate, Evaluation success, or five natural
  Runs. The correct current product result is `no-eligible-shadow`.
- No ordinary Run may receive C; no Active Pointer may be created or changed.
- The feature branch may be pushed normally after review. Main merge and exact
  CI require the supervisor's explicit Task 7 release.

## Workspace setup and baseline stop condition

Use only:

- implementation worktree:
  `D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake`;
- existing worktree-local `node_modules`;
- shared store/cache under `D:\DevData`;
- dedicated Stage 5 fixture root:
  `D:\DevData\tianwen-stage5-test-fixtures` for local Windows execution. Linux
  CI may use the repository's existing ephemeral `.dsh-probe` test default;
  nothing from a CI runner is retained after the job.

Do not create another clone, implementation worktree, `node_modules`, `.venv`,
DSH Profile, or disposable probe.

Before Task 1:

1. verify the canonical design branch local/tracking/remote SHA and read the
   design completely;
2. verify `main` local/tracking/remote is the exact Stage 4 green SHA
   `906f211572167e329c9564f5f75e63c49e2d1dec`;
3. switch the existing implementation worktree to a new branch
   `codex/tianwen-skill-shadow-eligibility` from the canonical design/plan HEAD;
4. require a clean tracked worktree and an existing
   `node_modules/.modules.yaml`;
5. before running tests, read the dedicated Stage 5 fixture root and require
   zero files/zero bytes; if unknown data exists, stop without deleting it;
6. do not install dependencies;
7. run the repository's clean-build order:

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack'
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-stage5-test-fixtures'
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
  tests/dsh-probe/evolution.spec.ts
```

Any pre-existing failure is a stop condition. Record the exact failure and do
not weaken tests or install a second environment. The known requirement to
build runtime declarations before full typecheck is part of the existing CI
order, not a reason to modify the typecheck architecture.

---

## Task 1: Expose the safe Stage 4 summary facts

**Files:**

- Modify: `scripts/run-paired-skill-evaluation-demo.ts`
- Modify: `tests/dsh-probe/paired-skill-evaluation-demo.spec.ts`

### RED

Extend the existing demo contract first. Require `learning` to include:

```ts
evaluationId: `evaluation:${string}`
baselineResolutionMatched: true
freshness: {
  state: 'stale'
  reason: 'policy-authorization-unobservable'
}
```

Also assert the serialized safe output still excludes:

- the Candidate/parent Skill body;
- prompt/user/tool content;
- filesystem paths and URLs;
- Provider credentials or user data.

Run only the existing paired demo test and confirm the new assertions fail
because the summary fields do not exist.

### GREEN

Import and call the existing `assessSkillEvaluationFreshness()` inside the
existing Stage 4 demo after the durable plan/result are available.

Construct `SkillEvaluationCurrentDependencies` only from facts already held by
that demo:

- `recordedPlan: evaluation.plan`;
- exact parent/candidate/protocol IDs and digests from the plan/result;
- DSH version, provider/model, request config, tool surface, workspace,
  validator, Policy and dependency binding facts from the frozen environment;
- data snapshot digests projected from the plan cases.

Do not hard-code the freshness reason. The existing assessor must derive it.
Expose only `evaluation.result.evaluationId`,
`evaluation.result.baselineResolutionMatched`, and the derived freshness in the
safe summary.

Do not expose the plan, result cases, Candidate payload, Session events,
environment digests, paths, or credentials. Do not keep the temporary ledger.

Run the focused test, `pnpm --filter @tianwen/evolution... build`, full
typecheck, and diff-check.

### Commit

```text
test: expose safe Evaluation eligibility facts
```

---

## Task 2: Add the pure Shadow eligibility reducer

**Files:**

- Create: `packages/tianwen-evolution/src/skill-shadow.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Create: `tests/dsh-probe/skill-shadow.spec.ts`

### RED

Write table-driven tests for the canonical seven checks:

1. verdict is not `PASS`;
2. comparison is not `candidate-better`;
3. evidence is not `independent-objective`;
4. baseline resolution is false;
5. protocol provenance is retrospective;
6. Stage 4 decision is not `eligible-for-shadow-review`;
7. freshness is stale.

Require:

- each case returns `no-eligible-shadow` with the exact closed reason;
- multiple failures are returned in this fixed order;
- stale preserves the exact `SkillEvaluationFreshnessReason`;
- only the complete conjunction plus `fresh` returns
  `eligible-for-shadow` with an empty reason tuple;
- exact input objects are not mutated;
- no free-form reason text appears.

Compile-time contracts must prove the input uses
`Pick<SkillEvaluationResult, ...> & { freshness }`, and output reason members are
closed enums.

Confirm RED because the new module/export does not exist.

### GREEN

Implement only:

- `SkillShadowEligibilityInput`;
- `SkillShadowIneligibilityReason`;
- `SkillShadowEligibility`;
- `assessSkillShadowEligibility()`.

Use straightforward ordered condition checks. Do not parse arbitrary external
objects, perform I/O, add a class, add a service, or append a ledger event. The
existing ledger/parser remains the trust boundary for real callers.

Export the function and types explicitly from the package root. Do not change
`PUBLIC_LEDGER_EVENT_TYPES`; do not add to `LedgerEvent`.

Run the focused spec, build the Evolution package, run full typecheck and
diff-check.

### Commit

```text
feat: assess governed Skill Shadow eligibility
```

---

## Task 3: Prove the current no-eligible-shadow path end to end

**Files:**

- Create: `scripts/run-skill-shadow-eligibility-demo.ts`
- Create: `tests/dsh-probe/skill-shadow-eligibility-demo.spec.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

### RED

Add the demo contract before implementation. It must require exactly one safe
JSON summary with:

```text
schemaVersion=tianwen.skill-shadow-eligibility-demo.v1
evaluation.verdict=INCONCLUSIVE
evaluation.comparison=not-comparable
evaluation.evidenceClass=scripted-mechanism
evaluation.protocolProvenance=pre-candidate
evaluation.baselineResolutionMatched=true
evaluation.freshness.state=stale
shadow.decision=no-eligible-shadow
shadow.ordinaryRunsRouted=0
shadow.qualifiedNaturalRuns=0
shadow.candidateRegisteredForOrdinaryTraffic=false
shadow.activePointerChanged=false
shadow.legacyChampionChanged=false
stage5Incremental.agents=0
stage5Incremental.sessions=0
stage5Incremental.runs=0
stage5Incremental.ledgerEvents=0
stage5Incremental.registryMutations=0
cost.network/providerRequests/paidTokens/cny/docker/userData=0
```

Require the complete ordered reason list for the actual Stage 4 result:

- `evaluation-not-pass`;
- `candidate-not-better`;
- `evidence-not-independent-objective`;
- `evaluation-decision-mismatch`;
- `evaluation-stale`.

Do not expect baseline or protocol refusal because those two facts match.

Also require the combined output to report the existing Stage 4 execution
counts honestly rather than claiming the whole composed demo created no Agents
or Sessions.

Confirm RED because the script/package command does not exist.

### GREEN

Call `runPairedSkillEvaluationDemo()` once. Pass only its safe evaluation fields
and derived freshness to `assessSkillShadowEligibility()`.

The Stage 5 portion must not import or call runtime application, Agent, Session,
Skill registry, ledger, Artifact, Dynamic Cordis, Champion, Provider, or
filesystem persistence APIs. It performs one pure reducer call and returns the
summary.

The zero incremental counters are a statement about code executed after the
Stage 4 summary exists. Keep the existing Stage 4 execution counts in a separate
`stage4Mechanism` block.

Add `demo:shadow-eligibility` to `package.json`. Append both new specs to the
existing explicit focused Vitest command in `.github/workflows/ci.yml`, then
append one demo step after the paired Evaluation demo. Do not reorder or weaken
earlier CI gates and do not add secrets, Docker, artifacts, coverage, matrix
jobs, caches, or write permission.

Run the focused demo spec, execute the command directly, check one JSON object,
and diff-check.

### Commit

```text
test: prove ineligible Shadow remains unrouted
```

---

## Task 4: Publish the Stage 5 evidence boundary

**Files:**

- Create:
  `docs/operations/tianwen-stage5-skill-shadow-eligibility-handoff.md`
- Modify: `tests/contracts/test_public_repository_surface.py`

Do not change README claims to say Shadow is implemented. The public surface
must continue stating that real Shadow/Promotion are unfinished.

### RED

Extend the public contract to require the handoff to state:

- DSH rc.7 remains the only product Agent Runtime;
- Stage 5 implements only the eligibility slice;
- the actual result is `no-eligible-shadow`;
- natural Shadow routing, five qualified natural Runs, Active Pointer,
  Promotion and rollback remain unimplemented/unproven;
- current scripted evidence is not efficacy evidence;
- no Candidate was registered for ordinary traffic;
- zero Provider/paid/Docker/user-data cost;
- Stage 5 new code did not use old Artifact/Dynamic/Champion paths for
  activation, routing or state change; the composed Stage 4 proof retained only
  its existing read-only unchanged-state assertions;
- no Python Alpha/RepoTask/AlphaRuntime path was used.

Confirm RED because the handoff is absent.

### GREEN

Write the handoff from the canonical design and fresh demo output. Include exact
commands and result categories, but no local personal path, credential, prompt,
Skill body, tool output, or user data.

For the focused Python contract, do not invoke bare `uv run` because the
implementation worktree has no `.venv`. First verify that the existing D-drive
CI environment
`D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe` exists and
can import pytest. If it does, run that interpreter with the current worktree's
absolute contract path. If it does not, record the local Python gate as
unavailable and leave the exact-main Python CI as the authoritative gate; do
not install or create an environment. Then run the Markdown personal-path scan
and diff-check.

### Commit

```text
docs: publish governed Skill Shadow eligibility proof
```

---

## Task 5: Final Stage 5 gates and independent review

Run in this order without reinstalling dependencies:

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack'
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-stage5-test-fixtures'
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
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
pnpm demo:paired-skill-evaluation
pnpm demo:shadow-eligibility
git diff --check
```

Then conditionally run the Python contract without creating an environment:

```powershell
$python = 'D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $python) {
  & $python -c 'import pytest'
  if ($LASTEXITCODE -ne 0) { throw 'existing Python environment lacks pytest' }
  & $python -m pytest `
    (Resolve-Path 'tests/contracts/test_public_repository_surface.py') -q
  if ($LASTEXITCODE -ne 0) { throw 'public repository contract failed' }
} else {
  Write-Output 'local Python contract unavailable; exact-main Python CI required'
}
```

Expected current Stage 5 result:

- all gates pass;
- Shadow decision is `no-eligible-shadow`;
- ordinary routed Runs and qualified natural Runs are zero;
- Candidate remains `recorded`;
- public event allowlist is unchanged;
- no Active Pointer or old Champion change;
- dedicated fixture root ends with zero files/zero bytes;
- 0 Provider, 0 paid tokens, 0 CNY, 0 Docker, 0 user data;
- no dependency download/install and no second environment.

Then request three independent reviews of the exact final diff:

1. correctness/replay and demo-truth review;
2. architecture/privacy/DSH boundary review;
3. Ponytail/YAGNI review.

Required release bar: Critical 0, Important 0. Fix only verified issues with a
new RED→GREEN contract. Do not add a framework to satisfy review style.

After review, make any narrowly required normal commit, rerun the affected
focused tests plus typecheck/diff-check, and ordinary-push the feature branch.
Verify local/tracking/`ls-remote` SHA equality and clean worktree.

Stop at Task 5 and send the supervisor a structured report. Do not merge main.

---

## Task 6: Mainline integration (supervisor release only)

Run only after the supervisor approves one exact feature HEAD.

1. verify main dedicated worktree is clean and local/tracking/remote still equal
   the recorded Stage 4 main SHA;
2. perform exactly one `--no-ff` merge of the approved feature SHA;
3. require merge tree equality with the feature tree and correct parents;
4. run merge diff-check only; do not make a merge-only product fix;
5. ordinary-push `main` once, never force;
6. locate the unique automatic push CI for the exact merge SHA;
7. verify Python and TypeScript jobs complete successfully, including the new
   two Stage 5 Vitest specs and the new `demo:shadow-eligibility` step;
8. on CI failure, collect the exact available job evidence under a narrow
   `D:\DevData\tianwen-public-audit\ci-<sha>` directory and stop without rerun;
9. on success, report merge SHA/parents/tree, branch/remote SHAs, run/job URLs,
   demo result, fixture/cache/download audit, and stop.

Task 6 does not authorize Stage 6 Promotion/Rollback implementation, Provider
use, paid proof, PR, tag, Release, visibility change, or application action.

---

## Completion wording

Permitted:

- “Stage 5 eligibility slice is complete.”
- “The repository correctly found no eligible Shadow.”
- “Current Candidate traffic remains zero.”
- “Future natural Shadow semantics are documented but not implemented.”

Forbidden:

- “Shadow is complete.”
- “The Candidate passed real evaluation.”
- “Five successful Runs were observed.”
- “C is active, stable, promoted, or rollback-tested.”
- “The 60 CNY budget was used as efficacy proof.”
