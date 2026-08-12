# Harness 公共接口契约核查报告

**日期：** 2026-08-11

**结论：** GO（有条件）

**版本：** `pydantic-ai-slim==2.18.0`、`pydantic-ai-harness[skills]==0.13.0`

## 已证明

1. PydanticAI 的公开 `before_tool_execute` 钩子可以在真实副作用前执行，并能观察 Harness FileSystem 提供的工具。
2. Action Gateway 排在 `StepPersistence` 前时，`ask` 和 `deny` 不会产生虚假的 `tool_call_started`。
3. 待审批调用可由 `all_messages_json()` 持久化，并由 `ModelMessagesTypeAdapter.validate_json(...)` 恢复；恢复后原调用只执行一次。
4. 一个天问 Run 可以通过共同 `conversation_id` 关联多个不同的框架 `run_id`。
5. 副作用完成后发生硬中断时，StepPersistence 保留 `started` 副作用记录，可映射为天问 `unknown`。
6. StepPersistence 可以恢复已经闭合的工具调用快照，并保留 `conversation_id`。
7. `SqliteStepStore(database=...)` 可以与天问拥有的 `tw_*` 表共用一个 SQLite 文件。
8. FileSystem 能限制根目录并保护 `.env` 等路径。
9. Shell 能限制命令、操作符和环境变量，并把非零退出码作为已知结果返回。
10. Skills 在构造时冻结选中的 `SKILL.md` 内容，只暴露选中 Skill，不自动载入附带文件。
11. InputGuardrail 与 OutputGuardrail 分别处理输入和输出，不承担工具授权。

## 已知限制

1. StepPersistence 0.13.0 不为尚未闭合的待审批工具调用保存可恢复快照。天问 Checkpoint 必须保存待审批消息 JSON 和 DeferredToolResults 关联信息。
2. Harness Skills 不提供文件权限边界，也不加载 Skill 附带资源。只读物化、资源访问和版本治理仍由天问负责。
3. Harness Shell 的命令规则是应用层约束，不是操作系统沙箱。首切片仍须在受限 worktree 或临时仓库运行。
4. Harness 管理的 SQLite 表没有天问命名前缀。天问只能通过 StepStore 访问这些表，自己的表统一使用 `tw_*`。

## 进入垂直切片计划的硬条件

1. Action Gateway 能力顺序固定为 `ActionGateway → StepPersistence → 其他执行能力`。
2. `ask` 在返回用户前原子保存 Action Proposal、消息 JSON、框架调用 ID 和共同 `conversation_id`。
3. 恢复审批时核对 Action ID、工具名、参数摘要、Run、Skill 和策略版本，再提交 DeferredToolResults。
4. 发现 unresolved Harness tool effect 时先进入 `unknown` 和核对流程，禁止盲目重试。
5. Skill 目录按 Run 物化，Harness `Skills` 在物化完成后构造。

满足以上条件后，可以编写首个持续学习垂直切片实施计划；当前证据不支持 Fork Hermes。
