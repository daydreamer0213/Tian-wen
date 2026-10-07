# 成功对照反馈规则一致性

## 已复现的问题

基线 b19b755。复用实际 EvolutionLedger 原反馈修订/归因记录和 Runtime selector，首红两项：checked-failure 分支已拒有有效空 criteria 偏好的 counter，但状态初筛仍计1；普通 model-not-met 分支不仅选它，而且 case-attempt 可先写入。既有 study-open 原支持验证明确拒绝 active preference/attributable-problem 的 counter。原设计尝试按问题 pair 去重，因此无效 counter 消耗 pair 后，即使有另一个干净对照，也不能重新尝试。这是前后消费者执行原反馈规则不一致，不是缺少许可或需要新增标准。

## 方案

在原 Runtime 成功对照初筛中复用已有 checkedCounter 的 latest active/proof/non-positive 判断；原 checked 分支的 pending assessment 规则保持，普通分支不新增 pending 门槛。不依赖 criteria 非空或 continuing scope 来豁免对照上的有效偏好/问题反馈，因为原 study-open 已明确拒绝这些对照。最新有效 positive 可继续覆盖前问题，inactive、无 proof、inconclusive、requirement-change 按原规则处理。

在 Ledger 新 design-attempt/study-open/activation 的现有 mutation-only counter check 入口提前执行同一原反馈判定和原 native negative 判定，拒绝时不写尝试，不消耗 pair。历史 replay 的验证/meaning、旧attempt去重、原 accepted/activation 不变；不回填先前失败尝试、不重评旧题。

选择这个小补丁，不增加新来源政策、通用规则引擎、模型评审或重试；不修改反馈归因/普通 verdict、checker 身份/功能条件、同意/隔离/main Daily NO-GO 或原十工作日窗口。此次直接工程修，不拿人为反馈夹具当自然来源。

## 验收与结束

1. 原真实 API 控制夹具下两分支均不选有 active empty preference 的 counter，诊断成功候选0；对应新attempt/study写入拒绝且 ledger 字节不变。
2. 增加合法干净counter后，原pair仍可首次尝试，准确选择该counter；拒绝不会产生重试或消耗旧pair。
3. positive覆盖、retraction/无proof/inconclusive与原pending资格分别保持；反馈到达发生在初筛之后，new-write 仍阻止有冲突的counter。
4. 旧checked/model反馈/ledger/cold状态相关回归、八包类型、完整发行声明、独立审查；实际正式0请求查询 ledger保持，checker根JS精确核对，不假定未改。
5. 证据 D:/DevData/tianwen-counter-feedback-consistency-20261003，无Docker/下载/环境副本；D≥15GiB。交付后继续完整目标，不能将控制夹具/本修复算新学习效果。
