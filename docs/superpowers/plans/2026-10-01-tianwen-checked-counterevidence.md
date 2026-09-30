# 已检查成功对照实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 防止已有独立检查冲突或未完成的结果被当作新的研究成功对照，并处理后到结果唤醒。

**Architecture:** 复用现有任务、结果与账本；一个共享资格函数、三个新写入保护点及一个持久结果事件。历史重放和任务评价不改变。

**Tech Stack:** 既有TypeScript、Cordis/DSH、Vitest。

## Global Constraints

- 遵循[设计](../specs/2026-10-01-tianwen-checked-counterevidence-design.md)；不执行生成代码，不增加通用平台或模型调用。
- D盘生成物、>=15GiB底线、尽量20GiB；复用工作树与依赖，不碰此前被拒绝删除的目录。
- main/Daily完整学习NO-GO、新激活隔离、原门槛与十工作日窗口不变。

### Task 1: 选择、账本及结果唤醒接缝

**Files:**
- Modify: packages/tianwen-evolution/src/conversation-external-check.ts、index.ts、ledger.ts、runtime-binding.ts
- Modify: packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts
- Test: tests/dsh-migration/conversation-guidance-ledger.spec.ts、conversation-guidance-loop.spec.ts（按需要用小专用spec承载接缝）

**Interfaces:**
- Consumes: ConversationTask现有externalCheckPrepared/externalCheckFinished、task review及持久结果写入。
- Produces: hasSatisfiedConversationCodeCheck(task): boolean；tianwen/conversation-code-check-finished(taskId)事件。

- [x] 写选择/直接账本新写入的pending/rejected/unverifiable反例，以及无检查、verified/非met、历史恢复对照。
- [x] 写正式结果事件仅一次、调用现有wakeTask的验证；保存首次失败，确认不是夹具错误。
- [x] 实现共享函数、未来写入保护、精确结果事件及订阅/释放，不改共享历史校验。
- [x] 定向测试，再受影响研究、代码检查/任务账本回归；运行八包类型与声明检查。
- [x] 独立只读审查，修复重要问题，记录失败/通过与资源事实。
- [x] 更新权威交接与路线图；提交/推送DEV及准确提交、干净状态、D空间核对以本轮finish.json收据为准，完整目标保持active。
