# Tianwen DeepSeek V4 Pro 真实 Goal Round 最小验收设计

**日期：** 2026-08-16

**状态：** 按用户“默认采用推荐方案持续推进”的长期授权批准进入书面固化；真实调用仍需绑定本阶段独立的数值预算

**实施基线：**
`codex/tianwen-live-model-smoke@53ae351509ab1209a1f0f396e135703580b3e39b`

## 1. 结论

本阶段不重新设计天问，也不建设通用任务平台。它只补上最近一条明确的证据缺口：

```text
现有 create 创建一个固定顶层 Goal
→ 现有 list/status 核对 Goal 和 Session
→ 现有模型配置选择 DeepSeek V4 Pro
→ 用户显式 resume 一轮（严格 live-smoke 模式）
→ 真实模型调用一个固定、无副作用的 Tianwen 工具
→ 模型通过 Goal 工具完成同一个 Goal
→ Session / Goal / Evidence / 脱敏回执共同验收
→ 立即切回 offline
```

这证明 Tianwen 已安装产品链可以完成一次真实的
`Goal → AgentLoop → Model → Tool → Goal completion → Evidence` 回合。
它仍不是完整持续学习闭环、模型质量基准、后台自主循环或 Runtime cutover。

成功标准采用严格版本：模型必须实际调用现有
`tianwen_smoke_action`，随后使用 `update_goal` 完成目标，并返回固定结束标记；
只输出一段正确文字不算通过。

## 2. 与既有设计的关系

本设计继承并组合已经批准、实现和复审通过的合同：

- Phase 2 已证明正式 Profile、DSH headless、Goal、Tool、Session 和 Evidence 的离线链；
- `tianwen create` 把 Goal 创建与运行分开，保持顶层 Goal 的用户主权；
- `tianwen resume` 只在用户显式调用时花费一个 Goal round；
- `tianwen model use/status` 复用 DSH 模型选择和凭据引用，配置命令零模型请求；
- 单次 V4 Pro route smoke 已证明真实 provider、凭据、流式响应和 usage 翻译，
  但明确没有进入 AgentLoop、Goal、Session 或工具；
- Session JSONL 是单 Session 原始权威，Tianwen Evidence 是最小投影，
  Evolution Ledger/Champion 是跨版本治理权威。

本阶段不改变上述权威，也不把诊断回执升级成新的业务状态。

## 3. 方案比较

### 3.1 采用：现有 resume 的严格 opt-in live-smoke 模式

增加一个只对显式 resume 生效的固定开关：

```powershell
tianwen resume --goal GOAL_ID --data-dir ABSOLUTE_PATH --live-smoke --json
```

普通 `resume` 合同保持不变。`--live-smoke` 只接受本设计冻结的 Goal、模型、
工具面和预算，并在调用前失败关闭。

优点：继续复用 create/status/resume、Goal 主权、DSH AgentLoop 和正式 Session；
新增边界集中在一个窄 runner 模式，不复制 Agent 框架。

### 3.2 不采用：只写外部脚本调用普通 resume

普通 resume 当前会向模型展示 24 个工具，且没有本阶段需要的请求次数、单请求输出、
超时和 usage 验收。外部脚本只能事后观察，不能形成承重的运行合同。

### 3.3 不采用：先建设通用预算、权限或策略框架

完整预算服务、通用工具策略 DSL、计费系统和任意 provider 路由以后可能有价值，
但目前只有一个固定验收场景。现在建设会增加状态和抽象，违反 Ponytail/YAGNI。

### 3.4 不采用：新增一个绕过 create/resume 的一体化 Goal 命令

把 Goal 创建和运行重新合并，会削弱已经确认的用户主权边界，并复制现有 runner。
本阶段保持 `create` 与 `resume` 两次显式动作。

## 4. 固定 Goal 与调用入口

### 4.1 隔离数据根

正式验收只使用：

```text
D:\DevData\tianwen-live-goal-round\
├── data\
├── receipts\
├── temp\
└── test-data\
```

不得复用用户日常 Tianwen 数据，也不得把缓存、Profile、临时文件或回执写到 `C:`。
该路径是验收隔离和可清理边界，不冒充抵御同用户恶意进程的 OS 沙箱。

### 4.2 固定 Goal

Goal 必须通过已经安装的 `tianwen create` 创建，参数固定为：

```text
objective = Call tianwen_smoke_action exactly once. After it succeeds, mark this Goal complete with update_goal, then reply exactly TIANWEN_GOAL_ROUND_OK.
maxGoalRounds = 1
```

live-smoke preflight 只接受：

- 精确 objective；
- `phase=active`、`revision=1`、`roundsStarted=0`、`maxGoalRounds=1`；
- 一个由 create 产生、尚未运行模型的唯一 Session；
- Session 中没有 `request/header`、`step/start` 或既有 tool call；
- 精确安装的 DSH `0.1.0-rc.6` 和当前 Runtime Bundle/Profile；
- 当前模型选择精确为 `deepseek-official/deepseek-v4-pro`；
- DSH 只报告 `DEEPSEEK_API_KEY` 已配置，不读取或输出其值。

任一条件不满足，都必须在 Goal resume、模型请求和新持久化写入前失败。

## 5. 一轮运行策略

### 5.1 工具面

通过 DSH 公开的 agent-scoped `ctx.tools.restrict()`，模型可见且可执行的工具精确为：

1. `tianwen_smoke_action`：唯一业务工具，无参数、无网络、无文件写入，只返回固定值；
2. `update_goal`：Goal 控制工具，只允许模型完成当前 Goal。

`create_goal` 和其他文件、Shell、Web、子代理、计划、Skill、任务等工具都不可见、
不可执行。`update_goal` 是 Goal 生命周期控制，不算第二个业务 action。

验收要求 Session 中：

- `tianwen_smoke_action({})` 精确一次且结果成功；
- 它的 result 发生在 `update_goal` call 之前；
- `update_goal` 精确一次，目标是当前 Goal 的当前 revision，action 为 `complete`；
- 没有其他 tool call/result。

### 5.2 模型请求与时间

严格模式通过 DSH 公开 agent/request 和 agent/request-error 扩展点约束：

- provider/model 固定为 V4 Pro；
- reasoning effort 固定为 `off`；
- 每个模型请求 `maxTokens=64`；
- 精确允许 3 个模型请求：业务工具调用、Goal 完成调用、固定最终文本；
- 第 4 个请求在进入 provider 前拒绝；
- provider 或流式错误不自动重试，不 fallback；
- 整个 resume 的墙钟上限为 90 秒，超时后取消当前 Agent 活动并失败；
- Goal round 上限仍为 1。

如果模型把两个工具合并、顺序颠倒、跳过工具、返回其他最终文本或需要第 4 个请求，
本次验收失败且不重放。

### 5.3 token 与费用边界

离线 recording adapter 必须先捕获三个请求的完整 public `GenerateOptions`，证明：

- 只包含两个允许工具；
- 第一请求的固定 system/tool/message 输入和后续固定增量可重放；
- 每请求输出上限为 64；
- 三个请求的 usage 均被 Session 保存并能汇总。

正式验收采用以下上限：

- 请求数：3；
- 每请求最大输出：64 tokens；
- 三次 reported disjoint token 总和：32,768；
- 墙钟：90 秒；
- 自动重试：0；
- 推荐操作员费用上限：CNY 0.25。

真正调用前必须重新读取 DeepSeek 官方价格，并向用户集中确认
`32,768 tokens / CNY 0.25` 这一独立数值预算。用户本轮已经提前授权真实模型能力，
但在数值预算确认前仍不得发出请求。接受后的 token/费用超限会生成失败回执，
不会触发第二次尝试；这里沿用上一阶段的“固定输入 + provider 输出上限 + reported usage
验收”模式，不建设预付费或通用账单系统。

## 6. 成功结果与权威证据

一次成功必须同时满足：

- 命令 exit 0；
- 精确 1 个 Goal round、3 个模型请求、0 次重试；
- 最终 Goal `phase=complete`、`roundsStarted=1`、`activation=disarmed`；
- 最终文本精确匹配 `TIANWEN_GOAL_ROUND_OK`，回执只保存 `markerMatched=true`；
- Session 中固定 action 和 Goal 完成的 call/result 顺序正确；
- Tianwen Evidence 新增且只新增这两个完整工具事实；
- Evidence 不复制 objective、模型原文、工具原始参数或结果；
- Session 中三个请求都有合法 usage，汇总未超预算；
- Evolution Ledger、Champion 和 Artifact 状态字节不变；
- 没有 Web、Docker、文件写工具、Shell、子代理或未知插件外部效果。

Session JSONL 与 Goal replay 是运行权威；Evidence 是最小可重放投影；
live-smoke receipt 只是本次验收记录。

## 7. 脱敏回执

严格模式输出 `tianwen.goal-live-smoke.v1` JSON success/failure receipt，至少记录：

- timestamp、status 和稳定 failure code；
- provider/model；
- 固定 limits；
- request count、retry count；
- reported disjoint token 汇总和按当次冻结价格计算的估算费用；
- Goal id、最终 revision/phase/roundsStarted；
- Session id、事件增量；
- 两个预期 Evidence 的 id、tool name 和 outcome；
- markerMatched；
- Evolution/Champion unchanged 断言。

回执不得包含：API key、环境变量值、header、原始 provider body、reasoning、
模型原文、完整 system prompt、Goal objective、工具原始参数/结果或任意用户文件。

控制器只把这条脱敏 JSON 原子写入：

```text
D:\DevData\tianwen-live-goal-round\receipts\deepseek-v4-pro-goal-round.json
```

并记录 SHA-256。失败回执保留为证据；不得把失败改写成成功，也不得自动重试。

## 8. 失败语义

- preflight 失败：零模型请求、零 Goal mutation、零新 Session 事件；
- resume 已被 DSH 接受后失败：保留真实 Goal/Session 历史，不伪造事务回滚；
- provider、usage、工具顺序、最终标记、token、费用或超时失败：输出脱敏失败回执；
- Goal 仍 active 时，进程退出前必须 disarm；后续是否重试属于新的用户授权；
- 无论成功或失败，本阶段都不再发第二次真实请求链；
- 最后始终用现有零请求 `model use --model offline` 切回离线，并由 fresh
  `model status` 确认。

## 9. 离线实现与证明顺序

实现必须先完成全部离线工作：

1. 给 CLI/runner 增加 opt-in live-smoke 模式，不改变普通 resume；
2. 用 recording/scripted adapter 取得真实 RED→GREEN，证明严格三请求顺序；
3. 证明 agent-scoped 工具面精确为两个公开工具；
4. 证明 maxTokens、reasoning off、请求上限、无 retry 和 90 秒取消；
5. 证明缺模型、缺凭据、错误 Goal、旧 Session、异常 usage、第四请求、工具偏差和
   timeout 都安全失败；
6. 证明 receipt 脱敏，Goal/Session/Evidence 可重放，Evolution/Champion 不变；
7. 从安装 tarball 在隔离 Profile 跑完整离线 E2E，主动拦截任何 fetch；
8. 串行通过 focused Node、默认 Node、installed E2E、Windows local sandbox、
   Python A1–A5、全量 Python、Ruff、closure、private-import、typecheck 和 diff；
9. 完成独立 correctness review 与 Ponytail review；
10. 只有以上全部通过，才进入一次真实调用门。

测试使用运行时生成的假凭据，只存在于子进程环境。测试、子代理和复审者不得读取
真实 API key，也不得调用真实 provider。

## 10. 一次真实调用流程

离线实现、门禁和复审通过后，主控按以下顺序执行：

1. 固定并安装最终 Runtime Bundle 到隔离数据根；
2. 检查当前用户环境只存在非空 key 引用，不读取或打印值；
3. 重新核对官方价格，向用户集中确认独立 token/费用数值预算；
4. 通过现有零请求命令选择 V4 Pro；
5. 通过现有 create 创建固定 Goal，并用 list/status 核对零模型请求；
6. 精确执行一次 `resume --live-smoke`；
7. 捕获并校验唯一脱敏回执；
8. 不论结果如何，切回 offline 并 fresh status；
9. 串行运行只需的最终窄门，不再次调用模型；
10. 写 canonical handoff、独立复审、普通推送阶段分支并核对远端 SHA。

“一次”指整条真实 Goal round 请求链只能启动一次，不因代码修复、回执字段修正、
复审意见或模型失败而重放。

## 11. 现实威胁模型

- 用户拥有的本地 Runtime、精确锁定且已审核的 DSH 和 Tianwen 插件是可信代码；
- 未审核、动态下载或用户指定插件不能进入同进程；
- 工具 restriction 约束模型可调用面，不声称抵御已攻陷宿主机或同用户恶意进程；
- 隔离 D 盘目录用于避免污染正式数据，不是强沙箱；
- 本任务无文件/Shell/Web 工具和第三方代码执行，不需要 Docker 或 microVM；
- Windows LocalSandbox 的 `partial` 分类保持不变，但本次固定 action 不依赖它。

复审意见必须结合这些实际边界判断，不为不能形成 OS 隔离的假设增加路径框架。

## 12. 明确不做

- 不新增自动 resume、daemon、scheduler、后台循环或第二个 Goal round；
- 不做任意 prompt、任意 tool allowlist、任意 provider 或通用预算配置；
- 不做桌面端、任务面板、watcher、数据库、队列或 RPC；
- 不做 Web/Search、真实 Docker、远程沙盒或 microVM；
- 不做 Candidate、Evaluation、Approval、Promotion 或 Champion 变更；
- 不把一次 smoke 宣称为持续学习闭环或模型能力基准；
- 不删除 Python Runtime，不扩展 A2–A5 bridge，不进行 Runtime cutover；
- 不升级 DSH，不 Fork，不导入私有源码；
- 不复用已经消耗的上一阶段付费授权。

## 13. 完成条件

本阶段只有同时满足以下条件才完成：

1. 新模式只在用户显式 `resume --live-smoke` 时生效；
2. 固定 Goal、模型、两个工具、一个 round、三个请求和预算全部在 provider 前后有证据；
3. 普通 create/list/status/resume/model 行为不变；
4. 离线安装态证明 request、tool、Goal、Session、Evidence 和失败回执；
5. Evolution/Champion 不变，Python/A1–A5 保留；
6. 所有串行门禁通过；
7. 独立复审无开放 Critical/Important，Ponytail 复审无承重过度设计；
8. 用户确认本阶段独立数值预算后，只执行一次真实 Goal round 请求链；
9. 无论结果如何都切回 offline，且不重复调用；
10. canonical handoff 和阶段分支普通推送到 GitHub，并核对精确远端 SHA。

阶段完成后，主控再根据真实结果决定进入完整持续学习闭环，还是先处理真实 Goal
round 暴露出的承重缺口；不会因为 smoke 通过就自动开始 UI。
