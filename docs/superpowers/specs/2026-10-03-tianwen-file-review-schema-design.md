# 完整文件评审：缩减重复工具schema

## 原事实与边界

可信read拒绝交付5abf191后，真实任务原功能verified，但requirements子评审input140989/output65536/reasoning60588、max-tokens、无有效结构化裁决。只读原材料量化schema297701B/audit228723B；prompt227410B。不能仅凭大小断言某部分造成耗尽，但重复schema是已证实可独立改善的成本。

原自动学习目标、全部输出单元核对、权限、引用/来源绑定、历史证据和发行门槛不变。不重跑或重评原任务、不提高模型预算、不制造失败。

## 选择

1. 扩大预算或重试旧任务：没有消除重复，容易重复花费，不选。
2. 回退v1数组或抽样输出：v1历史漏单元问题及完整覆盖责任会被削弱，不选。
3. 只对大型新完整文件评审去掉重复quote/source enum和逐字段重复说明，保留v2所有固定必需单元、每非空单元firstClaim、原kind/status及严格结构，并由现有host逐字引用/来源/覆盖验证继续裁决。选择此项；复用既有工具schema表达及原parser，不增加协议、依赖或评审系统。

## 流程

先原样构建现有完整schema。当claimEvidence v2且整个schema UTF8超过98,304B时，生成紧凑v2 schema。每个answer ID仍在properties和required中；空单元仍null；非空单元仍要求firstClaim和additionalClaims。claim的quote为string、sourceIds为array string、kind/status保留enum、每层additionalProperties false；上层统一说明原逐字引用、来源和解释责任。

大型schema的evidenceQuotes不重复嵌入全文enum，只要求string，原host仍要求非空引用来自一个实际evidence item，不许跨单元拼接、伪引用或来源越界。小schema、text/chat、method-study非文件引用协议完全保持。完整original和claimEvidence仍保存并发给模型，未删源码、参考文件或输出；材料去重留到有正确恢复设计时再做。

所有新旧cold核验仍以原持久请求、instruction、完整original/evidenceDigest、原model/session/proof和audit核验；原指令逐字不变，schema生成变化不追写历史。新的紧凑schema只影响未来调用，不声明解决自然max-tokens或已完成学习。

## 核验

先写实际SDK脚本控制验证首红：约65单元的全文文件任务schema降到96KB以下，仍完整原材料/原单元/原v2、真实结构化捕获及0调用cold；空单元保留。反例覆盖漏/增单元、空非空单元、跨单元引用、未知/answer来源ID、摘要漂移和met含unsupported，原host必须拒绝。小schema逐字段原能力保持，历史v1/v2冷恢复不因新schema改变。相关回归/类型/实际发行/独立审查后提交DEV，后续真正不同兼容核心待办单独前瞻。
