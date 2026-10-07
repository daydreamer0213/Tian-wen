# 原研究报告首次失败：自动成为原问题来源

事前源505ad3d4f0e09fc0db02587039787356afb69cf4固定新需求和35独立条件，未改原门槛。唯一真实Task `conversation-task:13fcc6a5d527c1b8754d1d308f1d8ebb3eb23f67cfb774da44e1af3dfbec28df` completed，程序rejected，评审inconclusive/invalid-judgment；首代码15960B保存且未被控制端修改。prepare/evaluate各1，真实请求15=识别1/根13/requirements1，未进入grounding。反馈/研究0，0 scripted请求，不重试Task或修旧结果。

真实程序缺陷是返回值使用 `...studyChecks`，将本应包在新增顶层studyChecks中的history/currentSession放在根上，覆盖旧history。事前35条件中25通过、10失败；既有来源41检查仍过。另Node0模型准确恢复原Task/完整6文件图/原请求-header/首代码/原归档和账本，先前两Task不变。

原public状态工具现在显示observedTasks=3、eligibleTasks=3（通过来源初筛）、problemSources=1、successfulCandidates=1。原checked-failure分支已消费这条真实程序失败，无需用户补写反馈。只有一个问题，现有成功候选与本报告检查条件的兼容性尚未证明，原ready仍awaiting-compatible-sources；不造第二个失败或追加旧题。

内容评审第二次无效：原raw verdict为met，但answer-37的引文 `const ACTIVATION_PENDING_KEYS = [` 不在指定分段内，且不在任何一个完整原答案分段内。顶层引文与audit格式合法，原validateClaimAudit正确拒收。实际原schema63385B，53个答案单元的quote没有enum约束：大文件schema降为紧凑版时丢掉原本逐单元的可选原文值，只留下示例。两次实际评审都发生分段引文错误，有据可以检查这个接收接缝；不能放宽host验证或修改旧引文。

下一先保留原验证，给后续大文件评审复用原SDK已有的逐单元原文选择约束，只在原体积范围内配置，溢出仍用原fallback；再执行第三项新的实际功能任务（原生Goal统计，同时修复本次实际报告覆盖缺陷）。这是后续代码实现，不是同题重评或模型已学会。第三项完整要求/初始失败代码/独立期望会另在答案前固定。

小包 `D:/DevData/tianwen-live-study-report-20261004`，同一持续DEV Profile，正式账本原SHA256只读未改，D约18GiB≥15GiB，无安装/依赖或环境副本，24拒删路径不碰。两个本轮runner的原收据及最终收尾见D审计。完整目标active/incomplete、main/Daily NO-GO、原门槛/十工作日决策窗口不变。
