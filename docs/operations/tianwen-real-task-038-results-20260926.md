# E038 真实项目排查任务：反馈评估成立，完整学习链路未成立

**结论：**在全新隔离的天问桌面配置档中，真实 DeepSeek-V4-Flash / High 完成了一次实际项目故障排查，收到同会话的一次事实纠正；产品将该纠正独立评为 `attributable-problem / verification`，原生证明可恢复。这是“任务 → 反馈评估”两段的实证，不是“研究 → 方法采用 → 未来任务改善”的实证。首答结果复核为 `inconclusive`，研究与方法激活均为零；main/Daily 继续 **NO-GO**。

本轮沿用 E037 已打包并逐文件核对的准确候选 `7064967af0d82c9583b5f4d15964891e7bd49ed0`，归档 SHA-256 `adcbb7e801deaf5500b54223b14bc73b96a01049f37508bc0d514d3b38d18346`；当前分支此后只改文档，产品包与测试源码未变。E038 新配置档起始账本为空。第一次模型调用前冻结三份实际材料、一个项目排查请求、模型、反馈规则和停止条件，见 `D:/DevData/tianwen-acceptance-control/038-real-task/pre-input-freeze.json` 与 `requests-038.json`。工作材料是 E037 的 17 条账本副本以及 `conversation-observer.ts`、`learning-consent-agent.ts` 两份源码副本。任务要求实际读取文件、说明 E037 关学习后两条取消复核能证明什么，并只给一个后续核验；没有要求改文件。

主会话实际调用 `pwsh`、`glob`、`read` 读取材料，任务只提交一次。首答正确列出两条复核的 `proof:null` 和 `unavailableReason:cancelled`，但把账本中的 `task-review-started` 扩大为模型请求已发出，又建议复查同一账本以证明关闭后没有新的模型请求。按输入前规则，控制者看过首答后只发一次针对这两处的事实纠正，没有重做任务。天问随后在同一会话把“关闭后有无新模型请求”改为未证明，并指出需要原生子会话或请求时间记录。

产品账本有 27 条记录、三条任务。原排查任务的材料与模型配置可从原生会话恢复，结果复核有证明但结论为 `inconclusive`；账本还记录一项 `task-file-evidence-unavailable / material-unavailable`，不能据此称文件证据链完整。事实纠正作为下一条任务，其结果复核同样 `inconclusive`，原因 `invalid-judgment`。另有关闭学习的管理会话任务，取消复核的 `proof` 为 null。只有一条反馈评估，针对原排查任务，分类 `attributable-problem`、类别 `verification`、`proof` 非空，三条未来核验标准与纠正内容对应；使用冻结源码编译的恢复函数对原生子会话重新验证通过。没有研究或方法激活。学习同意最终为关闭、修订号 2，自有 host 已停止。

只读审计核对了冻结输入与安装文件哈希、主会话的一次请求和一次反馈、九份原生会话导出、模型配置、反馈结构化证明及账本在审计期间未漂移，结果为 `completed`：`D:/DevData/tianwen-acceptance-runs/038-real-task/native-use/evidence/audit-038-final.json`。测试环境与原生导出同在 `D:/DevData/tianwen-acceptance-runs/038-real-task/native-use/`。这是控制者在真实项目材料上使用产品的受控任务；它证明产品能接住这次明确纠正，不能代替外部用户的长期工作反馈，也不能把模型自己修正一句话算作方法已经学会。

对 E037 问题的独立后续核验也已完成：关闭同意的账本时间是 `2026-09-26T11:41:46.001Z`；三份已导出的原生分析子会话各有一条 `request/header`，时间分别为 `11:41:16.238Z`、`11:41:26.610Z`、`11:41:41.875Z`，均早于关闭。关闭后两条 `task-reviewed` 为取消收尾，均无证明。在**这四份保存的原生会话导出**里，没有关闭后新建的分析子会话请求头；这不等于网络层保证绝无未持久化的请求，也不能由账本启动记录单独推出请求已发送。只读补充收据：`D:/DevData/tianwen-acceptance-runs/037-readiness/native-use/evidence/request-time-addendum-038.json`。

下一阶段先把普通文件读取任务的文件证据缺失和原任务 `inconclusive` 拆开定位，明确是观察覆盖、材料恢复还是语义复核问题；只做能由现有原生记录支持的最小修复和新的前瞻验收。然后让真实相容的项目任务与自然反馈逐步积累，分别验收来源资格、研究试验答案、采用决定和采用后一次未来任务。已有 E038 反馈不能拿来补写第二条同族支持或成功对照。发布前仍须解决已知事实来源误放行；隔离测试与状态可见性不构成 Daily 上线依据。
