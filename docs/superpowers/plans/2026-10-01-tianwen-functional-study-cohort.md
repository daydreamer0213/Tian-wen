# 五任务功能研究供应器实施计划

**Goal:** 具体供应不同原请求/输入/期望的五研究检查及事前独立任务，复用现有正式生产者。

**Architecture:** scripts/conversation-isolated-python-check.ts内closed五角色工厂，精确完整material+角色+model匹配，组合原单producer与prepareIndependentCases，不新建Runtime machinery。

**Tech Stack:** 已有TypeScript、Vitest、原bounded Docker Python runner。

- [x] 核对34aa498与权威交接/原边界，记录单固定producer不能匹配不同五请求的假说、替代方案与不扩门槛设计。
- [ ] tests/dsh-migration/conversation-isolated-python-cohort.spec.ts先证明原单producer拒绝不同任务以及新适配缺失；不同期望/输入/角色/质量/model/取消/克隆/目录消失边界。
- [ ] 原脚本内最薄closed工厂：host五saved material冻结，两个独立任务先匹配来源再供应，五checks精确派发，不fallback或模型生成期望。
- [ ] 正确受控五检查两臂、适用回归/包类型/bundle/完整修改TS基线对照；必要实际缓存Docker控制仅机制，不执行旧候选/真实模型。
- [ ] 独立正确性/简洁性审查、交接/资格/路线更新、提交推送与自有清理；正式历史原样、NO-GO/隔离/原期限和完整目标保持。
