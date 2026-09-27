# 方法研究只读审查材料：恢复可行性核对（2026-09-27）

## 结论与边界

可以从现存证据构造审查材料。核对时发现产品**缺少**从纯文本试验执行证明返回完整答案的只读恢复函数；本分支现已补上 `recoverConversationTrial` 及定向正反例，并新增单臂审查投影，把执行答案和两份审核材料逐字交叉核对。它尚未组装原始任务、反馈与五案例的完整本地材料。旧 R9 仅用于诊断：它已经激活，而且独立对照发现错误，不能成为新放行记录。本次未调用真实模型、未重跑旧任务、未改演进账本或旧原生会话；main/Daily 继续 NO-GO。

## 本次实际核对

- 使用 `D:/DevData/tianwen-natural-acceptance-r9-20260908/evidence/inspection-first-study-225437.json` 的现存只读快照。SHA-256 重新计算为 `4e7a785af340262b78546a97e16e607cc5e0a3f17d155d40989affd4db593a49`，与 R9 结果记录一致。
- 快照含一项 `guidance-study:8d2cf580da055c0038a3bd50c0de5c30bbd923253b6e428847fa59597b5fa6cf`，账本裁决为 `accepted`，且已有 `guidance-activated`。五个案例各有 baseline/candidate，合计十臂；每臂均能按 `executionProof.sessionId` 在快照中找到唯一会话，且其投影的 `structured_output` 工具调用参数均含一份非空完整 `answer`；十臂附带的审核记录共 20 份。此项检查只证实**快照字段可见**，不是本轮对原始压缩会话逐字节再验签，也不重判内容。
- 原始反馈并不在研究账本事件中；账本保留两项反馈评估的身份、类别和 `supplementalCriteria`。产品 `TianwenConversationFeedbackService.materialForAssessment` 可在来源仍有效时从原任务、反馈轮及原生会话恢复 `feedback`，并核对冻结 `materialDigest`。R9 历史研究的试验输入曾使用发生主体偏移的派生标准；把现在恢复的原话放在旁边是为了**揭示**偏移，不能声称历史审核者当时看到了它。

## 现有产品入口与缺口

| 所需材料 | 现有真源/校验 | 缺口 |
| --- | --- | --- |
| 研究身份、候选、十臂、裁决、激活 | `EvolutionLedger` 的研究投影及每臂证明/摘要 | `accepted` 和审核 `met` 仍非独立语义放行 |
| 原始任务、上下文、事实文件 | `recoverConversationTaskMaterial` 核对原生 Session 生命周期、请求、上下文与冻结文件 | 原普通任务答案需沿任务完成边界恢复，不能用研究案例摘要代替 |
| 原始反馈、补充标准 | `materialForAssessment` 核对任务归因、原话和反馈材料摘要；账本保存 `supplementalCriteria` | 历史来源若已撤销或不再可恢复，应标为缺证，不能臆造原话 |
| 纯文本十臂完整答案 | 原生执行 Session 的唯一成功 `structured_output` 捕获；审核 Session 的 `material.original.answer`；账本 `outputDigest` | 原有 `recoverConversationStructuredJudgment` 要求调用方**先提供**预期答案；本分支已补只读提取入口，尚未组合成十臂材料 |
| 两份审核原结论和完整审核输入 | `recoverConversationJudgmentRequest` 与 `verifyConversationClaimReviewCheck` 校验原生证明、任务材料/答案摘要、模型配置和证据项 | 导出时需将两份恢复出的答案相互核对，并与**执行**会话再次绑定；仅凭审核摘要或模型标签不够 |
| 文件试验答案和产物 | `recoverConversationFileTrial` 已从受限收据核对输出与执行证明 | 与纯文本路径分开，不应退化为审核者材料中的自述 |

`conversation-guidance-loop` 的冷恢复现已检查执行会话摘要及各审核记录，但纯文本路径原先不从执行证明提取完整答案。本分支新增的最小入口只读执行 Session，要求唯一成功的结构化 `{answer}`、正常结束、原试验指令和请求材料摘要、模型配置及 `executionProof` 全部一致，再以 `sha256(answer) === arm.outputDigest` 绑定账本。它复用现有原生恢复检查，并保留执行者与审核者不同的原生角色摘要。定向测试证实答案、材料、配置、指导语和会话证明漂移均被拒绝；恢复过程不增加模型请求。相关五组回归 **184/184**，八包类型检查与差异检查通过。

随后新增的 `recoverTextGuidanceArmForReview` 只读核对研究 `accepted`、十臂摘要、案例与方法版本，分别恢复执行答案和两个原生审核输入；两份审核看到的完整答案与执行答案必须逐字相同，审核任务与账本材料摘要必须一致。在一项脚本化完整研究中，十臂均成功恢复，未增加模型请求；改动一臂答案摘要会拒绝。已激活研究只标成 `diagnostic-historical`；另一项脚本化 `accepted` 且被隔离的研究返回 `unreviewed`，未补激活、未增加模型请求。两种状态都不产生 `clear`。这仍只覆盖**纯文本单臂材料**，不包含原任务答案、反馈原话或五案例总包；不提供放行/激活操作。

## 下一步

1. 给只读提取入口补重复成功捕获的针对性测试；目前已覆盖唯一成功捕获、缺 Session 和各项摘要漂移，并已在脚本化研究中逐臂交叉核对。
2. 组合原任务、反馈、十臂和双审核成为本地材料，并对 R9 以诊断模式确认两条 false-met 答案和反馈主体偏移直接可见。R9 的历史激活必须醒目标记。
3. 用脚本化 `accepted` 且未激活研究验证只读性和缺证停止；这只证明机制。实际放行仍需要**新的**真实研究及独立审查，现阶段继续隔离。
