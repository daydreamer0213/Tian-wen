# 后续独立检查失败与回滚：设计

## 已知问题与职责

基线 b72c4a2，工作区干净。延续所有者自主选任务及完整目标授权。自然学习原设计允许同作用域、族、方法版本、模型的两个不同后续失败退回准确父版本，不重写历史任务。已有普通 code 文件任务能候选前准备可信检查、保存绑定的 rejected；该事件会唤醒现有 task lane，但 runtime rollbackIfNeeded 和账本 regression 校验仅看模型 not-met。模型 met／检查 rejected 的冲突没有进入退化消费者。此项先用合法完整受控账本复现，不以夹具证明真实未来效果。

天问负责保存证据及版本治理，不保证通用任务正确，也不把程序 verified 提升任务整体 met。明确 rejected 是适用事前检查的负面结果；将其作为回滚证据不代表证明方法导致了失败。原两不同后续失败门槛不变。

## 方案与选择

1. 继续只看模型 not-met：保留当前行为，但明确独立失败不被消费。
2. 覆盖模型 review 或直接凭一次检查回滚：破坏原记录、混淆义务并降低原门槛，不采用。
3. 在原 regression 消费者合并原 not-met 与合法 code/local-files/files 的事前检查 rejected：审查后收紧采用范围。**仅绑定正确的rejected不够**：通用严格编译会因旧依赖错误失败。可信host在候选前固定 `requiredCondition`（原要求中的具体必需条件），且本次rejected回执明确给出匹配的 `failedRequiredConditionDigest`，才可消费。pending/unverifiable/verified、旧无此资格的rejected不增加失败。失败证据仍须同版本/模型/族/作用域/质量/准入策略、激活之后、不同完整输入；不是通用完备性证明或模型填写的标准。

## 历史与边界

新增可选 `GuidanceRollbackRecord.evidenceFailurePolicy: 'model-or-code-check.v1'`，仅在选出的两失败含原模型非 not-met 而独立 rejected 时记录；只有 regression + request-content.v1 可用。旧无字段的所有记录仍严格模型 not-met；新有字段的恢复才能解释程序负面证据。不会追认旧记录、更改旧摘要、将旧模型 met 写成 not-met 或重跑检查；旧重复幂等与 replay 保留。

同包共享 `hasRejectedConversationCodeCheck(task)` 只认事前requiredCondition + 明确匹配failedRequiredConditionDigest + finished rejected 且 code/local-files/files。runtime OR 原not-met，账本只有显式新政策才 OR。原prepared/outcome/finished解析增加可选条件/失败条件摘要，并将两者沿原preparationDigest绑定；状态验证拒绝无事前条件、错摘要、非rejected负面声明，旧无字段原样。可信具体检查负责只在证明该原条件失败时标注；一般编译失败仍只是局部诊断。现有ancillary有限合同只有原执行/断言/类型保持违反时标注，普通编译错误不标注。不新增验证器/存储，不追认旧实际task。

另复现离线task wake先select、无新来源即返回，尚未运行回滚。在accepting后、select/Agent恢复前同步回滚，同步异常显式转Promise rejection；保持既有合并lane准确Promise身份、catch/warn和停止后不修改。后续结果可以直接失效版本，不需先找新研究或resume Agent。

正常故事：两个后续模型met且独立rejected任务，以新政策回滚且冷恢复不改review。对照：一次失败、重复输入、pending/unverifiable/verified、不同模型/族/版本不触发。失败故事：迟到rejected通过原事件唤醒，不能被离线扫描吞掉；原现有事件机制应复用，不新增轮询。历史untagged仅not-met有效，不能借新身份解释程序失败。

本项只补 E 的负面结果消费。研究十臂结果检查、独立案例、自然反馈、语义安全和未来改善仍未成立；问题来源选择、成功对照、研究裁决、激活隔离、原发布门槛及十个工作日决策窗口不变。主线/Daily继续完整学习NO-GO。
