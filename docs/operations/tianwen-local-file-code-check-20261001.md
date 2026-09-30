# 本地文件代码任务的独立检查接缝

基线 9550cd6。上一普通预算任务的原生准入 code/local-files/files 合法：只修改 UTF-8 代码，不要求外部执行。宿主误坚持 external-only 检查合同而在候选前停下，不能通过强改准入、追加命令要求或重跑该任务求成功。该失败保留。

本项是控制端工程修复。[计划](../superpowers/plans/2026-10-01-local-file-code-check.md)在实现前明确只扩大候选外检查的适用任务，不改学习准入。现有 evolution/conversation-external-check.ts 新增并导出 supportsConversationCodeCheck，validator、runtime prepare 与具体 TypeScript 适配器共用：仅 code/external 或 code/local-files/files；null/缺准入、writing、local-files/chat、text、subjective 不适用。沿用现有事件/API/账本，未建新执行器、存储或字段治理系统。

runtime 的明确开关和检查能力双重接入条件未改。已有本地文件捕获可复用，候选前时序、输入/输出、原请求、实际模型、合同摘要、持久保存、取消与冷恢复继续核对。检查结果仍只作为单独的补充结果：local-files 原有模型 review 可以 met，external 仍 inconclusive；新结果不覆盖原 verdict，未修改研究选择器、来源支持、accepted 或方法激活。它仅证明相应检查，不能证明代码行为或一般语义安全。

## 验证与失败归属

四项反例先红：适配器缺 local 文件准备、ordinary observer 缺准备、ledger 两种 conclusive 结果均拒绝合法 local code。五项不适用边界检查通过；新增 ledger 负例更新 admissionDigest，避免因摘要错配掩盖错误适用判断。local code 独立 verified/rejected 都能冷重放，原 admission 不变、不会凭空获得 model review；普通接线分别保留 external 的 inconclusive 和 local-files 机制夹具原有 met，没有研究记录。

第一次完整四组 **104 通过/16 失败**，其中三个 pending 测试超时；调查确认 runtime 经包根读取旧构建，新增共享函数尚未导出，准备从未进入回调。selected strict 同时暴露合法 null 准入和测试已知非 null decision 的类型处理遗漏；修正类型并按项目原顺序构建包后再回归。没有把第一次失败藏成初次全绿。

最终四组 **120/120**，八包类型、脚本/四组测试联合严格类型、runtime-bundle 包根声明构建均退出 **0**；构建的 evolution 包根实际已导出该函数，差异检查通过。只读独立代码审查无重要问题或过度设计。原 TypeScript 生成前冻结 17 项测试摘要仍为 `44e3de95facd64be3d4315289ae76d215d4b2c6fc223b2500e90b2cfc3448445`。当前修复有意改变检查器源码版本；预算任务的旧冻结摘要仅表示 9550cd6 时的身份，不拿来宣称当前字节未变或回填旧失败合同。

本项模型 **0**、反馈 **0**、研究 **0**、激活 **0**。属于机制交付，不是新实际普通任务通过；未重跑预算任务，C—F、main/Daily 完整学习 NO-GO、新激活隔离、完整目标 active 和原十工作日窗口不变。

## 收尾与下一实际待办

运行数据在 `D:/DevData/tianwen-local-code-check-20261001`，约 **23 KB**；新 checker 测试残余 **0**，普通测试目录总数仍为历史 **451**，不绕过旧清理边界。无新 Profile、依赖或桌面副本，D **18.64 GiB**，15 GiB 底线满足，20 GiB 目标未到。

已核对下一实际缺口：learning-consent-agent.ts 的 naturalConversationStatus 只汇总原 admission/completion/review/feedback，未汇总已经持久记录的独立代码检查。下一新任务在当前/历史状态分别显示准备、等待结果和 verified/rejected/unverifiable 数量，与模型评价保持分开，不能增加学习资格或把局部检查写成任务整体通过。先固定本需求和机制检查，再以当前合法 local code 接缝运行一次普通原生实现；不修改或重复已完成预算任务。
