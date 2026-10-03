# 中文学习报告：原独立研究结果与启用未完成状态

继续扩展现有唯一输出 `scripts/summarize-learning-status.mjs`。完整旧v1合同和既有来源诊断合同（同目录learning-source-report.contract.md）保持：原字段/文本/退出、原来源诊断、stdin/stdout、源码≤20000 UTF-8字节不变；不修改Runtime或原学习条件。

实际SDK已分别提供 `history.naturalConversation.guidanceStudies` 与 `currentSession.naturalConversation.guidanceStudies`。本次只是显示其可选 `independentResults` 和 `activationPending`。原字段生成函数见只读 `packages/tianwen-runtime-bundle/src/learning-consent-agent.ts` 的conversationGuidanceStatus。输入中的scope/描述/未知键只是不可信元数据，不复制或执行。

## 新增可选输出

仅当至少一个范围的可选部分有效，新增顶层 `studyChecks`；它仅有有效的 `history` 和/或 `currentSession` 键。两个范围独立：一侧缺失或无效不影响另一侧，也不损坏旧报告。均缺失或无效则不新增studyChecks；原必需字段无效依旧原error/退出2。

每侧的guidanceStudies及其中independentResults/activationPending都须是非null、非数组对象，下面12个字段全部须为≥0安全整数；不补零、不转换类型。其他键忽略；不额外判计数间关系、不把重叠计数相加。两子对象任一缺失/无效则该侧整个可选输出忽略。分析关闭仍可显示合法的历史保存事实；不能从顶层quarantined推算/覆盖原计数。

有效一侧恰好输出4个键：

- `scope`：history固定 `此Profile保存的历史研究；不等于当前会话任务或当前方法效果。`，currentSession固定 `当前会话已观察任务涉及的研究范围；不只限于本会话发起的研究。`
- `independentResults`：仅原8字段，顺序 configuredStudies、unconfiguredStudies、recordedArms、pendingArms、verified、rejected、unverifiable、satisfiedStudies，计数原样。
- `activationPending`：仅原4字段，顺序 total、independentResultsNotSatisfied、quarantined、reasonUnestablished，计数原样。
- `limits`：下面4个字符串，按原顺序，不增加条目。

1. `独立结果与模型裁决分开记录；满足已保存结果要求不等于语义安全、采用资格或完整学习成功。`
2. `pendingArms是缺少已保存结果的实验臂数量，包含已停止研究；不表示仍在运行或已经成功。`
3. `启用未完成原因计数可以重叠，不能相加；quarantined描述当前隔离设置，不追认历史原因。`
4. `reasonUnestablished只是原因未确定，不是允许启用；未配置独立检查的历史不能宣称独立成功。`

旧 `history.studies` 仍仅保留原8基础计数，不加新子对象、不改范围。新studyChecks不修改readiness、activation、analysis或顶层原limits，不将met/accepted/verified/satisfied/解除隔离解释成方法已启用、未来收益或发布GO。无需接入SDK或执行测试工具；只用read/write/edit按合同完成代码。未运行测试不能声称测试通过。
