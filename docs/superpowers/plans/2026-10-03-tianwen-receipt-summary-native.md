# 实际回执汇总开发任务实施计划

> **For agentic workers:** 沿用 executing-plans；原生被评估任务不交给控制端写输出，独立审查只读。

**Goal:** 让天问交付可用于实际26份原回执的汇总工具，并验证真实DEV公开Node检查路径。

**Architecture:** 实际发行三个工厂中使用普通Node检查，原/runtime装配原生任务；合同与期望在模型前固定。冷恢复和历史分别核对。

**Tech Stack:** Node22.23.1、已有DSH/真实模型、固定缓存Docker、既有依赖，无安装。

## Global Constraints
目标 `scripts/summarize-isolated-cli-receipts.mjs`；参考 `docs/operations/isolated-cli-receipt-summary-contract.md`。不改原同意/反馈/门槛/隔离/窗口，D≥15GiB。1正式尝试/0重试，禁止修候选或事后适配答案。成功普通任务不当研究完成。

### Task 1：独立事前依据和真实入口
- [ ] 从原26份回执固定原始输入、路径/摘要、全组和子组统计；原合同验证错误/空/重复name/字段类型用例在模型前固定。
- [ ] 复用原native驱动，薄适配实际发布Node/root+runtime，事前权限/输入/模型/源码/期望封存；只读独立审查和零提供者preflight。
- [ ] 一次实际任务，保留原请求、原生动作、双审、独立功能结果与失败归属；禁止补写被评估输出。

### Task 2：交付或真实失败、恢复及空间
- [ ] 对已通过原稿作工程审查/按原字节接纳，失败不修原稿/不重跑原任务。
- [ ] 零提供者冷恢复任务/完整原材料/原评价及账本，无再执行或重评。
- [ ] 所有本轮容器与临时目录清理、历史ID及D空间核验，更新权威交接/资格记录及DEV实际远端；目标保持active/incomplete，继续原链而非再索题。
