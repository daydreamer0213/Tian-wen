# Ordinary Check Outcome Plan

**Goal:** 普通功能检查沿用原绑定规则，错误 checker 回报形成一次 unverifiable 回执，真实存储错误保持拒绝。

**Architecture:** 仅 Runtime finish callback 收尾调用已有 Evolution 验证器；不更改 Ledger/研究/发布工厂。

**Files:** `packages/tianwen-runtime-bundle/src/conversation-external-check.ts`；`tests/dsh-migration/conversation-file-observer.spec.ts`。

- [x] 在真实原生 file observer/原 Ledger 路径复现两种无有效事前绑定的回报缺失完成回执，保留首红。
- [x] 原验证器预检，确认正确失败/普通诊断拒绝与双审保持，错误回报不成为学习失败来源。
- [x] 零模型/prepare/evaluate冷恢复和重复finish，存储失败不被吞掉。
- [x] 五组242相关回归、八包类型/实际完整发行及独立只读审查。
- [x] 正式完整 ledger/固定checker原字节和小型证据/磁盘核对，更新交接。
- [x] b4e7f55提交推送、精确远端/干净工作区核对，不把本修复当完整学习完成。

不重跑自然样本、不凑来源/新增门槛/环境副本；main/Daily NO-GO及原同意/隔离/窗口保持，完整目标继续active/incomplete。
