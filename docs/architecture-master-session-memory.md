# 天问主控架构会话记忆

> **阅读提示（2026-08-19）：** 本文保留项目愿景、讨论历史和主控监督约定，但不再作为产品架构的首要入口。请先阅读 [`tianwen-architecture-overview-v2.md`](tianwen-architecture-overview-v2.md)。正式 Runtime 边界以 [`2026-08-19-tianwen-runtime-boundary-reset-design.md`](superpowers/specs/2026-08-19-tianwen-runtime-boundary-reset-design.md) 为准；持续学习细则以 [`2026-08-17-tianwen-continuous-learning-governance-design.md`](superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md) 为准。本文中与这些文件冲突的旧状态、旧阶段顺序或双 Runtime 表述只作历史记录。

更新日期：2026-08-17

## 1. 文档用途

本文档是天问项目主控架构会话的长期记忆与职责合同，用来避免会话压缩、模型更换或长期运行后出现以下问题：

- 忘记已经确认的架构结论；
- 把阶段性实现误当成最终产品边界；
- 把主控架构会话误用为具体编码会话；
- 因实施细节变化而擅自改变项目愿景；
- 重复讨论已经确认的问题。

本文档不替代产品规格、研究材料或实施计划。发生冲突时按以下顺序处理：

1. 用户在当前会话中的最新明确决定；
2. 已确认的产品规格和架构设计；
3. 本文档记录的长期共识；
4. 研究笔记；
5. 阶段性实施计划与交接记录。

实施计划可以改变“当前怎么做”，不能静默改变“天问为什么存在”和“最终希望成为什么”。

## 2. 本会话的固定职责

本会话是天问项目的主控和架构会话，负责：

- 与用户继续讨论项目愿景、持续学习理论和产品方向；
- 解释专业资料，并把理论转化为通俗、可判断的设计方案；
- 提出问题时同时说明背景、选项、利弊和推荐意见；
- 维护架构共识、路线图、研究结论和关键决策；
- 判断什么时候需要补充调研、设计复审或调整路线；
- 创建和监督独立实施会话；
- 阅读实施会话的交接、测试和复审结果；
- 判断实施是否偏离原设计；
- 在阶段结束时组织验收、合并建议和下一阶段规划。

本会话默认不负责：

- 连续编写具体功能代码；
- 长时间调试单个实现问题；
- 逐任务执行完整开发计划；
- 在没有新架构问题时替代实施会话工作。

只有用户明确要求“由这个主控会话亲自实施”时，才可以例外。

以后用户在本会话只说“继续”时，默认含义是：

> 继续当前架构讨论、研究、路线规划或实施监督，而不是自动开始编码。

需要编码时，主控会话应优先：

1. 固化当前设计和验收标准；
2. 创建或续接独立实施会话；
3. 提供明确的分支、文档、范围和交接入口；
4. 保留主控会话用于后续决策和监督。

### 2.1 实施会话与主控的自动交接

独立实施会话完成一个阶段后，必须主动向主控会话发送结构化交接，而不只是留下一条普通完成消息。

交接至少包含：

- 完成的 Task 和未完成的 Task；
- 分支、提交 SHA 和是否已经推送；
- 聚焦测试、全量回归、Ruff 和其他验证结果；
- 独立复审结论及仍未关闭的 Critical / Important 问题；
- 遗留风险、阻塞项和需要用户决定的问题；
- 交接文档路径；
- 按当前计划推荐的下一任务入口。

主控收到交接后按以下顺序处理：

1. 读取计划中的阶段完成条件；
2. 只读核对提交、测试、复审和交接文档；
3. 证据不足或仍有阻塞问题时，要求原实施会话补齐；
4. 证据满足且不涉及新架构选择时，创建下一独立实施会话；
5. 涉及 Goal、范围、权限、重大风险或价值取舍时，先向用户汇报并等待决定；
6. 主控会话本身不因为收到交接而转为编码会话。

主控可以配置低频监督心跳，防止实施会话异常结束、忘记回报或交接消息丢失。没有状态变化时应保持静默，避免把定期检查变成重复通知。

## 3. 天问的长期愿景

天问的目标是成为一个具有持续学习能力的通用 Agent，而不是一个只能优化 Skill 的工具、Codex Skill、Codex 插件或单一编程 Agent。

用户指定不同目标时，同一套持续学习过程可以产生不同表现：

- 目标是完成一个项目：天问围绕项目持续探索、实践、验证和迭代；
- 目标是改良某个工作流：天问学习适用范围、用户偏好和实际效果；
- 目标是完善天问：元循环从合规的运行证据中发现问题，产生候选改进；
- 目标是学习其他领域：变化的是目标对象、工具和验证方法，不是持续学习基本协议。

“自动生成项目”“自动总结或优化 Skill”都只是持续学习能力的具体表现，不是天问的核心定义。

代码仓库任务是第一阶段的验证实验室，因为 Git、测试、隔离环境和回滚能够提供清晰证据；它不是天问最终的产品边界。

## 4. 持续学习的核心模型

用户最初提出的“学、习、持续”模型继续成立。这里的“学”是产品愿景中的通俗总称，不是代码里的 `TaskKind` 或单一学习模式。

### 4.1 学

“学”包含目标、探索和规划。

- 目标：明确这次学习要改善什么，不进行漫无目的的探索；
- 探索：主动搜集与目标相关的上下文和知识；
- 规划：整理问题边界、知识关系、优先级和验证顺序。

模型已有知识、现成工具和外部 Skill 应先进入能力发现与任务绑定。找到并复用能力不等于持续学习；只有真实结果形成 Evidence、经过治理并持久影响未来 Run，才算学习。正式学习模式只有经验总结和假设探索，两者可以在同一个有预算的 Case 中通过“假设 → 受控实验 → 新证据 → 经验总结”形成互补小循环。

探索不只是回答“现在是什么情况、还缺什么信息”，还必须包含实际的信息搜集动作：

- 搜索本地项目、代码、Git、测试、日志、记忆和历史证据；
- 必要时搜索官方文档、论文、源码和其他外部可信来源；
- 保存来源、时间、版本、摘要、哈希、冲突和剩余未知；
- 证据不足时诚实结束，而不是用猜测补齐。

外部内容始终是不可信数据。它可以提供事实和候选方法，但不能直接修改 Goal、权限、底线、正式记忆、评测标准或活跃版本。发现的外部 Skill 同样只是待审查能力来源，必须经过与实际影响相称的来源、许可、依赖、权限、兼容性检查和受限试用。

### 4.2 习

“习”包含验证、记录和进化。

- 验证：判断知识真假、适用范围、前提、收益、代价和副作用；
- 记录：把经过确认的知识、证据和关系保存为可追溯状态；
- 进化：把知识用于目标对象，形成候选版本，并比较实际效果。

反思、自评和总结只能形成候选结论。真正的能力证据来自实践、独立验证、迁移到不同任务后的效果，以及没有突破安全和正确性下限。

### 4.3 持续

“持续”表示系统能够长期、反复进入学习过程，不表示单次任务无限运行。

每次循环都必须具有：

- 明确预算；
- 停止条件；
- 检查点；
- 可恢复状态；
- 新证据或不确定性下降；
- 失败、暂停和回滚路径。

没有新增证据、没有排除假设、没有缩小不确定性，也没有改善候选时，单纯运行更久不算进展。

## 5. 正式循环术语

不再把“快循环”和“慢循环”作为正式名称，避免误解为单纯的速度差异。

每个目标循环内部包含两个职责不同的循环：

### 5.1 任务执行循环

```text
读取目标和任务包
→ 规划下一步
→ 执行动作
→ 验证当前结果
→ 更新任务状态和证据
```

它负责完成当前目标、构建产物和产生真实经历。

### 5.2 学习更新循环

```text
读取真实结果和合规执行证据
→ 将 Observed Gap 分诊为继续观察、普通修正或可复用 LearningSignal
→ 经验总结，或假设探索 → 受控实验 → 新 Evidence
→ 形成有作用域的 Lesson 和有限候选
→ 独立评测
→ 晋升、保留、限制或拒绝
```

它负责从执行经历中提炼可复用改进，但不能在当前任务中偷偷替换稳定行为版本。

该流程的完整规范统一记录在 `docs/superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md`。实施计划只能分阶段落实，不能重新定义另一套学习类型或跳过分诊、实验和评测门。

## 6. 多目标与父子循环

天问不是只有一个循环轮流切换目标，而是可以存在多个相互隔离的持续学习循环。

### 6.1 用户目标循环

每个用户 Goal 拥有独立的：

- 目标对象；
- 状态与版本；
- 预算和停止条件；
- 授权；
- 任务执行循环；
- 学习更新循环；
- 必要时派生的小目标循环。

实现用户目标的过程中，可以围绕不同知识缺口派生多个小持续学习循环。因此用户目标同样是“大循环套小循环”。

### 6.2 “完善天问”元目标循环

完善天问是长期存在的另一个目标循环，与用户目标循环并行，并不与用户目标冲突。

它负责：

- 读取用户循环产生的合规事件、问题和反馈；
- 发现值得改善的具体问题；
- 为问题创建有明确终点的派生学习子循环；
- 产生 Skill、策略或其他受允许对象的候选版本；
- 经过独立评测和治理后再决定是否晋升。

元循环只能读取经过用途检查、字段白名单和脱敏处理的最小证据投影。它不能默认读取原始用户文件、完整轨迹、秘密、绝对路径或全部提示词，也不能改变当前用户循环的 Goal、授权和稳定版本。

用户任务拥有前台交互、算力和外部操作的调度优先权；后台学习只能使用自己的额度。

## 7. Goal 主权与目标模式

最上层 Goal 由人决定，Agent 不得静默修改。

Agent 可以在目标不清晰时帮助澄清，也可以调整计划、方法、工具和子目标，但不能自行改变核心意图。

如果探索发现目标存在致命阻塞，例如违反基本物理规律、关键前提不存在或成本远超允许范围，Agent 应：

1. 暂停受阻部分；
2. 提供证据和无法实现的理由；
3. 提出相邻的可行目标选项；
4. 等待人类决定是否创建或修改 Goal Contract。

Goal、Task、Run 和 Action 必须分层：

- Goal：人类确认的长期或阶段目标；
- Task：为 Goal 服务、可验收的工作单元；
- Run：某个冻结版本和预算下的一次执行；
- Action：Run 内具体且可治理的动作。

Run 结束不等于 Task 验收，Task 验收也不自动等于 Goal 完成。

## 8. 自主性、授权和底线

天问的长期方向是高自主，而不是把用户变成每一步的审批器。

自主边界应随能力、证据和可靠性逐步扩大，但以下底线不能因能力提升而取消：

- 不得自行修改顶层 Goal；
- 不得自行扩大权限；
- 不得突破安全、法律、隐私和用户利益底线；
- 不得自行降低评测或发布门槛；
- 不得隐藏重大不确定性或严重副作用；
- 不得让候选版本直接覆盖稳定版本；
- 不得删除失败历史来伪造进化。

暂停和人类介入采用分级原则：

- 普通低风险问题：Agent 自己处理并记录；
- 可恢复的重要异常：保存状态、采取保守动作并继续可继续部分；
- 重大负面影响、不可逆风险、权限扩大或价值冲突：临时暂停相关动作并请求人类；
- 顶层目标不可行：报告证据并由人决定是否更换目标。

设计重点不是让 Agent “尽可能暂停”，而是让它只在确实需要人类主权判断时暂停。

## 9. 用户协作与进度展示

天问的用户协作重点是展示进度、依据和不确定性，让用户决定参与调整还是继续等待。

系统展示的是“证据化决策说明”，不是模型未经整理的内部思维流。

用户应能看到：

- 当前 Goal 和阶段；
- 已完成的工作；
- 正在验证的假设；
- 使用了哪些来源；
- 关键证据和冲突；
- 当前不确定性；
- 下一步实验；
- 预算和停止条件；
- 是否需要用户参与，以及为什么。

人类介入分为：

- 可选参与：用户经验可以缩短探索，但 Agent 能继续；
- 建议参与：存在重要方向分叉；
- 必须参与：涉及 Goal、价值取舍、权限扩大或重大不可逆风险。

主控会话向用户提问时，也应先给出必要解释、可选方案、利弊和推荐意见。不能把用户变成只负责回答“是”的确认机器。

## 10. 验证、版本与真实效果

评测是小样本预测，真实使用效果才是进化的最终证据。

当前长期原则是：

- 保留稳定 Champion 和候选 Challenger；
- 候选先在与生成过程隔离的任务上评测；
- 记录候选适用范围、收益、成本和已知失败；
- 晋升后继续观察不同真实任务；
- 新问题可以产生版本 C，而不是强迫只在 A/B 中选择；
- 旧版本和历史证据不作废；
- 出现回归时能够恢复旧版本；
- 灰度、影子运行和路由应在有真实需求和证据后逐步加入。

版本更新不是覆盖文件，而是：

```text
稳定版本
→ 候选版本
→ 独立评测
→ 受控晋升
→ 真实任务观察
→ 支持、限制或推翻改善结论
```

### 10.1 Skill、偏好和主观评测的稳定共识

- 多个 Skill 先过权限、兼容性、来源和许可等硬资格门，再比较目标匹配、证据、成本和复杂度；差异不明确时只做有界对照；
- Skill 适配从 Run 临时绑定开始，优先形成用户级或项目级 Overlay；单一作用域证据不能直接改写通用 Skill；
- 用户明确纠正可以产生 LearningSignal；明确持久偏好可以先保存为相应作用域的偏好，不自动成为通用 Lesson；
- 安全、法律、事实和授权优先；其余范围内用户明确偏好高于通用 Skill 默认经验；
- 主观任务把客观硬门、业务指标和用户反馈分开。模型评审只能辅助，不能替用户宣布满意，用户沉默也不是通过；
- 上游 Skill、模型、工具合同或评测协议变化时，只让实际受影响的证据和评测过期，并做窄重新验证；旧 Overlay 和历史证据不能被静默覆盖。

## 11. Runtime 与组件复用策略

天问是独立 Agent，不依赖 Codex 才能运行，也不是类似 Superpowers 的 Skill 包。

“独立”表示天问自己掌握：

- Goal 和循环状态；
- 授权和预算；
- 事件与证据；
- Checkpoint 和恢复；
- 学习候选；
- 评测、版本、晋升和回滚；
- 用户控制面。

“独立”不表示所有底层轮子都自己开发。

原先确认的第一阶段技术策略是 Python + PydanticAI Harness。该路线已经形成可运行参考实现，并完成 Alpha-A Tasks 1–9；这些成果继续作为迁移基线和验收合同。

2026-08-14 对 DeepSeek Harness 官方源码完成只读调研后，Runtime 选型重新打开。2026-08-15 完整兼容性探针通过后，已选择的迁移目标架构是：

- 精确锁定 DeepSeek Harness 版本，把它作为通用 Agent 运行内核；
- 天问作为独立产品 Profile/Bundle，而不是类似 Superpowers 的单个插件；
- TypeScript 插件负责 Runtime 控制、事件投影、版本治理和 UI；
- Python 继续承担评测、研究、数据分析和迁移期 Worker；
- DSH 负责模型、Agent Loop、Session、工具、Goal Round、普通沙盒和恢复；
- 天问掌握跨会话 Goal Graph、学习循环、Evidence、候选、独立评测、晋升和回滚；
- 普通任务优先使用 DSH 本地沙盒，Docker/远程沙盒降为高风险评测的可选提供方；
- 当前不 Fork DSH；完整探针已证明公开插件和 Profile seam 足以进入迁移；
- 保留现有 Python 实现，不在独立迁移阶段通过前删除、废弃或大规模重构；
- 模型参数训练继续暂缓，先验证 Harness 层持续学习能实现多少目标。

这一新路线已经完成兼容性探针 Tasks 0–9。精确锁定的 DSH
`0.1.0-rc.6` 可以通过公开包根导出接入；Profile、Goal 主权与恢复、
Evidence、Python A1、Artifact/Champion、回滚、重启重绑定和普通本地
沙盒的承重门均通过。最终标签为 `ADOPT_DSH_RUNTIME_CANDIDATE`，
fresh whole-probe review 为 0 Critical、0 Important、0 Minor。
这批准进入独立迁移阶段，但不表示完整产品已落地。详细依据：

- `docs/research/2026-08-14-deepseek-harness-source-audit.md`
- `docs/research/2026-08-14-deepseek-harness-compatibility-probe-result.md`
- `docs/operations/deepseek-harness-compatibility-probe-handoff.md`
- `docs/superpowers/specs/2026-08-14-deepseek-harness-runtime-selection-design.md`
- `docs/superpowers/plans/2026-08-14-deepseek-harness-compatibility-probe.md`
- `docs/superpowers/specs/2026-08-15-tianwen-on-dsh-migration-phase-1-design.md`

版本证据要区分两层：已逐源码审计的 GitHub `master`
`47f943859bef60e4160492346772ded9b24f765a` 仍是 `0.1.0-rc.5`
manifest；拟用于探针的最新 npm 发布包是精确 `0.1.0-rc.6`。由于
`rc.6` 没有公开 Git tag / `gitHead` 可直接映射，实施第一门必须核对
npm tarball integrity、实际公开导出和 TypeScript 签名，不能把 `rc.5`
源码结论直接冒充 `rc.6` 证明。

核心原则是：

> 核心控制边界自己掌握，非核心组件哪个成熟、便宜、好用就复用哪个；不为搜索、浏览器、队列或模型 SDK 等非核心能力提前建设通用平台。

## 12. 当前验证路线

第一阶段仍使用本地 Git 仓库任务验证最小但真实的持续学习链路。Alpha-A A1–A5 任务包和 Tasks 1–9 的实现证据继续有效，不因 Runtime 重新选型作废。

在继续 Alpha-B 或 Task 10 前，已完成一个更窄的 DeepSeek Harness 兼容性探针阶段：

- 启动精确锁定的 DSH 和最小 Tianwen Profile；
- 验证 DSH Goal 的人类主权、恢复和连续运行边界；
- 从 DSH Session Event 生成 Tianwen Evidence；
- 复用现有 Python A1 评测；
- 证明候选失败不影响 Champion，并能保留历史和回滚；
- 验证普通本地执行可以使用 DSH 沙盒；
- 只使用公开插件接口，变化集中在薄兼容层。

探针已经完成；以下约束继续延续到 Migration Phase 1：

- Task 10 冻结；
- 不调用真实 Docker；
- 不调用付费模型；
- 不开始完整 TypeScript 迁移；
- 不删除当前 Python Runtime；
- 不把 DSH Dynamic Package 当作正式持久学习资产。

用户已批准进入 Tianwen-on-DSH Migration Phase 1。第一阶段只连接正式
Runtime/Profile composition、Session/Goal/Evidence、Python A1 和
Evolution governance，不做 UI、真实模型、Docker、A2–A5 或完整 Goal Graph。

不能因为 Alpha-A 当前集中在编程任务，就把天问重新定义为编程 Agent；也不能在 Alpha-A 尚未证明基础执行链时，提前宣称完整持续学习已经实现。

## 13. 当前实施状态

稳定主分支在本次更新前为：

- `main`: `0b993144fa7658d691b2b8455bdc1b31b32ebff3`（已包含自包含 Runtime Bundle 设计、计划和主控记忆）

Alpha-A 独立实施分支为：

- `codex/alpha-a-real-task`
- 远端精确 HEAD：`67ef50f673c7786872cf5729a808dd3fe85afcfb`
- Tasks 1–9 已完成、推送并经过独立复审和主控验收；
- A1–A5 任务包、两轮反馈、TrialManifest 和 canonical freeze 已具备离线证据；
- Task 9 最终全量离线结果：`424 passed, 4 skipped`；
- Task 10 未启动；
- 原 Task 10 真实 Docker 发布门不再是自动下一入口；
- DSH 调研、候选架构规格和兼容性探针实施计划已经固化；
- 调研、规格、计划和本文档已由 `main`
  `de8e33365c402da9341672b8ada564e5bfb48880` 推送；
- 用户已经批准开始兼容性探针；
- 探针 Tasks 0–2 的独立实施任务：
  `019ffe1f-bda0-7a71-9628-b9b38e944801`；
- 探针目标分支：`codex/deepseek-harness-probe`；
- Tasks 0–2 已完成并普通推送，远端精确 HEAD：
  `435ccad9e84809b417ca435f89450d7e6df98d8b`；
- `@deepseek-ai/dsh` 已按 CLI 包验证 `bin.dsh`；兼容层直接 import 的
  14 个 Runtime 包均具有公开根导出、类型声明和默认实现；
- 187 个已安装 DSH 包均解析为精确 `0.1.0-rc.6`；锁文件、目标文件、
  路径边界和禁止私有源码导入检查均通过；
- `tianwen-dsh-compat` 已能通过公开 API 驱动一个真实但使用脚本化
  Adapter 的 AgentLoop 回合，并挂载 JSONL Session 持久化；
- 主控在最终远端 SHA 上独立复跑：离线 frozen install、闭包检查、
  私有导入检查、TypeScript 类型检查和 8 个聚焦测试全部通过；
  Python A1 聚焦测试通过，全量为 `424 passed, 4 skipped`，Ruff、
  `git diff --check` 和工作树状态均干净；
- 最终独立复审为 0 Critical、0 Important、3 Minor。三个 Minor
  都只影响未来私有导入扫描器对构造字符串的误报或更深层规避分析，
  当前提交的公开导入边界和扫描结果不受影响，暂不阻塞 Task 3；
- Tasks 0–2 canonical 交接：
  `docs/operations/deepseek-harness-probe-task-0-2-handoff.md`；
- 探针 Task 3 独立实施任务：
  `019ffe9a-5e6c-70d0-b508-1d39fd146154`；
- Task 3 已证明 Bundle pack、离线 Profile 安装和 `--dump-config`
  功能链可以工作，但独立复审发现：npm `rc.6` 的公开 DSH CLI 在
  Windows 执行 `plugin add` 时内部使用 `shell: true`；
- 用户已批准严格限定的安装期例外：只允许精确 D 盘根目录、固定
  profile、固定 tarball、离线、无密钥、无 shell 元字符且无用户/模型
  输入的 Task 3 一次性安装；天问外层仍为 `shell: false`，报告必须
  诚实区分两层；
- 该例外不允许扩散到 Agent 运行期、动态插件、学习资产或用户指定包；
  正式开放动态安装前仍需要上游安全接口或新的可审计安装器；
- Task 3 已完成、普通推送并通过独立复审与主控独立验收；探针分支
  远端精确 HEAD：`da44d1ac152d31e97596c419e4b8952e92cb3ef3`；
- 主控在最终代码上独立重跑：离线 frozen install、依赖闭包与私有导入
  检查、TypeScript typecheck、Tasks 0–3 的 16 个 Node 测试、
  Profile pack/install/dump、Python A1、全量 `424 passed, 4 skipped`、
  Ruff 和 `git diff --check` 全部通过；
- Task 3 tarball SHA-256 稳定为
  `29018a0f57b4b8dc529162f35f0c5d79a092ab2f92b36588505a0c99b7936012`；
  `profile-report.json` 的整文件 SHA 是包含实际 Corepack 绝对路径的
  单次运行回执，不是跨环境 canonical 身份；验收使用 tarball、配置、
  normalized assertions、固定输入和执行/权限边界；
- Task 3 canonical 交接：
  `docs/operations/deepseek-harness-probe-task-3-handoff.md`；
- 探针 Task 4 独立实施任务：
  `019ffeef-15a1-7f93-8356-aa65eb20172e`；
- Task 4 唯一范围是验证顶层 Goal 的人类主权、真实 JSONL 跨 Context
  恢复、恢复后 disarmed、显式 resume 前零模型请求，以及一次 Goal
  round 上限；Task 5 必须等待 Task 4 单独验收；
- Task 4 发现持有完整 root `Agent` 的同进程代码可自报
  `source.kind: user`。用户提醒后，主控修正过宽威胁模型：第一版把
  已审核并正式安装的同进程插件视为可信代码，只验证诚实 provenance、
  child ownership 和产品包依赖边界；该伪造路径记录但不阻塞；
- 未晋升或第三方未知插件不得进入主进程。需要运行不可信插件时再设计
  进程隔离，不在当前探针提前建设；
- Task 4 继续修复真实的恢复时序证据缺口：必须用 durable Session event
  sequence 证明显式 resume 之前没有重新 armed、推进 Goal 或请求模型；
- Tasks 4–7 已完成、普通推送并通过独立复审与主控独立验收；Task 7 后
  探针分支远端精确 HEAD 为
  `a3706515b72f7875ed7bd053f98ea78a6b97858b`；
- Task 5 已证明 DSH Session Event 可以形成最小、可重放且不复制原始
  对话/工具内容的 Tianwen Evidence；
- Task 6 已证明现有 Python A1 评测可通过固定 typed bridge 直接复用，
  Nop/Oracle、原始 stdout 和冻结摘要保持一致；
- Task 7 已证明正式 Artifact、Evaluation、Approval、Champion、失败恢复、
  回滚和重启重绑定由 Tianwen append-only Ledger 掌握，DSH Dynamic ID
  只作为进程内临时绑定；
- Task 8 的首次真实 Windows 本地沙盒探针观察到：read-only 写入实际被
  ACL 阻止、目标文件未生成、workspace-write 正常，但 DSH `rc.6`
  `windows-acl` 公布的 denial phrases 未包含 Node 22 返回的
  `EPERM: operation not permitted`；
- 用户批准把 Task 8 验收改为固定子进程机器可读错误证明：只有
  `EPERM/EACCES/EROFS`、精确 `syscall/path`、runner 正常、非零退出且
  文件不存在时才确认拒绝；不接受任意非零退出，也不因上游词典漏项单独
  阻塞项目；
- Windows 本地沙盒仍按 `partial` 分类：普通任务可复用；高风险候选评测
  后续使用 container、remote runner 或 microVM，当前不提前建设；
- Task 8 最终结构化拒绝证明通过，探针分支提交为
  `e15ad4376f1aca456366587369fb3952247f4e0d`；
- Task 9 已完成 11 项最终离线门、whole-probe review 和结果文档；
  探针分支远端精确 HEAD 为
  `1eef994a82c4ff39de311d5c2b61dff92bf94162`；
- 最终决策标签为 `ADOPT_DSH_RUNTIME_CANDIDATE`；
- 用户已开启目标模式，批准持续推进 Migration Phase 1；主控负责设计、
  计划、独立实施任务调度和验收，不亲自承担连续编码。

- 因 Codex 派生任务权限继承不稳定，后续实施改为本回合 multi-agent 子代理；
  主控只做架构、调度、验收；
- Tianwen-on-DSH Migration Phase 1 Tasks 1–3 完成：薄 runtime、三 Context
  Session/Goal/Tool/Evidence、Python A1 和 Cordis Plugin 独立治理；
- migration 分支最终远端为 `3daf3f05ba36b4db0d15020afa1978465181e5da`；
  canonical handoff 路径为
  `docs/operations/tianwen-on-dsh-migration-phase-1-handoff.md`（在 migration 分支）；
- final gates：Node 68/3、sandbox 3/3、Python A1 10、pytest 424/4、
  Ruff/closure/private/typecheck/diff clean；settlement race test-only fix
  `855cce4`，review C0/I0/M0；
- Task 4 BLOCKED：私有 workspace 多包无法作为一个离线 DSH plugin tarball
  闭合；所有实验 tracked 变化已清理、无 Task 4 产品 diff、Migration Profile
  gate 未运行；
- 用户已于 2026-08-15 批准方案 B：构建一个自包含 Tianwen
  Runtime/Evidence/Evolution 产品代码、并将 DSH/Cordis 保持为外部依赖的
  单体部署 Bundle；多个 `@tianwen/*` workspace package 只作为构建期输入；
- canonical 设计为
  `docs/superpowers/specs/2026-08-15-tianwen-self-contained-runtime-bundle-design.md`；
  canonical 实施计划为
  `docs/superpowers/plans/2026-08-15-tianwen-self-contained-runtime-bundle.md`；
  实施继续使用当前回合 multi-agent 子代理，不新建派生会话；
- main 规格已裁决 trusted absolute evolutionRoot：是已审核部署配置、非用户/模型
  输入；Phase 1 实例仍使用 D 盘约定，不建设虚假 path sandbox。规格 commit
  `4b72814`；
- 之前“私有 workspace 多包无法形成一个离线 DSH plugin tarball”的
  `READY_AS_BLOCKED_HANDOFF` 已由用户批准的方案 B 解决，不再是当前阻塞；
- 自包含 Runtime Bundle 计划 Tasks 1–3 已完成。迁移分支
  `codex/tianwen-dsh-migration-phase-1` 已普通 fast-forward 推送，远端精确
  HEAD 为 `cffc8e51ad829adf016967491830402b0ed91bd5`；
- 当前部署产物是一个 `@tianwen/runtime-bundle` tarball；Runtime、Evidence、
  Evolution 和窄 compat seam 已打入产物，DSH/Cordis 保持外部依赖。非 Node
  external 精确且仅为 `@deepseek-ai/cordis@4.0.1`；
- 最终 tarball SHA-256 为
  `200733DD937A4FB518A1F625CFC824DBF0AA93ABD64F25194E97ABC2036409F8`；
  migration Profile report SHA-256 为
  `856C009C90CC6CCE153E776C82FBDFD9B9E3F32E06DC939A80EDEDEAFCB5045C`；
  `dist/runtime.js` SHA-256 为
  `3C680ED36CE09F49090FC242150ADCDEA55C388F4F4523FD3E7073D5E29B7016`；
- 最终 release gates：默认 Node `79 passed, 6 skipped`，显式 migration
  Profile `5 passed, 1 skipped`，Windows local sandbox `3 passed`，Python
  A1–A5 author proof `10 passed`，全量 Python `424 passed, 4 skipped`，
  Ruff、依赖闭包、私有导入、typecheck、diff 和工作树状态均干净；
- 打包后 Runtime 的 `apply` 已被真实执行并证明会挂载 Evidence 与 Evolution；
  esbuild metafile inputs 已限制为批准的 Runtime、Evidence、Evolution 和窄
  compat 输入，额外 workspace、`node_modules`、native addon 和 test helper
  均被回归测试拒绝；
- 最终整分支初审发现 2 个 Important 测试缺口和 1 个 ledger Minor；唯一
  test-only 修复后 scoped re-review 为 0 Critical、0 Important、0 Minor，
  Ready Yes；canonical handoff 位于 migration 分支的
  `docs/operations/tianwen-self-contained-runtime-bundle-handoff.md`；
- 现有 Python Runtime、Alpha-A Tasks 1–9 和 A1–A5 冻结任务包全部保留；本阶段
  没有 migration cutover、没有真实模型调用、没有真实 Docker，也没有开始 UI；
- 下一未阻塞入口是先设计 Tianwen-on-DSH Migration Phase 2：以已验证的单一
  Runtime Bundle 为正式部署基础，连接产品 Profile/入口和后续用户控制面；
  在新规格批准前不自动切换稳定 Runtime，也不删除 Python 基线。

- Tianwen-on-DSH Migration Phase 2 已完成并独立推送，不再是待设计入口；
  实施分支为 `codex/tianwen-dsh-migration-phase-2`，远端精确 HEAD 为
  `327327108f2f4666a99824e5aeaaaccace5afdc6`；canonical handoff 位于该分支的
  `docs/operations/tianwen-on-dsh-migration-phase-2-handoff.md`；
- Phase 2 正式证明了精确三层 Profile：`@deepseek-ai/dsh-base@0.1.0-rc.6`、
  `@deepseek-ai/dsh-headless@0.1.0-rc.6`、当前
  `@tianwen/runtime-bundle`；公开 headless 入口在严格离线环境中完成一次真实
  Goal/Tool/Session/Evidence 链路，并输出 `TIANWEN_PHASE2_OK`；
- 最终 startup receipt SHA-256 为
  `4B54B087D6059D58F32DCCB29B8D5EDC4533AFB1764AC216D00F0014565279DD`；
  Goal 为 `complete`、`activation=disarmed`、`roundsStarted=0`，三条 Evidence
  分别对应 `create_goal`、`tianwen_smoke_action`、`update_goal`；付费模型、
  live web、Docker 和凭据注入计数均为 0；
- Phase 2 最终门禁：默认 Node `82 passed, 8 skipped`；正式离线启动 E2E
  `2 passed`；Windows 本地沙盒 `3 passed`；Python A1–A5 `10 passed`；
  全量 Python `424 passed, 4 skipped`；Ruff、依赖闭包、私有导入、类型检查、
  diff 和工作树状态均干净；whole-phase review 为 0 Critical、0 Important、
  0 Minor；
- 阶段中出现的 AWS SDK 缺包是 D 盘 pnpm store 的环境准备问题，不是产品逻辑
  回归。最终通过一个精确三层 Profile 临时 workspace 完整预取依赖闭包，随后在
  不可达 registry 下重新完成 frozen install 和正式 E2E；最终验收本身仍是
  0 下载、0 网络；
- 本阶段仍没有 migration cutover、没有删除 Python、没有真实模型、没有真实
  Docker，也没有开始 UI。DSH Developer Preview、Windows 安装期窄
  `shell:true` 例外、可信同进程插件模型、Windows partial sandbox、A1-only
  Python bridge 和 JSONL 非多进程数据库等风险继续保留；
- 下一推荐入口是一个窄且只读的 `tianwen status --goal` 控制投影：先把现有
  Goal、Session、Evidence 和 Champion 状态以用户可读形式展示出来，不新增
  自动晋升、写操作、完整 UI 或 Runtime cutover。

- `tianwen status --goal` 只读控制投影阶段已完成并独立推送；实施分支为
  `codex/tianwen-read-only-goal-status`，远端精确 HEAD 为
  `c3ece065f246faaec31222593a8a5a8dc1ed5ec0`；canonical handoff 位于该分支的
  `docs/operations/tianwen-read-only-goal-status-handoff.md`；
- 设计和计划已经在 main 的 `1bd44cc` 固化。正式包现在发布 `./status` 和
  `tianwen` bin，命令为
  `tianwen status --goal <goal-id> --data-dir <absolute-data-dir> [--json]`；
- 状态命令只读使用公开 DSH Session/Goal API、现有 Evidence projector 和
  canonical Evolution ledger/pointer，展示 Goal、进度、Session、最小 Evidence、
  Champion 与明确的 `not-loaded/read-only/0 model requests` Runtime 标记；它不创建
  Agent、不恢复 Goal、不调用模型、不晋升 Artifact，也不修复治理状态；
- Champion 窄重放在独立复审后补齐了最新评测、审批消费、promote/rollback、
  runtime binding 和失败事件语义；仍按设计不读取 Artifact source bytes，源文件
  校验和修复继续属于 Evolution mutation path；
- 正式离线 Profile E2E 从已安装 tarball 的 `bin.tianwen` 执行状态命令，命令前后
  Session/Evolution 目录和文件字节完全一致；模型 step 从命令前的 4 保持为命令后
  重新读取 Session 得到的 4；三条 Evidence 为 `create_goal`、
  `tianwen_smoke_action`、`update_goal`；
- 最终 Runtime Bundle tarball SHA-256 为
  `CFD046663C0E92D9DA320B67455BA1D712DB19500A627318E71D50243F6F6EF7`；
  Phase 3 状态回执 SHA-256 为
  `41909501165C512914688AB1C92265FFF6C843A16E7DF0EDD7915C3993B7BE8F`；
- 最终门禁：默认 Node `91 passed, 8 skipped`；正式离线 Profile E2E `2 passed`；
  Windows 本地沙盒 `3 passed`；Python A1–A5 `10 passed`；全量 Python
  `424 passed, 4 skipped`；Ruff、依赖闭包、私有导入、类型检查、diff 和工作树
  状态均干净；final review 为 0 Critical、0 Important、0 Minor；
- 全量 Python 本轮耗时 `8060.00s`，用户确认根因是 360 安全防护拦截/扫描 Python
  子进程；测试保持单前台进程并最终全绿，这是环境事件，不是产品失败；
- 本阶段仍未新增完整任务面板、桌面 UI、状态写操作、自动晋升、真实模型、真实
  Docker 或 Runtime cutover。下一推荐入口是复用同一投影做最小只读 Goal/Session
  列表，让用户先发现 Goal id；暂不建设完整桌面任务面板。

- `tianwen list` 最小只读 Goal 发现阶段已完成并独立推送；实施分支为
  `codex/tianwen-read-only-goal-list`，远端精确 HEAD 为
  `62020d2b94eec1b12e8dfa31dcd1e8682662d1d0`；canonical handoff 位于该分支的
  `docs/operations/tianwen-read-only-goal-list-handoff.md`；
- 设计和实施计划已在 main 的 `7c44e8c` 固化。命令为
  `tianwen list --data-dir <absolute-data-dir> [--json]`；它复用 status 的公开 DSH
  Session `list/inspect` 和严格 `foldGoal`，只输出当前 Goal 摘要、进度、更新时间、
  Session 定位和 `not-loaded/read-only/0 model requests` 标记；
- 列表按最近更新时间倒序稳定排列；空状态成功且不创建 Session 目录；无 Goal 的
  Session 被忽略；重复 Goal id 或结构损坏整体失败。旧 `tianwen status --goal`
  合同保持不变，没有新增数据库、索引、watcher、CLI 框架、依赖或 UI；
- 正式离线 Profile E2E 使用同一个已安装 `tianwen` bin，在一次既有 smoke 后依次
  验证 status 和 list，不启动第二次 Runtime；测试保留历史 Sessions，并按本轮精确
  Goal id 唯一匹配。list 前后 Session/Evolution 字节不变，模型 step 为 `4 -> 4`；
- 最终 Runtime Bundle tarball SHA-256 为
  `E885E9DFEA2AF4E6ACB194328A83EB8D174E2E54EC408C38A1F2686C934B321D`；
  Phase 4 list 回执 SHA-256 为
  `F9373DE1D63EE9FEFFD2D5160F3CBF7612D4331FBA8CBAF88CFFE6589E9A9282`；
- 最终门禁：默认 Node `101 passed, 8 skipped`；正式离线 Profile E2E `2 passed`；
  Windows 本地沙盒 `3 passed`；Python A1–A5 `10 passed`；全量 Python
  `424 passed, 4 skipped`；Ruff、依赖闭包、私有导入、类型检查、diff 和工作树
  状态均干净；whole-phase review 为 0 Critical、0 Important，handoff 复审为
  0 Critical、0 Important、0 Minor；
- 第一次默认 Node 最终门因主控漏设既有 `TIANWEN_DSH_PROBE_ROOT` 和
  `TIANWEN_DSH_PROBE_PYTHON` 在 setup 阶段失败，不属于产品验收；补回已审计的固定
  D 盘环境后单次有效门全绿。360 开发者白名单已生效，A1–A5 从约 291 秒降至
  4.13 秒，全量 Python 从 8060 秒降至 158.55 秒；
- 本阶段仍未新增写操作、完整任务面板、自动晋升、真实模型、真实 Docker 或 Runtime
  cutover。下一推荐入口是先设计一个最小且显式的
  `tianwen resume --goal <id>` 写操作合同；必须由用户明确调用，并在编码前先固化
  Goal 权威、恢复前检查、失败语义和可见回执，不提前建设 dashboard、watcher、
  数据库或宽泛控制 API。

- `tianwen resume --goal GOAL_ID --data-dir ABS [--json]` 最小显式写操作阶段已完成
  并独立推送；实施分支为 `codex/tianwen-explicit-goal-resume`，远端精确 HEAD 为
  `992f71900f43a7b15c7381740c7cf03717619348`；canonical handoff 位于该分支的
  `docs/operations/tianwen-explicit-goal-resume-handoff.md`；
- resume 只由用户显式命令触发。它先复用 durable Goal 扫描器，缺失、重复、损坏、
  已完成或轮次耗尽均在 Profile/模型/写入前失败；随后用公开 DSH Session/Goal/Agent
  服务恢复精确 Session 和 Goal revision，只执行一个 Goal round，flush 后等待
  disarmed settlement，并输出 `tianwen.goal-resume.v1` 回执；
- 为避免已安装 CLI 回落到源码工作树，精确 `@deepseek-ai/dsh@0.1.0-rc.6` 作为独立
  host 部署在 `<data-dir>/dsh-host`，不重复装进 Profile。launcher 只接受该目录内
  version/bin/realpath 均有效的 DSH CLI，并以固定 argv、`shell:false` 启动；
- 正式安装 E2E 证明一次 resume 产生一个 resume transition、一个 Goal round、两个
  模型 step，最终 Goal complete/revision 3/roundsStarted 1，Champion 与 evolution
  不变；同一命令第二次因 Goal 已完成返回 1，Session/Evolution 字节不变；
- 最终门禁：聚焦 resume `44 passed, 2 skipped`；默认 Node `115 passed, 8 skipped`；
  正式安装 Profile E2E `2 passed`；Windows 本地沙盒 `3 passed`；Python A1–A5
  `10 passed`；全量 Python `424 passed, 4 skipped`；build、依赖闭包、私有导入、
  类型检查、Ruff、diff 和工作树均干净；两轮独立最终复审均为 0 Critical、
  0 Important、0 Minor；
- 新阶段仍未加入自动 resume、daemon、scheduler、完整任务面板、数据库、真实付费
  模型、真实 Docker、自动晋升或 Runtime cutover。下一推荐入口是先设计“最小新建
  Goal/启动任务”合同或安装器收口；在二者之间应优先补齐可重复的一键安装/升级入口，
  让现有 `list/status/resume` 不再依赖测试脚本准备 Profile 和 DSH host。

- 可重复 Tianwen-on-DSH 安装器阶段已完成并独立推送；实施分支为
  `codex/tianwen-installer`，远端精确 HEAD 为
  `95701d5838ee0a062f579788c8701326f0e5ef37`；canonical handoff 位于该分支的
  `docs/operations/tianwen-installer-handoff.md`；
- 正式入口为
  `node scripts/install-tianwen.mjs --data-dir D:\DevData\tianwen [--json]`。
  用户只选择 D 盘数据目录；DSH `0.1.0-rc.6`、Profile 名、Runtime Bundle、
  子进程程序和 argv 均固定，安装器不修改全局 PATH，而是在回执中返回已安装
  `tianwen` 命令目录；
- 正式安装不再使用 rc.6 的 `dsh plugin add`。真实 fresh Profile 证明它会重新解析
  transitive semver 并可能选择离线 store 中不存在的新 tarball；最终方案只增加一个
  极小的私有 `@tianwen/profile-host` workspace，由仓库 frozen lock 驱动
  `pnpm deploy`，576 个依赖全部从 D 盘复用、0 下载，并包含 Windows 所需的 native
  optional packages；Tianwen-owned 安装链路现在全部保持 `shell:false`；
- Windows pnpm junction 必须在最终 Profile 路径创建。升级时安装器保留旧 Profile
  和旧 Runtime archive 备份，新 Profile、dump-config、CLI、archive 与 receipt
  全部验证/提交成功后才清理；任何 receipt commit 前失败会恢复旧 archive/Profile，
  首装失败不留下 archive、Profile 或成功回执。Session 和 Evolution 不属于安装器
  替换范围，并由 E2E 做安装前后字节比较；
- 最终 fresh 安装/headless/list/status/resume E2E `1 passed`（510.28 秒）；精确最终
  HEAD 的重放 E2E `1 passed`（18.48 秒）；串行默认 Node `132 passed, 7 skipped`；
  Windows 本地沙盒 `3 passed`；Python A1–A5 `10 passed`；全量 Python
  `424 passed, 4 skipped`；Ruff、依赖闭包、私有导入、类型检查、diff 和工作树均
  干净；两次复审发现的 Profile/receipt 与 archive/receipt 失败窗口均已补测试修复，
  最终为 0 Critical、0 Important、Ready；
- 本阶段没有新增 UI、daemon、自动 resume、真实付费模型、真实 Docker、数据库或
  Runtime cutover。现有 `list/status/resume` 已不再依赖测试脚本准备 host/Profile；
  下一推荐入口回到“最小新建 Goal/启动任务”合同，只让用户显式提交 objective 和
  受控预算，复用现有安装器、Profile、Goal 权威和可见回执，不提前建设桌面端或
  宽泛任务 API。

- `tianwen create` 最小显式新建 Goal 阶段已完成并独立推送；实施分支为
  `codex/tianwen-goal-create`，远端精确 HEAD 为
  `2d2777524a9feef0cb314ce46160ae40bd435e32`；canonical handoff 位于该分支的
  `docs/operations/tianwen-explicit-goal-create-handoff.md`；
- 正式命令为
  `tianwen create --objective TEXT --data-dir ABS [--max-rounds N] [--json]`。
  默认预算为 3 轮；命令只创建并 flush 一个顶层 Goal 和 JSONL Session，不自动运行
  Goal round，模型请求增量必须为 0。用户随后复用 `list/status` 查看，再显式调用
  `resume` 花费一轮；
- create 复用安装器固定的 DSH host/Profile 和公开 Goal/Session/Agent 服务，只增加
  一个固定 `shell:false` launcher、一个 runner 与一个 patch。patch 禁用
  `headless-startup`、`headless-runner` 和 `goal-round-driver`；Session 记录命令调用时
  的 `cwd`，确保后续 DSH prompt 组装和 workspace 权威完整；
- runner 只有在 `ctx.sessions.flush()` 确认持久化监听器接受后才返回
  `tianwen.goal-create.v1`。非 JSON 回执给出可复制的 PowerShell resume 命令，数据
  目录使用单引号字面量并正确处理路径中的 `$()` 与单引号；
- 正式安装 E2E 已改为真实 `create -> list/status -> resume`，不再由测试代码私下创建
  resume Goal；create receipt 证明 Goal revision 1/active/rounds 0、Session event 1、
  model request delta 0，随后 resume 正常完成一轮，第二次 resume 不改变状态；
- 最终门禁：聚焦 create/Runtime Bundle `25 passed`；默认 Node `143 passed,
  7 skipped`；正式 installed E2E `1 passed`；Windows 本地沙盒 `3 passed`；
  Python A1–A5 `10 passed`；全量 Python `424 passed, 4 skipped`；离线 frozen
  install、187 包/15 公开入口闭包、0 私有导入、类型检查、Ruff、diff 和工作树均
  干净；正确性复审最终 0 Critical、0 Important，ponytail 复审无中高复杂度问题；
- 本阶段仍没有自动 resume、daemon、scheduler、UI、数据库、真实付费模型、真实
  Docker、自动晋升或 Runtime cutover。下一推荐入口是最小模型/凭据配置和一个真实
  但预算受控的 Goal round 验收；在这之前不建设桌面面板或自主后台循环。

- Tianwen 最小模型/凭据配置阶段已完成并独立推送；实施分支为
  `codex/tianwen-model-config`，远端精确 HEAD 为
  `4567eca10f88cc264d006bc8537d0a870db3999c`；canonical handoff 位于该分支的
  `docs/operations/tianwen-model-configuration-handoff.md`；
- 正式命令为
  `tianwen model status --data-dir ABS [--json]` 和
  `tianwen model use --model offline|deepseek-v4-flash|deepseek-v4-pro --data-dir ABS [--json]`。
  `offline` 固定映射 `tianwen-offline/phase2-smoke`，两个 DeepSeek 选项固定映射
  `deepseek-official` 的对应 V4 模型；选择由 DSH 现有 settings/default-model 服务
  持久化，fresh process 能读取，且可显式切回 offline；
- 凭据只复用 DSH 的 `DEEPSEEK_API_KEY` reference、credentials-local 和环境优先级。
  status 只报告 configured/source/writable 等安全事实，不输出值；本阶段没有 key argv、
  stdin 密钥协议、自建 vault、Session/Goal/receipt 密钥字段、桌面表单或通用凭据框架；
- 模型命令只配置，不创建 Agent/Session，不恢复 Goal，不发模型请求。安装态 E2E 用
  runtime-generated child-only fake key、真实 fetch 失败标记和 Session/Goal/Evolution/
  Champion 字节快照独立证明 0 request 和 0 authority mutation；V4 Pro 持久化与 offline
  rollback 均通过 fresh process；
- rc.6 快速 one-shot runner 曾在 DSH Profile loader/watch setup 完成前调用 `appExit`，
  导致有效回执后退出 13。`setImmediate` 假设被真实 E2E 否定；最终直接复用已发布
  `dsh-headless` 的公开模式 `await ctx.get('loader')?.await()`，direct installed command
  退出 0，完整 installed E2E `1 passed`；
- 最终门禁：聚焦 model/Runtime Bundle `37 passed`；默认 Node `165 passed,
  7 skipped`；正式 installed E2E `1 passed`；Windows 本地沙盒 `3 passed`；
  Python A1–A5 `10 passed`；全量 Python `424 passed, 4 skipped`；离线 frozen install、
  187 包/15 公开入口闭包、0 私有导入、类型检查、Ruff、diff 和工作树均干净；
  Task 2 窄复审和最终 release-record 复审均为 0 Critical、0 Important、0 Minor，
  ponytail 复审结论为 `Lean already. Ship.`；
- 本阶段仍没有真实 DeepSeek 请求、付费调用、自动 resume、daemon、scheduler、UI、
  数据库、真实 Docker、自动晋升或 Runtime cutover。下一推荐入口是一个用户显式触发、
  有硬预算上限和清晰回执的真实模型 smoke/Goal round；由于它会产生外部 API 调用和
  费用，必须获得用户明确授权后才执行。在授权前不应继续堆 dry-run、凭据框架或 UI。

- 单次真实 DeepSeek V4 Pro smoke 阶段已完成并独立推送；实施分支为
  `codex/tianwen-live-model-smoke`，远端精确 HEAD 为
  `53ae351509ab1209a1f0f396e135703580b3e39b`；canonical handoff 位于该分支的
  `docs/operations/tianwen-deepseek-v4-pro-live-smoke-handoff.md`；
- smoke 只通过已安装 DSH 公开 `llm.stream` 路由
  `deepseek-official/deepseek-v4-pro`，固定提示要求精确返回
  `TIANWEN_SMOKE_OK`，不使用 AgentLoop、Goal、Session 或工具；
- 用户批准的唯一付费尝试已经消耗且成功：恰好 1 个请求、29 tokens、marker 匹配，
  按 2026-08-16 官方价格本地估算 CNY `0.000114`；硬上限为 64 输出 tokens、512
  总 tokens、CNY `0.01`、90 秒、无自动重试；
- 脱敏回执保存在
  `D:\DevData\tianwen-live-model-smoke\receipts\deepseek-v4-pro-smoke.json`，
  SHA-256 为
  `1924ce779d00eecc4ea8b7f586d0d1779baa0ef2ef5410a3667ab4ea2b8bc66c`；
  回执不保存原始模型文本或密钥；smoke 后立即切回
  `tianwen-offline/phase2-smoke`，fresh status 的模型请求增量为 0；
- 最终 Runtime Bundle archive SHA-256 为
  `044d3e1d6030cf4be893e1fc9025c9a259eca35b06692f0dbe9d2ebfb39d0c08`；
  最终窄门为 70 项测试、Runtime Bundle build、workspace typecheck 和 diff clean，
  且修复过程没有再次调用模型；
- 当前真实付费授权已经用完。下一推荐入口是先设计并离线证明一个固定工具、单轮预算、
  无副作用的真实 Goal round 合同；真正再次调用外部模型前必须获得新的明确 token/费用
  预算，不能复用本次授权；
- 用户再次明确要求遵守 ponytail 和不过度防御：安全门必须对应真实权限边界和实际损失，
  不能把同用户恶意进程、已被攻陷宿主机或已审核同进程插件突然恶意化等假设自动升级为
  普通开发阻塞。复审意见必须结合当前威胁模型核实，不建设不能形成真实隔离的安全框架；
- 当前超长主控会话在本阶段后交接。新主控会话先读
  `docs/architecture-master-session-memory.md` 和
  `docs/operations/tianwen-master-controller-session-handoff-2026-08-16.md`，旧会话只保留为
  历史，不再承担后续实现上下文。

- DeepSeek V4 Pro 真实 Goal round 阶段已按冻结合同完成并独立存档。阶段分支
  `codex/tianwen-live-goal-round` 远端精确 HEAD 为
  `165d6307ac8e586778979ebd4efb1939a1e0f77a`；canonical handoff 为
  `docs/operations/tianwen-deepseek-v4-pro-live-goal-round-handoff.md`；
  最终集成分支 `codex/tianwen-integration` 远端精确 HEAD 为
  `d519879d65f32f1747221f90597f729f43cf27aa`。历史 `codex/` 阶段分支继续保留，
  未重写历史，未 force-push；
- 该阶段的实现、离线安装态证明、Windows LocalSandbox、Python A1–A5、全量
  Python、Ruff、类型、依赖闭包和私有导入门禁全部通过；最终正确性与
  Ponytail/YAGNI 复审均为 0 Critical、0 Important、0 Minor。本轮没有调用
  真实 Docker；
- 用户批准的本阶段唯一真实 Goal 尝试已消耗，且没有重放。真实结果为
  安全失败：`failureCode=usage-invalid`、2 次 request、0 retry、完成一次
  `tianwen_smoke_action`，但没有 `update_goal`。Goal 保留真实持久状态：
  revision 2、active、rounds 1/1；Session 为 66 events，Evidence 为 1，Champion 仍为 none。
  不得把这个失败写成 Goal 成功，也不得重用该已耗尽 Goal；
- 本次脱敏回执保存在
  `D:\DevData\tianwen-live-goal-round\receipts\deepseek-v4-pro-goal-round.json`，
  SHA-256 为
  `9ab423f5c38c07ac328398a91a8cd6e8693c4f0f6a6e924913d92c38dcc8ee5b`。持久数字事实投影为
  3,369 tokens，按当时官方价格表估算 CNY 0.0058254；该数字不是 provider
  账单，也不是成功回执。真实尝试后已切回 `tianwen-offline/phase2-smoke`，
  fresh read-only status 的模型请求增量为 0；
- 用户更新了真实模型授权方式：以后每个大阶段开始时只申请一次累计
  token/CNY 上限；在已批准的 Goal、范围和累计预算内，不再按请求次数反复
  打断用户。只有 Goal 变化、权限扩大、累计预算扩大、新的真实费用、重大
  不可逆风险或价值取舍才重新请求决定。此规则不追溯授权当前已消耗的 Goal；
- 用户已批准持续学习治理补充设计：
  `docs/superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md`。
  它的状态是 **architecture approved / staged implementation**；当前只按 Alpha-B、Alpha-C、
  Alpha-D 的顺序逐段验证，不据此一次性启动 Signal/Ticket、Candidate/Evaluation、
  Shadow/Promotion 或自动学习实现；
- 主分支收拢后曾将下一入口锁定为狭窄离线设计/复现阶段：只用脱敏 Session 事实解释为何
  第二轮未紧接调用 `update_goal`，先验证公开 DSH authority/tool-choice/output-cap 边界，再
  决定最小修复；不在原 Goal 上提高 rounds、不放宽回执合同、不提前实现完整持续学习闭环或 UI；

- 主控（三）的“真实 Goal 最小修复”阶段已经有界结束。唯一生产修改为单请求输出上限
  `64 -> 128`；离线门禁和独立复审均通过，新的真实链也证明完整 `update_goal` 调用不再
  被截断。但模型提交了错误 Goal id，随后又调用未公开的 `get_goal`；严格 guard 正确拒绝，
  三请求硬门在第四次 provider 调用前停止。结果必须保持为
  `request-limit-exceeded`，不能写成 Goal 成功，也不能重放已耗尽的 1/1 Goal；
- 该阶段形成的是受控的负面 Runtime 证据：已证明的最小截断修复保留，但不存在能够保证
  模型复制正确 Goal id 或强制下一工具的已审计 DSH 公开机制。架构决定不是修改成功标准，
  而是承认原成功门未通过，同时按原停止条件关闭 Stage A。不得继续叠加提示词、shim、
  scheduler、DSH fork 或新的通用 Runtime 框架来追逐一次偶然成功；
- Runtime 从这里冻结为当前已知能力与限制的执行底座。`DSH` 继续负责模型、Agent Loop、
  工具、Session、Goal Round 和恢复；天问后续集中在 Evidence、LearningSignal、候选、评测、
  Champion/Challenger、晋升和回滚。只有后续学习切片用可重复证据证明 Runtime 是真实阻塞时，
  才允许重新打开该边界；
- 进入 Alpha-B 不代表 Stage A 被追认成功。Alpha-B 的目标是证明同模型、同预算、同工具、
  同基线、独立工作区下的 Champion/Challenger 公平成对比较，它不依赖一次真实模型恰好正确
  调用 `update_goal`。因此在最小修复分支、handoff 和本架构决定收拢到 main 后，可以使用
  用户已单独批准且尚未消耗的 CNY 20 Alpha-B 累计预算推进；范围内不逐次询问，越过 Goal、
  权限或累计预算边界时再请求用户；
- 持续学习治理补充设计已进一步确认并写入：能力发现和任务绑定不算学习；业务结果先成为
  Observed Gap 并分诊；经验总结与假设探索是同一 Case 中的互补小循环；假设可以先通过
  受控 Experimental Run 取证，优先使用临时 Run 绑定，只有结构性修改才创建受限
  Experimental Challenger；实验改善不能绕过正式候选评测、Shadow 和晋升。

主控（三）继续维持阶段监督、独立验收和 Git 收口。原 Task 10 心跳保持暂停；旧的宽泛
Alpha 推进方式不恢复，改为按 Alpha-B、Alpha-C、Alpha-D 的窄切片顺序推进。每个阶段仍
使用独立分支、canonical handoff 和 GitHub 存档。

本节是动态状态。以后实施进度变化时可以更新本节，但不得借此修改前面的稳定共识。

## 14. 仍然开放的问题

以下问题尚未最终决定，应继续在主控架构会话讨论，而不是由实施会话自行拍板：

- DSH Goal 与 Tianwen 跨会话 Goal Graph 如何保持单一权威；
- Python 评测桥从 A1 扩展到 A2–A5 时如何取消、恢复和绑定 Run；
- 何时需要 Docker、远程沙盒或 microVM 作为强隔离评测器；
- DSH 升级如何由 `tianwen-dsh-compat` 和 A1–A5 合同约束；
- 第一个真正可晋升的学习对象是否仍只限 `repo_task` Skill；
- 何时引入 Champion/Challenger 的影子或灰度真实运行；
- 如何根据能力证据逐级扩大自主范围；
- 何时增加外部 Agent Worker Adapter；
- 通用项目生成模式需要怎样的用户预览和主观验收协议；
- 模型训练在 Harness 层能力成熟后是否仍有必要；
- 最终用户界面采用 CLI、Codex 式任务面板、桌面应用还是渐进组合；
- 如何把执行证据转为元循环可用、同时保护隐私的最小投影；
- 何时证明底层组件选择已经成为限制，需要移植或替换。

讨论这些问题时，主控会话应先调研、解释和给出推荐，再邀请用户参与真正需要主权判断的部分。

## 15. 每次恢复本会话时的检查清单

会话压缩、模型更换或长时间中断后，先执行：

1. 阅读本文档；
2. 阅读最新架构规格和路线图；
3. 检查独立实施会话的最新交接；
4. 区分稳定共识与动态进度；
5. 向用户简要说明当前讨论位置；
6. 不因看到实施计划就自动开始编码；
7. 用户说“继续”时，恢复最近的架构议题或监督事项；
8. 只有用户明确授权，才在本会话进入具体实施。

如果记忆不确定，应先说明不确定点并查文档，不应凭模糊印象重新设计。
