# E101：第二条真实反馈错连到第一条反馈，按冻结条件停止

全新隔离档 `D:/DevData/tianwen-scope-101-20260928` 在首次模型调用前冻结两份普通摘要、各自读后反馈、独立对照、同意开关和停止条件。源码基点 `84f7d7efe1db749c50e7fcc9bd02f9f17187ba68`，模型 DeepSeek-V4-Flash / High，空工作区、方法激活隔离；`freeze.json` SHA-256 `c3881eec0721bfe96ee9f26bbaa3c585f715b9c4a426013a0ff4d8d18a0d4934`，安装包 SHA-256 `8f3207509caf1431df1041ca4e13507c30b8f52c05775fbe870728c5c8f1a92f`。

霁衡 S1 与岑浦 S2 都准确写出总数、已完成、待复核未裁决、已确认失败及其他进展和日期，没有添加建议或预测；均为原生 `summarization/text`，各有两份 `met/met` 复核。S1 读后反馈关联 S1，准入为 `conversation/preference`，主回复仅“收到。”；独立评估为 `preference/user-preference`，四条未来标准逐条有直接原话支持，独立范围核对全部 `continuing`，两份原生证明可回读。

S2 读后反馈也只得到“收到。”，但原生准入把它的 `relatedTaskId` 指向 **S1 的反馈轮次**，而非 S2 普通摘要。S2 自身准入也曾错误引用 S1 反馈轮次。系统此前把已完成的反馈对话轮次放进候选“任务”列表，导致模型可选这个不合格目标。S2 反馈没有形成正确归因或第二份反馈评估；依冻结条件，没有发送独立对照 C，没有研究、裁决、激活或未来任务。不能把 S1 的通过与 S2 的双审通过拼成两条合格来源。

七条直接输入在同一根会话各一次，未发送 C；17 份原生 Session。冻结、安装字节、输入与账本终态的补充审计 `native-use/evidence/audit-final-v2.json` SHA-256 `291fe5e2e8e376fe4dc991af96516f2ce917b42e9e61831140692ab915533575`：`stopProtocolMatched:true`、`semanticGatePassed:false`。原生工具证明审计 `native-use/evidence/audit-proof.json` SHA-256 `ad2e3b6af99ae3fa1d2963fe16d9776198a3f34c0f8d60ded7c55e679ecc5ab5`：`allExpected:true`。初版终态审计漏计撤销同意轮次的 `task/other`，其 `allExpected:false` 原件保留，补充审计显式计入。学习同意终态 `revision:2 / enabled:false`，宿主已停。

开发分支随后把归因候选收窄为**已完成且准入为实际任务**的轮次；反馈对话不能再作为待归因目标。回归测试先红后绿，并覆盖模型即使返回反馈轮次 ID 也会被拒绝；观察器、反馈、研究相关三组 **114/114** 和八包 TypeScript 检查通过。这是工程修复，尚未用新的真实模型样本前瞻证明。E101 原始记录不回判，也不重跑岑浦材料凑结果。下一步从全新隔离档和新材料验证第二来源的正确归因，再进入独立对照、研究裁决及候选答案语义安全。main/Daily **NO-GO**。
