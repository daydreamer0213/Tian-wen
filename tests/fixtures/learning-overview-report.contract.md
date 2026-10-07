# 学习状态报告：可选中文概览

实际产品缺口：现有报告输出JSON，初学者仍需逐项理解字段。唯一可写 `scripts/summarize-learning-status.mjs`，只增加可选 `--overview` 开关，让使用者看到六条简明中文说明；仍输出JSON，旧字段及全部原合同保持。无需读取Runtime源码；字段只从本脚本已验证、已投影的summary消费。

只读参考是本合同、`tests/fixtures/learning-goal-report.contract.md`、`tests/fixtures/learning-study-report.contract.md`、`tests/fixtures/learning-source-report.contract.md`、`docs/operations/learning-status-summary-contract.md`、`tests/fixtures/learning-overview-report.entry.mjs`。不修改它们或其他文件，只用read/write/edit在这些明确路径处理。不得运行测试或调用其他工具；未运行测试不能声称通过。独立结果由既有宿主另产生。

无独立argv元素 `--overview` 时，整个旧JSON/退出/stderr原样，包括忽略未知argv；stdin里的同名元数据不能启用概览。`--overview=false`不是该开关，重复 `--overview`只产生一份概览。合法基础输入且带开关时，仅增加顶层 `overview`，它恰为以下六个字符串依序，不复制任意输入文字，不新增JSON字段或删除旧字段：

1. `历史普通任务：识别{summary.history.identifiedTasks}项，完成{summary.history.completed}项；这些不是当前会话任务数量。`
2. `历史程序检查：通过{summary.history.codeChecks.verified}项，拒绝{summary.history.codeChecks.rejected}项，不可核验{summary.history.codeChecks.unverifiable}项；不替代内容评审。`
3. `历史研究：已记录{summary.history.studies.total}项，接受{summary.history.studies.accepted}项，当前生效{summary.history.studies.currentlyActive}项，回滚{summary.history.studies.rolledBack}项；不证明后续收益。`
4. 原 `summary.readiness.explanation` 字符串原样。
5. 原 `summary.activation` 字符串原样。
6. `完整自动学习是否完成：本报告不能确认。`

数字用原JSON数值的JavaScript字符串表示，不求和、不从当前会话或Goal统计替换历史普通计数，不添加计数关系判定。分析关闭仍能展示已经保存的历史，不推导研究资格/方法成功/完整学习/GO。未知合法state继续用原固定解释，不把原state任意文字拼进概览。可选旧部分无效时仍按原规则忽略，其余原JSON保持。

基础输入无效时，无论是否带开关，都输出原 `{"error":"invalid-learning-status"}`、退出2、stderr为空，不增加overview；合法退出0。只用Node标准库/stdin/stdout，不读取其他文件、联网、起子进程或写文件；源码仍≤20,000 UTF-8字节。可以删冗余注释以保留原限额，但不能删功能/旧检查/文本。原99兼容条件与新概览条件在答案前固定，不新增完整学习发布门槛，不重判旧Task。
