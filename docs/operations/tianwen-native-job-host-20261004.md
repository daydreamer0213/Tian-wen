# 原生任务入口与宿主退出：2026-10-04 检查点

完整自动学习继续 active/incomplete，main/Daily NO-GO，原发布门槛与原十个工作日窗口不变。本轮不索取用户任务或评价，不重复旧自然任务，也不把工程控制写成学习成绩。

## 首次真实任务的准确结果

基线 fb135586 已在未知答案前固定20项检查及新开发需求：实现标准 Loader 的显式一次性任务 runner。唯一自然任务在模型开始写代码前失败：两次真实准入分析将“所写代码须通过测试”判为 external；原项目准备要求 local-files/files，因此原关口拒绝根模型。没有代码候选、程序结果或完整双审成功，不能当作第二条合格问题。

原 Task `conversation-task:833dbc1bb8ed6735f28ce21f782452b46841bb7469b98607e26b89eae00b1f17`、原结果及冷恢复保留在 `D:/DevData/tianwen-live-native-job-runner-20261004/attempt`，不修复、重跑或重评。持续档由六题追加为七题；原六题记录保持，当前账本 SHA-256 `518972cb1938caa5b4d863abff9e444888fa9cc5a4e09e53075274481131ae78`。正式账本仍 `5af25fcd7d6531a58483df8d87fde046dfe8baa7abc6338a496c12a55cce80da`。

## 独立工程交付

准入说明区分文件的质量条件与让 Agent 实际执行外部操作的指令，保留原条件、权限和准备校验。新隔离分类控制为三项：只写文件且须满足测试为 local-files/files；明确执行 shell 测试为 external；明确发布远程为 external。五次真实分析请求、三次分类观察符合预期；根模型刻意拦截、自然任务与研究均0。不能当作新自然任务效果。

`scripts/development-native-job-runner.mjs` 为 Codex 单独工程实现，不是天问生成的答案。它仅调用原 job、等待结算、输出原结果并调用原 appExit；支持一次固定超时和原公开 ctx.effect 取消接口。job 服务补实际依赖 sessions，并由 provider Context 及冻结 job 的闭包拥有执行资源，避免停止 consumer runner 时会话先被释放。

原20项自然验收中的 dispose 事件替身不符合实际 Cordis：实际 SDK 不触发该事件。原文件保持不变，不称其最终验收通过。另立 `development-native-job-runner-engineering-entry.mjs` 的20项公开 effect 生命周期工程检查，接入标准测试入口。准入相关225项通过，最终任务入口四组40项通过；两组含重叠项，不相加为独立测试数量。

实际 SDK 普通消费 `runner-consumption-provider-final` 和单 runner 卸载 `runner-unload-provider-final` 均通过：原准备、各一分类/一根 scripted 请求、一次退出、Task/native/seal完整且一致、重启拒绝、Agent释放及调用者Context保持。0真实模型、0自然来源。最初缺 sessions、Node实验警告造成控制断言失败、旧consumer会话提前释放、无效handle包装顺序及readonly函数Proxy错误分别保留；无效修法已撤回。

## 尚未交付的整体宿主关闭

`runner-whole-host-unload` 与 `runner-whole-host-drain` 失败，原记录包含 inactive Evolution/sessions 服务错误、未完成归档。不能从单 runner 通过外推整体关闭通过。额外 job inFlight 等待无效，已撤回。

只读追踪确认：精确 Cordis 4.0.1 的 Fiber.dispose 在自身排空完成前移除 registry/runtime.fibers；整树并发清理时，服务注销的 notify 找不到仍在排空的依赖者，服务快照提前失效。原 AgentLoop 全局释放又可能并发拆 live Agent。不是用户缺反馈、标准临时增加，也不能绕过 inactive 检查解决。

下一具体实现：原宿主关闭必须先取消并等待 runner 完成原归档，再释放整个 Context。现有公开 API 的两阶段顺序已由单 runner 控制证明；原 DSH 信号处理直接卸载整树，没有事前排空接口。下一检查精确版本已有宿主关闭能力，必要时维护最窄 DSH 关闭接缝的 pnpm patch，实际验证 SIGINT/SIGTERM 及整体关闭；不改 SDK 全局生命周期、另造运行时或用第三次模型评审替代归档事实。此工作可独立推进，无须用户提供新任务。

## 学习资格与资源

仍只有1合格问题及1不兼容完整成功；没有新真实反馈、自然研究、治理采用或未来效果，R9 语义安全风险仍未解决。宿主接通后继续实际开发需求；只有原选择器自行满足两条输入独立兼容问题及兼容成功，才进入原五案例十臂研究，再分别核实裁决、采用、未来效果及回滚。缺来源不机械冻结全部工程。

生成物仅在 D:/DevData，复用原依赖与隔离环境，没有整份环境副本。当前D剩余约17.9GiB，满足15GiB底线，未达到20GiB偏好；71拒删根不操作。Docker只用于原准备检查，收尾停止。详细原控制、失败、分类及最终审计在本轮D包中。
