# E092：修正后的未来偏好独立评估在全新输入上通过

## 结论与边界

使用新隔离档、全新澜屿项目材料和包含 `efe0232` 窄修复的正式运行包，真实模型完成一份准确的单段进度摘要；原生准入是 `summarization/text`，独立任务族核对同意，两名原生答案评审均 `met`。读到答案后另行冻结的直接反馈明确要求今后同类摘要用两句话、旧稿不改。产品把反馈关联到澜屿原任务，准入为 `conversation/preference`；独立评估为 `preference/user-preference`，提取两句结构与“待复核／已失败不可混写”标准；主回复仅“收到”。这条前瞻证据表明 E091 暴露的独立评估误判在本次新材料上得到修正，不能回判 E091，也不能证明稳定性或发布资格。

本档按事前协议只有一条来源，不开研究，不发未来任务，不解除方法激活隔离。研究裁决、方法激活、后续任务效果和独立语义安全仍未由本档验证；main/Daily **NO-GO**。

## 冻结与原生结果

根目录 `D:/DevData/tianwen-future-preference-092-20260928`，源码提交 `efe0232d4a944d69f7238ddd4db1dcdb26ffbadc`，运行包 SHA-256 `42f2afc516684c8fb707a1da8f76ed2196ca43fc0b7891b40db1f93eeefa9858`，冻结文件 SHA-256 `ba0b319557d13730fb97cefcd6cb70fa6440d72657b0ab988344731c6ac51f20`。隔离 Profile 使用 DeepSeek-V4-Flash / High、`familyVerification: true`，安装包内运行 JS 与当前源码构建字节相符，并含修正后的偏好分类指令。开场、同意、澜屿 S1、撤销文本、配置和停止条件在首次模型调用前冻结；反馈在读到实际答案并核对原任务终态后单独冻结，SHA-256 `adc032322a0b6f95b6cd121d3b00e76710cfb785cf645178b3176956600b2e1c`。

澜屿来源写明 23 项核对：13 项已完成，6 项待独立安全复核且未判通过或失败，4 项确认配置检查失败且需修正；内部演练完成，外部灰度未开始，日期未定。真实答案一段准确保留这些信息，无额外预测；来源任务 ID `conversation-task:e10755030d31e18f06dadabc4b473222ce3bc09cf34fb977d9ce4857b8a61170`，完成、双审 `met/met`。反馈任务 ID `conversation-task:d696cd20aa17bad15b572335904851d716a82637ba56eca365f333166a744b58`，准确关联该来源，保留直接用户原话与 `user-preference` 类别。独立评估 ID `feedback-assessment:ea47924fe67cd0e2c3a7b4c694be43a551b2c6a729bc8182d7752d7f8b956f5d`；提取的两项持续标准既保留句式及内容顺序，也保留待复核和已失败的状态边界，没有把它们追认为原任务错误。

## 终态与下一步

`native-use/evidence/audit-final.json` SHA-256 `b57284a3407d3a479db42dad757cfdd0ef1423dc0c4378a3f46d642321ff0465`，冻结材料、配置和运行包哈希一致；五条直接输入各出现一次、无额外直接输入，8 份原生 Session，任务 3、评估 1、研究 0、空工作区，学习同意 `revision:2 / enabled:false`，宿主已停，`allExpected:true`。原生准入、任务族票和反馈评估的 `structured_output` 证明复核见 `native-use/evidence/audit-proof.json`，SHA-256 `e163366c325555c7ffc6fb8049ee92ce3c6fcee2c810288fb23567af5b8369ae`，`allExpected:true`。本轮只在 D: 新建约数 MB 的试验材料，复用共享宿主，没有复制整套桌面构建。

下一阶段在全新材料和全新隔离档中完成两条合格来源及成功对照，让产品自然打开完整研究；逐臂核对结构化交付、答案事实边界和当前请求优先级。E090 第八臂无效交付是原轮次的失败记录，不补跑；如果新研究再次无效，继续失败关闭。只有可靠研究裁决与独立语义门过关，才考虑受控激活和后续任务效果；发布门槛仍独立保留。
