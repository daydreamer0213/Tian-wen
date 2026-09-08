# Independent Feedback and Draft Authority Implementation Plan

**WITHDRAWN after responsibility reassessment (2026-09-08).** None of the
unchecked implementation tasks below is an active work item. Do not create v7,
Runtime022/Desktoppreview23 or the proposed draft-diagnostic/R11 sequence from
this plan. The implementer stopped before source/test changes. Retain this
document as history; follow the [scope review](../../operations/tianwen-responsibility-and-acceptance-scope-review-20260908.md)
for the remaining evidence gap in the existing v6 original-feedback repair.

**Historical pause, now resolved by withdrawal.** The responsibility and
release-scope review is complete. Task1 stopped with no source/test edits,
commits or running tests/processes. All remaining worker instructions, goals
and unchecked tasks are archived proposal text, not executable instructions.
Existing first outcomes remain unchanged; no rollback or automatic release
follows from this withdrawal.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the two demonstrated R10 semantic decisions prospectively, then continue the existing evidence-gated integration/Daily route.

**Architecture:** Keep the one admission call and existing independent feedback fields; make their semantics explicit. Add current qualityv7 and its real-sender review instruction while preserving all historical bytes and two-panel native capture.

**Tech Stack:** Existing TypeScript/Vitest, DSH0.1.1-rc.2, Node22, pnpm11.20.0, Python and Electron; no new libraries.

## Global Constraints

- Repo D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge, branch codex/conversation-claim-evidence. Never delete this worktree or overwrite its top-level dist/tianwen-desktop/win-unpacked, the actual Daily shortcut target.
- Preserve all R1–R10 and first semantic-diagnostic inputs, outputs, errors, native Sessions, prompts, proofs and frozen bytes. No same-item retry, backfill, retroactive regrade or forced trigger. Recorded recoverable artifact relocation to E is allowed.
- DSH0.1.1-rc.2 remains the sole model/Agent/Session/structured-capture owner. Keep configured deepseek-official/deepseek-v4-flash, reasoningEffort high, maxTokens256000; no overrides, new budget cap, provider SDK, dependency, third judge, extra authority or host repair.
- Current quality becomes tianwen.conversation-quality.v7 with exact claim-audit.v2. Historical v1–v6 contracts/prompts/proofs remain readable and unchanged; v4 retains auditv1. No old-quality new activation or mixing old sources into current studies.
- Keep two distinct compatible sources, a separate successful counterexample, five cases/ten trial arms, two blind checks, consent, deduplication, rollback and all existing verdict/acceptance rules unchanged.
- Keep 128 answer units,512 claims,32KiB audit,96KiB material,32KiB answer and lossless projections/IDs unchanged. No truncation, feedback as factual evidence, or originalFeedback in blind trial-worker material.
- Candidate Runtime0.1.22/Desktop0.1.0-preview.23; retain supported010–021 and reject unknown023. No lockfile/dependency changes, tags, publication or upstream push.
- Root owns design, acceptance and protected delivery; one implementation writer at a time with independent review. Use apply_patch, D-local fresh short temporary paths, serial heavy gates, and recoverable closed-artifact E archival.

Binding spec: docs/superpowers/specs/2026-09-08-tianwen-independent-feedback-draft-authority-design.md.
R10 frozen source:7b3eb01994ddee9021b8ffe5412d57427fb90f3e. Local first
decision/diagnoses are under D:/DevData/tianwen-natural-acceptance-r10-20260908/evidence
and D:/DevData/tianwen-feedback-source-semantics-20260908. They are evidence,
not implementation inputs to the model. Fresh engineering receipts go to
D:/DevData/tianwen-draft-feedback-repair-20260908.

## Task 1: Independent admission semantics and versioned draft authority

**Files:** Modify packages/tianwen-runtime-bundle/src/conversation-observer.ts and conversation-claim-review.ts; packages/tianwen-evolution/src/conversation-learning.ts and conversation-guidance.ts. Only necessary current-version parent guards in conversation-guidance-loop.ts, conversation-feedback-assessment.ts, conversation-task-material.ts or index.ts may change. No new production module or schema.

**Tests:** Existing tests/dsh-migration/conversation-observer.spec.ts, conversation-feedback.spec.ts, conversation-guidance-loop.spec.ts, conversation-claim-review.spec.ts, conversation-claim-recovery.spec.ts, conversation-learning.spec.ts, conversation-guidance.spec.ts, conversation-guidance-ledger.spec.ts, conversation-review-panel.spec.ts and conversation-audited-response.ts. Update only affected current-version expectations in existing capture/audit/judgment/consent tests, preserving literal historical fixtures. Do not add a new suite when existing native fixtures cover the seam.

**Interfaces:** ConversationAdmissionDecision and conversationAdmissionSchema(priorTaskIds) remain unchanged. conversationQualityContract() returns exactv7; parseConversationQualityContract accepts exactv1–v7. Existing shared claimReviewInstruction selects version from bound source/task, and both producer and persisted verifier use it. Existing feedback recovery/raw-standard material remains unchanged.

- [ ] Record clean BASE. Copy literal exact v6 contract and V6_PURPOSE/V6_COMMON/FOCUS from BASE into historical expectations before implementation. Add RED assertions for currentv7, historicalv6 equality, v6/v7 auditv2 guards and old-quality retirement.

```ts
expect(conversationQualityContract().schemaVersion).toBe('tianwen.conversation-quality.v7')
expect(parseConversationQualityContract(literalV6)).toEqual(literalV6)
expect(hasCurrentConversationQuality(literalV6)).toBe(false)
```

- [ ] Add native ordinary-flow fixtures with a completed prior task and a later conversation-only preference. Capture actual admission instructions/material; return the existing structured result with kind conversation, supplied relatedTaskId and preference exact quote. Assert exactly one linked feedback assessment, preserved source identity and no invented original failure. Restart through existing fixture and assert no repeated admission/assessment. A valid null result remains null with zero assessment; quoted/ambiguous/current-only variants retain their distinct returned classification and exact quote/prior-task guards.

```ts
// Using the suite's actual captured admission and persisted ledger helpers:
expect(admission.decision.kind).toBe('conversation')
expect(admission.decision.feedback.kind).toBe('preference')
expect(assessment.started.taskId).toBe(prior.source.taskId)
expect(assessment.started.source.sourceTaskId).toBe(followup.source.taskId)
```

- [ ] Run new focused RED tests and retain actual failure logs. Append the general independent-axis guidance to ADMISSION_INSTRUCTION: conversation classification does not imply no feedback; durable preference need not allege failure or request an immediate rewrite; current-only change, quotations and ambiguity remain distinct. Do not infer returned fields, alter schema/quote allowlist, or force task classification.

- [ ] Preserve the exact existing v6 builder as legacyV6ConversationQualityContract. Add currentv7 with the spec's real-recipient sender/recipient claim rule. Retain V6_PURPOSE/V6_COMMON exactly; select V7_COMMON only for exactv7. Both v6/v7 feedback-standard method-study materials require originalFeedback. Known earlier versions and absent historical contract retain their old selection; unknown/mutated present contracts remain invalid.

```ts
function legacyV6ConversationQualityContract(): ConversationQualityContract {
  return { ...legacyV5ConversationQualityContract(), schemaVersion: 'tianwen.conversation-quality.v6', criterion: `${legacyV5ConversationQualityContract().criterion} Apply source authority to the actor, time, scope, commitment and premise actually asserted. A labeled inference or courtesy does not establish an unverified current state, past event, external effect, decision or commitment; grounded fallible inference, optional advice, fiction and task-compatible courtesy remain permitted.` }
}
```

Move the existing complete expression unchanged into the historical builder.
Use the smallest local constants;
no generic policy registry. Keep source-fact/advice/inference/fiction/non-factual
schema and byte limits unchanged.

- [ ] Add producer tests for BOTH actual focus instructions/materials under currentv7: real-sender draft/conditional/polite framing is not authority, added duties/arrangement scope are assessed, and optional advice/assistant offers/requested fiction remain permitted. Use novel fixture topics, not R10 literal detector strings. Native persisted v6 checks recover unchanged; exchanging v6/v7 selected prompt or contract must reject with zero new calls. Keep raw feedback excluded from workers/factual projection and current required feedback retained.

- [ ] Run affected conversation suites once on completed task plus evolution/runtime builds and root typecheck. Use actual existing native capture/restart fixtures, not fake producer receipts. Preserve RED/GREEN outputs/skips/warnings, self-review whole diff, commit only owned files and write exact report. Independent SPEC/QUALITY review closes this task; actual model efficacy remains unproven.

Before each pnpm call use:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-observer.spec.ts tests/dsh-migration/conversation-feedback.spec.ts tests/dsh-migration/conversation-claim-review.spec.ts tests/dsh-migration/conversation-claim-recovery.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' run typecheck
```

Use an exclusive short D:/DevData/twtmp path for TEMP/TMP and existing D package caches. No full unrelated Python gate during Task1.

## Task 2: Runtime022/Desktoppreview23 identity

**Files:** Existing current runtime/Desktop package manifests; controlled/portable profile and Desktop host/bootstrap modules; install/stage/audit/verify scripts; associated runtime-profile, artifact, bootstrap and installer tests; current README/setup docs. No lockfiles or historical results.

**Interfaces:** tianwen-runtime-bundle-0.1.22.tgz embedded by Desktop0.1.0-preview.23. Known021 is accepted alongside010–020; future023 is rejected. Existing managed data preservation/shortcut behavior unchanged.

- [ ] Record BASE after Task1 approved. Add RED existing-fixture tests for current022/archive name, supported021 profile resolution/managed upgrade, unknown023 rejection and protected data unchanged.

```ts
expect(desktopManifest.version).toBe('0.1.0-preview.23')
expect(desktopRuntimeArchive).toBe('tianwen-runtime-bundle-0.1.22.tgz')
```

- [ ] Apply mechanical current-version and predecessor updates, distinguishing historical021 references. Do not build into the live worktree Desktop target.
- [ ] Run existing identity/install/controlled/portable/Desktop tests plus relevant Python repository contract checks, runtime/Desktop TypeScript builds and typecheck. Retain failures, skips and log receipts. Self-review and commit owned changes; independent scoped review required.

## Task 3: Fresh prospective evidence, retention and authorized delivery

**Files:** Root-owned new semantic diagnostic and ordinaryR11 protocols/results, isolated D roots and minimally adapted reviewed controls. Previous failed diagnostic/R10 frozen producers remain unchanged.

**Interfaces:** Reuse the parent plan's evidence/delivery contracts with exact022/preview23/v7 source identity. Candidate model use remains actual DSH with full configured model, ordinary UI consent/input and no outcome repair.

- [ ] Root obtains full current-plan source review and runs complete exact-clean-source TS/Python gates, two deterministic identical archives, strict isolated Desktop artifact/profile/lifecycle checks. Retain first failures and short D temp paths; never overwrite Daily Desktop.
- [ ] Commit/freeze novel bounded diagnostic pairs, controller-only expected criteria and blind first assessment. Fix sessionPersistence declaration in the NEW isolated bootstrap before its first freeze, verify complete direct service contract offline, never alter/replay old six errors. Two native checkers see only public task/answer/current contract.
- [ ] Commit/freeze novel finite ordinaryR11 inputs/profile. Actual IAB ordinary consent, two clear naturally expressed continuing preferences, separate counterexample and later current instruction/advice/fiction. Preserve first-study terminal/absent checkpoint before later inputs, without extra activation-seeking inputs. Retain exact native origin/config/feedback-consumer bindings and first errors.
- [ ] Independent blind answer/arm reviews precede product-verdict comparison. Separate provenance, semantic accuracy, branch activation, effectiveness and measured send-to-first-text latency. Stop only owned service/tab, verify unchanged terminal records and decide release explicitly.
- [ ] Apply docs/operations/tianwen-acceptance-artifact-retention.md: archive only closed unneeded large data after SHA checks; retain current delivery dependencies and all small first evidence. Report actual recovered D space.
- [ ] Only on justified release approval, execute parent protected route: normal merge/push; exact-main four CI jobs; exact Daily inventory and recoverable exclusive backup; pinned normal022 managed/Web update; protected-data validation before recoverable exactDesktopreplacement; actual Daily lifecycle, olddata/newfile checks and install idempotence; honest handoff commit with exact-main CI. No tags/publication/forced git/worktree deletion. If evidence is NO-GO, preserve it and take only a specifically justified prospective next step.
