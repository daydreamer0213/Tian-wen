# 请求内容身份实施计划

> **For agentic workers:** Use executing-plans in the reused DEV worktree; no parallel implementation.

**Goal:** 新普通请求的消息编号不再被用于制造两个不同学习来源或退化任务。

**Architecture:** 候选前保存完整 requestContentDigest，来源摘要保持；共享任务内容/文件前像身份，mutation-only 来源检查，回滚用 request-content.v1 并保留所有旧政策重放。

**Tech Stack:** 现有 TypeScript/Vitest/native persistence，无新依赖、安装、模型或候选执行。

## Constraints

- 原来源/not-met或有效持续反馈/成功对照资格不变，不把不同摘要称语义独立。
- main/Daily NO-GO/隔离/原发布门槛及十工作日窗口保持；完整目标active。
- 旧摘要/案例/决策/回滚字节不改，不回填字段或重跑自然旧样本。
- 数据D:/DevData；D>=15GiB，优先20GiB；只清本轮自有新测试根。

### Task 1: 候选前内容身份、研究与回滚消费者

**Files:** conversation-learning.ts (可选来源字段/内容摘要/输入身份), conversation-files.ts (显式请求摘要参数), conversation-guidance.ts (回滚政策), index.ts (出口), ledger.ts (新来源/回滚校验), conversation-observer.ts (候选前记录), conversation-task-material.ts (精确恢复核对), conversation-guidance-loop.ts (选择/回滚)。测试 observer、guidance-ledger、checked-counterevidence。

- [ ] 首红复现真实消息编号使相同内容被算不同输入；新内容记录/恢复/不同来源与回滚用例。
- [ ] 实现冻结内容与共享有限身份，保留来源/案例哈希和旧重放；更新本轮机制夹具，不修改旧自然记录。
- [ ] 定向及相关 observer/learning/ledger/loop/file/checked 回归，产品类型/声明与必要strict基线比较。
- [ ] 独立只读审查、处理重要问题，明确旧任务/语义边界。
- [ ] 交接与路线保存本次对49f6ea8证据范围的修正；小记录、新根0/磁盘，提交推送DEV并写finish.json。不合main、不安装Daily。
