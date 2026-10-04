# 原生 Goal 程序问题按原条件归类修复

当前原完整目标、十工作日窗口、main/Daily NO-GO和来源门槛不变。用户已明确授权自主推进，不重复逐项确认。

已定位：普通来源以checkerId/checkerDigest/requiredCondition归类，逐Task仍独立绑定contractDigest。原生Goal的scanGoal和Ledger却把contractDigest加入跨来源身份；实际Node adapter合同含requestText/inputsDigest/cases，合法不同输入因此被误排除。依据2026-10-01 checked-failure规范及2026-10-03 Goal研究设计，精确合同属于每Task证据，不能当共同问题类别。

选择仅删除两处跨来源contractDigest比较，继续逐Task完整合同恢复。保持两独立问题、同原条件/检查器、合格成功对照、输入独立性/同意/父版本/模型/质量/内容证明/原研究裁决及独立研究检查。不改协议、来源ID、原记录、旧裁决或案例数量，不让当前单个普通问题变为ready。保持差异无解释或完全放宽检查器两方案均不能解决原边界。

- [x] 先以独立合同的三个持久原生来源复现：原selector与Ledger均拒绝；原同合同控制及不同检查器/条件拒绝保持。
- [x] 修正Runtime selector与Ledger身份，逐Task contract仍在原结果owner/公开Node adapter/恢复路径逐项严格验证。无需新增服务或兼容策略字段。
- [x] 新不同合同来源沿原attempt/study-opened/支持/冷恢复成功；变动检查器/条件、重复输入、丢失准备检查及原引用仍拒绝。仅工程控制，不算自然失败/研究/收益。
- [x] 检查原SDK消费者与相关回归、完整Runtime及声明构建，独立审查关闭P2。准确交付见[本轮记录](../../operations/tianwen-review-and-source-family-20261004.md)，D>=15GiB。

这项修复消除一个真实产品接线错误，不解决缺少第二个真实问题、独立语义安全及后续效果的证据缺口。原三项完整自动学习计划不增阶段，工程和效果分别报告。
