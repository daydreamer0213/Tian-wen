# Visible Learning Material Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep normal DeepSeek thinking out of new task-analysis material while retaining the 96 KiB safety limit and exact recovery of earlier evidence.

**Architecture:** New conversation task sources explicitly freeze `materialProjection: 'surface-text.v1'`. Omission retains the existing native-content projection; there is no heuristic digest fallback or retroactive regrading. The existing shared material recovery supplies admission, original-result review, feedback and method studies with the projection fixed by that task.

**Tech Stack:** Existing TypeScript, native DSH Session persistence, EvolutionLedger and Vitest; no dependencies or new model provider.

## Global Constraints

- Continue the existing route and reuse R0–R10 and the summary learning core. Withdrawn R11/v7 work remains withdrawn.
- `CONVERSATION_MATERIAL_MAX_BYTES` remains exactly `96 * 1024`; do not change research thresholds, quality contract, permissions, tools, quotas, claim granularity, source admission or model configuration.
- Preserve native Session bytes, raw request/result digests, source scope, message identities, original user content, feedback and separate tool-result evidence.
- New projection applies only to assistant message content: text blocks survive unchanged; reasoning/tool-call blocks are not task-answer or historical user-visible text. Keep message id/role and empty projected messages so answer identity checks do not drift.
- Missing projection marker means the old full-content behavior, including old context/material hashes. Invalid explicit marker, null or undefined must be rejected, not treated as legacy.
- No broad recursive sanitizer, new summarizer, truncation, backfill, regrading, forced branch or historical cohort rerun.
- Fixed `f8b8945` native-use evidence and candidate artifacts remain immutable. New outputs and any revised candidate go to a distinct E child. Daily is still Runtime017/Desktoppreview18.

## Actual failure and acceptance boundary

The single real native-use handoff episode had four ordinary inputs, one explicit consent enable, two post-consent tasks, zero feedback assessments and zero studies. Task `6590a366...` was admitted and completed, but review material was 113,339 bytes. Task `c31fd238...` completed the user's work, but its admission material was 110,244 bytes. Internal assistant reasoning, not visible user input or tool results, dominated both failures. Both were rejected before the affected child call.

Read-only projection of the retained first task gives admission 17,343 bytes, original review 24,219 bytes and actual dual-review wrapper 50,847 bytes. The second admission becomes 21,124 bytes. This proves a concrete size hypothesis, not a model verdict. The second task has no successful admission, so do not manufacture a review material or verdict for it.

Evidence: `E:/待清理/D盘迁移-2026-09-08/Tianwen-自然入口复用-022/NATIVE-MATERIAL-LIMIT-DIAGNOSIS.md` and `native-use/evidence/actual-outcome-final.json`.

The frozen first auditor failed on JSON-omitted undefined keys. It remains unchanged, with its original failure. A separately named, one-line JSON-roundtrip-corrected supplemental auditor passed provenance checks at 22:08 on unchanged f8 source: 30 frozen files, five native header epochs, one admission proof, two completed tasks, no dual panels/feedback/studies. That is provenance, not learning success. Do not call the original frozen audit green.

## Task 1: Version the assistant analysis projection without invalidating legacy evidence

**Files:**
- Modify: `packages/tianwen-evolution/src/conversation-learning.ts` (source contract and strict parser).
- Modify: `packages/tianwen-runtime-bundle/src/conversation-task-material.ts` (explicit projection and version-aware recovery).
- Modify: `packages/tianwen-runtime-bundle/src/conversation-observer.ts` (freeze new marker at admission; use task marker in review).
- Modify: `packages/tianwen-runtime-bundle/src/conversation-feedback-assessment.ts` (answer projection follows target task marker).
- Test: `tests/dsh-migration/conversation-learning.spec.ts`, `conversation-task-material.spec.ts`, `conversation-observer.spec.ts`, `conversation-feedback.spec.ts`, and existing guidance-loop/recovery suites when needed.
- Create implementation record: `.superpowers/sdd/2026-09-08-tianwen-visible-learning-material/task-1-report.md`.

**Interfaces:**

```ts
// Existing ConversationTaskSource; absence is the historical native projection.
readonly materialProjection?: 'surface-text.v1'

// Extend existing helper signatures, defaulting to the legacy behavior.
conversationMessages(events, projection?: ConversationTaskSource['materialProjection'])
conversationContext(events, boundary, projection?: ConversationTaskSource['materialProjection'])
```

Consumers must supply `task.source.materialProjection` when recovering an already-started task. Only admission of a brand-new task selects `'surface-text.v1'`. Do not infer a mode from matching hashes: empty/unchanged contexts can have identical native and projected hashes.

- [x] **1. Write failing behavioral tests before production changes.** Name the break each catches. Include assistant text plus reasoning larger than 96 KiB and a native tool call; keep a real native Session and complete provider fixtures in integration tests. Check actual admission/review/feedback material, not merely a helper's existence.

  Required literal outcomes: new projection retains exactly the original assistant text, user blocks and message ids; none of the large reasoning/tool-call bytes enters analysis material. A native material with omitted marker stays unchanged. Unknown/null/explicit-undefined markers fail the strict source parser. A truly oversized visible text still produces `material-too-large` before a model call. The existing eight-turn boundary still excludes the current answer from pre-answer context.

- [x] **2. Record meaningful RED.** Load `D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1`, run the focused suites with `D:/hermes/node/node.exe` and `D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs`. Save first outputs in a new E `visible-material-fix` directory. Compilation/import/fixture errors are not the defect RED.

- [x] **3. Apply the narrow implementation.** Follow the existing optional `qualityContract` strict-parser pattern, not a general parser refactor:

```ts
// Add the marker only when explicitly present and validate its exact value.
...(Object.hasOwn(value, 'materialProjection') ? ['materialProjection'] : [])
// For the returned source, use existing oneOf validation with one valid value.
...(Object.hasOwn(input, 'materialProjection')
  ? { materialProjection: oneOf(input.materialProjection, ['surface-text.v1']) }
  : {})
```

  In `conversationMessages`, select `message.content.filter(block => block.type === 'text')` only for an assistant and explicit surface marker; otherwise keep the prior content. Do not drop empty assistant messages. Pass the marker through `conversationContext`, material recovery, observer review and feedback answer reconstruction. New observer source freezes the marker before requesting admission. Native request/result digests stay on original native material, unchanged.

- [x] **4. Prove compatibility and GREEN.** Recover legacy source/context and feedback/study materials with reasoning still present and their earlier hashes unchanged. Recover new source/review/feedback with the same explicit projected mode after restart. Mutating native current-task content or the frozen projection marker must not create a valid recovery; keep existing rejection tests. Exercise actual native one-shot admission plus both independent reviews and natural-feedback material using scripted transport only as engineering tests, never as real-model acceptance.

  Run focused suites, guidance/claim recovery consumers, typecheck and `git diff --check`. Do not weaken old assertions to get green or copy expected values from the helper under test.

- [x] **5. Commit only assigned production/tests/report.** Record exact RED/GREEN commands and results, legacy-compatibility coverage and any remaining limitations. An independent scoped reviewer must approve this change before it becomes a release candidate.

## Task 2: Verify only the changed connection and finish delivery gates

**Owner:** Main agent after Task 1 review, not the implementation worker.

- [x] Recompute the retained actual failing materials through the revised production helpers without model calls or historical ledger edits. Preserve the old failed native outcome; a successful replay calculation is not a replacement actual verdict.
- [x] At the reviewed fixed commit, perform justified final code validation. New production changes invalidate the previous candidate's code gate as a release claim, but the previous f8 receipts remain valid history. Reuse unchanged environment/dependencies and use distinct result/fixture targets.
- [x] Decide the smallest additional real-use check for this now-demonstrated connection defect: one bounded normal work continuation in a separately recorded revised environment, never a rerun of R0–R10 or a search for an optional study/source branch. Clearly distinguish the old failed episode from any corrected-version observation; preserve all outcomes.
- [x] Reproduce revised candidate bytes and preserve the old f8 package. Complete real Desktop ownership/page/normal-shutdown evidence without relying solely on GUI stdout. No further blind Profile creation or checker iterations; instrument a concrete mismatch before rerunning.
- [ ] Only after code, real-use and delivery gates allow it: normal non-forced integration, exact main CI, current E backup, normal Daily upgrade and preservation checks. No tag/npm publication, worktree deletion, credential copying or unbacked overwrite.

## Self-review

2026-09-09 checkpoint: Task 1 approved at e9b5a02; final code 6367f07 has 2279 TypeScript
and 609 Python passes, with unchanged production bytes. One real bounded work episode reached
two admissions, two dual-review panels and one natural correction; all native proof bindings passed.
No study/source branch was forced. Desktop visible normal shutdown verified. Integration/Daily
delivery remains unchecked above. See [exact result and limitations](../../operations/tianwen-visible-material-022-results-20260909.md).

This plan addresses only a demonstrated learning-material defect. Explicit source versioning preserves the user's historical-reuse requirement; the safety cap and independent evaluator remain unchanged. No task-specific writing rule is added. The work is authorized as routine correction within the existing route; it is not a strategy change or permission expansion.
