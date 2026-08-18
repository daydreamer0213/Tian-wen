# Tianwen Alpha-C Learning Intake Canonical Handoff

**Date:** 2026-08-18
**Stage branch:** `codex/tianwen-alpha-c-learning-signal`
**Base main:** `40bc8613d2eeea834bf1f34d43974490493f3864`
**Implementation and integration HEAD before documentation closure:**
`6366a5c593eb971703522970a884c08340a509cf`

## 1. Stage conclusion

Alpha-C's first narrow slice is implemented and offline-proven.

The repository can now take a durable, privacy-safe Trial outcome or structured user
feedback through:

```text
Outcome/Source Authority
  -> Observed Gap and triage
  -> qualified LearningSignal
  -> LearningTicket
  -> Case
  -> governed Attribution
  -> conditional Lesson or explicit no-Lesson stop
  -> Candidate = None
```

This is not full Alpha-C and is not evidence that Tianwen has generated or promoted a
learned Skill. The slice proves the governed intake and stopping boundary only. Candidate
generation, Champion/Challenger execution for a new learning Candidate, Promotion and
Shadow remain closed.

Stage A also remains unchanged: its live proof failed with `request-limit-exceeded`, the
old Goal is active but exhausted at 1/1, and it must never be replayed. Its historical
`usage-invalid` fact is routed as an operational `current_fix`, not Alpha-C learning
Evidence.

## 2. Authority and scope

Implementation follows:

- `docs/superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md`;
- `docs/superpowers/specs/2026-08-13-real-task-alpha-roadmap-design.md`;
- `docs/architecture-master-session-memory.md`;
- `docs/superpowers/specs/2026-08-18-tianwen-alpha-c-learning-intake-design.md`; and
- `docs/superpowers/plans/2026-08-18-tianwen-alpha-c-learning-intake.md`.

Completed scope:

- deterministic, privacy-safe projection of durable `TrialResult` + `TrialManifest` +
  final-verifier Evidence;
- capability scope and problem fingerprint derived from frozen receipts rather than
  caller claims;
- explicit user correction bound to a durable Trial and matching user Evidence;
- append-only source-authority, Outcome, Gap, triage and conclusion receipts;
- strict classification of repeated real failures, single failures, user choices,
  persistent preferences, Runtime failures, capability discovery, model self-assessment
  and ordinary low scores;
- full Signal/Ticket/Case/Attribution/Lesson structural and Evidence binding;
- normal `no_lesson` and `candidate_version_id=None` terminal results; and
- scoped preference persistence through the existing Memory firewall/store.

Explicitly not completed:

- Artifact Candidate generation;
- automatic hypothesis experiment execution;
- Alpha-B comparison extensions;
- Promotion, Shadow or rollback changes;
- Runtime, DSH, prompt, scheduler, model adapter or tool-loop changes;
- a DSH-to-Python Stage-A adapter;
- a generic workflow framework or external Skill market.

## 3. Final governed records

New immutable governance kinds:

- `outcome_source_authority`;
- `outcome_observation`;
- `observed_gap`;
- `learning_triage`; and
- `learning_conclusion`.

`OutcomeSourceAuthority` is the append-only proof that a public projector validated its
durable source. Every Observation binds one authority. Triage reloads and compares the
source kind/ID/digest, Trial/run, outcome kind, capability scope, problem fingerprint and
Evidence IDs before any learning object can be created.

The existing records gained only defaulted, backward-compatible fields:

- `LearningSignal`: source, Gap ID, problem fingerprint, capability scope;
- `LearningTicket`: problem fingerprint and capability scope;
- `CaseRecord`: Ticket ID, Gap ID, problem fingerprint and capability scope;
- `AttributionRecord`: resolved/unknown status, Triage/Ticket/Gap IDs, capability scope,
  supporting Evidence and counterevidence;
- `LessonRecord`: capability scope, while its existing `target_scope` continues to mean
  the mutation layer (`repo_task_skill`).

The legacy `LearningEngine.record_attribution()` behavior is preserved, including
persist-then-raise `MutationNotAllowed` for an out-of-scope target. The new
`record_governed_attribution()` always returns its persisted record, including
recommendation-only results, after the full chain has passed.

## 4. Closed triage table

| Input | Result | Learning artifacts |
|---|---|---|
| One verified failure | `observe` | none |
| Two distinct verifier-backed failures with identical derived fingerprint/scope | `learning_case` | Signal, Ticket, Case |
| Explicit user correction with matching user Evidence | `learning_case` | Signal, Ticket, Case |
| One-off user choice | `current_fix` | none |
| Persistent user preference | `preference_binding` | scoped Memory only |
| Runtime/DSH failure, including Stage-A `usage-invalid` | `current_fix` | none |
| Capability discovery, model self-assessment, ordinary low score | `observe` | none |
| Missing/foreign Evidence, mixed scope/fingerprint, forged or cross-chain receipt | fail closed | none |

Severity, Goal blocking and model self-claims cannot independently qualify a new Alpha-C
Signal through this intake boundary.

## 5. Attribution and Lesson gate

Before governed Attribution persistence, Tianwen reloads and cross-checks Triage,
Outcome/Authority, Gap, Signal, Ticket, Case and all Evidence. IDs, parent loops,
fingerprints, capability scopes, outcome bindings and Evidence sets must agree.

Before Lesson acceptance, the conclusion path repeats the durable Outcome/Authority chain
check. A conditional Lesson additionally requires:

- resolved Attribution;
- mutation target and `LessonRecord.target_scope` equal to `repo_task_skill`;
- matching `capability_scope`;
- the exact persisted Case;
- non-empty `when` and `not_when` conditions;
- supporting Evidence and counterevidence that exist and belong to the Gap.

Unknown attribution, an out-of-scope causal layer or a resolved attribution without a
valid Lesson writes an explicit `no_lesson` conclusion with, respectively,
`attribution_unknown`, `causal_layer_out_of_scope` or `insufficient_evidence`. Every
conclusion has `candidate_version_id=None`.

## 6. TDD and independent review history

Task 1 (Outcome/Gap/Triage/Case):

- initial import RED, then behavior RED `4 failed / 12 passed`;
- initial implementation `5da4c6b19182734d0cc31d741b247b0c1638d529`;
- review found an operational-source bypass, foreign final Evidence and legacy Case-ID
  drift;
- fix commits `ddfaeb644867cee9c07ec1bb778a173a3a847635` and
  `b311f895fe4c58a69a52e7552de383d9d2b21cdd`;
- final focused result `22 passed`; independent verdict C0/I0, approved.

Task 2 (Attribution/Lesson/Conclusion):

- import RED, then behavior RED `5 failed / 23 deselected`;
- initial implementation `1ce080da606d0f07e80aabf9d25a37b2a070517e`;
- review-driven RED/GREEN fixed Outcome/Authority chain, missing/foreign Attribution
  Evidence, Signal binding and capability-scope binding;
- fix commits `359cce5da2a861eebde51a0874d6807ae8dbf4fe`,
  `6fc312b97961ae506e62d8a1bb2ee0600dc06f88` and
  `05deb6141579e19f68e84300cd66be40850fef0a`;
- final intake unit result `32 passed`; independent verdict C0/I0, approved.

Task 3 (offline vertical evidence):

- implementation `69280f2` and authority-preservation fix `6366a5c`;
- three durable paths pass: repeated failure to conditional Lesson, insufficient/
  non-learning stop, and correction/preference split;
- existing active Artifact and ActivePointer are preserved as deserialized objects, raw
  durable rows and exact counts;
- independent verdict C0/I0, approved;
- deferred Minor: the offline Trial fixture duplicates some unit fixture construction;
  it is intentionally not promoted into a new shared test framework in this slice.

Whole-stage final reviews:

- independent correctness review on reviewed content HEAD `61cf50bc06245ee60f3e1f0cdc39c571ee357fc4`:
  C0/I0/M0, approved;
- independent Ponytail/YAGNI review: Lean enough, C0/I0, net deletable scope `0` lines;
- the only initial closure finding was trailing Markdown whitespace in the new design;
  commits `4aeb25a00c01edb8c88b204f05ffd9806f28d79c` and
  `61cf50bc06245ee60f3e1f0cdc39c571ee357fc4` removed it, after which full-branch
  `git diff --check` passed.

## 7. Fresh release verification

All final gates were run serially on implementation HEAD `6366a5c`:

- focused intake unit + integration: `35 passed`;
- existing learning unit + vertical slice: `31 passed`;
- A1-A5 frozen tasks: `10 passed`;
- full Python: `509 passed, 4 skipped`;
- Ruff: passed;
- Runtime Bundle dependency-topology build: passed;
- workspace TypeScript typecheck: passed;
- DSH `0.1.0-rc.6` install/public surface: passed;
- private DSH imports: `0`;
- full Vitest: `244 passed, 7 skipped`;
- `git diff --check`: passed.

The four Python skips are unchanged: one paid live probe not authorized, two Windows
symlink cases unavailable to this account, and one Windows ACL case covered separately.
The seven Vitest skips are existing conditional tests. The first clean-worktree TS build
attempt correctly exposed missing upstream `dist`; the final topology build generated
dependencies first. The first Vitest attempts correctly exposed missing/wrong probe-root
environment; the final run used the repository's required
`D:\DevData\tianwen-dsh-probe` and its controlled Python.

Dependency installation was offline from `D:\DevData\pnpm-store` (`576` reused, `0`
downloaded). Generated data and test state remained on `D:`.

## 8. Budget and external effects

- real model requests: `0`;
- model tokens: `0`;
- CNY consumed: `0`;
- real Docker invocations: `0`;
- Candidate artifacts created: `0`;
- Promotion/Shadow changes: `0`.

The unused Alpha-B CNY 20 approval did not transfer to Alpha-C.

## 9. Residual risks

- This is offline infrastructure evidence, not a real learned Candidate or production
  improvement claim.
- The source authority is an internal integrity receipt, not a cryptographic boundary
  against deliberate same-host bottom-store forgery; that attacker is outside the approved
  threat model.
- Trial-store Evidence copy and governance-store Outcome/Authority writes are replay-safe
  but not one cross-database transaction. Interruption can leave orphan immutable Evidence
  or Authority that a retry completes exactly; it cannot create a Candidate.
- Capability scope intentionally includes the Champion version. A Champion change causes
  the same apparent failure to accumulate fresh evidence instead of silently inheriting an
  older Champion's attribution.
- Post-Ticket multi-Signal merge/upgrade behavior is not expanded in this first slice;
  initial repeated Outcomes are grouped into one Gap/Signal/Ticket.
- No DSH-to-Python Stage-A adapter exists; Stage-A isolation is proven at the intake
  classification boundary and by the unchanged TS receipt tests.

## 10. Pending user decisions

None.

Candidate generation remains unauthorized until a separate supervisory decision. This
handoff does not consume or request a model budget.

## 11. Only recommended next entrance

After this stage is merged, request a separate supervisory decision for one narrow
Alpha-C follow-up: consume one already persisted, qualified real Case and conditional
Lesson; if no such real evidence exists, stop with no Candidate. If it exists, permit at
most one `repo_task_skill` Candidate materialization using the existing Candidate API,
with no Promotion or Shadow and no new Runtime work. Offline design, TDD and review must
precede any model budget request.

Do not enter that follow-up merely because this infrastructure test passed.
