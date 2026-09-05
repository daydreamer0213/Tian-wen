# Repeated ordinary outcomes → experience consolidation

Status: A–D implemented and verified locally on 2026-09-05; source checkpoint is uncommitted, not an installed release. User approved continuing the learning roadmap on 2026-09-04. This is its first stage, not completion of exploration or general capability learning.

## Product decision

Use the existing bounded `research-summary` capability as the first ordinary-task source. A successful tool submission is not evidence that its content met the task. Apply its existing deterministic requirement checker to the frozen packet and accepted submission. This checks required finding/uncertainty coverage, not general prose quality. No extra model judge at intake.

Replace the deliberately incomplete diagnostic base prompt with a normal prompt covering required findings and decision-relevant uncertainty. Preserve historical frozen Run manifests and explicit scope pointers; do not rewrite past Outcomes or reclassify old capture-only records as evaluated evidence. New acceptance contracts have a distinct version and parent-version identity, so recurrence cannot accidentally combine different Skill parents or the legacy capture contract.

Repeated failures from distinct eligible Runs use the existing Signal/Ticket threshold, Case, Attribution, Lesson, Candidate, controlled comparison, promotion and rollback machinery. One-off failure, success, interrupted execution and environment errors do not independently start learning. Supporting Runs and available matching successful counterexamples are frozen at analysis request; later Ticket growth does not mutate that analysis. If evidence does not support a Skill change, report that result instead of manufacturing a Candidate or extra experiment.

## Native interaction and consent

Everything stays in the main DSH conversation. Reuse native children, permissions, learning progress and continuation. No custom approval UI, new scheduler or second execution queue. Existing feedback-only consent must not silently authorize cross-task outcome analysis: extend the existing main-conversation notice/consent contract once for the new source; no per-Case approval. Only bounded relevant task inputs/results are supplied, treated as untrusted evidence, not instructions. Do not fabricate feedback records to enter the existing pipeline.

## Implementation slices

- [x] A. Ordinary-task evidence: honest base Skill; objective accepted-result projection/attestation; versioned acceptance identity; legacy pointer compatibility; focused runtime tests. Implemented and verified at source/runtime mechanism level; not a packaged-app or natural-efficacy claim.
- [x] B. Outcome-origin analysis: minimal explicit origin in durable analysis request, frozen supporting/counter Runs, authoritative evidence projection and existing Case materialization. Preserve feedback behavior and historical replay.
- [x] C. Native integration: extend existing consent source disclosure, admit eligible repeated tickets, route existing analyst/orchestrator and main progress through the common lifecycle. No duplicate evaluations or approvals.
- [x] D. Acceptance: scripted native lifecycle coverage plus three ordinary, illustrative real-model UI tasks using the normal baseline. All three returned `met/no-case`; this demonstrates non-triggering, not learning improvement. No baseline weakening or answer retry.

## Verification boundaries

Write failing behavior tests before each implementation slice. Test malformed/incomplete results, same-version recurrence, cross-version and legacy isolation, idempotent replay, no-case/insufficient evidence, existing feedback path and unchanged normal chat. Run affected suites and type checking once changes settle; broaden only when evidence warrants it. Scripted fixtures demonstrate mechanics, not natural effectiveness. Packaged UI/model acceptance and release/install remain separate outstanding evidence until actually run.

No new dependencies, installs, worktrees or large generated assets are needed. Use the existing D: worktree and test data locations. No automatic commit, push, release or installer claims in this stage.

## Historical 2026-09-04 A checkpoint (superseded for current status)

Implemented A, plus the narrow immutable `getOutcomeIntake(runId)` read projection needed by B to find persisted successful counterexamples. B's durable outcome-origin analysis request, C's native intake/consent integration, and D's real-task acceptance remain unimplemented. Outcome Signal/Ticket collection alone is not the automatic learning loop.

Independent read-only review found a real queued-follow-up defect: waiting for the whole Agent to become idle let a later ordinary turn change the first task's result. The new native two-turn regression reproduced `inconclusive` instead of `not-met`. Reconciliation now freezes the first task's completed event boundary immediately and uses the same snapshot for acceptance, Outcome and Skill-use proof. The review finding is closed after a targeted re-review.

Final verification on this uncommitted checkpoint:

- `corepack pnpm run typecheck`: exit 0.
- Seven affected suites: 100 tests passed, exit 0 (22.58 seconds). Suites: research-summary-admission, research-summary, outcome-intake-runtime, outcome-intake, explicit-correction-product.e2e, skill-governance-runtime, learning-loop-controlled-executor.integration.
- The controlled-scripted suite requires `TIANWEN_DSH_PROBE_ROOT=D:\DevData\tianwen-dsh-probe`. The first broader invocation omitted this environment setting and its cancellation fixture waited for generation after a preflight failure. A bounded early-exit assertion now reports that situation instead of silently waiting; the correctly configured suite passes. No production guard was weakened.
- `git diff --check`: exit 0.

The product-story test still uses a scripted model. Its deliberately supplied failures validate the mechanism with the normal production Skill; they do not prove spontaneous improvement. No real-provider call, packaged UI trial, installer, release, commit or push was performed in this checkpoint.

Next: implement B/C against the existing analysis lifecycle, using a genuine outcome origin (never fake feedback), a frozen supporting/counterexample batch and the existing main-conversation consent disclosure. Keep evidence insufficient when no suitable counterexample exists; do not invent another evaluation solely to create one. Freeze the existing controlled protocol before materializing a Case/Candidate, and do not reopen the Case against a Ticket that has grown since analysis began.

## 2026-09-05 A–D checkpoint

B/C now use an explicit outcome-origin analysis request, frozen two-failure/one-success evidence, the existing native analysis child, and the common Case → Candidate → controlled evaluation → adoption lifecycle. They do not fabricate feedback. Consent v2 discloses the new bounded cross-task source once; prior consent is readable but does not silently authorize it. Only results recorded after consent are eligible.

Review and native regression tests exposed and closed three reachable defects: source material accidentally included later turns; two Cordis services lacked their new injected dependencies; and a cold-start analysis could not continue through the main conversation. Cold analyses now remain suspended until main-chat `继续` or native Goal resume. They resume the exact persisted child, retaining a retry marker if native followup fails. No new durable queue, approval UI, or evaluator was added. Both outcome binding and native integration received independent read-only review; the final two recovery findings were rechecked and closed.

Current local gates on HEAD `93e341e4da8c9a24693bb22e817935cd22385dbb` plus this uncommitted patch:

- 13 affected suites: **200 tests passed**, exit 0, 35.02 seconds. Includes ordinary recurrence, no-case/no-counter, consent boundary, immutable source turns, explicit-feedback regression, and interrupted analysis resumed only by main-chat continuation.
- Root `corepack pnpm run typecheck`: exit 0; `git diff --check`: exit 0.
- Real DeepSeek-V4-Flash High through native DSH Web `0.1.1-rc.2`, current source bundle: three separately initiated main-conversation `/research-summary` tasks, one attempt each, all **`met/no-case`** with exact native direct-invocation Skill-use records. No analysis request, child, Candidate, evaluation, or pointer transition was created.
- Trial root: `D:\DevData\tianwen-outcome-ordinary-20260905`. Runtime SHA256: `F365123E4DC1E49E310E2059C5E5EBB12FFF84CE58CD8676B44E885CF04C3B80`. Full receipt: `docs/operations/tianwen-outcome-experience-loop-handoff.md`.

The UI tasks used illustrative packets, not genuine project backlog work. They prove ordinary main-chat operation and non-triggering with a competent baseline, not natural learning efficacy. The empty trial workspace was pre-registered through DSH's public workspace API after the native directory picker could not receive automation input. Task entry and completion used the real browser UI. This is not a clean installer/Desktop acceptance or release claim. No commit, push, install into the user's profile, or external release occurred.

Next roadmap stage: bounded hypothesis/exploration inside an eligible learning case. Reuse DSH execution and the current evidence lifecycle; distinguish collecting missing causal evidence from validating a Candidate. Do not append exploration to every analysis or duplicate the existing comparison/holdout checks.
