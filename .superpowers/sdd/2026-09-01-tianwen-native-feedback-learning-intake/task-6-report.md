# Stage 2 Task 6 implementation report

## Status

DONE WITH RECORDED GATE CONCERNS

Baseline: `24530ef93b5fb3a35bcaad90678c27de0c12c8b7`

Commit: `refactor: remove duplicate task feedback controls` (this report's
commit)

## Implemented

- Deleted Tianwen's Goal Task feedback storage module and its dedicated test.
  The runtime has no current-value feedback store, migration alias, or
  compatibility write path.
- Removed the `feedback-status` and `record-task-feedback` RPC handlers, their
  Host dependencies, client methods, response validators, listeners, and
  cleanup paths.
- Removed Goal detail Helpful/Needs improvement buttons, note form, mutation
  state, status loading, and associated locale strings. Complete and abandoned
  tasks now render through the same read-only task group as other tasks.
- Kept stock DSH per-message feedback as the only current feedback surface.
  Tianwen neither renders a replacement control nor stores a duplicate value.
- Kept Historical Learning Clue projection read-only. It derives source facts
  from Evolution intake status by execution Session and ticket, and exposes no
  feedback edit method or new local current store.
- Removed the deleted module from the Runtime Bundle allowlists without
  widening any other input closure.
- The Task 1 accepted-child v3 fixture already had matching durable Goal and
  Task objectives at this baseline, so no production guard or fixture change
  was needed.

## TDD evidence

- The first client RED had 17 passing tests and 1 expected failure because the
  old `feedbackStatus` method was still present.
- The complete product RED had 74 passing tests, 10 expected failures, and 1
  environment-gated product test skipped. The failures proved that the two old
  client calls and Host RPCs, duplicate Goal controls, old reload behavior, and
  old Learning Clue dependency still existed.
- After deletion and read-only projection rewiring, the planned four-file
  matrix passed 84 tests; the real-profile web test remained skipped unless its
  opt-in environment is available.

## Fresh verification

- Task 6 planned matrix: 3 files passed, 1 real-profile file skipped; 84 tests
  passed and 1 test skipped.
- Task 5 compatibility matrix: 4 files and 91 tests passed.
- Stage 1 main-chat and settlement critical regression: 8 files and 181 tests
  passed.
- Broad Stage 2 regression union: 17 files passed, 1 real-profile file skipped;
  360 tests passed and 1 test skipped.
- Official Runtime Bundle build passed before the compiled-client module test.
  The generated client and runtime metadata contain no removed endpoint or
  module name.
- Complete workspace typecheck, forced Runtime Bundle, Runtime, and Evolution
  TypeScript builds, and public DSH import scan passed.
- The exact four-symbol scan returned zero matches under product, test, and
  script TypeScript sources. Deleted files are absent and `git diff --check`
  passed.
- The installed Runtime Bundle dependency scan still finds stock DSH's native
  message-feedback UI and service packages; Tianwen does not shadow them.

## Recorded gate concerns and stage boundary

The full `runtime-bundle.spec.ts` currently reports 56 passing and 5 failing
tests because its existing closed-input and peer lists do not include several
already-present baseline entries such as subagent, sandbox, evidence, and
native message-feedback inputs. Task 6 did not create those entries. Per scope,
this change removes only the deleted Goal Task feedback module from the
allowlists and does not broaden unrelated closures.

The real signed-in web-product scenario remains environment-gated; its contract
now asserts stock DSH message feedback is in the client graph and that both
removed RPCs are rejected with the exact invalid-request result when enabled.
The remaining end-to-end execution belongs to the later acceptance gate.

This report claims Task 6 only. Independent review and later stage tasks remain;
Stage 2 completion is not claimed here.
