# 尚未执行的真实留出待办：归档与原结果易读投影

用户需要区分归档、任务结束、程序结果、整体评审及学习效果。实现 scripts/development-native-archive-status.mjs，仅导出 formatDevelopmentNativeArchiveStatus(verification,summary)，纯函数无I/O/依赖，不增成功/资格或方法激活标签。

verification是原seal verifier六字段{sessionMatches,filesMatch,complete,missing,changed,added}，前三boolean，后三字符串数组；summary是原SDK+DEV六字段{taskId,completionStatus,functionalStatus,reviewVerdict,permissionSetExact,functionalCandidateVerified}，taskId为非空string或null，末二boolean。输入必须恰这些字段；unknown值/不正确类型TypeError。status合法值为completed/interrupted/failed/null、verified/rejected/unverifiable/null、met/not-met/inconclusive/null，保持原来事实，不以某一字段替代另一字段。verification.complete若true而sessionMatches/filesMatch不true，或filesMatch为true而任一差异数组非空，拒绝TypeError。

返回恰{archive,completion,functional,review,disposition}五字符串。archive优先会话不匹配→'会话不匹配'，否则文件变化→'归档已变化'，否则不完整→'归档文件不完整'，否则'归档字节一致且文件集合完整'；completion依上述值分别'任务已结束'/'任务中断'/'执行失败'/'任务状态缺失'；functional依上述值分别'原程序检查记录：通过'/'原程序检查记录：未通过'/'原程序检查记录：无法核验'/'原程序尚无检查记录'；review依上述值分别'整体评审通过'/'整体评审未通过'/'整体评审未定'/'尚未整体评审'。disposition恒'以上为原归档事实，不代表方法已采用或自动学习已完成。'。不得把functionalCandidateVerified=false改成true，且该字段不改变原程序记录的呈现。

输入不得修改，返回不共享可变对象。完整原功能入口全部原断言通过，stdout严格JSON {"passed":true}、exit0、stderr空；输入参数不得改变。此待办尚未执行，不能算自然效果或新发布门槛。
