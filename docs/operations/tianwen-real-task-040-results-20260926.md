# E040 新真实项目任务：大文件已入证据链，模型审核未完成

**结论：**准确候选 `62d905251bdac1093d6d307dfcdc72b5090c162e` 的有界大文件捕获在全新隔离桌面任务中生效：68,047 字节源码和另两份文件都被原生读取、持久捕获，普通回答完成，原结果审核实际启动。审核模型却在第一份子会话中先提交无效原文引用，随后携带冗长候选引用列表的错误回执使下一步超过上下文上限。产品最终正确记为 `inconclusive / model-unavailable`、`proof:null`，没有第二份审核或成功研究。**这是文件容量机制的前瞻证明，不是完整复核或答案质量通过。**main/Daily 仍 NO-GO。

## 冻结输入与真实执行

从上述提交构建运行包和独立桌面目录，包归档 SHA-256 为 `acbab133c47b2b8d2d4ca78e4370c8694566c2fde8fe1eaa55e0868ae9be5915`，安装文件逐项核对。模型调用前冻结固定任务、验收标准、控制脚本、配置、候选包以及三份工作区文件：E039 结果报告 5,343 字节、当前 `conversation-files.ts` 9,943 字节、`conversation-guidance-loop.ts` 68,047 字节，合计 83,333 字节。冻结清单位于 `D:/DevData/tianwen-acceptance-control/040-bounded-large-file/pre-input-freeze.json`，SHA-256 `0872738bf39249fbbb9a37e9136f8a48188775ff7cabfa020ee35756784b5421`。新配置档起始无 Session 和账本；模型为实际 DeepSeek-V4-Flash / High，任务只提交一次，没有事后改题、纠正或重试。

产品准入为 `local-files / chat`。主会话用四次 `glob` 定位文件，再作四次原生 `read`、一次目录大小查询和两次 `grep`，没有文件写入调用。三份首读内容均入账，任务结束的只读快照与初始快照相等。大源码的两次原生读取分别显示第 1–593 行和第 594–757 行；与冻结文件逐行比较，757 行全覆盖、零缺失、零不一致。普通回答 `completed`，随后有 `task-review-started`，说明缺文件证据的旧短路不再触发。这个逐行比对是 E040 的独立诊断，不能推广为产品对所有未来读取窗口的逐字节验证。

第一份原生审核子会话确实创建并调用了一次 `structured_output`。提交的 `evidenceQuotes[0]` 不在强制枚举的原文片段中，原生工具以 `INVALID_ARGS` 拒绝；错误回执把很长的允许片段列表带回模型上下文。该子会话随后出现不完整的压缩检查点，并以 `CONTEXT_WINDOW_EXCEEDED` 结束：提供方报告消息 860,714 tokens、预留输出 256,000 tokens，合计请求 1,116,714 tokens，高于其 1,048,576-token 上限。产品记下 `task-reviewed / inconclusive / model-unavailable`，空证明、无 `reviewChecks`。另两个子会话恰为两次任务准入；没有第二审核子会话。这个原生记录支持“首个审核失败后没有形成双审核”，不能把 `task-review-started` 直接算作成功复核。

独立只读审计 `D:/DevData/tianwen-acceptance-runs/040-bounded-large-file/native-use/evidence/audit-040-final.json` 为 `completed`，SHA-256 `63ab4cc821380325372aa3d7a9621d566151d563bfc0952c51e5736457262756`。四份原生导出清单 SHA-256 `ac8c57150f0d10e2096ccc794f3fbb08f2460b50d6ecbec2e9caf3cbc11e8905`；最终账本 SHA-256 `3582eeed04b366592e86c0de77383f2af977def12bfe9794b5370dcc4c48dd26`。关闭同意后为修订号 2、`enabled:false`，研究数为零。启动脚本的标准输入被执行环境关闭，无法送达原定的 `stop`；在核对准确命令行后按其专属 PID 停止测试 host，并复查父子进程及端口均消失，偏差记录在 `evidence/manual-host-stop.json`。没有改 main/Daily。

## 回答内容与下一步

普通回答正确区分 E039 的旧 32,768 字节限制与当前 96 KiB/128 KiB 常量，也正确说明一条反馈不足以证明研究已具备两个相容支持和成功反例。但它把**原结果复核的提前停止**和**后续研究来源选择**说成共同保证“不做复核”的两道闸门；实际前者在 `conversation-observer.ts` 的审核启动前完成，后者在 `conversation-guidance-loop.ts` 只决定已完成任务能否成为研究来源。它还猜测旧捕获限制和新文件常量“很可能分属不同代码路径”，当前 `conversation-file-material.ts` 实际直接使用后者。独立内容复查为 `not-fully-correct`，收据 `D:/DevData/tianwen-acceptance-runs/040-bounded-large-file/native-use/evidence/content-review-040.json` 的 SHA-256 为 `f9cd88d221b638d4ebb3264f3a9214dab595a1e3f85dcf77f7cc737d67d53ccd`；这不是产品模型审核，也没有反馈给该任务。

下一工程问题已经具体化：大文件快照可进入原审核，但长原文引用枚举一旦被模型错填，原生工具会把整个候选列表放进错误回执，可能使重试爆掉上下文。应保留宿主的严格逐字来源校验，缩小原生错误回执/引用参数的体积，并用新工程用例证明错误仍失败关闭；之后才能冻结新提交和新真实任务验收。不要为 E040 同一答案补测出通过，也不要把单次捕获成功说成学习链路完成。

