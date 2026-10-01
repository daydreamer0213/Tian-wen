# 方法文件试验自身的原生操作证据

## 已知接缝与授权

所有者授权自主寻找/设计任务并持续推进完整学习。本轮接续3e15490，正式DEV仍6任务/0研究/隔离，完整目标未完成。普通文件原始复核已有本次动作；method-study刻意忽略task.fileExecution，以免借用来源任务动作。但runConversationFileTrial已保存真实新试验的完整原生proof/receipt，loop只把answer/files交给评审，没有提供新试验自己的读写路径、结果和顺序。因此“先读后写”和“本次已保存”无法从当前试验审查包获得对应动作来源。以现有真实原生文件fixture先验证此可达接缝，机制失败不记自然研究失败。

## 方案与边界

选择复用既有trial的执行/沙箱/文件捕获/receipt及全绑定冷恢复，只薄加本次试验动作投影和消费者；不重做Agent loop，不借来源旧动作，也不依靠写后内容自证。仅有回答更改或再增加评审模型不能修复来源缺失；放入完整工具readback会让生成内容成为事实来源，拒绝。

新review顶层trialExecution字段承载本次试验的原生proof、输出digest及动作（工具名、规范冻结相对路径或null、call/result序号、success/error）。路径null表示没有可确认的冻结文件路径，不宣称操作成功。每条调用只关联唯一原生结果，核对callId、turn/step、sourceEventSeq、先后次序，列出所有尝试；失败/拒绝不能被过滤成成功或未调用。成功路径必须属于冻结文件，不能暴露其他文件内容/路径、写后readback或工具参数。

run返回metadata，既有receipt和outputDigest身份不改变；默认旧recoverConversationFileTrial返回精确旧三字段不变。新独立recover伴随完整旧恢复再从同一proof派生动作。新method-study原生请求才引用本次trialExecution；原始source动作及旧method task.fileExecution仍分离。cold verifier遇到新字段时必须由对应arm已验证receipt/proof/input/config重建并精确比较；缺resolver或借另一次trial证据拒绝。旧wrapper缺字段不回填、不新增要求或重判。

## 交付与验证

先在原生read→write及method projection测试确认缺自身动作，再核对全部尝试、大小写规范、外部拒绝路径null、重复/错callId/step/sourceEventSeq/晚结果等不能生成有效动作。接入loop的新正式/探索试验及冷采用、独立file review packet；结果检查仍只收到原answer/files/outputDigest，不借新metadata改变独立程序结果。包含旧pre-budget receipt、旧无动作wrapper和新两审查冷恢复、篡改/错arm拒绝、输入-only内容不成额外答案和生成内容不成来源。

相关回归、类型/实际bundle、完整修改文件诊断及只读审查；正式DEV0模型恢复任务/材料/账本保持。没有新的真实问题来源、研究/激活或未来改善就如实记0；完整目标active、main/Daily NO-GO、原门槛/十工作日窗口保持。生成物仅D小记录，复用环境并清理自有试验根，最低15GiB。
