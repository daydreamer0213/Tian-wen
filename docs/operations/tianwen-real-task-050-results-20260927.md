# E050：文件事实工具未获准入，真实任务未通过

**结论：**准确候选 `b3bc69db1b36c18b164e9d98bb5767215e1834fa` 在全新隔离配置档执行真实普通任务。模型自然查看目录并读取三份 TypeScript 文件，也尝试了三次 `tianwen_captured_file_facts`；三次均因任务被错误判为 `external` 而被拒绝。模型随后改用不被文件证据链认证的 PowerShell 脚本计数与哈希。两位独立原结果审核者分别判 `met` 和 `not-met`，宿主汇总 `inconclusive`。**E050 是失败样本，不是文件事实产品链路通过证据；main/Daily 继续 NO-GO。**

## 事前冻结与运行

隔离根目录为 `D:/DevData/tianwen-acceptance-runs/050-captured-file-facts/native-use`。冻结清单 SHA-256 为 `44a108d848e525d07a146fe14db8421d0f9fec4e9279ea7a45607e701a9e27d6`；三份输入分别为 954、15,809、21,239 字节，合计 38,002 字节。输入终态哈希均与冻结清单一致。候选运行包 SHA-256 为 `a5eb12d7f7202c6e8a7c5ed7beba1d82cc2b5922e4c3657cb1385294f26ee4ab`，全新配置档使用 DeepSeek-V4-Flash / High。用户任务明确要求实际目录查看、实读、逐文件行数、UTF-8 字节数、原始 SHA-256、与初始内容的关系及一处边界，且只在聊天回答、不改动文件。

原任务 ID 为 `conversation-task:e7a437bda0a05fc02b1b0a7895c37343f14fc0ac05ca6f4686a49566137b0959`。准入决策提取到了任务目标和各项条件，却将 `evaluationMode` 设为 `external`，未设置 `fileOutputKind`。工具据此正确拒绝了三次调用，报错为 `captured file facts require an active authorized local-file task`。模型退回自由 PowerShell；虽然它给出的三个文件字节数与哈希和冻结数据一致，仍没有建立可认证的文件事实结果。它还在必答的边界部分错误声称“无尾换行的三行内容会被该公式算成两行”，与源代码公式矛盾。独立审核的分歧因此不能算通过。

账本最终 SHA-256 为 `9354bf86707c7ed31e44283578e9dc745bc230edf207aa7078bdde696741292a`。原任务有两份审核和 `inconclusive` 汇总；后续只用于关闭同意的清理会话另有一条 `inconclusive`，不得混作 E050 的结果。账本没有研究或方法激活记录。自动分析同意从 revision 1 / `enabled:true` 关闭至 revision 2 / `enabled:false`，隔离 host 正常停止，进程与监听端口均已退出。

## 原因和下一候选

本轮的直接根因是准入说明仍把 `local-files` 限定在 `read/write/edit`，排除了新增的原生事实工具及目录发现。修正后的说明明确：当目录发现、读取和 `tianwen_captured_file_facts` 足够完成本地 UTF-8 文件查询且结果只在聊天交付时，判为 `local-files/chat`；任意 PowerShell、测试、网络或非文本文件仍属范围外。对应运行时类型检查通过，会话回归 22 组 **581/581** 通过。下一步应冻结修正提交与全新 E051 配置档，重新前瞻运行；不得给 E050 补判或回填原任务。
