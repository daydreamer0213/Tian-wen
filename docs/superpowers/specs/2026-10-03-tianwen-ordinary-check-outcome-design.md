# 普通任务检查结果合同的失败收尾

基线 a000b56。当前普通 ConversationExternalCodeChecks.finish 在 callback catch 内解析结果格式和恢复原材料，但 required-condition 绑定仅在 catch 外实际 Ledger 写入才验证；格式合法而与事前条件不符的失败可能令整个 finish 拒绝且没有完成回执。研究 evaluateConversationStudyResultCheck 已将同类合同不符记为 unverifiable。先复现普通路径，不假定真实模型任务已发生该错误。

原规则：checker 失败、格式无效或不能证明原条件均不可建立功能失败来源；普通执行与原模型评审保持，检查为无法核验；不可事后重新prepare/evaluate。采用已有 Evolution validateConversationExternalCheck 作为唯一绑定定义，在 callback 收尾中验证完整结果后才离开 catch。真实 Ledger 写入继续在 catch 外，磁盘或历史冲突不可伪装成 checker 不可用。

备选：新增手写摘要比较会重复 Ledger 规则；把实际写入整体包入 catch 会吞掉存储/历史完整性错误。选择原验证器预检，复用现有结构，无新平台、条件或 API。

验证先红后绿：原生普通任务中 wrong-condition 和 missing-prepared-condition 均一次执行，保存 unverifiable 且无 qualified failure，不改变完整交付/双审；正确 required-failure 和原无 qualified failure 的 rejected 保持；实际持久记录冷恢复零模型/准备/执行、字节精确一致，重复 finish 不重跑；真实 Ledger 写入错误仍向外传播且无伪造完成回执。相关回归、八包类型、实际发行构建、独立审查与正式原字节核对后结束本修复。

人为 checker/响应只证明机制，不记新自然来源、反馈、研究、激活或自然效果。正式档及固定 checker 工厂不改变，不重评旧样本，不解除隔离或 main/Daily NO-GO，不重置原十工作日窗口。D 小证据、复用环境，D≥15GiB。
