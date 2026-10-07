# E062：首条受控反馈未关联原任务，学习链路按冻结条件停止

**结论：main/Daily NO-GO。**本轮是新的隔离产品试验，不是外部用户长期使用。真实模型完成第一条普通项目摘要，产品两份独立原生审核均判 `met`；测试操作者读完回答后，才提出适用于今后同类摘要的具体表达偏好。产品识别出 `preference / user-preference`，却把 `relatedTaskId` 留为 `null`，因此没有启动针对原摘要的反馈评估。按事前冻结的停止条件，S2、成功对照 C、未来任务 F 均未提交；没有研究、方法激活或后续效果证据。

隔离根目录是 `D:/DevData/tianwen-acceptance-runs/062-learning-chain`。运行时代码沿用准确提交 `884fbebcfdbaec8ca098333b43ce7b5cab859daf` 的已核产品包，包 SHA-256 为 `f3aa66af0470242326da66e77caa6c47c770e58f4da15792f4cf204b109428ba`，安装后的 `runtime.js` 为 `42159ca99051ef4944c527d28fcdddfde32e714aa69b775f594dd347d54050cc`。本轮分支起点 `f4c916af949f8ffd64474e9db16c49235b56bf2f` 相对运行时代码只改文档。`protocol.md` 和 S1/S2/C/F 在首次模型调用前冻结，字节及哈希见 `freeze.json`；协议 SHA-256 为 `189c8bd699bfa28bf7e49e7bcfc6a29b51d40f0e2948dd941096608274eebb41`。预先冻结后续题目不表示实际发送。S1 的输入哈希为 `df620092f790b01051658258350a22cf386ff7bb77b6594c08f62531ae1555d6`；读后反馈单独保存于 `feedback-S1.txt`，哈希为 `403d20a10d397b2061d2ce8deaf6f8ac826b0a19b9cf4b0de57d6a1e128e1132`。

S1 原任务 `conversation-task:4728f18d965102e9f0e64a3490e1f6113cc4c35b26f93f08ffc7a6230af9d499` 被准入为 `summarization/text`，要求不超过 280 字、只依据给定 E061 事实。回答用五条要点概括，末条才写“修复效果尚未得到证明；日常版未升级”。产品两份独立原生审核（requirements、grounding）均判 `met`，汇总也为 `met`。这里的 `met` 只证明原请求按该次审核通过，不代表后来的表达偏好已经生效。

操作者据此在**同一会话**指出最需要先看到的结论放在末尾，要求今后同类摘要第一句先写整体结论与风险，再分开写已证实结果和未证实边界，并明确不追溯修改原任务、不补充材料外事实。该轮任务 ID 为 `conversation-task:580dccabfbd98db06be99b1f95f161cb9db3c88a2e51a2941f922daf73d26b3b`。原生准入请求实际含唯一 `priorTasks`：S1 的准确任务 ID、目标和回答 ID；模型结构化输出识别了持续偏好及原话，但 `relatedTaskId:null`。宿主只对**非空**关联 ID 校验是否属于先前任务；反馈评估器仅在 ID 等于目标任务时收取自然反馈，故本轮账本无 `feedback-assessment-started` 或 `feedback-assessed`。这是已见的具体断点；仅凭本轮不能断定模型为何留空，也不能把该反馈回填为有效支持。

七份原生 Session 已只读解码，摘要 `native-use/evidence/audit-062-native.json` SHA-256 `e8d57a656a59c93092d82a94e707f88809f9e143246fd5cb03b5c5da37d13247`；准入请求中的 `priorTasks` 与输出提取为 `native-use/evidence/admission-material-062.jsonl`，SHA-256 `2a470bf000f3195faa51bae43832a6865e343dc768d9193e4dcd802606ba599d`。终态账本 SHA-256 `c2a8a03468a0c82e63b1c43efd47567084f92788b18427fc5268751ca0dd702d`，仅有 S1、反馈轮及关闭轮三条任务；无反馈评估、研究或方法激活记录。自动分析在本隔离档由修订号 1 的 `enabled:true` 关闭到修订号 2 的 `enabled:false`；关闭轮自身记 `inconclusive / cancelled`，不计入 S1 判断。host PID 12464 已退出，浏览器页已关闭。

**下一工程入口：**为“明确指向唯一先前回答、已识别为反馈但关联 ID 为空”的情形设计有证据约束的归因复核；仍须允许真实歧义时保持未关联，不能仅因唯一先前任务就自动认领反馈。先用反例测试划清归因边界，再改产品并在新隔离档前瞻验证。旧 E062 不重判，不补发反馈凑结果。即使归因打通，两个同族支持、成功对照、研究裁决、方法激活、后续效果和试验答案语义安全仍须分别证明。
