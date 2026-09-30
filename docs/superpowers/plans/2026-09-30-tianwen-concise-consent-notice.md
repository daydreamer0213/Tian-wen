# 简明产品通知实施计划

**Goal:** 给原生 v3 产品通知增加局部简短表达要求，保留完整告知、授权与一次投递机制。

**Architecture:** 继续使用 `runGuardedNoticeTurn`，只在其原有产品通知提示中插入表达要求。不新增 API、翻译系统、字段或状态。

**Scope:** 本会话直接执行。用户已授权持续推进，无需再次选择执行方式；开发分支候选与已交付 Daily 分开。

## 单项实现

文件：`packages/tianwen-runtime-bundle/src/learning-consent-agent.ts` 与 `tests/dsh-migration/learning-consent-agent.spec.ts`。

- [ ] 在既有 `delivers the source-disclosing tool-disabled notice once to the exact main parent of child feedback` 测试的真实 notice message 中增加：
  ```ts
  expect(noticeText).toContain('one short paragraph without headings or numbered lists')
  expect(noticeText).toContain('Do not narrate the internal notice or Turn lifecycle')
  ```
  保留完整 disclosure、语言、工具拒绝和一次投递的全部原断言。
- [ ] 运行该单项，确认失败为缺少简短表达提示。
- [ ] 在 v3 notification 的原提示加入一小段表达指令；`LEARNING_CONSENT_NOTICE_TEXT`、legacy 分支、policy version 和 notice id 不动。
- [ ] 运行完整 `tests/dsh-migration/learning-consent-agent.spec.ts`、`pnpm run typecheck` 和差异检查。
- [ ] 独立审查本项差异，记录工程与真实效果的不同状态；不生成模型重试、完整包或新安装。
- [ ] 提交并更新权威交接，保留本项未取得新真实模型效果证据、完整自动学习 NO-GO。
