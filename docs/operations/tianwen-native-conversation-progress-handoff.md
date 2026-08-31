# Tianwen 原生对话进度交接

日期：2026-08-31

状态：普通用户自然使用已完成一次；执行主线成立，但暴露四项真实交互缺陷。结果回传、冷会话恢复和 `/goal` 长时间占用输入框已修复并通过聚焦验证；内部任务会话展示与主对话进度粒度仍待后续完成

## 产品结果

Tianwen 不再在输入框上方或底部显示独立 Goal 卡片。用户在普通 DSH Web/Desktop 对话中输入
`/goal <目标>` 后，首个 Task 开始、Task 切换、阻塞和最终完成都会由原控制 Agent 在同一消息流中
产生一条普通助手回复。用户可以像普通对话一样直接补充方向、纠偏、暂停或恢复。

“长期目标”面板只保留为可选历史与诊断入口。DSH 原生停止按钮仍暂停当前连续 Goal，但不会为了
说明按钮动作而额外唤醒 Provider。

## 实现边界

- 删除 `conversation.input.dock` 注册、投影模块、刷新逻辑和对应 UI 测试。
- 只在持久 Goal 的 start、advance、block、complete 边界产生反馈。
- start/advance 发送前重新核对 Goal revision、当前 Task、执行绑定和控制 Session。
- 反馈使用正常 `Agent.followup` 和 Session 持久化；反馈 Turn 禁止工具及 Goal 控制。
- advance 只携带最新已结束 Task 的结果，并明确作为不可信历史执行数据。
- 不增加自定义 Session 事件、第二套消息存储、轮询器、调度器或持久重试队列。

## 独立验证

- 相关 Runtime/Host/客户端测试通过；版本相关套件共 289 项，其中 281 通过、6 跳过。
- 两个首次失败均已隔离：一个是版本测试把当前 0.1.8 误列为未来版本，修正后相关 6 项通过；另一个是
  Windows Profile 启动在 60 秒边界超时，唯一一次针对性复核约 39 秒通过，没有重复跑整套挑选结果。
- TypeScript 类型检查和 Runtime 构建通过；依赖全部复用 D 盘 store，没有重新下载。
- Desktop unpacked/Windows installer 构建通过，provider-free 产物审计通过。
- 正式安装器返回 `ready`；managed Runtime 与 Web Profile 均为 0.1.8。
- Web Profile 安装后的 `dist/client.js` 与构建产物 SHA256 相同，并确认无
  `conversation.input.dock` 注册。

## 交付物

- Runtime：`D:\DevData\tianwen-0.1.8-artifacts\tianwen-runtime-bundle-0.1.8.tgz`
  - SHA256：`3302A417EEA35BF873C121395781F188C25557057B9C00134891FF5100F2B2FC`
- Desktop：`D:\DevData\tianwen-0.1.8-artifacts\Tianwen Desktop Setup 0.1.0-preview.9.exe`
  - SHA256：`51E26DEE931A23FFD739C8BBDA0B32381E0DE156D700DBF6907E1EDDD5C2C595`

## 证据边界与下一步

本阶段没有启动新的真实 DeepSeek Goal，也不把内部 Turn 或事件数量推断为 Provider 费用。源码、安装和
产物验证已经闭合；产品体验由用户下一次普通 `/goal` 自然使用验证，不创建合成 Activity，也不为了得到
更好答案重复运行。外部 publish、tag、Release、installer upload 和 DSH 上游推送均未执行。

## 2026-08-31 普通使用补充

用户在正式 Desktop 的普通对话中对真实工作区执行了一次 `/goal`。Planner 和只读 Task 正常完成，
Task Session 持久化了完整项目审查结果，v3 Long Goal 也进入终态；没有重跑任务挑选结果。这次使用同时
确认了四个产品问题：

1. `/goal` 命令原先一直等待首次规划与 Task 启动，约 92 秒后才结束，所以输入框看起来没有清空；
2. Planner/Task 仍由普通顶层 DSH Session 承载，因此会出现在“未分组”会话列表；
3. 主会话只在关键边界给出过短反馈，用户难以判断当前进展；
4. Goal 已完成时控制 Session 不在线，终态结果未回传到主对话。

当前修复把 `/goal` 的完成边界收窄到“Goal 与控制 Session 的持久绑定已经建立”：命令立即返回，首次
规划继续在既有每 Goal 串行通道中运行。如果这次后台规划失败，控制对话会得到一条受限说明：目标已保存，
用户可以自然说继续或补充纠偏；原始异常不会进入对话。终态与进度交付不增加新账本；冷启动从既有 Goal 状态恢复意图，
控制 Session 下一次变为 live 时补交，并在原 Session 日志中按通知内容与已完成 assistant Turn 去重。

正式安装产品已用原有 Goal 和原有 Task 结果验证恢复：只通过 DSH 正式接口重新挂接原控制 Session，
没有重跑 Planner 或 Task，主对话随后新增一轮正常助手回复，展示项目定位、已验证内容、剩余风险和下一步。
这证明“真实 Task 结果 → 原主对话”已经闭合；它不证明内部 Session 已经完成 DSH 原生子 Agent 迁移，
也不把这次补交 Turn 的内部事件数量当作 Provider 账单事实。

聚焦验证结果：`continuous-goal-feedback`、`continuous-goal-host`、`tianwen-desktop-host` 共 92/92 通过；
Runtime 与 Desktop TypeScript 检查通过，Runtime 构建通过。诊断阶段曾验证 Desktop 可以转发子进程输出，
但没有把原始 stdout/stderr 默认持久化进产品，避免保存潜在敏感内容或让日志写入失败影响 Desktop 生命周期。

剩余工作按产品价值排序：先让 Tianwen 内部 Planner/Task 不再作为普通顶层会话污染会话列表，再把主对话
进度调整到“完成了什么、正在做什么、下一步是什么”的有限粒度。不得恢复独立 Goal 卡片，也不得为此增加
轮询器、调度器或第二套消息数据库。
