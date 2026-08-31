# Tianwen learning clue inbox design

**Status:** implemented and retained in Tianwen Runtime `0.1.5`; historical design authority

## Product problem

Goal-first Task feedback already persists positive results, observed gaps, and
open Learning Tickets. The product currently stops at the sentence
“Improvement clue recorded”. Users cannot see how many clues exist, which Goal
or Task produced one, or whether the same problem appeared again.

An open feedback Ticket is not yet a governed Learning Case. It lacks the
Outcome, frozen Run binding, acceptance contract, parent Skill identity, and
counterevidence required by the existing Case/Lesson/Candidate path. The inbox
must not pretend that a Ticket is already a Skill change.

## Decision

Add one read-only **Improvement clues** view inside the existing Learn Loop
dialog. Web and Desktop receive the same view from the Runtime client; Desktop
does not add another panel.

The Goal list header shows `Improvement clues (N)`. Selecting it opens a list
sorted by latest source time. A settled Task whose feedback created or merged a
Ticket links directly to the matching clue. Each clue shows:

- the source Goal objective;
- the source Task objective;
- when each source was recorded;
- the number of merged occurrences.

The full Ticket ID, problem fingerprint, Signal IDs, workspace path, evidence
digests, and original private feedback note are not rendered. The Ticket ID is
kept only as the internal navigation key.

## Safe projection

The host returns one exact product projection:

```text
schemaVersion: tianwen.learning-clue-status.v1
items[]:
  ticketId
  status: open
  occurrenceCount
  sources[]:
    longGoalId
    goalObjective
    taskId
    taskObjective
    recordedAt
```

Only Tickets linked to settled Goal-first Task feedback appear. Sources are
deduplicated by Goal and Task. `occurrenceCount` comes from the Ticket's Signal
count; hashes and Signal identities remain server-side.

The read path reuses the existing Goal status and Task feedback projection, so
it keeps their Session anchor and scope checks instead of inventing a second
Ticket-to-Task join.

## RPC and UI boundary

- RPC endpoint: `learning-clues` with an exact empty object payload.
- The client rejects missing, extra, private, or malformed fields.
- The Goal list refresh loads Goals and clues together.
- The clue view has refresh and return-to-Goals actions.
- Selecting a source opens its existing Goal detail.
- A Task feedback result with `ticketId` opens the clue view focused on that
  item.

If a Ticket has no safe Goal-first source it is omitted rather than exposed as
an unexplained hash.

## Explicit non-goals

- no Ticket state machine, close/ignore action, or review receipt yet;
- no automatic analysis Agent, Case, Lesson, Candidate, or Skill;
- no original feedback note in public RPC or UI;
- no new sidebar entry or Desktop-specific implementation;
- no model or Provider call for this read-only slice.

The next product slice may add a user-triggered one-shot analysis after its
private input and durable result are designed from real visible Tickets.

## Acceptance

- a fresh product with no Ticket shows count zero and an empty clue view;
- created and merged feedback Tickets project their safe Goal/Task sources and
  occurrence count after restart;
- positive and note-free negative feedback do not appear;
- RPC/client reject extra private fields;
- the existing one Learn Loop entry can navigate Goals → clues → source Goal,
  and Task feedback can jump to its clue;
- Chinese and English labels remain switchable through the existing DSH locale.
