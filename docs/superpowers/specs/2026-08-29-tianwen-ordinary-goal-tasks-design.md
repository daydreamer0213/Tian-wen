# Tianwen Ordinary Long-Goal Tasks Design

Date: 2026-08-29
Status: accepted from the current architecture for implementation

## Decision

Implement the smallest ordinary product surface that lets one Tianwen long
Goal advance through explicitly authored ordered Tasks across separate DSH
Sessions.  Tianwen owns only the long-Goal record, Task ordering, and the
Task-to-DSH execution binding.  DSH remains the sole owner of each Task's
Session, current execution Goal, Agent loop, tools, model, and resume behavior.

This is the first ordinary-product slice of the architecture gap described in
`docs/tianwen-architecture-overview-v2.md`: Tianwen currently exposes one DSH
Goal bound to one Session, but does not yet expose a durable Goal containing
multiple ordered Tasks.  It does not claim to finish the full Goal Graph or
formal Tianwen Run lifecycle in this stage.

The repository already has four related foundations, and this work must not
rebuild them: ordinary single-Goal persistence and resume, private Evolution
`goalRef`/`taskRef` Run bindings, the fixed controlled-lifecycle state machine,
and the frozen Python Alpha Goal/Task models.  None of those foundations owns
ordinary Task ordering or next-Task selection.  Long-Goal and Task IDs created
here remain stable references that a later acceptance-driven Tianwen Run can
bind through the existing Evolution service; the Task-to-DSH Goal/Session
execution binding in this slice is not itself presented as a formal Run
binding or learning receipt.

## Product boundary

Add three commands to the installed Runtime CLI:

```text
tianwen plan create --objective TEXT --task TEXT --task TEXT TARGET [--max-rounds N] [--json]
tianwen plan status --goal LONG_GOAL_ID TARGET [--json]
tianwen task run --goal LONG_GOAL_ID TARGET [--json]
```

`TARGET` is either the existing managed `--data-dir ABSOLUTE_PATH` form or the
existing portable `--dsh-root`, `--dsh-home`, `--profile`, and `--state-root`
form.  `--task` is repeatable, at least one Task is required, and every value
must be non-empty after trimming.  `--max-rounds` retains the existing positive
integer semantics and applies to each Task's ordinary DSH Goal; its default is
the existing value `3`.

`plan create` records the long Goal and ordered Tasks without starting DSH or
requesting a model.  `task run` selects the first incomplete Task.  On its
first invocation it creates one ordinary DSH Goal/Session for that Task,
durably binds the returned IDs, and then uses the existing ordinary resume
path.  Later invocations resume that same Task Session.  After DSH reports the
Task Goal complete, the next Task becomes current.  When all Tasks are
complete, the long Goal is complete and `task run` performs no execution.

Existing top-level `create`, `list`, `status`, and `resume` commands keep their
current one-DSH-Goal behavior and schemas unchanged.

## Deliberate non-goals

This stage does not add:

- automatic model-based Task decomposition;
- a general DAG, parallel scheduler, daemon, retries, budgets, or background
  worker;
- learning, Candidate, Evaluation, or controlled-Activity behavior;
- automatic creation of an acceptance-driven Tianwen Run binding or natural
  trial manifest;
- a custom Desktop renderer or Goal panel;
- a second Session store or a duplicate DSH Agent loop;
- an additional installed-product or natural-task proof solely for this
  mechanism.

The initial product supports authored linear order only.  Dependencies and
parallel Tasks are deferred until an ordinary user workflow demonstrates the
need.

## Durable record

Managed products store long Goals below `<data-dir>/state/long-goals`.
Portable products store them below `<state-root>/long-goals`.  Each Goal is one
strict JSON file:

```json
{
  "schemaVersion": "tianwen.long-goal.v1",
  "id": "tianwen-long-goal-<uuid>",
  "objective": "Ship the release",
  "maxTaskRounds": 3,
  "createdAt": 0,
  "updatedAt": 0,
  "tasks": [
    {
      "id": "task-1",
      "objective": "Prepare release notes",
      "execution": null
    },
    {
      "id": "task-2",
      "objective": "Publish the release",
      "execution": {
        "goalId": "<dsh-goal-id>",
        "sessionId": "<dsh-session-id>"
      }
    }
  ]
}
```

Task order is array order; Task IDs are stable one-based ordinals.  The record
does not persist a second copy of Task state.  For a bound Task, status is
projected from the bound DSH Goal:

- no execution binding: `pending`;
- DSH `active` or `paused`: the same phase;
- DSH `blocked`: `blocked` with the existing reason;
- DSH `complete`: `complete`.

The first non-complete Task is current.  Later Tasks remain pending and cannot
run out of order.  The long Goal is `complete` when every Task is complete,
`blocked` when its current Task is blocked, and otherwise `active`.  Missing,
ambiguous, or inconsistent bound DSH state is an integrity error; Tianwen must
not silently create a replacement Session.

Creation uses exclusive file creation.  Binding updates use a temporary file
in the same directory followed by atomic rename.  The first version is a
single-writer CLI contract and does not add a locking subsystem.  If DSH Goal
creation succeeds but the binding write fails, the command reports the
created Goal and Session IDs and stops; it does not delete or silently retry
the durable DSH Session.

## Execution reuse

Do not create a new DSH runner.  Extract a capture form of the existing Goal
creation launch so `task run` can parse the existing
`tianwen.goal-create.v1` JSON receipt.  After persisting its Task binding, call
the existing Goal resume preflight and launch functions.  A previously bound
Task skips creation and calls only the existing resume path.

The target supplied to `task run` determines where both the long-Goal record
and the bound DSH Session are resolved.  A record copied to an unrelated target
does not authorize or discover a replacement Session.

## Status projection

`plan status --json` returns one `tianwen.long-goal-status.v1` projection with:

- long Goal ID, objective, and phase (`active`, `blocked`, or `complete`);
- completed and total Task counts;
- every Task's ID, objective, projected phase, and optional DSH Goal/Session
  binding;
- the current Task ID or `null` when complete;
- `runtime: { activation: "not-loaded", modelRequests: 0, readOnly: true }`.

Text output leads with Goal progress, then lists Tasks in order and marks the
current Task.  Status never loads the product Runtime or requests a model.

## Error behavior

- Invalid command shapes return usage and exit `2`, matching the current CLI.
- Unknown long Goals, corrupt records, duplicate Task IDs, unexpected keys,
  and invalid bindings fail closed with a concise integrity error.
- `task run` on a completed long Goal emits the complete projection, exits `0`,
  and does not spawn DSH.
- Failure from existing Goal create or resume is returned unchanged; Tianwen
  does not add automatic retries.
- A bound Task never falls back to creating another Session when resume
  preflight fails.

## Alternatives rejected

1. **Store all Tasks inside one DSH Goal/Session.** This preserves the current
   implementation but violates the architecture boundary: DSH's Goal, Plan,
   and Todo serve the current Session and must not become Tianwen's cross-Run
   Goal Graph.
2. **Ask a model to decompose the Goal automatically.** This adds Provider
   behavior before the authored linear contract exists and makes Task quality
   inseparable from persistence correctness.
3. **Build the Desktop Goal panel first.** It would visualize the current
   single-Session limitation.  A later panel should consume this ordinary CLI
   projection through a DSH Web slot rather than inventing separate semantics.

## Acceptance

1. The installed CLI can create one long Goal with two authored ordered Tasks
   in both managed and portable target forms without a model request.
2. Status shows `0/2`, both Tasks, and exactly `task-1` as current.
3. The first `task run` creates and binds one DSH Goal/Session, then delegates
   to ordinary resume.  A later run while that Task is incomplete resumes the
   same Session.
4. After process restart and durable DSH completion of Task 1, status shows
   `1/2` and `task-2` as current.  Running Task 2 never resumes Task 1's
   Session.
5. After Task 2 completes, status shows `2/2`, the long Goal is complete, and
   another `task run` starts no process.
6. Existing one-Goal create/list/status/resume behavior, portable target
   validation, Desktop launch, and default-skipped real-product tests remain
   unchanged.
