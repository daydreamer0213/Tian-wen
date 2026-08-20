# Tianwen Governed Skill Promotion Readiness Design

**Date:** 2026-08-21
**Status:** Proposed Stage 6 design
**Depends on:** Stage 5 Shadow eligibility on `main` at
`90533433fc29d903b2142f61d5f32d64c7c3d762`

## 1. Decision

Stage 6 adds one narrow, deterministic **Promotion readiness refusal**. It does
not create a product Active Pointer and it does not pretend that the current
repository has completed natural Shadow evidence.

The durable facts on `main` stop before real Shadow:

- the Stage 4 result is `INCONCLUSIVE`, `not-comparable`, and
  `scripted-mechanism`;
- its dependency assessment is stale because Policy authorization is
  unobservable and external bindings are unbound;
- Stage 5 therefore returns `no-eligible-shadow`;
- no natural Shadow was opened;
- no Candidate was assigned to an ordinary future Run;
- there are zero qualified natural Shadow successes, not the required five;
- no scoped Active Pointer or exact Promotion approval exists.

Therefore the current Stage 6 implementation slice will:

1. add one pure `assessSkillPromotionReadiness()` reducer;
2. refuse immediately when the real Stage 5 result is ineligible;
3. refuse an otherwise eligible Stage 5 receipt because no durable natural
   Shadow stability evidence exists in the current product;
4. run one zero-cost demo that consumes the real Stage 5 safe summary and
   reports `no-promotion-readiness`;
5. prove that Stage 6 adds no Agent, Session, Run, Candidate registration,
   ledger event, pointer, Promotion, rollback, or legacy Dynamic/Champion
   change;
6. document the future scoped pointer, Promotion, and rollback semantics
   without implementing unreachable state or routing machinery now.

This is an explicit firewall between “a Candidate exists” and “future ordinary
Runs may use it.” It completes the honest Stage 6 readiness slice; it does not
claim that Promotion itself is implemented or authorized.

## 2. Authority and product boundary

This design is subordinate to:

- `docs/tianwen-architecture-overview-v2.md`;
- `docs/superpowers/specs/2026-08-19-tianwen-runtime-boundary-reset-design.md`;
- `docs/superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md`;
- the Stage 3 governed Candidate design;
- the Stage 4 paired Evaluation design;
- the Stage 5 governed Shadow design and completed eligibility slice.

DSH `0.1.0-rc.7` remains the only product Agent Runtime. DSH owns Agents,
Sessions, the Agent Loop, Providers, tools, permissions, Skill registration and
loading, and normal create/resume behavior. Tianwen owns only cross-Run
governance facts and, in a later evidence-backed slice, selection of an
immutable scoped Skill version for future Runs.

Stage 6 must not:

- build an Agent Loop, Session engine, Provider wrapper, Skill loader, traffic
  router, scheduler, queue, worker, permission system, or second database;
- register or install Candidate C in the root DSH Skill registry;
- create a mutable pointer file or write `champion.json`;
- call the old `ArtifactVersion`, legacy Evaluation/Approval, Dynamic Cordis,
  global Champion, `promote()`, `rollback()`, or `rehydrateChampion()` path;
- reinterpret Stage 4 B as an existing global Champion;
- treat a scripted Evaluation, eligibility rehearsal, elapsed time, replay, or
  manually fabricated five-Run list as natural Shadow stability evidence;
- treat the user's 60 CNY development budget or broad implementation direction
  as the exact human Promotion approval required by the current transition
  policy;
- modify a completed or current Run.

Python Alpha, RepoTaskRuntime, AlphaRuntime, the Python evaluator, and old
Artifact/Dynamic activation remain frozen research and regression assets.

## 3. Why real Promotion is unavailable now

Real Promotion requires all of the following facts at the same time:

1. a durable Stage 4 Evaluation that is still fresh and has
   `PASS + candidate-better + independent-objective +
   baselineResolutionMatched + pre-candidate`;
2. a durable natural Shadow derived from that same Evaluation and scope;
3. `stability-evidence-ready`, derived from five distinct qualified future
   ordinary Runs that actually used C and passed independent acceptance;
4. no unresolved attributable regression or abort condition;
5. exact current DSH resolution of frozen baseline B;
6. fresh C/B/scope/Runtime/model/tool/Policy/data/verifier/Goal authorization
   and budget facts;
7. a current human Promotion ApprovalReceipt bound to the exact scope, B, C,
   Evaluation, Shadow, and dependency digests;
8. a single-process, single-writer Promotion critical section.

The current repository satisfies none of the Shadow-dependent terms. Stage 5
does not persist a Shadow opening, assignment, observation, disposition, or
stability record because no eligible Evaluation exists. There is therefore no
fact from which a scoped pointer can safely be bootstrapped or changed.

An `eligible-for-shadow` object created by a unit test proves only the first
pure rule shape. It cannot create the missing durable Shadow facts. A caller
boolean, an edited JSON file, a repeated demo, or five scripted Runs may not
override the missing provenance.

## 4. Current readiness reducer

### 4.1 Input

The pure reducer consumes the existing Stage 5 result directly:

```ts
export type SkillPromotionReadinessInput = SkillShadowEligibility
```

This is not a new persistent record and not an authorization boundary. The
current demo supplies the real Stage 5 safe result. A future product service
must reload every referenced Candidate, Evaluation, Shadow, Run, Evidence,
authorization, and pointer fact from the existing ledger/DSH sources and must
recompute freshness internally; it cannot trust this pure function or an
external request as permission to promote.

### 4.2 Output

```ts
export type SkillPromotionReadinessReason =
  | 'shadow-not-eligible'
  | 'shadow-stability-evidence-absent'

export interface SkillPromotionReadiness {
  readonly decision: 'no-promotion-readiness'
  readonly evaluationId: SkillEvaluationId
  readonly reasons: readonly SkillPromotionReadinessReason[]
}
```

The current reducer deliberately has no `ready` or `promoted` branch. The
repository has no durable natural Shadow fact that could make such a branch
truthful. When natural Shadow becomes reachable, the future Promotion design
must add a ledger-backed assessor rather than silently widening this read-only
receipt.

Reasons contain only fixed enums. The output contains no Candidate payload,
Skill body, prompt, user/feedback text, tool argument/result, Session history,
filesystem path, URL, Provider configuration, credential, or model output.

### 4.3 Decision rule

The reducer uses the earliest relevant failure only:

```text
if Stage 5 decision == no-eligible-shadow
  -> no-promotion-readiness / shadow-not-eligible

otherwise
  -> no-promotion-readiness / shadow-stability-evidence-absent
```

It does not mechanically append downstream failures such as missing pointer or
approval after Shadow is already ineligible. Those facts are not yet reachable,
and reporting them as simultaneous current validation failures would make a
simple refusal look like a partially opened Promotion transaction.

The function performs no I/O, does not mutate its input, and does not throw for
an ordinary refusal. Malformed shapes remain programmer/data-integrity errors
handled by existing TypeScript and ledger parsers before the function is used.

## 5. Current Stage 6 demo

The deterministic demo reuses the existing Stage 5 public mechanism proof. It
does not create another Evaluation, Candidate, Shadow fixture, or Runtime
service.

Flow:

```text
existing Stage 4 scripted paired Evaluation
  -> Stage 5 no-eligible-shadow
  -> assessSkillPromotionReadiness()
  -> no-promotion-readiness / shadow-not-eligible
```

The combined demo output is one JSON object with:

- the Stage 4 mechanism counts already reported by Stage 5;
- the exact Evaluation ID and Stage 5 eligibility decision/reasons;
- `promotion.decision: no-promotion-readiness`;
- `promotion.reasons: [shadow-not-eligible]`;
- `naturalShadowOpened: false`;
- `qualifiedNaturalRuns: 0`;
- `activePointerCreated: false`;
- `candidatePromoted: false`;
- `rollbackExecuted: false`;
- `legacyChampionChanged: false`;
- a Stage 6 incremental block showing zero additional Agents, Sessions, Runs,
  ledger events, registry mutations, pointers, Promotions, and rollbacks;
- `network/providerRequests/paidTokens/cny/docker/userData: 0`.

The demo may say that the **Promotion readiness firewall** works. It must not
say that C is better, stable, approved, promoted, active, or rollback-tested.

Because refusal is pure, it does not append a “Promotion rejected” event. The
Stage 4 result and Stage 5 receipt already explain why no transaction began.
Recording every read-time refusal would add event noise without provenance.

## 6. No current pointer or activation seam

The current slice imports no DSH Agent, Session, Skill registry, Runtime,
Dynamic Cordis, Artifact, ledger, or filesystem persistence API. It only calls
the Stage 5 demo and the pure reducer.

Stage 4 temporarily registers B/C in isolated Evaluation Agent scopes; Stage 5
then reduces the safe result. Stage 6 starts only after those facts exist and
adds pure computation. The composed output must report the earlier Stage 4
mechanism counts separately from Stage 5 and Stage 6 incremental zero blocks.

There is no “pending Promotion,” provisional pointer, rehearsal Champion, or
pointer bootstrap in this slice. Creating any of those before natural Shadow
would turn missing evidence into mutable product state.

## 7. Future scoped Promotion design (documented, not implemented)

This section fixes the product semantics for a later reachable implementation.
It does not authorize events, routing, or activation now.

### 7.1 Evidence-backed entrance

A future service may enter the Promotion critical section only after it reloads
and validates:

- immutable Candidate C and exact frozen parent B;
- the complete fresh Stage 4 plan/result/protocol and dependency facts;
- the same-scope natural Shadow and its append-only assignments,
  observations, dispositions, and `stability-evidence-ready` projection;
- five distinct qualified natural Run IDs with actual C Skill-use proof,
  independent Evidence, `met` Outcome, and authorization/budget bindings;
- absence of a pending failure, abort fact, stale dependency, or conflicting
  nonterminal transition;
- current DSH root resolution of B, including exact Skill name, version,
  payload digest, and provider;
- an exact, unexpired human Promotion ApprovalReceipt;
- the current scoped pointer revision, if a pointer already exists.

Any missing or changed fact refuses before append and before any future Run is
assigned C.

### 7.2 Scoped pointer bootstrap

Stage 4 B is a frozen parent baseline, not an old global Champion. The first
new pointer for `(targetScope, skillName)` may be bootstrapped only from the same
fresh B/C/Evaluation/Shadow chain immediately before a real Promotion.

The first real Promotion verifies that DSH still resolves exact B and embeds B
as `previousActiveVersion` and rollback target in that same Promotion event. It
does not first append a B-only pointer fact. If the Promotion does not commit,
no new pointer exists. It does not register a Skill, change a current Run, or
consult the old global `ChampionPointer`.

A future pointer identity is scoped and deterministic, for example:

```text
pointerId = sha256(schemaVersion + targetScope + skillName)
```

Its derived state contains only the active immutable version/digest/provider
and revision. It is not stored in a second JSON file or database.

### 7.3 Minimal future internal events

Only when the entrance gate is reachable should the existing
`EvolutionLedger` add these two internal events:

1. `skill-promotion-recorded`
   - one append combines Promotion record and logical pointer compare-and-set;
   - on first Promotion it requires pointer absence/revision 0, binds the
     verified DSH incumbent B as `previousActiveVersion`, and derives the new
     pointer directly as active C/revision 1;
   - on later Promotion it binds expected revision, exact
     `previousActiveVersion`, selected Candidate version, new revision,
     Candidate, Evaluation, Shadow, Approval, and freshness/authorization
     digests.
2. `skill-rollback-recorded`
   - one append combines rollback record and logical pointer compare-and-set;
   - restores the exact `previousActiveVersion` saved by the Promotion being
     rolled back for future Runs;
   - references existing real Signal/Evidence/Run facts and a fixed reason.

Each event must carry a schema version, a deterministic transition ID and a
canonical input digest. The ID is derived from immutable intent, not wall-clock
time:

- Promotion identity binds pointer ID, expected absence/revision, exact
  `previousActiveVersion`, selected Candidate version, Candidate, Evaluation,
  Shadow, Approval receipt and the verified DSH resolution digest;
- rollback identity binds pointer ID, expected revision, active Candidate
  version, exact saved `previousActiveVersion`, the causal Signal/Evidence set
  and fixed rollback reason.

Exact replay of the same ID and canonical input is a duplicate and never
increments the pointer revision. Reusing the same transition ID with different
canonical input is a ledger integrity conflict. A distinct transition ID whose
expected revision no longer matches is an ordinary stale/conflict refusal and
appends nothing. Replay revalidates event order, pointer scope, expected/new
revision, and every referenced
Candidate/Evaluation/Shadow/Approval or Signal/Evidence fact against the prior
ledger state; it does not trust a caller-provided derived pointer.

Promotion record and pointer change must not be two independent appends. A
single append avoids a crash window in which history says “promoted” while the
derived pointer still says B, or vice versa. Pointer state is derived by replay
from the same ledger; no `active-pointer.json` or `champion.json` is added.

Both future events remain outside `PUBLIC_LEDGER_EVENT_TYPES` and runtime
`listEvents()`. They persist only IDs, digests, enums, revisions, and bounded
counters—never Skill bodies, prompts, user/tool text, paths, credentials, or
copied Session history.

### 7.4 Single-process atomicity and stale checks

The first version is explicitly single-process and single-writer. Existing
ledger append/fsync/replay integrity is sufficient for one process but does not
provide a cross-process file lock or distributed transaction.

`formalWrite()` is not itself the asynchronous transition queue. The current
service has a separate single-Context `serialize()` queue, while
`formalWrite()` deliberately rejects when a transition is pending. A future
Promotion service must therefore use that queue semantics, or an equivalent
single-Context queue, around the complete asynchronous transition. It must not
call `formalWrite()` from inside the queued transition.

The queue serializes Tianwen transitions only. It does not lock the DSH Skill
registry and does not create a cross-system DSH/ledger transaction. The service
captures the complete DSH root resolution observation inside the queue and
immediately feeds its digest to the synchronous ledger commit. Any later DSH
resolution change makes the derived pointer stale for future selection and is
handled by the normal freshness gate; the design does not pretend the external
registry was locked.

Inside the queued boundary, the service reloads and re-checks:

- pointer expected revision and active version;
- current B resolution;
- Candidate/Evaluation/Shadow identity and freshness;
- exact ApprovalReceipt and authorization/budget validity;
- absence of a conflicting transition.

A future synchronous ledger method such as `commitSkillPromotion()` or
`commitSkillRollback()` then performs expected-revision/from-version CAS and
one event append in a single call. Normal formal writes remain blocked while
the transition queue is pending.

A mismatch returns stale/conflict and appends nothing. A commit-unknown outcome
sets the service to the existing fail-closed blocked state. Recovery performs a
fresh ledger replay and queries the deterministic transition ID: if the exact
event exists, it returns the already-committed receipt; if it does not exist,
the service may retry only after reloading and revalidating every current fact.
It never blindly repeats the append.

Multi-process CAS, file locks, a database transaction, distributed routing, and
multi-machine consensus are deferred. They must not be implied by a single
process test.

A future implementation must contract-test two concurrent same-scope attempts,
exact duplicate replay, conflicting replay, stale expected revision,
commit-unknown recovery by transition ID, first Promotion from pointer absence,
and the chain B→C→D followed by rollback D→C. None of those tests may call the
legacy Dynamic transition service.

### 7.5 Future-Run selection only

After a real Promotion, only a newly created matching Run may read the scoped
pointer and freeze C into its immutable Run assignment. An already-started or
resumed Run continues with the version recorded before its first Turn.

DSH remains responsible for Agent creation/resume and Skill loading. Tianwen
may use only the public Agent-scoped Skill registration seam already proven by
Stage 4/Stage 5 design:

1. select the immutable version before the new Run's first Turn;
2. register it in the unpublished Agent scope during public DSH setup;
3. after `agents.create()` or `agents.resume()` returns, verify exact scoped
   resolution through `handle.agent` before drive/followup;
4. dispose on mismatch without driving the Agent;
5. keep the same version for every resume of that Run;
6. dispose the live Agent scope without mutating the root registry or Profile.

Resume has an additional precondition. Before calling `agents.resume()`, the
host uses `resumeSessionId` to read the original Run binding and immutable Skill
assignment from the Tianwen ledger. That frozen assignment is captured into the
DSH setup closure so setup can register the same version before a handle exists.
After `agents.resume()` returns, the host performs the handle-scoped exact
verification described above before any drive/followup. A missing session→Run
binding, missing assignment, or mismatch disposes/fails closed and never drives
the Agent. Resume never consults the current Active Pointer.

The current service exposes Run-oriented getters but not the complete future
session-oriented assignment lookup. A later reachable implementation may add
one narrow read-only `getRunBindingBySession()` plus an assignment getter backed
by the same ledger maps. It must not add a second store, router, or Runtime.

Stage 6 does not build another loader or route through Dynamic Cordis.

## 8. Future rollback semantics

Rollback changes only later Run selection. A Run already started with C keeps
its frozen assignment and is not hot-switched to B.

For an immediate safety/authorization trigger, “no hot switch” does not mean
the unsafe Agent may keep driving. The host that owns the live handle uses the
existing DSH stop/dispose/Goal lifecycle to stop further drive. Tianwen's
safety-state preflight rejects a later resume. DSH permissions continue to
block unauthorized individual actions, but they are not reported as proof that
the Agent Loop stopped. Pointer rollback remains a separate future-Run
governance action and must not be reported as if it stopped the current Agent
by itself.

Immediate rollback conditions remain:

- authorization breach;
- data corruption or critical external erroneous write;
- safety-rule failure;
- critical behavior that cannot be verified.

Ordinary rollback conditions remain:

- two attributable same-class failures;
- success below B under the frozen metric;
- cost or latency beyond the Ticket budget;
- a reproducible regression in prior stable behavior.

Network or Provider failure is not automatically attributed to C.

Rollback must not create a second signal system. The causal failure first enters
the existing post-Run Outcome/Evidence/LearningSignal path. A future rollback
event references those durable IDs and verifies that they belong to a Run
assigned the currently active C. Free text may not be written directly into a
rollback request.

The rollback append restores the exact saved `previousActiveVersion` and
records the immutable cause. For example, after B→C and then C→D, rolling back
D restores C, not the original B. The rolled-back Candidate cannot be promoted
again unchanged; a new Candidate based on the then-current parent must repeat
Evaluation and natural Shadow.

## 9. Approval and budget boundary

The current governance policy retains an explicit human Promotion gate until
automatic permissions, real Shadow, and rollback have sufficient offline and
natural-task evidence. An implementation approval, test budget, or lack of user
objection to an internal detail is not a Promotion ApprovalReceipt.

DSH's rc.7 public Approval and permissions capability continues to govern
ordinary Run tool calls and actions. Its Approval request is bound to a live
Agent Turn and one tool action, so Stage 6 must not fabricate an Agent/tool call
to make it look like a cross-Run Promotion ApprovalReceipt.

The future Promotion gate accepts an externally authenticated human governance
receipt, or waits until DSH exposes a genuine cross-Run governance approval
primitive. Tianwen may retain only the stable receipt reference, authority
source, expiry/one-shot scope and governed transition digest needed to prove
which exact transition was approved. It must not build a second approval inbox,
UI, policy engine, or permission system. The legacy Tianwen `ApprovalRecord`
attached to executable Artifacts is not this receipt and remains outside the
product path.

The future receipt must bind at least:

- target scope and Skill name;
- exact B and C version/payload digests;
- Evaluation and Shadow IDs/digests;
- pointer expected revision;
- authorization and budget digests;
- approver/authority source and expiry or one-shot scope.

Promotion does not expand the Goal's resource, action, impact, cost, or
per-action confirmation limits. Future Runs continue to use normal DSH
permission checks. If a Candidate requires authority expansion, readiness
stops and requests that expansion as a separate user decision.

## 10. Privacy and public surface

No ledger event is added in the current slice, so the authoritative eight-event
public allowlist remains unchanged. The public output contains only an
Evaluation ID and fixed decision/reason enums plus zero/false counters in the
demo.

The public TypeScript privacy contract must continue proving that every existing
internal learning/evaluation event is absent from exported `LedgerEvent`.
Runtime `listEvents()` continues deriving from the same allowlist.

The future pointer/Promotion/rollback events described above are private by
default. Dedicated governed getters may later expose safe structured receipts,
but the raw internal events never enter public `listEvents()`.

## 11. Verification

The current implementation must prove:

1. a real `no-eligible-shadow` receipt returns only
   `shadow-not-eligible`;
2. a type-correct synthetic `eligible-for-shadow` receipt still returns only
   `shadow-stability-evidence-absent` and is never treated as evidence;
3. the reducer does not mutate either input;
4. the real Stage 5 demo result returns `no-promotion-readiness`;
5. the demo reports zero natural Shadow Runs, pointers, Promotions, rollbacks,
   external cost, and Stage 6 incremental Agent/Session/Run/ledger/registry
   changes;
6. output contains no raw Candidate/Skill/prompt/user/tool/model content,
   filesystem path, URL, Provider configuration, credential, or user data;
7. no new ledger event, runtime service, DSH registration, dependency, lockfile,
   store, worker, scheduler, or pointer file exists;
8. Stage 1–5 tests, old Dynamic regression tests, DSH rc.7 closure,
   no-private-import gate, typecheck, demos, and public repository contract
   remain green;
9. CI executes the new pure reducer contract and real refusal demo.

Synthetic positive-looking input in item 2 proves only that the second firewall
exists. It must not be reported as natural Shadow or Promotion evidence.

## 12. Stop conditions

Stop without creating or changing a pointer when:

- Stage 5 is not eligible;
- durable natural Shadow stability evidence is absent;
- fewer than five distinct qualified natural Runs exist;
- any Evaluation/Shadow/dependency fact is stale or cannot be reloaded;
- current B resolution differs from the frozen baseline;
- scope, authorization, budget, Candidate, or pointer revision mismatches;
- exact human Promotion approval is absent, expired, revoked, or for another
  scope/version;
- a Shadow failure/abort fact is unresolved;
- a write result is unknown;
- another process/writer could race the transition;
- proceeding would require the old Artifact/Dynamic/Champion path, a new
  Runtime/store, fabricated evidence, or unapproved external action.

These are correct governance outcomes, not reasons to loosen the gate. The next
honest entry to real Promotion is a naturally eligible Evaluation followed by
five qualified future Shadow Runs and an exact ApprovalReceipt—not a scripted
retry or a pointer created in advance.
