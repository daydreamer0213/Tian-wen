# E067：普通任务与真实反馈归因通过；引文提示未消除研究无效

**结论：main/Daily NO-GO。**从准确提交 `4a7389c235bb9a3dfb3fa284928510a73c28da6a` 的新运行包启动全新隔离配置档。两份不同来源摘要 S1/S2 均被准入为 `summarization/text`、分别获两份有效原结果评审 `met`；操作者各在终态之后发送事前冻结的读后偏好，产品准确关联原摘要，各自形成 `preference / user-preference` 评估。独立 C 对照也为同族、双审 `met`，研究只在 C 终态后 11 秒打开，明列 S1/S2 为来源、C 为对照。普通任务和反馈来源这一段有本次前瞻证据；研究没有形成有效裁决或方法激活，冻结未来任务 F 未发送。

运行目录 `D:/DevData/tianwen-acceptance-runs/067-method-review-quote-hints`。首次模型调用前冻结协议、同意开关文本、S1/S2/C/F 及两条拟发反馈，`freeze.json` SHA-256 `c9012741b1773c91d19195336338702f376aa89a297d0ef67f5a6145737ab7e3`。包 SHA-256 `60240ad4310bcb1faa1576ee6df8379c0a7782e406429324425640498919e836`；候选、打包和隔离档安装后的 `dist/runtime.js` 均为 `0c4e581245da402a7ab2f7db2b00a748a3393c93765b4aab08d4371805e25c94`。模型 DeepSeek-V4-Flash/High。终态复核中冻结文件无字节偏差，隔离输入目录为空。S1、反馈 S1、S2、反馈 S2、C 各有一次与冻结文本逐字一致的原生准入请求；F 为零次。同意开启另有原生工具记录，关闭消息在分析关闭前后留下两份相同准入材料，不计为研究来源或对照。

S1 ID `conversation-task:bf7c5a1447805ed9ab73792d918f65f5eb37e6fe61c47b15b261811cc006fb98`；S2 ID `conversation-task:5f5785f08e547ca462ffcdb3c35cdee5cc7f534b4a7dd3fec5a67a7952032eca`；C ID `conversation-task:77f46d4fdbf105970744fae73ce8aedd27657c2a5e57e161d739cd6debdba186`。三份普通摘要没有把历史材料中的未决状态写成通过，均只在聊天中作答。研究 `study-opened` 记于 `2026-09-27T04:28:07Z`，来源和对照 ID 与冻结角色完全一致。候选方法要求在项目摘要中先述当前结论与仍未解决的风险，再给支持证据，保留未通过、未实测等限定，不新增事实或行动承诺；这是候选文本，尚非被采用的方法。

研究只记录两项 S1 试验臂。无方法基线答案把结论压在最后，两位独立方法评审都有效判为 `not-met / user-preference`。有方法臂先说 NO-GO 与审核风险，但两位有效评审对 220 字上限的计算分歧：一位将正文算作约 247 个非空白字符并判 `not-met / instruction-following`，另一位按中文“字数”口径约 213 字判 `met`；宿主汇总 `inconclusive`。只读计算该答案有 254 个原始字符、246 个非空白字符。此臂不能证明方法让任务整体通过，也不应事后选择其中一种口径回判。

随后 S2 无方法基线的首位方法评审向原生 `structured_output` 成功提交 `met`，却在六条 `evidenceQuotes` 中再次复制了先前反馈标准的原话。只读核验前五条均在当次请求或答案的 `claimEvidence.items`，第六条不在；宿主按原规则拒绝整份评审，账本于 `2026-09-27T04:32:54Z` 记录 `study-stopped / invalid-judgment`。这一轮对引文栏新增的说明和原文示例没能确定性阻止误引；E066 同类障碍在新的前瞻样本中复现。没有后续有效试验臂、最终 `accepted` 或 `guidance-activated`，不能发送 F，更不能说学习已改善未来任务。

只读审计覆盖 30 份原生 Session、42 次工具调用（35 次 `structured_output`、5 次同意工具、2 次状态工具）。终态账本 SHA-256 `f5691d1cf077b58494960656ec85c821f79b6fecb0f121fd9680dd013c0c34d1`；原生调用摘要 `native-use/evidence/audit-067-native.json` SHA-256 `be51d1ddb19a1df33d9fb4cd3977543d90dce7cc6ee41171441c6e46fc5102b0`；准入材料 `native-use/evidence/admission-material-067.jsonl` SHA-256 `be3de1f631fc2d7c7aebe03dc967e2bbb13cf8eaf40fc602f404ce2b6b0346a1`；方法评审逐字核验 `native-use/evidence/study-review-checks-067.json` SHA-256 `4ffbcd606dc15c90cee9ec7213a66d845a8c50d867f5c4ef062263d14531602b`。同意从 revision 1 / `enabled:true` 关闭到 revision 2 / `enabled:false`，host PID 6860 已停止，浏览器页已关闭。

下一阶段先设计**结构化证据引用**：评审选择宿主提供的当次请求／答案证据项或受限片段 ID，宿主再解出原文，令反馈标准原话无法通过该字段；同时保留旧原生记录的恢复规则与完整事实审核，不用放松校验消除 `invalid-judgment`。先用小范围红绿测试覆盖合法短片段、反馈标准误引和旧记录恢复，再做新准确包的新隔离前瞻试验。采用、激活、未来任务效果及独立语义安全仍是单独门槛；E067 不重跑补齐。
