# E066：对照选择前瞻修复通过，研究评审引文无效而停止

**结论：main/Daily NO-GO。**从修复后的准确提交 `fecc6baac079eb9e7deb3bda4c2e3bc693703d0f` 启动全新隔离档。两条不同的摘要 S1/S2 均为 `summarization/text`、各获独立双审 `met`；操作者在各自终态之后发送读后持续偏好，产品准确关联原任务并分别评为 `preference / user-preference`。发送独立对照 C 之前没有研究；C 也获独立双审 `met`，随后研究自行打开，明列 S1/S2 为来源、真正的 C 为成功对照。E065 的“反馈回复轮抢作对照”在本次前瞻样本中未重现。

研究生成一条候选方法：同类摘要优先给出当前结论和未决风险，再列证据，遵守当前请求的长度及只输出限制，不把未经验证的修复写成已经通过。它尚未形成有效试验裁决：第一份方法试验评审向原生 `structured_output` 成功提交 `not-met / user-preference`，但其四条 `evidenceQuotes` 中有一条逐字复制了先前反馈标准的原话。原话仅是评审标准，既不在本次任务请求，也不在试验答案的 `claimEvidence.items`。只读核验四条引文的允许性依次为 `false, true, true, true`；宿主据此拒绝整份评审，账本于 `2026-09-27T03:45:47Z` 记录 `study-stopped / invalid-judgment`。不能把未落账的模型意见当作有效试验结果。没有 `arm-recorded`、最终采用决定或 `guidance-activated`，冻结未来任务 F 未发送。

本轮根目录：`D:/DevData/tianwen-acceptance-runs/066-feedback-counter-guard`。首次模型调用前冻结协议、S1/S2/C/F、两条拟发反馈及配置，`freeze.json` SHA-256 `a251f6f877f976e5ff3e58621f424456e7696a2afab1562dd51046d96e60303b`。准确运行包 SHA-256 `32d4cc6a1e2eb395042a97b074f593e6fa43c537855a242860aa8098a619e271`；候选构建和隔离档安装的 `dist/runtime.js` 均为 `7516b8c2a98b8588f043a4fe28466dba282e5bb71c8cbad09f802a6164421053`。模型为 DeepSeek-V4-Flash/High。S1、两条反馈、S2、C 各自首次准入文本与冻结文件一致，F 在准入请求中出现零次；隔离输入目录终态为空。

S1 ID `conversation-task:9ef687befd9d53943d5e61dc9a6abbdc0ecf6c3ff18f730137c82a506883ef41`，S2 ID `conversation-task:f529c760037f4825f232b7cfd2d8dfec8137ac22eb64493780781512dacd5a3a`，C ID `conversation-task:7ae773392e43eb9171d55fa73dc4e4b2e31337d827b3630a99361bed5ab602c7`。研究于 `2026-09-27T03:45:03Z` 打开，三个 ID 与冻结角色相符。普通任务三份回答未见把材料中的未决状态写成完成；这只支持本次受控普通任务的窄结论，不证明研究试验答案或未来方法安全。

只读审计覆盖 22 份原生 Session、23 次工具调用，其中 21 次结构化提交、2 次同意开关。终态账本 SHA-256 `b137e68b1560dbb12cf26d71aeba3cabd7a8de6ece82b00d5322048c1952e22c`；原生审计摘要 `native-use/evidence/audit-066-native.json` SHA-256 `dc842c649daadb9d8b2507343d142ffa7174d6e8dc0134f745e3760d3e732782`；准入材料 `native-use/evidence/admission-material-066.jsonl` SHA-256 `05023c223d0e70f48cd485c58ae1f93f636f35d4686cd639a69fb7459a11ea59`。专门的只读原生核验脚本为 `verify-invalid-quote.mjs`，它解析第一份方法评审的原生会话及随请求送达的 `claimEvidence`，没有修改账本或回判结果。自动分析已从 revision 1 / `enabled:true` 关闭到 revision 2 / `enabled:false`，host PID 6484 已停止，浏览器页已关闭。

后续工程候选只对含反馈标准的**新方法试验评审**，在结构化引文栏明确提示只能复制本次 `claimEvidence` 的请求／答案原文，并展示这些原文的逐字示例；反馈原话不会作为示例。结构化工具只支持有限的 JSON Schema，不支持“任意原文子串、但排除反馈原话”的精确模式；曾试用枚举整句，却误拦合法短片段，因此已撤回。当前候选保留自由逐字子串及宿主原文校验，不更改历史评审指令；这属于降低模型误填概率的提示，**不是确定性防错**。针对性测试覆盖示例排除反馈原话和宿主拒绝非法引文；旧 E066 不回判。下一步从这个候选的新准确包、新隔离档做前瞻研究链路。采用、激活、未来任务效果及语义安全仍分别待验。
