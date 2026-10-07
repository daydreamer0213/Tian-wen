# Task28/29：保持字面交付，修正文与捕获包装混淆

Task27实际完成、独立终审PASS且actual close已释放冻结。两反馈whole eligible，研究source1 candidate的正确内文被再次封装为JSON放进answer字符串；原双native错误认为是传输包装，原host正文检查正确拒绝，candidate-failed。保留首次35请求/4研究票，无激活或后任务。问题来自实际交付边界混淆，不新增标准，不等待用户。

比较：自动解包会改变模型原交付并误删用户要求的JSON；全面禁JSON也不正确。采用最窄生成/审核提示澄清，用户要求的结构化正文仍允许，所有字符原样保存。设计独立PASS：D:/DevData/tianwen-trial-delivery-controller-20261007/task28-design-review.md，14fe813d22f45060f286613dd4bcfb6caadc2e45498c1773a93c8c4f05ac6ef9。

ROOT独占两生产文件conversation-judgment.ts、conversation-claim-review.ts，已有claim-review.spec.ts和新delivery-boundary.spec.ts；复用review_shared_future_scope独立只读审查，不新开agent、不覆盖别人更改。源码只补当前trial提示和v12/无quality当前审核提示，完整旧trial/原+Task21+Task23审核精确恢复；旧quality producer/COMMON/schema/SDK/政策/host/方法许可不改，不前缀接受，不修复答案或票。原capture reminder保持。

- [x] Task27 actual close退出0和独立设计PASS后实施。
- [x] 原SDK新专项有效RED9失败/2通过→当前GREEN11；旧完整/近似trial捕获cold恢复/拒绝，原样正文/用户JSON/错误包装不被宿主修复，审核原材料/隔离/旧Task23精确冷恢复。scripted票只证明机制传递，不证明真实语义改善。
- [x] 原相关SDK六套265/265、默认两types和diff，实施收据与独立规格/代码审查PASS；扩大七套首441/443保留，原两项在新public/canonical D运行2pass，非单次443全绿。
- [x] 原公开16步/实际4+4/旧23feedback与176claim及53实际旧trial零模型恢复；只声明实际两源码/旧spec与生成物变更，新spec另行绑定，不虚构历史保护。
- [ ] Task29全新whole记录及公开模拟原反馈，原future三whole对象/每题六标准不变。先author/preflight独立PASS，首次真实普通研究沿原十臂、首许可和自动激活；原后任务/无关/撤权/cold及首次盲审终审，不补旧票。

生成物D:/DevData/tianwen-trial-delivery-*；复用SDK/环境，无安装或全环境复制，D>=15GiB优先20。整体goal active、main/Daily原NO-GO，不能一轮结束当目标完成。

Task29已首次44真实实际完成、两反馈whole eligible，普通任务6met；4臂8票/source2候选真实待办并句错误，原candidate-failed，未发生正式采用/未来。run/cold/audit及独立终审PASS/actual close0。上面完整学习勾选保持未完成，不能因批次退出0勾选。六例新固定语义核查12真实首次全匹配，独立终审PASS/actual close0；它不成为新学习门槛，也不重判旧票。下一有限Task30 proposal-only构造提示用原工程回归和新首次前瞻检验，不冒称已确认根因或效果。详见docs/operations/tianwen-literal-delivery-prospective-result-20261007.md。
