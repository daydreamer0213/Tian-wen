# Tianwen Goal-First Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an ordinary user state one long Goal, have Tianwen plan the next useful Tasks with the configured DSH Agent, continue each Task in its own DSH Session, and guide future planning without manually authoring Tasks or round limits.

**Architecture:** Keep strict authored `tianwen.long-goal.v1` records unchanged and add a discriminated v2 record owned by Tianwen. A platform-independent service owns the state table; one stable DSH planner Session submits plans through an Agent-scoped typed tool, while existing DSH Goal/Session execution remains authoritative for each Task. Web/Desktop and installed CLI are adapters over that same service.

**Tech Stack:** TypeScript 6.0.3, Node.js 22, exact `@deepseek-ai/dsh@0.1.1-rc.2` public Agent/Session/Goal/Tool services, React 18, Vitest 4.1.8, pnpm 11.20.0.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-30-tianwen-goal-first-planning-design.md` exactly.
- Keep all valid v1 files, RPC shapes, client projections, CLI commands, and execution behavior unchanged.
- Use one stable planner DSH Session per v2 Goal and one distinct existing DSH Goal/Session per execution Task.
- Persist the v2 Goal before creating its planner Session; never replace a frozen Session identity after an ambiguous create.
- Use only the record's canonical non-root workspace for planner and Task Sessions.
- Accept plans only through `submit_long_goal_plan`; never parse assistant prose or JSON as authority.
- Preserve every bound Task byte-for-byte during replanning; only an explicit user action may mark the current blocked Task abandoned.
- Do not add a DAG, scheduler, daemon, automatic retry, budget, permission framework, second Agent loop, second chat store, learning flow, or controlled Activity.
- A recoverable Provider/no-tool result stays `planning-pending`; do not retry it automatically.
- Keep generated Profiles, product workspaces, package caches, and temporary evidence under `D:\DevData`.

---

### Task 1: Add Strict V2 Storage and Status Without Changing V1

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-contract.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal.ts`
- Modify: `tests/dsh-migration/ordinary-long-goal.spec.ts`

**Interfaces:**
- Preserve `LongGoalRecord`, `LongGoalStatusProjection`, and `LongGoalSummary` as exact v1 aliases.
- Add the exact v2 record/projection types from design sections 5 and 5.2 and these exported unions/functions:

```ts
export type AnyLongGoalRecord = LongGoalRecord | LongGoalRecordV2
export type AnyLongGoalStatusProjection =
  | LongGoalStatusProjection | LongGoalStatusProjectionV2
export type AnyLongGoalSummary = LongGoalSummary | LongGoalSummaryV2

export function createGoalFirstLongGoal(input: {
  readonly stateRoot: string
  readonly objective: string
  readonly context: string | null
  readonly successCriteria: string | null
  readonly workspaceRoot: string
  readonly agentPreset: string
}, dependencies?: {
  readonly goalSuffix?: () => string
  readonly plannerSessionId?: () => string
  readonly now?: () => number
}): LongGoalRecordV2

export function appendLongGoalGuidance(
  stateRoot: string, longGoalId: string, expectedRevision: number, text: string,
): LongGoalRecordV2

export function commitLongGoalPlan(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly outcome: 'continue' | 'complete'
  readonly tasks: readonly { readonly objective: string }[]
  readonly consideredSettledTasks: number
}, dependencies?: {
  readonly taskId?: () => string
  readonly now?: () => number
}): LongGoalRecordV2

export function abandonBlockedLongGoalTask(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly taskId: string
  readonly dshStatusTarget: StatusTarget
}): Promise<LongGoalRecordV2>

export function bindGoalFirstLongGoalTask(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly taskId: string
  readonly execution: TaskExecutionBinding
}): LongGoalRecordV2
```

- Add `LongGoalRevisionConflictError` with readonly `expectedRevision` and `currentRevision`.
- Keep `bindLongGoalTask()` as the exact v1 mutation. The v2-only
  `bindGoalFirstLongGoalTask()` requires expected revision, increments it, and
  preserves planner/guidance fields.
- `readLongGoalStatus()` returns the discriminated union and implements the exact phase rules in design section 5.1.

- [ ] **Step 1: Write RED v1/v2 parser and mutation tests**

Add exact fixtures for a valid v1 plus unplanned, ready, needs-replan, complete, and blocked v2 records. Require mixed-directory list/read/status to discriminate by `schemaVersion`; verify an empty unplanned v2 Goal projects `planning`, while all existing v1 snapshots remain unchanged.

Add mutation tests requiring: guidance persists before planning; stale revision changes no bytes; plan submission accepts one-to-five non-empty Tasks or a complete/empty result; replanning preserves the bound prefix and gives replacement Tasks fresh IDs; v2 binding increments revision; abandon is legal only for the current blocked bound Task and preserves its execution.

- [ ] **Step 2: Run the RED storage tests**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts
```

Expected: new v2 imports/assertions fail while existing v1 cases remain green.

- [ ] **Step 3: Implement the discriminated parser and v2 atomic writes**

Dispatch on `schemaVersion` before exact-key validation. Keep the existing v1 parser and writer path intact; add independent exact v2 parsing, canonical workspace validation, stable UUID Task IDs, expected-revision checks, and the existing same-directory temporary-write/rename operation.

Project Task phases from DSH status; an abandoned Task projects `abandoned` without erasing its blocked binding. Set v2 `currentTaskId` to the first bound non-settled Task, otherwise the first ready unbound Task, otherwise `null`.

- [ ] **Step 4: Run Task 1 verification and commit**

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/ordinary-long-goal-cli.spec.ts
pnpm --filter '@tianwen/runtime-bundle' typecheck
git diff --check
git add packages/tianwen-runtime-bundle/src/long-goal-contract.ts packages/tianwen-runtime-bundle/src/long-goal.ts tests/dsh-migration/ordinary-long-goal.spec.ts
git commit -m "feat: add goal-first long-goal records"
```

---

### Task 2: Implement the Goal-First State Service With Deterministic Planner Doubles

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-contract.ts`
- Create: `packages/tianwen-runtime-bundle/src/goal-first-service.ts`
- Create: `tests/dsh-migration/goal-first-service.spec.ts`

**Interfaces:**

```ts
export interface GoalFirstServiceDependencies {
  readonly createRecord: typeof createGoalFirstLongGoal
  readonly readRecord: typeof readLongGoal
  readonly readStatus: typeof readLongGoalStatus
  readonly appendGuidance: typeof appendLongGoalGuidance
  readonly abandonBlockedTask: typeof abandonBlockedLongGoalTask
  readonly runPlannerTurn: (input: {
    readonly record: LongGoalRecordV2
    readonly reason: 'create' | 'continue' | 'guidance'
  }) => Promise<'submitted' | 'not-submitted'>
  readonly runTask: (input: {
    readonly stateRoot: string
    readonly dshStatusTarget: Parameters<typeof readLongGoalStatus>[0]['dshStatusTarget']
    readonly longGoalId: string
    readonly expectedRevision: number
  }) => Promise<{
    readonly action: 'started' | 'continued' | 'already-running'
    readonly sessionId: string
  }>
}

export function createGoalFirstProgress(input: {
  readonly stateRoot: string
  readonly dshStatusTarget: Parameters<typeof readLongGoalStatus>[0]['dshStatusTarget']
  readonly objective: string
  readonly context: string | null
  readonly successCriteria: string | null
  readonly workspaceRoot: string
  readonly agentPreset: string
}, dependencies: GoalFirstServiceDependencies): Promise<GoalFirstProgressResultV2>

export function continueGoalFirstProgress(input: {
  readonly stateRoot: string
  readonly dshStatusTarget: Parameters<typeof readLongGoalStatus>[0]['dshStatusTarget']
  readonly longGoalId: string
  readonly expectedRevision: number
}, dependencies: GoalFirstServiceDependencies): Promise<GoalFirstProgressResultV2>

export function addGoalFirstGuidance(input: {
  readonly stateRoot: string
  readonly dshStatusTarget: Parameters<typeof readLongGoalStatus>[0]['dshStatusTarget']
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly text: string
}, dependencies: GoalFirstServiceDependencies): Promise<LongGoalGuidanceResultV2>

export function abandonGoalFirstTask(input: {
  readonly stateRoot: string
  readonly dshStatusTarget: Parameters<typeof readLongGoalStatus>[0]['dshStatusTarget']
  readonly longGoalId: string
  readonly expectedRevision: number
}, dependencies: GoalFirstServiceDependencies): Promise<LongGoalAbandonResultV2>
```

- Add the three exact result interfaces from design section 5.2 to the
  browser-safe `long-goal-contract.ts`; `goal-first-service.ts` imports and
  re-exports those types rather than defining a second shape.
- Adapters supply facts only; they never supply transition decisions. The
  abandon operation awaits `abandonBlockedTask` with that same DSH status
  target.

- [ ] **Step 1: Write the RED action-table tests**

Use in-memory deterministic dependencies and cover every design-section-7 row: create plan-plus-first-admission; no-tool create; active/paused opens the same Task without planning; blocked returns `blocked`; ready admits without planning; newly settled work triggers exactly one plan before admission; complete performs no runtime call; guidance stores first and never starts a Task; failed guidance leaves current work runnable; abandon writes once and does not plan automatically.

Assert exact call order for the main path:

```ts
expect(events).toEqual([
  'record-created', 'planner-turn', 'status-read', 'task-admitted', 'status-read',
])
```

- [ ] **Step 2: Run RED and implement the minimal state table**

```powershell
pnpm exec vitest run tests/dsh-migration/goal-first-service.spec.ts
```

Implement direct branching over the frozen status/record facts. A single user operation may run at most one planner Turn and admit at most one Task. Convert `not-submitted` to the exact recoverable result instead of throwing or looping.

- [ ] **Step 3: Verify and commit Task 2**

```powershell
pnpm exec vitest run tests/dsh-migration/goal-first-service.spec.ts tests/dsh-migration/ordinary-long-goal.spec.ts
pnpm --filter '@tianwen/runtime-bundle' typecheck
git diff --check
git add packages/tianwen-runtime-bundle/src/long-goal-contract.ts packages/tianwen-runtime-bundle/src/goal-first-service.ts tests/dsh-migration/goal-first-service.spec.ts
git commit -m "feat: orchestrate goal-first progress"
```

---

### Task 3: Run One Stable Planner Session Through Public DSH APIs

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/long-goal-planner.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-host.ts`
- Modify: `packages/tianwen-runtime-bundle/src/runtime.ts`
- Modify: `tests/dsh-migration/learn-loop-host.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-host.integration.spec.ts`

**Interfaces:**

```ts
export interface LongGoalPlannerDependencies {
  readonly inspectSession: (sessionId: string) => Promise<{
    readonly exists: boolean
    readonly cwd?: string
    readonly agentPreset?: string
  }>
  readonly createAgent: (input: {
    readonly sessionId: string
    readonly cwd: string
    readonly agentPreset: string
    readonly setup: AgentSetup
  }) => Promise<AgentHandle>
  readonly resumeAgent: (input: {
    readonly sessionId: string
    readonly setup: AgentSetup
  }) => Promise<AgentHandle>
  readonly flushSession: (agent: Agent) => Promise<void>
}

export async function runLongGoalPlannerTurn(input: {
  readonly stateRoot: string
  readonly dshStatusTarget: Parameters<typeof readLongGoalStatus>[0]['dshStatusTarget']
  readonly record: LongGoalRecordV2
  readonly reason: 'create' | 'continue' | 'guidance'
}, dependencies: LongGoalPlannerDependencies): Promise<'submitted' | 'not-submitted'>
```

- Register exactly one Agent-scoped `submit_long_goal_plan` tool using `defineTool()`. Its model-supplied parameters are `expectedGoalRevision`, `outcome`, and `tasks[{objective}]`; its execute callback reads the current status to calculate trusted `consideredSettledTasks`, calls `commitLongGoalPlan()`, and then `exec.concludeTurn()` on success.
- Planner Agent create uses the frozen Session ID, `{ cwd: workspaceRoot, agentPreset }`, and setup callback. Resume inspects and verifies the same header before installing the same scoped tool.

- [ ] **Step 1: Write RED planner lifecycle tests**

Require record-first creation, exact preallocated Session identity, scoped-tool installation on create and cold resume, one `followup()` plus `whenIdle()` plus flush, header mismatch failure before a model Turn, no replacement ID after ambiguous create, and `not-submitted` when the Turn ends without a successful tool call.

Use a deterministic fake Agent to call the captured tool definition; require its commit to preserve the bound prefix and conclude the Turn. Add one offline DSH harness test that creates, flushes, disposes, cold-resumes, reinstalls the tool, and submits a second future plan through the same Session.

- [ ] **Step 2: Run RED and implement the planner adapter**

```powershell
pnpm exec vitest run tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/learn-loop-host.integration.spec.ts
```

Use public `ctx.sessionPersistence.list()`, `ctx.agents.create()`, `ctx.agents.resume()`, `agent.followup()`, `agent.whenIdle()`, scoped `agentCtx.tools.register(defineTool(...))`, and `ctx.sessions.flush()`. Dispose only the handle owned by this operation after idle/flush; never dispose or recreate another live owner.

- [ ] **Step 3: Connect the host to the shared service**

Add strict RPC endpoints with these exact payloads:

```ts
create-goal-first: {
  objective: string
  context: string | null
  successCriteria: string | null
  workspaceSessionId: string
}
add-guidance: { longGoalId: string; expectedRevision: number; text: string }
continue-progress: { longGoalId: string; expectedRevision: number }
abandon-current-task: { longGoalId: string; expectedRevision: number }
```

Each success uses the standard RPC envelope with its named v2 result directly
as `value`. Map `LongGoalRevisionConflictError` to exact code
`revision-conflict` and details `{ expectedRevision, currentRevision }`; keep
existing v1 endpoints and their error envelope exact. Resolve
`workspaceSessionId` through the server-side DSH Session list and require its
canonical cwd plus persisted Agent preset before calling the
platform-independent service. Browser input never supplies a path or preset.

Task admission for v2 must use `record.workspaceRoot` and verify the persisted Session header on resume; do not accept or reuse browser `initialCwd` for v2.

- [ ] **Step 4: Verify and commit Task 3**

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/learn-loop-host.integration.spec.ts tests/dsh-migration/goal-first-service.spec.ts
pnpm --filter '@tianwen/runtime-bundle' typecheck
pnpm run check:no-private-dsh-imports
git diff --check
git add packages/tianwen-runtime-bundle/src/long-goal-planner.ts packages/tianwen-runtime-bundle/src/long-goal-host.ts packages/tianwen-runtime-bundle/src/runtime.ts tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/learn-loop-host.integration.spec.ts
git commit -m "feat: plan long goals with DSH"
```

---

### Task 4: Make Goal-First the Default Web/Desktop Experience

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/learn-loop-client.ts`
- Modify: `packages/tianwen-runtime-bundle/src/client.tsx`
- Modify: `tests/dsh-migration/learn-loop-client.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-client-module.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-web-product.spec.ts`

**Interfaces:**
- Keep the existing v1 methods and add exact v2 client methods matching the four Task 3 endpoints and result schemas.
- Client parsers dispatch on `schemaVersion` and exact-validate v1/v2 independently.

- [ ] **Step 1: Write RED RPC/client and UI tests**

Require v1 and v2 summaries/statuses to coexist; extra fields fail both exact parsers. Require the default create form to contain Goal, optional context, optional success criteria, and `Start progressing`, with no Task rows or round input. Require detail actions for Continue, guidance, opening an existing Task Session, and blocked abandon.

- [ ] **Step 2: Implement the strict client wrapper and default flow**

Replace manual v1 creation as the default UI path but keep legacy v1 Goal rendering and execution. On v2 create, send the selected DSH Session ID rather than a browser-authored path; the host resolves cwd/preset. Use every returned authoritative status revision for the next mutation. On `revision-conflict`, refresh once for display and do not replay the mutation.

Keep the existing overlay, DSH Session navigation, locale switch, focus behavior, and responsive layout. Add only the new fields/actions; do not add routing, a graph editor, a component library, or a second chat panel.

- [ ] **Step 3: Verify and commit Task 4**

```powershell
pnpm --filter '@tianwen/runtime-bundle' build
pnpm exec vitest run tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/learn-loop-client-module.spec.ts tests/dsh-migration/learn-loop-web-product.spec.ts
pnpm --filter '@tianwen/runtime-bundle' typecheck
git diff --check
git add packages/tianwen-runtime-bundle/src/learn-loop-client.ts packages/tianwen-runtime-bundle/src/client.tsx tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/learn-loop-client-module.spec.ts tests/dsh-migration/learn-loop-web-product.spec.ts
git commit -m "feat: make Learn Loop goal-first"
```

---

### Task 5: Add the Same Goal-First Service to the Installed CLI and Close the Product Stage

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/goal-first-runner.ts`
- Create: `packages/tianwen-runtime-bundle/src/goal-first.ts`
- Create: `packages/tianwen-runtime-bundle/goal-first.patch.yml`
- Modify: `packages/tianwen-runtime-bundle/src/cli.ts`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `tests/dsh-migration/ordinary-long-goal-cli.spec.ts`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `tests/dsh-migration/tianwen-installer.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-web-product.spec.ts`
- Modify: `scripts/verify-dsh-profile.mjs`
- Create: `docs/operations/tianwen-goal-first-planning-handoff.md`

**Interfaces:**
- Preserve `tianwen plan create --task ... --max-rounds ...` as v1.
- Add goal-first commands using the same service and exact v2 projections:

```text
tianwen goal start --objective <text> [--context <text>] [--success-criteria <text>]
tianwen goal continue --goal <id> --revision <n>
tianwen goal guide --goal <id> --revision <n> --text <text>
tianwen goal abandon --goal <id> --revision <n>
```

- Managed and portable target rules stay the same; the adapter derives one canonical workspace and configured preset before invoking `goal-first-runner`.

- [ ] **Step 1: Write RED installed CLI tests**

Require the four commands to reject missing/repeated/mixed fields, preserve all v1 command behavior, emit exact JSON results with `--json`, and call one fake shared service operation. Verify no CLI adapter contains its own planning/state-table branches.

- [ ] **Step 2: Implement one launcher and runner over the existing DSH Profile boot pattern**

Reuse the same public Profile composition used by existing create/resume runners, then call `goal-first-service.ts` with `long-goal-planner.ts` and Task runtime adapters. Do not duplicate the planner prompt, typed-tool schema, or transition table in `cli.ts`; the CLI only validates arguments, resolves the product target, launches the runner, and prints the returned projection.

Publish a dedicated `goal-first.patch.yml` that mounts the configured Agent preset support and exactly one one-shot runner. Add `dist/goal-first-runner.js`, its export, the patch, and the exact verification allowlists to the Runtime Bundle and installer artifact checks. A built runner that the installed Profile cannot mount is incomplete.

- [ ] **Step 3: Run deterministic product gates**

```powershell
pnpm --filter '@tianwen/runtime-bundle' build
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/ordinary-long-goal-cli.spec.ts tests/dsh-migration/goal-first-service.spec.ts tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/learn-loop-host.integration.spec.ts tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/learn-loop-client-module.spec.ts tests/dsh-migration/learn-loop-web-product.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts
pnpm run check:no-private-dsh-imports
pnpm run typecheck
git diff --check
```

- [ ] **Step 4: Run one ordinary installed-product Provider smoke**

Use a fresh product root and disposable repository under `D:\DevData`. Through the official installed product, create one useful small Goal with the configured Provider, accept exactly one planner Turn, verify at least one typed plan submission, open/start the first Task through its distinct DSH Goal/Session, add one Goal-level guidance message, and verify only the unbound suffix changes. Do not rerun to select a nicer plan.

This smoke is runtime evidence only. Report Provider/model identity if available, but do not infer billing from Session, Turn, tool, or request counts and do not create a controlled Activity.

- [ ] **Step 5: Review and commit the deterministic product implementation**

Review the implementation diff once for v1 compatibility, workspace/Session identity, state-table ownership, installed artifact completeness, and accidental scope expansion. Rerun only tests affected by review fixes.

```powershell
git add packages/tianwen-runtime-bundle/src/goal-first-runner.ts packages/tianwen-runtime-bundle/src/goal-first.ts packages/tianwen-runtime-bundle/goal-first.patch.yml packages/tianwen-runtime-bundle/src/cli.ts packages/tianwen-runtime-bundle/package.json tests/dsh-migration/ordinary-long-goal-cli.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/learn-loop-web-product.spec.ts scripts/verify-dsh-profile.mjs
git commit -m "feat: ship goal-first Learn Loop"
```

- [ ] **Step 6: Controller runs the one-shot smoke and writes the handoff**

Separate product result, runtime evidence, learning facts (none unless independently produced), and external facts. Record any recoverable Provider/no-tool outcome honestly. Do not amend the reviewed implementation commit to make runtime evidence look pre-existing.

```powershell
git add docs/operations/tianwen-goal-first-planning-handoff.md
git commit -m "docs: close goal-first planning"
```

---

## Integration and Exact-Main Closeout

- [ ] Run the normal repository gate once after the complete diff is stable; do not repeat it for environment-only noise.
- [ ] Push the reviewed current `main`, verify `origin/main` equals the exact local SHA, and inspect one exact-SHA GitHub Actions run.
- [ ] Report each job once. Do not create a recurring monitor unless the user asks again.
- [ ] If exact-main CI fails, diagnose only the failing stage and do not automatically rerun the workflow.
