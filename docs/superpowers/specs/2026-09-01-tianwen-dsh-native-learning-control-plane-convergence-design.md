# Tianwen 与 DSH 原生能力收敛及主对话学习闭环设计

日期：2026-09-01

状态：产品方向与关键边界已由项目所有者批准。本文只冻结目标架构和验收合同，不授权直接开始实现。

设计基线：`codex/goal-chat-feedback@a896081`

运行基线：DSH `0.1.1-rc.2`，已安装 Tianwen Runtime `0.1.10`

## 1. 结论

Tianwen 的核心是学习循环和面向未来任务的自我改进治理，不是 Goal，也不是第二套 Agent Runtime。

目标产品只保留一个用户操作面：DSH 主对话。用户在主对话中发起任务、设置 DSH 权限、查看进度、收到结果、提供反馈并完成必要决策。子 Agent、分析 Session、评测 Run 和治理记录可以在内部存在，但用户不需要进入它们才能完成正常流程。

目标架构遵循以下顺序：

1. DSH 已提供的执行能力直接复用；
2. DSH 能力与 Tianwen 学习语义之间只写薄适配；
3. 只有 Evidence、学习归因、Candidate、受控评测、Shadow、Promotion 和 Rollback 等 Tianwen 独有治理才由 Tianwen 自建；
4. 删除与 DSH 重复、且已经造成用户流程分叉的组件；
5. 不为了界面看起来正常而篡改历史 Session 事实。

选定的收敛方式是“渐进式原生收敛”：目标架构一次冻结，按用户故事逐段替换，每一段都完成真实 Desktop 验收后再继续。仅修当前症状会继续积累边界漂移；整体重写则会无必要地重做已经证明有效的学习治理和受控评测。

## 2. 本次真实使用暴露的事实

### 2.1 “会话记录损坏”的精确根因

真实 Desktop 验收中的一个 Planner Session 被 DSH 子 Agent 目录显示为“会话记录损坏”。只读检查证明：

- 物理 Session 日志包含 138 个完整 Zstandard frame；
- 解压后有 231 条 JSONL 记录，零解析错误，尾部没有 torn frame；
- Session header 标记了 `origin: 'subagent'`、`parentSession` 和 `delegationDepth: 1`；
- 日志中没有任何 DSH `subagent/descriptor` 事件；
- DSH projection cache 因而记录 `descriptorSeen: false`，原生子 Agent 目录按协议将其分类为 `corrupt`；
- 同一 Session 的权限投影为 `workspace-write` 与 `approval: ask`，也没有经过 DSH 原生委派策略固定。

因此，数据文件没有物理损坏。问题是 Tianwen 直接调用普通 Agent/Session 创建能力，只写入了看起来像子 Agent 的 header 元数据，却没有使用 DSH 子 Agent 生命周期。DSH UI 的诊断符合其原生合同。

### 2.2 主会话长时间没有反馈的架构原因

DSH 原生 continuable subagent manager 已经负责：

- 创建、恢复、follow-up、interrupt 和子级所有权；
- 在创建时捕获父 Session 的显式 Sandbox 模式；
- 把子 Agent 审批策略固定为 `never`，避免无人处理的审批提示；
- 子 Agent settlement 后向在线直接父级投递终态通知；
- 通过 `report` 把选定进度交回父级；
- 冷恢复和持久子级目录。

当前 Tianwen 没有使用这条原生路径，而是分别自建 Planner/Task Agent、进度交接和终态补交。结果是权限、子 Agent 身份、完成通知和用户进度不再共享同一套生命周期。

### 2.3 学习产品闭环并未真正接通

当前安装产品可以完成：

```text
Goal Task 结果
→ Tianwen 自建的“有帮助 / 需要改进”按钮
→ Learning Intake
→ 改进线索
→ 用户点击“分析一次”
→ 打开独立分析 Session
→ 用户标记已审阅
```

仓库底层已经拥有 Candidate、paired evaluation、Shadow、Promotion、Rollback 和恢复合同，但普通用户没有一条在主对话中走通上述治理链的产品路径。普通 DSH 对话中的原生 Message Feedback 也没有进入 Tianwen Learning Intake。

这说明当前主要空缺不是继续扩建 Goal，而是把已有学习治理能力接成主对话中的真实闭环。

## 3. 产品边界

### 3.1 唯一必要操作面

DSH 主对话是唯一必要操作面。以下事项必须在主对话完成：

- 发起任务和补充方向；
- 看到工作已经开始；
- 查看有意义的阶段进度；
- 得知权限不足、执行失败、等待条件和最终完成；
- 使用 DSH 原生 Message Feedback；
- 看到学习分析、Candidate 评测、采用或拒绝结果；
- 完成扩大权限、改变顶层目标、不可逆影响和重大价值取舍等决定。

用户不能被要求打开 Planner、Task、分析 Session、评测 Session 或其他子 Agent 才能批准、恢复、了解进度或取得结果。

### 3.2 可选高级审计页

可以保留一个只读、可选的高级审计页，用于查看：

- Goal、Task、Run 与 Session 绑定；
- Evidence 来源；
- Learning Signal、Ticket、Case、Lesson 与 Candidate；
- Evaluation、Shadow、Promotion 和 Rollback 收据；
- 历史故障和恢复记录。

审计页不得提供正常流程必需的“批准”“继续”“分析”“重试”或“标记完成”按钮。它不能成为主对话以外的第二控制面。

### 3.3 Goal 的位置

DSH Goal 继续负责当前 Session 的执行目标。Tianwen 长 Goal Graph 只在确实需要跨 Task、Run、Session 协调时使用，是学习控制面的可选任务编排能力，不再是产品核心叙事或学习入口前提。

普通 DSH 对话即使没有创建 Tianwen 长 Goal，也必须能够通过原生 Message Feedback 进入学习循环。

## 4. 能力所有权

| 能力 | 所有者 | 处理方式 |
| --- | --- | --- |
| Model、Provider、Agent Loop、Tools、MCP | DSH | 直接复用 |
| Session、Resume、Fork、Compaction、Query | DSH | 直接复用 |
| 当前执行的 Goal、Plan、Todo | DSH | 直接复用 |
| Sandbox、权限预设、Approval Policy | DSH | 直接复用 |
| Subagent 创建、恢复、报告、终态通知、目录 | DSH | 直接复用 |
| 每条最终回复的 Message Feedback 与 UI | DSH | 直接复用 |
| Session Projection、Session Reference | DSH | 直接复用 |
| 当前进程内 Jobs、Workflow | DSH | 合同匹配时直接复用，不强行替代治理状态机 |
| Message Feedback 到 Learning Intake | Tianwen 薄适配 | 新增 feedback bridge |
| Task/Run 到 DSH child/Session/Goal | Tianwen 薄适配 | 保存身份和 Evidence 引用，不复制 Session |
| 主对话进度策略与离线终态补交 | Tianwen 薄适配 | 复用原生 report/settlement，只补 DSH 不保证的离线交付 |
| 权限受限后的尝试换代 | Tianwen 薄适配 | 等待主 Session 权限扩大后创建新 child epoch |
| Evidence provenance 与 Run Manifest | Tianwen | 保留 |
| Signal、Ticket、Case、Attribution、Lesson | Tianwen | 保留并补全产品编排 |
| Candidate、Evaluation、Shadow、Promotion、Rollback | Tianwen | 保留并接入主对话 |
| 跨 Run 长 Goal Graph | Tianwen | 可选保留，不作为学习前提 |

任何 Session 只要以 DSH `origin: 'subagent'` 进入原生子 Agent 目录，就必须由 DSH subagent service 创建并持有完整 descriptor。Tianwen 不再通过普通 `agents.create()` 伪装子 Agent。

这不禁止隔离评测服务使用 DSH `agents.create()` 创建不属于子 Agent 谱系的内部评测 Agent；这类 Session 不得写入虚假的 subagent lineage，也不得复制 DSH 已有的生命周期。

## 5. 主对话执行链

### 5.1 正常路径

```text
用户在 DSH 主对话提出任务
→ 主 Agent 判断是否需要内部委派
→ DSH 原生 startContinuable 创建 child
→ 同一主对话 Turn 告知用户已开始及当前阶段
→ child 通过 report 汇报有意义的阶段变化
→ parent 在主对话汇总，不暴露内部协作负担
→ DSH 原生 settlement 通知在线 parent
→ parent 在主对话给出最终结果、证据边界和下一步
```

主 Agent 汇总多个 child 的状态。用户看到的是一个项目进度，不是四个互相独立、需要逐个打开的会话。

### 5.2 进度合同

进度由状态变化驱动，不由用户轮询驱动：

- 后台委派成功后，主 Agent 在同一个 Turn 中确认“已经开始”，说明当前阶段；
- child 在阶段开始、阶段完成、发现阻塞和结算时使用原生 report；
- 如果活跃执行 120 秒没有任何可见状态变化，Tianwen liveness adapter 向主 Session 投递一条基于持久事实的状态；
- 仍无变化时，后续提醒最长间隔五分钟；发生阶段变化后重新计时；
- 状态只能说明已知阶段、最后一次已完成动作、当前等待条件和下一步，不允许生成虚假百分比；
- blocker 和 terminal settlement 一经观察，立即结束静默计时并回到主对话；
- 多个 child 同时报告时由 parent 合并，避免每个 child 各自产生噪声。

该 liveness adapter 是 Tianwen 的产品策略，不是第二套子 Agent 管理器。它使用 DSH 的 inbox/report/follow-up 投递，不直接写第二份对话记录。

### 5.3 主 Session 离线

DSH 原生 settlement 对在线 parent 提供可靠交付，但 parent 已完全卸载时，终态通知可以不再唤醒或保留。Tianwen 因此保留一个最小 delivery cursor：

- 只记录 Tianwen-owned Goal/Task 的 terminal event identity、目标 parent Session 和是否已形成完成 Turn；
- parent 下次变为 live 时先核对 Session 日志和 Tianwen terminal state；
- 尚未交付才投递一次；
- 已经存在完成 Turn 时只补记 cursor，不重复生成回复；
- 绝不因为补交失败重跑 Task；
- 在线路径完全交给 DSH，补交层不竞争原生 settlement。

## 6. 权限设计

### 6.1 原生继承

DSH child 在创建时捕获 parent Session 的显式 Sandbox 模式，并把 child Approval Policy 固定为 `never`。因此：

- parent 为“完全访问”时，新 child 获得对应的委派范围；
- parent 未显式切换时，child 遵循 DSH 部署默认行为；
- child 不能通过自己的审批请求扩大权限；
- parent 后续改变权限，不会追溯改变已经存在的 child。

Tianwen 不新增批准/拒绝按钮，不要求用户进入 child，也不把 child 的无人审批卡片当作产品流程。

### 6.2 权限不足恢复

当 structured sandbox/tool result 证明权限不足时：

1. 当前 attempt 标记为 `permission-limited`，不是 Task 失败；
2. 不产生 Learning Signal，不归因成模型或 Skill 能力问题；
3. child 以原生 report/settlement 把限制交回主对话；
4. 主对话告诉用户需要把当前 DSH Session 切换成什么权限；
5. 用户在主 Session 改变权限后，Tianwen 观察新的权限 revision；
6. 如果 Task 仍然有效且权限指纹确实扩大，创建新的 child attempt epoch；
7. 新 child 继承新权限并继续同一个 Task，旧 child 保留为历史 Evidence；
8. 每个相同权限指纹最多自动创建一个 attempt，防止循环重试。

如果只有 child 自由文本声称权限不足、却没有结构化工具或 Sandbox 证据，系统不得自动扩大或换代；它只能在主对话说明“疑似权限限制，需要核实”。

## 7. 原生反馈到学习循环

### 7.1 单一反馈来源

DSH `message_feedback` sidecar 是当前用户反馈的事实来源。Tianwen 删除自己的 Goal Task Feedback 存储、RPC 和按钮，不再要求用户先找到 Goal/Task 详情页。

Tianwen feedback bridge 消费 DSH 已持久化的 Message Feedback，并建立：

```text
DSH SessionId + assistant MessageId + feedback version
→ workspace/scope
→ Run/Task/Goal 引用（若存在）
→ Session/Evidence digest
→ Tianwen Learning Intake
```

没有 Tianwen Goal 绑定的普通主对话仍可以建立 workspace-scoped Learning Intake。

DSH feedback target 是任意一条已经持久化、append-origin、非空的最终 assistant message，不等于“整个 Session 的最后一条 assistant message”。因此 Tianwen Runtime 必须删除当前 `consume()` 对 Session 最后回复的假设：

- 当前反馈值的身份键是 `(sessionId, messageId)`；
- `feedback version` 表示这个键的一次可编辑 revision，不是 Session 级版本；
- 同一 Session 可以同时存在多条消息的反馈和多个独立 intake；
- Learning Intake 查询不能继续只用 `sessionId` 返回一个状态，必须支持按 `(sessionId, messageId)` 精确查询和按 Session 枚举；
- 旧 ledger 记录已经包含 `messageId`，迁移索引时从事件事实重建，不改写旧事件；
- 进度回复、阶段总结、普通终答和 Goal 终答都遵循同一消息级入口，再由 Evidence binding 标记消息在用户流程中的角色。

这项键空间修正是接入 DSH 原生反馈的前置条件，不是实现细节优化。

### 7.2 反馈语义

- positive：记录有效结果，默认不创建 Case；
- negative 且没有 note：记录 observed gap，等待更多证据；
- negative 且有明确 note：形成或合并 explicit-correction Signal/Ticket；
- 同一条反馈的新 version：追加 superseding intake，旧版本保留审计但不再代表当前用户意见；
- 删除反馈：追加 retraction，不删除历史事实；
- 只依赖已撤回证据的 Case、Lesson、Candidate 或 Promotion recommendation 自动失效；
- 仍有其他独立有效证据时，重新计算支持范围，不机械删除整个 Ticket。

反馈更新与撤回必须是正式学习语义，不能只处理首次点击。

### 7.3 Bridge 一致性与恢复

Message Feedback 先由 DSH 完成目标消息 durability barrier 和 sidecar 持久化；Tianwen 只能在其后追加 Learning Intake，不能把两者伪装成一个跨系统事务。feedback bridge 因此采用可重放补偿：

- 在同一 Host 进程监听 `domain/changed` 中 `message_feedback` domain 的耐久变更；
- 用 `(sessionId, messageId, feedbackVersion)` 作为幂等摄取身份；
- 对整行新 snapshot 与上次已处理 snapshot 做差异，识别 put、supersede 和 retraction；
- Evolution 写入失败时不回滚 DSH 用户反馈，保留未处理状态并重试；
- Runtime 启动、相关 Session 重新变为 live、以及只读状态查询时都可以通过 `messageFeedback.list` 做幂等 reconciliation；
- reconciliation 只能补缺失 intake，不重复 Signal/Ticket；
- 主对话只能在 Evolution receipt 已经耐久后声称“已形成改进线索”；DSH 已记录反馈但 Tianwen 尚未摄取时，只能说明“反馈已保存，学习处理待恢复”。

DSH storage-domain 的 change event 只有单进程可见性，但当前正式产品只有一个 DSH Host 写同一 profile。未来若允许多个 Host 共享存储，必须先增加跨进程 revision/reconciliation 合同；本阶段不假设它已经存在。

### 7.4 一次性隐私说明

首次启用 Tianwen 自动学习时，主对话一次性说明：

- DSH 原生反馈默认不进入模型；
- 开启 Tianwen 自动学习后，negative feedback note 和收到反馈的回复会被发送给当前配置模型，用于内部分析；
- 分析不会直接修改当前项目、安装 Skill 或扩大权限；
- 学习结果只在经过评测和治理后影响未来 Run；
- 用户可以关闭自动分析。

用户确认后保存 profile-scoped consent。之后不再对每条反馈重复询问，也不再要求点击“分析一次”。未取得 consent 时，Tianwen 可以记录 rating 和 Evidence 绑定，但不得把 note 发送给模型；历史 note 不在 consent 后自动追溯分析，除非用户在主对话明确要求。

## 8. 学习闭环编排

### 8.1 第一条正式产品闭环

第一条要真正跑通的闭环是显式用户纠正，不同时扩展自动 Outcome 推断：

```text
DSH negative feedback + note
→ Learning Intake
→ Signal/Ticket 去重
→ 原生内部 analysis child
→ Attribution
→ Case / Lesson
→ 有限 Skill Candidate
→ 既有 paired controlled evaluation
→ 隔离 Shadow
→ Promotion recommendation
→ 未来 Run 激活或拒绝
→ 回滚能力保持可用
```

自动 Outcome 学习继续要求冻结真实验收合同，不能用“Goal complete”代替任务有效。它不属于本次首条闭环。

### 8.2 内部分析

- 通过 DSH 原生 child 生命周期运行；
- 使用限制后的 persona/toolFilter，默认只读且不提供项目写工具；
- 通过 DSH Session Reference 获取有界、标注为不可信的来源快照；
- 原始 Session 仍是执行事实来源，Tianwen 不复制第二份 transcript；
- 分析可以得出 no Case、证据不足或需要更多样本；
- 分析结果通过 child report 回到主对话；
- 不提供“打开分析 Session”作为必要下一步。

### 8.3 Candidate 与采用

首条闭环只生成作用域明确、数量有限、可回滚的 Skill Candidate。Candidate 不得修改 DSH Runtime、Sandbox、权限策略或顶层 Goal。

评测与 Shadow 在现有权限、可恢复影响和已冻结协议内自动执行。只有以下情况回到主对话请求决定：

- 需要扩大 DSH 权限；
- 需要不可逆外部动作；
- 改变顶层 Goal 或成功标准；
- 多个候选体现无法由证据决定的产品价值取舍；
- 现有授权没有覆盖的高影响行为。

通过全部门的 Candidate 只更新未来 Run 的 active pointer，不热换当前 Run。Promotion、拒绝和自动 Rollback 都在主对话给出简短结果；详细 Evidence 留在只读审计页。

## 9. 数据与持久化边界

### 9.1 权威事实

- DSH Session log：模型、工具、Goal、消息和执行事实；
- DSH Message Feedback sidecar：当前用户反馈值；
- Tianwen Evidence store：来源和用途绑定；
- Tianwen Evolution ledger：追加式学习与治理事实；
- Tianwen Long Goal state：可选跨 Run 编排状态；
- Tianwen delivery cursor：只补离线 parent 终态交付。

Tianwen 不复制完整 DSH Session，也不把原生 Message Feedback 再保存成一套可编辑当前值。Evolution ledger 可以保存 feedback version、digest、必要的私密 note 及 supersession/retraction 事件，用于可审核学习。

### 9.2 不整体迁移 Evolution ledger

DSH storage-domain 适合非 Session sidecar 和简单 schema-backed KV，但当前合同没有跨表事务、二级索引或多进程条件写。Tianwen Evolution ledger 已经承担追加完整性、Candidate 链、pointer transition、恢复失败和可审核重放。

因此本阶段不把 Evolution ledger 整体迁移到 storage-domain。profile consent、轻量 delivery cursor 等简单状态可以在实现计划中评估 storage-domain；不能为了统一存储形式牺牲已经验证的治理完整性。

## 10. 故障语义

以下状态必须分开，不能都显示成“失败”：

| 状态 | 主对话处理 | 是否进入学习 |
| --- | --- | --- |
| permission-limited | 指示主 Session 修改权限，等待新 attempt | 否 |
| transient tool/provider failure | 有界重试或说明停止原因 | 默认否 |
| Task objective not met | 汇报真实结果与证据 | 视归因和重复性判断 |
| user explicit correction | 形成或合并 Signal/Ticket | 是 |
| analysis no Case | 说明证据不足或不可复用 | 保存结论，不建 Candidate |
| Candidate evaluation failed | 拒绝 Candidate，保持当前版本 | 保存反证 |
| Shadow regression | 自动停止分配并 Rollback | 形成新的治理 Evidence |
| delivery failure | 保留 cursor，下次 parent live 补交 | 否，不重跑 Task |
| genuine Session corruption | 主对话说明无法安全读取，保留现场 | 否，先修基础设施 |

运行时限制、权限限制和产品交付故障不得污染学习归因。

## 11. 旧版伪子 Agent 迁移

旧 Session 不追加伪造 descriptor，也不修改既有事件。DSH 当前没有公开的持久 Session archive/delete seam，因此升级迁移采用可恢复的离线归档，而不是在线删除：

1. 只匹配同时满足以下条件的 Session：被 Tianwen v3 Long Goal state 明确引用；header 为 Tianwen 旧版写入的 subagent lineage；日志已 settle；日志没有 `subagent/descriptor`；
2. 未满足全部条件的 Session 一律不动；
3. DSH Host 必须关闭后才允许迁移；
4. 迁移前为每个 Session 记录原路径、header identity、字节数和 SHA-256；
5. 将目录移动到 DSH Home 之外、仍位于 `D:\DevData` 的 Tianwen legacy archive；
6. 写入可逆 manifest，支持精确恢复原路径；
7. 只读审计页通过 Long Goal state 和 archive manifest 继续显示历史；
8. 重新启动 DSH 后确认活动目录不再把这些记录列为损坏子 Agent；
9. 不自动删除 archive。

迁移必须单独测试 dry-run、unknown-session refusal、partial-move recovery 和 restore。未经这些证据，不对用户真实历史执行移动。

## 12. 删除、保留与延后

### 12.1 删除或退出主路径

- `goal-task-feedback` 自建当前值、RPC 和按钮；
- `feedback-status` / `record-task-feedback` 产品入口；
- 必须打开 Learning Clue 页面才能分析或审阅的路径；
- “打开分析 Session”必要操作；
- 用 `agents.create()` 加 `origin=subagent` 伪装 Planner/Task 的路径；
- 与 DSH 在线 settlement 竞争的第二套正常交付；
- 把 Goal-first 详情页写成学习唯一入口的产品叙事。

历史 API 可以在一个明确兼容期内保持只读，不能继续接受新的重复写入。

### 12.2 保留

- Evolution ledger 及完整性合同；
- Evidence 来源、scope 和用途绑定；
- Learning Intake 的去重与安全状态；
- controlled evaluation、Shadow、transition 和 recovery；
- 可选 Long Goal Graph；
- parent 离线时最小终态 delivery cursor。

### 12.3 延后

- 自动 Outcome 学习；
- 无限候选、候选锦标赛和自动组合；
- 全量 ledger 存储迁移；
- 为了形式统一而把治理状态硬塞进 DSH Jobs/Workflow；
- 删除高级审计页；
- 让 Candidate 改写 Runtime、权限或顶层 Goal。

## 13. 验收故事

### 13.1 普通主对话与无感委派

1. 用户在普通 DSH 主对话提出一个需要内部委派的真实任务；
2. 主对话确认开始并持续给出阶段进度；
3. 用户不打开任何 child；
4. 新 child 日志包含合法 descriptor 和 delegated permission events；
5. DSH 子 Agent 目录没有 `corrupt` diagnostic；
6. 最终结果回到原主对话；
7. Tianwen 开启但没有学习变化时，普通 DSH 工具行为与关闭 Tianwen 等价。

### 13.2 权限不足后主会话恢复

1. 主 Session 使用受限权限开始需要更宽访问的 Task；
2. child 审批策略为 `never`，不会出现无人批准卡片；
3. 主对话说明需要把当前 Session 改为“完全访问”；
4. 用户只修改主 Session 权限，不进入 child；
5. Tianwen 创建新的 child attempt，旧 child 权限不被篡改；
6. 新 child 继承扩大后的权限并完成；
7. permission-limited attempt 不产生 Learning Signal。

### 13.3 重启和离线交付

1. child 运行期间重启 DSH；
2. DSH 原生冷恢复继续 child；
3. parent 离线时 child settle；
4. parent 下次打开后只收到一次终态总结；
5. Task 没有重复执行，已有完成 Turn 不重复生成。

### 13.4 原生反馈到未来 Run 改进

1. 用户对主对话最终回复使用 DSH 原生 negative feedback 并填写明确 note；
2. 已存在自动学习 consent；
3. feedback bridge 建立 Evidence 和 Learning Intake；
4. 内部 analysis child 自动运行，用户不打开它；
5. 分析结论回到主对话；
6. 系统产生有限 Candidate，完成 paired evaluation 和 Shadow；
7. 通过门后只影响一个新的未来 Run；
8. 当前 Run 不发生热换；
9. 人为注入回归后可以 Rollback；
10. Promotion、Rollback 和 Evidence 在只读审计页可查。

### 13.5 反馈更新和撤回

1. 用户修改同一消息的反馈 note；
2. 新 version supersede 旧 version，不重复形成相同 Signal；
3. 用户删除反馈；
4. Tianwen 记录 retraction；
5. 只依赖该反馈的未晋升 Candidate 失效；
6. 已发生的历史审计记录不被删除或改写。

### 13.6 旧记录迁移

1. dry-run 只列出满足全部 Tianwen legacy 条件的旧 Session；
2. 关闭 Host 后执行归档并写 manifest；
3. 重启后主 Session 不再显示这些记录为损坏 child；
4. 审计页仍能显示 Goal/Task 历史；
5. restore 能按 manifest 精确还原；
6. 任意未知、活动中或已含 descriptor 的 Session 均不移动。

## 14. 验证层级

完成声明必须同时满足：

1. **合同测试**：权限快照、descriptor、attempt epoch、feedback supersession/retraction、delivery idempotency；
2. **集成测试**：真实 DSH base/web profile，原生 subagent/message-feedback/session-reference；
3. **故障测试**：Host restart、parent offline、provider failure、permission-limited、partial legacy migration；
4. **产品测试**：只使用主对话完成全部必要操作；
5. **真实 Desktop 验收**：按第 13 节逐项走通并保存证据；
6. **非干扰门**：没有 Tianwen-specific input 时，DSH 既有行为不退化。

测试通过不能代替真实用户流程，真实流程成功也不能代替合同测试。最终交付前必须由执行者先完成模拟用户验收，不能再次把首轮失败留给项目所有者发现。

## 15. 实施边界和顺序

后续 implementation plan 应按以下依赖顺序拆分，但本文不直接授权执行：

1. 冻结 DSH 原生 subagent、permission 和 message-feedback 契约探针；
2. 替换 Planner/Task 的伪 subagent 创建与在线 settlement；
3. 接入主对话进度和 permission-limited attempt 换代；
4. 接入 DSH Message Feedback bridge、consent、supersession 和 retraction；
5. 把 Learning Ticket 分析改为内部原生 child 并回报主对话；
6. 连接现有 Candidate/evaluation/Shadow/transition 为第一条显式纠正闭环；
7. 删除或只读化重复 UI/RPC；
8. 完成可恢复 legacy archive migration；
9. 在正式安装产品上按第 13 节完整验收；
10. 验收通过后才更新 canonical 架构与发布声明。

每一阶段只实现当前用户故事需要的最小 seam，不新建通用调度器、第二套 Session、第二套权限系统或第二套反馈系统。

## 16. 已批准决策

- Tianwen 核心是学习循环和自我改进，不是 Goal；
- Tianwen 无感内化在 DSH 使用过程中；
- 用户全程在主对话完成正常操作；
- DSH 主 Session 权限是唯一用户权限入口；
- 不增加 Tianwen 批准/拒绝按钮；
- 高级审计页可以保留，但只读且可选；
- 首次启用时一次性说明并授权自动模型分析反馈，之后不逐条确认；
- 采用渐进式原生收敛，不点状修补，也不整体重写；
- 修复后由执行者先模拟真实用户完整验收，再交项目所有者验收。
