# 准入要求条数：暴露既有边界

一次新真实项目进展任务在190b6a1运行；根completed，但准入子会话先提交不完整JSON，随后原生structured_output捕获有效JSON、包含14条criteria。现有parseConversationAdmission最多12条，宿主拒绝，原准入invalid-judgment、review inconclusive，无文件收据；按事前条件拒收，保留原稿/会话/账本，不重跑或回填。D盘同一Profile冷启动保留准确失败，无模型/账本修改。证据在D:/DevData/tianwen-persistent-development-task-20261001/failure-audit.json。

问题不是新增验收标准，而是已存在的12条表示上限没有出现在准入指令/原生schema说明中；指令还要求各要求分开表达。选择仅说明现有上限，超过时把有关要求组合成可检查条目，同时完整保留明确限制/条件/不确定性/决策边界，原请求仍权威。conversationAdmissionSchema.criteria.description和ADMISSION_INSTRUCTION保持一致；反馈复核/文件复核继承相同指令。

不提高宿主上限，不截断criteria，不替模型拼判断，不额外重试，不改旧记录。DSH原生JSON schema子集不支持maxItems，故不添加不被支持的schema字段；description不是机械校验，parseConversationAdmission仍实际拒绝>12。也不改变原有每条长度/材料上限、family、文件输出或质量合同。

这是提示与既有协议对齐的有限修复，不保证模型今后按12条表达或语义完整。用现有普通observer、文件学习、ledger回归检查任务准入、失败后普通回答继续、原记录恢复和文件边界；不写只比较提示字串的镜像测试，不重跑本次自然任务证明有效。后续效果只在另一项真实任务自然运行时观察。目标/NO-GO/隔离/原十工作日窗口保持。
