# 文本与读文件回答研究的独立结果检查

当前缺口经源码及独立复核确认：原检查仅允许 code/local-files/files，其他研究答案无法消费可信宿主的事前独立核验。它不是原有限设计的回归，也不是提示改写能解决的语义问题。此扩展仍属于完整目标中的证据消费能力，不替代自然反馈、案例独立性、研究裁决、未来效果或通用语义安全证明。

沿原五案例十臂、optional resultChecks 和 activation 守卫扩展，不增加模型裁判、默认授权、普通任务准入或发布门槛。原文件代码检查接口与无检查历史保持；新增显式 `text-material.v1` / `file-chat-material.v1` 输入模式，绑定完整原案例 materialDigest，而非空文件数组。文件/chat 还须保存原文件输入摘要并由 Ledger 核对原冻结文件图。文本完整原 request/context 或 prompt、原条件/质量合同/反馈标准都在 materialDigest 内，原生恢复另核真实证明，不能把字段名称当语义独立证明。

新增可信宿主 answerStudyResultCheck 配置与独立 prepare/evaluate 类型。五项全部在提案前准备；prepare 看原案例材料，不看候选方法或答案。两臂共用同一闭包，evaluate 仅收到原材料和实际原生答案/只读文件图，不暴露 arm role、方法或模型裁决。没有完整独立依据时返回 undefined 停止该研究。候选答案作为数据，不能当宿主代码执行；不添加一般自然语言 oracle 的虚假实现。

文本从原 recoverConversationTrial 按 worker material/模型/指导/输出摘要恢复；文件/chat 沿原文件收据。核验前后均重新核原证明，原来源/授权/父版本检查保留。冷恢复核已记录结果、证明和输出绑定，不重新准备、调用检查器或模型。原候选 verified、成功对照 baseline verified、原来源改善条件全部保持，不将事实安全单项检查冒充完整要求检查。

实现分层：先协议正反控制证明新模式绑定与旧身份保持，再可信 prepare/evaluate，最后原 Loop/公开 Runtime 接线、受控原生十臂及冷恢复验证。工程研究可证明机制，不能补业务来源或旧 R9 结果；不重跑旧模型案例。本轮生成物 D:/DevData，至少15GiB，77保护根不碰，无环境副本。
