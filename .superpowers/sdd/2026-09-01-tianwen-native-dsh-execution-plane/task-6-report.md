# Task 6 Report: Main-chat Long Goal progress and exact-once offline settlement

## Status

Implemented in the Task 6 commit `feat: report Long Goal progress in the main chat`.

The main conversation is now the only user-facing progress and settlement surface. Online progress uses the public DSH `reportFrom()` path from the exact Planner child. Online completion is left to native DSH settlement. Tianwen keeps only durable progress facts, a coalescing liveness lane, the existing attempt event history, and one terminal-delivery cursor for offline reconciliation.

## Implementation

### Main-parent liveness

`long-goal-liveness.ts` implements one in-memory lane per persisted main parent id:

- a real durable stage change reports immediately;
- first liveness repeats after `120_000` ms;
- later liveness repeats every `300_000` ms;
- a real stage change resets the first-liveness timer;
- timestamp-only record refreshes do not fabricate a stage change or reset the timer;
- sibling Long Goals under the same main parent coalesce into one report;
- blocked and terminal sources are removed immediately, and the lane stops when its last source stops.

The report body is deterministic. It contains only persisted `stage`, `lastCompletedAction`, `waitingFor`, and `nextAction` values. It does not include the objective, percentage guesses, timestamps, model prose, navigation instructions, Planner/Task links, or approval controls.

`continuous-goal-host.ts` derives these facts from the v3 record and read-only status projection. It reports through:

```ts
ctx.subagents.reportFrom(exactPlannerAgent, content, {
  delivery: 'next-step',
  signal,
})
```

There is no second scheduler, provider, child factory, or direct main-chat Agent creation.

### Accepted-before-bind cold adoption

The v3 Task path still reserves and persists one exact child id before native start. When public DSH reports `DUPLICATE_CHILD`, Tianwen no longer classifies the accepted attempt as provisioning failure and no longer reserves another epoch. It uses the public continuable follow-up path with that exact persisted Planner parent and exact child id, then:

- requires the exact attached Agent;
- validates the durable Session headers;
- reuses an already durable matching Goal instead of creating another Goal;
- binds the existing attempt once;
- returns the current status without starting another Task identity.

The restart test proves one accepted child id, one epoch, one Goal, one binding, no direct `agents.create`/`agents.resume`, and no duplicate Task start after another host restart.

### Terminal attempt cursor

Before Tianwen advances after a native Task terminal event, it inspects the exact persisted Task Session and exact Planner lineage, finds the matching public `goal/change`, and folds one existing `attempt-settled` event with the stable id:

```text
goal-change:<exact-child-session-id>:<event-seq>:<operation>
```

Restart replay is idempotent: an already terminal attempt is left unchanged. Permission-limited and interrupted attempts are not converted to settled attempts.

### Native online settlement and offline fallback

The old normal delivery path for start, advance, planning failure, attention, completion, and block has been removed. Start and advance use native progress reports. Online completion and block record only the durable terminal attempt; DSH owns child settlement into the live main conversation.

Offline reconciliation now accepts only an exact `settled` attempt and performs this sequence:

1. reread the v3 terminal attempt and terminal-delivery cursor;
2. inspect the exact main Session and exact terminal Task Session;
3. if an exact persisted `subagent-settled` Planner Turn after the terminal event already has a completed assistant reply, append only `terminal-delivery-observed`;
4. otherwise, if the exact main Agent is now live and authoritative state is unchanged, send one deterministic guarded follow-up Turn with all tools disabled;
5. flush and reinspect the main Session;
6. append `terminal-delivery-observed` only after the exact notice id and completed reply Turn are durable.

A progress `subagent-report` is deliberately not accepted as terminal settlement. A failed follow-up, failed flush, missing persisted reply, missing live main Agent, changed status, or changed Agent identity leaves the cursor unacknowledged. None of those paths call Task start, reserve an epoch, change the Task binding, or write feedback/learning state.

Permission-limited attempts fail closed before main Session delivery. They keep their exact `permission-limited` attempt, null Task execution, and absent terminal-delivery cursor, with no settlement, feedback, or learning pollution.

## TDD RED and GREEN evidence

The pre-change focused baseline passed 3 files and 82 tests.

### Liveness and deterministic facts

- RED: `long-goal-liveness.js` did not exist, so the new fake-timer suite failed during collection.
- GREEN: immediate coalesced stage reporting, 120-second first liveness, 300-second repeat, stage-reset timing, and immediate blocked/terminal stop passed.
- RED: a changed timestamp with identical visible facts produced an extra immediate report and reset the timer (`expected 1`, received `2`).
- GREEN: visible durable fields now define a real stage change; `changedAt` remains the persisted time carried by the fact but is not rendered and does not create a report by itself.
- RED: active progress duplicated the current Task objective as `nextAction` (`expected undefined`, received `Publish` / `Verify`).
- GREEN: `nextAction` is now only a later persisted pending Task.
- RED: `buildLongGoalProgressReport` did not exist.
- GREEN: exact output contains only the four authorized durable fields and excludes objective, percentage, and timestamp material.

### Public native reporting and online settlement

- RED: the Host still called ordinary `deliver` for reconstructed start/advance and online complete/block transitions.
- GREEN: active transitions call the exact Planner `reportFrom` seam; online terminal transitions record the attempt and call zero fallback deliveries.
- RED: background planning failure and Task approval still queued ordinary feedback delivery.
- GREEN: both are left to native DSH; no fallback notice, approval UI, navigation instruction, or control-state mutation remains.

### Accepted-before-bind restart

- RED: public `DUPLICATE_CHILD` rejected the current durable running attempt as an error.
- GREEN: public exact-id follow-up cold-adopts it, reuses its matching durable Goal, binds once, and a fresh restart returns the same running binding with no Task start, Goal creation, or new epoch.

### Offline exact-once settlement

- RED: the old delivery code could not acknowledge the persisted offline completion Turn and could not distinguish native settlement from fallback.
- GREEN: the fallback Turn is acknowledged only after flush plus persisted main-Session confirmation; a second call sends nothing.
- GREEN: an already persisted native `subagent-settled` Planner completion Turn wins with zero fallback send.
- RED: a persisted Planner `subagent-report` after the terminal event was incorrectly accepted as settlement (`expected false`, received `true`).
- GREEN: only exact native `subagent-settled` represents terminal settlement.
- GREEN: follow-up failure leaves no delivery acknowledgement, one attempt, and the exact original Task binding; no Task rerun occurs.
- RED: a permission-limited attempt entered the fallback path and failed only after trying to create a settlement Turn.
- GREEN: only `settled` attempts are eligible; permission-limited state remains unchanged and produces no follow-up or delivery cursor.
- GREEN: a missing/offline exact main Agent returns unacknowledged without cold-resuming or acquiring a lookalike Agent.

## Verification

Task 6 focused gate:

```powershell
pnpm vitest run tests/dsh-migration/long-goal-liveness.spec.ts tests/dsh-migration/continuous-goal-feedback.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/settled-task-result.spec.ts
```

Result: 4 files passed, 90 tests passed.

Task 5 permission and native public-API regressions are included in the final combined gate:

```powershell
pnpm exec vitest run tests/dsh-migration/long-goal-liveness.spec.ts tests/dsh-migration/continuous-goal-feedback.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/settled-task-result.spec.ts tests/dsh-migration/permission-attempt.spec.ts tests/dsh-probe/native-continuable-subagent.spec.ts tests/dsh-probe/dsh-public-reuse-surface.spec.ts
pnpm --filter @tianwen/runtime-bundle typecheck
```

Result: 7 files passed, 105 tests passed; Runtime Bundle `tsc -b --pretty false` exited 0.

Static gates:

- changed production imports contain no private DSH `/lib` or `/src` path;
- deleted `long-goal-subagent.ts` remains absent;
- no second scheduler/provider/direct Task Agent factory was introduced;
- `git diff --check` exits 0.

## Self-review and concerns

No contract, native adapter, scheduler, UI, routing, feedback, learning, or `settled-task-result.ts` change was required.

The offline fallback intentionally does not cold-resume the main Agent. If the main parent is still offline, reconciliation remains unacknowledged and waits for the ordinary public `agent/created` recovery trigger. This preserves user control and prevents hidden background model work.

The deterministic fallback notice remains guarded and tool-disabled because it is the final recovery path after native DSH settlement is absent. It cannot execute tools or rerun a Task.
