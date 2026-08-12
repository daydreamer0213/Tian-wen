# 持续学习 Agent 与 Harness 专项调研

**日期：** 2026-08-12

**目的：** 用公开研究与开源实现校准天问的持续学习设计，识别已经得到专业研究支持的部分、仍需补强的部分，以及可直接复用的算法和工程组件。

**性质：** 研究结论，不自动修改已确认的产品目标、架构规格或实施范围。文中的新增门槛和数据规模均为下一轮设计讨论的候选项。

## 1. 结论摘要

天问的整体方向基本成立，而且与 2025—2026 年逐渐汇合的研究方向高度一致：

1. 持续学习不必从修改模型权重开始，也可以发生在记忆、上下文、Skill、工具策略和 Harness 代码层。
2. 真正的学习不是保存更多聊天记录，而是把执行经验转化为可复用资产，并证明它改善了后续不同任务。
3. 学习更新不应直接覆盖稳定版本，而应先形成候选版本，通过独立评测、保护集、灰度和真实实践后再晋升。
4. 学习效果不是稳定单调上升，更接近“从候选变化中进行稀疏、经验证筛选的搜索”。
5. 外部记忆不会自动消除遗忘和知识冲突，只是把稳定性—可塑性问题从模型权重转移到了经验的表示、选择、检索、更新和失效。

天问潜在的差异化不在于单独发明一种记忆、Skill 或 Harness 优化算法，而在于把这些局部能力连接成统一协议：

```text
目标与授权
→ 真实执行轨迹
→ 证据化经验
→ 候选 Memory / Skill / Policy / Harness 更新
→ 独立评测与安全门槛
→ 影子、灰度、晋升或回滚
→ 后续真实任务继续验证
```

目前没有一个被调研项目完整覆盖这条链路。多数工作只研究其中一个学习对象或一个评测环境。因此，天问不应直接改造成某个项目的复刻版，而应继续复用成熟 Runtime，同时吸收不同研究的局部机制。

## 2. 先把四类“持续学习”分开

| 范畴 | 主要改变对象 | 典型时间尺度 | 主要风险 | 与天问的关系 |
|---|---|---|---|---|
| 模型参数持续学习 | 模型权重、LoRA、模型编辑侧存储 | 离线训练或批量更新 | 灾难性遗忘、难解释、难回滚、训练成本高 | 远期可选能力，不适合第一阶段 |
| 上下文与记忆学习 | 事实、经验、反例、提示词片段、检索内容 | 单次运行到跨会话 | 错误经验传播、上下文污染、检索错配 | 第一阶段的主要学习载体之一 |
| Skill 与 Policy 学习 | 可复用流程、工具策略、规划规则、路由配置 | 跨任务、跨版本 | 局部经验过度泛化、评测过拟合、权限扩张 | 最接近首个 `repo_task` 切片 |
| Harness 与架构学习 | Prompt、工具定义、上下文管理代码、子 Agent、运行框架 | 外循环、离线或长任务中 | 自修改破坏治理边界、搜索成本高、难以归因 | 中期方向，首版只允许受限候选变化 |

[LangChain Labs 的三层划分](https://www.langchain.com/blog/continual-learning-for-ai-agents)把学习对象分为 model、harness 和 context。天问还需要在其上增加一个不能由学习者随意修改的“目标与治理层”，负责目标主权、授权、证据、评测、晋升和回滚。

因此，天问更准确的定位是：

> 以外部经验、Skill 和策略更新起步，逐步扩展到 Harness 优化，但由目标与治理协议控制变化的通用持续学习 Agent。

这比“持续学习 Harness”更宽。Harness 是重要学习对象和运行底座，但不是天问的全部产品边界。

## 3. 专业理论对天问原始模型的校准

天问最初的“学、习、持续”模型可以保留，但应增加更精确的工程语义。

### 3.1 学：目标、探索、规划

对应专业研究中的：

- 目标条件化学习；
- 环境感知和任务分布识别；
- 自动课程或探索策略；
- 程序性知识和行动策略形成。

这部分的核心不是收集尽可能多的信息，而是围绕目标缩小不确定性，并建立“哪些知识适用于哪些任务和环境”的条件模型。

需要补充：

- 当前目标、环境、工具、依赖和版本共同构成经验的适用条件；
- 已验证 Skill 调用和新方法探索应是两种不同状态；
- 检索到的旧经验不能阻止必要探索；
- 核心目标和底线仍由人掌握，学习循环只能提出目标变更建议。

### 3.2 习：验证、记录、进化

对应专业研究中的：

- 环境反馈与文本反馈学习；
- 经验抽取和记忆巩固；
- Skill 生成与修复；
- Prompt、Policy 或 Harness 候选优化；
- 保留、迁移和遗忘控制。

这里最重要的校准是：

> 记录不等于学习，自我反思不等于验证，候选变化不等于进化。

一个经验只有在后续行为中被正确检索、应用，并产生可复现收益时，才构成有效学习。原始轨迹属于事实证据；由模型总结出的 Lesson 只是主张；通过独立任务验证并晋升的 Skill 或 Policy 才是稳定能力。

### 3.3 持续：任务流中的获得、保持、迁移和纠错

对应专业研究中的：

- 连续任务流评测；
- 前向迁移和后向迁移；
- 灾难性遗忘与负迁移；
- 非平稳环境和知识失效；
- 周期性巩固、软遗忘和重新验证。

“持续”不能只表示 Loop 一直运行。它还要求：

- 新能力能帮助不同的后续任务；
- 学习新经验后，旧能力不能无声退化；
- 环境变化时，旧知识能被限制、降权或重新验证；
- 错误更新可以追溯、停止和回滚。

## 4. 建议用六个维度描述每次学习

每个 Learning Job 至少需要回答六个问题：

1. **学什么：** 事实、用户偏好、失败模式、程序性 Skill、规划策略、工具规则、Prompt、Harness 代码，还是模型参数。
2. **为什么现在学：** 明确失败、重复低效、用户纠正、环境漂移、成功模式重复出现，还是周期性巩固。
3. **用什么反馈：** 模型自评、测试结果、编译器或工具错误、环境状态、用户反馈、隐藏评测或线上实践。
4. **如何更新：** 新增、增量修改、合并、拆分、降权、软失效、回滚、候选搜索或参数训练。
5. **适用于哪里：** 目标类型、领域、仓库语言、工具、环境版本、风险等级和不适用条件。
6. **如何证明有效：** 触发任务是否修复、保护任务是否保持、未见任务是否迁移、成本是否合理、线上是否改善。

这六个维度可以防止“自动写了一段 Skill”被误报成“完成了一次持续学习”。

## 5. 最值得吸收的研究机制

### 5.1 立即吸收：文本归因只生成候选 Lesson

[Reflexion](https://papers.neurips.cc/paper_files/paper/2023/hash/1b44b878bb782e6954cd888628510e90-Abstract-Conference.html)证明语言 Agent 可以把标量或文字反馈转化成反思，并在后续尝试中使用，而无需更新模型权重。

天问可吸收：

- 将测试失败、命令错误、策略拒绝和用户纠正转成结构化失败归因；
- 同时记录“应做什么”和“在哪些条件下不应这样做”；
- 反思只能进入候选 Lesson，不能直接改写 Champion。

不应照搬：

- 把模型对自己失败的解释当成事实；
- 仅因同一问题重试成功就晋升为全局规则。

### 5.2 立即吸收：原始证据、结构化案例和抽象 Skill 分层

[Voyager](https://github.com/MineDojo/Voyager)通过自动课程、可执行 Skill 库和环境反馈迭代，在冻结模型权重的情况下积累能力。[ExpeL](https://arxiv.org/abs/2308.10144)则从跨任务轨迹中抽取可复用 insight。

天问可采用三级资产：

```text
Trajectory / Event：不可变的原始执行事实，用于审计和重新解释
Lesson / Case：带条件、证据和反例的结构化经验
Skill / Policy：经过独立验证和版本治理的可复用行为
```

第一阶段不需要自动扩张成庞大的 Skill 树。只维护一个版本化 `repo_task` Skill，并在内部积累受控 Lesson，足以验证完整闭环。

### 5.3 立即吸收：增量更新，不反复整篇重写

[Dynamic Cheatsheet](https://arxiv.org/abs/2504.07952)表明，主动筛选和整理经验可以优于追加全部历史，但不同模型和任务上的收益并不稳定；错误或不匹配的检索也会降低性能。

[ACE](https://arxiv.org/abs/2510.04618)进一步指出，反复压缩和整篇重写上下文容易产生“简洁偏差”和“上下文坍塌”。它采用 Generator、Reflector、Curator 分工，以及局部 delta、逐步增长和去重。

天问可采用：

- Challenger 只产生可审计 delta；
- 原始证据永不被摘要覆盖；
- Lesson 带 `helpful_count`、`harmful_count`、证据引用和不适用条件；
- 合并和渲染尽量由确定性程序完成；
- 失效使用降权、停用或替代，不删除历史证据。

### 5.4 立即吸收：学习本质上是验证筛选

[Rethinking Self-Evolving Agent Skills](https://arxiv.org/abs/2608.02636)的多轮研究指出，Skill 自进化不应被理解为每一轮都会稳定提高，更像“稀疏、经验证筛选、依赖模型和任务的搜索”。

这支持天问已有的 Champion/Challenger 设计，并要求：

- 允许大多数候选被拒绝；
- 候选被拒绝不是学习系统失败，而是筛选机制正常工作；
- 不能为了演示连续上升而降低保护门槛；
- 需要保存失败候选和失败原因，避免循环提出同一变化。

### 5.5 下一阶段吸收：代理验证器与隐藏保护集

[EvoSkills](https://arxiv.org/abs/2604.01687)把多文件 Skill 生成器和代理验证器放入共同演化循环。代理验证器能提供可操作反馈，但真正的隐藏评测只返回有限信号，避免 Skill 生成器直接针对测试答案过拟合。

天问可吸收：

- 学习者和评测者使用隔离上下文；
- 开发评测提供具体失败反馈；
- 隐藏保护集不给候选暴露测试内容；
- 保护集失败时，优先改进代理评测，而不是泄露隐藏答案；
- 候选不得修改评测器、保护集、Action Gateway、权限策略、账本和发布器。

### 5.6 下一阶段吸收：Harness 是可搜索的学习对象

[Meta-Harness](https://arxiv.org/abs/2603.28052)把 Harness 代码视为外循环搜索对象，让提案 Agent 读取历史候选、分数和执行轨迹，再提出代码变化。[Continual Harness](https://arxiv.org/abs/2605.09998)允许 Refiner 在长任务中修改 Prompt、子 Agent、Skill 和 Memory。

这些工作证明 Harness 优化是有效研究方向，但不适合首版无限开放。天问应先固定 Runtime 和治理边界，只允许修改白名单内的 `repo_task` Skill/Policy。等首个切片证明评测和回滚可靠后，再逐步开放：

1. Skill 内容；
2. Skill 路由和检索规则；
3. 非安全关键 Prompt；
4. 非关键 Harness 组件；
5. 最后才考虑 Runtime 代码或模型参数。

### 5.7 远期参考：种群搜索、代码自改和参数训练

[GEPA](https://arxiv.org/abs/2507.19457)利用自然语言反思和 Pareto 候选搜索优化 Prompt；[Darwin Gödel Machine](https://arxiv.org/abs/2505.22954)维护多样化 Agent 档案并修改自身代码；[Agent Lightning](https://arxiv.org/abs/2508.03680)将 Agent 执行和强化学习训练解耦。

这些机制适合第二阶段以后：

- 当单一 Challenger 无法覆盖多个互相竞争的策略时，再引入候选种群；
- 当文本反馈和 Skill 更新达到上限时，再评估训练或参数更新；
- 参数训练必须是独立离线管线，不能与生产执行循环共享直接写权限。

## 6. 安全研究带来的关键修正

[On Safety Risks in Experience-Driven Self-Evolving Agents](https://arxiv.org/abs/2604.16968)发现，即使经验完全来自正常任务，执行导向的经验积累也可能让 Agent 在高风险场景中更倾向于采取行动而不是拒绝；加入拒绝经验又可能导致过度拒绝。

这对天问有三个直接影响：

1. 反例和拒绝经验不是附属数据，而是学习资产的一部分。
2. 安全保护集必须同时测量越权执行和过度拒绝，不能只测任务成功率。
3. 自主边界的扩大不能只依据一般任务成功率，必须按动作类别、影响范围和可恢复性分别评估。

每个高影响 Lesson 或 Skill 至少应记录：

- 它鼓励执行什么；
- 它要求在哪些条件下停止、询问或拒绝；
- 需要什么授权；
- 哪些反例证明它不适用；
- 如果错误应用，怎样检测和回滚。

## 7. 对天问现有设计的验证

以下方向得到公开研究的明确支持：

| 天问现有设计 | 研究校准 |
|---|---|
| 用户目标循环与“完善天问”元目标循环使用同一协议 | 自进化研究普遍把运行经验作为外循环学习数据；天问进一步保留目标主权 |
| 执行更新循环与学习更新循环分开 | 对应在线执行与离线/外循环优化分离，便于归因和复现 |
| 原始 Event 与正式证据不可被模型改写 | Meta-Harness、Agent Lightning 等都依赖完整轨迹；ACE 也反对反复压缩丢失信息 |
| Champion/Challenger、保护评测、灰度、回滚 | 符合 Skill 演化、Harness 搜索和持续学习中的候选筛选逻辑 |
| 学习者、评测者、治理者职责分离 | EvoSkills 和安全研究说明独立验证与隐藏反馈非常重要 |
| 第一阶段只更新 `repo_task` Skill | 是最小、可审计、可回滚的学习对象，适合先证明闭环 |
| 真实后续 Goal 才是最终证据 | 避免把单次离线评测或原题重试误当作迁移能力 |

因此，当前设计不需要推翻。更合适的动作是把下面的缺口写入下一份垂直切片计划。

## 8. 当前必须补强的部分

### 8.1 正式定义 Lesson

建议把 Lesson 作为 Trajectory 与 Skill 之间的显式资产，至少包含：

- `claim`：建议改变的行为；
- `when`：适用条件；
- `evidence_refs`：Run、Action、测试、diff、用户反馈；
- `counterexamples`：反例和不适用条件；
- `confidence`：证据强度，不等同模型自信；
- `helpful_count` / `harmful_count`；
- `status`：`candidate`、`accepted`、`deprecated`、`rejected`；
- `target_version`：影响的 Skill 或 Policy 版本。

### 8.2 显式定义软遗忘和冲突处理

新旧知识冲突时不能简单覆盖。系统需要区分：

- 世界或依赖已经变化；
- 两条经验适用于不同条件；
- 旧经验原本就是错误的；
- 新证据还不足以推翻旧经验；
- 两条策略存在不可同时优化的取舍。

默认处理应是并存、缩小适用范围、降权、暂停使用或重新验证，而不是物理删除。

### 8.3 建立持续学习指标账本

[LifelongAgentBench](https://arxiv.org/abs/2505.11942)强调连续任务、技能依赖、保持和迁移。天问至少应记录：

- 当前与最终平均成功率；
- 遗忘率；
- 前向迁移：旧经验是否帮助未见任务；
- 后向迁移：学习新任务后旧任务是否改善或退化；
- 正迁移率和负迁移率；
- 达到收益所需的真实经验数和学习回合数；
- 每成功任务的 Token、工具调用、时间和人工介入；
- 错误记忆接受率、错误记忆持续率；
- 越权率、过度拒绝率、回滚成功率和恢复时间。

### 8.4 隔离评测数据和晋升权限

第一版应区分：

- 学习触发任务；
- 公开开发评测；
- 私有保护集；
- 未见迁移任务；
- 真实灰度任务池。

学习者不能读取私有保护集内容，不能修改评测器和发布门槛，也不能自行宣布晋升。

### 8.5 用随机灰度建立真实因果证据

仅比较不同时间发生的两个真实任务，可能把任务难度差异误认为版本提升。后续灰度需要在同类低风险任务内随机路由 Champion 和 Challenger，并比较成功率、安全、用户打断、成本和恢复情况。

## 9. 第一阶段建议采用与暂缓的机制

### 立即采用

- Reflexion 式失败归因，但只生成候选 Lesson；
- ExpeL 式跨 Run 经验抽取；
- Voyager 式“经过环境验证后再沉淀 Skill”；
- ACE 式增量 delta、去重、证据引用和软失效；
- 原始轨迹、结构化 Lesson、稳定 Skill 三层资产；
- Champion/Challenger、隐藏保护集、影子、灰度和回滚；
- 结构化筛选加全文检索，先不引入向量数据库。

### 下一阶段再采用

- GEPA 的多候选与 Pareto 搜索；
- EvoSkills 的可演化代理验证器；
- Meta-Harness 的 Harness 代码搜索；
- Agent Lightning 的参数或 Prompt 训练接口；
- 多 Skill 自动路由和层级 Skill 库。

### 暂不采用

- 第一阶段修改基础模型权重；
- 让 LLM 自评单独决定完成或晋升；
- 允许学习循环修改 Runtime、Action Gateway、权限、预算、评测器或发布器；
- 无来源、无条件、无反例、无版本的自由文本长期记忆；
- 无限追加完整历史到上下文；
- 为了扩大 Skill 数量而主动制造无目标学习任务。

## 10. 工程项目的复用优先级

### 第一优先级：直接研究学习控制面

1. [Agent Lightning](https://github.com/microsoft/agent-lightning)
   - 重点：`store`、`tracer`、`trainer`、`algorithm` 和资源回灌接口。
   - 目的：学习怎样把轨迹、奖励、候选资源和训练/执行解耦。

2. [Memento-Skills](https://github.com/Memento-Teams/Memento-Skills)
   - 重点：Skill router、builder、错误恢复、循环检测、utility 和反思写回。
   - 目的：研究 Skill 归因、生成、修复、剪枝的完整原型。

3. [Meta-Harness](https://github.com/stanford-iris-lab/meta-harness)
   - 重点：历史候选和轨迹如何暴露给提案 Agent、如何评分和保留候选。
   - 目的：为天问以后开放 Harness 学习建立边界。

4. [Continual Harness](https://github.com/sethkarten/continual-harness)
   - 重点：`evolve_harness` 对 Prompt、子 Agent、Skill、Memory 的更新方式。
   - 目的：分析在线更新的收益、错误证据和治理风险。

5. [Hermes Agent](https://github.com/NousResearch/hermes-agent)
   - 重点：对话循环、Curator、上下文压缩、会话检索、Skill 管理和执行后端。
   - 目的：吸收成熟的 Agent 使用体验和渐进式 Skill 加载，不照搬自动写回即有效的假设。

### 第二优先级：Runtime 与状态工程

- [OpenHands](https://github.com/OpenHands/OpenHands)：事件溯源、Action/Observation、Sandbox 和 Runtime 抽象；
- [Letta](https://github.com/letta-ai/letta)：结构化记忆块、短期与归档记忆分层；
- [LangGraph / Deep Agents](https://github.com/langchain-ai/deepagents)：可恢复执行、人工中断和上下文隔离；
- [PydanticAI / Harness](https://github.com/pydantic/pydantic-ai)：继续作为已选 Runtime 底座，并用现有契约测试限制升级风险。

## 11. 建议的后续研究顺序

在编写持续学习垂直切片实施计划前，建议按下列顺序继续：

1. 精读 Agent Lightning、Memento-Skills、Meta-Harness 和 Continual Harness 的核心源码；
2. 把 `Trajectory → Lesson → Skill delta → Eval → Promotion` 写成天问的最小数据协议；
3. 明确首版保护集分类、隐藏边界和候选禁止修改的组件；
4. 定义首版持续学习指标，而不只定义普通任务成功率；
5. 再根据这些结果修订垂直切片实施计划。

暂不建议因为新研究出现就更换 PydanticAI + Harness。现有底座已经通过公开接口契约探针；新发现主要影响学习层、评测层和治理层，而不是 Runtime 选择。

## 12. 核心资料

### 理论与综述

- [Lifelong Learning of Large Language Model based Agents: A Roadmap](https://arxiv.org/abs/2501.07278)
- [A Survey of Self-Evolving Agents](https://arxiv.org/abs/2507.21046)
- [LifelongAgentBench](https://arxiv.org/abs/2505.11942)
- [Agentic Context Engineering](https://arxiv.org/abs/2510.04618)
- [Rethinking Self-Evolving Agent Skills](https://arxiv.org/abs/2608.02636)
- [On Safety Risks in Experience-Driven Self-Evolving Agents](https://arxiv.org/abs/2604.16968)

### 经验、Skill 与 Context 更新

- [Reflexion](https://papers.neurips.cc/paper_files/paper/2023/hash/1b44b878bb782e6954cd888628510e90-Abstract-Conference.html)
- [Voyager](https://github.com/MineDojo/Voyager)
- [ExpeL](https://arxiv.org/abs/2308.10144)
- [Dynamic Cheatsheet](https://arxiv.org/abs/2504.07952)
- [A-MEM](https://arxiv.org/abs/2502.12110)
- [Memento-Skills](https://arxiv.org/abs/2603.18743)
- [EvoSkills](https://arxiv.org/abs/2604.01687)
- [GEPA](https://arxiv.org/abs/2507.19457)

### Harness 与系统自优化

- [Meta-Harness](https://arxiv.org/abs/2603.28052)
- [Continual Harness](https://arxiv.org/abs/2605.09998)
- [Darwin Gödel Machine](https://arxiv.org/abs/2505.22954)
- [Agent Lightning](https://arxiv.org/abs/2508.03680)
- [LangChain Labs：Continual Learning for AI Agents](https://www.langchain.com/blog/continual-learning-for-ai-agents)

### 工程与评测

- [Hermes Agent](https://github.com/NousResearch/hermes-agent)
- [OpenHands](https://github.com/OpenHands/OpenHands)
- [Letta](https://github.com/letta-ai/letta)
- [AppWorld](https://github.com/StonyBrookNLP/appworld)
- [τ-bench](https://github.com/sierra-research/tau2-bench)
- [SWE-bench](https://github.com/SWE-bench/SWE-bench)
- [OpenAI Evals API](https://platform.openai.com/docs/api-reference/evals)

## 13. 最终判断

你的优势目前不是已经拥有一项经过实验验证的算法优势，而是：

- 对完整系统所需环节的直觉较早且基本正确；
- 没有把持续学习缩成记忆、Skill、模型微调或单一 Loop；
- 很早就意识到目标主权、授权、反例、独立评测、真实实践、灰度和回滚必须同时存在；
- 能把用户目标循环和“完善天问”元目标循环放进同一学习协议。

专业团队的优势是，它们已经在局部问题上提供了术语、算法、基准和实验证据。最合理的策略不是与它们重复造轮子，而是：

> 用它们的局部研究补足天问的理论和算法，用成熟开源项目承担通用执行能力，把天问的原创工作集中在跨层学习协议、目标治理、证据语义和安全晋升上。

如果后续实验能够证明这套整合协议真的让 Agent 在不同真实任务中持续改善、保持旧能力且可以安全回滚，那么“系统直觉”才会转化成天问可验证的项目优势。
