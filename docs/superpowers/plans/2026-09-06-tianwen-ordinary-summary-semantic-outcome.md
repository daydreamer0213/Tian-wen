# Ordinary Summary Semantic Outcome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make genuinely failed ordinary summary content eligible for the existing learning route, without altering old evidence or bypassing real-model acceptance.

**Architecture:** Extend existing Run contracts and Outcome events with strict, versioned inline native-review proof. Run independent review inside the source submit tool, then carry the same frozen semantics through existing analysis, exploration and v3 evaluation source lineage.

**Tech Stack:** TypeScript, DSH native agents/Sessions/tools, existing Evolution ledger, Vitest, pnpm and the existing isolated browser acceptance host.

## Global Constraints

- Work only in D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge on codex/ordinary-summary-semantic-outcome, base 8b9439289ac85db6c5426fea5fbd27eacbe07c5e; generated data stays on D:.
- User delegates routine implementation, repair, testing and DeepSeek calls; API-side quota is authoritative. Do not add another call/cost budget or request routine permission.
- Old A–D, rejected B Candidate, v1 Outcome shapes/digests and legacy v2 protocols remain immutable and retain their interpretation.
- Outer Outcome evidenceIds and sessionDigest remain source-owned; reviewer Evidence is only inline proof. Invalid, missing or incomplete review is inconclusive, never a qualifying failure.
- Use native DSH agents, model configuration, tool registration, persistence and cancellation; no provider SDK, new scheduler, receipt entity, database or generic evaluation platform.
- Reviewer input contains only exact source packet, canonical submission and frozen rubric; no Candidate, feedback, expected answer, desired winner or prior grading. No answer-fitting retries or invented history.
- Fresh ordinary semantic success is existing ID hard gates plus sourceFidelity >= 3 using the existing five-dimension 0–4 rubric. Existing v3 paired/holdout/activation rules remain unchanged.
- External summarization Skill authorization remains read-only and restricted to the existing isolated acceptance environment; no daily install or extra tool permission.
- Preserve unrelated changes and active daily Desktop output. Only a reviewed new version may replace delivered bytes through the normal installer.

## Environment and recovery

Node D:/hermes/node/node.exe; pnpm D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs.
Set PATH with D:/hermes/node first, COREPACK_HOME=D:/DevData/corepack-home,
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false, TIANWEN_DSH_PROBE_ROOT=D:/DevData/tianwen-dsh-probe,
TIANWEN_DSH_PROBE_PYTHON=<worktree>/.venv/Scripts/python.exe,
TEMP/TMP=D:/DevData/tianwen-dsh-probe/temp. Existing dependencies are sufficient.
Use apply_patch for edits and explicit workdir for every command.

Baseline: 2026-09-06 13:19 Beijing, existing research-summary.spec.ts plus
research-summary-admission.spec.ts passed 66/66 (3.95 seconds) before changes.
Delivery/real acceptance state is separately preserved at
D:/DevData/tianwen-real-user-retest-20260905/delivery/ordinary-summary-quality-checkpoint-20260906.md.

### Task 1: Versioned semantic Outcome contract and replay

**Files:**
- Modify: packages/tianwen-evolution/src/outcome-intake.ts, ledger.ts, index.ts
- Test: tests/dsh-probe/outcome-intake.spec.ts, tests/dsh-probe/skill-governance.spec.ts (existing ledger and Skill-use fixtures)

**Interfaces:**
- Produces `ResearchSummaryQualityContract`, `ResearchSummarySemanticReview`, and `prepareResearchSummarySemanticReview(value: unknown)` from Evolution.
- Existing `RunAcceptanceContract` gains optional explicit qualityContract with exact version `tianwen.research-summary-semantic-contract.v1` and rubricDigest fixed to CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST. Legacy shape remains exact when absent.
- Existing `OutcomeIntakeInput` becomes a legacy/new union; semantic input adds semanticReview. Outcome event v1 remains legacy; semantic event is `tianwen.outcome-intake.v2`.
- `prepareResearchSummarySemanticReview` is strict: null/undefined/malformed/incomplete completed objects throw. Runtime converts unavailable native attempts into explicit canonical inconclusive proof; this parser never coerces bad input. Semantic Outcome always requires semanticReview, including outer inconclusive. A completed proof may conservatively have outer inconclusive; native source state justifies that downgrade at Runtime, not a fabricated domain source flag.

```ts
type ResearchSummarySemanticReview =
  | {
      schemaVersion: 'tianwen.research-summary-semantic-review.v1'
      status: 'completed'
      acceptanceSubjectDigest: Sha256Digest
      submissionDigest: Sha256Digest
      rubricDigest: Sha256Digest
      reviewerSessionId: string
      reviewerSessionDigest: Sha256Digest
      requestDigest: Sha256Digest
      reviewEvidenceId: Sha256Digest
      idGateVerdict: 'met' | 'not-met'
      scores: ControlledSkillEvaluatorDimensionScoresV3
    }
  | {
      schemaVersion: 'tianwen.research-summary-semantic-review.v1'
      status: 'inconclusive'
      reasonCode: 'no-canonical-submission' | 'review-not-completed' | 'review-invalid'
      attempt: null | {
        acceptanceSubjectDigest: Sha256Digest
        submissionDigest: Sha256Digest
        rubricDigest: Sha256Digest
        reviewerSessionId: string
        requestDigest: Sha256Digest
        reviewerSessionDigest: Sha256Digest | null
      }
    }
// Fixed verdict, verified again by prepareOutcomeIntake on write and replay:
const verdict = review.idGateVerdict === 'met' && review.scores.sourceFidelity >= 3
  ? 'met' : 'not-met'
```

- [x] Write RED tests through real Evolution ledger APIs: semantic contract rejects absent proof/plain met/not-met, wrong subject/rubric, forged verdict and malformed scores; score 2 produces failure, score 3 plus IDs produces success, ID failure remains failure; explicit canonical inconclusive proof (including attempt:null) permits only inconclusive, while malformed completed proof is rejected. Completed proof may downgrade to inconclusive when source failed. Old input/event digest and replay stay exact; no semantic proof in v1 event/legacy contract. Same Run input cannot replace reviewer proof. Skill-use still consumes original source Evidence and digest.
- [x] Run the focused tests before implementation; record named assertions failing for missing behavior, not setup/import accidents. Use existing real ledger fixture helpers, no mock-only proof.
- [x] Implement strict contract/proof parsers and central prepareOutcomeIntake binding/verdict checks. Require acceptanceSubjectDigest for semantic contracts. Keep v1 event parser exact and add v2 parsing; record correct event version and verify replay through the same preparation. Existing inputDigest includes proof; do not add a new ledger entity.
- [x] Run `pnpm exec vitest run tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/skill-governance.spec.ts` and `pnpm run typecheck`. Add live/replay tampering coverage where the existing event harness permits it.
- [x] Self-review and commit; report exact interfaces, RED/GREEN commands/results and changed files for independent task review. Do not change Runtime yet.

Task 1 completed at product commit `d5b2836`, independently spec compliant and
quality Approved with no findings. Focused 39/39, full 1715 passed/18 conditional
skips and typecheck exit 0 cover that Task 1 source, not later Task 2 work. `fe5c1bb`
only removes an accidentally tracked local report from Git; product bytes match.

### Task 2: Native independent reviewer and ordinary admission

**Files:**
- Create: packages/tianwen-runtime/src/research-summary-quality.ts (one focused native review helper, not a general platform)
- Modify: packages/tianwen-runtime/src/index.ts, learning-intake.ts, research-summary.ts only if a minimal reusable normalization boundary is needed
- Modify: packages/tianwen-runtime-bundle/src/research-summary-admission.ts
- Test: tests/dsh-probe/research-summary-quality.spec.ts (new), tests/dsh-migration/research-summary-admission.spec.ts; existing native source/Skill-use tests as applicable

**Interfaces:**
- Consumes Task 1 qualityContract and semanticReview types/parser.
- Exposes focused native run/recover helpers from research-summary-quality.ts for ordinary admission and later exploration. Input is exact parent Agent/Run binding, frozen packet/submission, actual source call configuration, AbortSignal; output is validated ResearchSummarySemanticReview. The implementer fixes exported names/signatures in its report before downstream work.
- Extends RuntimeOutcomeVerdictAttestation with optional semanticReview, forwards proof unchanged to Outcome input, and rejects the legacy successful-tool=>met fallback for qualityContract Runs.

```ts
// Preserve createResearchSummaryTool's synchronous accepted-submission reservation.
const originalExecute = sourceTool.execute
sourceTool.execute = async (args, execution) => {
  const result = await originalExecute(args, execution)
  if (isCanonicalAcceptedSubmission(result)) {
    // Resolve actual admitted Run here, never the provisional run:pending closure.
    await runNativeQualityReview(result.submission, execution.signal)
  }
  return result // unchanged not-evaluated; grade is not source-model feedback
}
// Admission source attestation remains acceptanceEvidenceId: ORIGINAL submit Evidence.
// Completed native proof's grade determines verdict; unavailable proof is inconclusive.
```

- [x] Write RED actual native-agent/provider-harness tests: IDs met but prose low score=>not-met; score >=3=>met; grade remains invisible in source submit result; missing submission/review, abort/provider error, invalid receipt, altered request/config/material/schema, extra inherited tools/Skill context and forged/mismatched native proof cannot produce conclusive Outcome. One valid source submission and one deterministic child only, including concurrent calls and recovery. Legacy Run restoration must keep ID oracle and never initiate semantic review.
- [x] Record failing tests, then implement native agents.create controlled child with no seed, source parent metadata, sole strict grade tool, existing model-selection/call-config APIs, pre-provider actual-request guard, persistence/Evidence checks and disposal. Relay source ToolRunContext.signal to native cancellation. Freeze actual source configuration before review; no resource budget or provider SDK.
- [x] Use a deterministic child identity per frozen source Run/turn; persisted complete exact child is reusable without a model call, invalid/incomplete prior attempt is inconclusive, not replaced. Recovery authenticates native parent/session lifecycle/material/request/submission Evidence, not only a caller-provided proof object. Pure Evolution verifies structure; trusted runtime validates provenance before attestation.
- [x] Bind fresh ordinary summaries to research-summary-result.v2:<skillVersion> plus qualityContract. Preserve old bindings exactly. Reconciliation keeps source Evidence/source sessionDigest, validates proof, consumes Outcome, records native Skill use and observes Outcome in existing order. Do not create a post-turn queue. Source tool review is active work cancellable with native Stop.
- [x] Run focused native reviewer/admission/intake/Skill-use suites and root TypeScript check. Confirm no provider request on rejected guard/recovery and no fabricated failure on infrastructure errors.
- [x] Self-review and commit; report exact public helper signatures and request/material proof definition for Task 3 plus full RED/GREEN evidence.

Task 2 completed at `8cef6e8` after independently verified normalization repair
over `a016f8f`. Focused fix coverage 44/44 and typecheck pass. The earlier full
run remains 1718 passed / 8 failed / 18 skipped: Task 3 owns the concrete downstream
failures. Task 2 recovery evidence is same-Context durable rereading; full
dispose/remount coverage is explicitly carried into Task 3, not claimed here.

### Task 3: Semantic analysis, exploration and real Outcome v3 source lineage

**Files:**
- Modify: packages/tianwen-runtime-bundle/src/outcome-learning-intake.ts, learning-analysis-child.ts only for exact added source observation, learning-exploration.ts, learning-loop-orchestrator.ts, research-summary-source-case.ts, explicit-correction-protocol.ts
- Modify: packages/tianwen-evolution/src/learning-exploration.ts, controlled-skill-evaluation.ts, ledger.ts
- Modify: packages/tianwen-runtime/src/skill-evaluation.ts only to distinguish the new source union's structural discriminator from opaque forbidden source identities
- Modify: packages/tianwen-runtime/src/research-summary-quality.ts and its input type exports only for the narrow persisted-source recovery interface needed by completed exploration arms; keep one reviewer implementation
- Modify: packages/tianwen-runtime-bundle/src/research-summary-admission.ts only to remove the obsolete live-Agent argument at its existing recovery call when adapting that input interface
- Test: tests/dsh-probe/outcome-learning-analysis.spec.ts, tests/dsh-migration/learning-loop-orchestrator.spec.ts, tests/dsh-probe/controlled-skill-evaluation.spec.ts, tests/dsh-probe/learning-exploration.spec.ts, tests/dsh-migration/learning-exploration.spec.ts
- Test: tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts for new Outcome source identity collection and preserved identity exclusion
- Test: tests/dsh-migration/explicit-correction-product.e2e.spec.ts for the real native ordinary-summary-to-analysis/exploration/resume assembly and role-specific child counts
- Test: tests/dsh-probe/research-summary-quality.spec.ts for full Context disposal/remount and persisted source recovery with no live source Agent and zero new provider requests

**Interfaces:**
- Consumes strict semantic Outcome event/proof and Task 2 native review run/recover helpers.
- Adds real Outcome source identity branch to existing ControlledSkillSourceFidelityContract source; explicit-feedback source remains unchanged. Freeze facts from actual ledger Run/Outcome/Signals, never manufacture messageId/feedbackVersion.
- Source identity binds selected failed Run, source Session/material and semanticReview digest. Reuse deterministic first sorted failed signal member used by learning-candidate.ts, not analysis status.sessionId.
- New exploration semantic metric is exactly `research-summary-source-fidelity.v1`, selected from frozen source qualityContract and present in existing request/environment digests. It retains the existing ID hard gates plus sourceFidelity >= 3 and the same frozen rubric/reviewer; legacy request shape/digests retain `research-summary-required-id-coverage.v1`.
- New semantic arms use the existing source-capture tool mode and keep its unchanged `not-evaluated` result, as required by Task 2 proof recovery; legacy arms keep controlled-enforce. For fully cold completed arms, recover by inspecting `run.sessionId` and deriving authoritative source metadata from the native persisted header, not by fabricating an Agent or executing a model turn. The warm reviewer input continues to require the actual source Agent.

```ts
// Select from already-frozen supporting facts, before Candidate creation.
const sourceSignalId = [...analysis.signalIds].sort()[0]
// Resolve its genuine failed Run/Outcome, verify exact parent/contract and native
// source evidence, then recover that exact packet for v3 original-task material.
// Keep old Outcome analyses at v2; only the explicit new semantic branch gets v3.
```

- [x] Write RED tests through real Evolution facts: two semantic failures plus valid success counterexample form native analysis; mixed legacy/semantic contract or incomplete proof cannot substitute. Analysis material includes exact completed review observation and source. Existing legacy cases still behave identically.
- [x] Extend ordinary intake category/material, source recovery and ledger freeze/replay facts. Introduce exact Outcome source union parser; reject invented explicit feedback IDs, wrong Run/source/material/review digest, success-as-original and Candidate-dependent selection. Validate both live protocol freeze and replay.
- [x] Extend orchestrator version selection: fresh semantic Outcome=>v3 with real source packet; legacy Outcome=>v2; existing explicit-feedback=>v3 unchanged. Missing semantic proof is no protocol, never fallback to weaker v2. Preserve original fixed other evaluation tasks and v3 14-run rules.
- [x] When adding an Outcome source discriminator, update Shadow review's source identity collection so a structural value such as `source: 'outcome'` is not treated as a secret identity substring. Add a native regression whose legitimate holdout text contains `outcome`, while actual opaque source Run/Session/proof identities still trigger refusal. Legacy identity collection and material rules stay unchanged.
- [x] Write and run RED exploration native-arm tests before extending execution: semantic metric frozen on new requests, same review and threshold on both arms, inconclusive remains inconclusive, child material contains no arm role/hypothesis, cancellation and native source Evidence preserved. Old request digests and ID oracle remain unchanged.
- [x] Implement versioned metric selection and reuse Task 2 native review for both arms. Avoid separate semantic graders, task queues or changing inputs after outcomes are known.
- [x] Narrow the existing recover helper input to allow cold source recovery directly from the stored Run and native persistence. Validate stored Run equality, lifecycle and exact native source/reviewer material using persisted metadata; do not trust caller-supplied parent depth/cwd. Add a test that disposes the original Context, remounts the same native persistence, has no live source/reviewer Agent, and recovers/reconciles without a provider call. Also retain invalid/incomplete refusal and the normalized-submission/raw-Evidence separation repaired in Task 2.
- [x] Resolve the concrete downstream failures recorded by Task 2's full regression in `explicit-correction-product.e2e.spec.ts`: preserve native semantic-review fixtures for fresh summaries, verify actual analysis/consent/exploration/resume causes, and distinguish quality-review children from analysis children in role-specific assertions. Do not blindly change expected results or assume all failures are merely fixture drift; trace and test each failed interface. Mechanism provider fixtures remain separate from genuine model acceptance.
- [x] Run all focused analysis/source/protocol/exploration suites and root TypeScript check; self-review and commit with exact RED/GREEN reports for independent review.

Task 3 completed at `c990398` after independently verified native Outcome Evidence
subset repair over `82db3f7`. Full baseline1740 passed/18 conditional skips and
fix covering113/113 plus typecheck pass. The new unmocked native regression
recovers Skill-use/Outcome/analysis and freezes v3, rejecting forged acceptance
Evidence. Task2 full dispose/remount Minor is independently resolved. Historical
and final artifact/genuine-effect gates remain controller-owned below.

### Task 4: Immutable next-version delivery compatibility

**Files:**
- Modify: packages/tianwen-runtime-bundle/package.json, src/portable-profile.ts, src/controlled-lifecycle.ts
- Modify: packages/tianwen-desktop-host/package.json, src/host.ts, src/main.ts, src/locale.ts, src/profile-prepare.ts only where version readiness requires it
- Modify: scripts/install-tianwen.mjs, scripts/stage-desktop-runtime.mjs, scripts/verify-dsh-profile.mjs, scripts/audit-desktop-artifact.mjs, .github/workflows/ci.yml, README.md
- Test/update current-version assertions: tests/dsh-migration/controlled-lifecycle-command.spec.ts, controlled-lifecycle-profile.spec.ts, one-shot-profile-lifecycle.spec.ts, ordinary-long-goal-cli.spec.ts, portable-goal-cli.spec.ts, portable-plugin-lifecycle.e2e.spec.ts, portable-profile-composition.e2e.spec.ts, runtime-bundle.spec.ts, runtime-profile.spec.ts, tianwen-desktop-artifact.spec.ts, tianwen-desktop-distribution.e2e.spec.ts, tianwen-desktop-host.spec.ts, tianwen-desktop-profile-prepare.spec.ts, tianwen-installer.spec.ts, tianwen-startup.e2e.spec.ts, tianwen-version-upgrade.e2e.spec.ts

**Interfaces:**
- Advances current Runtime from `0.1.13` to `0.1.14`, Desktop from `0.1.0-preview.14` to `0.1.0-preview.15`; DSH stays `0.1.1-rc.2`.
- Adds exact known Runtime `0.1.13` predecessor to existing managed/Web update paths, keeping `0.1.12`, `0.1.11`, `0.1.10` and original DSH rc.7 support. New archive is `tianwen-runtime-bundle-0.1.14.tgz`.
- Existing independently reviewed delivery increment c576d7b is a reference for paths and tests, not permission to replay/overwrite old artifacts.

```ts
const CURRENT_RUNTIME_VERSION = '0.1.14'
const LEARNING_LOOP_PREDECESSOR_VERSIONS = ['0.1.13', '0.1.12', '0.1.11'] as const
// Existing classifier must recognize exact intact 0.1.13 as predecessor,
// then become current after ordinary installer upgrade; identical second install
// returns the same receipt. Damaged/mixed/source-linked predecessor remains refused.
```

- [ ] Write RED exact `0.1.13` managed/Web predecessor tests, preserved Session/state/archive and repeat-install identity assertions using existing retained predecessor fixture pattern. Freeze the old profile patch independently of evolving renderProfilePatch; verify actual old `0.1.13` patch matches the retained learning-loop predecessor template before reuse.
- [ ] Run focused installer and Desktop profile/host tests and record failures for the missing successor/old-version readiness, not nonexistent files or missing dependencies.
- [ ] Update current version/package/archive/runtime readiness/CI artifact paths consistently and add narrowly recognized `0.1.13` migration. Add the new native `tests/dsh-probe/research-summary-quality.spec.ts` to the existing CI ordinary-learning check (the workflow enumerates files explicitly). Preserve old checks and immutable historical examples; do not globally replace every old version string. README describes a current candidate, not an already completed user delivery or genuine effect.
- [ ] Run focused version/lifecycle/install/artifact checks and typecheck. Rebuild Runtime declarations/bundle in the existing project output before artifact checks, maintaining current exact native module identity. Do not package Desktop into the active `dist/tianwen-desktop/win-unpacked`, install into daily state, or publish externally; root owns physical candidate packaging and delivery after final gates.
- [ ] Self-review and commit only owned source/tests/docs, not SDD scratch. Report precise RED/GREEN and current-version/predecessor handling for independent task review. Known optional E2E skips and build warnings remain explicit.

## Post-implementation route (controller-owned, not a claim of completion)

- [ ] After task reviews, obtain broad exact-SHA independent review of this branch and resolve findings, then run current full automated gates and artifact/native identity checks.
- [ ] Build separately versioned isolated runtime artifact; never overwrite delivered 0.1.13 bytes or the active Desktop dist output. Verify metadata/SHA and preserve old source records.
- [ ] Freeze new genuine user scenarios before execution, use Codex in-app browser and real DeepSeek once per scenario, retain all results and inspect actual user-visible friction, cancellation and status. Mechanism fixtures are not genuine acceptance.
- [ ] Observe actual ordinary content-quality Outcomes, analysis/exploration, genuine Candidate, v3 evaluation, holdout/activation and later active-Skill use as required by the canonical total route. Do not weaken gates, plant answers or repeat attempts for a lucky failure/success. Keep honest terminal rejection/inconclusive evidence and continue only with independently justified next work.
- [ ] Deliver reviewed/versioned repair through normal installation after exact-SHA gates, preserve daily data and rollback artifacts, and update canonical route/handoff with actual results and remaining limitations. Use existing authorized integration workflow; no new external publication or authority inferred.
