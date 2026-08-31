# Tianwen 原生对话进度交接

日期：2026-08-31

状态：普通用户自然使用已完成一次；由此暴露的四项真实交互缺陷均已在 Runtime 0.1.9 收口，正式安装、Web Profile 更新和 Desktop preview.10 启动验证完成

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

## 2026-09-01 Runtime 0.1.9 收口

四项问题已逐项闭合：

1. `/goal` 在 Goal 与控制 Session 的持久绑定成立后返回，输入框不再等待首次 Planner/Task 完成；
2. 新 v3 Planner/Task 创建时写入 DSH 原生 `parentSession`、`origin=subagent` 与
   `delegationDepth=1`，因此不再出现在普通“未分组”会话列表；历史 Session 不迁移、不删除；
3. start/advance 主对话回复不再只是单行确认，而是包含当前计划位置、最新完成结果、正在做的工作和
   已知下一步；
4. Task 终态与结果在控制 Session 重新变为 live 时恢复交付，并按既有持久助手 Turn 去重，不重跑 Task。

内部 Session 变化只使用 DSH 的持久父子展示元数据；Tianwen 仍管理自己的 Goal/Planner 生命周期，
不把这项改动冒充为已经迁移到 DSH 通用 continuable-subagent 管理器。冷恢复时，新的内部 Task Session
由 Host 直接恢复其 Agent 与精确 Goal ref；旧 v1/v2 与既有普通 Session 继续使用原兼容路径。

聚焦产品验证：

- `continuous-goal-feedback`、`continuous-goal-host`、`learn-loop-host` 与其 integration 共 91/91 通过；
- Runtime 与 Desktop TypeScript 检查通过，Runtime 构建通过；
- 版本、installer、Desktop 和 Runtime 相关套件最终聚焦复核通过；一次 Runtime Profile 用例最初仅因
  `COREPACK_HOME` 未指向批准的 D 盘目录而拒绝，按既定目录运行后通过；
- 正式 installer 把 managed Profile 从 Runtime 0.1.8 更新到 0.1.9 并返回 `ready`；诊断期间留下的
  同版本热更新包先恢复为与旧收据哈希一致的正式 0.1.8 包，再走正常升级，没有绕过 preflight；
- Web Profile 通过正式 DSH `plugin add` 更新到 0.1.9；managed/Web 两处 `runtime.js` 与 `client.js`
  分别和当前构建产物 SHA256 一致；
- Desktop `0.1.0-preview.10` unpacked 与 NSIS installer 构建完成，离线产物审计通过；随后使用
  真实升级 Web Profile 启动成功并返回 HTTP 200。端口由本次 DSH 启动动态分配，不固定为旧端口。

当前交付物：

- Runtime：`D:\DevData\tianwen-0.1.9-artifacts\tianwen-runtime-bundle-0.1.9.tgz`
  - SHA256：`68D4578CE49C20F6AAA28601766D56A6120D2C1AA0319F4F85328BB32BEC7630`
- Desktop：`D:\DevData\tianwen-0.1.9-artifacts\Tianwen Desktop Setup 0.1.0-preview.10.exe`
  - SHA256：`37BE8BFC00C830AA708DC12658EA935FE8A30F2C59AA7E1BB741D36A4CE98E01`

本次没有重新执行真实 DeepSeek Planner/Task，也没有从内部事件数量推断 Provider 请求或费用。现有普通
用户运行提供症状和结果证据；修复通过确定性测试、正式安装字节核对和真实 Desktop 启动进入产品。没有
创建 controlled Activity，没有外部 publish、tag、Release、installer upload 或 DSH 上游推送。
