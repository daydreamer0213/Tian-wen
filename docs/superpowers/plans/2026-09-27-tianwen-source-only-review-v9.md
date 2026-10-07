# Source-only review v9 implementation plan

> **For agentic workers:** Use `executing-plans` to implement each task inline, reviewing the result between tasks. Steps use checkboxes for progress.

**Goal:** Make new product reviews distinguish a source total from completed work, source-backed future procedures from plausible extrapolation, and accurate self-description from false assurance.

**Architecture:** Preserve v8 as an exact legacy contract and introduce v9 for new tasks. The existing two blind native reviewers receive a v9-only instruction; claim audit shape, host consensus, consent, admission and learning selectors stay as they are. A frozen new diagnostic uses the actual product reviewer code and independent DeepSeek Sessions.

**Tech Stack:** TypeScript 6, Vitest 4, DSH native Sessions, PowerShell and Node.js on Windows.

## Global constraints

- Keep all generated profiles, caches and model-run evidence under `D:/DevData`.
- Do not edit existing v1–v8 criteria, prompts, stored proofs or earlier diagnostic results.
- Do not treat direct reviewer results as ordinary task or learning-chain acceptance.
- Keep main/Daily NO-GO.

### Task 1: Versioned domain policy

**Files:** `packages/tianwen-evolution/src/conversation-learning.ts`, `packages/tianwen-evolution/src/conversation-guidance.ts`, `tests/dsh-migration/conversation-claim-audit.spec.ts`, `tests/dsh-migration/conversation-guidance-ledger.spec.ts`.

- [ ] Add a failing domain test that current quality is v9; exact literal v8 still parses, is no longer current, and an altered v8 criterion fails. Require audited v9 review tuples and two native checks for tasks and study arms.
- [ ] Run `D:/hermes/node/node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-claim-audit.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts` and confirm the new assertions fail because v9 is absent.
- [ ] Extract the exact current v8 return value into `legacyV8ConversationQualityContract()`. Make `conversationQualityContract()` return v9 with the three general source-boundary rules from the design. Extend only v8-like version gates and the exact parser branch to v9.
- [ ] Run the same two files green; inspect v8 literal and digest behavior. Commit only this domain change.

### Task 2: Native reviewer route

**Files:** `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`, `tests/dsh-migration/conversation-claim-review.spec.ts`, `tests/dsh-migration/conversation-observer.spec.ts`, `tests/dsh-migration/conversation-review-panel.spec.ts`.

- [ ] Add a failing instruction/recovery test: current v9 receives the total-versus-completed, unsourced future-procedure, and self-assurance checks; a frozen v8 task still receives the exact old v8 instruction and none of the new text. Preserve v7 recovery assertions.
- [ ] Run the four targeted files and confirm the v9-specific assertion fails.
- [ ] Add `V9_COMMON` as an append-only extension of `V8_COMMON` and route only exact validated v9 contracts to it. Update tests that explicitly expect the current quality version; do not alter the audit schema or consensus.
- [ ] Run the four files green, then direct `tsc -b` for the repository's eight package tsconfigs. Commit the reviewer change.

### Task 3: Frozen prospective diagnostic and project handoff

**Files:** new `docs/operations/tianwen-source-only-review-v9-results-20260927.md`, `docs/operations/tianwen-current-project-handoff.md`; generated diagnostic under `D:/DevData/tianwen-v9-source-only-20260927`.

- [ ] Build and install the exact v9 candidate in an isolated DSH Web profile. Before the first model call, freeze source commit and compiled inputs, runtime package, profile files, five novel source/answer pairs, their expected verdicts, model configuration and stop conditions. Ensure the host's normalizing configuration step occurs before freezing.
- [ ] Run each frozen pair once through `runConversationClaimReview` with two blind DeepSeek-V4-Flash/High native Sessions. Do not retry a failed pair. Audit exact material, each native structured submission, distinct Session IDs, source quotes, expected verdicts, file hashes and host exit.
- [ ] Record both successful and failed outcomes without rewriting expectations. Update the handoff with what is and is not proven; keep ordinary task, feedback, research, activation and future-task effectiveness as separate gates.
- [ ] Run `git diff --check`, recheck exact audit hashes, commit documentation and push the existing feature branch. Do not merge main or upgrade Daily.
