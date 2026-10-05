# 显式DEV成对改善决策计划

**目的：** 已有受控研究baseline3/5、candidate5/5却因改善不在前两个来源案例被拒绝。按所有者授权去除不必要角色限制，以固定案例中的实际改善推进开发；保留旧记录和正式发布规则。

**授权与范围：** 所有者已批准主动模拟全部缺条件、不严格自然等待，以实际效果完成；本设计不另索确认。root负责docs；执行者只修改evolution判断/结果/新写入边界、Runtime DEV选项/loop和原DEV loader以及直接相关tests。复用既有计划/TDD/发布验证流程，不新建环境副本。

- [x] 保存新唯一批原206真实/15scripted首结果、七完成、三来源、一研究十臂、两paired改善、原rejected；原排空和三账本/29consumer/84容器审计，重复清理/D>=15。
- [x] 核两处来源专属限制，给出DEV显式规则和历史兼容设计；独立遗留代码环境已准备，未将前像当Worker基线证据。
- [x] RED：原source默认仍拒仅adjacent/holdout改善；DEV新policy语义+功能应允许任意固定角色改善、候选全过；无gain/退步/inconclusive/未知policy仍拒。
- [x] 最小实现：新study-opened可选decisionPolicy，缺省不补字段且保原hash/回放；DEV显式guidanceDecisionPolicy传入loop、事前冻结研究身份；两谓词同规则。main新写入拒DEV研究，ordinary apply不采纳，replay看原字段；安全停止与撤回仍按原验证允许。
- [x] 源码378、严格类型、限定复查、Evolution原构建/Runtime原十五构建通过；发布profile49通过/10原跳过；公共Core/Loop两控制92scripted/0real证明旧3→5拒绝、新DEV持久化接受激活、普通区冷恢复安全撤回。外层DEV入口/loader为源码覆盖，不冒充完整CLI或真实方法后效果。
- [x] 提交当前隔离分支；推送结果以实际远端返回为准。
- [ ] 新任务验证启用/真实未来/撤回和原SDK模拟反馈接缝，所有者不需再提供问题或许可。受控遗留环境主动供改善空间，不以初始坏程序充实际Worker基线；普通未来全通过只记无退步，不因此等待自然失败。

**DEV决策：** 五候选全met且至少一对应baseline not-met→met；五候选独立verified且至少一对应baseline qualified rejected→verified；原完整十臂、inconclusive和全部来源/合同/证明检查保持。不额外强制counterexample baseline通过。

**停止约定：** 遇具体错误保首结果并由执行者修正场景或实现，不为了成功追加样本、不等待自然、不机械blocked。未启用和未来未改善分别报告；工程、受控真实效果、自然证据与正式发布分别陈述。完整目标active，main/Daily当前NO-GO/R9与原正式条件保持。
