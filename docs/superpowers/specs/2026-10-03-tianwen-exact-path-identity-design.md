# 精确文件路径身份：真实核心待办

依据：6d04b50 的实际 parseConversationFileEntries 接受两个不同损坏 UTF-16 路径 bad\ud800.ts / bad\ud801.ts；Node UTF-8 字节和模块 URL 却相同。conversationFilePath 对损坏候选先访问 root。首复现保存在 D:/DevData/tianwen-path-identity-native-20261003/first-reproduction.json。

沿用原文件证据“同一保存路径对应同一实际文件”的要求。选用路径边界拒绝不能精确 UTF-8 往返的字符串；不自动替换/修复名字（那会丢失身份），不增加文件名白名单（会拒绝合法中文及 Unicode）。允许合法代理对、U+FFFD、BOM、百分号；旧 NFC、大小写别名、保留名、前缀冲突、内容、限额、摘要及学习资格保持。Runtime 候选在任何文件 I/O 之前拒绝损坏编码；合法路径仍按原流程处理。

范围为 Evolution conversation-files.ts 和 Runtime conversation-file-material.ts；真实事前功能合同/驱动只读，使用捕获的两实际模块及只读 learning-intake.ts，隔离驱动只映射已有 bare Evolution 导入，不提供候选实现。一次真实提供者任务，原生 read/write/edit，原完整文件观察器/多文件 DEV 检查器；首功能结果及两个模型评审分别保存。失败不重跑旧任务、不改原条件，不把工程修复冒充原任务成功。

核验依据独立于候选实现：实际 UTF-8 和 URL 编码碰撞、坏候选配不存在 root 的 I/O 顺序、合法 Unicode 真实 seed/read、原路径约束和摘要。本待办无新反馈/研究/采用要求，且不承诺产生失败来源。main/Daily NO-GO、正式隔离、原同意/门槛/窗口保持。仅保留小型源码/合同/记录，不复制工程/依赖/持续档。
