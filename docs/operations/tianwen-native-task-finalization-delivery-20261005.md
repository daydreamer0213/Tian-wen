# Task 自动收尾实现交付与下一受控学习批

## 当前结论

已交付 Task 漏收尾的自动处理：只在原生子任务正常结束一轮、同一任务仍 active 时，用现有公共 followupTask 入口继续同一 child/Goal，让模型调用原 scoped 完成工具。宿主不代写答案或完成结果，不重启独立 Goal driver，不依冷日志打开自动续跑。缺场景主动模拟的授权适用于全部开发；不等待自然问题、索题或机械标记 blocked。

这次收口的是生命周期工程实现，尚不是学习效果完成。旧 null-state 批 20 真实请求的原首结果保持；不补评、不追记学习来源。完整目标 active、main/Daily NO-GO、R9、原发布条件和十工作日窗口保持。

## 实现与实际发现

continuous host 在原串行 lane 内处理正常 turn/end，并在 continuable store 释放前保存原 Session。自动收尾核实原任务、epoch、child、Goal、Planner/main、原权限与控制状态，按同父身份的原 inbox 接收事实去重和计算续轮。原 maxTaskRounds=3 是初始开场后最多三次续轮，包含已有普通冷恢复；达到上限保留 unfinished 与 max-task-rounds 原因并暂停自动推进，不伪造 complete。

独立审查复现并修正显式暂停排队的问题：暂停和相关权限/取消变化立即取消在途收尾。实际 CLI 又暴露正常 Planner 报告轮释放造成的实例误拒，以及已有普通 coordinator 冷恢复漏计。第二次异步检查期间正常释放也有独立 RED：只在原 Planner 已不登记而原任务/权限仍有效时，通过公共入口有界重取一次；不同驻留对象仍拒绝，不无限循环。限定复查未发现剩余有据 P1/P2。

## 当前验证

证据根 `D:/DevData/tianwen-native-task-finalization-20261005`。

- 新控制先 RED，最新三个源码测试文件 138/138 通过；严格 runtime noEmit 和差异检查通过。原发布包 native profile 最终 49 通过、10 原条件跳过。
- 原构建全通过：原脚本十四个顶层命令，build:types 展开两项，实际十五个执行命令。不安装依赖。首次 pnpm 生命周期因 NO_TTY 在安装/清理前停止，另两次操作员命令解析错误原样保存；最终直接执行原已安装工具和原全部构建参数。
- `cli-success-r3`：原发布 CLI 0，17 scripted 请求，原 Task 三轮、宿主收尾标记一项；真实 get_goal/complete_long_goal_task 结束同 child/Goal，所有原 JSON 文本不变，排空成功。
- `cli-limit-r4`：CLI 0，17 scripted 请求，原 Task 四轮（开场加三续轮），两宿主标记加一次已有恢复，原 control paused/Task active，持久 max-task-rounds 原因，零 complete，排空成功。
- `cli-pause-r2`：CLI 0，三 scripted 请求、原 Task 一轮，native Task paused、零收尾标记/complete，排空成功。
- 以上合计 37 scripted 请求、零真实模型请求，没有独立答案验收配置，只证明发布生命周期机制。脚本不会把它们记为学习收益、自然反馈或来源。

原 `success-r1` 虽退出 0，但没有宿主收尾标记，属于已有普通恢复而非新机制证明；已明确排除。`success-r2` 的脚本在 get_goal 后丢失当前轮标记，`limit-r3` 把原字符串 guidance 当对象，均保留原错误并只修模拟器；`limit-r1/r2` 的真正产品问题及旧 RED 也保留。正式验收使用上述新身份，未修改旧首结果。

## 下一项已准备工作

[新学习批计划](../superpowers/plans/2026-10-05-tianwen-finalization-learning-followup-plan.md)：九项全新 cw-de 原记录、三训练/五独立研究案例十臂/四未来及撤回，故障与 null-state 批逐字节相同，完整 caller 合同两臂均可读。不另跑重复 pilot，第一新未来基线同时验证实际模型的自动收尾。原三十分钟总预算、八分钟观察点及学习效果判据保持；原自动控制已暂停时立即保存其实际停止原因，不无谓等到总预算。

发布提交后冻结原 HEAD、实际 Runtime/standalone host、新 helper、输入/故障/脚本/三旧账本，再零真实调用预检和唯一正式启动。分别记录任务结果、学习来源、研究裁决、激活、未来改善、语义安全及撤回；未发生真人反馈记零。问题由执行者继续定位、实现或主动准备模拟，不返交用户提供场景。

## 存储

生成物全在 D:/DevData，复用已有依赖和精确已缓存 Python 镜像，无下载或环境副本。77 保护根与 denied 根不访问。原 84 容器完整身份核验不变；Docker 本轮自启用于下一正式批，终止后自停。D 当前约 17.2 GiB，高于十五下限，尚未达到二十偏好。保留原首结果和必要轨迹，后续只清经确认的自有重复/临时数据。
