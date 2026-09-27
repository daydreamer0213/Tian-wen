# E065：研究提前使用反馈轮作对照；本轮停止且不算完整链路验收

**结论：main/Daily NO-GO。**全新隔离档的两个不同摘要都被准入为 `summarization/text`，读后反馈各自准确关联原摘要，并各自产生 `preference / user-preference` 评估。产品随后自行打开一项研究，但把第一条**反馈的回复轮**选为“成功对照”，不是后来发送的独立对照摘要。第二条来源摘要的终态双审为 `not-met / source-fidelity`；独立对照摘要的终态为 `inconclusive / invalid-judgment`。操作者还在第二条摘要审核落账前就发送了反馈，违反本轮预先冻结的顺序。因此研究打开只能当作缺陷诊断，不能算合格的两来源一对照试验；没有方法激活，冻结未来任务 F 未发送。研究在关闭自动分析时以 `cancelled` 停止。

运行目录为 `D:/DevData/tianwen-acceptance-runs/065-learning-chain-prospective`。试验从准确提交 `18dc6e9c36ddc6f37c0e23ab8bc11332eca1e096` 和既有运行时提交 `4e52733330c7bba344194cd1d8091ac93e0ebe66` 的包启动；包 SHA-256 `ee01e31d64be3ad7c49fe8750aacb64e2e051def1b5aa734379a66095eb7e9ae`。协议、S1/S2/C/F 及两条拟发反馈、隔离配置在首次模型调用前冻结，`freeze.json` SHA-256 `aa362afa61414e6094ccbf26c1d0e5317dd1570a8310b135a393d60be26b5e6d`。S1、S2、C 和两条反馈的原生准入请求均与冻结文本去掉末尾换行后逐字一致；F 在准入材料中出现零次。控制材料和生成数据都放在 D:。

S1（E059/E060 摘要，`conversation-task:eaa00f6dac828dfd069f2ddfdc7ff973d787d199852c35e5b69915a3b1090991`）双审 `met/met`。实际回答按 E059、E060、结论顺序组织；操作者读后按冻结原话提出今后先说结论与风险的偏好。反馈准入准确关联 S1，反馈评估给出 `preference / user-preference` 和未来同类摘要的顺序标准。不过该反馈轮本身被准入为 `kind:task`、`family:summarization`，并获普通任务 `met`；这正是后来被误选为对照的轮次 `conversation-task:a4e0186347bcc5bbcd099b0421daea96a2fa81a58971d645dae3d72708c660a2`。

S2（E063/E064 摘要，`conversation-task:f10b7fe7caa9732a765d2cbd17a04b3cd4eb67ff71a1568e97ca8a18b89ee684`）读后反馈也准确关联原任务并形成 `preference / user-preference` 评估，但普通审核稍后双双判 `not-met / source-fidelity`。两位审核者主要反对答案结尾的“约 160 字、未读写文件或运行工具”自述，认为字数估计不可靠，且空工具证据不能直接证明否定式自述；正文项目事实则获承认。独立 C（E057/E058 摘要，`conversation-task:173e6369db8872406e50f2099cdf016f559ef06f8684856de9d5dcbfc9d6d94f`）最终是 `inconclusive / invalid-judgment`。研究在 C 最终审核前已于 `2026-09-27T03:23:14Z` 打开，`study-opened` 明列来源 S1/S2，`counterexampleTaskId` 却指向 S1 的反馈轮；随后有一份候选及一项试验臂记录，但无完整裁决。

选择器根因：`conversation-guidance-loop.ts` 的研究扫描按同任务族、同版本、`met` 且无不利反馈寻找对照，没有排除准入决定中 `feedback` 非空的轮次。S1 反馈轮符合这些表面条件，便在真正 C 审核完成前被选中。本轮之后的工程修复让研究来源与对照候选只接纳无内嵌反馈的普通任务；它不改变 E065 旧记录。另有操作者顺序偏差：未等 S2 双审终态即发反馈，这不是产品自动化的成功证明，后续前瞻试验必须严格等待终态。

工程验证先用定向用例复现误选（期望 `awaiting-counterexample`，旧代码实际给出 `ready-to-schedule`），最小筛选修复后该用例通过；研究循环测试文件 95/95、对话相关 22 组 592/592 通过，八个包的类型检查通过。此验证只支持修复候选，不是新真实模型验收。

只读审计覆盖 27 份原生 Session，29 次工具调用中 27 次为结构化模型提交、2 次为同意开关，隔离输入目录终态为空。原生摘要 `native-use/evidence/audit-065-native.json` SHA-256 `e4f884a689180f0ab7554fc1cf0268458fe2f1066ab0906e69580c1e4d5bf48a`；准入材料 `native-use/evidence/admission-material-065.jsonl` SHA-256 `4eef72f24e2f8bb62a8fd5a199488a32cf073d5b367c1dc180a60d0f7f47109e`；终态账本 SHA-256 `29622558d745b0c55a6c570f4329c05968e26c28a9b7417ebc9acc44d7216073`。隔离档自动分析从 revision 1 / `enabled:true` 关闭到 revision 2 / `enabled:false`，host PID 12416 已停止，浏览器页已关闭。旧 S1/S2/C 审核与已保存的反馈评估不重判。

下一步从修复后的准确运行时包和全新隔离档重新做前瞻试验。先证明带反馈的轮次不会被选作来源或对照，同时等待每个普通任务的最终双审；只有真实独立对照 `met`、研究试验答案语义合格、最终采用并激活后，才允许发送一次冻结未来任务。E065 的被取消研究不能补齐后续门槛。
