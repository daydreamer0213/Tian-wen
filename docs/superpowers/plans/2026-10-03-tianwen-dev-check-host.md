# DEV 功能检查固定宿主配置实施计划

> **For agentic workers:** 沿用 executing-plans，当前会话直接完成配置；独立审查只读。

**Goal:** 后续任务复用实际公开检查工厂的固定执行配置，使临时运行目录不再无意割裂来源身份。

**Architecture:** JSON 配置及公开工厂薄转发，沿用原生产摘要/隔离/来源分组。任务请求、案例、输入和必需条件单独事前冻结。复用持久 DEV profile，不修改原 receipt-summary。

**Tech Stack:** 现有 Node22.23.1、实际发行包、固定缓存 Docker，无新增依赖或模型。

## Global Constraints
配置 `scripts/development-isolated-node-host.json`、薄转发 `scripts/development-isolated-node-check.mjs`；生成物 D:/DevData。只 prepare、不执行候选/挂载 profile，不重评原任务；原分组/隔离/同意/门槛/窗口/NO-GO 保持，D≥15GiB。

### Task 1：固定配置及真实公开工厂消费
- [x] 保存明确 timeoutMs=20000、已有 Docker/镜像以及 JS/TS 持久 workRoot 的 JSON，无题目/条件/期望。
- [x] 用实际发布根 prepare 两个不同请求/案例，同配置同条件身份相同而合同不同；原每轮目录、不同条件、JS/TS 仍不同。零模型/候选执行/正式任务。
- [x] 先验证薄入口缺失首红，再实现原公开工厂的固定配置转发；标准 Node 消费/两次真实 prepare/isolated 覆盖拒绝，禁止转发覆写原条件/案例。
- [x] 独立只读审查固定配置/隔离/历史与验证边界；核对原正式账本/84 容器 ID 不变及新增执行回执零。
- [x] 更新未来驱动使用约定和原资格记录；恢复 Docker 停止、核对空间，提交 DEV 并核实精确远端。
