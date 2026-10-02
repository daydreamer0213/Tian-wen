# 原生read预执行拒绝：可信回执接缝

依据本次真实任务：guard拒绝read scripts，SDK不进入tools/execute，原file observer却把没有prepare/pending判为全部材料失效。原任务保持unverifiable；修复只用于未来任务。

目标：保留可核验、确实没有dispatch的原生read拒绝，也保留拒绝消息供原评审审查。拒绝不产生file input、不计成功read/output，不视为必需条件通过。未知错误、真正dispatch失败、取消、撤销同意仍保守拒绝材料。

用宿主原guard的一次可信包装及闭合ancillary回执，复用公开ctx.tools.guard、ctx.tools.get、tools/execute和冻结tools/result。只有原guard实际返回拒绝，且原生read拥有精确当前definition、session/task/turn/call/rootCall、arguments与活体exec.token绑定，才建立待验证拒绝。任何同token进入tools/execute都是反证；结果缺失/重复、身份/定义/参数漂移也使回执失效。token为symbol，只作活体检查，不持久化。

持久回执保存有界producer身份/摘要、原任务及native call/result位置和摘要、原拒绝原因摘要；独立于SDK原结果，不改冻结结果或伪造metadata。Evolution增加read-denied闭合分支；Runtime ancillary显式覆盖拒绝call计数、freeze和cold verify；file observer只收经验证回执。生产者/真实工具definition按原native registration原则绑定；现仅支持search/skill/pwsh，需加窄read registration，不能把read硬套pwsh-denied。

禁止按isError/报错文字/缺pending跳过。SDK公开PostToolDecision不能补meta，现pwsh ALS capture发生在execute内，也覆盖不到此read。不调用私有guardReason、monkeypatch或重执行判断。旧task/账本/结果不转换新证据。

实施顺序：先事前固定纯回执schema/API与独立行为入口，由一个未知答案真实核心待办实现；工程验证后接原ancillary/observer/公开read registration和薄宿主。最后用真实SDK guard拒绝与同文案已dispatch失败反例验证差别，并零请求冷恢复；控制不计自然问题或学习来源。原single/项目/研究合同、取消/同意/隔离保持。

控制覆盖：合法guard拒绝且没有dispatch；同文案真实body失败；无可信包装；错误/缺/重复call-result；token/definition/session/args漂移；dispatch反证；取消/撤销同意；cold缺producer或回执。不确定情形仍不可核验，不弱化旧保护。

随后固定实际发行和宿主环境，推进有同一原功能要求的真实独立待办，各自保留合同/输入/期望/原结果。不改旧requiredCondition拼组，不预设失败，不追加固定公开练习。原学习/发布门槛、窗口和NO-GO保持；产品实现与真实研究/激活/后续效果分别记账。
