# Tianwen ordinary long-Goal Tasks handoff

## Conclusion

This phase adds the missing ordinary installed-product path for one authored
long Goal to continue across multiple ordered business Tasks.  It does not
replace Tianwen's existing single-Goal persistence/resume, Evolution Run
binding, controlled multi-task lifecycle, or historical Alpha models.

Each Task owns a distinct ordinary DSH Goal and Session.  Tianwen persists only
the authored plan and those execution bindings, derives current state from the
existing DSH Goal projection, and can select the next Task after a process
restart.  No automatic decomposition, DAG, scheduler, daemon, retry system,
Desktop panel, formal Tianwen Run receipt, or learning decision was added.

Branch: `codex/tianwen-ordinary-goal-tasks`

Base: `d078e408af1d19b8a81879043daf82a6e44a91b0`

Implementation head before this handoff: `a0aa7f1b736e978cf84e7688e968bfae554cfe0f`

The commit containing this document is the canonical phase handoff head.

## Product surface

The Runtime CLI now provides:

```text
tianwen plan create --objective TEXT --task TEXT --task TEXT TARGET [--max-rounds N] [--json]
tianwen plan status --goal LONG_GOAL_ID TARGET [--json]
tianwen task run --goal LONG_GOAL_ID TARGET [--json]
```

`TARGET` retains the existing managed and portable Profile forms.  A managed
plan is stored under `<data-dir>/state/long-goals`; a portable plan is stored
under `<state-root>/long-goals`.

The first `task run` for an unbound Task calls the existing Goal-create path
once, captures its Goal/Session receipt, persists the binding atomically, and
then uses the existing resume path.  A bound active Task resumes the same
Session.  A later Task is selected only after all earlier Tasks project as
complete.  A complete long Goal performs no create or resume launch.

## Durable and failure boundaries

- Long Goal IDs are canonical and cannot escape the `long-goals` directory.
- Task IDs are stable ordinal `task-N` values.
- Execution bindings must form a continuous prefix and use unique Goal IDs and
  unique Session IDs across Tasks.
- Durable corruption, Session mismatch, an out-of-order binding, or a bound
  later Task after the first incomplete Task fails closed.
- Captured Goal-create failure preserves the child exit code, stdout, and
  stderr.  There is no automatic retry or replacement Goal.
- Derived phase and progress are not persisted; `plan status` reuses the
  existing `readGoalStatus()` projection.

These Task bindings are product execution state, not formal Tianwen Run
bindings and not learning evidence.

## Verification

Implementation and review used focused TDD and independent, read-only review.
The final source review found no remaining Critical or Important issue.

The final controller gate rebuilt the Runtime Bundle and then passed:

- 7 relevant test files, 151/151 tests;
- Runtime Bundle typecheck;
- the private DSH import boundary check, with zero violations;
- `git diff --check`.

An earlier one-time broad `pnpm run check` reported 861 passed, 17 skipped, and
2 failed tests.  Both failures were in the Runtime Bundle spec because that
local command reached tests with stale/unbuilt `dist` artifacts.  After the
normal Runtime Bundle build, the stale-artifact failures disappeared and one
real exact-input allowlist mismatch remained for the two new CLI source files.
That narrow test boundary was corrected and the Runtime Bundle spec passed
45/45.  The entire broad suite was deliberately not rerun: the product defect
and its affected boundary had already been isolated and verified, so repeating
hundreds of unrelated tests would add environment noise rather than evidence.

No Provider credential, Provider/model call, installed-product natural task,
Desktop process, controlled Activity, or DSH upstream push was used in this
phase.  Therefore this handoff makes no natural-runtime, learning, billing, or
external-publication claim.  Exact-main CI remains the post-integration gate.

## Deferred, non-blocking scope

Portable target parsing and `plan status` have direct CLI coverage.  Portable
`task run` is covered through the same resolved-target orchestration seam but
does not yet have its own command-line subprocess case.  This is a small test
coverage note, not a known product failure, and does not justify another broad
acceptance cycle.
