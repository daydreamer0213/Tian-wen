# 中文学习报告：原生Goal结果与实际报告覆盖缺陷修复

在唯一输出 `scripts/summarize-learning-status.mjs` 中实现尚缺的原生Goal结果显示，并修复上一实现已暴露的报告覆盖缺陷。旧完整v1、来源诊断与研究结果合同均保持；不是重评旧Task，当前失败代码作为本次初始文件。

先修实际缺陷：研究输出必须放在新增顶层studyChecks内；不能把其中history/currentSession展开到根上或覆盖旧history。这是已有学习研究合同的原要求，不新增标准。保留合法可选部分分别显示、非法整侧忽略、旧v1计数/字段/文本/limits/退出行为，仍Node22标准库stdin/stdout、源码≤20000 UTF-8字节，不读其他文件/联网/子进程/写文件。

## 新的原生Goal展示

原SDK提供 `history.goalTaskOutcomes` 和 `currentSession.goalTaskOutcomes`，不是naturalConversation下面的同名对象。每侧为可选非null、非数组对象，含5个≥0安全整数：observed、checkedSuccess、checkedFailure、unqualifiedRejection、unverifiable。5字段全有效才显示，不补零、不转换类型、不另判计数和/关系；未知字段/scope/描述忽略，不执行输入文字。两侧独立，可选缺失/无效不影响旧报告或另一侧，不能合并当前与历史。分析关闭也可显示保存事实；root或naturalConversation里的同名伪字段不可替代原位置。

若至少一侧有效，仅新增顶层 `goalOutcomes`，恰有有效的history和/或currentSession键。每侧恰输出3个键：

- scope：history固定 `此Profile保存的原生Goal任务独立结果。`；currentSession固定 `按原控制会话或实际执行子会话归属的原生Goal任务独立结果。`
- counts：仅上面5字段按原順序，原计数。
- limits：下面3字符串按原顺序，不增加条目。

1. `checkedSuccess与checkedFailure只表示原独立任务结果分类；不替代内容评审或学习资格。`
2. `unqualifiedRejection不是已确认的问题来源；unverifiable不表示成功或已确认失败。`
3. `这些保存结果不是用户反馈、方法激活、未来任务收益或完整自动学习证明。`

全缺失/无效则不增加goalOutcomes。原必需字段无效仍原error/退出2，不显示可选数据。Goal显示不改旧history/studyChecks/readiness/analysis/activation/顶层limits，不把程序结果数量解释为完整学习、自动启用、自然收益或发布GO。

只读原字段生成在 `packages/tianwen-runtime-bundle/src/learning-consent-agent.ts` 的goalTaskOutcomeStatus和两原位置。只读检查入口 `tests/fixtures/learning-goal-report.entry.mjs` 保存全体条件结果的摘要，逐条结果仍含退出/输出摘要/stderr/源码限额；不是少检查条件。完成后简短说明文件；未运行测试不能声称测试通过。
