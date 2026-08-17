# Tianwen 真实 Goal 最小修复设计

**日期：** 2026-08-17

**状态：** 用户已批准阶段 A 的目标、范围、完成门和自主技术选择；本文固化根因与最小方案，不授权在离线门禁完成前调用付费模型

**实施基线：** `main@33008cd388e5cb1655aa9d5ade862daedbb7ed93`

## 1. 结论

真实 Goal 失败的根因不是模型没有选择 `update_goal`，也不是 authority 不够强。
第二次响应已经开始生成 `update_goal` 工具调用，但固定的 64-token 输出上限在调用
完成前截断了流。DSH 因此只持久化了未完成的 `tool-call-delta`，没有形成可执行的
`tool/call`，Goal 最终保持 active、1/1 round 已耗尽。

本阶段只把固定的每请求输出上限从 `64` 提高到 `128`，并增加一条离线回归测试，
精确重放“正确工具调用在 `max-tokens` 处被截断”的结构事实。其余 authority、工具面、
请求数、总 token、费用、顺序 guard、Session 事后验收和脱敏回执保持不变。

旧 Goal 不重放、不扩轮。真实复验只能使用全新创建、同 objective、`maxGoalRounds=1`
的固定 Goal。

## 2. 证据与根因

只读检查保存的 Session 结构事实得到：

- step 1 完整执行一次 `tianwen_smoke_action`；
- step 2 出现 37 个 `tool-call-delta`；
- delta 中已经出现精确工具名 `update_goal`；
- 参数增量累计 69 个字符，但没有最终 `block-end/tool-call`；
- step 2 以 `finish.reason.kind=max-tokens` 结束，reported output 为 64 tokens；
- step 2 的最终 assistant message 没有 content block；
- Session 因此没有第二个 `tool/call`，Goal 没有完成。

现有 `assessLiveGoalEvents()` 先检查 assistant message 数量是否精确为 3。实际只有 2，
所以回执为 `usage-invalid`。这只是严格后置验收的分类结果，不表示数字 usage 非法，
也不得冒充 Alpha-C 学习证据。

64 tokens 产生了 69 个参数字符，而当前固定 `update_goal` 参数完整 JSON 为 88 个字符。
精确的 token/字符关系由 provider 决定，不能从脱敏事实算出数学最小值。`128` 是失败值
`64` 之上的最小保守倍增：足以为剩余参数和工具调用框架留出空间，同时仍是很窄的
输出边界。

## 3. 方案比较

### 3.1 采用：固定输出上限 `64 -> 128`

现有公开边界已经同时通过 `AgentOptions.maxTokens` 和 `agent/request` waterfall 把同一固定
上限送到 provider。只改变 `LIVE_GOAL_LIMITS.maxOutputTokensPerRequest`，即可让预检、
请求覆盖和 receipt 使用同一个新权威值。

优点：直接修根因；产品改动只有一个常量；不增加状态、依赖、提示词、工具或 Runtime
抽象。原有总 token `32768`、CNY `0.25`、三请求和零 retry 上限继续兜底。

### 3.2 不采用：强化或分阶段改写 authority

当前固定 authority 已经使模型选择正确工具。改 prompt 会同时改变另一个变量，却不能
补足被输出上限截断的工具参数，因此不是根因修复。

### 3.3 不采用：强制 public tool choice 或 Tianwen 自建工具调度

锁定的 DSH `0.1.0-rc.6` 公开 `GenerateOptions` 没有 `toolChoice/tool_choice` 字段。
天问不得为此导入私有源码、Fork DSH 或新建通用 Agent Runtime。即使强制选择工具，
同一个 64-token 上限仍可能截断工具调用编码。

## 4. 产品改动

生产代码只修改：

- `packages/tianwen-runtime-bundle/src/goal-live-smoke.ts`
  - `maxOutputTokensPerRequest: 64` 改为 `128`。

不修改 `resume-runner.ts` 的 authority、tool restriction、guard、request count、retry、
settlement、Evidence 或 receipt 逻辑。不新增配置项；用户和模型都不能调节该值。

历史设计、旧回执和旧 handoff 保持原样。新设计和新 canonical handoff 记录新值，
不能把历史 64-token 事实改写成 128。

## 5. 离线 RED/GREEN

在现有 `goal-live-smoke.spec.ts` 的真实 GoalService、goal-round-driver、tool-goal、Evidence
和 `ScriptedAdapter` 链上增加一个状态化回归场景：

1. 第一请求返回完整 `tianwen_smoke_action`；
2. 第二请求若 `maxTokens < 128`，返回 `update_goal` 的增量片段、合法 usage 和
   `finish.kind=max-tokens`，但不返回 `block-end`；
3. 第二请求若 `maxTokens >= 128`，返回完整 `update_goal`；
4. 第三请求返回固定 marker。

在旧常量下，测试必须稳定得到 2 requests、`usage-invalid`、只有 action Evidence、Goal
未完成。这是 RED 证据。只修改常量后，同一场景必须得到 3 requests、完整
`action -> update_goal -> marker`、Goal complete 和两条 Evidence。这是 GREEN 证据。

同时更新现有单元测试、DeepSeek fetch fixture 和 installed E2E 对固定 `max_tokens=128`
及 receipt limits 的断言。离线 fetch fixture 必须在值不是 128 时失败关闭。

## 6. 不削弱的硬门

以下合同一项都不放宽：

- 精确 3 个模型请求、0 retry；
- 只暴露 `tianwen_smoke_action` 和 `update_goal`；
- action 精确一次、空参数、成功后才允许 update；
- update 精确绑定当前 Goal id/revision，action 只能是 complete；
- Session 中 call/result 顺序和最终 marker 精确匹配；
- 每个 assistant 都必须有合法 usage，总量不超过 32768；
- 单次估算费用不超过 CNY 0.25；
- Goal complete、rounds 1/1、disarmed；
- Evidence 精确两条 complete；
- Evolution 和 Champion 字节不变；
- failure receipt 继续脱敏，不能保存 Goal objective、模型文本、原始参数、凭据或 provider body；
- provider、timeout、usage、工具偏差、持久化和 preflight 失败仍失败关闭；
- 普通 create/list/status/resume/model 行为不变。

## 7. 离线发布门

所有付费调用前必须串行完成：

1. 新截断回归测试的 RED/GREEN 证据；
2. live Goal、ordinary resume、Runtime Bundle 聚焦测试；
3. Runtime Bundle build 和 workspace typecheck；
4. 依赖闭包与私有导入检查；
5. 默认 Node 测试；
6. 正式安装态 E2E；
7. Windows LocalSandbox；
8. Python A1-A5 和全量 pytest；
9. Ruff、`git diff --check` 和 clean-worktree 检查；
10. 独立正确性复审和 Ponytail/YAGNI 复审，开放 Critical/Important 必须为 0。

重测试严格串行。缓存、store、Python 环境、安装态数据和临时目录继续使用
`D:\DevData`。本阶段不调用真实 Docker。

## 8. 真实调用门

离线实现、全部测试和复审完成后，主控才向用户申请一次本阶段累计 token/CNY 上限。
授权只覆盖同一固定 objective、同一工具面和本阶段真实复验；不覆盖旧 Goal、其他模型、
其他工具或权限扩大。

每条真实请求链必须使用一个全新 pristine Goal。失败 Goal 永不重放、原地扩轮或改写。
同一阶段预算内也不自动 retry；若需要第二个新 Goal，必须先保存第一条链的真实结果，
完成针对新增证据的离线设计、测试和复审，并确认仍在同一 Goal、范围和累计预算内。

成功必须诚实达到：

```text
tianwen_smoke_action success
-> update_goal complete
-> Goal complete
```

若新的真实证据证明 `128` 仍不足或 DSH 公开机制存在其他承重限制，阶段停在证据支持的
结论；不得无限调 Runtime，也不得降低验收。

## 9. 明确不做

- 不修改旧 Goal、旧 Session、旧 receipt 或历史 handoff；
- 不强化 prompt，不增加 inject/steer 或额外模型轮次；
- 不新增 tool-choice shim、工具调度器、通用预算系统或 Runtime 框架；
- 不 Fork、升级或导入 DSH 私有源码；
- 不调用真实 Docker；
- 不实现 Signal/Ticket、Candidate/Evaluation、Shadow/Promotion；
- 不把当前 `usage-invalid` 记为持续学习证据；
- 不开始 Alpha-B、Alpha-C 或 Alpha-D，直到本阶段完成门通过。

## 10. 完成条件

阶段完成必须同时满足：

1. 离线测试能精确重放 64-token 截断并由唯一常量变化转为完整调用；
2. 所有原有严格回执、工具、Goal、Evidence 和治理门保持通过；
3. 全部离线发布门和两类独立复审通过；
4. 用户在调用门批准一次累计 token/CNY 上限；
5. 至少一个全新固定 Goal 的真实链达到业务工具成功、`update_goal`、Goal complete；
6. 无论真实结果如何都切回 offline，并保存脱敏回执和持久事实；
7. 留下 canonical handoff、独立复审结果、Ponytail/YAGNI 结论和远端精确 SHA。

只有完成上述条件后才冻结 Runtime，并进入 Alpha-B 的同条件 Champion/Challenger 比较。
