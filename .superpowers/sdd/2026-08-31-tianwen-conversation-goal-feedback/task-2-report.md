# Task 2 Report: Conversation Goal Feedback Dock

## 改动

- 保留原有 `sidebar.footer.action` 注册，并新增稳定 ID 为
  `tianwen-conversation-goal-feedback` 的 `conversation.input.dock` 注册。
- 新增 `ConversationGoalDock`：挂载时调用既有 `list()` 和选中 v3 记录后的
  `status()`；复用 `selectConversationGoalSummary()` 与
  `projectConversationGoalFeedback()`，不新增 RPC、存储或控制流程。
- 所有者 session/input 快照和 Session-list 快照仅作为刷新失效信号；同会话突发
  刷新合并为一次后续读取。切换 Session 或卸载会中止旧请求，generation guard
  拒绝迟到的成功和失败结果。
- 使用既有 locale namespace 注册中英文停靠栏固定文案，并只渲染紧凑的目标、状态、
  完成数和当前/最近任务；没有匹配 v3 目标时隐藏，失败时显示通用不可用状态。
- 扩展两份聚焦测试，覆盖双 slot 注册、挂载读取、快照失效、合并、无计时器、切换/
  卸载中止及迟到响应隔离。

## RED

命令：

```text
pnpm exec vitest run tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/learn-loop-client-module.spec.ts
```

结果：预期失败，3 个断言失败：原实现只注册 1 个 slot，编译客户端没有
`conversation.input.dock`，因此生命周期测试无法取得该 slot。

## GREEN

命令与结果：

```text
pnpm --filter @tianwen/runtime-bundle run build
# exit 0

pnpm exec vitest run tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/learn-loop-client-module.spec.ts
# 2 files passed, 56 tests passed

pnpm --filter @tianwen/runtime-bundle run typecheck
# exit 0

git diff --check
# exit 0, no output
```

## 自审

- 未改动 Host、Runtime 版本、installer 或 docs；实现和测试仅涉及 brief 指定的
  源码/测试文件。
- 无 `setInterval`、`setTimeout`、文件监控、浏览器 JSON 读取、全局事件总线或新增
  控制按钮。
- 旧请求即使底层 RPC 忽略 abort，也不能写入新 Session，因为写入前检查 generation、
  Session ID 和 abort 状态。
- Session-list/owner snapshot 不作为权威状态源；权威状态仍来自 Tianwen list/status RPC。

## Commit

实现与测试提交：`283b2bbad2a1f9fa46b5f15728ef679734a85208`

## 疑虑

无已知阻塞问题。`conversation.input.dock` 的公共 slot owner props 按 brief 使用
`session.sessionId` 和 `input` 快照；当前仓库的 DSH 类型包没有暴露该 slot 的专用
类型，因此在本地 ClientContext 中保持了窄结构声明。
