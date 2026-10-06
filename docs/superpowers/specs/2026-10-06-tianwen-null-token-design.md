# Task18：原生提交中的 null 类型提示

当前完整目标继续 active。Task17 原反馈资格、同族配对和真实十项回答已发生，但最后 grounding 原 child 没有结构化结果，正式 arm 只保存九项；没有独立许可、采用或后任务效果。原材料、35 次原请求、34 次拒绝、终止文本与停止决定保持。

## 已确认问题与选择

唯一实际正确解析成五字段对象的第73次请求把 category 写成字符串 "null"。原 SDK 正确拒绝它，却只返回泛化的 oneOf 错误；随后同 child 又退回字符串 wrapper。具体缺口是错误类型说明，不是改变审核标准或自动修复 JSON。已有尾括号和 wrapper 说明确实到达模型；不能声称宿主丢了协议，也不能保证一条提示会让真实模型成功。

首盲与原票对照还确认 adjacent baseline 原 verdict 为 inconclusive，来自真实标签表述的冗余/解释分歧。即使最后捕获成功，原十臂明确门槛仍不能自动通过；本修复不能被称为唯一剩余障碍或保证下一研究接受。下一批新来源可使用更清楚、没有无用标签的业务记录，避免人为制造此类表述歧义；不新增禁标签规则、不改旧 inconclusive，也不改变裁决。

最小方案：在 runNativeStructured 已有同 parent、唯一 label 的 pre-execute 边界，仅当 category 的原属性 schema 接受 JSON null、拒绝字符串 "null"，且实际提交恰为该字符串时，拒绝并说明两者区别。要求模型自行按原合同决定字段与 verdict，不自动替换、不暗示 met、不更改 SDK/schema/原票/版本/最终 parser/双审/正式裁决。合法声明字符串 "null"、无该属性、普通 failure category、正常 JSON null 均走原规则。

Owner：复用 investigate_actor_semantic_seam，仅 packages/tianwen-runtime-bundle/src/conversation-judgment.ts 与 tests/dsh-migration/conversation-judgment.spec.ts；其他人仍工作，不撤销他人改动。Root 负责文档、原公开构建、零模型旧证明兼容、新输入及实际执行；review_shared_future_scope 负责独立规格/质量与实际首盲/终审。不得新增 agent。

## 执行顺序

1. 等 Task17 原始证据、首次语义盲审、原票对照、零模型 cold 修正与独立终审完成；由真实 freeze-end 释放后才写产品源码。cold 首错误仍保存，不修改六个冻结操作器。
2. 真实 SDK scripted RED：首个原 child 的合法 JSON 对象 category="null" 保留原拒绝；当前缺少具体类型提示须失败。下一 fixture 自行提交 JSON null、原材料和原判断，验证只捕获第二次、原坏输入保留、proof 恢复零新调用。验证 bad-only 无 proof、合法字符串 null schema 与其他 category/control 沿原规则。
3. 最小实现提示，GREEN、完整原 judgment 及相关 claim 套件、原配置类型检查与差异；首失败保留，脚本不称真实效果。独立规格/质量复核。
4. 原公开构建与 actual dist 入口、旧合法 proof/Task17 原24个完整 review checks零模型恢复；Task17最后缺票不能补造或重评。明确 code/type兼容不代表效果。
5. 全新两来源/反例及专属空普通 Profile，公开模拟反馈，复用原 route/runtime/deps；原未消费 future1/future2/unrelated 全对象及六效果标准不变。原正式研究、native 首审许可、采用实际发生后才运行新任务效果；原关闭、cold、逐请求与首次盲审保持。

完成依据沿用原门槛：十个正式 arm 明确、五个 candidate met、至少一个 source baseline not-met、counterexample baseline met；另有原许可及语义安全、原后任务效果和撤回/cold证据。没有新样本数量、自然等待、第三审或模型预算扩张。每轮有限结束不等于完整目标完成；main/Daily 原 NO-GO 保持，直到原发布条件成立。

全部生成物 D:/DevData，不复制完整运行环境、依赖、凭据或旧历史，保留首次原证明；D可用至少15GiB，优先20GiB。
