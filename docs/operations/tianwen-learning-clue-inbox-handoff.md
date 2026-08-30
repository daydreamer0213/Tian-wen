# Tianwen learning clue inbox handoff

**Date:** 2026-08-30  
**Result:** passed

## Product result

The existing Learn Loop dialog now contains a read-only **Improvement clues**
view. The Goal list reports the number of visible clues. Users can open the
view, refresh it, return to Goals, follow a source back to its Goal, or jump
directly from a settled Task's Ticket feedback result to the matching clue.

Each clue shows only:

- source Goal objective;
- source Task objective;
- source recording time;
- merged occurrence count.

Web and Desktop use the same Runtime client and therefore receive the same
view. No second sidebar entry or Desktop-only screen was added.

## Safety and learning boundary

The host rebuilds the view from persisted Goal status, anchored Task feedback
status, and open Learning Tickets. It omits Tickets with no safe Goal-first
source and deduplicates sources by Goal and Task.

The RPC does not return the original feedback note, problem fingerprint,
Signal IDs, workspace path, Evidence IDs, or private ledger events. Ticket IDs
exist only as internal navigation keys and are not rendered.

This slice does not add Ticket close/review states and does not create a Case,
Lesson, Candidate, Skill, or code change. The existing governed Case path still
requires Outcome Signals, frozen Run bindings, acceptance evidence, parent
Skill identity, and counterevidence that ordinary feedback Tickets do not have.

## Verification facts

- combined host/client/client-module tests: `66/66` passed;
- Runtime Bundle TypeScript build check passed;
- the production React client bundle built successfully;
- `git diff --check` passed;
- independent privacy/correctness review approved with no P1/P2 finding.

The tests cover an empty inbox, created and merged Ticket sources, source
deduplication and ordering, exact-empty RPC input, strict response parsing,
private-field rejection, Chinese/English labels, Task-to-clue navigation,
clue-to-Goal navigation, and the single-sidebar-entry invariant.

## External facts

This is a read-only projection over existing persisted product data. It needed
no Provider/model request, controlled Activity, new natural task, or billing
claim. No natural-user or external-user improvement is claimed.

## Next boundary

A later user-triggered **Analyze once** action may use an ordinary DSH Agent
Session, but only after its private input and durable result are explicitly
designed. It must not convert ordinary feedback directly into the governed
Case/Lesson/Candidate path or auto-install a Skill.
