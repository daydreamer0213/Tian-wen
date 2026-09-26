# E044 新真实任务：自然文件查询再次触发文件证据失败关闭

**结论：**准确提交 `2fd1f9b64955b78924b6b26064b68668d8caedec` 的全新隔离桌面完成了另一项事前冻结的真实项目备忘任务。模型原生读取了三份冻结文件，大源码分两窗覆盖 757/757 行；它还自然使用三条 `pwsh` 命令查看目录、统计源码行数和计算文件哈希。文件证据链最终记录 `material-unavailable`，原结果审核为 `inconclusive / file-evidence-unavailable`、空证明，没有审核模型子会话或研究。**E044 再次验证严格失败关闭，但仍未测到新引文候选的真实双审核。**main/Daily 保持 NO-GO。

## 冻结输入与过程

E044 以新的 `local-files / chat` 任务前瞻测试，没有回头重评 E043，也没有要求精确字数。任务要求实际读取 E043 结果报告、`conversation-claim-review.ts`、`conversation-guidance-loop.ts`，写带文件和行号的交接备忘。冻结前无 Session、账本或模型调用。候选包 SHA-256 为 `ef7d9a7be757d972b7d976ac8f5bb309474947b087e9d36af3c329fdff1c0f21`，与 E043 的产品包字节一致；新提交只增加文档和工程回归。三份冻结输入分别为 3,893、25,849、68,047 字节，共 97,789 字节。冻结清单 SHA-256 为 `f678c4c4e2976a384fbfd2e93ba37de436c112df5faf64f2ce3d70e99bc61cef`。

DeepSeek-V4-Flash / High 收到一次冻结任务。原生会话为 `session-200da967-3796-4e81-b958-9e0447ba5502`，任务 ID 为 `conversation-task:4142fc4e860efd12d95a09d5ab64a4624661d66a0f3acfefda145869ab50dd7f`。六次 `read` 中，大源码窗口为 1–400、401–757 行，逐行对照冻结文件全部吻合；三份首读内容与冻结文件字节一致。三次 `pwsh` 分别运行目录列表、对 `*.ts` 的 `Measure-Object -Line`、对 `*.ts,*.md` 的 `Get-FileHash`，没有写入工具调用。模型给出普通答案，回答 SHA-256 为 `sha256:f4cf7ed74c58b154541a5cef97fc81276129f1171c0e7c939e5e410705aac3f8`，长度 9,992 个 JavaScript 字符单元。

读到文件并不等于可归因的任务终态文件证据。现有原生 PowerShell 观察只认证一组有限目录命令；第二、三条带 `ForEach-Object` 的自由命令超出该认证语法。任务终态没有完整文件证明，产品依设计禁止继续原结果审核。第 43 轮的自由计数和第 44 轮的自然文件查询都触发了同一边界，因此单靠取消精确字数要求不能解除阻塞。这里没有把未获认证的命令按“看起来只读”直接放行。

独立阅读 E044 回答还能确认一处内容错误：它说最多 16 个引文候选，并据此否定 E043 对“最多 15 段”的复查。当前 `answerQuoteChoices` 在循环中最多收集 15 段，循环后还可加入一个非空尾段，最后另加入原始完整单元；因此非重复情况下最多为 16 段加原文，即 17 个候选。此为产品外的局部内容检查，不是模型双审核；E043 原任务及其复查不因这次回答而重评。

五份原生 Session 导出审计 SHA-256 为 `fabc3b370014cc72d83264b825728afb4d8cefb03d78be45a14e77dde7a6ec63`。只读终态审计 `D:/DevData/tianwen-acceptance-runs/044-quote-choice-native-review/native-use/evidence/audit-044-final.json` 状态为 `completed`，SHA-256 为 `dc293dd62e700319558962c2eaba11bca0637ee4a4b9e5713bf3c3ace3b7e5c0`；账本 SHA-256 为 `e9d5572c1f72da8aacf662ce1b202a66086e4f4ef08cff6e248a2dadf2404ed9`。独立同意已关闭至 revision 2 / `enabled:false`；测试 host 已停止，研究数为零。

## 下一项工程工作

先解决真实 `local-files` 任务中辅助文件查询的证据资格，而不是再用改写提示词规避命令。优先设计能原生证明工作区内文件元信息、行数和哈希的窄工具，明确它与普通 `pwsh` 的关系；任意脚本、工作区外读取、变更文件或无法形成原生收据时继续失败关闭。工程测试应同时覆盖可认证查询和不可认证脚本，再冻结新提交进行全新真实任务验收。只有看到两次独立原生审核及宿主严格校验都成功，才能宣称引文候选通过真实产品链路。
