# 原生消息字段修复：一次普通任务通过独立结果核对

## 交付结论

按已授权自主换选开发待办，从冻结源码8f3c812执行一次真实普通任务。天问自己修改`tests/dsh-migration/conversation-task-material.spec.ts`，仅给`answer-1`消息添加合成测试source，并给所属assistant/message事件添加step:1。原数据、消息内容、注释、类型及全部断言保持。控制端未修写候选，采用字节与原生捕获输出完全一致，SHA-256为`52396c205ca935c34b91d3b420b247cf139481087755e2f174eaf79952dfe178`。

这解决一个实际原生材料测试类型待办，也补上一条完整普通任务记录：原模型评价met，事前固定的独立程序结果verified。它不证明自然反馈、研究成功、方法激活、未来任务收益或完整语义安全；main/Daily完整自动学习仍NO-GO，新激活隔离和原十个工作日决策窗口不变。

## 事前要求与失败保留

设计a0ea200及修订be4d9db、预检收口8f3c812均在本次真实任务之前。原文件4549字节、61个非空行，独立strict原TS2741缺source；初source-only正向控制又揭露隐藏TS2345缺step，故在真实任务前一次性明确两字段要求。后续AST去字段投影保留原NodeArray尾逗号。初控制失败及初预检对同意元数据过强断言失败均保留，后者0模型、原同意/任务/账本未改。不把它们说成实际模型失败或事后追加验收。

source明确为`{kind:'model',provider:'tianwen-test-fixture',model:'surface-projection'}`，只是合成测试元数据，不代表该测试消息存在真实模型历史。有限合同允许新增此source及数值step:1，移除后精确保护其他AST、注释、数据、类型、断言；严格noEmit编译0。普通编译接受删光测试的export空文件反例保留。最终13项纯控制全部通过，错误来源/模型、断言、删改测试、漏/错step等拒绝，正确两字段控制verified，变更输入绑定unverifiable；控制并非实际候选或自然任务结果。

## 实际原生证据

复用正式持续DEV：`D:/DevData/tianwen-development-learning-20261001`，新session`tianwen-native-message-source-20261001`。DEV原同意enabled/revision1/policy v3保持；不导入旧任务，不更改Daily。真实任务ID：`conversation-task:68bca20bacb0a501810cc58fd0aa77db092e1f5abe28eec61e92901ce34eceb8`。

- 7次实际提供者请求，其中根任务3次；2次成功工具调用read/edit，0重试、0脚本适配请求。原8根/12工具/32总请求/12分钟预算保持。
- 实际成功read结果序号113早于首次edit调用336，edit结果337成功；无write替代。根turn及task均completed，只有目标输出文件，完整原输入及原生最终文件可恢复。
- externalCheckPrepared在首个根提供者转发前，冻结原输入/要求/检查/源码及实际模型配置一致；程序结果verified。此准备先于根任务，不能说先于准入模型调用。
- 原模型两项评价均met；与独立程序结果分别记录，不将模型的编译推断当作编译证据。严格编译与结构保护的实际检查才核对有限修复要求。
- 完整任务收据、压缩原生快照、前像、实际候选、原模型审计均保留；finally等待根及Profile释放，清理无异常。

## 工程接纳及冷恢复

原样候选既有3/3测试通过；按原冻结选项单目标strict/noEmit无诊断，目标与原生候选hash相同。独立只读审查核对实际字节、原生操作顺序、事前合同及归属，无阻塞或重要问题。因此只接纳这份原样修复，不重做题目、不补写替代候选；不需重跑上一轮387项无关消费者测试或全部包构建。

正式Profile冷恢复0模型/0工具，完整新task及恢复材料与执行结果精确相同，账本SHA-256`de6ab2b15bafc936e27ae28814269f931e2e1dfba5e1348e9248a7b2ef809854`未改，旧原始账本字节前缀保持。只读readiness确认持续档现有3个普通任务：旧两项inconclusive、其中一项程序unverifiable保持，新项met/verified；状态仍awaiting-compatible-sources，0研究，隔离true。潜在成功对照不等于已经具备两条问题来源或适用的五案例合同。

## 存储和下一步

运行记录在`D:/DevData/tianwen-next-result-basis-20261001`，约273KB；复用持续Profile约3.49MB，原生快照一开始即压缩，无新工作区、依赖副本、模型文件或自有测试临时根。D剩余约18.56GiB，满足15GiB底线、尚未达20GiB偏好。不重试此前被拒绝的旧目录删除，不声称旧残余全清。

完整目标仍active。本题已解决，不再作为新问题来源重试；继续从真实未完成待办及实际失败选择同族、同适用要求的有限检查，保留每次未知结果。没有当前案例原要求和独立结果依据时，不凭此成功扩通用研究检查接口、造反馈或启动预编排研究；来源、研究裁决、激活、未来效果与语义安全仍分别核对。

关键记录：`frozen-task.json`、`contract-controls.json`、`preflight.json`、`pre-answer-check.json`、`task-result.json`、`native-action-order.json`、`native-result.json`、`native-strict.json`、`native-tests.log`、`cold-read.json`、`readiness.json`、`run-cleanup.json`及`root-native.json.gz`，均位于上述运行目录。
