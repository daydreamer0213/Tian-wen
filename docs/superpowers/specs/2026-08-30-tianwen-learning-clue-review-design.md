# Tianwen learning clue review design

**Date:** 2026-08-30
**Status:** frozen for implementation

## Product problem

The Learn Loop can show an improvement clue and open one durable analysis
Session, but every clue remains visually pending forever. The product needs a
small user-owned lifecycle boundary after inspection. It does not need another
planner, an automatic Task, or a direct path from model prose to governed
learning state.

This slice adds one decision: **Mark reviewed**.

Reviewed means only that the user has inspected the clue and chosen to remove
it from the default inbox. It does not mean fixed, learned, accepted as true,
or installed as a Skill.

## User flow

1. A clue with a completed or failed analysis Session shows **Mark reviewed**.
2. The default inbox hides reviewed clues and shows a small count plus a
   **Show reviewed** control.
3. Showing reviewed clues keeps their source Goal and analysis Session actions
   available. No note or model answer is copied into the inbox.
4. If the same Ticket later gains another Signal, it automatically returns to
   the default inbox. The prior analysis remains the same durable Session; this
   slice does not silently send the new Signal to the model or create a retry.
5. The user may continue the ordinary analysis Session or guide the source Goal
   through the existing DSH/Tianwen controls.

## State boundary

Review state lives under the existing Goal-first state root, separate from the
Evolution ledger and from the analysis result:

```text
learning-clue-reviews/<ticket-hash>.json
```

The strict record contains only schema version, Ticket ID, bound analysis
Session ID, bound initial message ID, the reviewed occurrence count, and the
review time. It contains no feedback text, model answer, workspace, Signal ID,
Evidence, Case, Lesson, Candidate, or Skill data.

The Host revalidates that the Ticket is still in the safe Goal-first projection,
that its analysis binding matches the projected Session, and that the bound
analysis Turn is terminal. A later review of a newly recurring Ticket replaces
the same small record with the new occurrence count. If the current occurrence
count is greater than the stored count, the clue is pending again.

## UI and RPC

The clue projection gains a nullable review projection with the reviewed time
and occurrence count. The browser still receives no private note or raw model
result.

The existing `/tianwen` channel gains one exact endpoint:

```text
review-learning-clue { ticketId }
  -> { schemaVersion, reviewed, occurrenceCount, reviewedAt }
```

Filtering reviewed clues is local presentation state. There is no new sidebar,
database, workflow engine, queue, or Desktop-only view.

## Explicit non-goals

- no claim that a reviewed clue is resolved or learned;
- no model request, automatic retry, or Tianwen-side usage budget;
- no automatic Goal guidance, Task creation, code change, Case, Lesson,
  Candidate, Promotion, or Skill installation;
- no parsing of the free-form model analysis into governed evidence;
- no duplicate copy of the analysis answer.

## Acceptance

The slice passes when:

1. only a visible clue with a terminal bound analysis can be marked reviewed;
2. reviewed clues are hidden by default but remain inspectable through
   **Show reviewed**;
3. restart preserves review state without copying private feedback or analysis;
4. a higher Ticket occurrence count makes the clue pending again;
5. repeated review is safe and a later review records the new occurrence count;
6. malformed, stale, source-less, or still-running clues are rejected;
7. focused persistence, Host/RPC, client, and production build checks pass.
