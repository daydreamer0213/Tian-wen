# 原生读取拒绝：交付、原结果及下一实现

本轮修复了真实产品缺陷：SDK在执行前拒绝read时没有tools/execute事件，旧文件观察器却要求每个结果有执行pending，导致后面的正常文件交付也无法核验。现在从可信guard位置记录拒绝，原错误保持，正常交付继续保存。完整自然自动学习仍未完成；不等待所有者索题或评价。

## 已交付的产品行为

- Evolution提供闭合拒绝回执解析和原call/result绑定。只验证结构与原事件，不单独认证生产者或声称读取成功。
- Runtime实际工具注册、同步guard、不可伪造的当前执行token、任务/session/turn/call/rootCall、原参数/结果摘要和事前声明的生产者共同认证拒绝。任意同token/call执行事件使回执失效；同文案已执行错误、未知guard、身份或摘要漂移、取消与撤销同意继续拒绝。
- 原ancillary持久保存read-denied，冻结和冷恢复使用同样绑定。拒绝不创建输入、输出、文件事实、成功或学习标签；拒绝路径以null投影，文件动作证据新增v3。v1/v2及原评审指令逐字保持。v3支持chat和files，chat仍拒write/edit。
- 固定DEV薄宿主计算实际只读权限策略源码摘要，通过公开guard接线。宿主调用者在注册真实fs工具前装配原生工具观察器，并事前声明该生产者；未知来源不自动信任。未采用私有补丁或错误文字判断。

## 一次真实任务与独立工程修复分开保存

`34e2d4b`固定纯模块合同/入口，`d8cd84f`在模型前修正入口的同一对象不变断言。唯一自然任务`conversation-task:b7e147689420fe607af10c57fcf71d141ecbc0dcfbdf24f4abe6a50c664d1813`：11真实请求/9根、prepare1/eval1、零重试/脚本。原15,334字节候选完整保留，原功能verified、review inconclusive/model-unavailable、proof null、有效reviewChecks 0；没有追认成自然学习成功。

原持久requirements评审记录明确为max-tokens结束：input 140,989 / output 65,536 / reasoning 60,588；截断的structured_output参数不是有效JSON，没有有效tool/call/result，没有grounding复核。这里的model-unavailable不是已证实网络故障。

独立审查发现原纯模块三项P2：同callId其他序列未计重、额外拒绝空file_path、稀疏数组由额外属性补键数。5项首红后窄修，全原合同仍通过；工程修订不改原自然结果。另发现v3被旧v2/files投影条件误拒、指令误套v1无write/edit说明，2项首红后单独修正。

## 实际发行验证

相关回归：第一6组181通过，后6组68通过，另1组11通过；扣除重复的8项，共12个不同组252项。八包类型、完整Runtime发行构建和公开导入检查通过。独立静态审查无剩余有据P1/P2。

最终实际发行Runtime、固定Node项目检查器和DEV宿主控制：11 scripted请求/8根、prepare1/eval1、程序verified/原双met；真正越界读取执行数0、拒绝回执1，正常反序输出权限和edit均通过。原task/material/program/两审准确冷恢复，0模型/重检查。受控结果不计自然来源或收益。早期发行控制在v3指令修正前已冷核验并压缩保留对应SDK，不改其原记录；最终控制另有唯一目录。

新实际发行对正式profile的0模型核对为18观察/17识别并结束/0反馈评估/0study、隔离true、awaiting-compatible-sources。原自然task/material/program再次精确冷恢复，完整账本SHA-256 `62438424a3679a33d6bdbe1a19bb32951998a8398c36944a5ec1844d602df8b9`、1,042,766字节保持；原922,060字节及此前全部前缀保持。completed只表示执行结束。

## 存储与清理

三自有容器均boundaryVerified/removed/snapshotReadOnly；原84历史ID精确保留、快照0、Docker已关闭。运行根`D:/DevData/tianwen-read-denial-native-20261003`约1.51MB必要证据，无项目/profile/依赖全量副本，无下载，已有fs peer从原D:依赖仓离线复用。D约18.57GiB，满足15GiB硬底线。

两次原生PowerShell残留测试目录删除被自动审批策略拒绝；没有改用另一入口绕过。16个已确认本轮测试目录共450,296字节暂留，未清理干净这一点保留为资源限制，不阻止实现。大型自有容器和快照已正常清除。

## 下一具体缺口

只读原评审记录量化：user prompt 227,410字节（packet 220,240），structured_output schema 297,701字节，其中65单元audit schema 228,723；四个只读文件44,025字节完整出现在source、fileResult及claimEvidence三处。所有enum 151,857字节已包含在schema内，不能重复相加。字节大小不能精确分配token或单独证明哪一段造成输出耗尽。

下一先缩减新评审schema中的重复表示，保留全答复单元、原权限/条件、来源绑定和独立主机验证；不删源码输出或允许漏审。优先复用现有v2审计协议及原工具能力，不新建评审系统、不回退到容易漏单元的老协议，不重评本次原任务凑结果。固定发行后，对真正有共同原功能条件的不同核心待办继续自然前瞻，原输入/合同/期望各自保持，失败不预设。

完整目标active/incomplete，main/Daily NO-GO、原同意/隔离/验收门槛及十工作日窗口保持。本轮没有自然研究、方法启用或后续收益；存在已证实的独立产品实现可继续，不重复标记阻塞或索取用户动作。
