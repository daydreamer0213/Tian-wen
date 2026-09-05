# Bounded hypothesis exploration implementation plan

> **For agentic workers:** Use executing-plans for the coupled implementation; independent review may run read-only. Do not create extra user tasks.

**Goal:** An eligible outcome analysis can collect a targeted temporary-binding observation without modifying the active Skill or imposing an experiment on normal learning.

**Architecture:** Existing Evolution ledger owns immutable experiment intent and observations. DSH native children execute exact-parent research-summary Runs; the existing analysis receives observations and remains the sole route to a governed Candidate. No new queue, scheduler, approval, or model judge.

**Tech Stack:** TypeScript, existing DSH 0.1.1-rc.2, Cordis, Vitest; no new dependency.

## Global constraints

- Source design: `../specs/2026-09-05-tianwen-bounded-hypothesis-exploration-design.md`.
- Scope: outcome-origin `project:tianwen/capability:research-summary`; existing feedback analyses remain unchanged.
- One optional pair in the initial slice, zero experiments for sufficient evidence/no-case. This is not an ordinary Agent request/token quota.
- Same frozen parent, packet, model configuration, tool, native permissions and observation metric; treatment differs only by a frozen temporary instruction.
- No active pointer changes, evaluator calls, or ordinary recurrence signals from the experiment itself.
- Current source checkpoint remains uncommitted. No automatic release/install/push.

## A. Freeze a distinguishable experiment and classify observations

**Files:** create `packages/tianwen-evolution/src/learning-exploration.ts`, `tests/dsh-probe/learning-exploration.spec.ts`; export through `packages/tianwen-evolution/src/index.ts`.

This first deliverable is the pure contract used by the subsequent durable/native integration. It does not register a tool or execute work by itself. Its absence from production routing is explicit, not an exploration-complete claim.

**Interfaces:**

```ts
type CoverageVerdict = 'met' | 'not-met'
interface ExplorationPrediction { control: CoverageVerdict; treatment: CoverageVerdict }
interface LearningExplorationProposal {
  sourceRunId: TianwenRunId
  hypothesis: string
  alternative: string
  temporaryInstruction: string
  expectedIfHypothesis: ExplorationPrediction
  expectedIfAlternative: ExplorationPrediction
}
// Host supplies the source manifest/binding and actual environment digest.
prepareLearningExploration(proposal, { analysisId, sourceRunId, parentVersionId,
  sourceSubjectDigest, environmentDigest }): LearningExplorationRequest
classifyLearningExploration(request, { control, treatment }):
  'matches-hypothesis-prediction' | 'matches-alternative-prediction'
  | 'not-distinguished' | 'inconclusive'
```

- [x] Write one focused RED suite: stable immutable request; reject identical predictions and cross-source input; classify the two distinct predictions, a third observed pair, and incomplete execution; reject unsupported fields/empty or oversized proposal text.
- [x] Implement the small pure module with canonical SHA identities, exact input boundary checks, independent copies, and deterministic child identities. No model, filesystem, timers, or ledger mutation in this module.
- [x] Run `corepack pnpm exec vitest run tests/dsh-probe/learning-exploration.spec.ts`, then the Evolution type build. Independent review checks claim boundaries and absence of runtime side effects.

## B. Durable intent and native experimental Runs

**Files:** `learning-exploration.ts`, Evolution `ledger.ts`/`runtime-binding.ts`; new Runtime Bundle `learning-exploration.ts`; focused `tests/dsh-migration/learning-exploration.spec.ts`.

- [x] Persist intent on the existing analysis only while running and before final submission. Revalidate that the selected source is one of its frozen failures, consent remains active, and its manifest/packet is exact. Duplicate identical intent returns the same pair; replacement intent is rejected without model execution.
- [x] Register native continuable-child setup for the exact experiment identities and descriptor. Reuse the existing public Skill/tool APIs and exact-Skill atomic pre-Turn binding with a task-local acceptance contract. Do not call the Candidate-only private evaluation runner or create a placeholder Candidate.
- [x] Drive each arm through native start/followup; capture the product tool result, flush Session, record Skill-use and Outcome from exact Evidence. Pass the deterministic checker's verdict with its exact `acceptanceEvidenceId` as attestation to `consumeOutcome()`; its default successful-tool fallback must not classify a business `not-met` as `met`. Persist arm receipts before advancing. Host-produced facts, not model-provided verdict fields, determine the observation pair.
- [x] Test one native pair and replay: both model outputs go through the product tool; exact frozen parent is loaded; task-local failures add no ordinary Signals; repeated execution reuses the completed receipt; pointers/Candidates/evaluations remain unchanged.

```ts
expect(exploration.result.classification).toBe('not-distinguished')
expect(ledger.listSkillCandidates()).toHaveLength(0)
expect(ledger.listControlledSkillEvaluations()).toHaveLength(0)
expect(new EvolutionLedger(root).getLearningExploration(analysisId)).toEqual(exploration)
```

## C. Optional analyst tool, evidence return and main continuation

**Files:** Runtime Bundle `learning-analysis-child.ts`, `learning-analysis-tool.ts`, `learning-loop-orchestrator.ts`, `runtime.ts`; Evolution Case evidence projection; existing product E2E.

- [x] Add `request_tianwen_exploration` only to eligible outcome analyst children. A request ends that investigation turn but is not its final analysis submission. Keep the existing final submission schema and sufficient-evidence path unchanged.
- [x] Existing analysis lane runs pending experimental work, then follows up the same analyst with bounded observations and exact evidence IDs. Record experimental evidence separately from original support/counterexamples so it cannot replace source recurrence or masquerade as an ordinary successful counterexample.
- [x] Reuse cold-start suspension/main `继续`/native resume. On restart inspect original children and receipts; do not run completed arms again or start from merely opening the main Session. Main progress uses the existing native report mechanism.
- [x] Native scripted E2E: zero experiments on direct conclusions; one pair with indistinguishable observations ends insufficient and zero Candidate; useful observations may proceed only through the original Candidate gate; interrupted work reuses the exact native child and durable intent.
- [x] Run the focused Evolution/native suites, affected experience/feedback regressions, typecheck and diff validation. Record source and actual evidence boundaries. Do not manufacture a new real-model failure to make exploration fire.

Completion requires A/B/C. A alone supplies a checked contract, not automatic exploration.

## 2026-09-05 A checkpoint

The RED run failed because the new module was absent; after implementation all eight focused checks passed (404 ms). The Evolution build and then root `corepack pnpm run typecheck` both exited 0. `git diff --check` passed. Independent read-only review found no actionable contract defect: identity is fixed per analysis, changed proposal contents change the request digest, copies are frozen, and classifications make no causal or Candidate-acceptance claim.

At this A-only checkpoint the module was exported without a production caller, persistence write, tool registration, native child execution, or active-pointer effect. B/C were then the next implementation entry. No additional real-model experiment was run; the separate Stage 1 ordinary trial remained three successful, non-triggering summaries.

## 2026-09-05 B/C local checkpoint

B and C are implemented in the same uncommitted source checkpoint. Evolution now freezes one source-bound intent, exact native arm identities and durable receipts. Runtime Bundle executes task-local control/treatment Runs with the existing Skill registry, product tool, Session, Evidence, Outcome and native continuable-child APIs. The original analysis receives one bounded observation follow-up; completed arms and already-delivered observations are reused after replay. Experimental Evidence has a separate projection and is not admitted to the original supporting/counterevidence closure.

The installed scripted product story proves both paths: direct `skill-change`/`no-case` conclusions create zero experiments, while one requested indistinguishable pair returns to the same analyst and ends `insufficient-evidence` with zero Candidate and zero evaluator call. A focused persistence test proves a nonterminal exact child is continued instead of replaced. Existing cold-start coverage proves opening the main Session alone does not run the model and main `继续` resumes the bound work.

The final affected gate passed 16 files and 229 tests in 37.54 seconds. Root typecheck and `git diff --check` passed. No real-model task, Candidate-only evaluator run, active-pointer change, install, release, commit or push was performed for B/C. These results prove the mechanism and isolation boundaries, not statistical causality or natural learning effectiveness.

## Later route acceptance

The independent review found and closed accepted-arm cancellation, aborted-arm
recovery, same-process liveness restarting stopped work, reasoning-effort
application and later-followup packet ambiguity. Native tests now stop and cold
restart an unfinished arm, inspect actual effort, reuse the completed arm, and
prove opening the parent does not execute work. The product story also covers
distinguishable observations → original analyst → governed Candidate/promotion.
Final route acceptance passed 20 files / 364 tests and a real disposable local
installation; exact artifacts and unmerged-source boundaries are recorded in
`docs/operations/tianwen-learning-route-20260905-handoff.md`.
