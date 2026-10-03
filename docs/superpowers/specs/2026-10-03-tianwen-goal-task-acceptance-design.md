# 下一主线：真实 Goal Task 的事前验收连接

归档工作包已收口。本设计对应原架构总览第512行已列出的实际缺口：普通 Goal-first Task 的自动 Outcome 必须先有真实验收合同，不能用 Goal complete 代替验收通过。本阶段补这项产品连接，不扩完整学习发布门槛。

## 当前事实与选择

conversation observer 在准入、模型、终止和恢复均只接 root/direct-user；Goal 原生 Task 是 parent/child + coordinator relay，这是有意保护，不是 P1/P2。已有 message feedback bridge 仍能对真实子会话用户评分接 LearningIntake，反馈并非全断。当前 Task record 只有 objective/execution，没有每项任务的完整验收和逐字原用户来源。

现 RunAcceptanceContract 仅支持 dsh-tool-result，Outcome analysis 另限定研究摘要/root/Skill用途。不能把独立 Node 结果直接冒充旧工具证据，也不能说接 Outcome 就已接自然 conversation 研究。

不放开所有子 Agent、不把 Planner 文本标为 user、不新增任务发生器或通用验证平台。选用既有 Goal 与独立结果机制，先补可信宿主事前合同及准确结果绑定，再按原消费者职责接学习。这个阶段不会授予研究来源资格或自动激活。

## 有限实现

先以一个新的实际 SDK 受控 Goal 生命周期证明现有行为：Task 可以结束但没有独立验收；任意子 Agent 不成自然来源；显式用户反馈继续可用。控制例只证明连接，不当真实问题来源、不重跑旧样本。

随后在实际宿主 Task setup 增加 caller-owned 可选验收准备。合同须在首个 Task 模型请求前固定，真值优先来自已有项目断言/测试，由开发宿主装配；不要求所有者编写验证器。Planner 可以分解任务，不能改原要求或提供真值。无合同保持现有 Goal 行为和“未核验”，不强迫普通任务改格式。

复用既有 taskId/objective/execution、attempt epoch/parent/child/permissionFingerprint、同步 nativeTaskSetup/admit 与持久事件。原目标来源必须追到实际控制会话的持久消息和边界，不能由 task.objective 反推人类原话；旧 Goal 缺的来源不回填。检查绑定原任务义务、输入、模型及检查器，重启只读原绑定；来源/权限漂移或取消按原停止职责处理。

终止后消费既有独立执行结果，分开呈现任务完成与 verified/rejected/unverifiable。记录的 owner/API 必须先按当前类型确定，不能强塞旧 dsh-tool-result 或预建证书/注册/调度框架。一个结果不直接生成研究、方法或“完整学习成功”。

## 正常、反例、失败

正常：有原目标来源及事前检查的真实开发 Task 被既有 Goal 启动，首请求前合同已冻结，实际文件/模型/检查结果准确绑定，后续规划可消费真实结果。

反例：Planner、任意研究/普通子 Agent、插件通知、仅 Goal complete、无合同旧 Task 均不能取得新来源资格；已有真实用户反馈路径保持。

失败：合同缺失/损坏/不适用或检查无法核验，原 Task/Goal 历史保留，结果准确未核验；取消原样记录，不补成功/反馈或热修原合同，不机械停下所有独立工作。

## 收口

先交付事前绑定与原结果分离的实际宿主连接：首红、相关回归、独立审查、一个新受控生命周期及准确冷恢复。随后以本来有用的真实开发待办前瞻，一次未知结果，成功/失败照实记，不为追失败追加近似题。阶段交付后立即收口，不不断扩配套维护。

仅用D:必要小型记录，复用依赖/Profile/镜像，D≥15GiB、偏好20GiB；不全量复制环境、不重开结束三公开练习。完整目标active/incomplete、原来源资格/同意/隔离/停止/十工作日决策期限及main/Daily完整学习NO-GO不变，不缩目标、不新增门槛、不承诺未证实的完成日期。

## 已据实际 SDK 时序确定的最小接口

`TianwenLongGoalHostConfig.goalTaskAcceptance` 是默认关闭的可信程序装配口。已有 `createContinuousRecord` 在正在执行的直接用户 `/goal` 创建时冻结原 command/run 的 session、command ID、seq 和摘要；原参数保留在 SDK 持久会话。没有当前实际命令的旧/程序 Goal 不回填来源，不用 task.objective 冒充原用户文本。

`llm/stream` 时首个 Agent-loop header/context 已由 SDK 保存；宿主在 provider dispatch 前调用 prepare，并在原 LongGoal v3 可选 tianwenEvents 中原子保存 task-acceptance-prepared。原 Goal/Task、当前 attempt/parent/child/nativeGoal/权限、header/preparedSeq/prefix、真实生效模型和可信检查器/原条件/输入均绑定；模型不能提供检查器。已有答复、旧请求、不匹配 lineage、准备过程中状态改变均不能事后准备。

终止后使用既有持久 Goal/session，不能依赖仍在线的子 Agent。实际控制证明 continuable child 完成后可从 live agents 释放。若仍在线先等 idle/flush，再取完整 terminal Turn；评估后复读原材料与来源。原结果存入 task-acceptance-finished，错误条件摘要或检查器故障为 unverifiable，保存/历史错误仍沿原 lane 报错，不能吞掉后继续规划。结果不写入旧 dsh-tool-result、不创建 Evolution 自然来源/研究/方法。

既有 runPlannerTurn 在新规划前等待验收并重读 revision；只读 status、Planner Started Task facts 和原完成通知显示持久验收。执行完成与检查通过分别呈现。缺合同原行为保持；冷恢复不重新 prepare/evaluate，已保存结果按原值读。当前受控验证的冷恢复是同进程新 Context，不能称为新 Node 进程或自然效果。
