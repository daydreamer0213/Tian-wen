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

**Interfaces:**
- Extend only the v3 member of ExplicitCorrectionProtocolResolution with optional `executionWindowMs?: 60_000 | 300_000` (strict runtime validation; explicit undefined is invalid).
- `resolveExplicitCorrectionProtocol` uses 300_000 when that optional field is absent for fresh v3, while legacy builders retain 60_000. Thread the selected value through the existing builder closure so `buildProtocolInput` and `buildShadowTasks` agree. Shared `buildExplicitCorrectionTransitionInput` remains on its original constant.
- In `createExplicitCorrectionLearningLoopExecutor.tasksFor`, if retained v3 exists, require exactly five paired task stop contracts and its holdout to have the same supported window and maxToolCalls 4, then pass that persisted value into the resolver. Fresh v3 omits the property. Never infer a retained value from Candidate, prior review outcome, current default, first task only or elapsed time.
- Keep the existing digest equality check in freezeProtocol; it must continue to verify old 60-second v3 exactly after the default changes.

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
- [ ] Run `pnpm exec vitest run tests/dsh-migration/explicit-correction-protocol.spec.ts tests/dsh-migration/learning-loop-orchestrator.spec.ts` and record relevant missing-behavior failures before implementation.
- [ ] Implement the two-file change with local validation, existing deep-freeze and reconstruction paths. Do not edit native timer/execution code, introduce retry or modify archived records.
- [ ] Run the same focused tests, then native covering suites `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts` and `tests/dsh-migration/explicit-correction-product.e2e.spec.ts`, and root typecheck. Existing native timeouts/refusal must still pass.
- [ ] Run the full Vitest suite once on the finished source before committing; retain all failures and conditional skips. No full Python rerun for untouched Python source is needed; controller owns updated public-document tests and physical artifact checks.
- [ ] Self-review and commit only the four owned source/test paths. Report exact interface, RED/GREEN commands/results, changed files, preservation evidence and any concerns for independent task review. Root owns subsequent exact source/artifact/genuine acceptance/delivery work.

## Controller continuation

- [ ] Independent task and final incremental review, preserving the already completed dc33583 whole-branch review as the base dependency.
- [ ] Rebuild a separate candidate, verify unchanged daily data, exact native module identity and physical Desktop/installer gates before normal integration/delivery.
- [ ] Keep G's timeout and all original records. Resume only independently justified new genuine tasks, not an answer-fitting retry; unobserved exploration/adoption/promotion remain open.
