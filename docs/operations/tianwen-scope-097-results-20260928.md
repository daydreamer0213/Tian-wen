# E097：普通任务末尾多出催促下一题，按协议停在反馈前

新隔离档 `D:/DevData/tianwen-scope-097-20260928` 使用源码提交 `0d0761c8cdd0f17ae8aad1fcf48a1f6248bbda81`、DeepSeek-V4-Flash / High、任务族独立核对和隔离的方法激活。首次模型调用前冻结了全新岚丘 S1、松澜 S2、云屿 C、两条读后混合反馈、同意与撤销、停止条件、配置和运行包；`freeze.json` SHA-256 为 `11629df6a37b8be439930f44751305ee22ffedef4a2ee9ca0cfae4bd247d897b`，包 SHA-256 为 `138d3daed118955408a53869a97a7737ceaf714c0f9d8120a518568a18a77cb6`。

实际只提交开场、同意、S1 和撤销四条直接输入。S1 任务被准入为 `summarization/text`，独立任务族核对也为 `summarization`。答案准确区分 24 项中 16 完成、5 待安全复核且未判通过或失败、3 确认兼容性测试失败，交接清单、外部试用和日期状态也准确；但摘要之后另加了“请提交第二份进度摘要。”。直接请求只要一段、仅用记录，不要额外建议或预测。两份原生复核均判 `not-met / instruction-following`，逐字指出多出的流程句不属于这次交付内容。按事前条件，**未发送反馈1、S2、反馈2或 C**，没有机会验证新增的逐条持续范围核对；反馈评估 0、研究 0、激活 0。E096 的范围问题不能据此宣称修复已过真实模型验收。

学习同意已撤销为 `revision:2 / enabled:false`，宿主已停。初版终态审计 `native-use/evidence/audit-final.json`（SHA-256 `8674cfe534e498a6a9080d0268b415b274284d580b33e4ebb6d1b5dbb8f34b48`）和原生证明审计 `audit-proof.json`（SHA-256 `7d394528c5db0d3e9f0e6c6c254dd79f43b6c98fc7ddba3a227eeea1bfb2f50d`）保留原样，`allExpected:false` 的原因是审计脚本只预期一条任务记录，漏计了撤销同意回合被准入为 `task/other` 的记录。补充审计 `audit-final-addendum.json`（SHA-256 `55c3b93be67ff72606b2b2f27d01f908260ac0c2dbf4c48f3446f22f2d6f6938`）绑定前两份原始报告，确认四条直接输入各一次、无额外输入、冻结文件与安装包哈希相同、6 份原生 Session、S1 准入和任务族证明及双审证明可回读、空输入目录、同意关闭和宿主停止，`stopProtocolMatched:true`。撤销同意回合的 `task/other / inconclusive` 准入另列为观察到的产品行为，不能把补充审计当作 S1 或范围核对通过。

工程上已针对本次生成侧失败做窄修：在原有“一段、不加附言”提醒中明说，即使前文提过后续任务，本次一段交付后也不要催促下一题；不改变用户明确允许标题、列表或多段的任务。相关测试先红后绿，观察器 **40/40**、八包 TypeScript 检查通过。这个提示改动仍需全新样本前瞻验证；不回跑 E097 凑结果。main/Daily **NO-GO**。

准备环境时曾中止一次会跟随依赖链接展开的复制，留下约 70 MB 未使用的 `D:/DevData/tianwen-study-097-20260928/native-use/dsh-home/profiles` 副本；实际 E097 使用另一个小目录。针对已核实目标的递归清理被自动审批拒绝，未改用其他删除方式绕过。该副本不含本轮模型证据，后续磁盘维护时单独处理。
