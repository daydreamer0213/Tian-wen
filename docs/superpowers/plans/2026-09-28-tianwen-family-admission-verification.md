# Task-Family Admission Verification Implementation Plan

> **For agentic workers:** Execute this plan task by task with red/green tests and review each recorded result before the next step. The current task remains in the existing isolated worktree.

**Goal:** Give prospective self-contained text tasks an independently supported family before guidance routing or study eligibility, while retaining exact v11 history.

**Architecture:** Keep the first native admission decision and proof unchanged. Mark new task sources with a separate `tianwen.family-verification.v1` admission-policy version and attach its result to text admissions: one blind family-only vote for every text task and a second on disagreement. The existing v11 answer-quality contract stays unchanged because its review semantics do not change. Route guidance and select research sources through the resolved family, leaving unresolved tasks answerable but ineligible.

**Tech Stack:** TypeScript, DSH native structured-output Sessions, Tianwen Evolution ledger, Vitest.

## Global constraints

- E084/E086 records remain immutable; no retroactive relabeling or repeat-run acceptance.
- Exact v11 answer-quality parsing and old admission/study replay remain valid; do not call this a v12 review contract.
- A family check must cite an exact span of the direct user request and keep distinct native proof.
- Model failure, invalid quote, three-way disagreement or consent loss must fail closed for guidance and study eligibility.
- main/Daily remains NO-GO; generated trial assets live under `D:/DevData`.

## Task 1: Versioned family result and host consensus

**Files:** `packages/tianwen-evolution/src/conversation-learning.ts`; `tests/dsh-migration/conversation-learning.spec.ts`.

- [x] Add failing tests for agreeing family, two-of-three correction, all-different unresolved, malformed proof, and v11 admission replay.
- [x] Run the focused suite and confirm the new tests fail for the missing behavior.
- [x] Add a versioned source admission-policy marker, family-check parser/consensus, and `effectiveConversationFamily` for old/new tasks.
- [x] Require the family-verification field for marked self-contained text admissions, preserve omitted field on historical records; run focused tests and type checks.

## Task 2: Native pre-answer family checks

**Files:** `packages/tianwen-runtime-bundle/src/conversation-observer.ts`, `packages/tianwen-runtime-bundle/src/conversation-judgment.ts`; `tests/dsh-migration/conversation-observer.spec.ts`.

- [x] Add failing scripted tests for corrected summary, stable writing, three-way disagreement, invalid quote, non-text check, and consent change.
- [x] Add a family-only structured-output schema and instruction that hides earlier votes, bind exact quote to the direct user request, and retain each Session proof.
- [x] Record the marked verification before answering; unresolved families receive no family guidance. Run observer suite.

## Task 3: Study and review gates

**Files:** `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`, `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`, `packages/tianwen-evolution/src/ledger.ts`, `packages/tianwen-evolution/src/conversation-guidance.ts`; corresponding guidance and ledger tests.

- [x] Add failing selection tests that unresolved and mixed-policy sources or controls cannot form a study group; historical tasks retain their prior behavior.
- [x] Replace source-family reads at selection, proposal clues, rollback and ledger support with `effectiveConversationFamily`; keep review and study quality guards unchanged.
- [x] Run focused suites (229 passed) and all package type checks; inspect for missed raw-family uses.

## Task 4: Prospective verification

**Files:** new D:-resident freeze, protocol, profile and terminal audit; `docs/operations/tianwen-current-project-handoff.md` and a new result note.

- [ ] Freeze new fictional summary and genuine writing-control inputs, exact commit/build/package/model, expected native proofs and first-anomaly stops before model calls.
- [ ] Run one isolated natural flow in order; only write/send a read-after-answer feedback if the frozen source gate passes.
- [ ] Close consent, stop host, audit original Session/proofs/hashes and report observed latency and any failure honestly.
- [ ] Commit and push source, tests and result note; preserve main/Daily NO-GO until separate research, semantic safety, activation and future-effect gates pass.
