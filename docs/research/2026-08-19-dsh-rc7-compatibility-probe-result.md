# DSH rc.7 兼容性探针结果

日期：2026-08-19  
状态：探针完成，产品回归门未全绿  
决策：`NOT_UPGRADE`

## 1. 结论

固定版本的 DSH `0.1.0-rc.7` 通过了本切片全部承重门和可选复用门，但现有产品分支的 rc.6 `runtime-profile` 回归在最终 fresh 全量中超时，并在单文件串行复现时再次超时。完成门要求适用 Node/TypeScript 回归全绿，因此当前不得升级产品依赖。

rc.7 能力探针本身的正面证据是：

- npm 发布闭包、Windows 原生 headless/Profile 可用；
- Agent、同 Session Goal、持久 Session、resume 和 Session Query 可用；
- Skill provider/catalog/loader 可从公开 package root 使用；
- Tianwen Evidence 能从同一 DSH Session 只读投影；
- Tianwen off/on 的执行语义完全相等；
- DSH 的授权拒绝发生在真实 effect 前，拒绝结果返回模型，模型能诚实结束；
- Jobs、Workflow、Message Feedback 三项可选复用面也通过。

`NOT_UPGRADE` 的具体承重原因只有一个：`tests/dsh-migration/runtime-profile.spec.ts` 的默认 Profile 验证无法在 120 秒内完成，最终结果不是全绿。这是现有 rc.6 Profile 验证路径的问题，不应伪装成 rc.7 API 失败；但在它被独立修复或明确处置前，也不能用一次较早的偶然通过覆盖最终可复现失败。

没有使用 DSH 私有源码 import，没有建立第二个 Agent loop、Session、runner、adapter DSL、event framework 或 normalizer framework。

## 2. 固定身份与环境

| 项目 | 实测值 |
|---|---|
| 官方 upstream | `https://github.com/deepseek-ai/deepseek-harness.git` |
| upstream commit | `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` |
| upstream worktree | clean |
| 根 package version | `0.1.0-rc.7` |
| npm package | `@deepseek-ai/dsh@0.1.0-rc.7` |
| npm integrity | `sha512-ZceDCJ8FAywih+USW/OMk9jEhunlvJBGEz4kqrhau23hPzbciOazZrywH0nBRsaalSeAJ1JGBmjtw4OSjToStw==` |
| 操作系统 | Windows |
| Node.js | `v22.23.1` |
| pnpm | `11.20.0` |
| 探针根 | `D:\DevData\tianwen-dsh-rc7-compatibility-probe\99f6f02` |
| frozen replay | `D:\DevData\tianwen-dsh-rc7-compatibility-probe\99f6f02\install-frozen` |
| 状态根 | `D:\DevData\tianwen-dsh-rc7-compatibility-probe\99f6f02\state` |

首次安装只访问 npm 包注册表以核对发布 metadata 和下载固定依赖。后续 fresh install 使用 `--offline --frozen-lockfile`。没有模型网络请求、Provider 请求、Docker 请求或真实外部副作用。

## 3. 逐 gate 结果

`FAIL` 会否定承重 gate；`BLOCKED` 表示前置环境使该 gate 无法运行；`DEFER` 只适用于当前非承重复用项。rc.7 分项没有 `FAIL`、`BLOCKED` 或 `DEFER`；产品回归完成门另有一项 `FAIL`。

| Gate | 层级 | 状态 | 证据 |
|---|---|---|---|
| npm/package closure | `LOAD_BEARING` | `PASS` | exact rc.7 lock；在线首次安装与离线 frozen replay 均 exit 0；所有直接 DSH 包为 rc.7 |
| 原生 headless/Profile | `LOAD_BEARING` | `PASS` | `dsh --profile headless --dump-config` exit 0，dump 含 `@deepseek-ai/dsh-headless/startup` |
| Agent/Goal/Session resume | `LOAD_BEARING` | `PASS` | 一个 scripted 请求完成；Goal 持久化；resume 不请求模型；事件前缀保留并增加正式 `session/end-seed` 边界 |
| Session Query | `LOAD_BEARING` | `PASS` | SQLite Query 从冷 JSONL 读取同一 Session，事件与恢复视图一致，不启动 Agent |
| Skill provider/catalog/loader | `LOAD_BEARING` | `PASS` | 文件系统 Skill 被 catalog 列出并按需读取正文；model-facing loader 可从公开 root 加载 |
| Evidence 只读投影 | `LOAD_BEARING` | `PASS` | `SessionQuery.readSession()` 的 events 投影为一条完整 `artifact_probe` Evidence |
| Tianwen off/on 非干扰 | `LOAD_BEARING` | `PASS` | user input、模型可见 messages/tools、tool call/result、action、artifact、final、Goal 语义 receipt 深度相等 |
| effect 前授权/拒绝 | `LOAD_BEARING` | `PASS` | `tools/pre-execute` 请求授权，`policy: never` 拒绝；effect counter 为 0；下一模型请求看见 tool error；final 为 `EFFECT_DENIED_FINAL` |
| Jobs | `OPTIONAL_REUSE` | `PASS` | 本地 Job `start → wait → read` 完成并返回 `JOB_OK` |
| Workflow | `OPTIONAL_REUSE` | `PASS` | worker-thread workflow 返回 42，未启动 subagent/provider |
| Message Feedback | `OPTIONAL_REUSE` | `PASS` | 真实 Storage/Domain/JSONL Session 上 `put → list` 返回同一 message 的单条记录 |

| 完成门 | 层级 | 状态 | 证据 |
|---|---|---|---|
| 适用 Node/TypeScript 产品回归 | `RELEASE_COMPLETION` | `FAIL` | 最终全量为 18 files 通过、2 跳过、1 失败；223 tests 通过、7 跳过、1 失败；失败项为默认 rc.6 Profile 的 120 秒超时 |

## 4. 行为证据

### 4.1 模型看见什么

探针使用本地确定性 scripted adapter。模型请求 receipt 显式记录 user/assistant/tool 消息的 role、source kind、content，以及工具 name、description、parameters。Tianwen-on 只在 DSH 完成后读取 Session，不向请求增加或修改消息、工具或 prompt。

### 4.2 为什么行动，结果是否返回

scripted response 发出固定 tool call。DSH 执行工具后把固定 call id、name、arguments、result/error 写入 Session，并在下一请求中回给模型。成功场景写入内存 artifact；授权拒绝场景的工具函数从未执行，但模型明确看见拒绝错误。

### 4.3 为什么结束

成功场景在工具反馈后产生固定 final text，Goal 进入 `disarmed`。拒绝场景在收到 tool error 后产生 `EFFECT_DENIED_FINAL`。没有 request fuse、次数成功判定或 Tianwen wrapper 代替模型收尾。

### 4.4 Tianwen 如何解释

Tianwen-on 在执行完成后经 Session Query 读取 durable events，再调用现有 `projectEvidence`。它不拥有 Agent loop，不回写执行 receipt，也不改写已成功 final。把重复 call id 送入 projector 会使投影独立失败，先前成功的执行 receipt 保持不变。

## 5. 判别性证明

这些测试不是“只会通过”的 smoke：

| 变异 | 预期失败 | 还原后 |
|---|---|---|
| closure 期望 rc.7 改为 rc.8 | 安装版本集合断言失败 | closure 2/2 通过 |
| core final 改为错误文本 | final 断言失败 | core 1/1 通过 |
| Skill 正文期望改为错误正文 | Skill case 单独失败 | reuse 4/4 通过 |
| Tianwen-on user input 改为不同文本 | off/on 深度等价断言失败 | boundary 2/2 通过 |

所有变异均立即还原；没有为了制造 RED 修改产品代码。

## 6. Fresh 验证

| 命令 | 结果 |
|---|---|
| frozen replay `pnpm install --offline --frozen-lockfile` | exit 0 |
| fixture `tsc -p tsconfig.json` | exit 0 |
| fixture `tsx --test test/*.test.ts` | 9/9 通过 |
| `dsh --profile headless --dump-config` | exit 0；headless startup 命中 |
| 根 `pnpm run check:dsh-install` | exit 0 |
| 根 `pnpm run check:no-private-dsh-imports` | exit 0 |
| 根 `pnpm run typecheck` | exit 0 |
| 非 Python/Alpha 的根 Vitest 回归（较早一次） | 19 files 通过、2 跳过；224 tests 通过、7 跳过 |
| 非 Python/Alpha 的根 Vitest 回归（最终 fresh） | 18 files 通过、2 跳过、1 失败；223 tests 通过、7 跳过、1 失败 |
| 失败项串行复现 | `runtime-profile.spec.ts`：2 通过、3 跳过、1 失败；默认 Profile 子进程 120 秒超时 |
| 单独纯 TS runtime-governance 断言 | 1 通过、1 个 Python case 跳过 |
| 产品 manifest/lock diff | 无差异 |
| `git diff --check` | 通过 |

### 6.1 Fresh-check 过程说明

第一次聚合 fresh-check 暴露两项既有仓库脚手架问题，均不是 rc.7 gate 失败：

1. 第一次根 typecheck 按 package 排序时，`runtime-bundle` 先于其依赖声明产物；该次构建生成声明后，原命令重跑通过。
2. 直接运行根 `pnpm check` 时未设置既有 `TIANWEN_DSH_PROBE_ROOT`，且它会包含明确排除的 Python A1 evaluator。最终门禁因此按范围拆开：先构建现有 runtime bundle，再运行全部非 Python/Alpha 测试，并单独运行同文件中的纯 TypeScript governance case。
3. 拆分后的非 Python/Alpha 回归较早有一次 224/224 通过；最终 fresh 运行中，`runtime-profile.spec.ts` 的默认 Profile case 在 120 秒超时，串行复现仍然超时。精确诊断确认卡住的进程是现有 rc.6 `dsh --profile tianwen-probe --dump-config`。父测试退出后遗留的单个探针子进程按完整命令行和 PID 核对后终止，没有清理 Profile 数据根。

前两项说明仓库的“一条命令 fresh check”有易用性缺口；第三项是当前禁止升级的直接原因。它不推翻 rc.7 分项能力证据，但必须另开有界切片处理，不能在兼容探针中顺手改旧 Profile 脚本或降低超时断言。

## 7. Keep / Delete / Thin-adapt 决策

这是升级方向判断，不是迁移授权，也不展开新框架。

| 当前组件 | 决策 | rc.7 后的最小边界 |
|---|---|---|
| `@tianwen/dsh-compat` | `THIN_ADAPT` | 只保留升级期版本断言和不可避免的公开 API 薄适配；优先让产品直接使用 DSH root exports |
| `@tianwen/runtime-bundle` | `THIN_ADAPT` | 删除与 DSH Agent/Goal/Session runner 重复的部分；若仍需 Tianwen 组合入口，只保留治理插件装配 |
| `@tianwen/profile-host` | `THIN_ADAPT` | 原生 headless/Profile 已通过；仅在需要挂载 Tianwen 特有治理 bundle 时保留最薄 Profile 声明 |
| `@tianwen/dsh-host` | `DELETE` | 当前仅钉住 DSH 依赖；原生 DSH CLI/Profile 已覆盖该角色 |
| `@tianwen/evidence` | `KEEP` | 保留 Tianwen provenance/governance；输入改为 DSH Session Query 的只读事件，不扩成 Session framework |
| `@tianwen/runtime` | `THIN_ADAPT` | 只组合四个公开 seam 与 Tianwen 特有服务，不再包装通用 Agent Runtime |
| `@tianwen/evolution` | `KEEP` | 保留 append-only 长期治理账本；本 probe 未启用它 |
| `@tianwen/evolution/runtime-binding` | `DELETE` | 不迁移运行中 Dynamic Cordis activation；新 Champion 只能影响未来新 Run |

同时停止规划这些重复组件：Tianwen Agent loop/request fuse/finalization wrapper、Session/recovery/query framework、Skill loader/catalog/watcher、Jobs controller、Workflow DSL、Feedback/Plan/Todo/User Questions、通用 approval/permission framework，以及自动 save/install/self-promote extension。

仍由 Tianwen 保留的最小差异是：跨 Run Goal Graph、Run Manifest 与冻结选择、Evidence provenance、后台 Learning Intake、Candidate 到 Promotion/Rollback 的版本治理，以及通过 DSH effect hook 薄接的 Tianwen 特有授权策略。后四项均不在本 probe 实现范围。

## 8. 范围与外部效果

- 产品 dependency bump：0。
- 产品生产代码修改：0。
- DSH 私有 import：0。
- Python/Alpha 执行：0。
- Docker：0。
- 模型 Provider/付费请求：0 次、0 元。
- 真实用户数据：0。
- 真实外部副作用：0。
- Evolution/Champion 写入或切换：0。
- main merge：0。

仓库新增内容只包括 rc.7 probe fixture、现有 private-import 扫描根的一行扩展、结果文档和执行计划勾选。所有依赖、Session、Profile、临时状态和生成日志都留在显式 D 盘 probe root。

## 9. 独立复审结论

### Correctness

承重断言覆盖了安装闭包、公开 import、Windows Profile、执行、持久化、resume、冷 Query、Skill、Evidence、off/on 等价及授权错误路径。可选项彼此独立；任何单项失败都不会吞掉其他能力证据。未发现需要修改 DSH 或产品代码的承重问题。

### Architecture fitness

执行仍由 DSH 完整拥有：模型收到工具反馈后自行结束。Tianwen 只在执行完成后投影 Evidence，授权只在 effect 前介入。没有用字段、布尔值或硬请求次数代替 artifact quality、termination、real source 或 learning eligibility，也没有偏离主流 Agent loop。

### Ponytail / 比例化安全

fixture 直接组合公开 DSH 服务，只有场景局部 helper 和显式 receipt；没有新增通用 runner、adapter DSL、event/normalizer framework、审批层或恢复框架。授权测试使用内存计数器，Workflow/Jobs 都是本地确定性任务；没有为理论风险加入宽泛清理。

复审结论：rc.7 分项能力 `PASS`，阶段整体 `NOT_READY_FOR_UPGRADE`。

## 10. 遗留风险与下一入口

遗留风险有三类：

1. 现有 rc.6 默认 Profile 验证存在可复现的 120 秒退出问题；在根因修复并 fresh 全绿前不得升级；
2. rc.7 是 release candidate，即使回归恢复，正式依赖升级仍需单独批准，并重新跑产品 closure 与迁移回归；
3. 根 fresh-check 的构建顺序和 Python/TypeScript 聚合命令不够自解释，应另开小切片改善，但不能成为兼容层扩建理由。

唯一下一入口：监督先决定是否授权一个只处理现有 rc.6 `runtime-profile` 可重复退出问题的最小修复切片。该门 fresh 全绿后，才重新评估 exact rc.7 的产品依赖升级计划。未获批准前，不修改依赖、不迁移 Tianwen 功能，也不进入 Goal Graph、Learning、Candidate、Evaluation、Shadow 或 Promotion。
