# Contextual Source Check Trial Implementation Plan

> **Closed as failed (2026-09-26).** The frozen first run hit its semantic stop condition on R6-W3 and its full audit failed on T4. Do not execute any product-integration follow-up from this plan. See [result](../../operations/tianwen-contextual-source-trial-results-20260926.md).

> **For agentic workers:** Implement inline in this session. This is a finite diagnostic, not a product verdict change.

**Goal:** Falsify whether one source review that sees each existing inference together with its full answer unit can distinguish old source overreach from normal advice.

**Architecture:** Reuse the current production evidence projection and native judgment call in a new D-drive isolated profile. Freeze the old, already audited request/answer/check tuples and controller expectations before launch. Audit every first native result from persisted sessions. No repo runtime code or learning ledger changes.

**Tech Stack:** Node.js 22, DSH 0.1.1-rc.2, TypeScript source bundled with esbuild, DeepSeek V4 Flash / High, JSON evidence, Vitest for pure selector checks only if a reusable selector is added to the repo.

## Global Constraints

- Store generated profile, sessions and model traces under `D:/DevData/tianwen-contextual-source-trial-20260926`.
- Use existing reviewed answers exactly; no answer edits, retries, learning, or product verdict changes.
- Keep controller target labels out of the native model material.
- A diagnostic pass does not authorize product integration, main update or Daily update.

### Task 1: Freeze bounded diagnostic inputs

**Files:** Create `D:/DevData/tianwen-contextual-source-trial-20260926/prepare.mjs`, `public-cases.json`, `controller-expected.json`, `frozen.json` and isolated DSH profile; read the two existing audit roots.

**Interfaces:** `prepare.mjs` reads `D:/DevData/tianwen-semantic-review-20260926-b/cases.json` and `evidence/result-*.json`, plus `D:/DevData/tianwen-modality-natural-review-20260926/cases.json` and `evidence/result-*.json`; emits cases with `{id, original, evidence, candidates:[{answerId,quote,answerUnit}]}`. Candidate identity is exact `(answerId, quote)`; no containment-based pruning.

- [ ] Check that the existing roots have successful native audits and matching source hashes.
- [ ] Compute candidates only from `met` results and `inference/permitted` claims. Reject any quote not contained in its answer unit; mark more than 12 candidates `inconclusive` before model calls.
- [ ] Include 036-S1, R6-W3, R6-W8, T4, T5 and T6; record expectations separately. T5 has no candidates and receives no model call.
- [ ] Freeze file hashes, model configuration and exact output schema before first model call. Verify `public-cases.json` contains no controller expectation field.

### Task 2: Run one native contextual check per eligible case

**Files:** Create `D:/DevData/tianwen-contextual-source-trial-20260926/bootstrap.mjs`, `launch.mjs` and `audit.mjs`.

**Interfaces:** One `runConversationJudgment` call per eligible case, using `{original, claimEvidence, candidates}`. Output is `{assessments:[{answerId,quote,status,reason}]}` with status in `source-supported`, `permitted-advice-or-fallible-inference`, `unsupported-source-dependent`, `uncertain`.

- [ ] Preflight profile isolation, learning disabled, model configuration, frozen file hashes and native persistence before the run marker.
- [ ] Write each first result and its proof once; on failure retain the failure without retries. Stop the host after all cases.
- [ ] Reopen persisted sessions and verify exact material, instruction, schema-compatible outputs, one result per candidate, exact quotes, native request/session digests and configured model headers.
- [ ] Apply the controller gate only after audit: 036-S1 and R6-W3 targets must be `unsupported-source-dependent` or `uncertain`; normal R6-W8 advice reasons must be `permitted-advice-or-fallible-inference`; report T4/T6 and T5 without promoting them to pass criteria.

### Task 3: Decide and record the next stage

**Files:** Create one result report under `docs/operations/`; update `tianwen-current-project-handoff.md` and `tianwen-verification-coverage-current.md` only with audited facts.

- [ ] Report results, false alarms, omissions, first-call count, native proof count, observed time, host exit and exact evidence hashes.
- [ ] If a hard case fails, stop this design and record why. If it passes, keep product NO-GO and define a separate new natural-task gate before any runtime change.
- [ ] Run `git diff --check`, verify report links and source hashes, then commit and push the documentation. Do not commit generated profile/session data.
