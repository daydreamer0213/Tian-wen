# Tianwen v0.1.0 Research Preview 与 Codex for Open Source 申请设计

**日期：** 2026-08-19

**状态：** 方向已由用户批准；书面设计待用户审阅

**范围：** 公开仓库准备、研究预览发布和 OpenAI 申请材料；不实现新的产品能力

## 1. 决策

采用 7–10 天的 `v0.1.0-research-preview` 路线，再申请 OpenAI `Codex for Open Source`。

本阶段不恢复旧 Alpha-D，不等待完整 Candidate/Shadow/Promotion 闭环，不为申请制造额外产品范围。它把已有真实工作整理成一个安全、可理解、可复现的开源研究预览，让审核者能够判断：项目在解决什么问题、已经证明什么、尚未证明什么，以及 OpenAI/Codex 资源将怎样用于后续开源维护。

## 2. 考虑过的方案

### 2.1 立即公开并申请——不采用

优点是快；缺点是 private、无 LICENSE/CI/Release、README 过时。审核者三分钟内无法得到正确项目印象，且公开风险门不完整。

### 2.2 先发布研究预览再申请——采用

只整理开源门面、复现实验、公开安全和申请材料，不把申请变成新的大开发阶段。能够诚实呈现现有成果，也符合官方滚动审核节奏。

### 2.3 等完整候选学习闭环后再申请——不采用

候选闭环仍是重要产品目标，但它属于 DSH 新架构后续阶段，不是开源 maintainer 资格的必要条件。为了申请提前恢复 Alpha-D 会再次混淆产品边界。

## 3. 对外定位

英文一句话：

> Tianwen is an open-source learning control plane for agents: it governs long-term goals, projects traceable evidence from normal agent runs, and validates future behavior changes without silently modifying the current run.

中文一句话：

> 天问是建立在 DSH 之上的 Agent 学习控制面：治理长期目标，从正常执行中投影可追溯证据，并在不干扰当前任务的前提下验证未来行为变化。

核心叙事：

```text
DSH：完成正常 Agent 执行
Tianwen：长期 Goal + Evidence + 学习归因 + 未来版本治理
Alpha：实验室和评测资产，不是第二产品 Runtime
```

Research Preview 必须明确：当前已完成 Runtime 边界、DSH 能力审计、Alpha 实验与 Intake/评测基础；完整 Candidate/Shadow/Promotion 产品闭环仍未完成。

## 4. 发布物

### 4.1 仓库入口

- `README.md`：英文主入口；
- `README.zh-CN.md`：中文完整版本；
- `docs/tianwen-architecture-overview-v2.md`：详细架构入口；
- `LICENSE`：推荐 Apache-2.0，需用户最终确认；
- `CONTRIBUTING.md`：环境、测试、设计边界、提交和 issue/PR 预期；
- `SECURITY.md`：安全问题报告渠道、支持范围和禁止提交密钥说明；
- `.github/workflows/ci.yml`：最小零付费 CI；
- 必要的 issue/PR templates：只帮助真实贡献，不制造活动。

README 第一屏固定回答：

1. 项目是什么；
2. 为什么存在；
3. 当前能证明什么；
4. 三到五分钟怎样运行免费演示；
5. 哪些能力明确尚未完成。

### 4.2 免费可复现演示

演示只证明一个窄事实：DSH 完成确定性普通任务，Tianwen 从 Session 投影 Evidence，成功结果在没有可复用问题时正常得到 `no learning`。

演示要求：

- 一条命令；
- 不需要 API key、Docker、付费模型或用户私有数据；
- 使用 scripted/deterministic adapter；
- 输出普通执行结果、Evidence 摘要和 `no Case` 结论；
- Tianwen on/off 不改变动作、产物和最终结果；
- rc.7 compatibility probe 如果结论为 `NOT_UPGRADE`，演示继续使用批准的 rc.6，不为发布伪造升级成功。

本阶段不演示虚构 Candidate。未来真实候选闭环完成后再更新 Release。

### 4.3 Research Preview Release

创建 annotated tag 和 GitHub Release：`v0.1.0-research-preview`。

Release Notes 包含：

- Problem：Agent 执行与长期学习治理之间的缺口；
- Architecture：一个 DSH Runtime、一个 Tianwen control plane；
- Evidence：已有 Alpha A1–A5、Alpha-B comparison、Alpha-C Intake 和 DSH seam 研究；
- Reproduce：免费演示和测试命令；
- Limitations：未完成 Candidate/Shadow/Promotion、无生产 SLA、无 UI；
- Roadmap：DSH 原生执行 → Evidence 非干扰 → 长期 Goal → 后台 Learning → 未来版本治理。

根 Node `private: true` 可以保留，它用于阻止意外 npm 发布，不表示 GitHub 仓库私有。Python/Node package version 是否从 `0.0.0` 调整为 research-preview 版本，在实施计划中做一次窄决定；不顺带发布 npm/PyPI 包。

## 5. 公开安全门

以下全部通过后，才向用户请求最后一次“切换 public”确认：

1. 成熟标准工具完成所有 Git refs 的全历史 secret scan；
2. 所有命中被分类为真实凭据、已撤销凭据、测试夹具或文档示例；
3. 真实凭据先轮换/撤销，必要的历史改写另行获得用户明确授权；
4. 当前 38 条远端分支全部纳入扫描；不因分支不在 `main` 就忽略；
5. 当前树的个人绝对路径完成中性化；
6. `.gitignore`、tracked 文件和 Release 资产不含数据库、日志、收据、模型输出、私钥或用户数据；
7. `LICENSE` 已确认；依赖与实际分发内容完成许可证核对；
8. local/origin/GitHub `main` 精确一致；
9. README、免费演示、CI 和 Release 候选在 private 状态下已验证；
10. 生成一份不含疑似密钥值的公开前验收记录。

可见性切换是独立外部动作。准备工作完成不等于授权自动公开；用户已经同意方向，但实际切换前仍展示最终清单和目标仓库，避免错误公开其他分支或未审计新提交。

## 6. CI 与验证范围

CI 不复制本地所有重型实验，只运行公众可重复的承重门：

- Python 格式/静态检查和不需要付费/Windows ACL 的测试；
- TypeScript typecheck、public surface/private-import check 和离线 Vitest；
- 免费演示合同；
- Markdown 内部链接和 `git diff --check`；
- 明确跳过且解释 paid live、Windows ACL/symlink 和真实 Docker 实验。

不把 39 个历史分支都接入 CI，不新增矩阵平台、覆盖率服务、发布机器人或通用 workflow framework。

## 7. GitHub 门面

公开前设置建议：

- Description: `An auditable learning control plane for long-running agents, built on DSH.`
- Topics: `ai-agents`, `agent-evaluation`, `continual-learning`, `governance`, `dsh`, `python`, `typescript`
- Website: 暂空；没有真实站点不填占位链接；
- Issues: 开启，用于真实 bug、复现和设计讨论；
- Discussions: 首版不强制；有社区流量后再开；
- Wiki/Projects: 不启用，避免维护重复文档。

不创建虚假 star、fork、issue、PR、testimonial 或 usage 数字。外部采用不足时，申请只说明生态问题的重要性和已有维护证据。

## 8. 申请字段与英文草稿

### 8.1 固定字段

- Role: `Primary maintainer`
- Repository: `https://github.com/daydreamer0213/Tian-wen`
- Interested in: `API credits for my project`
- Codex Security: 建议同时勾选，作为 agent/tool/permission 边界的补充审计能力；不把它写成申请主理由
- Email: 使用与 ChatGPT 账户绑定的邮箱
- OpenAI Organization ID: 由用户在 API Platform 核对后填写；不得提交 API key

### 8.2 Why does this repository qualify?（500 字符内）

> Tianwen is an actively maintained open-source research project building a learning control plane for agents. It keeps execution in an existing runtime while adding cross-run goal governance, evidence provenance, attributable learning intake, and independently evaluated future-run changes. With 374 maintainer commits and reproducible agent/evaluation experiments, it addresses a growing need: helping agents improve without silently changing goals, permissions, or live behavior.

### 8.3 How will you use API credits?（500 字符内）

> API credits will fund reproducible OSS maintenance experiments: Codex-assisted issue triage, PR review, bounded implementation tasks, and champion-versus-candidate regression runs. Tianwen will record session evidence, attribute recurring failures, and test whether candidate instructions improve future runs without changing current runs. Credits will also support CI validation and release maintenance for the public research preview.

### 8.4 Anything else we should know?（500 字符内）

> I am the project's primary solo maintainer and repository administrator. Tianwen is a research preview, not a claim of completed autonomous learning. Its existing Alpha experiments are retained as evaluation assets while the product architecture reuses DSH as the single agent runtime. I am applying to make the work reproducible, easier to review, and useful to other agent builders.

这些文字是结构草稿。提交前必须根据最终公开仓库、Release、CI 和真实 commit 数重新核对，并确认每段字符数不超过表单上限。

## 9. 实施顺序

### Day 1–2：公开安全和许可证

- 标准全历史密钥扫描；
- refs、绝对路径、tracked artifacts 审计；
- 确认 Apache-2.0 或其他许可证；
- 普通同步 local/origin/GitHub main。

### Day 3–5：门面和免费演示

- 双语 README；
- CONTRIBUTING/SECURITY；
- 免费确定性演示；
- 最小 CI；
- GitHub description/topics 候选。

### Day 6–7：发布候选

- 在 private 状态运行 fresh gates；
- 形成 Release Notes；
- 独立复审公开声明与真实能力是否一致；
- 展示最终公开清单并请求可见性切换确认。

### Day 8–10：公开和申请

- 切 public；
- 未登录浏览器核对 README、LICENSE、CI、Release、链接；
- 等待 GitHub 页面稳定可访问，不人为制造采用数据；
- 最终核对三个 500 字符回答；
- 由用户本人提交 OpenAI 表单。

## 10. 非目标

- 不恢复 Alpha-D 或扩建 Python Agent Runtime；
- 不在申请前强行完成 Candidate/Shadow/Promotion；
- 不发布 npm/PyPI 包，除非后续另行批准；
- 不建 Web UI、官网、Discord、Skill Graph、多后端或复杂 CI；
- 不广泛删除历史分支、Evidence 或本地 Trial roots；
- 不为测试夹具机械改写完整 Git 历史；
- 不自动修改仓库可见性；
- 不代替用户提交包含个人账户信息的申请表。

## 11. 完成标准

本申请准备阶段只有同时满足以下条件才算完成：

1. 仓库公开且未登录可访问；
2. 明确开源许可证存在；
3. 全 refs 标准 secret scan 与人工分类通过；
4. 双语 README 准确表达新架构和限制；
5. 免费演示可一条命令复现；
6. 最小 CI 绿色；
7. `v0.1.0-research-preview` Release 可访问；
8. 三段申请文案均基于最终事实且在 500 字符内；
9. 用户可直接复制材料并亲自提交申请；
10. 项目没有为了申请重新引入旧 Alpha-D、第二 Runtime 或虚假采用信号。
