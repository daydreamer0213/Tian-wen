# 天问学习控制面上游源码审计

**日期：** 2026-08-12

**目的：** 在编写天问首个持续学习垂直切片计划前，核查四个代表性项目的真实源码机制，区分论文或 README 主张与运行时实际保证，并提炼学习控制面的可复用设计。

**范围：** 只读源码审计。未安装这些项目的依赖，未运行模型、游戏或付费评测。测试相关判断来自测试源码覆盖情况，不代表本次执行了上游测试。

## 1. 固定快照

| 项目 | 固定 commit | 快照日期 | 许可证情况 |
|---|---|---|---|
| Microsoft Agent Lightning | `f0a77cfad71e6222a3edb7dfc7a0f611bd231364` | 2026-07-16 | 根目录 MIT |
| Memento-Skills | `e7687d9c14b87c424d39498a1e8e91afd7c57d9f` | 2026-06-12 | README 声明 MIT，但快照缺少根目录许可证正文；复制代码前需确认 |
| Stanford Meta-Harness | `44b9942127847f7421db70d8c7e48407f09a3c70` | 2026-07-11 | 根目录 MIT |
| Continual Harness | `bbab97ad73e460b7cd7c08527d10ced30cc03fbe` | 2026-05-12 | 根目录 MIT |

本地只读快照位于 `D:\DevData\tianwen-research\`，没有放入天问仓库，也不作为项目依赖。

## 2. 总结：四块拼图，没有完整答案

| 项目 | 源码真正擅长的部分 | 源码缺少的关键部分 | 对天问的价值 |
|---|---|---|---|
| Agent Lightning | `Rollout → Attempt → Span → Reward` 轨迹；执行端和学习端解耦；队列、重试、资源注入 | Lesson、Skill 谱系、不可变资产、保护评测、原子晋升、回滚 | 轨迹、评估和学习 Worker 的接口参考 |
| Memento-Skills | Skill 检索和执行；任务内反思、重规划、错误模式、循环和停滞止损 | 跨任务 utility 写回、自动 Skill 修复、版本父子关系、评测门控和回滚 | 任务执行更新循环和 Skill 目录格式参考 |
| Meta-Harness | 外循环候选生成、批量评测、历史档案、部分 Pareto/frontier | 真实隐藏集隔离、候选内容寻址、父版本、生产发布和回滚 | Learning Job、候选搜索和评测接口的正反例 |
| Continual Harness | Prompt、Sub-agent、Skill、Memory 四类可学习对象；周期性 Refiner | 可靠 outcome、独立评测、候选隔离、事务、版本、回滚和多进程一致性 | 学习对象分类和开放阶梯的研究原型 |

共同结论：

> 现有项目可以提供执行轨迹、任务内恢复、候选搜索和可变 Harness 对象，但“把这些部分安全地连接为可验证、可追溯、可回滚的生产持续学习协议”仍需要天问自己实现。

## 3. Agent Lightning：轨迹和训练解耦

### 3.1 真实调用链

```text
Trainer.fit
→ ExecutionStrategy
→ Runner 从 LightningStore claim rollout
→ 创建 Attempt
→ tracer 打开 rollout_id / attempt_id 上下文
→ Agent 执行并产生 spans
→ reward 作为 annotation span 写入
→ Algorithm 查询 rollout 和 spans
→ adapter 派生训练样本或 triplets
→ Algorithm 更新 prompt/resource 或委托外部训练系统
→ 后续 rollout 根据 resources_id 获取资源
```

关键证据：

- Runner 每次 claim rollout 后建立 Attempt，并在 `(rollout_id, attempt_id)` 上追踪执行：
  [`runner/agent.py`](D:/DevData/tianwen-research/agent-lightning/agentlightning/runner/agent.py:639)。
- OTel span 结束时写入 Store：
  [`tracer/otel.py`](D:/DevData/tianwen-research/agent-lightning/agentlightning/tracer/otel.py:455)。
- Reward 不是独立 Rollout 字段，而是 annotation span；最终 reward 由排序后的 span 反向查找：
  [`emitter/reward.py`](D:/DevData/tianwen-research/agent-lightning/agentlightning/emitter/reward.py:148)。
- `Triplet` 是从 span 树重建的派生物，credit assignment 使用启发式：
  [`adapter/triplet.py`](D:/DevData/tianwen-research/agent-lightning/agentlightning/adapter/triplet.py:522)。

### 3.2 可以吸收的设计

- 将一次逻辑运行与重试分成 `TrajectoryRun` 和 `ExecutionAttempt`；
- 原始 Event/Span 是事实层，Trajectory、Credit、Lesson 是可重算或可审查的派生层；
- 执行 Worker 与学习算法通过稳定 Store 接口解耦；
- Reward、成本和工具轨迹独立记录；
- 重试必须产生新的 Attempt，不能改写原执行历史。

### 3.3 不能照搬的部分

`resources_id` 不是不可变快照。`update_resources()` 会原地覆盖内容并增加 version，Runner 在执行开始时读取资源：

- [`store/collection_based.py`](D:/DevData/tianwen-research/agent-lightning/agentlightning/store/collection_based.py:958)
- [`runner/agent.py`](D:/DevData/tianwen-research/agent-lightning/agentlightning/runner/agent.py:639)

因此已排队的 Rollout 可能执行后来版本。天问必须在 Run 创建时冻结：

- Skill version；
- Prompt version；
- Policy version；
- Runtime/Harness version；
- 环境和输入快照。

Agent Lightning 也没有 Lesson、Skill、EvalRun、Promotion、父版本、生产 channel、原子发布和回滚。它适合成为未来可选的学习 Worker 或 tracing adapter，不适合承担天问权威状态。

## 4. Memento-Skills：任务内恢复强，跨任务学习弱

### 4.1 真实调用链

```text
用户任务
→ Agent 规划并发现本地 Skill
→ LLM 选择或搜索 Skill
→ Gateway 执行 SkillAgent
→ ReAct 调用原子工具
→ 错误模式、循环和停滞 hooks 介入
→ 返回 success / partial / failed
→ 上层反思选择 continue / replan / finalize
→ 保存会话状态
→ 不自动更新已执行 Skill
```

关键证据：

- 规划、执行和任务内反思：
  [`core/memento_s/agent.py`](D:/DevData/tianwen-research/memento-skills/core/memento_s/agent.py:306)、
  [`reflection.py`](D:/DevData/tianwen-research/memento-skills/core/memento_s/phases/reflection.py:63)。
- Skill Gateway 与执行：
  [`gateway.py`](D:/DevData/tianwen-research/memento-skills/core/skill/gateway.py:167)。
- 反思只影响当前任务计划，不修改 Skill：
  [`step_boundary.py`](D:/DevData/tianwen-research/memento-skills/core/memento_s/phases/execution/step_boundary.py:33)。

### 4.2 README 与源码的差异

当前快照中：

- 没有 Skill utility 字段或更新函数；
- 搜索 `score` 是关键词/模糊匹配相似度，不是质量；
- 失败只增加当前 Run 的连续失败计数；
- `version` 加载时固定为 `0`，不是版本谱系；
- `create_skill` 是调用普通 `skill-creator` 的约定流程；
- 外部评测脚本没有接入 Runtime 写回；
- `core/skill/builder` 并不存在。

相关证据：

- 固定 `version=0`：
  [`skill_loader.py`](D:/DevData/tianwen-research/memento-skills/core/skill/loader/skill_loader.py:159)。
- LocalRecall 分数：
  [`local_recall.py`](D:/DevData/tianwen-research/memento-skills/core/skill/retrieval/local_recall.py:195)。
- 当前 Run 的失败计数：
  [`tool_handler.py`](D:/DevData/tianwen-research/memento-skills/core/memento_s/phases/execution/tool_handler.py:103)。

因此，Memento-Skills 真正可复用的是：

- `SKILL.md + scripts + references` 的可读目录格式；
- 任务内 reflection/replan；
- 错误模式识别；
- 同结果重复、低信息增益和无进展循环检测；
- artifact 追踪；
- Skill 执行的 preflight 思想。

但这些能力属于执行更新循环，不自动构成跨任务 Skill 学习。

### 4.3 存储与权限风险

- `SkillStorage.save()` 直接覆盖文件，没有父版本、备份和原子 rename：
  [`skill_storage.py`](D:/DevData/tianwen-research/memento-skills/core/skill/store/skill_storage.py:124)。
- `remove_skill()` 直接递归删除目录：
  [`skill_storage.py`](D:/DevData/tianwen-research/memento-skills/core/skill/store/skill_storage.py:271)。
- `allowed_tools` 为空时获得全部工具：
  [`execution/agent.py`](D:/DevData/tianwen-research/memento-skills/core/skill/execution/agent.py:1012)。
- 部分 workspace 外操作只记录警告而不阻止：
  [`sandbox_audit.py`](D:/DevData/tianwen-research/memento-skills/core/skill/execution/hooks/sandbox_audit.py:21)。

天问首版应固定只有 `repo_task` 一个 Skill，不启用 RemoteRecall、市场下载或自动 Skill 扩张。工具权限必须默认拒绝并显式允许。

## 5. Meta-Harness：候选搜索成立，评测隔离不足

### 5.1 真实外循环

```text
Proposer 读取源码和历史
→ 写候选 Python 与 pending_eval.json
→ import / 接口 / smoke 检查
→ 批量运行 validation 或任务集
→ 写 frontier 和 evolution_summary
→ 下一轮 Proposer 读取结果继续搜索
→ 显式 finalization 才运行 test
```

这证明了“完整轨迹和历史候选可以驱动 Harness 搜索”，但它是实验外循环，不是生产发布协议。

### 5.2 最重要的反例：保护集不能靠提示词隐藏

两个 reference proposer 被授予 `Read/Glob/Grep/Write/Edit/Bash`，并在包含源码、数据、日志和结果的示例根目录运行；wrapper 还使用 `--dangerously-skip-permissions`：

- [`text_classification/meta_harness.py`](D:/DevData/tianwen-research/meta-harness/reference_examples/text_classification/meta_harness.py:164)
- [`claude_wrapper.py`](D:/DevData/tianwen-research/meta-harness/reference_examples/text_classification/claude_wrapper.py:115)

Text classification README 也承认 test data 在公开仓库中，只能形成操作纪律上的隔离：

- [`README.md`](D:/DevData/tianwen-research/meta-harness/reference_examples/text_classification/README.md:43)

Experimental Harbor pilot 使用独立 controller 和源码 SHA-256，是更好的方向，但防泄漏主要是字符串黑名单，仍不是安全边界：

- [`controller.py`](D:/DevData/tianwen-research/meta-harness/experimental/harbor_meta_harness/controller.py:144)

天问必须采用不同身份和不同存储：

```text
Learning Job
  可读：允许的开发证据包、公开 schema、父候选、脱敏结果
  不可读：保护集、评测器源码、隐藏答案、发布密钥

Evaluator
  可读：保护集、评测器和候选只读快照
  可写：签名评测结果
  不可写：候选内容

Publisher
  可读：候选 digest、签名 EvalRun、当前 active pointer
  可写：原子 Promotion
```

### 5.3 候选身份缺口

Reference implementation 没有可靠的父子 DAG、内容哈希和重复检测。同名候选覆盖后甚至可能复用旧路径下的 `val.json`：

- [`benchmark.py`](D:/DevData/tianwen-research/meta-harness/reference_examples/text_classification/benchmark.py:485)。

天问每个候选必须内容寻址：

```text
candidate_digest
parent_digest
artifact_type
spec_version
model_and_prompt_version
evidence_bundle_digest
evaluator_version
data_split_version
```

评测缓存键必须包含这些值。

## 6. Continual Harness：学习对象分类正确，在线直接写回危险

### 6.1 真实在线时序

```text
主 Agent 完成一步
→ 写 trajectory_history.jsonl
→ 到固定步数自动触发 Refiner，或 Agent 主动调用 evolve_harness
→ 同一个模型依次改 Prompt / Sub-agent / Skill / Memory
→ 每类对象独立立即写入
→ 下一回合开始使用当前内容
```

相关证据：

- 自动调度和四个 pass：
  [`harness_evolver.py`](D:/DevData/tianwen-research/continual-harness/agents/utils/harness_evolver.py:98)。
- trajectory 写入后触发演化：
  [`PokeAgent.py`](D:/DevData/tianwen-research/continual-harness/agents/PokeAgent.py:2027)。

四种对象的区分值得吸收：

- Prompt：编排和整体行为；
- Sub-agent：带工具和 turn 上限的专门执行角色；
- Skill：可复用说明或代码；
- Memory：事实、位置和策略知识。

但生产实现不能采用“同模型分析后直接覆盖 active 对象”。

### 6.2 证据质量不足

- trajectory 主路径只保存工具名和参数，不保存工具结果；
- failure extractor 却尝试读取 `tool_calls[].result`；
- `outcome` 被硬编码为 `{"success": true}`；
- 不记录可靠 post-state；
- 没有独立 reward、verifier 或保护集。

相关证据：

- [`PokeAgent.py`](D:/DevData/tianwen-research/continual-harness/agents/PokeAgent.py:2924)
- [`harness_evolver.py`](D:/DevData/tianwen-research/continual-harness/agents/utils/harness_evolver.py:166)

这说明“完整且可信的 Trajectory”必须先于任何自动优化。

### 6.3 版本和一致性不足

- 四类 pass 各自 `try/except`，可部分成功，不是事务；
- Prompt 只在内存覆盖，旁路保存快照；
- Store mutation history 不是可激活版本；
- 没有 rollback API；
- 多进程各自持有 JSON store singleton，没有明确 reload、锁或一致性协议；
- checkpoint、trajectory、Prompt 和 Store 不构成同一原子快照；
- Skill code 使用 `exec`，不适合作为线上自生成能力。

因此，天问未来开放 Harness 学习必须经过：

```text
观察
→ 只读建议
→ 候选命名空间
→ 独立评测
→ 原子晋升
→ 低风险灰度
```

## 7. 源码审计后形成的统一设计原则

### 7.1 事实、解释、资产和发布必须分层

```text
TraceEvent        = 真实发生的步骤和结果
RewardAssessment  = 评测者对结果的判定
CreditAssignment  = 哪些动作或资产造成结果的可重算推断
Lesson            = 学习者提出的条件化经验主张
SkillDelta        = 对某个冻结版本的候选修改
EvalRun           = 独立评测结果
Promotion         = 治理层的发布决定
```

不能把“最后一个 reward”“模型反思”或“同一任务重试成功”直接当成 Skill 已经改善。

### 7.2 Run 必须冻结所有行为资产

每个 Run 创建时记录：

- Skill version；
- Prompt version；
- Policy version；
- Harness revision；
- 模型和 Provider；
- 工具集合与权限；
- 环境快照；
- 输入和目标契约版本。

学习更新只影响后续 Run，不能让同一任务中途悄悄换行为版本。任务内反思可以修改局部计划，但不能覆盖稳定资产。

### 7.3 候选是不可变内容寻址资产

Skill 或 Harness 的每次变化生成新 artifact，不原地覆盖：

```text
ArtifactVersion
  artifact_id
  artifact_type
  content_digest
  parent_version_id
  change_set
  evidence_bundle_id
  created_by_learning_job
  requested_permissions
  status
```

`active` 只是指针。回滚是创建新的 Promotion 将指针指回已验证版本，不改写历史。

### 7.4 学习、评测和发布是不同身份

隔离不能只靠角色提示词：

- Learning Job 不能读取私有保护集；
- Evaluator 不能修改候选；
- Publisher 不能自己改变门槛；
- 候选不能修改 Action Gateway、权限、评测器、账本或回滚器；
- 正式结果使用 append-only 记录和 digest 绑定。

### 7.5 任务内恢复和跨任务学习分开

任务内恢复包括：

- 重试；
- 换方法；
- 重规划；
- 循环和停滞检测；
- 请求用户信息；
- 在当前 Run 内保存临时 working memory。

跨任务学习包括：

- 从多个 Run 归因；
- 形成 Lesson；
- 生成 Skill/Harness 候选；
- 独立评测；
- 晋升、灰度、停用和回滚。

两者可以共享 Event，但不能共享直接写入稳定资产的权限。

## 8. 首版建议的数据骨架

```text
TrajectoryRun
  trajectory_id, run_id, goal_id, task_id
  input_snapshot_id, environment_version_id
  skill_version_id, prompt_version_id, policy_version_id
  status, started_at, finished_at

ExecutionAttempt
  attempt_id, trajectory_id, ordinal
  lease_id, worker_id, status, failure_kind, heartbeat_at

TraceEvent
  event_id, attempt_id, ordinal
  trace_id, span_id, parent_span_id
  event_type, payload_ref, payload_digest, observed_at

RewardAssessment
  assessment_id, trajectory_id
  evaluator_version_id, dimensions, gate_result, evidence_refs

CreditAssignment
  credit_id, assessment_id, target_refs
  method, algorithm_version, confidence, rationale_ref

Lesson
  lesson_id, claim, when_conditions
  evidence_refs, counterexamples, confidence
  helpful_count, harmful_count, status

ArtifactVersion
  artifact_version_id, artifact_type
  content_digest, parent_version_id
  change_set_ref, evidence_bundle_id
  permissions_manifest, status

EvalRun
  eval_run_id, artifact_version_id
  suite_version_id, evaluator_version_id
  reproducibility_manifest, metrics, gate_result

Promotion
  promotion_id, artifact_version_id
  prior_active_version_id, eval_run_ids
  channel, decision, published_at, rollback_of
```

首个切片中 `ArtifactVersion.artifact_type` 只允许 `repo_task_skill`。Prompt、Policy、Harness 和模型参数先存在于模型中，但学习循环无权生成这些类型的候选。

## 9. 三种可选学习控制面路线

### 路线 A：单体学习服务

同一进程中实现 Learning Job、Evaluator 和 Publisher，仅用模块和数据库权限区分。

优点：

- 实现最少；
- 首版调试简单；
- 适合单机 SQLite。

缺点：

- 隐藏评测隔离较弱；
- 模型 Worker 和评测数据仍容易共享进程权限；
- 后续拆分需要迁移接口。

### 路线 B：逻辑单体、物理隔离 Worker

天问控制面和数据库保持单机应用；Learning Worker、Evaluator Worker 和 Runtime Worker 使用独立进程、独立工作目录和能力令牌，通过受限命令或本地 API 交互。

优点：

- 保留首版工程可控性；
- 能形成真实的权限和数据隔离；
- 易于测试 crash、重试和回滚；
- 未来可以把 Worker 迁移到容器或远程执行。

缺点：

- 比路线 A 多一些协议和调度工作；
- 需要明确 lease、幂等、outbox 和资源清理。

### 路线 C：训练平台式分布式控制面

从第一版开始采用类似 Agent Lightning 的 Store、队列、Trainer、Runner、独立数据库和模型服务。

优点：

- 扩展性强；
- 适合大量并行 rollout 和模型训练。

缺点：

- 对首个 `repo_task` Skill 过重；
- 引入 Mongo、服务编排和训练平台复杂度；
- 容易先建设平台而不是验证持续学习闭环。

## 10. 推荐路线

推荐路线 B：**逻辑单体、物理隔离 Worker**。

具体含义：

- 一个天问控制面掌握 Goal、Run、Event、Lesson、Artifact、EvalRun、Promotion 和权限；
- Runtime Worker 只执行冻结版本；
- Learning Worker 只读允许的 Evidence Bundle，只写候选 Artifact；
- Evaluator Worker 挂载保护集和只读候选，只写签名 EvalRun；
- Publisher 是确定性程序，只根据固定门槛和 EvalRun 做 compare-and-swap；
- 首版都可以在同一台机器、同一个 Python 项目中运行，不需要微服务或 Mongo；
- Worker 进程隔离和目录/令牌边界从第一版就真实存在。

这一方案同时吸收：

- Agent Lightning 的执行/学习解耦；
- Memento-Skills 的任务内恢复；
- Meta-Harness 的候选外循环；
- Continual Harness 的多类学习对象；
- 天问已有的目标主权、Action Gateway、Champion/Challenger 和回滚。

## 11. 仍需用户确认的设计问题

源码审计后，真正影响首版规格的剩余选择已经很少：

1. 首次成功候选晋升是否必须人工确认，还是满足所有硬门槛后自动晋升到仅供影子运行的 channel；
2. 首版是否把 CreditAssignment 做成独立表，还是先作为 Lesson 内部字段；
3. 首版私有保护集由仓库内加密/隔离目录管理，还是由仓库外测试包提供；
4. 首版是否实现真正的多进程 Worker，还是先用同进程接口加独立临时目录模拟隔离。

推荐答案分别是：

1. 自动进入 `shadow`，首次进入 `active` 必须用户确认；
2. CreditAssignment 作为独立对象，因为归因是可重算推断，不应与 Lesson 混在一起；
3. 私有保护集放在天问源码仓库之外，由 Evaluator Worker 的独立目录提供；
4. 实现本机多进程 Worker，不只模拟隔离；这是验证天问差异化治理的必要部分。

## 12. 最终判断

定向源码审计没有推翻天问现有方向，反而把它的原创边界变得更清楚：

- 上游框架已经能记录轨迹；
- 上游 Agent 已经能在当前任务内反思和恢复；
- 上游研究已经能搜索 Prompt、Skill 和 Harness 候选；
- 上游原型已经证明多类外部资产可以在线变化；
- 但它们普遍没有把可信证据、条件化 Lesson、不可变版本、隐藏保护集、权限隔离、原子晋升和真实回滚统一起来。

这正是天问学习控制面应承担的核心工作。
