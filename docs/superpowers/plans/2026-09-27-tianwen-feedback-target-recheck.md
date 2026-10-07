# Explicit Natural-Feedback Target Recheck Implementation Plan

**Goal:** Recover an unambiguous prior-answer link when the first native admission recognizes feedback but leaves `relatedTaskId` empty, while retaining null for ambiguous feedback.

**Architecture:** Add one optional full-admission recheck in `conversation-observer.ts`. Use the existing closed schema, exact quote/ID validation and native proof; adopt the second full decision only when its feedback identity matches the first. Keep historical tasks and feedback unchanged.

**Tech Stack:** TypeScript, Vitest, existing Tianwen native judgment and ledger.

## Global constraints

- Generated test data stays on `D:/DevData` on Windows.
- No nearest-task default, retroactive E062 rewrite, or main/Daily activation.
- A failed optional recheck leaves the first null admission intact.

## Task 1: Bound the recheck with tests

- [x] In `tests/dsh-migration/conversation-observer.spec.ts`, script an E062-like first admission with recognized preference and null target, then an unambiguous recheck linked to the earlier task; assert the stored target and recover its native proof.
- [x] Add unrelated/ambiguous feedback, failed recheck and changed-feedback counterexamples; assert no promotion. Keep ordinary no-feedback admission at its existing model-call count.
- [x] Run this test file and observe the new positive test fail for the intended missing behavior.

## Task 2: Implement and verify

- [x] Add a narrow instruction and optional recheck branch to `packages/tianwen-runtime-bundle/src/conversation-observer.ts` after first-decision validation and before admission recording.
- [x] Adopt only the entire recheck result with an allowed non-null ID, identical feedback identity and conversation kind. On error, leave the first result unchanged; preserve cancellation behavior.
- [x] Run the focused test file, related conversation tests, package typecheck, and runtime bundle build. Check all exit codes and inspect the final diff.

## Task 3: Document candidate status

- [x] Update `docs/operations/tianwen-current-project-handoff.md` with the implementation and verification evidence, explicitly noting real-model attribution remains unverified.
- [x] Commit and push the candidate branch. A new frozen isolated trial belongs to a subsequent verification step; old E062 remains unchanged.
