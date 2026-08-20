# Tianwen 显式反馈学习入口设计

日期：2026-08-20

状态：已批准方向；根据旧架构会话中的执行偏好和历史问题完成第二次复审并收窄。

性质：持续学习路线 Stage 1。本文只建立“用户明确纠正 → LearningSignal / LearningTicket”的真实产品入口，不表示 Candidate、Shadow 或 Promotion 已实现。

## 1. 结论

Stage 1 只证明一件事：DSH 正常完成任务并先交付结果后，用户针对 final assistant message 提交负面评价和具体说明，Tianwen 能只读绑定原 Session 与 Evidence，持久形成一条 `LearningSignal`，再创建或合并一个 `LearningTicket`。

```text
DSH 正常 Run → final message → 用户收到结果
→ DSH Message Feedback
→ Tianwen 只读 Intake
   ├─ positive                         → no-case
   ├─ negative、无具体 note           → observed-gap，无 Ticket
   └─ negative、含非空 note           → Signal + 创建/合并 Ticket
```

相同 feedback version 重放不重复。Intake 失败不改变已经完成的 Run、Session 或用户结果。

第一版到 Ticket 为止：不分析重复失败，不总结 Lesson，不生成 Candidate，不改 Skill，不切换 Champion。

## 2. 为什么采用这条最短路径

### 2.1 复用现有产品路径

DSH `0.1.0-rc.7` 继续是唯一产品 Agent Runtime，负责：

- Agent Loop、Provider、Tools/MCP、Sandbox；
- Session、Query、同一 Session 内的 Goal/Plan/Todo；
- Skill、Jobs、Workflow/Subagent；
- Message Feedback、Approval 和 permissions。

Tianwen 只负责：

- 从 DSH Session 单向投影 Evidence；
- 判断反馈是否值得形成学习治理记录；
- 保存跨 Run 的 Signal、Ticket 和来源关系。

Intake 是现有 DSH Host 内的一层 Tianwen service / plugin，不拥有模型循环、工具循环或 Session 生命周期，因此不是第二 Runtime。

### 2.2 不复活旧 Runtime

现有 Python Alpha、Learning Intake、RepoTaskRuntime 和 Docker verifier 继续作为研究、评测和回归资产，不接入正式产品，也不再扩建。

### 2.3 不强行使用 DSH Job

DSH Local Job 服务当前 Agent/进程，用户反馈可能在 final message 之后才到达。Stage 1 不把 Local Job 冒充可跨 Run 持久化的 Learning Ticket，也不建设消息队列、常驻 Worker 或通用 scheduler。

Host 在保存反馈后显式调用 Intake；这已足以证明真实入口。

## 3. 第二次复审后的收窄

旧架构会话反复暴露过同一种问题：为了形式完整、审计或极低概率故障，先建设大量基础设施，最后反而没有直接观察产品效果。Stage 1 因此只保留证明主路径必需的内容。

原草案中的下列项目移出 Stage 1：

- feedback 修改后的 supersede 状态机；
- feedback 删除和 Ticket 自动关闭；
- 按时间戳处理乱序 mutation；
- commit-unknown 专用恢复协议；
- 多进程锁、租约和 writer 协调；
- 通用 event-store、repository 或 ledger framework。

Stage 1 的准确边界是：

- 每个 DSH feedback version 是一项不可变观察；
- 新 version 可以在以后再次消费，但第一版不自动推翻旧 Signal；
- 删除 DSH feedback 不会偷偷删除已经进入治理的历史事实；
- 更正、撤回和数据彻底删除策略在开始处理生产用户数据前单独设计；
- 因为本阶段只用固定合成数据，这些延期不会影响演示真实性或用户结果。

这样先跑通真实 feedback → Signal/Ticket，再根据实际需求补生命周期，而不是提前建“体育场”。

## 4. 组件与数据流

### 4.1 DSH Message Feedback

DSH 是反馈权威来源，保存 assistant message 的：

- `messageId`；
- `rating: positive | negative`；
- 可选 `note`；
- 不透明 `version`。

Stage 1 使用 DSH 公共 `put/list` 路径取得真实 snapshot，不手写一个假 Feedback 代替集成证明。

### 4.2 Tianwen Evidence

Intake 必须核对：

- message 属于传入的真实 DSH Session；
- message 是已经 finalized 的 assistant message；
- Evidence 来自同一 Session 的只读投影；
- Intake 前后的 Session digest 完全相同。

Tianwen 不复制第二份 Session，也不向 DSH Session 追加学习事件。

### 4.3 Tianwen Learning Intake

最小输入：

```text
session
scopeKey
feedback { messageId, rating, note?, version }
```

其中：

- `session` 必须是真实 DSH Session 对象；
- `scopeKey` 是调用方冻结的项目/能力作用域，必须稳定且非空；
- `messageId` 必须通过同 Session final-message 校验；
- `version` 只作为不透明去重材料，Tianwen 不猜测其顺序。

输出只包含：

```text
decision:
  no-case | observed-gap | ticket-created | ticket-merged
ingestionId
signalId? / ticketId?
duplicate: boolean
sessionUnchanged: true
```

回执、普通日志和 demo 不输出 feedback note 原文。

## 5. 确定性分诊与去重

### 5.1 分诊

规则固定为：

1. `positive` → `no-case`；
2. `negative` 且 note 缺失、为空或规范化后为空 → `observed-gap`；
3. `negative` 且 note 非空 → 创建 Signal，再创建或合并 Ticket。

DSH rc.7 没有第二个“这是纠正”字段。第一版把用户主动提交的 `negative + 非空 note` 定义为可确定执行的显式纠正入口，但不声称 note 给出的原因或方案已经正确。Ticket 只表示“值得以后调查”。

positive、普通成功和没有具体内容的 negative 都是合法 no-ticket 结果。不得为了展示学习能力而人为升级。

### 5.2 文本规范化

仅做确定性处理：

1. Unicode `NFKC`；
2. 删除首尾空白；
3. 连续 Unicode 空白折叠为一个空格；
4. 转为 Unicode 小写。

不删除标点、不分词、不做同义词归并、不调用模型。不同措辞即使含义相同，Stage 1 也不自动合并；语义归因属于后续阶段。

### 5.3 标识

使用现有 canonical JSON + SHA-256 规则计算：

```text
ingestionId = hash(sessionId, messageId, feedbackVersion)

signalId = hash(
  sessionId,
  messageId,
  feedbackVersion,
  rating,
  rawNoteDigest,
  scopeKey
)

problemFingerprint = hash(
  scopeKey,
  "explicit-user-correction",
  normalizedNoteDigest
)

ticketId = "ticket:" + problemFingerprint hex
```

相同 `ingestionId` 和相同内容重放时返回 `duplicate: true`，不增加 Signal 或 Ticket。相同 `ingestionId` 但内容、scope 或 Evidence 绑定不同，拒绝写入，不能后写覆盖。

同一 scope 内完全相同的规范化纠正合并到一个 Ticket；不同 scope 永不自动合并。原始 Signal 始终独立保留。

## 6. 最小持久化

Stage 1 直接复用 `@tianwen/evolution` 已有的 append-only ledger、严格 schema、重放和损坏拒绝能力。它只给现有 `ledger.jsonl` 增加一种 `learning-intake-recorded` 事件，不创建第二份 JSONL、数据库或通用存储层，也不调用 Artifact、Promotion 或动态 Runtime 激活路径。

每次成功消费只追加一个带 schema version 的完整事件，包含：

- ingestion、Signal 和 Ticket 关系；
- Session/message/version/scope 绑定；
- Evidence id 和 Session digest；
- feedback note 原文及其 digest。

原文用于以后调查的来源追溯，但属于本地用户数据：

- 不提交 Git；
- 不进入 demo 输出、CI artifact、普通日志或遥测；
- Stage 1 测试和 demo 只使用固定合成文本。

第一版只增加证明持久 Ticket 必需的领域状态：

- 写入后重启可以重放出相同 Signal/Ticket；
- 相同 version 重放不重复；
- 非法 JSON、非法 UTF-8 或截断记录 fail-closed，不静默跳过；
- 写入失败沿用现有 ledger 错误语义，由 Host 返回独立 `learning-intake-failed`；调用方可以用同一 snapshot 重试。

规范化、指纹和 Signal/Ticket 领域逻辑放在一个聚焦的 intake 模块；现有 ledger 只负责校验、追加和重放。不得为了共用代码重构整个 evolution ledger，也不得把 Stage 1 接到 Candidate/Promotion 行为。

一个 `evolutionRoot` 单进程单 writer 是 Stage 1 的运行前提，不为尚未存在的多进程需求建设锁服务。

## 7. 非干扰和错误语义

固定时序：

```text
DSH 完成 Run → final message 持久化 → 用户收到结果
→ feedback 保存 → Tianwen Intake
```

因此：

- Intake 不参与模型请求、工具调用或 final message 生成；
- Intake 不触发 followup，不重跑当前 Run，不改 Session；
- Intake 失败不能把已完成 Run 改成失败；
- ledger 损坏、Evidence 不匹配和普通 no-case 必须是不同结果；
- 学习入口关闭时，DSH 正常执行和 Message Feedback 仍能独立工作。

“非阻塞”表示不阻塞已经完成的用户任务，不表示静默吞错。Host 可以报告“反馈已保存在 DSH，但 Tianwen 学习登记失败”，随后安全重试。

## 8. 直接验证真实效果

### 8.1 focused tests

只建设主路径需要的测试：

- positive → no-case；
- negative 无 note → observed-gap；
- negative 有 note → exactly one Signal + one Ticket；
- 相同 version 重放不重复；
- 同 scope、相同规范化纠正合并；
- 不同 scope 不合并；
- 写入、重启、重放状态一致；
- 损坏记录 fail-closed；
- note 原文不出现在回执或错误消息；
- Intake 前后 Session digest 不变。

### 8.2 真实 DSH 集成

使用 DSH `0.1.0-rc.7` 公共接口证明：

1. 正常 Agent loop 完成确定性任务；
2. 产生 finalized assistant message；
3. Evidence 只读投影成功；
4. 真实 Message Feedback `put/list` 得到 negative + note + version；
5. Intake 产生 exactly one Signal 和 one Ticket；
6. 重放相同 snapshot 不重复；
7. 人为制造 Intake 写入失败时，用户结果与 Session 仍保持完成。

不先建设完整反馈 UI、自动 worker 或通用测试矩阵。

### 8.3 零成本 correction demo

保留现有 no-case demo，再新增一条 correction demo。它使用 scripted adapter 和固定合成反馈，输出单一 JSON：

```text
execution.status = completed
feedback.rating = negative
learning.decision = ticket-created
learning.signals = 1
learning.openTickets = 1
learning.candidateCreated = false
replay.duplicate = true
nonInterference.sessionUnchanged = true
```

demo 不输出 note 或本机路径，且保持 0 网络、0 Provider、0 token、0 CNY、0 Docker、0持久数据库、0真实用户数据。

## 9. Stage 1 完成门

Stage 1 只有满足以下条件才算完成：

1. 真实 DSH Message Feedback 公共接口进入 Intake；
2. 明确纠正形成 exactly one Signal 和 one open Ticket；
3. 相同 feedback version 重放不重复；
4. positive 与无 note negative 均不建 Ticket；
5. 重启重放与损坏拒绝有 focused tests；
6. DSH Session 和用户结果不受 Intake 成败影响；
7. 原 no-case demo 与新 correction demo 都通过；
8. rc.7 closure、public imports、typecheck 和相关 tests 通过；
9. correctness、architecture-fitness、Ponytail/YAGNI review 无 Critical / Important；
10. 没有新增 Runtime、数据库、后台框架、Python 产品路径或 Candidate 行为；
11. 没有 Provider、付费模型、Docker、公开、Release 或申请动作；
12. 执行工作区和依赖缓存放在 D 盘并复用现有缓存，不为验证重复创建 clone、venv 或 node_modules。

测试数量不是完成证据；真实 DSH feedback → Signal/Ticket 的端到端结果才是承重门。

## 10. 后续阶段

Stage 1 通过后再依次设计和实施：

1. **Stage 2：重复可归因失败。** 多次真实 Outcome 合并到 Ticket，不制造失败凑证据。
2. **Stage 3：Case / Lesson / 有限 Candidate。** Ticket 经过归因后形成经验和少量候选，不自动改正式行为。
3. **Stage 4：独立评测。** Champion 与 Candidate 同条件得到 `PASS | FAIL | INCONCLUSIVE`。
4. **Stage 5：Shadow / Promotion / Reject / Rollback。** 候选只影响未来 Run，异常可回退。
5. **Stage 6：按证据减少人工门。** 只在既有授权、成本和影响边界内减少确认，不允许自我扩权。

## 11. 权威关系

本文具体化以下已批准架构：

- [`../../tianwen-architecture-overview-v2.md`](../../tianwen-architecture-overview-v2.md)：单一 DSH Runtime、非干扰和恢复顺序；
- [`2026-08-19-tianwen-runtime-boundary-reset-design.md`](2026-08-19-tianwen-runtime-boundary-reset-design.md)：DSH/Tianwen 所有权；
- [`2026-08-17-tianwen-continuous-learning-governance-design.md`](2026-08-17-tianwen-continuous-learning-governance-design.md)：Signal 是观察、Ticket 是资源窄门、学习默认旁路。

冲突时以上层设计为准。实施者不得从旧 Alpha 文档恢复第二 Runtime、机械请求上限或过度安全门。
