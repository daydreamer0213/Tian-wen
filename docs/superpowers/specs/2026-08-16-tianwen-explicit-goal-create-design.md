# Tianwen Explicit Goal Create Design

**Date:** 2026-08-16

**Status:** Approved by the architecture controller under the user's standing
authorization to continue with the recommended minimal design.

## 1. Outcome

Add one installed command:

```powershell
tianwen create --objective "Build the project" --data-dir D:\DevData\tianwen
```

It creates and durably flushes one top-level Goal in one new DSH Session. It
does not run a Goal round or request a model. The user can immediately inspect
the result with `list`/`status` and explicitly start one round with `resume`.

The optional `--max-rounds N` sets the Goal's total round budget. Its default is
3, matching Tianwen's first-version expectation that most user Goals should
reach a useful result within a few iterations. Any supplied value must be a
positive safe integer.

## 2. Why create is separate from resume

The top-level Goal belongs to the user. Creating it and running it are two
different authority decisions:

- `create` records what the user wants and the budget;
- `resume` spends exactly one round because the user explicitly asked it to.

This keeps first-version behavior visible and controllable without introducing
a daemon, scheduler, automatic loop or paid-model requirement.

## 3. Command contract

```text
tianwen create --objective TEXT --data-dir ABSOLUTE_PATH
               [--max-rounds POSITIVE_INTEGER] [--json]
```

- `--objective` and `--data-dir` are required;
- objective text is trimmed and must remain non-empty;
- `--max-rounds` defaults to 3 and must be a positive safe integer;
- package names, Profile name, runner, patch and executable remain fixed;
- unknown flags, positional arguments and `--goal` are usage errors.

Usage errors return 2. Profile/host/runtime or persistence failures return 1.
Success returns 0.

## 4. Trusted ingress and persistence

The installed CLI is the trusted human ingress under the accepted v1 threat
model: reviewed same-process Tianwen/DSH plugins are trusted code. The command
does not synthesize a model tool call or pretend an arbitrary plugin message is
human. A fixed Tianwen runner directly calls the public Goal service because
the user explicitly invoked this host command.

The runner:

1. reads the installed Profile's current default model selection only to create
   a normal Agent/Session identity;
2. creates one random `tianwen-goal-*` Session;
3. creates one Goal with the exact objective and budget;
4. flushes JSONL persistence;
5. returns a compact receipt and disposes the Agent handle.

The create-only patch disables `headless-startup`, `headless-runner` and
`goal-round-driver`. Therefore an armed newly created Goal cannot trigger a
model request before the process exits. Recovery later projects it disarmed;
the existing explicit resume path then owns reactivation.

## 5. Receipt

JSON output uses `tianwen.goal-create.v1`:

```text
schemaVersion
goal: id, revision, objective, phase, maxGoalRounds, roundsStarted
session: id, eventCount, modelRequestsDelta
```

`modelRequestsDelta` must be exactly 0. Human output prints the Goal id and the
exact next `tianwen resume` command; the JSON receipt does not embed shell text
or environment-specific executable paths.

## 6. Failure semantics

- CLI grammar and installed-host validation happen before Profile launch.
- Runner config is validated before Agent creation.
- Goal creation and Session flush are the accepted durable operation. If flush
  fails, the command returns failure and must not claim a success receipt.
- Once JSONL persistence accepted the Goal, later process shutdown failure does
  not delete or rewrite the durable Goal.
- No cleanup framework or cross-file transaction is added; public DSH Session
  persistence remains the authority.

## 7. Minimal acceptance matrix

1. Valid input creates one active Goal with revision 1, roundsStarted 0 and the
   requested/default budget.
2. The created Session persists one replayable current Goal and survives a
   fresh Context.
3. Create produces zero model requests and no Evolution transition.
4. `list` and `status` discover the new Goal immediately.
5. Explicit `resume` can run the created Goal once through the existing path.
6. Invalid objective/budget/grammar and missing installed DSH fail without new
   Session files.
7. The packaged and installed Runtime Bundle contains only the fixed runner and
   patch needed by this command.
8. Existing install/list/status/resume behavior remains unchanged.

## 8. Non-goals

- no automatic first round, background execution, watcher or scheduler;
- no Goal editing, deletion, pause, graph or project template;
- no workspace picker, desktop UI, task panel or notifications;
- no model/provider setup or credential prompt;
- no database, queue, RPC, generic command framework or second runtime;
- no paid model, live web, real Docker, auto-promotion or Python removal.

## 9. Retained risks

- DSH remains pinned to Developer Preview `0.1.0-rc.6`.
- An accepted Goal can outlive a failed CLI shutdown because JSONL is the
  durable authority; `list` is the recovery/discovery path.
- Round budget limits admission count, not token/cost per round. Model-level
  token budgets remain a later product contract.
