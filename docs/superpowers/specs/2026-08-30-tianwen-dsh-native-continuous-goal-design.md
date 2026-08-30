# Tianwen DSH-Native Continuous Goal Mode Design

Date: 2026-08-30

Status: accepted product direction, frozen for implementation

## 1. Decision

Tianwen's normal product surface becomes an invisible capability inside an
ordinary DSH conversation. A user starts long-running work by typing:

```text
/goal <long-term objective>
```

DSH remains the only chat UI. Tianwen keeps its existing durable Planner and
per-Task DSH Sessions internally, automatically replans after each settled Task,
and starts the next Task without requiring the user to operate a separate
Tianwen panel. The user can guide, pause, correct, resume, or inspect the Goal
from the same conversation using natural language. DSH's native stop control
also pauses the bound background Goal.

The existing Goal-first panel remains an advanced history and diagnostics
surface. Existing v1 and v2 Long Goals keep their explicit/manual behavior.
Only Goals created through the new `/goal` command opt into continuous mode.

## 2. Product problem

The current product has the durable Goal-first engine, a stable Planner
Session, isolated Task Sessions, result-aware replanning, restart recovery, and
an installed Web/Desktop implementation. Its normal interaction is still too
mechanical: the user must open a Tianwen entry and explicitly continue between
Task boundaries.

That interaction contradicts the intended mental model. The user should state
an outcome, continue talking in DSH, and intervene only when useful. Internal
Task counts, round limits, Session identities, and planner transitions are
implementation details.

## 3. User experience

### 3.1 Start

- DSH already ships a global `goal` command for one same-Session Goal. Tianwen
  registers an Agent-scoped `goal` definition, which DSH officially resolves as
  a shadow of the global definition for that Agent. There is no duplicate
  global registration or DSH patch.
- `/goal Build ...` uses the current conversation's canonical workspace and
  Agent preset, creates a continuous Long Goal, runs one Planner Turn, and
  starts the first Task when the Planner submits a valid plan.
- The command response confirms the Goal in the same chat. It does not open a
  Tianwen window or ask for Tasks, round counts, context fields, or plan
  confirmation.
- If the objective is empty, DSH shows command usage without creating state.
- If the workspace or Agent preset cannot be resolved safely, the command
  explains the exact missing prerequisite and performs no model request.

### 3.2 Continue

- A completed Task causes one result-aware Planner Turn and, when the returned
  plan has work, admission of the next Task.
- The existing DSH Goal Round Driver remains the only within-Task loop.
- `/goal`, `goal_control`, and ordinary Agent replies expose only key state:
  Goal started, current Task, direction updated, paused, blocked, or complete.
- Background transitions remain durable and available to `status`, but rc2 does
  not inject autonomous progress rows into an idle control conversation.
- Tool calls and internal Planner/Task chatter remain in their own Sessions and
  are available through advanced history rather than copied into the control
  chat.

### 3.3 Guide and correct

While a continuous Goal is bound to the current conversation, Tianwen registers
one small `goal_control` tool and a short named system-prompt section on that
ordinary DSH Agent. The registration happens immediately in the `/goal`
handler and is restored synchronously from DSH's public `agent/created` event
when the bound Session is resumed. It does not replace the user's Agent preset.
The tool actions are:

```ts
type GoalControlAction =
  | { readonly action: 'guide'; readonly text: string }
  | { readonly action: 'pause-and-replan'; readonly text: string; readonly resume: boolean }
  | { readonly action: 'pause' }
  | { readonly action: 'resume' }
  | { readonly action: 'status' }
```

The tool is scoped by the calling DSH Session. It never accepts a Long Goal ID,
workspace path, Task ID, or Session ID from model-authored arguments.

- Ordinary supplementary direction is persisted as Long Goal guidance and
  affects the next safe Planner boundary. It does not cancel a healthy Task.
- A message such as "先停一下，方向不对，改成……" atomically persists the
  correction and disables automatic progress first. Tianwen then safely
  cancels the current Task if one is active, preserves its Session/history,
  marks that v3 Task abandoned, and replans the unbound suffix from the durable
  Goal state. Historical v2 abandonment remains blocked-Task-only.
- If the user clearly asks to continue with the corrected direction, the tool
  sets `resume: true` and continuous progress resumes after replanning.
- If the user asks to wait, the Goal remains paused until a later natural
  language resume request.
- The Agent interprets natural language. Tianwen does not add a keyword parser,
  second classifier model, fixed phrase list, or separate control form.

The control tool's result is operational data, not permission for unrelated
external actions. Existing DSH and Agent permission boundaries continue to
apply to every Task.

### 3.4 Stop and resume

- DSH's native stop button keeps its existing visible-Turn cancellation.
- When the stopped conversation owns a running continuous Goal, a Host bridge
  also persists the Goal as paused and cancels the current internal Task Agent
  with the normal DSH user-cancel path.
- Pausing prevents automatic replanning or admission of a later Task.
- Resume uses the existing bound Task/Goal/Session when work is paused. It does
  not create a replacement Task or duplicate Session.
- After process restart, a paused Goal stays paused. A running Goal restores its
  control binding and continues from the recorded Planner/Task state without
  creating duplicate work.

## 4. Product ownership

DSH continues to own:

- the Web/Desktop chat, slash-command picker, composer, and stop button;
- ordinary Agent, Session, Goal, tool, persistence, and permission lifecycles;
- the Goal Round Driver inside one Task Session.

Tianwen owns only:

- `/goal` command registration and conversion to the existing Goal-first
  service call;
- the durable control-conversation binding and continuous/paused mode;
- the scoped `goal_control` tool and its narrow instruction;
- the complete-Task-to-existing-Continue bridge;
- command/tool feedback through the existing DSH conversation;
- reconciliation of a running continuous Goal after Host restart.

Tianwen does not own another window, chat transcript, general scheduler, Agent
runtime, model router, permission framework, or stop button.

The Agent-scoped command keeps a small compatible control grammar:

- `/goal` shows the continuous Goal status or start usage;
- `/goal <objective>` starts a continuous Goal;
- `/goal pause` and `/goal resume` call the same continuous control operations;
- `/goal edit <direction>` performs the same explicit redirection as
  `pause-and-replan` with `resume: true`.

Internal Planner and Task execution continues to use DSH's Goal service and
Goal Round Driver. Shadowing the human command does not replace or fork that
domain service.

## 5. Durable record

Strict v1 and v2 records remain unchanged. `/goal` creates a v3 record that is
the existing v2 Goal-first record plus one exact control block:

```ts
interface LongGoalRecordV3 {
  readonly schemaVersion: 'tianwen.long-goal.v3'
  // Existing v2 identity, objective, context, success criteria, workspace,
  // planner, guidance, timestamps, revision, maxTaskRounds, and Tasks.
  readonly control: {
    readonly sessionId: string
    readonly autoProgress: 'running' | 'paused'
  }
}
```

The control Session ID comes from the DSH command/tool invocation context, not
from browser or model-authored input. One control Session may own at most one
non-complete continuous Goal. A continuous Goal has exactly one control
Session.

V3 reuses the v2 planner, Task, guidance, binding, optimistic-revision, atomic
write, status projection, and result-aware replanning rules. Shared Goal-first
functions accept a structural `GoalFirstLongGoalRecord` covering v2 and v3;
only mode mutations require v3. The public Goal status adds a v3 projection
with the same Goal/Planner/Task fields and the exact control block. Existing v2
response shapes do not gain optional keys.

Mode changes are normal expected-revision updates:

- `running -> paused` increments the Long Goal revision;
- `paused -> running` increments the Long Goal revision;
- writing the same mode is idempotent and returns the current record;
- a revision conflict performs no write and is resolved by rereading current
  state, not by replaying a stale action blindly.

V3 adds one narrow redirection mutation. It appends guidance and changes
`autoProgress` to `paused` in one atomic revision. After DSH confirms the
current active Task is paused, Tianwen may set that Task's existing
`resolution` field to `abandoned`, preserving its Goal/Session binding and
history. This broader abandonment is legal only for an explicit user
redirection on v3; v2 keeps its current blocked-Task-only rule. If the Task
already completed before the serialized mutation begins, Tianwen keeps the
completion and replans from its result plus the new guidance.

No database, sidecar binding file, generic migration framework, event ledger,
or copied DSH messages are added.

## 6. Runtime flow

### 6.1 `/goal`

1. DSH invokes the native command handler with the current Agent and raw input.
2. Tianwen resolves the Agent's Session ID, workspace, and preset.
3. Tianwen rejects an empty objective or a second active binding for that
   control Session.
4. Tianwen persists the v3 record before the first Provider request.
5. The existing Goal-first service runs one Planner Turn and admits the first
   Task when possible.
6. The native command result reports the authoritative outcome in the control
   conversation without forging an assistant message.

### 6.2 Task completion

The constant Runtime Host listens to DSH's public `goal/changed` event and only
reacts to `operation === 'complete'`.

1. Match the exact Task `sessionId + goalId` to one running v3 Long Goal.
2. Serialize work by Long Goal ID and collapse duplicate complete events.
3. Wait for the Task Agent to become idle and flush its Session so the final
   assistant reply is durable.
4. Reread the latest Long Goal and stop if it is complete, blocked, paused, no
   longer matches the Task, or already considered that settled Task.
5. Call the existing `continueGoalFirstProgress()` with the current revision.
6. Let that service perform result-aware replanning and the next Task admission.
7. Leave the latest authoritative state available to the scoped `status` tool
   and existing advanced history.

Pause and block events never trigger automatic continuation. There is no
polling interval, auto-click, daemon, queue service, or second Agent loop.

### 6.3 User guidance and races

All continuous-mode mutations for one Long Goal share the same Host-side
serialization lane. Before each state transition, the lane rereads the durable
record and DSH Task status.

If guidance arrives while Task completion is being processed, the latest
durable guidance and mode win. A stale Planner commit is rejected by the
existing revision rule. The Host reevaluates the latest state once; it does not
blindly retry a Provider Turn or choose whichever completion happened first.

`pause-and-replan` runs inside that same lane: atomic guidance-plus-pause,
normal DSH user cancellation, v3 abandonment only after the Task is confirmed
paused, one Planner Turn, and an optional transition back to `running`. A
failure after the first write leaves the Goal safely paused with the user's
correction durable.

### 6.4 Host restart

At Runtime Host mount, Tianwen lists v3 Goals and rebuilds only its in-memory
indexes. Durable state remains the authority.

- `paused`: index the control binding and wait.
- `running` with an active Task: rely on DSH's existing Goal Round Driver.
- `running` with a newly settled Task or ready future Task: schedule one call
  through the same serialized Continue bridge.
- `blocked` or `complete`: do not start work. The next control conversation
  interaction reports that durable state.

Reconciliation is idempotent. It never replaces a recorded Planner, Task,
Goal, or Session identity.

## 7. Feedback and visibility

DSH rc2 publicly supports native command lifecycle output, normal tool results,
and client-side Conversation renderers. It does not yet expose a complete
public Host contract for registering and persisting a new ignorable Session
event type. Tianwen therefore does not invent a `tianwen/progress` event in this
stage.

- `/goal` returns the initial planning/admission state through DSH's command
  lifecycle.
- Natural control messages receive an ordinary Agent reply grounded in the
  `goal_control` result.
- `status` returns the current Goal phase, current Task objective/phase, and the
  next meaningful action without exposing internal IDs by default.
- Background Task transitions remain visible in existing advanced history and
  are reflected the next time the user talks to the control Agent.

Autonomous informational rows can be added later only after DSH provides a
public custom-event catalog and ignorable persistent writer. Tianwen must not
forge `assistant/message`, add client polling, or restore a separate panel as a
workaround.

## 8. Failure behavior

- Provider failure during initial planning leaves a persisted running Goal in
  planning state and reports that planning can be resumed.
- Provider failure during later replanning stops at the durable planning state;
  it is not silently retried.
- A redirection cancellation or planning failure leaves the v3 Goal paused with
  the correction and original Task Session preserved. Resume reevaluates the
  latest record rather than replaying a partially completed mutation.
- A blocked Task stops automatic progress and reports the existing DSH blocked
  reason. User guidance, opening the Task Session, or the existing abandon path
  remain the recovery options.
- Missing or mismatched control, Planner, Task, Goal, workspace, or preset
  identity is an integrity error and starts no new work.
- A custom Agent preset that deliberately replaces the complete system prompt
  may suppress Tianwen's short routing section. The `goal_control` tool remains
  scoped and available, but this configuration is reported as reduced natural-
  language routing rather than causing a second classifier or hidden fallback.
- Native user cancel is detected from the public control Session `turn/end`
  event only when the reason is `aborted -> user`; it is not treated as Task
  failure or Goal completion.
- Platform Provider quota remains authoritative. Tianwen adds no request,
  token, price, retry, or time budget.
- Internal event or Session counts are never described as Provider billing.

## 9. Compatibility and release boundary

- V1 authored Goals and v2 manual Goal-first Goals read and run unchanged.
- The existing Goal-first panel continues to list and inspect v1/v2/v3 Goals,
  but remains an advanced surface rather than the normal entry.
- CLI users without Desktop receive the same `/goal` behavior when they run a
  DSH client that exposes native commands. Tianwen depends on DSH Runtime, not
  Tianwen Desktop.
- Runtime and Desktop artifacts are versioned once after implementation; exact
  predecessor rules remain narrow rather than becoming a general updater.
- The architecture overview must state the actual Runtime/Desktop versions and
  the new normal entry.

## 10. Deliberate non-goals

This stage does not add:

- a new Tianwen window, composer, task board, or required sidebar entry;
- manual Task, round, budget, dependency, priority, or schedule fields;
- a DAG, parallel scheduler, background worker service, or distributed lock;
- a second Planner or control classifier model;
- keyword-based natural-language control;
- automatic retries, Provider spend inference, or Tianwen-side quota policy;
- a new learning, Case, Candidate, Skill, or controlled Activity claim;
- changes to DSH upstream or an external upstream push;
- automatic conversion of historical v1/v2 Goals to continuous mode.

## 11. Verification

Deterministic verification must prove:

1. existing v1/v2 parsing, projection, UI, and execution remain unchanged;
2. v3 exact parsing rejects missing/extra control fields and preserves v2
   planning, binding, guidance, and result-aware replanning behavior;
3. `/goal` uses the invoking Session's workspace/preset, persists before model
   work, starts once, and rejects empty or duplicate active bindings;
4. Task completion causes exactly one replan/next admission, while duplicate,
   pause, and block events cause no duplicate Task or Session;
5. a settled Task's final assistant result still reaches the next Planner Turn;
6. guidance waits for the safe boundary; correction persists before cancel;
   active redirection preserves then abandons the old Task binding;
   pause-and-wait remains paused; correction-and-continue resumes once;
7. native stop pauses both the control mode and current Task, and restart keeps
   it paused;
8. running restart reconciliation continues from the same identities and is
   idempotent;
9. `goal_control` derives identity from the calling Session and cannot target a
   model-supplied Goal, Task, Session, or workspace;
10. command/tool feedback uses native DSH lifecycle output, and no custom or
    forged assistant Session event is written;
11. Web/Desktop and CLI command discovery use DSH's existing slash-command UI;
12. the shipped ordinary Agent preset exposes the scoped control instruction
    and tool after both initial `/goal` and cold Agent recreation;
13. focused Runtime tests, TypeScript, artifact verification, installed-product
    Web/Desktop smoke, repository gates, and exact-main CI pass.

After deterministic and installed-product verification, run at most one useful
configured-Provider Goal through `/goal` to prove the continuous boundary in
the real product. It is a product-path check, not another benchmark or a source
of learning/billing claims, and it is not rerun to select a better answer.
