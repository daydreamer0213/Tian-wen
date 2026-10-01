# 编译参考输入执行计划

> For agentic workers: use executing-plans in this existing worktree. Standing autonomous implementation authorization applies.

**Goal:** 正常读目标加只读参考时，具体编译检查能绑定完整原生输入。

**Architecture:** 仅具体 producer 增加可选 referencePaths；复用既有路径、文件解析、输入摘要和正式 capture/recovery，保持一个 target 输出，不放松原协议。

**Tech Stack:** TypeScript compiler API、现有 DSH 原生 observer、Vitest。

## Global Constraints

- main/Daily NO-GO；正式激活隔离true；原门槛与十工作日窗口保持。
- 生成物 D:/DevData，D最少15GiB、偏好20GiB；不复制依赖/Profile。
- 最多八文件/32768 UTF-8字节；旧默认/历史不重判；不执行生成代码。

## Task 1: 完整只读输入

- [ ] 新建 `tests/dsh-migration/conversation-typescript-reference-inputs.spec.ts` 行为红测试；在 `conversation-file-observer.spec.ts` 新增真实原生两输入/一输出与冷恢复红测试，保存首失败。
- [ ] 修改 `scripts/conversation-typescript-check.ts`：捕获配置/校验路径及存在、冻结参考字节、扩展显式合同及完整 inputs 绑定；其余代码保持。
- [ ] 回归三个旧 compiler suites、checked counterevidence/full observer 与新 suite；八包类型/实际bundle、三个完整TS相对设计SHA比较。
- [ ] 独立只读审查、核对正式持续DEV原7task及账本0模型不变、清理自有根、更新交接并推开发分支。新受控输入场景不计自然反馈或学习效果。
