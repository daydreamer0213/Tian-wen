# 本地文件代码任务独立检查接缝 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复普通前瞻已暴露的适用缺口，让已有 code/local-files/files 任务也可在候选生成前固定宿主检查，结果单独记录；不把它改判 external，不改变学习准入。

**Architecture:** 在现有 evolution/conversation-external-check.ts 统一一项 applicability 函数，账本 validator、runtime prepare 和具体 TypeScript 适配器使用同一边界。只支持 code 且 external 或 local-files/files；沿用现有 API/事件/存储/冷恢复，无新执行器。文件捕获与显式 runtime 双重接入开关不改。

**Tech Stack:** 现有 TypeScript/DSH/Vitest，不安装依赖。

## Global Constraints

- 当前基线 9550cd6；上一实际预算任务候选前失败保留，不回填或重跑。此项是控制端工程接缝修复，不记原生候选成功。
- 原 task admission、local-file review、选择器/来源资格、accepted/方法激活均不改变；局部类型结果不覆盖原 verdict 或新增学习许可。
- writing、code/local-files/chat、text、subjective 不能因此启用此代码检查；external 原行为及历史记录保持。
- 候选前时序、完整输入/输出/模型/原请求/合同绑定、取消、冷恢复和同意保护全部继承。
- main/Daily 完整学习 NO-GO、新激活隔离、完整目标 active、原十工作日窗口不变。运行数据在 D:/DevData，收尾只保留小证据和新残余清空，D >=15 GiB。

## 实施

- [ ] 原适配器 local-files/files 反例、普通 observer 的真实合法模式机制反例、账本 local-files 结果冷重放先红；writing/chat 负例保持。
- [ ] 一个共享 applicability 函数供 validator/prepare/adapter 调用，现有类型入口必要导出；不复制分类判断或增加治理字段。
- [ ] 相关 ledger/observer/adapter 回归、八包类型、目标与测试联合严格类型、包根声明和只读审查。
- [ ] 更新交接/结果归属，提交 DEV。下一新的实际开发任务才前瞻验证，不复用已完成预算题、修改失效旧合同或自写用户反馈。
