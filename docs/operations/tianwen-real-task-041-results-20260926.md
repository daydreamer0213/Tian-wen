# E041 新真实任务：引用参数错误已消失，逐条审计仍失败关闭

**结论：**从准确提交 `efeb1aa81deded32a4dce21ac0159ab29691c712` 构建的隔离桌面，在一次新项目任务中完整读取并捕获 68,047 字节源码；第一审核子会话这次成功提交原生 `structured_output`，没有 E040 的引用枚举参数错误或上下文超限。但它把跨越回答单元边界的句子填进 `answer-41` 的审计引文，宿主严格逐字校验拒绝，最终为 `inconclusive / invalid-judgment`、空证明、无第二审核。**E041 证明了这次引用参数修复在真实模型下走到更远一步，不是完整双审核或学习通过。**main/Daily 仍 NO-GO。

## 冻结输入与执行

候选包 SHA-256 为 `f202c9039051556fe0fee1f871b31404441c4fafbba07a31ec553140f62ea49d`。模型调用前冻结三份文件：E040 结果报告 5,174 字节、`conversation-judgment.ts` 26,675 字节、`conversation-guidance-loop.ts` 68,047 字节，合计 99,896 字节。冻结清单 `D:/DevData/tianwen-acceptance-control/041-bounded-review-quotes/pre-input-freeze.json` 的 SHA-256 为 `1231a6a2666e373ed0884d3b9c41973e699c0bbb213b6964035ed832928b234b`。新配置档起始无 Session 和账本；实际 DeepSeek-V4-Flash / High 只接到一次冻结的项目任务，没有改题、纠正或重试。

普通任务以 `local-files / chat` 准入并完成，四次原生 `read`，没有写入调用。大源码两次读取窗口分别为第 1–400 行和第 401–757 行；逐行比对冻结文件为 757 行全覆盖、零缺失。三份文件首读均入账，收尾快照与首读一致。回答 SHA-256 为 `sha256:0f6b188031b91c75d9f3fb5d8025d5bc23e75ccdb485dcc7c12ea5194856d36a`。

## 审核结果与下一处工程问题

第一审核子会话 `b24c28ca-0b7a-4227-b285-1a2b10dfac47` 以准确 DeepSeek 模型完成一个原生 `structured_output` 调用，工具返回成功。原生 `evidenceQuotes.items` 为普通字符串、没有原文 `enum`；模型提交的六条摘要引文都能在冻结的来源或回答单元中找到。相比 E040，长候选引用列表没有再通过参数错误回执灌入上下文。

该次审核同时提交了覆盖 64 个回答单元的主张审计。独立按现行宿主校验重放，唯一不合格处是 `answer-41` 的主张引文跨越两个相邻回答单元，不能在它声称对应的单个单元内逐字找到。宿主据此拒绝第一审核；账本记录 `task-reviewed / inconclusive / invalid-judgment`，`proof:null`、无 `reviewChecks`、无第二审核子会话，研究数为零。这是正确的失败关闭，不应把原生工具成功当成审核通过。

原生 `structured_output` **整份工具模式**仍有 1,357,234 字节，主要因为 1,153 个证据单元中大量来源 ID 被重复放进每个回答单元的 `sourceIds` 枚举。此体积不再是 `evidenceQuotes` 枚举造成的；E041 没有证明它已导致失败，但它仍扩大模型上下文和参数错误回执的风险。下一工程增量应把来源 ID 参数也保持有界，同时保留现有宿主对来源 ID 和逐条引文的实时及恢复校验；不能放宽 `answer-41` 的原文规则来追认本次审核。新提交需再用新的真实任务前瞻验收。

独立只读审计 `D:/DevData/tianwen-acceptance-runs/041-bounded-review-quotes/native-use/evidence/audit-041-final.json` 为 `completed`，SHA-256 `91d9f0ef0989459a1260f2df8f17a3f02bdc458bd30a47308090953b0d0e9ad2`；六份原生 Session 导出清单 SHA-256 `03a34d07c2749847a4051c302f0dbf4c73209bcdcba733e21966bc4a53682ea8`，终态账本 SHA-256 `54a55d5434aff16ddba29d19be28ce6e3eac2cf50ad692bb1417deffe80835e1`。隔离同意已关闭为 revision 2 / `enabled:false`；拥有的测试 host 通过预定 `stop` 指令停止，进程及端口无监听。

独立内容复查也判定回答 `not-fully-correct`：它把 `conversation-judgment.ts` 中通用复核函数的“收完两份后校验引用”写成现行原结果复核顺序；实际 `conversation-observer.ts` 调用 `runConversationClaimReview`，后者每拿到一份原生结果就校验引用，再决定是否启动第二份。收据 `D:/DevData/tianwen-acceptance-runs/041-bounded-review-quotes/native-use/evidence/content-review-041.json` SHA-256 为 `c6ce8e20e171713e678c20ea199fd6ff6449ece91b6ba60ab2f391b234fd69e4`；这不是产品模型审核，也没有给该任务反馈。

