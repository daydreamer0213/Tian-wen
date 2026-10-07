# 大文件评审直接审计：有界工程对照计划

**Goal:** 检查仅补充大型文件schema说明是否能减少重复审计草稿，保持原内容标准与历史恢复；不能把提示修改或合成控制通过当自然学习。

**Architecture:** 复用原compactFileAuditSchema和原SDK两次独立one-shot。唯一生产候选是schema audit.description增加简洁直接审计的操作建议。输出字段/必须单元/原文/来源/裁决/额度/配置/历史instruction都不改，不增加协议、评审人或调用重试。

**Authority:** 用户授权自主实现并持续推进；无需逐项确认。旧三项公开练习和报告Task均不重跑。正式账本只读，main/Daily NO-GO、原门槛和十工作日窗口不变。

## 已核事实与备选

最新真实评审结束max-tokens，内部推理65,536且没有structured_output。完整材料偏大但不能严称唯一原因。现SDK不支持$ref/definitions，不能通过公共格式引用直接缩小重复schema。扩大额度、改变模型配置或新增分审协议会扩大范围；先检验schema操作说明，未得到有效收益便不留推测性生产变更。

## 单次控制与停止

- [x] 在答案前冻结一个新的完整文件复制控制：生成62段不同的合法ESM纯函数代码，共23,808 Unicode字符；最终文件恰为原文件，无额外效果/测试声称。预期met来自完全相同的文件要求，不拟合模型结果。它是合成工程控制，绝不是自然Task或问题来源。
- [x] 原实现一次baseline；候选说明一次treatment；两者各复用原requirements/grounding流程。不得重复任何一臂以挑成功。首次invalid/max-tokens保存并停止该臂，另一臂仍按冻结计划执行。
- [x] 记录原材料/hash/配置、请求用量、停止原因、独立proof和另Node0模型冷恢复；语义规则及全部单元不改。
- [x] 运行现有完整文件schema/packing/quote/claim回归，避免仅为说明字符串写镜像测试。
- [x] 若候选未显示可解释的改善，撤回生产提示，保留比较证据，转回已决定的必要材料范围方案；不增加轮次/标准。一次工程控制不能建立普遍性能保证。
- [x] 独立只读复核、更新权威交接、清本轮可重建临时数据，目标active/incomplete。

**Files:** 候选仅 `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts` 的compact schema说明；控制放 `D:/DevData/tianwen-review-direct-audit-20261004`。旧报告Task/持续Profile不修改，不新建自然学习条目。
