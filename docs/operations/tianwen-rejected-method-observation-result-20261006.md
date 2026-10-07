# 失败方法诊断进入下一轮研究：工程结果与实际验证

此前真实运行暴露的缺口是：新提案能看到原始失败来源，但不能直接看到此前候选方法在来源任务上实际退步的诊断。因此先补这条信息流，不降低原研究裁决，也不重判旧停止结果。

## 已实现

普通文本研究的提案可选加入一个 `failedMethodObservation`：旧失败方法原文，以及一个实际 `not-met` 来源候选臂的原双审诊断。逐项恢复原提案、来源执行和评审证明，绑定原输入、scope、模型、质量、family、输出模式、当前 consent revision，并要求旧停止时间早于新研究打开时间。

只投影方法和诊断，不投影旧答案、引用、审计全文、正常反例或保留案例。诊断明确为可能出错的历史观察，服从当前用户要求，不是新验收标准。没有合法观察或原 512 KiB 包体容量不足时继续原路径；文件和 Goal 模式不增加等待条件。

新研究只选择一次引用；其后提案动作沿用该引用，冷恢复验证冻结的旧 study/arm 和摘要，不重新选择最新记录。旧无该字段的包保持历史行为。复查发现并修复旧 `sourceObservations`/`proposalClues` 输入绑定遗漏：合法原生 proof 但替换旧观察的控制先失败，修复后通过。

## 工程证据

产物根目录：`D:/DevData/tianwen-rejected-method-engineering-20261006`。

- 首原生 SDK RED：下一独立来源对的提案没有失败方法观察；`red.json` 保留。
- 旧输入替换 RED：两个合法原生 proof 控制确实错误接纳旧输入；`red-prior-dependencies.json` 保留。
- 最终完整学习流程源码测试：156/156；相关 claim review/recovery/audit：87/87，合计 243 项通过，无重叠。
- 原十五条 package 构建命令全部退出 0；无依赖安装。类型和私有导入检查退出 0、零私有导入违规。
- 发布相关 240 项通过（学习 153、评审 87）；原完整发布 profile 报告 50 通过、10 原条件跳过，合计报告 290 通过。学习中的 3 个源码装配场景只在源码验证，合计 13 未运行项按原设置保留。profile 报告中的 2 项源码故障场景按原函数提前返回，不冒充发布故障注入已执行。
- 首次发布整组因操作者遗漏 `TIANWEN_GOAL_ACCEPTANCE_PUBLISHED=1`，三个源码对象监听场景失败；原报告保留。正确原环境下只重跑原 profile，50/10；另外源码模式三项实际故障控制全部通过。源码实际执行合计 246 项通过，无需修改实现、fixture 或标准。
- 限定复查此前 P2 已关闭，无新有据 P1/P2。仅认证这次改动，不冒充实际方法改善。

## 本批实际结果（44f113bf）

原 CLI 共 65 个真实模型请求，零脚本主答、零新来源 Task，原 Loop 自然完成两个原未尝试来源组合。实际请求 2 和 33 都收到来自旧 study986afb0d 的原方法、source1 原双审诊断及摘要，独立投影核对通过；信息流是真实进入模型，不只是 SDK 场景。

1. study2cab6ab0：source1 inconclusive→met；source2 met→met；counterexample not-met→met；adjacent met→not-met。原 `candidate-failed` 提前停止。adjacent 两检查都核正文事实正确，但实际交付夹入 `</answer>`、`</invoke>`，违反既有纯正文要求；旧输出不清理、不重判。
2. studyb950b45f：完整十臂，五个 candidate 全 met；baseline 依次为 not-met、met、not-met、inconclusive、inconclusive。两个明确失败有同案例改善，但原 v1 先检查任何 arm inconclusive，故原决策仍 inconclusive、零 activation。不能称完整目标完成或自动启用已验证。

操作员错误假设 `whenIdle` 只完成一份研究，最后 `2 !== 1` 导致 CLI1；原 Loop 的两组合都在事前冻结允许集合内，不是重跑旧停止。原脚本和错误保留；独立 `audit-current-loop.mjs` 复用原终态审计，再核所有新组合及实际提案投影，不改裁决。`final-audit.json` 的原单研究工件未保存、计数 0 保留；`final-terminal-audit.json` 明确实际投影为 2。

正常排空，consent enabled/revision1、零 active；原九 Task、六 study、七 attempt 及账本前缀、154 冻结文件均保持。当前九 Task、八 study、九 attempt；没有方法后普通任务、撤回或冷恢复效果。本批耗尽两个原可用 source-fidelity 组合，不再次调用它们。D 约 16.75 GiB，未复制依赖或全账本。

下一处理的是两条具体问题：原生答案的多余协议标签；开发规则把其他 baseline 的未知作为整份候选 veto。先核对仅隔离开发的前瞻版本可否在 candidate 全部 met、至少一个确定同案例改善的情况下试用，未知仍如实保留，不改 v1/旧研究/正式 main/Daily 门槛；后续普通任务效果与安全撤回仍待实际验证。不是等待自然输入或再索取执行许可。

## 原本实际验证安排及未执行部分

开发操作员位于 `D:/DevData/tianwen-rejected-method-learning-20261006`，复用原共享安装与 status-report-baseline profile。只使用尚未尝试的来源组合，零新来源任务、零脚本主答、零旧来源交付重跑。先只读预检保护原九 Task、六 study、七 attempt 和原账本字节；正式运行允许追加新记录，旧前缀保持，不全量复制旧账本。

逐项记录真实模型提案是否收到该观察、原研究是否接受、是否自动激活，以及接受后的新普通会话实际对比、新未执行任务、consent 撤回和零模型冷加载。旧未来任务已有实际 0/2 基线，但曾出现在其他研究，不能称完全未见总体证据；新任务无方法前分数，不单独称提高。历史来源中的模拟失败仍明确披露，实际研究调用另记。

每批原生会话使用新 nonce，避免复用持久化 ID。正常排空、原条件完成和 CLI0 分别核验；紧急退出使用原 before-exit 终态回执，不把退出前条件快照当成功。构建、测试和运行产物在 D，测试临时目录已清理；不复制依赖环境。

完整自动学习目标仍 active。main/Daily NO-GO、R9 和原 dev-paired-any-case.v1 决定保持。本页的工程通过不代表完整目标完成。
