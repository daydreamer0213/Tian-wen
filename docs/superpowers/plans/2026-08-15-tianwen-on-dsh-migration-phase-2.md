# Tianwen-on-DSH Migration Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first formal `tianwen` DSH Profile and prove one deterministic, no-key headless Goal/Tool/Session/Evidence run through the existing self-contained Runtime Bundle.

**Architecture:** Continue from the reviewed Runtime Bundle branch. Add one opt-in smoke sub-entry to the existing tarball, then layer `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-headless`, and that tarball in a formal `tianwen` Profile. Use the public DSH CLI for installation and headless execution; inspect the durable Session JSONL with the existing pure Evidence projector and publish one atomic run receipt.

**Tech Stack:** Node.js 22, TypeScript 6, pnpm 11.20, Vitest 4, esbuild 0.28.2, DeepSeek Harness `0.1.0-rc.6`, Cordis 4.0.1, existing Python/pytest/Ruff baseline.

## Global Constraints

- Create `codex/tianwen-dsh-migration-phase-2` from exact reviewed base `codex/tianwen-dsh-migration-phase-1@cffc8e51ad829adf016967491830402b0ed91bd5` in an isolated `D:\DevData\tianwen-worktrees` worktree.
- Do not merge, rebase, or copy changes into `main` during implementation.
- Keep DSH exact at `0.1.0-rc.6`, Cordis exact at `4.0.1`, pnpm exact at `11.20.0`, and esbuild exact at `0.28.2`.
- Use only public package-root exports. Never import `@deepseek-ai/*/src/*`, fork DSH, or copy upstream source.
- Keep Python Runtime, StateStore, Alpha-A Tasks 1–9, A1–A5 bundles, evaluator, verifier, and tests unchanged.
- Put Profile state, sessions, evolution state, receipts, package stores, virtual stores, caches, workspaces, and temp files under `D:\DevData`; do not create large generated data on `C:`.
- Product/test processes must use fixed executable plus argv and `shell: false`. The only accepted `shell: true` is the already documented internal Windows behavior of exact `@deepseek-ai/dsh@0.1.0-rc.6` during one fixed offline `tianwen` Profile installation.
- Do not call paid models, pass model/API credentials, use live web, run real Docker, start interactive DSH, or build UI/TUI/Web/Desktop components.
- Treat reviewed, versioned first-party same-process plugins as trusted code. Do not add token wrappers, process isolation, or a plugin capability framework.
- The smoke adapter is a fixed acceptance path, not a generic scripted-model API. It accepts no script/config/user-selected tools.
- The formal Profile may set JSONL `compression: none` and `packChunks: false` in Phase 2 so the fresh durable log can be inspected through plain, public Session event shapes. Do not create a second Session reader abstraction.
- Keep the real Profile/headless test opt-in behind `TIANWEN_DSH_PHASE2_STARTUP=1`; the default Node suite must not install a Profile or start DSH.
- Each task follows TDD, receives a fresh scoped review, closes all Critical/Important findings before the next task, and ends in a normal commit.
- Run final expensive gates strictly serially and at low load.

---

## File Map

- `packages/tianwen-runtime-bundle/src/smoke.ts` — fixed no-key adapter and fixed no-side-effect smoke Tool.
- `packages/tianwen-runtime-bundle/package.json` — public `./smoke` export, shipped file, exact public DSH externals, and second esbuild entry.
- `profiles/tianwen/cordis.patch.yml` — the only authored product Profile override for model route, Session readability, Runtime state root, and smoke plugin insertion.
- `tests/dsh-migration/runtime-bundle.spec.ts` — smoke archive/export/metafile/sequence contract.
- `tests/dsh-migration/tianwen-startup.e2e.spec.ts` — opt-in public Profile install, headless run, Session/Goal/Evidence assertions, and atomic receipt.
- `pnpm-lock.yaml` — mechanical Runtime Bundle importer update for exact already-locked dependencies.
- `docs/operations/tianwen-on-dsh-migration-phase-2-handoff.md` — final branch, artifact, test, review, risk, and remote-SHA receipt.

No new installer package, CLI package, profile framework, receipt framework, database, queue, RPC layer, or UI package is allowed.

---

### Task 1: Add the Fixed Offline Smoke Entry to the Existing Runtime Bundle

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/smoke.ts`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: public `Context` from `@deepseek-ai/cordis`, `CallId`, `GenerateOptions`, `LlmAdapter`, `StreamChunk` from `@deepseek-ai/dsh-llm`, and `defineTool` from `@deepseek-ai/dsh-tools`.
- Produces from `@tianwen/runtime-bundle/smoke`:

```ts
export const SMOKE_PROVIDER = 'tianwen-offline' as const
export const SMOKE_MODEL = 'phase2-smoke' as const
export const SMOKE_ACTION = 'tianwen_smoke_action' as const
export const SMOKE_GOAL_OBJECTIVE = 'prove the Tianwen phase 2 startup path' as const
export const SMOKE_FINAL_TEXT = 'TIANWEN_PHASE2_OK' as const
export class Phase2SmokeAdapter extends LlmAdapter
export const name = 'tianwen-phase2-smoke'
export const inject = ['llm', 'tools'] as const
export function apply(ctx: Context): void
```

- The adapter emits exactly four validated responses for one Session: fixed `create_goal`, fixed text ending the human turn, fixed `tianwen_smoke_action` in the Goal round, and fixed final text. A fifth request or an out-of-order tool result throws.

- [ ] **Step 1: Write the failing Runtime Bundle smoke tests**

Extend `tests/dsh-migration/runtime-bundle.spec.ts` with a direct public-export test and archive/metafile assertions. Add a tiny collector rather than a test framework:

Change the existing `packRoot` constant to `D:/DevData/tianwen/packs`, matching
the formal Phase 2 artifact root.

```ts
async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

it('ships one fixed offline smoke entry', async () => {
  const manifest = json(resolve(packageRoot, 'package.json')) as {
    exports: Record<string, unknown>
    files: string[]
    dependencies: Record<string, string>
  }
  expect(manifest.exports).toHaveProperty('./smoke')
  expect(manifest.files).toContain('dist/smoke.js')
  expect(manifest.dependencies).toEqual({
    '@deepseek-ai/cordis': '4.0.1',
    '@deepseek-ai/dsh-llm': '0.1.0-rc.6',
    '@deepseek-ai/dsh-tools': '0.1.0-rc.6',
  })

  const smoke = await import(
    '../../packages/tianwen-runtime-bundle/dist/smoke.js'
  )
  expect(smoke).toMatchObject({
    SMOKE_PROVIDER: 'tianwen-offline',
    SMOKE_MODEL: 'phase2-smoke',
    SMOKE_ACTION: 'tianwen_smoke_action',
    SMOKE_FINAL_TEXT: 'TIANWEN_PHASE2_OK',
    name: 'tianwen-phase2-smoke',
    inject: ['llm', 'tools'],
  })
  expect(smoke.apply).toBeTypeOf('function')
})
```

Add one sequence test that constructs four minimal `GenerateOptions` values, uses fixed call IDs `tianwen-phase2-goal` and `tianwen-phase2-action`, verifies the two tool-call blocks and final text, then expects the fifth `collect(adapter.stream(...))` to reject with `phase 2 smoke script exhausted`. Cast only the test messages to `GenerateOptions`; production code must keep full types.

Update the existing archive expectation to require exactly:

```ts
[
  'package/cordis.patch.yml',
  'package/dist/index.d.ts',
  'package/dist/index.js',
  'package/dist/runtime.js',
  'package/dist/smoke.js',
  'package/package.json',
]
```

Add a smoke-metafile assertion: bundled inputs are exactly `src/smoke.ts`; non-Node externals are exactly `@deepseek-ai/dsh-llm` and `@deepseek-ai/dsh-tools`; no private DSH path, probe Bundle, test helper, native addon, or extra Tianwen package appears.

- [ ] **Step 2: Run the focused test and record the real RED**

Run:

```powershell
$env:PNPM_CONFIG_STORE_DIR='D:\DevData\pnpm-store'
$env:PNPM_CONFIG_VIRTUAL_STORE_DIR='D:\DevData\tianwen-phase2\workspace-virtual-store'
$env:PNPM_CONFIG_OFFLINE='true'
pnpm --filter '@tianwen/runtime-bundle...' build
pnpm exec vitest run tests/dsh-migration/runtime-bundle.spec.ts
```

Expected: FAIL because `./smoke`, `dist/smoke.js`, and the smoke metafile do not exist. A dependency-install failure or TypeScript syntax failure is setup noise and does not count as RED.

- [ ] **Step 3: Implement the minimal fixed smoke entry**

Create `packages/tianwen-runtime-bundle/src/smoke.ts`. Keep the implementation local; do not import the probe `ScriptedAdapter` or create a reusable script DSL.

Use these exact response helpers and validation shape:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { CallId, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const SMOKE_PROVIDER = 'tianwen-offline' as const
export const SMOKE_MODEL = 'phase2-smoke' as const
export const SMOKE_ACTION = 'tianwen_smoke_action' as const
export const SMOKE_GOAL_OBJECTIVE = 'prove the Tianwen phase 2 startup path' as const
export const SMOKE_FINAL_TEXT = 'TIANWEN_PHASE2_OK' as const

const GOAL_CALL_ID = CallId('tianwen-phase2-goal')
const ACTION_CALL_ID = CallId('tianwen-phase2-action')

function textResponse(text: string): readonly StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function toolResponse(
  id: typeof GOAL_CALL_ID,
  toolName: string,
  args: Record<string, unknown>,
): readonly StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'block-end',
      index: 0,
      block: {
        type: 'tool-call', id, name: toolName,
        arguments: JSON.stringify(args),
      },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}
```

`Phase2SmokeAdapter.stream()` must:

1. require exact provider/model;
2. capture the first `sessionId` and require every later request to match it;
3. require both `create_goal` and `tianwen_smoke_action` in `options.tools`;
4. on step 0 emit `create_goal` with exact `{ objective: SMOKE_GOAL_OBJECTIVE, max_goal_rounds: 1 }`;
5. on step 1 require the last tool-result call ID to be `GOAL_CALL_ID`, then emit `textResponse('goal created')`;
6. on step 2 require at least one user message whose source kind is `goal`, then emit `tianwen_smoke_action` with `{}`;
7. on step 3 require the last tool-result call ID to be `ACTION_CALL_ID`, then emit `textResponse(SMOKE_FINAL_TEXT)`;
8. increment its cursor only after validation succeeds; otherwise throw without advancing.

Register exactly one adapter route and one Tool:

```ts
export const name = 'tianwen-phase2-smoke'
export const inject = ['llm', 'tools'] as const

export function apply(ctx: Context): void {
  ctx.llm.registerAdapter([SMOKE_PROVIDER], new Phase2SmokeAdapter())
  ctx.tools.register(defineTool({
    name: SMOKE_ACTION,
    description: 'Return the fixed Tianwen Phase 2 startup receipt value.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      return 'phase2-smoke-action-ok'
    },
  }))
}
```

If TypeScript rejects `typeof GOAL_CALL_ID` for the action ID, type `toolResponse` with public `CallId` instead; do not weaken request/message validation.

- [ ] **Step 4: Update the Bundle manifest and lock importer**

In `packages/tianwen-runtime-bundle/package.json`:

- add export `./smoke -> ./dist/smoke.js`;
- add `dist/smoke.js` to `files`;
- add exact runtime dependencies `@deepseek-ai/dsh-llm: 0.1.0-rc.6` and `@deepseek-ai/dsh-tools: 0.1.0-rc.6`;
- append one second esbuild command for `src/smoke.ts` using the same platform/format/target/tree-shaking rules, `--external:@deepseek-ai/*`, `--metafile=dist/smoke.meta.json`, and `--outfile=dist/smoke.js`.

Run the mechanical offline lock update:

```powershell
$env:PNPM_CONFIG_STORE_DIR='D:\DevData\pnpm-store'
$env:PNPM_CONFIG_VIRTUAL_STORE_DIR='D:\DevData\tianwen-phase2\workspace-virtual-store'
pnpm install --offline --lockfile-only
```

Expected: Runtime Bundle importer adds the two exact dependencies while existing package snapshots remain unchanged. If pnpm cannot resolve from the existing offline lock/store, stop and report the missing exact package metadata; do not hand-edit package snapshots.

- [ ] **Step 5: Build, pack, and run the focused GREEN**

```powershell
$env:PNPM_CONFIG_OFFLINE='true'
pnpm --filter '@tianwen/runtime-bundle...' build
pnpm --filter '@tianwen/runtime-bundle' pack --pack-destination 'D:\DevData\tianwen\packs'
pnpm exec vitest run tests/dsh-migration/runtime-bundle.spec.ts
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: Runtime Bundle focused tests pass; tarball contains the exact six-file set; runtime metafile remains unchanged except its manifest union; smoke metafile has only the two approved DSH externals; closure/private-import/typecheck/diff all pass.

- [ ] **Step 6: Request fresh scoped review and commit Task 1**

Reviewer scope is exact base `cffc8e51..working-tree`. Reject any generic adapter API, probe import, unexpected external, private DSH import, arbitrary configuration, or archive expansion.

After C0/I0:

```powershell
git add -- packages/tianwen-runtime-bundle/src/smoke.ts packages/tianwen-runtime-bundle/package.json tests/dsh-migration/runtime-bundle.spec.ts pnpm-lock.yaml
git diff --cached --check
git commit -m 'feat: add fixed tianwen startup smoke entry'
```

---

### Task 2: Install the Formal Profile and Prove the Public Headless Run

**Files:**
- Create: `profiles/tianwen/cordis.patch.yml`
- Create: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`

**Interfaces:**
- Consumes: Task 1 tarball and its public `@tianwen/runtime-bundle/smoke` constants; public DSH CLI `lib/bin.js`; existing `projectEvidence(sessionId, events)`; plain JSONL Session events.
- Produces: installed formal Profile at `D:\DevData\tianwen\dsh-home\profiles\tianwen` and atomic run receipt `D:\DevData\tianwen\receipts\phase2-startup-receipt.json`.
- Real gate: `TIANWEN_DSH_PHASE2_STARTUP=1 pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts`.

- [ ] **Step 1: Write the complete opt-in E2E test before the Profile exists**

Create `tests/dsh-migration/tianwen-startup.e2e.spec.ts` with exactly two opt-in behavior tests. Both use `it.runIf(enabled)` so the default suite discovers the file without installing a Profile or starting DSH.

The first test writes a stale receipt, calls the startup helper with a deliberately missing exact Corepack path, and requires nonzero failure before DSH plus `receipt absent`.

The second test performs the real install/run and asserts the installed Profile manifest, public DSH `--dump-config`, headless exit, durable Session events, Goal, Evidence, unchanged Evolution state, and receipt contract described in Steps 4–6. Write the complete test and its small file-local helpers now; do not create the production Profile patch yet. The test must not compare YAML source text or use a source-grep/change-detector assertion.

- [ ] **Step 2: Run the explicit gate and record a behavior-level RED**

```powershell
$env:TIANWEN_DSH_PHASE2_STARTUP='1'
$env:PNPM_CONFIG_STORE_DIR='D:\DevData\pnpm-store'
$env:PNPM_CONFIG_VIRTUAL_STORE_DIR='D:\DevData\tianwen-phase2\workspace-virtual-store'
pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts
Remove-Item Env:TIANWEN_DSH_PHASE2_STARTUP -ErrorAction SilentlyContinue
```

Expected: the stale-receipt fail-closed test passes and the real behavior test fails only because `profiles/tianwen/cordis.patch.yml` is absent. The failure must occur before Profile installation, DSH boot, model request, or network call. A TypeScript/import/setup failure is not a valid RED.

- [ ] **Step 3: Add the exact authored Profile patch**

Create `profiles/tianwen/cordis.patch.yml` with exactly these four operations:

```yaml
- id: agent-default-model
  config:
    provider: tianwen-offline
    model: phase2-smoke

- id: session-persistence-jsonl
  config:
    compression: none
    packChunks: false

- id: tianwen-runtime
  config:
    evolutionRoot: 'D:/DevData/tianwen/state/evolution'

- insert:
    - id: tianwen-phase2-smoke
      name: '@tianwen/runtime-bundle/smoke'
```

Do not add model credentials, permissions, sandbox overrides, Goal objective, extra Tools, UI, Web/TUI, telemetry, or Dynamic/Evolution actions. Correctness is proven through the installed manifest and public DSH `--dump-config`, not by comparing this file's formatting.

- [ ] **Step 4: Keep the opt-in process helpers minimal and file-local**

Keep all acceptance-only process code inside `tests/dsh-migration/tianwen-startup.e2e.spec.ts`; do not create an installer framework.

Use fixed constants:

```ts
const tianwenRoot = 'D:/DevData/tianwen'
const dshHome = `${tianwenRoot}/dsh-home`
const profileRoot = `${dshHome}/profiles/tianwen`
const sessionsRoot = `${dshHome}/sessions`
const evolutionRoot = `${tianwenRoot}/state/evolution`
const receiptPath = `${tianwenRoot}/receipts/phase2-startup-receipt.json`
const archive = `${tianwenRoot}/packs/tianwen-runtime-bundle-0.0.0.tgz`
const taskText = 'run the Tianwen phase 2 smoke task'
const enabled = process.env.TIANWEN_DSH_PHASE2_STARTUP === '1'
```

Implement only these focused helpers:

```ts
function run(executable: string, argv: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(executable, argv, {
    cwd: root,
    encoding: 'utf8',
    env,
    shell: false,
    timeout: 120_000,
  })
}

function listSessionLogs(): string[] {
  return existsSync(sessionsRoot)
    ? globSync('**/session.jsonl', { cwd: sessionsRoot, absolute: true }).sort()
    : []
}

function publishReceipt(value: unknown): void {
  mkdirSync(dirname(receiptPath), { recursive: true })
  const temp = `${receiptPath}.tmp`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temp, receiptPath)
}
```

Do not add a glob dependency. If Node 22 `globSync` is unavailable in the local type definitions, replace `listSessionLogs()` with a ten-line recursive `readdirSync(..., { withFileTypes: true })` walker in this test file.

Build a minimal child environment from explicit non-secret values only:

- `DSH_HOME=dshHome`
- `DSH_TELEMETRY_DISABLED=1`
- `COREPACK_HOME=D:\DevData\corepack-home`
- `COREPACK_ENABLE_NETWORK=0`
- `PNPM_CONFIG_OFFLINE=true`, `NPM_CONFIG_OFFLINE=true`
- D-drive pnpm store/cache/virtual-store and `TEMP`/`TMP`
- `PATH` containing only `dirname(process.execPath)` and Windows `System32`
- required Windows `SystemRoot`, `WINDIR`, `ComSpec`, `PATHEXT`

Before any child process:

1. remove `receiptPath` and `${receiptPath}.tmp`;
2. require exact `D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs` to exist;
3. require the resolved DSH manifest version to be `0.1.0-rc.6` and its `bin.dsh` target to be a regular file;
4. require every configured root to remain under resolved `D:\DevData\tianwen`;
5. after that containment check, remove only the exact old `${profileRoot}` so the public install is fresh;
6. recreate only `${profileRoot}` and write this exact `pnpm-workspace.yaml` policy before the public CLI initializes the remaining Profile files:

```yaml
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
allowBuilds:
  '@deepseek-ai/dsh-subprocess-local': false
  '@google/genai': false
  koffi: false
  node-pty: false
  protobufjs: false
```

This is the existing repository policy made explicit for the isolated Profile: no lifecycle script is approved or executed. Public rc.6 `initProfile()` preserves an existing workspace file while creating the Profile manifest and patch.
7. remove the exact old Runtime Bundle archive so the next pack must create the accepted tarball;
8. snapshot `ledger.jsonl` and `champion.json` bytes if present.

No path, executable, package spec, Profile name, task, provider, model, or argv is accepted from caller input.

- [ ] **Step 5: Use one fixed offline Profile installation path**

Use exact pnpm mjs through `process.execPath` and `shell: false` to build/pack Task 1. Then invoke exact DSH `lib/bin.js` through `process.execPath` with:

```ts
[
  dshBin,
  'plugin', '--profile', 'tianwen',
  'add', '--offline',
  '@deepseek-ai/dsh-base@0.1.0-rc.6',
  '@deepseek-ai/dsh-headless@0.1.0-rc.6',
  archive,
]
```

This is the sole accepted upstream Windows plugin-install exception. The exact base package must be listed explicitly: rc.6 seeds the base layer name in a new Profile but does not otherwise persist the base package and its runtime dependency closure in that Profile. Do not install the base package's individual dependencies one by one. After exit 0:

1. copy the committed Profile patch to `${profileRoot}/cordis.patch.yml` using exact UTF-8+LF bytes;
2. parse `${profileRoot}/package.json`;
3. require Bundle order exactly `[@deepseek-ai/dsh-base, @deepseek-ai/dsh-headless, @tianwen/runtime-bundle]`;
4. require the installed Runtime dependency to refer to the current-run archive and both base/headless dependencies to be exact rc.6;
5. require the installed `pnpm-workspace.yaml` still holds the exact five `allowBuilds: false` decisions above;
6. run exact DSH `--profile tianwen --dump-config` and require the default route, plain JSONL config, Runtime evolution root, and smoke export at their exact row IDs;
7. resolve/import `@tianwen/runtime-bundle/runtime`, `@tianwen/runtime-bundle/smoke`, and every Runtime Bundle manifest external from the installed Runtime Bundle package anchor.

Do not reuse the `tianwen-probe` Profile, `verify-dsh-profile.mjs`, or `@tianwen/dsh-probe-bundle`.

- [ ] **Step 6: Validate the real public headless task and durable authority**

Record the set of `session.jsonl` files, then run:

```ts
run(process.execPath, [dshBin, '--profile', 'tianwen', taskText], childEnv)
```

Require exit 0 and stdout trimmed exactly `TIANWEN_PHASE2_OK`. Find exactly one new `session.jsonl`. Parse its first line as the Session header and each remaining line as a public `SessionEvent`.

Assert:

```ts
const calls = events.filter(event => event.type === 'tool/call')
expect(calls.map(event => event.data.name)).toEqual([
  'create_goal',
  'tianwen_smoke_action',
])

const results = events.filter(event => event.type === 'tool/result')
expect(results).toHaveLength(2)
expect(events.filter(event => event.type === 'step/start')).toHaveLength(4)

const goalChanges = events.filter(event => event.type === 'goal/change')
const finalGoal = goalChanges.at(-1)!.data.goal
expect(finalGoal).toMatchObject({
  objective: 'prove the Tianwen phase 2 startup path',
  maxGoalRounds: 1,
  roundsStarted: 1,
  phase: 'blocked',
  activation: 'disarmed',
  blockedReason: { code: 'round-limit' },
})

const evidence = projectEvidence(SessionId(header.id), events)
expect(evidence.map(record => ({
  toolName: record.action.toolName,
  status: record.outcome.status,
}))).toEqual([
  { toolName: 'create_goal', status: 'complete' },
  { toolName: 'tianwen_smoke_action', status: 'complete' },
])
```

Require serialized Evidence not to contain the task text, Goal objective, `phase2-smoke-action-ok`, or raw tool arguments. Require `ledger.jsonl` and `champion.json` snapshots unchanged; creation of an empty `artifacts` directory is allowed because Runtime mount initializes its state root.

Publish exact schema `tianwen.phase2-startup.v1` with:

```ts
{
  schemaVersion: 'tianwen.phase2-startup.v1',
  profile: {
    name: 'tianwen',
    layers: [
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-headless',
      '@tianwen/runtime-bundle',
    ],
  },
  command: { exitCode: 0, stdout: 'TIANWEN_PHASE2_OK' },
  session: { id: String(header.id), modelSteps: 4 },
  goal: {
    objective: 'prove the Tianwen phase 2 startup path',
    maxGoalRounds: 1,
    roundsStarted: 1,
    phase: 'blocked',
    activation: 'disarmed',
    blockedReason: 'round-limit',
  },
  evidence: [
    { toolName: 'create_goal', status: 'complete' },
    { toolName: 'tianwen_smoke_action', status: 'complete' },
  ],
  evolution: { transitionCountDelta: 0, championChanged: false },
  forbiddenEffects: {
    paidModelRequests: 0,
    liveWebRequests: 0,
    dockerInvocations: 0,
    credentialVariablesPassed: [],
  },
}
```

The receipt's actual Session ID may vary and is not a cross-machine semantic hash. Do not add a normalized-hash protocol.

- [ ] **Step 7: Run default and explicit GREEN gates**

Default, with no installation or headless execution:

```powershell
Remove-Item Env:TIANWEN_DSH_PHASE2_STARTUP -ErrorAction SilentlyContinue
pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts
```

Expected: the two real tests are planned skips and no Profile, Session, or receipt is changed.

Explicit, strictly once after the implementation is ready:

```powershell
$env:TIANWEN_DSH_PHASE2_STARTUP='1'
$env:PNPM_CONFIG_STORE_DIR='D:\DevData\pnpm-store'
$env:PNPM_CONFIG_VIRTUAL_STORE_DIR='D:\DevData\tianwen-phase2\workspace-virtual-store'
pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts
```

Expected: stale-receipt fail-closed case passes without DSH boot; real Profile install/headless case passes; fresh receipt exists and matches the authority fields. Remove only the environment variable afterward; retain the formal D-drive Profile, Session, and receipt as evidence.

Run related regression:

```powershell
pnpm exec vitest run tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/runtime-profile.spec.ts tests/dsh-migration/runtime-session-evidence.spec.ts tests/dsh-migration/tianwen-startup.e2e.spec.ts
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

- [ ] **Step 8: Request fresh scoped review and commit Task 2**

Reviewer must confirm the public CLI path is real, default gate is side-effect free, Profile has exact layers, probe dependencies are absent, only the fixed upstream install exception uses shell, Session/Goal/Evidence come from durable events, receipt is not stale, Evolution remains unchanged, and no generic framework was added.

After C0/I0:

```powershell
git add -- profiles/tianwen/cordis.patch.yml tests/dsh-migration/tianwen-startup.e2e.spec.ts
git diff --cached --check
git commit -m 'test: prove the formal tianwen headless startup'
```

---

### Task 3: Final Whole-Phase Gate, Review, Handoff, and Push

**Files:**
- Create: `docs/operations/tianwen-on-dsh-migration-phase-2-handoff.md`
- Modify only if a final reviewer finds a load-bearing defect: files already listed in Tasks 1–2.

**Interfaces:**
- Consumes: Task 1 Runtime Bundle commit, Task 2 formal Profile/headless commit, final D-drive receipt.
- Produces: canonical handoff, exact reviewed-code SHA, final docs SHA, and remote `codex/tianwen-dsh-migration-phase-2` SHA.

- [ ] **Step 1: Freeze scope and run one fresh whole-phase review**

Give the reviewer the design, this plan, exact base `cffc8e51`, both task commits, tarball listing/metafiles, installed Profile manifest/dump, Session log, Evidence projection, receipt, and scoped reviews.

Review for:

- missing design requirement;
- probe/test dependency in the formal Profile or archive;
- generic adapter/installer/receipt framework;
- non-public DSH path;
- arbitrary input reaching executable/path/package/tool/script;
- stale receipt or unrelated Session accepted;
- headless success without exact Goal/Tool/Evidence facts;
- Evolution/Champion mutation;
- undeclared network/model/Docker/credential effect;
- default test accidentally performing real installation.

Allow at most one whole-phase fix wave. Add a focused RED for each Critical/Important, apply the smallest root-cause fix, rerun its focused tests, and ask the same reviewer for a narrow re-review. If any Critical/Important remains after that wave, stop and hand off blocked; do not push as complete.

- [ ] **Step 2: Run final gates strictly serially**

Set all pnpm/uv/temp/cache paths to existing D-drive roots. Run each command after the previous one finishes:

```powershell
pnpm install --offline --frozen-lockfile --trust-lockfile
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm run typecheck
```

```powershell
Remove-Item Env:TIANWEN_DSH_PHASE2_STARTUP -ErrorAction SilentlyContinue
pnpm run test:dsh
```

```powershell
$env:TIANWEN_DSH_PHASE2_STARTUP='1'
pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts
Remove-Item Env:TIANWEN_DSH_PHASE2_STARTUP
```

```powershell
$env:TIANWEN_RUN_DSH_SANDBOX='1'
pnpm run test:dsh:sandbox
Remove-Item Env:TIANWEN_RUN_DSH_SANDBOX
```

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
$env:TEMP='D:\DevData\tianwen-phase2\temp'
$env:TMP=$env:TEMP
$env:PYTHONPYCACHEPREFIX='D:\DevData\tianwen-phase2\pycache'
uv run pytest tests/alpha/test_task_packages.py -q
uv run pytest -q
uv run ruff check .
```

```powershell
git diff --check cffc8e51ad829adf016967491830402b0ed91bd5..HEAD
git status --short
```

Required results:

- offline frozen install: exit 0, 0 downloads;
- closure: all 187 DSH packages exact rc.6 and public-surface count remains approved;
- private imports: 0;
- typecheck: exit 0;
- default Node: all pass with only planned real-gate skips;
- explicit Phase 2 startup: pass with fresh receipt;
- Windows sandbox: pass while still reported `partial`;
- Python A1–A5 author proof: 10 passed;
- full Python: current baseline passes with only the four planned skips;
- Ruff/diff/status: clean.

- [ ] **Step 3: Write the canonical handoff**

Create `docs/operations/tianwen-on-dsh-migration-phase-2-handoff.md` with:

- status and explicit non-cutover statement;
- exact base, task commits, reviewed-code SHA, final docs SHA convention;
- RED/GREEN evidence;
- Runtime Bundle archive file list, external set, tarball SHA;
- formal Profile manifest layer order and dump assertions;
- exact headless command, exit/stdout, Session ID/log path;
- Goal final state and Evidence summary;
- receipt path and SHA explicitly labeled as this-run receipt, not semantic hash;
- Evolution/Champion unchanged evidence;
- default/explicit/final gate results;
- scoped and whole-phase review closure;
- retained risks: rc.6 preview, fixed installer shell exception, trusted same-process plugins, Windows partial sandbox, A1-only typed bridge, JSONL governance limits;
- explicit statement that no UI, real model, Goal Graph, migration cutover, Python deletion, Candidate promotion, paid model, live web, or real Docker occurred;
- recommended next phase: read-only `tianwen status --goal` control projection.

Scan:

```powershell
rg -n 'TBD|TODO|FIXME|placeholder|待定|待补' docs/operations/tianwen-on-dsh-migration-phase-2-handoff.md
git diff --check
```

Expected: no placeholders and no whitespace errors.

- [ ] **Step 4: Commit handoff, verify, and push normally**

```powershell
git add -- docs/operations/tianwen-on-dsh-migration-phase-2-handoff.md
git diff --cached --name-status
git diff --cached --check
git commit -m 'docs: hand off dsh migration phase two'
```

Before push, require current remote Phase 2 branch to be absent or an ancestor of local HEAD. Then:

```powershell
git push origin HEAD:refs/heads/codex/tianwen-dsh-migration-phase-2
git ls-remote origin refs/heads/codex/tianwen-dsh-migration-phase-2
git status --short --branch
```

Expected: ordinary fast-forward/no-force push, `ls-remote` SHA exactly equals local HEAD, worktree clean. If direct GitHub fails, the already authorized command-scoped proxy `http://127.0.0.1:7897` may be used without changing Git config.

- [ ] **Step 5: Controller updates main memory without merging implementation**

After independent read-only controller acceptance, update only `docs/architecture-master-session-memory.md` on `main` with the Phase 2 branch, final SHA, product result, retained risks, and next recommended phase. Commit and push that docs-only main update separately. Do not merge the migration branch until the user explicitly approves cutover.

---

## Execution Assignment

The user already selected current-turn subagent execution. Use `superpowers:subagent-driven-development`:

1. one fresh implementer for Task 1, then fresh spec/quality review;
2. one fresh implementer for Task 2, then fresh spec/quality review;
3. one fresh final-gate/handoff worker for Task 3, then one whole-phase reviewer;
4. controller remains read-only over product code, verifies receipts, updates memory, and reports decisions to the user.

Do not create user-owned sidebar tasks or restore the old 30-minute heartbeat automation.
