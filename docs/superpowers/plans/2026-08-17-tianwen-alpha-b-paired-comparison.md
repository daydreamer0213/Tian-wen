# Tianwen Alpha-B Paired Comparison Implementation Plan

> **For implementers:** Follow test-driven development. Every task must show a genuine focused RED before production edits, then focused GREEN. Use `apply_patch` for edits. Do not call a paid model, live provider, real Docker, or change Runtime/TypeScript/governance promotion code.

**Goal:** Prove that an explicitly selected Champion and Challenger can be compared under machine-equal conditions in isolated Alpha Trial workspaces, and that repeated pair results are aggregated without treating missing evidence as a loss.

**Architecture:** Extend the existing Python `AlphaTrialRunner` with explicit immutable repo-task behavior selection and a stable pre-request condition snapshot. Add one pure Python comparison module for pair authority, result validation/projection, and deterministic repeat aggregation. Continue to use the existing Alpha-A runner and final verifier for each leg.

**Tech Stack:** Python 3.11+, Pydantic frozen models, pytest/AnyIO, existing fake `TestModel` and fake Docker fixtures, Ruff. No new dependency.

**Authority:** `docs/superpowers/specs/2026-08-17-tianwen-alpha-b-paired-comparison-design.md` at design commit `c117715`.

---

## Task 1: Bind an explicit immutable behavior and expose a stable condition snapshot

**Files:**

- Modify: `src/tianwen/alpha.py`
- Modify: `tests/integration/test_alpha_trial.py`

### Step 1: Add focused failing tests

Add tests that construct a repo-task `ArtifactVersion` with content different from the active Champion, `status=CANDIDATE`, and `parent_version_id` equal to the isolated App's active Champion.

The tests must prove:

- `prepare(..., artifact_version=candidate)` stores/materializes that exact immutable content and binds its version/digest in preview/prepared state;
- the default `prepare()` path still binds the active Champion;
- wrong artifact id/type, content digest, status, or parent is rejected before model requests;
- replaying a conflicting object is rejected;
- `condition_snapshot(prepared)` is unchanged across two otherwise identical Trial preparations even though trial ids/workspaces and Skill versions differ;
- the snapshot includes model/settings/provider/runtime versions, full budget, task/input/round authority, authorization, baseline, image/container/check/verifier, and per-round pure policy/tool contracts;
- the snapshot excludes trial/Goal/confirmation/prompt/workspace/Skill values.

Run:

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
uv run pytest tests/integration/test_alpha_trial.py -q -k "explicit_artifact or condition_snapshot"
```

Expected RED: new tests fail because `prepare()` has no explicit artifact parameter and no `condition_snapshot()`.

### Step 2: Implement the smallest production change

In `src/tianwen/alpha.py`:

- import `ArtifactStatus` and `ArtifactVersion`;
- add a frozen `AlphaTrialConditionSnapshot` model containing only the stable common fields defined by the design;
- change `prepare()` to accept optional keyword-only `artifact_version: ArtifactVersion | None = None`;
- after App bootstrap, validate the supplied version exactly; candidate status must have the current active Champion as parent; content digest must match content;
- put only a valid Candidate through the existing immutable store path, or verify an exact existing replay;
- materialize the selected version and bind it to the existing prepared/preview/manifest fields;
- add `condition_snapshot(prepared)` that derives snapshots from the prepared bundle/config and `alpha_runtime_manifest_digests()` while omitting workspace digest and all random prompt/Goal values.

Do not rename existing `champion_*` schema fields and do not modify the active pointer.

### Step 3: Run focused and regression tests

Run:

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
uv run pytest tests/integration/test_alpha_trial.py -q -k "explicit_artifact or condition_snapshot"
uv run pytest tests/integration/test_alpha_trial.py -q
uv run ruff check src/tianwen/alpha.py tests/integration/test_alpha_trial.py
git diff --check
```

Expected GREEN: all focused tests and the existing Alpha Trial integration file pass; Ruff and diff check are clean.

### Step 4: Commit

```powershell
git add src/tianwen/alpha.py tests/integration/test_alpha_trial.py
git commit -m "feat: bind Alpha trial behavior conditions"
```

---

## Task 2: Add pre-request pair authority and truthful pair result projection

**Files:**

- Create: `src/tianwen/alpha_comparison.py`
- Create: `tests/integration/test_alpha_comparison.py`

### Step 1: Add focused failing tests for pair preparation

Use A1, two `AlphaTrialRunner` instances, fake models, fake Docker executors, and separate `D:\DevData` trial roots. Build one active Champion leg and one explicit Candidate leg.

Tests must prove before either model has any request:

- equal snapshots, different trial ids/workspaces/Skill digests produce a `PairedComparisonManifest`;
- pair id/common condition digest/role bindings/order are content-bound;
- order must contain each role once and repeat index must be positive;
- same workspace, same behavior, or any changed common field raises `AlphaComparisonError`;
- changed model settings, budget, task/baseline, policy/tool, image/check/verifier are each rejected while both model request counts remain zero.

Run:

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
uv run pytest tests/integration/test_alpha_comparison.py -q -k "prepare or unfair or isolation"
```

Expected RED: import fails because `tianwen.alpha_comparison` does not exist.

### Step 2: Implement immutable pair authority

Create minimal frozen models:

- `PairedComparisonLeg`
- `PairedComparisonManifest`
- `PairedArmProjection`
- `PairedComparisonResult`
- `PairedComparisonAggregate`
- `AlphaComparisonError`

Implement `prepare_pair_authority()` using only the two runners' `condition_snapshot()` and prepared Trial identities. Validate exact common snapshot equality, role/Skill difference, workspace isolation, positive repeat index, and exact AB/BA order. No model call belongs in this function.

### Step 3: Add failing tests for result validation

Run two fake-model legs through the existing `AlphaTrialRunner.execute()` in the manifest's frozen order. Load each `TrialManifest` from its own isolated store.

Tests must prove:

- each leg has a separate Goal, store, workspace, prompt history, final verifier call, manifest and result;
- exact bindings with completed verification/boundary produce `PASS` plus arm metrics;
- manifest/result digest or role binding tampering produces `FAIL` and no comparison;
- missing manifest/result, stopped/failed execution, unavailable/invalid verification, inconclusive verdict, or unknown boundary produces `INCONCLUSIVE` and no comparison;
- `user_interruptions` is explicitly zero for both arms;
- comparison is descriptive only and does not create governance `EvalRun`, promotion, active pointer change, Candidate generation, or Shadow state.

Run the same focused command. Expected RED: authority exists, but comparison behavior is absent or incomplete.

### Step 4: Implement `compare_pair()`

Validate pair-to-manifest-to-result bindings, stable manifest condition projection, and workspace isolation. Return:

- `FAIL` for known fairness/binding/isolation mismatches;
- `INCONCLUSIVE` for missing or uncertain evidence;
- `PASS` only for two complete, determinate legs.

Under `PASS`, compute only the frozen descriptive comparison: safety boundary first, then `met/not_met`; equal states are `tie`. Never write governance records or mutate either Trial.

### Step 5: Run focused tests

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
uv run pytest tests/integration/test_alpha_comparison.py -q
uv run ruff check src/tianwen/alpha_comparison.py tests/integration/test_alpha_comparison.py
git diff --check
```

Expected GREEN: all pair authority/result tests pass, no real Docker/provider is called.

### Step 6: Commit

```powershell
git add src/tianwen/alpha_comparison.py tests/integration/test_alpha_comparison.py
git commit -m "feat: compare isolated Alpha trial pairs"
```

---

## Task 3: Add deterministic repeated-pair aggregation and prove the Alpha-B completion gate

**Files:**

- Modify: `src/tianwen/alpha_comparison.py`
- Modify: `tests/integration/test_alpha_comparison.py`

### Step 1: Add focused failing repeat tests

Add two completed fake pairs with frozen execution orders AB then BA. Tests must prove:

- results must have unique pair ids and contiguous repeat indexes starting at 1;
- aggregate retains ordered pair references and totals each role's model requests/tokens/tool calls/action effects/wall seconds/user interruptions;
- comparison counts are deterministic across exact replay;
- any pair `FAIL` makes aggregate `FAIL`; otherwise any `INCONCLUSIVE` makes it `INCONCLUSIVE`; all `PASS` makes it `PASS`;
- missing/non-contiguous/duplicate repeats are rejected;
- a single outcome is reported but never described as stable improvement or promotion authority.

Run:

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
uv run pytest tests/integration/test_alpha_comparison.py -q -k "aggregate or repeated or order"
```

Expected RED: aggregation is not yet implemented.

### Step 2: Implement the pure aggregator

Implement `aggregate_pair_results()` as a deterministic pure function. Preserve ordered pair ids/results, add integer usage totals and comparison counts, and derive aggregate status with `FAIL > INCONCLUSIVE > PASS`. Do not add statistical inference, storage, scheduler or promotion integration.

### Step 3: Run the offline release gates serially

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
uv run pytest tests/integration/test_alpha_comparison.py -q
uv run pytest tests/integration/test_alpha_trial.py -q
uv run pytest tests/alpha -q
uv run pytest -q
uv run ruff check .
pnpm exec tsc --noEmit
git diff --check
git status --short
```

Expected GREEN: comparison and existing Alpha tests pass; full Python suite, Ruff, TypeScript check and diff check pass. Tests run serially. No paid model, live provider or real Docker is used.

### Step 4: Commit

```powershell
git add src/tianwen/alpha_comparison.py tests/integration/test_alpha_comparison.py
git commit -m "test: prove repeated Alpha pair aggregation"
```

---

## Task 4: Independent review, canonical handoff, and Git closure

**Files:**

- Create: `docs/operations/tianwen-alpha-b-paired-comparison-handoff.md`
- Modify only if required by established memory format: `docs/architecture-master-session-memory.md`

### Step 1: Independent correctness review

Review against the approved design and exact diffs. Required findings classes: Critical, Important, Minor. The review must independently inspect production code, tests, receipts, Stage A separation, no-Docker/no-live evidence, and all completion gates.

Any real finding returns to a fresh implementer using RED/GREEN before re-review.

### Step 2: Independent Ponytail/YAGNI review

Verify that the implementation is the smallest working slice: no Runtime/TypeScript/evaluator/promotion changes, new dependencies, generic experiment framework, scheduler or speculative schema.

### Step 3: Write canonical handoff

Record:

- Stage A remains failed but boundedly closed; Alpha-B does not depend on Stage A success;
- exact design/plan/implementation/review commits;
- exact offline test commands and outcomes;
- Alpha-B completion gate evidence;
- paid model spend (expected CNY 0 unless an evidence-backed live gate was separately used);
- no real Docker and Runtime remained frozen;
- branch/main/origin/GitHub exact SHAs;
- next recommended entry: Alpha-C LearningSignal → Ticket → Case → Attribution → Lesson → repo_task Challenger, allowing no-candidate.

### Step 4: Final verification and normal Git integration

Run relevant release gates once more on the stage branch, commit the handoff, push the preserved `codex/` stage branch, normally merge it into latest `main` without rebase/squash/force-push, rerun the required main gates, push once, and verify local main/origin/main/GitHub main exact SHA. Preserve the stage branch and its commits.
