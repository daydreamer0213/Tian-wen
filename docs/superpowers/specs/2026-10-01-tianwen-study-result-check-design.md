# 方法研究独立结果检查：完整功能任务

## 授权、待办与纠偏

所有者要求自主寻找或设计工作，已有持续开发授权，不再要求逐项执行许可。基线f3a67ff；目标工具已active。上一轮把缺自然研究输入等同于不能实施任何主线功能，收口过早。本任务就是尚未实现的阶段D功能：五案例在提案前固定可信检查，十正式臂实际输出分别核验，失败或缺证阻止新激活。工程可以先用明确标记的受控反例验证完整功能；这些反例不是自然来源、反馈或完整目标成功。

比较继续普通小修复、只增加检查生产接口、完整接入研究记录与激活消费者。选第三种，复用现有原生文件试验、账本、Outcome枚举及取消机制；不建立注册表、证书平台、通用执行器或另一数据库。普通任务已有检查接缝，研究十臂目前仅模型双审，是具体功能缺口。

## 有限边界及职责

新增可信宿主studyResultCheck配置，只适用code/local-files/files研究。宿主对每个实际案例原要求及完整冻结输入准备检查；不能把普通单题闭包直接套入另一个任务。不执行生成代码，不请求额外模型。没有完整适用依据的案例返回undefined；配置此检查且五案例不能全部准备时，在新方法提案前停止。本任务不为开放写作提供通用语义真值，也不证明不同案例摘要即语义独立。

未配置检查的旧形状、模型裁决、来源资格和历史重放保持；正式bundle的guidanceActivationQuarantine仍true。检查不能解除同意、隔离、父版本、作用域或原十臂门槛。自然前瞻仍缺真实来源和案例依据，不能因机制成功宣布发布。main/Daily NO-GO、原十工作日窗口、原记录保持。

## 数据及绑定

study-opened增加可选resultChecks，严格五条，顺序对应cases。每条包含caseId、checkerId/checkerDigest、contractDigest、inputsDigest及非空requiredCondition；完整study同时绑定各case.materialDigest、原模型摘要和当前父版本。source输入由原task冻结文件恢复，generated输入沿cases.files；metadata摘要须匹配完整原files.entries。准备只收到原request/context或prompt、原criteria/已绑定反馈标准、files及modelConfigDigest，不收到旧答案、新candidate或十臂答案。所有五条在study打开、提案和试验前固定，不能后补或冷恢复重建标准。

正式arm-recorded增加可选resultCheck，包含preparationDigest、outputDigest及现有status/detail/failedRequiredConditionDigest。preparationDigest绑定该case检查、case.materialDigest及opened.modelConfigDigest；outputDigest须等于该arm及其原生file receipt。准备用同一闭包检查baseline和candidate；evaluate只收到冻结要求/输入和实际输出，不收到role、guidance或模型裁决。原双审及verdict保留，检查字段不进入worker、proposal或blind review材料，不作为模型新评分标准。

## 采用及历史

原study-decided和accepted含义保持。对已准备检查的研究，新激活要求五个candidate均verified，五个baseline均verified或对应原requiredCondition的qualified rejection；counterexample baseline必须verified，至少一个source baseline须qualified rejection，以原模型至少一个source not-met门槛为准，不增加两个baseline必失败要求。任何unverifiable、缺结果、摘要不匹配或普通诊断性rejection阻止激活。独立成功不能替代原模型accepted。

记录校验与新激活使用共享逻辑；已有历史无字段原样重放/幂等。冷恢复只能验证已持久检查字段与原生收据/输出的准确身份，不重新prepare/evaluate、修标准或重复模型。丢闭包/检查异常保存unverifiable或停止，不能自动再做该研究求绿。取消、同意修订或来源失效时不写迟到结果、不激活。

## 固定验收依据

工程验收依据是上述明确功能和现有研究的版本/身份/治理要求，不从实际candidate答案反推标准。受控五案例用互不相同的冻结文件事实及精确字段要求，宿主函数检查所有声明输出及必要值；不能把纯编译称成完整功能。

必须先红后绿证明：完整五案例准备早于proposal；十结果绑定原生输出；model accepted而candidate结果rejected/缺失/unverifiable不激活；至少一source基线qualified failure即可、counter仍verified；交换case/input/output/requiredCondition拒绝；全套满足时仅在非正式隔离测试路径沿原治理激活；无hook旧十臂/摘要/重放保持；冷重启无复评且矛盾结果不激活；取消/同意变更无迟到采用。真实用户反馈不编造，旧E104/R9不重跑或改判。

## 文件与资源

Evolution新增guidance-result-check.ts，复用现有Outcome解析；conversation-guidance.ts承载可选字段/结构/采用核对，ledger.ts核对来源与生成文件原输入。Runtime新增conversation-study-result-check.ts，仅薄宿主准备/核验；conversation-guidance-loop.ts及runtime/index接线。测试覆盖纯规则、原账本、完整原生受控研究及冷恢复。当前worktree/依赖复用，生成物D:/DevData/tianwen-study-result-check-20261001，D底线15GiB、优先20GiB；不复制依赖/Profile或全量保留可重建临时目录。
