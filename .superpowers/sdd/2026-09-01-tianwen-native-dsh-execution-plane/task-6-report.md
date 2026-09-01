# Task 6 Report: Main-chat Long Goal progress and exact-once offline settlement

## Status

Implemented in the Task 6 commit `feat: report Long Goal progress in the main chat`.

The main conversation is now the only user-facing progress and settlement surface. Online progress uses the public DSH `reportFrom()` path from the exact Planner child. Online completion is left to native DSH settlement. Tianwen keeps only durable progress facts, a coalescing liveness lane, the append-only attempt and terminal-boundary evidence, and one terminal-delivery cursor for offline reconciliation.

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
3. if an exact persisted Planner `subagent-settled` inbox admission occurred after the durable pre-terminal boundary, and that exact message id was later claimed in a completed main Turn, append only `terminal-delivery-observed`;
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

No native adapter, scheduler, UI, routing, feedback, learning, or `settled-task-result.ts` change was required. Fix round 2 adds one authorized append-only event to the existing Long Goal v3 contract; legacy v3 records remain valid and are never rewritten.

The offline fallback intentionally does not cold-resume the main Agent. If the main parent is still offline, reconciliation remains unacknowledged and waits for the ordinary public `agent/created` recovery trigger. This preserves user control and prevents hidden background model work.

The deterministic fallback notice remains guarded and tool-disabled because it is the final recovery path after native DSH settlement is absent. It cannot execute tools or rerun a Task.

## Fix round 1: serialized recovery and causal native settlement

Independent review found four recovery races. All four were reproduced RED and fixed within the Task 6 production/test ownership; no contract, native adapter, scheduler, provider, UI, feedback, learning, or Task factory change was required.

### Authoritative startup revision

Startup reconciliation previously passed the pre-fold status revision to offline delivery after `recordTerminalAttempt()` had appended the terminal attempt at the next revision. The delivery state fence therefore rejected its own fresh write. Reconciliation now rereads the authoritative status after every startup terminal fold before it queues offline recovery.

- RED: a mounted running attempt plus persisted terminal `goal/change`, empty main Session, and live main Agent sent zero fallback Turns.
- GREEN: the same single mount sends one fallback Turn and records one acknowledgement against the post-fold revision.

### Causal native-settlement correlation (superseded in fix round 2)

Round 1 proved that timestamps and settlement summaries cannot correlate repeated settlements from the same Planner Session. Its quiet-report marker experiment was removed in full during fix round 2 because even a quiet `reportFrom()` item enters the main Session surface. The final implementation uses only a durable Long Goal boundary plus the public DSH inbox-admission event described below; no Tianwen marker content is sent to the main Session or model.

### Offline singleflight and final Agent fence

Offline recovery now reuses one in-flight Promise per exact terminal delivery key. Two concurrent callers therefore share one guarded main Turn. Immediately before `followup()`, the guarded path performs one final exact Agent object and Session identity claim with no intervening `await`.

- RED: `Promise.all()` sent two fallback Turns for one terminal event.
- GREEN: both callers resolve from one follow-up and one flush.
- RED: replacing main Agent A with Agent B during the second inspection still sent through stale A.
- GREEN: replacement yields zero send and zero acknowledgement.

Acknowledgement still requires flush plus reinspection of the exact persisted notice/reply Turn. Send or persistence failure remains unacknowledged and never reruns the Task.

### Source-owned liveness reporters

Each active liveness source now stores its durable fact together with its exact Planner reporter. Coalescing still occurs per main parent, but when the newest source terminates the remaining source reports from its own exact Planner. Terminal removal uses only durable parent/source identity and state, so it does not depend on a Planner still being live.

- RED: after P2 terminated, P1 liveness was sent through P2.
- GREEN: P1 fact is sent through P1's reporter.
- RED: a terminal source with a missing Planner remained scheduled and emitted another report.
- GREEN: terminal observation removes it immediately without a live lookup.

### Fix round 1 verification

Focused Task 6 gate: 4 files passed, 102 tests passed.

Combined Task 5/public DSH regression gate: 7 files passed, 117 tests passed.

Runtime Bundle typecheck (`tsc -b --pretty false`) exited 0. `git diff --check` exited 0. Changed production imports use only public DSH package surfaces; no second scheduler/provider, direct child Agent factory, or private `/lib` or `/src` import was added.

## Fix round 2: persisted terminal-delivery causality

Independent review rejected the quiet-marker experiment because a marker was still a main-Session message. Fix round 2 removes that code and replaces it with one append-only Long Goal boundary event. No marker parser, marker `reportFrom()`, marker payload, or marker delivery wait remains in production.

### Durable boundary contract

On the exact Task `goal/change` complete/block callback, the Host synchronously reads the current public main Session event tail and appends `terminal-delivery-boundary` before returning from the callback. The event records only the exact Task, attempt epoch, terminal event id, Planner parent Session id, and `mainInboxBoundarySeq`. It is not a Session message and therefore never enters the main surface or model input.

The append is accepted only for the exact current running attempt. A matching `attempt-settled` may follow it; permission-limited, provisioning-failed, a different terminal id, a different epoch/parent, or a second boundary is rejected. The event is append-only and optional, so existing six-key v3 records still load byte-for-byte without a rewrite.

- RED: the append function and projection did not exist.
- GREEN: the boundary persists once before the matching settled attempt and survives reload.
- GREEN: the legacy six-key v3 compatibility test still passes.

### Exact inbox admission correlation

The final native-delivery check uses only public DSH event fields:

1. find `agent/inbox/spliced` after the durable boundary;
2. require an inserted message whose source is exact Planner `subagent-settled`;
3. retain that admission event sequence and message id;
4. require a later `user/message` claim with the same id and exact Planner source;
5. require a non-empty assistant reply and completed/max-tokens end for that claim's Turn.

An old admission with `seq <= mainInboxBoundarySeq` is rejected even if its claim is later and every timestamp is identical. A claim that precedes its matching admission is also rejected. No timestamp, summary, content text, or cross-Session guess participates.

- RED: a current admission after the boundary was not recognized after marker removal.
- GREEN: admission `seq > boundary`, same-id later claim, and completed Turn acknowledge with zero fallback.
- GREEN: admission `seq == boundary` plus later claim remains unacknowledged at timestamp `1000`.
- RED: a same-id claim placed before its admission was incorrectly accepted.
- GREEN: the claim must have a greater event sequence than its exact admission.

### Public ordering proof and crash matrix

A real public DSH probe runs a continuable Planner through a tool gate and completes its real Goal. The synchronous Task `goal/change` listener observes the main tail first. Only after that callback returns does public DSH append the exact Planner `subagent-settled` through `agent/inbox/spliced`; the observed admission sequence is greater than the captured boundary. The persisted main Session contains no Tianwen marker payload. This proves the production capture point has no `await` window before settlement admission.

The restart and fallback matrix is:

- boundary durable, terminal fold absent: restart reuses the same boundary and exact terminal event, folds one settled attempt, recognizes the post-boundary native Turn, and appends one acknowledgement;
- boundary absent, no exact Planner settlement evidence: the existing deterministic tool-disabled fallback may run, then flush/reinspect before acknowledgement;
- boundary absent, exact Planner admission or claim present: the state is causally ambiguous and remains observable as a settled attempt with no boundary and no delivery cursor; reconciliation returns pending with zero fallback, zero acknowledgement, and zero Task rerun;
- boundary present, exact post-boundary admission present but not yet claimed/completed: reconciliation remains pending and does not race a fallback against native DSH.

The ambiguous legacy state is deliberately fail-closed. It is not reported as delivered and it is not silently consumed. New Task terminal paths always persist the boundary synchronously before public DSH can admit that Task's settlement.

### Fix round 2 verification

Admission/crash focused tests: 1 file passed, 5 tests passed.

Combined Task 6, Task 5, and public DSH regression gate:

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/long-goal-liveness.spec.ts tests/dsh-migration/continuous-goal-feedback.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/settled-task-result.spec.ts tests/dsh-migration/permission-attempt.spec.ts tests/dsh-migration/native-long-goal-child.spec.ts tests/dsh-probe/dsh-public-reuse-surface.spec.ts
```

Result: 8 files passed, 152 tests passed. The original Task 6 focused gate passed 4 files and 102 tests. Runtime Bundle typecheck (`tsc -b --pretty false`) and `git diff --check` exited 0. Static inspection found no private DSH import, terminal-marker production symbol, second scheduler/provider, direct Task Agent factory, feedback/learning write, or restored `long-goal-subagent.ts`.
