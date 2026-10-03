# 首次真实项目修复：产品已修，原任务未改判

## 实际交付

原生 Goal 会话的学习状态确实漏研究进度：旧发行 SDK 控制中，history 有 1 项 accepted，currentSession 却是 0。事前固定真实待办、原 Agent/公开类型、两文件权限、14 项独立条件与接入检查，候选未由控制端编写。冻结提交 912b89b 后，天问真实提供者只执行一次。

天问的首次两文件产物原样交付：新增纯函数 collectSessionGuidanceScopes，并接原 learningStatus/currentScopes。普通任务按原 sessionId 保留 scope；Goal 只关联当前原主/子会话结果，与已发布研究来源的 sourceId、结果摘要及附带 outcome 一致，取原 scope、去重排序，不猜 cwd、不修改输入。其他可执行 Agent 行为、历史、反馈、同意、裁决、启用和回滚不改。

新增 DEV 宿主执行前检查：使用原文件 guard 时，先核 read/write/edit 的原工具注册来源；缺失时在 attempt 标记/Agent 创建之前拒绝。原控制宿主始终先装公开 NativeObservedToolRuntime，再装原 fs tools；没有新执行器、工具替身或学习服务。

## 第一次真实结果，不能改写

真实提供者请求 12（1 次原任务识别、11 次原执行），prepare 1、evaluate 0。原任务 ended/completed，但 fileUnavailable=material-unavailable，程序 unverifiable、整体 review inconclusive；功能候选未获原验证，研究/反馈 0，隔离保持。原 SDK 记录、原任务、归档 seal 和首次代码已保存；另一个 Node 进程恢复原 Task/seal 精确、0 请求、账本不变。没有重试、重评原自然任务、催评价或造失败。

证据丢失定位：首次驱动 mountFeedbackHarness 装的是 stock ToolRuntime，没有原工具注册观察。第一次 guard 拒绝读取时无法核原 nativeRegistration，ancillary 失效，后续文件证据不可用。不能算模型能力失败或授予研究资格。宿主检查已补，实际 stock SDK 反例 0 请求/0 Task/无 attempt；实际正确宿主控制保留原拒绝读取（dispatch 0）、两文件反序权限/edit、prepare/evaluate 1/1、程序 verified/整体 met。后者 11 scripted 请求，明确不是新自然证据，另 Node 0 请求恢复原记录。

首次代码另外用于独立产品交付验证：事前同一 14 条件在缓存 Node 隔离中全部通过，接入检查通过，没有改候选算法，也没有把通过写回原 Task。标准回归 3 文件 82 项通过；发行 SDK 状态/原启用回滚控制 1 项通过（其余 50 项未选择）；完整 Runtime/两份声明构建和公开导入检查通过。独立静态审查未发现有据 P1/P2。格式及持久准备 gate 的 23 项控制另记，不累加为自然成效。

准备 gate 曾有磁盘文件已写但原 Ledger preparation 未保存仍放行的 P2，真实执行前已修：核本次内存身份和原 Task 持久 preparation 的检查器/合同/输入/条件/model/request/context/admission。23 项控制是格式/字段投影，不能称 live SDK 写入故障试验。Windows createRequire 路径初次预检失败也保留，实际模型 0；规范实际路径后发行预检通过，任务条件没有改变。

## 原第三项继续，不增加门槛

当前产品修复完成，完整目标仍 active/incomplete、main/Daily NO-GO。方法采用/案例语义独立性/后续任务改善还没有新的自然证据；本轮不是完整自动学习成功，原发布门槛、同意、隔离、停止条件及十工作日窗口不变。

下一具体接线：普通程序检查 prepare 已冻结完整文件图，文件 observer 的图仍只含实际读取/改写项。首次任务没有读 trusted entry，因此除了已修的工具注册缺项，两图还存在可核对的路径缺项。下一直接核原普通任务准备、捕获和恢复的合同接缝，明确区分可信检查文件与真实工具动作；不得补造 SDK reads、回填旧 Task 或重跑本题凑结果。修好后选择下一项确实未完成开发工作首次验证，不新增阶段或要求用户提供题目。

运行包在 D:/DevData/tianwen-first-real-status-task-20261004。正式连续 DEV 账本只读未 mount，1327364B / 5af25fcd7d6531a58483df8d87fde046dfe8baa7abc6338a496c12a55cce80da 保持；普通/正式隔离不解除。保留必要小包和压缩原记录，清理本轮自有临时目录/确认容器、恢复 Docker 停止；原五个历史拒删目录不重试或绕过。没有安装/下载/全环境副本。
