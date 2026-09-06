# Reasoning Evaluation Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let future real reasoning evaluations finish without changing frozen historical attempts or promotion standards.

**Architecture:** Configure the existing native execution window in the v3 protocol builder. Recover the exact persisted old/new window in the existing orchestrator; no Runtime or Evolution execution machinery is added.

**Tech Stack:** TypeScript, Vitest, native DSH evaluation and existing Evolution ledger.

## Global Constraints

- Actual worktree D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge; branch codex/ordinary-summary-semantic-outcome. Do not use app cwd C:0492/AGi. Generated files and caches stay on D:.
- New v3: maxToolCalls 4 and maxElapsedMs 300_000 for all five paired task contracts and holdout; retained v3 reconstructs exact validated 60_000 or 300_000 windows. Mixed/unsupported retained windows must fail before provider activity.
- Legacy v2 and scope-only resolution remain byte/digest equivalent at 60_000. Shared promotion/rollback/restore tasks stay unchanged.
- Existing rubric, pass/holdout rules, model configuration, task counts, native cancellation and partial-session refusal are unchanged. No regrading/retry of genuine G or B, no ledger/history writes by tests outside their fresh fixture directories.
- No new Evolution schema, scheduler, SDK, provider, cost/call quota, dependency, or generalized budget abstraction.
- User delegates routine work and DeepSeek calls. Do not request routine permission. Daily013 and active Desktop dist are not worker targets. Do not package/publish/install or start real model calls in this implementation task.
- Root owns the four other dirty public status/plan documents. Preserve them and every unrelated edit. Never force-add .superpowers scratch.

### Task 1: Future v3 execution windows with exact retained replay

**Files:**
- Modify: packages/tianwen-runtime-bundle/src/explicit-correction-protocol.ts
- Modify: packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.ts
- Test: tests/dsh-migration/explicit-correction-protocol.spec.ts
- Test: tests/dsh-migration/learning-loop-orchestrator.spec.ts
- Test: tests/dsh-migration/learning-loop-progress.spec.ts (only the directly affected failed-progress text assertions; preserve recovery/deduplication checks)

**Interfaces:**
- Extend only the v3 member of ExplicitCorrectionProtocolResolution with optional `executionWindowMs?: 60_000 | 300_000` (strict runtime validation; explicit undefined is invalid).
- `resolveExplicitCorrectionProtocol` uses 300_000 when that optional field is absent for fresh v3, while legacy builders retain 60_000. Thread the selected value through the existing builder closure so `buildProtocolInput` and `buildShadowTasks` agree. Shared `buildExplicitCorrectionTransitionInput` remains on its original constant.
- In `createExplicitCorrectionLearningLoopExecutor.tasksFor`, if retained v3 exists, require exactly five paired task stop contracts and its holdout to have the same supported window and maxToolCalls 4, then pass that persisted value into the resolver. Fresh v3 omits the property. Never infer a retained value from Candidate, prior review outcome, current default, first task only or elapsed time.
- Keep the existing digest equality check in freezeProtocol; it must continue to verify old 60-second v3 exactly after the default changes.
- The actual G failure also exposed false automatic-retry wording. In the SAME existing `learningLoopProgressReport` failed-liveness branch, replace only the two generic failed strings with the exact neutral strings below. Do not change state/recovery/scheduling behavior or rewrite historical messages/cursors. A generic failed phase cannot assert an environmental cause or a guaranteed future retry.
- Preserve exact pending old failed-liveness cursors as well as new ones: through the actual executor.progress route, match the independently calculated old text digest and recover that original text/digest, following the existing learningLoopTerminalReport compatibility pattern. New intents use new text. Unknown retained digests stay refused by the existing guard. No replacement digest or duplicate already-present native report is allowed; this compatibility is narrowly limited to the two former failed-liveness strings.

```ts
// failed / resumePhase promoted
'Tianwen 学习中断：回滚验证尚未完成，当前启用状态未继续改变；恢复时会先核验已保存记录，无法安全续接的尝试不会直接重跑。'
// other failed phases
'Tianwen 学习中断：分析或受控验证尚未完成，候选改进尚未启用；恢复时会先核验已保存记录，无法安全续接的尝试不会直接重跑。'
```

```ts
// Builder selection, using the existing frozen field rather than a new schema.
const selectedWindow = input.executionWindowMs ?? 300_000
// Strictly reject a present undefined, noninteger, string, zero or unsupported number.
// Inside the v3 builder closure only:
const selectedStopContract = { maxToolCalls: 4, maxElapsedMs: selectedWindow } as const
// Orchestrator passes a selected retained window only after checking every
// task plus holdout; shared transitions continue using their original closure.
```

- [ ] Add RED tests: fresh v3 paired/holdout windows are 300_000; old v3 with explicit 60_000 reconstructs independently frozen expected task/holdout contracts and complete protocol digest; new retained v3 300_000 also reconstructs; legacy v2 task/holdout/transition snapshot remains exact at 60_000. Use existing real source/ledger fixture helpers rather than current-builder output as the sole old expectation.
- [ ] Add RED strict input cases for executionWindowMs (undefined when present, string, fractional, zero and unsupported positive values). Add executor recovery tests that preserve a retained old v3 without freezing a duplicate record; mismatched task windows, mismatched holdout, unsupported window and wrong tool cap refuse before controlled provider work. Preserve exact source identity checks.
- [ ] Add RED progress-renderer tests for failed candidate-ready and failed promoted states: exact neutral strings above, correct unactivated/unchanged-pointer distinction, no environment-cause or automatic-retry promise, and digest bound to the actual new text. Update the directly affected existing exact text expectations in learning-loop-progress.spec.ts. Keep existing durable progress deduplication/recovery tests passing.
- [ ] Add RED actual executor.progress recovery tests with an independently computed old failed-liveness digest for both old strings. Cover a pending intent whose native report already exists (find/recover, no redelivery) and one not yet sent (deliver exact historical text once), immutable original cursor digest, new intent neutral text, unknown digest rejection, and no evaluation/provider work. If the old cursor fails with learning progress durable digest changed, implement only exact-known-text matching; do not widen the guard or change historical records.
- [ ] Run `pnpm exec vitest run tests/dsh-migration/explicit-correction-protocol.spec.ts tests/dsh-migration/learning-loop-orchestrator.spec.ts` and record relevant missing-behavior failures before implementation.
- [ ] Implement the two-file change with local validation, existing deep-freeze and reconstruction paths. Do not edit native timer/execution code, introduce retry or modify archived records.
- [ ] Run the same focused tests, then native covering suites `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts` and `tests/dsh-migration/explicit-correction-product.e2e.spec.ts`, and root typecheck. Existing native timeouts/refusal must still pass.
- [ ] Run the full Vitest suite once on the finished source before committing; retain all failures and conditional skips. No full Python rerun for untouched Python source is needed; controller owns updated public-document tests and physical artifact checks.
- [ ] Self-review and commit only the five owned source/test paths. Report exact interface, RED/GREEN commands/results, changed files, preservation evidence and any concerns for independent task review. Root owns subsequent exact source/artifact/genuine acceptance/delivery work.

## Controller continuation

Task1 implementation completed in3b2caac38297e0d546a51b5b5922a39f6fc552c2.
Valid RED reproduced both legacy pending-report digest failures; final focused
122/native86/typecheck0/full1772pass18skip475.83s. First full's stale-copy failure
and controller-requested intermediate interruption remain in the task report.
Independent task review: spec compliant, quality Approved, no Critical/Important;
one Minor on restore/legacy digest test coverage goes to final review. Root
rebuilt exact source: bundle/profile68pass3skip, native14/14; no daily upgrade or
new real model input yet. The checkbox work below remains controller-owned.

- [ ] Independent task and final incremental review, preserving the already completed dc33583 whole-branch review as the base dependency.
- [ ] Rebuild a separate candidate, verify unchanged daily data, exact native module identity and physical Desktop/installer gates before normal integration/delivery.
- [ ] Keep G's timeout and all original records. Resume only independently justified new genuine tasks, not an answer-fitting retry; unobserved exploration/adoption/promotion remain open.
