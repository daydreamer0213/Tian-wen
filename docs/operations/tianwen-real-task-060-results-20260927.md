# E060：v7 审核真实入审，抓住执行顺序错误；范围漏判仍待验证

**结论：main/Daily NO-GO。**准确提交 `e05dbb6666c7c2221d38df8aa511a6f3c43a8908` 构建新隔离产品包，并在新配置档提交一项 705 字节的三文件源码交接任务。任务要求先实际列目录，再读三个文件，说明 `recoverFiles` 的筛选集合、执行前拒绝与成功读取的区别，以及可引用的审核来源。真实 DeepSeek-V4-Flash / High 先尝试 `Get-ChildItem`，执行前被拒；随后先 `read` 三文件，才用 `glob` 成功列目录，另调用三次原生文件事实工具。主答却写“已按顺序实际执行了两步取证：先列目录，再逐文件读取”。两位独立 v7 审核者均据冻结的有序工具来源判 `not-met / source-fidelity`，宿主合议 `not-met`。这是本轮可定位的正确拒绝。主答明确区分被拒命令与后续读取，没有重现 E059 的“筛选后成立写成所有调用”的目标错误；本轮**不能证明** v7 已修复那类漏判。

隔离根目录：`D:/DevData/tianwen-acceptance-runs/060-scope-review-live/native-use`。任务 SHA-256 `525b58de27514bbdec08d7e52584a59e5b8aa215fe8c9e905a50e6aa9a9a3140`。冻结输入依次是 `conversation-task-material.ts` 17,299 字节 / `463bc43985a7e831ce49030375372a1769e68dd5a8a6f6ce66984008c5f2d605`、`conversation-file-ancillary.ts` 20,351 字节 / `f5da7301b3d7464bb638e3b3701ee918c64559c1e032f99d0fee2d38e5f787cd`、`conversation-claim-review.ts` 28,863 字节 / `ecd79e7732237c0566c503bb2d6d362b5e3ec634391b848f3eb8c09c280c5bdf`；终态字节与四份冻结哈希均一致。产品包 SHA-256 `f3aa66af0470242326da66e77caa6c47c770e58f4da15792f4cf204b109428ba`，打包前与安装后的 `runtime.js` 同为 `42159ca99051ef4944c527d28fcdddfde32e714aa69b775f594dd347d54050cc`。首次隔离主机启动因配置档缺包清单而在任何模型调用前失败，补齐本地打包与配置后才启动正式任务；冻结输入未变。

原任务 ID 为 `conversation-task:5c6c52a29e45988cfe0a08dc5b04e8f5050e9a1631a336b0cbcf535d87efb75e`。两份有效审核同属 `tianwen.claim-audit.v2`，各 84 个答案单元，证据摘要均为 `sha256:d7ce7ea4f3dcfa3e19b9d3e137cfa4c14393f7efd549c5dec8db117a5ff49116`；各自原生请求均含 v7 的跨相邻单元还原和筛选集合提示。最终解释为 765 / 1,071 UTF-8 字节，没有触及扩大的解释长度门槛。要求检查者在首次结构化提交前分别有一次未成为最终证明的提交；宿主最终保存的是两份有效审核。

在审核终态出现前，独立记录了主答对 `glob` 的泛化说法需要核对：它称 `glob`“只返回文件、从不返回目录”，并把“含隐藏与忽略文件”写进本轮匹配范围。冻结三文件源码并未建立这种通用工具行为。两份审计都将相关片段标为 `permitted inference`，没有把它作为本轮 `not-met` 的依据。由于宿主已因执行顺序判 `not-met`，这不是一次错误通过，但也不能把该片段说成已被充分核实。事前记录保存在隔离根的 `evidence/pre-review-observation.md`。

五份原生 Session 的只读摘要保存在 `evidence/audit-060-native.json`，SHA-256 `70117cc30e3e668dfb894ba5c55ec88eb2d2b70ccd1d9e483fbe95b60e650839`；终态账本 SHA-256 `2e7fd06ad09144ab330fea43c778066d56719a4668088e3dfc421ea4cb4af170`。分析同意由 revision 1 / `enabled:true` 关闭到 revision 2 / `enabled:false`；关闭消息自身被观察为另一任务，终态 `inconclusive / cancelled`、无双审，不计入原任务结论。账本无研究或方法激活记录；host PID 4324 已退出，临时页已关闭。

下一阶段保留当前 v7 候选，不在 E059/E060 结果上继续调提示。应从新准确提交和新冻结输入运行一项没有显眼执行顺序错误的自然文件任务，再设置一项正常范围陈述作为对照，分别看审核是否抓住筛选集合被扩大、是否误拒正确限定的说法。只有真实原任务、双审有效、内容独立复核及后续学习效果都过关，才能改变 main/Daily 的 NO-GO。
