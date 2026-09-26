# 天问普通对话学习就绪状态设计

状态：当前分支实施设计。用户已要求持续推进、不反复请求确认；此设计不改变学习准入或发布门槛。

## 问题与范围

现有 `tianwen_learning_status` 只报告自然任务、反馈评估和研究终态的总数。035 的 `insufficient-evidence` 被汇成 `stopped`，036 的同族第二来源缺失只表现为研究数为零。操作者无法从有界状态区分“证据尚未配齐”和“研究已经尝试但停下”。

在当前工作区的 `currentSession.naturalConversation` 加入 `guidanceReadiness`，只含一项状态：`analysis-disabled`、`awaiting-compatible-sources`、`awaiting-counterexample`、`already-studied`、`ready-to-schedule`、`unavailable`。其中 `ready-to-schedule` 仅指当前选择器找到了两条不同输入、同族/同类别/同配置的支持及成功对照，不保证模型可用、host 已调度、研究会通过或方法会采用。`already-studied` 指当前能找到的支持组合已被既有研究消耗；历史研究终态仍由研究状态另行说明。对 `guidanceStudies` 加入各停止原因的固定计数：`insufficientEvidence`、`cancelled`、`invalidJudgment`、`modelUnavailable`、`sourceUnavailable`、`scopeChanged`。

## 实现边界

选择器与只读状态共用同一证据扫描，防止状态采用比运行时更宽松的准入判断。扫描保持现有顺序、不同输入、质量合同、模型配置、任务族、失败类别、成功对照和已研究组合规则；对本地文件来源仍按原逻辑恢复并跳过不完整材料。仅选择器在扫描到可用组合后恢复提案线索，状态读取不恢复线索、不写账本、不启动研究、不发模型请求。

状态入口使用当前 Agent 工作目录对应的范围。学习循环不可用或只读扫描出错时返回 `unavailable`，不猜测“已经就绪”。停止原因计数从已经记录的研究终态投影，不传出任务 ID、请求、反馈原文、答案、工作区路径或原生证明。全局历史仍只展示汇总；当前 Session 的研究计数遵守原有“当前任务涉及范围”规则。

## 验证

先以单元测试验证无来源、单来源、两条相容来源缺对照、具备对照、已研究过，以及不相容任务族；测试要证明只读检查不调用提案线索或记录研究。然后验证状态工具仅返回有界枚举和固定原因计数、没有私人材料或额外模型请求。运行相关测试与包类型检查。该改动只改善可观察性，不重判 035/036/R9，不消除语义复核风险，main/Daily 保持 NO-GO。
