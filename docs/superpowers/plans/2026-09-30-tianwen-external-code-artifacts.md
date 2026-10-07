# 普通外部代码任务文件证据 Implementation Plan

> **For agentic workers:** Use executing-plans to implement this single coupled task; independent review follows implementation.

**Goal:** 普通 external/code 原生文件修改可有界冷恢复，同时不改变任务执行或声称独立成功。

**Architecture:** 复用现有 ConversationLearningRecord/Observer/Projection；默认关闭的 Runtime 配置薄传递。独立结果、研究和激活不在本实现内。

**Tech Stack:** 现有 TypeScript、DSH Agent/Session/File tools、Vitest，无新依赖。

## Global Constraints

main/Daily NO-GO、原发布要求/十工作日窗口不变；分析同意 v3；8 文件/96 KiB 单文件/128 KiB 总内容；D >=15 GiB，优先20 GiB；不重跑旧真实模型、不回填任务、不全量保留 Profile。

### Task 1: 捕获、投影、恢复与文本判断边界

Files: 修改 `packages/tianwen-runtime-bundle/src/{conversation-file-observer,conversation-task-material,conversation-observer,runtime}.ts`、`packages/tianwen-evolution/src/conversation-learning.ts`；测试 `tests/dsh-migration/conversation-file-observer.spec.ts` 和 `conversation-learning.spec.ts`。

- [x] 写 external/code file-only 普通任务反例测试，先记录 current baseline 捕获缺失；同时写 default off/非code拒绝/外部命令不被本捕获器拦截/模型 met仍inconclusive/改原生证据拒绝。旧版原生写入完成但 fileInputs 缺失，明确先红。
- [x] 最小改动：Projection 导出共享 host 文件 output kind 规则；observer 可控捕获但 facts/local ancillary 不扩权；recoverFiles 复用规则；review external 始终保留已有 inconclusive met 保护；Runtime 传递开关。
- [x] 八包 typecheck/build 使 harness 使用的 dist 投影一致；运行定向反例及受影响四组（增加 task-material 组）。首次 89/1 为新测试读取原生字段错用，按现有格式修正后 90/90，无真实模型重跑或标准变动。
- [x] 独立只读审查无重要可操作问题；新增自有根0、约33KiB证据、D约18.67GiB。仅DEV检查点提交，准确SHA以git为准。[结果与未交付范围](../../operations/tianwen-external-code-artifacts-20260930.md)明确可信合同前置绑定与外部结果记录尚待后续设计。
