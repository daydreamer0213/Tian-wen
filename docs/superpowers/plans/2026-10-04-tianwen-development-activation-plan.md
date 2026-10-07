# DEV受治理启用实现计划

**Goal:** 原批准开发范围可实际消费原研究裁决和原自动启用/后续回滚，普通main/Daily入口隔离不变；完整目标仍active。
**Architecture:** runtime.ts原安装链共享，新增显式applyDevelopment及固定D独立根验证；原Ledger/GuidanceLoop裁决和权限不复制。
**Tech Stack:** 既有DSH/Node22/TypeScript/Vitest，运行包D:/DevData/tianwen-development-activation-20261004。

- [x] 新接口缺失首红；同原Core/Ledger/Loop策略与边界负向实测。
- [x] 原安装链内部参数化并新增显式DEV入口/类型，普通apply固定true；原根验证前无挂载。
- [x] 实际发行SDK原研究自动accepted/activation、未来Task原版本/退化回滚与0重复恢复；不手写启用、不称自然效果。
- [x] 原治理/研究/Runtime兼容、完整构建/两声明/公共边界、独立只读审查修复。
- [x] 当前真源及小证据包、资源/正式账本只读核验、提交推送；随后从未完成产品待办选择真实首次Task。

所有权runtime.ts和专用DEV边界小模块、聚焦测试及native-long-goal-profile实际原SDK夹具；不修改正式连续Profile、main/Daily、原研究裁决或旧自然结果。设计详见../specs/2026-10-04-tianwen-development-activation-design.md。

验证交付见../../operations/tianwen-development-activation-20261004.md；提交随本交付，推送SHA回执在D包final-audit。第三项自然效果仍IN PROGRESS，原Task状态查询研究范围缺口作为下一真实首次工作。
