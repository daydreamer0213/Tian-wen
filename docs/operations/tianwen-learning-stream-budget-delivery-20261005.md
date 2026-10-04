# 主动模拟验证发现并修复学习材料大小误计

## 当前结论

所有者授权缺场景由执行者主动设计和触发，适用于学习及其他开发；不自然等待、不索题、不额外加门槛。这个原则已实际用于本轮真实模型验证。本轮发现并修复学习材料读取的工程缺陷，但尚未产生方法研究、激活或后续改善。完整目标继续 active；main/Daily NO-GO、R9、原发布要求和十个工作日窗口不改。

修复提交 `871f6e7ce81810f4ba6bd69b8cb322df2e1b9f2f`。主工作目录是 `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`，分支 `codex/conversation-claim-evidence`。运行证据根是 `D:/DevData/tianwen-real-semantic-adapter-learning-20261005`，原生日志保存在独立 DEV home `D:/DevData/tianwen-development-runtime/real-semantic-adapter-learning-20261005`。

## 唯一正式运行的结果

事前冻结九项新记录、同一完整 caller 合同、固定独立 Python 检查、模型和原阶段数量。故障仅投影派生 Task 简报、Goal 回读和两研究臂的要求；完整原要求仍可读。原答案、提案、检查结果不投影，无方法存在才允许正确输出的条件。四项操作员控制只证明场景结构，不当模型问题或学习收益。

唯一原 CLI 运行 97 次真实模型调用，97 条完整原始/实际请求轨迹；共六个原生 Task。完成保存的五阶段是四未来基线及第一训练：基线分别 14、20、13、12 次请求，四项全部独立 verified；第一训练 19 次请求、独立 verified，语义评审 met。第二训练另 19 次请求，原生 Task complete，独立 rejected，但内容评审 unverifiable/material-too-large，原整体 Goal 仍在 planning。

原 30 分钟总预算结束后停止，首错误为 `Original Goal remained live when the frozen whole-batch budget ended; not a completed or failed Task`。CLI 退出 1，取消和排空成功，没有重启或把八分钟观察点当取消点。首结果及全部日志保留。

原账本有两个 outcome（一 verified、一 rejected），一条 checked-success 研究来源。没有合格问题来源、研究、激活、方法后未来效果或真实用户反馈。第二训练确实给出错误答案，但未完成语义资格检查，不能把它补记成合格学习问题。四基线已全通过，也不能据此声称未来有学习改善空间或收益。

## 证实的缺陷及最小修复

第二训练的原任务材料共 660,230 字节，其中有 3,419 个 `assistant/chunk` 流式传输片段。去除这些片段后用于大小计量的材料是 118,769 字节，语义内容视图 51,300 字节。原读取器把重复传输片段计入 512 KiB 内容预算，在语义投影前拒绝材料；它同时阻止 Goal 恢复读取。原模型关于原始记录太大的说法不是本次根因。

修复只让 `readGoalTaskOutcomeMaterial` 的内容预算不计 `assistant/chunk`；读取器仍返回全部原始事件，原事件摘要、防篡改校验、身份、同意和功能裁决都保持。实际完成的消息、上下文、工具证据仍受原 512 KiB 限制，后续答案及语义限制不变。没有扩大预算、静默截断或弱化失败。

在旧正式批次结束前使用独立 D: 工作树修复，原主目录冻结代码及三旧账本全部保持。新控制先证实旧实现拒绝大量传输片段，最终材料测试 13 项通过；其中仍拒绝被篡改的片段和超过原预算的实际工具内容。其他三个相关测试文件共 51 项通过，共四文件 64 项。原生源码测试 50 项通过、9 项原条件跳过；有限独立审查无剩余有据 P1/P2。

隔离构建曾因共享依赖的跨目录类型身份失败，失败日志保留，不称其构建成功。原批次停止后合入主目录，原包完整 15 步构建通过。实际发布包原生回归 49 项通过、10 项原条件跳过（59 项总数）；这些条件跳过不当通过。发布读取器的零模型只读诊断能完整返回同一份 660,230 字节材料和全部 3,419 片段，原 rejected 裁决仍在。该诊断是缺陷回归证据，不是旧结果重新评审、来源补记或学习收益。

## 后续执行

这个工程缺陷交付收口，不追加同类测试凑数量。继续由执行者设计新的受控任务，针对本轮实际发生的 null/缺失状态错误设置不同原记录及未来任务；原三训练、五案例十臂、四未来和撤回数量不扩张。保留完整原要求给普通 Task 和两研究臂，故障仍可恢复；候选方法由模型提出，原独立结果与双审判断真实效果。未来输入事前冻结，模型直接正确就按成功记录，不改判失败。

原四项基线已全通过，旧批次没有研究；不重跑这些旧答案来制造对照或补旧问题资格。新场景若仍被模型直接解决，就换有实际意义的故障，不把准备工作退回用户、不机械标记 blocked。模拟反馈可主动用于验证归因功能，明确标为模拟；没有真人评价时如实记零，不因此停住可独立实施的工作。受控效果达到预定范围即收口，发布只沿原要求判断。

## 资源与证据保留

精确核对后删除五份重复阶段文件 2,433,102 字节，权威 `batch-first-result.json`、排空、完整请求 JSONL 和原 SDK 日志保留。独立工作树修复提交已保留，先逐个核查并非递归移除 12 个依赖 junction，再移除自有工作树，清 23,420,062 字节；共享依赖目标保持，无全量依赖副本。

三份冻结历史账本及原 84 容器保持；受保护的 77 历史根和曾拒绝清理的根未触碰。正式运行及回归已结束，自启 Docker 在最终资源审计中停止。最终 `final-audit.json` 记录 D 盘剩余 17.23 GiB，高于至少 15 GiB 要求；20 GiB 偏好未达到，不为达到它删除受保护证据。

关键证据：`launch-frozen.json`、`freeze-final-check.json`、`batch-first-result.json`、`batch-summary.json`、`drained-result.json`、`actual-provider-traces.jsonl`、`learning-budget-diagnostic.json`、`learning-budget-published-diagnostic.json`、`stream-budget-primary-build-result.json`、`stream-budget-native-published.log`、`phase-cleanup-receipt.json`、`isolated-cleanup-receipt.json`、`final-audit.json`。均在上述 D: 运行根，不复制入仓库。
