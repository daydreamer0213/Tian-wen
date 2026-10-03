# Tianwen 持续开发环境原任务合同分派计划

> 执行方式：在现有工作树直接执行，独立审查按 requesting-code-review；用户已授权自主选择真实待办与持续推进，不另索题或请求设计许可。

**Goal:** 一个持续 DEV Profile 使用多份事前冻结的普通任务合同，仍由原公共检查工厂准备、执行和保存原结果。

**Architecture:** 优先复用原 `applyDevelopment`、JSONL、原工具观察器和功能工厂。现有 DEV options 只有一份普通合同，已有工程测试另写 requestText 路由。新增一个纯薄适配器，由调用方传入原工厂，按原文本投影准确选择；随后现有 options 消费它。不建检查器/注册服务，不修改学习裁决或资格。

**Tech Stack:** 现有 Node 22.23.1 / SDK / 公共 Runtime / Vitest / 缓存隔离 Node 镜像，无下载或依赖副本。

## 约束

- 完整自动学习目标 active/incomplete；main/Daily NO-GO、原门槛和十工作日决策窗口不变。
- 首次新 Task 使用 `D:/DevData/tianwen-development-runtime/continuous-project-20261004`，未来任务复用。旧临时 Profile、正式账本、历史自然 Task 不搬迁、不重评。
- 不造失败/用户评价；未知首结果按原 Task 保存。控制端只写合同/独立入口与宿主，不写或修补候选。
- 单次新增实际 Task 不能证明完整学习；后续研究、语义、启用、未来效果分别核实。
- D 生成物小包，>=15GiB，原24拒删路径不碰。

## Task 1: 事前冻结分派契约和独立检查

- [x] 新只读 `tests/fixtures/ordinary-contract-routing.contract.md` 与 `.entry.mjs`。唯一候选输出 `scripts/development-ordinary-task-check.mjs`，无预写实现。
- [x] 公共接口 `createDevelopmentOrdinaryTaskCheck(configOrArray, createCheck)`。单份保持兼容；非空数组/不同非空原 requestText/同一非空 cwd；所有合同在调用原工厂前深拷贝；每份调用原工厂一次，原准备器必须存在。
- [x] `prepare(material)` 用原工厂的文本投影规则：所有 request messages 的 text 块依序以换行拼接。只准确匹配，不修剪/大小写/模糊/后备。未知任务返回 undefined，不准备其他合同。选中原准备器收到同一 material，原 prepared 返回值/错误/取消不改。
- [x] 事前独立正反、输入冻结/后改、返回身份/错误传播期望放 D 小包；基线输出不存在，原功能未实现。commit 冻结源、合同、期望和驱动摘要后仅一次实际 Task。

## Task 2: 一个持续的原 DEV 环境首次实现

- [x] 原 SDK observed tools/JSONL/public `applyDevelopment`，原同意 v3，无隔离覆盖/手写学习事件。首请求前原持久准备 gate 和全部文件角色生效。
- [x] 原 Node-project 工厂消费独立期望与完整图；保存首代码/Task/双审/程序/请求/seal，不重试或重评。
- [x] 新 Node 0 请求恢复同一原 Task/账本/归档。若失败先保存原结果，工程问题独立处理，不回写。

## Task 3: 既有 DEV options 接入、验证与接续

- [x] 仅在首代码原样通过后，`createDevelopmentNativeCheckOptions` 使用新薄适配器，逐份核与 study cwd 一致；既有单份/Goal 合同保持。
- [x] 回归：独立契约 + 原 DEV factory/任务宿主/准备 gate；实际公共 SDK 0 模型的持续环境 mount/reopen 与 Task 冷恢复；必要原隔离功能检查。
- [x] 独立审查，不把 mocked/scripted 控制记自然效果。手工接入不记模型自学。
- [x] 更新权威交接与停止条件。下一入口（仍未执行）：冻结后续实际待办与研究角色完整输入，复用该 Profile；原自然程序失败可作为支持证据，不需要伪造人类反馈。成功仅留真实基线。
