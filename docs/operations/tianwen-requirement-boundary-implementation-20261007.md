# Task21：具体分句要求的当前审核说明

机制实现与独立规格/代码审查已通过；真实模型效果尚未验证，整体目标 active，main/Daily 原 NO-GO。

Task20邻近旧方法答案把地点与第一待办用分号并在一句中，requirements误met、grounding正确not-met。此次只给当前审核补清已有要求的阅读方式：一般标点许可不能覆盖更具体的独立句要求；必须检查句子左右边界，不能只看待办末尾有句号。没有独立句要求的任务仍可用分号，不从引用内容创造要求，不把事实有源等同格式合格。

生产只修改 `conversation-claim-review.ts` 三处调用与短wrapper/matcher；原COMMON/V6–V12、完整原指令生成器、质量合同、schema、SDK、正式裁决及许可/激活不变。当前v12和无显式质量合同路径发新完整说明；显式旧质量版本继续发原完整串。两恢复入口只精确接受同材料、目的、focus和encoding下的原完整串或确实适用的新完整串，不切除任意后缀，不忽略指令，不重判旧票。

首次六套221项为219通过/2失败，原因是初版也改变了显式旧版本生产串。保留该失败并收窄版本范围，未修改旧v5/v11的固定旧hash/旧串测试。另保留首次缺新说明的RED6、文件编码新夹具配置失败及旧质量误接受新尾段的RED2；新夹具修正未放宽产品验证。

最终原SDK scripted专项32/32，原六套225/225，默认Runtime/Evolution类型与diff检查全部退出0。旧/新真实SDK捕获可零请求冷恢复，近似尾段、额外注入、错误材料/focus/encoding和旧版不适用新尾段均拒绝。保存70份首回执；这些证明传入与恢复机制，0实际provider调用，不能称语义效果已修复。

实现报告：`D:/DevData/tianwen-requirement-boundary-tests-20261007/task21/implementation-report.md`，摘要 `9417db2d7780744e8396dd324b8875ef4531281485356137333ec262e92d2ea0`。

独立审查：同目录 `code-review.md`，specCompliance/codeQuality均PASS，摘要 `75b40fefc879246ae547383cbd8918e46310c0028d65a79cc7c03438212c2e0b`。

生产源码SHA256 `2326dbeec078970b166ab5a80a0df1a4c2d896a24e83f1879c262bf075540e76`；测试源码SHA256 `8494e3fa9253f98d8cc2ffb4010ba479b605e47ef65757d3aca052ad4bd95b9a`。仅两owner文件；容量夹具生成目录改为优先现有D盘测试路径。

下一原公开16步构建/实际入口/零模型历史证明兼容，随后Task22全新空普通Profile的首次真实模型验证。Task22目前只有prepared任务/42宿主夹具与准备审查PASS，无实际Profile或模型；原future三whole对象及每题六条效果标准保持未消费。正式accepted+原生独立首审clear+实际采用后才测后任务效果/无关任务/撤权/cold。不重评Task19/20旧票、不增标准或等待用户。
