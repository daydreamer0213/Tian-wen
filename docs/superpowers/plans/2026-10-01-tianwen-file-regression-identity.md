# 文件任务退化回滚实施计划

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Existing worktree is reused; no parallel implementation is needed.

**Goal:** 同一句请求的不同文件输入发生两次真实后续失败时，按既有规则恢复准确父方法。

**Architecture:** 共享捕获前像身份；新文件 regression 记录带 captured-files.v1，旧记录保持原重放语义。运行时选择与账本校验一致。

**Tech Stack:** 现有 TypeScript、Vitest、EvolutionLedger，无新依赖/运行时/模型。

## Global Constraints

- main/Daily 完整自动学习 NO-GO、新激活隔离、原发布门槛与十工作日窗口保持。
- 原两条不同后续失败和同模型/族/版本/模式/质量/作用域/时间规则不改。
- 不使用候选结果或当前磁盘作为原输入，不重跑旧自然样本或编反馈。
- 所有生成物放 D:/DevData；D 剩余不低于15 GiB，优先20 GiB；复用依赖。

### Task 1: 文件退化回滚与历史兼容

**Files:**
- Modify: packages/tianwen-evolution/src/conversation-files.ts (纯捕获身份)
- Modify: packages/tianwen-evolution/src/conversation-guidance.ts (政策字段解析)
- Modify: packages/tianwen-evolution/src/ledger.ts (新写入与重放检查)
- Modify: packages/tianwen-evolution/src/index.ts (共享出口)
- Modify: packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts (去重与正式回滚)
- Test: tests/dsh-migration/conversation-guidance-ledger.spec.ts (真实账本、入口、历史)

**Interfaces:** 消费现有 ConversationTask 捕获前像和 files 结果；产出 conversationFileTaskInputDigest(task): Sha256Digest | undefined，以及仅文件 regression 的 evidenceInputPolicy: captured-files.v1。

- [ ] 写同请求不同前像、相同前像/顺序/大小写、缺材料、新写政策和旧冷重放用例；保留首次失败日志。
- [ ] 实现纯身份/记录解析/新写政策、共享账本与运行时去重，不改变历史无字段判断。
- [ ] 运行定向用例和 guidance-ledger / guidance-loop / file-learning / checked-counterevidence 回归；严格类型及八包类型/声明。
- [ ] 只读独立审查并处理重要问题；保存失败归属和限制。
- [ ] 更新交接/路线/本项证据，核对小生成物/新根收尾/D盘；提交推送DEV并核对准确SHA/干净上游。不合main、不安装Daily。
