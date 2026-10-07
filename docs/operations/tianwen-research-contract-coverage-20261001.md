# 研究结果检查覆盖核对与独立工程修复

基线 `852a59a409dd934853068f238b8268950b839f55`。本轮不调用模型、不重试旧案例、不改变来源资格或验收要求。完整学习目标继续 active，main/Daily 完整学习 NO-GO，新激活隔离与原十工作日决策窗口保持。

## 当前真实材料能覆盖什么

正式持续开发档 `D:/DevData/tianwen-development-learning-20261001` 冷加载后，调用原产品 `readiness()`，结果为 `awaiting-compatible-sources`。两条原任务逐项回读：

| 实际任务 | 原结果 | 对研究的意义 |
| --- | --- | --- |
| 进展说明 `90aa8db95…` | 准入 invalid-judgment；review inconclusive；不能恢复完整任务材料 | 不构成合格来源 |
| outcome 模块修复 `24ebf4e3…` | review inconclusive/file-evidence-unavailable；独立检查 unverifiable；无完整文件结果 | 不构成合格来源或成功对照 |
| 另一独立档 ancillary 修复 `43ad8e92…` | 独立检查 verified；原模型 review inconclusive/material-too-large | 保留有限工程证明；不导入持续档、不追认为成功对照 |

五案例覆盖表中的来源一、来源二、成功对照，当前持续档均无合格材料；相邻与留出案例尚未生成，也没有对应的事前独立结果依据。已有单文件合同冻结原请求、目标和编译依赖，不能直接用于另一个生成任务。只添加研究检查生产接口，当前仍不能证明任何真实十臂结果，因此本轮不实施该接口或通用检查平台。

这是当前持续档的结论，不否定历史 E104 已通过的两次读后反馈归因和普通来源/对照。E104 案例设计已消费且失败，不重试。R9 原 accepted/activation 仍是历史事实，不能替代语义安全证明。

运行证据为 `D:/DevData/tianwen-research-contract-coverage-20261001/coverage.json`：模型请求 0、原账本字节不变、研究 0、隔离仍开启。没有新增用户反馈、生成案例、裁决或后续效果。

## 另行完成的源码修复

直接工程检查再次复现 `outcome-learning-intake.ts` 单独 strict 的唯一 TS2551：模块使用 `Context.tianwenLearningConsentAgent`，却依赖其他入口顺带加载声明。补一行 `import type {} from './learning-consent-agent.js'`，接入已有声明，不增加运行服务或逻辑。

修改后单模块 strict 诊断 0；与修改前生成的运行 JavaScript 完全一致；其余源码逐字保持。相关同意控制测试 41/41，通过独立只读审查，无重要问题。没有为一行类型依赖补充镜像测试或扩大标准。

修复后文件 SHA-256 为 `7bfa2984dcf9a33a79f1e44183f5ae5dfd044fb40588842254bdf5cdeda827e6`，内容与上轮未核验的文件系统候选恰好相同。本轮归属是直接工程修复，不能描述为上轮普通任务通过或候选获产品采用；旧原生记录、unverifiable 与 inconclusive 原样保留。当前源码问题已修复，历史任务失败不变。

## 下一入口与存储

继续选择实际开发待办，不等待 OfferGo 尚未给出的评价。需要观察普通入口时，先核对真实任务材料大小、宿主工具配置与确实适用的事前合同，只运行一次未知结果任务；工程修复不计作自然学习来源。研究结果接线以新的合格来源及适用案例结果依据为入口，不复制旧题、造反馈或提高材料限额求通过。

本轮只保存小审计与前后类型检查记录，没有新增 Profile、模型会话、依赖副本或测试临时根。D 盘约 18.58 GiB 可用，超过 15 GiB 底线，尚未达到 20 GiB 目标；历史被拒绝删除的目录保持原状。
