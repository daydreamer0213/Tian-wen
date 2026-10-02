# 真实DEV入口模块原合同

实现 scripts/development-native-file-policy.mjs 和 scripts/development-native-task-result.mjs，供后续实际开发宿主复用。只允许这两个输出；不改变原Runtime、学习规则或验收入口。

## 文件权限模块

导出 createDevelopmentNativeFilePolicy(config, readCurrentContent)。config 为 {cwd, sessionId, outputPaths, referencePaths, maxTargetBytes}，cwd必须绝对，sessionId非空字符串，maxTargetBytes正安全整数≤98304；outputPaths非空，两组路径合并必须通过Evolution原parseConversationFileEntries。readCurrentContent为函数，接受已解析的声明输出绝对路径，返回当前字符串或null（不存在）；只在需要检查合法edit时调用。

返回 guard(execution)。execution为 {name,sessionId,parent?,callId,rootCallId,arguments}。guard返回 undefined 表示允许，非空字符串表示拒绝。仅允许本session原生root操作（parent未定义、callId/rootCallId为非空且相同字符串）。只读read允许全部声明输入/输出；write、edit仅允许声明输出。绝对/相对候选都按Node路径解析到cwd；Windows身份忽略大小写，其他平台保留大小写。拒绝未声明路径、任意其他工具、缺失/非对象参数、非字符串file_path。

write要求content字符串且UTF8字节≤maxTargetBytes；空内容允许。edit要求非空old_string、新string、replace_all可缺或boolean；只对合法声明输出调用readCurrentContent一次。当前内容必须为字符串且UTF8字节≤maxTargetBytes；旧串必须实际存在，replace_all不为true时必须仅出现一次。以字面串替换（不得解释$&、$`、$'或$$），计算完整替换后UTF8字节，超限拒绝。replace_all=true只替换实际不重叠匹配；不存在仍拒绝。检查不改文件/参数/配置。callback异常转为拒绝；配置必须克隆冻结，调用者后改数组不能扩大权限。不要限制请求数、制作执行工具或原生结果记录。

## 原结果投影模块

导出 summarizeDevelopmentNativeTask(task, expectedOutputPaths)。expectedOutputPaths为非空、唯一字符串数组，不得去重后接受重复；task来自已验证的Evolution原状态，亦可undefined。返回恰好六字段：taskId、completionStatus、functionalStatus、reviewVerdict（对应task.source.taskId、task.completion.status、task.externalCheckFinished.status、task.review.verdict，缺失给null），permissionSetExact、functionalCandidateVerified（boolean）。

permissionSetExact仅在原completion.files.outputPaths是完整唯一且与expectedOutputPaths逐字同集合时true；数组反序合法，缺/重/增/错拼写非法。functionalCandidateVerified仅在task已completed、有externalCheckPrepared、有externalCheckFinished.status='verified'、真实Evolution字段externalCheckInvalidated未定义且permissionSetExact为true时true；不借模型met或缺准备/核验推断true。reviewVerdict独立保留，模型inconclusive不改变已verified程序字段；不产生完整任务成功、反馈、研究、采用或学习收益判定。不得更改输入或历史。

## 原功能验收

只读 entry.mjs 实际导入两模块，包含以上允许及拒绝案例。全部原断言通过，stdout严格JSON {"passed":true}、exit0、stderr空。只读Evolution conversation-files.ts / learning-intake.ts为原路径/摘要依据。源码每个≤20,000 UTF8字节；只用Node22标准库及既有@tianwen/evolution。模型不运行命令、不改条件、参考或学习记录。

仓库根不是Evolution的裸包消费者。两个模块通过裸包@tianwen/evolution复用parseConversationFileEntries；薄DEV宿主负责在导入模块前，将这个包解析到Runtime既有peer依赖的真实发行入口。隔离功能入口将相同裸包解析到事前捕获的原conversation-files.ts。模块不安装依赖、不复制解析器、不自行寻找工作区或全局包；宿主必须另行实际验证这个解析职责。
