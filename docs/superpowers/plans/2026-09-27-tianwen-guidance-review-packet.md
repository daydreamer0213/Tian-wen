# Tianwen 方法审查材料实施计划

> **执行边界：** 本计划只构造只读材料，不实现人工批准、解除隔离或自动激活。现阶段无新的真实 `accepted` 待激活研究；脚本化成功只算机制证据。生成物放 `D:/DevData`。

**目标：** 把一项研究的原始反馈、候选方法、五个案例的十条完整试验答案和双审核结果，按精确来源绑定成独立审查者可读的本地材料。

**架构：** 优先复用产品已有的账本投影、任务／反馈材料恢复；纯文本试验缺少从执行证明提取完整答案的只读入口，先补这个狭窄入口。新逻辑只做读取、交叉核对与导出。材料缺失时停止，不形成可放行结论。旧 R9 只进入诊断模式，新研究须保持隔离。

**技术：** TypeScript、现有 EvolutionLedger / DSH SessionPersistence、Vitest、SHA-256。

**当前进度（2026-09-27）：** 任务 1 的静态映射与 R9 快照可见性核对完成；任务 2 的纯文本只读答案入口及摘要漂移测试已完成，五组相关回归 184/184、八包类型检查通过。新增单臂审查投影在一项脚本化研究中只读核对十臂的执行答案与双审核输入，变更答案摘要会拒绝。重复成功捕获的单独用例、原任务／反馈总包及本地导出仍待完成。此进度不构成放行。

## 全局约束

- 不调用模型，不重跑旧样本，不写账本或修改 Session，不向模型暴露原反馈材料。
- 不用原生 `met` 数量替代独立语义判断；缺原文、缺证明、身份不符一律不生成可签字材料。
- 不更改 `guidanceActivationQuarantine`，main/Daily 保持 NO-GO。
- 先用旧 R9 做已激活诊断负例；它不能转换成新的放行许可。

## 任务 1：验证现有只读恢复入口

**文件：** `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`、`packages/tianwen-runtime-bundle/src/conversation-task-material.ts`、`packages/tianwen-runtime-bundle/src/conversation-judgment.ts`（只读调查）；`docs/operations/tianwen-guidance-review-packet-feasibility-20260927.md`（调查结论）。

1. 映射每个所需字段的现有真源，明确纯文本试验的提取入口缺口。调查结论记录在[可行性核对](../../operations/tianwen-guidance-review-packet-feasibility-20260927.md)。
2. 对旧 R9 快照核对 study、十臂、Session 映射和冻结文件哈希；只验证可见性，不重判历史或调用模型。此项不能替代对原始压缩 Session 的完整证明校验。

## 任务 2：冻结最小材料结构并测试失败关闭

**文件：** `packages/tianwen-runtime-bundle/src/conversation-judgment.ts`、相应恢复测试；随后新建 `packages/tianwen-runtime-bundle/src/guidance-review-packet.ts` 和 `tests/dsh-migration/guidance-review-packet.spec.ts`。

1. 先写纯文本试验恢复失败测试：唯一成功原生捕获可提取完整答案；缺 Session、重复捕获、答案／材料／模型配置摘要漂移都拒绝。再实现只读入口，并核对两份审核者看到的答案与执行答案相同。
2. 再写材料投影失败测试：完整脚本化研究应产出五个案例的 baseline/candidate 对、原反馈与补充标准并列、两个审核原结论和精确证明摘要；研究无候选、非 `accepted`、缺任一 Session／反馈／答案、摘要不符时拒绝生成。
3. 实现最小投影。材料标注 `reviewStatus: unreviewed`，旧已激活样本只能标注 `diagnostic-historical`。复测确认不增加原生模型请求、不更改账本和 Session 字节；材料内不得预填 `clear`。

## 任务 3：本地导出及 R9 负例复核

**文件：** 在任务 1 证明的读取入口上增加一个仅供操作者调用的导出脚本；更新 `docs/operations/tianwen-current-project-handoff.md` 并新增结果记录。

1. 要求显式输入 study 身份、账本／Session 根目录和位于 `D:/DevData` 的输出目录；写出完整本地材料与输入哈希清单。导出脚本不提供批准或激活操作。
2. 以 R9 **诊断模式**核实两条 false-met 原句和“你／用户自己的建议”主体偏移都可在材料中直接看到；若看不到，停止并修正材料来源，不把摘要报告复制成假原生证据。
3. 运行定向回归、包类型检查和差异检查；记录精确 SHA、材料哈希、可恢复性和限制。真正待放行案例须等待下一份自然产生、首次冻结且 `accepted` 的新研究，再独立检查内容。

## 后续明确不在本计划内

材料被独立审查者核对后，另行设计身份可信的签署和一次性激活记录，绑定 `studyId`、候选版本、裁决与材料摘要，并在激活前重新核对当前同意、支持和父版本。没有真实待放行案例及其审查记录时，不实现通用放行接口。
