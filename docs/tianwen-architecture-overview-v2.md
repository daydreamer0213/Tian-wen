# 天问架构总览 v2

**日期：** 2026-08-19

**状态：** 审阅稿；用户确认并合并后作为当前产品架构的首要阅读入口

**一句话定义：**

> 天问是建立在 DSH 之上的 Agent 学习控制面：它治理长期目标，从真实执行中提取证据，把可归因的问题转化为候选改进，独立验证，并且只让经过证明的变化影响未来任务。

本文只讲整体结构、模块关系和设计判断。字段、状态机和阶段测试细节留在下钻文档中。

如果只想快速把握项目，先读第 1–3、9–10 节即可；其余章节用于实现时消除歧义。

## 1. 先说结论：天问是什么

天问不是另一个从头实现的 Agent，也不是一个“任务结束后自动总结 Skill”的插件。

它是在一个成熟 Agent Runtime 外增加的长期治理层，重点解决普通 Agent 较少负责的四件事：

1. 一个长期目标如何跨多次任务、运行和会话持续推进；
2. 一次执行中发生了什么，哪些事实可以作为后续学习证据；
3. 哪些问题值得学习，原因是否明确，应该形成什么范围的候选改进；
4. 候选如何经过独立评测、试运行和回滚，只在证明更好后影响未来任务。

因此，用户此前的理解是正确的：

> 天问本质上是一套治理思想和学习控制面。它不干扰现有 Agent 的正常执行；它关心如何更好地实现长期目标，以及怎样从问题中改进并避免反复犯错。

但需要补充一点：天问不只是“运行后治理”。它还在运行前选择长期 Goal 的下一项任务、冻结本次使用的能力和边界；在运行之间处理学习、评测和版本变化。

## 2. 总览图：一个执行内核，两个循环，一条学习旁路

```text
                         用户决定长期 Goal、边界和价值取舍
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Tianwen 长期 Goal 循环                            │
│  选择下一 Task → 冻结 Champion / Skill / 权限 / 验收标准 → 创建 Run │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ 委托普通任务
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       DSH Agent 执行循环                              │
│  看上下文 → 模型判断 → 调工具/MCP → 接收结果 → 修正 → 最终回答       │
│  Session / Resume / Tool / Sandbox / Plan / Todo 等执行事实都由 DSH  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                  ┌─────────────┴─────────────┐
                  ▼                           ▼
         用户获得本次结果              Tianwen 投影最小 Evidence
                  │                           │
                  ▼                           ▼
         Goal 继续/完成/等待         Observed Gap 分诊
                                              │
                   无可复用问题 ──────────────┤→ 不学习，正常结束
                                              │
                   重复可归因问题或明确纠正 ──┘
                                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│               Tianwen 后台学习与版本治理旁路                         │
│  Case → Attribution → Lesson → Candidate → 独立 Evaluation           │
│       → Shadow → Promotion / Reject / Rollback                       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ 只更新未来新 Run 的选择
                                └───────────────► 回到长期 Goal 循环
```

最重要的关系只有两条：

- Goal 主循环把经过分诊的问题送入学习旁路；
- 学习旁路只把验证过的新版本提供给未来 Run。

学习默认在后台或延后进行，不暂停当前任务，也不会在任务执行到一半时热换 Skill。

## 3. DSH 与天问分别负责什么

判断标准不是“代码写在哪种语言”，而是谁拥有这项产品语义。

| 范围 | 处理方式 | 说明 |
|---|---|---|
| 模型、Provider、Agent Loop | 直接复用 DSH | 天问不包裹每一次模型请求，也不解释模型何时结束 |
| Tools、MCP、工具反馈、普通 Sandbox | 直接复用 DSH | 天问只在真实外部副作用发生前接入授权判断 |
| Session、恢复、Fork、Compaction、Session Query | 直接复用 DSH | DSH Session 是执行事实来源；Tianwen 只读查询并投影需要的 Evidence |
| 当前 Session 的 Goal、Plan、Todo | 直接复用 DSH | 服务当前执行，不冒充跨会话长期 Goal |
| Skill provider、目录、catalog、loader | 直接复用 DSH | Tianwen 不再自己造 Skill 加载框架 |
| Jobs、Workflow、Subagent | 直接复用 DSH | DSH 负责当前执行中的本地任务和工作流，不复制同类组件 |
| Message Feedback、Approval、permissions | 直接复用 DSH | 反馈、审批和执行权限沿用 DSH 公共能力；Tianwen 只增加跨 Run 治理语义 |
| 长期 Goal Graph 与下一 Task 选择 | Tianwen 新增 | 跨 Task、Run、Session 保存目标、依赖和进度 |
| Run Manifest 与版本冻结 | Tianwen 薄适配 | 选择本次 Champion、Skill/Overlay、权限和验收标准，再交给 DSH |
| Evidence 来源、用途、作用域绑定 | Tianwen 新增 | 从 DSH Session 单向投影，不复制第二份 Session |
| Learning Intake 与 Attribution | Tianwen 新增 | 判断是否值得学习以及问题真正属于哪一层 |
| Candidate、Evaluation、Shadow | Tianwen 新增 | 候选不能自己宣布成功，也不能影响当前 Run |
| Promotion、Champion、Rollback | Tianwen 新增 | 只改变未来 Run 的活动版本，保留历史 |
| Python Alpha、Docker verifier | 冻结为实验室 | 保存任务包、评测合同和失败证据，不再充当产品 Runtime |

这条所有权边界必须保持清楚：DSH rc.7 提供 Session Query、Skill、Jobs、Workflow、Message Feedback、Approval 和 permissions；Tianwen 保留跨 Run Goal Graph、Evidence provenance（证据来源与流转记录）、学习归因和面向未来 Run 的版本治理。

DSH Message Feedback 只是 Tianwen 做学习归因时可以读取的一项输入，不会自动成为 Lesson。DSH Job 表示当前进程中的一项工作，不等于可跨 Run 持久保存、进入学习治理的 Learning Ticket。

这张表也给出了以后写代码的默认顺序：

```text
DSH 已有 → 直接复用
DSH 能组合但缺一小段 → 写薄适配
确属 Tianwen 特有且无可用 seam → 最小自研
只是未来可能需要 → 暂不实现
```

## 4. 两个循环为什么不会互相打架

### 4.1 Goal 循环负责把事情做完

例如用户的长期 Goal 是“成为一个稳定更新的自媒体博主”。天问可以把它拆成选题、脚本、拍摄、发布、复盘等多个 Task。每个 Task 交给 DSH 正常执行。

如果一次视频留存率低，这个结果先进入 Goal 循环的业务复盘。系统可以直接修下一条视频，也可以继续收集数据；它不会因为看到一个低指标就立刻暂停创作并改写 Skill。

### 4.2 学习旁路负责避免以后重复犯同类错误

只有当留存率低成为重复、可归因的问题，或者用户明确指出某种做法错误时，才形成学习 Case。后台可以提出“开头铺垫过长”等假设，用受控实验取得新证据，再总结 Lesson、产生有限 Candidate。

候选评测完成前，当前 Champion 不变。评测和试运行证明候选更好后，新 Champion 才用于后续同类视频。正在制作的视频不会执行到一半换规则。

所以“经验总结”和“假设探索”不是两条互斥路线，而是 Case 内的小循环：

```text
已有证据足够 → 经验总结
证据不足 → 提出可区分假设 → 受控实验 → 新证据 → 再总结
```

## 5. 什么情况下才算“学习”

以下情况默认不产生 Candidate：

- 找到了一个现成 Skill；
- 模型觉得自己哪里做得不好；
- 一次普通失败或低分；
- 一次用户临时选择；
- Runtime、网络或环境故障；
- 当前任务做了临时修正；
- 一次任务成功。

这些事实可以被记录，但“记录”不等于“学习”。进入正式学习治理通常需要：

- 重复、同类且可归因的真实问题；或
- 用户明确纠正；或
- 经独立验证的高影响事实。

学习也允许正常地得出 `no Case`、`no Lesson` 或 `no Candidate`。没有问题时不学习，是正确结果，不是系统没工作。

## 6. 候选怎样产生和使用

候选不是把几条新规则直接塞进正式 Skill，而是一份有父版本、作用域和证据的可执行改进。

基本流程是：

```text
当前 Champion B
→ 从 Case/Lesson 形成 Candidate C
→ B 与 C 在同任务、同模型、同工具、同权限、同预算、同评测标准下比较
→ PASS / FAIL / INCONCLUSIVE
→ 通过后进入有限 Shadow
→ 稳定才 Promotion；异常则 Reject 或 Rollback
```

新候选永远和评测开始时的当前 Champion 比。若 Champion 已变化，旧评测失效，需要基于新父版本重新组合和评测。落选候选里的有效 Lesson 会保留，但不能自动拼接上线。

候选默认从最窄作用域开始：本次 Run → 用户或项目 Overlay → 跨项目/领域 Candidate → 通用 Skill Candidate。单个用户或单个项目的证据不能静默改写全局 Skill。

## 7. 权限、预算和安全怎样处理

设计关键是“是否越过用户授权边界”，不是风险标签从无风险变成低风险。

在已经批准的 Goal、权限和累计预算内，可恢复、低成本的动作默认自动执行。审计记录用于说明发生了什么，不自动变成审批弹窗。只有以下情况才请求用户：

- 改变顶层 Goal 或成功标准；
- 扩大权限或累计预算；
- 重大不可逆外部影响；
- 无法由系统替用户决定的价值取舍。

普通 Agent 的执行预算由 DSH 的原生能力承担。Tianwen 可以在 Run 前冻结用户批准的成本和影响边界，但不再用机械的固定请求次数代替 Agent 的自然完成条件。限制应优先表达为真实资源上限、时间上限和无进展停止，而不是“第 8 次请求后无论是否完成都失败”。

## 8. 五条不可破坏的不变量

1. **单一 Runtime：** 正式产品只有 DSH 一个 Agent 执行内核。
2. **非干扰：** Tianwen 开启但不改变冻结输入时，DSH 的动作、工具反馈、产物和终答应与关闭时等价。
3. **当前 Run 不热换：** 新 Lesson、Candidate 或 Champion 只影响未来 Run。
4. **失败语义分离：** 执行失败、验证失败、Evidence 投影失败、学习证据不足、候选评测失败和晋升拒绝不能混成一个“失败”。
5. **证据先于改变：** 模型自评、字段存在或单测通过不能替代真实执行、独立验证和持久证据。

任何偏离主流 Agent 语义的设计，都必须先回答：现实中稳定复现了什么问题，现有 DSH 能力为什么解决不了，偏离会损失什么，以及怎样用端到端证据证明它确实必要。

## 9. 原来的设计还有没有用

有用，而且大部分没有浪费；需要区分“设计思想”和“当时的实现载体”。

### 9.1 继续作为产品权威的内容

- 用户掌握顶层 Goal、权限边界和价值取舍；
- Goal、Task、Run、Action 分层；
- Evidence 可追溯，模型不能自证验收通过；
- Observed Gap 先分诊，再决定是否形成 Signal/Case；
- 经验总结与假设探索组成有界小循环；
- Lesson 有适用范围、反例和失效条件；
- Champion/Challenger 公平比较；
- Candidate 有数量和预算边界；
- 主观满意由真实用户证据决定；
- Promotion、Shadow、Rollback 只改变未来 Run；
- 边界内自主执行，越界才询问用户；
- 比例化安全：现实显著风险才设阻塞门。

### 9.2 继续作为实验和验收资产的内容

- Alpha A1–A5 任务包和真实运行结果；
- Alpha-B 成对比较和三值结论；
- Alpha-C Intake、no-Case/no-Candidate 证据；
- Docker verifier、Evidence、恢复和费用记账中暴露的真实问题；
- B1 对任务说明、Agent 探索和硬请求上限的观察。

这些资产以后用于验证 DSH/Tianwen 集成是否满足同样的行为合同，不再要求把原 Python Runtime 搬进产品。

### 9.3 已经明确停止的方向

- 继续扩建 Python `RepoTaskRuntime` / `AlphaRuntime` 为第二套通用 Agent；
- 自己重写 Agent Loop、Session、Tool/MCP、普通 Sandbox、恢复、Skill loader 或后台任务系统；
- 用固定 8/10 次请求作为普通任务的完成门；
- TTY 确认、10 分钟价格快照等与现实风险不成比例的门；
- 自定义“只能一个末尾换行”的 JSON 协议；
- 为每次环境问题建立新的通用 recovery framework；
- 当前任务执行中热改 Skill 或切换 Champion；
- 没有真实需求就建设 Skill Graph、多后端和候选锦标赛。

前面的工作不是白写，而是帮助项目找到了真正的边界。应当丢弃的是错误实现方向，不是从中得到的证据和架构判断。

## 10. 当前开发阶段与下一步

当前产品依赖基线已固定为 DSH `0.1.0-rc.7`。发布闭包、公共复用 seam、Agent/Goal/Session/Evidence 和 Runtime 组合稳定门已经通过；产品工作区在 fresh `DSH_HOME` 下执行原生 headless 配置检查时，首次维护完整 Profile fallback 链接超过了有界观察时间且没有输出。为此完成的三项且仅三项判别检查已经核对 CLI 身份与环境、Profile 加载入口和进程树：前两者一致，进程树只显示产品 fresh HOME 停留在 fallback 维护阶段；本次升级不再追加 headless 探针。独立 rc.7 fixture 的同一 CLI/Profile 能正常输出配置，因此这项事实记录为产品环境与首次初始化组合差异，不写成 rc.7 API 失败，也不伪称产品 headless 门已通过。原生 `dump-config` 不再作为 rc.7 依赖升级的承重阻断门；首次 Profile fallback 维护耗时作为独立的 bootstrap 性能问题跟踪。

恢复建设顺序固定为：

1. **保持 rc.7 产品稳定门：** 以 exact closure、公共 seam、类型检查和执行语义回归作为升级承重证据；单独跟踪 fresh headless bootstrap 性能，不加超时或包装器掩盖；
2. **DSH 原生普通任务：** Tianwen 关闭时，DSH 自己完成观察、工具反馈、修正和终答；
3. **只开启 Evidence：** 证明 Tianwen 开关不改变普通执行；
4. **接长期 Goal：** 跨 Task/Run 推进目标，不重造 DSH 单轮 Goal；
5. **接非阻塞 Learning Ticket（Stage 1 已证明）：** 真实 DSH 显式负面反馈可在用户结果完成后形成持久化 Signal/Ticket；入口失败不改变 Session 或当前 Run；
6. **接重复结构化 Outcome（Stage 2 已证明）：** 在 Run 结束后消费冻结的验收结果；第一次普通可复用失败只记录 Signal，另一个 Run 的第二次同类失败创建一个开放 Ticket；
7. **最后接 Candidate/Shadow/Promotion：** 用一个真实、可复现问题跑通候选闭环。

Stage 2 已证明 Tianwen Run 身份与其绑定的 DSH Session 身份相互独立，并证明跨两个不同 Run 的结构化重复失败能够在现有 ledger 中形成两个 Signal 和一个 Ticket。同 Run 回放保持幂等。`met`、`inconclusive`、`observe`、`ordinary-correction` 和无关的基础设施错误都不会创建 Ticket，入口也不改变 DSH Session。

Case、Attribution、Lesson、有限 Candidate、Evaluation、Shadow 和 Promotion 仍未实现。下一入口是 Stage 3 的 Case/Attribution/Lesson/有限 Candidate 设计；不得把 Python Alpha 接成第二套产品 Runtime。

这条顺序的目的不是重新开始，而是把已经验证的治理能力放回正确位置。

## 11. v0.1 应该怎样算“做完”

建议把第一个公开完成点定义为 `Tianwen v0.1 Research Preview`，而不是声称完整自主学习 Agent 已完成。它至少应证明：

1. DSH 能正常完成一个普通任务；
2. Tianwen 能把一次 DSH Session 绑定到长期 Goal 并投影 Evidence；
3. 一个真实、可复现的问题能形成 Case、Lesson 和 Candidate；
4. Champion 与 Candidate 能公平比较，并能得到 PASS/FAIL/INCONCLUSIVE；
5. 通过的候选只影响未来 Run，失败可以保留 Champion 或回滚；
6. 有一条命令可复现实验，并有简短架构图、结果表和限制说明。

这会把项目从“很多内部机制”变成一个可展示、可复现、可求职、也可让外部开发者判断价值的完整技术作品。

## 12. 文档地图与权威顺序

发生冲突时，按以下顺序理解：

1. 本文：整体产品架构、组件关系、当前方向和阅读入口；
2. [`2026-08-19-tianwen-runtime-boundary-reset-design.md`](superpowers/specs/2026-08-19-tianwen-runtime-boundary-reset-design.md)：正式 Runtime 所有权、集成 seam、非干扰合同和恢复顺序；
3. [`2026-08-17-tianwen-continuous-learning-governance-design.md`](superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md)：Signal、Case、Lesson、Candidate、评测、权限、Shadow 和回滚细则；
4. [`2026-08-19-dsh-upstream-capability-overlap-audit.md`](research/2026-08-19-dsh-upstream-capability-overlap-audit.md)：DSH rc.7 已有能力与 Tianwen 差异化边界的事实依据；
5. Alpha-C Intake、Alpha-B comparison 等阶段规格：局部治理合同和实验依据；
6. plans、operations handoff、Alpha 分支：实施记录和历史证据，不得反向改写产品架构。

旧的 [`architecture-master-session-memory.md`](architecture-master-session-memory.md) 保留会话历史、愿景和监督约定；其中与本文或 Runtime 边界重置冲突的旧状态、旧阶段顺序和双 Runtime 表述不再具有产品权威性。

## 13. 给未来实现会话的快速检查

开始写新组件前，先回答下面七个问题：

1. 这是普通 Agent 执行能力，还是 Tianwen 特有治理能力？
2. DSH 或已锁定依赖是否已经有公开实现？
3. 能否通过配置、Profile、Preset、hook 或 plugin 薄接？
4. 这项控制保护的是现实显著风险，还是理论上的极小概率？
5. 它会不会打断 DSH 正常观察、工具反馈、修正或终答？
6. 它改变当前 Run，还是只改变未来 Run？
7. 用什么端到端事实证明它必要且有效？

如果前六个问题说不清楚，就先不写。字段齐全不等于架构正确，门越多也不等于系统越可靠。
