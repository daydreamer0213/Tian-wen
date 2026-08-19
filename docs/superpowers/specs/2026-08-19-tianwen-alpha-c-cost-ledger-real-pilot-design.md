# Tianwen Alpha-C 真实费用小账本试验设计

**状态：** 会话设计已确认，等待用户审阅本文后进入实施计划
**范围：** Alpha-C 真实问题试验场；不授权 Alpha-D、晋升或扩大总预算

## 1. 背景与目标

Alpha-C 已用真实模型完成 A1–A5，五项都得到 `verified_success / observe / Case=None / Candidate=None`。这证明了真实执行和“没有问题时不学习”，但尚未用真实问题跑通：

```text
Gap → Case → Attribution → Lesson → Candidate
```

开发阶段不必等待线上事故。下一步建立一个规模小、确实有用、验收客观的真实项目：**AI API 费用小账本**。项目源于本阶段已经发生的真实问题——本地最高费率投影一度被误当成实际账单余额，而用户查询 Provider 后确认实际累计费用只有 CNY 0.48。

本试验的目标有两个：

1. 交付一个用户可以继续使用的小工具；
2. 在不制造失败的前提下，为 Alpha-C 提供真实任务和可能的学习触发。

试验不保证一定产生 Candidate。Champion 全部完成时，合法结论仍是无 Case、无 Candidate。

本试验的被测对象是 Tianwen。监督会话不是产品实现者，也不能在 Tianwen 失败后进入工作区替它完成任务；否则得到的只是会话开发结果，不是 Tianwen 的执行或学习证据。

## 2. 产品边界

产品是独立的 Python 命令行项目，建议仓库路径为：

```text
D:\Guo\zuochong\ai-cost-ledger
```

第一版只使用 Python 标准库，读取本地文件并生成：

- `summary.json`：稳定、可机器读取的汇总；
- `report.md`：用户可直接阅读的费用报告。

第一版只支持：

- 单项目；
- 人民币；
- Tianwen JSON 运行收据；
- 可选的用户账单确认文件；
- 本地离线执行。

第一版明确不做：

- 网页界面、数据库或账号；
- Provider API、自动拉取账单或 CSV 导入；
- 多币种、汇率换算或通用财务系统；
- 自动付款、充值或修改 Provider 状态。

## 3. 命令与数据流

目标命令形态：

```text
python -m ai_cost_ledger report \
  --receipts <收据目录> \
  --budget-cny 20 \
  --rate-cny-per-million 27 \
  --billing-confirmation <账单确认文件> \
  --output <报告目录>
```

`--billing-confirmation` 可省略。确认文件只记录实际花费、币种、查询日期和来源类型，例如 `user_confirmation`。仓库没有正式账单文件时，不生成或声称 invoice digest。

处理流：

```text
读取收据
→ 校验并去重
→ 汇总已知请求数与 Token
→ 单独计算保守投影
→ 可选读取实际账单确认
→ 分别计算投影状态与实际预算状态
→ 原子写入 summary.json 和 report.md
```

## 4. 费用与证据权威

工具必须把以下事实分开，不允许互相冒充：

1. **Observed usage**：本地收据实际记录的请求和 Token；
2. **Projection**：按给定费率计算的估算；
3. **Actual billing**：用户确认或未来导入的 Provider 账单；
4. **Unknown**：本地证据不足，无法精确得出的部分。

规则：

- 金额使用十进制计算，不使用二进制浮点数；
- 实际账单决定当前实际预算余额；
- 实际账单不会删除 Token 汇总或保守投影；
- 没有实际账单时，实际花费和实际余额为未知，不能用投影替代；
- 部分收据缺少 Token 时，保留已知小计并明确标记不完整；
- 完全相同的重复收据只计算一次；
- 同一收据 ID 对应不同内容时记录冲突，不擅自选择；
- 相同输入必须生成确定性的 JSON 和 Markdown。

完整输入返回成功状态。存在未知或冲突时仍生成报告，但返回明确的 incomplete 状态，并列出来源文件和原因。

## 5. 三个真实增量任务

首个付费 Trial 前冻结三个产品需求及其验收规则。后续任务的代码基线只能从前一任务的已验证产品提交机械派生，不能根据模型失败临时改变要求。

### B1：收据汇总

- 扫描多份 JSON 收据；
- 汇总请求数与已知 Token；
- 计算并标记保守费用投影；
- 生成确定性的 JSON 和 Markdown。

### B2：账单权威

- 读取用户账单确认；
- 分开展示估算与实际扣费；
- 由实际账单计算实际剩余预算；
- 缺少账单时不得伪造实际余额。

### B3：部分真相与冲突

- 处理缺少用量、格式错误和重复收据；
- 区分完全重复与 ID 内容冲突；
- 保留已知小计；
- 输出 incomplete 状态和可定位的原因。

B1–B3 都是产品真实需求，不是专门为让模型失败而设置的陷阱。

## 6. Tianwen 试验接入

产品代码与治理验证分离：

- `ai-cost-ledger` 仓库保存真实产品代码和公开测试；
- Tianwen 仓库保存 B1–B3 的冻结任务说明、基线摘要、公开检查和模型不可读的最终验证器；
- Trial 使用一次性工作区，成功结果经独立验证后才形成可审查的产品补丁；
- 产品仓库中的用户未提交修改不得进入 Trial，也不得被覆盖。

现有 Alpha Trial 只接受 A1–A5。首个实施切片只把允许的任务 ID 窄扩为 B1–B3，并复用已有：

- Docker 隔离；
- Champion/Manifest 冻结；
- DeepSeek non-thinking 模式；
- 预算、usage 和 Evidence；
- final verifier 与 Learning Intake。

不建设任意外部任务路由、第二套 Runner、恢复框架或通用插件系统。

### 6.1 监督会话与 Tianwen 的职责边界

监督会话可以：

- 在付费运行前冻结 Goal、任务说明、公开检查、最终验证器、权限和预算；
- 启动 Tianwen 的 Champion Trial；
- 只读观察 Tianwen 的 Run、Action、Evidence、usage、diff 和验证结果；
- 根据已批准规则判断继续、停止、复验或进入学习分诊；
- 发现 Tianwen Runtime 或验证设施缺陷时，停止产品 Trial，并把基础设施修复作为独立工程阶段处理。

监督会话不可以：

- 编写、修改或补全 `ai-cost-ledger` 的产品实现；
- 在 Tianwen 失败后手工修复产品，再把结果记到 Tianwen 名下；
- 把参考实现、最终验证器内容或答案提示注入模型上下文；
- 手工编造失败解释、Lesson、Candidate 或评测胜利；
- 把会话自己的代码提交冒充 Tianwen 生成的产品补丁。

产品工作区的写入必须来自被记录的 Tianwen Action。监督会话只验证该 diff，并在验证通过后按既定 Git 流程收拢 Tianwen 已产生的提交或补丁。Candidate 也必须由 Tianwen 的学习链基于持久化 Case 和 Lesson 生成；监督会话只负责门禁和审计。

## 7. 学习触发与 Candidate

学习入口只有两种：

### 7.1 重复的客观失败

某个 B 任务出现 `qualifying real + completed + final not_met` 后，从相同冻结基线使用同一 Champion 做一次独立复验。只有问题指纹和作用域一致，才允许形成 Signal、Ticket 和 Case。

### 7.2 明确用户纠正

用户实际阅读生成报告后，明确指出行为违反需求，可以按现有用户反馈 Evidence 规则产生 Signal。普通偏好、模型自省或“看起来还能更好”不能冒充明确纠正。

Case 形成后必须先归因。只有证据支持缺陷位于 `repo_task_skill`，才能接受带 `when / not_when / evidence` 的 Lesson，并生成至多一个 Candidate。模型、工具、任务说明或验证器问题只能进入对应修正或 no-Lesson 结论。

Candidate 只修改 `repo_task` Skill，不直接修改正式 Champion。随后复用 Alpha-B 做同条件比较。Alpha-D 仍要求独立保护任务、人工首次晋升和后续不同任务证据。

## 8. 预算与停止条件

用户已确认 Alpha-C 实际累计费用为 CNY 0.48；standing CNY 20 授权的当前实际余额为 CNY 19.52。历史最高费率投影不是当前执行余额。

范围内的低成本 Trial 不重复询问用户。以下情况停止：

- 达到 CNY 20 总授权；
- B1–B3 全部成功且没有明确用户纠正；
- 失败不能归因或证据不一致；
- Runtime、Provider、验证器或环境失败；
- 行动需要扩大 Goal、权限或不可逆外部效果。

有剩余预算本身不是继续寻样的理由。

## 9. 验证与完成定义

产品验证至少覆盖：

- 多收据稳定汇总；
- 十进制金额；
- 投影与实际账单分离；
- 无账单时 actual 为 unknown；
- 部分用量；
- 完全重复去重；
- ID 冲突；
- 确定性 JSON/Markdown；
- 输入不被修改；
- 输出写入失败时不留下冒充完成的半份正式报告。

试验阶段的合法终态有两种：

1. **无候选完成：** 产品任务成功，没有真实学习触发；
2. **候选路径完成：** 真实 Case、明确归因、条件化 Lesson 和至多一个 Candidate 均持久化，Candidate 仍未晋升。

只有第二种终态才能继续申请 Alpha-D。第一种终态得到可用产品，但不能宣称天问已经展示候选学习。

## 10. 实施顺序

1. 建立不含产品答案的独立仓库基线，并冻结 B1 任务和验证器；
2. 最小扩展 Alpha Trial 的 B1–B3 ID 支持并离线验证；
3. 由 Tianwen 依次执行真实任务，监督会话只观察持久记录和结果；
4. Tianwen 产生且独立验证通过的补丁进入产品仓库，失败按重复证据门处理；
5. 只有 Case 成立后才另开 Attribution/Lesson/Candidate 窄切片；
6. 无 Candidate 时停止，不进入 Alpha-D。
