# 天问 PydanticAI + Harness 集成设计

**状态：** 已获用户确认，尚未开始实现

**日期：** 2026-08-11  
**范围：** 首个可验证持续学习切片  
**研究记录：** `docs/continuous-learning-agent-research-notes.md`

## 1. 目的

本规格定义天问怎样复用 PydanticAI 和 PydanticAI Harness，同时避免退化成框架套壳。

首切片必须证明：

```text
真实任务证据
→ 受治理的学习候选
→ Champion/Challenger 保护评测
→ 晋升或拒绝
→ 不同后续任务
→ 更新真实效果结论
```

成熟框架负责通用能力；天问只为目标主权、权威状态、动作治理、证据语义、持续学习和版本治理编写差异化代码。

## 2. 已固定的决定

1. Runtime 使用 Python。
2. PydanticAI 负责模型、Provider、工具往返、流式事件和结构化输出。
3. PydanticAI Harness 提供可组合的通用 Agent 能力。
4. Goal、Loop、Task、Run、Action、Event、Checkpoint、预算、授权、正式证据、评测和版本语义由天问掌握。
5. 只有同条件证据证明当前底座长期达不到关键门槛时，才把 Hermes Fork 作为 Challenger。
6. Pi 只作为模块化和交互参考，不进入第一版依赖。
7. 不把 PydanticAI 或 Harness 私有 API 作为稳定依赖。
8. 首切片采用 Python 模块化单体、本地 SQLite 和简单 CLI。

## 3. 权威对象模型

### 3.1 Goal

Goal 是由人类确认的长期意图契约，至少记录：

- 核心意图和目标对象；
- 完成证据；
- 约束与非目标；
- 授权包络；
- 预算；
- 暂停、升级和停止条件。

用户 Goal 与长期“完善天问”元 Goal 是不同 Goal。Agent 可以提出修改建议，但只有人类能修改核心意图和授权包络。

### 3.2 Loop

Loop 是追求 Goal 的持久过程，通过 `parent_loop_id` 形成父子树。每个 Loop 内部都有：

```text
任务执行循环
+ 学习更新循环
```

用户循环、元目标循环和派生子目标循环使用同一协议。“内联、后台、延期、放弃”只是调度方式，不是新的核心循环类型。

### 3.3 Task 与 Learning Job

Task 是具有明确完成条件的有限工作。

Learning Job 是学习更新循环中的专用 Task，记录问题、来源证据、假设、允许修改的目标对象、预算、进展定义、停止条件和交付物。

Learning Job 不自动成为新 Goal。值得独立长期追踪的问题先在现有 Goal 下创建子 Loop，再由子 Loop 安排 Learning Job 和 Run。

### 3.4 Run 与 Session

Run 是一次 Task 执行尝试，也是天问的权威执行身份。Session 只是 Run 内部的模型上下文。

一个天问 Run 可以跨越多个 PydanticAI `Agent.run(...)` 调用。每次框架调用使用不同的框架 `run_id`，并通过共同的 `conversation_id` 关联；Runtime 适配层保存它们与天问 Run ID 的映射。

上下文压缩、进程恢复或上下文重建可以让同一 Run 使用多个 Session，但不能重置：

- Run ID；
- 行为版本；
- 权限；
- 已消耗预算；
- 工作区基线；
- Action 和失败历史。

改变主要策略、Skill 版本、工作区快照或实验基线时创建新 Run。

### 3.5 Action、Event 与 Checkpoint

- Action 结算一个真实工具动作；
- Event 追加已经观察到的事实；
- Checkpoint 标识安全、可复现的恢复位置。

模型总结只能解释这些记录，不能改写它们。

## 4. 双平面架构

### 4.1 Harness 执行平面

Harness 负责：

- 内部模型消息；
- 原始 Step 与工具轨迹；
- FileSystem 和 Shell 实现；
- 步骤快照和内部副作用记录；
- 单次执行计划；
- 加载本次有效 Skill；
- 输入/输出 Guardrail，以及审批与延后执行原语。

它保存“执行录像”，不拥有事实的最终解释权。

### 4.2 天问控制与证据平面

天问负责：

- Goal 与 Loop 协调；
- Task 与 Run 身份；
- 授权和预算；
- 正式 Action Ledger；
- 标准化证据；
- Checkpoint 与恢复决定；
- Skill 和策略版本；
- 评测、晋升、路由和回滚；
- 用户进度与决策摘要。

两个平面发生冲突时，以天问冻结的授权决定和 Action 状态为准；Harness 原始轨迹只用于核对。

### 4.3 适配边界

PydanticAI 与 Harness 对象只存在于 Runtime 适配层：

```text
run
resume
cancel
stream_events
```

Goal、学习、版本和对外接口只使用天问类型。框架 ID 可以作为调试引用，不能替代正式身份。

## 5. Harness 能力范围

### 5.1 首切片启用

- FileSystem
- Shell
- StepPersistence
- InputGuardrail 与 OutputGuardrail（不承担工具授权）
- Skills

### 5.2 条件启用

只有仓库任务证明持久执行计划能明显减少自研代码或改善恢复时，才启用 Planning。Harness Plan 仍从属于天问 Goal、Loop 和 Task。

### 5.3 延后

- 长期 Harness Memory；
- 自动 Skill 写入；
- 动态运行期能力；
- 子 Agent 与 Worker 编排；
- 复杂上下文压缩策略；
- 浏览器和真实账户能力。

这样首切片只验证一个学习对象，不同时引入多个无法归因的变量。

## 6. 存储与保留

### 6.1 逻辑分层

```text
tw_*                 天问权威状态与正式证据
Harness 管理的表       Harness 原始执行轨迹
```

天问只管理 `tw_*` 表。Harness 表名和结构由它自己的公开 `StepStore` 接口管理，天问产品代码不直接查询、修改或迁移这些表。

如果 Harness 公开接口支持外部指定数据库并安全共存，首切片优先共用一个 SQLite 文件；否则允许在同一数据目录使用两个 SQLite 文件。逻辑所有权和稳定引用是硬要求，共用物理文件不是。

### 6.2 证据映射

只有影响 Goal、授权、学习、评测或版本的事实进入天问证据层。标准化记录至少引用：

- 来源 Run 与 Action；
- Harness Step；
- 内容或产物哈希；
- 证据类型；
- 脱敏摘要；
- 模型、Agent、Skill 和策略版本；
- 观察时间。

转换游标保证幂等。转换进程崩溃后，从最后游标重新扫描 Harness 轨迹并补齐，不重复写入证据。

### 6.3 保留策略

- 正式证据由 Goal 和数据治理规则决定保留周期；
- 原始轨迹首切片不按固定天数自动删除；
- 默认原始轨迹达到 1 GiB 时提醒用户；
- 超限只提供查看、压缩、导出或删除选择，不静默清理；
- 凭证、密钥和敏感载荷在写入前脱敏，或替换成受保护引用。

## 7. Action Gateway 集成

模型只能获得经过天问包装的 Harness Toolset，不能同时注册原始 FileSystem、Shell 或未来 MCP 能力。

```text
模型提出工具调用
→ PydanticAI 工具执行前钩子进入 Tianwen Action Gateway
→ 创建并持久化冻结 Action Proposal
→ Policy Engine 返回 allow / notify / ask / deny
→ Capability Executor 调用同一个 Harness 冻结能力
→ Reconciler 核对结果
→ Action Ledger 结算
→ Evidence Mapper 生成正式证据
→ 结构化结果返回模型
```

### 7.1 冻结审批

审批绑定：

- `action_id`；
- 工具和目标；
- 参数摘要；
- Goal、Loop、Task、Run；
- 工作区；
- Skill 与策略版本；
- Grant 范围和有效期。

任一绑定字段变化都必须创建新 Action。

### 7.2 四种决定

- `allow`：执行并记账；
- `notify`：执行、记账并非阻塞通知；
- `ask`：持久化请求，只暂停依赖分支；
- `deny`：不执行，返回结构化原因和合规替代方向。

PydanticAI 的公开工具执行前钩子是统一拦截入口；Harness 的 InputGuardrail 和 OutputGuardrail 只作为输入/输出内层保护。天问 Policy Engine 与 Action Ledger 拥有最终授权语义。

### 7.3 结果语义

- 已知成功或失败正常结算；
- Shell 非零退出码是已知结果，不是 `unknown`；
- 可能发生副作用后崩溃或超时，进入 `unknown`；
- `unknown` 禁止盲目重试；
- Task 是否成功由验收器决定，不由工具完成决定。

Harness Shell 规则不是操作系统安全边界。首切片只在受限 worktree 或临时仓库中运行，并限制路径、命令、环境变量、超时和输出。

## 8. Skill 版本主权

天问 Skill Registry 保存不可变 Skill 版本，包括：

- Skill 与版本 ID；
- 父版本和内容哈希；
- 来源证据；
- 适用范围与已知限制；
- 所需能力和权限前提；
- 评测记录；
- 状态与晋升历史。

Run 创建时：

```text
选择 Skill 版本
→ 冻结到 Run
→ 物化只读有效 Skill 视图
→ Harness 加载
```

已经开始的 Run 不因后续晋升切换 Skill。普通用户 Run 不能修改活跃 Skill；学习 Run 只能写 Challenger 暂存区。晋升原子切换活跃版本指针，拒绝和回滚都保留版本与历史 Run 绑定。

首切片关闭 Harness 自动或 Agent 管理的 Skill 写入。

## 9. 多目标循环协调

### 9.1 用户目标循环

用户 Loop 执行仓库 Task，产生真实产物，验证结果并写入正式证据。

### 9.2 “完善天问”元目标循环

元 Loop 只订阅受治理的证据视图，聚类重复问题、明确反馈、意外成功、版本回归和未解决的 `unknown`。

值得处理的问题创建有限子 Loop。首切片唯一允许的学习目标对象是 `repo_task`。

### 9.3 首切片串行调度

- 前台用户工作优先；
- 用户 Run 结束或等待后，子改进 Loop 才运行；
- 每个 Loop 拥有独立预算、权限、工作区、版本和证据；
- 不需要守护进程、消息队列、并发 Worker 或子 Agent；
- 学习失败返回问题聚类层，不递归产生无限学习任务。

### 9.4 用户可见进度

任务进度和学习进度分开展示。默认摘要至少说明：

- 当前 Goal、Loop、Task 和阶段；
- 已经验证的事实与产物；
- 当前公开假设和依据；
- 正在执行什么、为什么；
- 下一步与停止条件；
- 预算消耗；
- 风险、阻塞和用户介入价值；
- 当前 Champion 与 Challenger 状态。

界面展示结构化决策摘要，不暴露或长期保存未经整理的模型思维流。Harness 原始轨迹只在用户主动展开审计详情时使用。

## 10. 完成语义

```text
Run 已结束
≠ Task 已达标
≠ Goal 已完成
```

### 10.1 Run

`completed` 表示执行正常结算且结果已知；Runtime 无法形成可靠结果时使用 `failed`，用户取消使用 `cancelled`。

### 10.2 Task

受保护的验收器返回：

- `met`
- `not_met`
- `inconclusive`

先运行确定性检查，再运行规则检查；只有无法完全程序化的质量问题才补充模型评审。

### 10.3 Goal

客观 Goal 在全部保护条件通过后可以自动完成；主观 Goal 进入 `ready_for_review`，等待用户验收。

Learning Job 可以以晋升、拒绝、证据不足、归因错误或预算耗尽报告结束。Learning Job 结束不代表发生了进化。

## 11. 恢复与错误处理

以下位置形成 Checkpoint：

- Run 身份、版本、权限和预算冻结后；
- 副作用 Action 前；
- Action 结算后；
- Task 阶段切换时；
- 等待输入或审批前；
- 预算即将耗尽时；
- Run 终态结算前。

启动恢复：

```text
安全 Checkpoint 且无未结算 Action
→ 自动继续

等待输入或审批
→ 恢复等待状态

Action 结果已知
→ 补齐证据后继续

Action 可能已执行但未结算
→ 标记 unknown
→ 核对
→ 能证明则继续，否则局部暂停
```

Harness Session 无法原样恢复时，可以在同一 Run 下创建新 Session 并追加 `context_rebuilt`，但不能重置版本、权限、预算、工作区基线或历史。

等待审批的消息历史属于天问 Checkpoint。Runtime 使用 PydanticAI 公开的 `all_messages_json()` 保存，使用 `ModelMessagesTypeAdapter.validate_json(...)` 恢复，再提交 `DeferredToolResults`；不能假定 Harness `StepPersistence` 会为尚未闭合的待审批工具调用创建可恢复快照。

其他规则：

- Action 执行前无法写账本时禁止执行；
- 副作用后无法写结果时进入 `unknown`；
- 普通进度事件转换失败时从原始轨迹补齐；
- 评测记录不完整时禁止晋升；
- 预算耗尽时保存 Checkpoint 和报告。

## 12. 测试策略

### 12.1 确定性单元测试

覆盖状态转换、权限决定、参数冻结、预算继承、Skill 版本冻结、证据幂等、恢复分类、晋升和回滚。

### 12.2 Harness 契约测试

锁定的 PydanticAI 与 Harness 版本必须通过公开接口证明：

- Action Gateway 通过公开工具钩子在副作用前拦截；
- InputGuardrail 与 OutputGuardrail 只处理输入和输出；
- 暂停与恢复语义可映射；
- FileSystem 根目录和受保护路径有效；
- Shell 限制与已知结果语义正确；
- StepPersistence 可以重放并提供副作用记录；
- Skills 可以从物化只读视图加载。

任何依赖升级都必须先通过这组测试。

### 12.3 临时 Git 集成测试

验证文件和命令边界、Action 冻结、审批恢复、副作用前后崩溃、`unknown` 核对、Git diff、回滚和原始工具不可绕过。

### 12.4 Champion/Challenger 保护评测

两个版本使用等价模型、任务输入、预算、工具、工作区基线和验收规则。先通过正确性与安全门槛，再比较质量、Token、延迟、工具次数和用户打断。

### 12.5 后续真实任务

晋升后的 Challenger 必须用于不同的新 Goal。真实证据可以支持、限制或推翻原改善结论。

普通 CI 使用确定性模型或录制轨迹；真实付费模型评测单独运行并计入学习预算。

## 13. 首条端到端切片

```text
用户 Goal A
→ Champion repo_task Skill
→ Harness FileSystem / Shell 经 Action Gateway 执行
→ 测试、diff、成本、反馈和证据
→ “完善天问”元 Goal 创建 repo_task 子 Loop
→ 有限 Learning Job 形成 Challenger
→ Champion/Challenger 保护评测
→ 首次晋升由用户批准
→ 用户 Goal B 使用新 Champion
→ 后续证据更新改善结论
```

至少一个候选通过保护门槛、改善预先约定的次级指标、进入不同后续任务并仍可回滚，才能初步证明闭环。候选被拒绝只能证明治理工作正常。

## 14. 首切片明确不做

- 桌面或 Web UI；
- 多用户云服务；
- 多个前台 Goal 并发；
- 内部子 Agent 或 Worker 编排；
- 外部 Agent Worker；
- 浏览器和真实账户；
- 自动投递简历；
- MCP 市场和动态工具安装；
- 向量数据库和复杂知识图谱；
- 长期 Harness Memory；
- 任意领域 Skill 生成；
- Runtime 或治理核心自我改写；
- 生产部署；
- 多引擎插件平台。

## 15. 依赖与后备路线

PydanticAI 与 Harness 锁定到契约测试验证过的精确版本；不能因为新版本存在就自动升级。

首个已核查组合为 `pydantic-ai-slim==2.18.0` 与 `pydantic-ai-harness[skills]==0.13.0`。核查结论、限制和适配前提见 [`2026-08-11-harness-contract-audit.md`](../../research/2026-08-11-harness-contract-audit.md)。

公开接口无法满足关键边界时：

1. 缩小首切片能力；
2. 检查是否存在公开扩展点；
3. 把普通模型 SDK 薄循环或 Hermes Fork 作为 Challenger；
4. 不以私有 API 耦合作为默认解决方案。

底座迁移同样需要保护任务、可比预算、真实任务证据和回滚路径。

## 16. 设计验收清单

- 删除 Codex、Hermes、OpenCode 和 Pi 后，天问仍能运行；
- Goal 和授权主权仍由人类掌握；
- 每个 Loop 都包含任务执行循环和学习更新循环；
- Harness 原始状态不能替代天问权威状态；
- 原始工具不能绕过 Action Gateway；
- Skill 版本不可变，并按 Run 冻结；
- 原始轨迹与正式证据逻辑分层；
- 安全状态自动恢复，不确定副作用局部暂停；
- Run、Task 和 Goal 完成结论相互独立；
- Harness 升级必须通过契约测试；
- 首切片只验证 `repo_task`；
- 已撤回的自研基础设施草案不能作为实施依据。
