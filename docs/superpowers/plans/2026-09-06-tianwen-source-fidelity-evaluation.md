# Source-Fidelity Evaluation Implementation Plan

> For agentic workers: use subagent-driven-development, sequential implementers
> and independent task reviews. Do not deploy an incomplete protocol path.

**Goal:** Measure the actual source-summary defect with an independent comparison
and an unseen-material quality gate, without changing completed evaluations.

**Design:** [Source-fidelity evaluation](../specs/2026-09-06-tianwen-source-fidelity-evaluation-design.md).

**Architecture:** New immutable source-fidelity policy/version using the existing
Evaluation → Shadow → transition chain. Ten paired Runs, one aggregate blind
review, one holdout product Run, one independent holdout quality Run, one
activation Run: fourteen, while legacy remains thirteen.

## Global Constraints

- Never modify, regrade, migrate or rerun the completed procurement Candidate
  `d7d9fdcf...a82a8` / evaluation `91783db7...1db58`. New policy is only for new
  pre-Candidate protocols. Preserve old v2 canonical bytes, hashes and replay.
- No real models, isolated Profile edits, daily installation changes, source
  admission changes, publishing or dependency installs in worker tasks. Controller
  owns genuine UI acceptance and all operation/design/handoff records.
- Keep native model/provider/retry/permission/tool and source-packet limits. No
  scripted product answers or historical evidence writes; tests remain labelled
  mechanism coverage. Accepted canonical tool submissions, not final prose, are
  evaluator material.
- Builder accepts only verified source identity/packet, fixed packet version and
  frozen environment. It must not receive analysis submission/candidatePatch,
  expected answers or desired winner. Actual feedback target turn is verified.
- Add `source-fidelity` to the rubric with serialized score key `sourceFidelity`
  using existing integer anchors 0–4. Original Candidate must improve by >=1;
  other paired fidelity scores cannot decrease. Preserve old four-dimension
  quality rules and all ID hard gates. Ties alone are never improvement.
- New Shadow needs ID met plus independently evidenced holdout scores >=3 in all
  five dimensions before pass/ready. No old ID-only passing result followed by an
  optional quality attachment. Keep the order and existing transition gate.
- No pre-blind store/state, generic evaluator framework, scheduler, extra provider
  or direct promotion shortcut. Reuse existing public/native execution seams.
- Every worker is not alone: preserve other edits and commit only owned files.
- The new policy is for new explicit-feedback analyses only. Outcome-origin
  analyses have no feedback target and keep the existing legacy product path;
  never fabricate feedback or make that route unavailable as a side effect.

## Task 1: Versioned domain contracts, reducers and replay

**Owned files:**
- `packages/tianwen-evolution/src/controlled-skill-evaluation.ts`
- `packages/tianwen-evolution/src/controlled-skill-shadow.ts`
- `packages/tianwen-evolution/src/ledger.ts`
- `packages/tianwen-evolution/src/index.ts`
- If needed, one small pure policy module
  `packages/tianwen-evolution/src/controlled-skill-source-fidelity.ts`; no new store.
- `tests/dsh-probe/controlled-skill-evaluation.spec.ts`
- `tests/dsh-probe/controlled-skill-shadow.spec.ts`

**Contract:**
- Introduce one explicit source-fidelity policy/rubric version and distinct v3
  records where serialized semantics change. New score fields are required for
  this version, never silently defaulted. Old v2 objects remain exactly unchanged.
- Freeze original source identity/digests and fixed packet-version/holdout-review
  contract before Candidate creation. Preserve five paired task types and order.
- Version the objective-to-blind gate: only the new policy may send clean ID ties
  to blind quality; final evaluation applies the design's explicit quality and
  original-task fidelity improvement requirements. Evaluation pass permits Shadow
  but is not complete promotion readiness.
- Extend the new Shadow plan/observation/result with a fixed independent review
  Session/rubric contract and exact accepted-material/evidence binding. Add only
  the narrow typed ledger event/accessors needed for durable native observation.
  No pass/ready with missing, foreign, stale, inconclusive or insufficient review.
- Existing transition construction must require the complete new Shadow proof;
  retain old v2 behavior. Completed results are idempotent; drift is rejected.

- [x] Write RED tests for ID ties plus actual prose-quality score differences,
  missing source-fidelity scores, fake improvement/role swaps, and holdout ID-met
  with quality failure. Include old-v2 unchanged rejection/replay assertions.
- [x] Implement minimal versioned contracts/reducers/ledger integration, including
  strict validation of source/protocol/evidence/config identity and no defaults
  that would change an old record's hash.
- [x] Prove incomplete Shadow cannot activate; prove matching complete evidence
  can proceed through existing readiness/transition construction. Keep fixtures
  deterministic and explicitly mechanism-only.
- [x] Run both owned domain suites, relevant existing ledger replay tests, root
  typecheck and diff check. Report exact RED/GREEN commands, outputs, API additions
  and any integration obligation; commit only owned files for task review.

Completed at `9efcf87`: 51 focused/domain replay checks, root typecheck and diff
check passed; independent spec/quality review Approved. Native reviewer/material
authenticity remains Task 3's explicit responsibility; this is mechanism proof.

## Task 2: Exact native source recovery and deterministic protocol construction

**Owned files:**
- `packages/tianwen-runtime-bundle/src/explicit-correction-protocol.ts`
- `packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.ts`
- `packages/tianwen-runtime-bundle/src/research-summary-admission.ts`
- `packages/tianwen-runtime-bundle/src/outcome-learning-intake.ts`
- `packages/tianwen-runtime-bundle/src/runtime.ts`
- If justified by shared extraction, one small
  `packages/tianwen-runtime-bundle/src/research-summary-source-case.ts`.
- `tests/dsh-migration/explicit-correction-protocol.spec.ts`
- `tests/dsh-migration/learning-loop-orchestrator.spec.ts`
- `tests/dsh-migration/research-summary-admission.spec.ts`
- `tests/dsh-migration/learning-loop-controlled-executor.integration.spec.ts`
- Narrow transitive legacy-compatibility repair only:
  `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts` and its
  existing `tests/dsh-migration/controlled-lifecycle-command.spec.ts` coverage.

**Contract:**
- Recover exactly one frozen source packet and accepted canonical submission
  using existing native Session/Evidence projections. Verify the actual feedback
  target assistant message and completed turn; do not assume turn 1. Reject
  ambiguity, stale acceptanceSubjectDigest, wrong message/turn/tool/evidence or
  unavailable source rather than substituting the old packet library.
- Construct the new original task from that packet and freeze a fixed adjacent
  fidelity packet plus a separate unseen fidelity holdout. Keep three preservation
  classes. No task generation from Candidate content or feedback instructions.
- For retained protocols, resolve the exact frozen legacy/new version first;
  scope-only selection of the latest builder is prohibited. Reconstruct the same
  task/material/config digests and reuse existing workspaces and Session IDs.
  Include the pre-Candidate crash window with an already frozen legacy protocol;
  absence of Candidate/evaluation IDs does not make that protocol new.
- Select new source fidelity only for explicit-feedback analyses before their
  first freeze. New Outcome-origin analyses continue the legacy builder unchanged.
  Cover that route so a missing feedback target cannot disable Outcome learning.
- Supply Task 1's policy/rubric/holdout-review fields through the existing executor
  seams; no new external setting/feature-flag matrix. Do not deploy before Task 3.
- Keep the legacy one-lifecycle v1 receipt schema unchanged. Its stopping adapter
  maps new v3-only evaluation rejection codes to existing `evaluation-failed`;
  ordinary source-fidelity reporting retains the precise reasons. This closes a
  transitive type mismatch exposed by Task 2, without adding a new demo path.
- Missing/stale native source must stop before new formal effects through the
  existing interrupted/failed path. Do not reinterpret it as the old domain
  `protocol-unavailable` condition or weaken that ledger guard. Retain unsupported
  scope behavior. Cover the exact-parent case with the real ledger, not only mocks.
- Preserve existing native executor integration scenarios as explicitly retained
  legacy-v2 fixtures; new v3 native evaluation/holdout integration is Task 3.
- Source prefix recovery must process a normally appended long Session without
  repeatedly serializing all preceding events. A retained genuine 19,291-event
  Session reproduced excessive CPU time; preserve the exact existing JSON-array
  digest and ambiguity checks with the native incremental hash operation.

- [x] RED: exact source changes original task; Candidate-text changes cannot change
  tasks; target-turn mismatch/stale source fails; old v2 recovery still uses old
  packets/rubric after the new builder exists; holdout is absent from paired inputs.
- [x] Implement source recovery and deterministic version dispatch, with raw
  content retained only in existing native/Runtime materials.
- [x] Cover missing source truthful interruption, no synthetic fallback, old
  completed Candidate terminal behavior and fixed schema/order/digests.
- [x] Run owned focused suites, root typecheck and diff check; report exact TDD
  evidence and new input/API contract; commit only owned files for task review.
  Include a forced package type build so an incremental cache cannot hide the
  changed evaluation-reason union in an unchanged legacy consumer.

Completed at `9bf66f4` after `f11bee5`: 136 original focused checks and 96 covering
fix checks, forced all-package/root typechecks and diff check passed. Independent
review's retained-environment and holdout-identity findings were both addressed
in one fix round; scoped re-review found no new breakage. The read-only genuine
source recovery check preserves the old result but does not prove v3 efficacy.

## Task 3: Native blind/holdout semantic execution and complete route integration

**Owned files:**
- `packages/tianwen-runtime/src/skill-evaluation.ts`
- `packages/tianwen-runtime/src/index.ts` only if required for the public seam.
- `packages/tianwen-evolution/src/runtime-binding.ts` only to expose the reviewed
  Shadow review observation read/write methods through the existing service.
- `packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.ts`
- `packages/tianwen-runtime-bundle/src/explicit-correction-protocol.ts` only for
  native input/output integration with the reviewed builder.
- `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts`
- `tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts`
- `tests/dsh-probe/controlled-skill-activation-runtime.spec.ts`
- `tests/dsh-migration/learning-loop-orchestrator.spec.ts`
- `tests/dsh-migration/learning-loop-controlled-executor.integration.spec.ts`
- `tests/dsh-migration/runtime-bundle.spec.ts` only for exact packaging-boundary
  registration and covering tests for the reviewed new local modules.

**Contract:**
- Honor policy-specific pre-blind gates in Runtime as well as Evolution. Provide
  the exact new rubric and strict score tool schema to the existing one aggregate
  evaluator, retaining randomized X/Y and accepted-submission material verification.
- After a passing evaluation, run the new holdout product and independent quality
  reviewer in separate native Sessions. Reviewer sees only its frozen packet and
  accepted canonical submission, not pairs, patch, feedback or role/version IDs.
- Reuse existing evaluator permissions/config/retry/Evidence checks; no generic
  evaluator abstraction. Persist exact quality observation before Shadow result.
  Fail/inconclusive ends honestly without activation or alternate-model retries.
- Forward the domain's Shadow review observation methods through the ordinary
  Evolution service, using its existing write/commit-unknown handling. Cover the
  actual service in native Runtime tests; direct ledger access is not a substitute.
- Reuse completed product/review receipts on restart. Do not duplicate completed
  Runs; partial unsupported recovery remains retained and inconclusive. Preserve
  main-session progress/ownership and native activation verification.

- [x] RED: source-fidelity clean ID ties reach one real native evaluator boundary;
  false improvement is rejected; semantically bad holdout with correct IDs cannot
  activate; missing/swapped/stale accepted material or reviewer evidence fails.
- [x] Implement the narrow native path and retained-version dispatch integration.
- [x] Verify successful-path accounting is 14 Runs for new / 13 for old, no
  repeated completed work, no leakage of X/Y/patch/feedback into holdout reviewer,
  no fifth gate, and incomplete quality cannot produce Shadow readiness.
  Add new-v3 native execution coverage alongside Task 2's retained-v2 integration
  fixtures; do not reinterpret those legacy fixtures as proof of the new path.
- [x] Run covering runtime/domain/migration regressions, root typecheck, build,
  public-API guard and diff check. Include the previously deferred cheap
  research-tool-presence detail test when touching this preflight suite. Commit
  only owned files and provide exact report for independent review.
  Exercise the Runtime/status artifact input allowlists after building. Register
  only evidenced new local modules, with existing foreign/native/private-import
  rejection tests retained; do not broaden allowed directory roots.

Completed at `87f09d1` after `95642de`: 374 original covering checks; fix round
passed 207 native checks plus 64 artifact checks after forced type rebuild then
bundle rebuild. Independent full review's native envelope/schema binding finding
is fixed and scoped re-review approved. Native Context close/reopen coverage is a
deferred Minor for final review; same-Context retry is not that proof. These are
mechanism gates, not new real-model efficacy or a deployed product.

## Controller closure (not delegated implementation)

- [ ] Reconcile task reviews; run full regression and independent whole-branch
  correctness/architecture/simplicity review at exact source SHA.
- [ ] Build a separate isolated artifact and pass the native dependency-identity
  gate before any genuine model run. Preserve original Candidate/result forever.
- [ ] Use ordinary native UI, the fixed approved external source and only genuine
  warranted feedback for any new analysis; preserve no-case/tie/rejection outcomes.
  Observe named source inspection/adaptation, new evaluation, Shadow and activation
  if naturally produced; do not mark unobserved branches passing.
- [ ] Resume the remaining total-route tasks, including ordinary future-task proof,
  second-generation parent risk, exact-main CI and authorized local delivery only
  after their own gates. No public release is implied.
