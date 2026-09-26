# E039 新项目任务：缺文件证据复核在真实产品中提前停止

**结论：**候选 `6faf5d6744317ab8c0c5cfb142f62a3c6f1bdadc` 的失败关闭行为通过一次新的、事先冻结的真实模型桌面验收。主任务实际读取三份项目材料并完成普通回答；由于 68,047 字节源码超过 32,768 字节单文件证据上限，产品记录 `task-file-evidence-unavailable / material-unavailable`。原结果复核随即记录 `inconclusive / file-evidence-unavailable`、`proof:null`，没有 `task-review-started`、两份审核记录或审核模型子会话。**回答内容另有一处可执行的错误，不能把本轮说成回答质量通过。**完整学习链路和 main/Daily 仍 NO-GO。

## 冻结与实际运行

从准确提交 `6faf5d6` 重建 Runtime 包和隔离 Desktop 目录，归档 SHA-256 为 `e0b3fa76d036a4e8e2d51f3f69322865dd8532ab11b156c5a005f14ea917d767`，逐文件安装校验通过。首次模型调用前的 `2026-09-26T12:57:02Z` 固定任务、内容与机制验收标准、停机规则、包和配置哈希、七份控制文件，以及三份工作区材料：E038 审计收据 5,767 字节、文件证据诊断 930 字节、当前 `conversation-guidance-loop.ts` 68,047 字节。冻结文件位于 `D:/DevData/tianwen-acceptance-control/039-file-review-prospective/`；`pre-input-freeze.json` 的 SHA-256 为 `ee56df546635d52c8efff538e8cb866abb2d487325514f7d165a5678e4e899ce`。新配置档起始没有 Session 或账本。没有改 E038 历史记录，也没有改 main/Daily。

在隔离桌面产品中开启学习同意后，控制者只提交一次冻结的项目排查请求：根据 E038 审计与当前学习流程源码，说明为什么一条可归因的 `verification` 反馈尚未打开研究。真实 DeepSeek-V4-Flash / High 主会话作了四次原生 `read`，且没有写文件工具调用。三份输入在审计结束时哈希均未变化。该任务的准入模式是 `local-files`，普通回答 `completed`；两份小材料被捕获，大源码导致完整文件材料不可用。关闭同意前，目标复核已结算为明确不可用；随后同意修订号 2、`enabled:false`，自有 host 正常停机，进程和本地端口均已消失。

只读原生审计为 `completed`：`D:/DevData/tianwen-acceptance-runs/039-file-review-prospective/native-use/evidence/audit-039-final.json`，SHA-256 `c2ef12cfbd08afe519b921542a2047c1bfb99fa7653cd253e248289f9c5eafd3`。三份原生 Session 导出中，一份是主会话，两份子会话恰好对应两个任务的准入证明；目标任务没有审核启动记录或审核子会话。这一判断限于完整保存并核对的本轮原生记录，不能推广成网络层的绝对无请求保证。原生导出清单 SHA-256 为 `d725fe99b76535a02b8ea19e737729de147103127b1e39b3f6fe481b2d846540`；最终账本 SHA-256 为 `2a880f21171ae69abd981a7812dffb9102fb7094ce186945b50dd0d89a5f2260`。本轮没有研究或方法激活。

## 回答内容与边界

回答正确看见一条 `attributable-problem / verification` 评估、零研究，并区分同意、两条相容支持、成功反例和文件材料等条件；它没有把原任务的 `inconclusive` 直接当成反馈无效。但给出的“最小后续核验”要求在原任务的 `task-admitted` 记录里查 `consentRevision`。只读核对 E038 原账本（SHA-256 `cc92222162ad0a25b5a18149cbe96c314561ccf856d0afebd95cef117ee59a26`）显示：这个字段在 `task-started`，值为 1；`task-admitted` 根本没有该字段。照其指引执行会查不到值，可能误判来源资格。回答还把审计计数未覆盖的五条记录说成未知种类；实际它们是顶层的同意、通知和制品记录，计数本来只按嵌套的 `record.kind` 分组。独立内容复查收据在 `D:/DevData/tianwen-acceptance-runs/039-file-review-prospective/native-use/evidence/content-review-039.json`，与原生答案摘要绑定。未向产品补发纠正，也未重做任务。

本轮只证明“缺完整文件证据时不再进行无来源原结果复核”这一机制在真实产品任务中生效；它没有扩大大文件或复杂命令的可复核范围，也没有证明答案可靠、学习研究完成或未来任务改善。下一阶段应把“有界且可由原生记录绑定的实际读取内容”作为单独设计与验收问题，并独立处理本次暴露的任务事实核验错误；不能为同一答案补测出通过结论。

验收关闭后，已将不再运行的候选桌面构建目录按逐文件哈希从 D 盘归档到 `E:/待清理/D盘迁移-2026-09-26/Tianwen-验收残余/tianwen-acceptance-runs/039-file-review-prospective/candidate-6faf5d674431`；115 个文件、369,976,193 字节，原 D 盘候选目录已移除，D 盘实测空闲增加 370,221,056 字节。映射及哈希在同一 E 盘目录的 `candidate-6faf5d674431.manifest-before.json` 与 `candidate-6faf5d674431.receipt.json`；原收据的 `bytes` 字段因统计脚本问题为空，实际字节数另存 `candidate-6faf5d674431.receipt-addendum.json`，没有改写原收据。上文首次验收的 D 盘候选包路径是当时的准确路径；后续若要重放，先依迁移清单定位或恢复，不能假定它仍在 D 盘。小体积冻结输入、原生 Session、账本及审计收据继续留在 D 盘。
