# Counter Feedback Consistency Implementation Plan

> **For agentic workers:** Use executing-plans for this scoped task; existing independent reviewer reviews read-only. No additional execution agents.

**Goal:** 让研究初筛和新尝试沿用原study-open对照反馈规则，避免无效对照消耗问题pair。

**Architecture:** 原Runtime latest判断抽为私有小方法；原Ledger mutation-only gate提前检查有效反馈，历史replay不改。

**Tech Stack:** 现有TypeScript、Vitest、EvolutionLedger/Runtime及D依赖。

## Global Constraints

- 原反馈、普通评价、历史attempt、pending规则、门槛/同意/隔离/十工作日窗口/NO-GO保持。
- 本修复0真实模型/新自然反馈/研究/采用，无Docker/下载/环境副本；D≥15GiB。

## Task 1: 只修反馈消费者不一致

Files: `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`、`packages/tianwen-evolution/src/ledger.ts`、`tests/dsh-migration/conversation-checked-counterevidence.spec.ts`；原 readiness 测试夹具增加空反馈查询方法，不修改产品规则。

- [x] 通过原反馈记录API复现checked诊断误计和ordinary新attempt接受，保存两首红，不把夹具称用户反馈。
- [x] 验证study-open已拒绝同counter，冻结原语义；补新attempt拒绝/字节保持/干净counter首次尝试反例。
- [x] Runtime复用原active/proof/latest判定；Ledger仅new-write gate提前拒绝原负面counter。
- [x] 验证positive覆盖/撤回/未证实反馈、原pending规则及late-write冲突。
- [x] 相关回归373项、八包类型、完整发行声明与独立静态审查。
- [x] 正式零请求恢复/状态、ledger/checker原字节与磁盘/小证据核对，更新权威交接。
- [x] d797938提交推送并核对远端/干净工作区；完成不等于完整学习目标完成。
