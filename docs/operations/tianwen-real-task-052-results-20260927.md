# E052：原生文件证据完整，审核引用缺口导致未通过

**结论：**准确提交 `08cb0499732372ad37af6d92dc7c2770bca2956e` 在全新 E052 隔离配置档执行同一冻结任务。模型自然查看目录、读取三份文件、三次使用 `tianwen_captured_file_facts`，没有调用自由 PowerShell 计数或哈希，也没有写文件。宿主保存了 `glob`、受限目录 `pwsh` 与三条原生事实记录；三份捕获初始内容、终态文件及原生事实的字节数和 SHA-256 均与事前冻结一致，`task-finished.files` 为 `chat`。这首次把本项普通文件查询送进了真实原结果审核，但审核因 `invalid-judgment` 结束，**仍非双审核通过，main/Daily 继续 NO-GO。**

隔离根目录：`D:/DevData/tianwen-acceptance-runs/052-captured-file-facts-guidance/native-use`。冻结清单 SHA-256 `427bfece7dff21a60475155aac2e87f9bb8a4d9a2b5761a72acfb1983dfb64d4`；候选包 SHA-256 `86fa7ba8132a4d48f5a7e96c2a5ffc11fcd26c673e70519ba5182ed5cd0353d1`；安装前后运行时代码 SHA-256 都是 `f306734c448cad86ed48ce1c3dce7b4bbb8907b6cf6a9792587e1dcf16d5d906`。原任务 ID `conversation-task:947a35c24b1254aadd366bc5634af96d555670ac903185715cbd692a6cbffcb5`，原生主会话 `session-2a563be9-8b75-43a4-aafe-3ff7ec7518bf`；工具调用为一次 `glob`、一次目录 `pwsh`、三次 `read` 和三次原生事实查询。账本终态 SHA-256 为 `a702d6e7ece4a36e082d9b589f2cb8ce606400d2da3ecf80b3ef0a749161b345`。六份原生 Session 的只读摘要审计保存在 `evidence/audit-052-native.json`，该文件 SHA-256 为 `db6bf104b04a5881f65170f67db74bb05ccddce0931b4eb529361c592b354628`。同意关闭至 revision 2 / `enabled:false`，隔离 host 正常停止，进程及端口均退出；没有研究或方法激活。

审核缺口经只读解码原生审核会话 `121479f8-953b-4824-ab2c-4d49b5b8a896` 定位：该审核者提交了 `met` 和覆盖 43 个回答单元的审计，但第 `answer-5` 单元（回答中的工作目录路径）被标为 `source-fact/supported`，`sourceIds` 却是空数组。现有校验正确拒绝“已证实的来源事实却无用户或工具来源编号”，因此这一整份审核无效，第二位审核者没有被启动，宿主汇总 `inconclusive / invalid-judgment`。不能把审核者写下的 `met` 当作有效审核，更不能补改它的原生输出。

根因是工作目录已由原生会话头和冻结文件材料核对，但审核证据投影只提供文件内容与文件事实，没有把材料中的 `cwd` 给成可引用的工具来源。下一候选将只把这个已经验证的目录身份投影为明确来源，并让审核员为工作目录断言引用该来源；该来源不能证明当前磁盘文件内容。需要以新提交和新隔离任务前瞻复测，不能回填 E052。

