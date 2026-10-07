# E037 学习就绪状态：独立桌面验收结果

结论：**产品里的只读状态在本轮规定的两种条件下如实返回；完整学习链路和日常交付仍是 NO-GO。** 从提交 `7064967af0d82c9583b5f4d15964891e7bd49ed0` 重新构建、打包并逐文件核对安装后，在全新独立配置档用 DeepSeek-V4-Flash / High 打开首个桌面 host。状态工具的四次原生返回依次为：

| 条件 | `currentSession.naturalConversation.guidanceReadiness.state` | 同意状态 |
| --- | --- | --- |
| 首次读取，未开启学习 | `analysis-disabled` | `false`，修订号 0 |
| 明确开启后的工具读取 | `awaiting-compatible-sources` | `true`，修订号 1 |
| 再次只读查询 | `awaiting-compatible-sources` | `true`，修订号 1 |
| 明确关闭后的工具读取 | `analysis-disabled` | `false`，修订号 2 |

四次均是主会话实际调用 `tianwen_learning_status` 的原始返回，并非仅由模型回答推定。两次开关由 `tianwen_learning_consent` 执行。输入顺序、完整请求和脚本哈希在第一次模型调用前冻结，位于 `D:/DevData/tianwen-acceptance-control/037-readiness/pre-input-freeze.json` 和 `requests-037.json`。候选归档 SHA-256 为 `adcbb7e801deaf5500b54223b14bc73b96a01049f37508bc0d514d3b38d18346`，安装文件与候选逐项一致。

原生会话只读导出审计为 `completed`：四份会话导出中，主会话六次相关工具调用及其结果完整，固定的四条用户请求均在原生记录中；状态返回的开启/关闭顺序与界面一致。账本最终 17 条记录，包括两次同意状态记录、两条对话任务的开始/完成及复核记录；没有研究记录、方法激活或已记录的学习分析。第二条状态快照曾显示一条任务待完成，关闭时一条评审为 `unavailable`，说明测试对话本身也可能进入观察计数，不能用这些计数宣称学习成效。原生审计收据在 `D:/DevData/tianwen-acceptance-runs/037-readiness/native-use/evidence/native-audit-v2.json`；包、配置、host 和原生导出收据在同目录及其候选目录。学习已关闭，自有 host 已正常停止。

本轮只覆盖“未开启”和“开启但没有相容来源”两种状态。`awaiting-counterexample`、`already-studied` 和 `ready-to-schedule` 仍只通过工程测试，没有本轮桌面实证。即使以后读到 `ready-to-schedule`，它也只是证据选择结果，不等于研究打开、方法获准或未来任务改善。下一步应在新的来源明确、原任务与后续反馈相容的自然任务上，按输入前规则验证来源准入、研究裁决、实际采用及采用后的新任务；来源事实复核的已知漏判也必须单独达标。main/Daily 继续 NO-GO。
