# 检查环境准备不消耗模型尝试；新真实研究未取得改善

所有者允许主动构造失败、反馈、重复样本、后续任务和环境。模拟来源可以支持开发，实际效果需要执行后如实记录；不等待自然问题、不索取可自行设计的输入、不增加正式发布条件。

## 实际运行

首先在原 DEV profile 新增一项空串状态模拟错误 Task：26 实际请求/26 完整轨迹，5 显式训练注入另记，Task complete/独立 rejected。操作员冻结了错误来源组合，实际 Loop 选择旧 null 与新空串，而 host 绑定旧第一失败与新空串。检查环境准备返回 undefined，案例设计模型调用为零，却已写入 case-design-attempt。原首记录保留，不重判或删除。证据：`D:/DevData/tianwen-live-captured-proposal-20261005/final-audit.json`。

随后仅接续另一尚未尝试的旧第二失败与新空串来源对，没有重跑原九项 Task、没有新训练。113 实际请求/113 完整轨迹，真实提案看到了两个原失败交付/验收/检查；一次提案调用成功调用 structured_output，记录了候选。本次实际提案不需要 captureReminder，不把脚本提醒控制称为实际提醒触发。原五案例十臂全部运行，无方法 4/5、有方法 4/5，两者都失败于 holdout，原 dev-paired-any-case.v1 裁决 rejected，0 激活、0 方法后任务、0 撤回。CLI1 是原执行器报告未激活，原句柄已排空。证据：`D:/DevData/tianwen-live-captured-proposal-resume-20261005/final-audit.json`；study `guidance-study:072c52246366489757707a97b9b4769d72eaf7b06bc3f4a91c81337fde2c8f6a`。

holdout 当前版本缺独立评审，正确结果 pending；两臂实际都给 failed。候选推理把投影器改写后的 legacy prompt 视为原任务，把嵌套 callerContract 视为试图覆盖任务。两次原来源的显式错误注入与匿名 holdout 的指令投影结构不同，造成权限表达歧义。这是后续模拟环境需要改善的设计，不能因此把原失败改成通过。下一转真实代码文件与明确原合同，用可执行输出核实效果。

## 产品修复

case-design-attempt 的原写入移至 host 检查环境准备成功后、首次实际设计调用之前。原 ID、材料摘要和持久化格式不变。环境不可用、准备期间撤回不消耗模型尝试；环境恢复后，原事件可用同一批来源继续，无需新增 Task。实际 provider 失败、无效答案、案例漂移仍先记尝试，防止重复调用。没有自循环、自动重试框架或旧历史迁移。

原 SDK 控制新增准备失败后接续：missing/retry/cancel 三项 RED 均确实失败于错误保存尝试。修复后针对性源码 13 通过；原 Runtime 14 顶层/15 实际构建阶段均退出0。首次发布检查误用 runtime-temp 作为 DEV 根，10通过/3被原边界拒绝，首日志保留；执行者改用原 canonical D 根后，发布13全部通过，包含 hot/cold 原公开入口。完整发布 native profile 50通过/10原条件跳过，exit0。限定只读复查无有据 P1/P2。没有安装依赖。

凭据均在 `D:/DevData/tianwen-live-captured-proposal-resume-20261005`：`host-preparation-attempt-red.log`、`host-preparation-attempt-source-green.log`、`published-host-preparation-build.json`、`host-preparation-attempt-published-green.log`（首配置错误）、`host-preparation-attempt-published-canonical-root.log`、`host-preparation-native-profile.log`。

## 下一环境已首次执行

`D:/DevData/tianwen-controlled-legacy-index-env-20261005` 保留五角色冻结 Python 前像/原合同，操作员预设“先按旧状态分组、再检查撤回”缺陷，没有手写学习候选。原公开隔离工厂实跑 source1：第一功能例拒绝并停止，不能称33例全跑；正常 counterexample 33/33通过，模型调用0。这证明环境可执行、能区分缺陷与正常对照；它不是 Worker 失败或方法改善。下一按原合同让真实模型做文件任务，主动模拟缺失条件，再沿原研究/启用/后续输出/撤回流程检查，不新增验收门槛。

## 资源和结论

两真实批在产品修改前分别核实35消费者、三旧账本、原 profile 前缀、原来源/结论/旧停止保持；84原容器身份保持。Docker已停止、各原句柄排空。只删除两个内容已核对的精确重复输出，清669,042字节；首结果、完整轨迹、旧尝试与停止保持。无依赖/环境副本，D约17.02GiB，大于15GiB，20GiB偏好尚未达到。

完整自动学习目标继续 active，实际方法效果尚未完成。main/Daily NO-GO、R9及原正式条件保持，不机械标记 blocked、不把环境设计或执行问题交回用户。
