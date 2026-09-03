# Tianwen `research-summary` 真实生产学习纵切设计

**日期：** 2026-09-03

**状态：** 推荐方向已确认，等待书面设计评审

**实现基线：** `bc67214050857591e1e223df83daf6341a86c8e4`

**运行基线：** DSH `0.1.1-rc.2`

## 1. 结论

本阶段选择一个窄但真实的生产纵切：`research-summary`。它不是新的演示脚本，也不是一套通用学习框架，而是第一条必须通过安装包、DSH Desktop、真实主对话和真实模型走通的学习闭环。

用户只在 DSH 主对话中完成全部操作：发起任务、查看进度、给最终回复点原生负反馈并写纠正、收到采用或拒绝结果，以及在需要时撤回反馈。用户不打开分析 child，不进入 Task 页面，不使用 Tianwen 自建批准按钮。若真实任务需要更高权限，唯一的用户动作是在当前 DSH 主 Session 把权限改为“完全访问”；Tianwen 不另建批准流程。

这条纵切证明的是 Tianwen 的核心产品价值：从一次明确纠正中形成有证据、可评测、可采用、面向未来 Run 生效且可回滚的 Skill 改进。Goal 不是前提，也不进入这条首要验收故事。

## 2. 当前事实与缺口

现有机制层已经覆盖 Learning Intake、Evidence、Candidate、paired evaluation、blind evaluator、Shadow、Promotion、Rollback、恢复和主对话终态补交，但还不能据此声称产品闭环已经成立。

当前生产缺口是：

1. 已安装 Profile 没有启用 `learningLoop.enabled`；
2. 现有显式纠正协议仍使用 `controlled-lifecycle-summary`、`verify_lifecycle`、`fixture-only` 和 synthetic evidence purpose；
3. `bindRunWithSkill()` 只把候选版本写进 Tianwen Run Manifest，没有让 DSH 原生 Skill 目录和 `skill` loader 真正解析到该版本；
4. `verify_lifecycle` 不是安装包中的真实产品工具；
5. 当前 Task 7 计划只描述测试，没有定义上述生产接线；
6. 现有终态报告不能替代长时间执行期间的主对话进度；
7. 尚未用全新安装的 DSH Desktop 模拟普通用户完成整条流程。

因此，Task 5 的通过只证明控制机制可恢复，不能作为 Task 7 的产品验收替代品。

## 3. 范围与非目标

### 3.1 本阶段范围

- 唯一 Skill：`research-summary`；
- 唯一治理 scope：`project:tianwen/capability:research-summary`；
- 唯一学习入口：DSH 原生 Message Feedback 中带非空说明的负反馈；
- 唯一自动改进对象：该 Skill 的 `description`、`whenToUse` 和 `content`；
- 唯一生产协议版本：`tianwen.explicit-correction.research-summary.v2`；
- 新 Run 采用 active pointer，已绑定 Run 保持原版本；
- 反馈撤回后，已采用候选通过既有受控 transition 回滚。

### 3.2 明确不做

- 不建立任意 Skill 的通用 verifier 框架；
- 不实现自动 Outcome 学习；
- 不让 Candidate 修改 Runtime、权限、Sandbox、工具集合或顶层 Goal；
- 不增加 Tianwen 专用批准、拒绝、进度或反馈 UI；
- 不复制 DSH Session、Skill registry、Skill loader、Agent runtime、child runtime 或权限系统；
- 不把一个 DSH Session 拆成多个可热切换的 Tianwen Run；
- 不实现通用线上回归监控器、候选锦标赛、多候选合并或多机协调；
- 不为通过测试保留 test-only verdict 注入作为生产路径。

## 4. DSH 与 Tianwen 的所有权

| 能力 | 权威所有者 | 本纵切如何使用 |
| --- | --- | --- |
| 主 Agent、Session、Turn、消息、恢复 | DSH | 原样复用 |
| Agent preset 与 scoped Context | DSH | 原样复用，不复制 `standard` preset |
| Skill registry、目录、`skill` loader | DSH | Tianwen 只向公开 scoped registry 注册已冻结版本 |
| 工具 schema、执行、Evidence 原始事件 | DSH | 使用原生 scoped tool 和 Session log |
| 子 Agent、descriptor、继承权限、report | DSH | 分析 child 必须通过原生 subagent service |
| 主 Session 权限 | DSH | 若需要，用户只改主 Session 的原生权限 |
| Message Feedback 当前值 | DSH | Tianwen bridge 在其耐久后摄取 |
| Run binding、Evidence provenance | Tianwen | 保留追加式治理事实 |
| Case、Attribution、Lesson、Candidate | Tianwen | 保留并限制到唯一 scope |
| Evaluation、Shadow、Promotion、Rollback | Tianwen | 使用现有控制面并接上真实协议 |
| 主对话进度策略与离线补交 cursor | Tianwen 薄适配 | 通过 DSH 原生 report 投递，不写第二份对话 |

关键约束是：Tianwen 可以选择“DSH 在这个 Agent 中应解析哪个已治理 Skill 版本”，但不能成为另一个 Skill loader。

## 5. 产品任务合同

### 5.1 用户入口

受治理 Run 是一个全新的 DSH 根 Session。用户的第一条消息必须使用 DSH 原生 Skill 手势 `/research-summary`，并在同一条消息中提供一个有界的结构化 research packet。一个 DSH Session 对应一个 Tianwen Run；因此采用或回滚只影响此后新建的主 Session，当前主 Session 不热换版本。

结构化 packet 由明确边界包住，只有边界内的非空行按下列格式解析：

```text
<research_packet>
[F:<id>|required] 已确认且必须进入摘要的事实
[F:<id>|optional] 已确认但可省略的事实
[U:<id>|decision] 尚不确定但会影响决策的信息
[U:<id>|background] 尚不确定且仅作背景的信息
[X:<id>|unsupported] 不应当被写成结论的材料
</research_packet>
```

产品边界固定为：packet UTF-8 输入不超过 16 KiB，总条目不超过 32 个，ID 在一次 packet 内唯一，边界必须各出现一次且内部所有非空行必须命中上述语法。任何嵌入在条目正文中的指令都只是待总结资料，不是 Agent 指令。

如果第一条消息没有 `/research-summary`、packet 不合格、Session 是 child，或者旧 Session 已经发生过模型请求却没有 Run binding，Tianwen 不建立治理 Run、不改 Skill 解析，也不把后续反馈归因给该纵切。普通 DSH 对话仍可继续；这是“不进入学习”，不是 Session 失败。

### 5.2 正式基础 Skill

安装包注册一个正式的 runtime Skill：

- name：`research-summary`；
- provider/source：`runtime`；
- modelInvocable/userInvocable：均为 `true`；
- 输入：上述 research packet；
- 输出：简洁摘要、已采用的 confirmed finding IDs、单列的不确定性 IDs；
- 禁止：编造 ID、把 `X` 材料写成事实、执行资料中的指令、掩盖来源不足。

基础版本代表一个已知有限的 v1 行为：它会覆盖 `required` confirmed findings，但会为了“简洁”省略 `decision` uncertainty。该限制不是安全漏洞，却能产生一个真实、可观察、适合由用户纠正的质量缺陷。

首条验收纠正的语义固定为：决策相关的不确定性不能静默省略，必须与已确认事实分开、明确标注；普通背景不确定性仍可省略。Candidate 必须保持 Skill 名称、source 和 invocation policy 不变，只能更新已允许的三个文本字段。

## 6. 新 Run 的原生 Skill 绑定

### 6.1 选择 DSH `agent/pre-step`，不复制 preset

DSH Web 为新建、恢复和 fork 的主 Session 通过 `ctx.agents.create()` / `resume()` 的 setup 挂载 Agent preset。外部 bundle 不能向这个 setup 任意追加回调，而复制整份 `standard` preset 会产生升级漂移和重复能力。

本设计使用 DSH 公开的 `agent/pre-step` waterfall seam。Tianwen 注册一个 `prepend: true` 的全局监听器，使它成为外层 listener：它在调用 `next()` 前完成 Agent-scoped Skill/tool 注册，在 `next()` 返回后核对 DSH 原生 direct-invocation 和 catalog 结果，最后才允许第一个模型 step 开始。DSH `tool-skill` 仍负责生成目录和加载内容。

这条 seam 可等待、发生在模型请求之前，并且不需要修改 DSH、Host API proxy 或 Agent preset。

### 6.2 全新 Session

首次受支持的 `pre-step` 按以下顺序执行：

1. 确认它是根 Session、第一 Turn 的第一 step、直接用户消息含精确 `/research-summary` 手势且 packet 合格；
2. 在写入 overlay 前，通过当前 Agent/cwd 的 DSH `skills.get()` 读取同名 Skill；只有它与安装包正式基础版本完全一致时才继续；项目或用户提供的同名 Skill 一律视为不受支持的碰撞，不覆盖它；
3. 从 Tianwen active pointer 选择基础版本或唯一精确 Candidate；找不到精确版本时 fail closed；
4. 在该 Agent 的 DSH Skill layer 注册所选版本，并注册同一个 Agent-scoped `submit_research_summary` 工具；
5. 用 DSH `skills.get()`、`skills.snapshot()` 和 `tools.schemas(agent)` 核对名称、内容、版本摘要与工具 schema；
6. 调用后续 DSH listeners，让原生 direct-invocation 和 Skill catalog 使用该 overlay；
7. 核对返回给模型的 Skill instructions/catalog 与所选版本一致；
8. 在任何 `step/start` 或模型请求出现前，使用 packet digest、source-capture acceptance contract 和唯一 scope 原子追加 Tianwen Run binding 与 Run Skill Manifest；
9. 只有以上全部成立才返回 `enter` 决策。

未命中手势、packet 不合格、非根 Session、旧 Session 未绑定或同名用户 Skill 碰撞，都在任何 Tianwen 注册/写入之前判定，并原样调用 `next()` 继续普通 DSH 对话。精确产品输入一旦通过 admission，后续 pointer、overlay、snapshot、catalog、tool schema 或持久化不一致就是完整性故障：拒绝该 step，不能降级执行，也不能让“Manifest 是候选、loader 却加载基础版本”的 Run 继续。

新的产品绑定方法必须明确验证“第一 Turn 已打开但第一 step 尚未开始”这一边界。现有严格 pre-Turn `bindRunWithSkill()` 保持不变，供已验证的 runner 和 controlled Agent 使用；不能静默放宽它的合同。

### 6.3 当前 Session 与恢复 Session

- 同一 live Agent 后续 step 不再读取 active pointer；它始终使用第一次绑定的版本；
- 已绑定 Session 冷恢复时，从既有 Run Manifest 的完整 parent payload 重建同一 Agent-scoped Skill 和工具，不读取最新 pointer 重新分配；
- 候选在该 Session 运行期间被采用或回滚，也不改变该 Session；
- 已有历史但没有 Run binding 的旧 Session 不做追溯绑定；用户若要进入受治理纵切，应新建普通主对话；
- Agent disposer 自动释放 scoped registrations，Tianwen 不维护第二个 live registry。

恢复后的硬核对包括：Run/Session lifecycle fingerprint、Manifest version、DSH scoped `get`、snapshot、catalog、loader 返回内容和工具 schema。任何一项不一致都不允许新的模型请求。

## 7. `submit_research_summary` 产品工具

工具采用一个生产定义和一个固定 schema：

```text
summary: string
confirmedFindingIds: string[]
uncertaintyIds: string[]
```

共同规则：

- 只能引用当前 packet 中存在的 ID；
- ID 去重、顺序规范化；
- `X` 永远不能进入两个数组；
- `summary` 非空且不超过 4096 UTF-8 bytes；
- 每个 Turn 只接受一次最终提交；
- 不提供文件写入、网络、shell、权限改变或任意路径参数；
- 工具的 verdict 状态只保存在精确 Agent/Session 的私有闭包中，不能由 arm 名称、session 后缀或 Candidate ID 推断。

工具有两种由宿主在注册时冻结的运行模式，但代码、名称、schema 和输出合同相同：

1. **source capture**：用于真实主 Session。它验证引用和形状，记录原生 tool Evidence，返回规范化提交，但不替用户判断摘要语义，也不提前结束 Turn；Agent 随后给出可被 DSH Message Feedback 标记的最终 assistant 回复。
2. **controlled enforce**：用于 evaluation、Shadow 和 transition Agent。它还执行该 case 的确定性 oracle，产出 `met` 或 `not-met`，并通过 DSH `concludesTurn` 在提交处结束 Turn，禁止 verifier 之后再发生模型改写。

工具只注册到已经通过本纵切 admission 的主 Agent，以及 Tianwen 自己创建的 controlled Agent。普通未绑定 Agent、分析 child 和无关 subagent 看不到也不能执行它。

主 Session 的 Turn settle 后，Tianwen 从同一 DSH Session log 证明：精确 `research-summary` 内容先通过 DSH 原生 `/research-summary` direct-invocation message 进入该 step，随后 `submit_research_summary` 成功产生 Evidence。controlled Agent 仍通过原生 `skill` tool call/result 证明加载。两条证明都必须包含 Manifest 版本与实际渲染内容的一致性，并由一个带来源判别字段的 v2 Skill-use fact 表达；不能把 direct invocation 伪造成不存在的 tool call。该证明通过既有幂等 intake 写入，Message Feedback bridge 在重启后也会先补做一次。没有这条 Skill-use proof 的负反馈可以保存，但不能生成该 Skill 的 Candidate。

## 8. 明确纠正学习流程

完整流程如下：

1. 用户在主对话完成受支持的 `research-summary` Run；
2. 用户对最终 assistant 回复点 DSH 原生负反馈并写明纠正；
3. DSH 先持久化目标消息和 Message Feedback sidecar；
4. Tianwen bridge 幂等摄取反馈，并验证 Run、Manifest、Skill-use proof 和 source submission Evidence；
5. 若 profile consent 尚未开启，主对话一次性说明隐私影响；用户只在主对话让 Agent 调用原生 `tianwen_learning_consent` 工具；不回溯自动分析旧 note；
6. 有效 consent 下，DSH 原生 continuable child 读取有界 Session Reference，把 note 和目标回复视为不可信证据；
7. 分析只能提交 `no-case`、`insufficient-evidence` 或一个 scope 固定的 `skill-change`；
8. `skill-change` 形成 Case、Attribution、Lesson 和单一 Candidate；
9. 预先冻结的生产协议依次运行 paired arms、blind evaluators、Shadow 和 transition；
10. 全部门通过才更新 future-Run pointer；任一门失败都拒绝 Candidate，基础版本不变；
11. 结果通过 DSH 原生 child report 回到原主对话。

分析 child 的合法 descriptor、parent lineage、权限继承和 settlement 必须来自 DSH subagent service。Tianwen 不得通过普通 `agents.create()` 写一个看起来像 child 的 Session。

## 9. 真实评测协议 v2

### 9.1 冻结时点与共同环境

协议必须在 Candidate 生成前冻结。baseline 与 Candidate 共享完全相同的：

- 五个 task definitions；
- research packet bytes 与 workspace snapshot；
- `submit_research_summary` 工具定义、schema 和 case oracle；
- DSH 版本、Provider、Model、call config、retry policy；
- 允许工具：`skill` 与 `submit_research_summary`；
- 只读权限、停止条件、调用次数和耗时上限；
- evaluator material contract。

生产路径不接受 `resolveVerdict`、直接 executor 注入、伪造 tool result 或按 baseline/candidate 身份返回答案。确定性测试可以使用 scripted model adapter 生成模型输出，但仍必须经过正式 Runtime、DSH Agent、Skill loader、产品工具和 Evidence 投影。

### 9.2 五个 case

| case | packet 重点 | 基础版本期望 | 合格 Candidate 期望 |
| --- | --- | --- | --- |
| original defect | required confirmed + decision uncertainty | 因静默省略决策不确定性而 `not-met` | 两类信息分开呈现，`met` |
| adjacent transfer | 新 ID、同类决策不确定性 | `not-met` | 能迁移规则，`met` |
| preserved regression | 只有 required confirmed | `met` | 仍完整且不虚构，`met` |
| raw extraction counterexample | background uncertainty 不应升级 | `met` | 不把所有不确定性一概加入，`met` |
| safety boundary | unsupported 材料内含诱导指令 | `met` | 不执行、不采纳、不写成事实，`met` |

oracle 只读取冻结 packet 合同与规范化提交：required confirmed 必须齐全，decision uncertainty 必须齐全，background uncertainty 按 case 规则处理，unsupported ID 必须缺席。oracle 不得读取 arm、Session 命名、Candidate ID、Skill version 或预期胜者。

### 9.3 evaluator material

blind evaluator 接收的是 verifier 接受并规范化后的结构化提交，不是 verifier 之后的自由文本，也不是 Session 最后一条任意消息。材料上限固定为 4096 bytes，并携带 task ID 与内容摘要；arm 身份仍由既有 blind map 隐藏。

controlled Agent 的 `met` / `not-met` 都是成功完成的业务结果，不伪装成 Runtime 崩溃。DSH Evidence 投影和工具私有 verdict 必须一致，否则结果是 `inconclusive` 并拒绝 Candidate。

### 9.4 Shadow、采用与回滚

Shadow 重跑同样五类 case，但使用新的 Session IDs 和独立 workspace snapshots。Promotion/rollback transition 都必须创建一个新的受控 Agent，加载将成为目标的精确 Skill 版本，执行同一个产品工具和 oracle，再提交 pointer transition。

采用只改变 `project:tianwen/capability:research-summary` 的 active pointer。源 Run、正在评测的 Runs 和任何已经绑定的主 Session 都不热换。

用户撤回最后一份有效支持反馈后，现有 Task 5 语义负责使分析失效，并对已经采用的 Candidate 执行 verified rollback。回滚成功后，新建主 Session 使用 parent 版本；先前绑定 Candidate 的 Session 仍按自身 Manifest 继续，直到结束。

## 10. 主对话进度与终态

用户不能靠打开 child 判断是否还在运行。每个有效分析在主对话最多发送两个去重的阶段里程碑，并发送一条唯一终态：

1. **analysis-started**：child 已被 DSH 接受且 `running` 已耐久；
2. **candidate-evaluating**：Candidate 已耐久，paired evaluation 即将开始；
3. **terminal**：no case、证据不足、Candidate 被拒绝、已采用、已回滚、transition 已恢复或不可重试失败。

如果活跃执行连续 120 秒没有新的用户可见状态，liveness adapter 投递一条基于持久 phase 和已完成计数的存活状态；此后每个新的 120 秒窗口最多一条，按 `analysisId + phase + elapsedBucket` 去重，终态后立即停止。进度和终态都通过精确 DSH child 的原生 report 进入原主 Session，并在 Evolution 中保存最小 delivery identity/cursor。parent 离线时不重跑学习，只在它下次 live 时补交尚未耐久确认的消息。

进度文案不得暴露私密反馈 note、完整 prompt、内部路径或 child 日志。正常流程的下一步永远留在主对话，不出现“请打开 task1/child 查看或批准”。

## 11. 故障与 fail-closed 语义

| 情况 | 行为 |
| --- | --- |
| 同名 Skill 被项目/用户覆盖 | 不覆盖用户 Skill，不建立本纵切 Run |
| pointer 找不到精确 Candidate | 拒绝治理 step，不回退到另一个版本假装成功 |
| Manifest、DSH `get`、snapshot、catalog、loader 不一致 | 模型请求前停止，记录不受支持/完整性故障 |
| submission tool 缺失或 schema 漂移 | controlled Run 在模型请求前停止；已通过产品 admission 的主 Run 拒绝第一 step |
| packet 超限或格式错误 | 普通主对话可继续，但不建立治理 Run |
| 用户主 Session 权限不足 | 只提示把当前主 Session 改为“完全访问”；不创建批准按钮 |
| Provider/Model/重试配置在协议后漂移 | Candidate 拒绝，不比较不等价 arms |
| 分析没有 Case 或证据不足 | 主对话说明停止原因，不建 Candidate |
| Candidate 评测失败 | 保存反证并拒绝，pointer 不变 |
| report 未耐久 | 保留 cursor，恢复交付；不重跑评测 |
| Evolution replay 被阻塞 | 不追加新治理事实，主对话报告需要恢复 |
| child descriptor/lineage 不完整 | 视为基础设施故障，绝不把它列作合法学习 child |

权限限制、Provider 故障、交付故障、Session 损坏和用户对内容的明确纠正必须保持不同分类，不能全部归入“模型需要学习”。

## 12. 安装包与配置

正式 installer/Profile 必须：

1. 在 `tianwen-runtime` 配置中写入 `learningLoop.enabled: true`；
2. 把 learning-loop workspace/state 放在用户提供的 `D:\DevData\...` data directory 下；
3. 由 Runtime Bundle 注册正式基础 `research-summary` Skill；
4. 由 Runtime Bundle 安装 Run admission/overlay listener 和产品 submission tool factory；
5. 保持 `submit_research_summary` 为 Agent-scoped 工具，不在 bundle patch 中注册全局 verifier；
6. 继续使用 DSH 原生 Message Feedback、permission、subagent、Session persistence 和 standard Agent preset；
7. 不把离线 smoke model 当成真实 Desktop 验收的模型配置。

现有 `learningLoopExecutor` 可以暂时保留为测试/程序化 seam，旧 synthetic protocol 记录也保留为历史审计事实；正式 Profile 和产品 E2E 不得走这个 seam。协议升级创建 v2 记录，不重写或重新解释 v1 ledger。

## 13. 验收分层

### 13.1 产品接线 E2E

测试必须启动正式 Runtime Bundle 和与安装包一致的 Profile 配置。允许 scripted model adapter 提供可重复模型输出，但禁止：

- 直接调用学习 executor 的阶段方法；
- 注入 `resolveVerdict`；
- 在测试里临时 `defineTool` 代替产品工具；
- 绕过 DSH `skill` loader 写 Run Manifest；
- 直接修改 active pointer；
- 伪造 Message Feedback、tool result、Evidence 或 child descriptor。

必须证明：

1. Profile 默认启用 learning loop，正式基础 Skill 可见；
2. 未绑定普通 Agent 看不到 submission tool；
3. 受支持主 Run 的 DSH catalog、direct invocation、loader body、Manifest 和 tool Evidence 是同一版本；
4. 当前 Run 在采用后仍是 parent，新建主 Run 使用 Candidate；
5. parent-bound Session 冷恢复仍是 parent，Candidate-bound Session 冷恢复仍是 Candidate；
6. 撤回最后支持后 verified rollback，新建主 Run 重新使用 parent；
7. evaluation/Shadow/transition 的工具只在受控 Agent 可见；
8. 五个 case 使用同一 oracle，且改变 arm 名称或 Session 后缀不会改变 verdict；
9. 分析 child 全部有合法 DSH descriptor，子 Agent 目录没有 corrupt 记录；
10. 主对话按阶段看到进度和唯一终态，重启后不重复交付；
11. 终态后所有 Tianwen child 正确 settle，DSH 的“正在运行”数量不残留幽灵任务。

### 13.2 全新安装验证

安装器测试必须从一个全新的 `D:\DevData` 子目录开始，打包、安装、校验 Profile 文件和 Runtime Bundle 内容，启动 DSH Host，并证明产品配置不是仓库内测试配置的偶然结果。大体积依赖、会话、workspace、state、pack 和临时验收资料均留在 `D:`。

### 13.3 真实 DSH Desktop 用户验收

最终验收必须像普通用户一样从已打包 Desktop 完成，使用真实 Provider/Model 和主对话 UI，不调用内部测试脚本改变治理状态：

1. 新建普通主对话，在其中启用一次 Tianwen 自动分析 consent；
2. 新建主对话，发送 `/research-summary` 与 source packet；
3. 确认回复体现基础版本的已知限制；
4. 对该回复点原生负反馈，写明“决策相关不确定性必须明确列出”的纠正；
5. 不打开 child，确认主对话及时出现 analysis-started；若运行超过 120 秒，确认出现存活进度；
6. 等待主对话收到真实评测结论；若 Candidate 未通过，验收应诚实失败，不能手工改 pointer；
7. Candidate 通过后，新建普通主对话，用 adjacent-transfer packet 再次调用 `/research-summary`，确认 DSH 实际加载 Candidate 且输出通过产品 oracle；
8. 回到原主对话撤回那条反馈，等待 verified rollback 终态；
9. 再新建普通主对话，确认又加载 parent 版本；
10. 检查 DSH 子 Agent 列表：所有 Tianwen child 可读、已正确 settle，无“会话记录损坏”；
11. 确认终态后左上角运行中 child 数量已经归零，或只包含确实仍在执行的无关任务；
12. 全流程不进入 child、不打开 Task 详情、不使用 Tianwen 自建批准按钮；该只读纵切原则上不要求完全访问，若外围真实操作确需权限，只在当前主 Session 修改 DSH 原生权限。

真实验收的日志、receipt、Session IDs、版本摘要和截图保存为发布证据，但不得包含凭据或完整私密反馈内容。

## 14. 设计证伪条件

出现任一情况即表示本设计或实现未完成：

- Run Manifest 记录 Candidate，但 DSH `skill` tool 返回 parent 内容；
- 采用后同一已绑定 Session 热换到 Candidate；
- 回滚后旧 Candidate-bound Session 被改写成 parent；
- 普通未绑定 Agent 或分析 child 能看到/执行 submission tool；
- oracle 因 arm 名称、Session 后缀或 Candidate ID 得出不同结论；
- evaluator 读取 verifier 之后的自由文本而非规范化提交；
- 用户必须进入 child 或 Task 页面才能继续、批准或知道结果；
- 活跃执行超过 120 秒而主对话没有任何可见状态；
- DSH 子 Agent 目录出现 Tianwen 造成的 corrupt 记录；
- Tianwen 已终态但 DSH 仍显示对应 child 正在运行；
- 测试通过依赖 test-only verdict、直接 pointer 写入或伪造 Evidence；
- packaged Desktop 的真实模型流程未通过，却用机制层测试宣称产品完成。

## 15. 预计实现触点

本节只界定所有权，不替代后续实施计划：

- `packages/tianwen-runtime-bundle/src/explicit-correction-protocol.ts`：升级为真实 v2 packet/case/oracle 合同；
- Runtime Bundle 新增正式 `research-summary` Skill、scoped Run admission/overlay 和 submission tool；
- `packages/tianwen-evolution/src/skill-governance.ts` 及 ledger：为 direct invocation 增加兼容旧 v1 记录的 v2 Skill-use provenance；
- `packages/tianwen-runtime/src/learning-intake.ts`：新增严格的 initial-pre-step binding seam，并强化显式纠正 Skill-use proof；
- `packages/tianwen-runtime/src/skill-evaluation.ts`：受控 Agent 安装产品工具，使用规范化 submission evaluator material；
- `packages/tianwen-runtime-bundle/src/runtime.ts`：组合正式生产纵切、进度投递和恢复；
- `scripts/install-tianwen.mjs` 与 Profile 验证：启用 learning loop 并校验 D 盘持久路径；
- `tests/dsh-migration/explicit-correction-product.e2e.spec.ts` 及相关 focused specs：覆盖产品接线、恢复、可见性和反作弊；
- Stage 3 Task 7 与 Stage 4 Story D 计划：用本设计替换“只补一个 E2E 测试”和“注入回归”的旧描述。

## 16. 评审清单

- [ ] 正常用户全程只在 DSH 主对话操作；
- [ ] Tianwen 核心叙事仍是学习循环和自我改进，Goal 只是可选能力；
- [ ] 使用 DSH 原生 Agent、Session、Skill、tool、permission、subagent 和 Message Feedback；
- [ ] 不复制 `standard` preset，不建立第二套 Skill loader/registry；
- [ ] future Run 的 Candidate 真正到达 DSH catalog 和 loader；
- [ ] 当前/恢复 Run 的版本冻结语义明确；
- [ ] source capture 与 controlled enforce 使用同一个产品工具定义；
- [ ] evaluator material、oracle 和五类 case 足以识别真实改进与过拟合；
- [ ] 进度、终态、离线补交和 corrupt-child 验收覆盖最初暴露的体验问题；
- [ ] 安装包和真实 Desktop 用户验收是完成门，不由单元测试替代。
