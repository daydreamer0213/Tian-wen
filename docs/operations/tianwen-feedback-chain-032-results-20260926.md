# 032 真实前瞻验证：长度修复生效，研究未打开，NO-GO

2026-09-26 按[输入前协议](tianwen-feedback-chain-032-protocol.md)在全新 E032 Profile 运行准确候选 `bbd96eb9fd3cc756bd3c48aff619ac36b9cdfbad`。独立构建 14 步、归档及桌面安装逐文件审计通过；归档 SHA-256 为 `7965bc25f9d9e49f0876424e71eaf20a5961927fc33fa2b2c60479f5a178e0b5`。请求、控制脚本与输入前冻结收据在 `D:/DevData/tianwen-acceptance-control/032`，两份冻结来源在 `E:/待清理/D盘迁移-2026-09-08/Tianwen-反馈链路-032/native-use/workspace`。网页使用 DeepSeek-V4-Flash / High、标准模式、Workspace Write；自动分析 revision 1 开启后，X/S1/S2/C 各在新会话发送一次，X/S1/S2 各在回答后追加一次固定反馈。研究未打开，协议规定的 F 未发送。

| 输入 | 原生观察 | 证据边界 |
| --- | --- | --- |
| X：读取两份记录并列 SHA-256 | 实际调用 glob、read 和 pwsh，两个哈希与冻结收据一致。反馈关联 X，独立评估为 `preference/user-preference`，含 5 条后续标准；v2 局部线索可恢复，为 5,673 字节。原任务准入 `local-files/summarization`，因命令与完整文件材料边界，总判 `inconclusive/invalid-judgment`。 | 合格局部线索，不是完整成功来源。 |
| S1：030 与 031 状态汇报 | `writing/text/met`，完整材料可恢复，两份独立检查均 `met`。第二份复核解释为 **1,607 UTF-8 字节**：已超过旧 1,536 上限，仍在修复候选中成功保存并保留原生证明。反馈关联 S1，评估为 `preference/user-preference`，3 条持续标准。 | 真实模型路径直接验证了已观测长度区间的修复，形成第一条完整支持；不证明大于 1,920 字节可通过。 |
| S2：复核长度进展汇报 | `writing/text/met`，完整材料及两份独立检查可恢复；反馈关联 S2，评估为 `preference/user-preference`，4 条持续标准。 | 第二条完整支持成立。 |
| C：一句话对照 | 一句话回答及两份检查 `met`，但准入为 `summarization/text`。 | 与 S1/S2 的 `writing/text` 不同族，不能担任研究规则要求的同族成功对照。 |

关闭前共有 7 条任务、3 条反馈评估；研究 **0**、提案实际消费 X 线索 **0**、方法采用 **0**。S1/S2 的两条支持成立，X 局部线索也成立，但冻结的 C 输入被真实准入判为另一任务族，研究所需的同族成功对照不存在。这是本轮控制题目设计失配，不能临时增加或修改题目，把 032 改判为完整通过。032 的工程修复验证与完整产品连接分别记录；031 历史失败不回填。

关闭前只读审计 `native-use/evidence/audit-before-disable-v2.json` 为 `completed`，SHA-256 `eb9115f008181df5af0676b3119433e9c044167612a525b5231debab1c2b6ddf`：16 份持久原生证明核验通过，5 次待测任务文件/命令调用未读控制材料。此项只说明本轮实际调用未读取控制材料，不证明 Workspace Write 阻止工作区外读取。学习已关闭到 revision 2 / `enabled:false`，无活动方法。关闭后审计 `native-use/evidence/audit-after-disable-v2.json` 为 `completed`，SHA-256 `ec0bb1590aa8bed261a967b0da2c784b5073761563339618ddf9042b583b6d6f`：原任务、评估及原生会话身份与关闭前一致，17 份证明核验通过；第 8 条仅为关闭控制任务。

网页已关闭。启动器标准输入在所用终端会话中关闭，未能使用预设的 `stop` 指令；核对 PID、命令行、父进程和 59007 端口后，只停止了本轮自有 host 与启动器。`native-use/evidence/owned-host-stop-fallback.json` 记录这一次关闭方式，SHA-256 `80debb52d4a6f72be7c34f19d88209ebb2a942a96d4d2d45c8105e163a8d41cc`；两个进程及端口监听均已消失。

**发布判断：完整链路仍 NO-GO。** 下一轮可用新的预冻结输入检验同族 `writing/text` 成功对照是否让研究自然打开，再核查提案原生请求对 X 线索的实际消费、案例隔离、采用和后续效果。不重跑 032，不把局部验证当作日常交付；main 和 Daily 不升级。
