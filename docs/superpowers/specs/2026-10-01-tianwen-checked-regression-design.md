# 后续独立检查失败与回滚：设计

## 已知问题与职责

基线 b72c4a2，工作区干净。延续所有者自主选任务及完整目标授权。自然学习原设计允许同作用域、族、方法版本、模型的两个不同后续失败退回准确父版本，不重写历史任务。已有普通 code 文件任务能候选前准备可信检查、保存绑定的 rejected；该事件会唤醒现有 task lane，但 runtime rollbackIfNeeded 和账本 regression 校验仅看模型 not-met。模型 met／检查 rejected 的冲突没有进入退化消费者。此项先用合法完整受控账本复现，不以夹具证明真实未来效果。

天问负责保存证据及版本治理，不保证通用任务正确，也不把程序 verified 提升任务整体 met。明确 rejected 是适用事前检查的负面结果；将其作为回滚证据不代表证明方法导致了失败。原两不同后续失败门槛不变。

## 方案与选择

1. 继续只看模型 not-met：保留当前行为，但明确独立失败不被消费。
2. 覆盖模型 review 或直接凭一次检查回滚：破坏原记录、混淆义务并降低原门槛，不采用。
3. 在原 regression 消费者合并原 not-met 与合法 code/local-files/files 的事前检查 rejected：采用。pending/unverifiable/verified 不增加失败；未配置检查沿用原规则。失败证据仍须同版本/模型/族/作用域/质量/准入策略、激活之后、不同完整输入，程序结果沿既有账本绑定验证。

## 历史与边界

新增可选 `GuidanceRollbackRecord.evidenceFailurePolicy: 'model-or-code-check.v1'`，仅在选出的两失败含原模型非 not-met 而独立 rejected 时记录；只有 regression + request-content.v1 可用。旧无字段的所有记录仍严格模型 not-met；新有字段的恢复才能解释程序负面证据。不会追认旧记录、更改旧摘要、将旧模型 met 写成 not-met 或重跑检查；旧重复幂等与 replay 保留。

同包共享 `hasRejectedConversationCodeCheck(task)` 只认 prepared + finished rejected 且 code/local-files/files。runtime OR 原not-met，账本只有显式新政策才 OR；既有任务状态已校验输入、请求、准入、检查者、模型、输出和结果绑定。拒绝 forged/unsupported 记录的责任仍属该状态校验，不新建验证器或存储。

正常故事：两个后续模型met且独立rejected任务，以新政策回滚且冷恢复不改review。对照：一次失败、重复输入、pending/unverifiable/verified、不同模型/族/版本不触发。失败故事：迟到rejected通过原事件唤醒，不能被离线扫描吞掉；原现有事件机制应复用，不新增轮询。历史untagged仅not-met有效，不能借新身份解释程序失败。

本项只补 E 的负面结果消费。研究十臂结果检查、独立案例、自然反馈、语义安全和未来改善仍未成立；问题来源选择、成功对照、研究裁决、激活隔离、原发布门槛及十个工作日决策窗口不变。主线/Daily继续完整学习NO-GO。
