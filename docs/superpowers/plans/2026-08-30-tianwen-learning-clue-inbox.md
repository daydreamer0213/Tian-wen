# Tianwen learning clue inbox implementation plan

## Goal

Make existing Goal-first Learning Tickets visible as safe, source-linked
improvement clues without changing their governance status.

## Task 1: safe host projection

- Add the exact `tianwen.learning-clue-status.v1` types and projection service.
- Reuse Goal status and Task feedback status to map open Tickets to settled
  Goal/Task sources.
- Add exact-empty `learning-clues` RPC handling.
- Test empty, created, merged, restarted, omitted unsafe/unlinked, and no-private
  field behavior.

## Task 2: strict client and unified UI

- Add `learningClues()` to the Learn Loop client with exact response parsing.
- Add the Improvement clues count/view inside the existing dialog.
- Add source-to-Goal and Task-feedback-to-clue navigation.
- Add Chinese and English messages through the existing locale namespace.
- Keep exactly one sidebar entry.

## Task 3: integration

- Run the focused host, client, and client-module tests.
- Run direct TypeScript checking and public document contracts affected by the
  new files.
- Review the diff for privacy leakage, stale counts, and duplicate UI surfaces.
- Use a fresh installed product only if the focused integration cannot exercise
  the real persisted Ticket read path; no Provider call is required.
- Commit, push Tianwen main, and take one exact-main CI snapshot.
