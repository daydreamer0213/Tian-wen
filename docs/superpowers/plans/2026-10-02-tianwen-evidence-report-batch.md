# 真实证据报告批次 Implementation Plan

> **For agentic workers:** 使用 executing-plans 按任务执行；原生待评交付必须由天问完成，控制器仅负责事前合同、独立案例、环境、收据和真实消费核对。

**Goal:** 获取一次有实际报告用途、结果未知的前瞻批次证据，并在合法来源出现时推进完整自动学习。

**Architecture:** 复用现有DEV Runtime、正式文件捕获和Python隔离检查；三个有限离线报告程序共享稳定的检查器环境身份。所有预期先冻结，研究只由原来源选择器触发，激活仍隔离。

**Tech Stack:** 已安装DSH/DeepSeek、Node/tsx、缓存Python Docker镜像；不安装依赖。

## Global Constraints

- 原完整目标、发布门槛、十工作日窗口、NO-GO/隔离保持。
- 原生输出不由控制器补写，不强造失败/反馈，不重跑旧题或实际批次求通过。
- workRoot固定，contract与输入变化允许，checker/runner及model身份不得意外变化。
- 单题1尝试/0重试，14文件工具/9根请求/12分钟；D至少15GiB。
- 目标工具现在blocked，新建被unfinished拒绝，执行恢复与目标UI状态分别报告。

### Task 1: 冻结批次和独立依据

**Files:** Create `docs/operations/evidence-report-batch-contract.md`，运行包 `D:/DevData/tianwen-evidence-report-batch-20261002`。

- [ ] 写全三个原合同和两个独立预留合同；记录真实输入源与范围，固定案例及预期JSON、源码/运行器/镜像身份。
- [ ] 核对每个原要求都有适用检查，原数据投影与原始记录一致；不把格式诊断强行作为原功能失败。
- [ ] 冻结总包并只读审查，确认没有空白/TBD/答案依赖；在原生输出前提交。
- [ ] 零模型预检服务、声明文件能力、稳定检查器身份及清理边界；不存在目标文件是当前缺功能的红证据。

### Task 2: 普通原生三个交付

**Files:** Tianwen owns `scripts/summarize-task-evidence.py`、`scripts/summarize-study-evidence.py`、`scripts/reconcile-regression-evidence.py`；控制器不写这些候选。

- [ ] 每题原生read合同→目标write/edit→read，首次根请求前正式检查已prepare，单题只执行一次。
- [ ] 保存未知原结果、原生文件证据、检查和模型复核；0模型冷恢复精确原任务/材料/检查，旧账本前缀不改。
- [ ] 使用冻结的真实输入消费已核验候选，核对实际报告；失败原样保留、拒收/还原，成功候选原样审查接纳，不事后修稿。
- [ ] 单独审查语义范围、计数归属及简洁性；保留所有候选结果而非只保留成功。

### Task 3: 来源到研究的薄装配

**Files:** 优先运行包内现有host hook薄组合，只有证明需产品接缝才修改仓库。

- [ ] 在可能形成第三条合法组合之前，按冻结任务包+实际完整保存材料装配closed五角色，缺匹配停止，不编期望。
- [ ] 合法组合才运行一次研究，核对准备先于设计、十臂实际独立检查、原双审与裁决；没有组合则记录本批未触发。
- [ ] accepted与activation分别报告；未经原发布门槛不解除正式隔离。

### Task 4: 未来效果、收口与资源

- [ ] 仅在原治理允许实际生效后，用后续不同真实输入核对精确方法版本/原要求/效果与退化；否则保持未证明。
- [ ] 核对原撤回、冷恢复、回滚证据，不能用受控机制替代自然收益。
- [ ] 核验本轮容器全部边界/清除、任务进程终态；保留小回执与原压缩数据，不复制Profile/依赖，恢复Docker原状态。
- [ ] 更新权威交接及准确目标工具状态；完整目标未证不得complete，原期限不顺延。
