# Goal-first Task feedback product design

**Date:** 2026-08-30

## Product problem

The Goal-first Desktop path can plan and run ordinary Tasks, but a user's judgment of a settled Task does not enter Tianwen's existing Learning Intake. Evidence is projected for status reads only. Controlled runs and natural-trial manifests are not an acceptable substitute for the ordinary product path.

## Frozen minimal slice

- Add feedback to settled Goal-first v2 Tasks in the existing long-Goal detail view.
- Accept `positive`, or `negative` with an optional concrete note.
- Bind feedback to the Task's persisted DSH Session and its final completed assistant message.
- Reuse `TianwenLearningIntakeService.consume`; do not create a second ledger or another Agent runtime.
- Persist and redisplay a sanitized receipt: positive becomes `no-case`, negative without a note becomes `observed-gap`, and negative with a note creates or merges a Learning Ticket.
- Keep feedback independent from Goal/Task state: a learning write failure must not change the Task, Goal, or DSH Session.
- The host compares the anchored final message and a private normalized feedback fingerprint before writing. An identical retry reuses the latest intake; a changed judgment derives a new version from the preceding intake.
- If the Task Goal becomes complete before its DSH Turn closes, the host awaits the live Agent's public `whenIdle()` boundary before reading the final message. It does not poll, rerun the Task, or weaken Learning Intake's completed-Turn requirement.

## Boundaries

- Only `complete` and `abandoned` Tasks are settled. A blocked Task may still continue and is not accepted until it is abandoned or completes.
- This slice does not call a model, rerun a Task, open a Learning Case, create a Candidate, or claim that a Skill was learned.
- Ordinary Task completion is not treated as a governed Outcome. That requires a verifier contract frozen before the first Turn and remains separate work.
- Tool errors inside an otherwise repaired Task are not automatically promoted into reusable learning signals.

## Acceptance

1. Feedback from a settled ordinary Goal-first Task reaches the existing Evolution ledger and is visible again after reopening the Goal.
2. Feedback for active, pending, paused, or blocked Tasks is rejected without mutation.
3. The DSH Session event log is unchanged by intake.
4. Existing v1 and Goal-first planning/execution behavior remains compatible.
5. Focused tests, runtime bundle build, installed-product audit, and one meaningful real-product check pass.
