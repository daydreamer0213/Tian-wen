# Tianwen 公开仓库与 Codex for Open Source 申请就绪审计

**日期：** 2026-08-20

**状态：** Tasks 1–6 已合入主线，承重代码 SHA 的真实 CI 已通过；仓库仍为 private，Task 7/8 未授权

## 1. 结论

Tianwen 可以准备申请 OpenAI `Codex for Open Source`，但当前仓库仍不具备直接提交条件。

项目的真实优势是：单人持续维护、超过 390 个 `main` 提交、较完整的 Agent 治理研究、真实运行和评测证据，以及“复用 DSH 执行、Tianwen 只做长期 Goal/Evidence/学习版本治理”的清晰差异化方向。

Tasks 1–5 已加入 canonical Apache-2.0 许可证、中性化当前 Markdown 的个人绝对路径，建立准确的中英文公开门面、贡献/安全文档、零付费 CI 和确定性演示。Task 6 已完成候选扫描、本地新鲜门、普通主线合并，以及承重代码 SHA `150f4626ba9da5cfb6fab1a3d6d2cc5ee994291b` 的真实 GitHub Actions 绿灯。仓库仍为 private，tag 为 0，也没有 GitHub Release；Task 7/8 尚未授权。

推荐先发布 `v0.1.0-research-preview`，再提交申请。旧 Alpha-D 不恢复；候选闭环继续作为 DSH 新架构的后续阶段，不作为本次申请前置门。

## 2. 官方申请约束

依据：

- [Codex for Open Source 官方说明](https://developers.openai.com/community/codex-for-oss)
- [申请表](https://openai.com/form/codex-for-oss/)
- [Program Terms](https://learn.chatgpt.com/docs/codex-for-oss-terms)

与本项目直接相关的条件：

- 申请人应是活跃开源项目的 primary/core maintainer；
- GitHub 个人资料和申请仓库需要公开；
- 审核关注仓库使用、生态重要性和持续维护证据；
- 项目即使尚未广泛采用，只要有明确生态价值，仍可申请并解释；
- 表单要求 ChatGPT 账户邮箱、GitHub 用户名、仓库 URL、maintainer 身份和 OpenAI Organization ID；
- “为什么仓库值得支持”“API credits 如何使用”“其他说明”各最多 500 字符；
- 申请内容必须准确，且不应提交保密信息；权益是个人、有限期、不可转让的。

## 3. 当前仓库事实

承重代码与执行证据基线：`main@150f4626ba9da5cfb6fab1a3d6d2cc5ee994291b`。本次 docs-only attestation 不改变该代码树；最终公开目标 SHA 及其 CI 在提交后外部核对，不回填自身 SHA。

| 项目 | 当前事实 | 公开前处理 |
|---|---|---|
| GitHub 仓库 | `daydreamer0213/Tian-wen`，private | 所有发布门通过后才改 public |
| Maintainer 权限 | 用户为 owner/admin，可作为 Primary maintainer | 保持 GitHub profile 公开 |
| 活跃维护 | `main` 超过 390 commits，单一 maintainer | README 如实描述，不伪造团队或采用量 |
| 远端分支 | 45 条实际 `origin` 远端分支 | 已纳入全 refs 扫描；不默认批量删除历史证据分支 |
| Tags / Release | 0 tags，无正式 Release | Task 7 获得用户明确确认后才创建 research-preview tag 和 GitHub Release |
| 许可证 | 根目录为未经改写的 Apache License 2.0 | 保持单一 Apache-2.0，不增加额外限制或双许可证文字 |
| README | 英文主入口与中文完整镜像；准确说明 DSH 单 Runtime + Tianwen learning control plane | 保持双语事实一致，不把路线图写成现状 |
| 英文入口 | `README.md` | 已完成；架构总览仍为详细权威入口 |
| 贡献/安全说明 | `CONTRIBUTING.md`、`SECURITY.md` | 已完成；安全报告使用 GitHub Security Advisories |
| CI | 两个 Linux job，只读权限、零付费命令；承重代码 SHA 的两个 job 均为 green | docs-only attestation 的自动 CI 仍按精确 SHA 外部核对，不回填自身 SHA |
| GitHub 描述/Topics | 私有仓库未形成公开门面 | 公开前设置描述和 agent/evaluation/governance 等 topics |
| 产品版本 | Python/Node manifest 均为 `0.0.0`，Node root `private: true` | 本预览不发布 PyPI/npm；保留的 Python Runtime 代码是冻结实验室资产，不是受支持的产品 Runtime |
| 上游 DSH 许可证 | 审计 clone 为 MIT | 与推荐 Apache-2.0 项目许可证原则上兼容；实施时仍检查分发内容 |

承重代码提交完成后，本地 `main`、`origin/main` 和 `git ls-remote` 均为 `150f4626ba9da5cfb6fab1a3d6d2cc5ee994291b`。docs-only attestation 普通推送后仍须对最终 `main` 重做三方核对，不能 force-push 掩盖远端变化。

## 4. 标准敏感信息扫描、许可证与路径审计

### 4.1 Gitleaks 8.30.1 工具校验与命令

- 官方资产：`gitleaks_8.30.1_windows_x64.zip` 与 `gitleaks_8.30.1_checksums.txt`；
- 官方 checksum 与本机 archive SHA-256 均为 `d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`；
- 解压后二进制报告版本 `8.30.1`；
- 工具、archive、checksum、脱敏 JSON 和日志只保存在 `D:\DevData`，没有加入 Git；
- release-candidate 扫描时 `git for-each-ref` 清点 138 个 refs，`--log-opts='--all'` 覆盖所有 refs 可达历史；reviewed feature base commit 为 `6959f24ce250814ff683837b4278a56faba72a60`，并包含当时的三份候选文档。
- release-candidate 报告 SHA-256：all refs 为 `e12a844ce072e3eaca5de9eae83b012c56c52751eabf5467aad4cced7398f1ab`，current tree 为 `93d635e89b73ae5a7cbe87e7d23b95d70f12a35004af3fd58121f295c3115d6d`。

执行命令：

```powershell
& 'D:\DevData\tools\gitleaks\8.30.1\gitleaks.exe' git --no-banner --redact=100 --report-format json --report-path 'D:\DevData\tianwen-public-audit\final-all-refs.json' --log-opts='--all' .
& 'D:\DevData\tools\gitleaks\8.30.1\gitleaks.exe' dir --no-banner --redact=100 --report-format json --report-path 'D:\DevData\tianwen-public-audit\final-current-tree.json' .
```

两次扫描 exit `1` 表示存在需要分类的命中，不表示已经确认真实凭据：

| 扫描 | 命中 | active real | revoked | 测试/公开夹具 | 非秘密误报 |
|---|---:|---:|---:|---:|---:|
| all refs | 6 | 0 | 0 | 5 | 1 |
| current tree | 10 | 0 | 0 | 3 | 7 |

### 4.2 命中分类

下表只记录规则、ref/commit、路径、分类和处理状态，不记录疑似值：

| 规则 | ref / commit | 路径 | 分类 | 处理状态 |
|---|---|---|---|---|
| `generic-api-key` | `e1390794e4a74db2711a77f985e2c3c51b4ca497`（2 refs）、`43e80c30a3d30cadb683951b1e6edfa569f416ca`（61 refs）及 current tree | `tests/unit/test_alpha_docker.py` | Docker 镜像公开 `GPG_KEY` 指纹，被继承环境测试固定；不是私密认证值 | 保留测试合同 |
| `generic-api-key` | `50036cd6d834e60448758f512e165f7b9119ba8c`（2 refs） | `docs/operations/tianwen-alpha-c-real-evidence-handoff.md` | 同一 commit 的公开镜像环境测试夹具说明 | 保留历史事实 |
| `generic-api-key` | `f136922cfbb6fc860bb5d9081408e11950c0a959`（92 refs）及 current tree | `packages/tianwen-evaluator-python/src/protocol.ts`、生成的 `dist/protocol.js` | `RECEIPT_KEYS` 校验标识符误报；命中行不含凭据赋值 | 保留源码/生成物 |
| `private-key` | `a042cbeeec7169a5a6883fd5b582515d9ea625bd`（103 refs）及 current tree | `tests/unit/test_memory.py`、`tests/unit/test_evidence.py` | 专门验证防火墙/脱敏器的 credential-shaped 字符串；PEM 与 OpenSSH loader 均为 0 个可加载私钥 | 保留安全回归夹具 |
| `generic-api-key` | current tree only | `.venv/Lib/site-packages/cryptography/.../hpke.pyi` | ignored 第三方类型声明中的 `private_key` 参数名误报，不是仓库发布内容 | 保留本地依赖；不提交 |
| `private-key` | current tree only | `.pytest_cache/...`、`tests/unit/__pycache__/...` | ignored 本地测试缓存与安全夹具的生成副本，不是仓库发布内容 | 保留本地生成物；不提交 |

分类结论：**completed scans found no unresolved real credential**。这只描述已完成扫描的结果，不宣称秘密绝对不可能存在，也不构成仓库公开授权。若后续扫描发现 active real credential，必须停止公开准备并由用户决定撤销/轮换和历史处理；本 Task 未轮换凭据，也未改写历史。

本次 docs-only attestation 及其自动 CI 完成后，使用同一已校验的 Gitleaks
8.30.1 对最终 `main` 再做 all-refs 与 current-tree `--redact=100` 扫描。
最终报告以 attestation 短 SHA 命名并只保存在 `D:\DevData`；最终目标
SHA、CI 和分类结论记录在外部 controller handoff，不把自身 SHA 回填到
本文件，避免形成无限文档提交循环。

### 4.3 Apache-2.0 许可证

用户已批准 Apache-2.0。根 `LICENSE` 与 Apache 官方 `LICENSE-2.0.txt` 逐字节一致，SHA-256 均为 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`；未添加额外限制、定制条款或双许可证文字。

### 4.4 本地路径

当前实测 12 份 Markdown 含个人绝对路径前缀，比初步审计记录的 11 份多一份。Task 1 已把当前树全部命中改为 `<repo>`、`<worktree>`、具名中性 worktree placeholder 或 `D:\DevData\...`，保留历史 SHA、实验结果和命令含义；focused path gate 现在为 0 matches。

历史 commit 中的旧路径属于低风险元数据。本 Task 不改写 Git 历史。

## 5. Task 6 新鲜门与确定性演示

release candidate 为 `63d6ace4e28455bee75de718078ef5202358ce0e`；
portable-path feature fix 为
`1b9e69281c98f67dba2c0fa6699e9ac0092bd870`；最终承重代码 main 为
`150f4626ba9da5cfb6fab1a3d6d2cc5ee994291b`。

| 验证 | 精确结果 |
|---|---|
| Ruff | pass |
| compileall | pass |
| 完整 Python pytest | 586 passed，4 skipped，0 failed |
| TypeScript typecheck | pass |
| DSH 安装闭包 | 187 个 exact rc.7 包、21 个直接 public surfaces |
| DSH private imports | 0 violations |
| Vitest（只排除旧 `runtime-profile.spec.ts`） | 22 files passed，2 skipped；245 tests passed，4 skipped，0 failed |
| 零成本 demo | pass；单一格式化 JSON；before/after digest 相同 |
| diff-check | pass |
| code-bearing main Python CI | [run `32340254356` / job `96337751225`](https://github.com/daydreamer0213/Tian-wen/actions/runs/32340254356/job/96337751225) success |
| code-bearing main TypeScript CI + demo | [run `32340254356` / job `96337751401`](https://github.com/daydreamer0213/Tian-wen/actions/runs/32340254356/job/96337751401) success |

首次 Vitest 运行暴露的是本地夹具漂移：持久 DSH host 仍为 rc.6，且 exact probe Python 环境不完整。只重建一次性 probe 环境并临时提供 rc.7 host 后，同一承重门通过；原持久 host 已恢复，没有为变绿而跳过测试或修改产品代码。

旧 `tests/dsh-migration/runtime-profile.spec.ts` 的首次 Profile bootstrap 可能挂起，按计划精确排除；它不是 pass，也不是 rc.7 API 失败证据。

演示结果：execution=`completed`，2 次 scripted model request，1 次确定性工具调用，Evidence 1 complete / 0 errors，0 qualifying signals，`no-case`，`candidateCreated=false`。投影前后 digest 都是 `sha256:0e26d91b8337bd4c50c412f06205d5f5144d74e5b6995b41e7421c60dd3f22fe`，格式化 JSON SHA-256 为 `df28a3d3289d1a1b71096abf8038eeab3337bd60de3f9aad0d5ed3c91157a35b`。演示为 0 网络、0 Provider、0 付费模型、0 token、0 CNY、0 Docker、0 持久化数据库、0 用户数据。

## 6. 申请强弱项

### 6.1 可以诚实强调

- 项目长期、密集、可追溯地由 primary maintainer 维护；
- 研究的问题具有生态意义：Agent 如何从真实问题改进，同时不静默改变 Goal、权限或当前运行行为；
- 设计优先复用现有 Runtime，避免重复建设 Agent Loop；
- 已有真实 Trial、Evidence、比较评测、no-Case/no-Candidate 和失败审计资产；
- 项目愿意公开复现方法、限制和失败，而不是只展示成功截图。

### 6.2 不能声称

- 不能声称已经完成自主学习 Agent；
- 不能声称 Candidate/Shadow/Promotion 产品闭环已落地；
- 不能把 Alpha A1–A5 成功描述成用户采用量；
- 不能声称有 Stars、Downloads、外部贡献者或生产用户；
- 不能把模型自评、测试数量或代码行数冒充生态影响；
- 不能为了申请制造虚假 issue、PR、star 或 testimonial。

## 7. 当前风险结论

| 级别 | 项目 | 结论 |
|---|---|---|
| Blocker | 仓库 private | 申请表不接受当前状态；最后一步才切 public |
| Complete | Apache-2.0 LICENSE | 已与官方原文逐字节核对 |
| Complete | 标准全历史密钥扫描 | release-candidate 扫描完成且无 unresolved real credential；docs-only 最终目标扫描记录在外部见证 |
| Complete | README 与新架构一致 | 中英文均明确唯一 DSH Runtime、只读 Evidence 和未完成边界 |
| Complete | main 精确 SHA 的真实 CI | code-bearing `150f4626...` 的 Python / TypeScript job 均 green |
| Blocker | 无正式 tag / GitHub Release | 必须等用户明确确认 Task 7 外部动作 |
| Important | 45 条远端分支会随仓库公开 | 已纳入全 refs 扫描；Task 7 仍须展示可见性后果 |
| Complete | 12 份当前文档的个人本地路径 | 当前树 0 matches；未改写历史 |
| Minor | 无仓库描述/topics | 在可见性切换前补齐 |

## 8. 唯一推荐下一步

停止在 Task 7 外部动作门。把 docs-only 最终目标 SHA、最终扫描、许可证、代码承重 CI 与最终目标 CI、demo、所有远端分支随仓库公开的后果、tag 和 Release 动作展示给用户；只有用户明确确认后才进入 Task 7。仓库公开不自动授权提交 OpenAI 表单，Task 8 仍需单独授权。
