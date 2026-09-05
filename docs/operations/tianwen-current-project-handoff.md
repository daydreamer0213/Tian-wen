# Tianwen 当前项目权威交接

## 2026-09-05 学习路线已合入并完成本机升级（不改写下方历史发布事实）

会话接续提示：本轮工作目录为 `D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge`，源码已通过 `2d3d8a7` 合入主分支，不在旧架构会话的 checkout 中。交接/上下文重置时先核对真实工作目录、HEAD 和未提交文件。本轮已推进到现有 Skill 发现与窄范围适配，不能再把探索 B/C 当作未实现入口。最新验收和未完成边界见 [`本轮路线交接`](tianwen-learning-route-20260905-handoff.md)。

本轮普通 Outcome 学习、有界探索和已准入 Skill 复用的工程起点为 `93e341e4da8c9a24693bb22e817935cd22385dbb`；现用 Runtime 已升级为 `0.1.11`，Desktop 为 `0.1.0-preview.12`。最终本地回归通过 1,575 项运行测试和 608 项 Python 测试，独立审查无遗留问题。安装放行提交 `1e4135e90fd80f746f9f2b4917d6008706ee2b14` 的四项 exact-main CI 全部通过；后续交接文档提交不改变产品源代码。实际升级目标为 `D:\DevData\tianwen-experience`，受管和 Web Runtime 字节均与验收包一致，原桌面 `deepseek` 快捷方式的真实启动、页面加载、关闭与后台清理已通过，30 个原有会话/状态文件在升级前后及启动后完全一致。准确源码、安装包和收据位置见 [`本轮路线交接`](tianwen-learning-route-20260905-handoff.md)。三次历史真实模型主对话试用均为 `met/no-case`，见 [`普通 Outcome 学习交接`](tianwen-outcome-experience-loop-handoff.md)。工程交付完成不等于自然改善已经得到证明，也不表示执行了外部包发布。

当前主线以学习循环为核心：重复结果经验归纳 → 有界假设探索 → 现有 Skill 发现与窄范围适配 → 真实任务持续改进。Goal 不是这些能力的前提。用户已授权按阶段持续推进，普通工程细节无需逐项询问；不要新增定时任务、批准界面或每次必跑的重复评估。重启后由主会话的明确“继续”或原生恢复动作继续工作，仅打开会话不开始新的模型执行。

有界探索 A/B/C 已实现并完成独立审查修正：原生停止、明确继续、同配置请求、首轮冻结来源和观察回流均有针对性测试。第三阶段复用 DSH 原生技能目录与加载接口，只为宿主明确审查过的精确纯文本来源增加只读检查与来源追溯；没有自动信任外部 Skill，也没有新的技能市场、执行队列或直接启用入口。第四阶段的自然改善效果仍需真实需求和证据，不能用脚本测试补齐。

下方 2026-09-01 状态是历史产品基线，不可用其中的版本号或待办覆盖这次较新的本地开发事实；也不可反过来把本地源码验证说成已经部署。

日期：2026-09-01

状态：Runtime `0.1.9`、Desktop `0.1.0-preview.10` 已实现、安装并完成 exact-main CI；当前进入普通用户持续体验和真实问题驱动的产品开发阶段

## 1. 这份交接解决什么

这是一份上下文重置后的第一阅读入口。它不替代源码、架构总览或具体 operation handoff，而是把
当前产品事实、关键历史判断、反复踩坑的原因和下一项工作放在一起。新会话不得仅凭聊天记忆继续，
也不得把旧设计中的未勾选步骤当成当前待办。

接管时按以下顺序核对：

1. 当前 `main`、`origin/main` 和工作树；本次交接开始时已完成产品实现和 exact-main CI 的功能基线为
   `0a45a5aa332632c20d7b6330f9888f0b21ec7e64`，工作树 clean；交接文档本身会形成后续 docs-only commit，
   因此新会话必须现场读取 current main，不能把功能基线当作永远不变的 HEAD；
2. 当前源码和 [`架构总览`](../tianwen-architecture-overview-v2.md) 的“当前状态”；
3. 最新发布边界和真实运行 handoff；
4. 设计与计划只用于解释约束和历史执行顺序；
5. 历史 Activity、失败、证据和旧 worktree 保持原分类，不因当前发布状态而重写。

若上述事实已经被更新提交取代，以更新后的 main、源码、架构总览和最新 handoff 为准，并同步更新
本文件，不能继续机械引用这里的旧 SHA。

## 2. 当前产品到底是什么

Tianwen 是建立在 DSH 之上的长期 Goal 和学习治理层，不是第二套 Agent Runtime。DSH 继续拥有模型、
Provider、Agent Loop、Session、工具、MCP、普通 Sandbox、Profile 启停和恢复；Tianwen 只拥有长期
Goal、Task 边界、最小 Evidence、问题分诊、Candidate 评测以及只影响未来 Run 的版本治理。

普通入口已经内化到 DSH Web/Desktop 主对话：

- 用户输入 `/goal <长期目标>`；
- Tianwen 用稳定 Planner 自动维护 Task，不要求用户填写 Task 或执行轮数；
- 每个已接纳 Task 在自己的 DSH 子 Session 中执行；
- Task 的真实最终回复作为“不可信历史执行数据”进入下一次 Planner Turn；
- 用户可在主对话中自然补充方向、纠偏、暂停和恢复；
- DSH 原生停止按钮也会暂停连续 Goal；
- “长期目标”面板只保留历史和诊断，不是主要入口，也不是第二套 Goal 引擎。

Desktop 只是 DSH Web/Profile 的可选外壳，不是 Tianwen 的必要依赖。使用 DSH CLI、普通 Web 或其他
兼容 DSH 入口的用户仍应能使用 Tianwen；不能把 Tianwen 锁死在 Tianwen Desktop 安装包里。

## 3. 当前已经成立的能力

- Goal-first、自动 Task、跨 Task/Session 持久推进和 result-aware replanning 已进入产品；
- 普通 Task 的显式“有帮助/需要改进”反馈已进入 Learning Intake；
- open Ticket 可在既有普通 DSH Session 中“分析一次”和标记“已审阅”，但不会自动冒充 Case、
  Candidate、Skill 或代码修复；
- Candidate、B/C、盲态 evaluator、isolated Shadow、Promotion/Rollback/Restore 已有受控机制证据；
- Stage 7 项目所有者自然任务、Profile dump 自然开发任务和 ordinary resume persistence 自然开发任务
  已形成各自限定范围的真实证据；
- Goal 结果回流已经用正式安装产品证明：真实 Task 结果进入下一次 Planner Turn，并因果决定后续 Task；
- DSH Profile 的 `--dump-config` 已保持 boot-free，真实 Profile boot 仍负责运行时模块准备。

这些事实不等于“已经证明广泛外部用户改善”，也不等于每次任务都会自动形成 Skill。学习必须来自
可归因、可复用且通过独立验证的问题；普通成功或一次小失误可以真实结束为 `no-case`。

## 4. 当前发布与验证事实

- DSH 精确产品底座：`0.1.1-rc.2`；
- Runtime：`@tianwen/runtime-bundle@0.1.9`；
- Desktop：`0.1.0-preview.10`；
- Runtime 正式产物：
  `D:\DevData\tianwen-0.1.9-artifacts\tianwen-runtime-bundle-0.1.9.tgz`，SHA256
  `68D4578CE49C20F6AAA28601766D56A6120D2C1AA0319F4F85328BB32BEC7630`；
- Desktop 正式产物：
  `D:\DevData\tianwen-0.1.9-artifacts\Tianwen Desktop Setup 0.1.0-preview.10.exe`，SHA256
  `37BE8BFC00C830AA708DC12658EA935FE8A30F2C59AA7E1BB741D36A4CE98E01`；
- managed Runtime 和真实 Web Profile 均已更新到 0.1.9，安装后的 Runtime/客户端字节与构建产物一致；
- exact-main CI run `33416912713` 对产品功能基线 SHA `0a45a5a` 完成并成功，Python、TypeScript、
  installer-windows、desktop-windows 全部 success；
- 外部 npm publish、tag、GitHub Release、installer upload 和 DSH 上游推送均未执行。

当前发布细节与四项交互修复见
[`tianwen-native-conversation-progress-handoff.md`](tianwen-native-conversation-progress-handoff.md)。

## 5. 已经发生过、不能再次误判的问题

### 5.1 把聊天记忆或旧计划当成当前产品事实

**现象：** 已经实现的 Goal/Task 能力曾被误说成仍未落地，旧 handoff 的 `incomplete` 也曾被当作
永久禁止合并。

**错误假设：** 计划勾选框、旧聊天或冻结运行结论比更新后的源码、集成证据和架构总览更权威。

**当前决定：** 先核对 main、当前源码、架构总览“当前状态”和最新 handoff。历史结论只描述当时
尝试，不能覆盖后来独立修复、正式安装和 exact-main CI。

**适用边界：** 不能反过来篡改历史失败。Activity-03、cold Profile boot 等历史结果仍保持原分类。

### 5.2 把 Tianwen 做成独立界面或第二套 Runtime

**现象：** Goal 曾被表达成需要单独面板、手工 Task/轮数和独立进度卡片；这与正常对话习惯冲突。

**错误假设：** 只要 DSH 暴露一个 UI 插槽，那个插槽就自动定义了 Tianwen 的产品语义。

**当前决定：** `/goal`、自然语言补充、暂停、进度和结果都以 DSH 主对话为主要入口。面板仅作历史
诊断。Agent、Session、工具和生命周期优先复用 DSH，Tianwen 只做自己的治理责任。

**证据：** Runtime 0.1.7 的 dock 卡片被真实使用否决并删除；0.1.9 正式安装和 Desktop 启动完成。

### 5.3 主对话四项真实交互缺陷

**现象：** `/goal` 后输入框不清空；内部 Planner/Task 污染“未分组”；主对话进度过少；最终结果只在
子 Session，主对话看不到。

**当前决定：** 命令在持久绑定成立后返回；新 v3 Planner/Task 使用 DSH 原生 `parentSession`、
`origin=subagent`、`delegationDepth=1`；关键边界回复提供计划位置、最新结果、当前工作和已知下一步；
冷控制 Session 恢复后向原对话补交并按持久助手 Turn 去重。

**边界：** 这不是迁移到 DSH 通用 continuable-subagent 管理器；历史 Session 不迁移、不删除。

### 5.4 把环境或控制器问题误判为 Tianwen 产品问题

**现象：** Windows 长路径、`.CMD` 参数传递、子进程清理、pnpm store、Corepack 目录或临界超时曾让
真实任务/测试失败。

**错误假设：** 任何失败都应由 Tianwen 新增重试、预算、checker、安全门或进程控制器。

**当前决定：** 先追踪问题所有者和真实运行边界。DSH/HMR 创建的 readiness promise 由 DSH/HMR
结算；控制器路径问题由控制器修复；包管理目录按既定 D 盘 store 配置。只有可重复、属于当前产品路径的
缺陷才进入 Tianwen 实现。

**学习边界：** `.CMD` 参数传递之类的小错误如果反复发生，可以作为学习线索；但必须先证明来源可归因、
存在重复和可复用改进，不能见到一次失败就自动形成 Skill。

### 5.5 把偶发误差和真实回归混在一起

**现象：** 临界超时或机器负载会造成单次失败；相反，稳定断言失败也曾被怀疑为偶发。

**当前决定：** 读取完整错误，检查最近改动并最小复现。只有在证据支持偶发性时做一次针对性复核；不为了
挑更好答案反复重跑自然任务，也不因“可能偶发”忽略稳定失败。0a45a5a 的 Python CI 问题最终确认是四处
过期公开文档断言，修正后 exact-main 全绿，不是 Goal 产品回归。

### 5.6 过量受控运行和自然任务

**现象：** 项目曾倾向用更多 Activity、更多角色和重复自然任务证明已经成立的路径。

**错误假设：** 次数越多就越接近产品价值。

**当前决定：** 不再创建 Activity-23/04 等合成运行，也不重新执行 Activity-03/22。已有成功、失败、
任务设计错误和普通用户运行样本已经覆盖当前阶段。新证据应来自本来就有价值的项目任务或真实用户问题。

**边界：** 若出现合法 Candidate、未证明的关键产品边界或外部用户任务，可以另行冻结一次正式验证；
任务和验收标准必须在答案前冻结，失败不重跑挑选结果。

### 5.7 证据、账单和完成状态混写

**现象：** Session/Tool event 数量容易被误说成 Provider 账单或外部效果，测试通过也容易被包装成
自然用户改善。

**当前决定：** 分别报告 task result、natural runtime evidence、learning facts、external facts 和
exact-main CI。Provider 实际请求/费用没有独立事实源时保持未声明。scripted、controlled、自然、
项目所有者和外部用户证据不能互相替代。

### 5.8 DSH 版本和上游所有权

**现象：** rc 编号曾造成“rc2 是否比 rc7 新”的沟通混乱，迁移讨论也容易把 Desktop 与 DSH Runtime
绑死。

**当前决定：** 每次写完整精确版本和来源，不靠“新版本”简称。Tianwen 依赖 DSH Runtime，不依赖
DSH Desktop。用户没有 DSH 上游权限；Tianwen 可以维护精确版本的 pnpm patch，上游发布始终可选，
不得擅自推送。

## 6. 验证和推进规则

1. 产品功能、进程生命周期、状态转换和真实用户路径优先；安全、格式和 digest 用来保护已成立路径，
   不能取代产品设计。
2. 设计新能力前先检查 DSH/主流已有能力，按“复用 → 配置/薄适配 → 证明必要后自建”分配所有权。
3. 普通开发使用聚焦测试和与风险相称的回归门；环境波动不自动触发全量重验。
4. 正式集成顺序仍是：实现 → 独立审查 → 聚焦/相关门 → commit → main → exact-main CI。
5. exact-main CI 只核对精确 SHA；失败时报告准确 run/job/阶段，不自动重跑。队列长期无变化时不建立
   无限 heartbeat。
6. 真实 Provider 可以用于本来有产品价值的任务；Tianwen 不新增自己的请求/金额上限，平台限额自然生效。
7. 不读取、修改或清理历史 Activity、产品、evidence、debug、legacy worktree，除非当前任务明确需要并
   获得授权。

## 7. 当前入口和下一步

产品现处于普通用户持续体验阶段。2026-09-01 已通过桌面快捷方式启动当前 Desktop，DSH Web 使用动态
本地端口并返回 HTTP 200；端口和 PID 都是临时事实，不能写死到产品或后续命令。

下一项最高价值工作不是再安排一个合成或自然测试，而是：

1. 用户在正式 Desktop/DSH 主对话中正常使用 `/goal`；
2. 出现问题时读取该次真实 Session、Goal/Task 状态和相关日志；
3. 先判断是产品缺陷、DSH/环境所有权、设计不合适还是单次误差；
4. 只修复成立的最小产品问题并保留必要回归测试；
5. 将已经改变当前状态的结论同步回架构总览和本交接。

不要为了“继续推进”凭空选择更多验证任务。真实使用没有暴露新问题时，先让产品继续服务用户。

## 8. 2026-09-05 本地学习闭环增量

`codex/goal-chat-feedback` 的未提交检查点已在普通 `research-summary` Outcome 学习上补齐一次可选的有界假设探索。证据足够时仍直接结论、实验数为零；只有同一原生分析子会话明确请求时，才执行一对冻结来源、相同父 Skill、相同 packet、相同模型配置和相同产品工具的 control/treatment Run。treatment 只增加一次临时任务指示。

实验意图、两个确定性 child、Run/Skill/Outcome/Evidence 和 arm 收据都可回放。实验 Evidence 与原 supporting/counterevidence 分开，不能直接生成 Candidate、调用正式评测或切换 active pointer。打开主 Session 不会自动执行；显式“继续”或原生 continuation 才恢复未完成 child，已完成 arm 和已投递观察不重做。

最新受影响门通过 16 个测试文件、229 条测试（37.54 秒），root typecheck 与 diff validation 通过。新增产品故事是 scripted mechanism evidence，不是自然效果或统计因果证据。本阶段未运行真实模型、未提交、未推送、未安装、未发布。
