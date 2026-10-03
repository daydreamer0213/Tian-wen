# 原生开发归档的字节封存与核对

依据现有 DEV 宿主：每次唯一 session 会写 attempt-started/task/压缩 root-native/result 或 failure/cleanup，SDK 已拥有任务身份、原请求、生命周期、模型与完整材料核验。控制端目前每轮另写原结果 seal，缺可复用的字节清单接缝。继续复制封存逻辑会使后续瘦身/续跑缺文件或混入旧字节时难以发现。

复用 SDK 原身份及裁决职责，不重新解析 native 事件或重建学习/档案平台。采用一个纯标准库模块 scripts/development-native-archive-seal.mjs，两个导出 sealDevelopmentNativeArchive(sessionId, entries) 和 verifyDevelopmentNativeArchiveSeal(seal, sessionId, entries)。前者对原六个白名单文件的实际 UTF8/Uint8Array 字节给出长度及 SHA256，绑定唯一原 sessionId；后者比较冻结 seal 与当前实际字节。模型一次未知答案，事前独立入口冻结完整期望，不写候选或答案拟合。

选择此窄接缝而非复制逐轮 hash 脚本；不增加通用存储、任务身份解析器、删除器或调度器。清单只证明与封存字节一致。完整文件集合、程序 verified、整任务 review、自然来源、方法激活和收益是不同事实；本模块不补任何学习或成功标签。

entries 为 {path,content} 列表，文件只允许 attempt-started.json、task.json、root-native.json.gz、result.json、failure.json、cleanup.json，重复/未知名/非字符串非 Uint8Array 拒绝。文本必须逐字 UTF8，不用替代字符折损原文；二进制保存真实 view 的 offset/length。输入/返回值不共享可修改的原内容。空/部分归档可以封存，不能标完整。完整集合要求 attempt-started/task/root-native/cleanup 及 result/failure 至少一个，两者可同时存在。

seal 恰四字段 schemaVersion、sessionId、files、complete；files 恰 path/bytes/digest，固定原六名顺序、非负安全整数字节数及 sha256:64hex。verify 恰返回 sessionMatches/filesMatch/complete/missing/changed/added，路径按原六名顺序；missing/changed/added 比较 seal 所有实际文件，不替代必需完整性。complete 仅当 sessionMatches、filesMatch 且 seal 原文件集合完整。损坏配置/清单 TypeError，正常字节变化是核对结果而非异常；不 I/O、不改历史或重评。

接纳后薄 DEV 宿主在已有 finally 清理与原记录保存之后封存本轮六个实际文件，保留新 seal 文件并防止旧 seal 重入。清单失败保留原记录和真实错误，不从 checksum 推断执行成功。独立过程读取旧归档只新增核对结果，不补写旧归档或改判。

未来实际 Runtime 在任务前注入上一轮双检查 options：原合同配置从真实已冻结原 manifest/原准备快照提取，独立邻近/留出为真实待办（有界归档读取、封存归档保留事实投影）的尚未执行原合同，不使用 value 练习；无 pair 时不会执行这些待办或消费旧 pair。不预设问题/制造反馈。main/Daily NO-GO、原资格/同意/隔离/去重/停止/十工作日窗口保持。

D 盘仅小型合同、首次原稿/结果、冷恢复、摘要与必要收据，复用原环境/镜像；不复制 Profile 或整 SDK，不低于15GiB。本轮新生候选的历史证据先封存，任何必要工程修复另记，完整目标保持 active/incomplete。
