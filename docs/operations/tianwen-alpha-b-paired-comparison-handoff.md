# Tianwen Alpha-B 公平成对比较阶段交接

日期：2026-08-18  
状态：**未通过完成门；被 1 个恢复路径 Important 正确性问题阻塞**

## 1. 阶段结论

Alpha-B 的主要离线比较设施已经实现并通过聚焦、全量和多轮独立复审，但最终 scoped correctness re-review 证明 durable `resume()` 仍可在已冻结 pair authority 后换用不同模型/Provider 执行下一轮请求。

因此本阶段：

- 不宣称 Alpha-B 完成；
- 不合并到 `main`；
- 不自动进入 Alpha-C；
- 保留 stage branch、全部设计/计划/实现/修复提交和负面证据；
- Runtime 继续冻结；
- 唯一推荐入口是一个很窄的 paired-resume identity revalidation repair。

这不改变 Stage A 的事实：Stage A 仍是 failed live proof / request-limit-exceeded / Goal active 1/1 exhausted，并仅按停止条件有界关闭，不是成功。

## 2. 已完成范围

### 2.1 设计与计划

- 设计：`c117715` — `docs: design Alpha-B paired comparison`
- 计划：`196fa63` — `docs: plan Alpha-B paired comparison`

### 2.2 实现

- `ba668ae` — 显式不可变 Champion/Challenger 行为版本与稳定条件快照；
- `c233964` — pair authority、PASS/FAIL/INCONCLUSIVE 和双腿结果投影；
- `bcb1429` — durable store identity 与 malformed receipt 诚实分类；
- `82618d2` — 确定性重复汇总；
- `ae64dfa` — 缺腿 totals 保持 unknown，真实执行 AB/BA 两对；
- `ff6baef` — durable pair authority/result 锚定、角色父链、真实执行配置绑定、partial truth、aggregate 自校验，以及 fresh execute identity drift 防护。

实现保持以下边界：

- 复用 A1–A5、现有 `AlphaTrialRunner`、工作区和最终验证器；
- Champion/Challenger 使用独立 Trial、store、workspace、Goal 和 prompt history；
- 同模型、设置、Provider、预算、任务、基线、policy、tools、镜像、完整 container config、checks 和 verifier 有机器摘要；
- 缺失、malformed、unavailable、invalid、inconclusive、unknown 不会被当成零分或胜利；
- 两对 fake-model/fake-Docker Trial 按 AB/BA authority 的真实顺序运行并确定性汇总；
- 没有修改 DSH Runtime、TypeScript Evidence/Evolution、通用 evaluator、任务包、active pointer 或 Docker 执行语义；
- 没有 Candidate 自动生成、晋升、Shadow 或统计推断。

## 3. 未完成与阻塞证据

最终 scoped re-review 的唯一开放 finding：

- `src/tianwen/alpha.py:752` 的 durable `resume()` 以当前 runner model 重建 `PreparedTrial`；
- fresh `execute()` 已在 `src/tianwen/alpha.py:1267` 对 prepared model/provider/executor identity 做 Goal/请求前复核；
- 但 `resume()` 没有读取该 Trial store 中的 `alpha_pair_authority`，也没有把当前 model/provider/executor snapshot 与 authority 的 `common_condition` 比较；
- 独立聚焦探针证明：A5 第一轮持久化后更换模型，`resume()` 接受新模型、发送 1 次请求并返回 completed；由于 manifest/result 仍保留旧 model id，后续 comparison 可能仍为 PASS。

这是 Alpha-B “同模型、同条件且不能中途漂移”完成门的直接缺口，不是文档或测试噪声。

## 4. 唯一推荐修复入口

只做 paired durable resume identity revalidation：

1. `resume()` 打开 Trial store 后，若存在该 Trial 的 `alpha_pair_authority`，在 recover 或下一轮模型请求前读取 authority；
2. 用现有 credential-free snapshot 重新计算当前 model settings/class、Provider class/name/base/model id，以及 executor/preflight/container config；
3. 与 authority `common_condition` 精确比较；不一致立即抛出 `AlphaTrialError`；
4. 增加 A5 round-1 durable resume 的 model drift 和 Provider drift RED，断言替换模型请求数为 0；
5. 跑 comparison、Alpha Trial、全量 Python、Ruff、TS/DSH 离线门；
6. 新鲜独立 correctness 和 Ponytail/YAGNI 复审通过后，才允许恢复 Alpha-B Git 收口。

禁止借此新增 scheduler、通用 envelope、Runtime fork、Prompt shim、Candidate 生成、晋升或 Shadow。

## 5. 测试与验证证据

修复提交 `ff6baef` 的 fresh gates：

- final-review focused：`12 passed, 28 deselected`；
- `tests/integration/test_alpha_comparison.py`：`40 passed`；
- `tests/integration/test_alpha_trial.py`：`40 passed`；
- owned Ruff：通过；
- `git diff --check`：通过。

修复前 stage-head `ae64dfa` 的主控串行 release gates：

- Alpha-B pair：`29 passed`；
- Alpha Trial：`40 passed`；
- A1–A5：`10 passed`；
- 全量 Python：`461 passed, 4 skipped`；
- Ruff：通过；
- Runtime Bundle 拓扑 build：通过；
- TypeScript typecheck：通过；
- DSH rc.6 install/public surface：通过；
- private imports：0；
- Vitest：`244 passed, 7 skipped`。

`ff6baef` 之后尚未重新跑全量 Python/TS/DSH，因为最终 scoped re-review 已给出阻塞证据；继续重复无关重门不能消除恢复路径缺口。

## 6. 独立复审

- Task 1：spec/code quality approved，0 findings；
- Task 2：首审发现 store context 与 malformed receipt 两项，修复后 scoped re-review 全部 addressed；
- Task 3：首审发现 missing-arm totals 与伪 AB/BA 证据两项，修复后 scoped re-review 全部 addressed；
- 整分支 correctness 首审：C1/I3/M2；统一 final fix wave 后原 6 项全部 addressed；
- final scoped correctness：C0/I1/M0，**Ready to merge: No**；
- 修复前、修复后两次 Ponytail/YAGNI：均为 `Lean already. Ship.`。

## 7. 模型、Docker 与预算

- 真实模型请求：0；
- 模型 token：0；
- 模型费用：CNY 0 / 已批准 Alpha-B CNY 20；
- 真实 Docker：0；
- 测试只使用 fake model / fake Docker。

未消费预算不是缺口：在恢复路径正确性门未通过、且真实 Docker 未授权时，付费调用不会增加可信证据。

## 8. Git 状态

阶段分支：`codex/tianwen-alpha-b-paired-comparison`  
实现/修复 head：`ff6baeff6b9163c41ab6e2336375de9fa6cf566a`
首个 handoff 提交：`825e675980ed04fc86b4b46e1c0816e1095870e2`

2026-08-18 收口 fetch/`ls-remote` 核对：

- 本地 `main`：`9208f3117230f0dab1001423231716ddbee2abe8`；
- `origin/main`：`9208f3117230f0dab1001423231716ddbee2abe8`；
- GitHub `main`：`9208f3117230f0dab1001423231716ddbee2abe8`；
- 三者一致，网络正常；
- 该 main 新增的是持续学习架构决策收敛文档，Alpha-B 分支不得覆盖它们。

Alpha-B 分支基于 `2b95b31b9927626c20808d39d018cbd47c0270c1` 开始；因为当前阶段被正确性证据阻塞，所以：

- stage branch 将正常 push 保留；
- `main` 保持上述最新 `9208f3117230f0dab1001423231716ddbee2abe8`，本阶段不写入；
- 不 merge、不 rebase、不 squash、不 force-push；
- 后续修复通过后，必须先把 stage branch 以正常 merge 方式收拢到当时最新 main，并保留 main 上的新架构文档；
- GitHub/main 网络核对若失败，只报告网络不确定性。

## 9. Pending user decisions

无。

当前阻塞是既有 Alpha-B 范围内的普通工程正确性问题，不是 Goal/成功标准变化、授权扩大、预算扩大、重大不可逆风险或产品价值取舍。监督会话可以根据本交接安排上述唯一窄修复，无需等待用户休息结束。
