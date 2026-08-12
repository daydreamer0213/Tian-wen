# 天问 PydanticAI + Harness 集成设计

**状态：** 已完成理论与源码复审；主动探索设计已补充，待用户复核后同步实施计划

**日期：** 2026-08-11（2026-08-12 收口）
**范围：** 首个可验证持续学习切片  
**研究记录：** `docs/continuous-learning-agent-research-notes.md`
**收口研究：** `docs/research/2026-08-12-continual-learning-governance-closure.md`

## 1. 目的

本规格定义天问怎样复用 PydanticAI 和 PydanticAI Harness，同时避免退化成框架套壳。

首切片必须证明：

```text
Goal 与关键知识缺口
→ 本地上下文和必要外部资料探索
→ 带来源的事实、假设、冲突与剩余未知
→ 真实任务证据
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
9. Harness 公开接口契约探针已经通过；锁定组合为 `pydantic-ai-slim==2.18.0` 与 `pydantic-ai-harness[skills]==0.13.0`。
10. 首切片是单用户、本地优先，不上传用户数据，不做跨用户学习。
11. 首切片串行调度，不引入分布式队列、并发 Worker、微服务或第二个 Agent Framework。
12. 首切片只允许 `repo_task` Skill 形成可发布 Challenger；路由和其他策略只能形成研究建议，Runtime、Action Gateway、评测门槛、发布器和不可变底线不开放自我修改。
13. “探索”是主动搜集上下文的正式阶段，不只是描述当前情况和识别未知；首切片同时覆盖受限本地探索与最小外部检索。

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

Learning Job 是学习更新循环中的专用 Task，记录问题、来源证据、假设、允许修改的目标对象、预算、进展定义、停止条件和交付物。普通 Task 与 Learning Job 都可以包含探索阶段；探索阶段使用附着于 Task 的探索简报，不增加新的顶层生命周期。

Learning Job 不自动成为新 Goal。值得独立长期追踪的问题先在现有 Goal 下创建子 Loop，再由子 Loop 安排 Learning Job 和 Run。

用户目标循环和“完善天问”元目标循环都可以派生有限子 Loop。子 Loop 必须继承父 Loop 的 Goal 意图和预算上限，并声明自己的局部目标、输入证据、读写范围、停止条件和返回契约。创建子 Loop 不能重置父级预算。

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

内部状态允许保存丰富事实，但模型不会直接维护完整状态机。主生命周期使用少量状态；等待原因、风险事实、失败原因、重试条件和用户介入需求使用独立字段。合法状态转换由普通程序执行。

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
- 知识缺口、探索简报、信源来源和探索报告；
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
- 受工作区限制的本地搜索，以及由 Action Gateway 包装的 PydanticAI 本地函数工具 `duckduckgo_search` / `web_fetch`

### 5.2 条件启用

只有仓库任务证明持久执行计划能明显减少自研代码或改善恢复时，才启用 Planning。Harness Plan 仍从属于天问 Goal、Loop 和 Task。

### 5.3 延后

- 长期 Harness Memory；
- 自动 Skill 写入；
- 动态运行期能力；
- 子 Agent 与 Worker 编排；
- 复杂上下文压缩策略；
- 浏览器自动化和真实账户能力；
- 通用搜索平台、爬虫、MCP 搜索市场和专业数据库连接。

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
- 观察时间；
- `scope`、`purpose` 和敏感级别；
- 来源对象、父对象和转换版本；
- 保留期限或用户删除策略。

转换游标保证幂等。转换进程崩溃后，从最后游标重新扫描 Harness 轨迹并补齐，不重复写入证据。

“完善天问”元 Loop 不直接查询用户原始对话、文件、路径、命令参数或工具输出。证据映射器通过字段白名单生成 `meta_telemetry` 投影；投影只保留问题类别、动作类别、版本、结果类别、成本分桶、是否需要用户和安全拒绝类别等低敏字段。

### 6.3 保留策略

- 正式证据由 Goal 和数据治理规则决定保留周期；
- 原始轨迹首切片不按固定天数自动删除；
- 默认原始轨迹达到 1 GiB 时提醒用户；
- 超限只提供查看、压缩、导出或删除选择，不静默清理；
- 凭证、密钥和敏感载荷在写入前脱敏，或替换成受保护引用；
- 用户可以查看、导出和删除本地记忆；
- 删除沿来源关系传播到全文索引、摘要、缓存和尚未发布的候选；
- 首切片不把用户数据用于模型参数训练。

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

用户 Loop 执行仓库 Task，产生真实产物，验证结果并写入正式证据。遇到关键未知、局部能力缺口或候选验证时，用户 Loop 也可以派生有限子 Loop。

### 9.2 “完善天问”元目标循环

元 Loop 只订阅用途为 `meta_telemetry` 的最小证据视图，聚类重复问题、明确反馈、意外成功、版本回归和未解决的 `unknown`。原始用户内容、秘密和稳定可关联标识不能进入该视图。

值得处理的问题创建有限子 Loop。首切片唯一允许的学习目标对象是 `repo_task`。

### 9.3 首切片串行调度

- 前台用户工作优先；
- 用户 Run 结束或等待后，子改进 Loop 才运行；
- 每个 Loop 拥有独立预算、权限、工作区、版本和证据；
- 不需要守护进程、消息队列、并发 Worker 或子 Agent；
- 学习失败返回问题聚类层，不递归产生无限学习任务。

每个父 Loop 创建子 Loop 前先预留预算。模型请求、工具调用、重试和新子 Loop 都从持久预算账本扣减；子 Loop 终止后把结算结果返回父 Loop，不能通过新 ID 绕过次数和风险额度。

### 9.4 用户可见进度

任务进度和学习进度分开展示。默认的“证据化决策说明”至少说明：

- 当前 Goal、Loop、Task 和阶段；
- 已经验证的事实与产物；
- 当前公开假设和依据；
- 正在执行什么、为什么；
- 下一步与停止条件；
- 预算消耗；
- 风险、阻塞和用户介入价值；
- 当前 Champion 与 Challenger 状态。

界面不暴露或长期保存未经整理的模型思维流。Harness 原始轨迹只在用户主动展开审计详情时使用。

只有同时满足四个条件才阻塞询问用户：

1. 只能由用户决定目标、价值、偏好或授权；
2. 没有安全、可逆且明显保留意图的默认动作；
3. 用户答案会实质改变下一步；
4. 现在询问的价值高于稍后合并询问。

其他情况使用隔离探索、缩小动作、非阻塞提醒或定期摘要。多个非紧急问题合并成一次决策包。

### 9.5 主动探索与信源治理

探索不是“列出现在知道什么”，而是围绕 Goal 主动减少关键未知。标准过程为：

```text
Goal 与完成条件
→ 盘点已有权威状态和证据
→ 明确会影响下一步的知识缺口
→ 创建有限探索简报
→ 搜索本地上下文
→ 必要时搜索并读取外部资料
→ 保存来源、版本、摘要和内容哈希
→ 区分事实、来源主张、推测、冲突与剩余未知
→ 形成探索报告
→ 规划、实验、请求裁决或以证据不足结束
```

探索简报附着于普通 Task 或 Learning Job，至少冻结：

- 当前要回答的问题，以及它怎样影响 Goal 或下一步决策；
- 已知事实和对应 Evidence ID；
- 关键未知项；
- 允许读取的本地范围和外部来源类别；
- 查询、抓取、Token、时间和费用预算；
- 预期交付物、充分性标准和停止条件。

首切片的本地探索包括当前工作区内的项目说明、代码、配置、Git 状态与历史、测试、日志、已有记忆和历史证据。它先使用范围明确的搜索与读取，不默认把整个仓库、全部历史或原始轨迹塞进模型上下文。

当本地证据不能回答关键未知，或者 Goal 明确依赖外部事实、当前版本、标准、论文或开源实现时，才启动外部探索。首切片复用 PydanticAI 已有的 `duckduckgo_search_tool` 与具有 SSRF 防护的 `web_fetch_tool`，但把它们作为普通本地函数工具放在天问 Capability Executor 后面；模型只能调用经过 Action Gateway 包装的版本。这样不自建搜索引擎，同时仍能在网络请求前冻结查询或 URL、检查作用域和预算、写入 Action Ledger，并在结果返回后生成 SourceRecord。

PydanticAI 的 Provider 原生 `WebSearchTool` / `WebFetchTool` 由模型服务商在一次模型请求内部执行，当前锁定版本不会把每次服务端检索交给普通函数工具的执行前钩子。因此首切片明确不向执行模型暴露原生网页工具，避免绕过 Action Gateway。以后只有独立契约探针证明能够在调用前授权、逐次计量并取得充分来源信息时，才可以把原生工具作为受治理的优化路径。

本地搜索或抓取能力不可用时，系统记录 `external_search_unavailable`，并根据问题重要性选择缩小结论、使用用户提供的资料或请求必要帮助，不能把模型记忆伪装成已检索事实。

搜索结果摘要只用于发现来源，不能单独支撑重要结论。用于规划、设计或学习的外部主张必须尽量读取原始页面或固定版本，并保存最小 `SourceRecord`：

```text
source_id / source_class / locator
publisher_or_repository / title
published_or_version / retrieved_at
content_digest / scope / purpose
originating_action_id / trust_status
```

其中 `source_class` 至少区分本地仓库、天问记忆、用户提供材料、官方文档、规范、原始论文、源码、Issue/讨论和二手分析。`trust_status` 只表达来源类别、是否已完整读取和是否存在冲突，不由模型把某个网页直接标成“真理”。

来源本身不等于知识。探索形成的事实或主张仍保存为 Evidence，并引用一个或多个 SourceRecord；反对证据和冲突不能被摘要覆盖。探索报告至少包含：

- 已回答未知项及其 Evidence ID；
- 互相冲突的来源和不能合并的结论；
- 尚未回答的未知项；
- 对下一步规划有何影响；
- 停止原因。

外部内容一律视为不可信数据。网页、论文、仓库文档和搜索结果不能通过其中的指令修改 Goal、权限、底线、记忆、评测或活跃 Skill。查询内容在发送前最小化和脱敏；搜索、抓取和下载都经过 Action Gateway，计入预算和来源账本。

满足以下任一条件时结束当前探索：

- 关键未知已经达到简报预先定义的充分性标准，可以支持下一步；
- 继续搜索没有产生新的可区分证据；
- 查询、抓取、Token、时间或费用预算耗尽；
- 所需来源不可访问或相互冲突，现有证据不足以可靠判断；
- 继续探索的隐私、安全或外部影响超过授权。

停止可以返回“证据不足”，不允许为了生成确定答案而抹平冲突或无限搜索。

### 9.6 正式学习链

首切片使用五层学习资产：

```text
Event / Trajectory
→ Case
→ Lesson
→ Artifact Candidate
→ 经评测和发布的 Capability
```

- Event 是不可改写的事实；
- Case 围绕一次问题或成功组织证据；
- Lesson 是带适用条件、反例和证据引用的经验主张；
- Artifact Candidate 是相对冻结父版本的不可变差异；
- Capability 是候选通过保护评测、发布并在不同后续任务中继续成立后的条件化结论。

模型反思只能产生 Case、Lesson 和归因假设，不能直接产生正式能力或修改活跃 Skill。

### 9.7 归因与修改目标

每个 Learning Job 先检查五个故障位置：

```text
目标/验收
→ 信息与上下文
→ 决策/路由/规划
→ 工具操作
→ 结果验证/评测
```

系统核对真实结果和适用范围，再寻找成功与失败轨迹的最早有效分歧，并用单变量实验区分竞争假设。修复从最小影响层开始：

```text
任务上下文
→ 检索与适用条件
→ repo_task Skill
→ 白名单策略
→ 非关键 Prompt/Harness 建议
→ 评测协议建议
→ 治理或目标建议
```

首切片只有 `repo_task` Skill 层能产生可发布候选。其他层只能记录建议。Learning Job 必须记录建议修改对象及“不先改其他层”的理由。

### 9.8 记忆读取与写入

读取顺序：

```text
权威状态生成记忆需求
→ 用户/工作区/用途/权限/版本硬过滤
→ 结构化字段与全文检索
→ 适用范围、冲突和新鲜度检查
→ 紧凑证据包
→ 按需展开原始详情
```

首切片不引入向量数据库和知识图谱。

模型不能直接写正式记忆。记忆写入提案必须经过用途、作用域、字段白名单、长度、敏感信息、来源、过期和冲突检查。外部网页、文档、仓库内容和工具输出可以作为不可信证据，不能直接设定 Goal、用户偏好、权限、底线或正式记忆。

### 9.9 能力账本与能力探测

自我模型是按版本和条件维护的能力账本，不是人格描述。能力结论引用测试、真实任务、成本、预测误差和用户纠正；模型自信只作为弱信号。

任务需要未证明能力时，协调器可以选择：

1. 使用已证明能力；
2. 做低成本能力探测；
3. 创建有限学习子 Loop；
4. 以后委派给有独立能力账本的外部 Worker；
5. 缩小范围或请求必要信息。

首切片不实现外部 Worker，但数据模型不能把“委派成功”误记为天问自身能力。

### 9.10 元学习与评测治理

元学习可以提出 Skill、检索、路由、学习调度和非关键 Prompt 候选，但不能自行改变顶层 Goal、底线、Action Gateway、安全门槛、隐藏保护集、发布器和审计账本。

评测协议由任务集、评分器、Harness、工具、预算、环境和模型参数共同组成，并保存统一 `eval_protocol_version`。修改评测协议创建独立工单：

- 新旧协议先并行桥接；
- 新协议不能用于给当前 Challenger 自证；
- 未经独立确认不能替换旧协议；
- 学习者只看开发集；
- 密封晋级集只返回汇总和失败类别；
- 安全与对抗集由独立评测路径运行。

效果改善不能抵消安全、正确性、越权、数据泄露、过度拒绝和不可恢复风险。调度器候选也不能减少自己的评测预算或跳过失败样本来制造改善。

密封评测请求和首次晋升请求都先持久化随机挑战、候选/Champion/协议绑定、过期时间和未消费状态。导入签名评测回执或用户确认时，系统在同一事务内验证并消费请求；挑战不能由调用者临时提供，也不能重复使用。

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

Event 是仅追加的事实来源，Checkpoint 是可重新生成的恢复快照。每个 Checkpoint 保存最近 Event 序号、状态哈希和 Run 版本清单；它不能覆盖或删除 Event 历史。

每个 Run 创建时冻结：

- Goal Contract 和输入版本；
- 模型、Provider 和关键参数；
- Prompt、Skill 与 Policy 版本和内容哈希；
- PydanticAI、Harness、cryptography 与工具契约版本；
- 权限、预算和工作区基线；
- 状态 schema 与迁移版本。

未结束 Run 默认使用原版本继续。必须迁移时，只在稳定 Checkpoint 执行确定性迁移并追加迁移 Event；无法证明兼容则进入等待原因 `migration_required`，不能静默加载最新版。

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

首切片使用短 SQLite 事务。模型请求、网络请求和工具执行不放在数据库事务内。Action 必须先写入冻结提案、规范化参数哈希和幂等键，再进入执行；`started` 后没有终态的动作在恢复时统一视为 `unknown`。

首切片使用单机短租约防止两个 CLI 同时恢复一个 Run：

```text
owner_id + lease_generation + expires_at
```

接管租约后，恢复器在一个事务内把所有 `running` 且无终态的 Action 转成 `unknown`，追加 `action_unknown_after_recovery` Event，然后再核对外部状态；完成以前不能推进新步骤。SQLite 使用本地文件和 WAL；不把 WAL 误当成网络文件系统、多机高可用或外部动作“恰好一次”的保证。

## 12. 测试策略

### 12.1 确定性单元测试

覆盖状态转换、原因字段、权限决定、参数冻结、预算预留与继承、父子 Loop、Run 版本清单、Skill 版本冻结、探索简报、信源来源、查询脱敏、证据幂等、记忆写入防火墙、元循环投影、租约、恢复分类、晋升和回滚。

### 12.2 Harness 契约测试

锁定的 PydanticAI 与 Harness 版本必须通过公开接口证明：

- Action Gateway 通过公开工具钩子在副作用前拦截；
- InputGuardrail 与 OutputGuardrail 只处理输入和输出；
- 暂停与恢复语义可映射；
- FileSystem 根目录和受保护路径有效；
- Shell 限制与已知结果语义正确；
- StepPersistence 可以重放并提供副作用记录；
- Skills 可以从物化只读视图加载；
- `duckduckgo_search_tool` / `web_fetch_tool` 以普通本地函数工具运行，所有查询和 URL 都先经过 Action Gateway；
- Provider 原生 `WebSearchTool` / `WebFetchTool` 不会出现在首切片执行模型的工具清单中。

任何依赖升级都必须先通过这组测试。

### 12.3 临时 Git 集成测试

验证文件和命令边界、Action 冻结、审批恢复、副作用前后崩溃、`unknown` 核对、Git diff、本地探索范围、来源哈希、回滚和原始工具不可绕过。

外部探索在普通 CI 中使用固定搜索/抓取录制结果，验证搜索摘要不能直接成为正式结论、来源冲突不会被覆盖、外部指令不能改变权威状态、预算耗尽后能够以证据不足结束。真实网络检索只在显式实时研究测试中运行，避免测试因网页变化失稳。

### 12.4 Champion/Challenger 保护评测

两个版本使用等价模型、任务输入、预算、工具、工作区基线和验收规则。先通过正确性与安全门槛，再比较质量、Token、延迟、工具次数和用户打断。

评测分为开发集、仓库外密封晋级集和安全/对抗集。密封集由单独身份启动的一次性 Evaluator 进程持有；父控制面和学习进程只写候选只读快照、公开协议摘要和请求文件，不能获得密封目录读权限。Evaluator 使用受保护的 Ed25519 私钥签署聚合 Eval Receipt，天问只持有公钥验签，不能伪造回执；进程退出后即失去密封数据访问能力。每次 EvalRun 固定 `eval_protocol_version`；修改评测协议必须通过独立桥接测试。

### 12.5 后续真实任务

晋升后的 Challenger 必须用于不同的新 Goal。真实证据可以支持、限制或推翻原改善结论。

普通 CI 使用确定性模型或录制轨迹；真实付费模型评测单独运行并计入学习预算。

## 13. 首条端到端切片

```text
用户 Goal A
→ 识别一个会影响任务方案的关键未知
→ 本地上下文探索
→ 必要时使用受限外部检索并形成带来源的探索报告
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
- 浏览器自动化、登录态和真实账户；
- 自动投递简历；
- MCP 市场和动态工具安装；
- 自建搜索引擎、通用爬虫和专业数据库连接平台；
- 向量数据库和复杂知识图谱；
- 长期 Harness Memory；
- 任意领域 Skill 生成；
- Runtime 或治理核心自我改写；
- 评测协议自动替换、评测门槛自我修改；
- 跨用户学习和用户数据模型训练；
- 生产部署；
- 多引擎插件平台。

## 15. 依赖与后备路线

PydanticAI 与 Harness 锁定到契约测试验证过的精确版本；不能因为新版本存在就自动升级。主动探索启用 PydanticAI 官方 `duckduckgo` 与 `web-fetch` 可选依赖，不引入第二套 Agent 或搜索框架。

首个已核查组合为 `pydantic-ai-slim==2.18.0` 与 `pydantic-ai-harness[skills]==0.13.0`。核查结论、限制和适配前提见 [`2026-08-11-harness-contract-audit.md`](../../research/2026-08-11-harness-contract-audit.md)。

密封评测回执使用 `cryptography==49.0.0` 的 Ed25519 实现；这是首切片唯一新增的安全依赖，不自行实现密码算法。

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
- 用户 Goal 与元 Goal 都可以派生有限子 Loop，子 Loop 不能重置预算；
- 探索同时覆盖本地上下文与必要外部信源，并受问题、范围、预算和停止条件约束；
- 搜索结果只有转化为带 SourceRecord 来源的 Evidence 后才能支持规划与学习；
- Harness 原始状态不能替代天问权威状态；
- 原始工具不能绕过 Action Gateway；
- Skill 版本不可变，并按 Run 冻结；
- 原始轨迹与正式证据逻辑分层；
- Event、Case、Lesson、候选资产和正式能力没有混为同一对象；
- 记忆写入经过用途、作用域、来源和敏感信息防火墙；
- 元 Loop 只能读取最小化证据投影，不读取用户原始内容；
- 元学习不能修改成功定义后自我批准；
- Run 恢复固定原版本，预算和租约不能因重启重置；
- 安全状态自动恢复，不确定副作用局部暂停；
- Run、Task 和 Goal 完成结论相互独立；
- Harness 升级必须通过契约测试；
- 首切片只验证 `repo_task`；
- 已撤回的自研基础设施草案不能作为实施依据。

## 17. 实施依据

首个垂直切片的任务、文件、接口、测试与提交顺序见：

[`2026-08-12-first-continual-learning-vertical-slice.md`](../plans/2026-08-12-first-continual-learning-vertical-slice.md)。

该实施计划尚未包含本规格新增的主动探索任务；用户复核本规格后必须先同步计划，再开始产品实施。

历史的 [`2026-08-11-harness-contract-probe.md`](../plans/2026-08-11-harness-contract-probe.md) 已经执行完成，只用于证明底层公开接口，不再是产品实施计划。
