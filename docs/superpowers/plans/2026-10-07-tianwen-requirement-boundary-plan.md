# Task21：具体输出限制与一般许可的审核边界

> For agentic workers: reuse the existing investigate_actor_semantic_seam for the two owned source/test files and review_shared_future_scope for independent read-only review. Do not spawn agents. Workers are not alone and must not revert others' changes. Root owns docs, controllers, builds and real-provider execution.

**Goal:** 修复普通原生审核把“末尾有句号”当成“独立完整句子”，或用一般标点许可覆盖具体分句要求的误判；原验收不增加、不放宽。

**Evidence:** Task20 首次59真实/0脚本，10臂20原生票；候选5项全部 native met / host verified。邻近 baseline 实际文本在地点后用分号连接第一待办，要求明确每个待办独立成句。requirements 原票错误 met，grounding 正确 not-met，host 同合同 rejected，原正式 inconclusive，无许可/采用/后任务。首次盲审已独立确认 -6 的同一错误，原票不重判。Task20 终审与实际 source-freeze-end 释放前禁止生产编辑或构建。

**Architecture:** 原 claim-review 输出形态与事实支持分开审核的规则已存在，但没有明确一般许可/具体例外及完整句子左右边界。追加一段短的审核说明：在同一有效要求内，广泛许可不覆盖更具体的限制；只有确实要求独立成句时才检查完整句子的起止及连接；一个分句的结尾句号不能证明它独立，前面逗号/分号连接的另一事项也须检查。不要从 quoted data 推导指令，不对没有独立句要求的任务禁止标点连接；不把事实有源等同格式合格。模型仍独立判断并原 structured_output 提交，宿主不计算/替换 native verdict。

**Alternatives:** 改正式裁决接受 inconclusive 会改变原研究资格；把宿主检测结果注入或当作 native 票会改变材料/证明与独立判断。这两条本次不采用。只追加一段已明示要求的阅读说明，保持系统结构与原门槛。

**Compatibility:** 当前 verifyConversationClaimReviewCheck 与 verifyConversationOriginalReviewCheck 严格按重建指令逐字核对。不得直接修改 COMMON/V6/V7/V8/V9/V10/V12 或旧 fileClaimInstruction 生成串，避免历史票失效。保留精确原生成器，新增 current 指令尾段和一个精确匹配函数，仅允许由同一已验证材料/目的/focus/encoding重建的原完整串或适用的新完整串。当前quality.v12与没有显式qualityContract的现行基础路径使用新尾段；显式旧quality版本的新生产也保持该版本被冻结的旧完整串，不替换旧fixture固定hash。旧质量不接受不适用的新尾段。禁止 startsWith/删除任意后缀/忽略指令/改变旧 proof/session digest/重新投票。当前任务新运行只发新串，冷恢复仍零模型；更改任何尾段或拼入额外要求均拒绝。

**Owned files:** worker ONLY packages/tianwen-runtime-bundle/src/conversation-claim-review.ts and tests/dsh-migration/conversation-claim-review.spec.ts. 不改 quality.v12、claim-audit.v2、schema、SDK、parent/tool capture、正式全10明确/5候选met/source至少一个not-met/反例met门槛、host合同、独立首审/许可/激活。

**Tech Stack:** 复用已有 Node22、TypeScript、Vitest、DSH native scripted harness；不安装，TEMP和生成物全部 D:/DevData。

- [ ] Task20 终审 PASS 后 root 实际运行 close-task20-stage，确认 releasedForNextDevelopment。
- [ ] 新脚本 native SDK RED：两个隔离 reviewer 首次请求收到同一范围说明；新的通过/失败回答使用源内全新物品，不重放 Task20。反例保留允许分号；独立句验证只在明示要求时适用。脚本只证明指令与原完整 capture/proof 通道，不宣称模型学会。
- [ ] GREEN 最窄追加与精确兼容；原/新 instruction 在真实保存SDK中冷恢复0调用。保留原旧串固定 hash 来自修改前源码，原/新 purpose、focus 和材料严格绑定；近似尾段、注入额外句、wrong focus/changed material拒绝。不能仅测试手写字符串而跳过原 SDK。
- [ ] 原 judgment/claim 六套完整回归、默认两包 types 与 diff；报告首次 RED/GREEN/失败，独立 spec/quality 审查。worker 不 build/commit/provider。
- [ ] root 更新 Task18实际public、Task19/20终态和当前计划/交接，提交开发分支。原完整public16步/入口测试/private imports/零模型历史proof兼容，包括Task19/20原checks，按实际 audit计数读取，不手填计数。
- [ ] 全新空 ordinary profile，新公开模拟来源与事先固定两个新案例/同合同检查，真实模型首次运行，原三后任务/六效果保持未消费。原 formal accepted+原生独立首审 clear+activation后才测原未来效果/无关任务/撤权/cold/语义。若首次未采用，保留明确具体失败并继续必要实现，不补票/重跑旧对/等待用户。

main/Daily 原 NO-GO，整体goal active；只有限机制或本轮结束不能complete。D>=15GiB，优先20GiB；不复制整套环境/依赖/历史。新增说明不是要求全产品使用句号或逐项原词，任务原要求仍决定输出形式。
