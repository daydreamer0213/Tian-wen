# Tianwen Goal-First Planning and Guidance Design

Date: 2026-08-30

Status: accepted product direction, frozen for implementation

## 1. Decision

Replace manual Task authoring as the default Tianwen product path with one
goal-first loop:

```text
user states a long Goal and optional context / success criteria
  -> Tianwen plans a short ordered future-Task suffix in one DSH Session
  -> Tianwen starts or resumes the current Task in its own DSH Session
  -> completed Task facts and user guidance return to the planner
  -> Tianwen replaces only unstarted future Tasks
  -> continue, wait for guidance, or complete
```

This stage fills the architecture gap owned by Tianwen: long-Goal planning and
next-Task selection. DSH remains the only Agent runtime, Session store, model
route, tool runtime, current execution Goal, and resume authority.

The existing authored `tianwen.long-goal.v1` product is complete and remains
supported. New goal-first records use a strict `tianwen.long-goal.v2` schema.
There is no implicit migration and no second source of truth.

## 2. Product problem

The current ordinary product correctly proves durable ordered Tasks, distinct
Task Sessions, restart reconstruction, and next-incomplete-Task selection. Its
creation surface nevertheless asks the user to provide every Task and the DSH
Goal round cap. That exposes an implementation slice as if it were the final
product.

The intended ownership is different:

- the user owns the top-level Goal, context, success criteria, permissions, and
  value choices;
- Tianwen owns the evolving future Task plan and next-Task selection;
- DSH owns each Task's execution and conversation.

`maxTaskRounds`, Task IDs, DSH Goal IDs, Session IDs, bindings, revisions, and
internal phases are not default user inputs.

## 3. User journey

### 3.1 Create and start

The default create form contains only:

- long Goal;
- optional context or constraints;
- optional success criteria;
- `Start progressing`.

A project workspace must already be selected in DSH. Tianwen freezes that
workspace into the v2 Goal. One action then:

1. persists the unplanned Goal;
2. creates or resumes its planner Session;
3. asks the configured ordinary DSH Agent to submit a short plan;
4. persists the plan through the typed planning tool;
5. creates and opens the first Task's ordinary DSH Goal/Session.

If planning does not submit a plan, the Goal and planner Session remain
recoverable. The product shows `Continue planning`; it does not retry
automatically or create a replacement Session.

### 3.2 Goal detail

The ordinary view shows:

- the Goal;
- current work;
- completed work;
- the planned next steps;
- `Continue progressing`;
- `Add information / adjust direction`.

Legacy v1 Goals remain visible as authored plans and retain their existing
actions. They are not silently converted into replannable v2 Goals.

### 3.3 User guidance

Goal-level guidance is appended durably before any model request. It is then
sent to the same planner Session. A successful planning turn may replace only
the unbound future Task suffix.

Guidance never edits the current Task's prompt, DSH Goal, Session, or history.
Task-specific conversation continues in the ordinary Task Session.

If a bound Task is active or paused, adding guidance may replan the future
suffix immediately, but `Continue progressing` still opens or resumes that
current Task. A failed guidance-driven planning Turn leaves the guidance
durable and the current Task runnable; it does not make the button repeatedly
invoke the planner.

### 3.4 Replanning after execution

Before Tianwen starts a new unbound Task, it compares the number of completed
bound Tasks with the completion count considered by the last plan. If new work
completed, the planner receives the current Goal facts and refreshes the
future suffix once. It may:

- submit one to five ordered next Tasks; or
- submit that no further Task is required, completing the long Goal.

There is no planning call while merely reopening or continuing an already
bound active/paused Task.

### 3.5 Blocked Task recovery

A blocked DSH Goal remains visible as an execution fact. The ordinary detail
offers two explicit paths:

- open the same DSH Session and use DSH's native Goal/conversation controls; or
- `Abandon this Task and replan`.

Abandonment is a user action, never a planner decision. It preserves the Task
objective, Goal ID, Session ID, history, and blocked reason, marks the bound
Task terminal for long-Goal ordering, and sets the future plan to
`needs-replan`. Tianwen never deletes or silently replaces the blocked Session.

## 4. DSH planner Session

Each v2 Goal owns one stable planner Session ID in the ordinary DSH Session
store. It is a control conversation, not a second Tianwen Session system and
not a DSH execution Goal.

The Session uses the user's configured DSH Agent preset and model. Tianwen adds
one Agent-scoped typed tool:

```text
submit_long_goal_plan({
  expectedGoalRevision,
  outcome: "continue" | "complete",
  tasks: [{ objective }]
})
```

For `continue`, one to five non-empty Tasks are required. For `complete`, Tasks
must be empty. Goal ID and workspace are fixed by the Agent scope; the model
cannot select them. The tool concludes the Turn after a successful commit.

The planner prompt contains only the product facts it needs:

- Goal, context, success criteria, and durable guidance;
- immutable started Tasks and their projected phases;
- the current unstarted Task suffix;
- the expected Goal revision;
- an instruction to plan only and submit through the typed tool.

The Agent may inspect the selected workspace using its ordinary DSH tools.
Existing DSH permissions remain authoritative. This stage does not create a
second permission framework or a Tianwen Agent loop.

Assistant prose and JSON are never parsed as planning authority. The tool
commits validated arguments during the live Turn because canonical tool values
are not reconstructed from cold Session history.

### 4.1 Stable creation and cold resume

The v2 Goal record is written before any DSH Session side effect. It contains a
preallocated planner Session ID, the canonical workspace root, and the planner
Agent preset selected by the entry adapter. Therefore Agent-scoped setup can
identify the Goal before the first Turn.

Planning resolves only that frozen Session ID:

1. if DSH proves the Session absent, create that exact ID with the recorded
   workspace and preset;
2. if it exists, verify its header uses the same workspace and preset, then
   resume the same identity;
3. install the scoped planning tool through the public Agent `create`/`resume`
   setup callback on both paths;
4. prompt one ordinary Turn, wait for idle, and flush the Session.

An ambiguous create outcome is never followed by a different Session ID. A
later invocation first queries the frozen ID: it resumes a matching Session or
creates that same ID only after DSH proves it absent. Header mismatch is an
integrity error.

Because the Goal record always precedes Session creation, record-create failure
cannot orphan a planner Session. Session-create failure leaves a valid
unplanned Goal which can retry creation of the same frozen identity.

## 5. Durable v2 record

```ts
interface LongGoalRecordV2 {
  schemaVersion: 'tianwen.long-goal.v2'
  id: string
  revision: number
  objective: string
  context: string | null
  successCriteria: string | null
  workspaceRoot: string
  maxTaskRounds: number
  planner: {
    sessionId: string
    agentPreset: string
    planRevision: number
    phase: 'unplanned' | 'ready' | 'needs-replan' | 'complete'
    consideredSettledTasks: number
  }
  guidance: readonly string[]
  createdAt: number
  updatedAt: number
  tasks: readonly LongGoalTaskRecordV2[]
}

interface LongGoalTaskRecordV2 {
  id: string
  objective: string
  execution: TaskExecutionBinding | null
  resolution: null | 'abandoned'
}
```

New records start with `revision=1`, `planRevision=0`, `phase=unplanned`, an
empty Task list, and an internally selected positive `maxTaskRounds` default of
`3`. The ordinary UI does not expose that execution parameter. Workspace paths
must be absolute, canonical, and non-root. V2 planner and Task admission always
use the recorded workspace; a later selected DSH workspace cannot override it.

V2 Task IDs are stable generated identities, not array ordinals. Replacing a
future Task creates a new identity rather than reusing an old ID for different
work.

The record does not copy DSH Session messages, Task phases, model events, or
tool output. Task phase remains a projection from the bound DSH Goal. Durable
guidance is intentionally a Tianwen-owned Goal fact even though the same user
message also appears in the planner Session conversation.

### 5.1 V1/V2 coexistence and projections

The file reader first inspects `schemaVersion` and dispatches to independent
exact-key v1 or v2 parsers. Directory list reads may contain both versions. One
invalid record still fails closed, but a valid v2 record is never passed to the
v1 parser.

V1 disk records, summaries, and `tianwen.long-goal-status.v1` projections stay
byte-for-byte compatible.

V2 uses strict `tianwen.long-goal-summary.v2` and
`tianwen.long-goal-status.v2` projections. Its Goal phase is derived as:

- `planning`: there is no bound active/paused/blocked current Task and either
  the planner is `unplanned`/`needs-replan`, or it is `ready` but the settled
  bound count exceeds `consideredSettledTasks`;
- `active`: a bound active/paused Task exists, or a ready unbound Task can be
  admitted;
- `blocked`: the current non-abandoned bound DSH Task is blocked;
- `complete`: planner phase is `complete`, Tasks contain no unbound suffix,
  and every bound Task is DSH-complete or explicitly abandoned.

An empty v2 Task list is therefore `planning` while unplanned and `complete`
only after a typed plan submission with outcome `complete`. It is never
implicitly completed by the v1 `no current Task` rule.

### 5.2 Exact v2 public projections

V2 list and detail responses use these exact shapes. They do not add fields to
the strict v1 projections.

```ts
interface LongGoalSummaryV2 {
  readonly schemaVersion: 'tianwen.long-goal-summary.v2'
  readonly id: string
  readonly objective: string
  readonly phase: 'planning' | 'active' | 'blocked' | 'complete'
  readonly revision: number
  readonly completedTasks: number
  readonly abandonedTasks: number
  readonly totalTasks: number
  readonly currentTaskId: string | null
  readonly updatedAt: number
}

interface LongGoalStatusProjectionV2 {
  readonly schemaVersion: 'tianwen.long-goal-status.v2'
  readonly goal: {
    readonly id: string
    readonly objective: string
    readonly context: string | null
    readonly successCriteria: string | null
    readonly phase: 'planning' | 'active' | 'blocked' | 'complete'
    readonly revision: number
    readonly completedTasks: number
    readonly abandonedTasks: number
    readonly totalTasks: number
  }
  readonly planner: {
    readonly sessionId: string
    readonly phase: 'unplanned' | 'ready' | 'needs-replan' | 'complete'
    readonly planRevision: number
  }
  readonly guidance: readonly string[]
  readonly tasks: readonly {
    readonly id: string
    readonly objective: string
    readonly phase:
      | 'pending' | 'active' | 'paused' | 'blocked' | 'complete' | 'abandoned'
    readonly execution: TaskExecutionBinding | null
    readonly resolution: null | 'abandoned'
    readonly blockedReason?: { readonly code: string; readonly message: string }
  }[]
  readonly currentTaskId: string | null
  readonly runtime: {
    readonly activation: 'not-loaded'
    readonly modelRequests: 0
    readonly readOnly: true
  }
}
```

All successful v2 mutations return the new authoritative status, including its
new `goal.revision`, in one of these exact results:

```ts
interface GoalFirstProgressResultV2 {
  readonly schemaVersion: 'tianwen.goal-first-progress-result.v2'
  readonly action:
    | 'planning-pending' | 'started' | 'continued'
    | 'already-running' | 'blocked' | 'complete'
  readonly status: LongGoalStatusProjectionV2
  readonly sessionId: string | null
}

interface LongGoalGuidanceResultV2 {
  readonly schemaVersion: 'tianwen.long-goal-guidance-result.v2'
  readonly planning: 'updated' | 'pending'
  readonly status: LongGoalStatusProjectionV2
}

interface LongGoalAbandonResultV2 {
  readonly schemaVersion: 'tianwen.long-goal-abandon-result.v2'
  readonly action: 'abandoned'
  readonly status: LongGoalStatusProjectionV2
}
```

`create goal-first plan` and `continue progress` both return
`GoalFirstProgressResultV2`; `add guidance` and `abandon current Task` return
their named result. Planner Provider failure or a Turn without a valid tool
submission is a recoverable `planning-pending` / `planning: pending` success
result because the durable Goal or guidance write already succeeded.

Every v2 mutation of an existing Goal accepts `expectedRevision`; initial
creation does not. A mismatch performs no write and returns the exact RPC error
code `revision-conflict` with details `{ expectedRevision, currentRevision }`;
clients refresh status and do not retry automatically. Validation and
runtime/integrity errors remain distinct from this optimistic-concurrency
result.

## 6. Atomic update rules

Every guidance append, plan commit, and Task binding increments the v2 Goal
revision. Planning starts from one expected revision and re-reads the record at
commit time.

A plan commit must:

1. match the expected current Goal revision;
2. preserve the complete bound Task prefix byte-for-byte, including order,
   objective, Goal ID, Session ID, and resolution;
3. replace only Tasks whose execution is `null`;
4. assign new stable IDs to the new suffix;
5. increment Goal revision and plan revision;
6. set `consideredSettledTasks` to the current DSH-complete plus explicitly
   abandoned bound count;
7. use the existing same-directory temporary write plus atomic rename.

If a Task binds while the planner is working, the stale plan is rejected. It
is not rebased, retried, or silently applied.

Abandonment is its own expected-revision update. It is allowed only for the
current bound blocked Task, sets `resolution=abandoned`, increments Goal
revision, and marks the planner `needs-replan`. It never clears the execution
binding.

The existing single-writer product boundary remains. This stage does not add a
database, event-sourcing layer, distributed lock, or general transaction
framework.

## 7. State transitions

```text
create v2 Goal
  -> unplanned

successful plan with Tasks
  -> ready

append guidance
  -> needs-replan

successful replan
  -> ready

start / resume bound current Task
  -> DSH owns active, paused, blocked, complete

new completed bound Task before next admission
  -> one planner Turn, then ready or complete

planner Turn ends without tool submission
  -> record remains unplanned / needs-replan; Session remains resumable

current bound Task is blocked
  -> open the same Session, or explicitly abandon and mark needs-replan

successful plan with outcome complete
  -> complete after every bound Task is complete or abandoned
```

`needs-replan` never stops or mutates an already bound Task. It only blocks
admission of an unbound future Task until planning succeeds.

The application service owns the following action table:

| Current facts | `Continue progressing` result |
| --- | --- |
| A bound current Task is active or paused | Open or resume that same Task Session. Do not invoke the planner, even if future guidance is waiting. |
| A bound current Task is blocked | Show the blocked Task and its two recovery actions. Do not invoke the planner or admit another Task. |
| Planner is complete and every bound Task is complete or abandoned | Return the completed Goal without another model call. |
| Planner is unplanned or needs replan, with no active/paused/blocked current Task | Run at most one planner Turn. On a successful `continue` submission, admit and open the first new Task in the same user action. On `complete`, finish. On failure or no submission, stop at `Continue planning`. |
| Planner is ready, a future Task is unbound, and no newly settled Task exists | Admit and open that Task without a planner call. |
| Planner is ready, but the settled bound count exceeds `consideredSettledTasks` | Run at most one planner Turn before admitting another Task, then follow the successful/failure behavior above. |

`Start progressing` is the create-time composition of exactly one planner Turn
and, if that Turn successfully submits `continue`, one Task admission. This is
one user action, not a loop across Tasks. `Add guidance` appends the message,
marks the planner `needs-replan`, and may run at most one planner Turn; it never
starts a Task. If current work is active, that Task remains the next
`Continue` target whether the guidance Turn succeeds or fails.

## 8. Product interfaces and service boundary

The Runtime host keeps `list`, `status`, and `run-current-task` and adds a
strict v2 create/guidance path. Existing v1 payloads remain exact and valid;
v1 and v2 fields cannot be mixed.

Recommended public operations:

```text
create goal-first plan(objective, context?, successCriteria?, workspaceRoot)
add guidance(longGoalId, expectedRevision, text)
continue progress(longGoalId, expectedRevision)
abandon current Task(longGoalId, expectedRevision)
```

`continue progress` performs only the next required product transition:

- plan/replan when required;
- start an unbound current Task after a valid plan;
- resume/open an existing bound Task;
- no-op for a complete Goal.

The same application service backs:

- the DSH Web contribution used by ordinary `dsh web` and Tianwen Desktop; and
- installed CLI commands for headless DSH users.

The application service, rather than either UI adapter, owns the action table,
record updates, planner lifecycle, and Task admission. Its already-resolved
inputs are the canonical workspace, planner preset, Goal fields, expected
revision, and user action. Its injected runtime dependencies are the record
store plus the public DSH operations for Session lookup, planner
create/resume/setup/prompt/flush, and Task Goal/Session create/resume/status.

For Web/Desktop, the host resolves the selected ordinary DSH Session to its
canonical workspace and configured Agent preset before calling the service;
browser input cannot author a filesystem path or later replace that workspace.
For CLI, the adapter validates and canonicalizes the explicit target/current
workspace and selects the configured preset before calling the same service.
Both adapters render the service result and DSH navigation target; neither
duplicates transition logic.

The existing authored CLI form with repeated `--task` continues to create v1.
The new goal-first CLI form omits `--task`, accepts optional context/success
criteria, and uses the same v2 service. A guidance command appends guidance and
invokes one planner Turn.

## 9. Failure semantics

- Goal creation persists before the first model request.
- Planner Session identity is stored before its first Turn so scoped tool setup
  works on initial create and cold resume.
- A missing planner Session is recreated only with the frozen ID after DSH
  proves that identity absent. It is never replaced with a different ID.
- An ambiguous Session-create outcome is resolved by querying the frozen ID.
  A matching Session is resumed; a new create is attempted only when absence
  is proven.
- Planner create and cold resume both verify the Session header workspace and
  Agent preset, then install the scoped tool through the public setup callback.
  Header mismatch is reported and no Turn runs.
- Every v2 Task Session is created in the record's frozen workspace. Cold
  resume verifies the DSH Session header uses that same workspace before
  opening or continuing it.
- Provider failure, timeout, or a Turn without tool submission leaves the Goal
  recoverable and does not forge Tasks.
- Guidance remains durable even when the following planner Turn fails.
- A revision conflict does not write and does not retry.
- A blocked Task remains a Task execution fact; it is not collapsed into a
  planning failure. Only the explicit abandon action may resolve it for Goal
  ordering, without deleting or rewriting the Task binding or DSH history.
- Unknown or invalid planner-tool calls do not update the Goal.
- V1 corruption rules and exact-key validation remain unchanged.

## 10. Deliberate non-goals

This stage does not add:

- a DAG, dependencies, parallel scheduling, priorities, dates, daemon, or
  background queue;
- a second Agent loop, Session store, chat UI, model router, or planner Goal;
- automatic retry, request/token/price budget, or new permission framework;
- continuous replanning after every message or tool call;
- rewriting the objective, binding, or history of a bound Task; the only new
  terminal annotation is explicit user-selected abandonment of the current
  blocked Task;
- automatic modification of the top-level Goal or success criteria;
- v1 migration, sidecar records, a generic schema migration framework, or a
  plan event ledger;
- Candidate, Evaluation, controlled Activity, or learning-promotion work;
- a complex Task graph editor or default display of internal IDs and rounds.

## 11. Verification

Implementation uses deterministic planner doubles first. Required product
evidence is:

1. exact v1 read/list/status/run behavior remains unchanged;
2. a mixed v1/v2 directory reads correctly, exact v2 creation and cold
   reconstruction succeed, and an empty unplanned v2 Goal is never projected
   complete;
3. scoped typed-tool plan submission without parsing assistant text;
4. plan commit preserves the bound prefix and replaces only the future suffix;
5. stale revision, concurrent Task binding, missing submission, and Provider
   failure perform no forged write or retry;
6. guidance persists before planning and survives a failed Turn;
7. every branch of the action table is deterministic, including active work
   with pending guidance, blocked recovery, complete outcome, and the
   create-time plan-plus-admission composition;
8. planner create/cold-resume recovery keeps one Session identity, reinstalls
   the scoped tool, rejects header mismatch, and freezes the workspace for all
   later planner and Task Sessions;
9. explicit abandonment preserves the blocked Task binding/history and causes
   one future replan;
10. after a Task completes, one planning Turn precedes the next Task admission;
11. Web/Desktop default create flow contains no manual Task or round input and
    reuses the same DSH Session navigation;
12. installed headless CLI reaches the same platform-independent v2 service;
13. focused gates, normal repository gate, artifact audit, and exact-main CI.

After deterministic integration passes, run one ordinary installed-product
Goal-first smoke with the configured Provider. It is product-path evidence, not
a controlled Activity, repeated natural-task benchmark, learning claim, or
Provider billing measurement. Do not rerun it to select a better plan.
