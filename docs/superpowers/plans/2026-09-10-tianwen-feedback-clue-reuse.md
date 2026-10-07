# Feedback clue reuse implementation and delivery plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for implementation and review; the root performs real UI acceptance and release operations.

**Goal:** Deliver the approved A/B/C increment without treating partial files as complete evidence.

**Execution closeout (2026-09-10):** Task1 implementation and independent review complete
at8382384; Task2 fixed genuine IAB/DeepSeek acceptance executed on eeb84dc, but the
new connection gate was not met (external admission and oversized clue); Task3
NO-GO, preserve Daily022, no merge/install/automatic027. See
`docs/operations/tianwen-feedback-clue-026-results-20260910.md`. Checklists below
are the frozen execution instructions, not an automatic pending-work queue.

**Architecture:** Add bounded, provenance-bound proposal references to the existing study, using the existing feedback material recovery. Keep complete source eligibility, independent case design, paired execution, reviewers and activation rules. No separate clue service.

**Tech Stack:** TypeScript, installed DSH 0.1.1-rc.2, native persistence and Agent judgments, Vitest; Windows PowerShell and Codex IAB for actual product acceptance.

## Global Constraints

- Future-only `proposalCluePolicy: 'feedback.v1'`; optional historical fields stay absent when absent.
- At most two proposal-only clues, each at most 8192 UTF-8 JSON bytes; oversized clues are skipped, never truncated.
- No raw fileInputs, fileResult, tool output or file reread in clue material. No extra analysis/model call to extract a clue.
- Full source eligibility, five cases, two arms, independent reviewers, scope/consent/quality/model matching and future-only adoption remain unchanged.
- Clue withdrawal invalidates proposal dependency through existing rollback; historical tasks/cohorts are not regraded.
- Use the current D worktree/dependencies. Do not install, run pnpm install/exec, change shared links, touch Daily/shortcut, or reopen 023–025.
- New temporary test data: `E:/待清理/D盘迁移-2026-09-08/Tianwen-局部线索-026/engineering` via TIANWEN_FILE_TEST_ROOT; only exact owned cleanup.
- Read the spec `docs/superpowers/specs/2026-09-10-tianwen-feedback-clue-reuse-design.md` for the binding product contract.

## Task 1: Implement the complete proposal-only clue connection

**Ownership / files:** The implementer owns the following source and focused tests, and no packaging/version/operations files. It is not alone in the codebase; preserve other edits.

- Modify `packages/tianwen-evolution/src/conversation-learning.ts`, `conversation-guidance.ts`, `ledger.ts`, `index.ts`.
- Modify `packages/tianwen-runtime-bundle/src/conversation-observer.ts`, `conversation-feedback-assessment.ts`, `conversation-guidance-loop.ts`.
- A small pure projection helper may live in `conversation-feedback-assessment.ts`; do not create a service or generic evidence framework.
- Test `tests/dsh-migration/conversation-learning.spec.ts`, `conversation-guidance.spec.ts`, `conversation-guidance-ledger.spec.ts`, `conversation-feedback.spec.ts`, `conversation-guidance-loop.spec.ts`, and `conversation-file-learning.spec.ts` when its native file fixture is the suitable integration owner.

**Interfaces:**

```ts
interface GuidanceProposalClue {
  readonly taskId: string
  readonly assessmentId: string
  readonly assessmentDigest: Sha256Digest
  readonly materialDigest: Sha256Digest
}
// Added optional fields, not replacements:
// ConversationTaskSource.proposalCluePolicy?: 'feedback.v1'
// GuidanceStudyBody.proposalClues?: readonly GuidanceProposalClue[]
// Existing feedback service supplies native-verified projection, e.g.:
// proposalClueForAssessment(assessment): Promise<ConversationProposalClueMaterial>
// The material has schemaVersion 'tianwen.proposal-clue.v1', taskId,
// request, answer, feedback, classification, category, supplementalCriteria.
```

- [ ] Write failing parser/state tests first. Attach a literal new clue reference to a valid file opening and recompute only the study identity. Expect parser retention; malformed digest, duplicate identity, third clue, actual-source overlap and text-study usage must reject. Old openings round-trip unchanged. New task marker round-trips; absent marker remains absent.

```ts
const ref = { taskId: 'clue-task', assessmentId: 'clue-assessment',
  assessmentDigest: `sha256:${'a'.repeat(64)}`, materialDigest: `sha256:${'b'.repeat(64)}` }
const { kind, studyId, ...base } = validFileOpening
const body = { ...base, proposalClues: [ref] }
expect(parseConversationGuidanceRecord({ kind, ...body, studyId: guidanceStudyId(body) }))
  .toMatchObject({ proposalClues: [ref] })
```

- [ ] Run the focused test using `node node_modules/vitest/vitest.mjs run <actual-test-file> -t <new-test-name>`; record expected RED output before implementation. Missing fixture variables or import errors are not feature RED.
- [ ] Implement optional schema fields and export the reference type. In ledger support validation separately validate clue provenance dependencies: complete original task but incomplete files; prospective marker; exact compatible study dimensions; native model digest; latest active eligible feedback; assessment/result digest; exclude pending/later-positive/retracted assessments. Preserve actual source loops unchanged. Include clues in support retraction checks for future state mutations without making them source cases.
- [ ] Write native projection tests: valid exact request/answer/feedback; no raw files/tool output; 8192-byte bound; rejected native proof/material drift, historical/unmarked task and withdrawn feedback. Use existing persistent feedback harness; model adapter is only a test double.
- [ ] Implement the feedback projection using `materialForAssessment` plus `recoverConversationStructuredJudgment`. The exact expected structured result is classification/category/supplementalCriteria/explanation/evidenceQuotes, excluding record bookkeeping. Check native material digest equals assessment.started.materialDigest and the result matches the ledger; validate nonempty accepted feedback category. Project only the specified surfaces, never truncate. Keep old feedback material/digests and old assessment requests unchanged.
- [ ] Write failing native file-loop integration: an incomplete marked file task with actual attributed feedback, plus the ordinary three complete study sources. Assert the proposer packet has the exact clue; case design, all trial/reviewer packets and five source/case identities exclude it. Check ten arms / existing decision and future guidance use. Add no-full-sources => no-study, withdrawn clue => no proposal/activation or support rollback, cold accepted recovery with substituted clue => no activation/zero new model calls. Reuse existing fixtures, do not plant file results to call them real-model evidence.
- [ ] In the observer, mark new task-started records. In the loop, select at most two newest eligible clues for an already-qualified local-files group, excluding the three real sources. Match all study dimensions, use native recovery, skip unavailable/oversized clues without failing ordinary work. Freeze references before proposing. Add projected material only to every actual proposal call; keep it out of independent case generation, exploration/trial workers and review material. Make instructions conditional on nonempty clues. Revalidate references and exact projected digest before every proposal/activation and on cold recovery; recover native proposal material and compare its clue array to frozen references even without a sourceReference/exploration. Preserve no-clue legacy recovery.
- [ ] Run focused tests to GREEN, then once the affected suite. Build Evolution before Runtime tests because Runtime imports its dist:

```powershell
$env:TIANWEN_FILE_TEST_ROOT='E:/待清理/D盘迁移-2026-09-08/Tianwen-局部线索-026/engineering'
node node_modules/typescript/bin/tsc -b packages/tianwen-evolution/tsconfig.json --pretty false
node node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-learning.spec.ts tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts tests/dsh-migration/conversation-feedback.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/conversation-file-learning.spec.ts
node node_modules/typescript/bin/tsc -b packages/tianwen-runtime-bundle/tsconfig.json --pretty false
```

Use exact existing file names, do not run a nonexistent path. Preserve and explain initial harness/build errors. No provider calls. Update the report with RED/GREEN commands/results, self-review, changes, limitations; commit only owned files. Controller runs independent review; no push/merge by implementer.

## Task 2: Freeze and verify the changed candidate

**Owner:** root coordinates packaging changes after Task 1 review, then native acceptance. Use existing installer/build/audit workflow, not a replacement harness.

- [ ] Read Task 1 report and run its task review; resolve load-bearing findings before packaging.
- [ ] Verify the current candidate identity/version and exact predecessor list, then update only necessary version/package test lists through TDD if new behavior is required. Existing Runtime024/preview25 is unreleased; a new candidate must have unique documented source/archive identity and not overwrite 025.
- [ ] Run affected packaging/import/type/build gates once; preserve old unaffected proof and audit new bundle bytes. Freeze immutable candidate, environment and bounded real-use protocol under the E026 root. Freeze ordinary input/criteria before the answer, no forced trigger or expected reply.
- [ ] Use the Codex IAB and existing webpage browse workspace selection; no Edge or Windows chooser. Actual configured DeepSeek, no caller-written answers. One new ordinary mixed file task; only actual user-relevant feedback supported by the result. Do not replay old tasks or manufacture a study. Record whether a compatible complete study opportunity exists and whether the new proposer actually consumes the clue.
- [ ] Verify exact source/task/feedback/proposal provenance at whichever boundary actually ran. No opportunity is not proof of proposal consumption. Withdraw learning in the same environment, verify historical evidence retained and future applications stopped; close the owned host/tab. Hash/retain necessary evidence and archive exact owned residuals.

## Task 3: Decide and perform delivery

**Owner:** root. Existing standing authorization covers normal branch push, controlled merge and backed-up Daily delivery after gates; no tags, package publication or unrelated changes.

- [ ] Review the whole new increment and inherited branch scope against the existing reviewed proofs. State GO or NO-GO for the declared limited feature, not universal file learning or long-term efficacy.
- [ ] If GO: normal push and controlled main integration, exact-main required CI, fresh target/data/config/shortcut inventory and E backup, supported upgrade and byte/data/lifecycle verification. Keep the old program recoverable and original shortcut unchanged.
- [ ] If NO-GO: do not merge/install; push source and truthful evidence, leave Daily022 unchanged, state the precise unmet condition. No automatic 027 or additional development scope.
- [ ] Update only current architecture/handoff/coverage entries with actual results. Report A/B/C separately and retain all unproved effects. Do not present engineering tests as real-model acceptance or branch push as delivery.
