# Tianwen Ordinary Long-Goal Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an installed CLI path where one Tianwen long Goal advances through explicitly authored ordered Tasks, each bound to its own ordinary DSH Goal and Session.

**Architecture:** Persist only Tianwen's long-Goal record and Task-to-execution bindings under the existing state root. Reuse the current Goal-create JSON receipt, `readGoalStatus()`, and Goal-resume launch for every DSH-owned execution fact. The existing Evolution Run binding remains the authority for acceptance-driven Run identity and evidence; this slice keeps stable long-Goal/Task references but does not mislabel a Task execution binding as a formal Run receipt. Keep the existing one-Goal commands unchanged and add no scheduler, DAG, model decomposition, runner, or Desktop UI.

**Tech Stack:** TypeScript, Node.js standard library, existing DSH `0.1.1-rc.2` public APIs, Vitest, pnpm 11.20.0.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-29-tianwen-ordinary-goal-tasks-design.md` exactly.
- Keep `@deepseek-ai/dsh@0.1.1-rc.2` as the only Agent Runtime.
- Existing `create`, `list`, `status`, and `resume` commands and receipt schemas must remain compatible.
- Do not duplicate or replace Evolution Run bindings. Long-Goal and Task IDs are stable future `goalRef` and `taskRef` values; this stage does not create a natural-trial or learning receipt.
- Managed records live under `<data-dir>/state/long-goals`; portable records live under `<state-root>/long-goals`.
- All tests are deterministic and offline. Do not use a Provider credential, model request, real installed-product run, controlled Activity, or natural-task proof.
- Each production file has one task owner. Do not refactor unrelated Runtime or governance code.

---

### Task 1: Long-Goal Record and Read-Only Projection

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/long-goal.ts`
- Create: `tests/dsh-migration/ordinary-long-goal.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface TaskExecutionBinding {
  readonly goalId: string
  readonly sessionId: string
}

export interface LongGoalTaskRecord {
  readonly id: string
  readonly objective: string
  readonly execution: TaskExecutionBinding | null
}

export interface LongGoalRecord {
  readonly schemaVersion: 'tianwen.long-goal.v1'
  readonly id: string
  readonly objective: string
  readonly maxTaskRounds: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly tasks: readonly LongGoalTaskRecord[]
}

export interface LongGoalStatusProjection {
  readonly schemaVersion: 'tianwen.long-goal-status.v1'
  readonly goal: {
    readonly id: string
    readonly objective: string
    readonly phase: 'active' | 'blocked' | 'complete'
    readonly completedTasks: number
    readonly totalTasks: number
  }
  readonly tasks: readonly {
    readonly id: string
    readonly objective: string
    readonly phase: 'pending' | 'active' | 'paused' | 'blocked' | 'complete'
    readonly execution: TaskExecutionBinding | null
    readonly blockedReason?: { readonly code: string, readonly message: string }
  }[]
  readonly currentTaskId: string | null
  readonly runtime: {
    readonly activation: 'not-loaded'
    readonly modelRequests: 0
    readonly readOnly: true
  }
}

export function createLongGoal(input: {
  readonly stateRoot: string
  readonly objective: string
  readonly tasks: readonly string[]
  readonly maxTaskRounds: number
}, dependencies?: {
  readonly id?: () => string
  readonly now?: () => number
}): LongGoalRecord

export function readLongGoal(stateRoot: string, goalId: string): LongGoalRecord

export function bindLongGoalTask(
  stateRoot: string,
  longGoalId: string,
  taskId: string,
  execution: TaskExecutionBinding,
  dependencies?: { readonly now?: () => number },
): LongGoalRecord

export async function readLongGoalStatus(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly dshStatusTarget:
    | { readonly dataDir: string }
    | { readonly sessionsRoot: string, readonly evolutionRoot: string }
}): Promise<LongGoalStatusProjection>

export function formatLongGoalStatusText(status: LongGoalStatusProjection): string
```

- Consumes: existing `readGoalStatus()` and `GoalStatusProjection` from `status.ts`; it must not duplicate `scanDurableGoals()`, Session persistence, or `foldGoal()`.

- [ ] **Step 1: Write strict record and projection failures**

Create tests that first fail because `long-goal.ts` does not exist. Cover:

```ts
const record = createLongGoal({
  stateRoot,
  objective: 'Ship the release',
  tasks: ['Prepare notes', 'Publish release'],
  maxTaskRounds: 3,
}, { id: () => '00000000-0000-4000-8000-000000000001', now: () => 10 })

expect(record.tasks.map(task => task.id)).toEqual(['task-1', 'task-2'])
expect(readLongGoal(stateRoot, record.id)).toEqual(record)
```

Also require exclusive creation, exact keys/schema, non-empty authored values, positive `maxTaskRounds`, duplicate/invalid Task ID rejection, atomic binding of only an unbound Task, and rejection of a binding whose projected DSH Session differs from `execution.sessionId`.

- [ ] **Step 2: Run the RED test**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts
```

Expected: fail because the new module is unavailable.

- [ ] **Step 3: Implement the record with standard-library filesystem calls**

Use `mkdirSync`, exclusive `writeFileSync(..., { flag: 'wx' })`, `readFileSync`, a same-directory temporary file, and `renameSync`. Store exactly one JSON file per Goal at:

```ts
join(resolve(stateRoot), 'long-goals', `${longGoalId}.json`)
```

Parse every durable read as `unknown`, require exact object keys, stable `task-N` order, and exact binding keys. Never repair malformed data or silently overwrite an existing binding.

- [ ] **Step 4: Implement projection by reusing DSH status**

For every bound Task call `readGoalStatus()` with its DSH Goal ID and the supplied managed or portable status target. Require the returned Session ID to equal the durable binding. Derive Task/Goal phase and current Task exactly as the design specifies. Do not persist projected phase.

- [ ] **Step 5: Run Task 1 tests and typecheck**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts
pnpm --filter '@tianwen/runtime-bundle' typecheck
```

Expected: all Task 1 tests pass and typecheck exits `0`.

- [ ] **Step 6: Commit Task 1**

```powershell
git add packages/tianwen-runtime-bundle/src/long-goal.ts tests/dsh-migration/ordinary-long-goal.spec.ts
git commit -m "feat: persist ordinary long-goal tasks"
```

---

### Task 2: Capture the Existing Goal-Create Receipt

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/create.ts`
- Modify: `tests/dsh-migration/goal-create.spec.ts`

**Interfaces:**
- Consumes: `buildGoalCreateInvocation()` and `GoalCreateReceipt`; `runGoalCreate()` remains the sole owner of `agents.create`, `goals.create`, and Session flush.
- Produces:

```ts
export function parseGoalCreateReceipt(value: unknown): GoalCreateReceipt

export async function captureGoalCreate(
  preflight: GoalCreatePreflight | PortableGoalCreatePreflight,
  dependencies?: {
    readonly nonce?: () => string
    readonly run?: (invocation: GoalCreateInvocation) => Promise<{
      readonly code: number
      readonly stdout: string
      readonly stderr: string
    }>
  },
): Promise<GoalCreateReceipt>
```

- [ ] **Step 1: Add failing receipt-capture tests**

Extend `goal-create.spec.ts` with strict parser cases for missing/extra keys, wrong schema, empty IDs, nonzero model-request delta, and malformed Goal values. Add a fake captured child result:

```ts
const receipt = await captureGoalCreate(preflight, {
  nonce: () => '00000000-0000-4000-8000-000000000002',
  run: async invocation => ({
    code: 0,
    stdout: `${JSON.stringify(expectedReceipt)}\n`,
    stderr: '',
  }),
})
expect(receipt).toEqual(expectedReceipt)
```

Require nonzero exit, invalid JSON, multiple non-empty output lines, and stderr-only failure to reject without a retry.

- [ ] **Step 2: Run the RED test**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/goal-create.spec.ts
```

Expected: fail because the capture exports do not exist.

- [ ] **Step 3: Implement one captured launch path**

Call `buildGoalCreateInvocation(preflight, true, nonce())`; do not duplicate its arguments or environment. The default runner uses Node `spawn` with stdout/stderr pipes, collects bounded text, waits for exit, and returns one result. Parse exactly one non-empty JSON line with `parseGoalCreateReceipt()`.

Keep existing `launchGoalCreate()` behavior and user-facing output unchanged.

- [ ] **Step 4: Run create and portable-create regressions**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/goal-create.spec.ts tests/dsh-migration/portable-goal-cli.spec.ts
pnpm --filter '@tianwen/runtime-bundle' typecheck
```

Expected: both files pass and typecheck exits `0`.

- [ ] **Step 5: Commit Task 2**

```powershell
git add packages/tianwen-runtime-bundle/src/create.ts tests/dsh-migration/goal-create.spec.ts
git commit -m "feat: capture ordinary Goal creation receipts"
```

---

### Task 3: Task-Run Orchestration and CLI Surface

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/long-goal-run.ts`
- Modify: `packages/tianwen-runtime-bundle/src/cli.ts`
- Create: `tests/dsh-migration/ordinary-long-goal-cli.spec.ts`

**Interfaces:**
- Consumes: Task 1 record/projection functions, Task 2 `captureGoalCreate()`, existing managed/portable Goal-create preflights, existing managed/portable Goal-resume preflights, and `launchGoalResume()` unchanged.
- Produces:

```ts
export type LongGoalProductTarget =
  | { readonly kind: 'managed', readonly dataDir: string }
  | { readonly kind: 'portable', readonly target: ResolvedPortableProfileTarget }

export async function runLongGoalTask(input: {
  readonly longGoalId: string
  readonly productTarget: LongGoalProductTarget
  readonly json: boolean
}, dependencies?: LongGoalRunDependencies): Promise<number>
```

`LongGoalRunDependencies` may expose only the Task 1/2 and existing resume functions needed for deterministic orchestration tests. It must not expose Agent, Session, Provider, or DSH internals.

- [ ] **Step 1: Write failing orchestration and CLI tests**

Cover these exact stories with fakes and durable fixture files:

1. `plan create` with two repeated `--task` values writes `0/2` and performs zero DSH launches.
2. First `task run` captures one create receipt, binds it, and launches resume once.
3. A second `task run` while Task 1 is active skips create and resumes the same DSH Goal/Session.
4. After Task 1 projects complete, Task 2 receives a different create receipt and Session.
5. After both project complete, `task run` emits the complete status and launches nothing.
6. A stored binding/session mismatch fails closed and never creates a replacement.
7. Managed and portable CLI forms resolve the existing target once; incomplete/mixed targets and invalid repeated options return usage exit `2`.
8. Existing top-level commands keep their old parse and dispatch behavior.

- [ ] **Step 2: Run the RED tests**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal-cli.spec.ts
```

Expected: fail because orchestration and CLI commands are unavailable.

- [ ] **Step 3: Implement `runLongGoalTask()` as a thin sequence**

The only permitted sequence is:

```text
read/project long Goal
  -> if complete: print projection and return 0
  -> if current Task is unbound: existing create preflight -> capture receipt -> atomic bind
  -> existing resume preflight for the bound DSH Goal
  -> existing launchGoalResume()
```

For portable targets use `target.stateRoot`, `target.sessionsRoot`, and `target.evolutionRoot`. For managed targets use `resolve(dataDir)/state` and the existing managed preflights. Verify the projected DSH Session matches the stored binding before resume.

- [ ] **Step 4: Add the three CLI commands without changing legacy schemas**

Extend `parseArgs()` with repeatable `task: { type: 'string', multiple: true }`. Recognize exactly `plan create`, `plan status`, and `task run` as two-position commands. Reuse current managed-versus-portable target exclusivity and `resolvePortableProfileTarget()` / `verifyPortableRuntimeBundle()` calls.

Use `positiveInteger()` for `plan create --max-rounds`, defaulting to `3`. Print Task 1's text formatter or one JSON line. Keep legacy `create/list/status/resume` branches and error mapping intact.

- [ ] **Step 5: Run focused compatibility gates**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/ordinary-long-goal-cli.spec.ts tests/dsh-migration/goal-create.spec.ts tests/dsh-migration/goal-resume.spec.ts tests/dsh-migration/goal-status.spec.ts tests/dsh-migration/portable-goal-cli.spec.ts
pnpm --filter '@tianwen/runtime-bundle' typecheck
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: all focused files pass, typecheck/check exit `0`, and diff check is clean.

- [ ] **Step 6: Commit Task 3**

```powershell
git add packages/tianwen-runtime-bundle/src/long-goal-run.ts packages/tianwen-runtime-bundle/src/cli.ts tests/dsh-migration/ordinary-long-goal-cli.spec.ts
git commit -m "feat: run ordered Tasks across DSH Sessions"
```

---

## Final Controller Gate

After the three task commits, the controller runs the full TypeScript typecheck, the focused compatibility command from Task 3, and the repository's existing full local gates. Review only the feature diff for correctness and accidental duplicate DSH ownership. Do not add a real Provider run, installed-product proof, or extra review layer unless a changed product path specifically requires it.
