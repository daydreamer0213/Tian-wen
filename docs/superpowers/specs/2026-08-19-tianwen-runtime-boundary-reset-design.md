# Tianwen 产品 Runtime 边界重置设计

**日期：** 2026-08-19

**状态：** 架构方向与书面边界已批准；已按 DSH rc.7 能力审计校准

**权威范围：** Tianwen 正式产品的 Agent Runtime、长期 Goal、Evidence 与持续学习集成边界

## 1. 决策摘要

DeepSeek Harness（下文简称 DSH）是 Tianwen 唯一的正式产品 Agent Runtime。模型调用、Agent Loop、工具与 MCP、Session、恢复、普通沙盒和单轮 Goal 执行都复用 DSH。Tianwen 不再建设第二套通用 Agent Runtime，而只在 DSH 的公开 hook、配置和插件 seam 外围提供长期 Goal、Evidence 和学习治理。

现有 Python Alpha 冻结为实验室、评测合同和历史参考实现。它可以继续帮助验证任务包、评测协议和治理语义，但不再扩建通用 Agent Loop、Session、工具、沙盒、恢复或预算调度能力，也不迁移为正式产品 Runtime。

这一决定选择的是“一个执行内核、一个治理外层”，明确排除两条路：

- 不采用 DSH 与 Python 双 Runtime 长期并行。双 Runtime 会产生两套结束语义、工具事实、恢复权威和行为差异。
- 不继续以 PydanticAI/Python `RepoTaskRuntime` 为正式产品底座。它只能保留为 Alpha 历史和评测辅助。
- 不 Fork 或重写 DSH。只有公开 seam 被真实端到端证据证明无法承载 Tianwen 特有能力时，才单独重新评估最小替代方案。

### 1.1 DSH rc.7 能力校准

[DSH upstream 能力重叠审计](../../research/2026-08-19-dsh-upstream-capability-overlap-audit.md)把官方 `master@99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`（根版本 `0.1.0-rc.7`）与本项目实际固定的 rc.6 公共依赖逐项对比。rc.7 进一步扩大 `REUSE_DSH` 范围：Session Query/Projection、Skill provider/catalog/loader、Jobs、Schedule、Workflow、Message Feedback、Plan、Todo、User Questions、Approval/permission presets 和 opt-in 的临时 Cordis extensions 都不再由 Tianwen 规划通用替代组件。

该审计也确认 DSH Goal 仍是 same-session Goal，runtime extensions 没有自动 save/install/promote 或重启恢复，并且 upstream 没有正式、通用、完整的 `Evidence → Case → Attribution → Lesson → Candidate → Evaluation → Shadow → Promotion → Rollback` 产品闭环。因此跨 Run 长期 Goal、Evidence 治理绑定、学习归因和未来版本治理仍是 Tianwen 特有职责。

这项校准不授权产品依赖直接升级。唯一下一工程阶段是 exact rc.7 compatibility probe：只在 D 盘隔离环境验证发布闭包、公开 API、Windows/headless/Profile 和 Tianwen 薄 seam；任何承重合同不满足都结论为“不升级”，不得在 probe 内补写兼容框架或 patch DSH。

## 2. 核心架构：两个循环，一条旁路

### 2.1 内层：DSH Agent 执行循环

内层负责一次普通任务从开始到结束的完整行为：

```text
用户请求 / 冻结 Run 输入
→ DSH 观察上下文
→ 模型推理
→ 工具或 MCP 行动
→ 工具结果返回模型
→ 修正或继续
→ 最终回答
→ DSH Session 成为执行事实来源
```

Tianwen 不插入第二个 Agent Loop，不接管每次模型请求，也不自行解释模型何时应该结束。除真实副作用前的授权 seam 外，Tianwen 治理不得切断 DSH 的观察、推理、工具反馈和正常终答。

### 2.2 外层：Tianwen 长期 Goal 循环

外层管理跨 Task、跨 Run 和跨 Session 的长期目标：

```text
长期 Goal
→ 选择下一个 Task
→ 冻结 Run 输入和当前 Champion
→ 委托 DSH 完成普通任务
→ 接收结果与 Evidence 投影状态
→ 更新长期 Goal 进度
→ 决定继续、等待、完成或请求用户决策
```

DSH 的单轮 Goal、Plan 和 Todo 用于当前执行；Tianwen Goal Graph 保存跨会话目标、依赖、进展和价值取舍。DSH Turn 不等于 Tianwen Run，DSH Todo 也不等于 Tianwen Task。

### 2.3 Learning：默认不阻塞 Goal 的旁路

Learning 不是内层执行循环的必经步骤，也不是当前 Goal 的同步后处理器。学习调度只有三种结果：

- `BACKGROUND`：普通默认。形成 Learning Ticket 后由后台预算独立处理；当前 Goal 继续推进。
- `DEFERRED`：证据不足、价值不高、预算不足或当前无空闲能力时记录待办；不阻塞当前 Goal。
- `INLINE`：窄例外。只有当前 Goal 无法安全完成、没有已有 Skill/工具/人工确认/降级结果等替代路径，而且这次学习动作本身仍在当前冻结权限和预算内时才允许。

`INLINE` 不能借机创建或切换正式 Champion，不能扩大权限，不能把探索结果直接当作晋升证据。只要存在返回部分结果、等待用户、改用现有能力或后台处理的可行路径，就不得使用 `INLINE`。

## 3. 四个正式集成 seam

Tianwen 与 DSH 只通过以下四个 seam 协作。seam 是窄接口，不是第二套 Runtime。

### 3.1 运行前：冻结输入绑定

在创建 DSH Run/Session 前，Tianwen 选择并冻结：

- 当前 Champion 与版本摘要；
- 选中的 Skill、Overlay 及其摘要；
- 用户 Goal、Task 请求和验收标准；
- 权限、资源和影响边界；
- 需要写入 Run Manifest 的 Tianwen 引用。

这些内容通过 DSH 已有 Profile、Preset、Skill loader、配置或公开插件输入传入。冻结完成后，当前 Run 始终使用同一版本。即使运行期间产生新 Champion，也只能影响未来新建的 Run。

### 3.2 真实副作用前：授权

DSH 仍负责工具执行管线和普通沙盒。只有工具即将产生真实外部副作用时，Tianwen 才依据冻结权限做授权判断，例如付款、发布、发送、删除、权限扩大或不可逆外部写入。

授权失败必须发生在副作用之前，并作为明确、可行动的工具结果返回 DSH。纯读取、普通推理、工具反馈、Evidence 投影和最终回答不得因为“可能以后有风险”而被提前阻断。审计记录不等于审批门。

### 3.3 运行后：DSH Session 投影为 Evidence

DSH Session Event 是执行事实来源。Tianwen 在运行后或流式旁路中读取稳定事件引用，投影最小 Evidence：

- Session、事件序号和内容摘要；
- 模型、工具调用、工具结果与产物引用；
- 来源、权限和用途范围；
- 与 Tianwen Goal、Task、Run 的稳定绑定；
- 投影成功、失败或待重试状态。

Tianwen Ledger 不复制一份可变的 Session 执行历史。Evidence 投影失败只能产生独立的 `evidence_projection_failed` 或待重试状态，不能把 DSH 已成功交付的用户结果改成失败，也不能改写原 Session。

### 3.4 运行之间：Learning 与 Promotion

只有在 Run 之间，Tianwen 才处理 Learning Signal、Ticket、Lesson、Candidate、Evaluation、Shadow、Promotion 和 Rollback。其输出可以更新未来 Run 选择的 Champion 或 Overlay，但不能热替换正在运行的 DSH Session。

失败语义保持独立：任务执行失败、Evidence 投影失败、Learning 不足、Candidate 评测失败和 Promotion 被拒绝是五种不同事实，不能互相代替。

## 4. 组件所有权矩阵

| 组件或能力 | 正式所有者 | Tianwen 的允许接入方式 |
|---|---|---|
| 模型与 Provider 适配 | DSH | 选择已有 provider/config；不另建模型抽象层 |
| Agent Loop、推理—行动—反馈—终答 | DSH | 不接管请求循环；只传入冻结配置 |
| Tools、MCP、工具结果回传 | DSH | 复用注册和执行管线；副作用前调用授权 seam |
| Session Event、请求快照、恢复、Fork、Compaction | DSH | 保存稳定引用并投影 Evidence |
| 普通文件、命令和本地 Sandbox | DSH | 使用已验证的 DSH sandbox 能力与配置 |
| 单轮 Goal、Plan、Todo | DSH | 作为当前 Run 的执行结构，不当作长期账本 |
| 单次 Run 的模型、工具和时间限制 | DSH | Tianwen 只在运行前选择并冻结边界，由 DSH 执行；不另建预算调度器 |
| 长期 Goal Graph、Task/Run 调度 | Tianwen | 通过插件绑定 DSH Session/GoalRef |
| Evidence、来源、用途和隐私投影 | Tianwen | 从 DSH Session Event 单向投影 |
| Learning Intake、Signal、Ticket、Lesson | Tianwen | 默认后台或延后，不阻塞普通 Run |
| Candidate、Evaluation、Shadow | Tianwen | 仅在 Run 之间运行，不能改变当前 Run |
| Promotion、Champion、Rollback | Tianwen | 更新未来 Run 的活动指针；历史追加保存 |
| Skill 加载器 | DSH | 复用 DSH loader |
| Skill 选择、冻结、Overlay、作用域 | Tianwen | 运行前形成冻结输入，交给 DSH loader |
| 短期记忆 | DSH Session | Tianwen 不复制第二份对话记忆 |
| 长期 Lesson | Tianwen | 保存来源、适用范围、版本和失效条件 |
| Docker / container | 高风险评测提供方 | 不作为普通 Agent Runtime 或默认工具沙盒 |
| Python Alpha / Evaluator | 实验室与评测提供方 | 保持合同，不承担产品 Agent Runtime |

## 5. 非干扰不变量

### 5.1 Tianwen off/on 等价

对同一确定性任务，如果模型、工具、环境、权限、Skill、Overlay、输入和随机性都冻结一致，则：

```text
Tianwen off 的 DSH 执行
≡
Tianwen on 的 DSH 执行
```

等价范围至少包括：模型可见输入、工具选择、工具参数、工具反馈、执行动作、产物和最终回答。允许增加的差异只有 Tianwen Goal/Run 绑定、Evidence 索引、审计事件和后台 Learning Ticket 等治理记录。

只有 Tianwen 显式改变并冻结了输入——例如选择了不同 Champion、Skill、Overlay 或权限——执行行为才允许不同，而且差异必须可追溯到该冻结输入，不能归因于隐藏控制流。

### 5.2 成功结果不可被旁路改写

- Evidence 投影失败不得把已经成功的用户结果改写为失败。
- 后台学习失败、预算停止或没有产生 Candidate 不得撤销成功结果。
- Candidate、Shadow 或 Promotion 失败只影响学习治理，不回写原 Run。
- 原 Run 的执行状态、验证状态、Evidence 状态和学习状态分别表达。

### 5.3 权限门只保护真实副作用

权限门可以在真实副作用前拒绝或等待用户，但不得把读取、反馈、推理和终答一并冻结。若授权被拒，DSH 必须收到结构化结果，以便给出替代方案或诚实终答。低概率理论风险只能产生审计或后续风险 Ticket，不能自动升级为审批。

## 6. 复用门与偏离规则

任何新增组件或控制在进入设计前都依次通过以下复用门：

1. 先检查 DSH、PydanticAI 和当前已锁定依赖是否已有对应能力；
2. 若有能力但缺少组合，优先使用公开 hook、配置、Profile、Preset 或 plugin 做薄适配；
3. 只有该能力确属 Tianwen 特有，而且真实端到端证据证明没有可用 seam 时，才允许最小自研；
4. 自研不能重新抽象整个 DSH，也不能顺手建立通用框架。

任何偏离主流 Agent 语义的设计必须同时写明：

- 已发生或可稳定复现的现实故障证据；
- 偏离会损失哪些普通 Agent 能力；
- DSH、PydanticAI 或现有依赖为什么不能解决；
- 更简单的配置、hook 或旁路方案为什么不足；
- 如何通过端到端行为证据证明偏离必要。

缺少上述材料时，默认复用主流语义，不新增控制。

## 7. Python Alpha 分支冻结处置

### 7.1 正式基线不变

正式 `main` 和 `origin/main` 继续停在：

```text
c00699b78c1ba0d6b963f543e817bb244b3362bb
```

脏分支 `codex/tianwen-agent-execution-foundation` 的 6 个提交不合并：

```text
02ad782 docs(alpha): plan execution foundation correction
3f12d3f fix(alpha): restore readable workspace feedback loop
e590862 fix(alpha): restore skill and outcome semantics
b87b75e fix(alpha): separate read and effect budgets
9973b02 fix(alpha): preserve finalization under request fuse
c0deec9 test(alpha): prove governed execution feedback loop
```

其中 `b87b75e` 可以作为最小 Alpha 研究检查点，记录读写边界、反馈、Skill/结果语义和 effect 计数研究；它不是正式产品提交边界。

`9973b02`、`c0deec9` 以及其后的未提交修改不迁移。尤其不迁移通用 Python request fuse、最后请求 finalization hook、wall wrapper、第二套 provider 来源判定或其他 `RepoTaskRuntime` 扩建。

### 7.2 未提交工作树只读保留

现有 Alpha 工作树中的 15 个未提交文件保持原样，不提交、不清理、不回退：

```text
src/tianwen/alpha.py
src/tianwen/alpha_docker.py
src/tianwen/alpha_runtime.py
src/tianwen/app.py
src/tianwen/exploration.py
src/tianwen/runtime.py
tests/integration/test_alpha_comparison.py
tests/integration/test_alpha_execution_contract.py
tests/integration/test_alpha_runtime.py
tests/integration/test_alpha_trial.py
tests/integration/test_runtime.py
tests/integration/test_vertical_slice.py
tests/unit/test_alpha_docker.py
tests/unit/test_exploration.py
tests/unit/test_learning.py
```

在新的架构复审决定如何归档前，禁止从该工作树运行真实 Alpha、Provider、Docker 或 consumed evidence root。历史 Evidence 和容器不得因本次边界重置而删除。

## 8. 恢复建设顺序

恢复工作必须按以下顺序推进。每一步都先取得免费、可重复的端到端行为证据，再增加下一层治理；字段、单测或静态对象存在不能代替行为证据。

### 阶段 0：exact rc.7 compatibility probe

在阶段 1 前先验证 rc.7 发布包与公开 seam，不修改根 `package.json`、`pnpm-lock.yaml` 或任何产品包依赖。探针只给出 keep/delete/thin-adapt/不升级决策，不迁移功能，不修补 DSH，不进入长期 Goal、Learning 或 Candidate 实现。只有 closure、Windows、headless/Profile、核心执行、rc.7 新增复用面、Evidence 只读投影和 Tianwen off/on 非干扰合同全部通过，才允许另行设计依赖升级。

### 阶段 1：DSH 原生普通任务

先证明没有 Tianwen 治理时，DSH 可以独立完成观察、读取、工具行动、反馈修正和终答。失败时先修复 DSH 配置或依赖使用，不建立 Python 补偿 Runtime。

### 阶段 2：只开启 Evidence 投影

Tianwen 只读取 DSH Session Event 并投影 Evidence，不改变冻结输入和执行管线。用同一确定性任务验证 Tianwen off/on 在动作、反馈、产物和终答上等价，并验证投影故障不改写结果。

### 阶段 3：接入长期 Goal 调度

长期 Goal 只负责选择下一个 Task、创建冻结 Run、绑定 DSH Session，并依据执行结果更新进度。不得替换 DSH Goal Round、Plan 或 Todo。

### 阶段 4：接入非阻塞 Learning Ticket

从明确 Evidence 形成 Signal/Ticket，默认 `BACKGROUND` 或 `DEFERRED`。验证入队、失败和预算停止都不延迟或撤销普通 Goal 结果。

### 阶段 5：最后接 Candidate/Shadow/Promotion

只有前四阶段稳定后，才恢复 Candidate、独立 Evaluation、Shadow、Promotion 和 Rollback。新 Champion 只影响未来 Run；当前 Run 和历史 Evidence 保持冻结。

任一阶段的端到端证据失败时停止在该阶段，不用新增治理层掩盖基础执行问题。

## 9. 风险分层原则

控制强度按真实影响逐层增加：

| 层级 | 设计重点 | 默认处理 |
|---|---|---|
| 普通、可恢复执行 | 流畅完成用户任务 | 复用 DSH；最少打断；失败可重试或返回结果 |
| Evidence | 准确、可追溯、不越权 | 单向投影；失败独立重试；不能改写 Run |
| Learning | 归因谨慎、作用域最窄 | 后台/延后；证据不足即不学习 |
| Candidate 与晋升 | 独立评测、未来生效、可回滚 | 严格门；失败不影响 Champion 或用户结果 |
| 权限扩大与不可逆动作 | 防止真实外部损失 | 副作用前最严格授权；未知结果不盲目重试 |

审计用于解释已经发生的事实，不自动等于审批。风险标签也不能替代对实际副作用、可恢复性、成本和用户授权的判断。

## 10. 明确非目标

本设计不授权以下工作：

- 不修完、迁移或产品化 Python `RepoTaskRuntime`、`AlphaRuntime`；
- 不新建第二个 Agent Loop、Session、Tool/MCP 管线、Sandbox、Recovery 或 Budget Scheduler；
- 不用 Python wrapper 修补 DSH 的普通结束、反馈或恢复语义；
- 不调用付费模型做采样；
- 不进入 Candidate、Shadow、Promotion、Alpha-D 或新的真实 Alpha；
- 不删除、改写或广泛清理历史 Evidence、Trial root 或容器；
- 不因本设计存在而自动启动实现计划；
- 不合并冻结的 Alpha 分支到 `main`。

## 11. 与既有文档的关系

本文件是产品 Runtime 边界的权威设计。发生冲突时，优先级如下：

1. 本文件：正式产品 Runtime 边界与恢复顺序；
2. `2026-08-14-deepseek-harness-runtime-selection-design.md`：DSH 选型依据；
3. `2026-08-15-tianwen-on-dsh-migration-phase-1-design.md` 与 Phase 2：已验证的迁移 seam 和产品组合；
4. `2026-08-17-tianwen-continuous-learning-governance-design.md`：长期 Goal 与学习治理规则；
5. `2026-08-19-agent-execution-foundation-design.md`：降级为 Python Alpha 历史修复记录，不再决定产品 Runtime。

本设计不是对 DSH 选型的重新开放，而是恢复已经批准的选型边界。它也不推翻持续学习治理；只明确 Learning 位于普通执行旁路，且默认不阻塞长期 Goal。

`2026-08-19-dsh-upstream-capability-overlap-audit.md` 是本设计在 exact rc.7 上的组件能力证据；它扩大 DSH 复用清单，但不取代本文件的产品所有权与非干扰不变量。若后续 DSH 版本变化，必须重新做 compatibility probe，不能把会移动的 upstream `master` 当成已批准产品依赖。

旧 `agent-execution-foundation` 文件目前只存在于冻结的 Alpha 分支，不在本设计的 `main@c00699b` 基线中。这里定义的是它与产品架构的权威关系，不要求为建立关系而把旧文件合并进 `main`。

旧 `agent-execution-foundation` 文档中关于读取、反馈、Skill 可见、结果分类和 effect 计数的合理结论可以作为行为验收参考；其中指向 Python 通用 Runtime、request fuse、finalization hook、wall wrapper 或 Docker 普通执行底座的实现方向不再具有产品权威性。

## 12. 成功门

以下是未来产品边界的整体验收条件，不授权本轮编写实现计划或启动任何恢复阶段。

只有同时取得以下端到端证据，产品 Runtime 边界才算落地：

1. DSH 在 Tianwen 关闭时可以独立完成一个基础普通任务，包括读取、工具反馈、修正和最终回答；
2. Tianwen 只开启治理时，off/on 的执行动作、工具反馈、产物和终答等价，差异仅为明确的治理记录；
3. Tianwen 显式改变 Champion、Skill、Overlay 或权限时，行为差异可追溯到冻结输入；
4. 长期 Goal 能跨多个 Task/Run 更新进度，而不重建 DSH 单轮 Goal 或 Session；
5. Learning Signal 能后台入队或延后，入队失败、处理失败和预算停止都不阻塞普通 Goal；
6. Evidence 投影失败不改写已成功的 DSH 结果，且可以独立恢复；
7. Candidate、Evaluation、Promotion 和 Rollback 只改变未来新 Run，不能热切换当前 Run；
8. 执行、验证、Evidence、Learning、Candidate 和 Promotion 的失败语义分别记录；
9. 权限门只在真实副作用前阻断，并把拒绝结果返回 DSH；
10. 代码和依赖审计证明没有重复建设 Agent Loop、Session、Tool、Sandbox、Recovery 或预算调度底座。

如果任何成功门只能通过扩建 Python 通用 Runtime 才能满足，必须回到设计层重新核对 DSH 公开 seam；不得在实现中静默形成第二 Runtime。

## 13. 后续入口

本文件与 rc.7 能力重叠审计已经用户批准。唯一下一入口是 `2026-08-19-tianwen-dsh-rc7-compatibility-probe.md`：先由用户复审该验证计划，再在独立分支执行阶段 0。计划获批前不修改产品或测试代码；探针完成前不直接升级依赖，也不启动阶段 1–5。
