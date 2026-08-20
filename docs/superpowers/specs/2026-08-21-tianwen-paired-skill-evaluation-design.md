# Tianwen Stage 4: Paired Skill Evaluation Design

**Date:** 2026-08-21
**Status:** Proposed canonical Stage 4 design
**Prerequisite:** Stage 3 main merge `01879cb4d24290ac73fadd2ccb1184bc4e115e42` and exact-SHA CI run `32391248762` are green
**Scope:** one governed Skill Candidate, one frozen parent baseline, one immutable EvalProtocol, isolated paired DSH Runs, independent Evidence, and a three-value Evaluation result

## 1. Decision

Stage 4 adds one narrow product path:

```text
complete EvalProtocol frozen on an open Learning Ticket
→ Stage 3 records Skill Candidate C and its frozen parent Skill B
→ isolated, paired DSH evaluation Runs
→ independent Outcome and Evidence for each arm
→ PASS | FAIL | INCONCLUSIVE
+ candidate-better | baseline-better | tie | not-comparable
→ stop
```

DSH `0.1.0-rc.7` remains the only product Agent Runtime. DSH creates Agents and Sessions, runs the Agent Loop, injects the selected Skill through its public Skill surface, calls the model and tools, and owns normal permissions. Tianwen only freezes the comparison, binds the evaluation Runs, checks that the two arms were materially equal apart from the Skill version, consumes existing Outcome/Evidence, and appends the Evaluation facts to the existing evolution ledger.

Stage 4 does **not** register a Candidate for ordinary Runs, install a Skill package, create an Active Pointer, enter Shadow, approve or promote a Candidate, or change any current or future ordinary Run. A successful result is evidence for the later Stage 5 design, not a routing action.

The first zero-cost demonstration proves the evaluation machinery with `ScriptedAdapter`. Because scripted outputs are predetermined, that demonstration must end as `INCONCLUSIVE` for real efficacy even when all structural checks pass. It may not claim that C is truly better than B.

## 2. Authority and inherited invariants

This design is derived from, and does not replace:

1. `docs/tianwen-architecture-overview-v2.md`;
2. `docs/superpowers/specs/2026-08-19-tianwen-runtime-boundary-reset-design.md`;
3. `docs/superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md`;
4. `docs/superpowers/specs/2026-08-20-tianwen-governed-skill-candidate-design.md`;
5. the Stage 3 implementation and its exact mainline CI evidence.

The following constraints remain absolute:

- DSH is the sole product Agent Runtime.
- Tianwen must not build an Agent Loop, Provider adapter, Session engine, tool pipeline, permission system, Skill registry, loader, Job system, Workflow engine, scheduler, or second sandbox.
- Python Alpha, RepoTaskRuntime, AlphaRuntime, the Python evaluator, and old paired-comparison code remain frozen research and regression assets. Their useful semantics can inform contracts, but their execution path cannot become the Stage 4 product path.
- The old TypeScript `ArtifactVersion` / `EvaluationRecord` / `ApprovalRecord` / Dynamic Cordis / global Champion path remains frozen. Stage 4 cannot call `recordArtifact()`, old `recordEvaluation()`, `recordApproval()`, `promote()`, `rollback()`, `rehydrateChampion()`, or Dynamic Cordis `define/run/stop`.
- Evaluation cannot change a completed user result or a DSH Session. Evaluation failure, Evidence failure, Run failure, learning insufficiency, and Promotion rejection remain distinct facts.
- Candidate, parent Skill, protocol, environment, permissions, budget, inputs, data snapshots, verifier contract, and actual model/tool settings are frozen before the first evaluated Turn.
- Each B/C arm has a distinct Tianwen Run and DSH Session. Stage 1–3 Evidence explains why the Candidate exists; it is not evidence that the Candidate won the evaluation.
- No model, including the Candidate-generating model, may verify its own success. A user’s silence is never `PASS`.
- Only future Run governance may eventually use a promoted version. Stage 4 does not change any ordinary Run.

## 3. Why this path

### 3.1 Adopted: paired normal DSH Agents with Agent-scoped Skill registration

For every protocol case, Stage 4 creates two fresh DSH Agents and Sessions. Both use the same DSH host, Provider configuration, model settings, tools, permissions, exact input bytes and digest, data snapshot, budget, acceptance contract, and verifier. The only intended behavioral difference is the frozen Skill payload:

- baseline arm: the Candidate's exact frozen parent B;
- candidate arm: the immutable Stage 3 Candidate C.

Both payloads are temporarily registered inside the corresponding Agent scope using the public DSH Skill registry. They use the same Skill name and the same provider label frozen from the Stage 3 parent manifest. Agent disposal removes the temporary registration. Nothing is written to a Skill directory and no Candidate remains installed.

The user message uses DSH's public explicit Skill-invocation surface so the full selected Skill is deterministically present in the actual model request. Stage 4 observes the public DSH LLM stream/request seam and records only digests and sequence references. It never copies the raw prompt, Skill body, model answer, tool arguments, or tool result into the evolution ledger.

This is the smallest route that actually compares B and C while preserving one Runtime.

### 3.2 Rejected: reuse old Artifact/Evaluation/Approval/Champion records

The old TypeScript `EvaluationRecord` contains only an Artifact ID, receipt digest, and `met | not-met | inconclusive`. It cannot bind a Stage 3 Candidate, actual parent payload, four-case protocol, paired Runs, fairness facts, or actual DSH request settings. Worse, the old evaluation and approval records feed a Dynamic Cordis hot-activation path.

Mapping a new Candidate to an old Artifact ID would make an inert proposal accidentally eligible for `promote()`. Stage 4 therefore uses new Skill-evaluation IDs and internal events and never touches the old transition path.

### 3.3 Rejected: move the Python Alpha evaluator into the product path

The Python prototypes contain valuable contract ideas: sealed protocol binding, two isolated legs, strict receipts, three-value results, and comparison aggregation. They also own a Python StateStore, Alpha workspaces, Docker-oriented verification, and a historical Runtime shape. Calling them from the new TypeScript path would revive a second product Runtime.

Stage 4 copies no Python implementation and adds no Python bridge. Existing Python tests remain frozen regressions.

### 3.4 Rejected: DSH Job, Workflow, or Subagent as the evaluation container

DSH Job is an in-process background lifecycle registry, not a persistent B/C protocol. Workflow and Subagent add orchestration prompts, inherited state, or permission differences that become unwanted experimental variables. The smallest fair comparison is two ordinary, explicitly configured DSH Agents.

## 4. Terms and identity

### 4.1 Baseline B

Stage 4 deliberately calls B the **frozen parent baseline**, not the product Champion.

Stage 3 has no new scoped Active Pointer. The old global Champion pointer belongs to the forbidden Dynamic Cordis path. Therefore Stage 4 may only claim:

- B is the exact parent version from which C was created;
- B's full payload and resolved provider are reconstructable from the Stage 3 Case/Run manifest chain;
- immediately before opening the evaluation, DSH's public Skill registry resolves the same payload/version for that Skill name in the evaluation scope.

This establishes the actual incumbent baseline used by the evaluation without inventing an Active Pointer. Stage 5 must independently define Shadow eligibility and re-check the incumbent; Stage 6 will define the new scoped active-version pointer.

### 4.2 Candidate C

C is one immutable Stage 3 `GovernedSkillCandidate` with status `recorded`. Stage 4 reads it; it never mutates the Candidate or adds `evaluated`, `passed`, or `shadow` fields to it.

The Candidate must:

- exist in the same evolution ledger;
- reference B's exact `parentVersionId`;
- retain the same Skill name as B;
- remain within the Stage 3 pure-text `SkillRegistration` subset;
- have an unchanged canonical payload digest and Evidence references.

### 4.3 EvalProtocol

`EvalProtocol` is an immutable exam contract frozen on an existing open Learning Ticket. A changed case, input digest, verifier, metric, threshold, repeat rule, data snapshot, budget, model/tool contract, or acceptance rule creates a new `protocolId` and a new Evaluation.

The stronger governance rule is that the protocol event must precede the Case, Attribution, Lesson, and Candidate events derived from that Ticket. Stage 4 records this causal seam in the existing evolution ledger as `skill-eval-protocol-frozen`. Its provenance is derived from ledger order, never supplied by a caller:

- `pre-candidate`: no Case or downstream governed Skill record exists for the Ticket when the protocol is frozen;
- `retrospective`: a Case or downstream record already exists, or an existing Candidate has no earlier frozen protocol.

Only `pre-candidate` provenance can contribute to later Shadow eligibility. Existing Stage 3 Candidates without an earlier protocol remain legal retrospective screening subjects; Stage 4 does not rewrite their history or pretend a late protocol existed earlier. A fresh Stage 4 proof fixture may freeze the protocol on its open Ticket before invoking the unchanged Stage 3 Case/Lesson/Candidate path, making the seam mechanically provable without changing Candidate identity or status.

The first slice requires exactly four objective cases, one from each category:

1. `problem`: the original behavior that justified the Candidate;
2. `regression`: an important behavior B already performs;
3. `counterexample`: a context in which the new rule must not over-apply;
4. `safety`: authorization, data-integrity, or forbidden-side-effect behavior.

The schema may store more than four cases later, but it must never omit a category. Every case is a hard gate. Soft metrics are descriptive only and cannot override a failed hard gate.

Protocol case definitions have unique `caseId` values. Repetition does not invent a second case identity: execution rows are uniquely identified by `(caseId, attempt)`, where `attempt` is the bounded one-based index from the frozen repetition rule. Attempts are first reduced into their protocol case using that rule; the four category-level case results are then reduced into the Evaluation result.

The frozen protocol record embeds the complete normalized protocol, not only its ID. It includes the four ordered case definitions, hard-gate rules, arm order, repetition rule, soft metric names, thresholds, validator contracts, and derived provenance. `protocolId` is computed internally from that object and is never accepted as a caller-authored identity.

### 4.4 Evaluation verdict and comparison are different axes

The result stores both:

```ts
type SkillEvaluationVerdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE'

type SkillComparison =
  | 'candidate-better'
  | 'baseline-better'
  | 'tie'
  | 'not-comparable'
```

- `PASS`: every Candidate hard gate has reliable independent `met` Evidence and all fairness/integrity gates are complete.
- `FAIL`: at least one Candidate hard gate has reliable independent `not-met` Evidence.
- `INCONCLUSIVE`: either arm, verifier, Evidence projection, frozen environment, or fairness proof is incomplete or unreliable.

Comparison is calculated only when both arms are determinate and fair:

- B `not-met`, C `met` on at least one case and C is never worse: `candidate-better`;
- B `met`, C `not-met` on any case: `baseline-better`;
- all determinate arm outcomes match: `tie`;
- otherwise: `not-comparable`.

`PASS` alone does not imply later Shadow eligibility. Stage 5 may consider only `PASS + candidate-better` with a still-current baseline and an evidence class permitted by its own design. `PASS + tie` retains B. `FAIL` and `INCONCLUSIVE` never enter Shadow.

## 5. Immutable records

Stage 4 adds only three new internal ledger events. It does not add a second store, mutable Evaluation row, arm store, queue, worker, or scheduler.

### 5.1 SkillEvalProtocolRecord

The first record freezes the exam on a Learning Ticket:

```ts
interface SkillEvalProtocolRecord {
  readonly schemaVersion: 'tianwen.skill-eval-protocol.v1'
  readonly protocolId: `eval-protocol:${string}`
  readonly ticketId: LearningTicketId
  readonly scopeKey: string
  readonly provenance: 'pre-candidate' | 'retrospective'
  readonly protocol: SkillEvalProtocol
}
```

`freezeSkillEvalProtocol()` requires an existing open Ticket, derives one exact scope from that Ticket's Signals, and accepts only the complete canonical protocol. It validates all four case categories, bounded budgets, and exact scope equality before append. The first protocol frozen before any Case is the Ticket's sole `pre-candidate` protocol; another protocol on that Ticket is retrospective even if Candidate construction has not yet run. The same canonical record is an idempotent duplicate; a different protocol for the same `protocolId`, or an attempt to claim a different provenance, is rejected. The record contains only governed IDs, safe identifiers, and digests—never raw prompts, paths, workspace contents, Provider configuration, or credentials.

### 5.2 SkillEvaluationPlan

The second record is an immutable plan:

```ts
interface SkillEvaluationPlan {
  readonly schemaVersion: 'tianwen.skill-evaluation-plan.v1'
  readonly evaluationId: `evaluation:${string}`
  readonly protocolId: `eval-protocol:${string}`
  readonly candidateId: GovernedSkillCandidateId
  readonly parentVersionId: SkillVersionId
  readonly parentPayloadDigest: Sha256Digest
  readonly candidatePayloadDigest: Sha256Digest
  readonly scopeKey: string
  readonly protocolProvenance: SkillEvalProtocolRecord['provenance']
  readonly environment: SkillEvaluationEnvironment
  readonly cases: readonly SkillEvaluationCasePlan[]
}
```

The plan references the immutable protocol record and repeats only the planned arm matrix and frozen execution environment. Opening validates that the Candidate descends from the record's Ticket and scope. Callers cannot submit provenance, an `evidenceClass`, or an embedded replacement protocol.

`SkillEvaluationEnvironment` freezes at least:

- DSH Runtime exact version;
- actual Provider and model safe identifiers, never Provider configuration or credentials;
- reasoning effort, temperature, maximum tokens, stop conditions, and any other behavior-affecting model setting;
- model-facing tool names and schema digest;
- permission/Policy digest;
- total and per-arm model request, token, tool-call, time, and CNY limits;
- workspace snapshot digest and per-case data-snapshot digest, never cwd, an absolute path, or workspace content;
- validator/acceptance contract digest;
- requested arm order for every case;
- critical external fact/data versions when applicable.

Category, arm order, reducer, metric, validator, and reason identifiers are closed schema literal unions rather than arbitrary strings. Provider/model safe identifiers are runtime-observed, normalized, bounded strings with no control characters, credentials, URL/query material, or absolute-path form. A deterministic-execution capability may come only from a trusted configured adapter capability plus its digest; the Evaluation caller cannot declare one. If that capability cannot be mechanically verified, evidence is conservatively no stronger than `objective-screening`.

`SkillEvaluationCasePlan` contains only governed references and digests:

```ts
interface SkillEvaluationCasePlan {
  readonly caseId: `eval-case:${string}`
  readonly category: 'problem' | 'regression' | 'counterexample' | 'safety'
  readonly attempt: number
  readonly inputDigest: Sha256Digest
  readonly dataSnapshotDigest: Sha256Digest
  readonly acceptanceContract: RunAcceptanceContract
  readonly baseline: SkillEvaluationArmPlan
  readonly candidate: SkillEvaluationArmPlan
}

interface SkillEvaluationArmPlan {
  readonly role: 'baseline' | 'candidate'
  readonly runId: TianwenRunId
  readonly sessionId: string
}
```

Each `(caseId, attempt)` row has exactly one B arm and one C arm with different Run and Session IDs. Inputs, tools, permissions, data, budgets, and validators are case-equal. Only `role`, Run/Session identity, and Skill version may differ.

The ledger stores only `inputDigest` and snapshot digests, not an `inputRef`, cwd, absolute path, raw case prompt, workspace content, or user content. The actual input bytes remain in the DSH Session or a private fixture source. A caller supplies those bytes at execution time and must match `inputDigest`. Provider/model fields are safe identifiers only; Provider configuration and credentials are never accepted by the plan schema.

### 5.3 SkillEvaluationResult

The third record is one immutable aggregate result:

```ts
interface SkillEvaluationResult {
  readonly schemaVersion: 'tianwen.skill-evaluation-result.v1'
  readonly evaluationId: `evaluation:${string}`
  readonly protocolId: `eval-protocol:${string}`
  readonly candidateId: GovernedSkillCandidateId
  readonly parentVersionId: SkillVersionId
  readonly verdict: SkillEvaluationVerdict
  readonly comparison: SkillComparison
  readonly decision:
    | 'eligible-for-shadow-review'
    | 'retain-baseline'
    | 'candidate-hard-gate-failed'
    | 'needs-evidence'
  readonly reasonCodes: readonly SkillEvaluationReasonCode[]
  readonly cases: readonly SkillEvaluationCaseResult[]
  readonly baselineResolutionMatched: boolean
  readonly evidenceClass:
    | 'scripted-mechanism'
    | 'objective-screening'
    | 'independent-objective'
  readonly protocolProvenance: SkillEvaluationPlan['protocolProvenance']
}
```

`evidenceClass` is derived by the runtime/service from the actual DSH adapter/route, request provenance, validator provenance, protocol repetition/determinism, and subject binding. It is never accepted from the caller. `ScriptedAdapter`/`tianwen-probe` is always `scripted-mechanism`. A non-deterministic Provider with one B/C sample is at most `objective-screening`. `independent-objective` requires either a documented deterministic execution contract or the protocol's bounded repetitions and aggregation rule to be fully satisfied.

Each `SkillEvaluationCaseResult` records, for both arms:

- Run ID and Session ID from the plan;
- actual frozen Skill version and content digest;
- actual model/tool/permission/input/data/budget manifest digest;
- full and Skill-neutral normalized first-request digests;
- Skill-injection proof sequence/digest;
- Outcome verdict;
- Evidence IDs and independent validator receipt digest;
- `evaluatedSubjectDigest`, equal to the digest bound inside the validator receipt;
- minimal usage totals;
- a fixed reason code when the arm is inconclusive.

The `cases` array contains exactly one result for every planned `(caseId, attempt)` tuple and repeats that tuple and its category. The frozen repetition reducer first produces one category-level result per protocol case; only those four or more case-level results feed the aggregate verdict and comparison.

The full request, Skill body, input, answer, tool arguments, tool result, user text, Provider credential, and private feedback remain in DSH Session/private stores and are not copied into the evolution ledger.

### 5.4 Events and public privacy

The only new event discriminators are:

```text
skill-eval-protocol-frozen
skill-evaluation-opened
skill-evaluation-result-recorded
```

All three are internal. The single frozen public whitelist remains exactly the existing eight historical audit events. Stage 4 adds no public event discriminator and no second deny list. The public TypeScript privacy contract and runtime `listEvents()` must both continue to derive from that one whitelist.

Trusted governance getters may return immutable Evaluation records because they are explicit governance APIs. They must return defensive copies and still contain no raw Session or user content.

## 6. Deterministic identity and replay

`protocolId` is the SHA-256 identity of the Ticket ID, derived scope, and complete normalized EvalProtocol, including all four cases, their input/data/validator digests, repeat/order rules, hard gates, metrics, and thresholds. This makes the frozen protocol relation unambiguous even when two Tickets use byte-identical exam contents.

`evaluationId` is the SHA-256 identity of:

```text
candidateId
+ parentVersionId
+ protocolId
+ complete normalized environment manifest
+ ordered arm Run/Session identities
```

Opening the same exact plan returns `duplicate: true`. Reusing an Evaluation identity while changing any plan field is rejected. The plan requires `scopeKey === Candidate.targetScope === Case.scopeKey`; a mismatch is invalid rather than a broader-scope experiment.

Recording the same exact result returns `duplicate: true`. A second result with changed verdict, comparison, reason, arm evidence, usage, or baseline status is rejected.

Ledger restart replay validates facts the evolution ledger actually owns: schema, canonical identities, Ticket-derived scope, protocol-before-Case provenance, event order, Candidate/Case/Ticket/parent references, plan/result equality, and ledger-resident Run binding/Outcome references. A forged `pre-candidate` protocol event after a Case, or a second claimed pre-Candidate protocol for one Ticket, fails closed. Replay does not reach backwards into DSH Session, request, registry, or Evidence stores and does not copy those stores. The runtime/service validates external Session/request/Evidence/registry facts immediately before recording a result. If they are unavailable after restart, freshness is `INCONCLUSIVE`/stale; the ledger itself is not declared corrupt.

The result does not modify the plan or Candidate. A later protocol or dependency change produces a new plan/result and leaves the old history intact.

## 7. Opening an Evaluation

Protocol freezing is a separate governance operation that occurs while the Learning Ticket is open. It never starts an Agent or creates a Run. Evaluation opening later consumes that durable record after Stage 3 has produced a Candidate from the same Ticket.

The thin runtime adapter follows this order:

1. Read the Stage 3 Candidate, Lesson, Case, Ticket, complete parent manifest chain, and referenced frozen protocol from the existing evolution ledger.
2. Resolve the Skill name through DSH's public registry in the intended evaluation scope.
3. Normalize the resolved Skill with the same Stage 3 manifest algorithm and require exact `parentVersionId`, provider, payload, and content digest equality with B.
4. Require both B and C to retain `userInvocable=true` for the first `/name`-injection slice. A false value is unsupported before any plan/Run write; Stage 4 must not change the frozen invocation policy to make a Candidate testable.
5. Require the protocol Ticket and scope to equal the Candidate's Case chain, validate event order, and revalidate all four categories, unique protocol case IDs, unique `(caseId, attempt)` execution rows, fixed objective validators, complete repeat/order/metric/threshold fields, exact digests, bounded budgets, and absence of raw secret/user content. Provenance comes only from the durable protocol event.
6. Allocate different B/C Session and deterministic Run identities in memory without writing Run bindings.
7. Freeze the full environment and arm matrix and append `skill-evaluation-opened` through the existing `formalWrite()`/ledger path.
8. Record the ordinary Tianwen Run bindings named by the durable plan. If any binding fails, the plan remains an incomplete historical plan and no arm starts.
9. Only after the plan and every binding are durable may the first arm start.

Any Candidate/parent mismatch, pre-existing Turn, invalid protocol, missing category, duplicate Run/Session, budget overflow, unavailable verifier, or failed plan append stops before execution. No partial current Run is mutated.

## 8. Running paired DSH arms

### 8.1 Agent isolation

Every arm is a fresh ordinary DSH Agent/Session. The runtime uses public `ctx.agents.create()` and its Agent `setup` scope:

```text
create B Agent → register B in B Agent scope → run → dispose
create C Agent → register C in C Agent scope → run → dispose
```

Both registrations use the same Skill name and frozen provider label. Registering C at the root Context is forbidden because DSH's same-layer duplicate rule is first-wins and because root registration would leak into unrelated Runs. The exact executable sequence is:

```text
create Agent with no prompt
→ setup(agentCtx) registers the scoped B or C Skill
→ inspect actual scoped tool schemas and resolve proposed call config
→ require durable plan + Run binding
→ followup(the exact case user message containing /skill-name)
→ whenIdle()
→ consume Outcome/Evidence
→ finally AgentHandle.dispose()
```

Tests do not read a destroyed Agent scope. They await disposal, then prove the root registry and a fresh Agent resolve exactly the same ordinary Skills as before, with no Candidate residue.

### 8.2 Material equality

Before each first model request, the adapter freezes the resolved proposed DSH call configuration and visible tool schemas. `resolveCallConfig()` is only a preflight value and does not bind dispatch. At request time the adapter observes the actual deep-frozen DSH request through the public `llm/stream` waterfall and accepts it only when:

- `isAgentLoopRequest(request) === true`;
- `request.sessionId` equals the current arm's planned Session ID;
- `request.purpose === undefined` for the ordinary evaluated call;
- request count and order stay inside the frozen protocol/budget.

The adapter uses public `renderSkillContent(B | C)` to derive the expected complete injection text, then derives:

- a full first-request digest;
- the selected Skill body/content digest;
- a normalized first-request digest after structurally replacing every present selected-Skill-derived surface — the optional public source-tagged catalog entry and the one user-role message whose complete content exactly equals the expected rendered Skill text — plus arm/session-only identity with fixed markers.

For a case to be fair:

- B/C normalized first-request digests are equal;
- actual call configurations are equal to the preflight values and to each other under public `callConfigEquals()`;
- tool schema, permission, input, data, budget, acceptance, and validator digests match the plan and each other;
- both arms contain the expected Skill body and no other Candidate/parent body;
- both arms finish within the frozen budget;
- each arm produces its own Outcome, Evidence, and validator receipt.

The Skill-neutral normalization is structural, not a regular-expression rewrite over prompt text. It requires exactly one user-role message whose complete content is byte-equal to public `renderSkillContent()` for the selected B or C registration, and replaces that complete content. DSH legally omits a user-only Skill (`modelInvocable=false`, `userInvocable=true`) from the catalog, so the target entry is pair-optional: when both B/C requests contain exactly one target entry in the public source-tagged `kind: 'skill-catalog'` message, normalize both; when both omit it, preserve the remaining catalogs unchanged; asymmetric presence, duplicate target entries, or unequal non-target entries is `INCONCLUSIVE`. The adapter does not inspect or depend on an unexported `skill-invocation` source discriminator. Other catalog entries, message order, public source tags, framing, tools, and input remain byte-identical. Missing or multiple exact injection matches are also `INCONCLUSIVE`. Only the first model request is subject to equality comparison: later requests legitimately contain different model/tool behavior and are evaluation output, not frozen input. An inequality outside the selected Skill surfaces in the first request makes that case `INCONCLUSIVE`; it is not evidence that either Skill is better.

### 8.3 Independent verification

The model's final answer and self-assessment are never the verifier. The first objective slice uses an existing DSH tool result plus Tianwen Evidence/Outcome intake as the independent verdict source. Every arm derives `evaluatedSubjectDigest` from the actual frozen final artifact/result selected by the protocol. The validator receipt must carry the same subject digest. Missing subject binding or a mismatch is `inconclusive`, even when the tool reports success. A matching successful validator result is `met`; the protocol's exact stable failure code is `not-met`; missing result, infrastructure error, unrecognized failure, Evidence error, budget stop, or unverifiable external state is `inconclusive`.

Subjective evaluation is deferred until a design can bind actual user preference Evidence. A model judge may later provide a preflight signal but cannot create `PASS` by itself.

### 8.4 Order and unstable environments

Arm order and repetitions are frozen per case. The scripted mechanism slice executes one B and one C arm per case. A real Provider protocol without a documented deterministic seed/contract must use bounded repetitions and its frozen aggregation rule before it can become `independent-objective`; a single real B/C pair is only `objective-screening`. Changing repetition or order creates a new protocol. Stage 4 executes the small fixed matrix synchronously and does not build a general experiment scheduler.

## 9. Result reduction

Result construction is a pure deterministic reduction over the immutable plan and existing Run/Outcome/Evidence facts.

For each case:

1. integrity or fairness failure, or either arm `inconclusive` → case verdict `INCONCLUSIVE` and comparison `not-comparable`;
2. otherwise the Candidate hard-gate verdict depends only on C: C `met` passes that case, while C `not-met` makes the aggregate verdict `FAIL`;
3. independently, compare the two determinate arms: B `not-met` / C `met` → `candidate-better`; B `met` / C `not-met` → `baseline-better`; B and C both `met` or both `not-met` → `tie`.

Candidate hard-gate verdict and B/C comparison are deliberately separate. In particular, B and C both `not-met` means verdict `FAIL` and comparison `tie`, not `not-comparable`.

Aggregate precedence is:

```text
any reliable Candidate hard-gate failure → FAIL
else any inconclusive case/fairness fact → INCONCLUSIVE
else → PASS
```

Aggregate comparison is:

```text
any not-comparable → not-comparable
else any baseline-better → baseline-better
else at least one candidate-better → candidate-better
else all tie → tie
else → not-comparable
```

Decision is then derived, never supplied:

- `PASS + candidate-better + independent-objective + baselineResolutionMatched + mechanically proven pre-Candidate protocol` → `eligible-for-shadow-review`;
- `PASS + tie` → `retain-baseline`;
- `FAIL` → `candidate-hard-gate-failed`;
- all other states → `needs-evidence`.

An existing Stage 3 Candidate with no earlier protocol record is retrospective, so `eligible-for-shadow-review` is unreachable for that Candidate and the decision remains `needs-evidence` even if screening hard gates pass. A fresh proof chain may establish `pre-candidate` only by durably freezing the protocol before the unchanged Stage 3 Case/Candidate events; no caller flag or late rewrite can do so. `eligible-for-shadow-review` and `candidate-hard-gate-failed` are only immutable Evaluation conclusions. They do not change Candidate status, start Stage 5, invoke a Reject/Artifact transition, or change routing.

## 10. Scripted mechanism proof and paid validation

### 10.1 Zero-cost proof

The mandatory Stage 4 demo uses the existing `ScriptedAdapter`, no Provider, no network, no token, no CNY, no Docker, no persistent external database, and no user data.

It runs all four categories through eight real DSH Agents/Sessions and proves:

- protocol-before-Case/Candidate ordering in the same durable ledger;
- plan-before-Turn ordering;
- Agent-scoped B/C registration and disposal;
- actual DSH request capture and normalized equality;
- separate Outcome/Evidence for every arm;
- immutable plan/result, replay, restart, tamper rejection, and public privacy;
- ordinary Session and old Dynamic Cordis/Artifact/Champion state remain unchanged.

Because the adapter predetermines model outputs, the recorded result must be:

```text
verdict = INCONCLUSIVE
comparison = not-comparable
decision = needs-evidence
reason includes scripted-model-output
```

Unit tests may feed hand-constructed determinate arm facts into the pure reducer to prove all `PASS`, `FAIL`, `INCONCLUSIVE`, comparison, and decision branches, including the distinct `FAIL + tie` result when both arms reliably fail. Those tests are contracts, not real efficacy Evidence.

### 10.2 Optional real Provider proof

After all zero-cost gates pass, Stage 4 may run one bounded objective screening protocol with an already configured DSH Provider under the user's cumulative 60 CNY authorization. It must:

- use only synthetic/public fixture inputs and no user data;
- freeze an explicit per-evaluation and cumulative CNY/token/request cap before the first call;
- stop rather than retry blindly when Provider, credential, verifier, or external state is unavailable;
- use deterministic external validators, not model self-judgment;
- report exact cost and requests;
- never exceed the remaining cumulative authorization.

One B/C sample from a non-deterministic Provider is `objective-screening`, not Shadow-eligible proof. A protocol may be `independent-objective` only when its documented deterministic contract or bounded repetitions and aggregation rule are satisfied. An existing Stage 3 Candidate without an earlier protocol remains retrospective regardless of Provider quality. Provider absence or an inconclusive result does not invalidate the Stage 4 mechanism implementation. It does mean no Candidate has real Shadow-eligible evidence unless a fresh chain has both mechanically proven `pre-candidate` provenance and qualifying independent objective evidence; otherwise Stage 5 may only prove its machinery in an isolated rehearsal.

## 11. Stale and dependency changes

The Evaluation permanently records the actual B/C pair and protocol. It is never rewritten.

Before result recording, the adapter resolves B again through the DSH public Skill registry. If B no longer matches the plan, the result is `INCONCLUSIVE`, `baselineResolutionMatched=false`, and `needs-evidence`. This field means only that the actual DSH baseline resolution matched; it does not claim an Active Pointer exists.

After result recording, any affected parent Skill, Candidate, model/settings, tool schema, DSH Runtime, Policy/authorization, EvalProtocol, verifier, data snapshot, or critical external fact change makes the result stale for later Shadow/Promotion. Unrelated documentation or metadata changes do not.

Stage 5 must re-check those exact dependency digests. Stage 4 does not add a mutable stale flag; it exposes a pure `assessSkillEvaluationFreshness(currentDependencies, result)` decision so history remains append-only. A changed parent requires a newly composed Candidate and new Evaluation; old evidence remains audit history.

## 12. Failure, budget, and authorization semantics

The following are legal non-success results, not reasons to expand the system:

- no eligible Candidate or reconstructable parent → no Evaluation;
- protocol incomplete or changed → reject opening or create a new protocol;
- plan append fails → no arm starts;
- one arm fails to execute → `INCONCLUSIVE`;
- Evidence or verifier missing → `INCONCLUSIVE`;
- Candidate reliably fails a hard gate → `FAIL`;
- B and C tie → retain B;
- baseline changes → stale/`INCONCLUSIVE`;
- budget expires → stop and record `INCONCLUSIVE`/Deferred; never enlarge automatically;
- unavailable Provider → skip optional live proof, do not patch DSH;
- permission boundary blocks an actual action → preserve the structured refusal and do not relabel it as Candidate failure unless the frozen protocol explicitly tests that authorization behavior.

Evaluation cannot use an experiment label to send, publish, buy, delete, or perform another real external write outside the original authorization. The first slice's validators are zero-side-effect.

## 13. Minimal product surface

The first implementation should add one focused domain module and one thin runtime adapter, while continuing to use the existing ledger and runtime service.

Likely product files:

- `packages/tianwen-evolution/src/skill-evaluation.ts`;
- existing `ledger.ts`, `index.ts`, and `runtime-binding.ts` for three events, replay, getters, and formal writes;
- `packages/tianwen-runtime/src/skill-evaluation.ts` and its existing root export for DSH execution/adaptation.

Likely proof files:

- one pure domain/ledger test;
- one real DSH paired-runtime test;
- one deterministic demo and demo contract;
- minimal package script, CI append, bilingual public-boundary updates, and the existing Python public contract.

No new dependency is expected. If a DSH public type must be imported, add only a direct exact rc.7 package edge already present in the offline store. Missing cached packages are a stop condition, not permission to download a new framework.

## 14. Explicit deferrals

Stage 4 does not implement:

- Shadow routing or observations;
- Promotion, Reject transition, Rollback, or a scoped Active Pointer;
- Candidate installation, filesystem persistence, marketplace, provider, catalog, or loader;
- a generic experiment scheduler, queue, Job, Workflow, worker, repository, or database;
- subjective model judging as formal Evidence;
- broad statistical inference, confidence intervals, or candidate tournaments;
- external Skill packages, sidecars, scripts, assets, references, dependencies, or remote resources;
- Python/Alpha execution or Docker evaluation;
- UI, telemetry, SLA, multi-process write coordination, or distributed evaluation.

The next Stage 5 design may consume only a still-fresh `PASS + candidate-better` independent result for real Shadow. If only scripted mechanism evidence exists, Stage 5 must label any execution as an isolated rehearsal and may not claim the Candidate is ready for ordinary traffic.

## 15. Completion standard

Stage 4 is complete only when all of the following are true:

1. Stage 3 exact main and DSH rc.7 closure remain intact;
2. the parent baseline is reconstructed from the real Stage 3 manifest chain and freshly resolved through DSH;
3. the Candidate remains immutable and `recorded`;
4. an immutable Ticket-scoped protocol includes problem, regression, counterexample, and safety cases, and its pre-Candidate provenance is derived only from ledger order;
5. every case has separate B/C Run and Session identities;
6. all behavior-affecting conditions are frozen before the first evaluated Turn;
7. B and C run through normal DSH Agents with Agent-scoped temporary Skill registrations;
8. actual requests prove the selected Skill and material equality outside the Skill version;
9. each arm has independent Outcome, Evidence, and validator receipt;
10. the reducer accurately produces `PASS`, `FAIL`, and `INCONCLUSIVE` without compressing uncertainty;
11. verdict, comparison, and decision cannot be confused with one another;
12. Candidate tie keeps B and Candidate failure cannot affect B;
13. scripted output is explicitly `INCONCLUSIVE` for efficacy;
14. plan/result replay, duplicate handling, restart, tamper rejection, and dependency freshness are deterministic;
15. the three new events remain private under the single frozen eight-event public whitelist;
16. Sessions, ordinary Run selection, Candidate, old Artifact/Champion state, and Dynamic Cordis inventory are unchanged;
17. no second Runtime/store/scheduler is introduced;
18. zero-cost demo and exact main CI pass;
19. any optional paid proof stays within the remaining 60 CNY total budget and reports exact cost;
20. correctness, architecture/privacy, and Ponytail/YAGNI reviews contain no Critical or Important issue.

If a success gate appears to require reusing old Promotion, adding a Tianwen Agent Loop, reviving Python Alpha, installing the Candidate, or treating scripted/model self-output as independent Evidence, implementation must stop and return to this design rather than silently weaken the gate.
