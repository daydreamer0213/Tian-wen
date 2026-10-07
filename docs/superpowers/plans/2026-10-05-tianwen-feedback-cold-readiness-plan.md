# 反馈冷启动就绪修复计划

**Goal:** 修复已有原生反馈的CLI冷启动时，反馈桥接尚在读盘而Loader已经宣告消费入口缺服务的问题，随后接续原profile未执行任务，不重跑旧答案。

**证据：** b7e020b6原CLI新受控反馈r2：8真实/1显式主答注入，第一摘要任务完成/原双评审not-met、具体反馈原真实归因attributable-problem。操作员用非规范JSON摘要误断言，原批退出1/句柄已排空。新r3只准备接续，预检CLI1，原Loader报告等待tianwenMessageFeedbackBridge，0新增模型。安装Cordis明确ctx.plugin返回可等待Fiber；原Runtime未等Bridge异步startup，对已持久会话执行磁盘扫描；Loader只等待配置条目后立即检查依赖入口。两确定延迟原持久扫描的源码测试均RED：普通与DEV在读盘未完时都提前ready。

**授权：** 属于原冷恢复修复，不增加产品验收条件，不需要用户任务/反馈/许可。当前原批已terminal，没有正在运行的冻结正式批；允许修改源码并新建消费者冻结，原旧结果和输入不改。D输出，无安装/副本/Docker，main/Daily/R9/原发布条件保持。

**实现：** 只修改runtime.ts与development-runtime.spec.ts。保存原Bridge插件Fiber，挂完原服务后，当原messageFeedback和sessionPersistence后端已可用时等待原Fiber；欠缺这些后端的既有部分宿主保持延迟挂载。两测试用原SDK反馈宿主与原JSONL，仅延迟第一次list，要求Runtime在读盘门闩释放前未完成、之后正常ready，0模型。

- [x] 两原扫描门闩测试RED，排除只是操作员入口自行等待不足。
- [x] 最小实现/绿色定向测试；已有DEV缺后端路径及反馈桥接/原生反馈生命周期检查60通过；限定复查未见有据P1/P2/等待环。
- [x] 原十五实际构建、发布dist三文件60通过，原发布profile49通过/10原跳过；提交本隔离分支。
- [ ] 推送/更新新消费者冻结，原profile零模型冷预检。
- [ ] 读取原第一已settled归因并验证原规范摘要/版本/材料，不再评判或调用第一任务；仅执行原计划未做的两任务、版本修订、撤回和再次冷恢复，保原r2错误首结果。

**停止：** 具体错误由执行者处理，保首结果，不索题/机械blocked/扩样。本项修复不是完整自动学习，下一仍需新DEVpolicy激活、后续任务效果及方法撤回。

补充入口层证据：f2858387已推送但r4原冷预检仍CLI1/0调用，r5原入口前后公开可用性均messageFeedback=false。规范DEV loader原来未声明反馈后端，Runtime作为部分宿主提前进入并跳过等待。范围窄扩到scripts/development-native-runtime.mjs及其原spec：入口等待已有原反馈后端；两加载顺序RED、十八全绿，程序化部分宿主保持。JS入口不修改构建产物，不重复原十五构建/49项profile；原同profile下一冷预检才证明完整入口。
