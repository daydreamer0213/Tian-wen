# 天问（Tianwen）

[English](README.md)

天问是一个面向长时间运行 Agent、可审计的学习控制面。

**研究预览。** DSH 0.1.0-rc.7 是唯一的产品 Agent Runtime。天问在后台以非干扰方式
工作：它在一次正常 DSH Run 结束后读取执行事实，不替换正在运行的 Agent，也不热切换
当前 Run。本预览已证明正常 Agent execution、Evidence 只读投影，以及
zero qualifying signal → `no-case`、`candidateCreated=false`。它还证明了一个在用户结果完成后
运行、不会阻塞当前 Run 的显式反馈学习入口。它还证明了跨不同 Tianwen Run 的结构化
Outcome 重复失败入口、一个受治理 Skill Candidate 入口和一条成对 Skill Evaluation
记录。Candidate/Shadow/Promotion 尚未完成。

## 为什么需要天问

Agent 可以完成一次 Session，但长期治理还需要回答另外一些问题：结果由哪些证据支持、
不同 Run 之间发生了什么变化，以及反复出现的信号是否足以支持未来版本发生改变。
天问的目标是让这些决定可追溯，同时把当前执行继续交给 Runtime。

## 架构：DSH 执行，天问治理，Alpha 负责实验

| 层 | 职责 |
| --- | --- |
| **DSH** | 运行当前 Agent Session。天问直接复用它的模型与 Provider、Agent loop、工具、MCP、sandbox、Session Query、Skill、Jobs、Workflow、Subagent、Message Feedback、Approval 和 permissions。 |
| **天问** | 保留跨 Run 治理边界，包括 Goal Graph、Evidence provenance（证据来源与流转记录）、学习归因和面向未来 Run 的版本治理。当前预览实际运行了 Evidence 只读投影、谨慎的 no-case 判断、显式反馈 Signal/Ticket 入口、结构化 Outcome 重复失败入口和成对 Skill Evaluation 记录。 |
| **Alpha** | Alpha 是实验与评测资产，不是第二套产品运行时。 |

DSH Message Feedback 只是学习归因的一项输入，本身不等于 Lesson。DSH Job 表示当前进程
中的工作，不等于可跨 Run 持久保存的 Learning Ticket。详细边界以
[架构总览](docs/tianwen-architecture-overview-v2.md)为准。

## 当前预览证明了什么

确定性演示走正常的 DSH Agent loop：脚本化 Adapter 返回两次响应，确定性的
`summarize` 工具执行一次，最终状态为 `execution.status=completed`。随后天问投影出一条
完整 Evidence，而且没有改写 DSH Session；同一次 Run 内，投影前后的事件摘要完全一致。

因为没有反复失败或用户纠正，正确的学习结果是 `no-case`、零个有效信号和
`candidateCreated=false`。这只证明了有边界的执行与 Evidence 结果，不证明通用自主学习
已经完成。

带有具体说明的显式负面反馈可以创建持久化 Signal/Ticket。第二个零成本演示通过真实
DSH Message Feedback 服务写入反馈，在最终答案完成后消费存储快照，并把一条 Signal 和
一个开放 Ticket 写入现有 evolution ledger；重复消费保持幂等，而且不改变 Session。
正面反馈和没有说明的负面反馈都不会创建 Ticket。
第一次普通可复用失败只记录 Signal；来自另一个 Tianwen Run 的第二次同类失败才创建一个开放 Ticket。
重复 Outcome 证明使用两个不同的 Tianwen Run，并分别绑定两个 DSH Session；重复消费保持幂等，
两个 Session 都不改变。这是零成本合成合同夹具，不是生产环境中自然积累的学习证据。

受治理 Skill Candidate 证明把三次真实 DSH `skill` 工具使用绑定到两个支持 Run 和一个相关
的 met Run，再记录一个 Case、Attribution、Lesson 和惰性 Candidate。Candidate 状态仅为 `recorded`（已记录）；Attribution、Lesson 和 Candidate 内容是确定性的合成合同数据。
Candidate 不会注册到普通 Run，也不会进入 Shadow 或 Promotion；这不是生产自主学习。

成对 Skill Evaluation 证明先在 Candidate Case 之前冻结协议，再为冻结的父版本 B 和已记录
Candidate C 运行成对、隔离的普通 DSH Agent。它捕获真实的第一条 DSH 模型请求，要求去除
Skill 差异后的归一化请求一致，并冻结可见的模型工具表面，为每个臂保存独立的 Outcome/Evidence 和私有 Evaluation
结果。这是脚本化机制证明，因此真实效能结论始终是 `INCONCLUSIVE`、`not-comparable` 和
`needs-evidence`，不会声称 C 优于 B。Candidate 仍仅为 `recorded`，不会安装、路由、进入 Shadow、Promotion 或 Reject。
可执行评测器只接受零成本 scripted adapter，非 scripted Provider 会在创建评测 Agent 前被拒绝。工具摘要
只是可见工具表面，不是 DSH Policy/权限证明；Policy、workspace、data 和 validator 的独立绑定仍明确为
未观察/未绑定。因此历史结果不能进入 Shadow；真实付费证明必须等待一份独立的 preflight、预留、可信
receipt 与 tally 设计。

## 零成本演示

安装锁定的依赖，然后运行：

```console
pnpm install --frozen-lockfile
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
pnpm demo:paired-skill-evaluation
```

每个演示只输出一个格式化 JSON 对象，不使用网络、Provider、token 预算、付费模型、
Docker、持久化数据库或用户数据。research-preview 演示报告一条完整 Evidence 和
`no-case`；explicit-correction 演示报告已存储的负面反馈、一条 Signal、一个开放 Ticket、
重复消费命中幂等和 `candidateCreated=false`；repeated-outcome 演示报告两次结构化
`not-met`、两条 Signal、一个开放 Ticket、幂等回放和不变的 Session；governed-skill-candidate
演示报告三份冻结的 Skill manifest/use、一个 Case/Attribution/Lesson 和一个 `recorded`
Candidate。所有演示的 Session 前后摘要都相同。不同 Run 的摘要可能因事件中包含本次运行
数据而不同；承重事实是同一次 Run 内前后相等。paired-skill-evaluation 演示额外报告一个
Candidate 之前冻结的协议、八个隔离的 B/C 臂、一条私有 Evaluation 结果、回放/重启检查和
明确的 `INCONCLUSIVE` 脚本化机制结论；根 Skill registry 与新建普通 Agent 保持不变。

## 当前限制

- Stage 4 只记录了一条成对 Evaluation 结果。脚本化证明只证明机制，不构成独立效能
  Evidence；Shadow、Promotion、Active Pointer、Reject、Rollback 和生产自主生成尚未完成。
- 当前预览不提供生产 SLA，也没有完成的用户界面。
- 一次成功执行不会自动产生学习，未来版本也不能进入正在运行的 Agent。
- 已知的首次 Profile 初始化诊断另有事实记录，不能把它写成已经通过的发布门。

## 仓库地图

- [`scripts/run-research-preview-demo.ts`](scripts/run-research-preview-demo.ts)
  是确定性的 no-case 演示；[`scripts/run-explicit-correction-demo.ts`](scripts/run-explicit-correction-demo.ts)
  是显式反馈学习入口演示；[`scripts/run-repeated-outcome-demo.ts`](scripts/run-repeated-outcome-demo.ts)
  是结构化 Outcome 重复失败演示；[`scripts/run-governed-skill-candidate-demo.ts`](scripts/run-governed-skill-candidate-demo.ts)
  是受治理 Skill Candidate 演示；[`scripts/run-paired-skill-evaluation-demo.ts`](scripts/run-paired-skill-evaluation-demo.ts)
  是成对 B/C Skill Evaluation 演示。
- [`packages/tianwen-dsh-compat`](packages/tianwen-dsh-compat) 是 DSH 公共兼容接缝。
- [`packages/tianwen-evidence`](packages/tianwen-evidence) 实现 Evidence 只读投影。
- [`docs/tianwen-architecture-overview-v2.md`](docs/tianwen-architecture-overview-v2.md)
  是详细架构的权威入口。
- [`docs/research`](docs/research) 保存有边界的研究证据和审计记录。
- [`tests`](tests) 包含零成本合同与稳定门。

## 开发命令

```console
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/repeated-outcome-demo.spec.ts tests/dsh-probe/skill-governance.spec.ts tests/dsh-probe/skill-governance-runtime.spec.ts tests/dsh-probe/governed-skill-candidate-demo.spec.ts tests/dsh-probe/skill-evaluation.spec.ts tests/dsh-probe/skill-evaluation-runtime.spec.ts tests/dsh-probe/paired-skill-evaluation-demo.spec.ts
uv sync --frozen --dev
uv run ruff check .
uv run pytest
```

支持版本和贡献边界见 [CONTRIBUTING.md](CONTRIBUTING.md)，私密漏洞报告方式见
[SECURITY.md](SECURITY.md)，英文入口见 [README.md](README.md)。

## 许可证

天问采用 [Apache License 2.0](LICENSE)。
