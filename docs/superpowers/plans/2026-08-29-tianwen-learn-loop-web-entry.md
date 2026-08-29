# Tianwen Learn Loop Web Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one Learn Loop entry to DSH Web and Tianwen Desktop for creating, viewing, starting, and continuing the already implemented ordinary long-Goal Tasks.

**Architecture:** Keep `tianwen.long-goal.v1` and the existing CLI as the durable product authority.  Add a browser-safe contract, a loopback-only `/tianwen` Connection RPC mounted only in a DSH Web host, and one `sidebar.footer.action` client contribution in `@tianwen/runtime-bundle`.  Keep the existing `/runtime` host entry and add a no-op package-root Loader row so exact DSH can discover the root package's `dsh.client` metadata.  The host delegates Session, Goal, Agent, model, tool, and Goal-round behavior to exact DSH `0.1.1-rc.2`; Desktop only displays the same Web plugin.

**Tech Stack:** TypeScript 6.0.3, Node.js 22, exact `@deepseek-ai/dsh@0.1.1-rc.2` public services, React 18 client bundle, esbuild 0.28.2, Vitest 4.1.8, pnpm 11.20.0.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-29-tianwen-learn-loop-web-entry-design.md` exactly.
- Keep `tianwen.long-goal.v1`, the existing CLI commands, and all existing receipt schemas compatible.
- Keep `@deepseek-ai/dsh@0.1.1-rc.2` as the only Agent Runtime.
- The visible label is `Learn Loop`; technical schema, service, package, CLI, Profile, and receipt names remain `tianwen`.
- The `/tianwen` browser channel uses DSH's public Connection RPC with `authority: 'loopback'`; it does not add or patch an API Proxy method.
- Creating or reading a plan performs zero model requests.
- A Task binding must be durable before that Task's first `turn/start`.
- Every Task receives a fresh DSH Session; continuing a Task reuses its exact bound Session.
- Headless Profiles must keep loading when Web-only services and packages are absent.
- Add no scheduler, DAG, daemon, automatic retry, learning flow, controlled Activity, or second chat/Agent loop.
- Use focused tests and one assembled Web/Desktop proof.  Do not run another paid natural task or repeat broad acceptance for environment-only timing noise.
- Keep generated caches, disposable Profiles, and product-test data under `D:\DevData`.

---

### Task 1: Share the Long-Goal Contract and Mount Read Operations

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/long-goal-contract.ts`
- Create: `packages/tianwen-runtime-bundle/src/long-goal-host.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal.ts`
- Modify: `packages/tianwen-runtime-bundle/src/runtime.ts`
- Modify: `packages/tianwen-runtime-bundle/cordis.patch.yml`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `packages/tianwen-runtime-bundle/tsconfig.json`
- Modify: `scripts/install-tianwen.mjs`
- Modify: `tests/dsh-migration/ordinary-long-goal.spec.ts`
- Create: `tests/dsh-migration/learn-loop-host.spec.ts`
- Modify: `tests/dsh-migration/tianwen-installer.spec.ts`

**Interfaces:**
- Move, then re-export unchanged from `long-goal.ts`:

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
    readonly blockedReason?: {
      readonly code: string
      readonly message: string
    }
  }[]
  readonly currentTaskId: string | null
  readonly runtime: {
    readonly activation: 'not-loaded'
    readonly modelRequests: 0
    readonly readOnly: true
  }
}

export interface LongGoalSummary {
  readonly id: string
  readonly objective: string
  readonly phase: 'active' | 'blocked' | 'complete'
  readonly completedTasks: number
  readonly totalTasks: number
  readonly currentTaskId: string | null
  readonly updatedAt: number
}

export type TianwenLongGoalRpcRequest =
  | { readonly endpoint: 'list'; readonly payload: Record<string, never> }
  | { readonly endpoint: 'create'; readonly payload: {
      readonly objective: string
      readonly tasks: readonly string[]
      readonly maxTaskRounds: number
    } }
  | { readonly endpoint: 'status'; readonly payload: {
      readonly longGoalId: string
    } }
  | { readonly endpoint: 'run-current-task'; readonly payload: {
      readonly longGoalId: string
      readonly initialCwd?: string
    } }
```

- Add to `long-goal.ts`:

```ts
export function listLongGoals(stateRoot: string): readonly LongGoalRecord[]
```

- Add to `long-goal-host.ts`:

```ts
export interface TianwenLongGoalHostRoots {
  readonly stateRoot: string
  readonly sessionsRoot: string
  readonly evolutionRoot: string
}

export interface TianwenLongGoalHostConfig {
  readonly stateRoot?: string
  readonly sessionsRoot?: string
  readonly evolutionRoot?: string
}

export interface TianwenLongGoalHostDependencies {
  readonly listLongGoals: typeof listLongGoals
  readonly createLongGoal: typeof createLongGoal
  readonly readLongGoalStatus: typeof readLongGoalStatus
}

export function resolveTianwenLongGoalHostRoots(input: {
  readonly profileBaseUrl: URL
  readonly dshHome?: string
  readonly config?: TianwenLongGoalHostConfig
}): TianwenLongGoalHostRoots

export function createTianwenLongGoalRpcHandler(
  roots: TianwenLongGoalHostRoots,
  dependencies?: TianwenLongGoalHostDependencies,
): ConnectionRpcHandler

export function mountTianwenLongGoalHost(
  ctx: Context,
  config?: TianwenLongGoalHostConfig,
): void
```

- Extend the Runtime Bundle config without changing `@tianwen/runtime`:

```ts
export interface TianwenRuntimeBundleConfig {
  readonly evolutionRoot?: string
  readonly stateRoot?: string
  readonly sessionsRoot?: string
}
```

- `runtime.ts` calls the existing core `apply()` first, then registers a
  delayed `ctx.inject(['connection', 'apiProxy', 'agents', 'goals'], ...)` mount.
  A headless context never supplies `connection`, so the Web host is not
  constructed and core startup remains unchanged.

- [ ] **Step 1: Move pure types without changing behavior**

Create `long-goal-contract.ts` with the exact existing interfaces and RPC
request/result types.  Change `long-goal.ts` to import those types and re-export
them so every existing import remains valid.

- [ ] **Step 2: Add RED tests for listing and strict endpoint parsing**

Extend `ordinary-long-goal.spec.ts` with three records whose `updatedAt` values
are `10`, `30`, and `20`; require `listLongGoals()` to return `30, 20, 10` and
to reject one malformed `.json` file rather than skip it.

In `learn-loop-host.spec.ts`, first require:

```ts
const result = await handler('list', {}, AbortSignal.timeout(1_000))
expect(result).toEqual({ ok: true, value: { goals: [] } })

await expect(handler('create', {
  objective: 'Ship release',
  tasks: ['Prepare notes', 'Publish'],
  maxTaskRounds: 3,
}, signal)).resolves.toMatchObject({
  ok: true,
  value: { status: { goal: { completedTasks: 0, totalTasks: 2 } } },
})
```

Also require exact endpoint names, exact payload keys, non-empty trimmed
objectives, at least one Task, and positive integer rounds.  Invalid requests
return one stable `invalid-request` RPC error and create no file.

- [ ] **Step 3: Run the RED tests**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/learn-loop-host.spec.ts
```

Expected: fail because `long-goal-contract.ts`, `listLongGoals()`, and the host
handler do not exist.

- [ ] **Step 4: Implement list, root resolution, and read endpoints**

`listLongGoals()` reads only direct `*.json` children of `long-goals`, parses
each through the existing strict record parser, and sorts by `updatedAt`
descending then `id` ascending.  A missing directory returns `[]` without
creating it.

Root resolution follows exactly:

```ts
const profileRoot = resolve(fileURLToPath(input.profileBaseUrl))
const stateRoot = input.config?.stateRoot ?? resolve(profileRoot, 'state')
const evolutionRoot = input.config?.evolutionRoot ?? resolve(stateRoot, 'evolution')
const dshHome = input.dshHome === undefined ? undefined : resolve(input.dshHome)
const sessionsRoot = input.config?.sessionsRoot ??
  (dshHome === undefined ? undefined : resolve(dshHome, 'sessions'))
```

Reject every non-absolute configured root and reject Web mounting when neither
an explicit `sessionsRoot` nor an absolute `DSH_HOME` is available.

Register exactly one handler:

```ts
ctx.connection.rpc.handle('/tianwen', handler, { authority: 'loopback' })
```

Implement `list`, `create`, and `status` by calling `listLongGoals()`,
`createLongGoal()`, and `readLongGoalStatus()`; never accept a state root from
the browser.

- [ ] **Step 5: Wrap the Runtime apply and preserve headless loading**

Replace the re-exported `apply` in `runtime.ts` with a wrapper that forwards
only `evolutionRoot` to `@tianwen/runtime`, then calls
`mountTianwenLongGoalHost(ctx, config)`.  Keep `name`, `inject`, and
`SUPPORTED_DSH_VERSION` unchanged.

Add tests with a context that has no `connection`: core Tianwen services load,
no `/tianwen` handler is registered, and startup resolves rather than waiting
for Web services.

Add a second Loader row immediately after `tianwen-runtime` in
`cordis.patch.yml`:

```yaml
    - id: tianwen-web-bridge
      name: '@tianwen/runtime-bundle'
```

Do not move the host Runtime to the package root.  The root `index.js` stays a
no-op server plugin whose purpose in a Web Profile is to make DSH inspect the
root package's `dsh.client` declaration.  Add a focused assertion proving the
explicit root row is present exactly once.

- [ ] **Step 6: Give managed products the same explicit roots**

Extend the two generated `tianwen-runtime` rows in `scripts/install-tianwen.mjs`
to contain:

```yaml
    evolutionRoot: '<data-dir>/state/evolution'
    stateRoot: '<data-dir>/state'
    sessionsRoot: '<data-dir>/dsh-home/sessions'
```

Update the installer assertions to compare all three exact canonical paths.
Insert the same `tianwen-web-bridge` package-root row in both generated
patches.  Do not change ordinary portable Profile defaults or migrate existing
state.

- [ ] **Step 7: Run Task 1 verification**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-installer.spec.ts
pnpm --filter '@tianwen/runtime-bundle' typecheck
git diff --check
```

Expected: focused tests and typecheck pass; the Runtime Bundle's headless test
still mounts without Web services.

- [ ] **Step 8: Commit Task 1**

```powershell
git add packages/tianwen-runtime-bundle/src/long-goal-contract.ts packages/tianwen-runtime-bundle/src/long-goal-host.ts packages/tianwen-runtime-bundle/src/long-goal.ts packages/tianwen-runtime-bundle/src/runtime.ts packages/tianwen-runtime-bundle/cordis.patch.yml packages/tianwen-runtime-bundle/package.json packages/tianwen-runtime-bundle/tsconfig.json scripts/install-tianwen.mjs tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-installer.spec.ts
git commit -m "feat: expose long goals to the Web host"
```

---

### Task 2: Start and Continue a Task Through DSH's Existing Runtime

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-host.ts`
- Modify: `tests/dsh-migration/learn-loop-host.spec.ts`
- Create: `tests/dsh-migration/learn-loop-host.integration.spec.ts`

**Interfaces:**
- Complete the fourth host endpoint:

```ts
export interface RunCurrentTaskResult {
  readonly status: LongGoalStatusProjection
  readonly sessionId?: string
  readonly action: 'started' | 'continued' | 'already-running' | 'complete'
}

export async function runCurrentWebTask(input: {
  readonly roots: TianwenLongGoalHostRoots
  readonly longGoalId: string
  readonly initialCwd?: string
}, dependencies: TianwenLongGoalRunDependencies): Promise<RunCurrentTaskResult>
```

- `TianwenLongGoalRunDependencies` contains only existing DSH faces and current
  long-Goal functions:

```ts
interface TianwenLongGoalRunDependencies {
  readonly readLongGoal: typeof readLongGoal
  readonly readLongGoalStatus: typeof readLongGoalStatus
  readonly bindLongGoalTask: typeof bindLongGoalTask
  readonly listSessions: () => Promise<readonly {
    readonly sessionId: string
    readonly cwd?: string
  }[]>
  readonly createSession: (input: { readonly cwd: string }) => Promise<string>
  readonly attachedAgent: (sessionId: string) => Agent | undefined
  readonly createGoal: (agent: Agent, input: {
    readonly objective: string
    readonly maxGoalRounds: number
  }) => GoalView
  readonly resumeColdGoal: (input: {
    readonly sessionId: string
    readonly goalId: string
    readonly revision: number
  }) => Promise<void>
  readonly flushSession: (agent: Agent) => Promise<void>
}
```

- [ ] **Step 1: Write RED orchestration tests**

Add tests for these exact stories:

1. A complete long Goal returns `action: 'complete'` and calls no DSH method.
2. Task 1 without `initialCwd` rejects with `workspace-required` and creates no
   Session.
3. Task 1 creates a fresh Session, creates one Goal, binds it synchronously,
   and only then allows a queued driver microtask to append `turn/start`.
4. Task 2 ignores the browser's current cwd and uses Task 1 Session's persisted
   cwd.
5. An active bound cold Task resumes the same Session and creates nothing.
6. An already armed attached Task returns `already-running` and creates or
   resumes nothing.
7. Binding failure pauses/disarms the newly created Goal before the fake driver
   microtask and returns the Goal and Session IDs without retry or deletion.
8. A bound Session/Goal mismatch fails closed.

Use one order array for the core invariant:

```ts
expect(order).toEqual([
  'session-created',
  'goal-created',
  'task-bound',
  'turn-start',
  'session-flushed',
])
```

- [ ] **Step 2: Run the RED host tests**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/learn-loop-host.spec.ts
```

Expected: the run endpoint fails because orchestration is not implemented.

- [ ] **Step 3: Implement unbound Task admission**

For the current unbound Task:

1. use `initialCwd` only when no earlier Task is bound;
2. otherwise find the first bound Task's exact Session in DSH `session.list`
   and reuse its `cwd`;
3. call DSH `sessions.create` with `{ cwd }` and no reusable Workspace method;
4. resolve the newly attached Agent from `ctx.agents`;
5. call `ctx.goals.create(agent, { objective, maxGoalRounds })` synchronously;
6. call `bindLongGoalTask()` synchronously before the first `await` after Goal
   creation;
7. on binding failure, call `ctx.goals.pause()` or `disarm()` synchronously,
   then flush once and throw an error carrying both IDs;
8. on success, `await agent.session.flush()` and return the refreshed status.

Do not call `ctx.workspaces.connectWorkspace()`: that API may reuse a blank
Session and would violate the one-Task/one-Session requirement.

- [ ] **Step 4: Implement bound Task continuation**

For a bound current Task:

- if its attached Agent exists, verify the exact current Goal ID and phase;
- return `already-running` when it is active and armed;
- call the existing Goal service `resume()` when it is paused or disarmed;
- if the Agent is cold, call the existing API Proxy Goal-resume path so DSH
  performs its normal Session reconstruction and Agent preset composition;
- verify the returned Goal ID and Session ID; and
- never create a replacement Session on failure.

- [ ] **Step 5: Prove the ordering with the real offline DSH harness**

In `learn-loop-host.integration.spec.ts`, mount the existing DSH Agent, Session
persistence, Goal service, and Goal-round driver with the repository's offline
deterministic adapter.  Create a two-Task long Goal, invoke the Web run
operation once, flush, and inspect the Task file plus Session events.

Require:

```ts
expect(bound.execution?.sessionId).toBe(String(agent.session.id))
expect(events.some(event => event.type === 'turn/start')).toBe(true)
expect(bindingObservedAt).toBeLessThan(turnStartObservedAt)
```

The test uses no Provider credential and no network.

- [ ] **Step 6: Run Task 2 verification**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/learn-loop-host.integration.spec.ts tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/ordinary-long-goal-cli.spec.ts
pnpm --filter '@tianwen/runtime-bundle' typecheck
git diff --check
```

Expected: all focused tests pass and no existing CLI source changes are needed.

- [ ] **Step 7: Commit Task 2**

```powershell
git add packages/tianwen-runtime-bundle/src/long-goal-host.ts tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/learn-loop-host.integration.spec.ts
git commit -m "feat: run long-goal tasks from DSH Web"
```

---

### Task 3: Add the Learn Loop Sidebar Action and Overlay

Task 3 can run in parallel with Task 2 after Task 1 commits because it consumes
only the frozen RPC contract.

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/client.tsx`
- Create: `packages/tianwen-runtime-bundle/src/learn-loop-client.ts`
- Create: `packages/tianwen-runtime-bundle/build-client.mjs`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `packages/tianwen-runtime-bundle/tsconfig.json`
- Create: `tests/dsh-migration/learn-loop-client.spec.ts`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `scripts/check-dsh-install.mjs`

**Interfaces:**
- Browser RPC wrapper:

```ts
export interface LearnLoopClient {
  list(signal?: AbortSignal): Promise<readonly LongGoalSummary[]>
  create(input: {
    readonly objective: string
    readonly tasks: readonly string[]
    readonly maxTaskRounds: number
  }, signal?: AbortSignal): Promise<LongGoalStatusProjection>
  status(longGoalId: string, signal?: AbortSignal): Promise<LongGoalStatusProjection>
  runCurrentTask(input: {
    readonly longGoalId: string
    readonly initialCwd?: string
  }, signal?: AbortSignal): Promise<RunCurrentTaskResult>
}

export function createLearnLoopClient(
  rpc: ClientConnectionRpc,
): LearnLoopClient
```

- Client plugin entry:

```ts
export const inject = ['slots', 'sessions', 'connection'] as const
export function apply(ctx: ClientContext): void
```

- [ ] **Step 1: Write RED client and slot-registration tests**

Use a fake `ClientConnectionRpc` and require exact calls:

```ts
expect(rpc.call).toHaveBeenCalledWith(
  '/tianwen',
  'status',
  { longGoalId: 'tianwen-long-goal-1' },
  signal,
)
```

Reject malformed success values instead of rendering partial data.  Register
one entry with:

```ts
ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
  name: 'sidebar.footer.action',
  id: 'tianwen-learn-loop',
  order: 20,
}, LearnLoopEntry))
```

Require one registration on apply and disposal on fiber teardown.

- [ ] **Step 2: Run the RED client test**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/learn-loop-client.spec.ts
```

Expected: fail because the client files do not exist.

- [ ] **Step 3: Implement the strict RPC wrapper**

`createLearnLoopClient()` calls only `/tianwen` endpoints, unwraps the standard
`RpcResult`, and validates exact top-level response keys plus the existing long
Goal/status discriminants.  It never accepts a state root or filesystem target.

- [ ] **Step 4: Implement the minimal overlay**

Build one React component with local state for `closed`, `list`, `create`, and
`detail`.  Use a fixed-position overlay rendered from the slot component; do
not add routing or a second React root.

The component must provide:

- expanded `Learn Loop` text and collapsed icon/title;
- list refresh, plan creation, and one detail view;
- add/remove/move-up/move-down Task rows before creation;
- `Start Task`, `Continue Task`, and `Open Session` labels from the current
  status;
- current cwd from the selected DSH Session only for Task 1;
- `ctx.sessions.open(result.sessionId)` after successful start/continue; and
- one inline error area with no automatic retry.

Use the existing DSH CSS variables for background, labels, borders, hover, and
focus.  Add a visible focus ring, Escape-to-close, backdrop close, labelled
dialog semantics, and buttons with accessible names.  Do not add a component
library or image asset.

- [ ] **Step 5: Build one DSH client module artifact**

`build-client.mjs` calls the existing esbuild dependency with:

```js
await build({
  entryPoints: ['src/client.tsx'],
  outfile: 'dist/client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/*'],
  banner: { js: "window.__ModuleLoader__.load({ id: '@tianwen/runtime-bundle', factory: (require) => { var module = { exports: {} }; var exports = module.exports;" },
  footer: { js: 'return module.exports; } });' },
})
```

Add `./client` to package exports, `dist/client.js` to files, and this exact DSH
metadata:

```json
"client": {
  "inject": [
    "@deepseek-ai/dsh-client-connection",
    "@deepseek-ai/dsh-client-runtime",
    "@deepseek-ai/dsh-client-ui-sidebar"
  ],
  "platform": "web"
}
```

Keep React and client-only DSH packages as optional peers plus development
inputs so a headless install does not gain another Web runtime.

- [ ] **Step 6: Update archive and source-boundary assertions**

Require the packed Runtime Bundle to contain `dist/client.js` exactly once and
continue rejecting Electron, a second DSH closure, pnpm store data, and source
files.  Add the new production inputs to the current exact source allowlist in
`scripts/check-dsh-install.mjs`; do not weaken the allowlist to a directory
glob.

- [ ] **Step 7: Run Task 3 verification**

Run:

```powershell
pnpm --filter '@tianwen/runtime-bundle' build
pnpm exec vitest run tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
pnpm run check:no-private-dsh-imports
pnpm --filter '@tianwen/runtime-bundle' typecheck
git diff --check
```

Expected: client wrapper/registration tests pass, the archive contains one
client artifact, and private DSH import violations remain zero.

- [ ] **Step 8: Commit Task 3**

```powershell
git add packages/tianwen-runtime-bundle/src/client.tsx packages/tianwen-runtime-bundle/src/learn-loop-client.ts packages/tianwen-runtime-bundle/build-client.mjs packages/tianwen-runtime-bundle/package.json packages/tianwen-runtime-bundle/tsconfig.json tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/runtime-bundle.spec.ts scripts/check-dsh-install.mjs pnpm-lock.yaml
git commit -m "feat: add the Learn Loop Web entry"
```

---

### Task 4: Assemble the Real Web/Desktop Product Path Once

**Files:**
- Create: `tests/dsh-migration/learn-loop-web-product.spec.ts`
- Modify: `scripts/verify-dsh-profile.mjs`
- Modify: `scripts/stage-desktop-runtime.mjs`
- Modify: `scripts/audit-desktop-artifact.mjs`
- Create: `docs/operations/tianwen-learn-loop-web-entry-handoff.md`

**Interfaces:**
- The product test consumes the exact packed Runtime Bundle and exact DSH
  `0.1.1-rc.2` Web Profile.  It produces no new runtime interface.

- [ ] **Step 1: Write the assembled-product test before staging changes**

Create a disposable root below
`D:\DevData\tianwen-learn-loop-web-product-tests`, install the exact packed
Runtime Bundle into a fresh DSH Web Profile, boot `dsh web` on loopback, and
assert:

```ts
expect(clientGraphIds).toContain('@tianwen/runtime-bundle')
expect(await fetch(`${origin}/plugins/@tianwen/runtime-bundle/client.js`)
  .then(response => response.ok)).toBe(true)
```

Use the real `/tianwen` Connection RPC to create a two-Task plan and read it
back.  Creation must leave the Session count and `turn/start` count unchanged.

Invoke `run-current-task` with a disposable repository cwd and the offline
deterministic model, then require one bound Session and a Task binding that was
written before the first `turn/start`.  Stop the Web process in `finally` and
verify its loopback endpoint closes.

- [ ] **Step 2: Run the RED product test**

Run:

```powershell
$env:TIANWEN_LEARN_LOOP_PRODUCT_TEST='1'
pnpm exec vitest run tests/dsh-migration/learn-loop-web-product.spec.ts
Remove-Item Env:TIANWEN_LEARN_LOOP_PRODUCT_TEST
```

Expected: fail at the missing client artifact or missing `/tianwen` channel
before final staging is updated.

- [ ] **Step 3: Update profile and Desktop artifact verification**

Teach `verify-dsh-profile.mjs` to verify the client metadata and artifact only
when the selected Profile has DSH Web client-module services.  The ordinary
headless Profile still verifies without loading browser code.

Keep Desktop staging on the same Runtime tarball digest.  Extend the Desktop
artifact audit to require that tarball's `dist/client.js` and continue rejecting
an embedded DSH, pnpm, Profile state, or second Runtime copy.

- [ ] **Step 4: Run the real Web product test once**

Repeat the Step 2 command exactly once after the focused fix.  Record the exact
Runtime tarball digest, DSH version, Web Profile root, long Goal ID, both Task
bindings, and zero-model creation/status facts in the handoff.  This is product
runtime evidence, not a natural-task or learning-efficacy claim.

- [ ] **Step 5: Check the same UI through Tianwen Desktop**

Build the existing unpacked Desktop with the updated tarball under `D:\DevData`,
launch it against that same prepared Web Profile, and verify the `Learn Loop`
sidebar action opens the same overlay.  Close the window and require the owned
DSH Web PID and loopback endpoint to stop.

Do not rerun the long-Goal semantic scenario through Desktop; Desktop proves
only that it displays the already proven Web contribution.

- [ ] **Step 6: Run the proportional local gate**

Run:

```powershell
pnpm --filter '@tianwen/runtime-bundle' build
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/ordinary-long-goal-cli.spec.ts tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/learn-loop-host.integration.spec.ts tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/learn-loop-web-product.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts
pnpm run check:no-private-dsh-imports
pnpm run typecheck
git diff --check
```

The default-skipped product test is counted only when its environment flag was
set in Step 4.  Do not repeat unrelated historical natural-task or controlled
Activity suites.

- [ ] **Step 7: Write the handoff and commit Task 4**

Separate these facts in the handoff:

- product result: Web and Desktop entry behavior;
- runtime evidence: roots, IDs, digest, Session/Goal binding order;
- learning facts: none generated in this stage;
- external facts: no Provider billing claim, npm publication, GitHub Release,
  or DSH upstream push.

Then commit:

```powershell
git add tests/dsh-migration/learn-loop-web-product.spec.ts scripts/verify-dsh-profile.mjs scripts/stage-desktop-runtime.mjs scripts/audit-desktop-artifact.mjs docs/operations/tianwen-learn-loop-web-entry-handoff.md
git commit -m "test: prove the Learn Loop Web product path"
```

---

## Integration and exact-main closeout

- [ ] Review the complete diff for product behavior, headless compatibility,
  accidental dependencies, and duplicate DSH runtime logic.
- [ ] Re-run only the Task 4 proportional gate after review fixes.
- [ ] Merge the feature branch into current `main` with a normal merge commit.
- [ ] Push current `main` and verify `origin/main` equals the exact local SHA.
- [ ] Check one GitHub Actions run for that exact SHA.  Report Python,
  TypeScript, and `installer-windows` once; do not create a recurring monitor
  unless GitHub has actually produced a run which remains in progress.
- [ ] If exact-main CI passes, mark the stage complete.  If it fails, diagnose
  only the failing job and stage; do not automatically rerun the workflow.
