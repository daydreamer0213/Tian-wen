# Tianwen Read-only Goal List Design

**Date:** 2026-08-16

**Status:** Approved by the architecture controller under the user's standing
authorization to continue with the recommended minimal design.

## 1. Outcome

Add one small installed command beside the existing status command:

```powershell
tianwen list --data-dir D:\DevData\tianwen
```

It discovers the current durable Goal in each persisted DSH Session and prints
a compact progress list. It does not load an Agent, request a model, resume a
Goal, repair state, write an index, or start a UI.

The existing command remains the detail view:

```powershell
tianwen status --goal GOAL_ID --data-dir D:\DevData\tianwen
```

## 2. Why this is the next slice

The status command is useful only after the user already knows a Goal id. A
small list command closes that discovery gap and creates the minimum read
contract needed by a later task panel.

This slice reuses the already proven JSONL Session inspection and Goal replay.
It does not justify a database, search index, daemon, pagination API, desktop
shell, or generic query layer.

## 3. Command and projection contract

First-version grammar:

```text
tianwen list --data-dir ABSOLUTE_PATH [--json]
```

`--data-dir` is required so the command never guesses which Tianwen state to
read. `--goal` is invalid for `list`.

The reusable projection schema is `tianwen.goal-list.v1`:

```text
schemaVersion
goals[]:
  id, objective, phase, maxGoalRounds, roundsStarted, updatedAt
  session: id, eventCount
runtime: activation="not-loaded", modelRequests=0, readOnly=true
```

The projection contains only the current folded Goal from each Session. Goal
history, raw Session events, messages, prompts, tool arguments/results,
Evidence details, Champion details, file paths and environment values are not
included. The existing status command remains responsible for one Goal's
Evidence and Champion detail.

Human output is one compact row per Goal. Display-only objective text is
collapsed to one line so persisted newlines cannot break the list layout. JSON
keeps the exact durable objective.

## 4. Ordering and edge cases

- Goals sort by `updatedAt` descending, then Goal id and Session id ascending.
  This keeps recent work first while remaining deterministic.
- A missing sessions directory or no current Goal is a successful empty list:
  text prints `No Goals.` and JSON contains `goals: []`.
- Sessions without a current Goal are ignored.
- If two Sessions claim the same current Goal id, the command fails as
  ambiguous instead of emitting a misleading duplicate.
- An inspected Goal without its replay timestamps, or malformed persisted
  Session data, fails as an integrity error. Corrupt Sessions are not silently
  skipped.

## 5. Implementation seam

Refactor the existing status module around one private shared scanner:

1. derive `DATA_DIR/dsh-home/sessions`;
2. use public `JsonlSessionPersistence.list()` and `inspect()`;
3. replay each snapshot with public `foldGoal(events)`;
4. validate uniqueness and replay completeness;
5. return immutable in-memory snapshots;
6. dispose the temporary Cordis Context.

`readGoalStatus()` finds one id in those snapshots and adds the existing
Evidence and Champion projections. `listGoals()` maps the same snapshots to
the smaller list schema. No new workspace package or DSH abstraction is added.

## 6. Read-only and packaging boundary

Acceptance snapshots every product-data file and byte before and after list
queries. The command passes only when they are identical and model request
counts do not increase.

The existing `@tianwen/runtime-bundle` tarball and `tianwen` bin are extended;
no second executable artifact is introduced. The installed formal Profile must
run `list` after the existing startup fixture without another Runtime/model
round.

## 7. Minimal acceptance matrix

1. Two or more durable Goals are projected in deterministic recent-first order.
2. Text and JSON output repeat byte-for-byte for the same persisted snapshot.
3. Empty state succeeds without creating files.
4. A Session without a Goal is ignored.
5. Duplicate Goal ids and malformed Session authority fail without writes.
6. Private message/tool fixture strings never appear in list output.
7. Existing `status --goal` behavior and schema remain unchanged.
8. The packed and installed Profile bin exposes both `list` and `status`.
9. Reading list state produces zero Agent activation and zero model requests.

## 8. Explicit non-goals

- no filtering, search, pagination, watch mode or background refresh;
- no list-all Goal history or Goal graph;
- no resume, pause, edit, complete, approve or promote action;
- no Evidence/Champion duplication in every list row;
- no database, index, cache, daemon, RPC or event bus;
- no TUI, web page or desktop panel in this slice;
- no DSH fork, Runtime cutover or Python removal;
- no paid model, live web or real Docker.

## 9. Retained risks

- The first version scans persisted Session headers and snapshots. An index is
  considered only after measured scale shows this is too slow.
- The view is point-in-time; another process may append after inspection.
- DSH remains pinned to Developer Preview `0.1.0-rc.6`.
