# E088：简短确认通过，未来偏好被误标为需求变更

## 结论

全新隔离档的普通澄港摘要准确、为单段，准入初判和独立任务族核对均为 `summarization/text`，两份原生质量复核均 `met`。其后读后冻结的长期两句偏好被反馈评估正确归因到该摘要并提取未来标准；主回复严格只有“收到。”，没有重写、流程解释或建议。但作答前准入把这条“从下一份开始、当前不改”的反馈判为 `kind:task / family:writing / evaluationMode:text`，反馈类型标为 `requirement-change`，虽然关联目标正确。此前针对 `preference` 初判的二次核对没有触发。按事前停点，**反馈回合仍未完整通过**；没有第二同族来源、研究、方法激活或未来效果。main/Daily **NO-GO**。

## 冻结与原生证据

源码固定为 `ec51d7d19bee8e8bd29a9e7ffbad31856a53a7c0`，`familyVerification: true`，DeepSeek-V4-Flash / High。E088 使用全新虚构澄港材料和空工作区，旧 E087 未重跑。首次模型调用前的 `D:/DevData/tianwen-future-preference-088-20260928/freeze.json` SHA-256 为 `25965800db0a96a21107ce0326f61d85d39a7f9e0d2b29a48a1e755d07ab2304`；安装包 SHA-256 为 `69c9a82850df235e7152228a954c8b073811d99a6347dbde6b0f10d21747fc78`。

摘要请求只给出 27 项中 19 项完成、8 项待财务确认且未判通过或失败、客户演练结束、上线排练未启动、切换日期待定。主答准确保留全部状态，没有附言；初判及独立核对均为摘要，双审 `met/met`。看到答案后另行冻结读后偏好，`feedback-freeze.json` SHA-256 为 `21242496ccac3d104dfa7c6d9415de06616f9f70cf4315ac1019a8bd8bb28298`。偏好明确要求从下一份同类摘要开始固定两句、本次不改不重发且只简短确认。评估返回 `preference / user-preference`，未来标准五项且目标是本次摘要；准入原生结果却以“简短确认”为新写作任务，将长期偏好归为 `requirement-change / user-preference`。这是一条真实模型分类差异，不能拿后续评估的正确标签倒改准入。

终态只读审计 `D:/DevData/tianwen-future-preference-088-20260928/native-use/evidence/audit-final-v3.json` SHA-256 为 `d76a2aa80ed0e4aaf704be8014e5f09eef80d81bf5dfe230bb8ef9204e3516a7`：所有冻结输入、Profile、包和运行 JS 哈希匹配，五条预写主消息各出现一次且无额外用户消息，工作区为空；12 份原生 Session 中准入与任务族证明的哈希、实际成功结构化输出和直接请求引文相符。反馈评估 1 条，研究 0；同意已关闭至 `revision:2 / enabled:false`，宿主已停止。

## 修复边界

E087 暴露“目标已关联但 `preference` 被当作新任务”；E088 暴露同一未来偏好还可能被初判为 `requirement-change`。后续工程修复让 `requirement-change / user-preference` 的新任务也接受一次独立作答前核对；只有核对明确判为未来偏好对话、保留反馈原文和类别、且不改变原有目标时才转换。明确要求当前改稿仍须保留为任务。该修复不能回填 E088；完成工程回归后如再进行真实模型验证，必须冻结新档和新材料。研究、方法激活、后续任务效果及独立语义安全仍未验收。
