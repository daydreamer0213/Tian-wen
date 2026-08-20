# Tianwen 重复 Outcome 学习入口设计

日期：2026-08-20

状态：方向已由用户批准；具体工程方案由架构会话依据现有权威文档收敛。

性质：持续学习路线 Stage 2。本文只建立“Tianwen Run 绑定 → 结构化 Outcome → Observed Gap 分诊 → 跨 Run Signal/Ticket 合并”的真实产品路径，不表示 Case、Lesson、Candidate、Evaluation、Shadow 或 Promotion 已实现。

## 1. 结论

Stage 2 在 Stage 1 的显式反馈入口之外，增加一条来自真实执行结果的学习入口：每次 Tianwen Run 在 DSH 执行前绑定一个独立、不可变的 Run 身份和验收合同；执行结束后，Tianwen 从同一 DSH Session 只读投影 Evidence，并依据冻结合同形成 `met | not-met | inconclusive` 的结构化 Outcome。

Outcome 先经过既有 Observed Gap 分诊。普通成功、验证不确定、临时基础设施故障、样本不足和一次性问题都不会被机械升级为学习问题。只有来源明确、可复用且可归因的 `not-met` 才形成 `LearningSignal`。普通非阻塞问题在至少两个不同 Tianwen Run 中出现相同问题指纹后才创建一个 `LearningTicket`；后续相同问题继续合并。

```text
Tianwen Run 绑定（执行前）
→ DSH 正常执行
→ 用户结果与 DSH Session 先完成
→ Evidence 只读投影
→ 冻结验收合同投影 Outcome
   ├─ met                         → no-case
   ├─ inconclusive                → continue-observing
   └─ not-met                     → Observed Gap 分诊
       ├─ observe                 → continue-observing
       ├─ ordinary-correction     → 普通修正，不建 Signal
       └─ reusable               → LearningSignal
            ├─ 首个普通 Run       → signal-recorded
            ├─ 第二个不同 Run     → ticket-created
            └─ 后续不同 Run       → ticket-merged
```

整个入口是运行之间的显式调用，不监听或接管 Agent Loop，不改变当前 Run，不调用模型分析原因，也不创建第二 Runtime、第二 Session、第二账本、队列、Worker 或通用 Outcome 平台。

## 2. 权威关系与继承决定

本文不是从当前代码形状反推产品架构，而是按下列权威顺序具体化已有决定：

1. `docs/tianwen-architecture-overview-v2.md`：一个 DSH 执行内核、长期 Goal 主循环、Evidence 投影和后台学习旁路；
2. `docs/superpowers/specs/2026-08-19-tianwen-runtime-boundary-reset-design.md`：DSH/Tianwen 所有权、四个集成 seam、非干扰和运行之间学习；
3. `docs/superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md`：Goal/Task/Run/Action 分层、Outcome/Observed Gap 分诊、Signal/Ticket 窄门和问题指纹；
4. `docs/research/2026-08-19-dsh-upstream-capability-overlap-audit.md`：DSH rc.7 公共能力与 Tianwen 差异化边界；
5. `docs/superpowers/specs/2026-08-20-tianwen-explicit-feedback-learning-intake-design.md`：现有非阻塞 intake、幂等账本、隐私边界和 Stage 1 行为证据。

本文直接继承并不得改写以下结论：

- DSH `0.1.0-rc.7` 是唯一产品 Agent Runtime；
- DSH Session Event 是执行事实来源，Tianwen 只保存稳定引用、摘要和治理关系；
- DSH Turn、same-session Goal 和 Session 都不等于 Tianwen Run；
- `Goal → Task → Run → Action` 是 Tianwen 跨 Run 治理层级；
- 业务结果必须先成为 Observed Gap，再决定继续观察、普通修正或形成 Signal；
- Signal 只描述观察，不提出修改方案；
- Ticket 只表示值得投入资源调查，不表示原因、Lesson 或解法已确定；
- 普通成功、一次普通失败、Runtime/网络/环境故障和模型自评都不能自动形成 Candidate；
- 学习入口失败不能撤销或改写已经完成的 DSH 结果；
- Stage 2 不进入 Case、Lesson、Candidate、Evaluation、Shadow、Promotion、Reject 或 Rollback。

## 3. 当前产品缺口

Stage 1 已经证明真实 DSH Message Feedback 可以形成持久 Signal/Ticket，但当前 TypeScript 产品仍缺少重复 Outcome 所需的三个连接点：

1. `@tianwen/evidence` 只按 DSH `sessionId` 投影工具 Evidence，还没有 Tianwen `goal/task/run` 绑定；
2. `@tianwen/evolution` 的 learning intake 只处理 feedback snapshot，且显式纠正会立即建 Ticket；
3. 产品没有一个冻结验收合同到 DSH Session 结果的结构化 Outcome 投影。

旧 Python `RunManifest`、Alpha Learning Intake、RepoTaskRuntime 和 Docker verifier 仍是实验与验收资产。它们证明过部分治理语义，但不得被接回正式产品或扩建为第二 Runtime。Stage 2 只在现有 TypeScript `@tianwen/runtime`、`@tianwen/evidence` 和 `@tianwen/evolution` 公共 seam 上补齐上述缺口。

## 4. Stage 2 范围

### 4.1 本阶段实现

1. 一个最薄、不可变的 Tianwen Run Evidence binding；
2. 一个冻结的 DSH 工具验收合同；
3. 一个只读 Outcome projector；
4. `met | not-met | inconclusive` 与 Observed Gap 的确定性分诊；
5. 首个普通可归因失败只记录 Signal；
6. 不同 Run 的第二个同类 Signal 创建 Ticket；
7. 后续同类 Signal 合并到同一开放 Ticket；
8. 同 Run、同问题不重复计数；
9. 同一 ledger 的追加、重放、冲突拒绝和公开事件隐私边界；
10. 真实 DSH Agent loop、工具结果、Evidence、Run binding 和 ledger 的零成本端到端证明。

### 4.2 明确不实现

- 完整长期 Goal Graph、自动下一 Task 选择或通用 scheduler；
- 通用 Outcome bus、事件代理、消息队列、Worker、cron 或第二数据库；
- 对自由文本、工具输出正文或模型反思做语义聚类；
- 从 Session Query 批量回扫所有历史 Session；
- 多 Session 对单 Run、单 Session 对多 Run 的通用映射；
- 自动 Case、Attribution、Lesson、Candidate 或 Skill 修改；
- Candidate 预算、实验调度、Evaluation、Shadow、Promotion 或 Rollback；
- Python Alpha、RepoTaskRuntime、AlphaRuntime、Docker verifier 或 Provider 调用；
- UI、遥测平台、生产 SLA 或多进程写入协调框架。

这些内容只有在后续阶段有独立设计和真实需求证据时才能进入计划。

## 5. 最薄 Run Evidence binding

### 5.1 语义

Tianwen Run 表示同一 Task 在一组冻结输入和验收标准下的一次具体尝试。Stage 2 不建设完整 Goal Graph，只保存 Outcome 归因不可缺少的最小身份连接：

```text
goalRef
taskRef
runId
scopeKey
DSH sessionId
acceptanceContract
acceptanceContractDigest
```

`goalRef` 和 `taskRef` 是调用方已确定的稳定不透明标识，不包含 Goal/Task 正文。Stage 2 不解释、修改或调度它们。

第一版 Host 约束为：一个 Tianwen Run 使用一个 fresh DSH Session；一个 DSH Session 最多绑定一个 Tianwen Run。这里的 1:1 是当前薄适配的部署约束，不表示 Session 与 Run 在领域语义上相同。一个 Run 仍可在所属 Session 内经历多个 DSH Turn 或 Goal round。

### 5.2 创建时机

Run binding 必须在该 Session 第一个 `turn/start` 之前写入。已经开始执行的 Session 不能事后补写或改绑，因为那会让“冻结验收标准”退化成看过结果后再选标准。

Run binding 写入 Tianwen evolution ledger，不写 DSH Session。创建前后 Session Event 必须完全相同。

### 5.3 标识与幂等

使用现有 canonical JSON + SHA-256 规则：

```text
acceptanceContractDigest = hash(acceptanceContract)

runId = "run:" + hash(
  goalRef,
  taskRef,
  sessionId,
  scopeKey,
  acceptanceContractDigest
)
```

相同 binding 重放返回同一 `runId` 和 `duplicate: true`，不追加事件。相同 Session 试图绑定不同 Goal、Task、scope 或验收合同时，必须在写入前拒绝；不能后写覆盖。

## 6. 冻结验收合同

### 6.1 为什么第一版使用 DSH 工具结果

权威架构允许验证器、业务指标和用户反馈成为 Outcome 来源，但 Stage 2 只需要一个最窄、真实、可重复的产品 seam。DSH 已经把工具调用、工具结果、明确的 `isError` 事实和稳定错误码写入 durable Session Event；当前 Evidence projector 已能保留 tool name、call/result seq、result digest 和 `error.code`，Stage 2 只需把既有结构化 `isError` 事实一并投影，不能靠“没有 errorCode”猜测成功。

因此第一版使用一个冻结的 DSH 工具验收合同，不新增结果协议、解析自由文本或复制工具正文：

```text
source = dsh-tool-result
toolName
notMetErrorCode
gapDisposition = observe | ordinary-correction | reusable
problemCategory?       # reusable 时必需
severity?              # reusable 时必需，1..5
blocksGoal?            # reusable 时必需
```

工具输出正文不进入合同或 ledger。`toolName + notMetErrorCode` 是调用方在 Run 前冻结的机器合同，不由模型在运行后选择。

### 6.2 合同分诊意图

- `observe`：失败可能尚无稳定样本，只形成继续观察结果；
- `ordinary-correction`：失败属于当前 Task 的一次性输入、素材或局部修正；
- `reusable`：失败代码表示一个可在未来任务中复用改进的能力问题，必须同时冻结问题类别、严重度和是否阻塞 Goal。

网络、Provider、权限、取消、超时、未知工具、缺少工具结果和其他未登记错误码不属于 `notMetErrorCode`，统一进入 `inconclusive`，不得形成 Signal。

### 6.3 比例化边界

该合同不是一个通用验证框架，也不要求所有工具采用 Tianwen schema。只有确实承担某个 Run 冻结验收标准的工具才需要登记。普通工具继续按 DSH 原有方式工作。

## 7. Outcome 只读投影

### 7.1 投影条件

Host 在 DSH Run 已经结束并交付结果后显式调用 Outcome intake。Runtime service 必须核对：

1. `runId` 存在且绑定传入 Session；
2. Session 最后一个 Turn 边界事件是 `turn/end`；如果旧 Turn 已结束但新 Turn 已 `turn/start` 尚未结束，Run 仍未结束；
3. Session Event 在 intake 前后不变；
4. Evidence 来自同一 Session；
5. 验收工具结果来自冻结 `toolName`；
6. 只使用最后一个已结算的匹配工具调用作为本 Run 的最终验收结果。

如果模型先得到 `not-met`、随后修正并再次运行同一验收工具得到成功，最后一个显式成功结果决定 Outcome 为 `met`；前面的中间失败不会进入跨 Run 学习。

### 7.2 三值 Outcome

只在最终 DSH Turn 正常 `completed` 时解释验收工具结果：

- 最后一个匹配调用有完整 result，结构化 `isError` 为 false（或兼容旧成功记录而缺省），并且没有 `error.code`：`met`；
- 最后一个匹配调用结构化 `isError = true`，且 `error.code` 精确等于冻结 `notMetErrorCode`：`not-met`；
- 没有匹配调用、缺少 result、`isError = true` 但缺少稳定 code、其他 error code、`isError` 与 error identity 自相矛盾，或最终 Turn 为 error/aborted/blocked/max-tokens/interrupted：`inconclusive`。

这避免两种历史错误：不能用“没有发现失败”推断成功，也不能把 Provider、Runtime 或验证设施异常压成业务失败。

Outcome 只保存：

```text
runId
verdict
acceptanceContractDigest
relevant Evidence id
sessionDigest
not-met 时的结构化 gap facts
```

原始结果、路径、用户内容、错误 message 和模型输出不复制进 ledger。

## 8. Observed Gap 分诊

分诊完全由运行前冻结合同和运行后结构化事实决定，不调用模型：

| Outcome | gapDisposition | 结果 |
|---|---|---|
| `met` | 任意 | `no-case`，不建 Signal/Ticket |
| `inconclusive` | 任意 | `continue-observing`，不建 Signal/Ticket |
| `not-met` | `observe` | `continue-observing`，不建 Signal/Ticket |
| `not-met` | `ordinary-correction` | `ordinary-correction`，不建 Signal/Ticket |
| `not-met` | `reusable` | 创建不可变 `OutcomeLearningSignal` |

Signal 只陈述：哪个 Run、哪个能力范围、哪个问题类别、哪个稳定失败特征、严重度、是否阻塞 Goal，以及哪些 Evidence 支持这项观察。它不能保存“应该怎样改”的方案。

## 9. 问题指纹与 Ticket 窄门

### 9.1 问题指纹

沿用治理设计第 5.3 节：

```text
目标 Artifact / 能力范围
+ 规范化问题类别
+ 关键失败特征
```

Stage 2 的确定性实现为：

```text
problemFingerprint = hash(
  scopeKey,
  problemCategory,
  {
    source: "dsh-tool-result",
    toolName,
    notMetErrorCode,
    acceptanceContractDigest
  }
)
```

问题类别只做 Unicode `NFKC`、首尾空白删除、连续空白折叠和 Unicode 小写；不分词、不做同义词归并、不调用模型。合同变化会产生新的失败特征，避免把不同验收标准下的结果机械合并。

### 9.2 Signal 身份

```text
outcomeIngestionId = hash(runId, acceptanceContractDigest)
signalId = "signal:" + hash(runId, problemFingerprint, relevantEvidenceId)
ticketId = "ticket:" + problemFingerprint hex
```

同一 Run、同一问题最多产生一条 Signal。不同 DSH Session 只有在已经形成不同 Tianwen `runId` 时才算不同发生；重复读取、重试 intake 或同一 Session 内多次验收都不能提高 recurrence。

### 9.3 Ticket 条件

沿用既有价值窄门，不重新定义：

- Stage 1 的明确用户纠正可以立即创建 Ticket；
- 可信结构化事实表明 `blocksGoal = true` 时可以立即创建 Ticket；
- 可信结构化事实表明 `severity >= 4` 时可以立即创建 Ticket；
- 普通非阻塞、严重度 1–3 的 Outcome Signal 只有 `recurrence >= 2` 才创建 Ticket。

因此“至少两个不同 Run”是 Stage 2 普通重复失败路径的门槛，不会静默覆盖已批准的明确纠正、阻塞 Goal 或高严重度例外。

同一问题指纹最多一个开放 Ticket。首次建 Ticket 时必须关联此前所有尚未入 Ticket 的同指纹 Signal；后续 Signal 追加到原 Ticket。原始 Signal 保持不可变。

Stage 2 只创建未激活的 open Ticket。学习模式、调度结果、实验预算、候选上限、验收条件和停止条件在后续 Case/Ticket activation 阶段冻结；本阶段不能用占位字段假装已经启动学习调查。

## 10. 持久化、重放与隐私

### 10.1 单一 ledger

继续复用 `@tianwen/evolution` 现有 `ledger.jsonl`、严格解析、追加、fsync、重放和 commit-unknown 语义。只增加两种内部事件：

- `run-binding-recorded`；
- `outcome-intake-recorded`。

不创建第二 JSONL、数据库、repository、event-store framework 或 migration service。

### 10.2 重放规则

- 相同 Run binding 重放不追加；相同 Session 改绑拒绝；
- 相同 Outcome ingestion 和相同内容重放不追加；
- 相同 ingestion 但 verdict、Evidence、session digest 或 gap facts 变化时拒绝；
- ledger 重启后 Run binding、Outcome、Signal、Ticket 和 signal 顺序完全一致；
- 损坏、截断、非法 UTF-8、未知字段或状态不一致继续 fail-closed，不静默跳过。

### 10.3 公开边界

`run-binding-recorded`、`outcome-intake-recorded` 和 Stage 1 的 `learning-intake-recorded` 都是内部持久化事件，不进入公开 `listEvents()` 类型或运行时返回。

公开 Signal/Ticket 只能暴露结构化标识、scope、问题类别、摘要、严重度、布尔事实和 Evidence id；不得暴露 Goal/Task 正文、工具结果正文、错误 message、用户内容、绝对路径或 Provider 凭据。

## 11. 非干扰与错误语义

固定时序：

```text
绑定 Run（Session 尚未执行）
→ DSH 独立完成 Run 并交付结果
→ Host 显式调用 Outcome intake
```

因此：

- Run binding 和 Outcome intake 都不能向 Session 追加事件；
- Tianwen off/on 不改变模型可见输入、工具调用、工具结果、产物或最终回答；
- intake 不触发 followup、重试、Goal resume、Provider 请求或工具调用；
- ledger 写入失败不改变 DSH Run、Session 或用户结果；
- Session 未结束、Run/Session 不匹配和 ledger 损坏是错误，不是 `inconclusive`；
- 已结束 Run 的其他工具错误、Provider 错误或验收结果缺失是 `inconclusive`，不是业务 `not-met`；
- `no-case`、`continue-observing`、`ordinary-correction`、`signal-recorded` 和 Ticket 决策必须分别表达。

Host 可以报告“Tianwen Outcome 登记失败”，并用同一冻结输入安全重放 intake；不得重跑已经完成的 DSH Run 来修复治理写入。

## 12. 端到端证明

### 12.1 focused contracts

最小测试必须覆盖：

- Run binding 在第一个 Turn 前成功，执行开始后拒绝；
- 同 binding 重放幂等、同 Session 改绑冲突；
- 显式成功验收得到 `met/no-case`；
- 缺少验收、missing result、其他 error code 和非 completed Turn 得到 `inconclusive`；
- 工具结果 `isError = true` 但没有稳定 error code 时得到 `inconclusive`，不能误判为 `met`；
- 旧 Turn 已结束但新的 Turn 仍处于 open 状态时拒绝 intake，不能提前登记旧 Outcome；
- `observe` 与 `ordinary-correction` 不建 Signal/Ticket；
- 第一个普通 reusable failure 只建 Signal；
- 第二个不同 Run 创建一个 Ticket，并关联两条 Signal；
- 同 Run 重放不增加 recurrence；
- 第三个不同 Run 合并原 Ticket；
- 不同 scope、问题类别、错误码或验收合同不合并；
- trusted `blocksGoal` 或 `severity >= 4` 走既有单次 Ticket 窄门；
- 重启重放一致、损坏拒绝、公开事件不暴露内部 Outcome；
- Stage 1 feedback 行为和公开类型边界保持不变；
- intake 失败或成功前后 Session bytes 一致。

### 12.2 真实 DSH 集成

使用 DSH `0.1.0-rc.7` 公共接口证明：

1. 创建两个不同 Tianwen Run 和两个 fresh DSH Session；
2. 两个 Run 在执行前冻结相同的 reusable 验收合同；
3. 正常 Agent loop 调用同一验收工具并得到同一结构化 `notMetErrorCode`；
4. 两个 Run 都正常到达 final assistant message，用户结果不被 intake 阻塞；
5. Evidence 分别绑定到两个 Run；
6. 第一个 Outcome 产生一个 Signal、零 Ticket；
7. 第二个 Outcome 产生第二个 Signal和一个含两条 Signal 的 Ticket；
8. 重放第二个 Outcome 不增加计数；
9. 两个 Session 在 intake 前后完全不变；
10. Candidate 数量仍为零。

集成 fixture 使用 scripted adapter 和固定合成工具，仅证明机制。它的 ledger 位于可删除临时目录并在测试后清理，必须在输出中标记 `syntheticContractFixture: true`；不能被描述为生产环境自然积累的真实学习证据。

### 12.3 零成本 demo

增加一条重复 Outcome demo，输出单一 JSON：

```text
schemaVersion = tianwen.repeated-outcome-demo.v1
fixture.syntheticContractFixture = true
execution.runs = 2
execution.sessions = 2
outcomes = [not-met, not-met]
learning.firstDecision = signal-recorded
learning.secondDecision = ticket-created
learning.signals = 2
learning.openTickets = 1
learning.candidateCreated = false
replay.duplicate = true
nonInterference.sessionsUnchanged = true
```

demo 保持 0 网络、0 Provider、0 token、0 CNY、0 Docker、0持久数据库、0真实用户数据。它不替代未来自然生产 Outcome，只为仓库提供可重复的行为合同。

## 13. Stage 2 完成门

Stage 2 只有同时满足以下条件才算完成：

1. Tianwen Run 与 DSH Session 有执行前、不可变、可重放的真实绑定；
2. Outcome 来自冻结验收合同和同 Session Evidence，不解析自由文本；
3. `met/not-met/inconclusive` 三值语义正确，其他失败不冒充业务失败；
4. Observed Gap 的 observe、ordinary correction 和 reusable 分诊正确；
5. 第一个普通 reusable failure 只形成 Signal；
6. 第二个不同 Run 的同指纹 Signal 创建 exactly one open Ticket；
7. 同 Run 重放、同 Session 重试和 intake 重试不提高 recurrence；
8. 明确纠正、阻塞 Goal、高严重度和 recurrence 窄门没有被互相覆盖；
9. Stage 1 feedback 路径、research-preview no-case demo 和 correction demo 保持通过；
10. DSH Session 和用户结果不受 Run binding 或 Outcome intake 成败影响；
11. rc.7 closure、public imports、typecheck、focused tests、demo 和公共文档合同通过；
12. correctness、architecture-fitness、privacy/API 和 Ponytail/YAGNI review 无 Critical / Important；
13. 没有新增 Runtime、Goal scheduler、数据库、队列、Worker、通用 Outcome framework、Python 产品路径或 Candidate 行为；
14. 没有 Provider、付费模型、Docker、Release、申请或其他外部产品动作；
15. 执行工作区、唯一 node_modules 和共享缓存位于 D 盘；离线依赖可用时不得重复下载或创建第二份 clone/venv/node_modules。

测试数量、字段存在或合成 fixture 本身不能替代真实 DSH producer → Evidence → Outcome → Signal/Ticket 的端到端行为证据。

## 14. 后续阶段

Stage 2 通过后才进入：

1. **Stage 3：Case、Attribution、Lesson 和有限 Candidate。** Ticket 激活时冻结学习模式、调度结果、预算、验收和停止条件；原因不明时先做有界假设探索；
2. **Stage 4：独立 Evaluation。** Champion 与 Candidate 使用相同输入、工具、权限、数据和协议，得到 `PASS | FAIL | INCONCLUSIVE`；
3. **Stage 5：Shadow、Promotion、Reject、Rollback。** 只改变未来新 Run；
4. **Stage 6：按真实证据减少人工门。** 不扩大 Goal、权限、累计预算或不可逆影响边界。

Stage 2 的 Run binding 是 Evidence 归因所需的最薄连接，不冒充完整长期 Goal Graph。完整 Goal 进度、依赖和下一 Task 选择仍需后续独立设计，不得在 Outcome intake 实施中顺手扩建。
