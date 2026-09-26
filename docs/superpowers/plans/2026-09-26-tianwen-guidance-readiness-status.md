# Tianwen Guidance Readiness Status Implementation Plan

> **For agentic workers:** This plan is executed directly in the current session. Each code step follows a red-green test cycle; no delegated worker is required.

**Goal:** Explain why ordinary conversation learning has not started, without changing its evidence or activation decisions.

**Architecture:** Refactor the existing runtime evidence selection into a shared read-only scan. Expose only its bounded state through the existing learning status tool; add stopped-reason counts from recorded studies.

**Tech Stack:** TypeScript, Vitest, Cordis/DSH services.

## Global Constraints

- Preserve the exact existing `select` matching and ordering rules.
- No raw task, feedback, answer, path, ID or proof in status output.
- Readiness must not write the ledger, call the model, or open a study.
- `ready-to-schedule` is not an outcome or release claim; main/Daily remain NO-GO.

---

### Task 1: Shared evidence scan

**Files:** `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`, `tests/dsh-migration/conversation-guidance-loop.spec.ts`.

**Interface:** `readiness(scopeKey): Promise<{state: GuidanceReadinessState}>`; the private selector reuses its scan result and alone recovers proposal clues.

- [x] Add failing tests for disabled, insufficient supports, missing counterexample, ready and already-studied states, plus no model/ledger side effects.
- [x] Run the focused test and confirm the expected failure.
- [x] Extract the exact current selection scan, expose bounded readiness, preserve proposal clue handling.
- [x] Run the focused test and existing guidance-loop tests.

### Task 2: Bounded status projection

**Files:** `packages/tianwen-runtime-bundle/src/learning-consent-agent.ts`, `tests/dsh-migration/learning-consent-agent.spec.ts`.

**Interface:** `currentSession.naturalConversation.guidanceReadiness.state`; `guidanceStudies.stoppedReasons` fixed counts.

- [x] Add failing tests for current-scope state, stopped reasons, absence of private material, no model calls or ledger mutation.
- [x] Run the focused test and confirm the expected failure.
- [x] Implement optional loop lookup and fail-closed `unavailable` result; project fixed stop reason counts.
- [x] Run focused tests and package type checks.

### Task 3: Current project handoff

**Files:** `docs/operations/tianwen-current-project-handoff.md`, `docs/operations/tianwen-verification-coverage-current.md`.

- [x] Record exact verification and the fact that semantic safety and complete chain remain unproved.
- [ ] Run `git diff --check`, inspect final diff, commit and push this branch.
