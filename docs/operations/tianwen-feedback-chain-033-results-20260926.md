# 033 同族摘要链路：真实提案消费成立，研究无法判定，NO-GO

2026-09-26 按[输入前协议](tianwen-feedback-chain-033-protocol.md)在全新 E033 独立 Profile 使用准确候选 `94f3615cc6ddaac94a1065861adb07e6dda50fe1`。独立构建 14 步，桌面包逐文件核对通过；归档 SHA-256 为 `7965bc25f9d9e49f0876424e71eaf20a5961927fc33fa2b2c60479f5a178e0b5`。控制文件在 `D:/DevData/tianwen-acceptance-control/033`，来源仅有 E033 工作区内的两份冻结记录。网页使用 DeepSeek-V4-Flash / High、标准模式、Workspace Write。X/S1/S2/C 各发送一次，X/S1/S2 各追加一次预定反馈；研究首次终结后，F 发送一次。

| 输入 | 原生结果 | 解释 |
| --- | --- | --- |
| X 外部摘要与哈希 | 实际读取两份来源并运行哈希命令；准入 `summarization/external`，原题复核 `inconclusive`；反馈关联并判 `preference/user-preference`，5 条未来标准，可恢复的 v2 局部线索 5,067 字节。 | X 只作为提案局部线索，不冒充完整成功来源。 |
| S1、S2 两份不同事实摘要 | 均为 `summarization/text/met`、完整材料和模型配置可恢复；各有两份独立原生复核及合格持续偏好反馈，分别 3、4 条未来标准。 | 两条完整支持成立。 |
| C 一句话摘要 | `summarization/text/met`，两份独立复核，未附不利反馈。 | 与 S1/S2 同族的成功对照成立。 |
| F 后续检查 | 在研究终态后按协议发送一次，但模型读取了工作区外的 `D:/DevData/tianwen-acceptance-control/033/requests-033.json` 等控制材料，且探查 E033 验收目录；原题复核 `inconclusive`。 | **污染样本**，不得用来证明后续效果或读取隔离。此前 X/S1/S2/C 的文件和命令调用未发现此类控制材料读取。Workspace Write 不等于工作区外不可读。 |

研究在首个 host 中没有及时打开：C 于 `05:29:51Z` 完成复核后，约十分钟账本仍无研究记录；只读条件检查显示两条支持和对照均具备资格。首个自有 host 正常停止后，**同一独立 Profile、同一冻结账本和同一模型配置**重新启动；重新载入已完成会话，`05:39:39Z` 自动产生一项 `summarization/text` 研究。没有补题、改反馈或重发 X/S1/S2/C。这个恢复触发证明选择条件足够，但首轮实时调度为何没有启动尚未定位；不能把重启恢复冒充稳定的即时触发。

研究以 S1/S2 为两条来源、C 为成功对照，`study-opened` 带 1 条 X 线索。只读核验从 X 原生任务与反馈恢复线索，并在**提案子会话的原生请求**中找到相同材料；独立案例设计与盲评请求均未含 X 线索字段或 X 身份。共执行五个案例的 baseline/candidate 十条试验臂、二十份独立评审。原生决策 `study-decided: inconclusive`；没有 `guidance-activated`，所以**提案实际消费成立，方法采用和后续改善均未证明**。十条试验执行证明需按试验专用人格与答案哈希校验，不能误用结构化评审恢复器；补充只读核验十条均通过。

关闭前只读审计 `native-use/evidence/audit-before-disable-resume-v3.json`（SHA-256 `9f9e685e5bda73537b4b8f2f315f2f50f57b881542dcdeb4d86fd2d7f74d2045`）记录 8 条任务、3 条反馈评估、1 项已终结研究及准确提案消费，状态 `verified-with-contaminated-F`。通用评审恢复器核验 40/50 份证明，余下 10 份全部是试验执行证明，已由 `native-use/evidence/trial-proof-audit.json` 的专用只读核验逐条通过（SHA-256 `dedbf9e02462b38cb191e02700fdcef4aa48980bf13c82c9ac4e34b57b755627`）。冻结版审计脚本曾被临时修改，第一次审计因冻结哈希漂移而失败；已恢复脚本原哈希，随后以另存的恢复审计脚本生成 v3/v4 收据，原失败收据不作为通过证据。

学习已通过原生 UI 关闭到 revision 2 / `enabled:false`。关闭后审计 `native-use/evidence/audit-after-disable-resume-v4.json`（SHA-256 `4591b7839abf680d57991b3e440e4a5cc496acbf3992887857788973f261587a`）核对旧任务、反馈及其他会话身份不变；用于关闭的旧会话只追加了关闭轮次，其旧 156 行原生记录仍为新导出的准确前缀。新增第 9 条任务仅为关闭控制轮次。无活动方法，无需声称发生过方法回滚。两个自有 host 均正常停止，恢复 host PID 10956 与端口 62980 已消失；网页关闭。

**发布判断：NO-GO。** 033 首次证明局部线索经真实提案消费，但研究裁决无法判定，未采用；F 污染，首轮实时调度也待定位。main/Daily 均不升级。下一项先用可重现测试定位实时调度漏触发，再在新的输入前冻结样本上检查稳定触发、干净后续任务与方法采用；不重算 033 或放宽裁决门槛。
