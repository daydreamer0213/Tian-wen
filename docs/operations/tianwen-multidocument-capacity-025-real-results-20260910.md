# 025真实使用：三文采集成功，跨目录导致完整学习材料不可用

本轮已结束，**不是完整文件学习验收通过**。唯一T1普通任务自然完成，三份工作区
输入共45339字节真实采集；后续原生read读取工作区外文件触发unsafe-path，完整
终结文件材料不可用。两个独立原生评审最终都为inconclusive。保留唯一结果，不
重跑T1、补造文件包或放开路径限制。本轮未推送、合并、执行main CI或升级Daily。

## 身份、入口与用户要求

- 源码：`85dbbdb3fd1512078b3ac6f99d41b7223e85ea92`，树
  `f91289c36ef3c3bee9e5b9749f2fdb14cf63e01c`；产品容量修正为27f264b。
- 025是新验收批次，仍使用未发布Runtime0.1.24 / Desktop0.1.0-preview.25。
- 根目录：`E:/待清理/D盘迁移-2026-09-08/Tianwen-多文档容量-025/`。
  候选为`candidate-85dbbdb3fd15`；运行、原生Session、审计和输入均在`native-use`。
- 单次Runtime归档SHA256：
  `4d235958262c650cf4ab5a5f01660510188b536ea3c23eb05e0ed64f32cf3039`。
  26个非清单文件匹配已检查的源/构建字节；清单身份、Desktop目录、安装器及内嵌
  归档审计通过。初次LICENSE源路径比较错误另有失败收据；修正检查路径后继续，
  没有重新打包。`receipt.json`与`continuation-receipt.json`必须一起保留。
- 标准模式、Workspace Write、DeepSeek-V4-Flash / High、maxTokens256000。
  未配置外部Skill来源，未人工提供判断、答案、负反馈或工具序列。

用户要求选择目录不打扰桌面、不再手动代选。此前024曾依赖Windows原生选择框；
025最初也由DSH的auto组件选到native。用户实体Esc停止后立即停止自有host；
收到用户要求换方式后，仅025 Profile复用DSH现成browse后端和client组件。
第一次误把patch.name当替换字段，启动组合警告且取证未接通，零输入时停止并
留存失败；第二次停用auto行并插入两组件，公开host达到observed后再冻结输入。
没有修改产品代码、默认安装、模型、权限或原失败收据。

通过IAB网页“添加工作区→编辑路径→输入绝对路径→回车→打开”选定三文目录，
Workspace `10f42447-77ba-443b-a6db-6b37ca2b3a2e`，创建于03:06:26.663Z。
没有系统桌面点击/键盘注入、Edge操作或后台补造工作区任务。后续隔离验收复用
[目录选择说明](tianwen-iab-directory-selection.md)。

## 实际经过（时间均为2026-09-10 UTC，北京时间加8小时）

固定请求与三文逐文件哈希见[输入前协议](tianwen-multidocument-capacity-025-protocol.md)。
三个普通用户输入各发送一次；没有重发、steering或质量反馈。

| 时间 | 实际事实 | 能证明什么 |
| --- | --- | --- |
| 03:07:43.139 | 开启学习，revision1；原生通知另触发同Session第二轮 | 正常控制入口有效，第二轮不是操作员另发任务 |
| 03:09:06.436 | T1开始，随后正确准入local-files/chat | 自然语言文件任务被识别 |
| 03:09:15.655–03:09:16.656 | 两次原生read及第三次read采集三文；此前有glob和目录命令 | 8614+8231+28494=45339字节均被真实采集，哈希匹配 |
| 03:09:50.590 | task-file-evidence-unavailable / unsafe-path | 跨目录读取后不再形成完整文件证据 |
| 03:16:18.719 | 主Session正常终结，endSeq46404；账本稍后记录finished | 普通核对任务完成，UI约7分12秒/28步；不等于学习通过 |
| 03:21:59.658 | 两个原生独立评审完成，顶层inconclusive | 缺失证据不判为通过 |
| 03:25:55.157 | 新普通Session关闭学习，revision2=false | 控制变更已执行，并非仅口头承诺 |
| 03:27:37.486 | 自有host停止，SIGTERM、code=null | 不是正常exit0；随后确认PID12392及53618监听均不存在 |

主Session第一次相关外部read在seq4022，callId
`call_01_AwdWjnmVZD1r76aS4DvA6414`，时间03:09:50.548Z，路径为
`D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge/docs/operations/tianwen-natural-reuse-022-delivery-20260909.md`。
此前三次采集已有实际账本记录；42ms后记入unsafe-path。本轮因此不是再次命中容量
上限。最终fileResult不存在，审计的inputHashesMatch=true，但capturePassed=false，
structural=false、recoveredFiles=false。不能拿初始三文采集替代最终完整材料恢复。

模型还自然使用只读命令查阅其他历史材料，seq24386读取本轮025协议（limit45）。
因此本轮不具备盲测隔离，不能将其回答当成独立语义验收结论。回答中的时间推断、
源码血缘推断和大量历史核对仍是普通任务输出，不因模型断言就成为项目真源，不把
措辞缺陷转成天问全局写作规则，也不恢复已撤下的R11/v7路线。

## 判断模型的真实行为，不隐去错误

| 角色 | 原生Session | 最终结果 | 保留的同会话错误 |
| --- | --- | --- | --- |
| 准入 | bb4f92ec-5372-41f1-a79a-b723b5c0d67d | task / local-files / chat | 2次调用未提供的glob，UNKNOWN_TOOL；之后一次structured_output |
| requirements | ad9788de-b35d-4865-a3c1-45c2fad565d9 | inconclusive | 3次未提供工具调用；首次structured_output缺answer-5，被拒后同会话再次提交 |
| grounding | f71cde23-96a0-4a3a-92f9-faeb469d9978 | inconclusive | 首次structured_output引用不符合限定原文，被拒后同会话再次提交 |

三者请求头均为deepseek-official / deepseek-v4-flash / high / maxTokens256000，
仅提供structured_output工具。以上重提由原生模型会话自然发生，不是root重开
任务或新增天问重试循环；不能称三者均首试成功，也不能由最终提交倒推024的
invalid-judgment已被普遍修复。两评审明确缺少文件条目和工具证据，无法核实答案
里的文件、哈希、版本等事实，最终均报告不确定。

审计器在完整材料不存在时跳过完整送审包的深层身份/恢复断言；其status=completed
只表示诊断完成，不能表述为全部检查通过。原生准入、评审的公开导出另行留存并
检查了实际模型头、调用、错误和终结。没有新增guidance研究、采用或活动文件方法；
不声称观察到活动文件方法的真实撤回。

## 关闭与保存

关闭Session `session-29213c88-7785-4e9f-90e7-06c9e1d375f1` 于03:25:58.814Z
自然终结。该控制请求本身在关闭前被观察为external任务并最终inconclusive，不
充当第二个文件验收任务。before-disable与after-disable审计各一次，确认关闭后
T1保存的任务摘要及其已导出的公开Session原始字节未变。三份文件在普通任务完成后
及撤回后均与输入冻结哈希一致。final-state-before是03:17:33.441Z的较早快照，
早于评审结束，不把它当完整评审关闭状态；最终账本22条，保存为final-state-after。
没有在撤回后重建辅助材料。自有IAB标签页已关闭。

桌面快捷方式SHA256仍为
`e78cf92c1944bf3597bb201d87ced6b00f64f8663a916f1e627c61d82bd41088`；
Daily022及默认Desktop未修改。025所有大体积产物已经位于E盘，不再复制回D盘。
另完成六个停用测试目录的34.3MiB可恢复归档，详见[清理记录](tianwen-test-cache-archive-20260910.md)。

关键收据均在`native-use/evidence`，SHA256如下：

| 文件 | SHA256 |
| --- | --- |
| audit-025-before-disable.json | feb61ef068dfae673c57eabec614e58b3d8b569db23dd297c67e752fe0cd1cd5 |
| audit-025-after-disable.json | 022287872efd05f6b552277e43f9b9adeb6cd6f6e3cdf9440ec51761e9399964 |
| final-state-after.json | 67ac9cf2fd3bf4ed7ea581ffb46e3ececc1f5aa1b2768e6b452d8d5518cb904b |
| host-browse-v2-stopped.json | 554ebe5710defb00a2c71e4871018d1daf7f91340e6699b48905f9d5dfd9a0c8 |
| review-terminal/receipt.json | 9155c96c7f5fd771517b44586c16ede64e68aed656e7c9daf8774970df7d5adb |
| withdrawal-terminal/receipt.json | b7cd531869056f52745fa269e489156f14727b0e05e65e955049572d98895afc |

原生主Session原始JSONL：consent
`85fc62427c90020cec0fe95824dd5de2d5571efd79bae8ec72eb648b71274ede`；T1
`17591d799cf6503f74ea9749b296fa32785421be5bc59c2be12cc59b565e9362`；关闭
`5aa3556f6ef9c4fe7f91e1696f2fad741bba33a5b5f9c48028829884d06997f1`。
公开导出ZIP、JSONL、decoded及各自收据完整保留，不能用报告替代原始证据。

## 剩余边界与下一步

现行设计只收集工作区内普通文件；DSH普通任务却可以自然读取引用的外部文件。
执行能继续、学习证据拒绝不完整输入，是本轮明确观察到的能力范围不一致。
这不等于路径保护失效，也不等于所有用户任务已可自动学习。下一步先确定产品
如何处理这种范围不一致，再决定是否需要新的实现和唯一必要门禁；不得把工作区
根扩大到整个磁盘、忽略越界读取或补造完整包来取得通过。

旧文字学习、来源探索、五项工程改造及容量检查继续复用；024/025均封存，不重跑
相似任务寻找绿色结果。本轮用户提出的无打扰目录选择及残余清理已经完成，
总路线的完整文件学习与后续交付仍未完成。
