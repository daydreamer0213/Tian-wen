# 普通 Goal Task 独立结果入账：当前交付

继承 fe41ad4 已交付的事前验收与规划消费。原 RunAcceptanceContract/Outcome analysis 分别限定工具结果、研究摘要/root/Skill，不能承接任意 Goal Task。新增明确 native-goal-task 事件进入原 Evolution ledger，由现 LongGoal owner 自动消费，无新账本或 Agent loop，不伪造 ConversationTask、用户评价或 dsh-tool-result。

在首个实际 Task 提供者请求前固定当时已启用 v3 学习同意 revision；准备记录可选字段向旧格式兼容，缺该字段的旧任务不回填，事后开启/执行期间撤回或换 revision 不追认。原 command/Goal/Task/epoch/父子会话/nativeGoal/合同/原条件/模型/准备与实际结束材料摘要精确绑定。成功、已证明原条件失败、无条件关联的拒绝和无法核验分别保存；来源身份由原 Goal/Task/epoch 固定，重复相同记录幂等，变动拒绝。原 ledger 负责闭合字段/条件/同意/冷重放；原宿主负责真实持久 SDK 来源与材料核验。

原验收保存后、下一规划前自动写入；新 Context 冷挂载只消费已有持久结果，丢失闭包不重新准备/检查。关闭和当前同意在写前再确认；真实账本保存错误传播，不能伪装为检查器无法核验或继续规划。独立审查发现等待期间 Task 改变仍可写旧结果的 P2，实际 SDK 控制首红确实写入1而应0；修复所有异步来源/child读取后，再同步重读并核对原 Goal/Task/attempt/权限/材料，写前没有等待窗口。普通 guidance/control 变化不加拒绝标准；复审及追加静态审查无新增有据 P1/P2。

原学习状态工具新增单独 Goal Task 结果计数及边界说明：历史总计、当前原控制/实际子会话计数；不暴露 IDs、原条件、详情或内容。0来源时旧结构保持。它不增加原普通对话来源数量、自然效果、反馈、Ticket、研究、方法或启用许可。

首红包括 Ledger 缺方法5项、实际 SDK 缺自动消费4项、Task漂移1项及实际学习状态缺新来源。最终完整 Runtime 构建/声明和公共 SDK 导入扫描通过；16相关文件493项通过；实际发行四项 SDK 对照通过，每项 prepare/evaluate=1/1、9 scripted/0真实提供者，原状态准确入账/展示，新 Context 同进程准确读回且0请求、不重评。恢复不是新 Node 进程。额外覆盖同意事后启用/撤回、Task漂移、实际账本路径变目录的保存故障和关闭迟到；故障保留原 verified 结果、planRevision1，恢复后新 Context 自动补消费一次、0提供者/不重评。故障测试首轮 rmSync 清空目录触发 EISDIR，随后改为验证自有边界后的 rmdirSync，未把控制端清理错计模型失败。没有全项目所有测试或 Docker 验收。

正式账本仍1327364B/SHA256 5af25fcd7d6531a58483df8d87fde046dfe8baa7abc6338a496c12a55cce80da，最近正式确认23观察22完成/16初筛/1可信问题/8成功候选/兼容pair false/反馈0/研究0/隔离true不因本控制改变。本轮未挂正式 DEV 档或新增自然任务。SDK检查器根 index.js 仍1c0718e6c99fc8f9836859da23db663179caea255bdb454754c72368f5492abf，Runtime.js 因产品实现改为f2f5ec98bcb063c7c390ac977be3052b8aa9fee60b543e489d5445540a9bb864；旧封存与版本事实保留。

下一有限包恢复 Goal Task 结果的完整原材料供实际研究消费者使用，并确定独立语义评价/已用方法版本的真实绑定；当前这些不在该新来源协议内，不能把元数据入账叫作研究已接通。之后再分别核对来源独立案例、候选结果/语义、治理启用、新任务效果及回滚。没有自然效果不能机械停止独立实施；不追加归档练习、造失败/反馈、重评旧题或向所有者索任务。

完整目标 active/incomplete，main/Daily 完整学习 NO-GO、原门槛/同意/隔离/停止和十工作日窗口保持，不增加或重置。运行根 D:/DevData/tianwen-goal-task-outcome-intake-20261003，仅必要日志和小回执；工作树/依赖复用、无下载或新容器/Docker停止，D约18.20GiB≥15、未达20偏好。自动审批拒绝删除本轮故障夹具 profile-mtYfRP，仅给出 blocked by policy；保留其45598B，没有重试或换方式绕过。其他自有测试夹具按原清理退出，历史两小目录仍保留。
