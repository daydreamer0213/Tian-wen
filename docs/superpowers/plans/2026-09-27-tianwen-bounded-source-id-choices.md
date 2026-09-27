# Bounded source-ID choices implementation plan

> **For agentic workers:** Execute inline with `executing-plans`; preserve the red/green verification after each task.

**Goal:** Prevent small native review packets from offering answer IDs as source IDs, without making large tool schemas unbounded.

**Architecture:** Add a size-gated `enum` to the existing claim audit tool schema only. Keep the strict host validator unchanged. Use a new isolated diagnostic runner with an enforced stop rule.

**Tech Stack:** TypeScript, Vitest, DSH native Sessions, Node.js.

## Global constraints

- Generated profiles, caches and run evidence belong under `D:/DevData`.
- Do not rewrite v9 S2 or older model results.
- main/Daily remains NO-GO.

### Task 1: Bounded tool schema

**Files:** `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`, `tests/dsh-migration/conversation-claim-review.spec.ts`.

- [x] Add a failing assertion that a one-source claim schema lists `request-1` and excludes `answer-1`.
- [x] Run `D:/hermes/node/node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-claim-review.spec.ts` and observe that enum is absent.
- [x] Set a `sourceIdChoices` value when `2 * nonblankAnswerCount * Buffer.byteLength(JSON.stringify(sourceIds), 'utf8') <= 8192`; use `choices(sourceIds)` for each claim's array item only in that case. Leave the host audit validation intact.
- [x] Add a many-unit/many-source test that checks no enum and keeps the whole schema below the existing 400 KiB bound. Run targeted tests green and direct eight-package TypeScript checking, then commit.

### Task 2: New-run stop proof and prospective evaluation

**Files:** new run scripts and audit under `D:/DevData`, plus `docs/operations/tianwen-current-project-handoff.md` and a new results document.

- [x] In a new run script, persist each result and break the loop on error, missing proof, or an unexpected verdict. Use a local fake reviewer to prove that failure in case two leaves case three uncalled.
- [x] Build the exact candidate package; bootstrap and normalize the profile before freezing. Freeze new materials, scripts, package, source inputs, model and stop conditions before any provider call.
- [x] Run each new case once, preserve all verdicts and native proof, and audit every frozen hash. Do not reuse S2. Update the handoff and keep main/Daily NO-GO.
