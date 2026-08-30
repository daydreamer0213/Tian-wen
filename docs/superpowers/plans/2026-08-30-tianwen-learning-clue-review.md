# Tianwen learning clue review implementation plan

**Goal:** Let the user remove an inspected analysis clue from the default inbox
without claiming the issue was fixed or mutating governed learning state.

**Architecture:** Add one strict review record under the existing Goal-first
state root, derive pending/reviewed from its occurrence count, and reuse the
current clue dialog and analysis Session. Add no planner, retry system, result
store, or Evolution schema transition.

## Task 1: Strict review record

- Add `packages/tianwen-runtime-bundle/src/learning-clue-review.ts`.
- Persist only Ticket ID, analysis Session/message identity, reviewed occurrence
  count, and review time.
- Add focused tests for strict parsing, replacement at a later count, and corrupt
  state rejection.

## Task 2: Host lifecycle and RPC

- Extend the clue projection with nullable review state.
- Add exact `review-learning-clue { ticketId }` handling.
- Revalidate visible source, matching analysis binding, and terminal analysis
  before writing the review record.
- Project a clue as pending again when its current occurrence count exceeds the
  reviewed count.

## Task 3: Existing dialog interaction

- Add localized **Mark reviewed** and **Show reviewed** controls to the current
  clue dialog.
- Keep source Goal and analysis Session actions available for reviewed clues.
- Refresh the safe clue projection after review and render no identifiers,
  notes, or model answer.

## Task 4: Integration

- Run focused persistence, Host/RPC, and compiled-client tests.
- Run Runtime Bundle TypeScript and production client builds.
- Review the diff for privacy, lifecycle correctness, and unnecessary
  abstractions.
- Update architecture and operation handoff with only observed facts.
