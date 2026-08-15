# Tianwen-on-DSH Migration Phase 1 设计

**状态：** 已批准进入实施计划

**日期：** 2026-08-15

**依据：** DeepSeek Harness 兼容性探针已完成，最终标签为
`ADOPT_DSH_RUNTIME_CANDIDATE`；用户已明确要求进入目标模式持续推进。

## 1. 目标

把兼容性探针中已经分别验证的 DSH Runtime、Tianwen Evidence、
Python Evaluator 和 Evolution Governance 连接成第一条正式产品纵切片。

Phase 1 完成时，应能在无付费模型、无网络业务调用、无真实 Docker 的
离线环境中证明两条同环境、但不伪造评测关系的链：

```text
DSH Session / Goal / Tool
→ Tianwen Evidence
→ Cordis Plugin Artifact / Approval / Champion
→ 进程重启后恢复正式 Champion

Python A1 task bundle
→ typed EvalRequest / EvalReceipt
→ 保持 Nop / Oracle / raw stdout 迁移合同
```

这些链路是正式迁移的基础，不表示完整持续学习、生产可用或 UI 已完成。
Python A1 评测的是仓库补丁，当前 Evolution 激活的是 Cordis 插件源码；
Phase 1 禁止把二者伪装成同一个候选。

## 2. 方案选择

### 2.1 采用：从已通过探针的分支做最小正式纵切片

实施分支从
`origin/codex/deepseek-harness-probe@1eef994a82c4ff39de311d5c2b61dff92bf94162`
开始，直接复用已经通过测试和复审的：

- `@tianwen/dsh-compat`
- `@tianwen/evidence`
- `@tianwen/evaluator-python`
- `@tianwen/evolution`
- `@tianwen/dsh-probe-bundle`
- Python A1–A5 任务包和现有全量基线

只新增正式组合边界和纵切片验收，不重写上述组件。

### 2.2 不采用：一次性把 probe 全部并入 main

探针代码仍处于独立分支。Phase 1 通过前不把 TypeScript Runtime 大批量
并入 main，也不删除 Python Runtime。这样可以保持回退路径，并让迁移
分支拥有独立的验收和复审历史。

### 2.3 不采用：在 main 重新实现 DSH 接入

重新编写 Agent Loop、Session、Goal、Evidence 或版本治理会浪费已经获得
的直接证据，也违反“非差异化组件优先复用”的项目原则。

## 3. Phase 1 的正式边界

### 3.1 DSH 继续负责

- Agent Loop
- Session Event 和 JSONL 恢复
- Goal Round
- Tool call / result
- Dynamic Cordis 临时运行绑定
- 普通本地沙盒

### 3.2 Tianwen 继续负责

- Session Event 到最小 Evidence 的投影
- EvalRequest / EvalReceipt
- Python 独立评测
- Artifact、Evaluation、Approval、Promotion、Rollback
- append-only Ledger 和 Champion 指针
- 重启后的正式 Champion rehydrate

### 3.3 Python 继续是正式权威

以下资产不迁移、不删除、不降级：

- Python Runtime 和 StateStore
- Alpha-A Tasks 1–9
- A1–A5 task bundle、seed、reference patch、verifier、image lock
- Python 测试基线

Phase 1 只通过现有 typed bridge 调用冻结 A1。A2–A5 迁移属于后续阶段。

## 4. 新增组件

### 4.1 `@tianwen/runtime`

新增一个很薄的正式组合包。它不是新的 Agent 框架，只负责把已验证的
Tianwen 服务挂到由 DSH Profile 创建的 Cordis `Context`。

公开接口：

```ts
export interface TianwenRuntimeConfig {
  readonly evolutionRoot: string
}

export async function apply(
  ctx: Context,
  config: TianwenRuntimeConfig,
): Promise<void>
```

职责：

1. 校验 `@tianwen/dsh-compat` 支持的 DSH 版本仍为精确
   `0.1.0-rc.6`；
2. 挂载 `TianwenEvidenceService`；
3. 挂载 `TianwenEvolutionService`，正式状态根由
   `config.evolutionRoot` 提供；
4. 不创建第二套 Agent Loop、Goal Service、Session Store 或工具系统；
5. 不接受模型、命令、包名、权限或任意路径作为动态配置。

`evolutionRoot` 是唯一新增配置，因为正式 Ledger 必须有明确的持久位置。
Session persistence、模型和沙盒继续由 DSH Profile 决定。

### 4.2 `@tianwen/runtime-bundle`

新增可打包的 DSH Bundle，作为正式 Profile 组合入口。它只插入
`@tianwen/runtime`，不内置真实模型，不改变 DSH base 的其他配置。

兼容性验收仍可以额外叠加现有
`@tianwen/dsh-probe-bundle` 的无密钥 ScriptedAdapter：

```text
@deepseek-ai/dsh-base
→ @tianwen/runtime-bundle
→ @tianwen/dsh-probe-bundle 仅用于离线验收
```

正式产品以后用真实模型 Bundle 替换最后一层，不需要修改
`@tianwen/runtime`。

如果 pnpm 的本地 tarball 安装无法通过公开机制携带 workspace 依赖，
Phase 1 应停止在“workspace 可加载的正式 Bundle”并记录发布打包缺口，
不得复制依赖源码、使用私有 DSH 路径或 Fork DSH。

## 5. 纵切片数据流

### 5.1 启动

1. DSH base 创建 `Context`、Agent、Session、Goal 和工具能力；
2. `@tianwen/runtime` 挂载 Evidence 与 Evolution；
3. ScriptedAdapter 仅在测试 Profile 中提供确定性模型输出；
4. Session、Evolution、缓存和临时状态写入
   `D:\DevData\tianwen-dsh-migration-phase-1` 的一次性子目录；
5. 现有 Python A1 bridge 的审计数据继续写入它已经冻结的
   `D:\DevData\tianwen-dsh-probe` 权威根目录下的 Phase 1 子目录，
   不为统一目录而修改已通过的 bridge 边界；
6. 固定离线 Profile 安装继续使用已经审计的
   `D:\DevData\tianwen-dsh-probe` Windows 控制面根目录，避免扩大唯一
   上游 `shell: true` 例外；普通迁移状态不写入该目录。

### 5.2 执行与证据

1. 直接人类来源通过公开 `create_goal` 工具创建顶层 Goal；
2. Agent 再执行一个确定性的 `echo` 工具调用；
3. DSH Session 保存两次正式工具调用的原始 call/result；
4. Tianwen Evidence 为 `create_goal` 和 `echo` 各保留一条 event 定位、
   工具名和参数/结果摘要，不能为了只看业务工具而丢掉 Goal 创建事实；
5. Evidence 不复制原始用户消息、参数或结果。

### 5.3 Python A1 独立评测合同

1. TypeScript 只选择冻结候选 `nop` 或 `oracle`；
2. Python worker 使用现有 A1 task bundle 和 verifier；
3. receipt 必须绑定 request、task、candidate、task/model/candidate/stdout
   digests；
4. Nop 保持 `not_met`，Oracle 保持 `met` 和精确 `7/7`。

Python A1 receipt 在 Phase 1 只作为独立迁移合同，不写入无关的 Cordis
Plugin Artifact。等项目决定第一种统一学习对象后，再设计 receipt 到
ArtifactVersion 的正式绑定。

### 5.4 Cordis Plugin 晋升与恢复

1. 记录 Artifact；
2. 写入独立 Evaluation；
3. 写入人类 Approval；
4. 只有评测通过且存在新批准时才允许 Promotion；
5. Dynamic 激活失败时正式 Champion 不移动，旧 Champion 恢复；
6. 新 Context 重启后只从正式 Ledger 和 immutable source rehydrate；
7. 旧 Dynamic plugin/package ID 不作为跨进程权威。

## 6. 权威与状态

### 6.1 单一权威

- 单 Session 原始事实：DSH Session Log
- 跨 Session 正式治理：Tianwen Ledger
- 独立评测结果：Python EvalReceipt
- 活跃正式版本：Tianwen Champion

Phase 1 不增加新的数据库、事件总线、缓存权威或版本注册中心。

### 6.2 Profile 与 Runtime 的关系

Profile 决定“装哪些通用能力”；`@tianwen/runtime` 决定“天问治理服务如何
组合”。Profile 不成为 Artifact、Champion、Goal Graph 或评测权威。

### 6.3 失败处理

- DSH 版本不匹配：启动失败；
- Evidence 不能稳定投影：该 Run 不进入评测；
- Python receipt 无效或不完整：候选不能晋升；
- Ledger commit 状态不确定：Evolution blocked，要求 fresh replay；
- Candidate 激活失败：恢复旧 Champion；
- Champion 恢复失败：停止 Evolution 相关动作，不猜测当前版本；
- Windows 本地沙盒只标记为 `partial`，不用于高风险候选。

## 7. 测试设计

Phase 1 新增四层验证。

### 7.1 Runtime 组合测试

证明：

- 精确 rc.6 版本门；
- Evidence 与 Evolution 服务只挂载一次；
- 不创建第二套 Goal、Session 或 Agent Loop；
- Evolution 状态只能写入固定迁移根目录的子目录。

### 7.2 Session / Goal / Evidence 集成测试

证明：

- 直接人类来源 Goal 可执行；
- 恢复后 Goal `disarmed`；
- 显式 resume 前模型请求为 0；
- `create_goal` 与后续真实工具 call/result 各形成一条稳定 Evidence；
- Context 重启后 Evidence canonical bytes 不变。

### 7.3 Evaluator / Evolution 同环境测试

证明：

- Python A1 Nop / Oracle 和 raw stdout 合同保持不变；
- 测试和产品代码都不会把 A1 receipt 绑定到无关的 Cordis Plugin；
- 未评测或未批准 Cordis Plugin 在 Dynamic define/run 前拒绝；
- 经过其自身 Evaluation 和 Approval 后可以成为 Champion；
- BROKEN candidate 不改变正式 Champion；
- 重启后在新的空 Dynamic registry 中重新 mint 一次临时绑定并
  rehydrate 同一正式 Champion；`pluginId` / `packageId` 的字符串值可能
  因上游进程内计数器重置而重复，不能用跨 Context 字符串不等判断新旧。

### 7.4 全量回归

每个阶段必须保持：

- DSH closure 精确 rc.6；
- 0 私有 DSH 导入；
- 默认 Node 测试通过；
- 显式普通沙盒门通过；
- Python A1 通过；
- Python 全量基线通过；
- Ruff 和 diff check 通过；
- 0 付费模型、0 live web、0 真实 Docker。

## 8. 实施顺序

1. 冻结迁移分支和 baseline manifest；
2. 新增 `@tianwen/runtime`；
3. 接通 Session / Goal / Evidence；
4. 接通 Python A1 / Evolution；
5. 新增 `@tianwen/runtime-bundle` 并验证 Profile 组合；
6. 运行 whole Phase 1 review；
7. 推送独立迁移分支并交回主控验收。

每个任务都必须独立测试、独立复审。承重 Critical / Important 未关闭时
不得进入下一任务；最多允许一个阶段级修复波次。

## 9. 明确不做

Phase 1 不做：

- 完整跨会话 Goal Graph；
- 用户目标与元目标的完整嵌套循环；
- LearningSignal 生成；
- A2–A5 evaluator 迁移；
- 把 Python `repo_task` receipt 绑定到 Cordis Plugin Artifact；
- 通用多类型 Artifact activation strategy；
- 真实 DeepSeek 模型调用；
- Web Search / Fetch；
- Docker、remote runner 或 microVM 实现；
- Tianwen UI；
- 多进程生产数据库；
- 未知第三方插件；
- DSH Fork 或私有源码导入；
- 删除、覆盖或合并 Python Runtime。

这些能力只有在 Phase 1 通过后才单独设计。

## 10. 完成条件

Phase 1 只有同时满足以下条件才完成：

1. 正式 `@tianwen/runtime` 只通过公开 rc.6 接口组合现有服务；
2. Runtime、Profile、Session、Goal、Evidence、Evaluator、Evolution
   在同一离线产品组合中通过各自真实合同；
3. 未评测或未批准候选不能触达 Dynamic 激活；
4. 失败候选不改变正式或活跃 Champion；
5. 重启不信任旧 Dynamic ID；
6. Python 和 A1–A5 权威资产完整保留；
7. Windows 沙盒继续诚实标记为 `partial`；
8. 全量 Node / Python / Ruff 通过；
9. fresh whole-phase review 无开放 Critical / Important；
10. 独立迁移分支普通推送并核对远端 SHA。

Phase 1 通过后，主控再决定是否把迁移分支合并进 main，以及下一阶段先做
Goal Graph、A2–A5 还是用户进度控制面。

## 11. 延后但必须显式决定的问题

第一个统一进入“评测 → 晋升 → Champion”的学习对象尚未决定：

- `repo_task`：与现有 A1–A5 和 Python verifier 最接近；
- `cordis_plugin`：与当前 Dynamic Runtime 激活最接近。

推荐优先 `repo_task`，因为它已有更完整的真实任务评测证据；但这会要求
Evolution 支持“不在主进程动态激活”的正式 Champion。该扩展不属于
Phase 1，不能为了做出一条好看的测试链而提前实现。
