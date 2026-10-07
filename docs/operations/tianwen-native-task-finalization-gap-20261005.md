# 主动模拟发现 Task 收尾缺口：准确结果与后续责任

## 授权与当前结论

所有者再次确认：缺少失败、反馈、后续任务或其他开发条件时，由执行者主动设计并模拟触发，以实际效果推进整个项目。无需等待自然发生、向用户索题或将场景准备记成 blocked。主动注入故障是允许的；把未发生的结果写成成功、把模拟反馈写成真人反馈、事后改判旧结果仍不允许。这是验证方式的调整，不增加发布标准。

完整目标保持 active。main/Daily 完整自动学习仍按原门槛 NO-GO，R9 和原十工作日窗口保持。本次不声称学习改善或产品修复已经交付。

## 唯一正式批次

- 原冻结 HEAD：`449241530ffa80275a06dff9c4d702560b66e116`；23 个冻结代码/发布文件核对未变。
- 原材料与首结果：`D:/DevData/tianwen-real-null-state-learning-20261005`；独立运行 home：`D:/DevData/tianwen-development-runtime/real-null-state-learning-20261005`。
- 20 次真实请求及 20 条完整原/实际请求轨迹；两个原生 Task。第一未来基线生命周期 complete，但固定独立检查 rejected；不能把它改写成通过。
- 第二未来基线给出了正确 pending 答案，但未调用 Goal 结束工具。原 Goal/Task 仍 active，没有 acceptance；不是完成或失败的 Task。原请求工具清单含 get_goal/update_goal，模型声称无工具不能当作实际环境缺工具。
- 八分钟观察点保留原句柄；原三十分钟总预算结束后 CLI 1，原取消/排空成功。没有重启或补评旧任务。
- 0 训练、合格学习来源、研究、激活、方法后续效果、反馈。第一基线没有学习分析同意，独立内容评审 pending 符合原配置。

## 定位结果与被否定的修复

零真实模型的原生 CLI 诊断证实：Goal 在 agent/created 创建后，SDK 的 agent/session-start 会将 activation 设为 disarmed。漏掉结束操作的 Task 随后以正常 turn/end 退出，而 continuous host 只自动处理明确 complete/block，没有接续未收尾 Task。

尝试重新启用 Goal driver 的隔离候选通过 3 个定向控制及源码原生回归 53 通过/9 原条件跳过；但实际 CLI 中第二轮被 continuable 子 Agent 的生命周期管理器 disposed，随后 Goal paused。该候选因此没有合入或作为修复交付。单独 Agent 的通过不能替代实际 continuable 环境。原候选、失败诊断及日志保存在下述诊断根和本批证据内。

## 可用恢复接缝已实际验证

`D:/DevData/tianwen-native-goal-closure-diagnostic-20261005` 的最终 `first-result.json` / `cli-result.json`：原生 CLI 退出 0，0 真实模型调用、5 次 scripted 请求（其中原 Task 4 次）；原 Task 第一回合正常退出后，通过既有 `NativeLongGoalChild.followupTask` 冷恢复同一个 child/Goal。模型经真实 get_goal 和 complete_long_goal_task 完成原 Goal；Goal 变更只有 create/complete，两次输出相同，没有替换答案或新 Task。

这是公共 SDK 接缝的实际运行验证，不是自动流程已接入，也不是模型自然漏收尾后一定能恢复的效果证据。诊断前几个操作员错误和不成立的 re-arm 结果各自保留；不把错误启动算模型问题。

## 下一实现：同一 Task 自动收尾

执行 [既定次数内的自动收尾计划](../superpowers/plans/2026-10-05-tianwen-native-task-finalization-plan.md)。通过 continuous host 原串行 lane 和现有 continuable followup 恢复原 Task，不再启用与子 Agent 管理器冲突的独立 Goal driver。正常结束但 Goal 尚 active 时自动接续；暂停、取消、错误、完成、权限变化和身份变化按原状态处理。

收尾消息必须由宿主持久接受，带固定 coordinator 来源/原父身份/明确收尾标识；计数从原 Session 日志读取，不使用不统计 coordinator 回合的 roundsStarted 冒充次数，也不在冷恢复时清零。上限沿原 maxTaskRounds。宿主不手动 complete、不修改独立裁决，不让生命周期恢复改写旧实验首结果。

先用主动模拟漏收尾、持续漏收尾、暂停和权限变化验证实际原生运行，再执行新身份的短真实任务；确认任务能够自动结束后继续原受控学习阶段。需要的场景和数据全部由执行者准备，无用户动作。

## 资源

本批 final-audit 已确认原三账本摘要和 84 个原容器保持，自启 Docker 已停，保护的 77 根与 denied 根未触碰，无依赖副本。仅清理已保存证据的自有临时工作树、共享依赖链接和精确重复阶段副本；最新清理和 D 盘空间见本批 final-cleanup.json。D 盘 >=15 GiB，20 GiB 偏好未达到，不以删除受保护记录凑空间。
