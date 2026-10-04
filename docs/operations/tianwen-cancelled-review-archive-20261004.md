# 本次会话取消评审后再归档

原概览Task的终止review晚于归档，已在原首次记录中说明，不回写旧task/seal。本修复是控制端工程工作，不是模型自动学到的新方法。

Observer复用原控制器，`cancelReviews(sessionId)`只取消所选会话尚未结束的原评审；原pending绑定来源session，`whenIdle(sessionId)`排空它的原任务、延迟project评审和judge。正常调用与全局关闭仍保留原全局排空行为。DEV宿主失败路径等根任务结束、取消本session评审、排空同session、保存原Task和仍live的native session，然后finally释放自有handle；保留调用者Context、同意、别的会话、原错误和独占写入。不增加评审/预算/质量门槛或新的Task重试。

最初静态评审发现全局排空会等住别的session；已改为同session，并用同时悬停A/B原SDK评审验证：A取消落盘、B仍pending，同意不变；放开B后原双审正常完成。最初真实发行控制又揭示过早dispose使session不可flush；原失败封存在 `D:/DevData/tianwen-cancel-review-archive-20261004/actual-sdk`，其Task终态一致但seal明确不完整，0模型恢复仍准确。没有修复或补写原缺失native。新工程控制 `actual-sdk-after-live-store-fix` 只在顺序修正后新建：原程序verified、原评审cancelled、原Task和归档一致、native/seal完整；另Node0请求/0检查准确恢复，账本不改。每次8scripted、prepare/evaluate各1，共16scripted/0natural；不能当自然成功来源或学习效果。

测试：同session取消原SDK控制先因缺API失败，再通过；归档终态控制先因review缺失失败，再通过；native保持live控制先因seal不完整失败，再通过。4相关文件161项通过，最后仅宿主顺序一行变化后宿主28项通过。完整Runtime及两份声明构建通过，独立最后无有据P1/P2。发行边界的首次执行使用系统临时目录，在原data-dir字符检查上失败（72/73）；同一检查改用约定D临时目录后73/73通过，见 `cancel-release-boundary-d-temp.log`，没有修改产品路径校验。

## 现在缺什么、如何推进

现有产品能完成真实开发任务；问题自动收集也已实际工作。持续DEV只有一个可核验问题来源。代码原规则还需要第二个输入独立、同条件的问题来源，以及同模型配置/同条件的合格成功对照，才会开研究；旧routing成功不能代替报告问题的对照。近期报告任务程序通过，整体评审未定，因此不能填充成功证据。这是**来源不足与评审执行可靠性**两种具体原因，不是要求用户出题或评价。

本次已修清取消结果的保存问题，但没有把超时误称评审通过。下一工作集中于后续真实任务评审的成本/耗时和既有自动研究执行，不再追加状态报告功能，不补判旧Task或故意制造失败凑来源。案例来源、程序结果、原语义裁决、受治理激活、未来效果分开检查；工程机制已有受控证明也不追加同类练习。

完整目标active/incomplete、main/Daily NO-GO及原十工作日决策窗口不改。窗口内没有完整效果就明确给出研究继续/缩小/停止判断，不自动延长验收。存储收尾见原概览小包final-audit；84历史容器与正式账本保留，原24拒删路径不碰。
