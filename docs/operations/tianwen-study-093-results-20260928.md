# E093：新来源和对照进入研究，首臂未作结构化交付而失败关闭

## 结论

全新隔离档用知棱 S1、凌沅 S2 两份准确普通摘要和各自读后持续偏好，另用栖墨 C 作无不利反馈的独立成功对照。三份原任务均为 `summarization/text`、原生双审 `met/met`；两条反馈分别准确关联来源，评估均为 `preference/user-preference`。产品自行选择这两个来源和 C 打开 `user-preference` 研究，并生成候选两句写法。**第一条 `source1/baseline` 试验的执行模型只输出普通文本 JSON，没有调用 `structured_output`；研究以 `invalid-judgment` 停止，正式试验臂 0、无裁决、无激活。** 本档不补臂、不回填 E090；main/Daily 继续 **NO-GO**。

这与 E090 第八臂的交付缺失是同类现象，但不是相同旧材料或研究的重跑。两份原生 Session 都证明模型已收到通过工具提交的明确指令，却只把 JSON 写进文字答案。宿主正确拒绝把看似 JSON 的普通文本当成成功证明。

## 冻结材料与来源资格

运行根目录 `D:/DevData/tianwen-study-093-20260928`；首次调用前冻结 `freeze.json` SHA-256 `4a42adfbe819c72f8674e1e385e9794a41e7507c16e865912c1e1b2afb122129`。源码提交 `c9d1390a7902277c322bb3a13d8e67a3a19b8387` 相对 E092 的 `efe0232` 仅文档变化；复用经核实的运行包 SHA-256 `42f2afc516684c8fb707a1da8f76ed2196ca43fc0b7891b40db1f93eeefa9858`。模型 DeepSeek-V4-Flash / High，`familyVerification: true`，方法激活隔离开启。三份完整普通任务、开场、同意、撤销和停止条件在首次调用前冻结；两条反馈均在看到各自真实答案后分别冻结，文件 SHA-256 `1644301a38b11df865f730ccfa2903c8759c3ed92fe7892f06f1ddd7e53a8846`、`84b913b1ad11a3a7f3c6377ef5a526c1def46d9ac3fcaf795aea1b2bd59ca4ac`。

S1 的 24 项是 15 完成、5 待法务复核未裁决、4 确认安全配置失败；S2 的 29 项是 20 完成、6 待性能复测未裁决、3 确认集成检查失败；C 的 18 项是 12 完成、4 待合规复核未裁决、2 确认负载检查失败。三份答案均保留其他工作和日期状态，没有把待复核当失败或作出无来源预测，实际为单段。S2 在同一会话中已按 S1 的未来偏好写成两句，这是会话内采用偏好的观察，不是方法研究激活后的效果。C 在另一新会话单独提交，之前研究 0；C 双审终态后才自然开研究。

研究 ID `guidance-study:1505d6cd7a99689d362ccf229044fa59fc04e192e84ed5fc7bfbdafdd34ef2f7` 选中的来源 ID 为 `conversation-task:a9d256cffcc2e7960805ae567802c100d984247c96dd30dfa96ba2e90890b027`、`conversation-task:6ea6bf5c0d9a4720b57a7d3f5da3c1f833780ff6054721f9e27b0d57cdcbc081`，对照 ID 为 `conversation-task:c53ade31c9564e569cbb6fc033e6a21c4d6877a2fd7479184847f661a4eb4f3b`。候选方法要求无标题、单段两句，第一句列总数、完成数、确认失败数，第二句列待复核未裁决数、其他进度和日期；也禁止改写状态或新增建议承诺。尚无任何有效试验臂能验证它的执行效果或当前请求优先级。

## 停止点、审计与后续修复

失败子会话 `3dba4b8d-01f0-432f-a29c-f695f266d7ec` 的原生提示明确要求 `{"answer":"..."}` 通过 `structured_output` 提交；实际普通 assistant 文本形似 `{"answer":"本周知棱项目进度摘要：..."}`，`structured_output` 调用数为 0，Session 正常完成。这个失误发生在方法试验执行，不是来源资格、反馈归因或研究对象选择失败。协议要求异常即停，因此没有追加试验、未来任务或人为裁决。

终态审计 `native-use/evidence/audit-final-v2.json` SHA-256 `7588fb69944b370416210d22e2b1e02186139d9ec23c2fa129198cbdf8260d1d`：八条直接输入各出现一次、无额外输入，冻结配置/包哈希一致，23 份原生 Session，任务 6、反馈评估 2、研究 1 且 0 臂并停止；同意 `revision:2 / enabled:false`，宿主已停，`allExpected:true`。原生准入、任务族票和反馈评估证明审计 `audit-proof.json` SHA-256 `c95eae459d58c7e98bedaaf9ea2d56952ccc6df79b08031514abcde5fc24e66d`，`allExpected:true`。第一次审计脚本漏列了预先冻结的 C 输入而报 `allExpected:false`，原文件 `audit-final.json` 保留；只修正审计枚举后产生 v2，未改变冻结材料、输入或账本。

随后在开发分支对新的未来研究做窄修复：试验执行若首次只返回普通文本，原生同一会话注入一次明确的工具提交提醒；仍不调用 `structured_output` 就失败关闭。成功证明必须有唯一有效工具捕获，回读还要验证提醒来源、内容、次数、原始任务与模型配置，不能把第一次普通文本自动解析为答案。测试先红后绿；研究执行和证明相关两组 **125/125**、八包类型检查通过。该代码尚无真实模型前瞻验证，不改变 E093 或 E090 的失败记录。下一轮用全新材料验证工具提交可靠性，之后才可能检查完整研究十臂、独立语义安全、受控激活与后续任务效果。
