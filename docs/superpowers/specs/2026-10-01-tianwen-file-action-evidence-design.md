# 完整文件输出的可信原生操作证据

## 当前事实与设计

上一真实96b618函数程序verified，但两项原生模型评价均inconclusive：完整文件复核清空toolEvidence，不能确认成功read后edit的流程和读取声明。旧chat文件已有file-execution-evidence.v1，包含只读保证；不能将它直接用于会写文件的任务。原历史和两模型结论保持，不重做该题。

选择复用原生捕获与恢复：新task-started保存可选fileExecutionProjection=native-actions.v1；原无字段任务不新增材料。新完整files源在recoverFiles已经验证完整原生区间、调用/结果、前像及输出后，生成file-execution-evidence.v2。每项列工具名、规范相对文件路径（辅助工具为null）、callSeq、resultSeq和success/error；顺序和成功来自原生记录的一对一关联，不来自模型或写后内容。既有chat继续原v1及原指令。未知policy/schema拒绝。

相比直接开放写后工具文本，此方式不允许生成文件内容自证；相比额外流程模型判定，没有新增模型或事后真值。它核实实际操作，仅支持对应工具行为、路径和顺序，不证明内容事实正确、测试通过、其他进程状态或语义安全。

## 版本、消费与边界

source新字段是事前政策，不改变taskId算法、质量合同、准入和研究资格。旧无字段source/完整file material及历史请求保持；marker只使新的完整files原始复核包含v2操作材料。原生span、唯一结果、sourceEventSeq、turn/step/callId、成功状态及captureSeq核对失败时停止提供材料。不能凭账本marker略过原生核验。

fileExecutionTexts分别处理v1和v2；新v2不含capturedInputsUnchanged或无write/edit保证。projectClaimEvidence只在原始source分支加入这些工具事实，不能进入method-study task的试验答案依据。fileClaimInstruction只对原始v2追加说明，保留原v1/无操作记录的指令精确文本，旧claimEvidence v1/v2冷恢复按原保存版保持。

## 验证与交付

先红覆盖新source政策保存/拒绝未知/旧shape；真实DSH原生read→edit→read顺序、路径、成功结果和完整文件材料，写后canary不可成为来源，旧无marker files没有新材料。变更seq/sourceEventSeq/step/callId/重复结果及失败结果时拒绝；冷恢复不调用模型或改原ledger。v1只读证据保持，method-study不能引用旧操作支持新答案。

相关观察/恢复/辅助工具/学习回归、八包类型和实际bundle、全部修改TS相对基线诊断，以及独立只读审查后提交开发分支。实现为控制端工程，不计新的真实模型任务、反馈、研究、自动激活或效果。后续需不同实际待办前瞻验证新路径，不重试96b618/43ad8。完整目标active/incomplete，main/Daily NO-GO、隔离、原门槛及窗口保持；D生成物、自清临时根，≥15GiB，争取≥20GiB。
