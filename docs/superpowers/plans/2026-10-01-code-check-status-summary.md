# 普通任务独立代码检查状态汇总计划

**目标：** 补齐 `tianwen_learning_status` 当前会话与历史汇总中缺失的独立代码检查结果，让它与模型评价各自显示。这是已有能力的状态查询，不修改图形界面、任务准入、研究资格或方法激活。

**基线：** DEV `541b3396f95becf319cc1af775fb7eba495e3d3b`。上一预算任务失败保留，不重跑。完整自动学习目标 active，main/Daily NO-GO、激活隔离、原门槛和十工作日窗口不变。

**固定需求：** 只在 `packages/tianwen-runtime-bundle/src/learning-consent-agent.ts` 的 `naturalConversationStatus` 返回值增加 `codeChecks`：

- `prepared`：有 `externalCheckPrepared` 的任务数，包括检查已结束的任务。
- `pending`：已准备而无 `externalCheckFinished` 的任务数；没有检查的旧记录不能算等待。
- `verified`、`rejected`、`unverifiable`：分别按检查结束记录的原状态计数。
- `scope` 精确为 `Independent code checks cover only their declared checks; they do not replace model review, whole-task acceptance, learning eligibility or activation.`
- 沿用传入任务集合，当前会话不能掺入其他会话；不返回原文、检查 detail、任务 ID 或摘要，不写账本、不发模型请求，不改变原 reviews。

**实施和验证：**

1. 先通过公开状态工具固定机制测试：真实账本的混合检查状态/当前与历史范围/无写入无泄露，以及无检查的历史记录全零。记录首红和测试摘要。
2. 新实际开发任务只尝试一次普通原生入口；回答前固定原请求、目标、检查器及编译读集合，目标是上文一个文件。继承 8 请求/12 工具、拒绝计数、64K/high、零提供者重试、12 分钟截止；候选仅做严格 TypeScript 检查，不赋予学习许可。
3. 候选先读源码审查，再执行冻结机制测试、相关回归和类型检查。失败按原始阶段保存，不重试求绿；必要工程修复明确归为控制端，不能重写原生结果。
4. 保存小运行证据至 D:/DevData/tianwen-code-check-status-20261001，清空本轮残余，D 保持 >=15 GiB。更新交接并提交 DEV；完整目标另行推进，不以本项宣称完成。
