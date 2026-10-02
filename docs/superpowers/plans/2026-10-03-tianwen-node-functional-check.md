# 隔离 Node 功能检查实施计划

> **For agentic workers:** 使用 executing-plans 逐项执行；独立代码审查只读。

**Goal:** 发布可用于真实 JS/TS 开发任务的独立运行结果检查。

**Architecture:** 固定 Node 适配复用现有隔离生命周期、完整材料绑定与五角色检查。原 Python 接口保留，不另建循环。

**Tech Stack:** 既有 TypeScript/Vitest/Docker CLI、Node22原生类型擦除，无新增依赖。

## Global Constraints
遵守对应设计：单文件固定 Node、原隔离/资源/清理、原完整质量与来源资格、原发布门槛。生成物D:/DevData、剩余≥15GiB。正式 Profile 不挂载，不运行旧题凑结果。

### Task 1：运行边界和三个实际公开工厂
- [ ] 新增 tests/dsh-migration/isolated-node-cli.spec.ts 及 conversation-isolated-node-check.spec.ts；先证明缺新 Node 能力，验证固定命令/镜像/边界、请求/材料绑定和无损 JSON 反例。
- [ ] 修改 src/isolated-python-cli.ts 仅抽共享内部固定语言执行，增加 src/isolated-node-cli.ts 薄适配；修改 conversation-isolated-python-check.ts 复用原绑定，增加 conversation-isolated-node-check.ts 薄适配与 index.ts 三公开出口。
- [ ] 旧隔离/工厂 mock 回归、新 Node 普通/研究/cohort 机制通过；不重跑旧真实学习样本。

### Task 2：真实隔离与发布交付
- [ ] 新 Node 实际 Docker 控制测试检查 JS/TS正确/错误和资源失败；只计新机制证据。
- [ ] 实际构建、八包类型、公开 JS/声明消费者；更新构建精确源清单，不能放宽名单。
- [ ] 独立审查并关闭实际问题；保存首失败和结果，不修历史。
- [ ] 清理/历史容器/D剩余/正式账本核验，更新权威交接和资格记录、提交及验证 DEV 远端；完整目标保持 active/incomplete。
