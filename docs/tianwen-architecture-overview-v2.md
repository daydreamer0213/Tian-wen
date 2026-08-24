# 天问架构总览 v2

**更新：** 2026-08-25

**状态：** 当前产品架构的首要阅读入口；Stage 7 已完成，DSH/HMR 一次性 Profile 关闭已修复

**一句话定义：**

> 天问是建立在 DSH 之上的 Agent 学习控制面：它治理长期目标，从真实执行中提取证据，把可归因的问题转化为候选改进，独立验证，并且只让经过证明的变化影响未来任务。

本文只讲整体结构、模块关系和设计判断。字段、状态机和阶段测试细节留在下钻文档中。

如果只想快速把握项目，先读“当前状态”和第 1–3、9–10 节即可；其余章节用于实现时消除歧义。

## 当前状态（2026-08-23）

Stage 7 已经完成，不再是待验证能力。一个使用配置模型的全新自然任务通过已安装的 DSH
rc.7 产品路径正式运行一次：Goal complete，45/45 Evidence complete，`Outcome=met`，学习
结果为 `no-case`，父 Skill 使用记录为 `recorded`，随后模型恢复 offline。这是项目所有者
实际使用形成的单用户产品证据，不是外部用户验证，也不证明 Candidate 已经普遍改善。

官方离线安装器随后返回 canonical ready；Profile 发布的 16/16 文件均为 regular file、拥有
独立文件身份且没有 source hardlink。安装前后 Sessions/Evolution 不变。installed CLI 的
只读 status 对已成功 Goal 返回 exit 0，而且不泄露 governed private-ledger facts。

现在必须把证据分层理解，不能把不同运行混成一项主张：

- **Stage 7 项目所有者自然任务：** 自然任务与官方 installer/status 证明仍已完成；
  历史 Stage 7 16/16 publication proof 保留为当时的发布事实。
- **scripted mechanics：** 0-external-Provider scripted 全链夹具已通过普通 DSH Agent
  路径覆盖五任务 B/C、盲态 evaluator、隔离 Shadow、Promotion/Rollback/Restore 产品机制。
- **installed ingress readiness：** runner + patch publication contract 是 18/18；每项均为
  regular file、independent inode/identity、no source hardlink、LICENSE 保留。已安装产品接缝是
  installed CLI → installed DSH rc.7 Profile → one-shot runner → 既有 Tianwen Runtime/Evolution services。
  这只证明 archive/publication，不证明真实 Provider lifecycle 成功。
  DSH rc.7 仍是唯一 Agent Runtime；没有第二 controller 或 ledger。
- **Activity-03 历史结果：** DeepSeek model-use receipt 已持久化，但 DSH 进程在任何
  `controlled-lifecycle` 调用前以 exit 13 结束；offline 恢复和最终 status 均成功，
  `controlled-lifecycle` invocation=0。Activity-03 仍已消费，且 Activity-01、Activity-02、
  Activity-03 的历史分类不被改写。
- **关闭所有权：** DSH 负责 Profile 的启动和关闭；HMR watcher readiness 负责自己创建的
  readiness promise。关闭先于 watcher ready 时，修复由 HMR owner 结算该 promise；Tianwen
  不增加第二个关闭控制器、重试、延时或强制退出。这是 DSH/HMR shutdown lifecycle 修复，
  不是 receipt 或安全功能。
- **当前功能证据：** 版本绑定的 HMR owner 回归与真实 Profile 四进程模型选择回归均已通过；
  它们不创建 Agent、Session、Goal 或 Provider 请求。一次新的官方零请求安装证明仍须在
  exact-main CI 通过后单独执行。
- **未来 Activity 边界：** 模型激活和确认 status 是产品 setup，不消费正式 Activity；首次未来
  `controlled-lifecycle` 调用才开始并消费该 Activity。配置的 DeepSeek 受控生命周期尚未运行，
  `naturalUserEvidence=not-claimed`、`externalUserEvidence=not-claimed`，因而不声称真实 Provider 成功。

正常状态转换为：

```text
模型激活 → 新 status 确认选择 → 首次 controlled-lifecycle 调用开始正式评测 → offline 恢复 → 最终 status
```

修复设计和完整历史边界见
[`one-shot Profile lifecycle repair handoff`](operations/tianwen-v0.1-one-shot-profile-lifecycle-repair-handoff.md)。

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
→ B 与 C 在同任务、同模型、同工具、同权限、同 Provider 配置、同评测标准下比较
→ PASS / FAIL / INCONCLUSIVE
→ 通过后进入有限 Shadow
→ 稳定才 Promotion；异常则 Reject 或 Rollback
```

新候选永远和评测开始时的当前 Champion 比。若 Champion 已变化，旧评测失效，需要基于新父版本重新组合和评测。落选候选里的有效 Lesson 会保留，但不能自动拼接上线。

候选默认从最窄作用域开始：本次 Run → 用户或项目 Overlay → 跨项目/领域 Candidate → 通用 Skill Candidate。单个用户或单个项目的证据不能静默改写全局 Skill。

## 7. 权限、预算和安全怎样处理

设计关键是“是否越过用户授权边界”，不是风险标签从无风险变成低风险。

在已经批准的 Goal、权限和影响边界内，可恢复的动作默认自动执行。审计记录用于说明发生了什么，不自动变成审批弹窗。只有以下情况才请求用户：

- 改变顶层 Goal 或成功标准；
- 扩大权限或不可逆影响范围；
- 重大不可逆外部影响；
- 无法由系统替用户决定的价值取舍。

普通 Agent 按 DSH 的原生完成语义运行。项目所有者已在 API 平台设置 DeepSeek 额度，因此 Tianwen 不重复设置模型请求、token、金额预算或价格轮询，也不以机械的固定请求次数代替 Agent 的自然完成条件。权限、不可逆影响、无进展和真实安全停止仍由原有边界控制；API 额度耗尽则如实停止并保留现场。

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
- Candidate 有数量、权限和影响边界；
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

产品基线固定为 DSH `0.1.0-rc.7`。Stage 1–7 的自然 Run/Skill/Evidence/Outcome 终局链、
官方 installer/status 证明、受治理 Skill Candidate 机制和成对 Evaluation 记录保持有效。
这些早期 Candidate 和 Evaluation 仍是 scripted/controlled mechanism proof。
受控全链 fixture 又通过同一
产品 Runtime 证明五任务 B/C、独立客观门、盲态 evaluator、五任务 isolated Shadow，以及
B@rev1→C@rev2→B@rev3→C@rev4 的 Promotion/Rollback/Restore 机制。

这项新证据是 0-external-Provider scripted 全链夹具，而 Stage 7 自然任务结果仍是
`met/no-case`，没有合法产生自然 Candidate。配置的 DeepSeek 受控生命周期尚未运行。

Activity-03 的模型选择 receipt 已持久化 DeepSeek，但进程在 lifecycle 前以 exit 13 结束；offline
恢复成功且 lifecycle invocation=0。该历史结果保持已消费。根因位于 DSH/HMR 的关闭边界：DSH
关闭 Profile 时，HMR watcher readiness 必须结算其拥有的 promise。当前修复只处理这一 owner，
没有改变 receipt、安全边界或正式 Provider 工作。

下一步只允许在 exact-main CI 通过后进行一次全新的官方零请求安装证明。未来的模型激活是 setup，
不会消费正式 Activity；第一次未来 `controlled-lifecycle` 调用才开始并消费它。Activity-01、
Activity-02、Activity-03 的历史分类保持不变，任何真实 Provider 成功仍未被声称。

正式运行仍冻结五任务和单次尝试以保证比较公平，不设 Tianwen 侧模型、token 或金额上限；
也不绕过冻结证据门和 standing authorization 边界。

## 11. v0.1 应该怎样算“做完”

公开的 `Tianwen v0.1.0 Research Preview` 已经存在。它证明了可复现机制和一次项目所有者自然
任务，不应被重新写成“尚未发布”，也不能因此宣称完整自主学习或广泛效能已经完成。

“v0.1 开发收口”现可以做出的主张很窄：

1. development-only synthetic-defect Candidate 在 Candidate 物化前冻结五任务；
2. 执行者、客观 verifier 与盲态 evaluator 分工清楚，fixture 不挑重试；
3. Candidate 通过 B/C 后只进入 `isolated-test` Shadow；
4. Shadow 通过后在 2026-08-23 standing authorization 下完成 Promotion；
5. pointer 只影响隔离 scope 的未来 Run，并已证明回到 B 再恢复 C；
6. 演示、README 和报告区分机制证据、单用户产品证据和未声称的外部效果。

development-only Candidate 只能证明受控工程链。它不能满足自然用户改善、普通产品
incumbent 晋升、外部用户效果或市场泛化主张。缺少这些证据不否定机制收口；它只限制公开结论。

## 12. 文档地图与权威顺序

发生冲突时，按以下顺序理解：

1. 当前代码、exact SHA、测试与 exact-main CI：实现和运行事实；
2. 本文：整体产品架构、组件关系、当前方向和阅读入口；
3. [`activity-02 recovery design`](superpowers/specs/2026-08-24-tianwen-v0.1-controlled-real-activity-02-recovery-design.md)、[`packet`](superpowers/specs/2026-08-24-tianwen-v0.1-controlled-real-activity-02-packet.md) 与 [`plan`](superpowers/plans/2026-08-24-tianwen-v0.1-controlled-real-activity-02-recovery.md)：当前 recovery authority、exact argv、隔离边界与实施顺序；
4. [`tianwen-v0.1-controlled-real-activity-01-handoff.md`](operations/tianwen-v0.1-controlled-real-activity-01-handoff.md)：activity-01 usage failure、证据分级与隔离的 activity-02 恢复门；
5. [`2026-08-23 controlled real operation design`](superpowers/specs/2026-08-23-tianwen-v0.1-controlled-real-operation-design.md) 与 [`plan`](superpowers/plans/2026-08-23-tianwen-v0.1-controlled-real-operation.md)：activity-01 的历史 authority 与实现审计，不再覆盖 recovery authority；
6. [`tianwen-v0.1-controlled-real-operation-readiness-handoff.md`](operations/tianwen-v0.1-controlled-real-operation-readiness-handoff.md)：已安装入口 readiness、分段验证历史与 pre-operation 隐私边界；
7. [`2026-08-22-tianwen-v0.1-closeout-and-controlled-evaluation-design.md`](superpowers/specs/2026-08-22-tianwen-v0.1-closeout-and-controlled-evaluation-design.md)：当前评测、Shadow、Promotion、Rollback 与停止线；
8. [`2026-08-23-tianwen-v0.1-controlled-real-skill-lifecycle.md`](superpowers/plans/2026-08-23-tianwen-v0.1-controlled-real-skill-lifecycle.md)：受控机制的逐 Task 实现、复审与合并顺序；
9. [`tianwen-v0.1-controlled-skill-lifecycle-handoff.md`](operations/tianwen-v0.1-controlled-skill-lifecycle-handoff.md)：scripted 历史依据，记录受控全链 fixture 的机制、计数、隐私与证据限制；
10. [`tianwen-stage7-natural-run-evidence-trial-handoff.md`](operations/tianwen-stage7-natural-run-evidence-trial-handoff.md) 与 [`tianwen-rc6-rc7-managed-install-migration-handoff.md`](operations/tianwen-rc6-rc7-managed-install-migration-handoff.md)：Stage 7 自然任务与 installer/status 当前运营事实；
11. [`2026-08-19-tianwen-runtime-boundary-reset-design.md`](superpowers/specs/2026-08-19-tianwen-runtime-boundary-reset-design.md)：正式 Runtime 所有权、集成 seam、非干扰合同和恢复顺序；
12. [`2026-08-17-tianwen-continuous-learning-governance-design.md`](superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md)：长期 Signal、Case、Lesson、Candidate、评测、权限、Shadow 和回滚原则；
13. [`2026-08-19-dsh-upstream-capability-overlap-audit.md`](research/2026-08-19-dsh-upstream-capability-overlap-audit.md)：DSH rc.7 已有能力与 Tianwen 差异化边界的历史事实依据；
14. Stage 4/5/6 handoff、2026-08-20 public-readiness 与旧 Alpha 资料：历史 checkpoint，不再是当前能力清单，不得反向改写当前事实。

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
