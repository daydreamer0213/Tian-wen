# Tianwen DSH-Native Continuous Goal Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/goal <objective>` in an ordinary DSH Web/Desktop conversation start and continuously progress a Tianwen Long Goal, while natural conversation and the native stop control can guide, pause, redirect, resume, and inspect it.

**Architecture:** Register an Agent-scoped `goal` command that officially shadows DSH's global same-Session command without patching DSH. Add a strict v3 Long Goal record for the control Session and continuous mode, reuse the existing v2 Planner/Task/result-aware state machine, and add one serialized Host bridge from completed Task Goals to the existing Continue operation. Install one scoped control tool and prompt section only on bound control Agents; write no custom Session events and build no second UI.

**Tech Stack:** TypeScript, Vitest, Cordis, DSH 0.1.1-rc.2 public command/tool/system-prompt/session/goal APIs, pnpm, existing Tianwen Runtime/installer/Desktop packaging.

## Global Constraints

- DSH remains exact `0.1.1-rc.2`; do not modify or push DSH upstream.
- Preserve strict v1/v2 Long Goal records, public projections, and explicit/manual behavior.
- Only `/goal`-created v3 Goals auto-progress across Tasks.
- Reuse the existing Goal-first Planner, result-aware prompt, Task admission, and DSH Goal Round Driver.
- Do not add a scheduler, poller, daemon, retry loop, request/token/price budget, second classifier model, or separate Tianwen UI.
- Do not forge `assistant/message` or register a custom persistent Session event on rc2.
- Keep large products, package stores, proof workspaces, and temporary artifacts under `D:\DevData`.
- Use test-first red/green cycles for every behavior change and do not repeat real Provider runs to select a better answer.

---

## File Structure

- `packages/tianwen-runtime-bundle/src/long-goal-contract.ts`: v3 record/status/result types and shared Goal-first record aliases.
- `packages/tianwen-runtime-bundle/src/long-goal.ts`: strict v3 parsing, creation, mode/guidance/redirection mutations, projections, and binding lookup.
- `packages/tianwen-runtime-bundle/src/goal-first-service.ts`: make the existing action table accept both v2 and v3 without changing v2 behavior.
- `packages/tianwen-runtime-bundle/src/continuous-goal-service.ts`: v3-only start/control orchestration over existing Goal-first operations.
- `packages/tianwen-runtime-bundle/src/continuous-goal-agent.ts`: Agent-scoped `/goal`, scoped `tianwen_goal_control` tool, and short prompt section.
- `packages/tianwen-runtime-bundle/src/continuous-goal-host.ts`: DSH Agent/session/Task-complete event bridge, per-Goal serialization, and restart reconciliation.
- `packages/tianwen-runtime-bundle/src/long-goal-host.ts`: compose the new service/agent/host adapters from existing DSH dependencies.
- `packages/tianwen-runtime-bundle/src/learn-loop-client.ts` and `client.tsx`: keep the existing panel compatible as advanced v3 history only.
- `tests/dsh-migration/ordinary-long-goal.spec.ts`: exact v3 persistence and mutation tests.
- `tests/dsh-migration/continuous-goal-service.spec.ts`: deterministic control action tests.
- `tests/dsh-migration/continuous-goal-agent.spec.ts`: command/tool/prompt scoping and grammar tests.
- `tests/dsh-migration/continuous-goal-host.spec.ts`: complete-event, cancel, race, deduplication, and restart tests.
- Existing Host/client/runtime/installer/Desktop tests: compatibility and release artifact coverage.

---

### Task 1: Add the Strict V3 Continuous Goal Record

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-contract.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal.ts`
- Modify: `tests/dsh-migration/ordinary-long-goal.spec.ts`

**Interfaces:**
- Produces: `LongGoalRecordV3`, `LongGoalStatusProjectionV3`, `LongGoalSummaryV3`, `GoalFirstLongGoalRecord`.
- Produces: `createContinuousLongGoal()`, `setContinuousGoalMode()`, `appendContinuousGoalGuidance()`, `redirectContinuousGoal()`, `abandonContinuousGoalTask()`, `findContinuousGoalByControlSession()`.
- Preserves: every existing v1/v2 exported signature and exact response shape.

- [ ] **Step 1: Write failing v3 parser and compatibility tests**

Add tests whose expected record shape is exact:

```ts
const continuous = createContinuousLongGoal({
  stateRoot,
  objective: 'Ship the product',
  context: null,
  successCriteria: null,
  workspaceRoot,
  agentPreset: 'code',
  controlSessionId: 'session-control',
})

expect(continuous.schemaVersion).toBe('tianwen.long-goal.v3')
expect(continuous.control).toEqual({
  sessionId: 'session-control',
  autoProgress: 'running',
})
expect(readLongGoal(stateRoot, continuous.id)).toEqual(continuous)
```

Add exact-key rejection for a missing/extra control key, mixed-directory list
coverage for v1/v2/v3, and assertions that pre-existing v2 fixture bytes and
`tianwen.long-goal-status.v2` output do not change.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts
```

Expected: FAIL because `createContinuousLongGoal` and v3 parsing do not exist.

- [ ] **Step 3: Implement the smallest strict v3 type/parser/projection**

Use the existing v2 Task and Planner fields. Add only this durable delta:

```ts
export interface LongGoalRecordV3 extends Omit<LongGoalRecordV2, 'schemaVersion'> {
  readonly schemaVersion: 'tianwen.long-goal.v3'
  readonly control: {
    readonly sessionId: string
    readonly autoProgress: 'running' | 'paused'
  }
}

export type GoalFirstLongGoalRecord = LongGoalRecordV2 | LongGoalRecordV3
```

Give v3 its own strict summary/status schema identifiers and control block;
the projected Goal phase remains the existing
`planning | active | blocked | complete`, while `control.autoProgress`
distinguishes user-paused continuous work. `LongGoalSummaryV3` carries the same
control block so list/history can render that state without opening the record.
factor only the validation/projection code shared by v2 and v3. Do not loosen
v2 exact-key validation or add optional control fields to v2.

- [ ] **Step 4: Add failing atomic mutation tests**

Cover:

```ts
expect(setContinuousGoalMode({
  stateRoot,
  longGoalId: id,
  expectedRevision: 1,
  mode: 'paused',
}).control.autoProgress).toBe('paused')

expect(redirectContinuousGoal({
  stateRoot,
  longGoalId: id,
  expectedRevision: 2,
  text: '改成先解决离线安装',
})).toMatchObject({
  revision: 3,
  guidance: ['改成先解决离线安装'],
  control: { autoProgress: 'paused' },
})
```

Also prove same-mode writes are idempotent, stale revisions do not write,
Session lookup returns one active v3 binding, ordinary v3 guidance marks the
Planner `needs-replan`, and v3 redirection may abandon a confirmed paused Task
without changing its Goal/Session binding. Keep v2 abandonment blocked-only.

- [ ] **Step 5: Verify RED, implement minimal mutations, then verify GREEN**

Run the same focused test before and after implementation. Expected final:
PASS with no v1/v2 snapshot changes.

- [ ] **Step 6: Commit the storage boundary**

```powershell
git add packages/tianwen-runtime-bundle/src/long-goal-contract.ts packages/tianwen-runtime-bundle/src/long-goal.ts tests/dsh-migration/ordinary-long-goal.spec.ts
git commit -m "feat: persist continuous Goal control state"
```

---

### Task 2: Reuse the Existing Goal-First State Machine for Continuous Control

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/goal-first-service.ts`
- Create: `packages/tianwen-runtime-bundle/src/continuous-goal-service.ts`
- Modify: `tests/dsh-migration/goal-first-service.spec.ts`
- Create: `tests/dsh-migration/continuous-goal-service.spec.ts`

**Interfaces:**
- Consumes: `GoalFirstLongGoalRecord` and Task/status projections from Task 1.
- Produces: `ContinuousGoalControlAction`, `ContinuousGoalControlResult`, `ContinuousGoalServiceDependencies`.
- Produces: `createContinuousGoalProgress()` and `controlContinuousGoal()`.

- [ ] **Step 1: Write failing v3 reuse tests**

Run the existing action table against a v3 record and prove the same behavior
for planning, active, paused Task, blocked, ready, and complete states. The
test should call the real `continueGoalFirstProgress()` with deterministic
dependencies rather than copy its branches.

- [ ] **Step 2: Verify RED and generalize only the type guard**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/goal-first-service.spec.ts
```

Expected RED: current `requireV2Record`/`requireV2Status` rejects v3. Replace it
with a Goal-first guard that accepts exact v2/v3 and returns the matching
projection; do not duplicate the action table.

- [ ] **Step 3: Write failing control-action tests**

Use this public action union:

```ts
export type ContinuousGoalControlAction =
  | { readonly action: 'guide'; readonly text: string }
  | { readonly action: 'pause-and-replan'; readonly text: string; readonly resume: boolean }
  | { readonly action: 'pause' }
  | { readonly action: 'resume' }
  | { readonly action: 'status' }

export interface ContinuousGoalControlResult {
  readonly schemaVersion: 'tianwen.continuous-goal-control-result.v1'
  readonly action:
    | 'started' | 'planning-pending' | 'guided' | 'redirected'
    | 'paused' | 'resumed' | 'blocked' | 'complete' | 'status'
  readonly status: LongGoalStatusProjectionV3
  readonly sessionId: string | null
}
```

Prove:

- create persists v3 before `runPlannerTurn` and starts at most one Task;
- `guide` only appends durable guidance and waits for the next Task boundary;
- `pause` writes paused before asking DSH to cancel an active Task;
- `resume` writes running and calls the existing Continue operation once;
- redirection atomically writes guidance+pause, cancels, confirms Task paused,
  abandons the old binding, runs one Planner Turn, and resumes only when asked;
- failure after the atomic redirection write leaves the Goal paused and the
  correction durable;
- status performs no Provider, Goal, or Session mutation.

- [ ] **Step 4: Verify RED, implement the orchestration, verify GREEN**

The dependency boundary is narrow:

```ts
export interface ContinuousGoalServiceDependencies extends GoalFirstServiceDependencies {
  readonly createContinuousRecord: typeof createContinuousLongGoal
  readonly setMode: typeof setContinuousGoalMode
  readonly appendGuidanceOnly: typeof appendContinuousGoalGuidance
  readonly redirect: typeof redirectContinuousGoal
  readonly abandonRedirectedTask: typeof abandonContinuousGoalTask
  readonly cancelTaskAndReadStatus: (sessionId: string) => Promise<'paused' | 'complete'>
}
```

Do not add retry, timeout, queue, or budget options. Run:

```powershell
pnpm exec vitest run tests/dsh-migration/goal-first-service.spec.ts tests/dsh-migration/continuous-goal-service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the service boundary**

```powershell
git add packages/tianwen-runtime-bundle/src/goal-first-service.ts packages/tianwen-runtime-bundle/src/continuous-goal-service.ts tests/dsh-migration/goal-first-service.spec.ts tests/dsh-migration/continuous-goal-service.spec.ts
git commit -m "feat: add continuous Goal control service"
```

---

### Task 3: Install the DSH-Native Command and Natural-Language Control

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/continuous-goal-agent.ts`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `tests/dsh-migration/continuous-goal-agent.spec.ts`

**Interfaces:**
- Consumes: `createContinuousGoalProgress()` and `controlContinuousGoal()` from Task 2.
- Produces: `installContinuousGoalCommand(agent, operations)` and `installBoundContinuousGoalControls(agent, operations)`; each returns its exact disposer.
- Produces: `ContinuousGoalAgentOperations` with `create(agent, objective)` and
  `control(agent, action)` methods; model/command input never supplies identity.

- [ ] **Step 1: Write failing command grammar and scoping tests**

Prove that an Agent-scoped definition named `goal` shadows the DSH global
definition without a second global registration. Freeze this grammar:

```text
/goal                     -> status or start usage
/goal <objective>         -> create continuous Goal
/goal pause               -> pause
/goal resume              -> resume
/goal edit <direction>    -> pause-and-replan, resume=true
```

Reject empty `edit`, a second non-complete control binding, and a Planner/Task
Session used as a control Session. Derive workspace, preset, and Session ID
only from `invocation.agent.session.header`.

- [ ] **Step 2: Verify RED, implement the scoped command, verify GREEN**

Register through the public Agent context:

```ts
const dispose = agent.ctx.commands.register({
  name: 'goal',
  description: 'start or control a long-running goal',
  input: { hint: '[<objective>|pause|resume|edit <direction>]', images: false },
  handler: invocation => operations.handleCommand(invocation.agent, invocation.rawInput),
})
```

Do not disable the DSH Goal service or Goal Round Driver: the shadow command
does not create a visible-session DSH Goal, while internal Task Sessions still
need the driver.

- [ ] **Step 3: Write failing scoped tool/prompt tests**

Use one tool named `tianwen_goal_control` with the Task 2 action union. Prove:

- the executor derives the control Session from `exec.agent?.session.id`;
- model arguments contain no Goal, Task, Session, or workspace identifier;
- unbound/missing Agent execution returns a benign no-active-Goal result;
- the named system prompt section is merged, not `complete`, and tells the
  Agent to call the tool for Goal-relevant guidance, correction, pause, resume,
  or status while leaving unrelated conversation alone;
- disposing/reinstalling creates no duplicate command, tool, or prompt section.

- [ ] **Step 4: Verify RED, implement minimal scoped controls, verify GREEN**

Use existing `defineTool`, `agent.ctx.tools.register()`, and
`agent.ctx.systemPrompt.section()`. Do not add a natural-language keyword parser
or classifier. Run:

```powershell
pnpm exec vitest run tests/dsh-migration/continuous-goal-agent.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the DSH-native control surface**

```powershell
git add packages/tianwen-runtime-bundle/src/continuous-goal-agent.ts packages/tianwen-runtime-bundle/package.json pnpm-lock.yaml tests/dsh-migration/continuous-goal-agent.spec.ts
git commit -m "feat: expose continuous Goals in DSH chat"
```

---

### Task 4: Add the Serialized Completion, Stop, and Restart Bridge

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/continuous-goal-host.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-host.ts`
- Create: `tests/dsh-migration/continuous-goal-host.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-host.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-host.integration.spec.ts`

**Interfaces:**
- Consumes: v3 binding lookup, Task/status readers, Task 2 service operations, and Task 3 installers.
- Produces: `mountContinuousGoalHost(ctx, dependencies): () => void`.

- [ ] **Step 1: Write failing Task-complete bridge tests**

Drive the public DSH event shape and assert behavior:

```ts
coordinator.onGoalChanged({
  agent: taskAgent,
  change: { operation: 'complete', ref: { id: taskGoalId, revision: 4 }, goal },
})
```

Prove exact Task `sessionId + goalId` matching, `agent.whenIdle()` then Session
flush, latest-revision reread, one call to existing Continue, result-aware
Planner input preservation, and no action for v1/v2, paused v3, block/pause
events, unrelated Goals, or an already-considered completion.

- [ ] **Step 2: Verify RED, add one per-Goal promise lane, verify GREEN**

Use one `Map<string, Promise<void>>` to serialize by Long Goal ID and remove the
entry in `finally`. Duplicate complete events join the current promise; they do
not create a scheduler, retry queue, or permanent worker.

- [ ] **Step 3: Write failing native-stop and Agent lifecycle tests**

Listen to the exact public Session event signature `(session, event)` and only
pause when:

```ts
event.type === 'turn/end' &&
event.data.reason.kind === 'aborted' &&
event.data.reason.reason.kind === 'user'
```

Prove that a bound running v3 mode is persisted paused before the current Task
Agent is cancelled, while unrelated, completed, already-paused, or non-user
turn ends do nothing. Prove `agent/created({agent})` synchronously installs the
scoped command and restores tool/prompt controls when a durable binding exists.

- [ ] **Step 4: Write failing restart reconciliation tests**

At Host mount, prove:

- paused v3 is indexed but not resumed;
- running active Task relies on the existing Goal Round Driver;
- running ready or newly-settled state calls Continue once through the lane;
- blocked/complete states start nothing;
- two reconciliations do not create another Task or Session.

- [ ] **Step 5: Implement the Host adapter and run focused integration**

Keep DSH-specific event plumbing in `continuous-goal-host.ts`; pass existing
`goalFirstOperations`, Session/Agent/Goal services, roots, and persistence from
`long-goal-host.ts`. Run:

```powershell
pnpm exec vitest run tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/learn-loop-host.integration.spec.ts
```

Expected: PASS with no client polling and no custom Session event.

- [ ] **Step 6: Commit the lifecycle bridge**

```powershell
git add packages/tianwen-runtime-bundle/src/continuous-goal-host.ts packages/tianwen-runtime-bundle/src/long-goal-host.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/learn-loop-host.integration.spec.ts
git commit -m "feat: continue Goals across Task sessions"
```

---

### Task 5: Preserve Advanced History and Publish One Release Identity

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/learn-loop-client.ts`
- Modify: `packages/tianwen-runtime-bundle/src/client.tsx`
- Modify: `packages/tianwen-runtime-bundle/src/goal-task-feedback.ts`
- Modify: `tests/dsh-migration/learn-loop-client.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-client-module.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-web-product.spec.ts`
- Modify: `tests/dsh-migration/goal-task-feedback.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `packages/tianwen-desktop-host/package.json`
- Modify: `packages/tianwen-desktop-host/src/host.ts`
- Modify: `packages/tianwen-desktop-host/src/locale.ts`
- Modify: `packages/tianwen-desktop-host/src/main.ts`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `packages/tianwen-runtime-bundle/src/controlled-lifecycle.ts`
- Modify: `packages/tianwen-runtime-bundle/src/portable-profile.ts`
- Modify: `scripts/audit-desktop-artifact.mjs`
- Modify: `scripts/install-tianwen.mjs`
- Modify: `scripts/stage-desktop-runtime.mjs`
- Modify: `scripts/verify-dsh-profile.mjs`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `tests/dsh-migration/tianwen-installer.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-artifact.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-host.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-locale.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts`
- Modify: `tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts`
- Modify: `docs/tianwen-architecture-overview-v2.md`

**Interfaces:**
- Consumes: v3 projections from Task 1.
- Preserves: the panel as optional advanced history; no new default entry or component.

- [ ] **Step 1: Write failing v3 client/history tests**

Prove strict v3 RPC decoding, list/detail rendering through the existing Goal
rows, current action text for running/paused/blocked/complete v3, and existing
feedback eligibility for settled v3 Tasks. Assert the sidebar entry remains
optional advanced history and `/goal` does not open it.

- [ ] **Step 2: Verify RED, implement only structural v3 compatibility, verify GREEN**

Reuse v2 components with a small type guard/helper. Do not create a continuous
mode dashboard, badge, composer, Task editor, or polling loop.

- [ ] **Step 3: Write failing release-identity tests**

Freeze the next identities as Runtime `0.1.4` and Desktop
`0.1.0-preview.5`. The only automatic predecessor is exact Runtime `0.1.3`;
unknown, older, future, or damaged Profiles remain manual. Update artifact
allowlists only for files actually added by Tasks 1-4.

- [ ] **Step 4: Implement release metadata and correct architecture facts**

Update the stale architecture overview statements that still name Runtime
`0.1.2` / Desktop `preview.3`, then document Runtime `0.1.4`, Desktop
`preview.5`, native `/goal`, continuous Task boundaries, natural control, and
the absence of a second UI/custom progress event.

- [ ] **Step 5: Run focused compatibility and artifact tests**

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/goal-first-service.spec.ts tests/dsh-migration/continuous-goal-service.spec.ts tests/dsh-migration/continuous-goal-agent.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/goal-task-feedback.spec.ts tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/learn-loop-host.integration.spec.ts tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/learn-loop-client-module.spec.ts tests/dsh-migration/learn-loop-web-product.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit product compatibility and release identity**

Stage only reviewed feature/release/docs files, then:

```powershell
git commit -m "chore: release Tianwen Runtime 0.1.4"
```

---

### Task 6: Verify the Installed Product Once, Integrate, and Close the Stage

**Files:**
- Create: `docs/operations/tianwen-dsh-native-continuous-goal-handoff.md`
- No production-file changes are planned in this task. A discovered defect
  returns to its owning Task and begins with a focused failing regression test.

**Interfaces:**
- Produces: deterministic gate evidence, one installed-product result, one real configured-Provider result, commit/SHA/CI evidence, and cleanup inventory.

- [ ] **Step 1: Run deterministic repository gates once**

Use project scripts to run TypeScript typecheck, Runtime build, focused tests,
installer/Desktop artifact verification, Python gate, and the normal repository
gate. Record exact commands and results; do not rerun successful suites merely
because an unrelated environment check is noisy.

- [ ] **Step 2: Build and install under `D:\DevData`**

Create a fresh product home and workspace under
`D:\DevData\tianwen-continuous-goal-proof-<timestamp>`. Build the official
Runtime `0.1.4` archive and Desktop `preview.5`, run the official installer,
and verify exact DSH `0.1.1-rc.2` plus Runtime `0.1.4`. Do not reuse historical
product/evidence workspaces.

- [ ] **Step 3: Run Provider-free Web/Desktop product checks**

Verify the DSH command picker shows one `/goal`, no separate continuous-mode
panel is required, an empty command reports usage, native stop maps to paused,
cold restart restores the same v3 binding, and v1/v2 advanced history still
opens. Use deterministic Provider doubles for Task completion and race cases.

- [ ] **Step 4: Run one useful real DeepSeek Goal exactly once**

From the installed ordinary DSH conversation, issue one small real
`/goal <objective>` whose plan requires at least two Tasks. Allow the platform
quota to govern. Confirm separate Task Sessions, Task 1 final-result inclusion
in the next Planner Turn, automatic Task 2 admission, natural-language guidance
or pause/resume once, and final Goal completion. A failed run is reported as-is
and is not repeated to pick a better answer.

- [ ] **Step 5: Independently review evidence and write the handoff**

Separate these headings in the handoff:

```text
Product result
Deterministic verification
Natural runtime evidence
Learning facts
External Provider facts
Known limitations
```

Do not infer Provider billing from internal Session/tool/event counts. State
that this run proves the DSH-native continuous product path, not additional
learning or benchmark quality.

- [ ] **Step 6: Review, integrate, push, and check exact-main CI**

Run an independent correctness review, fix only reproduced findings with a
failing test first, merge the feature branch into current main, push Tianwen's
repository, and inspect the exact-main GitHub Actions run for Python,
TypeScript, Desktop Windows, and installer Windows. Do not trigger, cancel, or
rerun CI automatically.

- [ ] **Step 7: Inventory cleanup candidates without deleting evidence**

After the stage is closed, rescan `D:\DevData` for large Tianwen-generated
downloads/caches from this and earlier stages. Report exact safe paths and
sizes. Delete only paths proven regenerable and not used by registered
worktrees or retained product/proof/evidence/history; if host policy blocks
safe deletion, leave the list for manual cleanup.
