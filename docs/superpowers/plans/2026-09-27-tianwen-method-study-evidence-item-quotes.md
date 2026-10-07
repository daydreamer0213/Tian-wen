# Method-Study Evidence Item Quotes Implementation Plan

**Goal:** Stop new text method-study reviewers from quoting prior feedback standards as source or answer evidence.

**Architecture:** Version only the new study-review material with an outer `quoteProtocol` marker. Offer exact nonblank `claimEvidence.items[].text` values in the native `evidenceQuotes` schema; keep existing review result fields, strict host checks, and old-record recovery.

**Tech Stack:** TypeScript, DSH structured-output schema, Vitest, native Session recovery.

## Global Constraints

- E066/E067 are immutable failed studies; do not rejudge them.
- Scope is new text method-study reviews only. Original-result and file study review behavior stays unchanged.
- More than 98,304 UTF-8 bytes of quote options fails closed.
- The worktree is `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`; generated test and package data stays on D:.
- main/Daily remains NO-GO until separate prospective research, activation, future task, and semantic safety gates pass.

---

### Task 1: Version the new study quote protocol

**Files:** `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`, `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`, `tests/dsh-migration/conversation-claim-review.spec.ts`.

- [x] Add a failing test: new outer marker yields a tool schema enum made only of nonblank source/answer evidence items, excluding `feedbackStandard` text; old unmarked material keeps its free-substring schema.
- [x] Run the focused test and confirm the new assertion fails on current code.
- [x] Export a protocol marker, add it only to new text study review material, and build the bounded enum from the already projected `ClaimEvidence` items. Reject an over-budget set rather than falling back.
- [x] Rerun the focused tests; keep existing host substring validation for old material and require exact offered values for marked material.

### Task 2: Preserve proof recovery and research fixtures

**Files:** `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`, `tests/dsh-migration/conversation-claim-review.spec.ts`, `tests/dsh-migration/conversation-audited-response.ts`, relevant guidance-loop tests.

- [x] Add tests for marked-record native recovery and full-item quote mismatch, plus existing unmarked short-quote recovery.
- [x] Update recovery validation to reconstruct the offered item set from the recovered original material; do not change ledger record shape or historical instruction text.
- [x] Adjust only new-protocol scripted test replies to choose a full offered evidence item containing the intended short fragment.
- [x] Run the focused claim-review and guidance-loop suites; fix any actual compatibility failure without loosening original-result review.

### Task 3: Verify and document the candidate

**Files:** `docs/operations/tianwen-current-project-handoff.md` and, if needed, a short engineering result note.

- [x] Run all 22 conversation test files, eight package TypeScript builds, and `git diff --check`; record exact counts and failures. Existing suite 593/593; then a new budget-boundary test passed 10/10 in its focused file.
- [ ] Verify older E067 native proof remains recoverable without rejudging it, if a read-only harness is available.
- [x] Commit/push the candidate only after evidence confirms the claims. No main/Daily upgrade; create a new frozen prospective trial as a separate step.
