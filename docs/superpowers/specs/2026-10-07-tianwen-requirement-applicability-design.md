# Task23 / Task24：要求适用对象的边界

目标：沿用原正式学习门槛，修复审核把对子集的限制扩大到所有事项的误判，随后用新公开模拟来源取得首次完整学习及后任务效果证据。不是把 inconclusive 改为通过，也不是新增标准。

事实：Task22 的 source1 candidate 为“二十三本工具手册已可借用；办理时间为周五11:00至12:00。十一盒彩色粉笔尚待登记。秋假是否开放尚未确定。”，原反馈仅要求每个待办/未完成/未确定事项独立句。requirements 错误 not-met，理由把已可借用与明确时间的分号也作为违反“每项独立句”；grounding 正确 met，原宿主同合同 verified。无票首次语义盲审 -1 未见违规。Task20 的地点后分号连接首待办确实违规；Task22 对应 adjacent baseline 也确实违规，因此不能为了消除 false NOT 放松真实待办边界。

设计：保留 Task21 完整旧尾段、旧原始指令生成器及所有 v12/audit/schema/SDK/capture/正式裁决。现行审核仅追加一段通用阅读提醒：对每条限制先确定原要求明示的适用对象；对子集（如待办或未确定事项）的限制不得扩展到已完成、明确时间地点或其他对象。一般许可仍对未被具体限制覆盖的事项有效。对子集内仍检查完整句左右边界，不从引用数据生成指令。没有任何目标票、物品清单或旧样本注入。

兼容：新生产仅当前 v12/未显式quality版本发新完整指令；显式旧quality仍发原串。验证器严格接受同一已验证材料、purpose、focus、encoding重建的三个完整版本：原始、Task21尾段、Task23新尾段；旧quality不得接受不适用尾段。不能startsWith、去除任意后缀、忽略指令或更改旧SDK/票。Task22首次26检查须零模型恢复原值。

候选方案：改裁决或采用宿主票会改变原门槛/独立判断，不采用；另设结构化要求中间层会扩展schema/兼容面且仍需模型判范围，暂不作为本次修复；最小通用适用范围提醒直接针对已确认误读，范围有限且可追踪。

实施所有权：延续现有 SDD，明确复用 investigate_actor_semantic_seam 只负责 conversation-claim-review.ts 和其 spec.ts，review_shared_future_scope 做独立只读审查，不spawn新agent。Root负责文档、构建、controllers、provider与新任务。所有人不得覆盖他人修改。Task22实际source-freeze-end释放前不得修改生产或构建。

验证：先原生SDK脚本RED（不宣称模型改进），覆盖部分对象限制、全对象限制、一般许可、不允许以source有据掩盖格式错误、真待办分号左边界错误、正常多事项连接；同一真实SDK保存和proof通道冷恢复原始/Task21/Task23完整串，两个purpose/focus；拒绝错focus/材料/尾段注入/不适用旧quality。运行原六套完整回归、默认两包types/diff、独立规格与质量审查。Root原公开16步/入口/私有导入检查及旧feedback/claims恢复，按实际次数统计。

Task24：新普通空profile，复用环境不复制依赖；来源/反例/两案例采用全新物品数量时间记录与原反馈，同原公开模拟说明，固定共享合同不改变判断标准。原future1/future2各6效果标准及unrelated完整对象保留，未激活不消费；必须正式accepted、原生首次独立clear、自动许可激活才执行，保留所有首次结果并实际撤权/无关/冷重启/语义终审。不要重新判Task22，或补第三票/旧对重跑。主线只在原发布条件满足后给明确发布结论。

完成边界：脚本/一轮结束不代表完整自动学习目标完成。main/Daily NO-GO，整体目标active；D至少15GiB、优先20GiB，不复制整套环境或历史。Task22终审PASS且实际source-freeze-end已释放；本设计独立审查PASS，已纳入跟踪文档。
