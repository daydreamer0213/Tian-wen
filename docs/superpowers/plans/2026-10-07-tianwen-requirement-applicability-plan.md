# Task23 / Task24 要求适用范围实现计划

> For agentic workers: use subagent-driven-development with existing investigate_actor_semantic_seam owning ONLY conversation-claim-review.ts and its spec.ts; existing review_shared_future_scope owns read-only spec/code review. Do not spawn new agents. Root owns docs/controllers/builds/provider. Workers are not alone and must not revert others' changes.

**Goal:** 修复对子集的限制被扩大到全部事项的false-NOT，保留真实待办分句检查，再走原普通学习完整链路与后任务效果。

**Architecture:** 原完整generator及Task21尾段不变；现行v12/未显式quality的完整指令再追加通用范围说明。严格恢复同材料/purpose/focus/encoding下原/Task21/Task23三个完整版本，显式旧quality仅原版本；无票替换、重评或门槛变化。

**Tech Stack:** 已有Node22、TypeScript、Vitest、原DSH SDK scripted通道与普通公开Runtime；不安装，TEMP/生成物全部D:/DevData。

原失败和设计见[结果](../../operations/tianwen-requirement-boundary-prospective-result-20261007.md)与[设计](../specs/2026-10-07-tianwen-requirement-applicability-design.md)。设计只读PASS，Task22实际freeze-end已释放。

1. **范围说明与证明兼容** — owner ONLY `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`、`tests/dsh-migration/conversation-claim-review.spec.ts`。

- [x] 先SDK scripted RED：每条限制先明确原要求指定的对象，对待办/未定子集的限制不得套到已可用/明确时间地点；请求若真要求全部事项独立成句仍适用全部。一般许可对子集外仍有效，待办左边界分号真实错误不能放过。引用数据不变成指令，事实支持不等于格式合规。
- [x] 保留当前Task21固定尾段字面值/旧generator，追加Task23固定段。三版本严格完整串匹配；显式旧quality生成与恢复仍只有原串。实际SDK保存的原/Task21/Task23两个purpose×focus可零调用冷恢复，近似/额外尾段、错focus/material、旧quality新尾段拒绝。
- [x] 保留首次失败，运行原六套完整回归、默认两包types与diff。报告准确次数、源/test哈希与0实际provider。worker不得build/commit/provider；独立规格与质量PASS后停写。

2. **原公开入口及全新普通运行** — root。

- [x] 原public16/实际clearance4+feedback4/default types/private imports；历史11feedback及150原生claim零模型恢复实际0。精准source-transition声明1src、1已审查测试及5确实改变的编译输出，原失败与v2修复保留，其余旧原生/冻结证据不改。开发分支已推送，main/Daily未发布。
- [x] Task24新whole来源/counter/adjacent/holdout，原feedback和同host合同；原future1/future2/unrelated完整对象及各题6标准不变未消费。prepared host46专项0调用不是模型效果。独立准备审查后实际新空profile/ordinary Runtime/原policy undefined，未复制依赖/凭据/全历史。
- [ ] 实际首次研究：原全10明确、5候选met、至少一个sourcebaseline not-met、counterbaseline met，宿主检查不替票；原生首次独立clear→专用许可→自动激活才执行两后任务、对照模拟fault、无关任务与撤权。全部首次结果保留，不重跑旧对/补票。
- [x] Task24首次33真实，第一candidate确实分句错误，原candidate-failed未激活；cold0模型真挂载、request/proof绑定、首次盲审再对票、终审及实际freeze-end完成。Task25同版本24真实因仅一来源eligible未研究，也完成cold/审计/终审/actual close。完整采用及效果项仍未完成，不称全目标结束；新范围证据误拒交Task26修复，不等用户或新增门槛。

完整学习目标active；一段提示/脚本/一轮结束不等于目标完成。main/Daily原NO-GO，D>=15GiB、优先20GiB；正常标点许可、角色及源内条件/承诺不得被额外禁止。
