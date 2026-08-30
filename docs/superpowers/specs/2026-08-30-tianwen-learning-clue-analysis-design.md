# Tianwen user-triggered learning clue analysis design

**Date:** 2026-08-30
**Status:** frozen for implementation

## Product problem

The Learn Loop can now show a durable improvement clue, its safe Goal/Task
sources, and its recurrence count. The user still cannot ask Tianwen to
understand that clue. Leaving the product at a read-only Ticket list makes the
learning promise visible but not useful; promoting ordinary feedback directly
to a Case or Skill would bypass the evidence requirements already enforced by
the governed learning path.

This slice adds one explicit product action: **Analyze once**.

## User flow

1. A visible clue with no analysis Session shows **Analyze once**.
2. The UI states that the private feedback note will be sent to the currently
   configured model, that the action analyzes only, and that it does not
   automatically modify the project or install a Skill.
3. The Host revalidates the clue from the safe Goal-first source projection. An
   arbitrary Ticket ID that is not visible in that projection is rejected.
4. The Host creates one ordinary DSH Agent Session in the source Goal's
   workspace with the source Goal's existing Agent preset, persists the
   Ticket-to-Session binding, and submits one analysis message.
5. The RPC returns the Session ID and the existing DSH UI opens that Session.
   The user sees normal model progress, failures, and the final answer there.
6. After restart, or after a second click, the clue opens the same Session. It
   does not silently create another Provider request. The user may continue the
   ordinary Session manually if more information is needed.

The product does not add a round, token, cost, time, retry, or Provider budget.
"Once" describes the idempotent clue-to-Session admission boundary, not a
Tianwen usage quota.

## Private input boundary

The browser continues to receive only the safe clue projection. The feedback
note, problem fingerprint, Signal IDs, workspace path, Evidence IDs, and raw
ledger events do not cross the clue status RPC.

The Evolution service gains one internal read projection for an explicit
feedback Ticket. It returns the latest original feedback note and its scope to
the local Host. The Host combines that note with the visible source Goal/Task
objectives and recurrence count directly into the new DSH Session message.
The message marks the quoted data as user evidence, not instructions.

The analysis prompt asks the Agent to:

- inspect the current workspace read-only when useful;
- explain the observed issue and likely cause;
- decide whether it looks reusable or task-specific;
- propose the smallest verification or fix;
- identify missing evidence;
- avoid editing files and avoid claiming that the issue is fixed, learned, or
  installed as a Skill.

The original note remains in the private Evolution ledger and in the private
analysis Session. It is not copied into the binding file, clue list, ordinary
logs, receipts, or public events.

## Durable result and lifecycle

The durable result is the ordinary DSH Session itself. Tianwen does not copy a
model summary into a second database or introduce a parallel result schema.
The Session's existing events own running, completed, and failed model state.

The only new product state is a small strict binding under the existing
Goal-first state root:

```text
learning-clue-analyses/<ticket-hash>.json
```

It contains only schema version, Ticket ID, DSH Session ID, the initial user
message ID, and creation time. The message ID lets Tianwen derive the original
analysis Turn's running/completed/failed phase even if the user later continues
the Session. The binding is created exclusively and read strictly. A corrupt or
mismatched binding fails closed. It contains no feedback text or model result.

The Host schedules the normal Session flush after the Agent becomes idle. It
does not retry a failed Turn and does not hide the failed Session. A later
product stage may add an explicit new analysis attempt, but this slice does not
create a retry system or analysis state machine.

## UI and RPC

The existing clue item gains an optional analysis projection containing the
derived phase, start/finish time, and Session ID. The ID is an internal
navigation key and is not rendered. The model answer and error detail remain in
the ordinary DSH Session instead of being copied into the RPC.

The existing `/tianwen` channel gains one exact endpoint:

```text
analyze-learning-clue { ticketId }
  -> { schemaVersion, created, sessionId }
```

If a valid binding already exists, `created` is false and no new model work is
started. The client opens the returned Session through the existing DSH
Session list/open API. No second sidebar entry, Desktop-only screen, analysis
result RPC, or custom progress component is added.

## Explicit non-goals

- no automatic analysis when feedback is submitted;
- no automatic Task/code change;
- no Case, Lesson, Candidate, Champion, or Skill mutation;
- no controlled Activity or synthetic role lifecycle;
- no Provider billing inference;
- no new online service, queue, scheduler, retry loop, or general workflow
  engine.

## Acceptance

The slice passes when:

1. a visible explicit-feedback clue can start one ordinary configured-model
   DSH analysis Session and immediately open it;
2. the Session survives restart and the same clue reopens it without another
   automatic model request;
3. the private note reaches the local analysis Session but never the clue
   status/action response or rendered inbox;
4. an arbitrary, stale, source-less, or non-explicit-feedback Ticket is
   rejected;
5. model/Turn failure stays visible in the DSH Session and is not retried;
6. no governed learning mutation or project file modification is performed by
   Tianwen itself;
7. focused host/client/persistence tests, TypeScript checks, and the production
   client build pass;
8. one fresh installed-product run with the configured real model proves the
   Session creation, persistence, and reopen path. One run is sufficient; it
   is not a new controlled Activity or repeated natural-task benchmark.
