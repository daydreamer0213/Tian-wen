# 普通任务的无效检查回报能够正确结束

基线 a000b56，事前设计/计划 7aff228。普通任务 checker 的失败摘要错误，或原准备没有 requiredCondition 却回报该条件失败时，旧 Runtime 在真正写 Ledger 才拒绝；finish 没有保存结果，任务停留在检查未结束。两项原生控制首红均 externalCheckFinished undefined，存储错误控制项通过。这个错误来自检查器合同，不是任务功能失败、模型评审错误或自然用户反馈。

只在普通 finish 的 callback 收尾增加五行：复用原 Evolution validateConversationExternalCheck 预检完整回报，失败沿原 catch 保存 unverifiable。真实 Ledger 写入仍在 catch 外，存储与历史冲突向调用方报告；没有手写新摘要政策或吞错。不修改 Ledger、研究结果检查器、准备身份、独立功能条件、反馈资格或旧判断。

## 验证

- 新两种无效条件回报与存储错误控制，加已有正确 required-failure，定向4项通过。五组完整相关回归 **242项通过**，定向项在其中，不重复加算。
- 无效回报保存一次 unverifiable，无 failedRequiredConditionDigest，不成为 checked failure；原任务 completed、原双审 met 保持。正确 qualified rejected 和原不带 qualified 标记的 rejected 保持。
- 原生持久任务冷恢复：完整任务相同，账本字节相同，0模型请求、0再次prepare/evaluate；重复finish也不重跑。真实写入错误仍拒绝、无伪造完成回执。
- 八包类型零诊断；实际 Runtime 完整发行及公开声明构建成功。独立静态只读审查无有据P1/P2，确认原验证器复用与保存错误边界。
- 最终实际发行/真实状态工具只读正式档：19观察、18识别完成、12初筛、1可信问题、5成功初筛，兼容问题组合 false；反馈归因0、研究0、隔离true，0模型请求/程序执行/新自然任务。正式完整 SHA256 `91f83d10c45280e0a1f5bb39873dce48984f4311a76a513df2bf041308e619b9` 精确保持；固定 checker 工厂根JS SHA256 `1c0718e6c99fc8f9836859da23db663179caea255bdb454754c72368f5492abf` 精确保持。

证据在 `D:/DevData/tianwen-ordinary-check-outcome-20261003`，仅首红/定向与相关回归、类型/发行、只读正式状态/驱动、审查/精确提交/容量回执，无模型/Docker/下载/环境或完整Profile副本。D约18.58GiB≥15，尚未达20偏好。

本修复证明错误检查器回报能够正确结束，不证明自然学习效果，不回填旧任务。当前来源不足仍按原规则保持，但不机械停止独立开发。后续继续在修好的开发入口承接有实际用途的工作，事前冻结合同/独立期望/首结果；真实问题才进入原研究，采用与后续收益分别核对，不追加练习凑来源、不向所有者索题或催评价。完整目标active/incomplete，main/Daily NO-GO、原同意/隔离/发布门槛与既定十工作日窗口保持，不重置计时。
