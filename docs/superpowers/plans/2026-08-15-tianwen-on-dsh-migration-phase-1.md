# Tianwen-on-DSH Migration Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已通过的 DeepSeek Harness 探针之上，用最小正式组合包接通 DSH Session/Goal/Tool、Tianwen Evidence、Python A1 评测和 Cordis Plugin Evolution，并用可安装 Profile Bundle 证明这套组合可以离线重放。

**Architecture:** 从探针最终提交 `1eef994a82c4ff39de311d5c2b61dff92bf94162` 建立独立迁移分支，原样复用已验证的 compat、Evidence、Evaluator、Evolution 和无密钥测试 Bundle。只新增一个薄 `@tianwen/runtime` Cordis 插件和一个 `@tianwen/runtime-bundle`；Python A1 评测链与 Cordis Plugin 晋升链共处同一产品环境，但保持两套真实权威，不伪造 receipt 到无关 Artifact 的关系。

**Tech Stack:** Node.js 22.23.1、pnpm 11.20.0、TypeScript 6.0.3、Vitest 4.1.8、DeepSeek Harness `0.1.0-rc.6`、Cordis 4.0.1、Python 3.11–3.14、现有 Tianwen A1–A5、pytest、Ruff、Git

## Global Constraints

- 实施基线固定为 `origin/codex/deepseek-harness-probe@1eef994a82c4ff39de311d5c2b61dff92bf94162`，实施分支固定为 `codex/tianwen-dsh-migration-phase-1`。
- 开始前必须核对本地基线对象和远端 probe 分支都精确等于上述 SHA；不一致时停止，不 merge、rebase 或换基线。
- 精确复用 `@tianwen/dsh-compat`、`@tianwen/evidence`、`@tianwen/evaluator-python`、`@tianwen/evolution`、`@tianwen/dsh-probe-bundle`；不重写其能力。
- DSH 依赖保持精确 `0.1.0-rc.6`；Cordis 保持 `4.0.1`；pnpm 保持 `11.20.0`。禁止 `latest`、`^`、`~` 和自动升级。
- 不 Fork DSH，不复制上游源码，不使用 `@deepseek-ai/*/src/*`、相对上游源码路径或未发布测试文件。
- 现有 Python Runtime、StateStore、Alpha-A Tasks 1–9、A1–A5 bundle/seed/reference/verifier/image lock 和 Python 测试全部保留，不删除、不重命名、不大规模重构。
- Python A1 receipt 只证明 `repo_task` 评测合同；Cordis Plugin Artifact 使用自己的 Evaluation。不得把 A1 receipt 绑定到无关 Cordis Plugin，也不得新增通用 Artifact activation strategy。
- 已审核并正式装入同一 JavaScript 进程的插件视为可信代码；不新增 ingress token、插件沙盒、capability framework 或恶意同进程插件防护。
- Windows 本地沙盒继续诚实标记为 `partial`；高风险执行仍建议 container/remote/microVM，本阶段不实现这些 provider。
- 不开发 UI，不调用付费模型，不使用模型密钥，不执行 live web/search/fetch，不运行真实 Docker，不启动 Alpha Task 10。
- 缓存、store、virtual store、temp、Session 和 Evolution 数据放在 `D:\DevData\tianwen-dsh-migration-phase-1` 的子目录。现有 Python A1 bridge 继续写入 `D:\DevData\tianwen-dsh-probe\migration-phase-1-a1`；固定 DSH Windows Profile 安装也继续使用已审计的 `D:\DevData\tianwen-dsh-probe` 根。所有生成数据都留在 D 盘。
- 所有 Tianwen 自建子进程使用程序加 argv、`shell: false`。探针 Task 3 已接受的上游 Windows Profile 安装内部 `shell: true` 例外只能用于固定离线 tarball 安装，不得扩散。
- 每项任务先取得有效 RED，再做最小 GREEN；每项任务独立提交并由 fresh scoped reviewer 复审。
- 每项任务最多两轮窄修复；Phase 1 最终 whole-review 最多一个跨任务修复波次。仍有 Critical/Important 时停止并结构化交接。
- 低负载串行运行大型验证；不建立 30 分钟 heartbeat，不并发跑全量 Node/Python/sandbox。

---

## File Map

### Formal runtime composition

- Create: `packages/tianwen-runtime/package.json`
- Create: `packages/tianwen-runtime/tsconfig.json`
- Create: `packages/tianwen-runtime/src/index.ts`

`@tianwen/runtime` 只检查版本、挂载 Evidence 和 Evolution；不拥有 Agent Loop、Session、Goal、Tool、模型或沙盒。

### Formal runtime Bundle

- Create: `packages/tianwen-runtime-bundle/package.json`
- Create: `packages/tianwen-runtime-bundle/tsconfig.json`
- Create: `packages/tianwen-runtime-bundle/cordis.patch.yml`
- Create: `packages/tianwen-runtime-bundle/src/index.ts`

`@tianwen/runtime-bundle` 只把 `@tianwen/runtime` 插入 DSH Profile。

### Phase 1 tests

- Create: `tests/dsh-migration/runtime-composition.spec.ts`
- Create: `tests/dsh-migration/runtime-session-evidence.spec.ts`
- Create: `tests/dsh-migration/runtime-governance.spec.ts`
- Create: `tests/dsh-migration/runtime-profile.spec.ts`
- Modify: `vitest.config.ts`

测试分开证明组合、Session/Evidence、两条治理链和可安装 Profile，避免一个超大端到端测试掩盖失败位置。

### Workspace and handoff

- Modify: `pnpm-lock.yaml` only for the two new workspace importers
- Create: `docs/operations/tianwen-on-dsh-migration-phase-1-handoff.md`

不新增数据库、事件总线、RPC、迁移框架或第二份结果文档。

---

### Task 1: Add the formal `@tianwen/runtime` composition seam

**Files:**

- Create: `packages/tianwen-runtime/package.json`
- Create: `packages/tianwen-runtime/tsconfig.json`
- Create: `packages/tianwen-runtime/src/index.ts`
- Create: `tests/dsh-migration/runtime-composition.spec.ts`
- Modify: `vitest.config.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `DSH_VERSION`, `Context`, and `DynamicCordisRunnerService` from `@tianwen/dsh-compat`; `TianwenEvidenceService`; `TianwenEvolutionService`.
- Produces:

```ts
export interface TianwenRuntimeConfig {
  readonly evolutionRoot: string
}

export const name = 'tianwen-runtime'
export const inject = ['dynamicCordisRunner'] as const

export async function apply(
  ctx: Context,
  config: TianwenRuntimeConfig,
): Promise<void>
```

- The test may import `SUPPORTED_DSH_VERSION`, fixed to `'0.1.0-rc.6'`.

- [ ] **Step 1: Freeze the branch and baseline**

Run:

```powershell
git fetch origin codex/deepseek-harness-probe
git rev-parse HEAD
git rev-parse origin/codex/deepseek-harness-probe
git merge-base --is-ancestor 1eef994a82c4ff39de311d5c2b61dff92bf94162 HEAD
git status --porcelain=v1
```

Expected: local HEAD and the remote probe ref are both
`1eef994a82c4ff39de311d5c2b61dff92bf94162`, the ancestry command exits 0,
and status is empty.

- [ ] **Step 2: Write the failing composition test**

Add `tests/dsh-migration/runtime-composition.spec.ts`:

```ts
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Context,
  DSH_VERSION,
  DynamicCordisRunnerService,
  SystemPrompt,
  ToolRuntime,
} from '@tianwen/dsh-compat'
import { default as TimerService } from '@deepseek-ai/cordis-plugin-timer'
import {
  apply,
  SUPPORTED_DSH_VERSION,
} from '../../packages/tianwen-runtime/src/index.js'

const roots: string[] = []

function stateRoot(): string {
  const base = process.platform === 'win32'
    ? 'D:/DevData/tianwen-dsh-migration-phase-1/evolution'
    : resolve('tmp/tianwen-dsh-migration-phase-1/evolution')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'composition-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('@tianwen/runtime', () => {
  it('mounts only Tianwen evidence and evolution on the existing DSH context', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})
    await ctx.plugin(DynamicCordisRunnerService, {})

    try {
      expect(SUPPORTED_DSH_VERSION).toBe('0.1.0-rc.6')
      expect(DSH_VERSION).toBe(SUPPORTED_DSH_VERSION)
      await apply(ctx, { evolutionRoot: stateRoot() })
      expect(ctx.tianwenEvidence).toBeDefined()
      expect(ctx.tianwenEvolution).toBeDefined()
      expect('goals' in ctx).toBe(false)
      expect('agents' in ctx).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects a non-absolute evolution root before mounting services', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})
    await ctx.plugin(DynamicCordisRunnerService, {})
    try {
      await expect(apply(ctx, { evolutionRoot: 'relative/evolution' }))
        .rejects.toThrow(/evolutionRoot.*absolute/)
      expect('tianwenEvidence' in ctx).toBe(false)
      expect('tianwenEvolution' in ctx).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
```

Modify `vitest.config.ts` include to:

```ts
include: [
  'tests/dsh-probe/**/*.spec.ts',
  'tests/dsh-migration/**/*.spec.ts',
],
```

- [ ] **Step 3: Run the test and confirm the intended RED**

Run:

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-dsh-probe'
pnpm exec vitest run tests/dsh-migration/runtime-composition.spec.ts
```

Expected: FAIL because `@tianwen/runtime` does not exist. A dependency-install,
syntax, path-permission, or import-cache failure is setup noise and does not count.

- [ ] **Step 4: Add the minimal package**

Create `packages/tianwen-runtime/package.json`:

```json
{
  "name": "@tianwen/runtime",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "dependencies": {
    "@tianwen/dsh-compat": "workspace:*",
    "@tianwen/evidence": "workspace:*",
    "@tianwen/evolution": "workspace:*"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --pretty false"
  }
}
```

Create `packages/tianwen-runtime/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/tianwen-runtime/src/index.ts`:

```ts
import { isAbsolute } from 'node:path'
import { DSH_VERSION } from '@tianwen/dsh-compat'
import type { Context } from '@tianwen/dsh-compat'
import { TianwenEvidenceService } from '@tianwen/evidence'
import { TianwenEvolutionService } from '@tianwen/evolution'

export const SUPPORTED_DSH_VERSION = '0.1.0-rc.6' as const
export const name = 'tianwen-runtime'
export const inject = ['dynamicCordisRunner'] as const

export interface TianwenRuntimeConfig {
  readonly evolutionRoot: string
}

export async function apply(
  ctx: Context,
  config: TianwenRuntimeConfig,
): Promise<void> {
  if (DSH_VERSION !== SUPPORTED_DSH_VERSION) {
    throw new Error(`unsupported DSH version: ${DSH_VERSION}`)
  }
  if (
    typeof config.evolutionRoot !== 'string'
    || !isAbsolute(config.evolutionRoot)
  ) {
    throw new Error('evolutionRoot must be an absolute path')
  }
  await ctx.plugin(TianwenEvidenceService)
  await ctx.plugin(TianwenEvolutionService, { root: config.evolutionRoot })
}
```

Do not add a wrapper class, factory, config schema package, mount registry or
idempotency layer.

- [ ] **Step 5: Refresh only the workspace lock importer**

Run with D-drive stores:

```powershell
$env:PNPM_STORE_DIR='D:\DevData\pnpm-store'
$env:PNPM_CONFIG_VIRTUAL_STORE_DIR='D:\DevData\tianwen-dsh-migration-phase-1\virtual-store'
pnpm install --lockfile-only --offline
pnpm install --offline --frozen-lockfile --trust-lockfile
```

If the first command hits the already documented missing optional registry
metadata while offline, do not access the registry. Add this exact importer
beside the existing Tianwen importers:

```yaml
  packages/tianwen-runtime:
    dependencies:
      '@tianwen/dsh-compat':
        specifier: workspace:*
        version: link:../tianwen-dsh-compat
      '@tianwen/evidence':
        specifier: workspace:*
        version: link:../tianwen-evidence
      '@tianwen/evolution':
        specifier: workspace:*
        version: link:../tianwen-evolution
```

Expected: `pnpm-lock.yaml` adds only this importer; the frozen command exits 0
with zero downloads.

- [ ] **Step 6: Run focused and neighboring checks**

Run:

```powershell
pnpm --filter @tianwen/runtime build
pnpm exec vitest run tests/dsh-migration/runtime-composition.spec.ts
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/evolution.spec.ts
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: all commands exit 0; closure remains 187 exact rc.6 packages,
15 public surfaces, and 0 private imports.

- [ ] **Step 7: Fresh scoped review and commit**

Ask a fresh reviewer to inspect only Task 1 against the design and this task.
Open Critical/Important findings must be repaired with focused RED/GREEN before
commit.

Commit:

```powershell
git add -- packages/tianwen-runtime tests/dsh-migration/runtime-composition.spec.ts vitest.config.ts pnpm-lock.yaml
git diff --cached --check
git commit -m "feat: compose tianwen services on dsh"
```

---

### Task 2: Prove Session, Goal, Tool, and Evidence recovery together

**Files:**

- Create: `tests/dsh-migration/runtime-session-evidence.spec.ts`

**Interfaces:**

- Consumes: `apply(ctx, { evolutionRoot })`, `mountGoalHarness(root, script, { goalRoundDriver })`, `TianwenEvidenceService.project(session)`.
- Produces: executable proof that DSH owns Session/Goal/Tool while Tianwen projects stable minimal Evidence.

- [ ] **Step 1: Write the failing integration test**

The test must use three fresh Contexts:

1. create disposable `sessions` and `evolution` directories below
   `D:\DevData\tianwen-dsh-migration-phase-1`;
2. Context 1 mounts Goal persistence without the round driver, receives a real
   direct-user turn, and lets the model-facing public `create_goal` tool create
   the top-level Goal;
3. Context 2 mounts the round driver, resumes the JSONL Session with the Goal
   disarmed, proves zero model requests, then explicitly resumes the Goal and
   executes one fixed `echo` call;
4. Context 2 projects exactly two complete Evidence records—`create_goal` and
   `echo`—and verifies private input/result text is absent;
5. Context 3 resumes the same JSONL Session without a model request and compares
   canonical Evidence bytes with Context 2.

Use these imports and core assertions:

```ts
import { randomUUID } from 'node:crypto'
import {
  DynamicCordisRunnerService,
  SessionId,
  createUserMessage,
  defineTool,
  mountGoalHarness,
  textResponse,
  toolGoal,
  toolCallResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import { apply } from '../../packages/tianwen-runtime/src/index.js'

const first = await mountGoalHarness(sessionRoot, [
  toolCallResponse('phase1-goal', 'create_goal', {
    objective: 'prove the Phase 1 runtime slice',
    max_goal_rounds: 1,
  }),
  textResponse('goal created'),
], { goalRoundDriver: false })
await first.ctx.plugin(toolGoal, {})
await first.ctx.plugin(DynamicCordisRunnerService, {})
await apply(first.ctx, { evolutionRoot })

const sessionId = SessionId(`phase1-${randomUUID()}`)
const initial = await first.ctx.agents.create({
  sessionId,
  agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
})
initial.agent.followup(createUserMessage({
  content: [{ type: 'text', text: 'create the migration goal' }],
  source: { kind: 'user' },
}))
await waitForIdle(first.ctx, initial.agent)
const createdGoal = first.ctx.goals.get(initial.agent)
expect(createdGoal).toMatchObject({
  objective: 'prove the Phase 1 runtime slice',
  activation: 'armed',
  maxGoalRounds: 1,
})
expect(await first.ctx.sessions.flush(initial.agent.session)).toBe(true)
await first.ctx.fiber.dispose()

const second = await mountGoalHarness(sessionRoot, [
  toolCallResponse('phase1-call', 'echo', { text: 'private argument' }),
  textResponse('done'),
], { goalRoundDriver: true })
await second.ctx.plugin(DynamicCordisRunnerService, {})
await apply(second.ctx, { evolutionRoot })
second.ctx.tools.register(defineTool({
  name: 'echo',
  description: 'return one fixed value',
  parameters: { text: { type: 'string', required: true } },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute() {
    return 'private result'
  },
}))
const resumed = await second.ctx.agents.resume({
  resumeSessionId: sessionId,
  agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
})
await waitForIdle(second.ctx, resumed.agent)
const recoveredGoal = second.ctx.goals.get(resumed.agent)
expect(recoveredGoal?.activation).toBe('disarmed')
expect(second.adapter.requests).toHaveLength(0)
second.ctx.goals.resume(resumed.agent, recoveredGoal!)
await waitForIdle(second.ctx, resumed.agent)
```

Do not directly mutate the JSONL log or call a private Goal API.

Core assertions:

```ts
const before = second.ctx.tianwenEvidence.project(resumed.agent.session)
const beforeBytes = JSON.stringify(before)
expect(before).toHaveLength(2)
expect(before.map(record => record.action.toolName)).toEqual([
  'create_goal',
  'echo',
])
expect(before.map(record => record.outcome.status)).toEqual([
  'complete',
  'complete',
])
const echoEvidence = before.find(
  record => record.action.callId === 'phase1-call',
)
expect(echoEvidence).toMatchObject({
  action: { callId: 'phase1-call', toolName: 'echo' },
  outcome: { status: 'complete' },
})
expect(beforeBytes).not.toContain('prove the Phase 1 runtime slice')
expect(beforeBytes).not.toContain('create the migration goal')
expect(beforeBytes).not.toContain('private argument')
expect(beforeBytes).not.toContain('private result')

expect(await second.ctx.sessions.flush(resumed.agent.session)).toBe(true)
await second.ctx.fiber.dispose()

const third = await mountGoalHarness(
  sessionRoot,
  [],
  { goalRoundDriver: true },
)
await third.ctx.plugin(DynamicCordisRunnerService, {})
await apply(third.ctx, { evolutionRoot })
const replayed = await third.ctx.agents.resume({
  resumeSessionId: sessionId,
  agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
})
expect(third.adapter.requests).toHaveLength(0)
expect(JSON.stringify(
  third.ctx.tianwenEvidence.project(replayed.agent.session),
)).toBe(beforeBytes)
```

The final test must wrap all three Contexts and both disposable roots in
`try/finally`, disposing any live Context before removing its directories.

- [ ] **Step 2: Run the test and verify a useful RED**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/runtime-session-evidence.spec.ts
```

Expected: FAIL at the first missing integration behavior or incorrect mount
order. If the test passes immediately, temporarily remove the `apply` call and
confirm it fails because `ctx.tianwenEvidence` is unavailable, then restore it.

- [ ] **Step 3: Restore the real runtime composition**

Restore the omitted `apply` call used for the mutation RED and run the complete
three-Context test. Task 2 is a proof task; it adds no product code. If the
complete test still fails because the Task 1 Runtime cannot provide its stated
contract, stop and report the exact integration defect instead of adding a
second Goal, Session, Tool or Evidence path.

- [ ] **Step 4: Run focused and related tests**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/runtime-session-evidence.spec.ts
pnpm exec vitest run tests/dsh-probe/goal-authority.spec.ts tests/dsh-probe/goal-recovery.spec.ts tests/dsh-probe/evidence.spec.ts
pnpm run typecheck
git diff --check
```

Expected: all pass; recovered Goal is disarmed; zero pre-resume requests;
Evidence canonical bytes match.

- [ ] **Step 5: Fresh scoped review and commit**

Review specifically for accidental second AgentLoop/Goal/Session mount, raw
payload leakage, automatic resume, and test-only private DSH imports.

Commit:

```powershell
git add -- tests/dsh-migration/runtime-session-evidence.spec.ts
git diff --cached --check
git commit -m "test: prove dsh session evidence recovery"
```

---

### Task 3: Co-locate Python A1 evaluation and Cordis Plugin governance without false linkage

**Files:**

- Create: `tests/dsh-migration/runtime-governance.spec.ts`

**Interfaces:**

- Consumes: `PythonA1Evaluator.evaluateA1('nop' | 'oracle')`,
  `ctx.tianwenEvolution.recordArtifact`, `recordEvaluation`, `recordApproval`,
  `promote`, `getChampion`, and `rehydrateChampion`.
- Produces: one test file with two explicit, separate chains:
  `repo_task → EvalReceipt` and `Cordis source → Evaluation/Approval/Champion`.

- [ ] **Step 1: Write the Python A1 contract test**

Use the existing evaluator directly:

```ts
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PythonA1Evaluator } from '@tianwen/evaluator-python'

const repoRoot = resolve(import.meta.dirname, '../..')

it('keeps Python A1 as an independent repo-task evaluator', async () => {
  const stateRoot = resolve(
    'D:/DevData/tianwen-dsh-probe/migration-phase-1-a1',
  )
  const pythonExecutable = process.env.TIANWEN_DSH_PROBE_PYTHON
  if (pythonExecutable === undefined) {
    throw new Error('TIANWEN_DSH_PROBE_PYTHON is required')
  }
  const evaluator = new PythonA1Evaluator({
    repoRoot,
    stateRoot,
    pythonExecutable,
  })
  const nop1 = await evaluator.evaluateA1('nop')
  const nop2 = await evaluator.evaluateA1('nop')
  const oracle1 = await evaluator.evaluateA1('oracle')
  const oracle2 = await evaluator.evaluateA1('oracle')

  expect(nop1.verdict).toBe('not_met')
  expect(nop1.raw_stdout).toBe(nop2.raw_stdout)
  expect(nop1.raw_stdout_digest).toBe(nop2.raw_stdout_digest)
  expect(oracle1.verdict).toBe('met')
  const oracleOutput = JSON.parse(oracle1.raw_stdout) as {
    summary: string
    passed_checks: string[]
  }
  expect(oracleOutput.summary).toBe('7/7 checks passed')
  expect(oracleOutput.passed_checks).toHaveLength(7)
  expect(oracle1.raw_stdout).toBe(oracle2.raw_stdout)
  expect(oracle1.raw_stdout_digest).toBe(oracle2.raw_stdout_digest)
})
```

- [ ] **Step 2: Write the separate Cordis governance test**

Mount one Context with Timer, SystemPrompt, ToolRuntime,
`DynamicCordisRunnerService`, and `apply`. Use this public-only Agent helper:

```ts
import {
  Context,
  DynamicCordisRunnerService,
  Inbox,
  Session,
  SessionId,
  SystemPrompt,
  ToolRuntime,
} from '@tianwen/dsh-compat'
import type { Agent } from '@tianwen/dsh-compat'
import { default as TimerService } from '@deepseek-ai/cordis-plugin-timer'
import { apply } from '../../packages/tianwen-runtime/src/index.js'

function createStubAgent(ctx: Context, id: string): Agent {
  const session = Session.create(SessionId(id))
  const inbox = new Inbox(session, {
    inserted() {},
    discarded() {},
    claimed() {},
  })
  return {
    id: session.id,
    options: {},
    session,
    inbox,
    status: 'running',
    ctx,
    cancel() {},
    whenIdle: () => Promise.resolve(),
    runMaintenance: task => task(new AbortController().signal),
    send(message, target) {
      inbox.append(target, message)
    },
    followup(message) {
      inbox.append('next-turn', message)
    },
    steer(message) {
      inbox.append('next-step', message)
    },
    inject(message) {
      inbox.append('next-step', message)
    },
  }
}

async function mountGovernance(root: string, id: string) {
  const ctx = new Context()
  await ctx.plugin(TimerService)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, {})
  await ctx.plugin(DynamicCordisRunnerService, {})
  await apply(ctx, { evolutionRoot: root })
  return { ctx, agent: createStubAgent(ctx, id) }
}
```

Use these fixed plugin sources:

```ts
const V1 = 'return { name: "phase1-v1", apply() {} }'
const BROKEN = 'throw new Error("phase1 broken candidate")'
const RECEIPT_V1 = `sha256:${'1'.repeat(64)}` as const
const RECEIPT_BROKEN = `sha256:${'2'.repeat(64)}` as const
```

Exercise this exact sequence:

```ts
const v1 = evolution.recordArtifact(V1)
evolution.recordEvaluation({
  artifactId: v1.artifactId,
  receiptDigest: RECEIPT_V1,
  verdict: 'met',
})
await expect(evolution.promote(agent, v1.artifactId))
  .rejects.toMatchObject({ code: 'human-approval-required' })
expect(ctx.dynamicCordisRunner.inventory()).toEqual([])

evolution.recordApproval({
  artifactId: v1.artifactId,
  authority: 'human',
  approvalId: 'phase1-v1-human',
})
const firstBinding = await evolution.promote(agent, v1.artifactId)
expect(evolution.getChampion()).toEqual({
  artifactId: v1.artifactId,
  revision: 1,
})

const broken = evolution.recordArtifact(BROKEN, v1.artifactId)
evolution.recordEvaluation({
  artifactId: broken.artifactId,
  receiptDigest: RECEIPT_BROKEN,
  verdict: 'met',
})
evolution.recordApproval({
  artifactId: broken.artifactId,
  authority: 'human',
  approvalId: 'phase1-broken-human',
})
await expect(evolution.promote(agent, broken.artifactId))
  .rejects.toThrow(/previous Champion restored/)
expect(evolution.getChampion()).toEqual({
  artifactId: v1.artifactId,
  revision: 1,
})
expect(ctx.dynamicCordisRunner.inventory()).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ currentPackageId: firstBinding.packageId }),
  ]),
)
```

Dispose the first Context. Mount a fresh Context over the same Evolution root,
call `rehydrateChampion` with a fresh stub Agent, and assert:

```ts
expect(second.ctx.tianwenEvolution.getChampion()).toEqual({
  artifactId: v1.artifactId,
  revision: 1,
})
const rebound = await second.ctx.tianwenEvolution.rehydrateChampion(second.agent)
expect(rebound?.artifactId).toBe(v1.artifactId)
expect(second.ctx.dynamicCordisRunner.inventory()).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ currentPackageId: rebound?.packageId }),
  ]),
)
expect(second.ctx.tianwenEvolution.listEvents().at(-1)).toMatchObject({
  type: 'runtime-bound',
  artifactId: v1.artifactId,
  pluginId: rebound?.pluginId,
  packageId: rebound?.packageId,
})
```

The test must not pass `nop1`, `oracle1`, or their receipt digest into
`recordEvaluation`. The Cordis evaluation constants above are deliberately
separate.

- [ ] **Step 3: Run the tests and verify the RED**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/runtime-governance.spec.ts
```

Expected: the new test initially fails because its fixtures or formal runtime
composition are not yet wired. If it passes immediately after completing the
test, temporarily omit `recordApproval` and confirm Dynamic inventory stays
unchanged, then restore the approved path.

- [ ] **Step 4: Restore the approved path**

Restore the omitted `recordApproval` call used for the mutation RED. Task 3 is
intentionally test-only. If the complete test still fails, stop with the exact
contract mismatch; do not modify `@tianwen/evaluator-python`,
`@tianwen/evolution`, or invent a receipt adapter.

- [ ] **Step 5: Run focused and neighboring checks**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/runtime-governance.spec.ts
pnpm exec vitest run tests/dsh-probe/python-a1-evaluator.spec.ts tests/dsh-probe/evolution.spec.ts
pnpm run typecheck
git diff --check
```

Expected: Python Nop/Oracle repeatability passes; unapproved Dynamic inventory
does not change; BROKEN leaves V1 Champion active; restart uses new opaque IDs.

- [ ] **Step 6: Fresh scoped review and commit**

The reviewer must explicitly search Task 3 for a false A1 receipt-to-Cordis
Artifact binding. Any such binding is an Important design violation.

Commit:

```powershell
git add -- tests/dsh-migration/runtime-governance.spec.ts
git diff --cached --check
git commit -m "test: keep migration evaluation seams honest"
```

---

### Task 4: Package the formal Runtime Bundle and prove Profile composition

**Files:**

- Create: `packages/tianwen-runtime-bundle/package.json`
- Create: `packages/tianwen-runtime-bundle/tsconfig.json`
- Create: `packages/tianwen-runtime-bundle/cordis.patch.yml`
- Create: `packages/tianwen-runtime-bundle/src/index.ts`
- Create: `tests/dsh-migration/runtime-profile.spec.ts`
- Modify: `pnpm-lock.yaml`
- Modify only if the public Profile verifier requires a narrow reusable input:
  `scripts/verify-dsh-profile.mjs`

**Interfaces:**

- Consumes: public DSH Bundle manifest/patch mechanism and `@tianwen/runtime`.
- Produces: npm-packable `@tianwen/runtime-bundle` and proof of this order:
  `@deepseek-ai/dsh-base → @tianwen/runtime-bundle → @tianwen/dsh-probe-bundle`.

- [ ] **Step 1: Write the failing manifest and patch tests**

Create `tests/dsh-migration/runtime-profile.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

describe('Tianwen formal runtime Bundle', () => {
  it('ships one public DSH Bundle patch', () => {
    const manifest = JSON.parse(readFileSync(resolve(
      root,
      'packages/tianwen-runtime-bundle/package.json',
    ), 'utf8')) as {
      name: string
      files: string[]
      dsh: { bundle: { patch: string } }
    }
    expect(manifest.name).toBe('@tianwen/runtime-bundle')
    expect(manifest.files).toEqual(['dist', 'cordis.patch.yml'])
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
  })

  it('only inserts the formal Tianwen runtime', () => {
    const patch = readFileSync(resolve(
      root,
      'packages/tianwen-runtime-bundle/cordis.patch.yml',
    ), 'utf8')
    expect(patch).toBe([
      '- insert:',
      '    - id: tianwen-runtime',
      "      name: '@tianwen/runtime'",
      '      config:',
      '        evolutionRoot: D:\\DevData\\tianwen-dsh-migration-phase-1\\evolution',
      '',
    ].join('\n'))
    expect(patch).not.toContain('agent-default-model')
    expect(patch).not.toContain('tianwen-probe-adapter')
  })
})
```

The first product bundle uses the fixed Phase 1 root rather than inventing an
environment interpolation language. A configurable product root can be added
only when DSH exposes and the project needs a tested public configuration seam.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/runtime-profile.spec.ts
```

Expected: FAIL because `packages/tianwen-runtime-bundle` does not exist.

- [ ] **Step 3: Add the minimal Bundle**

Create `packages/tianwen-runtime-bundle/package.json`:

```json
{
  "name": "@tianwen/runtime-bundle",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist", "cordis.patch.yml"],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  },
  "dependencies": {
    "@tianwen/runtime": "workspace:*"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --pretty false"
  }
}
```

Create the same focused `tsconfig.json` shape as Task 1.

Create `packages/tianwen-runtime-bundle/src/index.ts`:

```ts
export const name = 'tianwen-runtime-bundle'

export function apply(): void {
  // The Bundle only contributes cordis.patch.yml.
}
```

Create `packages/tianwen-runtime-bundle/cordis.patch.yml` with the exact bytes
asserted in Step 1.

- [ ] **Step 4: Refresh the lock and prove the package itself**

Run:

```powershell
pnpm install --lockfile-only --offline
pnpm install --offline --frozen-lockfile --trust-lockfile
pnpm --filter @tianwen/runtime-bundle build
pnpm --filter @tianwen/runtime-bundle pack --pack-destination D:\DevData\tianwen-dsh-migration-phase-1\packs
pnpm exec vitest run tests/dsh-migration/runtime-profile.spec.ts
```

If offline lock-only resolution hits the same known metadata gap, add this
exact importer and let frozen install validate it:

```yaml
  packages/tianwen-runtime-bundle:
    dependencies:
      '@tianwen/runtime':
        specifier: workspace:*
        version: link:../tianwen-runtime
```

Expected: all pass; `pnpm-lock.yaml` gains only this importer; the tarball
contains `package.json`, `cordis.patch.yml`, `dist/index.js`, and
`dist/index.d.ts`.

- [ ] **Step 5: Prove the Profile layer order through the public seam**

Use the existing fixed offline Profile installer and public export resolver.
Do not add a second installer. Extend `scripts/verify-dsh-profile.mjs` with one
literal test mode:

```js
const runtimeBundlePackage = '@tianwen/runtime-bundle'
const runtimeTarballBasename = 'tianwen-runtime-bundle-0.0.0.tgz'

function migrationProfileEnabled() {
  const value = process.env.TIANWEN_DSH_MIGRATION_PROFILE
  if (value === undefined) return false
  requireAssertion(
    value === '1',
    'TIANWEN_DSH_MIGRATION_PROFILE must be exactly 1',
  )
  return true
}
```

Generalize `validateFixedInstallBoundary` only enough to accept one of the two
literal basenames:

```js
const allowedTarballBasenames = new Set([
  tarballBasename,
  runtimeTarballBasename,
])
const expectedBasename = values.tarballBasename ?? tarballBasename
requireAssertion(
  allowedTarballBasenames.has(expectedBasename),
  'tarball basename is not a fixed Tianwen Bundle',
)
const expectedTarball = resolve(
  values.platform === 'win32' ? windowsProbeRoot : values.probeRoot,
  'packs',
  expectedBasename,
)
```

Keep existing calls unchanged. In migration mode, before the existing probe
Bundle pack/install:

```js
runPnpm(
  'build-runtime-bundle',
  ['--filter', runtimeBundlePackage, 'build'],
  workspaceEnv,
  commands,
)
runPnpm(
  'pack-runtime-bundle',
  [
    '--filter',
    runtimeBundlePackage,
    'pack',
    '--pack-destination',
    packsRoot,
  ],
  workspaceEnv,
  commands,
)
const runtimeTarball = childPath(packsRoot, runtimeTarballBasename)
const runtimeArgs = ['add', '--offline', runtimeTarball]
validateFixedInstallBoundary({
  platform: process.platform,
  probeRoot,
  realProbeRoot: realpathSync(probeRoot),
  profileName,
  tarballPath: runtimeTarball,
  realTarballPath: realpathSync(runtimeTarball),
  producedByCurrentRun: true,
  upstreamArgs: runtimeArgs,
  tarballBasename: runtimeTarballBasename,
})
runPnpm(
  'plugin-add-runtime-bundle',
  [
    'exec',
    'dsh',
    'plugin',
    '--profile',
    profileName,
    ...runtimeArgs,
  ],
  profileEnv,
  commands,
)
```

Then keep the existing probe Bundle installation. Add the migration-only
assertion:

```js
if (migrationProfileEnabled()) {
  requireAssertion(
    JSON.stringify(bundleNames) === JSON.stringify([
      basePackage,
      runtimeBundlePackage,
      bundlePackage,
    ]),
    'migration Profile Bundle order is incorrect',
  )
}
```

After reading the generated Profile `package.json`, resolve and import the
formal Runtime from that Profile anchor:

```js
const runtimePublicExport = migrationProfileEnabled()
  ? await (async () => {
      const requireFromProfile = createRequire(realpathSync(profileManifestPath))
      const resolved = requireFromProfile.resolve('@tianwen/runtime')
      const module = await import(pathToFileURL(resolved).href)
      requireAssertion(
        module.name === 'tianwen-runtime'
        && typeof module.apply === 'function',
        'installed Profile cannot import the public Tianwen Runtime',
      )
      return {
        specifier: '@tianwen/runtime',
        resolved,
        name: module.name,
        apply: typeof module.apply,
      }
    })()
  : undefined
```

Include `runtimePublicExport` in `report.composition` only in migration mode.

Add an explicitly gated migration-mode Vitest case. It must stay skipped in
the default Node suite because it performs real Profile installation:

```ts
it.runIf(process.env.TIANWEN_RUN_DSH_MIGRATION_PROFILE === '1')(
  'installs the ordered migration Profile through public Bundle seams',
  { timeout: 90_000 },
  () => {
    const result = spawnSync(
      process.execPath,
      [resolve(root, 'scripts/verify-dsh-profile.mjs')],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          COREPACK_ENABLE_NETWORK: '0',
          TIANWEN_DSH_MIGRATION_PROFILE: '1',
          TIANWEN_DSH_PROBE_ROOT: 'D:\\DevData\\tianwen-dsh-probe',
        },
        shell: false,
        timeout: 60_000,
      },
    )
    expect(result.status).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report.composition.layerOrder).toEqual([
      '@deepseek-ai/dsh-base',
      '@tianwen/runtime-bundle',
      '@tianwen/dsh-probe-bundle',
    ])
  },
)
```

The existing Task 3 default mode must remain byte-for-byte compatible in its
Bundle order and assertions. Both modes preserve:

- outer `shell: false`;
- the already accepted, fixed upstream Windows install exception;
- no user/model-controlled package spec;
- offline/frozen execution;
- public package-root resolution only.

The migration mode packs both Tianwen bundles during the current run, installs
runtime-bundle first and probe-bundle second into the fixed audited Profile,
dumps config, and asserts:

```ts
expect(report.composition.layerOrder).toEqual([
  '@deepseek-ai/dsh-base',
  '@tianwen/runtime-bundle',
  '@tianwen/dsh-probe-bundle',
])
expect(report.composition.runtimePublicExport).toMatchObject({
  specifier: '@tianwen/runtime',
  name: 'tianwen-runtime',
  apply: 'function',
})
expect(report.composition.dumpedDefaultModel).toMatchObject({
  provider: 'tianwen-probe',
  model: 'scripted',
})
expect(report.forbiddenEffects).toMatchObject({
  modelRequests: 0,
  paidModelRequests: 0,
  liveWebRequests: 0,
  dockerInvocations: 0,
})
```

If the public DSH installer cannot carry the runtime bundle's workspace
dependency from the tarball, stop Task 4 with the exact package-resolution
error. Do not copy workspace package source into the tarball, import private
DSH paths, or Fork DSH.

- [ ] **Step 6: Run focused and related Profile checks**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/runtime-profile.spec.ts tests/dsh-probe/profile.spec.ts
$env:TIANWEN_RUN_DSH_MIGRATION_PROFILE='1'
pnpm exec vitest run tests/dsh-migration/runtime-profile.spec.ts
Remove-Item Env:\TIANWEN_RUN_DSH_MIGRATION_PROFILE
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: all pass, closure remains exact, and Profile contains the three
layers in order.

- [ ] **Step 7: Fresh scoped review and commit**

Review the tarball, patch and verifier changes for source copying, private
imports, widened shell exception, hidden model requests and extra config
overrides.

Commit:

```powershell
git add -- packages/tianwen-runtime-bundle tests/dsh-migration/runtime-profile.spec.ts scripts/verify-dsh-profile.mjs pnpm-lock.yaml
git diff --cached --check
git commit -m "feat: package tianwen runtime profile"
```

Do not stage `scripts/verify-dsh-profile.mjs` if no change was needed.

---

### Task 5: Run the whole Phase 1 gate, review, document, and push

**Files:**

- Create: `docs/operations/tianwen-on-dsh-migration-phase-1-handoff.md`

**Interfaces:**

- Consumes: Tasks 1–4 commits and all existing probe/Python tests.
- Produces: canonical Phase 1 evidence, final remote SHA, and a clear
  merge-or-hold recommendation for the architecture controller.

- [ ] **Step 1: Verify exact changed scope**

Run:

```powershell
git diff --name-status 1eef994a82c4ff39de311d5c2b61dff92bf94162..HEAD
git diff --check 1eef994a82c4ff39de311d5c2b61dff92bf94162..HEAD
git status --porcelain=v1
```

Expected: only the two new packages, four migration tests, necessary
`vitest.config.ts`/`pnpm-lock.yaml`/narrow profile verifier changes, and no
uncommitted files.

- [ ] **Step 2: Run final gates strictly serially**

Set D-drive environment once:

```powershell
$env:COREPACK_HOME='D:\DevData\corepack-home'
$env:PNPM_HOME='D:\DevData\pnpm-home'
$env:PNPM_STORE_DIR='D:\DevData\pnpm-store'
$env:PNPM_CONFIG_VIRTUAL_STORE_DIR='D:\DevData\tianwen-dsh-migration-phase-1\virtual-store-final'
$env:NPM_CONFIG_CACHE='D:\DevData\npm-cache'
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-dsh-probe'
$env:TIANWEN_DSH_PROBE_PYTHON='D:\DevData\tianwen-dsh-probe\venv-task-6\Scripts\python.exe'
$env:TEMP='D:\DevData\tianwen-dsh-migration-phase-1\temp'
$env:TMP=$env:TEMP
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
$env:UV_OFFLINE='1'
```

Run each command only after the previous one exits:

```powershell
pnpm install --offline --frozen-lockfile --trust-lockfile
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm run typecheck
pnpm exec vitest run
$env:TIANWEN_RUN_DSH_MIGRATION_PROFILE='1'
pnpm exec vitest run tests/dsh-migration/runtime-profile.spec.ts
Remove-Item Env:\TIANWEN_RUN_DSH_MIGRATION_PROFILE
$env:TIANWEN_RUN_DSH_SANDBOX='1'
pnpm exec vitest run tests/dsh-probe/sandbox.e2e.spec.ts
Remove-Item Env:\TIANWEN_RUN_DSH_SANDBOX
uv run pytest tests/alpha/test_task_packages.py -q
uv run pytest -q
uv run ruff check .
git diff --check 1eef994a82c4ff39de311d5c2b61dff92bf94162..HEAD
git status --porcelain=v1
```

Expected:

- offline install downloads 0 packages;
- closure is 187 exact rc.6 packages and 15 public surfaces;
- private import violations are 0;
- all Node tests pass, with only documented default/sandbox skips;
- explicit sandbox reports read-only denied, workspace-write allowed,
  `enforcement=partial`, outside/sibling `not-proven`;
- Python A1 and full pytest pass with only the four already planned skips;
- Ruff, diff check and status are clean.

- [ ] **Step 3: Run one fresh whole-phase review**

The reviewer receives:

- design spec;
- this plan;
- base `1eef994...`;
- all Task 1–4 handoff/review evidence;
- exact final gate outputs.

The reviewer must explicitly decide:

1. whether the Runtime is only a thin composition seam;
2. whether Profile uses only public rc.6 surfaces;
3. whether Session/Evidence recovery is real and minimal;
4. whether Python A1 and Cordis Plugin governance remain honestly separate;
5. whether unapproved/broken candidates are blocked correctly;
6. whether restart ignores old Dynamic IDs;
7. whether Python authority and Windows partial-sandbox wording remain intact.

If Critical/Important findings exist, allow one cross-task repair wave with
focused RED/GREEN and one narrow re-review. If any remains, stop and hand off
as blocked; do not push a completion claim.

- [ ] **Step 4: Write the canonical handoff**

Create `docs/operations/tianwen-on-dsh-migration-phase-1-handoff.md` with:

- status `COMPLETE`, `BLOCKED`, or `LIMITED`;
- exact base, local HEAD, remote branch and remote SHA;
- commits and exact changed files;
- Task 1–4 behavior evidence;
- explicit statement that A1 receipt is not bound to Cordis Plugin Artifact;
- Node/Python/Ruff/sandbox gate results;
- review counts and repair wave count;
- residual risks: rc.6 Developer Preview, fixed offline Profile install debt,
  trusted same-process plugin model, Windows partial sandbox, A1-only bridge,
  JSONL probe ledger;
- forbidden effects counts;
- recommendation: merge Phase 1, hold it, or repair it;
- deferred product decision: first unified learning object is `repo_task` or
  `cordis_plugin`, with `repo_task` still recommended.

- [ ] **Step 5: Commit documentation and verify once more**

```powershell
git add -- docs/operations/tianwen-on-dsh-migration-phase-1-handoff.md
git diff --cached --check
git commit -m "docs: hand off tianwen dsh migration phase one"
git status --porcelain=v1
```

Expected: clean.

- [ ] **Step 6: Push the independent migration branch**

Verify the remote branch is absent or points to the expected previous Task
commit, then push normally:

```powershell
git -c http.proxy=http://127.0.0.1:7897 ls-remote origin refs/heads/codex/tianwen-dsh-migration-phase-1
git -c http.proxy=http://127.0.0.1:7897 push origin HEAD:refs/heads/codex/tianwen-dsh-migration-phase-1
git -c http.proxy=http://127.0.0.1:7897 ls-remote origin refs/heads/codex/tianwen-dsh-migration-phase-1
```

Expected: fresh `ls-remote` SHA exactly equals local `git rev-parse HEAD`.
Never force-push, merge, rebase, or modify `main` from the implementation
session.

- [ ] **Step 7: Send the structured handoff to the architecture controller**

Report:

- completion state;
- branch/local/remote exact SHA;
- task commits;
- RED/GREEN and review evidence;
- final gate counts;
- open risks or decisions;
- confirmation that Alpha Task 10, paid models, live web and real Docker were
  not started.

The implementation session stops here. The architecture controller decides
whether to merge, repair, or start a separately designed Phase 2.
