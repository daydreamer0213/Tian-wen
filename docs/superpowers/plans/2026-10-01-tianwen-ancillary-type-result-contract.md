# 文件辅助测试类型结果合同实施计划

> **For agentic workers:** Use executing-plans in the reused DEV worktree. No parallel implementation; independent read-only review at the final gate.

**Goal:** 用现有编译器和原执行骨架准确检查一项实际待办的完整有限要求，为新原生任务提供候选前独立依据。

**Architecture:** 薄包装现有TypeScript事前冻结检查；只允许原payload断言类型槽与纯类型导入变化，其余语法骨架不变。检查者/要求/原骨架绑定到合同，不建立通用平台。

**Tech Stack:** 既有TypeScript/Vitest/普通observer，不执行生成代码，不下载运行时。

## Constraints

实际目标测试文件本轮只读；不写原生候选、不重跑旧自然任务。只证明固定类型修复，不升级整体任务/研究/学习结论。D盘15GiB底线，优先20；原NO-GO/隔离/门槛/十日窗口保持。

### Task 1: 完整有限结果包装

Files: create `scripts/ancillary-type-result-contract.ts`, create `tests/dsh-migration/ancillary-type-result-contract.spec.ts`; reuse `scripts/conversation-typescript-check.ts` unchanged.

- [ ] 单文件真实旧TS2352复核，原目标/测试字节冻结摘要。
- [ ] 现有纯编译检查的真实假阳性先红，随后实现骨架与禁止类型检查。
- [ ] 正负与冻结/取消/身份机制回归，目标/脚本/测试strict、相关原编译检查；不修改真实目标求绿。
- [ ] 独立只读审查及修复重要问题；保留首失败与范围。
- [ ] 小记录/自有根0/磁盘，交接提交推送；下一阶段一次普通原生尝试，完整目标继续active。
