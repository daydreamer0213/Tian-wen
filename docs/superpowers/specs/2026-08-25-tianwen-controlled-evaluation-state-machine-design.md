# Controlled evaluation arm lifecycle design

## Problem

Activity-09 proved that lazy evaluation creates only the baseline arm first, but the first candidate
arm stopped before a durable Run binding. The persisted result is useful but insufficient: the arm
coordinator currently places Agent creation, runtime-surface validation, Run binding, model execution,
and Agent disposal in one `try/catch`. Any exception becomes `run-fact-mismatch`, and the one-shot
runner then collapses every stopped arm to `evaluation-failed`.

This is a core lifecycle defect. It prevents the product from identifying which state transition failed
and encourages speculative fixes. It is not primarily a receipt-format or security problem.

Read-only installed-Profile diagnostics have already ruled out the following causes without invoking a
Provider: candidate Skill scoping/version, tool schema digest, cwd, Agent options, Session identity,
workspace snapshot equality, ledger replay, direct candidate binding, baseline disposal followed by
candidate binding, and the same sequence with an offline model turn, Session flush, tool restriction,
and tool guards.

## Product model

Each controlled evaluation arm has five ordered phases:

1. `create` — create and configure exactly one Agent.
2. `validate` — verify frozen Skill, tool schema, cwd, and Agent options.
3. `bind` — persist the Run binding and Skill manifest before any Turn.
4. `execute` — run one bounded model turn and close its governed facts.
5. `dispose` — release the exact Agent before the next arm is created.

The coordinator must preserve the first failed phase. A later cleanup failure may replace success, but
must not overwrite an earlier business failure.

## Decision

- Keep the existing single-arm-at-a-time architecture.
- Replace the blanket arm catch with explicit phase boundaries.
- Add finite arm stop reasons for `agent-create-failed`, `run-binding-failed`,
  `agent-dispose-failed`, and `workspace-drift`.
- Keep `root-skill-drift` only for actual Skill/tool/cwd/options validation mismatch.
- Keep existing execution reasons (`provider-failed`, `persistence-unavailable`, tool/time limits,
  request/evidence/Run-fact mismatches) unchanged.
- Preserve the stopped arm reason through the controlled one-shot runner. Map it to a finite top-level
  lifecycle reason instead of reducing every stopped arm to `evaluation-failed`.
- Do not include raw errors, paths, task material, or Provider output in the receipt. This is a
  consequence of the typed state machine, not a new security subsystem.

## Tests

Tests must first show that the current code collapses:

- candidate Agent creation failure;
- candidate Run binding failure;
- candidate disposal failure; and
- candidate workspace drift.

GREEN must prove each has a distinct finite reason, no later arm starts, and durable Run facts reflect
only phases that actually closed. Existing successful 10-arm sequencing and all current execution
failure semantics must remain unchanged.

The Runtime Bundle runner test must prove the exact stopped arm reason reaches the public controlled
lifecycle receipt. A subsequent fresh installed activity is the only test that can classify the
Activity-09 real-provider failure; no Activity-09 rerun is allowed.

## Non-goals

- No retry, budget, transaction, rollback, telemetry, diagnostic framework, or second coordinator.
- No Provider-specific branch.
- No weakening of Skill, workspace, Session, or evidence contracts.
- No claim that this change already fixes the unknown Activity-09 failure; it makes the real state
  transition observable and prevents another speculative patch.
