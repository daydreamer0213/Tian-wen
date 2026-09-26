# E043 新真实任务：自由 PowerShell 计数使文件证据失败关闭，未测到引文审核

**结论：**准确提交 `40dd18e2cfb174791d7b9f91173d12240976ea53` 的全新隔离桌面完成了一次前置冻结的项目备忘任务。真实模型四次原生 `read` 完整读到三份文件，包括 68,047 字节源码的 757 行；随后它用四次 `pwsh` 命令统计草稿字数。文件证据链记录 `material-unavailable`，原结果复核按规则记为 `inconclusive / file-evidence-unavailable`、空证明，没有启动审核模型。**E043 证明文件证据在这类自然辅助命令下正确失败关闭，没有证明新引文候选通过真实双审核。**main/Daily 继续 NO-GO。

## 冻结与实际执行

候选包 SHA-256 为 `ef7d9a7be757d972b7d976ac8f5bb309474947b087e9d36af3c329fdff1c0f21`。模型调用前冻结 E042 结果报告（4,324 字节）、`conversation-claim-review.ts`（25,849 字节）和 `conversation-guidance-loop.ts`（68,047 字节），共 98,220 字节；冻结清单 SHA-256 为 `5eb7381f8171a5bab42380f49a2e2b1e4712c90ccbc60d0f1db1c4f1088f56dc`。全新配置档起始没有 Session、账本或模型调用。DeepSeek-V4-Flash / High 只收到一次冻结的项目任务，未改题、未向模型纠正或重试。

普通任务以 `local-files / chat` 准入并完成，回答 SHA-256 为 `sha256:75aa1dc3850f3254d440aa888e9e2ce5270cc48b7364d5d3177dc797bd51354b`。四次原生读取、四次 PowerShell 调用，没有写入工具调用。大源码读取窗口为第 1–593 行和第 594–757 行，独立逐行比对全覆盖、零缺失；三份文件首读内容与冻结文件完全一致。四次 PowerShell 的实际用途是统计草稿字符，出现在 `task-file-evidence-unavailable / material-unavailable` 入账前。此后任务虽然有普通回答，却无完整的可复核文件结束证据，产品没有生成原结果审核子会话或研究。

现行文件证据实现对 `pwsh` 附加操作要求原生凭据；若没有凭据，结束冻结不能生成完整文件证据。随后用同一类型的自由 PowerShell 计数命令做隔离工程复现，原生命令本身成功，但文件任务仍记 `material-unavailable`、完成结果中无文件证据。这支持本次失败与命令证据资格有关；E043 原生导出并不包含内部凭据对象，因此不把具体哪条内存断言说成已由桌面记录直接证明。该失败关闭应保留，不可忽略可能触及文件的命令来追认审核。

独立内容复查为 `not-fully-correct`：回答有六点、引用了所读文件，也区分 E042 历史事实与当前源码，但完整回答 962 个字符（包括额外前后说明），超过总计约 500–700 字的要求；它还把当前代码的最多 16 段候选说成“最多 15 段”。这不是产品模型审核，没有向该任务反馈。

只读终态审计 `D:/DevData/tianwen-acceptance-runs/043-bounded-answer-quotes/native-use/evidence/audit-043-final.json` 为 `completed`，SHA-256 `9ab4bb1846c44bafc6c0ab9a282724c94c3f15fa24be17ed29c1c8cbb5e343c7`；五份原生 Session 导出清单 SHA-256 `b891eae5fa7bfbc2ed9d8330d826c3d8baa0b8f9dd3c670d65cb3e3378b25f35`；内容复查收据 SHA-256 `a423d78445c1db182af42bafdc4c5ff193b8b8303437f31ea35b4ef3ae4c9e4a`；终态账本 SHA-256 `02b2c596d4dd90fb2357a5788a66608c3939eb6dcc3125fa0399974e0ad72595`。独立同意已关闭为 revision 2 / `enabled:false`，测试 host 已停止、端口无监听，研究数为零。

下一步用另一项真实项目任务前瞻测试引文候选，不指定精确字数，因此不需要为遵守输出长度而额外计数；模型仍可自然选择工具，若再使用无法形成凭据的命令，照样按失败关闭记录。同时把自由 PowerShell 辅助命令的证据资格作为独立产品问题研究，不因这次新候选而放宽来源规则。
