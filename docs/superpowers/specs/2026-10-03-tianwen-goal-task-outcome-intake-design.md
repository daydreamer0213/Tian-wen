# 普通 Goal Task 的独立结果进入原学习账本

基线 fe41ad4。上一包补齐事前合同及 Planner 消费，但 Evolution 仍没有原生 Goal Task 独立结果来源。旧 RunAcceptanceContract 只接 dsh-tool-result，旧 Outcome analysis 另限定研究摘要及根会话；源码已确认，不能以接口方便重新解释产品事实。

选择在原 Evolution ledger 增加明确 native-goal-task 结果事件及只读投影，由 LongGoal 宿主在原验收完成后自动调用。来源包含原直接用户 command、Goal/Task/attempt、原合同/条件/模型、实际结束材料摘要。绑定在首个提供者请求前捕获当时已启用的 v3 学习同意 revision；旧 preparation 不回填，事后启用不能追认。写入前与恢复消费时核对实际持久 SDK 和原合同，按原同意及关闭边界停止。

备选：伪装旧工具 Outcome 会破坏证据种类；放开 conversation observer 的所有子会话会把 Planner/研究 Agent 当用户。新来源保留明确种类，不创建第二账本、Agent loop、注册平台或用户反馈。程序通过、原条件失败、缺失败条件关联和无法核验分别保存。这里只接真实结果来源；没有独立语义评价/方法版本的来源不能冒充现有 ConversationTask 或进入原研究资格。

正常故事：已有合同且事前同意的 Task 完成原验收，原宿主自动将相同结果写入同一账本；新 Context 能读回且重复消费不追加、不重评。反例：未配置检查、旧 Task、事后同意、任意子 Agent、没有原用户 command 均不产生记录。失败故事：同意变化/材料漂移不新增，原记录保存；学习账本保存错误传播，不能记录假的成功或继续规划。关闭后没有晚到写入。

Evolution 负责闭合协议、条件关联、同意 revision、幂等冲突、原日志恢复和副本隔离；LongGoal 宿主负责实际 SDK 来源与材料核验。来源标识仅由 Goal/Task/epoch 固定，重复但改变输入必须拒绝。记录是任务结果观察，不是学习 Ticket、语义通过、自然效果或激活许可；新来源后续研究仍需补齐完整原材料、独立语义及方法使用绑定，不挪用旧普通对话标准。

原正式账本/封存/停止/十工作日窗口/main与Daily NO-GO 不变。仅受控新 Profile 验证该连接，0真实模型、无新自然证据；复用运行依赖，D 保留必要小回执，清理自有夹具，D>=15GiB。
