# Tianwen Native Conversation Progress Design

Date: 2026-08-31

Status: delivered in Runtime 0.1.8 and Desktop 0.1.0-preview.9; ordinary user acceptance remains natural future use

## Decision

The ordinary DSH transcript is Tianwen's only primary interaction surface.
`/goal <objective>` starts the continuous Goal, but Tianwen must then speak as
an ordinary assistant in that same conversation. It must not render a separate
Goal card above the composer.

The existing Long Goal panel remains optional history and diagnostics. Users
do not need it to understand or control current work.

This design supersedes the Runtime 0.1.7 `conversation.input.dock` design.

## User experience

Tianwen adds one concise ordinary assistant reply at these durable boundaries:

1. initial planning has selected and started the first Task;
2. one Task settles and replanning starts the next Task;
3. the current Task blocks; or
4. Goal execution completes and is ready for review.

The reply says what just finished when that result exists, what is running now,
or what requires attention. It uses the language of the existing conversation.
It does not expose internal IDs, Planner reasoning, tool events, request counts,
or inferred Provider cost.

Natural user messages remain the control surface. A user can add direction,
ask for status, pause, resume, or correct the Goal in ordinary language. DSH's
native stop button still pauses/cancels the current execution path; Tianwen does
not wake the Provider merely to narrate that button press.

## Architecture

DSH rc.2 has no public API for appending a durable assistant message without
a model Turn. Tianwen therefore reuses the existing bound control Agent:

- the Host records a process-local delivery intent only after durable Goal
  state is readable;
- delivery waits outside the per-Goal lane for the exact control Agent to be
  idle, so Goal control cannot deadlock with feedback;
- it rereads the exact Goal revision, phase, current Task, execution binding,
  and control Session before delivery;
- it sends a bounded plugin notice through `Agent.followup`;
- a Turn-scoped guard disables every tool and Goal-control action; and
- the resulting model-produced assistant message is flushed through normal DSH
  Session persistence, so it appears and restores like any other reply.

Initial and Task-boundary notices include only the current Task and, after a
transition, the newest settled Task result as untrusted historical data.
Terminal notices keep the existing bounded settlement bundle. Every notice is
best-effort with no persistent retry ledger: stale state, a missing Agent, or a
Provider failure suppresses the message without changing durable Goal truth.

The browser client no longer registers `conversation.input.dock`; its projection
module, refresh machinery, locale copy, and dock tests are deleted rather than
left as a hidden second UI.

## Cost and noise boundary

This produces one short Provider Turn per meaningful Task boundary. It does not
produce a Turn for Planner internals, tool events, percentage changes, native
stop acknowledgement, or background polling. Fast consecutive transitions may
make an older intent stale; the older message is then dropped instead of shown
late.

## Compatibility

- The v3 Goal/Task state model, Planner, Task Sessions, result-aware replanning,
  restart recovery, and natural-language control contract are unchanged.
- V1/v2 history and explicit manual flows remain available in the optional
  panel.
- CLI users retain the same Runtime and Goal engine; no Desktop-specific
  execution dependency is introduced.
- No DSH upstream patch, custom Session event, forged assistant event, polling
  loop, scheduler, or notification database is added.

## Verification

Focused tests must prove:

1. the client registers no `conversation.input.dock` component;
2. start and advance notices contain the exact current Task, with only the
   newest settled result on advance, and no internal identity;
3. duplicate transitions deduplicate process-locally;
4. stale revision/current-Task/control-Session state is not delivered;
5. feedback Turns cannot execute tools and their Session is flushed; and
6. complete and blocked settlement behavior remains intact.

Installed-product acceptance is one normal future `/goal` use, not a synthetic
Activity or repeated Provider run selected for a better answer.
