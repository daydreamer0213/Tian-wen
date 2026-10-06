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

- [ ] 新宿主guidanceIndependentReview回调和静态无原票投影，复用原完整packet验证；保存准确包与第一审查结果，AI身份由宿主配置提供，另存原票对照；没有回调保留待审状态。
- [ ] 原public apply默认隔离不变，三入口统一专用许可/activation，事件可唤醒已clear研究；重启已有结果不重复独立审查，拒绝不重评。
- [ ] 原native harness RED/GREEN：真实宿主调用路径、首次首盲材料无票/源反馈未失真、clear/reject/insufficient、不配置、许可写后中断冷恢复、撤回/直写拒绝。明确脚本机制，不伪称AI真实安全。
- [ ] 原public完整build、相关source和实际public regressions、private imports与旧proof零调用兼容；独立code/preflight复核。

### Task17：全新普通产品首次前瞻及发布结论

- [ ] 新空普通Profile、公开模拟故障/反馈、新有用任务，准确冻结source/public版本/材料。明确摘要任务语境避免本批分类歧义，但不强制模型family/decision。原未来任务及六标准未消费保持。
- [ ] 原正式研究、独立受信审查、许可及采用实际发生后，检查后任务选择与原效果；无accepted则保留首次未采用，不重跑旧对或填成功。
- [ ] 原撤回/冷恢复/逐实际请求/证据/首盲与终态复核。清理可再生重复空间，保留必要原生证明与首结果；更新handoff/checkpoint并给原门槛下明确发布判断。
- [ ] 只有目标实际达到才complete；有限实现或单轮结束均不能代替整体目标完成，不将NO-GO泛化成无产品或再次等待用户输入。
