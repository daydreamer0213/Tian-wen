# 文件执行预算说明与旧证明恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将既有 8 请求/12 工具尝试限制提前告知文件 worker，同时保持既有证明精确恢复；作为新实际开发任务使用普通 external/code 接线和候选前 TypeScript 检查，不重复上一失败任务。

**Architecture:** 只修改 conversation-file-trial.ts 的宿主指令及证明恢复。新运行输出当前预算说明；恢复只允许当前指令和原有无预算说明指令两种完整格式，仍要求保存事件、证明、原材料、方法、配置和输出精确匹配。沿用原上限、守卫、路径、收据格式和治理，不增加新存储或执行接口。

**Tech Stack:** 现有 TypeScript 6.0.3、DSH 原生 read/write/edit、Vitest；不安装依赖。

## Global Constraints

- 原十工作日决策窗口和完整目标不变；main/Daily 完整学习 NO-GO，新方法激活隔离。
- 一项新实际任务、一次正式原生尝试，提供者重试 0、64K/high、12 分钟截止；任务失败不重跑求通过。
- 主任务只读写 packages/tianwen-runtime-bundle/src/conversation-file-trial.ts，不改测试/计划/检查器。宿主控制端先固定检查与来源；无候选预写。
- 所有运行文件在 D:/DevData，新副本收尾清空，保留小证据；D 剩余不低于 15 GiB，优先 20 GiB。
- 编译器通过仅表示固定上下文的类型结果；机制回归/源码审查另行核验本需求，不声称研究、反馈、方法采用或完整语义安全通过。

## 实施

- [ ] 生成当前原指令的一个机制测试收据夹具，固定真实持久事件及其摘要；这是 scripted 机制夹具，不是自然任务或学习效果，不重跑历史失败样本。
- [ ] 写新文件/chat worker 指令反例，核验 8 model requests、12 tool attempts、拒绝尝试计数和仅供给路径可访问；核验旧收据恢复及旧原材料/方法漂移拒收。原代码先红后固定测试及夹具摘要。
- [ ] 普通原生 Agent 使用当前 ConversationFileObserver/ConversationObserver、明确 externalCodeArtifacts 与 TypeScript 项目检查，首次候选请求前固定合同；主任务只有一个目标可读写、无命令/网络/其他项目访问，保存实际原生和独立结果。准入不是控制端脚本填入。
- [ ] 首轮结果完成且原始测试、类型和源码审查通过才原样采用；失败保存原始结果。若需要控制端工程修复，另记归属，不追认为原生成功。
- [ ] 受影响机制回归、严格类型、独立代码审查、差异检查；更新交接、提交 DEV，不合入 main 或安装 Daily。

## 原需求

新 instruction 在原输出要求后加入英文说明，明确 at most 8 model requests、12 tool attempts、Rejected tool attempts count、Only supplied file entries are accessible，并要求在上限前完成实际写入和最终答复。数字来自既有 MAX_REQUESTS/MAX_TOOL_CALLS；不提高限制，不承诺能保证模型遵守。

恢复兼容必须是完整原指令或完整新指令，不能根据原生保存文字任意重建标准、忽略 requestDigest 或放松其它身份校验。当前/旧两种证明仍需唯一 user message 与其精确匹配，伪造预算或任意修改指令不可接受。保持现有 API/收据 schema，不改变 parent policy、材料/路径、取消、工具成功证明、清理和模型配置规则。
