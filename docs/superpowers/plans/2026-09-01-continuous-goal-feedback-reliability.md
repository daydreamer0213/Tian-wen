# Continuous Goal Feedback Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new Tianwen Planner/Task Sessions open as valid DSH subagent records and guarantee that progress or approval attention reaches the ordinary control conversation even when its Agent was cold.

**Architecture:** Reuse DSH's public descriptor snapshot contract for child identity, Tianwen's existing guarded notice turn for user-visible feedback, and a short-lived lease around DSH Agent resume for cold control Sessions. Durable notice matching remains the idempotency authority; no second scheduler, dashboard, or history rewrite is introduced.

**Tech Stack:** TypeScript 6, DSH `0.1.1-rc.2` public packages, Cordis events, Vitest 4, pnpm 11, Electron Desktop.

## Global Constraints

- Keep DSH exact `0.1.1-rc.2`; do not patch or publish DSH.
- Do not migrate, delete, or rewrite the four historical malformed Sessions from the reported run.
- Never approve or deny a privileged operation on the user's behalf.
- Do not change Activity, evidence, debug, legacy, or learning records.
- Keep generated packages, caches, installers, and acceptance data on `D:`.
- A passing unit suite is not completion; the formal Desktop user path in Task 6 must pass.
- Use the existing guarded feedback turn and durable notice matching instead of adding another queue or status store.

## File Structure

- `packages/tianwen-runtime-bundle/src/long-goal-subagent.ts`: one focused adapter from Tianwen-owned child Sessions to DSH's durable subagent descriptor contract.
- `packages/tianwen-runtime-bundle/src/long-goal-host.ts`: label child creation, acquire cold control Agents, and deliver all notice kinds through an exact Agent lease.
- `packages/tianwen-runtime-bundle/src/long-goal-planner.ts`: carry the Planner label through the existing creation boundary.
- `packages/tianwen-runtime-bundle/src/continuous-goal-feedback.ts`: build the deterministic approval-attention notice.
- `packages/tianwen-runtime-bundle/src/continuous-goal-host.ts`: observe exact bound approvals, retain retry identity, and reconstruct missed active progress.
- `tests/dsh-migration/long-goal-subagent.spec.ts`: descriptor behavior and resume idempotence.
- `tests/dsh-migration/learn-loop-host.spec.ts`: Task/Planner creation inputs including labels.
- `tests/dsh-migration/continuous-goal-feedback.spec.ts`: attention prompt content, redaction, and validation.
- `tests/dsh-migration/continuous-goal-host.spec.ts`: approval routing, duplicate suppression, active recovery, and cold control delivery.
- Runtime/Desktop manifests, installer scripts, release tests, lockfile, architecture/handoff docs: exact `0.1.10` / `0.1.0-preview.11` delivery identity after behavior is green.

---

### Task 1: Valid DSH child records

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/long-goal-subagent.ts`
- Create: `tests/dsh-migration/long-goal-subagent.spec.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-host.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-planner.ts`
- Modify: `tests/dsh-migration/learn-loop-host.spec.ts`
- Modify: `package.json`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `snapshotSubagentDescriptor()` from public `@deepseek-ai/dsh-subagent` and the existing `AgentSetup` creation window.
- Produces: `installLongGoalSubagentDescriptor(ctx: Parameters<AgentSetup>[0], label: string): void`, plus `label?: string` on `TianwenLongGoalRunDependencies.createSession` and `LongGoalPlannerDependencies.createAgent`.

- [ ] **Step 1: Add a failing descriptor contract test**

Create a real DSH `Session`, install the wished-for helper on a small fake setup context, run the registered `agent/pre-step` listener once with `{ kind: 'enter' }`, and assert:

```ts
expect(foldSubagentDescriptor(session.events)).toEqual({
  version: SUBAGENT_DESCRIPTOR_VERSION,
  mode: 'one-shot',
  provider: 'tianwen-long-goal',
  label: 'Task 2: Verify the result',
})
expect(session.events.filter(event => event.type === 'subagent/descriptor')).toHaveLength(1)
```

Invoke the listener a second time and assert the descriptor count remains one. This names the production change: removing the helper or appending on every step must fail the test.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/long-goal-subagent.spec.ts
```

Expected: FAIL because `long-goal-subagent.ts` and `installLongGoalSubagentDescriptor` do not exist.

- [ ] **Step 3: Implement the smallest descriptor adapter**

Use the DSH snapshot API and the same first-entered-step rule as its in-process one-shot driver:

```ts
const descriptor = snapshotSubagentDescriptor({
  mode: 'one-shot',
  provider: 'tianwen-long-goal',
  label,
})
let appended = false
ctx.on('agent/pre-step', async ({ agent }, next) => {
  const decision = await next()
  if (!appended && decision.kind === 'enter') {
    appended = true
    agent.session.append('subagent/descriptor', descriptor)
  }
  return decision
})
```

Do not register a provider or continuable manager. These Sessions are readable execution records; Tianwen remains their only coordinator.

- [ ] **Step 4: Thread human-readable labels through creation only**

For v3 creation, pass:

```ts
label: `Task ${taskIndex + 1}: ${task.objective}`
```

and for the Planner:

```ts
label: 'Long Goal Planner'
```

Call `installLongGoalSubagentDescriptor()` inside the fresh child `AgentSetup` before the existing Task/Planner setup. Resume paths must not install another descriptor hook.

- [ ] **Step 5: Update existing creation assertions and direct dependencies**

Add exact label assertions to the existing v3 tests in `learn-loop-host.spec.ts`. Add `@deepseek-ai/dsh-subagent: 0.1.1-rc.2` to the root dev dependencies and Runtime dev/peer dependencies, then update only the lockfile using the D-drive store:

```powershell
pnpm install --lockfile-only --store-dir D:\DevData\pnpm-store
```

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/long-goal-subagent.spec.ts tests/dsh-migration/learn-loop-host.spec.ts
pnpm --filter @tianwen/runtime-bundle run typecheck
```

Expected: all selected tests and Runtime typecheck pass.

- [ ] **Step 7: Commit Task 1**

```powershell
git add package.json pnpm-lock.yaml packages/tianwen-runtime-bundle/package.json packages/tianwen-runtime-bundle/src/long-goal-subagent.ts packages/tianwen-runtime-bundle/src/long-goal-host.ts packages/tianwen-runtime-bundle/src/long-goal-planner.ts tests/dsh-migration/long-goal-subagent.spec.ts tests/dsh-migration/learn-loop-host.spec.ts
git commit -m "fix: create valid long goal child records"
```

---

### Task 2: Approval-attention notice

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/continuous-goal-feedback.ts`
- Modify: `tests/dsh-migration/continuous-goal-feedback.spec.ts`

**Interfaces:**
- Consumes: `LongGoalStatusProjectionV3` and an exact approval event projection.
- Produces: `buildContinuousGoalAttentionNotice(input)` returning a plugin-sourced DSH user message accepted by the existing guarded notice driver.

- [ ] **Step 1: Add a failing attention-notice test**

Call the wished-for builder with active Task 3 and assert its visible prompt contains:

```ts
expect(content).toContain('waiting for user approval')
expect(content).toContain('Task 3')
expect(content).toContain('pwsh')
expect(content).toContain('top-left subagent catalog')
expect(content).toContain('Do not approve or deny the request')
expect(content).not.toContain(APPROVAL_ID)
expect(content).not.toContain(TASK_SESSION_ID)
```

Add one validation case for a stale/non-active Task and one redaction case where the reason contains a known internal Session id.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
pnpm exec vitest run tests/dsh-migration/continuous-goal-feedback.spec.ts
```

Expected: FAIL because `buildContinuousGoalAttentionNotice` is not exported.

- [ ] **Step 3: Implement the attention builder**

Define this exact input shape:

```ts
export interface ContinuousGoalAttentionNoticeInput {
  readonly status: LongGoalStatusProjectionV3
  readonly attention: {
    readonly approvalId: string
    readonly sessionId: string
    readonly toolName: string
    readonly reason?: string
  }
}
```

Validate that the Goal is active, the current Task is active, and its execution Session equals `attention.sessionId`. Reuse `internalIdentifiers`, `redactInternalIdentifiers`, and `truncate`. Treat tool/reason text as untrusted data, instruct the feedback turn to explain the exact UI path, and never include the approval id in model-visible content.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
pnpm exec vitest run tests/dsh-migration/continuous-goal-feedback.spec.ts
git add packages/tianwen-runtime-bundle/src/continuous-goal-feedback.ts tests/dsh-migration/continuous-goal-feedback.spec.ts
git commit -m "feat: explain background approval attention"
```

---

### Task 3: Route exact approval events and recover active progress

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/continuous-goal-host.ts`
- Modify: `tests/dsh-migration/continuous-goal-host.spec.ts`

**Interfaces:**
- Consumes: DSH `session/event` events `approval/asked`, authoritative v3 Goal status, and Task bindings.
- Produces: a discriminated `ContinuousGoalDeliveryIntent` union with an `attention` variant; reconstructable `start`/`advance` intents for an already-active current Task.

- [ ] **Step 1: Add a failing exact-approval routing test**

Extend the test harness with:

```ts
approval(sessionId: string, approvalId = 'approval-1') {
  emitSession(sessionId, {
    type: 'approval/asked',
    data: { id: approvalId, toolName: 'pwsh', reason: 'Run verification' },
  })
}
```

Assert that the active bound Task produces one `attention` delivery with the exact id/session/tool/reason. Repeat the same event and assert no duplicate. Emit from an unrelated Session and a non-current bound Task and assert both are ignored.

- [ ] **Step 2: Run the Host test and verify RED**

```powershell
pnpm exec vitest run tests/dsh-migration/continuous-goal-host.spec.ts -t "approval"
```

Expected: FAIL because `approval/asked` is currently ignored.

- [ ] **Step 3: Implement the attention intent and key**

Use a discriminated union so only attention carries approval data:

```ts
export type ContinuousGoalDeliveryIntent =
  | { readonly longGoalId: string; readonly transition: 'start' | 'advance' | 'complete' | 'block' | 'planning-failed'; readonly status: LongGoalStatusProjectionV3 }
  | { readonly longGoalId: string; readonly transition: 'attention'; readonly status: LongGoalStatusProjectionV3; readonly attention: ContinuousGoalAttention }
```

Include `approvalId` in `deliveryKey`. In `offSession`, retain the existing user-abort path and add a separate exact `approval/asked` branch. Queue a lane that re-reads status, verifies the current execution binding, and records one attention delivery. Do not pause, approve, deny, or change Goal state.

- [ ] **Step 4: Add a failing active-recovery test**

Mount the Host on an already-active Task 2 with a live armed Task Agent and assert an `advance` delivery is reconstructed. Use Task 1 for the corresponding `start` assertion. Keep the existing unbound execution-null case expecting no progress claim.

- [ ] **Step 5: Verify recovery RED, then implement the minimum inference**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/continuous-goal-host.spec.ts -t "active"
```

Expected: the new reconstruction assertion fails because `reconcile()` currently emits nothing when the Task is already live and armed.

Add one helper that returns `start` for the first active Task and `advance` for a later active Task, only when the current Task has an execution binding. Call it both after recovery and when no continuation is required. Existing durable notice matching, not another in-memory flag, suppresses replay.

- [ ] **Step 6: Run the complete Host suite and commit**

```powershell
pnpm exec vitest run tests/dsh-migration/continuous-goal-host.spec.ts
git add packages/tianwen-runtime-bundle/src/continuous-goal-host.ts tests/dsh-migration/continuous-goal-host.spec.ts
git commit -m "fix: surface goal attention and recover progress"
```

---

### Task 4: Deliver through a cold control-Agent lease

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-host.ts`
- Modify: `tests/dsh-migration/continuous-goal-host.spec.ts`

**Interfaces:**
- Consumes: `injected.agents.get/resume`, `agentSetup`, persisted control Session metadata, and all `ContinuousGoalDeliveryIntent` variants.
- Produces: optional `acquireAgent(sessionId)` on `ContinuousGoalSettlementDeliveryDependencies`, returning `{ agent, release }`, and attention delivery through the same guarded turn.

- [ ] **Step 1: Add a failing cold-lease delivery test**

Start with `getAgent()` returning `undefined`. Provide the wished-for `acquireAgent()` that returns a valid test Agent and a `release` spy. Assert the notice runs, flushes, and releases once. Add a rejection/stale-state case proving release still runs and no feedback turn starts.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
pnpm exec vitest run tests/dsh-migration/continuous-goal-host.spec.ts -t "cold control"
```

Expected: FAIL because delivery returns `false` before acquisition.

- [ ] **Step 3: Add the lease boundary to delivery**

Keep `getAgent` for identity rechecks and add:

```ts
readonly acquireAgent?: (sessionId: string) => Promise<{
  readonly agent: Agent
  readonly release: () => void | Promise<void>
} | undefined>
```

Acquire only when `getAgent` is empty, run all current authoritative-state and durable-notice checks against the acquired exact Agent, and release in `finally`. The release path waits for idle before disposing a temporary handle; a pre-existing live Agent receives a no-op release.

- [ ] **Step 4: Route the attention builder**

Extend transition validation and notice selection:

```ts
const notice = intent.transition === 'attention'
  ? buildContinuousGoalAttentionNotice({ status: rechecked, attention: intent.attention })
  : /* existing planning/progress/settlement selection */
```

Attention is valid only while the exact Task remains current and active.

- [ ] **Step 5: Compose the production cold lease**

In `mountTianwenLongGoalHost`, first return an existing exact live Agent with a no-op release. Otherwise inspect the control Session, resolve its recorded preset through the existing `agentSetup`, resume it with the current configured model selection, and return a release that awaits idle, flushes, and disposes the handle. If resume loses a race to another owner, re-read `agents.get()` and use the winner; otherwise report the acquisition error.

- [ ] **Step 6: Verify GREEN and commit**

```powershell
pnpm exec vitest run tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/continuous-goal-feedback.spec.ts tests/dsh-migration/long-goal-subagent.spec.ts
pnpm --filter @tianwen/runtime-bundle run typecheck
git add packages/tianwen-runtime-bundle/src/long-goal-host.ts tests/dsh-migration/continuous-goal-host.spec.ts
git commit -m "fix: deliver goal feedback to cold conversations"
```

---

### Task 5: Exact Runtime and Desktop release identity

**Files:**
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `packages/tianwen-runtime-bundle/src/portable-profile.ts`
- Modify: `packages/tianwen-runtime-bundle/src/controlled-lifecycle.ts`
- Modify: `packages/tianwen-desktop-host/package.json`
- Modify: `packages/tianwen-desktop-host/src/main.ts`
- Modify: `scripts/install-tianwen.mjs`
- Modify: `scripts/stage-desktop-runtime.mjs`
- Modify: `scripts/audit-desktop-artifact.mjs`
- Modify: `scripts/verify-dsh-profile.mjs`
- Modify: `tests/dsh-migration/tianwen-installer.spec.ts`
- Modify: `tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts`
- Modify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-host.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-artifact.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `tests/dsh-migration/runtime-profile.spec.ts`
- Modify: `tests/dsh-migration/controlled-lifecycle-profile.spec.ts`
- Modify: `tests/dsh-migration/controlled-lifecycle-command.spec.ts`
- Modify: `tests/dsh-migration/portable-profile-composition.e2e.spec.ts`
- Modify: `tests/dsh-migration/portable-plugin-lifecycle.e2e.spec.ts`
- Modify: `tests/dsh-migration/portable-goal-cli.spec.ts`
- Modify: `tests/dsh-migration/ordinary-long-goal-cli.spec.ts`
- Modify: `tests/dsh-migration/one-shot-profile-lifecycle.spec.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: accepted Runtime `0.1.9`, Desktop `0.1.0-preview.10`, and DSH `0.1.1-rc.2`.
- Produces: immutable Runtime `0.1.10`, Desktop `0.1.0-preview.11`, with exact same-host predecessor Runtime `0.1.9`.

- [ ] **Step 1: Change release tests first and verify RED**

Update the release assertions to require:

```ts
runtimeVersion = '0.1.10'
desktopVersion = '0.1.0-preview.11'
sameDshPredecessor = '0.1.9'
runtimeArchive = 'tianwen-runtime-bundle-0.1.10.tgz'
```

Run the focused release set:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
```

Expected: FAIL against the still-`0.1.9` production manifests and scripts.

- [ ] **Step 2: Apply the exact version boundary**

Update production manifests/scripts from current `0.1.9` to `0.1.10`, Desktop `preview.10` to `preview.11`, and the same-DSH predecessor from `0.1.8` to `0.1.9`. Keep older archives; do not generalize the installer into a version-range engine.

- [ ] **Step 3: Refresh the lockfile and run release tests**

```powershell
pnpm install --lockfile-only --store-dir D:\DevData\pnpm-store
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-startup.e2e.spec.ts
```

Expected: all selected release and installed-profile tests pass.

- [ ] **Step 4: Run the repository gate before packaging**

```powershell
pnpm run check
```

Expected: install checks, private-import checks, typecheck, and the full Vitest suite all pass with no warning treated as failure.

- [ ] **Step 5: Commit the version boundary**

```powershell
git add packages/tianwen-runtime-bundle packages/tianwen-desktop-host scripts tests/dsh-migration pnpm-lock.yaml
git commit -m "chore: release runtime 0.1.10"
```

---

### Task 6: Formal installed Desktop acceptance

**Files:**
- Modify: `docs/operations/tianwen-native-conversation-progress-handoff.md`
- Modify: `docs/operations/tianwen-current-project-handoff.md`
- Modify: `docs/tianwen-architecture-overview-v2.md`
- Create only on `D:`: Runtime archive, Desktop unpacked build/installer, hashes, and a fresh acceptance workspace/state directory.

**Interfaces:**
- Consumes: the exact Task 5 commit, formal DSH home `D:\DevData\tianwen-experience\dsh-home`, and configured Desktop model route.
- Produces: installed Runtime `0.1.10`, Desktop `preview.11`, and one evidence-backed real user-path verdict.

- [ ] **Step 1: Build and pack exact artifacts on `D:`**

Run the official installer build against a fresh D-drive candidate root, copy the resulting immutable archive into the artifact directory, stage it into Desktop, and build both unpacked and NSIS forms:

```powershell
pnpm run install:tianwen -- --data-dir D:\DevData\tianwen-0.1.10-candidate --json
New-Item -ItemType Directory -Force -Path D:\DevData\tianwen-0.1.10-artifacts
Copy-Item -LiteralPath D:\DevData\tianwen-0.1.10-candidate\packs\tianwen-runtime-bundle-0.1.10.tgz -Destination D:\DevData\tianwen-0.1.10-artifacts\tianwen-runtime-bundle-0.1.10.tgz
node scripts/stage-desktop-runtime.mjs D:\DevData\tianwen-0.1.10-artifacts\tianwen-runtime-bundle-0.1.10.tgz
pnpm --filter @tianwen/desktop-host run build
pnpm --filter @tianwen/desktop-host run pack:dir
node scripts/audit-desktop-artifact.mjs D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge\dist\tianwen-desktop\win-unpacked D:\DevData\tianwen-0.1.10-artifacts\tianwen-runtime-bundle-0.1.10.tgz
pnpm --filter @tianwen/desktop-host run pack:win
```

Copy the single installer into `D:\DevData\tianwen-0.1.10-artifacts` and record SHA-256 for the Runtime archive and installer. Confirm the Desktop-embedded Runtime archive is byte-identical to the packed archive.

- [ ] **Step 2: Exercise the official upgrade boundary**

Run the official installer from accepted Runtime `0.1.9` to candidate `0.1.10`, then replay `0.1.10` once. Confirm `status=ready`, DSH remains `0.1.1-rc.2`, the old `0.1.9` archive remains, and no staging/backup directory remains.

- [ ] **Step 3: Update the Web Profile and launch the exact Desktop candidate**

Use official DSH plugin/profile operations; do not replace package bytes in place. Confirm the managed and Web Profile Runtime `runtime.js` and `client.js` hashes equal the packed candidate before beginning the user scenario.

- [ ] **Step 4: Run the real visible user scenario**

From the formal Desktop conversation UI:

1. create a fresh ordinary Session and submit one short, bounded `/goal` in natural Chinese;
2. confirm the command returns promptly and a plan/start reply appears without another user message;
3. open the top-left subagent catalog and verify every new row has a label, `一次性`, correct running/inactive state, and readable history;
4. use a bounded Task that naturally reaches one native user decision or approval; confirm the main conversation announces the exact Task and UI path before opening it;
5. decide through the child surface, then confirm progress resumes;
6. wait without sending a wake-up message and confirm the final result appears in the main conversation.

Use one bounded objective whose required write is outside the default sandbox but inside the fresh `D:\DevData\tianwen-0.1.10-acceptance` directory, so the existing `pwsh` approval path is exercised. If the single attempt does not reach native approval, mark this scenario failed and diagnose it; do not repeat paid/natural Tasks merely to chase an approval.

- [ ] **Step 5: Inspect durable acceptance facts**

For every new child, verify the header lineage and exactly one `subagent/descriptor`. Verify the control Session contains one start, each expected advance, one attention notice for the approval id, and one terminal notice with completed assistant replies. Confirm no notice duplicates and no new catalog diagnostic entry.

- [ ] **Step 6: Stop owned processes and document the verdict**

Stop only processes launched for the acceptance. Record exact commit, versions, artifact hashes, Session/Goal ids, timestamps, checks, remaining risk, and whether the user path passed. Do not claim completion if any visible step failed.

- [ ] **Step 7: Commit the handoff**

```powershell
git add docs/operations/tianwen-native-conversation-progress-handoff.md docs/operations/tianwen-current-project-handoff.md docs/tianwen-architecture-overview-v2.md
git commit -m "docs: record reliable feedback acceptance"
```

---

### Task 7: Final independent verification

**Files:**
- Review only: complete branch diff and acceptance evidence.

**Interfaces:**
- Consumes: exact final branch SHA, all test output, installed hashes, and formal Desktop evidence.
- Produces: a final blocker/important/minor review and a clean handoff.

- [ ] **Step 1: Run verification from the final SHA**

```powershell
git status --short
pnpm run check
```

Expected: clean worktree and full green gate.

- [ ] **Step 2: Review the final diff against the approved design**

Check specifically for descriptor duplication, stale approval routing, control-handle leaks, disposal races, notice replay, same-version package mutation, historical data changes, and any new DSH private import.

- [ ] **Step 3: Recheck installed identity and formal evidence**

Confirm installed Runtime/Client hashes still match the exact final artifacts and the recorded Desktop Session remains readable after one application restart.

- [ ] **Step 4: Report only evidence-backed completion**

State what changed, whether the real user flow passed, remaining risk, and the exact next user action. If a blocker remains, keep the task open and continue fixing it.
