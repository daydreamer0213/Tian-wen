# 研究冻结 TypeScript 检查器实现计划

> 执行方式：本会话直接执行executing-plans；必要的独立代码审查复用现有reviewer。持续执行已获授权。

Goal: 为研究提供直接核验原保存文件的具体编译结果生产者。
Architecture: 抽取scripts/conversation-typescript-check.ts的既有prepare核心；普通入口保留原验证，新研究入口不伪造Task，不改运行时门槛。
Tech Stack: 现有TypeScript、Vitest、DSH与共享文件解析，无新增依赖。

约束：完整目标/NO-GO/正式隔离/原发布门槛/原窗口保持；不造自然来源/用户反馈、不重试旧真实样本，不执行生成代码；生成物D盘，底线15GiB。

- [x] 在tests/dsh-migration/conversation-study-typescript.spec.ts固定适用性、原冻结文件、输入/输出/条件及取消反例；记录真正入口缺失的首次失败。
- [x] 修改scripts/conversation-typescript-check.ts抽取准备核心并实现createConversationStudyTypeScriptCheck；保留旧默认行为，研究仅事前明确条件和声明文件适用。
- [x] 验证两臂共享同一事前冻结检查及与prepareConversationStudyResultChecks/evaluateConversationStudyResultCheck接线；当前七组178/178，八包类型和实际bundle通过。初八组guidance-loop104通过，唯独十臂编译测试20s超时已保留并仅调测试等待。
- [x] 独立审查两P2先红后关闭；完整两个TS旧0/现0/新增0；记录真实失败归属、空间、正式账本未改及目标未完成，工程提交8d95097，推送回执见D:/DevData/tianwen-study-typescript-20261001/finish.json。
