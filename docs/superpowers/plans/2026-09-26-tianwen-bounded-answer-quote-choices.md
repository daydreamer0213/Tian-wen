# Bounded Answer Quote Choices Implementation Plan

> **For agentic workers:** Execute inline in this session. The current task does not authorize spawning subagents.

**Goal:** Prevent native reviewer parameters from supplying a per-claim quote that differs from the declared answer unit, without weakening host or recovery checks.

**Architecture:** Build a bounded list of exact strings from each answer unit and put it in that unit's native `quote` parameter. Keep the stored claim-audit format and all host validation unchanged.

**Tech Stack:** TypeScript, Vitest, native DeepSeek Harness structured-output schema.

## Global Constraints

- The candidate list contains only exact substrings of the corresponding answer unit.
- Keep the 32 KiB answer cap, 128-unit cap, source-ID checks, host quote checks and recovery checks.
- Do not regrade E041 or E042. Test a new candidate with a new task.

---

### Task 1: Unit-local native quote choices

**Files:** `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`, `tests/dsh-migration/conversation-claim-review.spec.ts`

- [x] Add a native-schema test using an answer with a bare line reference, semicolon clauses and trailing newline. Assert that both the raw unit and exact clause are choices, while a quote with added backticks and a cross-unit quote are absent.
- [x] Run the targeted test and observe it fail because `quote` is currently a free string.
- [x] Generate at most 16 deterministic punctuation-delimited pieces for each nonblank unit; retain the complete raw unit and, for an unsplit unit, its trimmed form. Use those exact unit-local strings as `quote.enum` for both claim slots only when their combined repeated JSON payload is at most 65,536 UTF-8 bytes; otherwise retain the prior free-text parameter.
- [x] Rerun targeted tests. Confirm the existing scripted whole-unit audit still succeeds and an invalid source ID still fails at the host.
- [x] Check that the representative 74,744-byte file-input fixture keeps the native tool schema under 200 KiB and that a 128-unit near-limit answer uses free-text fallback below 400 KiB.

### Task 2: Regression and release boundary

**Files:** `docs/operations/tianwen-current-project-handoff.md`

- [x] Run the conversation review/capture/persistence suites and the direct package type checks. Inspect the final diff and working tree.
- [x] Record only the engineering gate in the handoff; do not claim real-model double-review success.
- [x] Commit and push the exact candidate for a separate fresh-profile desktop acceptance.
