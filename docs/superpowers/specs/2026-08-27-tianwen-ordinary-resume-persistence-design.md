# Ordinary Goal Resume Persistence Failure Design

## Product problem

Ordinary `tianwen resume` runs a durable Goal, waits for the Goal to settle, then
flushes the resulting DSH Session.  The current ordinary path ignores the
flush result and can return a successful `tianwen.goal-resume.v1` receipt even
when persistence explicitly returned `false`.

That is a product-state error: the Goal may already have executed in memory,
but Tianwen cannot honestly confirm that the settled state is durable.  The
command must not report success in that case.

This is independent of Natural Run learning intake.  The create path and the
Natural Run path already treat persistence unavailability as failure; the gap
is the ordinary resume path.

## Selected behavior

After one ordinary Goal resume settles:

- a successful persistence result preserves the existing receipt, counts, and
  exit behavior;
- persistence returning `false` or rejecting produces one deterministic,
  non-zero command failure instead of a success receipt;
- the failure does not expose a storage path or the underlying exception text;
- the Agent handle is still released;
- Tianwen does not retry persistence, resume the Goal again, or issue another
  model request to manufacture a success.

The failure means "the settled result could not be confirmed durable."  It
does not claim that the Goal never ran, and it does not attempt to roll back
already-produced DSH events.

## Alternatives not selected

1. **Retry the flush or the Goal.** Rejected because a second Goal resume can
   repeat real work, while a flush retry introduces policy and timing that the
   product does not currently define.
2. **Return a successful receipt with an uncertainty flag.** Rejected because
   this expands the public receipt schema while still making shell success
   ambiguous.
3. **Add a recovery ledger or persistence framework.** Rejected as unnecessary
   for the concrete state-transition bug.

## Frozen black-box acceptance

1. A deterministic ordinary Goal reaches a disarmed settlement, then final
   persistence returns `false`: no success receipt is returned, the CLI exits
   non-zero with a fixed safe error, and there is exactly one Goal resume/model
   execution.
2. The same scenario with persistence rejection has the same external failure
   semantics and does not leak the original exception.
3. Persistence success preserves the existing ordinary receipt, event counts,
   model-request count, and exit zero.
4. Every path disposes the resumed Agent handle.  No failure path retries the
   Goal or persistence.
5. Existing Natural Run and live-smoke persistence behavior remains unchanged.

Focused regression coverage belongs with the existing ordinary Goal resume
tests in `tests/dsh-migration/goal-resume.spec.ts`.  The implementation should
remain within the current Runtime Bundle owner and must not change DSH,
dependencies, lockfiles, Profile, installer, receipt schemas, or learning
semantics.

## Natural-task boundary

The evaluated Agent receives the symptom, repository, allowed tools, and the
black-box acceptance above.  It is not told which expression or helper to
change.  The controller independently runs the focused test, relevant Runtime
Bundle tests, and the full repository gates after exactly one ordinary Agent
Turn.
