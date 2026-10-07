# Conclusive-pair DEV trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a new explicitly opted-in isolated DEV study to activate a method with five conclusive passing candidates and at least one conclusive paired improvement, without vetoing it merely because another baseline is unknown.

**Architecture:** Add prospective `dev-conclusive-pair.v1` to the existing closed policy union. Derive its decision from the original ten authenticated arms; keep unknown baseline results unchanged and retain all native execution, independent checks, consent, replay, activation and rollback guards. The existing default and `dev-paired-any-case.v1` branches retain their exact meaning.

**Tech Stack:** TypeScript, original DSH SDK/CLI, EvolutionLedger, Vitest, existing package builds; no dependencies or toolchains added.

## Global Constraints

- User authorizes active controlled simulation and continuous implementation without waiting for natural problems or another permission question.
- main/Daily remains NO-GO under the original R9/formal release conditions; this is DEV-only trial eligibility, not a release decision.
- Never regrade or replay the already consumed studies `2cab6ab0…` and `b950b45f…`; preserve their original candidate-failed/inconclusive outcomes.
- Unknown baselines stay unknown; candidate failure or candidate uncertainty cannot qualify. A paired improvement requires the same case baseline `not-met` and candidate `met`.
- Configured program checks remain additional strict evidence: unverifiable/missing candidate or baseline evidence does not become verified.
- Normal Runtime rejects either DEV policy before mounting; quarantined ledger mutations reject either policy except existing validated safety stop/rollback and exact historical duplicate replay.
- Fresh real studies use new source combinations, frozen inputs and unique native IDs. Controlled historical answers are labeled simulated; research and future answers use the real provider.
- Keep generated assets under D:/DevData; no dependency/old-ledger full copies. Maintain D free >=15GiB, preferably >=20GiB, clean owned regenerable fixture residuals.

## Task 1: Prospective policy and all admission boundaries

**Files:**
- Modify: `packages/tianwen-evolution/src/conversation-guidance.ts` — policy union/parser/derived decision.
- Modify: `packages/tianwen-evolution/src/guidance-result-check.ts` — DEV any-pair configured check branch.
- Modify: `packages/tianwen-evolution/src/ledger.ts` — both DEV versions quarantined.
- Modify: `packages/tianwen-runtime-bundle/src/development-runtime-boundary.ts` — explicit isolated configuration union/validation.
- Modify: `scripts/development-native-runtime.mjs` — explicit JSON policy validation.
- Test: `tests/dsh-migration/conversation-guidance-ledger.spec.ts`, `conversation-guidance-result-check.spec.ts`, `development-runtime.spec.ts`, `development-native-runtime.spec.ts`, `conversation-guidance-loop.spec.ts`.
- Existing `packages/tianwen-runtime-bundle/src/runtime.ts` generic option guard remains authoritative; no normal apply override.

**Interfaces:** `GuidanceStudyBody.decisionPolicy` and `TianwenDevelopmentRuntimeConfig.guidanceDecisionPolicy` accept only the two exact DEV literals when present. `ConversationGuidanceState.decision(studyId)` returns the existing `GuidanceDecisionRecord`; no new event kind or schema. Loop receives the explicitly saved version through existing runtime options and opening records.

- [ ] Write RED cases using existing opening/state/ledger helpers. With baseline verdicts `[not-met, met, not-met, inconclusive, inconclusive]` and candidates all `met`, new policy must derive `accepted`; absent policy and old DEV policy remain `inconclusive`. Vary every candidate position to `not-met`/`inconclusive` and assert no acceptance. No conclusive failed baseline yields no acceptance; all-met baselines yield rejected, some unknown yield inconclusive. Nine arms still throw.
- [ ] Save RED JSON before implementation under `D:/DevData/tianwen-conclusive-pair-engineering-20261006`; run the new scoped cases with original source Vitest config. Preserve actual failure output.
- [ ] Implement the new branch before the existing global unknown branch, without editing the latter:

```ts
const candidates = arms.filter(arm => arm.role === 'candidate')
const baselines = arms.filter(arm => arm.role === 'baseline')
// Used only when study.opened.decisionPolicy === 'dev-conclusive-pair.v1'.
const verdict = candidates.some(arm => arm.verdict === 'inconclusive') ? 'inconclusive'
  : candidates.some(arm => arm.verdict !== 'met') ? 'rejected'
  : baselines.some(arm => arm.verdict === 'not-met') ? 'accepted'
  : baselines.some(arm => arm.verdict === 'inconclusive') ? 'inconclusive'
  : 'rejected'
```

- [ ] Extend explicit DEV policy allow-lists and the ledger quarantine to the new literal. For configured program checks use the same existing DEV qualified-any-pair branch for either version; do not relax verified/rejected-condition bindings.
- [ ] Add disk cold replay controls for both versions, exact decision/version preservation and new mutations blocked in main quarantine; old safety rollback/stop still works. Add normal Runtime both-policy rejection before mount and explicit DEV loader both-policy acceptance/unknown rejection. New-policy native loop fixture must actually open, derive, activate and restore with baseline uncertainty; do not host-write an accepted decision.
- [ ] Run relevant full source suites, type/build checks and published suite checks with original environment flags. Persist exact outputs and clean owned test directories. Obtain scoped spec/code review and fix evidenced issues. Commit reviewed code and engineering evidence document.

## Task 2: New real prospective study and effect chain

**Files:**
- Create generated operator/input/audit scripts under `D:/DevData/tianwen-conclusive-pair-learning-20261006`; frozen prior round scripts remain untouched.
- Update: `docs/operations/tianwen-current-project-handoff.md`, `docs/operations/tianwen-learning-eligibility-checkpoint-20260926.md`.
- Create: `docs/operations/tianwen-conclusive-pair-dev-result-20261006.md`.

**Interfaces:** original `applyDevelopment`, original real provider, original ordinary admission/feedback/research loop, native activation and safety withdrawal. Root owns this task and all docs; task 1 worker must not launch provider or modify real profiles/operator.

- [ ] Author a fresh isolated DEV profile with explicit new policy and a genuinely different controlled text task failure (such as confusing original booking with later cancelled scope). Freeze sources, normal counterexample, two future task requirements and nonce before running. Reuse shared SDK/runtime; no all-round snapshots or old pair replays.
- [ ] Freeze code HEAD, input hashes, real provider configuration and exact old protected record IDs/digests. Read-only preflight must be CLI0, zero model calls and no ledger mutation.
- [ ] Run actual ordinary baselines, labeled simulated historical failures, real independent admission/review and original research. Operator accepts the set of all permitted newly produced studies; remove the erroneous single-study quantity assumption. Candidate-failed/inconclusive studies remain original outcomes.
- [ ] Only an actual native accepted/activated study proceeds to real future tasks. Verify exact method injection and paired before/after results, a new unused task and semantic safety without turning unknown into success. Retain original simulated-versus-real distinctions.
- [ ] Withdraw through original consent/safety path, prove zero active methods and subsequent no-injection; cold restore original records with zero provider calls. Independently audit terminal normal/emergency state, old record preservation, first errors, model calls, disk free and cleanup.
- [ ] If actual candidate fails, diagnose the observed output and implement the narrow fix or design the next fresh task; do not mechanically mark the goal blocked or ask the user to invent inputs. Update authoritative handoff with actual results and exact remaining work. Mark the full goal complete only once its actual effect and safety chain is achieved.
