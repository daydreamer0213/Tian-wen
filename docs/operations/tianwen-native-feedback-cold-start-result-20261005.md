# 原生模拟反馈已归因，修复实际CLI冷启动时序

## 最终反馈接缝结果：旧判断保持，新版本与撤回已完成

9610de82已推送。r7同一原r2 profile冷预检0，零新增调用恢复两旧Task/归因；只做第三positive任务，4真实/1scripted、Task complete/双评审met、真实positive归因有proof，并引用了实际rating `positive`，原引用修复生效。随后原SDK put已写第二项新修改反馈版本c05d1678-c024-4405-bb24-ca077a1496bc，Bridge active，但旧磁盘root没有当前live agent，scheduleForSession合法返回，不产新归因；操作员断言停止、CLI1/排空。不是需要再做任务或真人输入。

r8使用安装SDK公开agents.resume({resumeSessionId,agentOptions})恢复同一旧root，不followup、不重新put版本、不替换司机。仅1真实请求正确归因requirement-change/类别null/补充标准空/原生独立proof；此前bare版支持失效。删除第一项确切原版本→SDK absent、Bridge retracted、原attributable-problem支持失效，原历史保留。三Task及原三个assessment记录不变，四归因历史；研究/激活/方法未来效果0。原run退出0/排空，随后原CLI冷回放退出0、0模型，三Task/四历史/当前SDK两反馈与intakes逐项一致。

| 环节 | 实际结果 |
|---|---|
| 具体模拟纠错 | 真实原生attributable-problem/source-fidelity/proof |
| 只有负评分 | 原模型inconclusive，host遗漏实际rating JSON→invalid-judgment/proof=null；旧失败不重判 |
| 明确模拟认可 | 真实原生positive/proof，引用rating字段实际通过 |
| 同一答案新增一次性修改 | 真实原生requirement-change/proof；未改原答案/评审 |
| 原具体负反馈撤回 | SDK absent，支持失效，历史保留 |
| 重启回放 | 零模型、三Task/四归因历史/当前两反馈完整相等 |

r2/r6/r7/r8合计18真实/18完整实际轨迹、3显式root主答注入；不称自然模型错误、真人评价或全三初始归因语义通过。所有原首失败保持。最终证据`D:/DevData/tianwen-native-simulated-feedback-20261005-r8`的batch-first-result、updated-feedback、retracted-feedback、cold-result、drained-result、trace-counts及final-audit；各原批完整轨迹分列，不复制环境或回灌结论。

29冻结消费者、三旧账本未变，Docker未启动且仍停；原r7成功case阶段文件与原batch-first-result逐项完全相等后删27,701bytes，回执保存。D17.095GiB>=15，20偏好未达。完整目标active、main/Daily NO-GO/R9/原门槛保持。下一新DEVpolicy原生研究/启用、事前未知后续任务效果和方法撤回；缺场景由执行者主动模拟，不索题或机械标blocked。

## r6 同一原profile冷启动通过，补遗漏的原反馈引用字段

ae36845a后r6原CLI零模型预检退出0，原Task/具体反馈归因/同意完整恢复；随后只执行原第二项，5真实/1scripted、Task complete/双评审met。只有negative无说明的真实归因模型正确选择inconclusive，并通过原structured_output捕获；但引用了实际材料中的`"rating":"negative","note":""`。宿主的quote whitelist只含request/answer/note，漏了实际rating JSON字段，后置检查丢弃为invalid-judgment/proof=null。操作员原proof断言终止，CLI1/原排空，第一/第二Task和两历史原样保存。不能把安全fallback当语义有效归因成功。

窄修复只把实际native rating及optional note的紧凑JSON纳入原exact引用白名单；不包含内部source或派生criteria，不改原材料/hash/分类/同意/版本/历史。新正控制RED、伪造positive负控制保持拒绝；最终源码相关58、同组发布dist58、原十五实际构建、原发布profile49通过/10原条件跳过。限定只读复查未发现有据P1/P2。证据`D:/DevData/tianwen-feedback-rating-evidence-20261005`含原实际捕获只读诊断及RED/GREEN/构建记录，诊断0新增模型。

接续r7将沿同一r2原profile，零调用核两旧Task/归因与SDK版本，只执行未做的positive Task、第二项新反馈版本revision及第一项retraction。旧invalid结果不重判、不补proof；模型请求和冷回放仍需实际运行才可称通过。main/Daily NO-GO/R9保持，完整目标active。D17.10GiB，无Docker或依赖副本。

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
