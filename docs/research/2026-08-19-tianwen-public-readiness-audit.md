# Tianwen 公开仓库与 Codex for Open Source 申请就绪审计

**日期：** 2026-08-19

**状态：** Task 1 公开安全与许可证基线完成；其余发布门完成前禁止切换为 public

## 1. 结论

Tianwen 可以准备申请 OpenAI `Codex for Open Source`，但当前仓库不具备直接提交条件。

项目的真实优势是：单人持续维护、374 个 `main` 提交、较完整的 Agent 治理研究、真实运行和评测证据，以及“复用 DSH 执行、Tianwen 只做长期 Goal/Evidence/学习版本治理”的清晰差异化方向。

Task 1 已加入 canonical Apache-2.0 许可证、完成 Gitleaks 全 refs/current-tree 脱敏扫描，并中性化当前 Markdown 的个人绝对路径。当前主要缺口不是代码量，而是公开产品面：GitHub 仓库仍为 private，没有 CI、正式 Release、贡献/安全文档；README 还在描述已经冻结的旧 Python Runtime 架构。

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

审计基线：本地 `main@c08b1106a0f390d8bedce30587441cea24f09e25`。

| 项目 | 当前事实 | 公开前处理 |
|---|---|---|
| GitHub 仓库 | `daydreamer0213/Tian-wen`，private | 所有发布门通过后才改 public |
| Maintainer 权限 | 用户为 owner/admin，可作为 Primary maintainer | 保持 GitHub profile 公开 |
| 活跃维护 | `main` 374 commits，单一 maintainer | README 如实描述，不伪造团队或采用量 |
| 远端分支 | 45 条实际 `origin` 远端分支 | 已纳入全 refs 扫描；不默认批量删除历史证据分支 |
| Tags / Release | 0 tags，无正式 Release | 创建 research-preview tag 和 GitHub Release |
| 许可证 | 根目录为未经改写的 Apache License 2.0 | 保持单一 Apache-2.0，不增加额外限制或双许可证文字 |
| README | 中文；仍称独立 Python Agent 控制面 | 改为 DSH 单 Runtime + Tianwen learning control plane |
| 英文入口 | 无 | `README.md` 英文，新增 `README.zh-CN.md` |
| 贡献/安全说明 | 无 | 新增 `CONTRIBUTING.md`、`SECURITY.md` |
| CI | 无 `.github` | 新增最小、可重复、零付费 CI |
| GitHub 描述/Topics | 私有仓库未形成公开门面 | 公开前设置描述和 agent/evaluation/governance 等 topics |
| 产品版本 | Python/Node manifest 均为 `0.0.0`，Node root `private: true` | `private: true` 可保留为 npm 防发布；版本策略在 Release 计划中说明 |
| 上游 DSH 许可证 | 审计 clone 为 MIT | 与推荐 Apache-2.0 项目许可证原则上兼容；实施时仍检查分发内容 |

本地 `main`、`origin/main` 和 `git ls-remote` 当前均为 `c08b1106a0f390d8bedce30587441cea24f09e25`。后续公开前仍须对最终 `main` 重做三方核对，不能 force-push 掩盖远端变化。

## 4. 标准敏感信息扫描、许可证与路径审计

### 4.1 Gitleaks 8.30.1 工具校验与命令

- 官方资产：`gitleaks_8.30.1_windows_x64.zip` 与 `gitleaks_8.30.1_checksums.txt`；
- 官方 checksum 与本机 archive SHA-256 均为 `d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`；
- 解压后二进制报告版本 `8.30.1`；
- 工具、archive、checksum、脱敏 JSON 和日志只保存在 `D:\DevData`，没有加入 Git；
- 最终扫描时 `git for-each-ref` 清点 138 个 refs，`--log-opts='--all'` 覆盖所有 refs 可达历史；reviewed base commit 为 `ed83d12fe42b231a3c59442f93625279bb6f84e3`。

执行命令：

```powershell
& 'D:\DevData\tools\gitleaks\8.30.1\gitleaks.exe' git --no-banner --redact=100 --report-format json --report-path 'D:\DevData\tianwen-public-audit\gitleaks-all-refs.json' --log-opts='--all' .
& 'D:\DevData\tools\gitleaks\8.30.1\gitleaks.exe' dir --no-banner --redact=100 --report-format json --report-path 'D:\DevData\tianwen-public-audit\gitleaks-current-tree.json' .
```

两次扫描 exit `1` 表示存在需要分类的命中，不表示已经确认真实凭据：

| 扫描 | 命中 | active real | revoked | 测试/公开夹具 | 非秘密误报 |
|---|---:|---:|---:|---:|---:|
| all refs | 6 | 0 | 0 | 5 | 1 |
| current tree | 7 | 0 | 0 | 3 | 4 |

### 4.2 命中分类

下表只记录规则、ref/commit、路径、分类和处理状态，不记录疑似值：

| 规则 | ref / commit | 路径 | 分类 | 处理状态 |
|---|---|---|---|---|
| `generic-api-key` | `e1390794e4a74db2711a77f985e2c3c51b4ca497`（2 refs）、`43e80c30a3d30cadb683951b1e6edfa569f416ca`（61 refs）及 current tree | `tests/unit/test_alpha_docker.py` | Docker 镜像公开 `GPG_KEY` 指纹，被继承环境测试固定；不是私密认证值 | 保留测试合同 |
| `generic-api-key` | `50036cd6d834e60448758f512e165f7b9119ba8c`（2 refs） | `docs/operations/tianwen-alpha-c-real-evidence-handoff.md` | 同一 commit 的公开镜像环境测试夹具说明 | 保留历史事实 |
| `generic-api-key` | `f136922cfbb6fc860bb5d9081408e11950c0a959`（92 refs）及 current tree | `packages/tianwen-evaluator-python/src/protocol.ts`、生成的 `dist/protocol.js` | `RECEIPT_KEYS` 校验标识符误报；命中行不含凭据赋值 | 保留源码/生成物 |
| `private-key` | `a042cbeeec7169a5a6883fd5b582515d9ea625bd`（103 refs）及 current tree | `tests/unit/test_memory.py`、`tests/unit/test_evidence.py` | 专门验证防火墙/脱敏器的 credential-shaped 字符串；PEM 与 OpenSSH loader 均为 0 个可加载私钥 | 保留安全回归夹具 |
| `generic-api-key` | current tree only | `.venv/Lib/site-packages/cryptography/.../hpke.pyi` | ignored 第三方类型声明中的 `private_key` 参数名误报，不是仓库发布内容 | 保留本地依赖；不提交 |

分类结论：**completed scans found no unresolved real credential**。这只描述已完成扫描的结果，不宣称秘密绝对不可能存在，也不构成仓库公开授权。若后续扫描发现 active real credential，必须停止公开准备并由用户决定撤销/轮换和历史处理；本 Task 未轮换凭据，也未改写历史。

### 4.3 Apache-2.0 许可证

用户已批准 Apache-2.0。根 `LICENSE` 与 Apache 官方 `LICENSE-2.0.txt` 逐字节一致，SHA-256 均为 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`；未添加额外限制、定制条款或双许可证文字。

### 4.4 本地路径

当前实测 12 份 Markdown 含个人绝对路径前缀，比初步审计记录的 11 份多一份。Task 1 已把当前树全部命中改为 `<repo>`、`<worktree>`、具名中性 worktree placeholder 或 `D:\DevData\...`，保留历史 SHA、实验结果和命令含义；focused path gate 现在为 0 matches。

历史 commit 中的旧路径属于低风险元数据。本 Task 不改写 Git 历史。

## 5. 申请强弱项

### 5.1 可以诚实强调

- 项目长期、密集、可追溯地由 primary maintainer 维护；
- 研究的问题具有生态意义：Agent 如何从真实问题改进，同时不静默改变 Goal、权限或当前运行行为；
- 设计优先复用现有 Runtime，避免重复建设 Agent Loop；
- 已有真实 Trial、Evidence、比较评测、no-Case/no-Candidate 和失败审计资产；
- 项目愿意公开复现方法、限制和失败，而不是只展示成功截图。

### 5.2 不能声称

- 不能声称已经完成自主学习 Agent；
- 不能声称 Candidate/Shadow/Promotion 产品闭环已落地；
- 不能把 Alpha A1–A5 成功描述成用户采用量；
- 不能声称有 Stars、Downloads、外部贡献者或生产用户；
- 不能把模型自评、测试数量或代码行数冒充生态影响；
- 不能为了申请制造虚假 issue、PR、star 或 testimonial。

## 6. 当前风险结论

| 级别 | 项目 | 结论 |
|---|---|---|
| Blocker | 仓库 private | 申请表不接受当前状态；最后一步才切 public |
| Complete | Apache-2.0 LICENSE | 已与官方原文逐字节核对 |
| Complete | 标准全历史密钥扫描 | Gitleaks all-refs/current-tree 完成；无 unresolved real credential |
| Important | README 与新架构冲突 | 审核者会误解产品，需要重写 |
| Important | 无 Release/CI/复现入口 | 难以证明公开维护和可重复性 |
| Important | 45 条远端分支会随仓库公开 | 已纳入全 refs 扫描；Task 7 仍须展示可见性后果 |
| Complete | 12 份当前文档的个人本地路径 | 当前树 0 matches；未改写历史 |
| Minor | 无仓库描述/topics/英文入口 | 在可见性切换前补齐 |

## 7. 唯一推荐下一步

按 [`2026-08-19-tianwen-oss-research-preview-application-design.md`](../superpowers/specs/2026-08-19-tianwen-oss-research-preview-application-design.md) 实施公开研究预览。公开与申请是最后两个独立动作：材料准备完成不自动授权切换可见性，仓库公开也不自动授权提交 OpenAI 表单。
