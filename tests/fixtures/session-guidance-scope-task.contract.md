# 原生 Goal 当前会话研究范围漏报修复

这是真正未完成的产品修复，不是生成演示答案。现有 learning-consent-agent.ts 的 learningStatus 只从 currentConversationTasks 取 currentScopes。原生 Goal 的结果已有单独统计，但其原研究来源的 scope 没有加入当前会话，研究进度因而漏报。

只允许修改 packages/tianwen-runtime-bundle/src/learning-consent-agent.ts，新增 packages/tianwen-runtime-bundle/src/conversation-current-scopes.ts。其余文件只读。不得改历史、同意、反馈、裁决、启用、回滚或原有 Goal 功能结果统计。

新增纯函数 collectSessionGuidanceScopes(sessionId, conversationTasks, goalOutcomes, nativeGoalSources): readonly string[]，从 @tianwen/evolution 以 type-only 导入 ConversationTask、GoalTaskOutcomeObservation、GoalTaskResearchSource。返回去重并按字典序排序的原 scopeKey，不得修改输入。

普通任务沿用原规则：source.sessionId 等于当前 sessionId 时保留 source.scopeKey，包括非 task admission。原生 Goal：只有 goalOutcomes 中 origin.sessionId 或 childSessionId 等于当前 sessionId 的原结果，才能关联其研究来源。必须核对研究来源的 sourceId、input.sourceId、input.outcomeInputDigest，与该原结果的 sourceId、inputDigest 一致；研究来源附带的 outcome 的 sourceId/inputDigest 也必须一致。从已发布的原来源 input.scopeKey 取 scope；不得按 cwd、Goal 名称或会话名字猜 scope，不能用未发布来源或其他会话的结果。Goal 未有匹配原来源时不增加 scope。普通与 Goal 混合、共享 scope、重复来源均正常去重。

在 learning-consent-agent.ts 增加此函数的命名导入（./conversation-current-scopes.js），仅将 currentScopes 的初始化改为 new Set(collectSessionGuidanceScopes(String(agent.session.id), conversationTasks, goalOutcomes, this.ctx.tianwenEvolution.listGoalTaskResearchSources()))。其他可执行代码不变，不能加入 @ts-ignore/@ts-nocheck。新增函数使用真实公开类型，不使用 any 或关闭类型检查。

独立检查会验证原调用接入和上述身份/范围/去重/只读行为，隔离执行新增函数；完整发行构建和既有状态回归另外核实。读取原 Agent 和原类型文件后修复，不写测试答案或假记录，不声称已经改善后续学习。
