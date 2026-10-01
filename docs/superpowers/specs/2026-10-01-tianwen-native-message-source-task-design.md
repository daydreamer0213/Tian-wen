# 新实际待办：原生测试消息来源补齐

## 当前证据与边界

基线9bf7fb5，正式持续DEV仍原两失败任务、0研究及awaiting-compatible-sources。上一轮checked失败来源消费者已经交付，但D没有当前合格五案例合同；不扩空结果接口或重复语义模型复核。只读扫描18个小型真实测试发现conversation-task-material.spec.ts:46的原生Session合成AssistantMessage缺source，TS2741。此测试确实验证任务材料的来源/投影行为，属于实际开发待办，未预先修改目标。

设计审查接受一次真实普通DEV任务，明确不是D完成或自然学习收益。上游AssistantMessage.source要求ModelMessageSource(kind/model/provider)。当前消息没有真实provider/model历史；事前固定合成测试标识kind=model、provider=tianwen-test-fixture、model=surface-projection，不称其为真实模型的历史消息。

比较直接控制端修复、只编译即可放行、通过持续原生入口执行且有限保护。选择第三种：现有可信TypeScript冻结manifest检查加局部AST保护，真实结果未知、一次正式尝试、候选外标准。不是因为脚本场景易通过而缩小完整学习目标。

## 原要求与完整有限合同

只修tests/dsh-migration/conversation-task-material.spec.ts中surface-projection测试、id=answer-1的message新增上述完整source对象。字段必须是三个准确字符串，禁止通过断言或计算表达式伪装。移除唯一新增字段后，原AST、注释、消息内容、所有数据和断言完全保持；可整理此字段附近的空白，不删/跳过测试、不增加屏蔽或其他文件修改。目标单独strict/noEmit为0，候选不执行。

新增source是运行时字段，emit JS会改变；不复用旧纯类型任务的相同emit条件。该有限任务的编译与精确结构保护足以核对所宣称的这项修复，不证明一般代码功能或语义安全。原生任务必须完整read/edit及文件结果可恢复，原准备/输入/请求/实际模型/候选摘要绑定保持；missing/changed材料拒收。

## 执行和停止

复用D:/DevData/tianwen-development-learning-20261001正式runtime及既有有效DEV同意，隔离true；新session，不导入旧任务。exposeCapturedFileFacts=false，复用上游restrict配置只允许原生read/write/edit，已有学习控制工具单独记账。仅目标允许读写，最多8根模型请求、12工具尝试、总32分析及根请求、12分钟，已有提供者0重试，不新增安装或下载。

先固定原文件/依赖/要求/代码及检查摘要，预检0模型。一次执行后独立程序结果与原模型review分别记账。失败保留原生task与候选，等待取消/写入终止后精确恢复原目标；不得重试或控制端修稿冒充原生交付。成功后只核对原样候选，现有3项测试、strict及只读审查通过才工程接纳并推送开发分支；不回填模型评价。

若verified+met，仅可报告一项有限普通任务或潜在成功对照，原两来源与五案例合同缺口仍未解决；不造反馈、开启预编排研究或解隔离。main/Daily完整学习NO-GO、完整目标及原十个工作日决策窗口保持。生成物D:/DevData/tianwen-next-result-basis-20261001；原生快照压缩，正常清掉新自有副本，D须15GiB以上、优先20GiB。
