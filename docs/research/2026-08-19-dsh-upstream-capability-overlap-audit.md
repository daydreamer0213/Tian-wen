# DSH upstream 能力重叠审计

**日期：** 2026-08-19
**性质：** `writing-plans` 前的只读边界校准，不是实施计划
**Upstream 唯一权威：** <https://github.com/deepseek-ai/deepseek-harness>
**审计提交：** `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`
**Upstream 根版本：** `0.1.0-rc.7`
**本项目产品基线：** `main@c00699b78c1ba0d6b963f543e817bb244b3362bb`

## 结论先行

DSH upstream `master` 已经从本项目固定的 rc.6 明显前进。除本项目已经使用的 Agent、Loop、Goal、Session、Tool、Sandbox 外，rc.7 还公开提供 Session Query、Skill provider/catalog/loader、后台 Jobs、Session-local Schedule、动态 Workflow、Message Feedback、Plan、Todo、权限/交互，以及 opt-in 的运行时 Cordis 扩展。

因此 Tianwen 不应再规划这些通用组件。正式产品仍应只有一个 Agent Runtime：DSH。Tianwen 的最小差异化范围应收缩到跨 Run 的长期 Goal、从 DSH Session 投影的 Evidence、学习归因，以及 Candidate/Evaluation/Shadow/Promotion/Rollback 治理。

三个特别核实结论：

1. **DSH Goal 仍是 same-session Goal。** 它持久化在所属 Session log 中，恢复后可以继续同一 Session，但不等于跨 Task/Run/Session 的长期 Goal Graph。
2. **DSH runtime extensions 不只是两个字面上的 mount/unmount 动词。** 它还支持 inspect、define、run、stop、undefine 和进程内不可变版本；但其权威状态只在当前进程内存中，没有自动 save、install、promote 或重启恢复。
3. **DSH 没有通用、正式、完整的 `Evidence → Case → Attribution → Lesson → Candidate → Eval → Shadow → Promotion → Rollback` 产品闭环。** upstream 有一个单独维护 `dsh-code-review` skill 的私有、人工流程提案，但它不在产品 Runtime 内、实现不在仓库内、仅服务一个 skill，且最终仍通过人工 draft PR 和仓库评审晋升。

这份审计不授权升级到 rc.7。版本升级仍需单独做公开 API、closure、Windows、headless 和行为兼容性验证。

## 1. 证据口径

### 1.1 Upstream 锁定

2026-08-19 通过官方远端执行：

```text
git ls-remote https://github.com/deepseek-ai/deepseek-harness.git refs/heads/master
```

结果是：

```text
99f6f02fecdb7dff40c3fbc9470f5907c29f74ca  refs/heads/master
```

该提交是官方 rc.7 release merge；[提交页](https://github.com/deepseek-ai/deepseek-harness/commit/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca)和[根 `package.json`](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/package.json#L1-L4)都指向 `0.1.0-rc.7`。

所有 upstream 源码链接都固定到该 SHA，不引用会移动的 `master` 页面。审计读取官方仓库的 package manifests、公开 README、生成的 subsystem API 文档和公开源码；没有使用第三方解读。

### 1.2 本项目实际固定状态

本项目根 [`package.json`](../../package.json#L20-L37)仍精确固定 `@deepseek-ai/dsh*` `0.1.0-rc.6`。实际产品 TypeScript 组合包括：

- [`@tianwen/dsh-compat`](../../packages/tianwen-dsh-compat/src/index.ts) 对 rc.6 Agent、Loop、Goal、LLM、Session、JSONL persistence、Tools、Sandbox 和 Dynamic Cordis runner 的公共面再导出；
- [`@tianwen/runtime`](../../packages/tianwen-runtime/src/index.ts) 当前只挂载 Evidence 与 Evolution，并显式拒绝非 rc.6；
- [`@tianwen/evidence`](../../packages/tianwen-evidence/src/projector.ts) 从 `tool/call`、`tool/result` 投影最小 Evidence；
- [`@tianwen/evolution`](../../packages/tianwen-evolution/src/index.ts) 暴露 Artifact、Evaluation、Champion 与治理账本；其 runtime binding 当前借用 rc.6 Dynamic Cordis runner；
- `runtime-bundle`、`profile-host`、`dsh-host` 和 probe bundle 负责 rc.6 Profile/headless/CLI 组合与验证。

本项目还没有固定或使用 rc.7 的 Session Query、Skill、Jobs、Schedule、Workflow、Feedback、Plan 或 User Questions 包。不能因为 upstream 源码存在就假装本地 rc.6 已经具备这些公共 API。

### 1.3 已批准产品边界

已批准的[产品 Runtime 边界重置设计](../superpowers/specs/2026-08-19-tianwen-runtime-boundary-reset-design.md)继续决定高层原则：DSH 是唯一正式 Agent Runtime，Python Alpha 是实验室，Tianwen 只做长期治理和公开 seam 上的薄接。

本审计修正的是组件清单，不推翻“一套 Runtime”原则。rc.7 证明更多能力应归 DSH，而不是证明 Tianwen 需要更大的 adapter。

## 2. Upstream 能力事实

### 2.1 Agent、Loop、Tool 与 Session 事实流

DSH 使用 Cordis plugin tree；模型 adapter、Tool registry、Session log 和 Agent Loop 都是可替换 plugin，而不是需要 Tianwen 包裹的私有内核。[架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/architecture.md#L9-L25)明确了该组合方式。

一次 step 包含一个模型请求及其工具调用；Tool call/result、assistant message 和 turn/step 边界都写入 durable Session Event。[官方 turn flow](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/architecture.md#L63-L96)已经覆盖 observe → request → tool feedback → continue/finish，以及“model-visible means logged”。

结论：Tianwen 不应增加第二 Agent Loop、request runner、Tool pipeline、MCP registry、普通 Sandbox、finalization hook 或 Session event framework。

### 2.2 Goal 与 round

公开文档标题和源码模块都直接称为 [Same-session goals](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/subsystems/goal.md#L1-L5)。Goal 的 durable mutation 是所属 Session 中的 `goal/change`，激活权则是 process-local。

Goal round driver 在 Agent idle 时继续同一 Session，并明确列出：

- 没有独立 evaluator；
- 只做 same-session execution；
- round cap 不是 token、金钱或时间预算；
- 异常失败不自动重试。

证据见 [goal-round-driver limitations](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/packages/goal/goal-round-driver/README.md#L58-L64)。

结论：当前 Session 的 Goal/round 直接复用 DSH；跨 Session 的 Goal Graph、Task/Run 选择与进展聚合仍不是 DSH Goal。

### 2.3 Session persistence、query、projection 与 compaction

DSH Session 是 append-only event log，模型历史从 log 派生；它支持 live fork、resume、crash repair 和 durable flush。rc.7 同时提供：

- JSONL 和 SQLite 两种 persistence provider；[两者共享一个公开 seam](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/subsystems/persistence.md#L231-L250)；
- live-preferred Session Query，可 list/read/filter/search Session 和 Event，读取 surface，追踪 lineage、replacement 和 source event；[公开 API](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/subsystems/session-query.md#L369-L489)；
- Session Projection registry/cache，用增量 fold 构建派生状态；
- 自动或手工 Compaction，包含 pressure、context-overflow、summary 和 tool-result pruning；[Compaction seam](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/subsystems/compaction.md#L60-L86)。

结论：Tianwen 不建设 Session DB、query engine、compaction、transcript、resume、fork 或 projection framework。Evidence 只读取这些公开事实并保存 Tianwen 特有绑定。

### 2.4 Skill provider、catalog 与 loader

rc.7 的 Skill family 已包含：

- `ctx.skills` Service Definition；
- local filesystem provider；
- 可选 bundled badge provider；
- model-facing catalog 与 `skill` tool Consumer。

Provider 可以是 local、embedded、remote 或其他来源；公开接口有异步 `list()` 和按 candidate `get()`，并支持 scope layer、invalidation、incomplete snapshot 与 cwd-sensitive lookup。[官方 provider contract](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/subsystems/skills.md#L5-L17)已经覆盖这些职责。

Consumer 在 Session 中发布可见 catalog，加载时再读取完整 body，并把 tool result 回到模型。[catalog/loader contract](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/subsystems/skills.md#L229-L235)还处理更新、删除、compaction 后恢复和权限策略。

结论：Tianwen 不再规划 Skill loader、目录扫描、catalog、watcher、provider registry 或 model-facing skill tool。Tianwen 只保留“为未来 Run 选择并冻结哪个已治理版本”的语义，并通过 DSH provider/preset 薄接。

### 2.5 Jobs、Schedule 与 Workflow

`ctx.jobs` 是通用后台任务 seam；local provider 提供 owner authorization、start/read/list/wait/kill 和 completion delivery。它当前是进程内实现，重启后记录消失，[官方限制](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/packages/jobs/jobs-local/README.md#L31-L34)明确把 durable backend 留给另一 provider。

Schedule 把提醒写成 Session Event，并在原 live Session 空闲时用普通 follow-up 交付。它只支持 delay、absolute time 和固定间隔，不是冷 Session scheduler、外部通知或 calendar cron；[官方限制](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/packages/schedule/schedule/README.md#L109-L116)明确了边界。

Workflow 是公开 `ctx.workflowEngine` seam；worker-thread provider 运行 model-written orchestration script，并通过 subagent seam 启动 child agents。[官方定义](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/subsystems/workflow.md#L1-L9)说明它是可选能力，不修改 Agent Loop。

结论：普通运行内后台工作、提醒、并行/流水线/子 Agent 编排复用 DSH。跨 Run Learning Ticket 的 durable 状态和治理优先级不是 Jobs/Schedule/Workflow 的同义词。

### 2.6 Feedback、Plan、Todo 与 interaction

rc.7 提供：

- Message Feedback sidecar，针对 persisted Session 中单条 assistant message 保存 positive/negative 和 note；它明确[不做 telemetry handoff](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/subsystems/feedback.md#L1-L5)；
- Plan Mode：每 Agent 的 logged collaboration state、指导段、`exit_plan_mode` 和 `/plan`，但它只是 soft guidance，Sandbox/Approval 独立执行；[官方边界](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/subsystems/plan.md#L1-L17)；
- `todo_write`：当前 Agent Session 的整表替换 Todo，写入 `todo/write` Session Event；它明确是 single-session owner；[Todo contract](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/packages/todo/tool-todo/README.md#L5-L15)；
- User Questions provider seam；
- Approval service、fail-closed outcome、per-session `ask`/`never` policy 和 `approval/asked`/`approval/decided` audit pair。[Approval contract](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/subsystems/approval.md#L1-L33)。

结论：Tianwen 不建设第二套 Plan、Todo、反馈 UI、问答或审批框架。Tianwen 特有的权限边界只应在 DSH `tools/pre-execute` / approval seam 上返回窄决定；Feedback 进入学习前仍需 Tianwen 归因，不能把 thumbs-down 直接当 Lesson。

### 2.7 Runtime self-modification extensions

公开工具实际是 `cordis_inspect`、`cordis_define`、`cordis_run`、`cordis_stop`、`cordis_undefine`。`define` 只记录并做语法检查，`run` 才激活 Host/Client half。[官方工具说明](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/packages/extensions/tool-cordis/README.md#L7-L17)表明它比字面 mount/unmount 多了 inspect 与 versioned definition。

但同一文档明确：Dynamic packages 只在共享 DSH 进程内存中；不创建 Plugin 文件、不安装 package、不修改 `cordis.yml` 或配置、不跨重启、不能自动 promote。[权威存储边界](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/packages/extensions/tool-cordis/README.md#L19-L23)和 Host runner 的[storage stance](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/packages/extensions/cordis-host-runner/README.md#L26-L32)一致。

结论：只在部署明确启用该工具集时复用它做临时、当前进程实验；不得把它误称为 durable Candidate registry、Promotion 或未来 Run 的 Champion 安装器。当前 `@tianwen/evolution/runtime-binding` 通过 Dynamic Cordis 立即激活的方向不应直接迁移到新产品边界。

### 2.8 是否存在完整持续学习闭环

没有发现通用产品包、公开服务或正式 API 实现完整链条。支持该判断的正反证据是：

- Goal round driver 明确“没有独立 evaluator”；
- Ralph workflow 的 completion 是 worker self-declaration，并明确把 evaluator/verifier 留到以后；[Ralph limitations](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/packages/workflow/tool-ralph/README.md#L86-L93)；
- exact SHA 的公开 package names 中没有 Evidence、Case、Attribution、Lesson、Evolution、Champion、Shadow、Promotion 或 Rollback service package；
- 全仓词项审计中 `evolution`、`champion` 没有产品命中；`eval` 是代码求值等通用词；`shadow` 多为 registry shadowing；`rollback` 多为事务/teardown；这些不能拼成学习闭环；
- upstream 确有 `dsh-code-review` skill 的周期维护说明。其 Agent Note 状态是 `proposed`，目标是“不引入 webhook、durable event state 或自动 repository promotion”；[问题与提案](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/.agents/notes/proposed/process/2026-07-13-human-review-skill-maintenance.md#L1-L13)；
- 该机制由单一维护者的私有仓库外工具执行，保存本地 candidate bundle，最终由人工 helper 开 draft PR；实现和凭据明确不在仓库中。[classification/promotion/ownership](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/.agents/notes/proposed/process/2026-07-13-human-review-skill-maintenance.md#L39-L55)。

所以准确结论不是“DSH 从未探索学习”，而是“DSH rc.7 没有可供 Tianwen 直接复用的通用正式持续学习产品闭环”。

## 3. 统一分类矩阵

每一行只使用一个结论。混合能力拆成多行，避免用一个标签掩盖不同所有权。

| 能力项 | 结论 | 依据与边界 |
|---|---|---|
| 模型 provider、Agent、Loop、step/turn | `REUSE_DSH` | rc.7 正式 Runtime spine；Tianwen 不包请求循环 |
| Tools、MCP、结果回传、普通 Sandbox | `REUSE_DSH` | 使用 DSH registry、pipeline、provider 和 policy |
| 当前 Session 的 Goal/round | `REUSE_DSH` | durable same-session Goal，不另建单轮 loop |
| 跨 Task/Run/Session 长期 Goal Graph | `TIANWEN_UNIQUE` | DSH Goal 明确只在 owning Session 内 |
| 长期 Goal 到下一 DSH Task/Run 的绑定 | `THIN_TIANWEN_ADAPTER` | 只创建/绑定 DSH Session、GoalRef 和冻结 manifest |
| Session event、resume、fork、persistence | `REUSE_DSH` | JSONL/SQLite 和公共 Session seam 已存在 |
| Session query、search、projection、compaction | `REUSE_DSH` | rc.7 已有公开服务和 provider |
| Session Event → Tianwen Evidence 投影 | `THIN_TIANWEN_ADAPTER` | 单向读取；不复制可变执行历史 |
| Evidence provenance、purpose、Goal/Task/Run 绑定 | `TIANWEN_UNIQUE` | DSH 有事实流但没有 Tianwen 治理语义 |
| Skill provider/catalog/loader/watcher/tool | `REUSE_DSH` | rc.7 完整 capability family |
| Champion/Overlay/Skill 的跨 Run 选择与冻结 | `TIANWEN_UNIQUE` | 决定未来 Run 使用哪个已治理版本 |
| 把冻结选择暴露给 DSH provider/preset | `THIN_TIANWEN_ADAPTER` | 只走公开 Skill/Profile/Preset seam |
| 当前 Run 的 background job 控制 | `REUSE_DSH` | `ctx.jobs` + model-facing job tools |
| 跨 Run durable Learning Ticket | `TIANWEN_UNIQUE` | 不等于 process-local Job record |
| 当前 live Session 的提醒/固定间隔 | `REUSE_DSH` | DSH Schedule 已有 durable Session record |
| 冷 Session/跨 Goal 的通用 cron scheduler | `DEFER` | 当前产品切片不需要；不要为“以后可能”新建 |
| 当前 Run 的 dynamic workflow/subagent 编排 | `REUSE_DSH` | `ctx.workflowEngine` 已覆盖 |
| Message Feedback 存储与 UI | `REUSE_DSH` | rc.7 sidecar 已有 CAS 与 persisted target 校验 |
| Feedback/Evidence → Attribution/Signal | `TIANWEN_UNIQUE` | DSH 明确不做 telemetry/learning handoff |
| 当前 Run Plan Mode 与 Todo | `REUSE_DSH` | DSH 已有 logged state/tool/UI |
| User Questions、Approval、permission presets | `REUSE_DSH` | 复用 fail-closed decision 与 audit pair |
| Tianwen 冻结授权边界到 effect 前决策 | `THIN_TIANWEN_ADAPTER` | 在 DSH `tools/pre-execute`/approval 上薄接 |
| 临时 runtime Cordis inspect/define/run/stop | `REUSE_DSH` | opt-in composition、process-local；沿用 DSH 工具权限 |
| 通用自动 save/install/self-promote extension | `DEFER` | DSH 明确没有；Tianwen 也不补建第二插件平台 |
| Learning Signal/Ticket/Case/Attribution/Lesson | `TIANWEN_UNIQUE` | upstream 没有通用正式 domain/service |
| Candidate 与独立 Evaluation | `TIANWEN_UNIQUE` | DSH worker report 不是独立认证 |
| Shadow/Promotion/Champion/Rollback ledger | `TIANWEN_UNIQUE` | upstream 没有通用产品闭环；只影响未来 Run |
| Python Alpha Runtime/RepoTaskRuntime | `DEFER` | 保持实验室，不进入产品 Runtime |
| Docker 高风险评测 provider | `DEFER` | 不作为普通 Runtime；当前不进入 Candidate 阶段 |

## 4. 删除或不再规划的重复组件

以下内容应从后续产品计划中删除，而不是改名后继续建设：

| 不再规划 | 直接替代 |
|---|---|
| Tianwen Agent loop、request fuse、finalization wrapper | DSH Agent Loop 与公开 lifecycle hooks |
| Tianwen Tool/MCP registry、tool result feedback bus | DSH `ctx.tools` 与 Session Event |
| Tianwen Session、resume、fork、recovery、compaction | DSH Session/Persistence/Compaction |
| Tianwen Session DB、query/search/projection framework | DSH Session Query/Projection |
| Tianwen Skill loader、目录扫描、catalog、watcher | DSH Skill family |
| Tianwen 通用 background-job controller | DSH Jobs；需要持久 provider 时先扩 DSH seam，不造平行 API |
| Tianwen workflow DSL、subagent orchestrator | DSH Workflow/Subagent |
| Tianwen Plan、Todo、Feedback UI、User Questions | DSH 对应子系统 |
| Tianwen 通用 approval/permission framework | DSH Approval、permission presets、tool hooks |
| Tianwen 通用 runtime self-modification engine | DSH 临时 Cordis extensions；durable 自修改当前不做 |
| 运行中热换 Champion 的 Dynamic Cordis binding | 当前 Run 冻结；新 Champion 只供未来新 Run |
| 继续扩张 `@tianwen/dsh-compat` 为第二 Runtime façade | 仅保留升级期最小公共 API 适配与版本断言 |

## 5. Tianwen 应保留的最小差异化组件

| 最小组件 | 保留原因 | 与 DSH 的接口 |
|---|---|---|
| Long-term Goal Graph | 跨 Task/Run/Session 的目标、依赖和进度 | 创建未来 DSH Run 并绑定 Session/GoalRef |
| Run Manifest / frozen selection | 固定 Champion、Skill/Overlay、权限与验收标准 | DSH Profile/Preset/Skill provider/config |
| Evidence projection | 把 DSH durable facts 绑定到 Tianwen Run | Session Event/Query/Projection 只读 seam |
| Evidence provenance/governance | 来源、用途、隐私、保留与稳定引用 | 不回写 DSH 成功结果 |
| Learning intake | Signal、Ticket、Case、Attribution、Lesson | 默认后台/延后；普通 Run 不等待 |
| Version governance | Candidate、独立 Eval、Shadow、Promotion、Rollback | 只改变未来 Run 的 frozen selection |
| Effect authorization policy | Tianwen 特有 Goal/权限边界判断 | DSH effect 前 hook；返回明确 deny/ask/allow |

对现有 TypeScript 包的最小处置建议：

- `@tianwen/evidence`：保留方向，但改为 rc.7 Session Query/Projection 之上的薄投影，不扩成 Session framework。
- `@tianwen/evolution`：保留 append-only 治理账本概念；`runtime-binding.ts` 的即时 Dynamic Cordis activation 不迁移，未来改成“写未来 Run 可选版本”，且要等 Candidate 阶段单独设计。
- `@tianwen/runtime`：未来只组合薄 adapter 和 Tianwen 特有服务；不继续再导出 DSH 通用能力。
- `@tianwen/dsh-compat`：只作为版本迁移期的最窄兼容层；rc.7 API 稳定后优先直接公共 import，不形成永久镜像。
- `runtime-bundle` / `profile-host`：升级时先判断 DSH rc.7 原生 Profile/headless/SDK 是否已替代每个自定义入口；无 Tianwen 特有逻辑的入口删除。
- Python `src/tianwen`、`@tianwen/evaluator-python`：继续作为 Alpha/评测实验资产，不作为正式 Runtime 或 rc.7 缺口补丁。

## 6. 对暂停计划的影响

现有未跟踪的 816 行 Phase 0/1 计划是在 rc.6 能力图上起草的，不能提交或执行。它至少需要在新的边界决定后重写，而不是增补一个 rc.7 附录。

重写前的最小前置门应是：

1. 单独批准是否从 rc.6 升级到 exact rc.7 或更晚的固定 release；
2. 对升级目标做公共 API、package closure、Windows、headless、Session 格式和已有 Tianwen package compatibility probe；
3. 证明 DSH 原生 Skill/Session Query/Jobs/Workflow 等能力满足需要；
4. 只对真实缺口保留 Tianwen thin adapter；
5. 再决定原 Phase 0/1 是重写还是废弃。

这不是新实施计划，也不授权现在执行任何一步。

## 7. 最终边界判断

批准边界的主结论仍成立，但组件矩阵必须按 rc.7 收缩：

```text
DSH：执行、Session、查询、Skill、Job、Schedule、Workflow、交互
  ↓ 公开事件 / provider / hook / profile seam
Tianwen：长期 Goal、Evidence 绑定、学习归因、未来版本治理
```

不能把 DSH 的 Session Goal 当长期 Goal Graph；不能把 Dynamic Cordis 临时内存 package 当 Candidate registry；不能把 Message Feedback 当 Attribution；不能把 worker completion 当独立 Evaluation；也不能因为 upstream 的单技能私有维护提案存在，就声称 DSH 已交付通用持续学习产品闭环。

## 8. 自审记录

- **事实：** SHA 由官方远端重新读取；根版本由 exact SHA 的 package manifest 核对。
- **源码/文档：** 关键判断都链接到 official repository 的 exact-SHA permalink。
- **分类一致性：** 每项只使用 `REUSE_DSH`、`THIN_TIANWEN_ADAPTER`、`TIANWEN_UNIQUE`、`DEFER` 之一；混合职责拆行。
- **负面结论：** “无完整闭环”同时检查 package names、公开 service/API、关键词语义和唯一相近的私有维护提案，没有用单次 `rg` 无命中代替结论。
- **范围：** 未提出依赖升级、实现步骤、新 framework、Candidate 或 Alpha 工作。
- **本地状态：** 未修改生产代码、测试、main 或 Alpha dirty worktree；未运行 Docker、Provider、安装器或付费请求。
