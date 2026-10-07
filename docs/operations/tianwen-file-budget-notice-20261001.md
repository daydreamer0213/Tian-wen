# 文件预算说明交付；普通任务前瞻在候选生成前停止

基线 c65e612；上一目标轮是工程进展，本轮继续一个不同的实际开发待办，不重开检查器实现的失败任务。现有 file trial 上限为 8 模型请求/12 工具尝试，拒绝尝试也计数，但原 worker instruction 没说明预算。现在在输出要求后明确现有限额、仅供给文件可访问，并要求在上限前完成实际写入与最终答复；数字使用原常量，未提高上限或改变工具/路径治理。

预算文字参与 requestDigest。冷恢复现在只选择完整当前指令或完整原指令：先按 hash 选定格式，再将唯一保存 user message 与同一个完整 prompt 精确比较。会话、材料、方法、模型配置、输出、工具完成及清理校验保持，不按保存的任意文字构建第三种标准，不回填历史。旧格式只用于恢复。

## 候选前合同与真实结果

控制端先按原代码生成一个明确标为 scripted 的机制夹具（约 21.9 KB，随测试保存），不复用历史失败样本或冒充自然结果。新预算的两项反例先红，旧证明恢复及材料/方法/保存指令漂移四项检查通过；第一种测试内断言被 Agent 转成回合错误，控制端在候选前将断言移到捕获请求之后，再确认两项明确缺预算而失败。随后冻结[计划](../superpowers/plans/2026-10-01-file-trial-budget-notice.md)、完整 22 项测试、夹具和检查器字节。

一次普通原生任务使用现有 observer、文件捕获和显式 TypeScript 宿主检查，64K/high、提供者重试 0、12 分钟截止。原生准入 **1 次真实请求**，准确给出 code/local-files/files。原请求仅要求 UTF-8 代码修改，且禁止运行命令，按当前 ADMISSION_INSTRUCTION 该分类合法。现有检查接缝及具体适配器只接受 external/code，故未形成候选前合同；驱动坚持合同先于候选，在候选请求送往提供者前阻止执行。原生根终态 error、账本 failed/inconclusive、工具 **0**、实际候选模型请求 **0**、目标字节未变，没有原生候选。

驱动 requests=2/rootRequests=1 是 stream 拦截入口计数，不是两次实际提供者请求。日志仅有一条转发记录，失败根请求在 yield next 之前被拦；原准入 proof 与保存会话确认一次真实请求。归属核对在 `D:/DevData/tianwen-file-budget-notice-20261001/ordinary-native/attribution-audit.json`。没有将此失败写成编译拒收、模型误分类或用户反馈；未改旧 ledger、未补合同或重跑本任务。

## 控制端工程修复与核验

预算说明由控制端完成，与失败原生尝试分开。原计划/测试/夹具/检查器摘要收尾均未变。file trial 22 项与 ancillary 61 项联合 **83/83**；八包类型检查及 runtime-bundle 包根声明构建退出 **0**。目标与测试联合严格类型初次缺旧 sandbox/mode 的上游类型扩充，再加 sandbox 主类型仍无该事件；定位实际声明所有者 sandbox-policy/session-mode，显式载入现有声明后退出 **0**，未修改冻结测试或伪造本地声明，未安装依赖。只读独立审查无重要问题，当前/旧 hash 与保存内容不可跨格式匹配，差异检查通过。

反馈 **0**、研究 **0**、激活 **0**，没有预算说明的真实效果成功证据。main/Daily 完整学习 NO-GO、隔离、原发布门槛与十工作日决策窗口不变，目标 active。

## 新暴露的接缝与后续

这次任务选型符合所有者授权；控制端误把独立编译检查的宿主能力当作用户原任务必须具有的 external 效果。独立架构复核认为最小接缝是允许 code/local-files/files 同样记录候选外检查，保留原准入、原 review、研究资格和激活规则；writing、local-files/chat、text 和 subjective 不扩入。只修现有 validator/prepare/适配器的一致适用边界，不建新执行器，不强制准入为 external，也不追补本次失败。后续另立小计划与反例，再用于下一不同实际任务。

运行数据约 **0.20 MB**，机制副本残余 **0**，无新 Profile/依赖/桌面副本；D **18.64 GiB**，满足 15 GiB 底线，未达 20 GiB 目标；旧 451 目录历史边界保持。当前 new task 证据保留在 D:/DevData/tianwen-file-budget-notice-20261001，正式根 session 为 file-budget-ordinary-native-20261001。
