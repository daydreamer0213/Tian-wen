# Tianwen Learning Clue Review Handoff

**Date:** 2026-08-30
**Result:** passed

## Product result

The ordinary Learn Loop now has a user-owned inbox lifecycle after clue
analysis. A clue whose bound analysis Turn is complete or failed can be marked
**Reviewed**. Reviewed clues are hidden from the default inbox, remain available
through **Show reviewed**, and keep their existing source Goal and analysis
Session actions.

Reviewed means only that the user inspected the clue. It does not mean fixed,
learned, accepted as evidence, or installed as a Skill. The action starts no
model request and performs no Goal, Task, code, Case, Lesson, Candidate,
Promotion, or Skill mutation.

If the same Ticket later gains another Signal, its current occurrence count is
higher than the stored reviewed count and the clue automatically returns to the
pending inbox. No automatic reanalysis is started; the durable ordinary DSH
Session and the existing Goal guidance path remain the user's follow-up
surfaces.

## State and privacy boundary

One strict record is stored under the existing Goal-first state root:

```text
learning-clue-reviews/<ticket-hash>.json
```

It contains only the Ticket ID, bound analysis Session ID, bound initial
message ID, reviewed occurrence count, and review time. Same-count review is
idempotent, a higher count replaces the record, and a lower count or analysis
identity change is rejected. Invalid JSON, extra fields, invalid identities,
unsafe roots, and non-canonical timestamps fail closed.

The Host only accepts a Ticket that remains in the safe Goal-first clue
projection, has a matching analysis binding, and has a terminal analysis Turn.
The browser receives only the nullable review projection. It receives no
feedback note, model answer, workspace, Signal ID, Evidence, or learning
governance record.

## Verification and review

- Focused review persistence, Host/RPC, strict client, and compiled UI checks:
  80/80 passed.
- Runtime Bundle TypeScript build: passed.
- Production client bundle: passed.
- `git diff --check`: passed.
- Independent review found one client-side semantic gap: a malformed response
  could combine Reviewed with no/running analysis or a different occurrence
  count. The client now rejects all three shapes; the focused client check
  passed 17/17 after the fix. Re-review approved with no remaining P1/P2.

No new installed-product or configured-model run was performed for this
review-only state transition. The preceding installed Learning Clue analysis
proof remains the runtime authority; repeating a Provider request would not
exercise the new review action, which itself is deterministic and model-free.

## Closed boundary

The ordinary product now covers: explicit Task feedback, a visible durable
improvement clue, one user-triggered analysis Session, and an honest reviewed
inbox state that reopens on recurrence. Any future automatic action must still
establish governed evidence instead of parsing model prose directly into code
or a Skill.
