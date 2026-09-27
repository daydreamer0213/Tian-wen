# Tianwen Claim Mode Boundary Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This run is handled inline in the already isolated worktree.

**Goal:** Check whether an independent native diagnostic can separate source-dependent facts from requested recommendations inside complete answer sentences.

**Architecture:** Freeze six new source/answer pairs and expected claim modes before calling the model. A diagnostic DSH plugin asks for exact quoted fact and advice spans, then sends only extracted facts to separate native source checks; a read-only audit verifies first results and frozen bytes.

**Tech Stack:** Node 22, DSH Runtime 0.1.1-rc.2, DeepSeek-V4-Flash/High, existing `runConversationJudgment` bundle.

## Global Constraints

- All generated files, package stores and sessions live under `D:/DevData`.
- No product package source, learning ledger, main branch or Daily installation changes.
- Six cases and expectations are immutable after the first model call. No re-asking failed cases.
- `met`, generated session counts and exact quotes do not independently prove semantic correctness.

---

### Task 1: Freeze new diagnostic input

**Files:**
- Create: `D:/DevData/tianwen-claim-modes-20260927/cases.json`
- Create: `D:/DevData/tianwen-claim-modes-20260927/expected.json`
- Create: `D:/DevData/tianwen-claim-modes-20260927/extraction-instruction.txt`
- Create: `D:/DevData/tianwen-claim-modes-20260927/entailment-instruction.txt`

**Interfaces:** `cases.json` provides `cases[{id,source,answer}]`; `expected.json` maps each id to required fact/advice substrings and expected fact verdicts.

- [ ] Write exact M1–M6 texts and controller expectations from the design; calculate hashes.
- [ ] Review that no case copies the historical answer text and every answer is complete.

### Task 2: Build and run the isolated diagnostic

**Files:**
- Create: `D:/DevData/tianwen-claim-modes-20260927/bootstrap.mjs`
- Create: `D:/DevData/tianwen-claim-modes-20260927/freeze.mjs`
- Create: `D:/DevData/tianwen-claim-modes-20260927/launch.mjs`
- Create: `D:/DevData/tianwen-claim-modes-20260927/dsh-home/profiles/web/cordis.patch.yml`

**Interfaces:** Extraction returns `{facts:[{quote,reason}],advice:[{quote,reason}]}`; each fact receives `{verdict,evidenceQuote,explanation}` from an independent Session.

- [ ] Reuse the previously verified reviewer bytes and DSH package, with dependencies and cache on D.
- [ ] Make the controller reject non-substring quotes, duplicate or empty results, changed files and unexpected model configuration.
- [ ] Freeze package, model, inputs and scripts; run six cases exactly once and retain original errors.

### Task 3: Audit and report

**Files:**
- Create: `D:/DevData/tianwen-claim-modes-20260927/audit.mjs`
- Create: `docs/operations/tianwen-claim-mode-boundary-diagnostic-20260927.md`
- Modify: `docs/operations/tianwen-current-project-handoff.md`

**Interfaces:** Audit reports file drift, native session identity, accepted structured calls, exact result capture, quote containment, verdicts and stopped host.

- [ ] Run read-only audit and independently compare every extracted quote with the pre-registered expectations.
- [ ] Record failures as failures, source/answer limitations, and the separate main/Daily NO-GO status.
- [ ] Run `git diff --check`, commit documentation, push the existing branch, and verify a clean working tree.
