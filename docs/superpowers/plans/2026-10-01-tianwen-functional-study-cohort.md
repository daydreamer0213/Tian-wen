# 五任务功能研究供应器实施计划

**Goal:** 具体供应不同原请求/输入/期望的五研究检查及事前独立任务，复用现有正式生产者。

**Architecture:** scripts/conversation-isolated-python-check.ts内closed五角色工厂，精确完整material+角色+model匹配，组合原单producer与prepareIndependentCases，不新建Runtime machinery。

**Tech Stack:** 已有TypeScript、Vitest、原bounded Docker Python runner。

- [x] 核对34aa498与权威交接/原边界，记录单固定producer不能匹配不同五请求的假说、替代方案与不扩门槛设计。
- [x] tests/dsh-migration/conversation-isolated-python-cohort.spec.ts先证明原单producer只接受source1拒另4，19新项正确红；不同期望/输入/角色/质量/model/取消/克隆/目录消失边界。
- [x] 原脚本内最薄closed工厂：host五saved material冻结，两个独立任务先匹配来源再供应，五checks精确派发，不fallback或模型生成期望。
- [x] 八组246回归与1实际native loop/Docker控制，首根案例设计前五检查固定、十臂真实执行、0请求冷恢复准确；包类型/actualbundle/三完整TS旧0/现0/新增0。首控制错误字段、AbortSignal克隆、测试类型错误保留，不归给天问。
- [ ] 独立正确性/简洁性审查、交接/资格/路线更新、提交推送与自有清理；正式历史原样、NO-GO/隔离/原期限和完整目标保持。
