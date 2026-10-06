# Task26 范围证据误拒修复：先判断完整反馈，再选择覆盖引用

Task25 已结束24真实/0脚本：三ordinary六met，两原文相同模拟偏好一合格/一不合格，0研究/激活/未来效果。source1第一criterion把第三句单段规则并入第一句排序规则，scope模型虽然收到完整反馈，却只引用第一句并以该句没有单段为由unclear。独立只读诊断确认不是新用户限制，而是已有两规则合并与引用选短共同导致范围证据误拒。原票/ledger/SDK不改；作者预检、run/cold/audit实际0，终审PASS且实际freeze-end已退出0释放后才开始新实现。

目标：只澄清原范围审核应先从完整直接反馈判断整个criterion的每个限制、作用家族、主体和例外；若不同句分别明示同一家族的持续规则，不能仅因第一句不含另一规则就当它新增。随后必须选择足够长、含中间文字的单一连续原文引文覆盖所有支持。不能因为自选短引文丢失已有支持就把明确持续规则误判unclear；没有全文支持的新增/加强/不同家族/one-off例外仍按原规则unclear或one-off。不得把分类器当事实、跨主体/任务家族偷合并或宿主代改引用/票。

方案比较：A强制所有criteria逐句拆分会影响合理的条件/例外整体语义且不能处理正常转述；B在原SCOPE_INSTRUCTION澄清全文判断与引文选择先后最窄；C不断增加反馈样本绕开同一缺陷不修产品。选B；不改ASSESSMENT_INSTRUCTION、schemas、scope native独立性、whole eligibility、quality v12、formal十臂、SDK、候选/host/许可/激活。

最初复用已有investigate_actor_semantic_seam worker，限定两owned文件；因其准备过度且未运行RED，Root中断、确认无活跃会话后接手packages/tianwen-runtime-bundle/src/conversation-feedback-assessment.ts及tests/dsh-migration/conversation-feedback.spec.ts，完成最窄实现，其余生产/旧夹具/旧证明不改。review_shared_future_scope只读设计、规格/质量审查。Root拥有docs/D操作器/提交推送/原公开构建和新首次provider验证。无新agent，不撤销别人编辑。现有环境生成物全部D，15GiB底线优先20，无环境/依赖/完整历史复制。

- [x] 独立设计审查PASS及Task25 actual freeze-end已实际0；限定两文件实现完成，独立spec/code审查PASS，无用户出题或许可等待。
- [x] 真实SDK scripted有效RED/原scope派生会话完整多句材料及规范、独立native proof/quote约束、旧固定指令捕获冷恢复；scripted票不是真实语义证明。合并同族/不同族/current例外由新专项，next-only/无源加强/引文格式由原相关回归覆盖，篡改proof/value拒绝；旧Task25真实原票未改，实际历史proof恢复待公开。
- [x] SCOPE文字最窄更改，保留其余指令/协议与默认行为；有效RED3fail/1pass→GREEN4，三套144及默认两types/diff0，0真实provider实施报告。首夹具4fail和types TS6379调用错误保留。旧固定scope脚本捕获冷恢复通过，真实历史19feedback/166claim兼容实际待公开构建。
- [ ] 独立spec/qualityPASS后root原public16/actual入口/旧feedback与currentclaim兼容0调用，新source-transition只精确声明实际源码/编译/spec变化。保留首失败，不能复制环境或改SDK。
- [ ] 全新原任务/公开模拟反馈普通运行，沿原formal/native firstclear/自动许可/原未来六标准及无关/撤权/cold/语义终审；不重跑旧题/补票/旧票多数化，不新增发布门槛。方法正式采用才运行未来。仍不把一段提示、脚本或一轮完结当整体目标完成。

main/Daily继续原NO-GO直到原门槛满足；整体goal active。Task25独立诊断文件D:/DevData/tianwen-explicit-source-controller-20261007/task25-feedback-scope-diagnostic.md。该计划是新实现，不是重评旧样本。
