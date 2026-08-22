# Tianwen v0.1 Controlled Five-Task Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one bounded v0.1 evaluation path that freezes five Candidate-specific tasks before Candidate materialization, executes one B and one C Session per task through the normal DSH runtime, combines reproducible objective verification with independent X/Y blind scoring, and permanently separates development-only synthetic evidence from product evidence.

**Architecture:** Preserve the existing Stage 4 `v1` four-case scripted protocol, plan, result, and ledger replay byte-for-byte. Add explicit `v2` controlled-evaluation records beside it, reuse the existing Candidate/Run/Skill/Evidence identities and DSH request-symmetry checks, and extend the current evaluation service instead of creating another Runtime or generic experiment framework. Tasks 1-7 build and prove the mechanism without external operations. After exact-main CI, the 2026-08-23 project-owner standing authorization continues into real-provider evaluation, isolated Shadow, evidence-gated Promotion, and Rollback; scripted evidence is a preflight gate, never the project endpoint.

**Tech Stack:** TypeScript 6, Node 22, pnpm 11, Vitest 4, DSH `0.1.0-rc.7`, existing append-only Evolution ledger and Evidence projector.

## Global Constraints

1. Canonical design: `docs/superpowers/specs/2026-08-22-tianwen-v0.1-closeout-and-controlled-evaluation-design.md`.
2. DSH `0.1.0-rc.7` remains the only product Agent Runtime. Reuse its public Agent loop, per-Agent Skill registry, tool restriction/guard, Session, cancellation, LLM route facts, and tool execution pipeline.
3. Do not change the semantics, schema validation, IDs, event names, replay, or conclusions of historic `tianwen.skill-eval-*.v1` records. Existing Stage 4 scripted results remain `INCONCLUSIVE` and readable.
4. Do not create a second ledger, experiment database, evaluator framework, scheduler, queue, daemon, UI, telemetry platform, pricing poller, budget estimator, Candidate portfolio, Skill graph, or global Champion.
5. Do not add Python Alpha, Dynamic, Artifact, legacy Champion, or a second Runtime path.
6. A formal controlled protocol contains exactly five task types in this order: `original-problem`, `adjacent-transfer`, `regression`, `counterexample`, `safety-authorization`. Each B/C arm gets exactly one formal Session; there is no attempt reducer and no selectable retry result.
7. Exactly five tasks and one formal attempt are fairness rules, not a model budget. Do not add or enforce Tianwen-side model-request, token, CNY, price-query, token-price conversion, or general budget limits; the API platform's existing DeepSeek quota is the only cost ceiling. Frozen tool authorization and safety stop facts remain in scope.
8. Real-provider preflight requires the exact frozen Provider/model/call-config facts, a registered DSH route with `normal + maxRetries=0`, ten empty execution Sessions, five empty evaluator Sessions, and the recorded operation authorization. Tasks 1-7 must not call that route; the post-CI operational continuation must use it.
9. Use DSH per-Agent `tools.restrict()` and monotonic `tools.guard()` to enforce the frozen allowed-tool set before dispatch. Do not build a parallel permission engine.
10. Evolution ledger records only finite labels, identities, digests, scores, counters, and bounded reason codes. Raw prompts, model output, evaluator reasoning, Skill bodies, tool arguments/results, cwd, paths, secrets, and credentials stay in their private Session/workspace owners.
11. An objective verifier remains the task-owned tool named by the frozen `RunAcceptanceContract`. Its exact expected subject is bound through the existing Run-binding `acceptanceSubjectDigest`; a caller-authored success flag is never accepted.
12. The evaluator sees only X/Y, the fixed rubric, final assistant text allowed by the task package, and a closed non-sensitive projection of verifier facts. It never receives B/C labels, Candidate/parent IDs, Skill digests/content, or execution Session IDs.
13. A development-only path must use a dedicated ledger root, workspace root, Skill name, Goal prefix, Session prefix, and reserved scripted Provider. Records carry immutable `development-only` and `synthetic-defect` labels. They can prove mechanics only and can never satisfy product-evidence, Shadow, or Promotion gates.
14. Use an intentionally defective B Skill and corrected C as the controlled Candidate after exact-main CI. Its five tasks must still represent real product capabilities, be frozen before Candidate materialization, and run through real DSH/DeepSeek/tools. Permanent labels prevent natural-user or market claims, while a separate `mechanism=pass` decision may authorize isolated test Shadow/Promotion/Rollback without affecting the ordinary incumbent.
15. A real activity stops on task/rubric/config mutation, identity mismatch, evaluator leak, a second formal attempt, verifier unavailability, unauthorized tool/effect, privacy failure, Candidate hard-gate failure, or a fixed limit. Infrastructure failure becomes `inconclusive`; Candidate behavior failure becomes `rejected`. Never patch and continue the same activity.
16. Internal v2 events stay private. `PUBLIC_LEDGER_EVENT_TYPES` and the installed read-only status privacy boundary must not expand.
17. Reuse `D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge`, its `node_modules`, and configured stores. Put generated fixtures under `D:\DevData\tianwen-v0.1-eval-fixtures`; never touch or clean `D:\Guo\zuochong\AGi`.
18. Do not run an installer, create/resume a real Goal, select/configure a real model, call a Provider, Promotion, Shadow, Rollback, or real product data while executing Tasks 1-6.

---

## Expected File Map

Product domain and ledger:

- Create `packages/tianwen-evolution/src/controlled-skill-evaluation.ts`.
- Modify `packages/tianwen-evolution/src/ledger.ts`.
- Modify `packages/tianwen-evolution/src/index.ts`.
- Modify `packages/tianwen-evolution/src/runtime-binding.ts`.

Runtime integration:

- Modify `packages/tianwen-dsh-compat/src/index.ts` only for public DSH types/values not already exported.
- Modify `packages/tianwen-runtime/src/skill-evaluation.ts` to reuse its request-normalization and Agent orchestration seams.
- Modify `packages/tianwen-runtime/src/index.ts`.

Proof and handoff:

- Create `tests/dsh-probe/controlled-skill-evaluation.spec.ts`.
- Create `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts`.
- Create `tests/dsh-probe/controlled-skill-evaluation-demo.spec.ts`.
- Modify `tests/dsh-probe/skill-evaluation.spec.ts` only for explicit v1 replay regression if needed.
- Modify `tests/dsh-probe/skill-evaluation-runtime.spec.ts` only for shared-helper regression if needed.
- Create `scripts/run-controlled-skill-evaluation-demo.ts`.
- Modify `package.json`.
- Modify `tests/contracts/test_public_repository_surface.py`.
- Modify `README.md` and `README.zh-CN.md` only to label the new proof accurately.
- Modify `docs/tianwen-architecture-overview-v2.md` only for the new controlled-evaluation status/link.
- Create `docs/operations/tianwen-v0.1-controlled-five-task-evaluation-handoff.md`.

No other product file is expected. Stop and explain before adding dependencies or expanding beyond this map.

---

## Baseline and Stop Gate

- [ ] Confirm the branch contains the approved design and this plan, the worktree is clean, `node_modules/.modules.yaml` exists, and `origin/main` is still the reviewed base.
- [ ] Record `git rev-parse HEAD`, `git status --short --branch`, and the exact base SHA.
- [ ] Run the established clean build order:

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-v0.1-eval-fixtures'
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/skill-evaluation.spec.ts tests/dsh-probe/skill-evaluation-runtime.spec.ts
git diff --check
```

- [ ] Stop before product edits if failure is caused by the repository, missing dependencies, a dirty overlapping file, or an unexpected v1 regression. Preserve the first failure; do not retry merely to obtain green output.

---

## Task 1: Freeze the v2 Five-Task Contract Without Rewriting v1

**Files:**

- Create `packages/tianwen-evolution/src/controlled-skill-evaluation.ts`.
- Modify `packages/tianwen-evolution/src/index.ts`.
- Create `tests/dsh-probe/controlled-skill-evaluation.spec.ts`.

- [ ] Write RED tests for a fixed `CONTROLLED_SKILL_EVAL_RUBRIC` with four dimensions (`relevance`, `correctness-reasoning`, `clarity-usability`, `scope-restraint`), integer scores 0-4, fixed anchors, and the six approved Candidate pass rules.
- [ ] Write RED tests for exactly five ordered tasks and one formal attempt. Reject missing/extra/duplicate categories, duplicate IDs, caller-authored rubric changes, a second attempt, unbounded counters, arbitrary evidence labels, unsafe identifiers, raw paths, raw credentials, or raw prompt/result fields in the durable record.
- [ ] Define each frozen task package with only the necessary durable facts: task ID/type, goal/input/workspace/tool/authorization/verifier/stop/evaluator-material digests, `RunAcceptanceContract`, expected `acceptanceSubjectDigest`, and allowed tool identifiers. Do not add a Tianwen model-request/token/price budget. If a tool/time safety stop is needed, bind it as an authorization or stop-contract fact rather than a pricing subsystem.
- [ ] Define execution facts as exact Provider ID, model ID, complete `callConfigDigest`, visible `toolSchemaDigest`, DSH version `0.1.0-rc.7`, and `retryPolicyDigest`. Do not add pricing fields.
- [ ] Define a closed evidence-purpose union: `controlled-product` or `development-only-synthetic-defect`. The latter normalizes to permanent labels `development-only` and `synthetic-defect`; callers cannot remove or rename them.
- [ ] Derive protocol scope from the Ticket's Outcome signals and derive provenance from ledger order, matching v1's trusted rule. The first v2 protocol before Case/Candidate can be `pre-candidate`; any later v2 protocol is `retrospective`.
- [ ] Use a v2-specific record/event schema and deterministic ID while retaining the existing `eval-protocol:` identity family. Do not loosen the v1 parser.
- [ ] Run the focused RED, implement the smallest pure normalization/hash layer with existing `canonicalJson` and `sha256`, then run GREEN and typecheck.
- [ ] Commit:

```text
feat: freeze controlled Skill evaluation protocols
```

---

## Task 2: Persist the v2 Protocol, Plan, Blind Map, Scores, and Final Decision

**Files:**

- Modify `packages/tianwen-evolution/src/controlled-skill-evaluation.ts`.
- Modify `packages/tianwen-evolution/src/ledger.ts`.
- Modify `packages/tianwen-evolution/src/index.ts`.
- Modify `packages/tianwen-evolution/src/runtime-binding.ts`.
- Modify `tests/dsh-probe/controlled-skill-evaluation.spec.ts`.
- Modify `tests/dsh-probe/skill-evaluation.spec.ts` only for v1 replay/privacy regression if necessary.

- [ ] Add private append-only v2 events for: protocol frozen, evaluation opened, objective observations recorded, blind map frozen, evaluator score recorded, and aggregate result recorded. Use the existing JSONL, `#accept`, fsync, commit-unknown, replay, defensive clone, and `formalWrite()` paths.
- [ ] Keep v1 and v2 in separate typed maps/getters or a version-discriminated map without changing the public v1 method contracts. Existing v1 ledger fixtures must replay unchanged.
- [ ] Require the v2 plan to resolve one recorded Candidate, its Case/Attribution/Lesson/Ticket chain, the exact parent manifest, and the unique `pre-candidate` v2 protocol for that Ticket. Reject retrospective protocols for product evidence.
- [ ] Materialize exactly ten arm rows: five tasks × B/C, each with a distinct empty Session and deterministic Run binding using `acceptanceSubjectDigest`. No `attempt` field is accepted.
- [ ] Record objective arm observations only after ledger-owned RunBinding, Run Skill manifest/use, Outcome, Evidence ID, acceptance subject, normalized first-request, tool-use, and frozen-limit facts agree.
- [ ] Freeze one X/Y mapping per task after objective observations and before evaluator dispatch. The mapping event is private; the evaluator envelope contains X/Y only and is bound by digest.
- [ ] Record exactly one immutable score receipt per task/evaluator Session. Scores are the eight integers (X/Y × four dimensions), `insufficientMaterial`, closed reason codes, blind-envelope digest, evaluator request/session digests, and the score-tool Evidence ID. Do not store evaluator prose.
- [ ] Implement the pure aggregate reducer exactly as approved: all C objective hard gates; objective improvement on T1 or T2; no objective regression; C subjective total not below B; no dimension lower by two or more; no insufficient-material result.
- [ ] Derive a mechanical decision of only `pass`, `rejected`, or `inconclusive`, separately from evidence scope. Development-only evidence always records `natural-user-evidence=not-claimed`; a mechanical `pass` may enter isolated test Shadow/Promotion but cannot affect the ordinary incumbent or support natural-user/market claims.
- [ ] Add explicit stop reason codes for identity/config mismatch, protocol mutation, second attempt, verifier unavailable, unauthorized tool/effect, privacy leak, limit exhaustion, Candidate hard-gate failure, evaluator leak, and incomplete score material.
- [ ] Prove all new events remain absent from public event exports and installed status projections.
- [ ] Prove restart replay, duplicate idempotence, conflict rejection, forged label rejection, forged blind map/score/result rejection, and byte-for-byte v1 replay.
- [ ] Commit:

```text
feat: record controlled Skill evaluation evidence
```

---

## Task 3: Enforce Formal B/C Preconditions Through Public DSH Seams

**Files:**

- Modify `packages/tianwen-dsh-compat/src/index.ts` only if public `ToolRestriction`, `ToolGuard`, retry-policy, or cancellation types need re-export.
- Modify `packages/tianwen-runtime/src/skill-evaluation.ts`.
- Modify `packages/tianwen-runtime/src/index.ts`.
- Create `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts`.
- Modify `tests/dsh-probe/skill-evaluation-runtime.spec.ts` only for shared-helper regression.

- [ ] Write RED preflight tests that create zero Agents, Sessions, Runs, requests, or tool calls when any Candidate chain, five-task input digest, parent/Candidate Skill digest, Provider/model/call config, tool surface, retry policy, Session emptiness, or evidence-purpose fact disagrees.
- [ ] Reuse `normalizeSkillEvaluationRequest()` and `compareNormalizedSkillEvaluationRequests()`; refactor them only if needed to support five rows. Do not parse prompts or inspect DSH private fields.
- [ ] For `controlled-product`, require the configured Provider route to exist and expose `mode='normal'` with `maxRetries=0`. Record the resolved retry-policy digest. Do not register, replace, or select a Provider in this code path.
- [ ] For `development-only-synthetic-defect`, require the reserved scripted route, zero external cost, the dedicated prefixes/roots, and a service-owned `ScriptedAdapter` limited to the exact fifteen Sessions (ten execution + five evaluator).
- [ ] In each execution Agent's scoped setup, register only the exact B or C Skill, apply `tools.restrict({ allow })` to inherited tools, and add a monotonic guard that rejects any non-frozen tool before body dispatch. Reuse DSH; do not create a parallel authorization dispatcher.
- [ ] Let the DSH Agent complete naturally; do not cancel because of a Tianwen model-request/token/price counter. Use DSH tool guards and public cancellation only for frozen authorization, explicit stop-contract, API-quota, user/system cancellation, or genuine no-progress/safety conditions.
- [ ] Open the full plan before any Run, bind all ten Runs before the first Turn, and run in frozen order. Do not silently continue after the first global stop condition.
- [ ] Capture final assistant text only through a fixed bounded projector for later blind evaluation. Keep it out of Evolution ledger; persist only its digest and Session-owned source.
- [ ] Prove one real DSH Agent loop turn per scripted fixture arm, exact selected Skill injection, B/C normalized-request equality, distinct Sessions/Runs, acceptance subject equality, tool restriction, limit cancellation, and no root Skill-registry mutation.
- [ ] Prove an arm failure is durably classified once and the activity stops; never consume later scripted entries as replacement attempts.
- [ ] Commit:

```text
feat: run bounded controlled Skill evaluation arms
```

---

## Task 4: Run Five Independent X/Y Evaluator Agents

**Files:**

- Modify `packages/tianwen-runtime/src/skill-evaluation.ts`.
- Modify `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts`.

- [ ] Write RED tests for five evaluator Agents with distinct fresh Sessions, no execution Session inheritance, no B/C Skill registration, and a scoped `submit_blind_evaluation` tool.
- [ ] Build each evaluator request from the constant rubric, one task's X/Y bounded final text, and the closed X/Y objective-fact projection. Assert the serialized request contains no `baseline`, `candidate`, B/C labels, Candidate/parent/protocol IDs, Skill bodies/digests, execution Session IDs, paths, or credentials.
- [ ] Define the score tool with a closed DSH `defineTool` schema: task ID, X/Y four-dimension integer scores, `insufficientMaterial`, and finite reason codes. A second submission, wrong task/envelope, extra field, prose score, out-of-range score, or direct final-text score without the tool makes the activity `inconclusive`.
- [ ] Restrict each evaluator Agent to the scoped score tool and the same authorization/stop contract, without a Tianwen model budget. The evaluator cannot run product tools or modify task artifacts.
- [ ] Record each score receipt immediately after its evaluator Session becomes idle. Freeze all five before reveal; then apply the pure reducer and record one aggregate result.
- [ ] Test asymmetric X/Y maps, tied scores, T1/T2 objective improvement, every rejection rule, insufficient material, evaluator identity leak detection, and scripted evidence downgrade.
- [ ] Commit:

```text
feat: add blind evaluator scoring
```

---

## Task 5: Prove the Development-Only Synthetic Path Without Product Pollution

**Files:**

- Create `scripts/run-controlled-skill-evaluation-demo.ts`.
- Create `tests/dsh-probe/controlled-skill-evaluation-demo.spec.ts`.
- Modify `package.json`.

- [ ] Build one deliberately defective test Skill under a dedicated name and isolated ledger/workspace. Freeze the defect and expected signal before any execution.
- [ ] Use five clearly synthetic fixture task types: original result-order defect, adjacent transfer, preserved regression behavior, a raw-extraction counterexample where the new rule must stay quiet, and a safety task that forbids secret disclosure/unauthorized publication.
- [ ] Drive `feedback -> Ticket -> Case -> Lesson -> Candidate` in the isolated copy, then run the ten scripted B/C arms and five scripted evaluator Sessions once each.
- [ ] Assert every durable v2 record carries `development-only` and `synthetic-defect`; the result separately reports the mechanical B/C decision and `natural-user-evidence=not-claimed`. A mechanical pass is eligible only for isolated test Shadow/Promotion, never ordinary-incumbent or market claims.
- [ ] Assert the ordinary parent Skill registry, any caller-supplied incumbent, product ledger fixture, Sessions/Evidence outside the dedicated prefixes, and legacy Champion/Dynamic state are unchanged.
- [ ] Emit one small machine-readable receipt containing only schema version, evidence class, labels, counts, terminal decision, reason codes, and record digests. Do not emit prompts, model outputs, ledger paths, or private facts.
- [ ] Run the demo once inside the test process; no Provider/model/product operation is permitted.
- [ ] Commit:

```text
test: prove isolated controlled evaluation mechanics
```

---

## Task 6: Documentation, Gates, and Handoff

**Files:**

- Modify `README.md`.
- Modify `README.zh-CN.md`.
- Modify `docs/tianwen-architecture-overview-v2.md`.
- Create `docs/operations/tianwen-v0.1-controlled-five-task-evaluation-handoff.md`.
- Modify `tests/contracts/test_public_repository_surface.py`.

- [ ] Update public wording to say: the five-task/blind-evaluator mechanism is implemented and scripted-tested; no legitimate natural Candidate exists yet; no real paired B/C, Shadow, Promotion, or Rollback evidence has been produced.
- [ ] In the handoff, record exact evidence classes, synthetic fixture identity, task/Session counts, stop reasons exercised, privacy proof, v1 replay proof, and the exact entry conditions for a future real Candidate-specific task freeze.
- [ ] State that the next external action uses the recorded standing authorization and an intentionally defective controlled Skill to create the isolated Ticket/Case/Lesson/Candidate chain. Do not publish the controlled task results as natural-user or market evidence.
- [ ] Run focused gates:

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-v0.1-eval-fixtures'
pnpm --filter @tianwen/runtime... build
pnpm exec vitest run tests/dsh-probe/controlled-skill-evaluation.spec.ts tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts tests/dsh-probe/controlled-skill-evaluation-demo.spec.ts tests/dsh-probe/skill-evaluation.spec.ts tests/dsh-probe/skill-evaluation-runtime.spec.ts
python -m pytest -q tests/contracts/test_public_repository_surface.py
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

- [ ] Run the full repository gate exactly once after focused green:

```powershell
pnpm run check
python -m pytest -q
```

- [ ] Confirm the fixture root contains zero leftover files or logical bytes, the worktree contains no generated `dist`/cache artifacts, and `D:\Guo\zuochong\AGi` was not touched.
- [ ] Commit:

```text
docs: hand off controlled five-task evaluation
```

---

## Task 7: Review and Integration Gate

This task is supervision work after Tasks 1-6. It is the last gate before the already authorized bounded real-evaluation continuation; it does not itself call a Provider or mutate installed product state.

- [ ] Run three independent review passes over the exact feature diff: correctness/security, architecture/evidence, and simplicity/scope. Critical/Important findings must be fixed with RED/GREEN evidence; minor theoretical edges do not block release without a reachable failure path.
- [ ] Re-run the smallest affected gates after each fix, then the final focused and full gates.
- [ ] Record the exact feature SHA and verify the worktree is clean.
- [ ] Merge only that reviewed SHA into current `main` without unrelated changes.
- [ ] Push the exact merged main and wait for exact-main CI. All Python, TypeScript, and installer-windows jobs must be green for that SHA.
- [ ] Update the handoff with exact feature/main SHA and CI URL only through a separately reviewed docs commit if needed.
- [ ] Report the exact-main gate result, then continue with the operational entry below. Do not claim project completion from scripted fixtures or CI.

## Task 8: Real-Provider Isolated Lifecycle Proof

This task begins only after Task 7 exact-main CI is green. It uses the project owner's 2026-08-23 standing authorization and the fixed five-task/single-attempt fairness bounds; there is no Tianwen-side DeepSeek budget and no per-arm approval.

- [ ] Re-run the zero-side-effect preflight against the installed exact-main product. Stop before dispatch if Provider/model/call-config/tool/retry facts, roots, Session emptiness, or authorization disagree.
- [ ] Because no legitimate product Candidate currently exists, run the intentionally defective development-only Skill through real DSH rc.7, the configured Provider, real allowed tools, ten independent B/C Sessions, and five independent evaluator Sessions. Use one formal attempt only.
- [ ] Keep the dedicated ledger/workspace/Skill/Goal/Session namespaces and permanent `development-only` / `synthetic-defect` labels. Do not read or mutate real product Sessions, Evolution, incumbent pointers, or user data.
- [ ] Exercise the isolated feedback → Ticket → Case → Lesson → Candidate → paired B/C mechanics through the real product code. The receipts can prove `mechanism=pass` while permanently declaring `natural-user-evidence=not-claimed`.
- [ ] Preserve the first real failure without retry. Diagnose before deciding whether a code change requires a new reviewed SHA and a wholly new formally identified activity.

## Task 9: Isolated Real Shadow, Promotion, and Rollback

- [ ] Enter a five-task isolated test Shadow only when the real-provider controlled B/C mechanical verdict passes. Candidate C affects only the preselected new Runs in the dedicated test scope; ordinary product Runs retain their incumbent.
- [ ] If Shadow passes, the supervising session records its evidence-based `promote` recommendation and proceeds under the project owner's standing authorization without asking again.
- [ ] Perform separate compare-and-set Promotion, `C → B` Rollback, and default `B → C` restoration transitions, each with its own exact pointer revision and machine-readable receipt.
- [ ] Stop on stale evidence, identity mismatch, post-check failure, or a recommendation to retain B. Preserve the first real failure; never repeat an evaluation arm to improve the result.

## Task 10: Closeout and Future Natural Evidence

- [ ] Provide the project owner a beginner-readable summary, key samples, exact Candidate/incumbent digests, scope, real Provider/Session evidence, Promotion/Rollback receipts, and the explicit boundary `natural-user-evidence=not-claimed`.
- [ ] Treat the successful controlled real lifecycle as sufficient v0.1 engineering closeout evidence. Do not require a naturally occurring failure or project-owner correction as a blocker.
- [ ] Future natural Candidate work reuses the same gates and standing authorization, but remains a later product-efficacy evidence opportunity rather than unfinished v0.1 infrastructure.

## Real Product Entry Conditions

A real controlled run may start only when all of the following exist together:

1. a deliberately defective controlled B Skill whose failure can be objectively verified, plus the governed Ticket/Case/Attribution/Lesson/Candidate chain derived inside the isolated test scope;
2. five concrete, meaningful Candidate-specific task packages frozen before Candidate materialization;
3. the exact approved rubric and ten empty B/C plus five empty evaluator Sessions;
4. exact Provider/model/tool/workspace/retry facts and objective verifiers;
5. the project-owner Provider-operation authorization recorded on 2026-08-23;
6. exact-main CI green for this mechanism.

The intentionally defective Skill is sufficient to exercise and close the v0.1 engineering lifecycle when the whole activity uses real Runtime/Provider/tools and passes the frozen gates. Its permanent controlled labels forbid claims of natural-user failure, external-user benefit, or market generalization; those are future evidence classes, not release blockers.
