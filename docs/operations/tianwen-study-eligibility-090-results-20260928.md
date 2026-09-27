# E090：新研究自然打开，第八条试验交付无效而停止

## 结论

全新隔离档把两条不同摘要来源、各自读后反馈和一条独立成功对照接成同一范围内的真实模型研究。产品自行选对了两个来源与对照，并生成候选方法；七条正式试验臂入账，其中前六条显示两个来源及对照的 baseline 均为 `not-met/not-met`、candidate 均为 `met/met`。第八条（`adjacent/candidate`）执行模型只在普通文本里写了形似 `{"answer":...}` 的内容，没有调用 `structured_output`；宿主以 `invalid-judgment` 停止，不能把这段文本补记为有效试验。**十臂未完成、没有研究裁决、没有方法激活、没有后续任务效果，main/Daily 仍为 NO-GO。**

## 事前冻结与普通产品链路

源码 HEAD `161c9924a5f3042591d5ea100bcb8339cb11c7c2`，从原运行包所依据的 `4a11a01` 到该 HEAD 仅有文档变化。全新目录 `D:/DevData/tianwen-study-eligibility-090-20260928` 复用已验证的运行包字节，SHA-256 `422cb3adb11ba1b7285f3bdda2f8a3c73f5f287a2767e1e29b874a20cc98ea11`；首次模型调用前 `freeze.json` SHA-256 `fdabc0801d2448329ad8f12ab3da9a0c67253d6b3e8079c8ac5fd1b89ebbbda8`。模型为 DeepSeek-V4-Flash / High，`familyVerification: true`，产品方法激活隔离仍开启。开场、同意、松屿 S1、云栈 S2、南汀 C、撤销同意和停止条件均在首次调用前固定。两条反馈只在读到各自真实答案后分别冻结，冻结文件 SHA-256 为 `1c4aad81806e137877e1993255798e5444da5727d104685e32a80bed21d1007a`、`c53bac4e5e52784ce522c14c56dbb45099b2754bd29d1e46554dcb7c1ae8f1a9`。

S1、S2、C 分别在主界面的不同会话提交；原答案均准确保留总数、完成数、待复核未判通过或失败、已完成事项及尚未开始／未定事项，单段呈现，原生双复核各为 `met/met`。S1、S2 的任务族初判和独立核对均为 `summarization/text`。两条反馈都被准入为关联各自原摘要的 `conversation/preference`，原生反馈评估均为 `preference/user-preference`，提取的是以后同类摘要用两个完整句子、不加标题、保持待定状态的标准。反馈回复复述了偏好，但没有重写旧摘要或给出额外建议；两条反馈轮均未被选为研究来源或成功对照。C 在无不利反馈且双审通过后作为独立对照；C 之前没有研究打开。

研究 `guidance-study:2d73760c57b92f4b2ab5780541444a5838d4f89f1578c8565aa1ffd0e1961c2f` 的两条来源 ID 分别为 `conversation-task:96e2aa9b01683f0aef8904726b9aa9902f76e2b095456cb6240c39a1e4a2e311` 与 `conversation-task:76c5643a6d3b02d1516f79a22a879ec1c964387007fdacf00ccaa76d30edc401`，成功对照 ID 为 `conversation-task:895ce9e421aba2895111db87d266b2d21f9dc47d2b534df37c90b3b4d7874875`。研究类别为 `user-preference`。候选方法要求在当前请求未指定相反形式时以两句正文分开写完成数与待定状态，不加标题、不把待复核写成通过或失败，并明确让当前用户的不同格式要求优先。

## 试验与停止点

原生账本顺序是：S1 baseline `not-met/not-met`、candidate `met/met`；S2 同样；C 同样；`adjacent/baseline` 为 `not-met/not-met`。七条试验的执行 Session 均有唯一成功的结构化答案捕获，执行证明、答案摘要和账本一致。逐条读取完整答案时，前三个 baseline 主要违背未来两句偏好的形式，三个 candidate 均给出两句、保留数字和不确定性，未见新增事实。这个观察只涉及已入账七条，不能扩展到完整十臂或语义安全通过。尤其是事前生成的 holdout 明确要求整份摘要只写一句、不得强套两句偏好；该臂尚未运行，候选方法虽写了“当前用户要求优先”，但缺少这项冲突场景的实际验证。

第八条的执行 Session `42d32a22-a948-4109-887a-7efc0c1d2054` 摘要为 `sha256:be1c73d1681189c3a15ae40ebf91c6f84978600ceb91300c7f570b1bedbcd5b2`。它的普通 assistant 文本是 `{"answer":"本周核对的 27 项事项中，18 项已完成。其余 9 项等待合规评审，尚未判定通过或失败；内部迁移演练已完成；后端切换尚未开始；内部上线日期尚未确定。"}`，但原生 `structured_output` 调用数为 **0**。故该臂没有有效交付，账本在七臂后记录 `study-stopped / invalid-judgment`。不能把可读文本等同被工具接受的证明，也不能重启补足该臂或把七臂推断成 `accepted`。

## 终态审计与后续入口

`D:/DevData/tianwen-study-eligibility-090-20260928/native-use/evidence/audit-final.json` SHA-256 `cb6697f75d7b3407e5133dcfe8bfcf2e8782ad5d848755e188facae3b81c69f0`；它核对冻结材料、Profile、安装包与运行 JS 哈希全部相符，八条预写／读后冻结的直接用户消息各出现一次且无额外直接输入，46 份原生 Session、唯一研究七臂、无裁决或激活、空工作区、撤销同意 `revision:2 / enabled:false` 和宿主正常停止。补充的准入、任务族票与反馈评估原生证明审计 `audit-proof.json` SHA-256 `ef6037d01eda8072f4770ebdb33cbe8442a71ec7515411955e78d9c292ac4b32`，结果全通过；七臂完整答案与执行证明保存在 `partial-arms.json`（SHA-256 `a9a6f4d06d183542d39fadbcad3c73572640233503fc026c34ee81b0ce102672`），只作部分诊断，不是正式待放行审查包。

这轮证明产品能在新材料上把真实反馈、两条同族来源和成功对照接到研究入口，也证明无结构化交付时会失败关闭。窄诊断确认当前试验指令已明确要求通过 `structured_output` 交付，原生子会话正常结束却没有调用该工具；一条模型失手不足以证明提示词或工具配置有系统性缺陷。本轮不放宽证明要求，也不加入重试来补完该研究。新的完整研究仍须新的事前冻结任务和首次运行，不能重跑 E090 凑满十臂。语义安全、一次性放行、真实激活和后续任务效果仍各自未过门槛。

状态展示的只读核对：现有 `tianwen_learning_status` 会把已停止研究、`invalidJudgment` 原因、历史 `accepted` 与 `currentlyActive` 分开计数，并明确“来源准备状态”不代表研究执行或方法生效。E090 的终态是停止 1、无裁决、当前生效 0；现有状态字段足以说明该研究未生效，本轮不增加状态界面。
