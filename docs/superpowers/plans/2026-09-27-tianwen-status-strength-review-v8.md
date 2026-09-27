# Status-strength claim review v8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a versioned prospective product review instruction that distinguishes pending results from explicit failures while preserving normal recommendations.

**Architecture:** Domain quality v8 selects the existing audited two-review path. Runtime review chooses an exact v8 instruction while retaining v6/v7 text for saved native proof recovery. Ledger and study records accept v8 as current and v7 as historical. No additional judge or answer rewrite.

**Tech Stack:** TypeScript, DSH native Sessions, Vitest, pnpm 11.20.0, Node 22.

## Global Constraints

- Work in `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`; put generated evidence and caches in `D:/DevData`.
- Preserve old v1–v7 contract bytes, instruction strings, proofs and old task/study decisions.
- Keep DeepSeek official V4 Flash High, current claim-audit.v2, two blind checks and existing consensus; no third judge or provider-side retry.
- Do not merge main, update Daily, activate a method or claim end-to-end learning from unit tests or a synthetic review.

---

### Task 1: Versioned domain contract and persistence

**Files:** `packages/tianwen-evolution/src/conversation-learning.ts`, `packages/tianwen-evolution/src/conversation-guidance.ts`, `tests/dsh-migration/conversation-claim-audit.spec.ts`, `tests/dsh-migration/conversation-guidance-ledger.spec.ts`.

**Interfaces:** `conversationQualityContract()` returns exact v8; `parseConversationQualityContract` still accepts exact v7; v8 uses audit.v2 and existing two-check persistence.

- [ ] Add a failing test asserting v8 current, exact v7 historical, v8 audit.v2 parsing and mixed-quality source rejection.
- [ ] Run the two focused suites and confirm the new assertions fail.
- [ ] Add v8 contract construction, exact v7 parser branch and v8 membership in audited/dual-check record guards; update version-aware test fixtures.
- [ ] Rerun both suites and typecheck, fixing only failures caused by this version change.
- [ ] Commit the independent domain change.

### Task 2: Exact v8 runtime instruction

**Files:** `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`, `tests/dsh-migration/conversation-claim-review.spec.ts`, `tests/dsh-migration/conversation-observer.spec.ts`, `tests/dsh-migration/conversation-review-panel.spec.ts`.

**Interfaces:** `claimReviewInstruction(material,purpose,focus)` chooses V6, V7 or V8 text solely from the exact validated quality contract; `runConversationClaimReview` remains unchanged.

- [ ] Add a failing scripted native test that inspects a v8 review request for both status-strength and whole-advice rules, plus a literal v7 request that lacks those new sentences.
- [ ] Run focused suites and confirm the new assertion fails.
- [ ] Append v8-only instruction/criterion wording; preserve V6/V7 constant bytes and validate exact contract before selection.
- [ ] Update observer/panel current-version assertions, run focused suites and typecheck.
- [ ] Commit the candidate review change.

### Task 3: Prospective product acceptance

**Files:** `docs/operations/tianwen-current-project-handoff.md`, new dated result document under `docs/operations`; generated profile and evidence under `D:/DevData`.

**Interfaces:** frozen profile source/build digest, ordinary task answers, two native v8 audits per task, and a read-only audit report.

- [ ] Freeze new source, examples, expected boundaries, model and stop conditions before calls; do not reuse P1–P6 or E085 as fresh acceptance.
- [ ] Run one-shot normal product tasks with pending, explicit-failed and advice/mixed-claim controls; preserve first answers and both blind audits.
- [ ] Independently compare original sources, answers, audit claims and native proof; stop on any false release or false rejection.
- [ ] Record exact outcome and limitations, keep main/Daily NO-GO, and commit the result documentation.
