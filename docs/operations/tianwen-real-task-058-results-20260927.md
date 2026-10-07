# E058：文件执行证据进入真实审核，摘要长度使双审失效

**结论：NO-GO。**准确提交 `1c0a3c576d9d6f01ffe79338650e087d4b91ffc6` 在全新隔离配置档运行一次前瞻维护交接任务。主模型首次准入为 `local-files / chat`，实际执行一条经认证的只读 PowerShell 目录命令、一次 `glob` 和两次 `read`，随后在聊天中解释两份源码的审核链路。冻结输入没有改动；新增的执行证据确实作为审核来源进入两位独立审核者的材料。两位审核者最终都提交 `met` 与完整 24 单元审计，但宿主最终为 `inconclusive / invalid-judgment`，不得把本轮说成结果审核通过，更不得提升 main/Daily。

隔离根目录：`D:/DevData/tianwen-acceptance-runs/058-file-action-review/native-use`。任务文本 532 字节，SHA-256 `21dec1fe2cf62c88003d95cdc4d229ef2be16bfa85bd878ef29b5dcbe74afdd9`。冻结的 `conversation-task-material.ts` 为 17,299 字节、SHA-256 `463bc43985a7e831ce49030375372a1769e68dd5a8a6f6ce66984008c5f2d605`；`conversation-claim-review.ts` 为 28,277 字节、SHA-256 `fc6273bbac3f0481f3cd4cd5644469940e9c14048e188022d1a3b07786e594de`。终态文件与任务文本均逐字节匹配冻结值。产品包 SHA-256 `291a0ecf2efa940a1efc56cc526f56a638442d803d8f61dca4acf567fb03d84d`；安装运行时与打包前 `runtime.js` 同为 `4cacf041033f82fad5f7fdcf5771f0d0fdf944d1506f7e53dad3accdbb0a610d`。

任务 ID `conversation-task:0ebcadbe5249e457687756027f6be9bc92ed63d0b9da8ebae7b5b08732e2e530`。两份审核材料里的 `tool-585` 列出 `pwsh (certified read-only directory), glob, read, read`；`tool-586` 限定地证明本捕获任务没有 `write/edit` 工具调用且两份输入在捕获边界与初始字节一致；`tool-587` 到 `tool-593` 给出经认证的目录命令与未截断输出，其中两个文件名和目录 `Length` 为 28,277 与 17,299。第一位审核者的解释明确引用这些来源，第二位也引用 `tool-585`、`tool-586` 等。说明 E057 缺少的正面执行证据已在新的真实任务中到达审核者；这仍不等于审阅判断本身可靠。

第一位审核者在原生 `structured_output` 首次提交时，`answer-24` 引文未逐字落在对应回答单元，宿主正确拒绝；第二次完整审计的逐条引用与来源编号通过离线宿主函数复核，但它的 `explanation` 为 **1,990 UTF-8 字节**，超过 `parseConversationReviewChecks` 允许的 **1,920 字节**。第二位审核者提交的解释为 1,285 字节，逐条审计也通过相同离线校验。宿主要求两位结果都满足保存约束，因而最终记录 `invalid-judgment`，没有保存双审证明。两个审核者的 `met` 是模型原生输出，不是产品接受结论；历史 E058 不回填、不重判。

主答另有内容边界：它把 `capturedInputsUnchanged: true` 描述为“写死字面量”，但该值只在 `recoverFiles` 成功核对任务 span、辅助凭据与聊天模式输入/终态相等后才被构造；若仅凭这一行说没有运行时复核，会遗漏前置保障。两位审核者均未指出这个潜在误读。后续应独立改善审核内容判断，不应把长度门槛修复包装成答案正确性的证明。

七份原生 Session 的只读摘要为 `evidence/audit-058-native.json`，SHA-256 `117b65c7c9515fed71fcc8b740767301abd8593f4fbb40eb2c539a7d343dab5e`；终态账本 SHA-256 `319e7674a8bec6a0dda7d176cbe015da95c213239f15869d50b7eac71155b2a1`。自动分析已关闭至 revision 2 / `enabled:false`；host PID 1152 和端口 61985 均已退出，临时浏览器页已关闭。研究为零。下一阶段先处理审核摘要超出保存长度的前瞻性容错，同时保留原生完整审核文本和严格逐条引用；然后用新任务验证，不重跑 E058 挑结果。main/Daily 继续 **NO-GO**。
