# 文件研究完整证据入口实施计划

> **For agentic workers:** Use executing-plans in the reused DEV worktree. Independent read-only review follows implementation; do not delegate coupled implementation files.

**Goal:** 使独立检查能恢复文件研究五案例十臂及原输入、原生实际输出和出处，保留文本兼容及所有治理边界。

**Architecture:** 共享guidance-review-packet既有拼装，文件arm薄用recoverConversationFileTrial；原任务review复用observer精确文件材料。不是研究verifier或新结果评价。

**Tech Stack:** 现有DSH/TypeScript/Vitest，D盘依赖与自有小运行目录。

## 约束与文件

按同日design；改 `packages/tianwen-runtime-bundle/src/guidance-review-packet.ts`，测试 `tests/dsh-migration/conversation-file-learning.spec.ts`，文本回归 `conversation-guidance-loop.spec.ts`；无需改loop/账本/普通checker或公开包出口。新文件接口供现有项目侧脚本读取，沿原text同级内部入口。

- [x] 增加files/chat/原始反馈包正例及换输出、缺收据、角色交换、缺原生记录拒绝；记录确切缺接口首红，不先写实现。这里反馈由机制fixture提供，不称真实用户新反馈。
- [x] 用现有file native恢复分支并共享packet核对，原review材料精确恢复、生成cases保留files；文本输出无新字段。
- [x] 本轮D小根跑定向和完整相关回归；运行受影响strict与生产包类型/声明，失败保存/定位，不安装或重跑模型；finally清除自有临时生成根。
- [x] 只读独立审查，修实际重要问题后按需复验；更新交接/roadmap、提交推送、finish精确身份/磁盘/残余。完整目标active，C—F仍须真实证据。

结果见 `docs/operations/tianwen-file-study-evidence-20261001.md`；附加strict旧47与基线一致而非整体通过，提交/推送准确身份和存储由运行finish.json保存。
