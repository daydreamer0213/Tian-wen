# Feedback Source and Semantic Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the two demonstrated R9 learning/review gaps prospectively, then finish the existing integration and protected Daily delivery route on new evidence.

**Architecture:** Recover exact feedback through the existing native-binding verifier and carry it as non-factual prospective standard material. Use quality v6 to clarify semantic authority in the existing two native reviewers, preserving historical contracts/prompts and exact audit v2. DSH remains the only Agent/model/persistence owner.

**Tech Stack:** Existing TypeScript, DSH0.1.1-rc.2, Vitest, Node22, pnpm11.20.0, Python and Electron gates; no new dependencies.

## Global Constraints

- Repo `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`, branch `codex/conversation-claim-evidence`; R9 source `dc1b8ba71765de9382cf90da56bba2e46c05ac4c`. Never delete this Daily-shortcut worktree.
- R1–R9 inputs, artifacts, verdicts, native Sessions and frozen controls are immutable. Daily Runtime017/Desktop preview.18 and the original shortcut remain untouched until verified delivery.
- DSH `0.1.1-rc.2` remains the native execution owner. Use the full configured DeepSeek call configuration unchanged; no new dependency, SDK, model override, host retry, third judge, JSON repair, external Skill, permission or budget cap.
- Current prospective quality is `tianwen.conversation-quality.v6`; exact historical v1–v5 contracts and their native proof meanings remain readable and unchanged. Current and v5 use exact `tianwen.claim-audit.v2`; v4 keeps v1. No retroactive regrading, converting saved captures or mixing old-quality support into new studies.
- Preserve the existing lossless claim projection and IDs, 128 answer units, 512 claims, 32 KiB audit, 96 KiB judgment material and 32 KiB answer limits. Over-limit material remains unavailable, never silently truncated.
- Keep two distinct compatible source requests, a separate successful counterexample, five cases/ten trial arms, two blind checks and existing acceptance, consent, rollback and deduplication rules. Do not loosen thresholds or force activation.
- Exact recovered feedback goes only to prospective case design, proposal and source-trial review. It never goes to blind trial-answer workers, becomes factual source evidence, or changes an original-result review.
- Candidate Runtime `0.1.21` / Desktop `0.1.0-preview.22`; preserve supported Runtime010–020 predecessors and reject unknown022. No dependency/lockfile changes, tag, package publication or upstream push.
- Root owns design, plan, acceptance and delivery; one implementation worker at a time, independent read-only reviews may overlap. Use apply_patch and D:-local generated data. Preserve unrelated changes and never print credentials.
- Standing authorization covers ordinary implementation, actual configured model use, normal integration and recoverably backed-up Daily delivery. A material strategy or authority expansion still requires user direction.

Binding spec: `docs/superpowers/specs/2026-09-08-tianwen-feedback-source-semantics-design.md`.
2026-09-08 user addition: before preparing another large acceptance environment,
retire verified inactive leftovers to the existing E-drive migration area.
Each future acceptance closeout follows
`docs/operations/tianwen-acceptance-artifact-retention.md`. Historical bytes and
verdicts remain immutable; a recorded physical archive relocation is allowed.
Current worktree, shared dependencies, active data and Daily targets are excluded.
R9 final evidence: `docs/operations/tianwen-natural-conversation-acceptance-r9-results-20260908.md`.
Parent native-capture Tasks1–3 are closed (Task3 NO-GO); do not redispatch them.
Fresh data root: `D:/DevData/tianwen-feedback-source-semantics-20260908`.

## Environment

Before every pnpm call:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-feedback.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/conversation-claim-review.spec.ts tests/dsh-migration/conversation-claim-recovery.spec.ts
```

Use repo `.venv/Scripts/python.exe` for native TS fixture authority; full Python
uses `D:/DevData/tianwen-resume-stage-closeout-python312/Scripts/python.exe`.
Record exact BASE before each worker. Use new fixture roots; no old receipt reuse.

### Task 1: Bound original feedback and versioned semantic authority

**Files:**
- Modify `packages/tianwen-runtime-bundle/src/conversation-task-material.ts`, `conversation-feedback-assessment.ts`, `conversation-guidance-loop.ts`, `conversation-claim-review.ts`.
- Modify `packages/tianwen-evolution/src/conversation-learning.ts`, `conversation-guidance.ts`; only necessary current-version handling in `conversation-observer.ts` and exports in `index.ts`.
- Test `tests/dsh-migration/conversation-feedback.spec.ts`, `conversation-guidance-loop.spec.ts`, `conversation-claim-review.spec.ts`, `conversation-claim-recovery.spec.ts`, `conversation-learning.spec.ts`, `conversation-guidance.spec.ts`, `conversation-guidance-ledger.spec.ts`, `conversation-review-panel.spec.ts`, `conversation-observer.spec.ts`, `learning-consent-agent.spec.ts`; update current fixtures in `conversation-audited-response.ts` only as necessary, preserving historical literals.
- A new focused `tests/dsh-migration/conversation-feedback-standard.spec.ts` is allowed only if the integration assertions cannot remain readable in the existing suite; Task2 must then add its exact CI suite registration. No new production module is needed.
- Update current-version expectations in `conversation-claim-capture.spec.ts`, `conversation-claim-audit.spec.ts` and `conversation-judgment.spec.ts` only if their actual current contract changes; keep literal historical capture expectations unchanged.

**Interfaces:** Existing `materialForAssessment(assessment): Promise<ConversationFeedbackMaterial>` remains the verifier. Extend `ConversationTaskMaterial.feedbackStandard` with `readonly originalFeedback?: ConversationFeedbackMaterial['feedback']` using a type-only import; optionality preserves historical material. Current v6 feedback-supported source material always supplies this field. Existing public run/recover signatures remain unchanged.

Use a small internal instruction selector in `conversation-claim-review.ts`, called by both producer and recovery. Read the contract from the bound `source.qualityContract` for original results or `task.qualityContract` for studies. Validate known present contracts with `parseConversationQualityContract`; select v6 only for exact v6, and retain the exact previous instruction for historical/absent contracts. A present unknown or mutated contract throws `invalid-judgment`. Audit v2 alone cannot identify the policy version. A v6 feedbackStandard without originalFeedback is invalid; legacy material does not acquire a synthetic originalFeedback.

- [ ] Step1: Record BASE; capture literal exact v5 quality object and old PURPOSE/COMMON/FOCUS from BASE as historical fixtures. Add RED tests for v6 current parsing, v5 unchanged hash/readability, old-quality exclusion/retirement, correct v4/v5/v6 audit-parent rules and current two-check/proof guards. Do not derive historical expectations from the updated current builder.

```ts
expect(conversationQualityContract().schemaVersion).toBe('tianwen.conversation-quality.v6')
expect(parseConversationQualityContract(literalV5)).toEqual(literalV5)
expect(hasCurrentConversationQuality(literalV5)).toBe(false)
expect(() => parseConversationQualityReviewChecks(v1Checks, conversationQualityContract())).toThrow()
expect(parseConversationQualityReviewChecks(v2Checks, literalV5)).toEqual(v2Checks)
```

Here `literalV5` is copied from BASE and `v1Checks`/`v2Checks` use the existing explicit audit-fixture builders. Exercise real ledger append/replay, not only parser functions.

- [ ] Step2: Extend actual native feedback-driven study fixtures to assert all three consumer material paths receive the entire exact verified `.feedback` while worker inputs exclude it. Include natural direct feedback where derived criteria intentionally reverse the actor or omit a negation/exception, plus native notes, source without feedback and existing edited/retracted bindings. Compare objects, not merely presence of a keyword:

```ts
const recovered = await harness.ctx.tianwenConversationFeedback.materialForAssessment(assessment)
expect(source.feedbackStandard.originalFeedback).toEqual(recovered.feedback)
expect(source.feedbackStandard.criteria).toEqual(assessment.result!.supplementalCriteria)
expect(sha256(source)).toBe(recordedCase.materialDigest)
expect(JSON.stringify(workerMaterial)).not.toContain('originalFeedback')
expect(projectClaimEvidence({ task: source, answer }).items.some(item => item.text.includes(uniqueFeedbackOnlyText))).toBe(false)
```

Use the existing study fixture request-capture hooks to bind `source`, `workerMaterial`, `recordedCase` and actual `assessment`; `uniqueFeedbackOnlyText` is a test marker not present in original request/answer. Assert `conversationEvidenceTexts` and the evidenceQuotes whitelist also exclude feedback: do not expand one without native recovery's source validation. Test missing/tampered recovery fails without a replacement model call and oversize exact feedback remains unavailable rather than truncated.

- [ ] Step3: Run focused RED gates and preserve expected failing output. Implement the source construction using the existing active service and exact material recovery:

```ts
const recovered = await this.ctx.tianwenConversationFeedback.materialForAssessment(assessment)
return { ...original, feedbackStandard: {
  assessmentId: assessment.started.assessmentId,
  classification: assessment.result.classification,
  criteria: assessment.result.supplementalCriteria,
  originalFeedback: recovered.feedback,
} }
```

Keep the existing no-assessment return, current-activity checks, source material hash and worker request projection. If the service is unavailable, fail the study through existing handling; never silently fall back to criteria-only current material. Add concise raw-feedback precedence/speaker/negation/current-instruction guidance to case design, proposal and feedback assessment. Use one local shared instruction constant for the two learning consumers if it avoids duplicated prose; do not create a generic prompt service.
Apply only the attributed continuing preference or supported problem, not every new request in the complete feedback. Keep unresolved references ambiguous rather than forwarding old answers or extra transcript history.

- [ ] Step4: Keep explicit legacy v5 builder, make v6 append the spec's semantic clarification, and add v6 at the exact audited/dual-proof guards in both evolution parent state machines. Keep old prompt constants byte-identical and use the shared selector for generation and persisted verification. Current additional instructions must require actor/time/scope/commitment/premise checks while allowing optional advice, grounded fallible inference, fiction and courtesy. No R9 literal answer phrases or expected outcomes go into production. Keep the existing schema, material limits, quote checks, dual consensus, projection bytes and IDs.

```ts
// Historical builder remains exactly the old current value.
function legacyV5ConversationQualityContract(): ConversationQualityContract {
  return { ...legacyV4ConversationQualityContract(), schemaVersion: 'tianwen.conversation-quality.v5' }
}
```

Versioned tests inspect actual producer instructions/materials: v6 contains the new general authority contract and raw-standard precedence; v5 emits exactly its historical instruction. A current instruction substituted into an old proof, old instruction substituted into a current proof, changed raw feedback or unknown quality is rejected on persisted verification. Use real native session capture/restart fixtures, not fabricated success records.

- [ ] Step5: Verify current valid accepted study recovery after two complete-runtime restarts causes zero extra calls and at most one activation; old v5 records replay unchanged but cannot newly activate under v6. Keep historical v1 capture proof tests. Confirm a new ordinary turn remains possible while the earlier review is pending. Run all affected conversation suites, evolution/runtime builds and root typecheck once on the completed task; do not rerun the complete unrelated Python/TS gates here.

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' run typecheck
```

- [ ] Step6: Self-review changed call sites and historical behavior; commit only owned code/tests. Write the implementation report with exact RED/GREEN commands/results, skips and warnings. Root generates full BASE..HEAD diff; independent SPEC and QUALITY approval are required. Semantic efficacy remains unproven until real-model acceptance.

### Task 2: Runtime021 / Desktop preview.22 identity

**Files:** Existing current runtime/Desktop package manifests, controlled/portable profile and Desktop host/bootstrap modules, install/stage/audit/verify scripts, associated identity tests and current setup docs. `.github/workflows/ci.yml` and `tests/test_ci_workflow.py` only if Task1 adds a new suite. Historical reports and lockfiles remain untouched.

**Interfaces:** `tianwen-runtime-bundle-0.1.21.tgz`; Desktop `0.1.0-preview.22` embeds that exact archive. Runtime020 becomes a supported predecessor alongside010–019; unknown022 remains rejected. Normal managed install retains user data/config/shortcut.

- [ ] Step1: Record BASE. Add RED assertions to existing migration/identity tests:

```ts
expect(desktopManifest.version).toBe('0.1.0-preview.22')
expect(desktopRuntimeArchive).toBe('tianwen-runtime-bundle-0.1.21.tgz')
expect(resolveKnownOldDesktopTarget(previous020Target).profileRoot).toBe(previous020Target.profileRoot)
```

Use existing fixture names/builders for the actual modules; include exact020→021 install, malformed/unknown022 rejection and unchanged protected files.

- [ ] Step2: Update current version identities and explicit predecessor allowlists mechanically, separating historical020 literals from current ones. No runtime build output may overwrite the live Desktop path. Register any new Task1 suite beside the existing conversation group and its literal Python test expectation.
- [ ] Step3: Run existing runtime-bundle, installer, portable/controlled/runtime-profile, Desktop artifact/host/bootstrap/profile-prepare and ordinary goal CLI suites plus affected Python CI contract. Build/typecheck; preserve commands/results. Self-review, commit owned files and obtain independent scoped SPEC/QUALITY review.

### Task 3: Prospective evidence and final release decision

**Files:** Root-owned new diagnostic protocol, ordinary R10 protocol/results, isolated `D:/DevData/tianwen-natural-acceptance-r10-20260908`, and newly adapted reviewed controls. Reuse existing implementations by prospective path/version adaptation; R9 bytes remain immutable.

**Interfaces:** Full clean final-source gates bind exact HEAD. Runtime021 repeated archives, full isolated Desktoppreview22, fresh installed profile and full model configuration are frozen before first candidate model call. `originalFeedback` is protected by the actual new case material digest and native request proof; current quality audit is v6/v2.

- [ ] Step1: Root self-reviews spec/plan coverage and obtains broad current-plan source review, carrying forward closed parent reviews. Run new complete TS/Python gates at clean final source, twice-pack byte equality, strict isolated Desktop/new-profile setup and actual prepared-Desktop lifecycle. Use the installer's existing deterministic pack recipe: `UV_THREADPOOL_SIZE=1` and `--skip-manifest-obfuscation`. Preserve all first failures.
- [ ] Step2: Before calls, commit/freeze a small controlled real-model semantic diagnostic set: unprovided real-sender future commitment, invented necessary dependency, known-current versus uncertain-future scope, a permitted labeled inference, optional advice and requested fiction. Use fixed novel task/answer material and privately frozen expected criteria; actual two native reviewers receive no expected verdict. This diagnoses the general semantic contract, not natural learning or efficacy. No output repair, same-item retry or deleting unfavorable outcomes.
- [ ] Step3: Freeze one fresh finite natural-input R10 cohort with different topics/facts from R9, ordinary consent, two distinct naturally expressed continuing preferences, one counterexample and later current-instruction/advice/fiction checks. No command/packet/internal-tool instruction. Preserve the first-study terminal checkpoint before post-study ordinary inputs, whether accepted, rejected, stopped or absent. Inputs may be prewritten but model answers/rules are unknown and unedited; label it controlled real-model use, not external-user evidence.
- [ ] Step4: Own the actual isolated service and fresh IAB tab; log send timestamps, first native text deltas and original first outcomes. Capture exact source/native data with reviewed read-only helpers. Independent answer reviewers are blind to product verdicts/arm identity until their first report and any blind calibration addendum are frozen. Verify all provenance separately, then compare semantics, learning, latency and actual guidance selection. No activation-seeking extra inputs.
- [ ] Step5: Close only the owned service/tab if still present and verify unchanged terminal state. If already exited, report observed absence and retained state, not a claimed graceful shutdown. Record an explicit release decision. Proven blockers enter a specifically justified next decision; do not repeat the identical cohort to obtain green. Keep finite-evidence and long-term-benefit claims separate.
- [ ] Step6: Apply the user's artifact-retention procedure to this closed cohort: keep necessary evidence and current delivery dependencies, archive inactive large leftovers to E with verified hashes and a relocation receipt, then report actual D-space recovery. Do not move the candidate Desktop/archive until any pending delivery no longer needs its current location or the reviewed delivery inputs explicitly bind the archived location.

### Task 4: Finish authorized integration and protected Daily delivery

**Files:** Current results/handoff and fresh exact-version delivery controls/backup receipts; use the previously reviewed protected delivery sequence from the parent plan.

**Interfaces:** Normal no-force merge/push, four successful CI jobs on exact main SHA before Daily mutation. Current protected-data inventory and exclusive backup bind all updater inputs and exact archive/Desktop bytes.

- [ ] Step1: Only after release approval, refresh clean source/remote state and perform normal authorized merge/push. Require all four exact-main CI jobs; preserve/report any first failure without automatic retry.
- [ ] Step2: Fresh exact-target process/config/data/shortcut inventory and recoverable exclusive backup; pin reviewed control bytes before import. Normal managed Runtime021 install and Web update must preserve all protected old files except exact permitted version fields. Check frozen archive receipt and protected data before replacing Desktop. Recoverably retain the previous Desktop and Runtime packages.
- [ ] Step3: Install the exact verified prepared Desktop, then verify actual prepared Daily Desktop/Web lifecycle, protected old data, authorized new-file inventory and repeat managed-install idempotence. No NSIS uninstall, publication, forced git reset or worktree deletion.
- [ ] Step4: Commit honest current results/handoff and verify exact-main CI for that commit. Mark parent integration/delivery complete only for actually achieved scope. Preserve necessary receipts/reviews/history and report the remaining finite-use/latency/long-term efficacy limits plainly.
