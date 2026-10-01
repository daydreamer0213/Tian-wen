# 精确检查证据失效 Implementation Plan

> **For agentic workers:** Execute inline with executing-plans under standing autonomous authorization.

**Goal:** 撤回已证明误标的宿主检查证据，保留全部原任务和原裁决。

**Architecture:** Evolution原记录追加失效事件；共享资格函数、现有研究治理和Runtime唤醒消费该状态。无新模型请求、存储或重试机制。

**Tech Stack:** 既有TypeScript/Vitest/DSH，无新依赖。

## Global Constraints

不重跑1f5cb、不修改冻结检查器/原评价/原输出；正式隔离、NO-GO、原门槛和窗口不变。D生成物、余量≥15GiB。

### Task 1: 不可变记录与一致消费

Files: evolution/src/conversation-external-check.ts、conversation-learning.ts、ledger.ts、runtime-binding.ts、index.ts；runtime-bundle/src/conversation-guidance-loop.ts、learning-consent-agent.ts；tests/dsh-migration/conversation-checked-counterevidence.spec.ts、learning-consent-agent.spec.ts。

- [x] 测试先增加绑定原task/preparation/outcome的失效通知，实际ledger写入后来源/对照不再qualified；错误digest和未完成拒绝，重复幂等，原历史保留，运行并确认当前缺少记录支持失败。
- [x] 在原parse/validate/existing/apply扩展task-external-check-invalidated，投影externalCheckInvalidated；资格函数拒绝失效结果，原模型失败独立成立。
- [x] 在研究支持核对失效对照，原record后retire既有当前链；重复通知也补完中断retire，重启恢复不重判历史。Runtime新增宿主事件唤醒，状态增加invalidated历史数。
- [x] 测试覆盖新来源/研究/采用、现有方法立即回滚、回放及关闭同意、后续回归撤回检查不计入、独立model-not-met来源仍有效；执行相关回归和8包类型/实际bundle构建，独立只读审查。

### Task 2: 实际误证据精确撤回

- [ ] 事前保存实际ledger和原task摘要、拟通知，核对无活动调用/原结果及误归属证据；通过正式Runtime服务追加唯一通知，0模型，不改原评价或原ledger行。
- [ ] 冷读确认原task只新增失效字段、原字节前缀保持、共享来源undefined、原成功任务不受影响；readiness及正式隔离保持。
- [ ] 记录实际变化/资源和剩余完整学习缺口，清理本轮测试根，提交推送开发分支，不合并main。
