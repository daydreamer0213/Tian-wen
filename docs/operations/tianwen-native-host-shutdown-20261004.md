# 关闭前保存原任务：2026-10-04

本轮修复了工程缺陷，没有增加自然学习来源。完整自动学习仍 active/incomplete，main/Daily NO-GO；原验收条件、同意、双审、语义安全和十个工作日窗口不变。执行者继续承担可独立推进工作，不索取用户题目或催旧稿评价。

## 缺陷与实现

上一轮单 runner 取消已能保存，但整个宿主同时拆掉 Evolution/sessions/AgentLoop，归档使用的服务会过早失效。原 `runner-whole-host-unload` 和 `runner-whole-host-drain` 失败保持原样。

复用固定 DSH 0.1.1-rc.2 的现有 pnpm patch，只给原统一关闭增加顺序：等待公开 `app/before-exit`，然后卸载整个 Context。`disposeProfileContext` 是 CLI 的正常退出、信号和 fail-loud 清理共用的同一个安装函数。runner 监听此事件，使用已有 effect 取消并等待原 job 保存；正常完成先注销监听再退出，不等待自己的外层流程，不重启任务。hook失败也在等待其他监听结算后卸载服务，并把错误交回原关闭控制器。

原5秒强制退出、重复信号升级及退出码保持；不能保证强制杀进程后归档完整。原自然任务20项验收与首次结果未修订。独立工程入口新增 before-exit 检查为21项。

## 当前证据及边界

- 原实际 CLI 处理器的 SIGINT/SIGTERM 两项先观察到服务提前卸载，修复后任务收尾先于卸载。Windows 控制为子进程自身发出 Node 信号事件，不是 Windows OS 信号投递证明。
- 合法 canonical DEV 根中的实际 Runtime、SDK、原准备及脚本 adapter 调用 CLI 同一个已安装函数：原取消 Task、native 会话及完整 seal 落盘，所有文件字节/摘要一致，无 archivalError/settlementError；整个 Context 已释放，退出一次。分类/根脚本各1，真实模型0，自然任务0。
- 六个任务/Runtime/CLI相关文件47项通过；另新增两项验证 hook失败仍排空其他owner、无owner保持旧卸载。关闭文件最终4项通过，其中信号两项与前组重叠，共49个不同检查。独立审查未发现有据 P1/P2。
- patch SHA-256 `6873597c9be67404539f35b387b404939d48de5cbe54dd2de0b4a31c12c9f4d2`。锁文件只更换原4处 patch hash，不改变依赖版本。实际安装字节通过相同 patch 重建，不复制依赖树。

完整 DEV 直接挂入普通 CLI Profile 的早期工程尝试被原开发根/baseUrl 与嵌套 Loader 身份规则拒绝，均为启动阶段、无新任务/根模型。这些失败留存，不能宣称该集成已交付。组合证据仅证明 CLI 信号入口和合法 DEV 使用共享关闭函数；不再用嵌套 Loader 或改写 Context 身份绕过规则。

证据在 `D:/DevData/tianwen-native-host-shutdown-20261004`：`final-regression.log`、`final-failure-path.log`、`native-shared-dispose/sdk-result.json`、原 Task/native/seal、patch应用收据、失败日志和最终资源审计。

## 还差什么、下一步承担什么

当前七个自然任务的原终态保持：首六题程序4通过/1拒绝/1无法核验；第七题准入拒绝，未生成答案。资格仍1个合格问题、1个条件不兼容的完整成功，0新真实反馈/自然研究。原 R9 语义风险未解除，尚无自然来源支持的方法研究、治理采用和未来效果。

关闭机制修复收口，不再追加同类控制或报告功能。下一核实原 CLI Profile 与 DEV 根的合法接入方式，完成可实际使用的开发入口；再由执行者承担真实开发需要，事前固定版本、要求和独立检查，唯一首次消费，按原规则观察结果。不能保证自然工作一定形成合格问题；来源不足不妨碍工程推进，也不能用脚本预设失败补资格。研究、语义安全、采用、未来效果仍各自需要事实。

生成物在 D，复用既有依赖；本轮新建临时宿主和失败启动根按精确清单收尾，保留小型原证据。71拒删根不操作，空间≥15GiB、Docker收尾停止的最终值见本包 final-audit；20GiB偏好尚未达到。
