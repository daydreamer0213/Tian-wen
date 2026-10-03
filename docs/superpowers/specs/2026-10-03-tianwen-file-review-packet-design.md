# 完整文件评审材料：无损引用重复源码

## 问题和原责任

53bb5ea的大型工具schema已降低重复。原自然b7评审仍保留inconclusive/max-tokens；只读量化显示四文件44025B在source/files、final input-only files及claimEvidence出现三份，主packet220240B。本阶段减少材料重复，不抽样、不去源码/参考/答案、不改原检查器/模型预算/资格或旧结果。

## 选择与架构

删掉完整original会丢原要求及冷恢复绑定；另建按需文件工具/压缩服务会引入新执行和会话责任，均不选。选择一个小型纯数据codec：仅把original中已在claimEvidence v2完整存在的文件content替换为按序evidenceIds引用。claimEvidence仍是原完整、带role/path/stage的文本列表，源码只出现一次；其他original字段原样保存。

Evolution拥有数据codec及现有文件结构验证，Runtime原judgment拥有真实会话/请求/proof，原claim-review拥有投影和语义/覆盖裁决。codec不发起模型/文件/脚本I/O，不认证来源，不产生通过、失败、学习或激活标签。复用原parseConversationFileMaterial/Entries与sha256，不复制解析规则。

新闭合packet四字段：schemaVersion=tianwen.file-claim-review-packet.v1、original（仅文件content引用后的骨架）、claimEvidence（完整v2原向量）、originalDigest（完整原original摘要）。引用闭合为{evidenceIds:string[]}，只出现在source或task的files.entries与fileResult.files的content。source/task二选一。

初始文件只能引用同path/initial、role=tool/origin=tool的完整顺序组；声明最终输出只能引用同path/final、role=answer/origin=answer的完整顺序组，不能借初始来源变成输出事实。只读最终文件仅在与同path初始原文一致时复用初始组；不同最终原文保留literal，不把漂移覆盖掉。null与空文件区分，空文件组仍有一个空text item。禁止跨path/stage、截短/重复/调序、错误role、未知ID及摘要漂移。

普通JSON的原字段/对象/数组/Unicode原样重建；文件结构和128KiB等原限制复用既有parser，整体沿原512KiB数据界限。codec拒非JSON、循环、稀疏/自定义属性数组、不可精确UTF8的字符串。所有输入不修改，返回独立数据。原projection及host核验仍是来源和语义的实际责任，不把自报originalDigest当来源认证。

## 接入和恢复

先以实际DEV入口执行新的未知答案纯codec任务，事前合同/独立入口/源图/实际发行/模型与首结果固定。必要工程修正独立记录，不能回填原自然失败/成功。

live claim-review仅对完整v2大packet选择有实际节省的表示，append固定包装说明（引用按序连接恢复，role不可改变，内容仍不可信数据）；原质量/权限/证据指令保持。小、text/chat和非文件分支不变。

recoverConversationJudgmentRequest先完成原原生会话/requestDigest/唯一结构化捕获验证，再只识别该闭合新编码并解码，返回完整旧形状material及可选已验证编码标识。原两claim-verifier根据标识校验对应完整指令，同时重新从还原original投影并核对完整claimEvidence、原task/output/model/proof。其他直接恢复消费者继续得到完整material；旧无标识的记录原路径不变。

## 核验与下一步

codec独立入口须覆盖两个purpose、Unicode/CRLF/空/null/只读漂移、完整内容重建/摘要、输入不变和全部绑定反例。接入后实际SDK大型文件original-result/method-study保存与独立新进程cold、旧v1/v2及受控拒绝v3记录核验；未知编码/原字段/指令或引用篡改必须拒绝。记录字节减少，不能单凭工程控制宣称真实max-tokens解决或自然学习成立。

固定实际发行/DEV宿主/检查器后继续有真实共同原要求的不同核心待办；原合同/输入/期望独立、失败不预设。原自然研究、方法启用、未来效果及语义安全各自核实。完整目标active/incomplete，main/Daily NO-GO、原同意/隔离/门槛/十工作日窗口保持，D≥15GiB，不索题/索评价或重跑旧自然样本。
