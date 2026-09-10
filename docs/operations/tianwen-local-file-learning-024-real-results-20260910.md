# 024真实使用：普通任务完成，完整文件学习未通过

## 结论与范围

本轮在Codex内置浏览器用真实DeepSeek完成了原consent/F1/C1/withdrawal，各一次、
各独立普通会话。两项普通任务完成，关闭学习及历史保留检查完成；**不是完整文件
学习验收通过，不推进本候选的合并、main CI或Daily升级**。五项工程改造和集中
修正仍已完成，旧023失败、旧摘要/自然入口证据及Daily022不改判、不重跑。

同一候选源码`c6fbde439f9f8bb9d5d45bcd077cd2b9ebbc4a64`，Runtime0.1.24、
Desktoppreview25。146份绑定复核未变，未重打包/重装。根IAB已恢复；原生Windows
目录选择遇到操作工具兼容错误，用户手工选定既定E盘workspace后继续，没有后台
创建工作区或后台投递模型请求。模型为DeepSeek-V4-Flash/High/maxTokens256000，
standard/WorkspaceWrite权限，没有改质量或采用门槛。

模型自行选择工具、生成和修订内容。没有预写答案、指定工具顺序、种入反馈、
删除新产物以限制下一任务、追加第三评审或重问同题。手选时另产生E迁移父目录
空工作区，公开导出确认为3个权限初始化事件、0用户消息/请求/回合，保留不删。

## 两项结果

| 情境 | 普通任务 | 学习结果 | 最早实际原因 |
| --- | --- | --- | --- |
| F1：读两文，写交接文件 | completed，约8分10秒；新增28494字节文件，原文未变 | 准入invalid-judgment，无完整文件捕获，顶层inconclusive | 模型没调用已提供的structured_output工具，而在普通回答中写JSON后结束 |
| C1：读文件，聊天解释 | completed，约21秒；无新建/改写文件 | 正确准入local-files/chat，两份输入采集；最终无完整材料，两位评审均inconclusive | 自然多读F1产物，三文45339字节超过现有32768字节聚合上限 |

F1判断子会话`63f2b19b-ec25-47a1-b49b-4847b7a4b80b`正常完成；实际请求头包含
唯一structured_output工具和闭合字段，提示明确要求调用，但事件无工具调用。
普通JSON不是合格原生捕获。不属于API不可用、工具未注册或文件查找触发过严；
不事后接受普通JSON，一次失败也不足以估计长期失败率。

C1实际顺序glob、glob、read、read、read。两次glob之后，022/R9两份原文均已
持久采集、哈希匹配；第三次读取`历史验收交接.md`时material-unavailable。
只读使用生产校验器复核：原两文16845字节接受；加28494字节第三文，45339字节
确实触发`conversation file material exceeds the byte limit`。未提高上限或删文重跑。
这证明旧glob即时断采没有重现，但没有完整最终文件集合/辅助记录落账与恢复证明。

C1两个实际独立评审分别为requirements/grounding，均指出缺少文件原文，不能
仅凭回答声称读过就确认文件事实。两个原生会话、请求材料、引用、声明审计、
模型配置与inconclusive已由公开Session导出绑定，未互相展示结果。

F1有大范围查找及120秒/30秒超时，随后自行读更多历史证据并完成。这是普通DSH
任务的执行选择/等待成本，不扩大成天问全局写作规则；本报告不主张稿件每句话正确。

## 关闭、保留与证据解释

关闭前审计exit0表示事实核验完成，**F1/C1 capturePassed均false**。F1没有准入
proof；辅助审计调用恢复函数时的空proof异常被保留为diagnostic，不是新增产品
故障，原生失败原因以独立子会话原文为准。C1完整原生评审绑定核验通过。

09:54:04本地正常UI关闭学习：revision2/enabled=false。关闭后原两项任务记录、
关闭前公开导出Session的字节身份、两份原文及交接文件均未改变。关闭请求本身
在关闭前被观察为第三个控制轮次，之后分析取消，不是第三个验收情境。
没有活动文件方法形成，故真实活动文件方法停止应用仍未观察。

09:56:11调用公开host.stop停止自有PID12772：ownerStopped=true，code=null、
signal=SIGTERM；随后PID不存在，55050首页ECONNREFUSED。这是公开服务停止，
不宣称Desktop窗口优雅退出0；临时IAB页已关闭。

证据根：`E:/待清理/D盘迁移-2026-09-08/Tianwen-本地文件学习-024/native-use/`。

| 文件 | SHA-256 |
| --- | --- |
| evidence/audit-024-before-disable.json | `43d9794eb78b26a4c74f04eede03e48bac030344d7ff1a6deb450999c0750bef` |
| evidence/audit-024-after-disable.json | `09535fe91cfc8091ef35ef1960196ecd31599d167a16568428efc00f0411e3e8` |
| evidence/final-state-before.json | `d049473836d1dbfd97eb890caa7597489739b2c934add9215084d1f2fa8d7680` |
| evidence/final-state-after.json | `7e0e4391b4927b32054f74543cc53d07aa5002d5b6b97893efe3baaf2c2f17eb` |
| workspace/历史验收交接.md | `346e76c7300206b5a20086a0f5a908344b374746a2b9d6d56a8fec44a5f09893` |

原始ZIP/JSONL与解码记录在audit-024-before-disable、audit-024-after-disable、
f1-admission-first、f1-control-terminal、withdrawal-terminal。候选身份见
[候选检查点](tianwen-local-file-learning-024-candidate-20260910.md)。所有大产物、
新增材料与失败现场在E盘；未删共享依赖、失败证据或日常安装。

验收工具只作操作性修正：显式选择恢复host收据，允许空proof的导出分支，记录
自身身份。原冻结/resume1副本保留；实际auditor为
`evidence/audit-024-use-resume-2.mjs`，SHA-256
`645a00bb007dc472ae0eade673aff78632310aa094a12c752206e4a17e3f7ed6`。
未重建验证器、未改产品或原实验数据。

## 下一步：先收口设计，不继续题库式验收

1. 保留glob后采集的已有证明，暂停依赖完整材料的研究/采用/发布链；不重开已
   关闭五项工程任务，也不推翻旧摘要与自然语言学习证据。
2. 判断模型未提交结果：先查DSH已有结构化结果机制能否原生约束或有界格式修复。
   不另造Agent循环、不追加评审挑结果、不接受没有原生证明的普通JSON。
3. 材料容量：重新评估32KiB文件集合与96KiB评审预算的关系。正常多读一份文件就
   整体退出是已观察的产品适用范围缺口；先确定保真、有界、可恢复的最小改法，
   不盲调数字、不要求用户规范输入。容量与证据处理属天问职责，稿件文风不是。
4. 只有确定新改动后才写必要检查与新的有限真实入口。旧024结果不变；改动和
   必要实用门禁满足后，再继续已授权合并、准确main CI、备份与Daily升级。
