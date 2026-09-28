# E095：引文准确，但反馈类别与未来标准自相矛盾而停止

## 结论

新隔离档的泽汀普通摘要准确保留 28 项中 19 项完成、6 项待隐私复核未裁决、3 项已确认端到端测试失败，以及培训、试行和日期状态；任务族为 `summarization/text`，双审 `met/met`。读后冻结的持续写法反馈正确关联原任务，准入为 `conversation/preference`，主回复简短确认。**独立评估通过 `structured_output` 提交了逐字准确的原话片段，却将明确的未来同类偏好判为 `requirement-change`，同时填写只允许持续偏好使用的四项未来标准。**这份结构与分类自相矛盾，宿主以 `invalid-judgment / inconclusive` 失败关闭，无证明。按协议未发送 S2 或 C，研究、激活和后续任务均为零；main/Daily 继续 **NO-GO**。

## 冻结、运行与失败原因

运行根目录为 `D:/DevData/tianwen-study-095-20260928`；源码提交 `65f138fb55a280017e415e9597b34aef7098ae9c`，首次模型调用前最终 `freeze.json` SHA-256 `ebc0b48ed2bd2ec5fb95c25d77ff14f6b469cf9fb632bf2d8f60daa746d1e4b8`，正式安装包 `tianwen-runtime-bundle-0.1.24-e095.tgz` SHA-256 `4a4dd0fa52a9e15bb578127364fc4c7d0acad9d352d05dd90d04b5e7d0911509`。启动前的一次打包检查发现未更新集成运行文件，旧包从未启动；保留 `freeze-preflight-unlaunched.json` 作过程记录，重新编译、打包、安装且核实新提示实际包含在包内后才写最终冻结并调用模型。模型为 DeepSeek-V4-Flash / High，任务族独立核对开启，方法激活保持隔离。

泽汀答案准确且为单段。看过答案和原生双审终态后，另行冻结反馈，`feedback1-freeze.json` SHA-256 `849f4bc73d8de9918236f02da2cae6025ab8adf5c12be255fca4880215e1d01c`。原话以“今后为我写同类进度摘要”开头，规定以后两句、无标题、两句各写哪些数量和状态，并明确“泽汀这份旧摘要不用修改，只答‘收到’”。准入将它关联到泽汀原任务并标为 `preference/user-preference`。

独立评估子会话 `fe3e5c68-ba9b-46b4-9428-3dca6ecc399d` 确实使用 `structured_output`，四条 `evidenceQuotes` 均能在反馈原文中逐字找到。因此 E094 的**引文多字现象在这条新样本里没有复现**，但不能据此宣称提示稳定奏效。模型解释中承认“今后”与旧稿不改，却错误地把它叫作 `requirement-change`；还为这个类别填写四条 `supplementalCriteria`。现有规则要求 `requirement-change` 不带未来标准，这份结果必须拒绝；不能事后把类别改为 `preference` 或保留标准当作有效归因。E093 的研究试验一次提交提醒仍未进入真实模型验证。

终态审计 `native-use/evidence/audit-final.json` SHA-256 `b6cc6ef7d63514530e5a885b1aecbfae1f1dd2ccb215935e57066bac6180e926`：五条直接输入各一次且无额外输入，冻结和安装哈希一致，9 份原生 Session、研究 0、反馈评估 1 条无效；同意 `revision:2 / enabled:false`，宿主已停。审计的 `allExpected:true` 只表示实际失败停止符合预先规则，不是链路成功。

下一步先在工程层处理“未来偏好被判需求变更且结构矛盾”的独立评估失效，同时保留原生第一票和失败关闭，不能自动改写既有证明。任何修复须测试先行，并用全新材料前瞻验证。通过反馈门之后，才顺序核对第二来源、独立成功对照、十臂研究、语义安全、受控激活和后续任务效果。
