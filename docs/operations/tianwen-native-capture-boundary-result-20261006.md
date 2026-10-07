# 原生捕获诊断与答案边界修复

## 原因与实现

实际旧 future1 评审把 inference/supported 非法字段组合提交成功，后置校验才失败；实际 study054c 的正文事实正确，却把协议尾标签 `</answer>` 当成交付内容，原检查拒绝。两项均不重判：只让将来的评审在捕获前收到精确诊断，以及让将来的答案工具明确字面交付边界。

claim-review 仅新增四行，拒绝原已有六种非法组合，模型须自己按原证据纠正，最终事实/判定检查保留。trial schema.answer 仅补说明，原 trialInstruction 字节不变。用户要求 XML/HTML 时仍正常交付；任何实际返回或历史恢复答案都不自动删标签，不改协议、门槛或账本。

## 工程与历史读取

证据 `D:/DevData/tianwen-native-capture-boundary-engineering-20261006`。

- 实际 RED93 项：80通过、13失败；Task1 GREEN93通过。十二种首次/附加 claim 错误在原 Session 自行纠正；未纠正时不能形成成功双审，同行取消/排空和零新增调用恢复均核实。
- 首扩展组168项有五失败，保存原输出。只读旧源码基线确认三项 quote enum 期望早已落后于现有 examples 实现，另两项并行负例因提前拒绝而需要真实未修正路径。只更新测试；合法非提示样例引用原样通过，跨单元引用仍被原 host 拒绝。不恢复过度枚举限制或放宽任意异常。
- 最终十三相关源码套件169/169；Task2原 trial/recovery 等47/47（新增请求XML、字面尾标签、错误尾标签不清洗），两组不重叠，共216。打包核心三套件150/150、余十一相关套件66/66，两组不重叠共216；没有跳过项。相同源码/打包测试不是不同功能数，不把两种形式相加。
- 原 Runtime十五构建命令全部0、私有导入检查无违规、差异空白检查0。限定四文件复查无新P1/P2；两追加测试文件另增量复查。
- 原 study054c 实际 adjacent candidate proof 由原 CLI和原 JSONL 后端读取，CLI0/零模型；原输出、尾标签、执行/材料/配置/方法摘要绑定，以及两个旧账本逐字保持。旧不合格标签保留，不是新评分。初两次只读CLI操作员错误（未用ctx.get访问服务、误把case materialDigest当原worker请求摘要）原失败文件保留，修正操作器后成功，不改产品源码来绕过。

## 下一项独立执行

`D:/DevData/tianwen-native-capture-learning-20261006` 使用新来源记录，只产生未消费的来源组合，复用原实际 met 摘要作正常对照；旧六Task/一study/一attempt/账本前缀及旧共享九Task/八study/九attempt逐字保护。原 saved future baseline 的未知/pass 到新 pass/pass只能分别记消除未知/保持。

另冻结未被用于学习的新请求与明确模拟错误，仅用原独立双审确认错误，不入题或给提案读取；实际原接受/自动激活后，同一请求作为普通新任务走实际模型与原方法注入。其改善只称这项模拟错误被解决，不称自然基线或总体能力提升。接受后继续实际未用任务、语义检查、原consent撤回/无注入、零调用冷恢复及终态审计。失败则保留原证据并自主定位，不等待用户出题，不新增发布条件。

完整目标 active；main/Daily NO-GO/R9保留。D约16.7GiB，高于15底线，未达20偏好；未复制依赖、环境或全量旧账本，测试自有目录按原cleanup清理。

## d6fbbc8a 实际前瞻结果

操作器初稿复查发现原验证函数误从 claim 模块导入，执行前修到原 judgment 公共导出；初只读预检保留，没有模型或Task变化。learning-r2 原预检0，正式因操作员未给直接原生双审调用声明 subagents 服务而在模型前停止：0actual/0scripted、旧六Task/一study/一attempt不变、CLI1/normal drain/active0，独立final-audit0。不重跑旧交付，使用新nonce、原服务声明在learning-r3接续。

learning-r3 原预检0/零模型/零账本改变；正式44actual/1明确模拟历史主答。另一个故意错误的未来稿由原双审判not-met，记录明确模拟且不入学习来源。新Task df67806c…原summarization/not-met/source-fidelity；新study0f5527eb…使用旧3ec61946与新df67806c，两source1臂met/met，后续source2 baseline grounding子Session1ad3644d在两次JSON尾字符错误后反复提交 `{arguments:string}` 包装对象，SDK只提示value.arguments未声明/缺五字段，模型误解为需要外壳，最终invalid-judgment停止。不是完整候选被实际语义拒绝，不能从不完整研究称方法有效或无效；未裁决、未启用、无后任务/撤回/冷恢复。

正式CLI1/normal drain/consent enabled1/active0；独立final-audit0核147冻结文件、旧六Task/一study/一attempt/prefix及共享9/8/9/账本逐字保持。当前七Task/两study/两attempt。新增单wrapper精确诊断计划 `2026-10-06-tianwen-flat-capture-wrapper-plan.md`：仅原schema不允许的包装，模型自行修正，不解包/代判；保留原invalid记录/消费对，接续剩余未尝试组合及未执行桥单来源。未来错误的原native双审proof原样复用，零新增评分调用。
