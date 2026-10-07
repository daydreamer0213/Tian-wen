# E054：模型额外执行自由 PowerShell，审核提示修正未得到实测

**结论：**准确提交 `c65490eb845f324aec7a96b3307f561e48392e54` 在新的 E054 隔离配置档执行与 E053 相同的冻结任务和三份输入。准入仍为 `local-files/chat`。模型先列目录、读取三份文件并调用三次 `tianwen_captured_file_facts`，随后又执行一次 `grep` 和自由 PowerShell，对磁盘文件重新计算字节数、行数和哈希。宿主按既定规则记录 `task-file-evidence-unavailable / material-unavailable`，原结果以 `inconclusive / file-evidence-unavailable` 结束，没有启动两位审核者。因此本轮**没有检验到新审核提示的真实模型效果，更没有通过产品验收；main/Daily 继续 NO-GO。**

隔离根目录：`D:/DevData/tianwen-acceptance-runs/054-review-self-action-source/native-use`。冻结清单 SHA-256 `2a2cadcf58d63948fc0e671cfa24aa01ad2c9552f45dac9451b0925bfc6d7c2a`；任务文本 SHA-256 `b97ab8a83ad67187e84db880c71bf64d248989e044a2a4992f1067540d2a641f`，与 E053 相同；三份源文件的字节数及哈希也与冻结值相同。候选包 SHA-256 `05c266c98bee9cb533ef1a4b81e5af5b32d55edab697cf2775d517bae270f51f`，安装运行时代码 SHA-256 `945c30b676b4e6e07bacf0ae342701b5de26dfb7f6c7b3dda2ac0c7a56fdd2e3`，与打包前一致。原任务 ID `conversation-task:84e449c79c825b006940a53133cc015933c423d8cee4479419ec2dd189b9ea05`，主会话 `session-dbe67888-d447-4538-baaa-4683c9987f3b`；原生调用次序及五份 Session 摘要保存在 `evidence/audit-054-native.json`，该文件 SHA-256 `9a33b6e0ec4a29782eb02f60c869f8a96ed6c0c3762612b4cb9df1cbde5cdf71`。

测试后自动分析关闭至 revision 2 / `enabled:false`，隔离 host 正常停止，进程与端口均退出。账本终态 SHA-256 `e91b96c1afca383d66f67fa2c7d72c6251cd112874193a1ca2a1a0d44f73af75`。本轮没有研究或方法激活，也不补判原任务。

下一步要解决的是任务执行边界：原生事实工具已提供所需数字，模型仍可能自行转向自由脚本，使证据链中断。应先调查能否在这类已准入的只读文件任务中阻止不受支持的计数/哈希 PowerShell 调用，并让模型获得清晰的受限反馈；不能仅靠文字提醒，也不能把自由脚本结果当作可认证来源。实现与回归通过后再用全新隔离配置档复测。
