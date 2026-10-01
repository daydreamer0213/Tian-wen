# 无损文件复核 Implementation Plan

> **For agentic workers:** Execute inline with executing-plans under standing autonomous authorization.

**Goal:** 完整代码文件用有限无损块复核，原历史、全部输入和原限额保持。

**Architecture:** 独立纯函数模块由唯一真实原生任务实现；既有claimEvidence v2保存新投影选择，旧v1按原模式恢复。不改任务裁决或研究权限。

**Tech Stack:** 已有TypeScript/Vitest/DSH，无新增依赖。

## Global Constraints

不重跑43ad8或旧题、不覆盖历史、不抬128/32768/总材料限额。D生成物、复用持续DEV，隔离/NO-GO/原门槛/窗口保持。

### Task 1: 实际纯函数待办和有限功能合同

- [ ] 提交src/conversation-file-review-units.ts未实现函数和tests/dsh-migration/conversation-file-review-units.spec.ts，运行先红。
- [ ] 在D:/DevData/tianwen-file-review-packing-20261001固定原要求/原文件/严格编译配置，独立纯函数行为合同及正负/受限边界控制，独立只读审查。
- [ ] 原正式持续DEV 0模型预检原4任务/账本b67047…/同意/工具；唯一新原生任务，预算8/12/32/12分钟、0重试，失败恢复前像，不修稿或重跑。
- [ ] 合格原生候选原样测试/审查/接纳，冷恢复原task/material，模型评价和功能结果分别记账；若未合格停止接线。

### Task 2: 无损新投影及旧记录兼容

- [ ] 新投影/恢复测试先红，新增projectClaimEvidence可选file-chunks-v1，默认旧v1；新完整文件复核保存v2，文本/file-chat不改。
- [ ] native请求恢复按原claimEvidence版本重建；未知版本/换模式/失真拒绝，完整task/output绑定和全部审计检查保持。
- [ ] 复核相关回归、八包类型/实际bundle、完整修改TS及只读审查；旧真实342单元材料只读比较无损结果，不重评。
- [ ] 清理本轮自有测试根，保存小必要证据并更新交接/路线、提交推送开发分支；完整自然学习仍按原要求核对。
