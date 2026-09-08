# Natural exploration reuse implementation plan

> Execute with subagent-driven-development in the existing isolated worktree. User has authorized routine autonomous implementation; do not ask again between tasks.

**Goal:** Connect automatic natural-task studies to the existing bounded exploration semantics without fabricating summary identities or invalidating prior evidence.

**Design:** `docs/superpowers/specs/2026-09-08-tianwen-natural-exploration-reuse-design.md`.

## Global Constraints

- Preserve every legacy v1 exploration request field, digest, identity, parser behavior and existing summary route. No fabricated Run, SkillUse, SkillVersionId or accepted outcome.
- Natural exploration belongs to the existing GuidanceStudy; at most one immutable request and one receipt per control/treatment slot. No new scheduler, database, retry loop or experiment platform.
- Reuse the hypothesis/prediction validation and observation classifier in learning-exploration.ts; do not copy their logic into a second engine.
- Preserve original request/context, separately attributed raw feedback and timing, current consent, frozen parent guidance/model/quality identity. Do not retroactively regrade old answers.
- Exploration observations are not acceptance or proof of causation. Formal five-case/ten-arm candidate evaluation and activation thresholds remain unchanged.
- Do not launch R11, repeat old cohorts, call live models, modify Daily, repack Desktop, change dependencies or use external sources in these implementation tasks. Preserve unrelated edits.

## Task 1: Add explicit natural exploration request contract

Ownership: `packages/tianwen-evolution/src/learning-exploration.ts`, `packages/tianwen-evolution/src/index.ts`, `tests/dsh-probe/learning-exploration.spec.ts` only, plus assigned report. You are not alone; do not revert other work.

1. Start from existing legacy tests. Add failing tests for new exports `prepareConversationLearningExploration` and `parseConversationLearningExplorationRequest`.
2. Define `ConversationLearningExplorationProposal` with exactly sourceTaskId, hypothesis, alternative, temporaryInstruction, expectedIfHypothesis, expectedIfAlternative. Share hypothesis and prediction types/validation with the existing implementation, preserving old canonical results.
3. Define `ConversationLearningExplorationContext` with studyId (GuidanceStudyId), sourceTaskId (conversation-task:64 lowercase hex), parentVersion (Sha256Digest), sourceMaterialDigest, environmentDigest, qualityContractDigest and proposalProof (GuidanceProof). Host supplies every field; pure preparation does not check live authorization.
4. Define the natural request as these frozen values plus schemaVersion `tianwen.learning-exploration-request.v2`, sourceKind `conversation-task`, metric `conversation-task-quality.v1`, proposal, explorationId and requestDigest. It has NO analysisId/sourceRunId/parentVersionId/controlSessionId/treatmentSessionId. Use study identity domain `{kind:'tianwen.learning-exploration.v2',studyId}` for explorationId. Hash the full canonical body (everything except explorationId and requestDigest) for requestDigest.
5. Validate each context identity and proof exact fields (sessionId nonblank max512 UTF-8 bytes, no NUL; sessionDigest/requestDigest valid Sha256Digest). Copy/freeze proof and all nested predictions/proposal/request; do not retain mutable input aliases. Ensure sourceTaskId agrees between proposal and host context. Shared hypothesis rules remain max4096 UTF-8 bytes, different nonblank explanations and distinct predictions. Natural context is typed host input; persisted parser enforces exact request fields and recomputed canonical digest/IDs.
6. Widen `classifyLearningExploration` only to the minimal structural prediction requirement so both request types use the same function. Keep existing legacy APIs and constant digest `sha256:042240f48341928ead9798a81826db11ab93b57525c218bc9fa7c8505283e500` unchanged.
7. Tests cover natural stable pair identity with changed proposal/proof/source bound to changed digest; study change changes ID; canonical round-trip; unknown/missing fields, malformed identities/proofs, source mismatch, indistinguishable explanations/predictions, UTF-8 limit, tampered metrics/hash/IDs rejected; nested freeze; same classification table for both sources. Do not test only that mocks were invoked.
8. RED then GREEN focused command: source `D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1`; invoke `D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs exec vitest run tests/dsh-probe/learning-exploration.spec.ts`. Then package typecheck `... pnpm.mjs --filter @tianwen/evolution typecheck`. No whole-repo run or Desktop build.
9. Self-review, commit only owned files, report exact tests/results/RED and GREEN evidence, concerns and commit. No claim that runtime is connected yet.

## Task 2: Bind natural exploration to the existing guidance ledger

Pending Task 1 interface review. Detailed task brief will be frozen before dispatch; do not execute from this outline.

Extend existing conversation guidance records/state and Evolution validation with exploration intent and arm records referencing the shared natural request. Host derives source/parent/model/quality from opened study, permits only source1/source2 and supported current study before candidate/decision/stop, rejects changed intent/receipt, binds actual native proofs and review consensus, keeps exploration arms outside formal ten arms, and prevents candidate recording before an initiated exploration has finished. Historical replay and exact duplicates preserve frozen facts; new writes use current authority. Reuse existing native ledger persistence, not another controller. Tests must demonstrate these boundaries and restart reconstruction without claiming resumed execution.

## Task 3: Connect automatic study proposal and native execution

Pending Task 2 review. Detailed task brief will be frozen before dispatch; do not execute from this outline.

Adapt existing proposal stage to direct method / explore / insufficient. Reuse native one-shot task execution and current blind claim review with frozen material; no schema-driven fake answers. Persist initial decision proof, shared natural intent/actual arm receipts, feed observed results to a new proposal within the same logical study, then existing candidate/evaluation/activation. No second exploration pair or forced candidate on insufficient evidence. Target existing natural-guidance integration facilities for reachable exploration, no exploration, invalid source, insufficient evidence, withdrawal/stale parent and startup stop. R0–R10 and R11 remain outside the execution queue.

## Completion boundary

Tasks 2 and 3 must be refined and reviewed against actual interfaces before execution. Task 1 alone is an internal compatibility checkpoint, not feature completion. External source reuse, focused real-model acceptance after connection, mainline/CI and actual backed-up Daily upgrade remain explicit subsequent work; no earlier evidence is reset by this plan.
