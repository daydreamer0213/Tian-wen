# 显式模拟训练首结果与恢复流程修复

## 本轮首结果

在 `da8b4d355db837545f606993ec7f1e99dabc7655` 的原发布 Runtime 和 CLI 中，唯一 df-dn 批次已结束，原 CLI 退出 1、原句柄排空成功。111 次真实模型请求与 111 条完整原及实际请求轨迹，12 次显式 scripted 训练请求另存，不能计为模型错误或真人反馈。

四项事前未来基线为 3/4。前两项训练使用已标明来源的旧错误算法，原 Task 通过公共 SDK 自动收尾、原独立评审均拒绝，产生两项 checked-failure 来源。第三项正常训练保留原 passed 答案，但 Task/Goal 未完成，不能计为失败或成功来源；研究、激活、方法后续效果、真人反馈均为 0。原整体预算结束时停止，没有重启原 Task 或补评历史。

第三项 Planner 在第一次恢复中实际调用了工具，第二次却把 `exactly once` 理解为整个会话只需一次，正常口头回复后未认领本次恢复。恢复等待超时只报告错误，没有持久暂停；已处理的结束通知不会无限重试，造成 active/running 假象。这是具体产品恢复缺陷，不是缺少自然样本，也不需要用户再提供任务。

## 已有独立诊断

隔离公共 SDK 的 v3 诊断 0 真实模型：旧提示 6 次 scripted 请求、工具调用 1 次，第二次恢复报 `recovery was not claimed`；明确 THIS turn / earlier calls do not grant this lease 后，同样 6 次 scripted 请求、实际工具调用 2 次，两次恢复成功。证明本轮认领机制，不代表真实模型必然服从或学习效果。

原发布 finalizer 的失败停止回归，首 RED 为 1 失败/6 通过：原代码未调用停止；取消、权限变化、身份变化、新一轮、原 Goal 终结等守卫不得覆盖已有状态。公共 SDK 无逐轮强制工具选项或公开活动父实例保留接口，因此不另造驱动或调用私有 API。

修复已交付：工具说明与普通/权限恢复指令明确本轮重新认领；`recoverParent` 获取失败时，对仍授权、仍是原当前结束轮且无已接受或在途续轮的 Task 复用原停止入口，持久暂停并记录 `planner-recovery-failed`。原 Goal 不假完成，原错误继续上报，停止检查也失败时 AggregateError 保留两项原因。暂停前冷记录最后读取，再同步优先核实当前 live Session，避免旧快照暂停已经继续推进的任务。

本轮新增 12 项回归，实际公共 SDK 连续恢复与未认领停止先 RED；审查发现的旧快照窗口另两项先 RED，修复后相关源码三文件 154/154、严格 noEmit/差异检查通过。限定复查关闭该 P2，无剩余有据 P1/P2。最终原 15 条实际构建命令完成；最终发布包原生 profile 49 通过/10 原跳过，新增发布 finalizer 控制 7/7。

实际发布 CLI 两个新控制：`cli-success-r1` 16 scripted 请求、原 Task 三轮、一个宿主收尾标记，原 Task/Goal 完成；`cli-recovery-denied-r2` 11 scripted 请求、原 Task 两轮，第二次实际恢复未认领后原控制持久 paused，Task/Goal active、零伪完成。两者原 JSON/child/Goal 保持，退出和排空 0；共 27 scripted、0 真实模型，独立内容验收未配置，仅证明恢复机制。旧 dist 同一负向场景 `r1` 首 RED 为 control running 而非 paused，原结果保存，不补评。

修复前构建、最初停止回归、竞态 RED 与最终构建分别保留；早期基线文件名含138，但其实际日志为两文件134，不拿名称作测试通过数。修复不改变原三次续轮、30秒恢复上限、权限或driver，不重新裁决本轮学习首结果。

## 开发执行原则

所有者已批准主动模拟缺失条件，适用于整个项目：错误、重复问题、反馈归因、研究、后续任务、恢复和撤回都可主动构造。模拟允许触发原产品行为，也可用于开发验收；如实标明来源，用独立结果检查效果即可，不等待自然事件、不索题、不增加样本或门槛。真人反馈未发生就不伪记为真人反馈，不以这个缺项否定已证明的开发功能。

下一批 do-dw/6107-6179 新身份已准备，保持原错误算法/信息故障逐字不变、三训练/五案例十臂/四事前未来/撤回与原预算，控制8/8；提交后按原 CLI 零模型预检、唯一正式批推进研究与未来比较，不靠反复运行旧成功样本凑数。完整目标 active，main/Daily 当前 NO-GO、R9 与原窗口未变；受控工程结果和自然发布证据分别说明。

## 保存与清理

证据根 `D:/DevData/tianwen-real-injected-learning-20261005`：`batch-first-result.json`、两种原完整 JSONL、`drained-result.json`、`final-audit.json` 与原观察窗口均保留。29 个实际消费者、固定输入、三个历史账本未变，84 个原 Docker 完整身份未变，自启 Docker 已关闭。六份原 phase JSON 与首结果对应项逐项相等后删除，清理 2,106,091 字节；清理摘要曾因 Measure-Object 返回 null，另存 `cleanup-summary.json` 准确计数，不改删除收据。D 约 17.14 GiB，未安装依赖或复制环境，77 个保护根和拒绝路径未访问。

隔离诊断根 `D:/DevData/tianwen-planner-readmission-20261005`；早期 Windows 导入错误及旧 identity mismatch 诊断原样保留，v3 精确结果为其 `v3/diagnostic-results.json`。
