# Tianwen Learn Loop Web Entry Design

Date: 2026-08-29

Status: approved product direction, frozen for implementation

## 1. Decision

Expose the ordinary Tianwen long-Goal and ordered-Task product in the existing
DSH Web UI.  The visible label is **Learn Loop**; existing `tianwen.*` schema,
service, package, CLI, Profile, and receipt names remain unchanged.

The same browser plugin must work in both entry points:

- a compatible user's ordinary `dsh web` Profile with Tianwen installed; and
- Tianwen Desktop, which already opens that same DSH Web Profile in a thin
  Electron window.

Desktop receives no separate business implementation, preload API, IPC
bridge, or private state.  Headless and CLI users keep the installed
`tianwen plan ...` and `tianwen task run ...` commands even when no Web or
Desktop package is active.

This stage makes the already implemented
`tianwen.long-goal.v1` product usable from the main graphical entry.  It does
not redesign the durable record, build a second scheduler, or repeat natural
task evaluation.

## 2. Repository facts this design builds on

The current product already provides:

- `tianwen plan create`, `tianwen plan status`, and `tianwen task run`;
- one long Goal containing authored, linearly ordered Tasks;
- a different DSH Goal and Session for each Task;
- restart-safe Task bindings and current-Task selection;
- installed DSH Web and a Tianwen Desktop thin shell which loads that Web UI;
- DSH's public client-module, slot, Connection RPC, Session, Goal, and projection
  contracts.

The relevant DSH Web contracts are public package surfaces in exact
`@deepseek-ai/dsh@0.1.1-rc.2`:

- a package can contribute `dsh.client` browser code;
- `sidebar.footer.action` is a list slot receiving only the sidebar width;
- `ctx.sessions` exposes list projection and navigation;
- DSH's Session and Goal APIs remain the only authority for Session creation,
  Goal mutation, Agent execution, model choice, tools, and Goal rounds;
- Session list rows expose the DSH `goal` projection needed to display bound
  Task phases without a second browser-side Goal store.

## 3. User experience

### 3.1 Entry

An expanded DSH sidebar shows a `Learn Loop` footer action beside the existing
settings area.  A collapsed sidebar shows the same action as an icon with an
accessible label and tooltip.  Selecting it opens a lightweight overlay above
the existing DSH page; it does not navigate to a replacement application or
start another server.

### 3.2 Goal list and creation

The first view shows persisted long Goals in most-recently-updated order with:

- objective;
- phase (`active`, `blocked`, or `complete`);
- completed and total Task counts; and
- the current Task, when one exists.

The create form asks only for:

- one long-Goal objective;
- one or more ordered Task objectives; and
- the existing positive `maxTaskRounds`, defaulting to `3`.

Users can add, remove, and reorder authored Task rows before creation.  Create
persists the plan and returns to its detail view.  It does not create a DSH
Session, arm a Goal, or request a model.

### 3.3 Goal detail and Task execution

The detail view shows every Task in order, its projected phase, and its bound
DSH Session when present.  Exactly the first non-complete Task is marked
current.  Later Tasks are visible but cannot be started out of order.

The primary action is:

- `Start Task` for an unbound current Task;
- `Continue Task` for a bound active or paused Task;
- `Open Session` when that Task is already running; or
- absent when the long Goal is complete.

After start or continue succeeds, the overlay closes and DSH opens that Task's
Session in its normal conversation surface.  Tianwen does not embed another
chat view.

The first Task takes the workspace directory from the currently selected
ordinary DSH Session.  If there is no selected Session with a workspace
directory, the action is disabled with the instruction to open or create a DSH
Workspace first.  Later Tasks reuse the first bound Task Session's directory,
so changing the currently viewed Session cannot silently move one long Goal to
another repository.

## 4. Architecture

```text
DSH Web / Tianwen Desktop
  -> @tianwen/runtime-bundle client contribution
     -> sidebar.footer.action + Learn Loop overlay
     -> DSH Session list / goal projections
     -> narrow Tianwen long-Goal Connection RPC
        -> existing long-goal record and status functions
        -> DSH public Session / Goal services
        -> existing DSH Agent loop and Goal-round driver

Headless / CLI
  -> existing tianwen plan + task commands
  -> the same long-goal record schema and state root
```

### 4.1 One package, two optional faces

`@tianwen/runtime-bundle` keeps its current
`@tianwen/runtime-bundle/runtime` host/runtime face and adds one package-root
Web bridge row named `@tianwen/runtime-bundle`.  The root row is required
because DSH resolves `dsh.client` metadata from each exact Loader entry name;
the `/runtime` subpath cannot expose the root package's client declaration.
The root server entry remains a no-op, while the package root declares one
browser client artifact through DSH's standard `dsh.client` metadata.

The bridge row is harmless in a headless Profile: no client-module service is
present to load the browser artifact, and the root server entry imports no Web
or React code.  No browser or Electron dependency enters the Agent Runtime.

Client-only DSH UI packages and React are build/peer inputs for the browser
artifact, not a second runtime bundle.  Electron remains solely in
`@tianwen/desktop-host`.

### 4.2 State root

The long-Goal authority remains `<state-root>/long-goals` with schema
`tianwen.long-goal.v1`.

The Runtime configuration gains optional absolute `stateRoot` and
`sessionsRoot` values beside its existing `evolutionRoot`:

- managed products configure them as `<data-dir>/state` and
  `<data-dir>/dsh-home/sessions`;
- an ordinary installed Web Profile defaults `stateRoot` to
  `<profile-root>/state` and resolves `sessionsRoot` from the Profile's
  absolute `DSH_HOME`;
- CLI users targeting that Profile pass the same path through the existing
  `--state-root` option.

There is no data migration and no second Web database.  A mismatched CLI state
root is a different product target and is not searched or merged implicitly.

### 4.3 Narrow host service and Connection RPC

The Runtime mounts one `tianwenLongGoals` host service backed by the existing
strict parser and atomic file writes.  It registers one plugin-owned
`/tianwen` channel through DSH's public generic Connection RPC and exposes only
four product endpoints:

```ts
list(): Promise<LongGoalSummary[]>
create(input: {
  objective: string
  tasks: string[]
  maxTaskRounds: number
}): Promise<LongGoalStatusProjection>
status(input: { longGoalId: string }): Promise<LongGoalStatusProjection>
runCurrentTask(input: {
  longGoalId: string
  initialCwd?: string
}): Promise<{
  status: LongGoalStatusProjection
  sessionId?: string
  action: 'started' | 'continued' | 'already-running' | 'complete'
}>
```

The handler receives `unknown` payloads and validates exact keys and result
shapes with the same strict Tianwen parsing style used by the CLI.  This avoids
forking DSH's fixed API Proxy or adding a code generator for four private
endpoints.  The browser does not receive filesystem paths other than the
already visible Session workspace directory, and it cannot select an
arbitrary state root.

### 4.4 Starting without racing the durable binding

An unbound Task must be bound before its first model turn can begin.  The Web
path therefore performs one in-process host operation instead of reproducing
the CLI child-process launcher:

1. re-read the long Goal and project the current Task;
2. create a fresh ordinary DSH Session for the frozen workspace directory;
3. create the ordinary DSH Goal through the existing Goal service;
4. synchronously persist the Task's Goal/Session binding before yielding to
   the Goal-round driver; and
5. return the Session ID so the client can open the normal DSH conversation.

The implementation may use DSH's existing API Proxy for Session creation and
its existing Goal service for the synchronous Goal mutation.  It must not
construct an Agent, model loop, prompt, tool set, Session log, or Goal-round
driver itself.

If the binding write fails, the same host call pauses/disarms the just-created
Goal before it can begin a model turn and reports the Goal and Session IDs.  It
does not delete the Session or retry.  A focused integration test must prove
that the binding event exists before any `turn/start`; if exact rc.2 cannot
provide this ordering, implementation stops at this seam and revises the
operation rather than accepting a race.

For a bound Task, the host reuses its exact Session.  A cold active Goal is
resumed through DSH's existing cold-Session resolution; an already armed or
running Goal is not restarted.  Session or Goal mismatches remain integrity
errors and never create a replacement.

### 4.5 Status projection

The host remains the authority for long-Goal ordering and binding integrity.
The browser renders each bound Task from the DSH Session list's public `goal`
projection and verifies that the projected Goal ID equals the stored binding.
The host `status` operation uses the existing `readLongGoalStatus()` path for
the canonical read and current-Task decision.

No projected phase is written back to the long-Goal JSON.  Browser refresh,
Web restart, Desktop restart, and CLI status all reconstruct the same result
from durable Tianwen bindings plus DSH state.

## 5. Failure behavior

- Invalid form values remain in the form with one concise field-level error.
- Unknown or corrupt long Goals show an integrity error; the UI never repairs
  or replaces their files.
- A missing bound Session, a Goal/Session mismatch, or an out-of-order binding
  disables execution and shows the exact failing Task.
- Remote, Session-create, Goal-create, bind, and resume failures are shown once
  and are not retried automatically.
- A created-but-unbound Session/Goal is reported with both IDs and remains
  recoverable; it is not silently deleted.
- Closing the overlay cancels only pending browser requests.  It does not stop
  a DSH Task which was already admitted.
- Desktop shutdown continues to stop only the DSH Web process tree owned by
  that Desktop instance; Learn Loop adds no process lifecycle code.

## 6. Deliberate non-goals

This stage does not add:

- model-based Task decomposition;
- a DAG, parallel scheduler, daemon, background queue, retry policy, or budget
  system;
- automatic learning, Candidate, Evaluation, or controlled Activity;
- a new natural task or another real DeepSeek efficacy run;
- a separate Desktop renderer, preload, IPC contract, updater, or notification
  system;
- a second Session store, Goal store, chat surface, Agent loop, or Runtime;
- public branding migration from `Tianwen` to `Learn Loop` in schemas or package
  names;
- automatic discovery or merging of unrelated state roots.

## 7. Verification proportional to this change

Verification is limited to the changed product boundaries:

1. deterministic tests for strict Remote input/output, create/list/status, Task
   ordering, distinct Session IDs, restart reconstruction, and all stated
   failure paths;
2. browser-component tests for the sidebar action, create form, Task detail,
   disabled workspace state, error display, and Session navigation;
3. one DSH Web product test proving the real client contribution is discovered,
   a two-Task plan can be created, and the first Task binding precedes
   `turn/start` using an offline deterministic model;
4. one Desktop check proving the packaged window displays that same Web
   contribution; it is not a second functional test of long-Goal semantics;
5. headless CLI regressions, Runtime Bundle archive audit, typecheck, and the
   normal repository gate;
6. one exact-main CI check after integration.

No controlled Activity, paid Provider call, repeated natural task, or broad
historical evidence replay is required.  Environment-only Desktop timing noise
does not trigger another full acceptance cycle when the owned process,
readiness URL, and UI contribution are already proven.

## 8. Completion criteria

The stage is complete when:

1. installing the same Tianwen Runtime Bundle into a compatible DSH Web Profile
   adds the Learn Loop entry without changing the existing DSH conversation;
2. the entry creates and displays durable authored long Goals with zero model
   requests during creation and status reads;
3. starting Task 1 creates one fresh DSH Session, persists its binding before
   the first turn, and opens that Session;
4. restart preserves progress, continuing a Task reuses its Session, and Task 2
   receives a different Session only after Task 1 completes;
5. a complete long Goal starts no process or model request;
6. ordinary headless/CLI use remains available without Web or Desktop;
7. Tianwen Desktop shows the same plugin through its existing DSH Web host;
8. focused local gates and exact-main CI pass, with no new natural-task claim.
