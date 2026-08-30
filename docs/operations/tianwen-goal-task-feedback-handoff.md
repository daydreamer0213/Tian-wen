# Tianwen Goal-first Task Feedback Handoff

## Product result

This stage is `task-passed`. Ordinary settled Goal-first v2 Tasks in the shared
Web/Desktop detail view can now submit explicit user feedback to Tianwen's
existing Learning Intake. Positive feedback records `no-case`; negative
feedback without a note records `observed-gap`; negative feedback with a
concrete note creates or merges a Learning Ticket. Reopening the Goal reads a
sanitized decision receipt without exposing the note or copying Session data.

The path reuses the Task's persisted DSH Session, the Task Goal's terminal
assistant message, `TianwenLearningIntakeService.consume`, and the existing
Evolution ledger. It does not add another ledger, model call, scheduler,
automatic Case, Candidate, Skill, or governed Outcome.

## Real product defect found and repaired

The first installed-product attempt completed its real DeepSeek Task and wrote
the expected file, but an immediate feedback request returned HTTP 500 with
`Settled Task Session has no anchored final assistant message`. The durable
event order was valid: `goal/change complete` appeared while the same Agent Turn
was still producing its closing message and before `turn/end`.

The initial helper assumed a settled Task implied an already closed Turn. A
looser message parser would have violated the existing Learning Intake contract,
which deliberately consumes only completed Turns. The product repair instead
uses DSH's public `Agent.whenIdle()` on a live Task Agent before opening its
final Session view. Cold Sessions remain strict. There is no polling loop,
timeout budget, hidden Task rerun, or feedback-specific worker.

The controller closed its precisely owned Web Host after the first failed
request, so that interrupted Turn was not reused as a passed proof. Its failed
feedback result remains unchanged. A separate post-fix Goal proved the repaired
installed product.

## Natural runtime evidence

- Final official installer receipt: status `ready`, DSH `0.1.1-rc.2`, pnpm
  `11.20.0`, Runtime archive digest
  `sha256:b61709a3875f461ad1565a42a634f8a24f65703a178407d38ae6c2b98e3bc04a`.
- Post-fix Long Goal:
  `tianwen-long-goal-51b21cfe-067b-49b1-9985-b638033c113e`.
- Planner Session: `f45c68e6-4832-4ced-8e7c-891f764d7455`.
- Settled Task: `f4aae346-a8c2-4b2c-98ca-3699c673d51f`, Session
  `session-0004125c-0590-4253-adc2-8bbff704b5ff`, phase `complete`.
- Tianwen planned one useful Task, created `feedback-proof.txt`, read it back,
  and left the exact trimmed content `TIANWEN_FEEDBACK_OK`.
- Immediately before the feedback RPC, the controller observed no persisted
  `turn/end` in that Task Session. The RPC waited for the live Agent to become
  idle, then recorded positive feedback successfully.
- The first feedback write returned `duplicate=false`, `decision=no-case`.
  The identical second request returned `duplicate=true`; a fresh status read
  returned the same item.
- The Evolution ledger contains one `learning-intake-recorded` event for this
  Task feedback and no Ticket identifier.
- The Planner and Task Sessions contain three persisted request headers and
  nine tool calls. All nine calls have results. These are runtime event counts,
  not Provider billing facts.

## Independent validation

- Runtime Bundle build, repository type checking, installed DSH shape check,
  private-import check, and `git diff --check`: passed.
- Learning Intake, Goal feedback, Web host, typed client, and rendered client
  suites: 89/89 passed.
- The focused Goal-first declared-host bundle boundary: 1/1 passed.
- Earlier focused review found and closed retry idempotency, immutable terminal
  anchoring, status cross-talk, and non-blocking detail-load issues; the reviewer
  approved the repaired slice with no remaining P1/P2 blocker.
- One bare full-suite invocation omitted the repository's required probe and
  Corepack environment. Its 99 environment/fixture failures have no product
  verdict; 891 unrelated tests passed in that invocation. It was not used as a
  completion gate.

## Learning facts

The post-fix positive judgment legitimately produced `no-case`. No Learning
Ticket, Case, Lesson, Candidate, Champion transition, or Skill was created. The
Agent's within-Task tool use and the host lifecycle repair must not be described
as a learned reusable Skill.

Negative-to-gap and negative-to-Ticket behavior is covered by deterministic
product tests, not by a fabricated negative real-product judgment.

## External facts

- Persisted assistant messages identify `deepseek-official / deepseek-v4-pro`.
- Runtime request-header and tool-event counts do not establish Provider invoice
  or quota usage.
- No controlled Activity was created.
- No external DSH repository was changed or pushed.

## Closed boundary and next step

Explicit Task feedback is now part of the ordinary Goal-first product path and
survives a status reread. It remains intentionally separate from automatic
Outcome intake. A future automatic Outcome feature must freeze a real verifier
contract before the Task's first Turn; `Goal complete` alone is not acceptance
evidence. More synthetic feedback runs would not add product value to this
closed slice.
