# 同一原生 Task 自动收尾计划

## 已知问题与范围

null-state 批 20 请求后因第二 Task 未结束而耗尽原总预算。get_goal/update_goal 实际存在，但模型未用；正确答案不代表 Goal 已完成。实际 CLI 已否定重新启用独立 Goal driver，且已验证既有 followupTask 能冷恢复同一 child/Goal 并由模型结束。完整原证据见 operations/tianwen-native-task-finalization-gap-20261005.md。

所有者允许主动模拟缺少条件及故障，适用于整个开发。本计划由执行者准备场景和环境，不等待自然样本、不索题、不将环境准备机械记成 blocked。只修生命周期衔接，不增加学习或发布要求。

## 实现

1. 在 continuous-goal-host 的公开 session/event 上识别真实正常 turn/end；经现有串行 lane 处理。仅原控制 running、当前同一 Task/epoch/child/Goal、Goal active 且未有收尾消息在途时允许自动接续。完成、暂停、取消、错误以及权限/身份变化不续发；重新核对现有权限尝试状态。
2. 复用 NativeLongGoalChild.followupTask 和原父恢复入口，允许驻留或已退出后的公开冷恢复。避免旧 Agent disposed 引用、私有 SDK API、另一个 Task/epoch、另一个 Goal driver。提示只要求读取原目标、核实已有交付并执行结束操作；不要求重做或优化答案。
3. 固定宿主收尾标识、coordinator 来源和原父身份。以 Session 中实际被接受的收尾消息及原 turn 事件持久计数/去重；冷恢复不能重置。收尾次数受原 maxTaskRounds 限制，达到原上限须明确记录原 Task 尚未完成及停止原因，不能靠不断跟进绕过上限。不能用不统计 coordinator 消息的 roundsStarted 代替此计数。
4. 不由宿主手动 complete。followup 返回只代表消息接受；原 Goal 真实 complete/block 和原独立验收仍分别观察。旧批首结果不补评；真实效果验证用新身份，保留第一实际结果。

## 固定验证与收口

- 主动模拟模型首回合漏收尾、下一回合正确结束：同一 Task/child/Goal，原交付保持，真实 completion 后进入原验收；原生 CLI 有据退出和排空。
- 主动模拟持续漏收尾：原上限内接续，达到上限明确停止；没有第二 Goal/Task 或无限循环。
- 正常完成、用户暂停/取消、权限变化/拒绝、错误和身份变化：不发生不当自动续发；冷恢复后的计数保持。
- 定向源码回归、原发布构建及有限独立审查；实际 continuable CLI 验证必须通过，不能以单独 Agent 测试替代。
- 新身份短真实任务验证普通任务自动结束后，继续原三训练、五案例十臂、四未来、同意撤回的受控学习路径。阶段效果分别记账，沿原预算/停止条件，达到即收口，不再追加验收标准。

生成物放 D:/DevData，依赖复用，不复制完整环境。保留必要原轨迹/错误；删除自有重复及已保存的临时 checkout。D>=15 GiB、尽量20。完整目标 active；main/Daily NO-GO、R9、原发布门槛及十工作日窗口保持。
