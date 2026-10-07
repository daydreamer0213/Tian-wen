# 当前普通 Web 预览结果（2026-10-06）

当前开发 Runtime 的普通网页使用链已完成一次有限前瞻检查：新配置同意分析、普通介绍任务、模拟后续偏好与真实改写、关闭分析、正常退出和零模型冷启动均实际执行。不是新的学习研究，也不代表语义安全或完整发布通过。日常研究预览 0.1.24/Desktop preview.25 保持原交付；完整开发分支 main/Daily 原 R9 NO-GO 保持。

## 原始输入和实际执行

冻结干净分支 `codex/conversation-claim-evidence` 的 `fd683bf40f9a5716edef22c997d3f6f9f7744ace`、149 生产文件。四条公开新消息在模型调用前冻结于 `D:/DevData/tianwen-ordinary-web-preview-inputs-20261006/public-messages.json`。U2 是操作者模拟的持久表达偏好，不是所有者读稿评价，也不是自然失败。期待说明仅用于独立核对，未传给模型。

使用原 SDK/base/Web、原工厂/Session/JSONL、当前 Runtime 公共 `apply` 与默认新激活暂停；没有 DEV 学习决策策略、自动预注册任务、脚本主答或旧状态副本。只新建独立 Profile 配置、存储、工作区。禁用原默认文件/命令工具预设，实际模型仍使用原天问工具与原结构化捕获。

原始环境在预检零调用处因未声明新 Runtime 服务访问而退出 1；r2 用原 `ctx.inject` 等待服务后预检通过。r2 Web 原自动目录选择器在 Windows 本机打开宿主系统窗口，IAB 无可操作弹窗，零任务发送、零调用；正常退出、冷启动均 0。两场原记录完整保留，独立 `zero-model-setup-audit.json` 实际退出 0。r3 仅选择原 SDK 支持的网页目录选择器 host/client 组合，没有修改原网页实现。

最终实际目录为 `D:/DevData/tianwen-ordinary-web-preview-20261006/r3`，Profile 为 `D:/DevData/tianwen-development-runtime/python-native-learning-20261005/profiles/ordinary-web-preview-20261006-r3`。root 在实际原网页 `http://127.0.0.1:58397/` 选择新工作区，逐条发送 U0–U3，保存 UI 发送回执。预检、serve、cold 原 CLI 退出均 0；23 次真实 provider 请求，0 脚本答案；预检/冷启动各 0 次请求。原网页根 Agent 在排空后由原 CLI 工厂退出释放，没有伪称它存在 `agent.dispose()`。

## 分开报告的结果

| 对象 | 实际结果 | 边界 |
|---|---|---|
| U0 同意与暂停 | consent revision 1 enabled；quarantined true | 只对新独立配置；新方法未自动激活 |
| U1 普通介绍任务 | 原首次正文完成、原两检查 met | 不保证每个产品推断都正确 |
| U2 模拟反馈与改写 | 关联 U1；原改写完成、原两检查 met | 来自同会话用户说明和上下文，不是新方法或学习因果收益 |
| 独立反馈归因 | 首 assessor 原输出 preference/5 标准；原独立 scope 输出 3 continuing/2 unclear | 第一条引用人为插入省略号，不是直接反馈连续原文；后检查拒绝，原 invalid-judgment/inconclusive/proof null 保留。持续偏好未获采用，不称归因成功 |
| U3 关闭与查询 | 原工具关闭 revision 2；enabled false/quarantined true | 关闭前已识别 U3，原分析 review cancelled/inconclusive；这是关闭取消，不能算普通内容审查通过或错误 |
| 研究与方法 | study 0、activation 0 | 本轮不要求产生研究或方法，未强行触发已完成的学习 |
| 正常退出与冷恢复 | 排空、原 CLI close 0；冷普通 apply 0 请求/0 历史 Agent | Task/feedback/study/attempt/账本与关闭后原状态相同，已有记录保留 |

原 U2 有“它下一次就会照着来”“要真用，得先有人看过、觉得靠谱才算数”。原提供事实没有规定必须经过某个人审核，双审却均 met，grounding 把该表述当作原评估事实的日常释义。它仍存在角色和保证范围越界风险，不把原 met 升格为全面事实准确，也不清洗正文、回判原票或称当前语义风险消失。它延续原 R9 问题，不新增第三审、关键词禁令或通过次数门槛。

## 独立核对和存储

首终态核对退出 1：原同意 notice 的第 3 次请求与原原生 header 均合法省略 tools，脚本 `sha256(undefined)` 不支持。原脚本/失败说明保留；独立只读脚本改为精确 `deepEqual` 比较该可选字段，未将缺值改成空数组。实际再核对退出 0、0 新模型请求：23 原 step 的 messages/system/tools/config 对齐、原四 UI 输入、四份有效原双审证明、材料/会话/合议一致、149 生产/1133 旧保护文件字节保持。`proofInvalid:0` 仅指已保留证明的核对，不代表反馈无效输出消失。

证据：`D:/DevData/tianwen-ordinary-web-preview-controller-20261006/final-audit.json`、`first-terminal-audit-failure.json`、`zero-model-setup-audit.json`、原 profile 原生 Session、r3 provider traces 和首反馈失败。审计完成后六份重复全会话快照逐字验证 gzip 收存，保留原文件 SHA/压缩 SHA/恢复核对清单，释放 125421977 字节；原 Session、真实请求、原脚本、冻结配置和终态审计未删。后续读取这些快照需解压 `.json.gz`，不能假设原未压缩路径仍存在。

空间回执：本轮目录总计 22805668 字节（约 21.75 MiB），D 剩余 17900212224 字节（约 16.67 GiB），满足 15 GiB 底线、未达到 20 GiB 偏好。无依赖、运行时、凭据、旧 Session/账本复制，无大缓存，自己的测试网页已关闭。详见 `storage-receipt.json`、`snapshot-archive-manifest.json` 和 `snapshot-archive-result.json`。

## 下一有限实现

普通 Web 检查收口，不重发四条输入、不再凑研究或消费者数量。scope 引用校验提示过晚已做最小修复：在原 native capture 成功前执行直接原话检查，把 `decisions[index].evidenceQuote` 精确错误返回同一原子会话；不改引用文本或范围结论，仍保留 late 检查、unclear/one-off 与原语义规则。非空要求沿用原领域解析器，不增加持续偏好采用条件。

四项真实服务/原生捕获回归先实际失败（省略文本、改变标点、空串、纯空白均导致旧 unavailable/proofnull），再修正为同一原子会话中保留原拒绝和唯一成功修订、有效 recover proof、原 Task 不变、unclear 不可采用。原反馈 28 项和原判断 62 项共 90/90 通过；全部原项目 TypeScript 构建退出 0，私有导入检查退出 0/无违规。最初 pnpm 构建包装器因自动尝试安装依赖而无 TTY 中止；没有允许清空依赖或安装，随后使用已安装编译器运行相同八个顶层项目及其原引用项目通过。没有新依赖、SDK 或模型请求。

这证明捕获前拒绝与原生纠正机制可运行，测试 provider 是明确模拟，不是新真实模型效果。历史反馈失败和两条 unclear 保留，未重评。见 [实现计划](../superpowers/plans/2026-10-06-tianwen-feedback-scope-capture-fix.md)。下一若验证模型自行纠正，使用全新冻结反馈材料首次运行；不把引用纠正当作语义偏好必然通过。原角色/保证范围越界风险继续进入既有 R9 修复工作，不增发布门槛。
