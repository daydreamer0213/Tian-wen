# 真实产品待办：通用DEV宿主的原持久准备核对

当前 scripts/development-native-task.mjs 只把调用方 isPrepared 交给原请求观察器。实际SDK控制已经证明：prepare返回undefined、没有原preparation，调用方返回true仍会转发首次根请求。请修复公共宿主，让这项原先仅在单次D驱动中的保证可复用。

只允许修改 scripts/development-native-task.mjs，并新增 scripts/development-prepared-task-gate.mjs。控制端未提供候选算法。其他产品源、测试、合同和入口只读。不要执行其他工具、改变用户要求、同意、隔离、研究、启用、停止条件或归档。

新增纯函数的公开接口是 `isDevelopmentNativePreparationCommitted(tasks, options)`，返回严格布尔值，不修改任何输入、读写文件、请求模型、装服务、补造或修复记录。options提供当前宿主sessionId、实际原始UserMessage request、本次根请求的原SDK `nativeHeader` 事件、outputPaths和referencePaths。nativeHeader 是原会话 events 中当前最后一个 `request/header`，含原seq及data.header.config，不是调用者简写callConfig，也不是另行resolve出的配置。

原SDK source、admission、externalCheckPrepared必须已经在传入的原LedgerTask中存在，且只对应当前新鲜根会话的唯一任务。核同一taskId/sessionId、当前唯一原userMessageId和原requestDigest、原contextDigest、admissionDigest及本次header有效配置的modelConfigDigest；使用原canonical sha256规则。preparedSeq不得早于startSeq，header必须是本次任务范围内的合法原header。普通Task的准备可晚于首header，不能错误要求preparedSeq早于header；每次根请求都应支持已有、配置未变的models及准备之后的文件观察。不能接受晚于文件动作的准备或已完成/已结算/撤销任务。支持既有applicable code admission（external或local-files/files），不把聊天/其他族授予程序准备资格。准备的checker/contract/inputs摘要必须是原严格协议；新project若存在，还要核完整输入摘要和与宿主一致的唯一输出/参考路径集合，已有实际文件前像须是该快照的子集。旧无project协议保持原适用性，不补字段，不要求新的requiredCondition。缺项、无匹配、多匹配、无效记录或绑定变化返回false。无关其他会话的Task不影响当前唯一匹配。

原driver只做必要接入：在followup前创建一次真实UserMessage，并在root请求门内同时要求调用方 `isPrepared() === true` 和上述原持久核对。传给核对和followup的必须是同一原消息；核对取实际handle.agent.session的本次原header、该session的原LedgerTask及原输出/参考权限。原冻结callConfig仍交原Agent，不变成gate的配置摘要来源。非root识别/评审仍由原观察器区分；原布尔附加条件不能被忽略、Promise/字符串不能充当true。原工具注册preflight、文件guard、独占attempt、取消、归档、原异常传播及Context关闭不改。不新增观察器、代理循环、状态文件或学习裁决。

评判包括事前独立纯函数案例、原driver接入与原行为保持检查，随后原SDK真实分派控制。代码/程序/内容/反馈/研究/方法采用和未来收益分开记账；程序通过不代表完整自动学习。
