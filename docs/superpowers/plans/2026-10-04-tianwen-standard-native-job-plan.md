# 标准 Loader 一次性 DEV 任务入口

继承 f444d610、当前交接及原学习资格。上一轮修复原执行器普通 Node 导入是进展；本轮只补真实消费所需的操作者任务数据入口。用户已授权持续自主实现，不再逐项问批准。

选择：两个原Loader插件共享一个只读临时合同绑定；Runtime插件仍唯一负责原applyDevelopment，任务插件仅提供run(signal)委托原runDevelopmentNativeTask。直接执行随意数据无法事前核对原合同；新建宿主/调度器没有必要。绑定只核操作者配置对应关系，不判断任务正确、研究资格、同意或激活，不新增存储。

- 原Runtime JSON envelope/config不变。读取一次已锁定字节、原工厂验证，再挂原Runtime及合同绑定；绑定按原requestText/cwd和输出/参考集合匹配，无推断/补字段。
- 新插件配置只有jobPath/jobDigest；原字节SHA、规范D普通文件、物理位置在可写cwd外。JSON不是Loader表达式，不接受回调或任意Runtime字段。
- job envelope为schemaVersion=tianwen.development-native-job.v1、cwd/sessionId/requestText/outputPaths/referencePaths/maxTargetBytes/resultRoot/callConfig，可选maxArchiveBytes；数据冻结且调用时复制。原执行器继续验证声明/预算、原模型、当前原准备记录和新会话/独占首次归档。
- resultRoot在D:/DevData、工作区外，已存在的规范父目录下，不能是链接根。调用者传原AbortSignal并持有Context；插件不建Agent、timer、队列或自行dispose Context。run等待原执行器完整返回/抛错，调用者原8分钟范围不变。
- 服务等待原绑定、Agent、原文件观察/工具、原JSONL及Loop；加载本身不启动模型或Task、不记录新同意。原isPrepared前置仅检查真实externalCheckPrepared存在，执行器内部仍完整核原Task/请求/header/输入/输出/模型，不用手工prepared旗标。
- 独立复查、定向测试、普通Node原Loader消费分别记录。任何控制/预设响应不充自然来源；主目标active/incomplete、main/Daily NO-GO、原十工作日窗口保持。
- D生成物小包，复用依赖和Profile；测试只清理本次mkdtemp根，先移自有链接并确认规范边界。原71拒删路径不删除/重试。

步骤：先红测试配置、合同绑定及原Loader就绪/事前取消；实现只读绑定和薄job服务；验证原委托、权限与单次尝试的实际SDK路径；仅有据缺陷窄修；独立复查、最终验证、文档及提交。完整自动学习不以该入口交付为完成。

执行结果：配置/绑定/原Loader5新项及原92项最终97通过；真实普通Node新工程场景分别验证原prepare不可用拒根、实际准备后首次根取消、Task/seal一致/handle释放/Context保留/重启拒绝。首脚本准备假定错误与截获顺序原样保留，产品未为此改门；新场景使用原终端adapter。两轮独立只读无有据P1/P2。实现和本控制收口，详细范围见docs/operations/tianwen-standard-native-job-20261004.md；完整目标仍active/incomplete，后续真实任务不能由工程控制替代。
