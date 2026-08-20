# Tianwen Stage 4: Paired Skill Evaluation Implementation Plan

> Execute this plan in the existing isolated D-drive implementation worktree. Follow TDD for every behavior change and stop at each stated boundary.

**Goal:** Add one auditable, paired B-vs-C Skill evaluation path that runs through normal DSH Agents, preserves uncertainty, and cannot alter ordinary Run routing.

**Architecture:** Extend the existing `@tianwen/evolution` ledger with one Ticket-scoped protocol fact, one immutable evaluation plan, and one immutable aggregate result. Add one thin `@tianwen/runtime` adapter that uses only public DSH `0.1.0-rc.7` Agent, Skill, LLM, Session, tool, Evidence, and Outcome surfaces. The zero-cost demo must exercise the real producer-to-consumer chain but conclude `INCONCLUSIVE` for efficacy because `ScriptedAdapter` output is predetermined.

**Canonical design:** `docs/superpowers/specs/2026-08-21-tianwen-paired-skill-evaluation-design.md`

**Tech stack:** TypeScript 6, Node 22, pnpm 11, Vitest 4, existing DSH `0.1.0-rc.7`, existing Python public-surface contract.

---

## Global constraints

1. DSH `0.1.0-rc.7` remains the only product Agent Runtime.
2. Do not add or modify an Agent loop, Provider adapter, Session engine, permission system, Skill loader, Job, Workflow, Subagent, queue, worker, scheduler, database, repository abstraction, or second ledger.
3. Do not call or extend the old `recordArtifact`, old `recordEvaluation`, `recordApproval`, `promote`, `rollback`, `rehydrateChampion`, Dynamic Cordis activation, Python Alpha, RepoTaskRuntime, AlphaRuntime, Docker evaluator, or runtime-profile path.
4. Candidate C remains immutable with status `recorded`. Stage 4 never registers C outside a disposable Agent scope and never changes ordinary Run routing.
5. The three Stage 4 events are internal. The single frozen public whitelist remains exactly the existing eight legacy audit event types.
6. Store only governed identifiers, finite reason codes, digests, sequence references, and small counters. Never store raw prompt, Skill body, model output, tool arguments/result, user text, cwd, absolute paths, Provider configuration, or credentials in the evolution ledger.
7. A protocol gets `pre-candidate` provenance only from same-ledger order: the first protocol frozen on an open Ticket before any Case. Callers cannot choose provenance. Existing Candidates without that earlier event remain retrospective.
8. `ScriptedAdapter` can prove machinery only. Its evaluation result must be `INCONCLUSIVE + not-comparable + needs-evidence + scripted-mechanism`.
9. Do not run a live Provider, paid model, Docker, or Alpha Trial during Tasks 1–6. Optional paid screening is not required for Stage 4 completion and should not run merely because budget exists.
10. Reuse the one existing D-drive worktree, `node_modules`, and shared pnpm store. Do not create another clone, worktree, `node_modules`, `.venv`, DSH Profile, or probe. Do not install or download dependencies unless a genuine approved plan dependency is missing; none is expected.
11. Put transient test fixtures only under `D:\DevData\tianwen-stage4-test-fixtures`. Tests must leave zero files and zero logical bytes there.
12. Do not change `pnpm-lock.yaml` or dependency versions. The needed DSH packages are already exact rc.7 dependencies of `@tianwen/dsh-compat`.
13. Do not create a PR, tag, Release, visibility change, metadata change, or application action.
14. Stop after Task 6 and report the exact feature SHA. Task 7 requires supervisor release after independent review.

## Expected file map

Product files:

- Create `packages/tianwen-evolution/src/skill-evaluation.ts`.
- Modify `packages/tianwen-evolution/src/ledger.ts`.
- Modify `packages/tianwen-evolution/src/index.ts`.
- Modify `packages/tianwen-evolution/src/runtime-binding.ts`.
- Modify `packages/tianwen-dsh-compat/src/index.ts`.
- Create `packages/tianwen-runtime/src/skill-evaluation.ts`.
- Modify `packages/tianwen-runtime/src/index.ts`.

Proof and public-surface files:

- Create `tests/dsh-probe/skill-evaluation.spec.ts`.
- Create `tests/dsh-probe/skill-evaluation-runtime.spec.ts`.
- Create `tests/dsh-probe/paired-skill-evaluation-demo.spec.ts`.
- Modify `tests/dsh-probe/evolution.spec.ts` for public-event and frozen Dynamic Cordis regression only.
- Create `scripts/run-paired-skill-evaluation-demo.ts`.
- Modify `package.json`.
- Modify `.github/workflows/ci.yml`.
- Modify `tests/contracts/test_public_repository_surface.py`.
- Modify `README.md`.
- Modify `README.zh-CN.md`.
- Modify `docs/tianwen-architecture-overview-v2.md`.
- Create `docs/operations/tianwen-stage4-paired-skill-evaluation-handoff.md`.

No other file is expected. If implementation needs a different product file, stop and explain why before expanding scope. Generated `dist` and `.tsbuildinfo` remain ignored and uncommitted.

## Workspace setup and baseline stop gate

Use the existing worktree:

```powershell
Set-Location D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake
git status --short
git branch --show-current
git rev-parse HEAD
git worktree list --porcelain
Test-Path -LiteralPath node_modules\.modules.yaml
```

The supervisor will supply the exact commit containing the approved design and this plan. Create one implementation branch from that exact commit:

```powershell
git switch --detach <EXACT_PLAN_SHA>
git switch -c codex/tianwen-paired-skill-evaluation
```

Required setup facts:

- tracked worktree clean before branch creation;
- exact design and plan blobs present;
- the worktree is the existing D-drive linked worktree;
- existing `node_modules/.modules.yaml` present;
- no dependency installation or download.

Set the dedicated fixture root only for test processes:

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-stage4-test-fixtures'
if (Test-Path -LiteralPath $env:TIANWEN_DSH_PROBE_ROOT) {
  $existingFixtureFiles = Get-ChildItem -LiteralPath $env:TIANWEN_DSH_PROBE_ROOT -Recurse -File -Force
  if ($existingFixtureFiles.Count -ne 0) { throw 'Stage 4 fixture root is not clean' }
}
New-Item -ItemType Directory -Force -Path $env:TIANWEN_DSH_PROBE_ROOT | Out-Null
```

This is a read-only cleanliness gate before creation. Do not delete or overwrite unexpected old fixture data.

Run the established clean-build order, not the historically incomplete bare first typecheck:

```powershell
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run `
  tests/dsh-probe/evidence.spec.ts `
  tests/dsh-probe/research-preview-demo.spec.ts `
  tests/dsh-probe/evolution.spec.ts `
  tests/dsh-probe/learning-intake.spec.ts `
  tests/dsh-probe/learning-intake-runtime.spec.ts `
  tests/dsh-probe/explicit-correction-demo.spec.ts `
  tests/dsh-probe/outcome-intake.spec.ts `
  tests/dsh-probe/outcome-intake-runtime.spec.ts `
  tests/dsh-probe/repeated-outcome-demo.spec.ts `
  tests/dsh-probe/skill-governance.spec.ts `
  tests/dsh-probe/skill-governance-runtime.spec.ts `
  tests/dsh-probe/governed-skill-candidate-demo.spec.ts
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
```

Expected baseline: 12 Vitest files / 85 tests pass, all four demos emit one JSON object, exact rc.7 closure, and zero private imports. Record actual counts; do not force them to match if upstream history legitimately differs.

Stop before Task 1 if any baseline command fails for a repository reason, if the exact commit differs, if the worktree is not clean, if `node_modules` is missing, or if continuation would require a download. Do not wash a first failure green by retrying without explaining its cause.

---

## Task 1: Freeze the Ticket-scoped EvalProtocol

**Files:**

- Create `packages/tianwen-evolution/src/skill-evaluation.ts`.
- Modify `packages/tianwen-evolution/src/ledger.ts`.
- Modify `packages/tianwen-evolution/src/index.ts`.
- Modify `packages/tianwen-evolution/src/runtime-binding.ts`.
- Create `tests/dsh-probe/skill-evaluation.spec.ts`.
- Modify `tests/dsh-probe/evolution.spec.ts` only for the existing public-event/Dynamic Cordis regression.

### Step 1: Write the failing protocol contracts

Add focused tests that build real Stage 1/2 ledger facts and assert:

1. the first complete four-category protocol frozen on an open Ticket before a Case becomes `pre-candidate`;
2. the ledger derives `scopeKey` from all Ticket Signals and rejects disagreement rather than trusting caller scope;
3. `protocolId` is the canonical SHA-256 identity of Ticket ID + derived scope + normalized protocol;
4. exact replay is `duplicate: true` and returns defensive copies;
5. a changed record under the same identity is rejected;
6. a protocol frozen after Case/Candidate is `retrospective`;
7. a second protocol on the same Ticket is `retrospective`, even if no Candidate was created after the first freeze;
8. callers cannot submit or override provenance;
9. missing category, duplicate protocol case ID, invalid `(caseId, attempt)`, unbounded repetition/budget, arbitrary metric/validator/reason string, raw prompt, URL/query secret material, cwd, absolute path, or unsafe Provider/model identifier is rejected before append;
10. a replayed event forged as `pre-candidate` after a Case, or a second claimed pre-Candidate protocol, fails closed;
11. `skill-eval-protocol-frozen` is absent from exported `LedgerEvent`, runtime `listEvents()`, and serialized public events;
12. all eight legacy public events and the frozen Dynamic Cordis/Artifact regression remain unchanged.

Run the narrow RED test and preserve its exact failure:

```powershell
pnpm exec vitest run tests/dsh-probe/skill-evaluation.spec.ts
```

The RED must be missing behavior/type, not an environment-variable or fixture failure.

### Step 2: Implement the smallest pure protocol domain

In `skill-evaluation.ts`, define only the types and pure functions needed now:

- `SkillEvalProtocolId`;
- closed literal unions for case category, arm order, reducer, validator, metric, and protocol reason codes;
- `SkillEvalProtocol`, `SkillEvalProtocolRecord`, and receipt/input shapes;
- exact-key validation, bounded integer/budget validation, safe-identifier validation, canonical ordering, and deterministic ID preparation;
- no generic schema framework and no new canonical JSON implementation—reuse the existing evolution canonical hashing helpers.

The protocol accepts digests and finite identifiers only. It does not accept prompt text, workspace references, Provider configuration, credentials, or a caller-authored provenance field.

### Step 3: Add one internal ledger event and formal-write service method

Add `skill-eval-protocol-frozen` to internal `LedgerEvent`, parsing, append preflight, replay, and maps. Use the existing single `ledger.jsonl`, `#accept`, fsync/commit-unknown behavior, and defensive-copy getter/list patterns.

Expose through `TianwenEvolutionService`:

- `freezeSkillEvalProtocol(input)`;
- `getSkillEvalProtocol(protocolId)`;
- `listSkillEvalProtocols()`.

The service must route the write through existing `formalWrite()`. Do not add a protocol repository or mutable status row.

Update the root exports explicitly. Keep the public event whitelist unchanged and derive runtime filtering from it; do not add a second privacy deny list.

### Step 4: Run GREEN and regressions

```powershell
pnpm --filter @tianwen/runtime... build
pnpm exec vitest run tests/dsh-probe/skill-evaluation.spec.ts tests/dsh-probe/evolution.spec.ts
pnpm run typecheck
pnpm run check:no-private-dsh-imports
git diff --check
```

### Step 5: Commit Task 1

Stage only the Task 1 files, inspect the cached name list and diff check, then commit:

```text
feat: freeze Skill evaluation protocols
```

---

## Task 2: Record immutable paired plans and results

**Files:**

- Modify `packages/tianwen-evolution/src/skill-evaluation.ts`.
- Modify `packages/tianwen-evolution/src/ledger.ts`.
- Modify `packages/tianwen-evolution/src/index.ts`.
- Modify `packages/tianwen-evolution/src/runtime-binding.ts`.
- Modify `tests/dsh-probe/skill-evaluation.spec.ts`.
- Modify `tests/dsh-probe/evolution.spec.ts` only for privacy/legacy regression.

### Step 1: Write failing plan, reducer, and replay contracts

Tests must cover:

- opening reads Candidate → Lesson → Attribution → Case → Ticket and the durable protocol, with exact Ticket/scope/parent equality;
- protocol provenance comes from the record, never the caller;
- distinct B/C Run and Session IDs for every `(caseId, attempt)`;
- unique plan rows, exact category coverage, equal non-Skill conditions, bounded budgets, safe environment identifiers, and no raw content/path fields;
- deterministic `evaluationId` from Candidate + parent + protocol + environment + ordered arm identities;
- plan duplicate/conflict behavior and incomplete-plan replay;
- pure attempt-to-case reduction and case-to-evaluation reduction;
- `PASS`, `FAIL`, and `INCONCLUSIVE` stay distinct;
- `both met => PASS + tie`, `both not-met => FAIL + tie`, B fail/C pass => candidate-better, B pass/C fail => FAIL + baseline-better, and any unreliable/fairness fact => INCONCLUSIVE + not-comparable;
- aggregate comparison gives `not-comparable` precedence;
- decision is derived, including the full Shadow-review conjunction and retrospective/scripted exclusions;
- `evidenceClass` is derived from trusted execution facts, never accepted from a caller;
- each arm receipt binds `evaluatedSubjectDigest` to its validator receipt;
- result duplicate/conflict behavior, restart replay, canonical tamper rejection, and defensive getters;
- `skill-evaluation-opened` and `skill-evaluation-result-recorded` remain absent from public types and runtime events;
- no Candidate, old Artifact/Evaluation/Approval/Champion, or Dynamic Cordis state changes.

Run RED:

```powershell
pnpm exec vitest run tests/dsh-probe/skill-evaluation.spec.ts
```

### Step 2: Implement pure plan/result types and reducers

Add only the approved Stage 4 types and pure preparation/reduction functions. Keep attempt identity as `(caseId, attempt)`; do not add a generic experiment model.

Safe identifiers must be runtime-observed, normalized, bounded, and non-secret. A deterministic Provider capability must be a trusted adapter capability plus digest; an arbitrary caller flag never upgrades evidence above `objective-screening`.

### Step 3: Add the two internal events

Add:

- `skill-evaluation-opened`;
- `skill-evaluation-result-recorded`.

Use the same ledger append/replay path and service `formalWrite()`. Provide defensive trusted governance getters/list methods. Result recording validates ledger-owned Candidate/Case/Ticket/protocol/plan/RunBinding/Outcome facts. Runtime-owned Session/request/registry/Evidence facts arrive only as already-validated digests and references; ledger restart does not query external stores.

Do not mutate Candidate status. Do not call any old evaluation or promotion method.

### Step 4: GREEN and focused regression

```powershell
pnpm --filter @tianwen/runtime... build
pnpm exec vitest run tests/dsh-probe/skill-evaluation.spec.ts tests/dsh-probe/evolution.spec.ts tests/dsh-probe/skill-governance.spec.ts
pnpm run typecheck
pnpm run check:no-private-dsh-imports
git diff --check
```

### Step 5: Commit Task 2

```text
feat: record paired Skill evaluations
```

---

## Task 3: Expose only the required public DSH seams

**Files:**

- Modify `packages/tianwen-dsh-compat/src/index.ts`.
- Create `packages/tianwen-runtime/src/skill-evaluation.ts`.
- Modify `packages/tianwen-runtime/src/index.ts`.
- Create `tests/dsh-probe/skill-evaluation-runtime.spec.ts`.

### Step 1: Write failing compile/runtime seam tests

The tests must require only these additional rc.7 exports from `@tianwen/dsh-compat`:

- types `AgentHandle` and `CreateAgentOptions` from public `@deepseek-ai/dsh-agent`;
- type `LlmCallConfig` and values `isAgentLoopRequest`, `callConfigEquals` from public `@deepseek-ai/dsh-llm`.

`GenerateOptions`, `SkillRegistration`, `renderSkillContent`, `SessionId`, `createUserMessage`, and existing harness helpers are already public compat surfaces; reuse them.

Write RED contracts for pure request observation/normalization:

- reject non-Agent-loop, wrong-Session, non-ordinary-purpose, over-budget, and wrong-order requests;
- require actual call config to equal preflight and its paired arm under `callConfigEquals`;
- locate exactly one user-role message whose complete single text content is byte-equal to `renderSkillContent(selectedSkill)`;
- locate an optional target entry only through the public `skill-catalog` source and entries;
- when both arms have exactly one target entry, normalize both; when both omit it, preserve all non-target catalog content; reject asymmetric presence, duplicates, or unequal non-target entries as `INCONCLUSIVE`;
- replace the exact injection content, any valid paired catalog entries, and arm/session identity with fixed markers;
- reject zero or multiple exact injection matches;
- preserve all other messages, catalog entries, framing, tools, and input;
- never inspect the unexported `skill-invocation` discriminator and never use regex prompt parsing.

This is the intentional public-seam proof: Agent-scoped registration, the exact `/name` input, a unique full `renderSkillContent()` match, and different frozen B/C bodies must all agree. Content matching by itself is not sufficient.

Run RED:

```powershell
pnpm exec vitest run tests/dsh-probe/skill-evaluation-runtime.spec.ts
```

### Step 2: Add minimal compat exports and pure runtime helpers

Re-export only the listed public symbols. Do not add another DSH package or private subpath.

In `packages/tianwen-runtime/src/skill-evaluation.ts`, implement only the pure observer/normalization and manifest-comparison helpers needed by the contracts. Do not create Agents yet and do not add a Provider wrapper.

### Step 3: GREEN and boundary gates

```powershell
pnpm --filter @tianwen/runtime... build
pnpm exec vitest run tests/dsh-probe/skill-evaluation-runtime.spec.ts
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

### Step 4: Commit Task 3

```text
feat: expose paired DSH evaluation seams
```

---

## Task 4: Run isolated B/C Agents through normal DSH execution

**Files:**

- Modify `packages/tianwen-runtime/src/skill-evaluation.ts`.
- Modify `packages/tianwen-runtime/src/index.ts`.
- Modify `tests/dsh-probe/skill-evaluation-runtime.spec.ts`.

### Step 1: Write failing end-to-end runtime contracts

Using the real public DSH harness, Skill registry/tool, Evidence service, and Tianwen Outcome intake, prove:

1. parent B is reconstructed from the Stage 3 manifest chain and freshly resolved from the intended DSH scope;
2. Candidate C is read from the ledger, stays `recorded`, and has exact parent/scope/payload digest equality;
3. B and C must both have `userInvocable=true` before any plan/Run write; the runtime never changes invocation policy;
4. protocol record is durable, belongs to the Candidate Ticket/scope, and has ledger-derived provenance;
5. full plan is durable before Run bindings, and all bindings are durable before any first Turn;
6. a binding failure leaves an incomplete plan and starts zero arms;
7. each arm uses a new DSH Agent/Session; its selected Skill is registered only in `CreateAgentOptions.setup(agentCtx)`;
8. exact input bytes match the frozen digest and use public `/skill-name` explicit injection;
9. the observer sees the actual first `llm/stream` request for the exact Session, ordinary purpose, and budgeted order;
10. actual model call config equals preflight and paired-arm config;
11. normalized first requests differ only in selected Skill and arm/session markers;
12. each arm produces separate Outcome, Evidence, validator receipt, and evaluated-subject binding;
13. arm failure, missing Evidence, fairness mismatch, baseline change, or budget stop becomes `INCONCLUSIVE`, never a guessed FAIL/PASS;
14. Agent handles are always disposed in `finally`; root registry and a fresh Agent resolve the same ordinary Skills after disposal, with no Candidate residue;
15. Session digests are unchanged by governance intake after each completed Run;
16. Dynamic Cordis `define/run/stop`, old Artifact/Evaluation/Approval/Champion, Python, Docker, and ordinary Run selection are untouched.

Use one test fixture with four categories and one scripted attempt each. Keep additional failure cases narrow; do not build a general runner matrix.

### Step 2: Implement the thin runtime service

Add `TianwenSkillEvaluationService` to the existing runtime plugin. It may coordinate the fixed Stage 4 matrix synchronously, but it must delegate all Agent execution to DSH.

The fixed matrix has two phases. Preparation creates every no-prompt Agent, registers its scoped Skill, inspects its actual scoped tool/config surface, and validates all cases. Only then may the service append the complete plan and durably bind **every** planned Run. If any preparation, plan, or binding step fails, it starts zero Turns and disposes every prepared handle.

After the complete matrix is durable, execute arms in the frozen order:

```text
require the already prepared Agent + durable plan + all Run bindings
→ followup(exact case input with /skill-name)
→ wait for idle
→ consume Outcome/Evidence and validate the subject receipt
→ dispose AgentHandle in finally
```

Observe `llm/stream` through the public Cordis event surface. Read-only listeners must call `next()` exactly once and must not alter the deep-frozen request.

Persist only the final governed digests/references and counters. Raw DSH messages stay in Session/private fixture memory.

### Step 3: Run GREEN and Stage 1–3 noninterference regressions

```powershell
pnpm --filter @tianwen/runtime... build
pnpm exec vitest run `
  tests/dsh-probe/skill-evaluation.spec.ts `
  tests/dsh-probe/skill-evaluation-runtime.spec.ts `
  tests/dsh-probe/evolution.spec.ts `
  tests/dsh-probe/skill-governance-runtime.spec.ts `
  tests/dsh-probe/outcome-intake-runtime.spec.ts
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

### Step 4: Commit Task 4

```text
feat: run isolated paired Skill evaluations
```

---

## Task 5: Prove the full zero-cost producer-to-consumer chain

**Files:**

- Create `scripts/run-paired-skill-evaluation-demo.ts`.
- Create `tests/dsh-probe/paired-skill-evaluation-demo.spec.ts`.
- Modify `package.json`.

### Step 1: Write a failing demo contract

Require one JSON object with schema `tianwen.paired-skill-evaluation-demo.v1`. It must expose only counts, IDs/digests safe for the public demo, enums, booleans, and zero-cost facts.

The demo must use deterministic synthetic data and the real normal DSH path:

1. produce repeated not-met Outcomes and a met counterexample through real DSH Agents;
2. obtain the open Stage 2 Ticket;
3. freeze the complete four-category EvalProtocol before opening its Case;
4. run the unchanged Stage 3 Case → Attribution → Lesson → Candidate path;
5. evaluate B/C across four categories with eight new isolated DSH Agents/Sessions;
6. record the plan and aggregate result;
7. replay protocol, Candidate, plan, and result idempotently;
8. restart the ledger and read identical governed records;
9. prove public events contain none of the twelve internal learning/evaluation discriminators or raw synthetic text;
10. prove Candidate remains `recorded`, root Skill registry unchanged, Candidate absent after Agent disposal, Session digests unchanged, Dynamic Cordis inventory unchanged, zero legacy Artifact files/events, and Champion unchanged.

The exact efficacy result is mandatory:

```text
protocolProvenance = pre-candidate
evidenceClass = scripted-mechanism
verdict = INCONCLUSIVE
comparison = not-comparable
decision = needs-evidence
reason includes scripted-model-output
```

Cost block must be exactly zero for network, Provider requests, paid tokens, CNY, Docker, persistent external database, and user data.

Run RED:

```powershell
pnpm exec vitest run tests/dsh-probe/paired-skill-evaluation-demo.spec.ts
```

### Step 2: Implement the smallest deterministic demo

Reuse existing fixture helpers and public Tianwen services. Do not create a demo framework, generic scenario builder, second ledger, or duplicate DSH host. If a tiny local function removes repetition inside this one script, keep it local.

Add only:

```json
"demo:paired-skill-evaluation": "tsx scripts/run-paired-skill-evaluation-demo.ts"
```

Do not edit the lockfile.

### Step 3: GREEN and all four previous demos

```powershell
pnpm exec vitest run tests/dsh-probe/paired-skill-evaluation-demo.spec.ts
pnpm demo:paired-skill-evaluation
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
git diff --check
```

Every demo prints exactly one JSON object. Capture Stage 4 counts from actual output rather than hard-coding a planned request count in public documentation.

### Step 4: Commit Task 5

```text
test: prove paired Skill evaluation
```

---

## Task 6: Publish accurate limits, extend zero-cost CI, review, and push

**Files:**

- Modify `README.md`.
- Modify `README.zh-CN.md`.
- Modify `docs/tianwen-architecture-overview-v2.md`.
- Create `docs/operations/tianwen-stage4-paired-skill-evaluation-handoff.md`.
- Modify `tests/contracts/test_public_repository_surface.py`.
- Modify `.github/workflows/ci.yml`.

### Step 1: Write the public contract RED

Extend the existing Python contract to require the same facts in English, Chinese, architecture, and CI:

- Stage 4 runs paired isolated normal DSH Agents under a frozen protocol;
- protocol provenance is mechanically `pre-candidate` or `retrospective`;
- existing retrospective Candidates cannot become Shadow-eligible;
- scripted proof is mechanism-only and efficacy `INCONCLUSIVE`;
- Candidate remains `recorded` and is not installed, routed, shadowed, promoted, or rejected;
- no second Runtime and no old Alpha/Dynamic Cordis/Artifact path;
- Evaluation, Shadow, Promotion, Active Pointer, and Rollback are not presented as completed beyond the exact Stage 4 result record;
- CI includes all three Stage 4 tests and the Stage 4 demo command.

Run RED:

```powershell
$stage4Python='D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $stage4Python) {
  & $stage4Python -m pytest (Resolve-Path tests/contracts/test_public_repository_surface.py) -q
} else {
  Write-Output 'local Python public contract unavailable; exact-main CI remains required'
}
```

Use only that already retained D-drive Python 3.12 environment after verifying it contains pytest. The contract derives its repository root from the absolute test-file path, so it tests the current feature tree rather than the disposable environment's checkout. Do not run bare `uv run`, create/sync a `.venv`, or install anything for this contract. If the retained interpreter is absent or unusable, record the local Python gate as unavailable and use exact-main CI as the final Python gate.

### Step 2: Update the public surface honestly

Write from the canonical Stage 4 design and actual demo output. Keep English and Chinese aligned. Explicitly distinguish:

- proved mechanism;
- synthetic fixture data;
- retrospective screening;
- real independent efficacy Evidence not yet proved unless an actual qualifying run exists;
- Shadow and Promotion still not entered.

The handoff records the exact base and Task 1–5 commits known before its own commit, commands, counts, demo enums/digests, zero costs, and deferrals. Task 6's final SHA, push equality, and later CI belong in the structured execution report; do not create a second self-referential docs commit. Do not claim a live Provider run if none occurred.

### Step 3: Extend existing CI minimally

Append the three Stage 4 Vitest files to the existing focused Vitest command and append one `pnpm demo:paired-skill-evaluation` step. Do not add a job, matrix, cache layer, secret, Docker service, artifact upload, coverage gate, retry, or runtime-profile.

### Step 4: Run the final fresh feature gates

```powershell
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run `
  tests/dsh-probe/evidence.spec.ts `
  tests/dsh-probe/research-preview-demo.spec.ts `
  tests/dsh-probe/evolution.spec.ts `
  tests/dsh-probe/learning-intake.spec.ts `
  tests/dsh-probe/learning-intake-runtime.spec.ts `
  tests/dsh-probe/explicit-correction-demo.spec.ts `
  tests/dsh-probe/outcome-intake.spec.ts `
  tests/dsh-probe/outcome-intake-runtime.spec.ts `
  tests/dsh-probe/repeated-outcome-demo.spec.ts `
  tests/dsh-probe/skill-governance.spec.ts `
  tests/dsh-probe/skill-governance-runtime.spec.ts `
  tests/dsh-probe/governed-skill-candidate-demo.spec.ts `
  tests/dsh-probe/skill-evaluation.spec.ts `
  tests/dsh-probe/skill-evaluation-runtime.spec.ts `
  tests/dsh-probe/paired-skill-evaluation-demo.spec.ts
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
pnpm demo:paired-skill-evaluation
$stage4Python='D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $stage4Python) {
  & $stage4Python -m pytest (Resolve-Path tests/contracts/test_public_repository_surface.py) -q
} else {
  Write-Output 'local Python public contract unavailable; exact-main CI remains required'
}
git diff --check
```

Expected bearing set: 15 Vitest files, all five demos, Python public contract, typecheck, exact rc.7 closure, and no private imports. Use actual test counts in the handoff.

After tests, verify:

- fixture root contains 0 files / 0 bytes;
- worktree `.dsh-probe` contains 0 files / 0 bytes;
- no new `.venv`, clone, worktree, `node_modules`, Profile, probe, Artifact, or Champion file;
- `pnpm-lock.yaml` unchanged;
- no Provider, paid token, CNY, Docker, Alpha, or runtime-profile invocation;
- changed files are exactly the approved map.

### Step 5: Independent reviews and fixes

Request three independent read-only reviews of the final feature diff:

1. correctness/replay/failure semantics;
2. architecture/privacy/DSH boundary;
3. Ponytail/YAGNI and unnecessary surface.

Any Critical or Important finding must be fixed with the narrowest RED/GREEN test and re-reviewed. Minor findings may remain only with a written reason; prefer fixing small ambiguity. Do not respond to review by adding a framework.

### Step 6: Commit public closure and ordinary push

Commit only the Task 6 files:

```text
docs: publish paired Skill evaluation proof
```

Then confirm the complete feature history, clean status, and exact scope. Ordinary-push the feature branch once. Verify local HEAD, upstream tracking, and `git ls-remote` are the same SHA.

Stop and report:

- exact branch and SHA;
- commit sequence;
- actual changed-file list;
- all gates and counts;
- demo result and cost;
- review findings and fixes;
- storage/download audit;
- explicit statement that Task 7, Shadow, Promotion, and paid proof were not entered.

---

## Task 7: Mainline integration and exact-SHA CI — supervisor release required

Do not start this task until the supervisor independently checks Task 6 and sends an exact approved feature SHA.

In the dedicated main worktree:

1. prove main is clean and equals the last supervisor-known SHA;
2. prove approved feature local/upstream/`ls-remote` equality;
3. merge exactly once with `--no-ff` and message `merge: add paired Skill evaluation`;
4. prove merge tree equals approved feature tree exactly;
5. run merge `git diff --check` and the focused public contract only if its environment already exists; do not mechanically rerun the whole feature suite when tree equality is exact;
6. ordinary-push main once, never force;
7. locate the automatic GitHub Actions push run whose `head_sha` equals the merge SHA;
8. require Python and TypeScript jobs `completed/success`, including all Stage 4 focused tests and demo;
9. on failure, collect exact job logs to `D:\DevData\tianwen-public-audit\ci-<short-sha>`, classify one root cause, and stop—no blind rerun or widening;
10. on success, report exact merge SHA, parents, tree equality, run/job URLs, final local/tracking/remote equality, and clean worktrees.

No post-CI documentation commit is required. Do not create PR/tag/Release or enter Stage 5 during Task 7. Stage 5 starts only from a new canonical design based on the green Stage 4 main SHA.

## Definition of done

Stage 4 is done only when:

- a Ticket-scoped protocol can be durably frozen before Candidate creation and replay proves the order;
- old Candidates remain honestly retrospective;
- B and C run in separate ordinary DSH Agents with Agent-scoped temporary Skills;
- actual requests prove injection and material equality using only public rc.7 interfaces;
- independent Outcome/Evidence/subject receipts produce accurate three-value results;
- the scripted proof is explicitly efficacy-INCONCLUSIVE;
- Candidate and all ordinary routing remain unchanged;
- all three new events remain private under the unchanged eight-event whitelist;
- old Artifact/Dynamic/Python paths remain isolated;
- no second Runtime/store/scheduler exists;
- feature reviews have zero Critical/Important findings;
- exact main SHA CI is green.
