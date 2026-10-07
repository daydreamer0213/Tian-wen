# Task32：段落误拒修复成立，发现摘要引文晚校验

Task31已证明普通产品自动学习的正式研究、首独立许可、真实启用及两个原后续效果。Task32只澄清原单段要求允许多句，同时保留明确一句话、真正分段、标题列表及适用独立句限制；没有新quality/schema/裁决/研究门槛。原Task31 future2普通inconclusive不重判。

源`015a942459569dc57e96c9c35d9bfb2adedd112d`已推开发分支。单生产文件、既有完整版本兼容spec适配，原SDK机械RED28→claim+judgment完整242/242实际0，不是模型语义RED/GREEN。独立code/spec/operator/author审查PASS；原公开构建16步、实际入口4+4、默认types/私有导入检查实际0。新runtime SHA256 `c538509c286027e77e7c9cf53359b22f877558a4876a395a7c5ee4f7072c7c25`。

旧190审核/57trial在当前生产者零模型恢复，Task31的原12普通/20研究/6效果、82请求/74会话/6许可文件也零模型恢复，原票不改。首次历史恢复收据摘要误绑current transition，实际恢复本身通过；原收据保留，修正v2绑定真实historical transition及当前source/dist，最终author另核原Task31审计摘要，不把首收据用作准入。

新profile预检实际CLI0/calls0，无学习Runtime/账本/依赖或历史复制。4162冻结行独立核验无差异。六个新固定交付首次12真实请求/0脚本回答，3ordinary original-result审查材料与3method-study材料；不是新主答生成或新学习效果。

| 新例 | 原结果 |
| --- | --- |
| P1 一段四句 | 双审met，有效 |
| P2 明确单段不换行，却空行两段 | 双审not-met，有效 |
| P3 明确一句话，却三句话 | 双审not-met，有效 |
| P4 单段多句且待办独立句 | 双审met，有效 |
| P5 明确允许两段，实际两段 | 两raw输出met，但requirements引文含纯换行，晚parser拒绝；没有合法双审，原typed-invalid |
| P6 直接单段要求，却标题列表 | 双审not-met，有效 |

所以只能记五项有效预期匹配、零已确定语义错票、一项类型无效，不能称六项全过。P5不是把两段误认违约：两位检查者实际理解正确。失败在现有capture只查quote.length非零和原文子串，纯换行满足两者，原native marker先保存；最终parseConversationReviewChecks按quote.trim非空拒绝。空白答案单元正确记null；应提前同一非空白引文检查，而非删除正常段落、放宽最后parser或替模型补引文。

首次独立文本审查先于本轮票，但准备时已见expected，非隐藏预期全盲。原run/audit退出0只说明六项尝试完成，audit明确invalid1/allSemanticExpectationsMetfalse。补充失败型audit用原SDK folds把全部12实际envelope绑定，包括P5两个没有返回合法review的子会话，保存19原会话；独立终态及失败close审查PASS。实际close-failure-stage退出0，仅保留失败并释放开发冻结，不是成功收口。

主要证据在`D:/DevData/tianwen-paragraph-boundary-controller-20261007`。Task33只把现有非空白摘要引文规则提前到capture，原SDK模拟校验同child纠正，再用两个全新实际正常例子检当前合法字段，不重评P5、不第三票、不重开Task31研究/效果。原主线发布NO-GO、整体goal active。D约16GiB>=15未20，未复制完整环境；已拒绝scratch删除不绕过，不称清理完成。
