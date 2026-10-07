# E099：首条真实偏好标准扩写，范围核对误放行，按协议停止

本轮在 `D:/DevData/tianwen-scope-099-20260928` 使用源码 `b64bf69f79aef174af40572edcfd28eecb656340`、DeepSeek-V4-Flash / High、全新隔离 Profile 与任务族独立核对。首次模型调用前冻结两条不同来源、各自读后反馈、独立对照 C、同意与撤销、配置和停止条件；`freeze.json` SHA-256 `7ff1f49044e6df1239f4e5b7fafbd2f0983e42ab4d02037755990684e11aa663`，安装包 SHA-256 `754e5b28f1ca4782ca821d2de0bfa9d9dfe960606e50169557b7f0d8f7dd0dff`。方法激活隔离，main/Daily **NO-GO**。

北桐 S1 普通摘要准确保留 32 项中的 22 项完成、7 项待合规复核且未裁决、3 项确认无障碍测试失败，以及指南、试用、日期状态；答案为一段，无建议、预测或催促。产品准入为 `summarization/text`，两份原生复核均 `met`。随后按冻结文本发送读后反馈，主回复只说“收到”，准入准确关联 S1 为 `conversation/preference`。独立反馈评估为 `preference/user-preference`，原生 Session `bd84b103-82e7-45a1-b4e0-a1eafc0c8ff6`；独立范围核对原生 Session `f8d2a4ef-3ab8-42b6-9de6-ba23dfa9fff8`。

评估第一条未来标准写成“no title, heading, **bullet list, divider or addendum**”，而用户直接反馈只要求以后同类摘要“无标题、恰好两个完整句子”。“无标题”不能推出永远禁用项目符号、分隔线或附言；两个句子也不决定它们的呈现方式。范围核对把整条判为 `continuing`，引文仅是“以后为我写同类项目进度摘要时，请长期保持无标题、恰好两个完整句子”，没有支持新增限制。其余四条标准对应直接反馈；“北桐旧稿不重写、本条只回复收到”未混入未来标准。本轮发现的是**持续标准内容扩写且独立核对误放行**，不是一次性要求误收的前瞻通过实例。按冻结的有效性条件，S2 与 C 均未发送，研究 0、激活 0、后续任务 0；不删除错误标准后继续凑来源。

终态审计 `native-use/evidence/audit-final.json` SHA-256 `89702d13cef5d8e49b745ef6c600ee3b0e611e0fe2329b740430c21390bbe6f1`：五条直接输入各一次、无额外输入，冻结文件与安装包哈希匹配、10 份原生 Session、`stopProtocolMatched:true` 且 `semanticGatePassed:false`。原生工具捕获审计 `native-use/evidence/audit-proof.json` SHA-256 `4e7f6d303c8a325f1ea17f88698a8860089d1ed1aa47183a473b610bccd9609b`，`allExpected:true` 仅表示准入、复核、评估和范围工具证明可回读。学习同意终态 `revision:2 / enabled:false`，宿主已停止。

原因定位：原评估说明没有明确禁止增加看似兼容的格式限制；范围核对只判断能否长期适用，代码只验证引文出现在原话中，未要求它支持标准的**全部内容**。开发分支随后窄化两段模型判断说明：初评不得增加未陈述或非必然推出的输出限制；范围核对只有整条限制均获原话支持才判 `continuing`，任一扩写标 `unclear`，整份不能新入研究。测试先红后绿，反馈与研究相关三组 **187/187**，八包 TypeScript 直接构建与差异检查通过。常规检查包装器在启动编译前触发 pnpm 模块清理，因非交互终端而退出；本轮未让它重装依赖，改为调用现有本地 TypeScript 编译器执行同一组八包构建。这个工程修正尚无新真实模型前瞻证据，E099 原账本保持不改。
