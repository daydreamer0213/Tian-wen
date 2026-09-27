# E072：新来源的前瞻研究未采纳，并暴露关闭同意时的回溯误述

**结论：main/Daily NO-GO。** 从准确提交 `1f3dea1` 的运行包和全新隔离 Web Profile，首次模型调用前冻结两份普通项目摘要 S1/S2、各自读后反馈、独立对照 C、后续任务 F 及同意开关。三份普通摘要均为 `summarization/text`、原生双评审 `met`，没有文件或命令工具调用；两条反馈分别准确关联原摘要，原生评估均为 `preference/user-preference`。C 终态前研究未打开，随后自动研究自然启动，来源确为 S1/S2、对照为 C。

研究生成五案十臂并得出 `inconclusive`，没有方法激活。S1 基线与候选均 `met`；S2 基线两审分歧，综合为 `inconclusive`，候选双审 `met`；对照、相邻、留出案例两臂均 `met`。候选在 S2 上把已核实进展和待确认事项分开写，展示了局部改进，但来源之一没有相对提升，不能把这轮说成方法通过或未来任务效果。按事前停止条件，F **未发送**；没有用旧题补跑。

关闭本轮隔离同意后，工具和账本都正确显示 `revision 2 / enabled:false`，但模型给用户的补充回复称“本轮的摘要内容也不会被用于学习用途”。这与已经发生的研究使用相矛盾：关闭只对今后分析生效，不能抹去既有分析。该问题独立于研究 `inconclusive`，属于用户可见的语义误述。本轮立即停止 host；后续已给关闭工具增加前瞻范围和历史记录不回滚的明确返回说明，仍需新隔离真实模型验证其效果。

运行目录 `D:/DevData/tianwen-acceptance-runs/072-independent-source-study`。冻结文件 SHA-256 `9bdd438d3cb2432bab42ae53d50a955f8c6c55e5ed78cf9f192ff2fdb524cdb2`，运行包 SHA-256 `4f30e8b181fe6b7569c6aedae6bfb2afa8d20cfbc437fc58bfa4928f1a16a926`。关闭后只读审计覆盖 **50 份原生 Session、57 次工具调用**；八条预定消息各一次，F 零次；冻结内容、安装后运行时、Profile 配置与预先哈希相符，输入目录为空。审计文件 `native-use/evidence/audit-e072-v2.json` SHA-256 为 `2b557eca4f0785953efd227827eefd92196728f6cbba27facb4df79765379f02`。第一次审计脚本把内部评审提示当作用户消息而拒绝；修正为只统计主会话后通过，保留原失败审计文件。隔离 host PID 13804 已停止。
