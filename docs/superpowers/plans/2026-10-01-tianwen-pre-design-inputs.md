# 研究前可信任务输入 Implementation Plan

> **For agentic workers:** Use executing-plans inline, respecting standing autonomous authorization.

**Goal:** 可选可信任务输入先于模型案例生成固定，五检查只准备一次，原生恢复绑定完整任务。

**Architecture:** 扩展现有studyResultCheck宿主接口；loop保留原一次原生投影及proof，复用原解析器与resultChecks消费者。

**Tech Stack:** TypeScript、Vitest、现有DSH原生harness，无依赖安装。

## Global Constraints

code/local-files/files；无hook历史保持；正式隔离true；NO-GO和原窗口保持；运行物D:/DevData；临时根测试finally清理；自然学习结果不追认。

### Task 1: 完整生产者与消费者

Files: conversation-study-result-check.ts公开宿主类型；conversation-guidance-loop.ts准备和原生投影；conversation-case-design.ts精确恢复；conversation-file-learning.spec.ts原生受控场景。

Interfaces: `prepareIndependentCases({sources,counterexample,modelConfigDigest,qualityContract,cwd,signal})`返回`{adjacent,holdout}`或undefined；每项为`{prompt,criteria,files:{entries,outputPaths}}`。无函数旧行为不改。

- [x] 在既有file-learning场景新增pre-design-pass/recover/missing/drift/duplicate/cancel/invalid/check-missing，设计请求入口断言已prepare5项并收到事前固定任务。
- [x] 运行定向pre-design，保留缺字段/顺序的真实失败。
- [x] loop先保存原attempt，调用宿主并克隆，复用generatedCases与parseConversationGuidanceRecord；事前prepare五项，设计材料保存independentCases；模型输出摘要不一致停止。设计后不再次prepare。
- [x] 复用原native恢复校验independentCases精确等于已存adjacent/holdout；无字段恢复保持。
- [x] 场景覆盖缺输入/检查、重复/限额、取消与模型替换；正常十臂及冷恢复无重复检查，保持旧test预期。

### Task 2: 收口

- [x] 运行完整文件学习、案例恢复、研究检查及loop回归；八包类型、实际bundle/pack与完整修改TS严格基线比较。
- [x] 按requesting-code-review进行只读审查，修复实际重要问题并核实所需回归。
- [x] 更新交接及操作记录，核对原DEV账本哈希、临时文件、D剩余、精确SHA；提交推送开发分支，原隔离/main不变。

完成记录：docs/operations/tianwen-pre-design-inputs-20261001.md。本计划交付仅工程接缝，完整目标保持active/incomplete。最终不同246项通过；9旧strict诊断保持，不称全strict绿。
