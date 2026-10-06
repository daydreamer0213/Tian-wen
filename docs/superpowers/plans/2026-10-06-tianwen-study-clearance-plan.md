# 普通产品逐项研究放行实施计划

> For agentic workers: use subagent-driven-development with the existing implementation/review agents; do not spawn new agents. Finish each independently reviewable task before the next dependent change.

**Goal:** 实现已有独立语义放行在普通产品中的单研究许可、恢复和后任务采用流程。

**Architecture:** Evolution持久化许可并独立守住原激活边界；Runtime复用原完整审查包，调用真实标注的受信宿主独立审查器。默认隔离、正式研究裁决、原票与历史回放保持。

**Tech Stack:** 已有TypeScript/Node/Vitest/DSH SDK，不安装新依赖。

## Global Constraints

- 当前设计见../specs/2026-10-06-tianwen-study-clearance-design.md；原quality.v12/双审/正式accepted/未来六效果/原R9语义要求不改。
- 用户授权自主设计与公开模拟，不问执行许可、不等自然任务；模拟机制不称真实模型效果。
- main/Daily NO-GO，现有0.1.24/preview.25不改装；整体goal active。
- 生成物、TEMP、缓存均D:/DevData；D可用至少15GiB，优先20GiB；复用环境/保留首结果，不每轮复制依赖。
- Workers are not alone: own only assigned files; never revert others. Root owns docs/build/controllers/provider execution.

### Task15：Evolution许可持久化与专用激活边界

Owner implement_scope_repair_operator，ONLY packages/tianwen-evolution/src/conversation-guidance-clearance.ts（新）、ledger.ts、runtime-binding.ts、index.ts及tests/dsh-migration/conversation-guidance-ledger.spec.ts。若需要其他文件先向root说明。独立review_shared_future_scope负责spec/quality只读复核。Root只改docs/外部运行文件，不重叠源。

Interfaces: export ConversationGuidanceClearance, parseConversationGuidanceClearance, conversationGuidanceClearanceEnvironmentDigest(root), conversationGuidanceClearanceStudyEvidenceDigest(study)。EvolutionLedger及TianwenEvolutionService新增recordConversationGuidanceClearance(input): {duplicate:boolean}、listConversationGuidanceClearances(scopeKey?): readonly ConversationGuidanceClearance[]、recordReviewedConversationGuidanceActivation(input: GuidanceActivationRecord): {duplicate:boolean}。字段和许可门槛按设计。不要暴露global-quarantine=false开关，不修改原ConversationGuidanceRecord schema或human ApprovalRecord。

- [x] 用已有正式完整accepted、当前v12 fixture（清晰脚本化，无真实provider宣称）增加RED：默认直写activation仍拒绝，正确许可可专用激活并冷恢复；同一写入duplicate，冲突/错误study/candidate/digest/profile/consent/parent/support、DEV与历史激活不准获新许可；reject/insufficient不激活。观察实际RED后最小实现。
- [x] 独立许可事件严格parse/完整回放/复制返回，完整记录source3/arm10，不造SDKproof、不改研究decision；许可内容canonical绑定，clear仅候选5/来源明确clear。
- [x] 专用入口重查现行授权并复用原activation校验，只跳过本项隔离拒绝；普通记录路径仍拒绝。许可后未activation的重启恢复可用，已有activation/rollback不再生效；LedgerCommitUnknown沿旧规则。
- [x] GREEN新增检查、完整原conversation-guidance-ledger及相关guidance schema回归，保留首次失败；报告真实执行计数/退出码/确切diff/限制，0模型/0build/0commit。大型temp全部D。停写交独立spec与quality复核。

### Task16：Runtime普通产品的受信独立审查与即时/恢复采用

Root与现有worker按不重叠具体文件分工；待Task15接口及独立复核通过才实现。

- [x] 新宿主guidanceIndependentReview回调和静态无原票投影，复用原完整packet验证；保存准确包与第一审查结果，AI身份由宿主配置提供，另存原票对照；没有回调保留待审状态。
- [x] 原public apply默认隔离不变，三入口统一专用许可/activation，事件可唤醒已clear研究；重启已有结果不重复独立审查，拒绝不重评。
- [x] 原native harness RED/GREEN：真实宿主调用路径、首次首盲材料无票/源反馈未失真、clear/reject/insufficient、不配置、许可写后中断冷恢复、撤回/直写拒绝。明确脚本机制，不伪称AI真实安全。
- [x] 原public完整build、相关source和实际public regressions、private imports与旧proof零调用兼容；独立code/preflight复核。63ab原16步/actual4+4/default types/imports/旧proof均实际0，独立实际Task17 preflight PASS。

### Task17：全新普通产品首次前瞻及发布结论

- [x] 新空普通Profile、公开模拟故障/反馈、新有用任务，准确冻结source/public版本/材料。明确摘要任务语境避免本批分类歧义，但不强制模型family/decision。原未来任务及六标准未消费保持。
- [ ] 原正式研究、独立受信审查、许可及采用实际发生后，检查后任务选择与原效果；无accepted则保留首次未采用，不重跑旧对或填成功。
- [x] 原撤回/冷恢复/逐实际请求/证据/首盲与终态复核。清理可再生重复空间，保留必要原生证明与首结果；更新handoff/checkpoint并给原门槛下明确发布判断。98实际/9正式arm停止；首cold1保留、独立零模型operator恢复0，实际freeze-end已释放、整体active/mainDaily NO-GO。没有可据以宣称的空间释放。
- [ ] 只有目标实际达到才complete；有限实现或单轮结束均不能代替整体目标完成，不将NO-GO泛化成无产品或再次等待用户输入。

Task17完整研究/许可/效果未发生，不勾选第二项或整体完成。原始相邻baseline分歧与最后提交失败保留，不重开该pair。后续原未消费future任务继续保持。

### Task18：原schema的null类型错误精确提示

设计见../specs/2026-10-06-tianwen-null-token-design.md。复用investigate_actor_semantic_seam，ONLY conversation-judgment.ts 与 conversation-judgment.spec.ts；root文档/public/实际控制，review_shared_future_scope独立spec/quality。Workers not alone，不撤销他人改动。Task17实际freeze-end释放才编辑。

- [x] 原真实SDK scripted RED：category字符串null收到准确类型区别，模型自己在下一步交JSONnull；bad-only无proof，合法字符串null schema/正常enum/正常null沿原规则。原错误payload留存。
- [x] 仅原同parent/label pre-execute依据原schema拒绝错误类型并说明；不换值、不变schema/SDK/材料/旧票/最终parser/quality/双审/裁决。GREEN及完整原judgment/claim/type/diff，独立复核。新增13、原完整193、默认类型/diff0，独立spec/quality PASS。
- [x] 原公开构建与入口、旧证明零模型兼容后全新清楚业务任务首次前瞻；保留原future三对象/六标准。433be实际16步/4+4/types/imports/旧11feedback22claim/Task12(26)/Task17(24)均0。Task19首次61真/10项20票inconclusive，无许可/采用/未来，首盲/终审/actual freeze-end释放。没有补票或消费后任务。

此项提示不保证模型成功，且不是原adjacent baseline inconclusive的修复；新任务无需多余标签歧义，不新增禁标签或更严格式要求。用户已经授权自主选择与模拟，不因设计/开发例行步骤再问执行许可。

### Task19/20：保留首次结果，明确受控合同的真实研究

- [x] Task19新普通任务首次61真/0脚本、10项20票，原压缩幅度分歧与三待办概括四的原case标准保持；cold/audit/首盲/终审/actual freeze-end完成。
- [x] Task20模型前冻结新去重任务/5份同合同/2个case，既有公开host接口不改产品source；38宿主夹具。实际59真/0脚本，三原任务六met/两反馈3+5continuing/10研究20原生票，候选5全met/verified，邻近baseline误放行形成inc；原决定不改，未许可/采用/future。cold/audit/首盲/终审/实际freeze-end完成。
- [ ] Task21按[最窄新计划](2026-10-07-tianwen-requirement-boundary-plan.md)补清具体限制/一般许可及完整句子左右边界，保留精确旧指令兼容；原public/旧proof恢复后Task22全新普通首次运行。Task22prepared与42宿主检查不是模型效果；原未来三对象六标准仍未消费。

整体目标仍active。原正式 accepted、原生独立审查 clear、许可/实际自动采用及后任务效果仍需真实发生，不能由候选五项通过替代。
