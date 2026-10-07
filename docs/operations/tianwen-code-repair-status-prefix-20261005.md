# 代码修复定向试验：真实状态错误根因与修复

完整自动学习目标 active/incomplete。所有者授权主动模拟缺失条件、失败和后续任务，不自然等待、不再索题、不以场景准备失败机械 blocked。原 main/Daily NO-GO、R9、发布条件和十个工作日窗口保持，不扩门槛。

## 新任务与实际首结果

操作员准备可修改的 `release-1.mjs`，只读 `entry-1.mjs` 和 `cases-1.json`，要求按当前 release 的 build/tests/independent_review 判断状态。种子模块混入旧 release，并把缺少阶段或空事件误判通过。完整需求、六原案例与预期结果在任务工作区可读；操作员编写的种子在模型调用前 4 失败/2 通过，明确不是模型失败、学习来源或方法收益。后续模型程序由原固定 Node 隔离宿主检查，未修改请求、回答或结果。

第一次预检因操作员合同 JSON 字段名不符合原 DEV 闭合结构失败，0 请求/Task；第二目录预检通过，但实际入口因非规范 Windows workspaceRoot 拒绝，仍 0 请求/Task。原记录分别在 `D:/DevData/tianwen-real-code-repair-pilot-20261005` 和 `D:/DevData/tianwen-real-code-repair-pilot-r2-20261005`，没有覆盖冻结或补评。按原入口规范修正字段、用原 path.resolve 规范路径。

第三目录 `D:/DevData/tianwen-real-code-repair-pilot-r3-20261005` 以源码 `911da960da6023e6c0f938e863c6a2359c49cebb` 冻结，35 摘要一致，独立有限设计审查无有据 P1/P2；原 CLI 0 请求预检通过。唯一正式运行实际 5 次模型请求/5 条完整原与实际轨迹，1 原生 Task、1 个原隔离代码检查 preparation，尚无 finished/outcome。在线状态读取错误使操作员保存首结果并取消排空；0 完成阶段/学习来源/研究/激活/后续方法收益/真实用户反馈。未把种子失败或未完成 Task 补成合格问题。

## 根因已由当前证据复现

本次首错误 `GoalStatusIntegrityError: durable Goal status is invalid` 保留了 cause：`tool/result ... has no matching tool/call`。原三个保存日志的 199 个完整行前缀，由公开 SDK inspect 读取再做原证据投影，189 通过/10 错误；多个错误发生在 assistant 请求工具之后、对应工具实际开始记录之前。

原 SDK inspect 返回逻辑恢复视图。对开放尾轮，`interruptedTurnClosers` 会临时合成 `TOOL_NOT_STARTED` 或 `TOOL_OUTCOME_UNKNOWN` 等结果及轮结束，以支持崩溃恢复；这些事件没有实际保存。原状态路径把它们交给执行证据投影，既可能造成“无匹配 call”的错误，也会把未得到实际结果的调用统计为有结果。本次已证明该根因；先前丢失 cause 的其他错误不能追认为同一原因。

修复 `scanDurableGoals`：用公开 persistence.readFrom(id,0) 取一次物理记录；对同一快照使用公开 detached sessions.prepare 保留原 SDK 的事件外壳、请求配置、替换消息关系等校验；只折叠和统计这份真实物理 events。不发布 Session、不提交恢复、不新增 closers、不再次读另一份快照、不放宽 Integrity catch。确实保存的孤立 result、错误请求配置仍拒绝。

五项新控制用真实 SDK 生成日志：before-call/before-result/after-result 三截面，真实孤立结果和空请求配置。前三项首次红、孤立结果控制原已通过；有限独立审查发现 readFrom 单独会绕过原 replay 校验的 P2，新增空配置控制确认首红，再补同快照的 SDK prepare。最终三个相关文件 77 项通过；原发布包 15 步构建通过；发行包原生全流程 49 通过/10 原条件跳过，不累计此前重叠检查。修复后的同快照 SDK 校验及物理投影，原 199 前缀全部通过、0 模型调用。复核无新增有据 P1/P2。产品修复证据在 `D:/DevData/tianwen-status-physical-prefix-20261005`。

## 资源与下一推进

九个诊断临时副本与三个完整原 SDK 日志逐文件摘要相同，删除 816,813 字节；原日志、首结果、排空及诊断程序/结果保留。初清理字节聚合为 null 的回执也保留，准确字节由原逐文件计划汇总在 `diagnostic-cleanup-accounting.json`，不伪称 GB 清理。旧三账本摘要、84 容器集合及保护根保持，自启 Docker 已停止，无环境/依赖副本；D 约 17.3 GiB>=15，20 GiB 偏好未达。

下一项继续独立代码修复的真实执行，使用当前发布源码和新的原任务身份，沿已可见需求和原固定执行器核实文件修复及语义。该轮先检查普通 Task 真正交付；研究、方法启用、不同后续任务及撤回仍分别验证。旧未完成任务不回填裁决、不冒充独立来源、不把这次状态修复算作学习方法效果。执行者负责准备和定位，不等用户提供环境。
