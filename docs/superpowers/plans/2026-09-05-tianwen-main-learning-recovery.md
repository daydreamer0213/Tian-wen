# Main Learning Recovery Implementation Plan

> **For agentic workers:** Use subagent-driven-development; execute this bounded repair without repeated continuation approvals.

**Goal:** Give an ordinary main conversation a truthful learning progress view and the existing exact-parent recovery action.

**Architecture:** Reuse `projectLearningAudit`, native per-Agent tools and `TianwenLearningLoopService`'s existing lane. The separate preflight tool mismatch is not changed by this task.

**Tech stack:** TypeScript, Cordis/DSH public APIs, Vitest.

## Global Constraints

- Preserve the real Candidate, protocol, feedback, ledger, model configuration and existing evaluation gates. Never run model requests or edit the isolated profile as part of implementation.
- Status is read-only. Continuation does not grant consent, widen analyst rights, create a Candidate, promote directly or replay completed evaluation arms.
- All tools are ordinary-main-only; reject subagent and controlled Agent callers even on direct execution. Recovery cannot target another main Session or a recycled lifecycle.
- No new dependencies, persistence store, scheduler or generic natural-language matcher. Retain the existing short-message and native goal resume paths.
- Use apply_patch. You are not alone; do not revert or commit another worker's changes. Main owns operation and route records.

## Task 1: Main status and exact-parent recovery tool

**Files owned:**
- Modify `packages/tianwen-runtime-bundle/src/learning-consent-agent.ts`.
- Modify `packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.ts`.
- Modify `tests/dsh-migration/learning-consent-agent.spec.ts`.
- Modify `tests/dsh-migration/learning-loop-orchestrator.spec.ts`.
- Only if required by the added main tool, update the exact tool-set expectation in `tests/dsh-migration/runtime-composition.spec.ts`; no unrelated changes.

**Interfaces:**
- Reuse `projectLearningAudit` from `learning-clue-status.ts` without changing that projection.
- Add `currentSession.learning`: `{ owner: 'tianwen-runtime', items, truncated }`, with current-main audit items capped at eight, using existing newest-first order. The ledger contains safe digest/receipt data; do not copy submission bodies, correction text or transcripts.
- Extend status/tool guidance with Runtime ownership of evaluation/activation, analysis-only child ownership, unchanged counts not proving unchanged evaluation, and the continuation tool as the action for a user's natural continuation request. No filesystem investigation is required to use the snapshot.
- Add `tianwen_learning_continue`, exact empty-object arguments, ordinary-main-only registration and execution checks matching status. Do not accept target IDs.
- Make the existing `continueFromMain` service entry callable by the tool, preserving exact live main lifecycle checks, current support/consent checks and existing lane coalescing. Do not add a second recovery implementation.
- Consider resumable only `pending-parent`, `running`, `candidate-ready`, `shadow-ready`, or `failed` with a valid retry phase. Terminal, unrelated or inactive-support work is not resumed.
- Acknowledge `{ state: 'scheduled', scheduledAnalyses: number }` if valid work was scheduled, `{ state: 'no-resumable-work', scheduledAnalyses: 0 }` otherwise, and `{ state: 'unavailable', scheduledAnalyses: 0 }` if the loop service is absent. The response must explicitly say scheduling does not imply evaluation success.

- [ ] Add focused failing tests for a failed/candidate-ready audit with existing candidate/evaluation receipts and recovery phase; current-main isolation, newest-first cap/truncation, and ledger/model-call immutability.
- [ ] Add focused failing tests for empty arguments, main-only registration/direct-call protection, retained-work scheduling, missing service, terminal/revoked/unrelated/recycled-lifecycle no-op, and repeated scheduling coalescing. Reuse existing mounted public service fixtures; do not test only a mock matcher.
- [ ] Implement the smallest changes above. Do not expand the regex or add analyst tools.
- [ ] Run both focused migration suites plus any modified composition suite, root typecheck and `git diff --check`. Do not run the full repository suite in this bounded task; the route's final gate owns that.
- [ ] Commit only owned files, self-review, and write complete RED/GREEN evidence in the task report. Return commit IDs, concise test summary and concerns for independent review.
