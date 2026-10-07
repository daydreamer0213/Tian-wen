# Tianwen method activation quarantine implementation plan

> **For agentic workers:** Execute this plan task by task in the existing isolated branch. Keep generated test data on D:.

**Goal:** Preserve research decisions while preventing any new product method activation until independent semantic clearance exists.

**Architecture:** The product bundle passes one internal quarantine flag to its ledger and guidance loop. The loop skips both fresh and recovery activation; the ledger rejects a direct activation append. Replay of existing events is unchanged.

**Tech Stack:** TypeScript, EvolutionLedger, DSH Cordis runtime, Vitest.

## Global constraints

- Do not modify historical records, study IDs, review verdicts, ordinary answers, consent or main/Daily.
- The default product bundle is quarantined; lower-level direct test harnesses keep their explicit historical behavior.
- Tests precede implementation. No model reruns of old samples.

## Task 1: Ledger mutation boundary

Files: `tests/dsh-migration/conversation-guidance-ledger.spec.ts`, `packages/tianwen-evolution/src/ledger.ts`, `packages/tianwen-evolution/src/runtime-binding.ts`.

1. Add a test that an accepted but inactive study remains on its parent snapshot and rejects a direct activation append with quarantine enabled. Check restart and historical active replay.
2. Run the focused test and confirm the intended failure.
3. Add the ledger option and mutation-only guard after duplicate detection; pass the option through the evolution service.
4. Rerun the focused suite.

## Task 2: Product and recovery boundary

Files: `tests/dsh-migration/conversation-guidance-loop.spec.ts`, `packages/tianwen-runtime/src/index.ts`, `packages/tianwen-runtime-bundle/src/runtime.ts`, `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`.

1. Add failing tests that product bundle wiring enables both guards and a scripted accepted study remains inactive across a restart without new model calls.
2. Pass the flag from the bundle through the core runtime, and skip immediate and recovery activation in the guidance loop. Preserve direct non-quarantined harness behavior.
3. Run guidance loop, ledger and runtime bundle tests, followed by eight-package type check.

## Task 3: Evidence and handoff

Files: `docs/operations/tianwen-current-project-handoff.md` plus one result note.

1. Review the diff for accidental scope changes, run `git diff --check`, verify test outputs and a clean status after commit.
2. Record the exact engineering result and limitations: accepted studies are held, no semantic safety proof, no activation or future-task effect yet.
3. Push the existing branch. Keep main/Daily NO-GO.
