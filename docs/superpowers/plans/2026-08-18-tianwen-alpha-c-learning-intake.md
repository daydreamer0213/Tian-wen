# Tianwen Alpha-C Learning Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to execute this plan task by task. Each implementation task requires a genuine RED before production edits, a focused GREEN, an implementation report, and a committed checkpoint.

**Goal:** Prove offline that real outcomes and explicit user corrections enter a durable, evidence-bound learning chain only when qualified, while insufficient evidence and non-learning inputs stop with no Candidate.

**Architecture:** Add a thin `tianwen.learning_intake` boundary that projects privacy-safe outcomes, freezes an Observed Gap and triage receipt, then reuses `LearningEngine`, `StateStore` and `MemoryStore`. Extend existing learning records only with backward-compatible provenance fields and validate the persisted chain before accepting a conditional Lesson. Candidate creation remains untouched and outside the new module.

**Tech Stack:** Python 3.11, Pydantic v2 frozen models, SQLite `StateStore`, pytest, Ruff

## Global Constraints

- Work only on branch `codex/tianwen-alpha-c-learning-signal`, based on
  `40bc8613d2eeea834bf1f34d43974490493f3864`.
- The approved design is
  `docs/superpowers/specs/2026-08-18-tianwen-alpha-c-learning-intake-design.md`.
- Use TDD: add the named tests and run the focused command to a product-behavior RED
  before editing production code. Import/collection RED is acceptable only for the first
  new module; later REDs must reach the behavior under test.
- Do not call `LearningEngine.create_repo_task_candidate`; do not import Candidate or
  Alpha-B comparison code from `learning_intake.py`.
- Do not change Runtime/DSH, TypeScript governance, Alpha-B pairing, Promotion, Shadow,
  scheduler, prompts, provider adapters or tool loops.
- Real model requests, model tokens, CNY spend and real Docker invocations are all zero.
- Use temporary state under the pytest temp directory. Keep caches and generated data on
  `D:\DevData`.
- Preserve backward compatibility for legacy LearningSignal, LearningTicket,
  AttributionRecord and Trial durable receipts by giving every new field a default.
- Heavy test gates run serially.
- Do not rebase, squash or force-push.

---

## Task 1: Outcome projection, Gap triage and qualified Case

**Owned files:**

- Create: `src/tianwen/learning_intake.py`
- Modify: `src/tianwen/learning.py`
- Modify: `src/tianwen/domain.py`
- Modify: `src/tianwen/store.py`
- Create: `tests/unit/test_learning_intake.py`

### Step 1: Write the focused failing tests

Create helpers that initialize a real temporary `StateStore`, parent Goal/Loop, Evidence
records and `LearningEngine`. Use stable, credential-free IDs and no external services.

Add tests named:

- `test_one_verified_failure_is_observed_without_learning_objects`
- `test_two_independent_verified_failures_create_bound_gap_signal_ticket_case`
- `test_explicit_user_correction_qualifies_once`
- `test_stage_a_usage_invalid_and_model_claims_never_become_signals`
- `test_one_off_choice_is_current_fix_only`
- `test_persistent_preference_uses_scoped_memory_only`
- `test_mixed_scope_fingerprint_and_missing_evidence_fail_closed`
- `test_outcome_gap_and_triage_replay_exactly_and_exclude_raw_payloads`
- `test_trial_projection_rejects_forged_result_manifest_or_final_verifier_evidence_before_observation`
- `test_user_feedback_rejects_cross_trial_task_or_champion_binding_before_observation`

For the qualified test, assert all of the following:

- two distinct source/trial IDs are required;
- the Gap recurrence is 2;
- the Signal source is `repeated_attributable_issue`;
- Signal, Ticket and Case bind the same Gap, fingerprint, capability scope and Evidence;
- Case outcome is `gap:<gap_id>`;
- the Triage receipt contains Signal/Ticket/Case IDs and
  `candidate_version_id is None`;
- no `artifact` or `active_pointer` row is added.

For the negative-source parameterization, include `runtime_failure` with source ID
`stage-a:usage-invalid`, `capability_discovery`, `model_self_assessment` and
`ordinary_low_score`. Assert zero learning Signals/Tickets/Cases.

For preference, create a valid `MemoryProposal` with `source_class="user"`, purpose
`user_preference`, non-global scopes, provenance and future retention. Assert exactly one
Memory and no learning objects.

For the Trial-forgery parameterization, begin with one valid durable Result, Manifest and
final-verifier Evidence set. Independently tamper the caller's Result task/Champion/model/
failure fields, the manifest digest, and the Evidence trial/run binding. Each attempt must
raise `StateConflict` before any Outcome, Gap, Signal, Ticket or Case is stored. The valid
control must equal the scope and fingerprint computed from the exact persisted fields.

For user feedback, use a valid user Evidence record tied to one Trial, then attempt to
project it through a different Trial whose task or Champion identity differs. It must fail
before an Outcome is stored.

Run:

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
$env:TEMP='D:\DevData\tianwen-alpha-c-test-temp'
$env:TMP=$env:TEMP
uv run pytest tests/unit/test_learning_intake.py -q
```

Expected RED: collection fails because `tianwen.learning_intake` does not exist, or the
new behavior assertions fail. Record the exact command, exit code and failing assertions
in the task report before any production edit.

### Step 2: Add the frozen intake models and validators

In `src/tianwen/learning_intake.py`, implement the exact fields and validators from design
sections 5.1–5.4 for these public models:

```python
OutcomeKind = Literal[
    "verified_failure", "verified_success", "explicit_user_correction",
    "persistent_user_preference", "one_off_user_choice", "runtime_failure",
    "capability_discovery", "model_self_assessment", "ordinary_low_score",
]

OutcomeObservation
ObservedGap
LearningTriageReceipt
```

Use Pydantic `model_validator` methods for legal field combinations and non-empty trimmed
scope/fingerprint values. Canonicalize repeated inputs into sorted unique tuples before
constructing content IDs with `content_digest`.

Add only these immutable object kinds to `_IMMUTABLE_GOVERNANCE_KINDS` in
`src/tianwen/store.py`:

```python
"outcome_observation"
"observed_gap"
"learning_triage"
"learning_conclusion"
```

`learning_conclusion` is reserved for Task 2 so the immutable boundary is complete in one
small edit.

### Step 3: Add narrow projectors

Implement these public methods:

- `LearningIntake.record_trial_outcome(result: TrialResult, *, trial_store: StateStore)
  -> OutcomeObservation`
- `LearningIntake.record_user_feedback(*, feedback_id: str, feedback_digest: str,
  kind: UserFeedbackOutcomeKind, trial_id: str, trial_store: StateStore,
  evidence_ids: tuple[str, ...] = ()) -> OutcomeObservation`
- `LearningIntake.record_non_learning_outcome(*, source_id: str, source_digest: str,
  kind: NonLearningOutcomeKind, capability_scope: str,
  evidence_ids: tuple[str, ...] = ())
  -> OutcomeObservation`

`UserFeedbackOutcomeKind` is the three-value Literal for explicit correction, persistent
preference and one-off choice. `NonLearningOutcomeKind` is the four-value Literal for
runtime failure, capability discovery, model self-assessment and ordinary low score.

The Trial projector must `TrialResult.model_validate`, reload and exactly compare the
durable `alpha_trial_result` and `alpha_trial_manifest` from `trial_store`, reload every
Evidence ID, and validate trial/run/scope binding for final-verifier Evidence. It derives
both values below; neither is accepted from the caller:

```text
capability_scope =
  repo_task_skill/<champion_version_id>/task/<task_id>@<task_version>

problem_fingerprint = digest(
  schema + capability_scope + model_id + task_bundle_digest + model_input_digest
  + baseline_tree_digest + verifier_digest + verdict
  + sorted(failure_categories) + execution_status + verification_status + boundary_status
)
```

It derives the observation source digest from the complete validated result. It must not
persist workspace paths, artifact diffs, summaries or prompts. Only completed,
boundary-passing `not_met` verifier results with non-empty failure categories are marked
`verified_failure`; other Trial outcomes are observations that cannot count toward the
recurrence gate.

Copy each exactly validated `EvidenceRecord` from the Trial store into the governance
store with immutable replay before persisting the Outcome. Reject a same-ID/different-
payload conflict. Do not persist the Trial-store path.

The user-feedback projector reloads the durable Trial Result and Manifest for `trial_id`
and derives the same canonical capability scope from them; it accepts no caller-supplied
task or Champion identity. It derives an explicit-correction fingerprint from the
feedback digest plus that scope. An explicit correction must reference at least one
persisted Evidence record with `source_class="user"`, scope `trial:<trial_id>`, and
provenance containing the feedback ID.

All projectors validate referenced Evidence before persisting the observation with
`put_immutable_object`.

### Step 4: Add strict triage

Implement `LearningIntake.triage(outcomes: tuple[OutcomeObservation, ...], *, preference:
MemoryProposal | None = None) -> LearningTriageReceipt`.

The method reloads persisted observations and rejects caller-modified copies.

- One verified failure -> `observe`.
- At least two distinct verified failed Trial sources with identical scope/fingerprint ->
  persist Gap, enqueue governed Signal, create Ticket and Case, then `learning_case`.
- One explicit correction -> persist Gap and the same governed chain.
- Persistent preference -> validate that the proposal matches the Outcome scopes and
  provenance; `MemoryFirewall.accept`, `MemoryStore.save`, then `preference_binding`.
- One-off choice/runtime failure -> `current_fix`.
- Capability discovery/model self-assessment/ordinary low score/success -> `observe`.
- Mixed input kinds, scopes, fingerprints or unpersisted receipts -> `StateConflict`.

Modify `LearningSignal` with the four provenance fields from the approved design. The
new intake path sets severity conservatively, uses recurrence from the Gap, and sets
`user_corrected` only for explicit correction. Modify `LearningTicket` with optional
`problem_fingerprint` and `capability_scope`; populate them from governed Signals.

In `domain.py`, add defaulted `ticket_id`, `observed_gap_id`, `problem_fingerprint` and
`capability_scope` to `CaseRecord`. Modify `LearningEngine.create_case` to accept optional
`gap_id`, `problem_statement`, `evidence_ids`, `problem_fingerprint` and
`capability_scope`, populate the structural fields for governed calls, and keep the
current defaults for legacy callers.

Do not change the legacy high-value formula in `LearningEngine.enqueue`; the intake
boundary is what prevents severity/blocks_goal from qualifying new Alpha-C Signals.

### Step 5: Run focused GREEN and regressions

Run serially:

```powershell
uv run pytest tests/unit/test_learning_intake.py -q
uv run pytest tests/unit/test_learning.py tests/integration/test_vertical_slice.py -q
uv run ruff check src/tianwen/learning_intake.py src/tianwen/learning.py src/tianwen/store.py tests/unit/test_learning_intake.py
git diff --check
```

All must pass. Confirm `rg -n "create_repo_task_candidate|alpha_comparison|promotion|shadow" src/tianwen/learning_intake.py` has no matches.

### Step 6: Commit and report

Commit only the owned files:

```powershell
git add -- src/tianwen/learning_intake.py src/tianwen/learning.py src/tianwen/domain.py src/tianwen/store.py tests/unit/test_learning_intake.py
git commit -m "feat: govern Alpha-C learning intake"
```

Write the ignored SDD task report with the RED, GREEN, changed schema, backward-
compatibility evidence and zero live usage.

---

## Task 2: Attribution, conditional Lesson and explicit no-Candidate conclusion

**Owned files:**

- Modify: `src/tianwen/learning_intake.py`
- Modify: `src/tianwen/learning.py`
- Modify: `src/tianwen/domain.py`
- Modify: `tests/unit/test_learning_intake.py`

### Step 1: Write behavior REDs

Add tests named:

- `test_unknown_attribution_stops_with_no_lesson_or_candidate`
- `test_out_of_scope_attribution_is_recommendation_only_and_stops`
- `test_resolved_chain_accepts_scope_bound_conditional_lesson`
- `test_lesson_requires_persisted_chain_counterevidence_and_matching_scope`
- `test_conclusion_replay_is_exact_and_candidate_is_always_none`
- `test_conclude_rejects_persisted_case_with_cross_ticket_or_gap_binding`

Each test starts from the qualified chain built through Task 1. Snapshot existing
`artifact` and `active_pointer` records before conclusion and assert exact equality after.
For the cross-binding test, create two individually valid chains, then persist a
schema-valid Case/Triage combination whose Case ticket or Gap belongs to the other chain.
Conclusion must raise `StateConflict`, write neither Lesson nor conclusion, and preserve
Artifact and Active Pointer state exactly.

Run:

```powershell
uv run pytest tests/unit/test_learning_intake.py -q -k "attribution or lesson or conclusion"
```

Expected RED: the new conclusion API/model is absent or fails the new behavior. Do not
edit production code before recording the exact RED.

### Step 2: Extend Attribution compatibly

Add the approved defaulted fields to `AttributionRecord`:

```python
status: Literal["resolved", "unknown"] = "resolved"
ticket_id: str | None = None
observed_gap_id: str | None = None
capability_scope: str | None = None
supporting_evidence_ids: tuple[str, ...] = ()
counterevidence_ids: tuple[str, ...] = ()
```

Add `LearningEngine.record_governed_attribution` with keyword-only arguments for these
fields. It always returns the persisted record, including a recommendation-only record.
Share the existing construction/persistence logic through one private helper. Preserve
the current `record_attribution` positional API and its existing behavior, including
raising `MutationNotAllowed` after persisting an out-of-scope record. For the governed
path, allow `status="unknown"` as an honest outcome, but still require a non-empty
hypothesis set and earliest-divergence statement.

In `domain.py`, add `capability_scope: str | None = None` to `LessonRecord`. Keep the
existing `target_scope` meaning: it is the mutation layer and must be
`repo_task_skill` for a governed conditional Lesson.

### Step 3: Add the conclusion receipt and chain validator

Implement `LearningConclusionReceipt` and
`LearningIntake.conclude(triage: LearningTriageReceipt, attribution:
AttributionRecord, *, lesson: LessonRecord | None = None) -> LearningConclusionReceipt`.

Reload and compare the Triage, Gap, Signal, Ticket, Case, Attribution and every Evidence
record before deciding. Follow the exact Lesson gate in the approved design.

Return and persist `no_lesson` for:

- `attribution_unknown`;
- `insufficient_evidence` when no Lesson is supplied after a resolved attribution; or
- `causal_layer_out_of_scope`.

Accept and persist `conditional_lesson` only for an attribution with
`mutation_target="repo_task_skill"` and a Lesson whose `target_scope` is exactly
`repo_task_skill`, whose capability scope matches the Case, and whose conditions, Evidence
and counterevidence are non-empty.
Call `LearningEngine.accept_lesson`; never call Candidate creation.

Malformed, missing or cross-chain data raises `StateConflict` and writes neither Lesson
nor conclusion.

### Step 4: Focused GREEN and compatibility gates

Run serially:

```powershell
uv run pytest tests/unit/test_learning_intake.py -q
uv run pytest tests/unit/test_learning.py tests/integration/test_vertical_slice.py -q
uv run ruff check src/tianwen/learning_intake.py src/tianwen/learning.py src/tianwen/domain.py tests/unit/test_learning_intake.py
git diff --check
```

Confirm existing legacy Attribution and Lesson tests remain green and no Candidate API is
referenced from the new module.

### Step 5: Commit and report

```powershell
git add -- src/tianwen/learning_intake.py src/tianwen/learning.py src/tianwen/domain.py tests/unit/test_learning_intake.py
git commit -m "feat: close Alpha-C learning conclusions"
```

Write the ignored SDD task report with RED/GREEN and all stopping outcomes.

---

## Task 3: Offline vertical proof and stage release evidence

**Owned files:**

- Create: `tests/integration/test_alpha_c_learning_intake.py`
- Modify only if a proven product defect requires it: `src/tianwen/learning_intake.py`,
  `src/tianwen/learning.py`, `src/tianwen/store.py`

### Step 1: Add the end-to-end RED

Use existing offline Alpha fake-model/fake-executor helpers or a smaller equivalent that
does not invoke Docker. Create two independent failed Trial receipts with independent
trial/workspace/run/Evidence IDs but one derived fingerprint and capability scope.

Add tests named:

- `test_repeated_real_failures_reach_conditional_lesson_without_candidate`
- `test_insufficient_and_non_learning_inputs_finish_without_candidate`
- `test_user_correction_and_scoped_preference_take_separate_governed_paths`

The first test must inspect durable objects, not only returned Python models. The second
must include `stage-a:usage-invalid`. The third must prove the preference is retrievable
only under its exact user/workspace/purpose scope.

Before integration edits to production, run:

```powershell
uv run pytest tests/integration/test_alpha_c_learning_intake.py -q
```

Record a genuine behavior RED. If all tests pass without production edits, the integration
test is evidence-only and no product change is permitted.

### Step 2: Apply only evidence-driven fixes

Fix only defects directly exposed by these tests. Do not add orchestration, automatic
experiments, Candidate generation or Alpha-B changes. Re-run the integration file after
each fix until green.

### Step 3: Fresh serial release gates

With `UV_CACHE_DIR`, `TEMP` and `TMP` pointing to `D:\DevData`, run serially:

```powershell
uv run pytest tests/unit/test_learning_intake.py tests/integration/test_alpha_c_learning_intake.py -q
uv run pytest tests/unit/test_learning.py tests/integration/test_vertical_slice.py tests/integration/test_alpha_trial.py tests/integration/test_alpha_comparison.py -q
uv run pytest tests/alpha -q
uv run pytest -q
uv run ruff check .
```

Install Node dependencies offline with the shared D: store only if missing, then run the
repository's existing scripts for:

- full Vitest;
- workspace TypeScript typecheck;
- Runtime Bundle build;
- rc.6 public-surface check; and
- zero private imports.

Use the exact commands documented in the current `package.json` and canonical handoff;
record their output and counts honestly. Do not run real Docker or provider switches.

### Step 4: Independent reviews and canonical handoff

Obtain a fresh read-only correctness review of the entire stage diff against the approved
design. Resolve every Critical and Important finding through a new RED/GREEN cycle. Then
obtain a separate Ponytail/YAGNI review; the expected standard is no speculative
abstraction and no Candidate/Runtime scope creep.

Create:

`docs/operations/tianwen-alpha-c-learning-intake-handoff.md`

The handoff must include:

- the first-slice conclusion and explicit statement that full Alpha-C is not complete;
- completed and prohibited scope;
- all frozen schemas and decision rules;
- RED/GREEN and full release commands/counts;
- review verdicts;
- real model request/token/CNY and real Docker counts, all zero;
- branch and exact implementation/stage SHAs;
- merge advice against the then-current `main`;
- `Pending user decisions` (`None` unless a true authority/product decision exists);
- the only recommended next entrance, which may not be Candidate generation without a
  new supervisory decision.

Commit integration evidence and handoff in separate normal commits. Push the stage branch
without rewriting history.

### Step 5: Report before any next phase

Send a structured stage report to auxiliary task
`01a00d5a-8974-7c41-b660-127c15fcecb6` containing conclusion, scope, SHAs, push/merge
state, tests, both reviews, live budget usage, residual risks and exactly one recommended
next entrance. Stop and wait for its decision; do not enter Candidate generation.
