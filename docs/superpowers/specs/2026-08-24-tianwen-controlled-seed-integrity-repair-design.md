# Tianwen Controlled Seed Integrity Repair Design

**Status:** approved design
**Date:** 2026-08-24
**Baseline:** `main@c5d7c641f768c3655ef356b6394a179d5c46e133`

## 1. 目标

Activity-02 已经通过官方安装、正式 DeepSeek selection 和唯一一次
`controlled-lifecycle` 进入真实产品路径，但在第一个 seed 结束时返回合法 stopped receipt：

- `completedStage=preflight`；
- `reasonCode=seed-failed`；
- closed roles 为 `0/25`；
- 最终模型选择已恢复 offline。

本设计只修复 seed 从普通 DSH Session 进入 Tianwen 治理事实前的完整性边界：

1. 模型看到的工具 schema 与冻结工具合同一致；
2. Session 必须真实落盘并能按 exact Session identity 读回；
3. decision、verifier、Evidence 和预期 verdict 全部闭合后，才允许写 Outcome 与 Skill-use；
4. 失败继续使用现有有限 stopped receipt，不增加重试、预算器、诊断框架或第二套 Agent loop。

这不是安装包格式修复。它直接决定一次真实 seed 能否成为可复核的 Run/Outcome/Skill-use
事实，因此属于核心运行正确性。

## 2. Activity-02 的永久证据边界

Activity-02 必须原样保留，不修补、不清理、不重跑。它已经证明：

- official `model use` 与 `status` 成功选择 `deepseek-official/deepseek-v4-pro`，且
  `modelRequestsDelta=0`；
- official lifecycle 只调用一次并返回合法 `seed-failed` stopped receipt；
- 关闭角色为 `0/25`；
- Session root 最终不存在，持久化 Session 文件为 0；
- Evolution ledger 有且只有四类 partial seed fact：Run binding、Run Skill manifest、
  Outcome intake、Run Skill use；
- Outcome 是 `inconclusive/continue-observing`；
- acceptance Evidence、pointer、transition 和 Champion 没有形成。

这些事实不能证明 Activity-02 的唯一底层触发原因。现有有限材料只能把触发范围缩到 seed
最终工具协议没有按冻结合同闭合，例如重复 verifier、verifier 参数或结果不合法，或者有效
submission 与 verifier 的顺序不成立。Provider 账户实际请求数和工具 body 实际执行数仍是
`unknown`，不得从 0 Session 或 ledger 行数反推。

修复因此针对已经确定的产品不变量，而不是把某个未被唯一证明的猜测写成 postmortem 结论。

## 3. 已确认的三个产品缺口

### 3.1 模型侧工具 schema 比产品合同更宽

冻结 authority 要求：

- `record_architecture_decision` exact 输入为
  `{ taskId, choice, explanation }`；
- `verify_architecture_decision` exact 输入为 `{ taskId }`。

当前 runner 虽然在 tool body 内做 exact-key 与值检查，但 `defineTool()` schema 没有把这些字段
标为 `required: true`。真实模型看到的工具合同因此允许省略字段；scripted fixture 总是直接提供
完整参数，无法暴露这项差异。

### 3.2 治理写入早于 seed 协议闭合

当前顺序在检查 decision/verifier 次数、submission、Evidence 数量、arguments digest 和最终
verdict 之前调用 `consumeOutcome()` 与 `recordSkillUse()`。因此一个最终应被拒绝的 seed 也可能
先留下 Outcome/Skill-use，再由 runner 返回 `seed-failed`。Activity-02 的四条 partial facts 正好
证明该顺序可达。

Run binding 与 Run Skill manifest 仍应在首个 Turn 前持久化；它们是执行身份与授权事实，不是
成功声明。本设计只把 Outcome 与 Skill-use 移到 seed 协议闭合之后。

### 3.3 `flush=true` 不能单独证明声明的 JSONL backend 已保存 exact Session

当前 runner 把 `ctx.sessions.flush(session)` 返回 true 当作持久化完成。Activity-02 同时出现
ledger 对 Session digest/Evidence 的引用和 0 Session 文件，说明这个返回值不足以承担正式证据门。

正式 seed 必须在 flush 后立刻通过现有 `sessionPersistence.inspect(SessionId)` 读回同一 Session，
而不是等完整 25-role lifecycle 结束后才统一检查。

## 4. 方案比较与选择

### 方案 A：只给 schema 增加 required

优点是改动最小；缺点是仍会提前写治理事实，也不能发现 flush 成功但 Session 未落盘。它只能
降低触发概率，不能闭合正式证据链，因此不采用。

### 方案 B：schema + seed 写前验证 + exact Session 读回

这是选定方案。它修复三个已确认的不变量，同时复用现有 DSH tool schema、Session persistence、
Evidence projection 和 Tianwen intake，不新增产品层级。

### 方案 C：增加自动纠错、重试、详细诊断 receipt 或新状态机

该方案会改变“一次正式决策、一次 verifier”的冻结实验语义，也会扩大公开合同和维护面。
Activity-02 没有证明需要它，因此明确不做。

## 5. 冻结的 seed 语义不变

两个 seed 继续使用普通 DSH Agent loop：

1. 使用受控 parent Skill；
2. `record_architecture_decision` 只有一次正式 tool call；
3. `verify_architecture_decision` 只有一次正式 tool call，并且发生在 decision 之后；
4. verifier 反馈后不改变 choice，不再次提交或验证；
5. D1 必须闭合为 `not-met` 并产生 Ticket；
6. D2 必须闭合为 `met` counterevidence；
7. D1、D2 任一不闭合就停止，不继续 Candidate 或后续角色。

“一次”按 Session 中真实 `tool/call` 事件计数，不只按 tool body 是否执行计数。若模型先发出
schema-invalid call，随后再纠正为合法 call，仍属于两次调用，seed 必须停止；本修复不把它升级
为自动纠错成功。

Provider retry 继续为 normal/0。Tianwen 继续不设置模型请求、token、金额或价格上限。

## 6. 工具 schema 合同

`record_architecture_decision` 的三个字段和 `verify_architecture_decision.taskId` 全部设置
`required: true`。现有 tool body 内的 exact-key、有限字符串、task identity、首次 submission 和
唯一 verifier 检查全部保留，形成两层边界：

- DSH schema 给模型准确的可调用合同，并在 body 前拒绝缺字段；
- Tianwen body 拒绝未知字段、错误 task、重复调用和不合法值。

不引入 JSON Schema helper、通用 schema builder 或新的工具注册层。

## 7. Seed closure 顺序

每个 seed 的固定顺序为：

1. 复用现有路径，在首个 Turn 前持久化 Run binding 与 Run Skill manifest；
2. 创建普通 DSH Agent，执行自然 followup/whenIdle；
3. 检查 timeout/tool guard、terminal completed 和 workspace 未漂移；
4. 调用 `sessions.flush()`，false 或 throw 映射为现有 `persistence-failed`；
5. 立即 `sessionPersistence.inspect(exact SessionId)`；
6. 读回材料必须同时满足：
   - `inspection.meta.id` 等于 manifest 的 exact Session ID；
   - `inspection.meta.cwd` 等于该 seed 的 exact workspace root；
   - `sha256(inspection.events)` 等于 live `sha256(session.events)`；
7. 在任何 Outcome/Skill-use 写入前验证 live Session：
   - decision `tool/call` 恰好一次；
   - verifier `tool/call` 恰好一次且顺序在 decision 之后；
   - tool body state 恰好一次 submission 与一次 verifier attempt；
   - submission taskId 等于当前 task；
   - acceptance Evidence 恰好一项、result 完整、arguments digest 等于 exact `{ taskId }`；
   - verifier 结果只能归约为 `met` 或 exact
     `ARCHITECTURE_DECISION_NOT_MET` 对应的 `not-met`，不得是 `inconclusive`；
8. 通过现有 `TianwenLearningIntakeService` 的只读 `hasSkillUseProof()` 证明父 Skill 调用、结果、
   Evidence 与 frozen Run facts 足以让后续 Skill-use intake 成立；该检查不得写 ledger；
9. 只有上述条件全部成立，才按现有治理顺序调用 `consumeOutcome()` 与 `recordSkillUse()`；
10. 两个 receipt 必须与已验证的 verdict、Evidence ID、Session digest 和 Skill manifest 一致；
11. 最后按 D1/D2 的固定预期决定是否推进下一 seed 或 Candidate。

`hasSkillUseProof()` 只复用 `recordSkillUse()` 现有的内存证据判定。具体实现把该判定抽到同一
service 的私有 helper；`recordSkillUse()` 和只读入口共同调用它，runner 不复制 Skill-use 算法。
Outcome 必须先写入是现有 Evolution `recordRunSkillUse()` 的完整性前提，因此两个正式 ledger 写
仍保持 Outcome → Skill-use 的既有顺序。本设计不新增跨事件事务、rollback 或第二个 service。
关键变化是：已知 invalid protocol 或未持久化 Session 不再主动触发 Outcome/Skill-use 写入。

## 8. 失败语义与隐私

不增加 public receipt 字段或新 reason code：

- schema、次数、顺序、submission、Evidence 或 verdict 不闭合：`seed-failed`；
- flush、inspect、Session identity/cwd/events digest 不闭合：`persistence-failed`；
- closed seed roles 保持 0；
- 允许保留 pre-Turn Run binding/manifest，以及已经真实持久化的失败 Session；
- 不写 Outcome/Skill-use 来代表未闭合 seed；
- 不输出 raw prompt/output、工具参数/结果、Session/Run ID、路径、凭据或 raw error。

Activity-02 的既有 partial ledger 不迁移、不删除、不伪装成新语义下的合格 seed。

## 9. TDD 与回归证据

实现必须先形成以下 RED，再做最小 GREEN：

1. 读取真实 registered tool schemas，证明四个字段当前不是 required；GREEN 后全部 required；
2. 缺少 decision 字段的真实 DSH tool call 不能闭合 seed，且 Outcome/Skill-use 数量保持 0；
3. duplicate decision、duplicate verifier、wrong task 或 invalid verifier result 均为 `seed-failed`，
   exact Session 可读回，但 Outcome/Skill-use 为 0；
4. 未调用、错误调用或无法证明父 Skill 使用的 seed 为 `seed-failed`，且 Outcome/Skill-use 为 0；
5. mock `flush=true` 但 `inspect` missing、meta mismatch 或 events digest mismatch，均为
   `persistence-failed`，Outcome/Skill-use 为 0；
6. 合法 D1 仍形成 `not-met` + Ticket，合法 D2 仍形成 `met` counterevidence；
7. 现有完整 scripted lifecycle、Runtime Bundle build、typecheck、no-private-imports 与公共边界继续
   通过。

测试只使用 development-only scripted fixture 验证机制，不把它冒充真实 Provider 证据。修复阶段
不调用 Provider。

## 10. 集成与下一次真实活动

实施必须经过：

1. feature exact SHA；
2. 独立 correctness/security、architecture/evidence/privacy、simplicity/YAGNI 复审；
3. 受控 main integration；
4. 新 exact-main automatic CI attempt 1 的 Python、TypeScript、installer-windows 三 job 全绿。

只有这些门全部通过，才可以冻结全新的 Activity-03 packet。Activity-03 必须使用新的 official
install product/evidence/operation roots、20 个新 workspace 和 25 个新 Session identity；不得复用
或清空 Activity-02。正式 operation 仍只允许一次 lifecycle，并在结束后恢复 offline。

## 11. 明确不做

- 不声称已经唯一定位 Activity-02 的模型输出或工具错误；
- 不重跑、修补、迁移或清理 Activity-02；
- 不新增 retry、自动纠错、第二次 decision、第二次 verifier 或第 26 个 Session；
- 不新增模型请求、token、金额或价格上限；
- 不新增 ledger event、数据库、checker、postmortem framework、遥测或公开诊断字段；
- 不修改 DSH 通用 Agent loop、普通 Profile、其他 Runtime task 或现有 Promotion 规则；
- 不因本修复改写 natural/external evidence，继续为 `not-claimed`。
