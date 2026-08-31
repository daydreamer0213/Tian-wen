# Tianwen 原生对话进度交接

日期：2026-08-31

状态：Runtime 0.1.8 已正式安装，Web Profile 已更新，Desktop 0.1.0-preview.9 已构建并启动；等待普通用户自然使用验收

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
