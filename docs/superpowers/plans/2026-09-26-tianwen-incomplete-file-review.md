# Incomplete Local-File Review Implementation Plan

> **For agentic workers:** This plan is executed directly in the current isolated branch. The owner authorized continuous work without repeated routine approvals.

**Goal:** A completed local-file task without complete verified file material records an explicit unavailable review without launching source-blind model judgments.

**Architecture:** Reuse `recoverConversationTaskMaterial` as the existing provenance gate. Add one additive unavailable-reason value in the Evolution parser, then short-circuit the Runtime original-result review only when recovered `source.files` is absent for an admitted local-file task. Keep all existing file capture, feedback, clue and guidance rules unchanged.

**Tech Stack:** TypeScript, Vitest, DSH scripted native harness.

## Global Constraints

- Do not change the 32,768-byte per-file or 65,536-byte aggregate capture limits.
- Do not treat raw read/shell output as replayable source evidence.
- Do not regrade E038 or change main/Daily.
- Keep generated test data under `D:/DevData`.

### Task 1: Fail closed before source-blind result judgment

**Files:**
- Test: `tests/dsh-migration/conversation-file-observer.spec.ts`
- Test: `tests/dsh-migration/conversation-learning.spec.ts`
- Modify: `packages/tianwen-evolution/src/conversation-learning.ts`
- Modify: `packages/tianwen-runtime-bundle/src/conversation-observer.ts`

**Interfaces:** `ConversationUnavailable` and `parseConversationLearningRecord` accept `file-evidence-unavailable`; `TianwenConversationObserverService.review` records it when a completed local-file task's recovered material has no `files`.

- [x] Add a scripted native oversized read-to-chat task that receives its ordinary answer, then asserts null-proof unavailable review and zero review child requests. Add parser round-trip for the new reason.
- [x] Run the two focused tests and confirm failure is caused by the missing short-circuit/reason.
- [x] Add the enum/parser value and the pre-judgment guard. Keep cancellation and other unavailable reasons unchanged.
- [x] Re-run focused tests, affected file-learning/claim-review suites, typecheck, and diff checks. The final gate covered all 21 conversation suites (556 tests) and all eight package typechecks.
- [x] Update current handoff/coverage with the exact engineering result and remaining large-file/PowerShell limits; commit and push this branch.
