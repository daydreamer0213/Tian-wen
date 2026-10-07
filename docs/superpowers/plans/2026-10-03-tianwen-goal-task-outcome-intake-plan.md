# Goal Task outcome intake implementation plan

> For agentic workers: use executing-plans in the current isolated worktree. Standing autonomous authorization applies; no repeated implementation approval.

**Goal:** 自动保存并恢复可信普通 Goal Task 的原独立结果，不伪造旧工具/对话来源。

**Architecture:** Evolution 原 ledger 增加闭合 typed event 和只读来源投影；已有 LongGoal owner 固定事前同意、核对实际原材料并调用原 Service。默认及旧任务不扩入，研究/激活资格不变。

**Tech Stack:** 已安装 DSH 0.1.1-rc.2、TypeScript、Node 22.23.1、Vitest。

## Global constraints

原证据/门槛/同意/隔离/停止/十工作日窗口保持；不重跑旧自然任务；运行物 D:/DevData，D>=15GiB；不构造 ConversationTask、反馈或 dsh-tool-result。

- [x] 新 tests/dsh-migration/goal-task-outcome-intake.spec.ts：原 Ledger 同意、四类结果、错条件、去重/冲突、撤回及新 Ledger 精确恢复，先红。
- [x] 新 packages/tianwen-evolution/src/goal-task-outcome.ts：闭合类型/解析/来源标识及结果分类；ledger.ts/runtime-binding.ts/index.ts 增加原日志的真实写入/读取消费者。
- [x] 原 goal-task-acceptance-contract.ts/goal-task-acceptance.ts：可选事前同意 revision、完成后和冷挂载消费持久原結果；SDK 原 fixture 先红自动写入、冷恢复/重复0请求和事后同意不追认。
- [x] 相关回归、类型/实际发行构建、实际发行 SDK 控制及独立静态审查；收口本来源接线，后续补研究材料/语义/方法使用，不能宣布完整学习完成。

准确范围、首红/修正/资源及下一入口见[交付记录](../../operations/tianwen-goal-task-outcome-intake-20261003.md)。增加实际学习状态消费，保持0来源默认结构。16文件493项、发行四控制及保存/关闭/漂移对照通过，仅工程；完整目标仍active/incomplete。
