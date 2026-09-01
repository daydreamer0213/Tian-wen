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

## Fix round 3: flushed cross-store terminal evidence

Independent review found that fix round 2 captured a live main-Session sequence and wrote it to the Long Goal store before proving that either the Task terminal source or that main prefix was durable. That crossed two persistence domains without an ordering barrier. Fix round 3 supersedes the round 2 claim that the boundary is appended synchronously: the synchronous listener now captures only in-memory evidence and queues the existing per-Goal lane. The lane must make the exact Task terminal and captured main prefix durable before it may append the boundary.

### Cross-store ordering and crash recovery

For an exact running Task `goal/change` complete/block event, the Host now performs this order:

1. synchronously, with no `await`, capture the exact terminal event id and current live main tail `N`;
2. on the existing Long Goal lane, wait for the exact Task Agent to become idle;
3. flush the exact Task Session;
4. flush the exact main Session;
5. inspect both persisted Sessions in `recordContinuousGoalTerminalAttempt` and require the exact Task terminal id plus a persisted main tail at least `N`;
6. append `terminal-delivery-boundary` with `N`;
7. append the matching `attempt-settled` at the authoritative next revision.

No new scheduler or delivery framework was added. The capture Promise is attached to the existing per-Goal lane. A Task or main flush failure returns no evidence, reports the error, and performs zero boundary append, zero terminal fold, and zero continue/rerun.

Restart recovery distinguishes the durable evidence that actually exists:

- exact Task terminal durable and boundary absent, with no exact Planner settlement evidence: use the persisted main tail as a safe recovery boundary, then fold one terminal attempt;
- exact Task terminal durable and an existing matching boundary: reuse it and fold once;
- historical boundary present but exact Task terminal missing: remain pending with zero cold resume, zero Task start, and zero invented terminal sequence;
- live captured `N` ahead of the persisted main tail: remain pending and append nothing;
- captured exact terminal id absent from the persisted Task Session: do not substitute another event with the same operation/Goal.

The real public DSH probe now flushes both exact Sessions and inspects their public persistence projections before releasing the Planner gate. It proves that the exact Task `goal/change` and main prefix through `N` are durable, and that the later exact Planner settlement admission has sequence greater than `N`. The persisted surface still contains no Tianwen marker.

### Public inbox lifecycle replay

Native settlement correlation now replays the public `agent/inbox/spliced` stream exactly as an inbox splice: per `target`, it applies `start`, `removedCount`, `inserted`, and `outcome`, retaining the removed message ids from the replayed pre-splice array. No private DSH state or guessed removed id is used.

For each exact post-boundary Planner `subagent-settled` message id, reconciliation folds the latest legal lifecycle:

- pending admission or claimed message with an active Turn: wait for native DSH;
- explicit cancellation/removal: allow the guarded offline fallback;
- claimed Turn ending `aborted`, `error`, `interrupted`, or `blocked`: allow fallback;
- claimed Turn ending `completed` without a non-empty visible assistant reply: allow fallback;
- same-id claim plus non-empty reply and `completed` or `max-tokens`: acknowledge native delivery;
- cancellation followed by reinsertion replaces the old lifecycle; a later removal of that reinsertion allows exactly one fallback.

The decision is reevaluated after every durable inspection. Therefore a historical post-boundary admission no longer suppresses fallback forever, while pending native work is still never raced by fallback. Existing per-terminal singleflight, final exact Agent identity fence, flush/reinspect acknowledgement, and complete/block behavior remain intact.

### Fix round 3 RED/GREEN evidence

Cross-store ordering:

- RED: live complete recorded a boundary after only the Task flush; it neither flushed the main prefix nor passed captured `N` into the fold.
- GREEN: exact order is Task flush, main flush, boundary/attempt record; complete and block both carry the exact capture.
- RED: persisted main tail `M=18` accepted live `N=19`; a targeted mutation of the persisted-prefix guard reproduced the unsafe append.
- GREEN: `M<N` records nothing; `M>=N` folds normally and later exact admission is strictly post-boundary.
- RED: the recorder substituted a different durable terminal event with the same operation/Goal for the captured event id.
- GREEN: the exact captured `goal-change:<session>:<seq>:<operation>` must be present.
- RED: removing the exact Task Agent after both flushes made block discard already durable evidence.
- GREEN: block records from the flushed evidence without requiring a later live lookup.
- RED: a Task flush failure mutation returned captured evidence and called the terminal recorder once.
- GREEN: the controlled crash fixture reports the persistence failure and asserts zero boundary/attempt record and zero continuation.
- GREEN: restart with durable Task terminal but no boundary writes a safe persisted-tail recovery boundary and folds once; a bad historical boundary without its Task terminal stays pending with zero cold resume/rerun.
- RED: startup ignored the recorder's ambiguous/pending result and called `continueProgress` once.
- GREEN: the recorder returns an explicit folded/pending result; pending startup performs zero continue, direct create, or direct resume.

Inbox lifecycle:

- RED: canceled admission stayed in the old admission-id set and waited forever.
- GREEN: canceled/removed complete and block settlements each use one fallback and acknowledge once.
- RED: a removal outside any claiming Turn, without an explicit outcome, was treated as an active claim and waited forever.
- GREEN: removal outside a Turn is canceled recovery evidence and falls back once; removal inside an open Turn remains a claim.
- RED: claimed Turns ending aborted/error/interrupted/blocked, and completed with no reply, all waited forever.
- GREEN: all five terminal failure rows allow fallback; repeated reconciliation sends nothing after acknowledgement.
- RED: mutations that treated pending or claimed-active work as fallback raced native delivery.
- GREEN: both rows wait with zero fallback and zero acknowledgement.
- RED: same-id cancel/reinsert/remove ignored the latest reinsertion lifecycle.
- GREEN: it waits after reinsertion, then falls back exactly once after the final removal.
- RED: a mutation excluding `max-tokens` failed the native-success row.
- GREEN: completed and max-tokens with the exact claim and non-empty reply both acknowledge natively with zero fallback.

### Fix round 3 verification

Original Task 6 focused gate:

```powershell
pnpm exec vitest run tests/dsh-migration/long-goal-liveness.spec.ts tests/dsh-migration/continuous-goal-feedback.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/settled-task-result.spec.ts
```

Result: 4 files passed, 120 tests passed.

Combined Task 6, Task 5, contract compatibility, and public DSH regression gate:

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/long-goal-liveness.spec.ts tests/dsh-migration/continuous-goal-feedback.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/settled-task-result.spec.ts tests/dsh-migration/permission-attempt.spec.ts tests/dsh-migration/native-long-goal-child.spec.ts tests/dsh-probe/dsh-public-reuse-surface.spec.ts
```

Result: 8 files passed, 170 tests passed. Full continuous Host suite: 1 file passed, 85 tests passed. Workspace typecheck (`pnpm run typecheck`) and `git diff --check` exited 0. Static inspection found no private DSH import, terminal-marker production symbol, second scheduler/provider, direct child Agent factory, feedback/learning write, or restored `long-goal-subagent.ts`.

### Fix round 3 self-review and remaining concern

The implementation stays inside the authorized Host and focused test ownership; no native adapter, scheduler, provider, UI, feedback, learning, or settled-result contract was changed. It reuses the existing per-Goal lane and public Session flush/inspect surfaces.

Legacy or crash-created records that have no durable boundary but already contain exact Planner settlement evidence remain deliberately observable and pending. There is not enough causal evidence to choose native acknowledgement or fallback without risking a duplicate. New terminal paths close that ambiguity by flushing both stores before the boundary append; recovery only synthesizes a boundary from the persisted main tail when no exact Planner settlement evidence exists.

## Fix round 4: terminal-fold gate and sticky native completion

Independent review found that live terminal handling ignored the recorder's explicit pending result, and that the inbox replay kept only one lifecycle per MessageId. The first could advance after terminal evidence failed to fold. The second could erase an already completed native settlement when DSH legally reused its MessageId after the prior occurrence left the pending inbox.

### Terminal fold is the live continuation gate

`continueAfterCompletion()` and `recordAfterBlock()` now use the same boolean result from `recordContinuousGoalTerminalAttempt()`. A `false` result returns immediately. Completion therefore performs zero `continueProgress`, direct Agent creation, or direct Agent resume, while block performs no later terminal bookkeeping. A `true` completion result advances exactly once.

The tests mount the real continuous Goal Host with the real terminal recorder and durable Long Goal files. They do not replace the recorder with a boolean-only mock. The fail-closed matrix covers:

- captured main boundary `N=19` with persisted main tail `M=18`;
- a captured exact terminal id absent from the persisted Task Session;
- an existing boundary for a different terminal occurrence;
- legacy evidence containing an exact Planner settlement but no durable boundary.

All four rows retain the running attempt and their preexisting boundary/delivery cursor state. The block row additionally proves that failed folding does not remove the active liveness source. The success row folds one boundary plus one settled attempt and advances only once even when the live terminal notification is repeated.

### Native completion survives MessageId reuse

The public inbox replay now stores one lifecycle per admission occurrence instead of one mutable slot per MessageId. Each replayed inbox entry holds its exact lifecycle occurrence, so removal and claim update that admission without replacing earlier history. The existing decision order remains unchanged: any exact claimed occurrence with a non-empty reply and a `completed` or `max-tokens` Turn wins over later pending or canceled occurrences.

The matrix proves:

- completed `X`, then reinserted pending `X`: native acknowledgement, zero fallback;
- max-tokens `X`, then reinserted canceled `X`: native acknowledgement, zero fallback;
- completed `X` with pending `Y`: native acknowledgement, zero fallback;
- max-tokens `X` with canceled `Y`: native acknowledgement, zero fallback.

The existing canceled `X` -> reinserted pending `X` -> canceled `X` test remains green: the reinsertion waits while pending, and its later cancellation permits exactly one fallback. Thus completion is sticky without weakening the cancel/reinsert recovery rule.

### Fix round 4 RED/GREEN evidence

Live terminal gate:

- RED: each of the four real-recorder pending rows called `continueProgress` once despite retaining a running attempt; the blocked `M<N` row also stopped liveness.
- GREEN: all pending rows perform zero continuation/direct creation/direct resume and retain their exact attempt, boundary, and acknowledgement projections; block leaves liveness active.
- GREEN: a true fold records the exact boundary and settled attempt, then advances once under repeated live notification.

MessageId reuse:

- RED: completed `X` followed by pending `X` returned pending instead of acknowledging native delivery.
- RED: max-tokens `X` followed by canceled `X` entered the duplicate fallback path.
- GREEN: lifecycle state is admission-occurrence scoped; same-id and different-id pending/canceled rows all acknowledge from the earlier successful occurrence with zero fallback.
- GREEN: canceled/reinserted pending and canceled/reinserted canceled behavior remains unchanged.

### Fix round 4 verification

Original Task 6 focused gate:

```powershell
pnpm exec vitest run tests/dsh-migration/long-goal-liveness.spec.ts tests/dsh-migration/continuous-goal-feedback.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/settled-task-result.spec.ts
```

Result: 4 files passed, 130 tests passed. Full continuous Host suite: 1 file passed, 95 tests passed.

Combined Task 6, Task 5, contract compatibility, and public DSH regression gate:

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/long-goal-liveness.spec.ts tests/dsh-migration/continuous-goal-feedback.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/settled-task-result.spec.ts tests/dsh-migration/permission-attempt.spec.ts tests/dsh-migration/native-long-goal-child.spec.ts tests/dsh-probe/dsh-public-reuse-surface.spec.ts
```

Result: 8 files passed, 180 tests passed. Runtime Bundle typecheck (`tsc -b --pretty false`) and `git diff --check` exited 0. Static inspection found no private DSH import, terminal marker, second scheduler/provider, direct child Agent factory, feedback/learning write, or restored `long-goal-subagent.ts`.

### Fix round 4 self-review and remaining concern

The production change stays in the authorized continuous Host and Long Goal Host. It adds no contract event, scheduler, provider, adapter, delivery framework, or private DSH dependency. The recorder remains the single source of truth for whether terminal evidence is durable enough to advance.

MessageId reuse is deliberately scoped by durable admission occurrence rather than by content or timestamp. This keeps an already completed native delivery sticky while preserving the existing fail-closed and cancellation recovery behavior.
