# 天问（Tianwen）

[English](README.md)

天问是一个面向长时间运行 Agent、可审计的学习控制面。

**当前产品快照：Runtime 0.1.9；Stage 7 仍已完成。** DSH 0.1.1-rc.2 是当前精确支持的
Agent Runtime。普通入口已经内化到 DSH Web/Desktop 对话：用户输入 `/goal <长期目标>` 即可
启动，不需要打开天问面板，也不需要填写 Task 或执行轮数。天问使用稳定的 Planner Session
自动维护后续 Task，每个已接纳 Task 在自己的 DSH Session 中执行。用户可在同一对话中自然
补充方向、纠偏、暂停或恢复；DSH 原生停止按钮也会暂停连续 Goal。天问复用 DSH 的模型、
工具和运行时，不替换正在运行的 Agent，也不热切换当前 Run。

Runtime 0.1.9 把主反馈真正放回正常对话：首个 Task 开始、Task 切换、阻塞和最终完成时，
原控制会话会收到一条普通助手回复，说明当前计划位置、刚完成的结果、正在做的工作和已知下一步。
新连续 Goal 的 Planner/Task 使用 DSH 原生父子 Session 元数据，不再占用普通“未分组”会话列表。
Runtime 0.1.7 的独立紧凑卡片已删除，不再作为入口。
“长期目标”面板仍只是可选历史和诊断，不是主要控制界面。

判断一项能力当前是否已经实现时，以[架构总览的“当前状态”](docs/tianwen-architecture-overview-v2.md#当前状态2026-09-01)、
[当前项目权威交接](docs/operations/tianwen-current-project-handoff.md)、
[原生对话进度交接](docs/operations/tianwen-native-conversation-progress-handoff.md)和当前 `main` 源码为准。
设计、实施计划及早期自然运行交接保留历史决策和证据；其中未勾选的步骤或当时的“下一道门”
不得反向覆盖较新的发布状态。

“长期目标”弹窗也会汇总由 Task 反馈形成的改进线索，显示来源 Goal、Task、时间和重复次数。
用户可以明确点击“分析一次”，让当前配置模型在一个普通 DSH Session 中读取私密反馈并给出
只读分析；重启后仍打开同一个 Session，不会自动再发起一次分析。线索和分析结果都不会自动
变成 Case、Skill 或代码修改。分析进入终态后，用户可以把线索标记为“已审阅”；它默认从待处理
列表隐藏但仍可查看，同类问题再次出现时会自动回到待处理。“已审阅”不表示问题已修复或系统已学会。

一个使用配置模型的全新自然任务已经通过已安装产品路径闭合：Goal 完成，
45 条 Evidence 全部完整，`Outcome=met`，学习正确返回 `no-case`，父 Skill 使用记录成功，
随后模型恢复 offline。这是项目所有者实际使用形成的单用户产品证据，不是外部用户验证，
也不证明普遍效能。

Stage 7 项目所有者自然任务和官方 installer/status 证明仍已完成。
五任务 B/C、盲态 evaluator、隔离 Shadow 与 Promotion/Rollback/Restore 产品机制已经实现，并由 0-external-Provider scripted 全链夹具覆盖。
一个全新的官方已安装 configured-DeepSeek 受控生命周期现已返回 `passed`。Activity-22
闭合了全部 25 个正式角色，包括 5 个 evaluator、5 个 Shadow 和 3 次 transition，随后恢复
offline。证据仍固定为
`naturalUserEvidence=not-claimed` 和 `externalUserEvidence=not-claimed`。

## 已安装入口准备状态

正常的一次性产品流程现在会在返回前完成 Profile 关闭：

```text
模型激活 → 新 status 确认选择 → 首次 controlled-lifecycle 调用开始正式评测 → offline 恢复 → 最终 status
```

这是 DSH/HMR 的关闭生命周期修复，不是 receipt 或安全功能。HMR 拥有 Profile 启动时创建的 watcher readiness promise；关闭先于 readiness 到来时，修复让这个 owner 得到确定的终态。天问不增加第二个关闭控制器，不重试、不延时，也不强制退出。

activity-03 在历史上仍已消费。它的 DeepSeek model-use receipt 已持久化，但进程在任何 controlled-lifecycle 调用之前以 exit 13 结束；`controlled-lifecycle invocation=0`，offline 恢复和最终 status 均成功。activity-01、activity-02 和 activity-03 的历史分类不被改写，本次修复不声称真实 Provider 成功。

模型激活及其确认 status 仍属于产品准备，不消费正式 Activity。Activity-22 随后通过唯一一次
官方 `controlled-lifecycle` 调用完成已安装产品状态机，并恢复 offline。这个当前成功不会改写
activity-01、activity-02 或 activity-03，也不建立 Provider 账户请求计数或用户效果主张。

[Activity-22 交接](docs/operations/tianwen-v0.1-controlled-real-activity-22-handoff.md)记录当前正式结果和
证据边界。[一次性 Profile 生命周期修复交接](docs/operations/tianwen-v0.1-one-shot-profile-lifecycle-repair-handoff.md)、
此前的[准备状态交接](docs/operations/tianwen-v0.1-controlled-real-operation-readiness-handoff.md)和
[activity-01 交接](docs/operations/tianwen-v0.1-controlled-real-activity-01-handoff.md)仍是历史记录。

## 为什么需要天问

Agent 可以完成一次 Session，但长期治理还需要回答另外一些问题：结果由哪些证据支持、
不同 Run 之间发生了什么变化，以及反复出现的信号是否足以支持未来版本发生改变。
天问的目标是让这些决定可追溯，同时把当前执行继续交给 Runtime。

## 架构：DSH 执行，天问治理，Alpha 负责实验

| 层 | 职责 |
| --- | --- |
| **DSH** | 运行当前 Agent Session。天问直接复用它的模型与 Provider、Agent loop、工具、MCP、sandbox、Session Query、Skill、Jobs、Workflow、Subagent、Message Feedback、Approval 和 permissions。 |
| **天问** | 保留跨 Run 治理边界，包括 Goal Graph、Evidence provenance（证据来源与流转记录）、学习归因和面向未来 Run 的版本治理。当前预览实际运行了自然 Run/Skill 绑定、Evidence 只读投影、谨慎的 no-case 判断、Signal/Ticket 入口、合成 Candidate 入口、受控 Evaluation、隔离 Shadow 和面向未来 Run 的指针转换。 |
| **Alpha** | Alpha 是实验与评测资产，不是第二套产品运行时。 |

DSH Message Feedback 只是学习归因的一项输入，本身不等于 Lesson。DSH Job 表示当前进程
中的工作，不等于可跨 Run 持久保存的 Learning Ticket。详细边界以
[架构总览](docs/tianwen-architecture-overview-v2.md)为准。

## 在已有 DSH Profile 中使用天问

当前可移植包只支持精确版本 `@deepseek-ai/dsh@0.1.1-rc.2`。先从本仓库构建唯一的
Runtime Bundle 压缩包，再交给 DSH 安装到用户自己选择的 Profile：

```powershell
pnpm --filter @tianwen/runtime-bundle... build
pnpm --filter @tianwen/runtime-bundle pack --pack-destination D:\DevData\tianwen-packs
$env:DSH_HOME = 'D:\DevData\dsh-home'
dsh plugin --profile work --allow-build=koffi add D:\DevData\tianwen-packs\tianwen-runtime-bundle-0.1.9.tgz
```

`--allow-build=koffi` 是写入当前 Profile 的 pnpm 明确许可，不会修改全局 pnpm 设置。只有
当所选 pnpm store 已包含完整依赖时，才在压缩包路径前增加 `--offline`。

安装在该 Profile 内的 `tianwen` 命令可以直接指向这套已有 DSH，不要求使用天问托管
产品目录。下面的 `DSH_PACKAGE_ROOT` 是已安装 `@deepseek-ai/dsh` 包的目录，不是
`DSH_HOME`：

```powershell
$DshPackageRoot = (Resolve-Path 'D:\path\to\your\dsh-host\node_modules\@deepseek-ai\dsh').Path
& "$env:DSH_HOME\profiles\work\node_modules\.bin\tianwen.cmd" list --dsh-root $DshPackageRoot --dsh-home $env:DSH_HOME --profile work --state-root "$env:DSH_HOME\profiles\work\state"
```

只需把第一行的路径替换为你自己的 DSH 包位置。

使用 `dsh plugin --profile work remove @tianwen/runtime-bundle` 只移除 Bundle；Profile
下 `state` 目录里的天问状态会保留。对于项目方自己控制的部署，仓库自带的托管安装器仍是
另一种可选路径：

```powershell
node scripts/install-tianwen.mjs --data-dir D:\DevData\tianwen --json
```

可选的 Tianwen Desktop 复用用户现有的 DSH 与 Web Profile；它不是第二套 Runtime，也不要求
用户改用天问托管安装目录。Desktop 打开的是同一套 Goal-first 界面，旧的精确 Runtime
`0.1.8` Profile 可在用户确认后更新到内嵌的 `0.1.9`；未知或损坏版本不会被自动覆盖。

安装后，在普通 DSH Web 或 Tianwen Desktop 对话中输入 `/goal <长期目标>`。天问会自动派生
Task，让每个已接纳 Task 在独立 DSH 子 Session 中执行，并在 Task 边界继续推进。与 Goal 有关的
自然语言补充继续留在控制对话中；原生停止按钮会暂停 Goal，`/goal resume` 可继续。“长期目标”
面板只保留为可选的高级历史入口，不是第二套连续模式界面。用户不需要预先填写 Task 数量或
执行轮数，天问也不会新增自定义进度 Session 事件。关键进度通过正常模型 Turn 持久化为普通
助手消息；安装该能力前已经完成的历史 Goal 不会为了补一条新总结而重新唤醒模型。

## 当前预览证明了什么

仓库里有两类不同证据。零成本 scripted fixture 证明确定性机制；Stage 7 的自然任务证明已
安装 Runtime、配置模型、真实工具、全新 Goal、Run 绑定、Evidence、Outcome 和 Skill 使用
链路可以在项目所有者的实际使用中闭合一次。两类证据都不能证明 Candidate 已经普遍变好。

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
可执行评测器自行持有保留路由上的精确零成本 scripted adapter；路由冲突会被拒绝，非 scripted Provider 会在创建评测 Agent 前被拒绝。工具摘要
只是可见工具表面，不是 DSH Policy/权限证明；Policy、workspace、data 和 validator 的独立绑定仍明确为
未观察/未绑定。因此历史结果不能进入 Shadow；新的真实 paired B/C 必须使用冻结五任务协议和受控评测门。

后续 Stage 7 自然任务没有制造失败或 Candidate。它诚实得到 `met/no-case`：有实际用途的
任务完成，45 条投影 Evidence 全部完整，父 Skill 的成功使用得到记录。因为没有合格学习
问题，这个 Run 没有产生 Ticket、Case、Lesson、Candidate、Evaluation、Shadow 或 Promotion。

受控生命周期演示则独立证明一个永久标记为 development-only 的合成缺陷机制。
它在 Candidate 产生前冻结五类任务，通过普通 DSH Agent 运行 10 个 B/C 臂、5 个
盲态 evaluator、5 个隔离 Shadow Run 和 3 个受治理指针检查，并在现有 standing
authorization 下完成 Promotion、Rollback 和 Restore，最终为 C@rev4。这个本地
scripted 夹具只证明机制和停止线，不是自然用户改善或外部效能证据。

## 零成本演示

安装锁定的依赖，然后运行：

```console
pnpm install --frozen-lockfile
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
pnpm demo:paired-skill-evaluation
pnpm demo:controlled-skill-lifecycle
```

每个演示只输出一个格式化 JSON 对象，不使用网络或外部 Provider、token 预算、付费模型、
Docker、持久化数据库或用户数据。research-preview 演示报告一条完整 Evidence 和
`no-case`；explicit-correction 演示报告已存储的负面反馈、一条 Signal、一个开放 Ticket、
重复消费命中幂等和 `candidateCreated=false`；repeated-outcome 演示报告两次结构化
`not-met`、两条 Signal、一个开放 Ticket、幂等回放和不变的 Session；governed-skill-candidate
演示报告三份冻结的 Skill manifest/use、一个 Case/Attribution/Lesson 和一个 `recorded`
Candidate。所有演示的 Session 前后摘要都相同。不同 Run 的摘要可能因事件中包含本次运行
数据而不同；承重事实是同一次 Run 内前后相等。paired-skill-evaluation 演示额外报告一个
Candidate 之前冻结的协议、八个隔离的 B/C 臂、一条私有 Evaluation 结果、回放/重启检查和
明确的 `INCONCLUSIVE` 脚本化机制结论；根 Skill registry 与新建普通 Agent 保持不变。
受控生命周期演示用一份受隐私约束的 receipt 报告 25 个正式 Session、65 次本地
scripted 请求、45 次工具主体执行、0 次外部 Provider 请求、五任务 Evaluation 和隔离
Shadow 通过，以及 B@rev1→C@rev2→B@rev3→C@rev4 指针序列。终态回放不增加活动，
冲突的任务包会在活动前以 `task-package-mismatch` 停止，清理后专用 fixture root 为空。

## 当前限制

- 仓库里已记录的 Candidate 和成对 Evaluation 是合成机制证明；目前还没有由自然产品问题
  触发、并通过真实 paired B/C 的产品 Candidate。
- 有界受控生命周期已在 standing authorization 下通过官方已安装 configured-DeepSeek 路径完成一次。
  这次合成 operation 不建立自然用户改善、外部用户验证或 Provider 账户请求计数。
- 当前预览不提供生产 SLA，也没有完成的用户界面。
- 当前没有自然用户改善、外部用户验证或多用户泛化证据；一次成功执行也不应该自动产生学习。
- 未来版本只能影响新 Run，不能热切换正在运行的 Agent。

## 仓库地图

- [`scripts/run-research-preview-demo.ts`](scripts/run-research-preview-demo.ts)
  是确定性的 no-case 演示；[`scripts/run-explicit-correction-demo.ts`](scripts/run-explicit-correction-demo.ts)
  是显式反馈学习入口演示；[`scripts/run-repeated-outcome-demo.ts`](scripts/run-repeated-outcome-demo.ts)
  是结构化 Outcome 重复失败演示；[`scripts/run-governed-skill-candidate-demo.ts`](scripts/run-governed-skill-candidate-demo.ts)
  是受治理 Skill Candidate 演示；[`scripts/run-paired-skill-evaluation-demo.ts`](scripts/run-paired-skill-evaluation-demo.ts)
  是成对 B/C Skill Evaluation 演示；[`scripts/run-controlled-skill-lifecycle-demo.ts`](scripts/run-controlled-skill-lifecycle-demo.ts)
  是 0-external-Provider 受控全链夹具。
- [`packages/tianwen-dsh-compat`](packages/tianwen-dsh-compat) 是 DSH 公共兼容接缝。
- [`packages/tianwen-evidence`](packages/tianwen-evidence) 实现 Evidence 只读投影。
- [`docs/tianwen-architecture-overview-v2.md`](docs/tianwen-architecture-overview-v2.md)
  是详细架构的权威入口。
- [`docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md`](docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md)
  保存 Stage 7 的机制、失败现场和终局自然运行证据。
- [`docs/operations/tianwen-v0.1-controlled-skill-lifecycle-handoff.md`](docs/operations/tianwen-v0.1-controlled-skill-lifecycle-handoff.md)
  保存受控生命周期 receipt、隐私边界和证据限制。
- [`docs/operations/tianwen-v0.1-controlled-real-operation-readiness-handoff.md`](docs/operations/tianwen-v0.1-controlled-real-operation-readiness-handoff.md)
  保存历史已安装入口准备边界。
- [`docs/operations/tianwen-v0.1-controlled-real-activity-22-handoff.md`](docs/operations/tianwen-v0.1-controlled-real-activity-22-handoff.md)
  保存官方已安装 configured-DeepSeek 生命周期通过事实和证据边界。
- [`docs/operations/tianwen-v0.1-one-shot-profile-lifecycle-repair-handoff.md`](docs/operations/tianwen-v0.1-one-shot-profile-lifecycle-repair-handoff.md)
  保存 DSH/HMR 一次性关闭修复和未来 Activity 边界。
- [`docs/operations/tianwen-v0.1-controlled-real-activity-01-handoff.md`](docs/operations/tianwen-v0.1-controlled-real-activity-01-handoff.md)
  保存已消费的 activity-01 usage failure 与隔离的 activity-02 恢复门。
- [`docs/superpowers/specs/2026-08-22-tianwen-v0.1-closeout-and-controlled-evaluation-design.md`](docs/superpowers/specs/2026-08-22-tianwen-v0.1-closeout-and-controlled-evaluation-design.md)
  冻结有界的 v0.1 评测、Shadow、Promotion 和 Rollback 路线。
- [`docs/research`](docs/research) 保存有边界的研究证据和审计记录。
- [`tests`](tests) 包含零成本合同与稳定门。

## 开发命令

```console
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/repeated-outcome-demo.spec.ts tests/dsh-probe/skill-governance.spec.ts tests/dsh-probe/skill-governance-runtime.spec.ts tests/dsh-probe/governed-skill-candidate-demo.spec.ts tests/dsh-probe/skill-evaluation.spec.ts tests/dsh-probe/skill-evaluation-runtime.spec.ts tests/dsh-probe/paired-skill-evaluation-demo.spec.ts
pnpm demo:controlled-skill-lifecycle
uv sync --frozen --dev
uv run ruff check .
uv run pytest
```

支持版本和贡献边界见 [CONTRIBUTING.md](CONTRIBUTING.md)，私密漏洞报告方式见
[SECURITY.md](SECURITY.md)，英文入口见 [README.md](README.md)。

## 许可证

天问采用 [Apache License 2.0](LICENSE)。
