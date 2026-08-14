# DeepSeek Harness 兼容性探针结果

**完成日期：** 2026-08-15
**分支：** `codex/deepseek-harness-probe`
**状态：** Tasks 0–9 技术验证与 fresh whole-probe review 完成；文档提交和远端 SHA 由最终结构化交接闭合
**决策标签：** `ADOPT_DSH_RUNTIME_CANDIDATE`

> 这个标签表示“可以把 DSH 作为下一阶段候选 Runtime 内核”，不表示天问已经生产可用，也不授权完整迁移。

## 1. 结论

DeepSeek Harness `0.1.0-rc.6` 的承重公开接口通过了本轮兼容性探针。推荐下一阶段采用：

- DSH 负责 Agent Loop、Session、Goal round、工具、恢复和普通本地沙盒；
- Tianwen Profile、Plugins 和跨 Session Ledger 负责持续学习控制面；
- 现有 Python 保留为独立评测器、研究工具和迁移基线；
- 高风险代码以后使用 container、remote runner 或 microVM，不把 Windows `partial` 本地沙盒误写成强隔离。

选择 `ADOPT_DSH_RUNTIME_CANDIDATE` 的直接原因是：

1. 187 个已安装 DSH 包都精确解析为 `0.1.0-rc.6`；
2. 兼容层只使用 15 个公开面：1 个 CLI 入口和 14 个 Runtime 根导出；
3. 私有 `@deepseek-ai/*/src/*` 导入为 0；
4. Profile、Goal 主权、恢复、Evidence、Python A1、Artifact/Champion、回滚、重启重绑定和普通沙盒门全部通过；
5. 默认 Node、显式 sandbox、Python A1、全量 Python 和 Ruff 都通过；
6. 没有出现新的承重失败。

已批准的三个边界不构成虚假 blocker：

- 已审核、版本化、批准并装入同一进程的第一版产品插件属于可信代码；本探针不把已持有 root `Agent` 的恶意代码伪造来源重新升级为 blocker。
- `rc.6` 在 Windows Profile 一次性安装控制面内部使用 `shell: true`。这个窄例外固定版本、Profile、tarball、D 盘路径和参数，离线、无密钥、无用户或模型输入；天问外层仍为 `shell: false`。它不能扩散到运行期或学习资产安装。
- Windows 本地沙盒的 enforcement 是 `partial`。它通过了普通任务的 read-only 和 workspace-write 边界，但没有证明 sibling/outside-root 强隔离。

## 2. 版本与证据权威

| 项目 | 固定值 |
|---|---|
| Alpha 基线 | `67ef50f673c7786872cf5729a808dd3fe85afcfb` |
| 本轮已复验的 probe 代码 HEAD | `e15ad4376f1aca456366587369fb3952247f4e0d` |
| 代码范围 | Alpha base 到上述 HEAD，共 28 个提交、49 个文件 |
| DSH npm 版本 | `0.1.0-rc.6` |
| 当前 `pnpm-lock.yaml` SHA-256 | `4f94430093b627b8d7a31f4d30c4d11b832f8213404ce45b084079df7d260ef2` |
| `@deepseek-ai/dsh@0.1.0-rc.6` integrity | `sha512-brpZfED7ieRa2PQ5tUxMhHrM1pb2CmKFVM/f6yMULBDMicahk+Z2OsHgTwTDnoiZm23Ftu9rQz0NN4pflaoJcg==` |
| Node | `v22.23.1` |
| pnpm | `11.20.0` |
| uv | `0.11.28` |

这里必须区分两种权威，不能混写：

- 源码审计权威是官方 GitHub commit `47f943859bef60e4160492346772ded9b24f765a`，其 manifest 仍是 `0.1.0-rc.5`。
- 实际探针权威是 npm 发布包和冻结锁文件中的精确 `0.1.0-rc.6`。

`rc.6` 没有公开 Git tag 或 `gitHead` 可映射到审计源码，因此本文不把 rc.5 源码结论冒充 rc.6 实现证明。rc.6 的结论来自实际包 manifest、integrity、公开导出、类型声明、运行测试和锁文件闭包。

文档提交本身无法在内容中写入包含自己的 Git SHA。Task 9 文档提交和 push 后的精确远端 SHA 由最终结构化主控交接报告；这不改变上述已复验代码 HEAD。

## 3. 依赖闭包与公开接口

最终离线 frozen install 使用：

- `--offline`
- `--frozen-lockfile`
- 已审计的 `--trust-lockfile`
- 不可达 registry `http://127.0.0.1:9/`
- store `D:\DevData\pnpm-store`
- virtual store `D:\DevData\tianwen-dsh-probe\virtual-store-task-9-ff39`

结果为 576 个包全部复用、下载 0。闭包检查确认：

- DSH 命名包：187 个；
- 版本不等于 `0.1.0-rc.6`：0 个；
- CLI 公开面：`@deepseek-ai/dsh` 的 `bin.dsh`；
- Runtime 公开根导出：14 个；
- 总公开面：15 个；
- 私有 DSH 源码导入：0。

`@deepseek-ai/dsh` 是 CLI 包，不要求可 import 的根库导出。14 个被兼容层直接使用的 Runtime 库都具有公开 `"."` export、类型声明和默认实现文件。这个分类延续 Tasks 0–2 已审核的 CLI/library 合同。

## 4. Profile 组合

Task 3 证明了可打包、可离线安装、可 `--dump-config` 的最小 Tianwen Profile。

固定 Profile：

```text
tianwen-probe
```

Bundle 顺序：

```json
[
  "@deepseek-ai/dsh-base",
  "@tianwen/dsh-probe-bundle"
]
```

固定模型行：

```text
provider: tianwen-probe
model: scripted
```

插入的 Adapter：

```text
id: tianwen-probe-adapter
package: @tianwen/dsh-probe-bundle/adapter
```

Bundle tarball：

```text
D:\DevData\tianwen-dsh-probe\packs\tianwen-dsh-probe-bundle-0.0.0.tgz
SHA-256 29018a0f57b4b8dc529162f35f0c5d79a092ab2f92b36588505a0c99b7936012
```

Profile 报告：

```text
D:\DevData\tianwen-dsh-probe\profile-report.json
```

当前报告整文件 SHA-256 为
`5f82a56b86dde86761cac596114757968953186d945be89de9932428d973356e`。
它包含 Corepack 绝对路径，只是该次运行回执，不是跨环境身份。验收权威是 tarball SHA、固定组合、normalized assertions、公开导出实际 import、固定输入和执行边界。

四个天问外层命令都是程序名加 argv、`shell: false`。上游 DSH Windows 插件安装内部的 `shell: true` 只允许固定离线 Profile 安装，不进入 Agent 运行期。

## 5. Goal 主权与重启

Task 4 按已批准的可信同进程插件模型证明：

| 调用来源 | 操作 | 结果 |
|---|---|---|
| root Agent 的直接人类来源 | 创建顶层 Goal | 允许 |
| 诚实标记为 plugin 的来源 | 创建或编辑顶层 Goal | 拒绝，`GOAL_TOOL_AUTHORITY_REQUIRED` |
| root 拥有的 child，即使来源看似 user | 编辑 root Goal | 拒绝，root Goal 不变 |
| 普通 Tianwen 产品包 | 声明 Goal 变更依赖 | 0 |

持久恢复使用真实 JSONL Session：

1. Context 1 创建 `maxGoalRounds: 1` 的 Goal，持久化后销毁；
2. Context 2 从同一 JSONL 恢复；
3. 恢复后的 Goal 是 `activation: "disarmed"`；
4. 显式 resume 前新增 `goal/change`、Goal 来源消息、`request/header` 和模型请求都为 0；
5. 显式 `ctx.goals.resume()` 先追加精确 resume 事件；
6. 随后只启动一轮 ScriptedAdapter 请求；
7. 到达 round limit 后 Goal 为 blocked、再次 disarmed。

这证明恢复不会静默扩大继续权限。

历史上曾证明：持有完整 root `Agent` 的恶意同进程代码可以伪造
`source.kind: "user"`。用户和架构主控已明确第一版把正式安装的同进程插件视为可信代码，因此该事实记录为信任模型边界，不是本轮 blocker。未知、第三方或未晋升插件不得进入主进程。

## 6. Evidence 投影

Task 5 通过真实 AgentLoop、工具调用、Session 持久化和跨 Context 重放，证明 `tianwen.evidence.v1` 可以只保存最小证据：

- Session id；
- call/result event seq；
- call id 和工具名；
- 参数与结果 SHA-256；
- `complete` 或 `missing-result`；
- 可选工具错误码。

它不复制原始用户对话、原始工具参数或原始工具结果。原始事实仍由 DSH Session Log 保存。

承重行为均已覆盖：

- call/result 通过 `toolCallId` 配对；
- 多工具结果逆序完成时仍保持 call 顺序；
- unmatched call 明确成为 `missing-result`；
- duplicate call/result、orphan result、result-before-call 和不支持的 canonical 值 fail closed；
- 同一事件序列跨 Context 重放后，记录顺序、结构和 canonical JSON bytes 完全一致；
- 恢复比较期间模型请求为 0。

这实现了“两层账本”：DSH 保存单 Session 原始执行事实，Tianwen 只保存跨 Session 治理需要的最小索引和摘要。

## 7. Typed Python A1 Evaluator

Task 6 保留现有 Python A1 评测器作为独立权威，没有重写任务、seed、reference patch 或 verifier。

typed request/receipt 固定绑定：

- schema；
- canonical UUID request id；
- task `A1`；
- candidate `nop` 或 `oracle`；
- task bundle digest；
- model input digest；
- candidate digest；
- raw stdout digest；
- receipt verdict 与原始 stdout verdict；
- A1 精确七项检查名和顺序。

固定权威：

```text
task_bundle_digest =
sha256:15e08373a535c14bb0de636724170afb05cbb2e8ace1f91ca53bc877f73184d0

model_input_digest =
sha256:b8f76aae549aeca56d9a4749aa188788648fc0fae578f422c85cfb6da28eb490
```

重复两次的候选结果：

| 候选 | verdict | summary | raw stdout SHA-256 |
|---|---|---|---|
| Nop | `not_met` | `1/7 checks passed` | `76f5258a48170161497d032da1e84278f9c831fde595d6c59a3c0f6f28912fc3` |
| Oracle | `met` | `7/7 checks passed` | `e8ab9af5844519a4500727325febed982a82f53b9921068ef66bf45a19ac1e2c` |

同一候选两次运行的原始 stdout 和 digest 完全相同。Windows CRLF 以原始 bytes 计算，不被换行转换改变。固定 Python、repo root、D 盘 state root、请求/result 审计文件、绝对 Git 和 verifier 路径均 fail closed；请求内容不能选择命令或路径。

本探针只证明冻结 A1 的 typed bridge，不把它扩建成通用 Worker 平台。

## 8. Artifact、Champion、回滚与重启重绑定

Task 7 证明正式治理权威在 Tianwen append-only Ledger，而不在进程内 Dynamic Cordis ID。

承重序列：

1. V1 记录、独立评测 `met`、人类批准、激活，成为 Champion revision 1；
2. V2 经过同样门槛后成为 revision 2，V1 历史保留；
3. 没有新的 V1 批准时，回滚在 Dynamic inventory 改变前被拒绝；
4. 新的人类批准允许回滚到 V1 revision 3；
5. BROKEN 已评测并批准，但 Dynamic 激活失败；
6. 正式 Champion 仍为 V1 revision 3，旧 V1 被重新运行并验证 active；
7. UNAPPROVED 虽有 `met` 评测，但在 `define()`/`run()` 前被拒绝，Dynamic inventory 零变化；
8. 进程重启后 Dynamic inventory 为空；
9. 系统从正式 Ledger 读取 V1 源码，重新 define/run，并写入新的 `runtime-bound` 事件；
10. 旧 `pluginId`/`packageId` 不作为重启权威，正式 ArtifactId 和 Champion revision 不变。

Ledger 对 source blob、JSONL event、fsync、短写、原子 Champion pointer、并发 approval、commit-unknown 和 pointer 修复均有 fail-closed 合同。回滚只追加事件，不删除 Artifact、评测、批准、晋升、失败或运行时绑定历史。

当前 Ledger 是本探针需要的进程内串行 JSONL 实现，不是多进程数据库。commit 状态不确定时会阻塞并要求 fresh replay，不猜测 Champion。

## 9. 真实本地沙盒

Task 9 只执行了一次显式真实 sandbox gate，结果：

```text
1 file passed
3 tests passed
Vitest duration 810 ms
```

报告：

```text
D:\DevData\tianwen-dsh-probe\sandbox-report.json
SHA-256 ddcc714a9b30896f380cba20a29530cc633cfa874ec4dea890c4a7c3ef498ef1
```

结构化结果：

```json
{
  "schemaVersion": "tianwen.dsh_sandbox_probe.v1",
  "platform": "win32",
  "provider": "@deepseek-ai/dsh-sandbox-local@0.1.0-rc.6",
  "enforcement": "partial",
  "readOnlyWorkspaceWrite": "denied",
  "readOnlyDenialEvidence": "structured-child-fs-error",
  "providerDenialDialectMatched": false,
  "workspaceWriteInsideRoot": "allowed",
  "outsideRootProtection": "not-proven",
  "highRiskRecommendation": "use-container-remote-or-microvm"
}
```

read-only 的通过证据不是“任意非零退出”，而是固定子进程真实启动后输出唯一机器可读记录：允许的 `EPERM/EACCES/EROFS`、精确 `syscall=open`、精确目标 path、固定 exit 73、runner 非失败且目标文件不存在。

Node 22 的 `EPERM: operation not permitted` 没命中 rc.6 Windows backend 的公开 denial phrases，所以 `providerDenialDialectMatched` 诚实记录为 `false`。这保留为升级兼容性债务，但不否定已经得到的结构化 ACL 拒绝证明。

## 10. Task 9 最终命令证据

所有承重 gate 严格串行，每项真实执行一次，共 11 项。第一次把目录准备、安装和计时组合成一条 PowerShell 命令时，在进程创建前被本机命令策略拒绝；pnpm 没有启动，因此不计作 gate，也没有产生依赖或仓库状态变化。之后唯一一次纯安装命令得到下表结果。

| # | Gate | 结果 | 持续时间 |
|---|---|---|---|
| 1 | offline frozen `pnpm install` | exit 0；576 reused；0 downloaded；D 盘 store/virtual-store | pnpm 11.8s；进程 12.5s |
| 2 | `check:dsh-install` | exit 0；187 个 rc.6；15 个公开面 | 4.2s |
| 3 | `check:no-private-dsh-imports` | exit 0；0 violation | 4.1s |
| 4 | TypeScript typecheck | exit 0 | 16.8s |
| 5 | 默认 Tasks 0–8 Node | 8 files passed、1 skipped；63 tests passed、3 skipped | Vitest 14.30s；进程 16.1s |
| 6 | 显式真实 sandbox | 1 file、3 tests passed | Vitest 810ms；进程 3.6s |
| 7 | Python A1 | 1 passed、9 deselected | pytest 1.35s；进程 11.1s |
| 8 | 前台 full pytest | 424 passed、4 skipped | pytest 138.26s；进程 139.8s |
| 9 | Ruff | `All checks passed!` | 0.7s |
| 10 | `git diff --check 67ef50f...HEAD` | exit 0 | 0.5s |
| 11 | `git status --short` | 空输出 | 0.5s |

四个 Python skip 是：

- 需要显式开关和 API key 的付费 live model probe；
- 当前 Windows 账户无法创建的两个 symlink case；
- 由本轮显式 DSH sandbox gate 单独覆盖的 Windows ACL case。

## 11. 禁止效果

结合测试日志、固定 Adapter、子进程 allowlist 和各 Task canonical handoff，本轮累计结果为：

```text
paid model requests: 0
model API keys used: 0
live web/search requests: 0
real Docker invocations: 0
private DSH source imports: 0
automatic Goal mutation before human authority: 0
unapproved candidate activation attempts reaching Dynamic define/run: 0
writes outside repository and D:\DevData\tianwen-dsh-probe: 0
full migration effects: 0
Alpha Task 10 effects: 0
```

离线依赖重放和最终普通 Git push 单独记录，不属于模型或 web 探索。

## 12. Review 记录与开放项

### 12.1 Tasks 0–8 已有 review

| Task | 历史 finding | 处理结果 | 当前开放 |
|---|---|---|---|
| 0–2 | closure 路径、精确 package set、AST 私有导入扫描和构造导入绕过 | 多轮 RED/GREEN 后全部 Critical/Important 关闭 | 3 个 scanner Minor |
| 3 | rc.6 Windows 插件安装内部 `shell: true` | 先阻塞；用户批准固定、离线、无输入的窄例外后 C/I 为 0 | 兼容性债务，不是 open C/I |
| 4 | 同进程恶意 root Agent 可伪造 user 来源；恢复前 durable ordering 缺证据 | 信任模型由用户校正；durable ordering 补齐 | 失败时 JSONL 清理 1 个 Minor |
| 5 | 多工具结果逆序时的 call-order 回归缺口 | 增加 mutation-proven regression，Important 关闭 | 0 C/I |
| 6 | 任意 executable/repo、D 根、CRLF、伪造七项 `met` 等 | 1 Critical、3 Important 全部 RED/GREEN 关闭 | argparse 长选项缩写 1 个 Minor |
| 7 | 持久化、并发、恢复和 commit-unknown 路径 | 3 Critical、2 Important 及后续承重路径全部关闭 | 0 |
| 8 | reparse/path 清理、stale report、provider dialect 与文档过期表述 | 路径问题修复；结构化子进程错误合同获批并通过；文档改为当前/历史分区 | 0 C/I |

仍开放的 Minor：

1. 私有导入 scanner 对未来 benign constructed string 可能 fail-closed 误报；
2. scanner 不递归求值所有嵌套 call-result specifier；
3. scanner 没有“允许哪些 benign constructed string”的负向 fixture；
4. Goal 恢复测试失败时可能保留 JSONL 诊断目录；
5. Python `argparse` 接受无歧义长选项缩写；
6. Task 6 一次失败自动安装留下的 C 盘 untracked dependency 目录需要人工方便时清理，不参与最终环境或证据。

这些项不改变当前公开导入、Goal、typed evaluator、Champion 或 sandbox 的承重结论。按 ponytail 原则，不为推测性未来扩展或格式性 Minor 建新框架。

### 12.2 Task 9 fresh whole-probe review

Fresh reviewer：

```text
01a00122-236e-7053-be93-7d6e4f5c6892
```

它只读覆盖：

- Alpha base 到 `e15ad4376f1aca456366587369fb3952247f4e0d` 的全部 28 个提交；
- runtime-selection design、source audit、Task 9 和 completion gates；
- Tasks 0–8 canonical handoff；
- 两份 Task 9 文档；
- 11 项最终 gate 证据。

结果：

```text
Critical: 0
Important: 0
Minor: 0
Repair wave: 0
Ready for Task 9 document commit/push: Yes
```

Reviewer 确认：

- `ADOPT_DSH_RUNTIME_CANDIDATE` 是当前证据下正确的唯一标签；
- public package、Goal/restart、Evidence、typed evaluator、Champion、rollback、rehydrate 和 sandbox 结论与证据一致；
- 没有隐藏迁移、Task 10 启动或信任边界扩张；
- gate 1–15 通过，gate 16 按顺序在文档提交、普通 push 和 fresh 远端核对后闭合。

Review 没有 finding，因此没有 repair wave，也没有重跑任何 gate。

## 13. Completion Gates

| # | 完成门 | 结论 |
|---|---|---|
| 1 | 精确 rc.6 closure 与 frozen lockfile | 通过 |
| 2 | 只用公开 package | 通过 |
| 3 | 可安装 Bundle/Profile 与 keyless adapter | 通过 |
| 4 | 人类 Goal 主权与 plugin/child 拒绝 | 通过 |
| 5 | 恢复后 disarmed，pre-resume 模型请求 0 | 通过 |
| 6 | 最小、可追踪、可重放 Evidence | 通过 |
| 7 | Python A1 Nop/Oracle/raw repeatability | 通过 |
| 8 | 未评测、未批准候选不能成为 Champion | 通过 |
| 9 | Dynamic update 失败后 Champion 不变并恢复 | 通过 |
| 10 | rollback 保留历史 | 通过 |
| 11 | 重启从正式 Artifact rehydrate，不信任旧 Dynamic ID | 通过 |
| 12 | 本地 sandbox read-only/workspace-write 与诚实分类 | 通过 |
| 13 | 无付费模型、live web、真实 Docker | 通过 |
| 14 | Python 全量基线 | 通过，424 passed、4 skipped |
| 15 | fresh whole-probe review 无 open Critical/Important | 通过，0 Critical、0 Important、0 Minor |
| 16 | 分支普通 push 且远端 SHA fresh 核对 | 本文件提交后执行；精确结果由最终结构化交接记录 |

## 14. 开放风险与下一步

开放风险：

- DSH 仍是 Developer Preview，结论只适用于精确 rc.6；升级必须重跑兼容合同。
- rc.5 源码审计与 rc.6 发布包没有可证明的 source identity 映射。
- Windows Profile 安装期 `shell: true` 窄例外必须继续封闭，正式动态安装前需要上游安全接口或独立可审计安装器。
- Windows 本地沙盒只适合普通任务；高风险执行必须选择更强 provider。
- 第一版同进程产品插件是可信代码；以后若允许未知插件，必须先加进程隔离。
- Python bridge 当前只覆盖冻结 A1；A2–A5 和通用取消/恢复属于后续迁移计划。
- 探针 Ledger 是进程内串行 JSONL，不是生产多进程存储。

推荐由架构主控在用户批准后新建：

```text
Tianwen-on-DSH Migration Phase 1:
Runtime/Profile foundation and governance seam
```

该计划应继续保留 Python 基线和 A1–A5 合同，先把已验证的 Profile、薄 compat、Goal/Evidence/Evolution 接口迁入正式产品边界，再单独设计高风险 sandbox provider 和后续评测范围。旧 Alpha Task 10 继续冻结，不能被本探针自动恢复。
