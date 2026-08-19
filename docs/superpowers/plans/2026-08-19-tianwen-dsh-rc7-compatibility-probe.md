# Tianwen DSH rc.7 Compatibility Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不升级产品依赖、不迁移 Tianwen 功能的前提下，验证 exact DSH rc.7 是否满足下一阶段产品复用所需的发布闭包、公开 API、Windows/headless/Profile、执行与非干扰合同，并产出明确的升级决策。

**Architecture:** 在独立 Git worktree 中提交最小 probe fixture，但把依赖安装、Session、Profile、缓存和结果文件全部放到 `D:\DevData`。fixture 只使用 DSH package root exports、Node `node:test` 和现有 Tianwen Evidence 构建产物；gate 按承重与可选复用分层判定，绝不在 probe 内修 DSH 或建立兼容框架。

**Tech Stack:** Node.js `>=22.19.0 <23`、pnpm `11.20.0`、TypeScript `6.0.3`、tsx `4.22.4`、DSH `0.1.0-rc.7`、PowerShell、Git。

## Global Constraints

- DSH 是唯一正式产品 Agent Runtime；Python Alpha 只读冻结为实验室，不参与本探针。
- Upstream 源码权威固定为 `deepseek-ai/deepseek-harness@99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，根版本固定为 `0.1.0-rc.7`。
- 本探针只验证 rc.7，不修改根 `package.json`、根 `pnpm-lock.yaml` 或 `packages/*/package.json`，不产生产品 dependency bump。
- 所有 DSH import 必须来自公开 package root/subpath export；禁止 `@deepseek-ai/*/src/*`、相对穿透或 private import。
- 依赖 store、virtual store、Profile、Session、Skill fixture、结果和临时数据只放 `D:\DevData\tianwen-dsh-rc7-compatibility-probe` 或 `D:\DevData` 共享 cache；不得改写 `$HOME`，不得在 C 盘新增依赖或大数据。
- 运行前绑定、真实副作用前授权、Session→Evidence、Run 之间 Learning/Promotion 是仅有四个 Tianwen/DSH seam；当前 Run 不热换版本。
- Learning 默认 `BACKGROUND`/`DEFERRED`；本探针不扩展 Learning Intake，也不进入 Candidate、Evaluation、Shadow、Promotion 或 Rollback。
- 不运行 Docker、Provider、付费模型、网络搜索或真实用户数据；模型边界只使用确定性本地 adapter。
- 不修改、提交、清理或运行 `D:\Guo\zuochong\AGi` Alpha dirty worktree；不合并 `main`。
- `LOAD_BEARING` gates 是：npm/package closure 与原生 headless/Profile、Agent/Goal/Session resume、Session Query、Skill provider/catalog/loader、Tianwen Evidence 只读投影与 off/on 非干扰、effect 前授权/拒绝。任一项 `FAIL`，最终不得判为 `UPGRADE_CANDIDATE`。
- `OPTIONAL_REUSE` gates 是：Jobs、Workflow、Message Feedback 等当前非承重扩展。单项失败只把该项标为 `DEFER`/`NOT_REUSE_YET`，不得单独否定整个 rc.7 升级候选。
- closure/install/Profile 失败且后续无法运行时，技术性停止并把受影响 gate 记为 `BLOCKED`；单个语义 gate 失败时，不 patch DSH、不加 private import、不写兼容 framework、不降低断言，但继续执行与其独立且保持零 Provider/Docker/付费/真实副作用的探针。最终报告逐 gate 使用 `PASS`/`FAIL`/`BLOCKED`/`DEFER`，并按分层说明决策原因。
- DSH Research Preview 发布不进入本 probe。
- 比例化安全：本地临时文件只在显式 D 盘 probe root 内；不做宽泛删除、Docker prune、新审批层或推测性恢复框架。

---

## Execution Preflight

- [x] 使用 `superpowers:using-git-worktrees`，从已批准 docs 分支建立唯一实现 worktree；不要在 docs worktree 或 main 上执行：

  ```powershell
  git worktree add -b codex/tianwen-dsh-rc7-compatibility-probe D:\DevData\tianwen-worktrees\tianwen-dsh-rc7-compatibility-probe codex/tianwen-runtime-boundary-reset-design
  git -C D:\DevData\tianwen-worktrees\tianwen-dsh-rc7-compatibility-probe status --short --branch
  ```

  Expected: 新分支只继承已批准 spec/audit/plan，工作树 clean；若分支或路径已存在，先只读确认其身份，不删除或复用不明内容。

### Task 1: 锁定 rc.7 发布闭包与原生 headless/Profile

**Files:**
- Create: `tests/dsh-rc7-probe/fixture/package.json`
- Create: `tests/dsh-rc7-probe/fixture/tsconfig.json`
- Create: `tests/dsh-rc7-probe/fixture/test/closure-profile.test.ts`
- Create: `tests/dsh-rc7-probe/fixture/pnpm-lock.yaml`（由 D 盘隔离安装生成后复制回 fixture）
- Modify: `scripts/check-dsh-install.mjs:30`（只把 `tests/dsh-rc7-probe` 加入现有 private-import scan roots）

**Interfaces:**
- Consumes: official commit `99f6f02...`, npm package `@deepseek-ai/dsh@0.1.0-rc.7`, existing `targetExistsInsidePackage(packageRoot, target)` semantics.
- Produces: exact rc.7 frozen lockfile、所有已安装 DSH 包版本集合、公开 root export/CLI target 断言、D 盘 headless Profile dump。

- [x] **Step 1: 创建隔离 fixture manifest；不要改根依赖**

  先锁定已审计的官方源码与发布 metadata，输出只写 D 盘：

  ```powershell
  $probeRoot = 'D:\DevData\tianwen-dsh-rc7-compatibility-probe\99f6f02'
  if (Test-Path -LiteralPath $probeRoot) { throw "probe root already exists: $probeRoot" }
  New-Item -ItemType Directory -Path $probeRoot | Out-Null
  $upstream = 'D:\DevData\tianwen-research\deepseek-harness-99f6f02'
  if ((git -C $upstream remote get-url origin).Trim() -ne 'https://github.com/deepseek-ai/deepseek-harness.git') { throw 'unexpected upstream remote' }
  if ((git -C $upstream rev-parse HEAD).Trim() -ne '99f6f02fecdb7dff40c3fbc9470f5907c29f74ca') { throw 'unexpected upstream HEAD' }
  if (git -C $upstream status --porcelain) { throw 'upstream evidence clone is dirty' }
  node -e "const p=require(process.argv[1]);if(p.version!=='0.1.0-rc.7')process.exit(1)" "$upstream\package.json"
  pnpm view @deepseek-ai/dsh@0.1.0-rc.7 version dist.integrity --json > (Join-Path $probeRoot 'npm-metadata.json')
  $npm = Get-Content (Join-Path $probeRoot 'npm-metadata.json') -Raw | ConvertFrom-Json
  if ($npm.version -ne '0.1.0-rc.7' -or [string]::IsNullOrWhiteSpace($npm.dist.integrity)) { throw 'invalid rc.7 npm metadata' }
  ```

  Expected: remote 恰为 `https://github.com/deepseek-ai/deepseek-harness.git`，HEAD 恰为 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，version 恰为 rc.7，`dist.integrity` 非空；身份或包元数据不一致时把 closure 标为 `FAIL`，安装/fixture 无法继续时将下游标为 `BLOCKED` 并技术性停止。

  `dependencies` 精确固定以下公共包为 `0.1.0-rc.7`：

  ```json
  {
    "@deepseek-ai/cordis": "4.0.1",
    "@deepseek-ai/dsh": "0.1.0-rc.7",
    "@deepseek-ai/dsh-agent": "0.1.0-rc.7",
    "@deepseek-ai/dsh-agent-loop": "0.1.0-rc.7",
    "@deepseek-ai/dsh-agent-loop-testkit": "0.1.0-rc.7",
    "@deepseek-ai/dsh-goal": "0.1.0-rc.7",
    "@deepseek-ai/dsh-goal-round-driver": "0.1.0-rc.7",
    "@deepseek-ai/dsh-headless": "0.1.0-rc.7",
    "@deepseek-ai/dsh-jobs": "0.1.0-rc.7",
    "@deepseek-ai/dsh-jobs-local": "0.1.0-rc.7",
    "@deepseek-ai/dsh-llm": "0.1.0-rc.7",
    "@deepseek-ai/dsh-message-feedback": "0.1.0-rc.7",
    "@deepseek-ai/dsh-permission-presets": "0.1.0-rc.7",
    "@deepseek-ai/dsh-session": "0.1.0-rc.7",
    "@deepseek-ai/dsh-session-persistence-jsonl": "0.1.0-rc.7",
    "@deepseek-ai/dsh-session-query": "0.1.0-rc.7",
    "@deepseek-ai/dsh-session-query-sqlite": "0.1.0-rc.7",
    "@deepseek-ai/dsh-skill": "0.1.0-rc.7",
    "@deepseek-ai/dsh-skill-filesystem": "0.1.0-rc.7",
    "@deepseek-ai/dsh-storage": "0.1.0-rc.7",
    "@deepseek-ai/dsh-storage-domain": "0.1.0-rc.7",
    "@deepseek-ai/dsh-storage-json": "0.1.0-rc.7",
    "@deepseek-ai/dsh-subagent": "0.1.0-rc.7",
    "@deepseek-ai/dsh-tool-skill": "0.1.0-rc.7",
    "@deepseek-ai/dsh-tools": "0.1.0-rc.7",
    "@deepseek-ai/dsh-user-approval": "0.1.0-rc.7",
    "@deepseek-ai/dsh-workflow": "0.1.0-rc.7",
    "@deepseek-ai/dsh-workflow-worker-thread": "0.1.0-rc.7"
  }
  ```

  `devDependencies` 只含 `@types/node@22.20.0`、`tsx@4.22.4`、`typescript@6.0.3`。`tsconfig.json` 使用 `module/moduleResolution: NodeNext`、`target: ES2024`、`strict: true`、`noEmit: true`。

- [x] **Step 2: 写 closure/public-surface 测试并证明它有判别力**

  测试从当前 fixture root 执行 `pnpm list --json --depth Infinity`，递归收集所有 `@deepseek-ai/dsh*`，并断言版本集合只有 rc.7；对直接 library 断言 `exports["."].types/default` 指向包内真实文件，对 `@deepseek-ai/dsh` 断言 `bin.dsh` 存在。核心断言为：

  ```ts
  assert.deepEqual(new Set(installed.map(item => item.version)), new Set(['0.1.0-rc.7']))
  assert.equal(surface.rootExport, true)
  assert.equal(surface.typesTarget && surface.defaultTarget, true)
  assert.equal(cli.cliTarget, true)
  ```

  先临时把期望版本改成 `0.1.0-rc.8`，运行单测并确认因版本集合失败；立即还原。若原合同已直接通过，不为制造 RED 修改任何产品代码。

- [x] **Step 3: 在 D 盘生成并 frozen replay lockfile**

  ```powershell
  $first = Join-Path $probeRoot 'install-first'
  $replay = Join-Path $probeRoot 'install-frozen'
  New-Item -ItemType Directory -Path $first,$replay | Out-Null
  $env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
  $env:PNPM_CONFIG_CACHE_DIR = 'D:\DevData\pnpm-cache'
  $env:NPM_CONFIG_CACHE = 'D:\DevData\npm-cache'
  $env:TEMP = Join-Path $probeRoot 'temp'
  $env:TMP = $env:TEMP
  New-Item -ItemType Directory -Path $env:TEMP | Out-Null
  Copy-Item tests/dsh-rc7-probe/fixture/* $first -Recurse
  pnpm --dir $first install --store-dir D:\DevData\pnpm-store --virtual-store-dir (Join-Path $first '.pnpm')
  Copy-Item (Join-Path $first 'pnpm-lock.yaml') tests/dsh-rc7-probe/fixture/pnpm-lock.yaml
  Copy-Item tests/dsh-rc7-probe/fixture/* $replay -Recurse
  pnpm --dir $replay install --frozen-lockfile --store-dir D:\DevData\pnpm-store --virtual-store-dir (Join-Path $replay '.pnpm')
  ```

  Expected: 两次安装都 exit 0，根 `package.json`/`pnpm-lock.yaml` 无 diff；所有新增大文件只在 D 盘。

- [x] **Step 4: 运行 closure、类型与原生 headless/Profile smoke**

  ```powershell
  pnpm --dir $replay exec tsc -p tsconfig.json
  pnpm --dir $replay exec tsx --test test/closure-profile.test.ts
  $env:DSH_HOME = Join-Path $probeRoot 'dsh-home'
  pnpm --dir $replay exec dsh --profile headless --dump-config > (Join-Path $probeRoot 'headless-profile.yml')
  rg -n "@deepseek-ai/dsh-headless(/startup)?" (Join-Path $probeRoot 'headless-profile.yml')
  ```

  Expected: public packages import、CLI、built headless bundle 和 Profile composition 全部可用；命令不启动模型或监听端口。失败即 `LOAD_BEARING: FAIL`，最终不得判为 `UPGRADE_CANDIDATE`；仅在失败使 fixture 无法继续运行时技术性停止并把下游记为 `BLOCKED`。

- [x] **Step 5: 提交独立 closure/Profile 交付**

  ```powershell
  git add tests/dsh-rc7-probe/fixture scripts/check-dsh-install.mjs
  git commit -m "test(dsh): lock rc7 compatibility fixture"
  ```

### Task 2: 验证 Agent/Goal/Session resume 与 Session Query

**Files:**
- Create: `tests/dsh-rc7-probe/fixture/test/core-runtime.test.ts`

**Interfaces:**
- Consumes: public `Context`, `AgentLoop`, `mountAgentLoopTestDependencies`, `GoalService`, `JsonlSessionPersistence`, `SqliteSessionQueryEngine`, `SessionId`.
- Produces: `runCoreScenario(): Promise<CoreReceipt>`，其中 `CoreReceipt` 只含 final text、请求次数、Goal 语义状态、Session event types 和 query replay event types。

- [x] **Step 1: 用现有公开 seam 写最小确定性测试**

  直接移植 `packages/tianwen-dsh-compat/src/scripted-adapter.ts` 的测试用 `ScriptedAdapter` 形状，以及 `tests/dsh-probe/goal-recovery.spec.ts` 的 create→flush→dispose→resume 顺序；不要 import `@tianwen/dsh-compat`。rc.7 组合必须只用 package root：

  ```ts
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: sessionRoot, compression: 'none' })
  await ctx.plugin(GoalService, {})
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SqliteSessionQueryEngine, { path: ':memory:', openAt: 'never' })
  ```

  首个 Context 创建 Agent 与 Goal，提交一个本地 scripted response，flush 后销毁；第二个 Context resume 同一 Session。断言 resume 前模型请求为 0、Goal `activation === 'disarmed'`，且 `ctx.sessionQuery.readSession(id)` / `listEvents(id)` 与恢复 Session 的事件类型一致。

- [x] **Step 2: 证明测试能识别行为漂移**

  临时把预期 final text 改成 `RC7_WRONG_FINAL`，运行该文件并确认断言失败；还原后再运行。若真实失败来自 public API 或 resume/query 行为，将对应 `LOAD_BEARING` gate 标为 `FAIL`，不新增 adapter，并继续其他可独立运行的探针。

- [x] **Step 3: 运行 Windows D 盘状态 smoke**

  ```powershell
  $env:TIANWEN_RC7_STATE_ROOT = 'D:\DevData\tianwen-dsh-rc7-compatibility-probe\99f6f02\state'
  pnpm --dir $replay exec tsx --test test/core-runtime.test.ts
  ```

  Expected: 一个确定性请求完成；durable JSONL 位于该 D 盘根；resume 不自动请求模型；Query 冷读不恢复 Agent。

- [x] **Step 4: 提交核心 Runtime 证据**

  ```powershell
  git add tests/dsh-rc7-probe/fixture/test/core-runtime.test.ts
  git commit -m "test(dsh): probe rc7 core runtime contracts"
  ```

### Task 3: 验证 rc.7 扩大的 REUSE_DSH 公共面

**Files:**
- Create: `tests/dsh-rc7-probe/fixture/test/reuse-surface.test.ts`

**Interfaces:**
- Consumes: `ctx.skills.list/get`, `ctx.jobs.start/wait/read`, `ctx.workflowEngine.start`, `ctx.messageFeedback.put/list`, public Approval/permission package exports.
- Produces: Skill、Jobs、Workflow、Feedback 四个独立 `node:test` case；Skill 是 `LOAD_BEARING`，其余三项是 `OPTIONAL_REUSE`，任一失败都能单独定位 package family。

- [x] **Step 1: 写 Skill provider/catalog/loader smoke**

  在 `$env:TIANWEN_RC7_STATE_ROOT\skills\probe-skill\SKILL.md` 写固定 frontmatter/body；挂载 `SkillRegistry` 与 `SkillFilesystem`：

  ```ts
  await ctx.plugin(SkillRegistry, {})
  await ctx.plugin(SkillFilesystem, {
    includeDefaultRoots: false, customSkillDirs: [skillsRoot], watch: false,
  })
  assert.deepEqual((await ctx.skills.list({ cwd: skillsRoot })).map(x => x.name), ['probe-skill'])
  assert.match((await ctx.skills.get('probe-skill', { cwd: skillsRoot }))!.content, /RC7_SKILL_BODY/u)
  ```

  同时从 `@deepseek-ai/dsh-tool-skill` root import 默认插件，证明 model-facing loader 是公开包；本 probe 不复制其 catalog/tool 实现。

- [x] **Step 2: 写真实 Local Jobs 与 worker-thread Workflow smoke**

  Jobs 使用一个立即完成的本地 hook，断言 `start → wait → read`：

  ```ts
  const id = ctx.jobs.start({
    kind: 'bash', label: 'rc7-probe',
    run: () => ({ cancel() {}, done: Promise.resolve({ status: 'completed', output: 'JOB_OK' }), readOutput: () => 'JOB_OK' }),
  })
  assert.equal((await ctx.jobs.wait(id, 1_000)).status, 'completed')
  assert.equal(ctx.jobs.read(id).text, 'JOB_OK')
  ```

  Workflow 复用 upstream `source-worker.compat.spec.ts` 的最小公开组合：挂载 `SubagentRuntime`，注册不会被调用的 `spawn` fake provider，再挂载 `WorkerThreadWorkflowEngine`；执行 `script: 'return 6 * 7'`，断言 `{ value: 42, stopReason: 'completed', agentsStarted: 0 }`，最后 `run.dispose()`。

- [x] **Step 3: 写 Message Feedback 与 Approval surface smoke**

  使用真实 `Storage` + `StorageJson` + `StorageDomain`、JSONL Session persistence 和一个已 flush 的 deterministic assistant message；挂载 `MessageFeedbackService({ maxNoteBytes: 64 })`，调用 `put({ rating: 'positive', ifVersion: null })` 后 `list`，断言同一 message id 只出现一项。Approval 的执行期行为放在 Task 4；本任务只确认 `ApprovalService`、`PermissionPresetService` 的 root export 可加载，避免为了 smoke 复制 shell/permission composition。

- [x] **Step 4: 做判别性变异并运行分项 smoke**

  临时把 Skill body 期望改为 `WRONG_BODY` 或 Workflow 期望改为 `41`，确认对应 case 单独失败后还原：

  ```powershell
  pnpm --dir $replay exec tsx --test test/reuse-surface.test.ts
  ```

  Expected: 四个 case 分项记录且无 Provider、网络、Docker、用户数据。Skill 失败记 `LOAD_BEARING: FAIL`，最终不得判为 `UPGRADE_CANDIDATE`；Jobs、Workflow 或 Message Feedback 单项失败只记 `DEFER`/`NOT_REUSE_YET`。不得换 private import，独立 case 继续运行。

- [x] **Step 5: 提交扩大复用面的证据**

  ```powershell
  git add tests/dsh-rc7-probe/fixture/test/reuse-surface.test.ts
  git commit -m "test(dsh): probe rc7 reusable services"
  ```

### Task 4: 验证 Evidence 只读投影、off/on 非干扰与 effect 前拒绝

**Files:**
- Create: `tests/dsh-rc7-probe/fixture/test/tianwen-boundary.test.ts`
- Test: `packages/tianwen-evidence/src/projector.ts`

**Interfaces:**
- Consumes: `projectEvidence(sessionId, events)` 的当前构建产物、rc.7 `SessionQueryEngine.readSession()`, DSH `tools/pre-execute` 与 `ApprovalService({ policy: 'never' })`。
- Produces: `runScenario('off' | 'on'): Promise<{ execution: ExecutionReceipt; evidence?: readonly EvidenceRecord[] }>`；receipt 是本测试内的显式字段集合，不建立通用 normalizer。

- [x] **Step 1: 构造同一 deterministic task 的显式语义 receipt**

  两次运行冻结同一用户文本、adapter script、工具 schema、固定 tool call id 与权限。工具只在各自 D 盘临时目录写 `artifact.txt`。receipt 只抽取以下语义，不比较 ID、时间和绝对路径：

  ```ts
  const execution = {
    userText,
    modelVisible: adapter.requests.map(r => ({
      messages: r.messages.map(m => ({ role: m.role, sourceKind: m.source.kind, content: m.content })),
      tools: r.tools?.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })),
    })),
    toolFacts, // exact callId/name/arguments/result/error only
    actionLog, artifactText, finalText,
    goal: { objective: goal.objective, phase: goal.phase, roundsStarted: goal.roundsStarted, activation: goal.activation },
  }
  ```

  `on` 只在 DSH 已完成后调用 `ctx.sessionQuery.readSession()`，再把其 events 交给 Tianwen `projectEvidence`；不得挂载 `@tianwen/runtime` 或 `@tianwen/evolution`。

- [x] **Step 2: 证明 off/on 断言有判别力后验证等价**

  先临时让 `on` 使用不同用户文本，确认 `assert.deepEqual(on.execution, off.execution)` 失败；还原后断言 execution 完全相等、`on.evidence` 恰有一条完整工具 Evidence、off 无治理记录。再复制一条 `tool/call`，保留相同 callId 但赋予不同 seq 后交给 projector，断言投影独立失败但先前成功的 `execution` receipt 不变。

- [x] **Step 3: 验证授权失败只在真实 effect 前阻断**

  注册 `tools/pre-execute` 返回 `{ kind: 'ask', reason: 'rc7 probe effect' }`，挂载 `ApprovalService({ policy: 'never' })`，让 adapter 调用固定 `effect_probe` 后读取 tool result 并给出诚实 final。断言：

  ```ts
  assert.equal(effectExecutions, 0)
  assert.equal(nextRequestSawToolError, true)
  assert.equal(finalText, 'EFFECT_DENIED_FINAL')
  assert.deepEqual(session.events.filter(e => e.type.startsWith('approval/')).map(e => e.type), ['approval/asked', 'approval/decided'])
  ```

  拒绝不得伪装成任务质量、Learning 或 Promotion 结果；测试不创建这些状态。

- [x] **Step 4: 构建现有 Evidence 并运行边界测试**

  ```powershell
  pnpm run typecheck
  $env:TIANWEN_EVIDENCE_ENTRY = (Resolve-Path 'packages/tianwen-evidence/dist/index.js').Path
  pnpm --dir $replay exec tsc -p tsconfig.json
  pnpm --dir $replay exec tsx --test test/tianwen-boundary.test.ts
  ```

  Expected: Evidence 可消费 rc.7 Session Query 的只读快照；off/on execution receipt 字节等价；拒绝发生在 effect counter 增加前。对应项失败即 `LOAD_BEARING: FAIL`，最终不得判为 `UPGRADE_CANDIDATE`；不改 projector 签名或 DSH，继续其他可独立运行的探针。

- [x] **Step 5: 提交边界合同证据**

  ```powershell
  git add tests/dsh-rc7-probe/fixture/test/tianwen-boundary.test.ts
  git commit -m "test(tianwen): probe rc7 non-interference boundary"
  ```

### Task 5: 形成升级决策、独立复审并停在用户门

**Files:**
- Create: `docs/research/2026-08-19-dsh-rc7-compatibility-probe-result.md`

**Interfaces:**
- Consumes: Tasks 1–4 的 frozen lock、TAP/TS 输出、Profile dump、Session/Evidence receipts 和失败记录。
- Produces: 逐 gate 的层级与 `PASS`/`FAIL`/`BLOCKED`/`DEFER` 状态、唯一决策 `UPGRADE_CANDIDATE` 或 `NOT_UPGRADE`，以及逐包 `KEEP` / `DELETE` / `THIN_ADAPT` / `NOT_REUSE_YET` 表；不产生升级 commit。

- [x] **Step 1: 写事实报告与决策表**

  报告固定记录 exact upstream SHA、npm integrity、Node/pnpm 版本、D 盘根、每个命令/exit code、Provider/Docker/paid 均为 0。逐 gate 列出 `LOAD_BEARING`/`OPTIONAL_REUSE` 与 `PASS`/`FAIL`/`BLOCKED`/`DEFER`；逐项判断 `@tianwen/dsh-compat`、`runtime-bundle`、`profile-host`、`dsh-host`、`@tianwen/evidence`、`@tianwen/runtime`、`@tianwen/evolution/runtime-binding` 是保留、删除、薄适配还是 `NOT_REUSE_YET`。没有证据的项写 `DEFER`，不得扩成迁移设计。

- [x] **Step 2: 运行 fresh gates**

  ```powershell
  pnpm --dir $replay install --offline --frozen-lockfile --store-dir D:\DevData\pnpm-store --virtual-store-dir (Join-Path $replay '.pnpm')
  pnpm --dir $replay exec tsc -p tsconfig.json
  pnpm --dir $replay exec tsx --test test/*.test.ts
  pnpm run check:no-private-dsh-imports
  pnpm run check
  git diff --exit-code -- package.json pnpm-lock.yaml packages/*/package.json
  git diff --check
  ```

  Expected: 只有全部 `LOAD_BEARING` gates 为 `PASS` 才允许报告 `UPGRADE_CANDIDATE`；其中任一 `FAIL` 或 `BLOCKED` 都必须报告 `NOT_UPGRADE` 并写明具体承重原因。`OPTIONAL_REUSE` 失败只标该项 `DEFER`/`NOT_REUSE_YET`。本切片无 Python 改动，Python 回归明确为不适用，不启动任何 Python/Alpha 命令。

  Result: rc.7 的 `LOAD_BEARING` 与 `OPTIONAL_REUSE` 探针全部 `PASS`；但最终非 Python/Alpha 产品回归中，既有 rc.6 `runtime-profile` 默认 Profile case 在 120 秒超时，单文件串行复现仍失败。因此阶段决策为 `NOT_UPGRADE`，详见结果报告；未修改断言、DSH 或产品代码。

- [x] **Step 3: 做三项独立只读复审**

  Correctness review 核对命令证据、public imports、Windows/Profile、resume/query 与错误分支；architecture-fitness review 回答模型看到了什么、工具结果是否返回、为何结束、Tianwen 如何只读解释，以及是否机械造字段/布尔/硬次数；Ponytail/比例化安全 review 检查是否可删除 runner、adapter DSL、event/normalizer framework、额外审批或宽泛清理。所有承重 finding 只允许修 probe test/report；若需要修 DSH 或产品代码，决策改为 `NOT_UPGRADE`。

- [x] **Step 4: 提交报告并普通推送 probe 分支**

  ```powershell
  git add docs/research/2026-08-19-dsh-rc7-compatibility-probe-result.md
  git commit -m "docs: record DSH rc7 compatibility decision"
  git status --short --branch
  git push origin codex/tianwen-dsh-rc7-compatibility-probe
  git ls-remote origin refs/heads/codex/tianwen-dsh-rc7-compatibility-probe
  ```

  Expected: local HEAD、origin tracking 与 GitHub branch SHA 一致；`main` 未合并，Alpha worktree 状态未变化。停在用户决策门，不执行 dependency bump、迁移或后续 Goal/Learning/Candidate 计划。
