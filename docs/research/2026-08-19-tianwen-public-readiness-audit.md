# Tianwen 公开仓库与 Codex for Open Source 申请就绪审计

**日期：** 2026-08-19

**状态：** 初步只读审计完成；在标准全历史密钥扫描和发布门完成前禁止切换为 public

## 1. 结论

Tianwen 可以准备申请 OpenAI `Codex for Open Source`，但当前仓库不具备直接提交条件。

项目的真实优势是：单人持续维护、374 个 `main` 提交、较完整的 Agent 治理研究、真实运行和评测证据，以及“复用 DSH 执行、Tianwen 只做长期 Goal/Evidence/学习版本治理”的清晰差异化方向。

当前主要缺口不是代码量，而是公开产品面：GitHub 仓库仍为 private，没有开源许可证、CI、正式 Release、贡献/安全文档；README 还在描述已经冻结的旧 Python Runtime 架构。

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
| 远端分支 | 38 条实际远端分支 | 全 refs 扫描；不默认批量删除历史证据分支 |
| Tags / Release | 0 tags，无正式 Release | 创建 research-preview tag 和 GitHub Release |
| 许可证 | 根目录无 LICENSE | 用户确认后加入 Apache-2.0（推荐）或其他明确许可证 |
| README | 中文；仍称独立 Python Agent 控制面 | 改为 DSH 单 Runtime + Tianwen learning control plane |
| 英文入口 | 无 | `README.md` 英文，新增 `README.zh-CN.md` |
| 贡献/安全说明 | 无 | 新增 `CONTRIBUTING.md`、`SECURITY.md` |
| CI | 无 `.github` | 新增最小、可重复、零付费 CI |
| GitHub 描述/Topics | 私有仓库未形成公开门面 | 公开前设置描述和 agent/evaluation/governance 等 topics |
| 产品版本 | Python/Node manifest 均为 `0.0.0`，Node root `private: true` | `private: true` 可保留为 npm 防发布；版本策略在 Release 计划中说明 |
| 上游 DSH 许可证 | 审计 clone 为 MIT | 与推荐 Apache-2.0 项目许可证原则上兼容；实施时仍检查分发内容 |

本地 `main` 当前领先 `origin/main` 6 个纯文档提交，原因是 GitHub 连接不稳定。公开前必须普通 push 并核对 local/origin/GitHub `main` 一致，不能 force-push 掩盖远端变化。

## 4. 初步敏感信息与历史审计

### 4.1 已完成检查

- 当前与历史文件名中没有被跟踪的 `.env`、数据库、日志、PEM、P12/PFX、私钥或 credential 文件；
- 全 refs 历史差异做了只输出命中元数据的自定义扫描；
- 未发现 OpenAI/DeepSeek 风格 `sk-` key、GitHub token、AWS access key、Slack token 或 Bearer token；
- 11 个宽泛命中位于测试或示例文档：7 个 credential-assignment 示例/测试值，4 个历史测试文件中的 private-key header；
- 当前树没有 private-key header；当前 credential-assignment 命中均为 README/计划示例或明确测试 sentinel；
- 历史最大对象是 lockfile 和研究 Markdown，没有异常数据库、模型、压缩包或二进制产物。

这证明“没有发现明显真实凭据”，不等于最终公开授权。

### 4.2 尚需完成的承重门

公开前必须再使用一个成熟、支持 Git 历史的标准扫描器（例如 Gitleaks）扫描所有 refs，并对命中逐项只记录类型、ref、commit 和文件，不把疑似值写入报告。

若发现真实凭据：

1. 先撤销或轮换凭据；
2. 核对外部使用记录；
3. 再由用户明确批准是否改写历史；
4. 改写后重新扫描所有 refs 和远端；
5. 未完成上述步骤不得公开。

测试夹具或假值只需被证明不能访问任何真实账户，不为“零命中”机械改写 374 个提交。

### 4.3 本地路径

当前 11 份历史计划/交接文档包含 `D:\Guo\zuochong\AGi` 或 `C:\Users\Administrator`。这不是密钥，但会泄露无必要的本地目录并降低公开可读性。

公开分支的当前树应把个人路径改为 `<repo>`、`<worktree>` 或 `D:\DevData\...` 等中性示例。历史提交中的旧路径属于低风险元数据；除非用户明确要求隐私清理，不为此单独改写 Git 历史。

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
| Blocker | 无 LICENSE | 公开前必须明确授权条款 |
| Blocker | 标准全历史密钥扫描未完成 | 自定义扫描只能作为预检 |
| Important | README 与新架构冲突 | 审核者会误解产品，需要重写 |
| Important | 无 Release/CI/复现入口 | 难以证明公开维护和可重复性 |
| Important | 38 条远端分支会随仓库公开 | 必须全部纳入扫描和可见性审查 |
| Minor | 11 份当前文档含个人本地路径 | 当前树脱敏即可，不默认重写历史 |
| Minor | 无仓库描述/topics/英文入口 | 在可见性切换前补齐 |

## 7. 唯一推荐下一步

按 [`2026-08-19-tianwen-oss-research-preview-application-design.md`](../superpowers/specs/2026-08-19-tianwen-oss-research-preview-application-design.md) 实施公开研究预览。公开与申请是最后两个独立动作：材料准备完成不自动授权切换可见性，仓库公开也不自动授权提交 OpenAI 表单。
