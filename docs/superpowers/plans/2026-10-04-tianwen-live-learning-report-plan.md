# Tianwen 实际学习状态报告实现计划

**Goal:** 在现有只读中文报告中展示原系统的来源排除事实、独立研究检查/启用未完成原因、原生Goal任务结果，让实际进展有可核验的产品说明。

**Architecture:** 复用原 tianwen_learning_status 与既有 summarize-learning-status.mjs；不增加学习决策或新服务。三个实际增量都扩展同一报告产品，共同必须忠实解释原事实、保留旧接口和范围，不把模型评审/程序成功/解除隔离当完整自动学习。输入合同按原 Runtime 字段冻结；天然结果由原程序检查与原双审保存，原 checked-failure 分支可消费真实失败。

**Authority:** 用户授权自主选任务、制定实现细节并持续推进；原完整目标/main-Daily NO-GO/十工作日窗口不变，不再索题催评。三项是已存在报告的实际功能缺口，不是追加已关闭三项公开练习。

## 选择与边界

- 原SDK已有字段（learning-consent-agent.ts / conversation-source-readiness.ts），中文报告未消费；薄适配优于重新研究资格或让模型自行解释历史。
- 不仅凭计数推断缺哪条兼容条件；范围混合、字段缺失和未知状态保留原不确定。来源诊断只描述普通会话；原Loop可能另消费Goal来源。
- 每个新要求、独立期望、完整输入图在该Task答案前冻结；后续要求的初始CLI是前一实际首次代码，只在前一结束后冻结，不预造其内容。
- 同一持续Profile `D:/DevData/tianwen-development-runtime/continuous-project-20261004`；原正式账本只读、旧Task不搬迁/重评，原24拒删路径不碰，D>=15GiB，无依赖/环境副本。
- 原独立工厂使用同一固定执行配置，原共享条件只适用于本报告增量，不能给无关任务套条件。既有分派Task不当然当反例。
- 原研究须至少满足原兼容问题对/成功对照和当前模型/QA/图资格。直到真实来源准备齐全，不调用原study提案；在可能触发的一次Task之前冻结全部已有原始图及独立角色，安装原studyResultCheck，不能在提案后改期望。
- 若均成功，记产品交付与成功基线，不能称自动学习已证明。控制端不修候选、不重跑Task或人造负反馈。失败保存，不为凑失败改变要求或复用旧题。

## 三个实际增量

1. **来源诊断（本次执行）**：可选 readiness.diagnostics 的原schema/四计数/两布尔/九首排除条件，仅原有效事实显示，明确普通会话范围/候选兼容仍未证。无效可选部分忽略，原v1/退出/计数/中文/limits保持。
2. **研究与启用**：原 history 与 currentSession 的 guidanceStudies 范围分别显示，包含已保存的独立结果和activationPending；可重叠计数不求和，不把pendingArms当仍在运行、不把reasonUnestablished当放行、不把satisfied当语义安全。第二Task完整具体合同/期望在第一真实结果后另冻结。
3. **原生Goal结果**：按原 current/history 的 goalTaskOutcomes 独立统计，只解释成功/失败/拒绝未合格/不可核验；不冒充用户反馈、研究资格、方法执行或自然收益。第三Task完整具体合同/期望在第二真实结果后另冻结；若已有可兼容两源可能由第三结果满足原调度，先配置冻结研究角色。

## 本次步骤

- [x] 冻结 learning-source-report.contract.md、独立CLI入口、原要求/标准/参考图；原旧CLI38/41，恰缺三个新增有效显示。
- [x] 保存独立期望、驱动/hash、首前源commit d1d30e1。原持续DEV/同意/旧Task准确保留，0模型预检。
- [x] 唯一真实首次执行：11请求，原程序41条件verified；第一内容评审引文分段错误，原inconclusive/invalid-judgment，未运行第二评审。首代码未修、未重试。
- [x] 新Node0模型恢复原Task/0有效proof/完整5图/header/原账本；41+原4回归、实际SDK只读状态样本通过，原结果不回写。
- [x] 独立首代码审查与权威交接完成。完整目标仍active/incomplete；第二、第三实际增量未执行。

## 第二实际增量事前合同

`tests/fixtures/learning-study-report.contract.md` 固定现有两个原范围的12保存计数/4解释。缺失或畸形可选部分逐范围忽略，未列元数据忽略，不新增计数间关系判定；旧基础/来源诊断/20KB与原退出不变。35独立条件已经预先固定，旧首代码25/35，10新增合法显示缺失。复用原Node入口、原持续Profile、同一固定executor workRoot与共享必须条件；这35个控制不是35个自然来源。唯一第二Task答案前记录原首代码、原两Task、原Runtime/账本/hash，结果无论成功或失败都保存，不能重试凑结果。
