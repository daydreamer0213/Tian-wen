# E055：调用前文件复查可用，模型仍转向自由脚本

**结论：**准确提交 `eed80662ea43d942ebdb276720613f606604bdf7` 在全新 E055 隔离配置档执行与 E053/E054 相同的冻结任务和三份源文件。候选将 `tianwen_captured_file_facts` 改为返回数字前重新读取当前文件、核对捕获内容，并在工具说明中明确任务结束还会复查、CRLF 与 LF 的行数口径和自由 PowerShell 的证据后果。工程检查先红后绿，文件链路 **81/81**、完整会话回归 **583/583**、运行时包构建通过。真实模型仍在三次原生事实查询后调用自由 PowerShell 检查换行符与 BOM；宿主记录 `task-file-evidence-unavailable / material-unavailable`，原结果 `inconclusive / file-evidence-unavailable`，没有启动双审核。**该候选只证明工具调用时的文件一致性保护，不证明自然任务链路成功；main/Daily 继续 NO-GO。**

隔离根目录：`D:/DevData/tianwen-acceptance-runs/055-live-facts-recheck/native-use`。冻结清单 SHA-256 `b65793a96dbdc091ec3a1fe034c19087cf93e2a883352d827b43ba5615c3ace4`；任务文本 SHA-256 `b97ab8a83ad67187e84db880c71bf64d248989e044a2a4992f1067540d2a641f`；三份输入的终态字节数与哈希均匹配冻结值。候选包 SHA-256 `6a68c8e80f701825f99eed5d53eb429b98b3ea2856ae9dc9d3464a86c11cef74`，安装运行时代码 SHA-256 `b011efe57525211bd3ff02649465eaa4dfbeb0f6dd30df3407fc821e033aa7c2`，与打包前一致。原任务 ID `conversation-task:81849bb6498fd0944bebb5bc7ec19addba19ec1dee0551362794847dbabcfae7`，主会话 `session-0fd3fbd9-00cd-46e1-9459-fc693eb30257`。九次工具调用的次序及五份原生 Session 摘要保存在 `evidence/audit-055-native.json`，SHA-256 `4c2a0e1d65360ba0a778cf9dc544b1260615249bf6a75df5d601e4d9ff608b73`。

测试后自动分析关闭至 revision 2 / `enabled:false`，隔离 host 正常停止，进程和端口均退出；账本终态 SHA-256 `3a5557195514ddc2c6033098d921a6ef6ccdd416879cd4b84a1eabda25ffa4fb`。没有研究或方法激活，也不补判原任务。

E054 的脚本为了重复计算数字，E055 则为了额外探查换行符/BOM；两次都发生在原生事实工具可用的情况下。这反驳了“把工具说明写得更明确或在工具内部复查当前文件，就能稳定让模型停在受支持工具链”的假设。下一阶段应设计产品级的可认证只读工具边界：明确哪些额外问题可由受限原生工具回答，哪些问题应在调用前被拒绝并让模型继续使用已证实事实；对被拒绝调用的未执行状态也必须有原生证明。不要扩大自由脚本的认证范围，也不要以本轮失败为理由放松失败关闭规则。
