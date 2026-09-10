# Feedback adaptation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect genuine mixed-task feedback to the existing independently
validated learning flow without requiring whole-task replayability.

**Architecture:** Reuse native feedback proof and complete-source guidance study.
Version the prospective clue policy, fit exact optional clues into the existing
proposal packet budget, and preserve study identity and recovery. Diagnose 026
offline independently; never regrade it.

**Tech Stack:** TypeScript, existing DSH native Agent/Session APIs, Vitest, Node22.

## Global Constraints

- Actual worktree: D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge; branch codex/conversation-claim-evidence; baseline26fd588.
- New task starts use `proposalCluePolicy: 'feedback.v2'`; v1/absent history remains unchanged.
- v2 external clues may inform text or local-files studies; local-file clues still require incomplete material and matching fileOutputKind/local-files study.
- Same scope/family/category/consent/parent/quality/native model; at most two active attributed disjoint clues; no clue is an actual source or success proof.
- Reuse `CONVERSATION_MATERIAL_MAX_BYTES`; skip whole optional clues before freezing if the exact initial packet exceeds capacity. Preserve frozen dependencies thereafter.
- No clues reach case designer, trial worker or independent reviewer. Two complete supports, complete successful counterexample, five cases and both arms remain required.
- No old cohort replay/regrade; no fake feedback, seeded study or model answer in real acceptance. Scripted tests prove engineering only.
- No dependency install/relink, Daily/default dist/shortcut mutation, external publishing or destructive cleanup. Node D:/hermes/node/node.exe; call existing tools directly, not pnpm install/run/exec.
- Temporary test data: E:/待清理/D盘迁移-2026-09-08/Tianwen-反馈适配-027/tests; set TIANWEN_TEST_TMPDIR and any test helper's documented root explicitly. Preserve old failed receipts.
- Root owns docs, diagnosis integration and later real-run protocol; implementer owns only named source/tests. Do not revert others' edits.

---

### Task 1: Version and connect optional feedback clues within the existing budget

**Files:**
- Modify packages/tianwen-evolution/src/conversation-learning.ts (policy parser/type).
- Modify packages/tianwen-evolution/src/conversation-guidance.ts (study parser mode gate).
- Modify packages/tianwen-evolution/src/ledger.ts (cross-record clue compatibility).
- Modify packages/tianwen-runtime-bundle/src/conversation-observer.ts (future marker).
- Modify packages/tianwen-runtime-bundle/src/conversation-feedback-assessment.ts (policy-specific projection budget).
- Modify packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts (eligibility, initial packet fitting, frozen recovery).
- Test affected conversation-learning, conversation-guidance, conversation-guidance-ledger, conversation-feedback, conversation-guidance-loop and conversation-file-learning specs under tests/dsh-migration.

**Interfaces:** Existing proposalClueForAssessment(assessment), GuidanceProposalClue,
GuidanceStudyBody, recoverProposalClues(study) remain; do not add a public service.
The only new persisted value is the task source policy string. Reference shape
remains taskId/assessmentId/assessmentDigest/materialDigest. Pure local helpers
are permitted to avoid duplicated eligibility/packet construction, but do not
split unrelated code or create a generic policy/budget subsystem.

- [ ] Step 1: Add focused failing tests using existing native harness and real ledger.
  Required cases: v2 parser round-trip, absent/v1 stable; v2 external clue reaches
  text and file proposer without fileOutputKind; v1 external excluded; complete
  files/text/subjective excluded; incompatible category/model/consent/family and
  pending/positive replacement excluded. Preserve existing v1 file tests.

```ts
// Behavioral test assertions, using the current native harness setup:
expect(started.source.proposalCluePolicy).toBe('feedback.v2')
expect(proposalPacket.proposalClues[0].feedback).toEqual(exactDirectFeedback)
expect(study.opened.sourceTaskIds).not.toContain(externalTaskId)
expect(caseDesignPacket).not.toHaveProperty('proposalClues')
```

- [ ] Step 2: Run the new named tests before implementation and retain actual RED
  output under this plan's workspace. Use Node to run node_modules/vitest/vitest.mjs
  with the relevant resolved file and -t filter. Fix fixture errors separately;
  red must name a missing production behavior, not a typo or import error.
- [ ] Step 3: Implement policy parsing/selection and ledger agreement, native
  recovery preserving v1 eligibility. Implement projection budget by target
  policy; unknown/absent policy cannot acquire v2 semantics.

```ts
// Eligibility shape; preserve all existing identity and assessment checks.
const external = policy === 'feedback.v2' && mode === 'external'
const incompleteFile = mode === 'local-files' && studyMode === 'local-files'
  && outputKind === studyOutputKind && incomplete
const eligible = ['feedback.v1', 'feedback.v2'].includes(policy ?? '')
  && (external || incompleteFile)
```

- [ ] Step 4: Add RED capacity tests for a genuine native projection above8192
  accepted under v2, same projection rejected under v1, exact packet overflow
  skipping a whole optional clue while retaining the ordinary study, two clues
  fitting independently but overflowing together, and multibyte byte counting.
  Implement exact initial-packet fitting before study-opened. Move only the
  existing catalog lookup if needed to count it before freezing. Derive the
  studyId from each candidate reference list so the packet being measured is
  the one actually sent. Greedy order remains current newest-first and max2.
  A later packet over budget retains old terminal behavior, never drops a frozen
  clue silently. No new fixed reserve or substitute summarization.
- [ ] Step 5: Add/run native integration proving proposer-only delivery, unchanged
  complete-source identities/independent comparison, v2 withdrawal before
  proposal, projection/proof drift refusal on cold recovery without new calls,
  and no study from clue alone. Reuse existing setup and assertions rather than
  duplicate all old trials. Existing no-clue recovery remains unchanged.
- [ ] Step 6: Run the complete affected test files once and Evolution then Runtime
  declared type builds via existing Node scripts. Report exact counts, warnings,
  any failed initial runs, and terminal results without calling all green if a
  relevant failure remains. Commit only owned source/tests after verification.
- [ ] Step 7: Self-review and write task-1-report.md with RED/GREEN commands,
  receipt paths, changed files, commit identities and uncertainties. Independent
  spec/quality review follows; do not push, merge, run models or change Daily.

## Root-owned follow-through after Task 1

- [ ] Incorporate offline 026 review diagnosis. If a proven host defect requires
  repair, record a minimal additional task with exact reproduction before code;
  do not fix domain-specific answer errors or retry old judgments.
- [ ] Review the increment, freeze a finite genuine-model cohort covering its
  actual complete-source prerequisite and mixed-task clue, then build/pack once
  to E and run through IAB using the official browse workspace picker.
- [ ] Record actual clue consumption and independent study terminal result,
  close owned runtime, verify retained data. Decide release versus NO-GO from
  evidence; push development results. Do not equate this with stable improvement.
