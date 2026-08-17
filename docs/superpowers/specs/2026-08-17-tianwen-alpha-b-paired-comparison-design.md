# Tianwen Alpha-B 公平成对比较设计

日期：2026-08-17  
状态：已批准架构下的实施设计  
范围：Alpha-B 比较设施，不包含 Candidate 生成、晋升、Shadow 或 Runtime 修改

## 1. 结论

Alpha-B 复用现有 Alpha-A 的 A1–A5 任务包、独立工作区、`AlphaTrialRunner`、模型预算、工具政策和最终验证器，只增加三个窄能力：

1. 单个 Trial 可以显式绑定一个已经存在且不可变的 repo-task `ArtifactVersion`；
2. 两个 Trial 在任何模型请求前生成并核对不含随机 Goal/工作区值的同条件摘要；
3. 两腿完成后形成可审计的成对结果，并按冻结顺序做确定性重复汇总。

第一条离线证明链使用 A1 和 fake model/fake Docker。它证明比较设施本身，不声称 Stage A 成功，也不调用付费模型或真实 Docker。

## 2. 既有能力与最小缺口

现有实现已经提供：

- A1–A5 冻结任务、输入、轮次、检查器、镜像和最终验证器；
- 每个 `prepare()` 创建新的 trial id、Goal 状态库和 Git 工作区；
- `TrialManifest` 冻结模型、预算、任务、Skill、政策、工具、基线和验证器；
- `TrialResult` 记录正确性、安全边界、Token、工具调用和时间；
- 每腿独立执行最终验证器，验证不可用时诚实返回不确定。

当前只有三个真实缺口：

- `prepare()` 只能取隔离 App 的 active Champion，不能显式运行 Challenger；
- 顶层 manifest 含随机 Goal id、确认时间、prompt 和工作区标识，不能直接用来判断两腿是否同条件；
- 没有 pair authority、pair result 和重复汇总。

因此本阶段不重建 task runner、workspace builder、evaluator、Runtime 或 governance store。

## 3. 采用与拒绝的方案

### 3.1 采用：Python Alpha 层的薄成对比较器

在 `src/tianwen/alpha.py` 增加显式行为版本选择和纯条件快照，在新的 `src/tianwen/alpha_comparison.py` 增加成对 authority、结果投影与重复汇总。

这样可以直接复用 Alpha-A 已验证的实际 Trial manifest/result，且能在首个模型请求前拒绝不公平配置。

### 3.2 拒绝：在 TypeScript/DSH Runtime 中新增成对调度器

这会在已经冻结的 Runtime 中重复建设 Python Alpha runner 的任务执行、工作区和验证器能力。现有 TypeScript Evidence/Evolution 仍保持稳定，等 Alpha-C/Alpha-D 有明确投影或晋升需求时再接入。

### 3.3 拒绝：只比较最终回执或改造旧通用 evaluator

只看最终分数无法证明两腿使用相同模型、预算、工具、基线和独立工作区。现有 `run_public_comparison` 只比较 case outcome，不绑定 Trial authority；把它扩成 Alpha-B 会混合两种职责。

## 4. 数据与接口

### 4.1 显式 Trial 行为版本

`AlphaTrialRunner.prepare()` 增加可选的显式 `ArtifactVersion` 参数；省略时完全保持 Alpha-A 的 active Champion 行为。

显式版本必须满足：

- `artifact_id == "repo-task"`；
- `artifact_type == "repo_task_skill"`；
- `content_digest` 与 UTF-8 内容摘要一致；
- 状态是当前 `ACTIVE` Champion，或父版本为当前 Champion 的 `CANDIDATE`；
- 同一隔离 store 中若已有同 id 对象，内容必须完全相同。

Candidate 仅作为调用方明确提供的不可变实验输入写入该 Trial 的隔离 store。本阶段不生成 Candidate、不移动 active pointer，也不创建晋升资格。

`PreparedTrial` 继续使用已有的 `champion_version_id/champion_digest` 字段承载“本腿实际执行版本”。本切片不做破坏性 schema 改名；pair manifest 会用明确的 `champion`/`challenger` 角色消除歧义。

### 4.2 运行前条件快照

`AlphaTrialRunner.condition_snapshot(prepared)` 返回冻结模型 `AlphaTrialConditionSnapshot`。它只能来自已准备 Trial 的真实配置，并包含：

- task id/version、task bundle、model input、round order；
- objective、acceptance、每轮 instruction/feedback/public checks、authorization；
- 完整 `BudgetLimit`；
- model id、脱敏 model settings、provider name/base URL/config、Pydantic AI/harness 版本；
- image manifest/platform、container config、named checks、final verifier；
- baseline tree digest；
- 每轮纯 policy 和 tool contract snapshot/digest。

条件快照明确不包含：

- Skill version/content digest；
- trial id、Goal id、confirmation、evidence packet；
- prompt digest；
- 工作区路径或 workspace digest；
- 创建时间。

这些排除项中，Skill 是实验变量；其余是两腿隔离带来的预期差异。逐轮 policy/tool 直接复用 `alpha_runtime_manifest_digests()`，但不纳入其中必然不同的 workspace digest。

### 4.3 Pair authority

`prepare_pair_authority()` 接受 Champion/Challenger 两个 `PreparedTrial`、对应 runner、`repeat_index` 和冻结执行顺序，返回不可变 `PairedComparisonManifest`。

它必须在任何模型请求前同时检查：

- 两个条件快照完全相等，且 common condition digest 相同；
- 两腿 task 相同；
- 两个 trial id 不同；
- 两个工作区解析路径不同；
- 两个 Skill version/digest 不同；
- 执行顺序恰好各含一次 `champion` 和 `challenger`；
- repeat index 是正整数。

已知不公平、未隔离或角色无差异时直接抛出 `AlphaComparisonError`，调用方不得开始模型请求。

pair id 由 schema、repeat index、冻结顺序、两腿 trial id/version/digest 和 common condition digest 内容寻址生成。Pair manifest 只授予比较 authority，不授予新工具、写入范围或预算。

### 4.4 Pair result

`compare_pair()` 接受 pair manifest、两份真实 `TrialManifest` 和两份 `TrialResult`，重新校验：

- manifest 摘要与 result 的 `trial_manifest_digest` 一致；
- trial/task/model/Skill/baseline/verifier 与 pair authority 一致；
- 从两份 manifest 投影出的稳定条件仍相同；
- workspace identity 不同；
- 两腿结果确实来自各自 manifest。

输出 `PairedComparisonResult`，状态只有：

- `PASS`：公平绑定完整，两腿均有确定的执行、验证和边界结果；
- `FAIL`：证据完整但发现 authority、绑定或隔离不一致；
- `INCONCLUSIVE`：任一 manifest/result 缺失，执行未完成，验证 unavailable/invalid，verdict inconclusive，或边界 unknown。

只有 `PASS` 才能给出描述性 `comparison`：`champion_better`、`challenger_better` 或 `tie`。这里的 “better” 只按本次冻结协议先比较安全边界，再比较 `met/not_met` 正确性；它不是晋升决定，也不会写入 Evolution promotion record。

每腿投影至少记录：

- verdict、execution/verification/boundary status、failure categories；
- tokens、tool calls、model requests、action effects、wall seconds；
- `user_interruptions = 0`。

`user_interruptions` 定义为模型执行期间要求用户介入的次数。Alpha Trial 不提供交互式 action approval，所以当前可机器确定为 0；开始前的本地 Trial confirmation 是冻结 authority，不计入运行中打断。

### 4.5 重复汇总

`aggregate_pair_results()` 接受按 repeat index 排序的非空结果序列，要求 pair id 唯一且 repeat index 连续。Alpha-B 首验至少执行两对，顺序交替：

1. `champion, challenger`；
2. `challenger, champion`。

汇总保持每个 pair 的原始引用，确定性累计各腿 usage 和 `comparison` 计数：

- 任一 `FAIL`，汇总为 `FAIL`；
- 否则任一 `INCONCLUSIVE`，汇总为 `INCONCLUSIVE`；
- 全部 `PASS` 才为 `PASS`。

汇总不做显著性统计、不把一次输赢外推为稳定改进，也不产生 Promotion/Shadow 决策。

## 5. 执行顺序与隔离

每一对的调用顺序固定为：

1. 分别 prepare 两腿，生成两个全新工作区；
2. 生成并验证 pair authority；
3. 按 pair manifest 的 execution order 串行调用现有 `AlphaTrialRunner.execute()`；
4. 从各自隔离 store 读取 manifest/result；
5. `compare_pair()`；
6. 多对完成后 `aggregate_pair_results()`。

prepare 和 pair authority 不发送模型请求。每腿只接触自己的 App、store、Goal、prompt history、workspace 和最终验证器；另一腿的文件与上下文不会进入模型输入。

重测试保持串行。缓存、store、工作区和临时数据放在 `D:\DevData`。本阶段没有真实 Docker 授权，离线验收使用现有 fake Docker。

## 6. 错误与诚实性规则

- 公平性预检失败：停止，不运行模型；
- manifest/result 绑定被篡改：`FAIL`，不计算胜者；
- 缺腿、验证不可用、边界未知或结论不确定：`INCONCLUSIVE`，不按零分处理；
- 两腿都失败但证据确定：仍可形成 `PASS` 的公平比较，描述性结果按冻结规则比较或为 tie；
- 任何结果都不能自动生成 Candidate、改变 Champion、进入 Shadow 或授予晋升资格；
- 当前 Stage A 的 usage-invalid/live failure 不进入 Alpha-B 学习证据。

## 7. 测试与完成门

### 7.1 单元/集成测试

使用 fake model 和 fake Docker，测试必须覆盖：

1. 显式 Candidate 被严格验证、隔离持久化并实际 materialize；默认 Champion 路径保持兼容；
2. 两腿同 task/model/settings/budget/policy/tools/baseline/image/check/verifier 时得到相同条件摘要；
3. 两腿 trial/workspace/context 不同，Skill digest 不同，每腿独立执行 final verifier；
4. 模型设置、预算、task/baseline、逐轮 policy/tool、image/check/verifier 任一变化都会在首个模型请求前拒绝；
5. result/manifest 摘要或角色绑定被篡改时返回 `FAIL`；
6. 缺失、unavailable、invalid、inconclusive、unknown 任一情况返回 `INCONCLUSIVE` 且没有 comparison；
7. 两对 AB/BA 结果可按固定顺序重复汇总，usage 和计数稳定；
8. Alpha-A 现有测试、全量 Python 测试、Ruff 和 TypeScript 门保持通过。

### 7.2 Alpha-B 完成门

- 同条件约束有机器可核对的稳定摘要；
- Champion/Challenger 使用独立 Trial、Goal、store、工作区和上下文；
- 至少两对交替顺序结果可确定性汇总；
- 比较器不会把缺失或不确定结果当零分或胜利；
- 无 Runtime/TypeScript/Docker/evaluator 重建，无自动 Candidate、晋升或 Shadow；
- 独立正确性复审和 Ponytail/YAGNI 复审通过；
- canonical handoff 记录 exact commits、测试、模型费用和下一入口。

## 8. 付费模型门

Alpha-B 已获累计 CNY 20 上限，但预算不是必须消费。只有离线设施通过且真实模型调用能增加独立证据时才使用；调用必须保持同模型、同预算、同工具、同基线和独立工作区。

在没有真实 Docker 授权时，不以削弱验证器的方式制造 live 证明。若离线设施已完整证明完成门，则可以保留全部模型预算，并在 canonical handoff 中明确记录 CNY 0。

## 9. 明确不做

- 不修改 DSH 或 Tianwen Runtime；
- 不修改 A1–A5 task package、workspace builder 或 Docker verifier；
- 不修改 TypeScript Evidence、Evaluator bridge 或 Evolution promotion schema；
- 不自动生成 Candidate，不更新 active pointer；
- 不晋升、不进入 Shadow、不实现回滚；
- 不建设通用实验平台、统计框架、调度器或新依赖。
