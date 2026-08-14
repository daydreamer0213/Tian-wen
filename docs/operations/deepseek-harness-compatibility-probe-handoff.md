# DeepSeek Harness 兼容性探针运维交接

**完成日期：** 2026-08-15
**状态：** complete — 技术 gate 与 fresh whole-probe review 通过；文档提交和远端 SHA 由最终结构化交接记录
**决策标签：** `ADOPT_DSH_RUNTIME_CANDIDATE`
**目标分支：** `codex/deepseek-harness-probe`

This probe does not make Tianwen production-ready and does not authorize full migration.

## 1. 交接摘要

Tasks 0–8 的实现和 Task 9 的 11 项最终 gate 已完成。所有承重验证目前通过，没有新发现需要把结论降为 `LIMITED_DSH_REUSE` 或 `KEEP_PYTHON_RUNTIME` 的失败。

推荐关系：

```text
DSH rc.6 = 候选通用 Runtime 内核
Tianwen Profile/Plugins/Ledger = 持续学习控制面
Python = 独立评测、研究与迁移基线
container/remote/microVM = 未来高风险执行 provider
```

本会话不修改 runtime-selection design、master memory、代码、测试、依赖或 Tasks 0–8 既有 handoff；不启动迁移、Alpha Task 10 或其他任务。

## 2. Git 与范围

| 项目 | 值 |
|---|---|
| Alpha base | `67ef50f673c7786872cf5729a808dd3fe85afcfb` |
| Task 9 起点、本地已复验代码 HEAD | `e15ad4376f1aca456366587369fb3952247f4e0d` |
| 起点真实远端 | `e15ad4376f1aca456366587369fb3952247f4e0d` |
| 起点远端证据 | 主控使用命令级代理 fresh `git ls-remote`，exit 0 |
| 起点工作树 | Codex 管理的 clean detached linked worktree |
| Alpha base 到代码 HEAD | 28 commits、49 files、19,592 insertions |

Task 9 只创建：

- `docs/operations/deepseek-harness-compatibility-probe-handoff.md`
- `docs/research/2026-08-14-deepseek-harness-compatibility-probe-result.md`

本文档不能包含“包含本文档的提交”自己的 SHA。文档提交、普通 push 后的精确本地和远端 SHA，由最终结构化主控交接提供。不会为自引用制造第二个文档提交。

起点核对时，本 worktree 直连 GitHub 被 reset，随后 TCP 443 也不可达；主控在稳定仓库使用已授权命令级代理获得：

```text
e15ad4376f1aca456366587369fb3952247f4e0d  refs/heads/codex/deepseek-harness-probe
```

主控明确授权把这个 fresh 回执作为权威远端事实，并要求不在受限环境反复探测。

## 3. 版本

| 包或工具 | 版本 |
|---|---|
| Node | `v22.23.1` |
| pnpm | `11.20.0` |
| uv | `0.11.28` |
| `@deepseek-ai/dsh` 和 186 个 `dsh-*` 包 | `0.1.0-rc.6` |
| `@deepseek-ai/cordis` | `4.0.1` |
| `@deepseek-ai/cordis-plugin-timer` | `1.1.3` |
| TypeScript | `6.0.3` |
| Vitest | `4.1.8` |
| tsx | `4.22.4` |
| `@types/node` | `22.20.0` |

锁文件：

```text
pnpm-lock.yaml
SHA-256 4f94430093b627b8d7a31f4d30c4d11b832f8213404ce45b084079df7d260ef2
```

版本权威必须继续分开：

- GitHub 源码审计：`47f943859bef60e4160492346772ded9b24f765a`，manifest rc.5；
- 实际兼容性权威：npm 发布包和冻结锁文件，精确 rc.6。

## 4. Task 9 最终命令

共 11 项，严格串行，每项真实执行一次：

| # | 命令 | 精确结果 | 时间 |
|---|---|---|---|
| 1 | `pnpm install --offline --frozen-lockfile --trust-lockfile ...` | exit 0；576 reused；0 downloaded | pnpm 11.8s；总 12.5s |
| 2 | `pnpm run check:dsh-install` | exit 0；187 rc.6；15 public surfaces | 4.2s |
| 3 | `pnpm run check:no-private-dsh-imports` | exit 0；0 violations | 4.1s |
| 4 | `pnpm run typecheck` | exit 0 | 16.8s |
| 5 | `pnpm run test:dsh` | 8 files passed、1 skipped；63 tests passed、3 skipped | Vitest 14.30s；总 16.1s |
| 6 | 显式 `sandbox.e2e.spec.ts` | 1 file、3 tests passed | Vitest 810ms；总 3.6s |
| 7 | Python A1 | 1 passed、9 deselected | pytest 1.35s；总 11.1s |
| 8 | 前台 full pytest | 424 passed、4 skipped | pytest 138.26s；总 139.8s |
| 9 | Ruff | `All checks passed!` | 0.7s |
| 10 | Alpha base 到 HEAD `git diff --check` | exit 0 | 0.5s |
| 11 | `git status --short` | 空输出 | 0.5s |

最终安装环境：

```text
registry: http://127.0.0.1:9/
store: D:\DevData\pnpm-store
virtual store: D:\DevData\tianwen-dsh-probe\virtual-store-task-9-ff39
uv cache: D:\DevData\uv-cache
Python venv: D:\DevData\tianwen-dsh-probe\venv-task-8
TEMP/TMP: D:\DevData\tianwen-dsh-probe\temp-task-9-ff39
PYTHONPYCACHEPREFIX: D:\DevData\tianwen-dsh-probe\pycache-task-9-ff39
TIANWEN_DSH_PROBE_ROOT: D:\DevData\tianwen-dsh-probe
```

默认 Node gate 明确移除了 `TIANWEN_RUN_DSH_SANDBOX`。显式 sandbox gate 只设置一次 `TIANWEN_RUN_DSH_SANDBOX=1`。

第一次尝试把“准备目录 + 安装 + 计时”组合成一条 PowerShell 命令时，命令在 pnpm 进程创建前被本机策略拒绝。它没有执行安装、不计 gate，也没有产品状态变化。随后纯安装命令只执行一次并通过。

## 5. 关键结果

### Profile

```text
Profile: tianwen-probe
Layer order:
  @deepseek-ai/dsh-base
  @tianwen/dsh-probe-bundle
Model:
  provider=tianwen-probe
  model=scripted
```

天问外层命令全部 `shell: false`。上游 DSH Windows 插件安装内部的
`shell: true` 只允许固定、离线、无密钥、无用户或模型输入的 Profile
一次性安装。它是兼容性债务，不是运行期权限。

### Goal 与 restart

- 直接人类来源可以创建 root Goal；
- 诚实 plugin 来源创建/编辑被拒绝；
- child 的 user-looking 来源不能修改 root Goal；
- 恢复后 `disarmed`；
- 显式 resume 前模型请求、request header、Goal 推进事件均为 0；
- 显式 resume 后只执行一轮并在 round limit blocked/disarmed。

同进程恶意 root Agent 来源伪造只记录为已批准可信插件模型的边界，不重新列为 blocker。

### Evidence

- call/result 稳定配对；
- 结果逆序时仍按 call 顺序；
- replay bytes 稳定；
- 原始对话、参数和结果不复制到 Tianwen Evidence；
- DSH Session 继续保存原始事实。

### Typed Python evaluator

- typed request/receipt 绑定 request、task、candidate、task/model/candidate/stdout digests；
- Nop：`not_met`，`1/7`；
- Oracle：`met`，`7/7`；
- 每个候选重复两次，原始 stdout 和 digest 相同；
- 继续调用冻结的 Python A1 task bundle、reference patch 和 verifier。

### Artifact、Champion 与 rollback

- 未评测、未批准候选不能触达 Dynamic define/run；
- V1、V2 晋升需要独立评测和人类批准；
- BROKEN 激活失败后正式 Champion 保持 V1，旧运行时恢复 active；
- rollback 追加历史，不删除失败；
- 重启从正式 Artifact rehydrate，旧 Dynamic ID 只作审计，不作权威。

### Sandbox

```text
read-only: denied
evidence: structured-child-fs-error
provider denial dialect matched: false
workspace-write inside root: allowed
Windows enforcement: partial
outside-root protection: not-proven
```

普通本地任务门通过。高风险工作以后使用 container、remote runner 或 microVM。

## 6. D 盘产物与报告

| 产物 | 路径或身份 |
|---|---|
| Profile 报告 | `D:\DevData\tianwen-dsh-probe\profile-report.json` |
| Profile 报告当前 SHA | `5f82a56b86dde86761cac596114757968953186d945be89de9932428d973356e`，环境相关 |
| Bundle tarball | `D:\DevData\tianwen-dsh-probe\packs\tianwen-dsh-probe-bundle-0.0.0.tgz` |
| Bundle tarball SHA | `29018a0f57b4b8dc529162f35f0c5d79a092ab2f92b36588505a0c99b7936012` |
| Sandbox 报告 | `D:\DevData\tianwen-dsh-probe\sandbox-report.json` |
| Sandbox 报告 SHA | `ddcc714a9b30896f380cba20a29530cc633cfa874ec4dea890c4a7c3ef498ef1` |
| Tasks 0–2 closure 报告 | `D:\DevData\tianwen-dsh-probe\task0-2-final-install-report.json` |
| Tasks 0–2 import 报告 | `D:\DevData\tianwen-dsh-probe\task0-2-final-import-report.json` |
| Goal/Session state | `D:\DevData\tianwen-dsh-probe\sessions` |
| Python evaluator audit | `D:\DevData\tianwen-dsh-probe\task-6-evaluator` |
| Evolution ledgers | `D:\DevData\tianwen-dsh-probe\task-7-ledgers` |

Profile 报告整文件包含 Corepack 绝对路径，因此不作为跨环境 canonical identity。tarball SHA、组合 assertions、固定输入和执行边界才是 Task 3 权威。

## 7. Review 与 fix wave

Tasks 0–8 的 review 结论已在结果文档逐项汇总。当前没有 open Critical/Important；已记录的 scanner、JSONL 清理和 argparse 等 Minor 不扩建框架。

Task 9 fresh whole-probe reviewer：

```text
01a00122-236e-7053-be93-7d6e4f5c6892
```

它已只读覆盖：

- main `1bb77c4abdf4f7ca035cb44c1621b949ba495676` 中的 runtime-selection design、source audit 和实施计划；
- Alpha base `67ef50f...` 到代码 HEAD `e15ad437...` 的全部 28 个提交；
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

Reviewer 确认 `ADOPT_DSH_RUNTIME_CANDIDATE` 正确、没有隐藏迁移或范围扩张，completion gates 1–15 已通过。Gate 16 按顺序由文档提交、普通 fast-forward push 和 fresh 远端 SHA 核对闭合。

Review 没有 finding，因此没有 repair wave，也没有重跑任何 gate。

## 8. 保留的 Python 权威

以下 Python 资产继续保留并作为迁移验收基线：

- 当前 Python Runtime 和 StateStore；
- Alpha-A Tasks 1–9 的实现与交接；
- A1–A5 task bundles、seed、reference patch、verifier 和 image lock；
- Python 独立评测、研究和数据分析逻辑；
- `424 passed, 4 skipped` 的全量基线。

本探针没有删除、废弃、大规模重构或降低这些资产的门槛。Task 6 只是固定 typed bridge，不把评测权威搬进 DSH。

## 9. 禁止效果

```text
paid model requests: 0
model/API keys used: 0
live web/search requests: 0
real Docker invocations: 0
private DSH source imports: 0
automatic unauthorized Goal mutation: 0
unapproved candidate activation reaching Dynamic: 0
full migration effects: 0
Alpha Task 10 effects: 0
merge/rebase/force-push/main mutation: 0
```

## 10. 开放风险

- DSH 是 Developer Preview，必须精确锁定 rc.6；升级要重跑 whole compatibility contract。
- rc.5 源码审计与 rc.6 发布包没有公开 source identity 映射。
- Windows Profile 安装内部 `shell: true` 只能保留为一次性固定控制面例外。
- Windows 本地 sandbox 是 `partial`，不用于高风险强隔离。
- 未知或未晋升插件不能进入可信主进程。
- Python typed evaluator 目前只证明 A1。
- Evolution JSONL Ledger 是 probe 级进程内串行实现，不是生产数据库。
- Task 6 的一次失败自动安装留下约 295 MB 的旧 worktree C 盘 untracked 依赖目录；它不参与当前仓库、环境或证据，可在原 worktree关闭后人工删除。

## 11. Task 10 与下一计划

Alpha Task 10 继续冻结。旧的真实 Docker 发布门不应自动恢复。

如果主控和用户接受 `ADOPT_DSH_RUNTIME_CANDIDATE`，推荐新建独立迁移计划：

```text
Tianwen-on-DSH Migration Phase 1:
Runtime/Profile foundation and governance seam
```

建议范围：

1. 保留并重新钉住当前 Python/Alpha 基线；
2. 把精确 rc.6、lockfile、15 个公开面和私有导入扫描作为升级合同；
3. 将已验证的 Profile、薄 `tianwen-dsh-compat`、Goal/Evidence/Evolution seam 纳入正式产品包边界；
4. Python 继续作为独立 evaluator；
5. 明确普通本地 sandbox 与高风险 provider 的路由，不在 Phase 1 提前建设通用容器平台；
6. 用 A1–A5 分阶段做迁移回归；
7. 继续禁止付费模型、真实 Docker 和完整 UI 迁移，直到相应阶段单独批准。

只有架构主控在用户批准后才能更新 runtime-selection design 和 master memory、创建该计划或启动新的迁移实施会话。
