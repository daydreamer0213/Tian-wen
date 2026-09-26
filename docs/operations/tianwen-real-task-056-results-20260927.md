# E056：文件任务在准入处被误分为外部任务

**结论：NO-GO。**准确提交 `f1c5049` 的候选包在全新隔离配置档运行了与 E055 相同的冻结用户任务和三份 TypeScript 输入。任务要求实际列目录、读文件、报告物理行数、UTF-8 字节数和 SHA-256，答案只在聊天中给出，不改文件。原生准入却把它判为 `external / other`，没有进入 `local-files / chat`。模型随后三次尝试 `tianwen_captured_file_facts` 均被拒绝，又运行自由 PowerShell 完成数字查询。普通回答完成，但原结果复核为 `inconclusive / invalid-judgment`，没有合格文件证据或有效双审。因严格文件捕获从未启动，本轮**不能证明**新候选的“执行前拒绝自由命令”和拒绝凭据恢复在真实模型任务中有效。

隔离根目录为 `D:/DevData/tianwen-acceptance-runs/056-certified-shell-denial/native-use`，任务 ID `conversation-task:ee6be327b99383a3b8819aa9c700939b2f8fef67e42b3ec827e1551214b49cfe`，主任务 Session 为 `session-680122df-8af2-4e68-aaba-dad0952b004f`。任务文本 456 字节、SHA-256 `b97ab8a83ad67187e84db880c71bf64d248989e044a2a4992f1067540d2a641f`。三份输入终态的字节数和哈希均与输入前冻结的 `freeze.json` 相同；该清单 SHA-256 为 `62cdea5d4815c2aff3f98cd2dc2ae02bcc03352e2c94de86663743b6ba3948f3`。候选包 SHA-256 `8dbe4902b2a0411f7301c1def490d99f3414faccc47a6136c22e58752cfac784`；安装运行时代码 SHA-256 `d78181bf07d7b0006ca588fcd20da390a2667f3cc8e2fdfe017b45ca8fab4da1`，与打包前一致。

只读审计从六份原生 Session 的压缩帧恢复了 20 次工具调用。主任务按顺序调用 `glob`、`pwsh`、三次 `read`、三次 `tianwen_captured_file_facts`、两次 `pwsh`；三次事实工具结果为错误，PowerShell 调用成功。两份审核子会话各尝试两次结构化提交，但账本的最终原结果仍是 `inconclusive / invalid-judgment`，不能把这些尝试记为有效双审。审计摘要在 `evidence/audit-056-native.json`，SHA-256 `5556f830538cea24f372bd7460dd33385efe9e081de0b63d4759447b0af85228`；终态账本 SHA-256 `eb4dec97e6daeffdc6478606e2d19d65815a0aee82294e30a0f151bcdeec09d5`。账本中没有原生 PowerShell 拒绝凭据，也没有研究或方法激活。

测试后自动分析已关闭至 revision 2 / `enabled:false`；隔离 host 的 PID 3632 与 51253 监听端口均已退出。保留原始准入与答案，不事后改判。这次试跑把下一缺口定位在**准入稳定性**：对这类受支持的本地只读文件查询，先让原生准入可靠给出 `local-files / chat`，同时避免将真正需要脚本、测试、网络或其他外部动作的任务误升为文件任务。修正后用新提交、新隔离配置档做前瞻试跑，分别验证拒绝前未执行、拒绝凭据可恢复、答案事实和两份独立审核。main/Daily 继续 NO-GO。
