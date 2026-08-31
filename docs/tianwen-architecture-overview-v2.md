# 天问架构总览 v2

**更新：** 2026-08-31

**状态：** 当前产品架构和能力状态的首要阅读入口；Runtime `0.1.8` 已完成实现、正式安装、Web Profile 更新和桌面产物构建

**一句话定义：**

> 天问是建立在 DSH 之上的 Agent 学习控制面：它治理长期目标，从真实执行中提取证据，把可归因的问题转化为候选改进，独立验证，并且只让经过证明的变化影响未来任务。

本文只讲整体结构、模块关系和设计判断。字段、状态机和阶段测试细节留在下钻文档中。

如果只想快速把握项目，先读“当前状态”和第 1–3、9–10 节即可；其余章节用于实现时消除歧义。

## 当前状态（2026-08-31）

判断“已经实现”还是“仍待开发”时，权威顺序固定为：当前 `main` 源码与最新发布交接、本文
“当前状态”、功能运行交接、设计与实施计划。设计和计划用于保存当时的约束与执行顺序，不是
发布后的待办列表；计划中保留的未勾选框、历史运行的 `incomplete`，以及当时尚未通过的门，
都不能覆盖后来已经完成的实现、合并和 exact-main CI。历史证据本身仍保持原分类，不因发布而
改写成一次成功的自然运行。

Goal-first 长期目标主线已经进入正式产品，而不是待实现设计。当前默认入口是普通 DSH
Web/Desktop 对话中的 `/goal <目标>`；用户无需打开天问面板，也不需要手工填写 Task 或每项轮数。
天问使用同一个稳定 Planner Session 自动维护未来 Task，并让每个已接纳 Task 在独立 DSH
Session 中执行。原“长期目标”面板只作为兼容/高级历史入口保留；从该面板创建时也只填写目标、
可选背景和成功标准，不恢复手工 Task 或轮数。

正式安装产品已经用 configured DeepSeek 完成过一个三 Task 连续 Goal；可选 Desktop 面板
详情进一步按“当前工作、已完成、接下来、已放弃”展示权威状态，并把主操作明确为
“继续规划、开始下一步或继续当前工作”。该界面来自与普通 `dsh web` 相同的
Runtime 插件，Desktop 不拥有第二套 Goal 引擎。

普通 Goal-first 已完成/已放弃 Task 现在也能从同一详情页进入既有 Learning Intake：
“有帮助”持久化为 `no-case`，“需要改进”可形成 `observed-gap` 或 Learning Ticket；
回显只暴露安全决策，不回显用户原始说明。反馈不会把普通 Task 完成冒充为受治理 Outcome，
也不会自动创建 Case、Candidate 或 Skill。正式安装产品已用真实 DeepSeek Task 验证 Task
完成与 Turn 收尾之间的竞态，Host 复用 DSH `Agent.whenIdle()` 后再登记反馈。

同一个 Goal-first 弹窗现在提供“改进线索”入口：它按 open Ticket 展示来源 Goal、来源 Task、
记录时间和合并出现次数，并支持从 Task 反馈跳到线索、再返回来源 Goal。用户可明确点击
“分析一次”；Host 在本地重验来源后，把私密反馈和收到反馈的最终回复直接交给一个普通 DSH
Agent Session。分析结果、运行进度和失败都由该 Session 持久化；重启或再次点击只打开同一个
Session，不自动创建第二次分析。浏览器投影和界面不显示问题指纹、Signal ID、工作区、Evidence
或原始反馈说明；没有安全 Goal-first 来源的 Ticket 不进入界面。分析仍不会自动升级为 Case、
Lesson、Candidate、Skill 或代码修改。分析进入终态后，用户可将线索标记为“已审阅”；该状态只
表达用户已经检查过线索，默认从待处理列表隐藏。若 Ticket 后续合并了新的 Signal，当前出现次数
超过已审阅次数，线索会自动回到待处理。审阅记录不复制私密反馈或分析内容，也不表示问题已修复。

Runtime `0.1.5` 新增 DSH 原生连续 Goal 模式：用户在普通 Web/Desktop 对话中输入 `/goal <目标>`，
Agent 作用域命令创建绑定当前控制 Session 的 v3 Long Goal。Planner 继续维护 Task 边界，每个
已接纳 Task 仍使用独立 DSH Goal/Session，完成结果按既有“不可信历史执行数据”边界进入下一次
Planner Turn。用户可在控制对话中自然补充方向，模型通过受限的 `goal_control` 工具持久化引导、
纠正、暂停、恢复或查询；DSH 原生停止控制会把连续 Goal 置为暂停。Host 只在 Task 完成、用户
停止和冷启动恢复这些既有生命周期边界串行推进，不增加 scheduler、轮询器或重试队列。

这项模式没有第二套 UI，也不写自定义进度 Session 事件：普通对话仍是默认入口，原“长期目标”
面板只作为可选高级历史继续复用。v1/v2 显式 Goal-first 行为和数据保持兼容。

Runtime `0.1.7` 曾把普通进度放进 DSH 的 `conversation.input.dock` 紧凑卡片；普通产品使用证明这仍是
独立 UI，不符合“天问内化在正常对话中”的产品方向。当前源码已经删除该插槽、投影模块和刷新逻辑，
后续不得把它恢复成主入口。现在 v3 Goal 在首个 Task 开始、Task 切换、阻塞和最终完成这些关键边界，
由原控制 Agent 产生一条普通助手回复并写回原 Session；用户无需识别天问组件。该反馈 Turn 禁止工具和
Goal 控制，发送前复核精确持久状态，没有轮询、第二套消息记录或持久重试队列。若终态发生时控制 Session
尚未加载，Host 会在该 Session 下一次变为 live 时从持久 Goal 状态恢复交付；发送前还会检查相同通知是否
已经形成完成的助手 Turn，因此不会重跑 Task，也不会在重启后重复补交同一结果。原“长期目标”面板只保留
为可选历史与诊断。

2026-08-31 的第一次普通用户 Desktop `/goal` 已完成一次真实只读项目审查：Planner、Task 和 Long Goal
均完成，原 Task 最终回复随后通过控制 Session 恢复进入主对话，没有重跑自然任务。这次使用也暴露并确认
了两个尚未闭合的交互问题：Planner/Task 目前仍是普通顶层 DSH Session，会出现在“未分组”会话列表；
关键边界回复的进度粒度仍偏少。前者应优先复用 DSH 原生持久子 Agent/父子 Session 表达，后者只增加
“刚完成、正在做、下一步”这些有决策价值的信息，不恢复独立卡片、逐工具播报或高频轮询。

当前交付身份为 `@tianwen/runtime-bundle@0.1.8`、Desktop `0.1.0-preview.9`。正式安装器已经在同一
DSH `0.1.1-rc.2` host 上把 managed Runtime 更新到 `0.1.8`，Web Profile 也已通过正式 DSH
`plugin add` 更新；安装后的客户端与构建产物哈希一致，且不再注册 `conversation.input.dock`。
Desktop 只把精确 `0.1.7` 识别为可更新前身，得到用户确认后调用一次既有 DSH plugin add，并以
`0.1.8` 严格复核；更旧、未知、未来或损坏 Profile 不会被自动覆盖。桌面安装包已经以
`0.1.0-preview.9` 独立构建并通过离线产物审计，不重新部署 DSH host，也不增加在线更新器。
当前交付证据见[`原生对话进度交接`](operations/tianwen-native-conversation-progress-handoff.md)，交互决策见
[`原生对话进度设计`](superpowers/specs/2026-08-31-tianwen-native-conversation-progress-design.md)；被否决的
Runtime `0.1.7` 紧凑卡片只保留为历史，不得反向覆盖当前状态。
本阶段的真实 Provider 尝试没有走到有效 v3 continuous Goal 入口，因此不冒充自然验收；后续由
普通用户实际 `/goal` 运行自然补齐，不再安排新的合成 Activity。外部 publish、tag、Release 与
installer upload 仍未执行，因此本文不宣称已经外部发布。

当前 Goal-first 权威下钻文档是
[`设计`](superpowers/specs/2026-08-30-tianwen-goal-first-planning-design.md)、
[`真实执行 handoff`](operations/tianwen-goal-first-task-execution-handoff.md) 和
[`Desktop UX handoff`](operations/tianwen-goal-first-desktop-ux-handoff.md)，以及
[`Task feedback handoff`](operations/tianwen-goal-task-feedback-handoff.md)；当前发布边界见
[`原生对话进度交接`](operations/tianwen-native-conversation-progress-handoff.md)，连续 Goal 的
历史自然运行与修复证据见
[`continuous Goal handoff`](operations/tianwen-dsh-native-continuous-goal-handoff.md)，已完成的执行顺序见
[`implementation plan`](superpowers/plans/2026-08-30-tianwen-dsh-native-continuous-goal.md)。上一版发布边界见
[`Runtime 0.1.1 release handoff`](operations/tianwen-runtime-release-identity-handoff.md)，线索可见性见
[`Learning clue inbox handoff`](operations/tianwen-learning-clue-inbox-handoff.md)，单次分析边界见
[`Learning clue analysis handoff`](operations/tianwen-learning-clue-analysis-handoff.md)。以下
2026-08-27 证据分层继续作为历史事实保留，不应反向覆盖这一较新的产品状态。

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
- **自然开发任务：** Profile dump 与 ordinary resume persistence 两项真实代码任务均为
  `task-passed`，前者及其 Tianwen-owned DSH patch 已进入 main，后者也已完成受控集成。
  cold Profile boot 与 Natural Trial stream-error 任务保持 `task-incomplete`，independent verdict
  intake 保持 `task-incomplete + task-design-invalid`；这些结果都没有通过重跑改写。
- **自然任务阶段边界：** 现有成功、失败和监督设计错误样本已经足以证明当前阶段，不再为了
  测试 Tianwen 而制造新自然任务。以后只把真实项目待办交给 Tianwen；新的正式盲评只用于
  外部用户任务、尚未证明的产品边界，或已经合法形成的 Candidate。
- **scripted mechanics：** 0-external-Provider scripted 全链夹具已通过普通 DSH Agent
  路径覆盖五任务 B/C、盲态 evaluator、隔离 Shadow、Promotion/Rollback/Restore 产品机制。
- **installed ingress readiness：** runner + patch publication contract 是 18/18；每项均为
  regular file、independent inode/identity、no source hardlink、LICENSE 保留。已安装产品接缝是
  installed CLI → installed DSH rc.7 Profile → one-shot runner → 既有 Tianwen Runtime/Evolution services。
  这项历史门本身只证明 archive/publication；DSH rc.7 仍是唯一 Agent Runtime，没有第二
  controller 或 ledger。
- **Activity-22 当前正式结果：** 一个全新的官方已安装 configured-DeepSeek 受控生命周期现已
  返回 `passed`。25/25 正式角色闭合：2 seed、10 B/C arm、5 evaluator、5 Shadow、3 transition；
  指针完成 B@rev1→C@rev2→B@rev3→C@rev4，随后官方命令恢复并确认 offline。
  receipt 报告 70 个 model-request event、72 个 tool-call event 和 20 条 acceptance Evidence；
  25 个持久 Session 全部以 completed Turn 结束。
- **Activity-03 历史结果：** DeepSeek model-use receipt 已持久化，但 DSH 进程在任何
  `controlled-lifecycle` 调用前以 exit 13 结束；offline 恢复和最终 status 均成功，
  `controlled-lifecycle` invocation=0。Activity-03 仍已消费，且 Activity-01、Activity-02、
  Activity-03 的历史分类不被改写。
- **关闭所有权：** DSH 负责 Profile 的启动和关闭；HMR watcher readiness 负责自己创建的
  readiness promise。关闭先于 watcher ready 时，修复由 HMR owner 结算该 promise；Tianwen
  不增加第二个关闭控制器、重试、延时或强制退出。这是 DSH/HMR shutdown lifecycle 修复，
  不是 receipt 或安全功能。
- **当前功能证据：** HMR owner、真实 Profile 模型选择、安装发布、完整 controlled lifecycle
  均已通过各自边界；Activity-22 是首次闭合 installed CLI → Profile → Runtime/Evolution →
  evaluator → Shadow → transition 的正式 product path。
- **当前证据边界：** 模型激活和确认 status 是产品 setup，不消费正式 Activity；Activity-22 的
  唯一 `controlled-lifecycle` 调用已消费并成功完成。Provider-account 实际请求数没有独立事实源，
  不能从 Session event 推断；`naturalUserEvidence=not-claimed`、
  `externalUserEvidence=not-claimed`，因而不声称自然或外部用户改善。

正常状态转换为：

```text
模型激活 → 新 status 确认选择 → 首次 controlled-lifecycle 调用开始正式评测 → offline 恢复 → 最终 status
```

当前正式证据见 [`Activity-22 handoff`](operations/tianwen-v0.1-controlled-real-activity-22-handoff.md)；
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

这条所有权边界必须保持清楚：DSH `0.1.1-rc.2` 提供 Session Query、Skill、Jobs、Workflow、Message Feedback、Approval 和 permissions；Tianwen 保留跨 Run Goal Graph、Evidence provenance（证据来源与流转记录）、学习归因和面向未来 Run 的版本治理。

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

产品基线固定为 DSH `0.1.1-rc.2`。Stage 1–7 的自然 Run/Skill/Evidence/Outcome 终局链、
官方 installer/status 证明、受治理 Skill Candidate 机制和成对 Evaluation 记录保持有效。
这些早期 Candidate 和 Evaluation 仍是 scripted/controlled mechanism proof。
受控全链 fixture 又通过同一
产品 Runtime 证明五任务 B/C、独立客观门、盲态 evaluator、五任务 isolated Shadow，以及
B@rev1→C@rev2→B@rev3→C@rev4 的 Promotion/Rollback/Restore 机制。

scripted 全链仍是 0-external-Provider 的确定性机制夹具，而 Stage 7 自然任务结果仍是
`met/no-case`，没有合法产生自然 Candidate。除此之外，Activity-22 已通过官方已安装
configured-DeepSeek 产品路径完成一次受控全链；这两类证据不能混写。

Activity-03 的模型选择 receipt 已持久化 DeepSeek，但进程在 lifecycle 前以 exit 13 结束；offline
恢复成功且 lifecycle invocation=0。该历史结果保持已消费。根因位于 DSH/HMR 的关闭边界：DSH
关闭 Profile 时，HMR watcher readiness 必须结算其拥有的 promise。当前修复只处理这一 owner，
没有改变 receipt、安全边界或正式 Provider 工作。

Activity-22 已完成新的官方安装、离线 status、完整生命周期、offline 恢复与最终 status。
Activity-01、Activity-02、Activity-03 的历史分类保持不变。为能力取证而安排自然任务的阶段也已
收口：Stage 7、Profile dump、cold Profile boot、independent verdict intake、ordinary resume
persistence 与 Natural Trial stream-error 已覆盖链路成立、成功交付、失败保留和任务设计错误。
继续堆同类次数不会证明学习泛化。

当前主线回到普通产品开发：集成已经通过的成果，修复真实主路径缺陷，并让后续自然证据来自
本来就有价值的项目所有者或外部用户任务。Natural Trial stream-error 只影响
`resume --trial-manifest` 辅助路径，普通 resume 不经过该 monitor；它作为低优先级 backlog
保留，不阻塞当前阶段。自然用户改善、外部用户验证、Provider-account 请求计数和普遍效果仍
保持未声明。

普通 Goal-first Task 的显式用户反馈现已接入正式 Evolution ledger。下一步若处理自动 Outcome，
必须先为普通 Task 冻结真实验收合同，不能用“Goal complete”代替验收通过；在此之前，继续改善
Goal 规划、执行和用户引导比扩展学习治理框架更优先。

Goal-first 的结果回流也已完成一次正式安装产品的自然验证：一个只读 Task 的真实最终回复以
“不可信历史执行数据”进入下一次 Planner Turn，并因果决定了后续最小产品任务。最终三个 Task
使用不同 DSH Goal/Session，Long Goal 在 revision 8、Planner planRevision 4 正式完成。产品只在
文本输出中增加按 phase 区分的下一步命令和最新 revision，JSON 合同、Goal 引擎与数据模型保持
不变。该运行证明的是同一 Long Goal 内的结果感知规划，不是跨项目学习、Skill 形成或外部用户
效果；详细边界见
[`result-aware replanning natural task handoff`](operations/tianwen-result-aware-replanning-handoff.md)。

Learning clue inbox 已让现有 Ticket 的来源和重复次数进入普通产品；“分析一次”复用普通 DSH
Session，“已审阅”补齐了人工收件箱生命周期。私密反馈只进入分析 Session，结果和失败不复制到
第二套数据库，审阅也不改变 Evolution 治理状态。现有分析 Session 和 Goal“补充方向”已经提供
人工后续通道；若未来再增加自动行动，仍必须把“模型分析”与“证据成立”分开，不能因为模型认为
问题可复用就自动改代码、创建 Candidate、安装 Skill 或宣称已经学习。

Runtime `0.1.8` 与 Desktop `0.1.0-preview.9` 为正常对话进度提供交付身份，避免继续复用已安装且
包含紧凑卡片的 `0.1.7` 字节。Desktop 和正式安装器只支持精确 `0.1.7` 这一当前自动更新前身；更早版本
继续使用已有分段迁移或手工安装，不建设在线 updater、后台下载或通用版本比较器。正式安装、Web Profile
更新和桌面产物均已完成；有效 v3 自然运行只由后续普通用户 `/goal` 使用补齐，不需要再用合成
Activity 或重复控制器任务取证。

若未来已有合法 Candidate，需要同家族盲评时，仍冻结任务和单次尝试以保证比较公平；不设
Tianwen 侧模型、token 或金额上限，也不绕过 standing authorization 边界。

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
3. [`tianwen-result-aware-replanning-handoff.md`](operations/tianwen-result-aware-replanning-handoff.md)：当前正式安装产品的自然结果回流、最小用户引导改进与证据边界；
4. [`tianwen-v0.1-controlled-real-activity-22-handoff.md`](operations/tianwen-v0.1-controlled-real-activity-22-handoff.md)：当前官方已安装 configured-DeepSeek 全链结果与证据边界；
5. 已批准的 [`one-shot Profile lifecycle repair design`](superpowers/specs/2026-08-24-tianwen-one-shot-profile-lifecycle-repair-design.md) 与其 [`handoff`](operations/tianwen-v0.1-one-shot-profile-lifecycle-repair-handoff.md)：一次性 Profile 生命周期修复的历史执行 authority 和证据边界；
6. Activity-01、Activity-02 和 Activity-03 的 operation design、packet、plan 与 handoff 都是历史 authorities，不是当前执行说明：[`Activity-01 handoff`](operations/tianwen-v0.1-controlled-real-activity-01-handoff.md)、[`Activity-02 recovery design`](superpowers/specs/2026-08-24-tianwen-v0.1-controlled-real-activity-02-recovery-design.md)、[`packet`](superpowers/specs/2026-08-24-tianwen-v0.1-controlled-real-activity-02-packet.md)、[`plan`](superpowers/plans/2026-08-24-tianwen-v0.1-controlled-real-activity-02-recovery.md)、[`Activity-03 design`](superpowers/specs/2026-08-24-tianwen-v0.1-controlled-real-activity-03-design.md)、[`packet`](superpowers/specs/2026-08-24-tianwen-v0.1-controlled-real-activity-03-packet.md) 与 [`plan`](superpowers/plans/2026-08-24-tianwen-v0.1-controlled-real-activity-03.md)；它们保留当时事实，不改写分类。
7. [`2026-08-23 controlled real operation design`](superpowers/specs/2026-08-23-tianwen-v0.1-controlled-real-operation-design.md) 与 [`plan`](superpowers/plans/2026-08-23-tianwen-v0.1-controlled-real-operation.md)：Activity-01 的历史 authority 与实现审计；
8. [`tianwen-v0.1-controlled-real-operation-readiness-handoff.md`](operations/tianwen-v0.1-controlled-real-operation-readiness-handoff.md)：历史 installed-ingress readiness、分段验证和隐私边界；
9. [`2026-08-22-tianwen-v0.1-closeout-and-controlled-evaluation-design.md`](superpowers/specs/2026-08-22-tianwen-v0.1-closeout-and-controlled-evaluation-design.md)：评测、Shadow、Promotion、Rollback 与停止线；
10. [`2026-08-23-tianwen-v0.1-controlled-real-skill-lifecycle.md`](superpowers/plans/2026-08-23-tianwen-v0.1-controlled-real-skill-lifecycle.md)：受控机制的逐 Task 实现、复审与合并顺序；
11. [`tianwen-v0.1-controlled-skill-lifecycle-handoff.md`](operations/tianwen-v0.1-controlled-skill-lifecycle-handoff.md)：scripted 历史依据，记录受控全链 fixture 的机制、计数、隐私与证据限制；
12. [`tianwen-stage7-natural-run-evidence-trial-handoff.md`](operations/tianwen-stage7-natural-run-evidence-trial-handoff.md) 与 [`tianwen-rc6-rc7-managed-install-migration-handoff.md`](operations/tianwen-rc6-rc7-managed-install-migration-handoff.md)：Stage 7 自然任务与 installer/status 运营事实；
13. [`2026-08-19-tianwen-runtime-boundary-reset-design.md`](superpowers/specs/2026-08-19-tianwen-runtime-boundary-reset-design.md)：正式 Runtime 所有权、集成 seam、非干扰合同和恢复顺序；
14. [`2026-08-17-tianwen-continuous-learning-governance-design.md`](superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md)：长期 Signal、Case、Lesson、Candidate、评测、权限、Shadow 和回滚原则；
15. [`2026-08-19-dsh-upstream-capability-overlap-audit.md`](research/2026-08-19-dsh-upstream-capability-overlap-audit.md)：DSH rc.7 已有能力与 Tianwen 差异化边界的历史事实依据；
16. Stage 4/5/6 handoff、2026-08-20 public-readiness 与旧 Alpha 资料：历史 checkpoint，不再是当前能力清单，不得反向改写当前事实。

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
