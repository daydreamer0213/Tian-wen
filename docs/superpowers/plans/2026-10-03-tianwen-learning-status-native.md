# 实际学习状态中文说明任务实施计划

> **For agentic workers:** 沿用 executing-plans，本会话直接控制原生任务；独立审查只读，被评估输出只能由天问产生。

**Goal:** 交付实际学习状态中文JSON说明工具，验证真实任务使用固定检查入口。

**Architecture:** 原注册status工具提供事前数据，固定合同及原计数/语义期望，原生runtime一次任务与独立Node检查，原结果/冷恢复分别核对。

**Tech Stack:** 已有Node22.23.1/DSH/正式模型/固定Docker镜像，无新增依赖。

## Global Constraints
目标 `scripts/summarize-learning-status.mjs`；只读参考 `docs/operations/learning-status-summary-contract.md`。1尝试/0重试，禁止控制端修候选。固定新宿主，不复跑旧题/改来源门槛/历史或正式隔离/NO-GO，D≥15GiB。

### Task 1：真实依据、封存与原生交付
- [ ] 0模型注册工具获取原状态；保留初装配差异，核对14任务/0研究/原账本不变，事前固定真实快照及合同控制期望。
- [ ] 复用原driver接固定薄入口并封存adapter/JSON/实际发行/原参考/输入，预检和只读独立审查；一次正式尝试。
- [ ] 原双审/功能结果/完整文件证据分别保存，工程只读审查原字节；失败不修原稿/重试。
- [ ] 0模型精确冷恢复原任务/材料/两审/程序/账本，所有本轮容器与残余自清/原84ID保持/D≥15，更新权威交接及DEV精确远端，完整目标保持active/incomplete。
