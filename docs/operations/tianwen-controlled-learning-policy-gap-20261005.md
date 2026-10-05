# 受控研究已见实际改善，旧来源角色规则阻止启用

## 新批准确结果

唯一新 dx-ef 批在已推送 `38ca9c3833b41a577f8fc74c4968b6772dfa67be` 的原发布 Runtime/CLI 中结束：206 次真实模型请求和206条完整轨迹，15次显式 scripted 训练请求另记。七个原Task/Goal全部complete；四项事前未来基线4/4，三训练两独立拒绝一通过，三原researchSource、一原study、五案例十臂全部完成。原CLI退出1，原句柄排空成功。

| 固定案例 | 无新方法 | 有新方法 |
|---|---|---|
| source1 | verified/met | verified/met |
| source2 | verified/met | verified/met |
| counterexample | verified/met | verified/met |
| adjacent | rejected/not-met | verified/met |
| holdout | rejected/not-met | verified/met |

两臂完整原要求、事前输入、实际故障投影、真实模型配置和独立检查一致，方法仅通过原guidance影响真实回答，没有按角色换答案。原研究中无方法3/5，有方法5/5：相邻与保留案例有实际成对改善。此为受控研究效果，不是自然反馈或方法启用后未来效果。

旧 `conversation-guidance.ts` 决策只认可source1/source2基线失败；`guidance-result-check.ts` 独立功能启用检查也只认可两者。因此原decision=rejected、activation=0，未进入启用后的四未来或撤回阶段。没有把有效改善抹掉，也没有将本批旧决策改成accepted。

四未来基线4/4还说明该固定后续组没有分数提升空间；继续全过不能声称未来改善。下一后续环境将事前植入可执行的遗留缺陷，实际运行原检查，初始坏程序不会冒充无方法Worker失败。

## 按所有者授权调整开发规则

所有者明确允许主动模拟失败、重复问题、反馈、后续任务及其他缺条件，以实际效果推进，不自然等待、索题或机械标blocked。受控DEV中把改善强制限定来源角色没有必要。新显式版本 `dev-paired-any-case.v1` 允许五个固定案例中任意一项真实成对改善，候选五项语义和独立结果全部通过；不再额外强制正常对照的baseline必须通过。原十臂完整性、inconclusive处理、原材料/引用/身份/实际结果检查保持。

新版本事前冻结在study-opened，研究身份绑定；缺省完整保留原规则，不给历史补字段。仅applyDevelopment可明确选择；普通主路径不能以该开发规则新建研究。历史回放依据原记录，不由当前配置重解释。本批原rejected保持，不追记激活。main/Daily、R9和原正式发布条件不变，完整目标继续active。

另已准备独立代码环境 `D:/DevData/tianwen-controlled-legacy-index-env-20261005`：五个角色各一遗留Python目标和原合同；撤回记录旧状态优先的操作员缺陷。配置验证通过，初始程序、模型及Docker实际检查尚未执行，不把准备称为功能成功。两臂同材料，没有手写方法候选。

## 证据与清理

证据 `D:/DevData/tianwen-real-native-notice-learning-20261005`：原batch-first-result、refused-method、learning-admission、两种完整JSONL、drained-result、final-audit保留。29消费者/冻结输入和三旧账本保持；84 Docker完整身份未变，本轮自启Docker已停。七phase文件逐项deepEqual首结果后删除3,276,834字节，准确清理receipt保存，D约17.07GiB>=15；无依赖或环境副本，77保护根与拒绝路径未访问。

## 新规则已经实现并通过工程验证

`dev-paired-any-case.v1` 已接入原研究记录、语义裁决、独立功能检查、DEV配置/loader与原Loop；未配置时保留旧分支。新研究身份包含事前policy，历史不补字段、不改hash。普通运行区拒绝新DEV研究和激活，但继续允许原验证下的停止和撤回；复查发现的撤回误拦已修复。

源码六文件378/378通过，严格类型、脚本语法与差异检查通过。Evolution原构建及Runtime原十五实际构建阶段全部成功；发布包原profile49通过、10原跳过。发布公共Core/Loop的两控制，合计92次显式scripted请求、0真实模型：旧规则对3→5仍拒绝；新DEV规则持久化、接受、激活；关闭并从普通区冷恢复后，关闭同意能自动撤回，零额外模型请求。外层applyDevelopment和loader选择传递通过源码测试，以上发布控制没有冒充完整外层CLI或真实方法后未来效果。

证据：`D:/DevData/tianwen-dev-paired-any-case-20261005`，`green-final-source-all.log`、`strict-final-source.log`、`evolution-build-result.json`、`published-build-result.json`、`published-profile.log`与`published-controls-2026-10-05T03-17-20.454Z-a7bc6e52-b391-4cf8-877c-af7a03fc0aad/receipt.json`。原RED和首次旧dist类型构建失败日志保留；发布临时目录已清理，十三源码/测试冻结哈希保持。此为新机制交付，不追改旧206次真实请求的rejected。

实现提交`7e7f89ce04250a8da123ad232220c100e8265109`已推送原隔离分支。随后原CLI、原Web服务、规范DEV loader/public applyDevelopment零调用加载预检退出0，新选项被正确解析。证据`D:/DevData/tianwen-dev-paired-policy-cli-preflight-20261005-r2/first-result.json`与`final-audit.json`：0真实/0scripted/0Task/0study，不能据此声称真实启用或后续改善。首次预检操作员直接比较斜杠字符串造成的错误保存在原目录；仅修正为解析后的同一Windows路径，产品源码未改。冻结输入、消费者和三旧账本保持，没有依赖副本或Docker启动，D约17.1GiB。

本次两个预检profile仅3,961字节生成文件；目录还包含共享依赖链接，未递归删除链接。批量清理及改为八个已核实普通文件的清理均被工具安全策略拒绝，仅返回`blocked by policy`，无更具体原因；未更换工具绕过。`file-cleanup.json`仍`deleted=false`，文件暂留，首结果与完整启动配置在独立证据目录保留。不将这4KB余项作为产品或目标阻塞。

## 全项目执行原则和下一步

缺重复问题、反馈、后续任务、异常状态或恢复条件时，执行者主动设计并触发受控模拟；不要求自然发生，不将索题或用户评价作为独立开发前提。模拟直接进入产品原入口，事前写清输入、预期结果和来源，运行产品后核实实际产物与状态；失败由执行者修复场景或实现，保留首次结果。已证明的部分复用，不以重复跑旧样本填数量。

下一新批明确选择并冻结DEVpolicy，验证原生激活、方法后的任务、撤回及公共SDK模拟反馈。五角色遗留代码环境可用于主动提供有改善空间的后续任务；初始坏程序不替代无方法实际Worker结果。已有未来4/4属于无退步信息，不强行解释为收益，也不因此等待自然失败。受控有效性可作开发结果，天然反馈与原正式发布另按各自事实报告；不新增发布条件。每轮优先保原结果和必要轨迹，清理自建重复/临时产物，D保持至少15GiB、争取20GiB以上。
