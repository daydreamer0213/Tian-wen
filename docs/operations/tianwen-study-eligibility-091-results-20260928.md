# E091 前瞻结果：第二条未来写法未通过反馈类别门

本轮在新 `D:/DevData/tianwen-study-eligibility-091-20260928` Web Profile 中，使用提交 `6111d665e13c9e6b83abb988e5d5d71d4ec6d641`、正式运行包 SHA-256 `422cb3adb11ba1b7285f3bdda2f8a3c73f5f287a2767e1e29b874a20cc98ea11`、DeepSeek-V4-Flash / High 和 `familyVerification: true`。首次模型调用前冻结了完整协议、桥衡 S1、海澄 S2、安沄 C、开场、同意与撤销文本；冻结文件 SHA-256 `a3505c7201327dec7113c8c5296f117aa5259b6c444789474f01e9907b842382`。C 仅冻结，未发送。方法激活隔离一直开启。

桥衡 S1 原答准确分开 17 项中的 11 项已完成、4 项等待性能复测且未裁决、2 项已验证失败，保留联合集成完成、公开试点未开始和日期未定；单段且无建议。海澄 S2 原答准确分开 26 项中的 18 项已完成、5 项待隐私审查且未裁决、3 项已确认失败，保留内部演练完成、对外迁移未开始和通知日期未定；单段且无建议。两者均准入 `summarization/text`，原生双审分别 `met/met`。

各自读到答案后才另冻未来写法反馈。S1 反馈准确关联 S1，准入 `conversation/preference`，独立评估为 `preference/user-preference`，生成四条可观察的以后适用标准。S2 反馈也准确关联 S2，准入 `conversation/preference`，主回复严格为“收到”；但独立评估将原话“今后同类进度摘要也按两句写……刚才海澄稿不必重写”判为 `requirement-change`，`category:null`、无补充标准。其原生解释承认反馈只面向以后、无需重写旧稿，却称之为新的前瞻交付要求。它与事前冻结的两条 `preference/user-preference` 来源条件不符，不能凑研究资格。本轮按协议停止，未发送 C，研究 0、方法激活 0、未来任务 0；不重跑或回判 E091。

原生审计 [`native-use/evidence/audit-final.json`](D:/DevData/tianwen-study-eligibility-091-20260928/native-use/evidence/audit-final.json) SHA-256 `9abd91357fb1194a4cc82f9e77cba8673411a2a69e311e6354f9ebfc9d07d562`，`allExpected:true`：冻结文件、配置、包与源码构建哈希吻合，7 条直接输入各一次、无额外输入，17 份原生 Session，空工作区，同意 `revision:2 / enabled:false`，宿主已停。原生准入、任务族票与反馈结构化工具证明审计 [`audit-proof.json`](D:/DevData/tianwen-study-eligibility-091-20260928/native-use/evidence/audit-proof.json) SHA-256 `e817a0612fc20ae5348b117aeb288a02db408eee9d3f6646207dde3a28dd7fdc`，`allExpected:true`。第二份反馈评估证据的 Session ID 为 `02fe0470-8efc-4605-9398-e17e312343ce`。

工程定位：`conversation-observer.ts` 已明确“只针对以后同类任务的长期写法，即使用需求语气提出，也算偏好”；独立反馈评估原指令只说“长期个人偏好算偏好”，没有当前交付物与未来重复任务的明确边界。后续开发分支只对反馈评估指令补这一边界，未改旧评估、研究选择器或账本。定向测试按先失败后通过执行；相关四组 **176/176**、八包 TypeScript 构建通过。**这仅证明指令已送到独立评估模型，不证明新模型一定会照做。** 下一次必须换新材料和 Profile 前瞻验证，再分开检查研究、语义安全、方法激活和后续效果。main/Daily **NO-GO**。
