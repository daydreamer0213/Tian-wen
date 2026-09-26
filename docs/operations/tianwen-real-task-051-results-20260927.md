# E051：准入已修正，额外 PowerShell 调用再次关闭证据链

**结论：**准确提交 `235dda2b55fe41b0f431ae5e774a38c69d89c2b0` 在新的 E051 隔离配置档执行与 E050 相同的冻结任务和三份输入。准入正确判为 `local-files/chat`，模型自然调用三次 `tianwen_captured_file_facts` 并得到与输入哈希一致的行数、字节数和 SHA-256。这验证了 E050 的准入修正。模型随后因误以为 `read` 显示行号与事实工具有差异，又运行了额外的 PowerShell 计数、哈希和文件尾部检查。此类自由脚本没有可认证的文件事实凭据，宿主记录 `material-unavailable` 并以 `inconclusive` 关闭原结果审核，**没有启动两位审核者**。E051 仍未通过产品链路；main/Daily 继续 NO-GO。

隔离根目录为 `D:/DevData/tianwen-acceptance-runs/051-captured-file-facts-admission/native-use`。事前冻结清单 SHA-256 为 `5705df43ea52cdff07bb41a4431897bfef908b5ab920cda7e83eee27f4026970`，三份输入分别为 954、15,809、21,239 字节；终态哈希均与冻结一致。候选包 SHA-256 为 `4c4078a016dd054f061f6f02bca105a16b869c2bdf3d49bebac40626a53b1f6b`，安装后运行时代码与打包前同为 `221b70a3da78a3c7de64dd21e81dba322ca3e3f48011fc0f0ab6cc84e64c37b8`。任务 ID 为 `conversation-task:ac504d3c44b598aab6b623e2a286060e452027041d16dd4e06d0dca9ce606a44`。账本终态 SHA-256 为 `20de8f3ea8a40c4a0ee7695fe6b7f1f655398bf2cad6cf0ee7a01efda57ec3cc`；没有研究或方法激活记录。同意在清理会话关闭至 revision 2 / `enabled:false`，隔离 host 正常停止，进程与端口均退出。

模型最终回答的数字与冻结输入一致，却把单个换行符文件错误说成 0 行；实际 `capturedFileFacts()` 对 `"\\n"` 返回 1 行。这里同时暴露两种风险：工具选用超出可审计范围，以及正确数字旁附带错误的边界解释。下一候选仅收紧原生工具说明，明确其返回值已经是可信查询结果、PowerShell 再核验不能进入文件证据链，并给出行数口径的三个最小例子；必须重新前瞻验收，不补判 E051。
