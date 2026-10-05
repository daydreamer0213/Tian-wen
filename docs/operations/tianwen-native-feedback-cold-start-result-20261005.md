# 原生模拟反馈已归因，修复实际CLI冷启动时序

所有者允许主动模拟缺条件。新固定三普通摘要任务用原CLI/public DEV Runtime；仅root主答显式scripted，原认领、双评审、归因用deepseek-official/deepseek-v4-flash high/65536/retry0。具体negative、bare negative、明确positive及一版本修订/撤回均事前冻结，来源不冒充真人反馈或自然模型错误。

首操作员尝试0真实/0scripted，在提交用户消息前因createUserMessage公共模块误选及intake查询缺sessionId退出1，日志保留。r2正式批8真实/8完整原请求、1scripted/1完整主答轨迹；第一原Task complete/双评审not-met，原SDK反馈正确绑定确切原assistantMessageId/版本/生命周期，真实归因为attributable-problem/source-fidelity，指出将“只在先导试验中使用”“尚未全面正式上线”反转成“已经全面正式上线”。原归因有实际独立proof。此后操作员用普通JSON代替产品规范JSON摘要而断言失败，原批CLI1/原句柄已排空；3计划仅完成1，研究/激活/未来效果0。首结果、原回答、原评审不重判。

证据`D:/DevData/tianwen-native-simulated-feedback-20261005-r2`：batch-first-result、drained-result、trace-counts、actual-provider-traces.jsonl、scripted-answer-traces.jsonl、run-cli-result保留。新r3只准备在原profile接续剩余任务并用公开Evolution.sha256核原摘要，0新增调用冷预检却失败：原Loader记录operator入口等待tianwenMessageFeedbackBridge，提前终止。证据`D:/DevData/tianwen-native-simulated-feedback-20261005-r3/preflight-console.log`，不是原问题已解决或产品blocked。

## 冷启动修复交付

原Runtime挂载Bridge插件后直接返回；Bridge的Service.init在已有持久会话中异步list/inspect/list原SDK反馈，原Loader只等配置条目随后检查入口，消费者因Bridge仍在读盘而被判pending。安装Cordis提供可等待的原plugin Fiber，原代码未等。确定延迟真实JSONL第一次list的普通/DEV两测试都RED，证明父Runtime在扫描未完时已settle。

最小修复保存Bridge Fiber，挂完原插件/Goal host后，原messageFeedback和sessionPersistence后端可用时await原Fiber；缺后端的部分宿主继续延迟挂载。无重建司机、脚本造归因、删除旧反馈或换环境解决。限定只读复查未见有据P1/P2/启动等待环。

源码三文件60通过；原十五实际构建全部成功，0安装；同三文件切到发布dist和安装SDK60通过，原发布profile49通过/10原跳过。证据`D:/DevData/tianwen-feedback-cold-readiness-20261005`的red-readiness.log、green-source.log、published-build-result.json、published-controls.log与published-profile.log。发布测试含scripted原夹具，0真实模型，不称完整学习收益。

下一r4新启动输入/消费者冻结复用原r2profile，事前仅核原第一settled材料/版本/规范摘要，不重新执行/归因第一Task，接续两原计划未执行任务、修订/撤回及冷回放。尚未执行不称通过。源代码、原输入、三旧账本分别按实际版本核；main/Daily当前NO-GO/R9/原正式条件保持，完整目标active。无Docker启动或依赖副本，D约17.09GiB>=15；旧4KB清理策略拒绝余项不作为开发阻塞。

## 实际冷预检发现入口后端尚未就绪

f2858387已推送。r4原CLI冷预检仍退出1/0模型，等待Bridge；不是完整冷启动已修复。r5仅在原DEV入口前后记录公开ctx.get可用性，不代替原入口：before/after均sessionPersistenceReady=true、messageFeedbackReady=false、bridgeReady=false，0模型。说明原规范DEV loader只声明会话后端，原SDK反馈后端尚在启动时就进入Runtime，前述部分宿主兼容判断合法跳过等待。

入口补齐已有原messageFeedback依赖，让原Loader等它就绪后进入规范DEV，再等原Bridge扫描。程序化部分宿主和普通主路径不改变。原两个normal Loader检查在真实SDK后端加载序列上RED；追加原Storage/JSON/Domain/Feedback标准后端后十八现有检查全绿、脚本语法与差异检查通过。Runtime源码/发布构建未变，不重复构建或重跑此前49项检查凑数。原r2答案、8真实/1scripted、归因和所有首结果保持；下一仅原同profile新输入冻结冷预检/接续剩余任务。
