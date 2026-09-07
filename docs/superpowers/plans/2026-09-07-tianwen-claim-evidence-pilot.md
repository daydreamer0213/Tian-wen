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
- All generated pilot artifacts go under `D:/DevData/tianwen-claim-evidence-pilot-20260907`. The pilot is evaluator diagnostics, not natural acceptance or study support.

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

- [ ] **Step 2: Run focused test and retain expected missing-export failure.** In PowerShell load `D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1`; run `node pnpm.mjs exec vitest run tests/dsh-migration/conversation-claim-review.spec.ts` from the repository. Use the existing native persistent harness pattern for the later integration tests; no new fake native lifecycle.
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
- Create: `docs/validation/2026-09-07-claim-evidence-pilot.md` after execution.
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
