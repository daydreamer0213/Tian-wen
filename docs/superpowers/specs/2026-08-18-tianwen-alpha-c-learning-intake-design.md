# Tianwen Alpha-C Learning Intake Design

**Status:** Approved architecture, implementation pending  
**Date:** 2026-08-18  
**Scope:** Alpha-C first narrow slice only

## 1. Decision

Add one small Python boundary, `tianwen.learning_intake`, between durable real-world
outcomes and the existing governed learning objects. It will:

1. project a real verifier outcome or structured user feedback into a privacy-safe
   `OutcomeObservation`;
2. group compatible observations into an `ObservedGap`;
3. record a deterministic triage decision;
4. create a `LearningSignal -> LearningTicket -> CaseRecord` chain only for a repeated,
   attributable real problem or an explicit user correction;
5. validate a persisted attribution before accepting a conditional `LessonRecord`; and
6. record an explicit terminal receipt whose `candidate_version_id` is always `None`.

The slice proves governed intake and stopping behavior. It does **not** generate an
Artifact Candidate, run a Champion/Challenger comparison, promote, enter Shadow, or
change the Runtime.

## 2. Why this boundary exists

The repository already has immutable Signals, Tickets, Cases, Attributions and Lessons,
but callers can currently create them from manually supplied values. There is no durable
receipt showing which real outcome was observed, why it qualified for learning, or why
the chain stopped without a Candidate. That gap makes a one-off failure look too similar
to repeated evidence and lets a Lesson be accepted without proving the full chain.

The new boundary supplies those missing facts without replacing the existing learning
engine or building a new workflow framework.

## 3. Considered approaches

### A. Thin intake module plus backward-compatible learning checks — selected

`learning_intake.py` owns projections, triage and conclusion receipts. `learning.py`
continues to own Signal, Ticket, Case, Attribution and Lesson rules. Existing callers keep
working; the new governed path uses stricter optional provenance fields and validation.

This keeps Candidate code physically outside the new module and gives negative outcomes
an auditable home.

### B. Put every new rule in `learning.py` — rejected

This would use fewer files but would mix observation intake with Candidate generation and
make it easier for the first slice to grow into the later Alpha-C stages.

### C. Add only an application facade — rejected

A facade could route calls but could not prove durable outcome provenance, triage replay,
or the normal no-Candidate result. It would preserve the current evidence gap.

## 4. Authority and non-goals

This design implements the approved sequence from:

- `docs/superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md`;
- `docs/superpowers/specs/2026-08-13-real-task-alpha-roadmap-design.md`; and
- `docs/architecture-master-session-memory.md`.

The following are explicit non-goals:

- no Artifact Candidate creation or mutation;
- no changes to Alpha-B pair comparison;
- no Promotion or Shadow behavior;
- no Runtime, DSH, prompt, scheduler or tool-loop changes;
- no external Skill market;
- no real model or real Docker call;
- no generic event bus, workflow engine or plugin framework;
- no claim that this narrow slice completes all of Alpha-C.

## 5. Data model

All new records are frozen Pydantic models, content-addressed where practical, and written
through `StateStore.put_immutable_object`. New record kinds are added to the immutable
governance allow-list.

### 5.1 `OutcomeObservation`

An observation is a privacy-safe projection, not a copy of a transcript, workspace or
model response.

```python
class OutcomeObservation(FrozenModel):
    outcome_id: str
    source_kind: Literal["trial_verifier", "user_feedback", "operational"]
    source_id: str
    source_digest: str
    outcome_kind: Literal[
        "verified_failure",
        "verified_success",
        "explicit_user_correction",
        "persistent_user_preference",
        "one_off_user_choice",
        "runtime_failure",
        "capability_discovery",
        "model_self_assessment",
        "ordinary_low_score",
    ]
    capability_scope: str
    task_id: str | None = None
    goal_id: str | None = None
    run_id: str | None = None
    trial_id: str | None = None
    problem_fingerprint: str | None = None
    evidence_ids: tuple[str, ...] = ()
```

`source_digest` binds the complete source receipt while the observation stores only the
minimum fields needed for triage. It must never contain a raw workspace path, diff,
prompt, free-form user text, credential, or model self-analysis.

For a Trial source, the projector takes the Trial's own `StateStore`, reloads and exactly
matches the durable `TrialResult`, `TrialManifest` and every referenced `EvidenceRecord`,
and requires final-verifier Evidence to bind the same trial/run. Callers do not supply a
fingerprint or capability scope. The projector derives them from the frozen receipt:

```text
capability_scope =
  repo_task_skill/<champion_version_id>/task/<task_id>@<task_version>

problem_fingerprint = digest(
  schema + capability_scope + model_id + task_bundle_digest + model_input_digest
  + baseline_tree_digest + verifier_digest + verdict
  + sorted(failure_categories) + execution_status + verification_status + boundary_status
)
```

Only a completed verifier result with `verdict="not_met"`, `boundary_status="passed"`
and non-empty failure categories is a qualifying verified failure. Other Trial results can
be observed but do not contribute to recurrence.

After source-store validation and before the Outcome is written, the projector copies the
exact validated `EvidenceRecord` objects into the governance store through immutable
replay. A same-ID/different-payload collision fails closed. This lets later Case,
Attribution and Lesson checks reload Evidence without persisting an absolute Trial-store
path or trusting the caller again.

For user feedback, the caller supplies a stable feedback ID and digest, one of the three
structured kinds, a Trial store and a durable Trial ID. The projector reloads the Trial
Result and Manifest and derives the capability scope from their task/artifact identity;
the caller cannot name a different task or Champion. An explicit correction additionally
requires Evidence whose `source_class` is `user`, whose scope is `trial:<trial_id>`, and
whose provenance contains that feedback ID. Original feedback text is not copied into the
observation. Its problem fingerprint is the digest of the feedback digest plus the
derived capability scope, so neither free-form text nor caller-selected identity enters
the qualification key.

### 5.2 `ObservedGap`

```python
class ObservedGap(FrozenModel):
    gap_id: str
    problem_fingerprint: str
    capability_scope: str
    outcome_ids: tuple[str, ...]
    evidence_ids: tuple[str, ...]
    recurrence: int
```

The intake service sorts and de-duplicates IDs before hashing. Every observation must
have the same non-empty capability scope and problem fingerprint. `recurrence` counts distinct
source IDs, not repeated reads or retries of one receipt.

An explicit correction may form a one-observation gap. A real-problem gap must contain
at least two distinct, verifier-backed failed trials. A capability discovery, operational
failure, model self-assessment or ordinary low score cannot be mixed into such a gap.

### 5.3 Learning provenance fields

`LearningSignal` gains backward-compatible optional fields:

```python
source: Literal[
    "legacy", "repeated_attributable_issue", "explicit_user_correction"
] = "legacy"
observed_gap_id: str | None = None
problem_fingerprint: str | None = None
capability_scope: str | None = None
```

The existing legacy API keeps its current behavior. The new intake path accepts only the
two governed sources, requires an existing matching Gap, non-empty Evidence, and derives
the Signal ID from the frozen Gap. Severity and `blocks_goal` remain descriptive; neither
can independently qualify an Alpha-C Signal in this slice.

`LearningTicket` gains optional `problem_fingerprint` and `capability_scope` fields with
`None` defaults. For the governed path, they are copied from the Signal.

`CaseRecord` gains defaulted `ticket_id`, `observed_gap_id`, `problem_fingerprint` and
`capability_scope` fields. The governed `create_case` path populates them and also uses
`outcome="gap:<gap_id>"` plus Gap Evidence. Its legacy default remains unchanged. This
keeps structural governance relationships out of free-form text.

`capability_scope` means the exact task/artifact applicability boundary. It is distinct
from `mutation_target` and the existing `LessonRecord.target_scope`, which name the layer
that may change. In this slice the only mutable target value is `repo_task_skill`.
`LessonRecord` gains an optional `capability_scope` field so a governed Lesson binds both
concepts without changing legacy receipts.

### 5.4 `LearningTriageReceipt`

```python
class LearningTriageReceipt(FrozenModel):
    triage_id: str
    gap_id: str | None
    outcome_ids: tuple[str, ...]
    disposition: Literal[
        "observe",
        "current_fix",
        "preference_binding",
        "learning_case",
    ]
    reason: str
    signal_id: str | None = None
    ticket_id: str | None = None
    case_id: str | None = None
    memory_id: str | None = None
    candidate_version_id: None = None
```

The model validates legal field combinations. Only `learning_case` may contain Signal,
Ticket and Case IDs, and it requires all three. Only `preference_binding` may contain a
memory ID. No disposition may contain a Candidate ID.

### 5.5 Attribution provenance

`AttributionRecord` gains optional, backward-compatible fields:

```python
status: Literal["resolved", "unknown"] = "resolved"
ticket_id: str | None = None
observed_gap_id: str | None = None
capability_scope: str | None = None
supporting_evidence_ids: tuple[str, ...] = ()
counterevidence_ids: tuple[str, ...] = ()
```

The governed path reloads Ticket, Case, Gap, Triage and Evidence records. It rejects a
mismatched chain. `unknown` is a valid terminal attribution and never creates a Lesson.
An attribution to a layer other than `repo_task_skill` remains recommendation-only and
also stops without a Lesson in this slice.

`LearningEngine.record_governed_attribution(...)` is a new narrow API that always returns
the persisted record, including recommendation-only records. The existing
`record_attribution(...)` retains its current contract and still raises
`MutationNotAllowed` for an out-of-scope target, preserving legacy callers.

### 5.6 `LearningConclusionReceipt`

```python
class LearningConclusionReceipt(FrozenModel):
    conclusion_id: str
    triage_id: str
    ticket_id: str
    case_id: str
    attribution_id: str
    outcome: Literal["no_lesson", "conditional_lesson"]
    stop_reason: str | None = None
    lesson_id: str | None = None
    candidate_version_id: None = None
```

`no_lesson` requires a stop reason and no Lesson ID. `conditional_lesson` requires a
Lesson ID and no stop reason. The receipt is the durable proof that “no Candidate” is an
expected result rather than an error or an omitted step.

## 6. Intake rules

The decision table is closed: unknown input kinds fail validation rather than falling
through to learning.

| Input | Disposition | Learning objects |
|---|---|---|
| One verified failure | `observe` | none |
| Two or more distinct verified failures with the same fingerprint and scope | `learning_case` | Signal, Ticket, Case |
| Explicit user correction | `learning_case` | Signal, Ticket, Case |
| One-off user choice | `current_fix` | none |
| Persistent user preference | `preference_binding` | scoped `MemoryRecord` only |
| Runtime/DSH failure, including Stage A `usage-invalid` | `current_fix` | none |
| Capability discovery | `observe` | none |
| Model self-assessment or ordinary low score | `observe` | none |
| Mixed scope/fingerprint, missing Evidence, or unclear source | fail closed | none |

Persistent preference storage reuses `MemoryFirewall` and `MemoryStore`. It requires
`source_class="user"`, purpose `user_preference`, a non-global user/workspace scope,
provenance and expiry. It never creates a Signal, Ticket, Case or Lesson.

## 7. Lesson gate

A conditional Lesson is accepted only when all of these checks pass:

1. Triage disposition is `learning_case`.
2. Signal, Ticket, Case, Gap and Attribution exist and bind one another structurally.
3. Attribution is `resolved`, has `mutation_target="repo_task_skill"`, and binds the same
   capability scope.
4. All supporting and counterevidence IDs exist.
5. The Lesson is `accepted`, references the Case, and has non-empty `when`, `not_when`,
   Evidence, counterevidence, `target_scope="repo_task_skill"` and capability scope.
6. Lesson Evidence is a subset of persisted chain Evidence, and both scopes match their
   respective structural and mutation meanings.

If attribution is unknown, evidence is insufficient, the causal layer is out of scope, or
the Lesson is absent, the service writes `no_lesson` with a specific stop reason. A
malformed or cross-chain Lesson fails closed and writes nothing.

The existing `create_repo_task_candidate` method is untouched and is neither imported nor
called by `learning_intake.py`.

## 8. Idempotence and failure behavior

- IDs are content digests of canonical, sorted inputs.
- Exact replay returns the already persisted record.
- A different payload under the same ID raises `StateConflict`.
- Validation happens before downstream records are created whenever possible.
- The existing atomic Ticket/child-loop/task transaction is reused.
- A retry after a partial process reconstructs the same IDs and safely completes missing
  downstream immutable records.
- Evidence, provenance or scope mismatch fails closed; it is never converted to a low
  score or zero-valued metric.

This slice does not add a generic transaction coordinator. The bounded chain uses existing
immutable replay plus the Ticket transaction.

## 9. Privacy and threat model

The design protects against accidental evidence confusion, untrusted model claims,
cross-scope preference leakage and replay conflicts. It does not attempt to defend against
the same user intentionally editing the SQLite database or a fully compromised host.

Only digests and stable IDs from raw feedback/model receipts enter the intake record.
Credentials, raw prompts, workspace paths and diffs are excluded. Existing Evidence and
Memory validation remains authoritative.

## 10. Test strategy

All tests are offline and use a temporary SQLite store and fake Trial/Docker evidence.

Focused unit tests will prove:

- exact replay and privacy-safe projection;
- one failure observes, two independent identical failures qualify;
- explicit correction qualifies once;
- one-off choice and Stage A `usage-invalid` do not create a Signal;
- model self-assessment, ordinary low score and capability discovery do not qualify;
- persistent preference writes only scoped Memory;
- derived-scope/fingerprint mismatch and missing Evidence fail closed;
- the qualified chain binds Gap, Signal, Ticket and Case;
- unknown/out-of-scope attribution yields `no_lesson`;
- a valid resolved attribution yields a conditional Lesson;
- invalid chain, missing counterevidence or scope mismatch fails closed;
- all terminal receipts have `candidate_version_id is None` and Artifact/active-pointer
  state is unchanged.

An integration test will run two independent fake A1-style Trial failures into one Gap,
create the governed chain, record both an unknown stop and a valid conditional-Lesson
path, and confirm no Candidate artifact exists. It will also exercise an explicit user
correction and a scoped preference path.

Release verification includes focused tests, existing learning and Alpha integrations,
the full Python suite, Ruff, and the relevant TypeScript/DSH public-surface gates. Real
model calls, tokens, CNY spend and real Docker invocations must all remain zero.

## 11. Completion boundary

This narrow slice is complete when offline evidence proves both:

1. eligible real input can reach a scope-bound conditional Lesson through the full durable
   chain; and
2. ineligible or insufficient input stops honestly with no Candidate and no weakened gate.

Completion does not authorize Candidate generation. That is a separate later Alpha-C
slice requiring a new supervisory decision.
