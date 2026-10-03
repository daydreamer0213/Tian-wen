# Goal Task 事前验收连接：交付与下一主线

继承780a91d已结束的归档工作包，补原架构既定的普通Goal Task验收，不新增发布标准，不索题/催评。

原实际SDK控制证实，Task可以完成但没有独立验收；子会话自然来源过滤有意，真实用户反馈桥仍可用。新增默认关闭的可信宿主goalTaskAcceptance：创建时固定当前直接用户/goal command原身份与摘要；首个真实header/context之后、provider前固定原Goal/Task、attempt、父子会话、权限、模型、检查器/合同/输入/原条件。原参数以SDK持久事件为准，旧Goal不回填来源，Planner文字不冒充用户。

终止后消费真实持久Goal/session，仍在线则先等idle/flush。实际控制发现continuable child会从live agents释放，因此仅查在线Agent会漏结果，已修。独立结果保存为verified/rejected/unverifiable，与执行complete分开；错条件摘要/检查器故障/材料漂移不能归因或通过，保存和历史错误向原lane传播。下一规划先等结果保存再重读版本，状态和完成通知也显示验收。无合同保持原行为，不硬塞旧dsh-tool-result、不授予自然来源/研究/激活权限。

首红包括实际prepare=0而期望1、错nativeGoal绑定和通知漏验收，均修复。独立审查3项P2（错条件关联、Planner未消费、吞持久错误）已关闭，复审无新增有据P1/P2。取消函数逐字移至纯小模块并原址重导出，避免Goal入口拉入整个observer；原外部结果协议不变。

完整Runtime构建/公开声明生成及公共SDK导入检查通过。初次构建的纯入口错误、声明图缺commands扩展及旧打包断言遗漏已按实际依赖窄修，未改原功能门槛。11文件356项回归通过；后来新增保存故障项，同文件最新10项全通过，原9项已含其中，不重复相加。没有运行全项目全部测试或Docker验收。

实际发行Runtime四项SDK控制分别为原工具结果断言通过、原条件不通过、错失败条件未核验、检查器不可用未核验；各prepare/evaluate=1/1、9 scripted/0真实提供者，Planner收到原状态。每项同进程新Context准确读回原记录，0请求/不再prepare或evaluate。这是SDK实例恢复，不是新Node进程或自然效果。另真实保存故障移动自有夹具目录，错误传播、无新的规划请求/验收成功记录、原计划版本未前进；目录恢复并清理。控制不计自然问题来源。

正式账本仍1327364B/SHA256 5af25fcd7d6531a58483df8d87fde046dfe8baa7abc6338a496c12a55cce80da。本轮未改变最近正式确认的23观察22完成、16初筛、1可信问题、8成功候选、兼容pair false、反馈0/研究0/隔离true。纯检查器SDK根index.js仍1c0718e6c99fc8f9836859da23db663179caea255bdb454754c72368f5492abf；Runtime.js因本次产品实现改为db1a4d01ec5348e18956179bd007bec3e8a7f8de69e293d238dfa10492b76e5d。旧版本与封存事实保留，不能称整个运行包未变。

下一有限包接可信Goal独立结果生产者和学习消费者，先确定真实输入类型、owner及来源资格，不伪造ConversationTask、不放开任意子Agent。随后分别验证来源独立研究、方法语义/功能、治理启用、新任务收益和回滚。归档包不追加近似练习，旧答案不重评、已执行待办不能冒充未知holdout。不因缺自然证据把所有可实现工作blocked或向用户要环境。

完整目标active/incomplete、main/Daily完整学习NO-GO、原同意/隔离/资格/去重/停止及十工作日决策窗口保持，不加门槛/重新计时或机械续期。新增必要D记录约35KB，运行根D:/DevData/tianwen-goal-task-acceptance-20261003；工作树/依赖复用，无下载/整环境/新容器，自有夹具清理、Docker停止，D约18.22GiB满足15底线、未达20偏好。旧删除拒绝不绕过。
