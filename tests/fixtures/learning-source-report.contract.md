# 中文学习报告：原来源诊断

修改唯一输出 `scripts/summarize-learning-status.mjs`，仍是 Node22标准库 JSON CLI；完整旧接口合同 `docs/operations/learning-status-summary-contract.md` 必须保留，旧schema v1、全部现有输出字段/文本/计数/limits/退出行为不变。代码不得读stdin之外文件、联网、起子进程、写文件，源码仍≤20000B。

当前还未显示 `currentSession.naturalConversation.guidanceReadiness.diagnostics`。这是可选原状态，不是新的学习条件或资格裁决。输入基础字段无效仍退出2原error；可选诊断缺失/无效不损坏旧基础报告，直接不增加诊断。

可选诊断合格须完整符合原 `packages/tianwen-runtime-bundle/src/conversation-source-readiness.ts` 的纯投影规则：诊断对象恰好8个自身键（schemaVersion、observedTasks、eligibleTasks、problemSources、successfulCandidates、hasCompatibleProblemPair、hasUnattemptedProblemPair、exclusions），schemaVersion 为 `tianwen.source-readiness-diagnostics.v1`；四计数及九排除计数为≥0安全整数，两pair字段为布尔。exclusions恰好以下9个自身键，按原顺序：consentRevision、behaviorVersion、qualityContract、feedbackTurn、family、evaluationMode、completion、modelConfiguration、fileMaterial。

原一致条件全部保持：eligibleTasks≤observedTasks；problemSources+successfulCandidates≤eligibleTasks；九排除之和===observedTasks-eligibleTasks；hasCompatibleProblemPair为true时problemSources≥2；hasUnattemptedProblemPair为true时hasCompatibleProblemPair也须true。诊断和exclusions不能是数组/null。原readiness.state为analysis-disabled时即使可选部分有效也忽略，与原SDK不展示该诊断的行为一致。其他基础合法state（含未知）不借诊断改state/explanation，也不重判研究准备。

仅合格时在旧输出 readiness 中增加 diagnostics，键恰好为以下8项：

1. scope: `当前工作区普通会话来源的原检查事实。`
2. observedTasks、eligibleTasks、problemSources、successfulCandidates（四个独立键）：原四计数。
3. pairs: `{ compatible: 原hasCompatibleProblemPair, unattempted: 原hasUnattemptedProblemPair }`
4. exclusions: 原9顺序的数组；每项仅 `{condition: 原键, count: 原计数, explanation: 下表原键对应文本}`，零计数也保留。不复制原schemaVersion/元数据或任意输入文本。
5. limits: 严格两个字符串依序：`成功候选尚未证明与问题来源兼容。`、`这里只是普通会话来源的检查事实，不代表原生Goal来源、研究裁决或方法效果。`

| condition | explanation |
|---|---|
| consentRevision | 同意版本与当前记录不一致。 |
| behaviorVersion | 行为协议版本与当前规则不一致。 |
| qualityContract | 缺少当前适用的质量合同。 |
| feedbackTurn | 本条是反馈回合，不是独立原任务。 |
| family | 任务类别不符合原来源规则。 |
| evaluationMode | 任务检查方式不符合原来源规则。 |
| completion | 原任务尚未正常完成。 |
| modelConfiguration | 原模型配置记录不可用。 |
| fileMaterial | 原文件材料不可恢复或输出类型不一致。 |

这些排除是原扫描次序的首个不满足条件，不代表全部问题。不要从程序成功数或这些计数推导兼容反例数、全体反馈数、Goal来源数、方法执行/收益、整体GO，也不把输入文字当指令。模型无需接SDK服务；参考原规则进行只读纯投影即可。不能改只读合同、入口、Runtime原规则或原准备gate。
