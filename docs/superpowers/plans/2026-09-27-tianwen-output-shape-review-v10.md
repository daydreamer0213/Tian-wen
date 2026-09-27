# Output-shape Review v10 Implementation Plan

> **For agentic workers:** Implement in this worktree in the listed order; preserve all other work in the shared repository.

**Goal:** Make new native reviews independently check a requested one-paragraph output form without changing historical v9 judgments.

**Architecture:** The evolution package owns the exact versioned contract and replay rules; the runtime bundle selects the matching reviewer instruction. The existing two-check and claim-audit protocol remains unchanged.

**Tech Stack:** TypeScript, Vitest, DeepSeek DSH native reviewer, isolated D: evidence directory.

## Global Constraints

- Keep v9 bytes and instruction unchanged for old task replay.
- Do not modify original 霁川 or F1–F4 evidence, run them again, or backfill verdicts.
- Do not introduce lexical host rejection or change ordinary answer generation.
- Keep main/Daily NO-GO; direct review does not prove natural-task or learning-chain quality.

### Task 1: Versioned contract and replay

**Files:** `packages/tianwen-evolution/src/conversation-learning.ts`, `packages/tianwen-evolution/src/conversation-guidance.ts`, `tests/dsh-migration/conversation-claim-audit.spec.ts`, `tests/dsh-migration/conversation-guidance-ledger.spec.ts`.

- [ ] Add a failing test that current admission uses v10, exact v9 parses unchanged, and v10 requires audited independent checks.
- [ ] Run focused tests and confirm the expected version failure.
- [ ] Add v9 as an exact legacy builder, v10 as current, and extend only the versioned review/study guards.
- [ ] Run focused tests and confirm pass.

### Task 2: Native instruction and original-result verification

**Files:** `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`, `tests/dsh-migration/conversation-claim-review.spec.ts`, `tests/dsh-migration/conversation-review-panel.spec.ts`, `tests/dsh-migration/conversation-observer.spec.ts`.

- [ ] Add a failing test that v10 instruction checks output form separately from factual claim audit and v9 historical instruction remains byte-compatible.
- [ ] Run focused tests and confirm the expected instruction failure.
- [ ] Route v10 to the bounded instruction and keep v9 as historical.
- [ ] Run claim review, panel, observer, audit and guidance ledger suites; type-check all packages.

### Task 3: One-shot prospective evidence

**Files:** new isolated D: diagnostic packet; `docs/operations/tianwen-current-project-handoff.md` and a result note.

- [ ] Freeze new cases, expected decisions, package and source hashes, model config, audit script and first-mismatch stop before calls.
- [ ] Verify the stop rule offline; run one native two-check review per case until first stop.
- [ ] Read-only audit original inputs, accepted native proofs, labels, hashes and host exit. Record failures without reruns or retroactive changes.
- [ ] Record the result, commit/push the branch, and leave main/Daily NO-GO.
