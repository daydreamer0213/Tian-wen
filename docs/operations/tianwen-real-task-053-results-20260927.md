# E053：原生文件事实可用，但回答出错且首份审核无效

**结论：**准确提交 `83eee14ce5f080379916cbc2266fa1c038b76160` 在全新 E053 隔离配置档执行与 E050–E052 相同的冻结任务。模型自然列目录、读取三份 TypeScript 文件，再分别调用 `tianwen_captured_file_facts`；没有自由 PowerShell 计数或哈希，也没有写入工具调用。三份输入及任务文本的终态字节数、SHA-256 与冻结值相同，宿主保存了五条原生辅助事实，`task-finished.files` 为 `chat`。然而回答错误地宣称 CRLF 换行会使本工具的行数比编辑器少 1；给出的公式按 LF 分割时，CRLF 与 LF 的行数相同。首位审核者准确指出这一矛盾并试图提交 `not-met / source-fidelity`，但其第 `answer-50` 单元把“未创建、修改或删除文件”标成 `source-fact/supported`，`sourceIds` 为空。宿主按规则拒绝整份审核，第二位审核者未启动；最终仍是 `inconclusive / invalid-judgment`，**不能算双审核通过，main/Daily 继续 NO-GO。**

隔离根目录：`D:/DevData/tianwen-acceptance-runs/053-captured-file-facts-root-source/native-use`。冻结清单 SHA-256 `275f474db75a655b234e7223f601b2ef484dde93596f78c375fa87a1d320ef4b`；候选包 SHA-256 `56b52cc86788a6a1db2adb5dc4c7a28fd16281117b9a85753a9dfa44dc7383ad`；安装运行时代码 SHA-256 `816fc8a05d98a262f4ab79c813c4d21141896b0a51e2ee74178e551bad42ed60`。原任务 ID `conversation-task:3c902681da17ade017896b77ed05caf83ac5674f1d99112d932cf1dba48a3ef7`，主会话 `session-a3995c4e-88ab-476b-a3dc-f829f11a3186`，首位审核会话 `baa40fa1-8cac-4b68-8709-e2077d588a2e`。六份原生 Session 的只读摘要及七处首审发现保存在 `evidence/audit-053-native.json`，SHA-256 `f33f2acb8f8f1564584aaf73fdcdfff3f6532308a544663bf9f001855a185c56`。关闭同意后配置档为 revision 2 / `enabled:false`；隔离 host 正常停止，进程与端口已退出。账本终态 SHA-256 `15f79ce5e66266d512e638c543b1d044e317cf721d82e8f0b0304e1342967114`。

这轮证明 E052 缺失的工作目录来源已可被引用：首审的工作目录断言引用了 `tool-1`，不再在那里失效。但首审的最后一个“无写入”断言没有可引用来源，仍触发严格校验。更重要的是，即使该审核格式有效，原回答也因 CRLF 错误不能通过。下一步应让审核员对每个 `supported` 的来源事实明确引用来源；若现有冻结证据不能证明一项自述，则标成 `unsupported` 或 `uncertain`，不能用空来源放行。同时保留本轮回答错误为真实失败样本，不能通过放松审核规则改写为成功。下一候选必须在新的隔离配置档前瞻复测。

后续候选只在当前 v6 质量协议的审核提示中补充上述来源填写规则；历史 v5 提示保持逐字不变，避免重播时改写旧规则。先见到定向测试失败，再修正提示；受影响的两组定向测试 **55/55**、完整会话回归 **582/582** 与运行时包构建均通过。这是本地候选验证，不能追认 E053 的审核结果。
