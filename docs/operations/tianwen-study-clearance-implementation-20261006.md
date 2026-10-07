# 普通产品单项学习许可：账本实现

Task15已完成源码实现并通过独立规范和质量审查。它让默认隔离的普通产品可以保存一项完整正式研究的可信审查结论，并仅凭该项许可采用对应方法；原普通直写采用路径仍受隔离约束。Runtime自动审查、恢复接线和真实后任务效果仍待Task16/17，不把本阶段当完整自动学习完成。整体目标active，main/Daily继续NO-GO。

新增专用许可事件和record/list接口，区分independent-ai与human，不写旧人工ApprovalRecord。首次结论不可覆写，相同重复幂等；准确绑定环境、研究、候选、父版本、同意修订、原十臂与静态研究摘要。三来源和五个candidate全部clear才可放行，baseline原失败如实保留。专用采用入口复用原质量v12、正式accepted、同意v3、来源支持、父版本、共享evaluation/met等校验，只对同项研究跳过隔离拒绝。许可与采用分开持久化，重启可补后一步，重复或回滚不重新启用方法。

实际首轮RED为14失败；首轮GREEN有一个新增fixture输入形状错误，保留原记录后修正fixture。最终新增23项通过，四套相关测试297/297、退出0，Evolution无输出类型检查及差异检查均0。独立审查PASS/PASS，无本阶段P1/P2。都是明确脚本化机制验证，0服务商调用、0公开构建，不宣称AI语义安全或收益。

实现回执：D:/DevData/tianwen-study-clearance-tests-20261006/task15/task-15-implementation-report.md（SHA256 af6321cc0013324ccb74fccf1bf1d96f03adc6e3cb84ea58b0c214101df1f1df）。独立审查：同目录task-15-code-review.md。改动仅Evolution新许可模块、ledger/runtime-binding/index及原ledger测试五文件。下一按已提交计划实现普通Runtime可信宿主：无原票完整投影、首个原生结果及证明保存、可序列化配置与三入口统一恢复；宿主负责把packetDigest和审查者身份绑定实际材料，不能把合成fixture当真实AI审查。

D盘最近实核17,604,108,288字节，约16.40GiB，满足15GiB最低要求但未到20GiB。原包管理器缓存完整性检查退出0，本次可测前后空间相同；不虚报清理收益，不复制依赖或删除历史原生证明。

后续公开兼容已实际完成：原完整构建16/16退出0，完成时HEAD为2824aafda3679e8b11580da3d4cabab1ad996e89（相对e25af663仅接入设计文档变化，生产源码相同），runtime SHA256 2f1b9f1daa8525e0c270f03047835c774db362271052b9823b1ba272c63ba61d。当前实现零模型恢复旧11个反馈证明、22个审核证明及Task12原六个任务审核、二十个研究审核和对应研究执行材料，旧原票未改、无失效证明。构建与兼容回执在D:/DevData/tianwen-study-clearance-controller-20261006。此构建尚未包含Task16接线，不能称普通产品会自动审查。

随后原pnpm@11.20.0针对D:/DevData/pnpm-store/v11执行自带store prune（无force），退出0：284个已登记项目中无可清孤立包，删除0文件/0包，仅清缓存元数据。可用空间前17,587,445,760、后17,587,425,280字节，观测净变化-20,480字节，不宣称空间增加。回执D:/DevData/tianwen-study-clearance-tests-20261006/pnpm-prune-receipt.json；仍高于15GiB，不删除依赖或历史证明。
