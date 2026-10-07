# Goal Task 原始研究材料：当前交付

基线 22da157。原有结果观察保存通过/失败与摘要；本包让它可以恢复原要求和实际 SDK 记录，并由现有结果入账流程真正使用同一读取实现。没有新运行循环、账本、裁决或用户反馈。

首个实际 Task 提供者请求前，在原 acceptance preparation 内保存小型 requirementsSnapshot：原 Goal id/objective/context/successCriteria/workspaceRoot/origin、原 Task 四字段及当时已知权限模式。原 goalDigest/taskDigest 规则不变，闭合解析核验内容，原 LongGoal owner 额外核对工作目录和原 attempt 权限；准备摘要自然包含新快照。原 SDK command、请求、工具和回答仍由原日志保存，没有整环境或日志副本。旧准备可无快照，保持准确旧格式，不从后来的 context/Task 补造。

内部 readGoalTaskAcceptanceMaterial 同时供原结果入账和研究读取使用：核对原直接用户 /goal command 的实际 event/digest/name/source/args，原历史 epoch/父子会话/权限/工作目录、首请求模型配置、完整首前缀及原 turn/end 截止的完整事件/摘要。自动入账仍在所有异步读取之后同步复核最新 Goal/Task/attempt、原准备/结果/origin、同意及关闭；保存错误继续沿原 Goal lane 传播。研究用 public readGoalTaskOutcomeMaterial 从既有 @tianwen/runtime-bundle/runtime 导出，核对给定结果来源所有字段，读取前后同意 revision，完整返回 JSON 按既有语义材料 512KiB 上限拒绝超量，不截断。此上限不套到原结果入账。

只读读取允许后续原 Goal context/Task resolution 变化，但返回原快照。准确原 command、原准备/结果、原 SDK events 都可用于下一研究；仍不证明未保存的外部文件内容完整，inputsDigest 也不是原文件内容。旧无快照的返回值明确缺 requirementsSnapshot。这些记录不冒充 ConversationTask、用户评分或方法使用版本，不授予研究/激活资格。

首红：实际 SDK 四控制没有 requirementsSnapshot（17:03:54）。实现后第一次断言误将 profile 根目录当实际 workspace 子目录，已修断言；另一次读期间 root Planner 自然收尾多发一次请求，不把它当 reader 请求，改用准确 cold0 控制。源码类型检查暴露局部值在回调中丢失收窄，改用稳定局部引用。发行检查真实发现 root 入口拉宽 SDK 依赖/公开类型及原 Pick Context 声明问题：将 reader 留在原 ./runtime 接缝，主入口只新增快照类型，方法声明用原 Context；不增加 SDK peer 或放宽主入口列表。Runtime/Goal-first 两输入表只加精确新模块。首失败日志保留；这是工程修复，不计自然模型失败。

最终完整 Runtime/ESM/客户端/两公开声明构建通过，公共 SDK 导入扫描无私有导入。16相关文件431项与发行包1文件73项，共17文件504项通过。材料模块10项、原验收3项、实际 SDK profile 15项都在其中。涵盖准确恢复/副本隔离、后续任务变化、旧缺快照、SDK来源/前缀/结果/目录缺失损坏、来源冲突、读取期间撤回、完整超量拒绝且原入账可用；原保存故障/同意时间/异步漂移/关闭控制保持。

最终发行四项 SDK 控制通过：原 check prepare/evaluate 各1/1，各9 scripted/0真实提供者；原结果正确分类并保存，公开 ./runtime reader 返回准确 command/快照/全部截至原结束的 SDK events，来源错配拒绝。新 SDK Context 同进程准确原 Goal/结果/材料，0请求，不重执行/检查。不是新 Node 进程或自然学习收益。独立只读审查及入口调整复核无新增有据 P1/P2；审查者没有运行测试。没有全项目全量或 Docker 验收。

正式原账本1327364B/SHA256 5af25fcd7d6531a58483df8d87fde046dfe8baa7abc6338a496c12a55cce80da 逐字保持。最近确认的正式23观察22完成/16初筛/1可信问题/8成功候选/兼容pair false/反馈0/研究0/隔离true本轮未重新挂载查询，没有新增自然来源。Runtime 发行字节按本实现更新；此前 SDK/封存事实保留，没有重新生成旧样本或重评结果。

下一有限包把该原生 Goal 材料接入已有的双项内容核验，先建立保留 command、Planner Task 与真实工具/回答不同身份的无损证据投影，不能将 command 填成 ConversationTask，不能将 Planner 指令当用户事实。原内容评审 runConversationClaimReview 接受通用材料，但其证据投影目前要求原 conversation/task 形状，不能直接把本返回值丢进去；需要在既有入口显式支持新来源并绑定原 sourceId/preparation/material/model proof。先核对完整原输入能支持何种内容核验，再保存独立语义结果；功能标签不替代语义。之后补实际已用方法版本、原治理研究/启用及未来任务效果和回滚，不拓展旧资格、催评价、造问题、添加近似练习或重跑旧题。

完整目标 active/incomplete，main/Daily 完整学习 NO-GO、原门槛/同意/隔离/停止/十工作日决策窗口不变，不新增门槛或重新计时。必要日志/小回执位于 D:/DevData/tianwen-goal-task-material-20261003；重复失败/旧入口控制保留为工程历史，最终发行回执在 published-runtime-entry。复用工作树/依赖，未下载、新建容器或复制整环境。自有材料/验收/Profile 新夹具清理，D约18.20GiB >=15、未达20偏好，Docker进程0。旧两历史目录及已被自动审批拒绝删除的 profile-mtYfRP 原45,598B保留，不重试或绕过；本轮没有新增删除拒绝。
