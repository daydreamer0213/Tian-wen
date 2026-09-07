# Claim-evidence pilot implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prospectively test whether explicit claim/source auditing improves review before changing production v3.

**Architecture:** An opt-in module composes the existing native structured judgment function, existing dual-review consensus and exact native proof verification. Frozen independent controls compare current v3 and the experiment once; only a passed gate authorizes the subsequent shared v4 integration plan.

**Tech Stack:** Existing TypeScript, Vitest, DSH native Agents/Sessions, Node.js and configured DeepSeek.

## Global Constraints

- DSH continues to own native one-shot Agents, structured capture, Sessions, configuration, cancellation and persistence.
- No dependency, service, database, new general Agent loop, external Skill or increased tool authority.
- Current production review remains v3 until a separately frozen controlled model comparison passes.
- No historical regrading, no old output repair, no mixed-quality study support.
- Existing two-review consensus remains unchanged; disagreement stays inconclusive, never a confirmed learning failure or success.
- No word blacklist or permanent prohibition on specific R6 phrases.
- Failure ends this frozen comparison; no revision/retry against its answers to manufacture a pass.
- Work in `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge` on `codex/conversation-claim-evidence`; preserve the daily executable, linked worktree and unrelated edits.
- Task2 generated pilot artifacts go under `D:/DevData/tianwen-claim-evidence-pilot-20260907`; later separately authorized cohort tasks use their explicitly named independent D: roots and never modify older frozen cohorts. Every such pilot is evaluator diagnostics, not natural acceptance or study support.

---

### Task 1: Opt-in claim projection and dual native review

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`
- Create: `tests/dsh-migration/conversation-claim-review.spec.ts`
- Read: `packages/tianwen-runtime-bundle/src/conversation-judgment.ts`, `conversation-task-material.ts` in the same directory and `tests/dsh-migration/conversation-review-panel.spec.ts`.
- Read design: `docs/superpowers/specs/2026-09-07-tianwen-claim-evidence-review-design.md`.
- Do not change production callers, domain contracts, versions, lockfile or existing tests. A narrowly necessary reusable export from conversation-judgment.ts may be proposed to the controller before editing.

**Interfaces:**
- Consume public `runConversationJudgment`, `CONVERSATION_REVIEW_SCHEMA`, `conversationEvidenceSchema`, `verifyConversationReviewCheck` from conversation-judgment.ts; domain `sha256`, `parseConversationReviewChecks`, `conversationReviewConsensus`, `ConversationReviewCheck`.
- Export `projectClaimEvidence(material: unknown)` returning `{schemaVersion: 'tianwen.claim-evidence.v1', items, evidenceDigest}`; each item `{id, role: 'user'|'assistant'|'tool'|'answer', origin: 'context'|'request'|'tool'|'answer', text, toolStatus?: 'success'|'error'}`. The digest binds ordered items. IDs are deterministic local counters, not model-supplied IDs.
- Export `validateClaimAudit(audit: unknown, evidence: ReturnType<typeof projectClaimEvidence>, verdict: 'met'|'not-met'|'inconclusive')` returning the typed audit specified in the design or throwing `invalid-judgment`.
- Export `runConversationClaimReview` with the same input signature as `runConversationReview`, preserving `{...consensus, reviewChecks}` but every check additionally retains the validated `audit`. No default caller uses it yet.

- [ ] **Step 1: RED projection and validator tests.** Write direct tests with independently hand-built material/expected projections (not another implementation used as the oracle). Cover original `{source, conversation, toolEvidence}` and study `{task, answer}`; task can have request/context or generated prompt. Unsupported material fails closed. Preserve native roles, context order before current request, actual tool error status, same text in user and assistant as separate IDs, no criteria/feedback as sources, full lossless Unicode/newline text and every answer unit. Retain existing material96KiB/answer32KiB bounds;128 answer units,512 claims,32KiB audit. Reject extra keys, foreign/answer source IDs, duplicate/missing answer units, nonexact quotes, digest tampering, assistant-only supported source facts, invalid kind/status combinations and passing verdicts containing unsupported/contradicted/uncertain claims. Positive tests include user confirmation, ordinary advice/inference/fiction and nonfactual courtesy.

```ts
const material = { task: { prompt: '原料已送达。只改写这句话。', criteria: [] }, answer: '原料已送达。' }
const evidence = projectClaimEvidence(material)
expect(evidence.items.map(({ role, text }) => ({ role, text }))).toEqual([
  { role: 'user', text: '原料已送达。只改写这句话。' }, { role: 'answer', text: '原料已送达。' },
])
```

- [ ] **Step 2: Run focused test and retain expected missing-export failure.** In PowerShell load `D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1`; run `node D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs exec vitest run tests/dsh-migration/conversation-claim-review.spec.ts` from the repository. Use the existing native persistent harness pattern for the later integration tests; no new fake native lifecycle.
- [ ] **Step 3: Implement pure projection/validation.** Split losslessly at line boundaries and at most384 Unicode code points, retaining newline/whitespace units rather than silently deleting content. Read original material shape from the actual observer and native Session content types. Do not infer roles from wording. Include tool status in the projection. Check original material bytes before projection and let native material limit also reject an oversized final payload. Unsupported nontext content must not become invented text evidence. Audit quote fragments must be nonempty and from the exact assigned unit. At least one assessment per unit; supported source-fact needs user/tool evidence. The host verifies identity/structure, not semantic truth. Implement the design's exact audit interface, including schema version and explanation/source IDs on each claim.
- [ ] **Step 4: RED native composition tests.** Reuse real native one-shot/persistence harness, mocking only the LLM adapter. Prove two isolated requirements/grounding checks with same frozen material, requested full callConfig, no prior result fed to the next reviewer, exact audit-bearing capture recoverable with existing `verifyConversationReviewCheck`, invalid/missing audit rejected, disagreement inconclusive, cancellation/provider failure not success. Assert checks retain the raw full audit; proof validation detects changed audit even when the summary is unchanged.
- [ ] **Step 5: Implement experimental composition.** Reuse native judgment and consensus, not a new Agent implementation. Give each reviewer explicit scope/time/certainty/commitment and source-authority checking instructions from the design, plus its independent focus. Preserve original-result vs method-study feedback boundary. Prompt requires every substantive claim to be assessed and distinguishes clearly labeled advice/fiction/general knowledge from unsupported task-specific facts. Native output schema declares all audit fields and closed objects. Parse legacy summary fields separately with the existing parser, then attach the validated audit without losing it. Never put model labels, expected control outcomes or the other reviewer result into the material.

```ts
const native = await runConversationJudgment(ctx, parent, { ...input, material: { original: frozenMaterial, claimEvidence: evidence }, instruction, outputSchema })
// Parse the existing review fields through the existing domain parser, validate
// audit against this frozen projection, and retain both in the proof-bound check.
```

- [ ] **Step 6: GREEN, self-review and commit.** Run the new focused test plus conversation-review-panel, conversation-judgment and conversation-task-material tests, and the runtime bundle typecheck/build needed by its existing package scripts. Record exact commands, RED and GREEN evidence in the assigned report. Commit only owned files. Return concise status and concerns; no real model calls in this task. Independent task review must approve before Task2 executes model calls.

### Task 2: Frozen real comparison and evidence-led decision

**Files:**
- Create outside repo: `D:/DevData/tianwen-claim-evidence-pilot-20260907/controls.json`, `runner.mjs`, `freeze.mjs`, `assess.mjs`, isolated `dsh-home/profiles/diagnostics/cordis.patch.yml`, `runtime/review-diagnostic.js`, retained first-run logs and native Sessions.
- Create: `docs/operations/tianwen-claim-evidence-pilot-20260907.md` after execution.
- Do not edit Task1 production-source files to fit controls. Root owns this task while Task1's worker owns its two files.

**Interfaces:**
- Consume Task1 `runConversationClaimReview`, current `runConversationReview` and `verifyConversationReviewCheck`, bundled with esbuild using existing installed dependencies; no packages installed.
- Each control is `{id, task, answer, expected: 'met'|'not-met', rationale}`. `task` is generated prompt/criteria or original request/context material; expected and rationale are never sent to the model.
- Native runner emits one JSON record per case/arm, including IDs, arm, started/completed timestamps, either result with proof-bound audit or unavailable error. All first outcomes retained; no resume that repeats a finished arm.

- [ ] **Step 1: Prepare twelve new independently labeled controls, six bad and six valid, before any call.** Cover scope, current/future certainty, added cause/condition, prior-assistant contamination, explicit user confirmation/correction, authorized advice and fiction, current output constraint versus old preference, and normal courtesy. Use fresh facts, not R6 answers. Have a separate read-only reviewer judge label clarity and coverage; remove ambiguity before freezing, never after seeing model results.
- [ ] **Step 2: Adapt the existing R6 diagnostic native harness into the new root with explicit unique root Session/profile and same configured DeepSeek.** Use `D:/DevData/tianwen-natural-acceptance-r6-20260907/diagnostics/runner.mjs` and `freeze.mjs` as read-only references. Do not invoke a task-producing parent Agent. Each control runs each arm exactly once; two checks per arm; alternate arm order across controls. No third review or forced tie break. Verify each returned check with native persistence. Native successful captures containing a bad audit remain stored even if the arm is unavailable.
- [ ] **Step 3: Test freeze/assessment logic before execution.** Assert6met/6notmet, unique IDs, required profile/bundle/controls hashes, no prior frozen.json or Sessions. Fake records test all pass-gate predicates and unavailable/disagreement preservation; they are harness tests, never model evidence. Config is `{provider:'deepseek-official',model:'deepseek-v4-flash',reasoningEffort:'high',maxTokens:256000}`.
- [ ] **Step 4: Freeze committed source SHA, bundle/runner/profile/control/assessment hashes, config and gate.** Gate: no experimental met on a bad answer; all6 valid met; at least4/6 bad not-met; correct conclusive decisions at least baseline; if baseline has false-met, experimental false-met count strictly lower. Freeze before native execution. Document48planned native checks, not a cost cap.
- [ ] **Step 5: Execute the profile, monitor its first attempts, and verify all receipts.** Use existing DSH0.1.1-rc.2 public CLI `node <dsh>/lib/bin.js --profile diagnostics` with isolated DSH_HOME/profile, no daily-state edits. Capture stdout/stderr safely without exposing credentials. Do not relaunch completed arms or update prompts to repair a result.
- [ ] **Step 6: Compute gate and independently review actual outcomes and native receipts.** Verify frozen hashes remained unchanged, request headers match config, unique native IDs, exact captured values/proofs and no answer/rationale leakage. Distinguish conclusive correctness, false-met, false-not-met, disagreement and unavailable. Record elapsed times without claiming statistical significance or general reliability.
- [ ] **Step 7: Commit honest diagnostic result and follow the evidence.** A failed pilot ends this frozen comparison; current daily v3 remains untouched and this experimental module is not activated. Diagnose the recorded failure without rerating old answers. A passed pilot leads directly to a separately concrete shared v4 integration plan with legacy readability/recovery tests, full gates, independent review, fresh ordinary in-app browser acceptance, exact-main CI and normal authorized delivery. Do not call the finite pilot natural acceptance or long-term learning success.

## Pre-flight self-review

The design's production migration is deliberately conditional on Task2; this plan's deliverable is the testable opt-in pilot, not an unvalidated production release. Interfaces are identical across tasks; original and study materials are explicit. Existing native lifecycle/consensus is reused. No mandatory implementation conflicts found. Standing user authorization selects execution in this task without another execution-choice prompt.

### Task 3: Restore the experiment's existing output contract for a future comparison

Added after real first-attempt evidence, not a modification of the ongoing frozen pilot. P02 and P06 normal-answer experimental panels are unavailable because a native check returned `met` with a non-null failure category. P02's two native audits correctly support/permit its facts and courtesy. Independent read-only diagnosis matched this to a missing old output-field instruction in new COMMON; legacy parser correctly rejects the contradictory result. This pilot cannot pass and must keep all first outcomes. This narrow fix may be implemented while the immutable pilot bundle continues; it cannot become current-pilot evidence or production v4.

**Files:**
- Modify only `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts` and `tests/dsh-migration/conversation-claim-review.spec.ts`.
- Read existing `packages/tianwen-runtime-bundle/src/conversation-judgment.ts:81` and `packages/tianwen-evolution/src/conversation-learning.ts:53` for actual output contract.
- No pilot artifact, caller, domain, version or legacy v3 implementation changes.

**Interfaces:**
- All Task1 public signatures and audit schema/semantics unchanged.
- Only make the already enforced legacy field rules explicit in the experimental reviewer instruction. The receiving parser remains authoritative and contradictory results remain unavailable.

- [ ] **Step 1: RED exact regression.** Extend the existing native harness test to assert the emitted reviewer prompt explicitly states: met requires null category; not-met requires a concrete violation and a non-null attributable failure category; conclusive reviews need evidenceQuotes; at most6 exact source/answer evidenceQuotes; explanation at most1536 UTF-8 bytes. Before the change these new instruction assertions must fail. Also exercise an actual mocked-LLM/native-capture `met` plus `source-fidelity` result and assert the panel still rejects it rather than normalizing it into success.

```ts
// Through the existing real native harness, not a fake native runtime:
await expect(runConversationClaimReview(ctx, parent, input)).rejects.toThrow('successful review check cannot assert a failure category')
// The prompt assertions protect the required interface description; they are
// not evidence that a real model obeys it. A fresh model comparison is still required.
```

- [ ] **Step 2: Restore only the missing existing field contract in COMMON.** Keep all claim/source guidance, source roles, limits, purposes, native identity and consensus unchanged. Explicitly name UTF-8 bytes, not characters. Do not add conditional schema machinery: installed DSH supports a restricted schema subset and its object root cannot combine type with oneOf; existing host parsing already implements the correct invariant. Do not silently clear a non-null category or retry a failed check.
- [ ] **Step 3: GREEN and self-review.** Run the new focused regression and all four Task1 test files; runtime typecheck. Use the verified absolute pnpm launcher `D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs` after loading the existing gate-env.ps1. Record expected RED and actual GREEN commands/output. No real model calls and no rebuilding/replacing the running pilot bundle.
- [ ] **Step 4: Commit owned files and independent review.** Report exact commit/test evidence. Passing code tests do not release this revision. Only after current Task2 first outcomes and native audit finish may a new independent prospective cohort be designed/reviewed/frozen against this changed revision; do not reuse P01-P12 as formal acceptance answers, lower the gate or retrofit their labels. Integration remains conditional on a future passed gate.

### Task 4: Fresh prospective comparison after the field-contract repair

Task2 finished all24arms/48checks with gateFAIL and independent evidence review approval of that failure. Task3 restored only the old output-field instructions and passed56tests/typecheck plus independent review. This is a separate prospective comparison, never a rerun/regrade of P01-P12.

**Files:**
- New isolated evidence root `D:/DevData/tianwen-claim-evidence-pilot-r2-20260907` with controls.json, runner.mjs, freeze.mjs, assess.mjs, assess.spec.mjs, audit.mjs, build.mjs, runtime/review-diagnostic.js and its own native profile/Sessions.
- Eventual result doc `docs/operations/tianwen-claim-evidence-pilot-r2-20260907.md`.
- Root owns these artifacts; production code is unchanged unless a new separately supported defect is found. No old pilot file changes.

**Interfaces:** Same Task1 public APIs and original v3 baseline; same12case/24arm/48plannedcheck design and identical five pass-gate predicates from Task2. Source revision includes c27b8ce and any documentation-only commits before freeze. Model and full configuration unchanged.

- [ ] **Step 1: Independently review twelve genuinely new fixed controls.** Six bad/six valid, normal informal user prompts with no slash command/structured user packet or required explicit “do not invent” wording. Host qualityContract still supplies the same fidelity standards. Cover scope/time/condition/assistant carryover/latest confirmation-correction/current output preference, standalone courtesy, licensed arithmetic inference, fiction, general knowledge and advice. Q01-Q12 are not P01-P12 answers. Alternate arms by index with three bad and three valid cases in each order position, so arm-order assignment is balanced within expected class. Expected/rationale/IDs remain outside all model inputs.
- [ ] **Step 2: Reuse the already reviewed native harness as a frozen artifact snapshot.** Adapt only the explicit root path and unique native parent/profile identity; preserve every gate, proof, exact2check/consensus, first-attempt lock and unavailable rule. Bundle current experimental source with unchanged v3 baseline and the existing runtime compat alias. Use DSH's already observed canonical empty cordis.yml text before freezing, not an edited daily profile. Check imported projection across all12controls and run the inherited assess.spec.mjs/Node syntax checks. No package installation or credential persistence.
- [ ] **Step 3: Read-only pre-call review, then freeze and run once.** Bind control/protocol/harness/bundle/source SHA/config/gate in a fresh manifest before any call; require no prior run receipt/Sessions. Use the new isolated DSH_HOME and actual existing DeepSeek. Keep all24first-arm results and each of the48planned native Sessions, including failures. Do not change prompts or inputs based on partial outcomes.
- [ ] **Step 4: Audit all native records and independently review full outcomes.** Verify freeze hashes, exact captures, source/task/arm/focus identity and same full configuration. Compute the unchanged gate, separate unavailability from semantic error, and measure total/median arm latency. No claim of improvement when baseline has no false-met; a passed finite gate only permits integration work, not a reliability or natural-user claim.
- [ ] **Step 5: Record outcome and continue only within evidence.** Fail: preserve this cohort without rerun/refit, keep production017 untouched, diagnose any genuinely new defect before further action. Pass: write the concrete shared-v4 integration plan using the existing conditional-integration-notes.md boundaries, then TDD/review/full gates/fresh actual-model ordinary browser acceptance/exact-main CI/normal delivery under standing authority. No external Skill or public package/tag release.

### Task 5: Complete the experimental audit-status vocabulary contract

R2 finished all24firstarms with47actual native checks and gateFAIL. Q10's experimental requirements capture correctly recognizes the answer, but emits `inference/supported`, which the unchanged host validator rejects. Its second check therefore never starts. The independently inspected raw capture confirms a model-facing vocabulary omission, not a semantic reason to reject arithmetic or a schema-capability defect. The R2 receipt review must approve its honest failed closure before this task is dispatched. No R2 answer is repaired, normalized or rerun.

**Files:** Modify only `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts` and `tests/dsh-migration/conversation-claim-review.spec.ts`.

**Interfaces:** All public APIs, projection, validator, schema, native lifecycle, semantic source authority, consensus and current v3 unchanged. Only clarify the already enforced audit kind/status mapping, generically across all non-source kinds. No numerical control facts or Q10-specific wording in the prompt.

- [ ] **Step 1: RED emitted-contract regression.** Through the existing real native persistent harness with only the LLM adapter mocked, assert both emitted reviewer prompts explicitly contain the audit-field mapping below. The new assertions must fail on current source. Add a native capture case using `inference/supported` and assert `invalid-judgment` still occurs without normalizing/retrying it; this existing behavior may already pass before the prompt change. Cover `inference/permitted` with supplied source IDs and explanation as a valid retained audit, using hand-built test material rather than an R2 answer.

```text
In the audit, use supported only for source-fact. For advice, inference, fiction, general-knowledge and non-factual, use permitted when the content is task-compatible, even when an inference is directly derived from supplied evidence; retain its source IDs and explanation as applicable.
```

- [ ] **Step 2: Clarify only COMMON with that existing mapping.** Keep the existing statement that source-dependent facts need positive source authority and the met/category contract. Do not loosen validation, rename statuses, drop source IDs, introduce a third reviewer, normalize bad output or add schema condition machinery. This is the second evidenced interface clarification, not a license for repeated semantic prompt fitting. Any further structural defect must be assessed on its own evidence before additional work.
- [ ] **Step 3: GREEN, self-review and commit.** Load `D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1`; run the four existing focused files with `node D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs exec vitest run tests/dsh-migration/conversation-claim-review.spec.ts tests/dsh-migration/conversation-review-panel.spec.ts tests/dsh-migration/conversation-judgment.spec.ts tests/dsh-migration/conversation-task-material.spec.ts`, then runtime-bundle typecheck. Record RED/GREEN commands and output in assigned report. Commit only the two owned files; no real model calls, no build/replacement of any frozen pilot artifact.
- [ ] **Step 4: Independent scoped review.** Verify spec and quality, including that the receiving contract remains unchanged and bad captures remain unavailable. Passing tests do not release the revision. Only after this review may a separately new prospective cohort be designed/reviewed/frozen against the revision with the same v3 baseline and unchanged gate. Neither P nor Q answers become formal passing evidence; production integration remains conditional.

### Task 6: Separate prospective comparison of the completed vocabulary contract

Execute only after Task5's independent review passes. This task reuses the Task4 protocol, not its answers or results. The previous P and Q cohorts remain failed. All exact new control text must be designed and independently reviewed before any new model call.

**Files:** Root-owned new evidence directory `D:/DevData/tianwen-claim-evidence-pilot-r3-20260907`; eventual result doc `docs/operations/tianwen-claim-evidence-pilot-r3-20260907.md`. No prior cohort mutation or production change.

- [ ] **Step 1: Create twelve new R controls after Task5 review.** Retain six definite bad/six valid, informal inputs, the existing coverage boundaries including evidence-grounded inference, and balanced arm order within each expected class. Have a separate reviewer approve labels and scope before calls. Expected labels/rationale/IDs remain outside model inputs. Do not reuse P/Q answers or adjust labels to prior model outcomes.
- [ ] **Step 2: Snapshot the unchanged reviewed harness into the new isolated root.** Only root/parent/profile identity and bundle output path change; current experimental code is built once after review. Preserve all five pass predicates, two independent checks, raw captures, exact proof/member/config checks, exclusive first-run lock and unavailable outcomes. No new dependency, credential persistence, host retry or third reviewer. Run inherited harness/projection/syntax checks and independently review the adaptation.
- [ ] **Step 3: Freeze clean committed source, exact16protocol files, same full DeepSeek configuration and same gate before calls.** Run the public DSH CLI once against this isolated profile; preserve every first outcome and all actual native records. Planned48checks is not a claim all ran: first-check failure can stop a panel early and actual counts must be reported.
- [ ] **Step 4: Audit and independently review the complete outcome.** Distinguish semantic judgments from structural unavailability, actual native/model request counts, first-run proof integrity, complete-case correctness and latency. No incremental benefit claim if baseline has no false-met. No diagnostic pass is natural-user acceptance.
- [ ] **Step 5: Follow the frozen gate.** Pass permits the concrete shared-v4 integration plan, compatibility/recovery tests, full final-code gates, fresh ordinary actual-model browser acceptance, exact-main CI and normal authorized delivery. Failure retains current production and ends this cohort. A further vocabulary/representation failure after the two evidenced clarifications requires reconsidering the representation before another patch or cohort; do not keep stacking prompt repairs, lower the gate or regrade old results to get a pass.
