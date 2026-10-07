# 可复用独立结果入口：工程交付与证据边界

本项把已经实现的普通任务、保存材料研究、五角色研究检查器，从工作区脚本提升到实际 Runtime 包根。可信宿主现在能从 `@tianwen/runtime-bundle` 导入三个具体工厂与配置类型，无需每轮导入仓库 scripts。原路径只转发，原有调用保持兼容。这是可复用交付入口，不是完整自动学习验收。

## 改动及原边界

- `createConversationIsolatedPythonCheck`、`createConversationStudyIsolatedPythonCheck`、`createConversationStudyIsolatedPythonCohortCheck` 参数和返回协议沿用既有实现。
- 隔离执行器199行原字节不变，SHA256仍为 `9dd22fcab12d54171fcf96da3c9e99f5b7712ef4a2c37789ccb982d3c06996ae`；生产者仅调整包内导入。旧源码原字节事前保存于运行根的 original-source，并可从 Git 原提交0723052的父版本追溯。
- 原合同、输入、期望结果须由可信宿主在候选答案前固定；没有从候选输出补标准。捕获的候选与保存材料仍为检查对象。无默认启用、权限放宽、依赖新增或新执行循环。
- 源码加载时绑定实际源码；发行入口加载时绑定实际 index.js 字节。新模块不借用旧脚本身份，不重判旧任务或历史。
- 原网络关闭、只读文件系统、资源上限、取消等待清理、漂移拒绝及五角色合同边界不变。

## 当前验证

1. 同一个实际 dist 声明消费者，首次三项 TS2305、零 TS2307、退出2；实现后退出0。首红日志保存，不归为模型或自然任务失败。新增公开API两项首红后通过，兼容路径函数身份一致。
2. 七组相关机制共106个不同用例：首次103通过、3项显式Docker跳过；启动既有Docker后，原3项全部通过，包括普通任务保存、研究两臂、五角色事前准备及零请求恢复。后续公开API两项复核不另加到106。
3. 八个产品包类型检查、实际 Runtime 完整构建及声明生成通过。
4. 按发布 files 清单，只在独立目录放包根 JS/声明与 manifest，复用已有对等依赖；实际裸包消费者不导入仓库 scripts/src。JS消费者验证捕获输出而非当前磁盘文件、正确结果、原必需条件错误拒绝、请求漂移停止、保存研究材料、五项不同合同及错误模型绑定拒绝。独立消费者的严格类型检查及非法配置负例通过。此范围是包根交付闭包，不是全量安装包或 Daily 升级。
5. 21次原生机制隔离执行和8次公开包消费执行，共29份容器回执，全部 boundaryVerified/removed。当前84个历史容器ID与开始时逐项相同；没有清理历史容器或镜像。Docker由本轮启动后已按支持的停止操作恢复，后端进程0。
6. 独立静态审查未发现本次迁移新增 P1/P2 问题，核对了取消、权限、身份、历史兼容和声明闭包；真实执行结论来自本轮实际日志，未由静态审查代替。

运行证据根：`D:/DevData/tianwen-reusable-result-checks-20261002`。主要回执为 public-consumer-red/green、regression-v1、docker-native-v1、published-js/types-v1、staged-consumer/result、container-cleanup、final-verification。实际发行 index.js SHA256为 `68828a47daf3c3737f7dea06f4eb0b256ce440fccea35bc85bef68b21b96e2cc`，index.d.ts为 `c46ae28e671418a76b2e7fb05e701c8e16c82f2b4d4db4846210fecd89c82d57`。

## 学习状态与下一交付

本轮0真实模型、0真实反馈、0自然研究、0方法激活、0未来任务效果。测试期望是明确受控夹具，不能当自然任务、真实用户判断或独立语义安全的证明。正式账本完整 SHA256仍为 `8a5fb4411926eeb533c41a5937f2e6cf2cc16afa24dec51eb8fe99a58de32408`，未重复挂载；13task/0study/0反馈评估为既有账本的继承快照。

完整目标 active/incomplete；main/Daily 完整学习 NO-GO、有效同意、激活隔离、原发布门槛及十工作日窗口不变。不再把缺自然来源扩大成所有工程工作都阻塞。

下一项先核对持续 DEV 宿主现有配置接线，使用这个公开工厂入口接入宿主事前固定的合同；保留协议和既有生命周期，只解决实际缺失的接线。随后以受控新环境分别验证自动流程，再单独记录自然反馈及后续效果。没有新缺口时不重复空审计、索题或追加已结束的三题。

运行根在最终核对时约249KB（不跟随共享依赖联接），没有依赖或环境全量副本。D余量18.87GiB，满足15GiB下限，尚未达到20GiB偏好。

## 后续实际 Runtime 宿主接入核验

Task1源码0d54289、事前计划44fd619之后，确认公开 runtime 子入口 apply 已有两个检查配置的接线，因此没有增加重复宿主循环。新增 `published-runtime-functional-host.spec.ts` 使用实际包 manifest 的公开 exports 解析根工厂与 runtime 子入口；DSH测试宿主复用既有反馈持久harness及依赖，不借源码版 observer 手工接线。此项不是裸包全量安装验收，裸包根消费见上面的Task1独立消费者。

一个全新明确受控的 CLI 合同实际经历：完整 bundle apply→五个对话服务就绪→有效测试档同意→事前一次准备→原生read/write→一次真实Docker结果检查→保存 verified/met 原任务→同档重启原任务与账本精确恢复、零提供者请求及零再准备/执行。激活隔离始终true、研究0。研究生产者作为配置传入并挂载服务，不声明研究裁决或闭环学习已发生。

首两次失败分别为测试根未声明该包依赖、普通持久harness不提供原生messageFeedback；均在候选/隔离执行前停止，是控制环境失败，不是产品功能失败或学习来源。根据 manifest 自引用和原服务 inject 定位，改用公开 self-reference 及既有feedback harness；未安装依赖/修改生产协议。第三次通过；随后将发行模块加载移入明确 opt-in 回调，避免默认CI要求未构建dist。最终同代码新临时根1/1通过，默认1项显式跳过。首次失败日志全保留，没有声称单次全绿。

独立审查发现新测试固定wx报告名会让同根重跑在末端EEXIST假失败，原反馈保留。按每轮已核对归属的随机目录名生成独立结果路径，继续wx保护旧证据；审查确认P2关闭、无新P1/P2。同根实际重跑作为这次窄修的验证，不当自然任务或新增不同案例。

最终同根窄修验证1/1通过。本项新增1个不同用例，与Task1共107个不同机制用例；本项三次因代码变化的验证各1容器，全项32份容器回执全部边界核验/删除。历史84ID保持，Docker恢复停止/后端0，两个本轮test-roots残余目录0。最终正式账本原SHA不变、运行根约263KB（共享联接不计入）、D18.90GiB≥15。见host-final-verification.json，前面249KB/18.87GiB是Task1当时快照。

实际证据：published-host-v1/v2/v3、published-host-final、published-host-default-skip、published-host-repeat-safe日志、published-host-final/host-*-result.json及host-cleanup.json；固定名旧报告保留为前一阶段证据。不得把完整bundle对话服务就绪说成所有桌面服务启动。
