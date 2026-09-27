# E069：新证据项引文协议经真实方法评审触发，方法研究仍未通过

**结论：main/Daily NO-GO。**本轮从准确提交 `7e85482428c7f6ce6016ae05a833e6739621d42f` 打包，在全新隔离配置档和 DeepSeek-V4-Flash/High 下，按事前冻结顺序完成两份普通项目摘要、各自读后持续偏好和一份独立成功对照。研究在对照任务终态后自动打开，完成候选方法及五组各两臂的前瞻试验。新纯文本方法评审的证据项引文协议确实到达真实模型：20 份方法评审均带 `tianwen.evidence-item-quotes.v1` 标记，所有被原生结构化工具接受的 `evidenceQuotes` 都是本题完整证据项；两次把旧反馈原话填入该字段的尝试被工具直接拒绝，随后模型重试。**这验证了新协议在本轮真实模型调用中的边界，不证明候选方法有效。**

研究最终 `study-decided / inconclusive`，没有 `guidance-activated`。来源 1 基线 `not-met`、候选 `inconclusive`；来源 2 基线 `inconclusive`、候选 `met`；对照和相邻案例的基线与候选均 `met`；留出案例基线 `inconclusive`、候选 `not-met`。留出候选虽未见虚构发布或生产状态，却写了 **378 个非空白字符**，超过冻结的 300 字上限，两名评审均判 `not-met / instruction-following`。另有对事实和风险应分在哪一句的评审分歧。十个臂齐全，但包含多个 `inconclusive`，产品按既定裁决规则不能采纳；冻结的后续任务 F 没有发送。不能把来源 2 的局部改善当作方法已改善未来任务，更不能以本轮代替实际产品发布验收。

这轮材料是明确标记的**受控演练项目状态**，S1/S2/C 互不相同，不是外部真实项目。S1、S2、C 各被准入为 `summarization/text`，各有两份有效原结果审核 `met`；普通摘要未用文件或命令工具，隔离输入目录终态为空。S1/S2 的读后反馈分别准确关联原摘要并评为 `preference / user-preference`。研究来源恰为 S1/S2，对照恰为 C；研究打开时间 `2026-09-27T05:27:02Z`，晚于 C 审核终态 `05:26:49Z`。本轮独立检查试验答案未发现新增上线决定、把测试环境说成生产验证或把待查问题说成已解决；这项人工检查只覆盖 E069 的十个答案，不抵消 E068 的双审语义漏判，也不构成普遍语义安全保证。

运行目录 `D:/DevData/tianwen-acceptance-runs/069-item-quotes-bounded-summary`。首次模型调用前冻结的 `freeze.json` SHA-256 为 `36ef572ac35a6b297e250ed463674e355ead876ef37ffbbc6a89cf8297001f9e`；运行包 SHA-256 为 `d9709224b63627fef71d551df2f83a1c720d4fd49c7e0d90abd9fe9f37a195f4`，安装后的 `dist/runtime.js` 为 `7b38835efe729ea17c64bb9d746d1c8bd5402d026f48e7af1f49c1b57ecacc4d`，均与冻结值一致。只读审计覆盖 **53 份原生 Session、61 次工具调用**，其中包括任务、准入、执行、反馈和方法评审内部会话；冻结的 S1、反馈 S1、S2、反馈 S2、C、同意开关各出现一次，F 为零次。终态账本 SHA-256 `4970dd6a3c58ac87a4dbbf18043e58d2ca9420438a9bae5c8324c4f4c0ec4cea`；原生会话审计 `native-use/evidence/audit-069-native.json` SHA-256 `e40e7d196b9a102eca79cf8dd8e70fc9e1e02c0dd5b43db0dabac7868a184908`；冻结字节审计 `native-use/evidence/audit-069-freeze.json` SHA-256 `5617af27abdc45b6f2f76e8cfa25cf756534d3442cdf7354252ae43a135688d2`；方法评审审计 `native-use/evidence/study-review-protocol-069.json` SHA-256 `3b70dbde0d8c8882b37b6292cde54388893cc26ac17258ce135b47eb90770424`。审计中另有三次结构化工具报错，不能仅凭错误总数断言其都与反馈误引相同；上述两次反馈误引有各自原生拒绝记录。原生持久化上下文没有保存完整工具模式，协议核对使用了标记、提交参数、工具接受／拒绝和账本复核，不把模式本身的不可见部分冒充为已直接读取。

同意从 revision 1 / `enabled:true` 关闭为 revision 2 / `enabled:false`，关闭后状态复读仍为 false；该开关作用于本轮独立 profile。host PID 12716 已停止，测试页面已关闭，历史记录保留。

下一步分开处理两类问题：一是 E068 中把两轮样本概括成“链路已稳定”却被双审放行的语义漏判，需要有针对性的前瞻安全门；二是 E069 中方法候选在留出任务超出硬字数和评审分歧，需改善候选对用户硬约束的遵循及裁决证据。先做窄范围工程诊断和失败用例，再从新准确提交、新隔离档验证；不回判旧样本，不用重复旧题凑通过率。只有方法真实采纳、激活且语义安全核对通过，才执行新的后续任务效果验证。
