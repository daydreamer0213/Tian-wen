# Continuous Goal Feedback Reliability Design

Date: 2026-09-01

## Problem

A real Desktop run exposed three connected failures:

1. Tianwen stamped Planner and Task Sessions with DSH subagent lineage metadata but did not append the durable `subagent/descriptor` event required by DSH. The subagent catalog therefore classified readable Session logs as corrupt.
2. A background Task reached `approval/asked`, but the only actionable surface was the corrupt child entry. The control conversation did not explain that user action was required.
3. Active progress delivery depended on the control Agent already being live. When it was cold, delivery returned `false`; unlike terminal recovery, an already-advanced active state did not recreate that notice, so the conversation stayed stale.

The fix must make future real runs understandable without rewriting historical Session logs or approving privileged work on the user's behalf.

## Selected Approach

Use DSH's existing subagent record contract, the existing guarded conversation-notice path, and the existing Agent resume mechanism. Do not add another scheduler, status database, or custom child-session UI.

Planner and Task Sessions remain Tianwen-owned background executions. They are exposed as read-only, one-shot-style subagent records for navigation: users may inspect their history and act on native approval controls, but may not send arbitrary follow-ups that bypass the Long Goal coordinator.

## Child Session Contract

When a v3 Planner or Task Session is first created:

- keep the existing `parentSession`, `origin: "subagent"`, and `delegationDepth` header fields;
- append one supported DSH `subagent/descriptor` during the first entered turn;
- use a stable Tianwen provider identifier and a useful label such as `Long Goal Planner` or `Task 2: Verify the result`;
- do not append another descriptor on cold resume.

The implementation will use the installed `@deepseek-ai/dsh-subagent` descriptor snapshot API instead of reproducing its schema. This makes DSH's catalog projection the single classifier and restores normal child navigation.

Historical malformed Sessions are not rewritten by this change. They remain evidence for this incident; the formal acceptance run creates fresh Sessions under the corrected contract.

## Progress Delivery

All start, advance, attention, blocked, planning-failed, and complete notices use the existing guarded feedback turn:

- tools are disabled for that notice turn;
- the authoritative Goal state is re-read before delivery;
- an equivalent durable notice and assistant reply suppresses duplicates;
- the control Session is flushed after the reply.

If the control Agent is cold, the Host temporarily resumes the exact persisted control Session with its recorded preset and the current model route, delivers the notice, waits for the Agent to become idle, flushes it, and releases the temporary handle. If another live Agent already owns the Session, the Host uses that exact Agent and does not dispose it. A failed or stale acquisition returns a retryable `false` result instead of changing Goal state.

Active delivery failures remain reconstructable. When the control Session becomes live again, the Host infers the current `start` or `advance` notice from authoritative status; durable notice matching prevents repeats.

## Approval Attention

The Host observes `approval/asked` only for the exact active Task bound to a running v3 Long Goal. It records an attention delivery containing the approval identity, tool name, optional reason, Task position, and child Session identity.

The resulting guarded main-conversation reply must state:

- progress is paused waiting for the user;
- which Task needs attention;
- that the user should open the top-left subagent catalog and select the named Task;
- that Tianwen has not approved or denied the request automatically.

The approval identity is part of the delivery key, so one request produces at most one durable main-conversation notice. Ordinary Task execution continues through DSH's native approval decision path.

## Failure Handling

- A malformed or unrelated subagent is not repaired or reclassified by Tianwen.
- An approval event from a non-current or unbound Session is ignored.
- A delivery built from stale Goal state is rejected before a notice turn starts.
- Temporary control-Agent acquisition is released after idle even when delivery fails.
- Delivery failures are reported but never mutate Task or Goal completion state.

## Test Strategy

Implementation follows test-first development:

1. A creation test must first fail because a new Planner/Task has no supported descriptor, then pass with the expected read-only label and lineage.
2. A Host test must first fail because `approval/asked` produces no main-conversation delivery, then pass with one exact attention intent and no duplicates.
3. A delivery test must first fail when the control Agent is cold, then pass by acquiring, delivering, flushing, idling, and releasing the exact Session.
4. A recovery test must prove a previously missed active transition is reconstructed when the control Agent returns, while durable notice matching prevents duplicate replies.
5. Existing targeted and package regression suites must remain green.

## Formal Desktop Acceptance

Automated tests are necessary but not sufficient. After installing the rebuilt Runtime into the formal DSH Desktop environment, perform a new short user-style Goal from the visible conversation UI:

1. submit the Goal and confirm the command returns promptly;
2. observe a plan/start reply in the main conversation;
3. open the subagent catalog and confirm every new Planner/Task row has a readable label, mode, activity, and history;
4. create one controlled condition that requires user attention and confirm the main conversation announces it before the user opens the child;
5. resolve the condition through the visible child surface;
6. confirm the next progress update and final result appear in the main conversation without manually sending a wake-up message;
7. inspect the persisted Sessions and Goal record to confirm no duplicate notices or corrupt descriptors.

Do not claim completion or hand the build to the user unless this formal Desktop path succeeds. If the scenario fails, preserve the evidence, diagnose it, and continue the repair.

## Excluded Work

- Migrating or deleting the four historical Sessions from the reported run.
- Automatically granting or denying privileged operations.
- Replacing Tianwen's Long Goal coordinator with DSH's continuable-subagent manager.
- Adding a second progress dashboard or polling service.
- Refactoring unrelated Goal, Activity, evidence, debug, or legacy data paths.
