# 原命令行真实评审失败的退出状态修复

实际Evolution `ConversationReviewCheck.verdict`和原结果投影使用met/not-met/inconclusive。现runner仅认unmet，导致not-met结果返回2（未定），应返回1（明确失败）。不是研究问题或语义裁决修复，不改变任何旧Task验收/结果/资格。

通过原CLI唯一首次让天问修改scripts/development-native-job-runner.mjs，只补正确的not-met失败识别，保留既有unmet兼容和其余行为。完成/程序失败仍1，verified且完整原候选+met仍0，inconclusive/缺失/未知仍2。原结果对象、stdout JSON、信号、单次执行、单次退出、取消/超时/排空/归档和原8分钟预算保持。无新宿主/工具/IO/同意/模型配置/学习判断，不执行命令或自跑检查。

独立入口scripts/test-fixtures/development-native-review-exit-entry.mjs在未知答案前固定，包含原21工程生命周期回归及5实际评审状态检查。入口消费原公开SDK learning-intake保存源码的sha256，核对输入原对象不变并封存各状态结果摘要；package alias明确指向只读公开dist模块，传递依赖仅Node标准库，不能从主机补库。候选无需为检查硬加SDK依赖。

使用已经交付的CLI配置工厂完整挂原runner，专用D DEV home/Profile，不复制旧Task/同意/账本。既有用户已授权DEV自动分析，使用原Evolution服务记录本Profile的实际作用域授权（不是Daily自动同意）；原CLI启动的透明bootstrap仅在根请求前验证原服务及记录授权/监测请求，不生成答案/评审/Task或执行替代job。0提供方重试，原正式账本及旧持续8Task完全保持。复用未触发研究供应配置，信用0，不创建新五角色群、不强凑来源。

只一次正式任务，失败如实保留；事后工程修复另记不重判。本修复不能证明完整自然学习/语义安全/采用效果。main/Daily NO-GO、原门槛、十工作日窗口保持。生成物D，精确自有临时Profile任务归档封存后清理，不触碰原71拒删根；D>=15GiB，不复制环境。
