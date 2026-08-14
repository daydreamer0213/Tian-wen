# 天问 Runtime 重新选型：DeepSeek Harness 候选底座

**状态：** 架构讨论已形成推荐方向；兼容性探针正在实施，因此本文仍不授权正式迁移

**日期：** 2026-08-14

**范围：** 决定天问是否应从“Python + PydanticAI Harness 自建通用 Runtime”转向“DeepSeek Harness + Tianwen Profile/Plugins + Python 评测”

## 1. 决策摘要

推荐采用：

> 精确锁定 DeepSeek Harness 版本，以 Tianwen Profile、Bundle 和外部插件构建独立天问产品；保留 Python 作为评测、研究和迁移期治理 Worker；兼容性探针通过后才正式迁移。

当前 Python 实现保留为参考实现和验收基线。Task 10 冻结，不再按旧计划自动执行真实 Docker 发布门。

这是一项“候选目标架构”决策，不是已经完成的实现事实。

## 2. 为什么重新打开选型

原方案选择 Python + PydanticAI Harness 的理由是：

- 快速获得模型调用、文件工具、Skill 和步骤持久化；
- 天问自己掌握 Goal、证据、学习和版本治理；
- 避免在 Hermes 等既有 Agent 上大规模重建控制面；
- 非核心组件优先复用成熟实现。

DeepSeek Harness 在原方案确认后公开，新增了一个此前不存在的选项：

- Agent Loop、模型、工具、Session 和沙盒均可替换；
- 已有 Goal、Plan、Todo、Skill、Job、Schedule、Compaction、Subagent 和 Web UI；
- 支持 Profile、Bundle、Agent Preset 和外部插件；
- 有追加式事件、恢复、Fork、请求快照和动态插件版本指针；
- 本地 Windows 也有正式沙盒路径。

继续自建这些能力会偏离“只在差异化部分投入”的既定原则。因此必须重新评估，而不能因已有代码形成路径依赖。

## 3. 天问产品定位不变

采用 DSH 不会把天问降级为一个 Skill 或普通插件。

天问仍是用户安装和使用的独立通用 Agent 产品：

- 有自己的产品名、Profile、默认组合、UI 和发布节奏；
- 自己掌握跨会话 Goal Graph、学习循环和版本治理；
- 可以选择模型、搜索、评测和强隔离提供方；
- 不依赖 Codex 或某个外部 Agent 才能运行；
- DSH 是通用运行内核，不是天问的产品定义。

类比关系：

```text
DeepSeek Harness = 通用发动机和底盘
Tianwen Profile  = 产品装配方案
Tianwen Plugins  = 持续学习控制系统
天问             = 用户最终使用的整车
```

## 4. 三个方案

### 4.1 方案 A：继续纯 Python

继续扩展 PydanticAI Runtime、Action Gateway、StateStore、CLI、沙盒和 UI。

优点：

- 现有实现可直接继续；
- Python 团队认知成本最低；
- 短期完成单个 Alpha 任务最快。

缺点：

- 需要继续建设通用 Agent Loop、Goal UX、Session、Fork、UI、插件、沙盒、Subagent、Jobs 和 Compaction；
- 重复维护非差异化能力；
- 越往后迁移成本越高。

适合作为稳定参考实现，不推荐作为长期目标架构。

### 4.2 方案 B：Fork DeepSeek Harness

把 DSH 作为天问代码库核心并直接修改。

优点：

- 所有内部接口都可修改；
- 最快突破不完整的插件 seam；
- 可以深度定制 UI 和 Runtime。

缺点：

- DSH 处于 Developer Preview；
- 上游更新会产生持续合并成本；
- 容易把天问差异化逻辑散落进上游核心；
- 用户难以区分上游修复和天问产品改动；
- 尚无证据证明必须修改核心。

当前不采用。只有兼容性探针证明承重需求无法通过公开插件接口实现时才重新评估。

### 4.3 方案 C：DSH Profile + Tianwen Plugins + Python Evaluator

天问仓库保留独立产品代码，通过精确依赖使用 DSH。

优点：

- 最大化复用通用 Agent 能力；
- 天问持续学习边界集中；
- 可以跟随上游修复而不合并整个 Fork；
- Python 评测和现有任务包可以继续使用；
- 失败时可以退回当前 Python 基线。

缺点：

- 需要 TypeScript + Python 混合技术栈；
- Cordis 学习成本高；
- 外部插件 API 是否足够仍需验证；
- 必须管理上游兼容性。

推荐采用，前提是通过兼容性探针。

## 5. 职责边界

### 5.1 DeepSeek Harness 负责

- 模型适配和 Agent Loop；
- Session Event、请求快照、恢复和 Fork；
- 工具注册、执行管线和普通审批；
- Goal Round、Plan、Todo、Skill、Jobs、Schedule；
- 普通本地文件和命令沙盒；
- Subagent、Compaction、Web/Headless UI 基础；
- Agent Preset 和临时 Dynamic Cordis Plugin。

### 5.2 天问负责

- 跨会话 Goal Graph；
- 用户 Goal、学习子 Goal 和元 Goal；
- Task、Run、Loop 和多维预算；
- 来源、Evidence、知识适用范围和隐私投影；
- LearningSignal 和候选生成；
- 持久 ArtifactVersion；
- Champion/Challenger；
- 独立评测和 EvalReceipt；
- 晋升、观察、限制、拒绝和回滚；
- 持续学习进度和证据 UI。

### 5.3 可替换提供方

- 模型 Provider；
- Web Search / Fetch；
- Python Evaluator；
- 本地、Docker、远程或 microVM 执行器；
- Artifact Store；
- 外部 Agent Worker。

## 6. 最小 Tianwen 插件集合

第一版只定义四个核心插件，不按领域对象拆成微插件。

### `tianwen-control`

- Goal Graph；
- Loop、Task、Run；
- Session/Goal 绑定；
- 预算、停止和恢复调度；
- 任务执行循环与学习更新循环。

### `tianwen-evidence`

- 读取 DSH Session Event；
- 形成 Evidence 和 SourceRecord；
- 脱敏和元循环最小投影；
- LearningSignal 检测；
- 默认不能修改 Goal、版本或权限。

### `tianwen-evolution`

- ArtifactVersion；
- Champion/Challenger；
- EvalRequest/EvalReceipt；
- 晋升门槛；
- Promotion、Rollback 和观察结果。

### `tianwen-ui`

- Goal、Task、Run 和预算展示；
- 来源、证据和不确定性；
- 候选差异和评测；
- 人类晋升、限制和回滚入口。

可选提供方：

- `evaluator-python`；
- `sandbox-container`；
- `explorer-web`。

## 7. 对象映射原则

| 天问对象 | 新架构映射 |
|---|---|
| GoalContract | Tianwen Goal Graph 节点；执行时绑定 DSH GoalRef |
| LoopRecord | Tianwen Control 持有 |
| TaskRecord | Tianwen 权威任务；DSH Todo 仅作 UI 投影 |
| RunRecord | 一次冻结尝试，绑定 Session 活动区间或独立 Session |
| ActionRecord | 主要从 DSH `tool/call` / `tool/result` 投影 |
| RunManifest | 冻结 request/header、Preset、Sandbox 和 Artifact 版本 |
| EvidenceRecord | 引用 Session ID、event seq 和 digest |
| ArtifactVersion | 正式持久 Package 或其他学习对象版本 |
| TrialManifest | 绑定候选、任务、请求快照和评测环境 |
| Champion | Tianwen Registry 的活动版本指针 |
| EvalReceipt | Python 或其他独立评测器的结果 |
| PromotionRecord | Tianwen 独有的正式治理记录 |

以下概念不得错误合并：

- DSH Turn 不等于 Tianwen Run；
- DSH Todo 不等于 Tianwen Task；
- Dynamic Package 不等于正式 ArtifactVersion；
- Agent Preset generation 不等于 Promotion；
- Session Log 不等于跨 Session Tianwen Ledger。

## 8. 两层账本

### DSH Session Log

保存单个 Session 的原始执行事实：

- 输入、输出和工具；
- Goal 变化；
- 请求配置、Prompt 和 Tool Schema；
- 恢复、Fork 和 Compaction；
- Tianwen 同 Session 自定义事件。

### Tianwen Ledger

保存跨 Session 的学习治理：

- Goal Graph；
- Task、Run 和预算；
- Evidence 索引；
- LearningSignal；
- ArtifactVersion；
- EvalReceipt；
- Promotion、Rollback；
- Champion 指针。

原则：

- DSH 已经持有的执行事实不在 Tianwen Ledger 重复保存可变副本；
- Tianwen Ledger 只保存稳定引用、摘要和治理语义；
- 原始用户对话不会默认进入元学习；
- 跨 Session 派生结果必须可追溯回允许用途的最小证据。

## 9. 技术栈

目标分工：

- TypeScript：Runtime 插件、Goal 协调、事件投影、版本治理和 UI；
- Python：评测器、研究、数据分析和暂不值得迁移的学习逻辑；
- JSON/Schema：EvalRequest、EvalReceipt、Evidence 和版本记录的跨语言协议；
- DSH Sandbox：普通任务；
- Docker/remote/microVM：高风险评测的可选强隔离。

现有 Python 代码不立即搬迁或删除。

## 10. 依赖和升级策略

- 锁定精确 DSH 版本、lockfile 和已审计 commit；
- 禁止自动跟随 `latest`；
- 增加薄 `tianwen-dsh-compat` 包，只封装实际使用的易变接口；
- 业务插件不导入 DSH 私有源码路径；
- 每次升级在独立分支执行兼容性合同；
- 升级失败时继续使用旧版本，不阻塞用户。

`tianwen-dsh-compat` 只负责：

- 统一导出实际使用的公开类型；
- 封装 Session/Goal/Tool/Sandbox 入口；
- 记录支持的 DSH 版本；
- 吸收必要的字段或事件兼容变化。

它不能重新抽象整个 DSH。

### 10.1 Windows Profile 安装期的窄例外

主控进程、天问插件、评测 Worker、Agent 工具和运行期子进程继续统一使用
“程序名 + argv 数组 + `shell: false`”。这个规则没有被普遍放宽。

已核对的 npm 发布包 `@deepseek-ai/dsh@0.1.0-rc.6` 在 Windows 执行公开
`dsh plugin ... add` 时，会在其 CLI 内部使用
`spawnSync("pnpm", argv, { shell: true })`。为了继续验证公开 Profile
安装接口，兼容性探针允许这一个上游内部调用，但必须同时满足：

- 只发生在一次性 Profile 安装控制面，不发生在 Agent 执行或学习循环中；
- DSH 版本、lockfile 和 tarball integrity 精确锁定；
- profile 固定为 `tianwen-probe`；
- Windows 探针根目录固定为 `D:\DevData\tianwen-dsh-probe`，不接受
  由用户或模型选择的子目录；
- tarball 由本地构建生成，绝对路径、固定文件名和真实路径均限制在
  该根目录，传给上游 shell 的字符串不得含 shell 元字符；
- 传入参数不包含用户、模型、网页或其他外部不可信内容；
- 使用离线 pnpm、最小环境且不传递模型密钥；
- 天问外层调用仍为 `shell: false`；
- 验证报告分别记录“外层 `shell: false`”和
  “DSH Windows 内部插件安装 `shell: true`”，不得声称整条链路都是
  `shell: false`。

这个例外不授权运行期动态安装、学习资产安装、用户指定 package spec
或模型发起的插件安装。正式产品若要开放这些能力，必须先获得上游
`shell: false` / 可注入绝对 pnpm executable 的公开接口，或重新设计
独立且可审计的安装器。

## 11. 迁移策略

### 阶段 0：封存基线

- 保留 Python 和 Alpha-A 分支；
- 固定当前提交、测试和交接；
- 把 A1–A5 作为迁移验收合同；
- 暂停当前 Runtime 和 Task 10 的新增功能。

### 阶段 1：兼容性探针

- 启动精确 DSH；
- 加载最小 Tianwen Profile；
- 运行离线假模型；
- 验证 Goal、Session Event 和 Windows 沙盒；
- 不调用付费模型或真实 Docker。

### 阶段 2：Evidence Bridge

- 从 DSH Event 生成现有 Evidence；
- 验证恢复不重复；
- 绑定 Run、Session、Event 和摘要。

### 阶段 3：Python A1 Evaluator

- TypeScript 生成请求；
- Python 运行现有 A1；
- Nop/Oracle 和重复性保持；
- 返回绑定候选和任务摘要的 EvalReceipt。

### 阶段 4：版本治理

- Candidate 不影响 Champion；
- 晋升需要独立评测和人类授权；
- 模拟回归后可以恢复旧版本；
- 历史不删除。

### 后续

探针通过后才规划：

- 完整 LearningSignal；
- 多 Goal 和元循环；
- A2–A5；
- UI；
- 真实模型；
- 强隔离评测。

## 12. 兼容性探针完成门

探针至少证明：

1. 模型面向和后台学习入口不能在没有人类授权时静默修改顶层 Goal；拥有底层 Goal Service 能力的插件集合必须受组合边界限制；
2. Goal 恢复后不自动扩大继续权限；
3. DSH Event 可以生成完整、去重、可追溯 Evidence；
4. 工具调用和结果可以稳定配对；
5. A1 Nop/Oracle 和原始 stdout 重复性保持；
6. 候选失败不改变 Champion；
7. 未经评测和授权不能晋升；
8. 回滚不删除失败历史；
9. 普通任务使用 DSH 沙盒；
10. 使用公开插件接口即可完成，变化集中在薄兼容层。

第 10 项允许上述唯一的 Windows Profile 安装期限制，但最终选型必须把
它标记为兼容性债务；如果该限制扩散到 Agent 运行期或动态学习资产安装，
则不视为完成门通过。

## 13. 失败条件

出现任一承重问题时，不正式迁移：

- 必须频繁修改 DSH 核心；
- 无法稳定扩展或读取 Session Event；
- Goal Graph 与 DSH Goal 必须双写且无法防漂移；
- 候选和 Champion 无法隔离；
- Python 评测桥无法稳定取消、恢复和绑定 Run；
- Windows 普通沙盒边界不可接受；
- 为接入 DSH 需要重写大部分持续学习治理；
- DSH 升级无法由兼容层和合同测试约束。
- Windows `shell: true` 成为 Agent 运行、工具执行、用户输入或学习资产
  安装的必要条件。

失败后可选择：

- 保留 Python Runtime；
- 只复用 DSH 的部分能力；
- 重新评估窄 Fork；
- 等待上游接口成熟。

## 14. 当前暂停边界

在兼容性探针设计再次经用户阅读前：

- 不启动 Task 10；
- 不调用真实 Docker；
- 不调用付费模型；
- 不删除、废弃或大规模重构现有 Python；
- 不 Fork DSH；
- 不把 DSH 源码复制进天问仓库；
- 不开始完整 TypeScript 迁移；
- 不将本文标记为已实施架构。

## 15. 被重新评估但不改写的历史文档

以下文档继续保留当时的设计和实施事实：

- `docs/superpowers/specs/2026-08-11-pydanticai-harness-integration-design.md`
- `docs/superpowers/plans/2026-08-12-first-continual-learning-vertical-slice.md`
- `docs/superpowers/specs/2026-08-13-deepseek-v4-pro-live-provider-design.md`
- `docs/superpowers/specs/2026-08-13-real-task-alpha-a-execution-design.md`
- `docs/superpowers/plans/2026-08-13-real-task-alpha-a-execution.md`
- Alpha-A Tasks 1–9 的交接文档。

它们是历史基线，不再自动决定下一实施入口。

## 16. 依据

- `docs/research/2026-08-14-deepseek-harness-source-audit.md`
- `docs/architecture-master-session-memory.md`
- `docs/superpowers/specs/2026-08-13-real-task-alpha-roadmap-design.md`
- `docs/superpowers/specs/2026-08-13-real-task-alpha-a-execution-design.md`
