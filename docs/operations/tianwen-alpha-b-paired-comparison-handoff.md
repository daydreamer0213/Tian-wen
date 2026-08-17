# Tianwen Alpha-B 公平成对比较阶段交接

日期：2026-08-18  
状态：**完成门通过；允许按正常 merge 收拢到最新 `main`**

## 1. 阶段结论

Alpha-B 已完成批准范围内的离线比较设施，并诚实通过完成门：Champion 与 Challenger 可以在同模型、同预算、同工具、同任务/基线、同容器条件和同验证器下，使用彼此独立的 Trial、durable store、workspace、Goal 与上下文进行公平成对比较；两次重复按冻结的 AB/BA 顺序真实执行，并形成可复验、可确定性聚合的三值回执。

本阶段只证明比较设施成立：

- 没有自动生成 Candidate；
- 没有晋升；
- 没有进入 Shadow；
- 没有把比较结果冒充持续学习证据；
- 没有重开或扩建 Runtime。

这不改变 Stage A 的事实：Stage A 仍是 failed live proof / request-limit-exceeded / Goal active 1/1 exhausted，仅按公开机制不足的停止条件有界关闭，不是成功，旧 Goal 不得重放。

## 2. 完成范围

### 2.1 设计与计划

- `c117715` — `docs: design Alpha-B paired comparison`
- `196fa63` — `docs: plan Alpha-B paired comparison`

### 2.2 实现与修复

- `ba668ae` — 显式选择不可变 Champion/Challenger 行为版本，并冻结稳定条件快照；
- `c233964` — pair authority、PASS/FAIL/INCONCLUSIVE 与双腿结果投影；
- `bcb1429` — durable store/context 隔离和 malformed receipt 诚实分类；
- `82618d2` — 确定性重复汇总；
- `ae64dfa` — 缺腿 totals 保持 unknown，并用真实执行循环证明 AB/BA 两对；
- `ff6baef` — durable authority/result 锚定、角色父链、执行配置绑定、partial truth、aggregate 自校验与 fresh execute 身份漂移防护；
- `93e5e18` — paired durable `resume()` 身份复核，在 recover 或下一轮模型请求前拒绝 model/Provider/executor 条件漂移。

### 2.3 已证明的边界

- 同条件机器冻结：模型类与脱敏设置、Provider 身份、预算、任务、基线、policy、tools、镜像、完整 container/preflight、checks、verifier；
- 双腿隔离：不同 Trial、store、workspace、Goal、prompt history；
- 角色与行为绑定：当前 active Champion、直接子 Candidate、角色位置、Skill 版本与摘要均 fail closed；
- durable truth：pair authority 与 pair result 分别落入两腿 store，比较时重新读取并验证；
- 诚实不确定性：缺失、malformed、unavailable、invalid、unknown 不会被当作零用量、零分或胜利；
- 顺序与重复：两对 fake-model/fake-Docker Trial 分别按 AB、BA authority 的真实顺序执行并确定性汇总；
- 漂移防护：fresh execute 与 A5 durable resume 的 model/Provider/executor 条件漂移均在新模型请求前失败关闭；
- 兼容性：无 `alpha_pair_authority` 的 Alpha-A resume 保持原行为；同一身份的 paired A5 resume 可以完成第二轮，且不会新建第二个 Goal。

## 3. 明确未做

- 未修改 DSH Runtime、TypeScript Evidence/Evolution、通用 evaluator、A1–A5 任务包或 Docker 执行语义；
- 未 Fork DSH、导入私有源码、增加 prompt shim、scheduler、通用 envelope 或新框架；
- 未自动生成 Candidate、未晋升、未进入 Shadow、未做统计显著性推断；
- 未运行真实 Docker；
- 未调用真实或付费模型。

Runtime 因此继续冻结为“已知能力和已知限制的当前执行底座”。只有后续学习阶段用可重复证据证明它构成真实阻塞时，才允许重新打开。

## 4. 最终测试与验证

最终实现 HEAD：`93e5e18e13cff3462d28194c29b6307bbffa0e05`。

主控在该 HEAD 上串行执行的 fresh gates：

- paired resume 聚焦：`2 passed, 40 deselected`；
- `tests/integration/test_alpha_comparison.py`：`42 passed`；
- `tests/integration/test_alpha_trial.py`：`40 passed`；
- A1–A5：`10 passed`；
- 全量 Python：`474 passed, 4 skipped`；
- Ruff：通过；
- Runtime Bundle 拓扑 build：通过；
- TypeScript typecheck：通过；
- DSH `0.1.0-rc.6` 安装与 public surface：通过；
- private DSH imports：0；
- Vitest：`244 passed, 7 skipped`；
- `git diff --check`：通过。

4 个 Python skip 均为已知门：1 个付费 live probe 未授权运行、2 个当前 Windows 账户不能创建测试 symlink、1 个 Windows ACL 由独立测试覆盖。7 个 Vitest skip 为既有条件性跳过；本阶段没有用跳过替代 Alpha-B 证据。

## 5. 独立复审

- Task 1：spec/code quality approved，0 findings；
- Task 2：首审发现 store context 与 malformed receipt，修复后 scoped re-review 全部 addressed；
- Task 3：首审发现 missing-arm totals 与伪 AB/BA 证据，修复后 scoped re-review 全部 addressed；
- 整分支首审：C1/I3/M2；统一 final fix wave 后原 6 项全部 addressed；
- paired resume 窄修复独立复审：C0/I0/M0；
- 最终整阶段 correctness：C0/I0/M1，implementation correctness approved；唯一 Minor 是本 handoff 仍记旧 blocked 状态，本次文档更新已处理；
- 最终 Ponytail/YAGNI：`Lean already. Ship.`。

因此不存在 Critical 或 Important finding，满足合并门。

## 6. 模型、Docker 与预算

- 真实模型请求：0；
- 模型 token：0；
- 模型费用：CNY 0 / 已批准 Alpha-B CNY 20；
- 真实 Docker：0；
- 全部阶段证据来自 fake model / fake Docker 与离线回执校验。

未消费 Alpha-B 预算不是缺口：本阶段目标是比较设施的公平性与可验证性，离线证据已足够，不需要为“用掉预算”而调用付费模型。

## 7. Git 状态与收口规则

阶段分支：`codex/tianwen-alpha-b-paired-comparison`

分支起点：`2b95b31b9927626c20808d39d018cbd47c0270c1`

实现 HEAD：`93e5e18e13cff3462d28194c29b6307bbffa0e05`

2026-08-18 最终 merge 前 fetch/`ls-remote` 核对：

- 本地 `main`：`9208f3117230f0dab1001423231716ddbee2abe8`；
- `origin/main`：`9208f3117230f0dab1001423231716ddbee2abe8`；
- GitHub `main`：`9208f3117230f0dab1001423231716ddbee2abe8`；
- 三者一致，网络正常；
- 该 main 包含分支开始后新增的持续学习架构决策文档，merge 时必须完整保留。

收口只允许：

- 正常提交 canonical handoff；
- 正常 push stage branch；
- 从当时最新 main 创建普通 merge commit；
- 冲突解决不得覆盖 main 新架构文档；
- 禁止 rebase、squash、force-push 和历史改写。

最终 stage remote SHA、merge SHA 与 final `main` remote SHA 在完成正常 merge 后追加到本 handoff 的 Git 收口附录，并同时写入监督会话的结构化完成报告。

## 8. 唯一推荐下一入口

Alpha-C 的第一个窄切片：只设计并离线证明 `LearningSignal → Ticket → Case → Attribution → Lesson` 的证据链与“证据不足时无候选”门；输入只能来自重复、可归因的真实问题或明确用户纠正。

该入口不得：

- 把 Stage A 的 usage-invalid 冒充 Alpha-C 学习证据；
- 自动生成 Candidate；
- 晋升；
- 进入 Shadow；
- 重新打开 Runtime；
- 消费新的模型预算，除非另有阶段预算授权。

进入该切片前，主控必须先向监督会话 `01a00d5a-8974-7c41-b660-127c15fcecb6` 汇报 Alpha-B 完成证据，并等待其下一入口决定。

## 9. Pending user decisions

无。

Alpha-B 范围内没有尚待用户决定的 Goal/成功标准变化、授权扩大、预算扩大、重大不可逆风险或产品价值取舍。
