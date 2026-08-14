# DeepSeek Harness 源码调研：作为天问 Runtime 底座的可行性

**日期：** 2026-08-14

**目的：** 核查 DeepSeek Harness 是否已经提供天问通用 Agent 所需的非差异化底座，以及天问现有持续学习协议能否迁移到其插件体系。

**范围：** 只读官方仓库、文档、源码和 npm 发布元数据。未安装上游依赖，未运行模型、付费 API、真实 Docker 或上游测试。本文区分源码已经提供的保证、合理推断和仍需兼容性探针验证的部分。

## 1. 固定快照

| 项目 | 值 |
|---|---|
| 官方仓库 | `https://github.com/deepseek-ai/deepseek-harness` |
| 固定 commit | `47f943859bef60e4160492346772ded9b24f765a` |
| commit 时间 | `2026-08-13T19:38:46+08:00` |
| 根包版本 | `0.1.0-rc.5` |
| 2026-08-14 npm 最新发布 | `0.1.0-rc.6` |
| Node 要求 | `^22.19.0 || >=24.0.0` |
| 许可证 | MIT |
| `rg --files` 数量 | 5,286 |
| 本地只读快照 | `D:\DevData\research\deepseek-harness-20260814` |

官方 README 将项目标记为 Developer Preview，并明确警告后续会有破坏兼容性的改动。因此本文不能推出“可以无版本约束地长期依赖最新版本”。

版本证据存在一个必须明确保留的缺口：GitHub `master` 仍固定在上述
`rc.5` manifest，但 npm 已发布 `rc.6`；npm 元数据没有提供可映射的
Git tag 或 `gitHead`。因此本文后面的源码判断直接证明的是 `rc.5`
快照，不能自动冒充 `rc.6` 实现证明。兼容性探针拟精确使用
`0.1.0-rc.6`，第一道门会核对 npm tarball integrity、实际公开导出、
TypeScript 声明和完整锁文件；如果与本文审计的公共接口不同，必须先
报告兼容性差异，不能改用私有源码路径绕过。

## 2. 总结判断

DeepSeek Harness 比当前 Python + PydanticAI Harness 更接近天问需要的“通用 Agent Runtime”。它已经提供：

- 可替换的 Agent Loop、模型适配、工具注册、会话、持久化和恢复；
- Goal、Plan、Todo、Skill、子 Agent、后台 Job、定时任务和上下文压缩；
- Web、Headless 和 Python SDK 入口；
- 本地文件与命令沙盒、审批和权限策略；
- 追加式会话事件、请求快照、恢复、Fork 和会话谱系；
- Agent Preset、插件组合和运行时动态 Cordis 插件；
- 动态插件的不可变 Package、当前版本、候选版本、更新和回退指针。

但它没有完成天问的核心差异化协议：

- 跨会话、多 Goal、父子 Goal 和元 Goal 图；
- 目标执行循环与学习更新循环的正式区分；
- 来源证据、知识适用范围和元学习最小投影；
- 持久化候选资产、独立评测、Champion/Challenger；
- 受控晋升、观察期、真实任务反馈和回滚治理；
- 网络、系统调用和容器级强隔离；
- 动态插件从临时实验到正式版本的自动持久化与晋升。

因此最合适的关系不是“用 DSH 替代天问”，而是：

> DeepSeek Harness 提供通用 Agent 运行内核；天问通过 Profile、Bundle 和插件提供持续学习控制面。

## 3. 插件架构是否适合天问

官方架构说明：

- 模型适配器、工具注册、Session Log 和 Agent Loop 都是插件；
- 插件向共享 Context 提供服务、事件和可逆 Effect；
- 扩展优先通过挂载插件，而不是修改特权核心；
- Profile 是用户运行的组合，Bundle 是可分发的配置和插件层；
- 上层 Patch 可以替换已有配置行或插入新行。

这使以下天问能力可以成为正常扩展，而不必先 Fork 核心：

| 天问能力 | 可能的 DSH 扩展点 |
|---|---|
| Goal Graph 和 Loop 调度 | Goal Service、Agent 事件、Jobs、Session lineage |
| Evidence 投影 | `session/event`、Session Projection、Telemetry seam |
| 预算与停止规则 | `agent/pre-step`、`agent/request`、`tools/pre-execute` |
| 来源治理 | 工具管线、Session 自定义事件、Evidence 投影 |
| 学习信号 | 跨 Session 的只读投影和 Tianwen Ledger |
| 候选插件试验 | Dynamic Cordis Plugin、Agent Preset、独立 Session |
| 版本晋升 | Tianwen Artifact Registry + Profile 版本绑定 |
| 用户控制面 | Web Client Slot、Session Event、Remote API |
| 强隔离评测 | 可替换 Shell/FS 能力组或外部评测 Worker |

这里仍有一个待验证前提：公开插件接口是否足以承载天问的跨会话治理，而不需要频繁导入 DSH 私有实现。

## 4. Goal：高度重合，但不是完整 Goal Graph

DSH Goal 是同一 Session 内的持久化当前目标：

- 目标状态来自追加式 `goal/change` Session Event；
- 使用 `{id, revision}` 进行 compare-and-set，拒绝陈旧修改；
- phase 为 `active / paused / blocked / complete`；
- 模型面向的 Goal 工具在创建、编辑、暂停和恢复时要求直接人类输入的运行时授权；
- 自动 Goal Round 可以报告完成或阻塞；
- Resume、Fork 或驱动替换后保留目标和历史，但自动继续权限不会继承；
- `maxGoalRounds` 限制自动轮数；
- Goal Round 在 Agent 空闲、目标活动且仍有容量时排队下一轮。

这些机制与天问此前确认的原则高度一致，但人类授权不是 `GoalService` 自身对所有同进程调用方的安全隔离。Goal Service 信任已挂载插件；直接人类来源检查属于模型工具层。因此天问仍需限制哪些插件拥有 Goal 变更能力，不能把“官方工具拒绝非人类调用”误写成“任意插件都无法修改 Goal”。

在此前提下，可复用的原则包括：

- 顶层目标不能被后台任务静默修改；
- 连续运行需要预算；
- 恢复后不能在没有新授权时自动扩大执行；
- 完成和阻塞不能只依赖模糊进程状态。

DSH Goal 的明确限制也与天问差异化边界吻合：

- 同一 Session 只有一个当前 Goal；
- 没有独立评测器；
- 只有轮数预算，没有 Token、费用、时间和工具预算；
- 不实现 fresh-agent 独立尝试；
- 不管理跨 Session 的 Goal 图。

建议：

- DSH Goal 负责某个执行 Session 当前正在推进的目标；
- Tianwen Goal Graph 负责跨 Session 的 Goal、父子关系、用户循环和元循环；
- 一个 Tianwen Goal 只有在需要执行时才绑定 DSH Session/Goal；
- DSH Goal 不能成为 Tianwen 多目标治理的唯一数据库。

## 5. Session：可以成为执行事实层

DSH Session 是追加式、类型化的 `SessionEvent` 日志，是单次 Agent 交互历史的唯一事实源：

- LLM 历史从事件日志派生，不另存一份可漂移的消息历史；
- Turn、Step、用户消息、模型输出、工具调用和工具结果都是持久事件；
- Session 可以恢复、Fork 和重放；
- Session Header 保存 cwd、父 Session、seed boundary 和 Agent Preset；
- `request/header` 冻结每个请求 epoch 的模型配置、系统提示词和工具 schema；
- 插件可以通过声明合并增加自己的持久事件；
- Session Projection 可以从事件重建派生视图。

这可以替代天问当前大量通用执行账本，但不能替代跨 Session 治理账本。

建议采用两层账本：

1. DSH Session Log：模型、工具、消息、请求配置、恢复和单次执行事实；
2. Tianwen Ledger：Goal Graph、Task、Run、Evidence 索引、LearningSignal、ArtifactVersion、EvalReceipt、Promotion、Rollback 和 Champion 指针。

Tianwen Ledger 只引用必要的 `session_id / event_seq / digest / purpose / provenance`，不复制完整用户对话。

## 6. 工具与权限：可替代大部分通用 Action Gateway

DSH 工具执行管线为：

```text
tool/call
→ tools/pre-execute
→ tools/execute
→ tools/post-execute
→ tool/result
```

策略守卫可以在执行前返回允许、拒绝或询问；拒绝是单调的，后续监听器不能重新放宽。审批在缺少回答通道时失败关闭。

这意味着当前 Action Gateway 中以下通用部分不应继续独立扩建：

- 普通工具注册；
- 文件与命令的基础权限判断；
- 执行前审批；
- 工具调用与结果配对；
- 普通工具结果持久化；
- 会话内工具恢复事实。

天问仍需保留：

- Goal、Task、Run 和预算归属；
- Evidence 与来源用途；
- 外部副作用的未知状态；
- 跨 Session 去重和元循环最小投影；
- 评测、晋升和发布器的独立权限。

## 7. 沙盒：日常执行可复用，强隔离仍需保留

DSH 本地沙盒支持：

- Linux：Bubblewrap 或 Landlock；
- macOS：Seatbelt；
- Windows：ACL + Restricted Token；
- `read-only / workspace-write / danger-full-access`；
- 每次调用携带策略和工作区；
- 无可用后端时失败关闭，而不是静默裸跑；
- 文件工具与 Shell 使用一致的权限策略；
- Windows 为每个 Session/Workspace 提供独立临时能力。

但官方明确限定：

- 沙盒只表达文件写入效果；
- 网络、进程可见性、系统调用、设备和凭据不在该词汇中；
- Windows 后端存在 Everyone、Hard Link 和读取侧边界，报告为 `partial`；
- Container、microVM 和远程执行属于整组 Shell/FS 能力的替代实现，不是当前 `ctx.sandbox` 的普通后端。

结论：

- 普通 Agent 任务应优先使用 DSH 本地沙盒；
- 当前 `alpha_docker.py` 不再适合作为默认 Agent 执行器；
- Docker、远程沙盒或 microVM 仍可作为高风险候选评测和正式晋升门；
- 原 Task 10 必须冻结并重新设计，不能按旧计划自动继续。

## 8. 动态 Cordis 插件：已经有试验版本线，但不是长期学习

模型可以通过 Cordis 工具：

- 检查当前服务、事件、工具和 UI Slot；
- 为一个 Plugin 定义不可变 Package；
- 运行精确 Package；
- 以 `update` 切换新版本；
- 停止或删除插件；
- 使用 `currentPackageId` 表示最近成功版本；
- 使用 `nextPackageId` 表示待审批、正在尝试或最近失败的候选；
- 以 `run` 重新运行当前版本或执行回退。

这与天问的 ArtifactVersion、Champion 和 Challenger 有明显结构对应。

但官方也明确说明：

- 动态定义只存在于当前进程内存；
- 重启后消失；
- 不写 Plugin 文件、配置或仓库；
- 不能自动晋升；
- VM 只减少误操作，不是恶意代码安全边界；
- 异步代码可逃出同步 VM 时间上限。

因此合理分工是：

```text
临时 Dynamic Package
→ 受控试运行
→ 导出或重建为正式不可变 ArtifactVersion
→ 独立评测
→ 人类授权晋升
→ 写入正式 Tianwen Profile/Registry
```

天问需要补齐持久版本库、EvalReceipt、晋升记录、观察期和回滚历史。

## 9. Agent Preset 和请求时间线

除了动态插件，DSH 还有两类可复用版本事实：

1. Agent Preset generation

   Preset 文件变化后，新 Session 使用下一代组合；已经运行的 Session 保留自己加入的旧一代，避免工具集在对话中途漂移。

2. Request epoch

   `request/header` 记录每个 loop 实例和变化后的模型配置、系统提示词和工具 schema，可以重建模型实际看见的请求边界。

这些事实可以成为 Tianwen RunManifest 的输入，但不能直接等同于 Tianwen Promotion：

- Preset generation 说明“运行了哪一代组合”；
- Request epoch 说明“这一轮模型看到了什么”；
- Tianwen Promotion 说明“为什么某个候选经过评测后被允许成为正式版本”。

## 10. Python SDK：适合作为迁移桥，不适合作为最终插件层

官方 Python SDK：

- 通过 stdio JSON-RPC 驱动 DSH 子进程；
- 可以使用默认或自定义 Cordis Composition；
- 提交 Session Prompt；
- 返回最终响应、finish reason、根 Session Events 和子 Agent Notifications；
- 可以复用同一 runtime 和 session id；
- 支持自定义 endpoint、model 和 max output tokens。

这使现有 Python 代码可以暂时保留为：

- 独立评测器；
- 学习和数据分析 Worker；
- 兼容性探针控制器；
- 迁移期间的外部治理参考实现。

限制：

- Python SDK 不是 Python Cordis 插件 SDK；
- 公布的预构建 runtime 主要面向 Linux x64、Linux arm64 和 macOS arm64；
- Windows 需要使用 Node/source carrier 或另行构建入口；
- 高层 SDK 主要控制 Turn 和读取事件，天问专用治理 API 仍需正式插件/RPC seam。

## 11. 现有天问成果的迁移价值

### 11.1 可以直接保留

- 产品愿景与“学、习、持续”定义；
- Goal 主权、自主边界和用户协作原则；
- 用户目标循环、学习更新循环和元循环；
- A1–A5 任务包、Reference Patch 和固定来源；
- 评测协议、密封评测、EvalReceipt 和签名边界；
- 研究笔记、复审结论和历史交接；
- Python 评测器和数据分析逻辑。

### 11.2 需要按 DSH 插件边界迁移

- GoalContract 与 Goal Graph；
- Loop、Task、Run、Evidence 和 LearningSignal；
- SourceRecord 和外部内容不可信边界；
- ArtifactVersion、Champion、Challenger；
- TrialManifest、Promotion 和 Rollback；
- 预算、停止和未知副作用处理。

### 11.3 应停止继续扩建

- PydanticAI 专用 Agent Runtime；
- 自研基础 Agent Loop；
- 通用工具注册和普通会话日志；
- 自研普通本地沙盒；
- 通用 CLI/UI 外壳；
- 把大型 StateStore 同时作为执行事实和治理事实的方向。

## 12. 推荐产品结构

天问仍是独立通用 Agent 产品，不是类似 Superpowers 的单个 Skill。

```text
DeepSeek Harness
├─ Agent Loop、模型、工具、Session、恢复
├─ Goal、Plan、Todo、Skill、Jobs、Compaction
├─ 本地 Sandbox、Approval、UI、Subagent
│
└─ Tianwen Profile / Bundle
   ├─ tianwen-control
   ├─ tianwen-evidence
   ├─ tianwen-evolution
   └─ tianwen-ui

Optional Providers
├─ evaluator-python
├─ sandbox-container
└─ explorer-web
```

目标架构使用 TypeScript 编写 Runtime 插件和 UI，Python 继续承担评测、研究和暂时不值得迁移的学习逻辑。

## 13. 主要风险与待验证问题

1. Developer Preview 的兼容性破坏频率是否可以由薄兼容层承受；
2. 外部插件能否只依赖公开 API，避免导入私有实现；
3. Tianwen 自定义 Session Event 和 Projection 能否稳定持久化、恢复和 Fork；
4. DSH Goal 与跨 Session Goal Graph 是否能保持单一权威，不产生双写漂移；
5. 动态 Package 是否能安全导出为正式 ArtifactVersion；
6. 候选插件能否在不影响 Champion 的独立 Context/Profile 中评测；
7. Python 评测桥在 Windows 上如何启动、取消、恢复和绑定 Run；
8. DSH 本地沙盒在目标机器上的真实 enforcement 是否满足普通任务；
9. UI Slot 和 Remote API 是否足以构建天问进度与版本控制面；
10. 升级 DSH 后 A1–A5 和恢复合同能否保持不变。

这些问题必须由兼容性探针回答，不能仅凭源码结构宣称迁移成功。

## 14. 推荐结论

采用以下可逆策略：

> 将 DeepSeek Harness 提升为天问首选候选 Runtime；保留当前 Python 实现为参考基线；先完成最小兼容性探针，探针通过后才正式迁移。

不建议：

- 立即删除或废弃当前 Python 实现；
- 直接 Fork 并大规模修改 DSH 核心；
- 在未验证持久化和版本隔离前把动态 Cordis 插件当正式学习资产；
- 继续按旧 Task 10 把自研 Docker 路径建设为默认 Runtime；
- 在探针前编写完整迁移计划或投入 UI 重构。

## 15. 官方来源

- [DeepSeek Harness README](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/README.md)
- [Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md)
- [Base Bundle](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/bundle/base/README.md)
- [Session](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/session.md)
- [Persistence](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/persistence.md)
- [Tools](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/tools.md)
- [Sandbox](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/sandbox.md)
- [Goal](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/goal/goal/README.md)
- [Goal Round Driver](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/goal/goal-round-driver/README.md)
- [Agent Presets](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/preset/agent-presets/README.md)
- [Dynamic Cordis Tool](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/extensions/tool-cordis/README.md)
- [Dynamic Cordis Model Guidance](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/extensions/tool-cordis/src/prompt.ts)
- [Python SDK](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/python/sdk/README.md)
- [MIT License](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/LICENSE)
