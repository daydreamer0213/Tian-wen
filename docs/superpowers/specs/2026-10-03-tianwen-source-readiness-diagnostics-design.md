# 学习来源就绪诊断

## 问题和边界

当前 aad0f685 的 readiness 只返回状态，learning status 主动丢弃其余字段。`awaiting-compatible-sources` 无法区分旧版本、external、不完整文件材料、没有可信问题来源或不能配对。正式 19 观察/18 完成/0 study，仍需逐条读账本才能解释下一实际工作。限定 C/D 静态审查未发现新核心缺陷，不能因此制造开发题或重跑旧题。

所有者已授权自主推进并要求不要重复标记阻塞或把问题退回。本项补齐具体只读决策事实，不把诊断算学习效果，也不以本项生成自然样本。原门槛、同意、隔离、历史、十工作日窗口和 NO-GO 不变。

## 方案选择

采用原 scan 同次收集诊断；不在外部脚本复制筛选规则（易漂移），不增加模型分析或通用遥测系统（没有必要）。默认 readiness 仍只返回 state；显式请求诊断时才返回有版本的有限计数。学习状态通过字段白名单投影这些计数，不能传递原始错误、任务内容、路径、反馈或来源对象。

## 数据与语义

诊断只针对当前 workspace：observedTasks；eligibleTasks（原筛选且文件材料成功恢复）；problemSources（原 support 成功）；successfulCandidates（原 met/proof/独立检查满足/无问题与负面反馈的对照初筛，不保证与任意问题兼容）；hasCompatibleProblemPair、hasUnattemptedProblemPair。

exclusions 为有序首个未满足原条件的互斥计数：consentRevision、behaviorVersion、qualityContract、feedbackTurn、family、evaluationMode、completion、modelConfiguration、fileMaterial。总数必须等于 observedTasks - eligibleTasks；不扫描其他工作区。保留文件材料无法恢复为排除，不重新评审或抛出私密错误。

pair 布尔值只说明原 scan 已确认的兼容不同输入 pair 及未使用 pair，原 ready/attempted/studied 优先级不变。成功候选不足或当前未知语义独立性不能由计数推断。disabled/unavailable 不返回伪造的零诊断。

## 验收

旧默认 readiness 各状态和选择行为完全保持；真实原筛选反例覆盖每个排除原因、other scope、可恢复/不可恢复文件、checked failure 与 met/功能冲突、配对、尝试和研究去重。status 只能输出封闭非负安全整数/布尔计数，拒绝附加字段、非有限值或无效结构，不泄露原始数据。读取前后 ledger 原字节不变；0 模型/研究/候选/采用。

完成针对性回归、产品类型检查、实际发行与公开读取验证及独立审查后记录结果。只复用 D 依赖，运行证据 D:/DevData/tianwen-source-readiness-diagnostics-20261003；不启动 Docker、不下载、不复制 Profile、不清除已被策略拒绝的目录。
