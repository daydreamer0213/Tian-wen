# 简明产品通知实施计划

**Goal:** 给原生 v3 产品通知增加局部简短表达要求，保留完整告知、授权与一次投递机制。

**Architecture:** 继续使用 `runGuardedNoticeTurn`，只在其原有产品通知提示中插入表达要求。不新增 API、翻译系统、字段或状态。

**Scope:** 本会话直接执行。用户已授权持续推进，无需再次选择执行方式；开发分支候选与已交付 Daily 分开。

**后续独立集成：** 用户继续推进后，在既有维护工作区基于 `f163c71` 单独移植产品通知概括提示，未带入开发分支语言提示或其他学习代码。基线与补丁通知检查各 39/39、八包类型、构建及运行包／打包 64/64 通过，独立审查无可操作问题。PR #5 和准确合入主线 `6536969` 的 CI 各四项成功。本项源码收尾，Daily 不重复升级；下一次正常发布再交付，不再添加本项模型验收轮次。

## 单项实现

文件：仅修改 `packages/tianwen-runtime-bundle/src/learning-consent-agent.ts`；复用 `tests/dsh-migration/learning-consent-agent.spec.ts`，不新增仅复述提示文案的断言。

- [x] 只读确认当前 prompt 缺少局部简短表达要求，原生九点通知是既有症状；不重新生成旧答案。
- [x] 保留既有完整 disclosure、语言、工具拒绝和一次投递测试的全部断言；本项不增加字面重复实现的测试。
- [x] 在 v3 notification 的原提示加入一小段表达指令；`LEARNING_CONSENT_NOTICE_TEXT`、legacy 分支、policy version 和 notice id 不动。
- [x] 完整 `tests/dsh-migration/learning-consent-agent.spec.ts` **40/40**、`pnpm run typecheck` 和差异检查通过。
- [x] 独立审查未发现可操作缺陷；审查未运行模型，不证明实际表达已改善。不生成模型重试、完整包或新安装。
- [x] 更新权威交接并随实现提交，保留未取得新真实模型效果证据、完整自动学习 NO-GO。
