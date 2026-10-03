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
