# 无损文件复核 Implementation Plan

> **For agentic workers:** Execute inline with executing-plans under standing autonomous authorization.

**Goal:** 完整代码文件用有限无损块复核，原历史、全部输入和原限额保持。

**Architecture:** 独立纯函数模块由唯一真实原生任务实现；既有claimEvidence v2保存新投影选择，旧v1按原模式恢复。不改任务裁决或研究权限。

**Tech Stack:** 已有TypeScript/Vitest/DSH，无新增依赖。

## Global Constraints

不重跑43ad8或旧题、不覆盖历史、不抬128/32768/总材料限额。D生成物、复用持续DEV，隔离/NO-GO/原门槛/窗口保持。

### Task 1: 实际纯函数待办和有限功能合同

- [x] 提交src/conversation-file-review-units.ts未实现函数和tests/dsh-migration/conversation-file-review-units.spec.ts，运行先红。
- [x] 在D:/DevData/tianwen-file-review-packing-20261001固定原要求/原文件/严格编译配置，独立纯函数行为合同及正负/受限边界控制，独立只读审查。
- [x] 原正式持续DEV 0模型预检原4任务/账本b67047…/同意/工具；唯一新原生任务，预算8/12/32/12分钟、0重试，失败恢复前像，不修稿或重跑。
- [x] 原生候选功能verified、原样9/9和只读审查通过，精确原生read→edit→read核对，仅工程接纳；原model inconclusive保留，不作为成功对照。冷恢复原task/material和账本，0请求。

### Task 2: 无损新投影及旧记录兼容

- [x] 新投影/恢复测试先红，新增projectClaimEvidence可选file-chunks-v1，默认旧v1；新完整文件复核保存v2，文本/file-chat不改。
- [x] native请求恢复按原claimEvidence版本重建；未知版本/换模式/失真拒绝，完整task/output绑定和全部审计检查保持。
- [x] 六组不同185项通过、八包类型/实际bundle、完整五修改/新增TS旧0/现0及只读审查；旧真实精确材料342→79单元，全部文件文本保留、0模型/不改旧历史，不重评。
- [x] 测试自清本轮自有根，必要证据约173KiB，交接/路线更新并提交开发分支；完整自然学习仍按原要求核对。D18.47GiB≥15GiB，未达20GiB偏好。

## 下一接缝

实际96b618函数已完成且功能verified，但两个模型都因原files复核剥离工具记录而inconclusive，不能确认原read/edit流程或回答里的读取声明。下一单独设计文件输出的可信操作证据，基于既有原生捕获身份恢复必要操作顺序/成功，不把写后内容变成事实来源；旧v1/v2评价和指令不改，不回评本题或43ad8，也不制造反馈。
