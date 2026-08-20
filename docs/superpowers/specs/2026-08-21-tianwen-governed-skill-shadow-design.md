# Tianwen Governed Skill Shadow Design

**Date:** 2026-08-21  
**Status:** Proposed Stage 5 design  
**Depends on:** Stage 4 paired Skill Evaluation on `main` at
`906f211572167e329c9564f5f75e63c49e2d1dec`

## 1. Decision

Stage 5 adds a narrow, deterministic **Shadow eligibility decision**. It does
not pretend that the repository currently has a Candidate that may receive
ordinary traffic.

The current Stage 4 product path can produce only zero-cost scripted mechanism
evidence. Its result is deliberately `INCONCLUSIVE`, its comparison is
`not-comparable`, its Policy fact is `unobservable`, and its workspace,
validator, and data bindings are `unbound`. Existing Stage 3 Candidates without
an earlier protocol are also retrospective. These facts mechanically make every
current Evaluation ineligible for real Shadow.

Therefore the Stage 5 implementation slice will:

1. add one pure `assessSkillShadowEligibility()` reducer;
2. prove every current ineligible path returns a closed, auditable refusal;
3. run one zero-cost demo that consumes the real Stage 4 scripted result and
   reports `no-eligible-shadow`;
4. prove that, after the Stage 4 fixture has produced its real result, invoking
   the Stage 5 reducer causes no additional Agent creation, Skill registration,
   Run routing, ledger write, Candidate mutation, or legacy Champion/Dynamic
   Cordis change;
5. document the future natural-Run Shadow state machine without implementing
   unreachable persistence, counters, or routing machinery now.

This is the smallest honest Stage 5 result. It preserves the evidence bar
instead of manufacturing five successes or turning a rehearsal into product
traffic.

## 2. Authority and product boundary

This design is subordinate to:

- `docs/tianwen-architecture-overview-v2.md`;
- `docs/superpowers/specs/2026-08-19-tianwen-runtime-boundary-reset-design.md`;
- `docs/superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md`;
- the Stage 3 governed Candidate design;
- the Stage 4 paired Evaluation design and its completed implementation.

DSH `0.1.0-rc.7` remains the only product Agent Runtime. DSH owns Agents,
Sessions, the Agent Loop, Providers, tools, permissions, Skill registration and
loading, and normal create/resume behavior. Tianwen owns only the cross-Run
eligibility decision and, in a later evidence-backed slice, immutable Shadow
governance facts.

Stage 5 must not:

- build an Agent Loop, Provider adapter, Session engine, Skill loader,
  scheduler, queue, worker, traffic splitter, permission system, or second
  database;
- register a Candidate in the root DSH Skill registry;
- install a Skill package or write a Profile/Preset;
- call the old `ArtifactVersion`, legacy Evaluation/Approval, Dynamic Cordis,
  global Champion, `promote()`, `rollback()`, or `champion.json` path;
- modify a completed or current Run;
- create an Active Pointer, Promotion record, or production rollback target;
- count an Evaluation arm, scripted fixture, replay, or isolated rehearsal as a
  natural Shadow success.

Python Alpha, RepoTaskRuntime, AlphaRuntime, the Python evaluator, and the old
paired-comparison path remain frozen research/regression assets.

## 3. Why real Shadow is unavailable now

Real Shadow requires all of the following facts at the same time:

1. the immutable Evaluation verdict is `PASS`;
2. comparison is `candidate-better`;
3. evidence class is `independent-objective`;
4. `baselineResolutionMatched` is true;
5. the protocol provenance is `pre-candidate`;
6. the complete Evaluation dependency check is still `fresh`.

The current product path cannot satisfy this conjunction:

- the service-owned Stage 4 `ScriptedAdapter` always represents mechanism
  evidence, not independent efficacy;
- scripted output is forced to `INCONCLUSIVE / not-comparable / needs-evidence`;
- the rc.7 slice cannot independently observe Policy authorization;
- workspace, validator, and data bindings are recorded as unbound;
- an Evaluation with any of those facts is stale for Shadow purposes.

A caller-supplied `eligible=true`, a manually edited JSON record, elapsed time,
or the user's silence may not override these facts. The 60 CNY development
budget also does not convert scripted or retrospective evidence into qualified
evidence. Paid proof requires a separate trustworthy producer, frozen budget
reservation/tally, and a naturally justified pre-Candidate Ticket; Stage 5 does
not invent those prerequisites.

## 4. Eligibility reducer

### 4.1 Input

The pure reducer consumes the existing immutable Stage 4 result plus the
already-derived Stage 4 freshness result. Its exported input type is expressed
as a `Pick<SkillEvaluationResult, ...>` intersection so the field types cannot
drift into a second Evaluation schema:

```ts
export type SkillShadowEligibilityInput = Pick<
  SkillEvaluationResult,
  | 'evaluationId'
  | 'verdict'
  | 'comparison'
  | 'decision'
  | 'evidenceClass'
  | 'baselineResolutionMatched'
  | 'protocolProvenance'
> & {
  readonly freshness: SkillEvaluationFreshness
}
```

This is a typed view, not a second Evaluation record. The authoritative values
remain in the existing immutable Evaluation result and plan. A future runtime
caller must obtain them from
`TianwenEvolutionService.getSkillEvaluation*()` and must derive `freshness` by
calling `assessSkillEvaluationFreshness()` with current facts. It may not accept
an eligibility boolean or freshness state from an untrusted request.

### 4.2 Output

```ts
export type SkillShadowIneligibilityReason =
  | 'evaluation-not-pass'
  | 'candidate-not-better'
  | 'evidence-not-independent-objective'
  | 'baseline-resolution-mismatch'
  | 'protocol-not-pre-candidate'
  | 'evaluation-decision-mismatch'
  | 'evaluation-stale'

export type SkillShadowEligibility =
  | {
      readonly decision: 'eligible-for-shadow'
      readonly evaluationId: SkillEvaluationId
      readonly reasons: readonly []
    }
  | {
      readonly decision: 'no-eligible-shadow'
      readonly evaluationId: SkillEvaluationId
      readonly reasons: readonly SkillShadowIneligibilityReason[]
      readonly freshnessReason?: SkillEvaluationFreshnessReason
    }
```

Reasons use a fixed enum and a fixed order. They contain no prompt, Skill body,
tool arguments/results, feedback note, user data, filesystem path, Provider
credential, or model output.

### 4.3 Decision rule

`eligible-for-shadow` is returned only when:

```text
verdict == PASS
AND comparison == candidate-better
AND evidenceClass == independent-objective
AND baselineResolutionMatched == true
AND protocolProvenance == pre-candidate
AND decision == eligible-for-shadow-review
AND freshness.state == fresh
```

Every failed term is reported. `decision` is checked even though Stage 4 derives
it from the other conclusion fields. The reducer is not an authorization
boundary and cannot authenticate a caller-created object; it only reduces facts
that the service has loaded from the ledger and parsed through the existing
Stage 4 contracts. A future real route must assemble those durable facts and the
freshness result inside the service rather than accepting this input shape from
an external request.

The reducer performs no I/O and never throws for an ordinary ineligible result.
Malformed shapes remain programmer/data-integrity errors and are rejected by
the existing TypeScript/ledger parsers before the reducer is called.

## 5. Current Stage 5 demo

The deterministic demo reuses the existing Stage 4 public mechanism proof. It
does not create another Evaluation engine or another Candidate fixture.

The Stage 4 demo summary currently omits fields that Stage 5 must consume. This
slice is explicitly allowed to extend that existing safe summary and its
contract with:

- the exact `evaluationId`;
- the recorded `baselineResolutionMatched` boolean;
- the `SkillEvaluationFreshness` derived inside the existing Stage 4 demo from
  its complete plan, result and current dependency facts.

No raw plan, Candidate payload, Session event, prompt, path, or credential is
added. The temporary ledger is still removed by the existing demo, and Stage 5
does not add a runtime service or a second receipt helper.

Flow:

```text
existing Stage 4 scripted paired evaluation
  -> immutable INCONCLUSIVE result summary
  -> Stage 4 freshness = stale/unbound
  -> assessSkillShadowEligibility()
  -> no-eligible-shadow
```

The combined demo output is one JSON object with:

- the Stage 4 evidence class, verdict, comparison, protocol provenance and
  baseline match fact;
- the complete fixed refusal reasons;
- `ordinaryRunsRouted: 0`;
- `qualifiedNaturalRuns: 0`;
- `candidateRegisteredForOrdinaryTraffic: false`;
- `activePointerChanged: false`;
- `legacyChampionChanged: false`;
- the existing Stage 4 Agent/Session/scripted-request counts, reported honestly;
- a Stage 5 incremental block showing zero additional Agents, Sessions, Runs,
  ledger events and registry mutations during reducer invocation;
- `network/providerRequests/paidTokens/cny/docker/userData: 0`.

The demo may say that the **eligibility mechanism** works. It must not say that
C is better, ready for Shadow, stable, promoted, or rollback-tested.

Because refusal is pure, it does not append a “Shadow rejected” ledger event.
The immutable Evaluation result already explains the refusal. Recording every
read-time refusal would add event noise without adding provenance.

## 6. No isolated execution duplicate

Stage 4 already proves, through the real DSH public surface, that an inert
Candidate can be registered only in an Evaluation Agent scope, verified there,
used by DSH, disposed, and kept out of the root registry and ordinary traffic.
Stage 5 does not repeat that implementation as a new `ShadowRunner`.

The Stage 5 demo is called an **eligibility rehearsal**, not a Shadow Run. It
only consumes the Stage 4 mechanism result and exercises the new reducer. It
creates no new Agent, Session, Run binding, Skill-use proof, Outcome, Candidate,
or persistence record beyond what the Stage 4 demo already creates in its
temporary fixture.

This avoids a dangerous “rehearsal mode” bypass that could otherwise register C
without satisfying the real Shadow entrance gate.

## 7. Future natural Shadow design (documented, not yet implemented)

When a trustworthy producer can create a still-fresh eligible Evaluation, a
later implementation may add the following state machine. This section fixes
the product semantics now; it does not authorize unreachable code or traffic.

### 7.1 Opening

A natural Shadow may open only from a durable eligible Evaluation. Immediately
before opening, Tianwen must:

- reload the Candidate, Evaluation plan/result, protocol, parent manifest, and
  current DSH Skill resolution;
- re-run the complete freshness assessment;
- confirm the Candidate target scope exactly matches the Shadow scope;
- confirm there is no other nonterminal Shadow for the same scope and parent;
- freeze C, comparison/future fallback B,
  DSH/runtime/model/tool/Policy/data/verifier digests, original Goal
  authorization and cumulative budget;
- remain single-process and single-writer.

If any check fails, no Shadow event or Agent is created.

### 7.2 Run routing

Only a new, ordinary DSH Run that naturally matches the exact scope may be
selected. Selection and the C/B relationship are frozen before its first Turn.
One Run uses C from create through every resume; it never hot-switches or falls
back to B inside that Run. B is the comparison baseline and the version used by
future Runs after Tianwen stops making new C assignments.

DSH still creates and resumes the Agent. C would be registered only in that
Agent's scope through the public setup seam. Setup only registers C in the
unpublished Agent context; it cannot perform the final winner check because no
public `Agent` handle exists there. After `agents.create()` returns, and before
the first followup/Turn, the caller uses `handle.agent` as the public Skill
lookup scope and verifies the exact C. On resume, DSH first loads the existing
persistent Session and setup re-registers the recorded C. After
`agents.resume()` returns, but before any new resumed drive/followup, the caller
performs the same handle-scoped verification. A mismatch causes immediate
`handle.dispose()` and no Agent drive. Resume must not call the first-Turn
binding logic or rewrite the assignment. Verification compares the Candidate
ID, payload digest and resolved provider/version, not merely the Skill name.
`AgentHandle.dispose()` removes the Agent-scoped C at the end of each live
handle; the persistent Session and immutable assignment remain so the same C
can be restored on a later resume. The root registry and Profile remain
unchanged, and resume never selects the latest Candidate or pointer.

Evaluation Runs, demos, fixtures, replays, manual probes, and tasks arranged
merely to fill the sample quota are never eligible natural Runs.

### 7.3 Observation and counting

A Run counts as one qualified success only if all are true:

- it started after Shadow opening and has a distinct `runId`;
- its existing durable Run binding matches the exact Shadow scope and normal
  acceptance contract;
- a future internal `shadow-run-assignment` fact was written before the first
  Turn and freezes selected C, comparison/future fallback B, the authorization
  digest and budget;
- DSH Session evidence proves C was actually loaded/used;
- the normal Outcome is `met` under the pre-frozen acceptance contract;
- independent Evidence/validator receipts are complete;
- cost, latency and authorization remain inside the frozen limits;
- the Evaluation and Shadow dependencies are still fresh.

Replay of the same Run is idempotent and never increments the count. User
silence, model self-review, a scripted fixture, or a normal success that did not
exercise the modified capability does not count.

### 7.4 State machine

The future state is derived from append-only facts:

```text
observing (0..4 qualified natural successes) <-> paused
observing -> aborted
paused -> aborted
observing -> stability-evidence-ready
```

`aborted` and `stability-evidence-ready` are terminal within Stage 5.

`stability-evidence-ready` requires five distinct qualified natural successes
and no unresolved attributable regression. It is only evidence for Stage 6
review; it is not Promotion and does not change an Active Pointer.

One ordinary failure with unknown attribution pauses new C routing. A verified
unrelated failure may resume. One authorization breach, data corruption,
critical external write error, safety-rule failure, or unverifiable critical
behavior aborts immediately. Two attributable same-class ordinary failures,
success below B, cost/latency beyond budget, or reproducible legacy regression
also abort. Network/Provider failure is not automatically attributed to C.

Abort means “stop assigning C to later Shadow Runs.” C was never active, so
this is not product rollback. True Active Pointer rollback belongs to Stage 6.

### 7.5 Future persistence boundary

Only when natural Shadow becomes reachable should the existing
`EvolutionLedger` gain append-only internal Shadow events for opening, pre-Turn
Run assignment, observation, and pause/resume/abort disposition. State remains
derived; there is no second store, worker, scheduler, or mutable status row.

Those future events must:

- use deterministic IDs and canonical digests;
- validate event order and all referenced ledger facts during append/replay;
- treat exact replay as duplicate and conflicting replay as integrity failure;
- remain outside `PUBLIC_LEDGER_EVENT_TYPES` and runtime `listEvents()`;
- persist only IDs, digests, enums, bounded counters and safe reason codes;
- never persist prompt/user/feedback text, Skill bodies, tool payloads,
  credentials, cwd/path values, or copied Session history.

The current Stage 5 slice deliberately adds none of these events because no
valid opening can occur.

## 8. Stage 6 boundary

Stage 5 has no Active Pointer, pointer revision, Promotion, ApprovalReceipt,
product rollback record, or normal-route Champion.

Stage 6 may consider Promotion only after a real natural Shadow has produced
`stability-evidence-ready` and all dependencies are still fresh. It must define
a new scoped future-Run pointer and must not use the old global
Artifact/Dynamic Cordis Champion path. Current repository evidence will make the
Stage 6 entrance gate refuse; that refusal is the correct result until natural
evidence exists.

## 9. Privacy and public surface

No new ledger event is added in this slice, so the authoritative eight-event
public allowlist remains unchanged. The reducer's public output contains only
the Evaluation ID, fixed decision/reason enums, and an optional fixed freshness
reason.

The public TypeScript privacy contract must continue proving that every existing
internal learning/evaluation event is absent from exported `LedgerEvent`.
Runtime `listEvents()` continues deriving from the same allowlist.

## 10. Verification

The implementation must prove:

1. each of the six conclusion checks and the freshness check independently
   causes refusal;
2. multiple failed terms are returned in deterministic order;
3. the exact complete conjunction plus `fresh` is the only pure eligible case;
4. stale results preserve the exact Stage 4 freshness reason;
5. the existing Stage 4 demo safely exposes its exact Evaluation ID, baseline
   match and derived freshness, and that real scripted result returns
   `no-eligible-shadow`;
6. the demo reports zero routed/qualified Runs and zero external cost;
7. Stage 5 itself appends no event, and reducer invocation adds no Agent,
   Session, Candidate status, root Skill, ordinary routing, Dynamic Cordis
   inventory, Artifact file or legacy Champion change beyond the already
   completed Stage 4 fixture baseline;
8. Stage 1–4 tests, old Dynamic regression tests, DSH rc.7 closure,
   no-private-import gate, typecheck and public repository contract remain
   green;
9. the demo output contains no raw Skill body, prompt, user/tool content,
   filesystem path, URL, Provider credential, or user data.

## 11. Stop conditions

Stop without routing C when:

- no durable Evaluation result exists;
- any eligibility term fails;
- freshness is stale or cannot be established;
- required provenance or independent Evidence is absent;
- scope, authorization, budget, parent or Candidate is mismatched;
- entering Shadow would require a new Runtime, old Dynamic/Artifact path,
  unapproved external action, or fabricated evidence.

These are legal product outcomes, not implementation failures. The next honest
entry to real Shadow is a naturally justified, pre-protocol Candidate with a
trustworthy independent Evaluation producer—not a retry loop or a looser gate.
