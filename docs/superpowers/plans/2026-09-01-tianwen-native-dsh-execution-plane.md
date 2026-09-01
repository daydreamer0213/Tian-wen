# Tianwen Native DSH Execution Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tianwen's fake Planner/Task subagent lifecycle with DSH-native continuable children, and make permissions, progress, settlement, restart recovery, and main-chat delivery follow one authoritative execution path.

**Architecture:** The existing Long Goal graph remains an optional Tianwen orchestration projection, but every Session advertised as a subagent is created and owned by `ctx.subagents`. Tianwen stores only Task/attempt bindings and product delivery cursors. DSH owns child identity, descriptor, delegated permission snapshot, inbox, cold resume, report, interrupt, and online settlement. Tianwen adds only permission-limited attempt renewal, state-change liveness reporting, and idempotent delivery when the main parent was offline.

**Tech Stack:** TypeScript 6, Node.js 22.19, Cordis 4, DSH `0.1.1-rc.2`, Vitest 4, pnpm 11.

## Global Constraints

- Execute first in the isolated worktree `D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge` from design commit `f84ef1d`.
- This is rollout stage 1 of 4. Complete this plan before the native-feedback, learning-closure, or release plans.
- The user-facing control surface remains the DSH main chat. Do not add child approval buttons, child navigation requirements, percentages, or a second task console.
- Never call `agents.create()` or `agents.resume()` to manufacture a Session with `origin: 'subagent'`. Internal evaluation Agents may still use ordinary Agent APIs only when they do not claim subagent lineage.
- Use DSH provider `spawn`; do not add another provider or general scheduler.
- A child's delegated sandbox mode is immutable for its lifetime. Permission expansion creates a new attempt epoch and preserves the old child as Evidence.
- A free-text claim of insufficient permission is not proof. Automatic renewal requires a failed DSH tool result carrying the canonical sandbox denial marker for the attempt's effective mode, or `SANDBOX_UNAVAILABLE`.
- Online child settlement belongs to DSH. Tianwen may only supplement the offline-parent gap after proving that the main Session has no completion Turn.
- Keep Runtime `0.1.10` and Desktop `preview.11` during behavior work. Version changes belong only to rollout stage 4.
- Every task ends with focused tests and a commit. Do not continue after a failed contract probe.

---

### Task 1: Freeze the DSH-native child and delegated-permission contract

**Files:**
- Create: `tests/dsh-probe/native-continuable-subagent.spec.ts`
- Modify: `tests/dsh-probe/dsh-public-reuse-surface.spec.ts`

- [ ] Add a contract test that mounts the real DSH subagent service with persistence, starts a `spawn` continuable child, and proves the returned identity appears in the native catalog without a `corrupt` diagnostic.

```ts
const started = await harness.ctx.subagents.startContinuable({
  provider: 'spawn',
  label: 'Tianwen contract child',
  request: {
    parent: harness.parent,
    prompt: [{ type: 'text', text: 'Return one short status.' }],
  },
  signal: AbortSignal.timeout(10_000),
})

const child = await harness.ctx.sessionPersistence.inspect(started.childId)
expect(child.events.filter(event => event.type === 'subagent/descriptor'))
  .toMatchObject([{ data: { mode: 'continuable', provider: 'spawn' } }])
const entries = await harness.ctx.subagents.listChildren(
  harness.parent.session.id,
  AbortSignal.timeout(10_000),
)
expect(entries).toContainEqual(expect.objectContaining({
  kind: 'child',
  id: started.childId,
  mode: 'continuable',
}))
expect(entries).not.toContainEqual(expect.objectContaining({
  kind: 'diagnostic',
  reason: 'corrupt',
}))
```

- [ ] In the same test, set the parent Session sandbox mode to `workspace-write` before creation and assert that the child log contains delegation-sourced `sandbox/mode` and `approval/policy: never` events.

```ts
expect(child.events).toEqual(expect.arrayContaining([
  expect.objectContaining({
    type: 'sandbox/mode',
    data: { mode: 'workspace-write', source: 'delegation' },
  }),
  expect.objectContaining({
    type: 'approval/policy',
    data: { policy: 'never', source: 'delegation' },
  }),
]))
```

- [ ] Prove that changing the parent to `danger-full-access` does not alter the first child and that a second child captures the new mode.

- [ ] Prove native follow-up cold-resumes a persisted child and that online child settlement reaches the exact live direct parent once.

- [ ] Extend the public-surface test so Runtime compilation fails if Tianwen reaches a DSH private path instead of `@deepseek-ai/dsh-subagent` exports.

- [ ] Run the focused gate.

```powershell
pnpm vitest run tests/dsh-probe/native-continuable-subagent.spec.ts tests/dsh-probe/dsh-public-reuse-surface.spec.ts
```

Expected: all tests pass; the child projection is `continuable`, delegated approval is `never`, and no catalog diagnostic is `corrupt`.

- [ ] Commit.

```powershell
git add tests/dsh-probe/native-continuable-subagent.spec.ts tests/dsh-probe/dsh-public-reuse-surface.spec.ts
git commit -m "test: freeze native DSH child contract"
```

### Task 2: Add durable execution-attempt identity to the Long Goal projection

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-contract.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal.ts`
- Modify: `tests/dsh-migration/ordinary-long-goal.spec.ts`
- Modify: `tests/dsh-migration/continuous-goal-service.spec.ts`

- [ ] Write failing projection tests for multiple immutable attempts on one Task, restart replay, and rejection of duplicate epochs or reused permission fingerprints.

- [ ] Add the smallest new durable records; do not add a second Task state machine.

```ts
export type TianwenAttemptStatus =
  | 'running'
  | 'permission-limited'
  | 'settled'
  | 'interrupted'

export interface TianwenExecutionAttempt {
  readonly epoch: number
  readonly parentSessionId: string
  readonly childSessionId: string
  readonly permissionFingerprint: `sha256:${string}`
  readonly status: TianwenAttemptStatus
  readonly startedAt: string
  readonly terminalEventId?: string
}

export interface TianwenTerminalDeliveryCursor {
  readonly terminalEventId: string
  readonly parentSessionId: string
  readonly completionTurnObserved: boolean
}
```

- [ ] Append explicit Long Goal events for `attempt-started`, `attempt-permission-limited`, `attempt-settled`, and `terminal-delivery-observed`; fold old v3 records without rewriting them.

- [ ] Enforce these invariants during append and reload:
  - epoch starts at 1 and increases by exactly 1;
  - one Task cannot reuse a child Session id;
  - one Task cannot automatically start twice with the same permission fingerprint;
  - only the current running attempt may become permission-limited or settled;
  - delivery acknowledgement must name the current terminal event.

- [ ] Run focused tests.

```powershell
pnpm vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/continuous-goal-service.spec.ts
```

- [ ] Commit.

```powershell
git add packages/tianwen-runtime-bundle/src/long-goal-contract.ts packages/tianwen-runtime-bundle/src/long-goal.ts tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/continuous-goal-service.spec.ts
git commit -m "feat: record native child attempt epochs"
```

### Task 3: Introduce one thin native Long Goal child adapter

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/native-long-goal-child.ts`
- Create: `tests/dsh-migration/native-long-goal-child.spec.ts`
- Modify: `packages/tianwen-runtime-bundle/package.json`

- [ ] Add `@deepseek-ai/dsh-sandbox@0.1.1-rc.2` as a direct Runtime Bundle development and peer dependency; keep `@deepseek-ai/dsh-subagent@0.1.1-rc.2` exact.

- [ ] Write adapter tests with a fake `ctx.subagents` that assert exact parent identity, caller-reserved child id, provider `spawn`, label, model selection, and abort signal are forwarded unchanged.

- [ ] Implement only start, follow-up, and interrupt. Do not wrap catalog, persistence, descriptor, Agent creation, or resume.

```ts
export class NativeLongGoalChild {
  constructor(private readonly ctx: Context) {}

  start(input: {
    parent: Agent
    childId: SessionId
    label: string
    prompt: ContentBlock[]
    agentOptions: AgentOptions
    signal: AbortSignal
  }): Promise<ContinuableStart> {
    return this.ctx.subagents.startContinuable({
      provider: 'spawn',
      label: input.label,
      childId: input.childId,
      request: {
        parent: input.parent,
        prompt: input.prompt,
        agentOptions: input.agentOptions,
      },
      signal: input.signal,
    })
  }

  followup(parent: Agent, childId: SessionId, prompt: ContentBlock[], signal: AbortSignal) {
    return this.ctx.subagents.followup(parent, childId, prompt, {
      source: {
        kind: 'coordinator',
        form: 'relay',
        senderSessionId: parent.session.id,
      },
      signal,
    })
  }

  interrupt(parentSessionId: SessionId, childId: SessionId): void {
    this.ctx.subagents.interrupt(childId, { kind: 'user', parentSessionId })
  }
}
```

- [ ] Run the adapter tests and typecheck.

```powershell
pnpm vitest run tests/dsh-migration/native-long-goal-child.spec.ts
pnpm --filter @tianwen/runtime-bundle typecheck
```

- [ ] Commit.

```powershell
git add packages/tianwen-runtime-bundle/src/native-long-goal-child.ts tests/dsh-migration/native-long-goal-child.spec.ts packages/tianwen-runtime-bundle/package.json pnpm-lock.yaml
git commit -m "feat: add native Long Goal child adapter"
```

### Task 4: Replace fake Planner and Task Session creation

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-host.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-planner.ts`
- Modify: `tests/dsh-migration/continuous-goal-host.spec.ts`
- Delete: `packages/tianwen-runtime-bundle/src/long-goal-subagent.ts`
- Delete: `tests/dsh-migration/long-goal-subagent.spec.ts`

- [ ] Add failing host tests that require:
  - Planner creation through `NativeLongGoalChild.start()` with the exact main control Agent as parent;
  - Task creation through the exact live Planner Agent as parent;
  - continuation through native `followup()` rather than `agents.resume()`;
  - no `ownedTaskHandles` lifecycle and no manual descriptor installation;
  - Planner remains the only child that reports aggregate state to the main chat.

- [ ] Change the host injection to require `subagents` and remove direct child ownership from `ownedTaskHandles`.

- [ ] Before calling `start()`, reserve the child Session id, append `attempt-started`, and pass that same id to DSH. If DSH rejects before inbox acceptance, append a provisioning failure and do not leave a running attempt.

- [ ] Use `ctx.agents.get()` only to obtain the exact live parent. If the required parent is absent, leave work pending until `agent/created`; do not create or resume a lookalike parent behind DSH's ownership.

- [ ] Remove `installLongGoalSubagentDescriptor()` and the `mode: 'one-shot'` lie. Delete both obsolete files.

- [ ] Run the host tests.

```powershell
pnpm vitest run tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/native-long-goal-child.spec.ts
```

- [ ] Inspect every remaining direct Agent creation in `long-goal-host.ts`. Each remaining call must be either main-parent acquisition or an ordinary non-subagent Agent; no call may write `origin: 'subagent'`.

```powershell
rg -n "origin:\s*'subagent'|installLongGoalSubagentDescriptor|ownedTaskHandles" packages/tianwen-runtime-bundle/src/long-goal-host.ts packages/tianwen-runtime-bundle/src/long-goal-planner.ts
Test-Path packages/tianwen-runtime-bundle/src/long-goal-subagent.ts
rg -n "agents\.(create|resume)" packages/tianwen-runtime-bundle/src/long-goal-host.ts
```

Expected: the first command has no matches, `Test-Path` prints `False`, and every final-command match has a written justification in the test name and does not construct child lineage.

- [ ] Commit.

```powershell
git add packages/tianwen-runtime-bundle/src/long-goal-host.ts packages/tianwen-runtime-bundle/src/long-goal-planner.ts tests/dsh-migration/continuous-goal-host.spec.ts packages/tianwen-runtime-bundle/src/long-goal-subagent.ts tests/dsh-migration/long-goal-subagent.spec.ts
git commit -m "refactor: use native DSH Long Goal children"
```

### Task 5: Classify permission-limited attempts and renew only after a wider main-session policy

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/permission-attempt.ts`
- Create: `tests/dsh-migration/permission-attempt.spec.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-host.ts`
- Modify: `tests/dsh-migration/continuous-goal-host.spec.ts`

- [ ] Write classifier tests for canonical denial evidence, `SANDBOX_UNAVAILABLE`, ordinary command failure, provider failure, and a child assistant message that merely says "permission denied".

- [ ] Build the permission fingerprint from the parent's latest explicit `sandbox/mode` event and the effective mode, not from UI text.

```ts
export interface PermissionSnapshot {
  readonly mode: SandboxMode
  readonly eventSeq: number | null
  readonly fingerprint: `sha256:${string}`
}

export function isPermissionLimited(
  result: SessionEvent<'tool/result'>,
  evidence: EvidenceRecord,
  snapshot: PermissionSnapshot,
): boolean {
  if (evidence.outcome.status !== 'complete') return false
  if (evidence.outcome.errorCode === SANDBOX_UNAVAILABLE) return true
  const block = result.data.message.content[0]
  if (evidence.outcome.isError !== true || block?.isError !== true) return false
  return block.content.some(item =>
    item.type === 'text'
    && item.text.split(/\r?\n/u).includes(sandboxDenialMarker(snapshot.mode)))
}
```

- [ ] When structured evidence proves the limit, append `attempt-permission-limited`, report the required main-Session action, and suppress Learning Intake for that attempt.

- [ ] On later `sandbox/mode` Session events for the main parent, use `WIDER_MODES` to prove widening. Start exactly one new attempt for the new fingerprint if the Task remains current.

- [ ] Assert the old child log is unchanged, the new child has the wider delegation event, and repeating the same parent mode does not start a third attempt.

- [ ] Run focused tests.

```powershell
pnpm vitest run tests/dsh-migration/permission-attempt.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-probe/native-continuable-subagent.spec.ts
```

- [ ] Commit.

```powershell
git add packages/tianwen-runtime-bundle/src/permission-attempt.ts tests/dsh-migration/permission-attempt.spec.ts packages/tianwen-runtime-bundle/src/long-goal-host.ts tests/dsh-migration/continuous-goal-host.spec.ts
git commit -m "feat: renew permission-limited child attempts"
```

### Task 6: Move progress and settlement to native reports with a minimal offline cursor

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/long-goal-liveness.ts`
- Create: `tests/dsh-migration/long-goal-liveness.spec.ts`
- Modify: `packages/tianwen-runtime-bundle/src/continuous-goal-feedback.ts`
- Modify: `packages/tianwen-runtime-bundle/src/continuous-goal-host.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-host.ts`
- Modify: `tests/dsh-migration/continuous-goal-feedback.spec.ts`
- Modify: `tests/dsh-migration/continuous-goal-host.spec.ts`

- [ ] Write fake-timer tests for an immediate stage-change report, first liveness report at 120 seconds, later reports no more often than every 300 seconds, timer reset after a real stage change, and immediate stop on blocker/terminal state.

- [ ] Implement one coalescing liveness lane per main parent. Its message may contain only persisted stage, last completed action, waiting condition, and next action.

```ts
export const FIRST_LIVENESS_MS = 120_000
export const REPEAT_LIVENESS_MS = 300_000

export interface DurableProgressFact {
  readonly stage: string
  readonly lastCompletedAction?: string
  readonly waitingFor?: string
  readonly nextAction?: string
  readonly changedAt: string
}
```

- [ ] Deliver child progress through `ctx.subagents.reportFrom(exactChildAgent, content, { delivery: 'next-step', signal })`. Coalesce sibling progress before reporting from the Planner to the main parent.

- [ ] Remove the normal online path from `deliverContinuousGoalSettlement()`. Native settlement/report must win whenever the parent is live.

- [ ] Retain only the offline-parent reconciliation path:
  1. read the Long Goal terminal cursor;
  2. inspect the main Session;
  3. if an existing completion Turn represents the terminal event, append `terminal-delivery-observed` without sending;
  4. otherwise send one guarded, tool-disabled follow-up Turn;
  5. append delivery acknowledgement only after Session persistence confirms that Turn;
  6. never rerun the child Task when delivery fails.

- [ ] Add restart tests for child cold resume, parent offline settlement, exactly-once parent delivery, and no duplicate Task execution.

- [ ] Run the focused suite.

```powershell
pnpm vitest run tests/dsh-migration/long-goal-liveness.spec.ts tests/dsh-migration/continuous-goal-feedback.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/settled-task-result.spec.ts
```

- [ ] Commit.

```powershell
git add packages/tianwen-runtime-bundle/src/long-goal-liveness.ts tests/dsh-migration/long-goal-liveness.spec.ts packages/tianwen-runtime-bundle/src/continuous-goal-feedback.ts packages/tianwen-runtime-bundle/src/continuous-goal-host.ts packages/tianwen-runtime-bundle/src/long-goal-host.ts tests/dsh-migration/continuous-goal-feedback.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts
git commit -m "feat: report Long Goal progress in the main chat"
```

### Task 7: Prove the native execution story in the real base/web composition

**Files:**
- Create: `tests/dsh-migration/native-long-goal-profile.e2e.spec.ts`
- Modify: `tests/dsh-migration/portable-profile-composition.e2e.spec.ts`
- Modify: `tests/dsh-migration/runtime-composition.spec.ts`

- [ ] Add one profile-level story that starts from a normal main Session, delegates Planner and Task work, never opens a child, observes progress in the parent, and receives the final result there.

- [ ] Inspect each persisted child and assert descriptor, lineage, delegated policy, and absence of corrupt diagnostics through the public subagent service.

- [ ] Add a permission-limited story that changes only the main Session to `danger-full-access`, sees a new child attempt complete, and proves no Learning Signal was written for the limited attempt.

- [ ] Add a host-restart story that settles while the main parent is offline and delivers exactly once after parent recovery.

- [ ] Add a non-interference story that runs the same ordinary DSH task with Tianwen enabled and disabled, supplies no Tianwen-specific input, and proves identical model/tool/permission behavior plus zero Tianwen learning writes.

- [ ] Run rollout-stage gate 1.

```powershell
pnpm vitest run tests/dsh-probe/native-continuable-subagent.spec.ts tests/dsh-migration/native-long-goal-profile.e2e.spec.ts tests/dsh-migration/portable-profile-composition.e2e.spec.ts tests/dsh-migration/runtime-composition.spec.ts
pnpm run typecheck
```

Expected: all commands pass; no test asks the user to open or approve in a child Session.

- [ ] Commit.

```powershell
git add tests/dsh-migration/native-long-goal-profile.e2e.spec.ts tests/dsh-migration/portable-profile-composition.e2e.spec.ts tests/dsh-migration/runtime-composition.spec.ts
git commit -m "test: prove native Long Goal execution plane"
```

## Stage 1 Completion Gate

- [ ] `pnpm run typecheck` passes.
- [ ] All stage 1 focused and profile tests pass from a clean process.
- [ ] New Tianwen child Sessions classify as native `continuable`; none classify as `corrupt`.
- [ ] Permission expansion is performed only in the main Session and creates a new attempt epoch.
- [ ] Main-chat progress appears without child navigation; no progress percentage is invented.
- [ ] Online settlement is DSH-owned; offline reconciliation is exactly once and never re-executes a Task.
- [ ] With no Tianwen-specific input, ordinary DSH behavior is unchanged and the Evolution ledger receives no learning event.
- [ ] `git status --short` contains no uncommitted implementation work before stage 2 begins.
