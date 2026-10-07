# 后续紧凑文件评审的原生捕获前引用检查

两次实际requirements评审的schema/顶层引文合法，但逐单元引文不属于指定原答案段落；原host正确拒收，历史不回写。紧凑schema仅提供示例时不能借枚举缩窄全部合法子串。选择复用原SDK tools/pre-execute：精确匹配原one-shot子Agent lineage/随机label与structured_output，成功捕获前运行既有逐单元引用规则。仅错误引用返回原SDK deny及安全answer-ID提示；不注入新消息、修文字、另开评审/重试旧Task，也不增加评审数或放宽原host。

1. 原validateClaimAudit只把既有引用失败标记为无原文的类型化错误（message仍invalid-judgment），其他失败保持。
2. NativeStructuredInput内部可选captureValidator，借SDK原waterfall安全返回deny；遵守先前deny/ask、只在精确子Agent范围，finally注销。其他消费者/普通协议保持。
3. 仅实际v2紧凑分支启用：复用validateClaimAudit捕获引用错误，其他语义错误仍由原host拒收。原SDK同一Turn可自行更正格式，所有失败调用保留，proof仍只能来自唯一成功capture。
4. 独立真实SDK脚本控制先红：错误引用→合法任意子串→另grounding；没有额外消息、错误捕获不成功，原材料/两proof冷恢复。回归原schema/未限制子串/极限fallback/失败/隔离两审，完整Runtime构建和声明，独立复核。
5. 不把这些scripted控制算自然学习；正式账本只读、自然首Task/代码不修改。之后新Task事前冻结当前首代码、原生Goal新增要求及已观察覆盖缺陷修复的独立依据，完整目标和原发布窗口不变。

此前误将line-v1容量控制的200KB限制改为v2的96KB，控制先红187026B；已撤销该不适用断言，原line-v1合同不改，不称产品失败或新发布门槛。
