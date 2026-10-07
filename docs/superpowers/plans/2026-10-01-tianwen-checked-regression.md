# 后续独立检查失败与回滚实施计划

> **For agentic workers:** Use executing-plans，按单项完整交付执行；复用原工作区，不复制依赖或Profile。

**Goal:** 消费合法后续文件代码任务的事前独立 rejected，与原模型 not-met 共用原两失败回滚机制，保留历史。

**Architecture:** evolution 原检查模块提供薄负面谓词；原 rollback 记录一个可选失败政策，原 ledger 和 loop 分别验证/生产，没有新增执行器或事件。

**Tech Stack:** 现有 TypeScript、Vitest、DSH/Cordis；无安装。

## 全局约束

完整目标active；main/Daily NO-GO、新激活隔离、原发布门槛/十工作日决策窗口不变。D生成物、余量>=15GiB优先20GiB；只清本轮自有临时根，旧451/4和旧被拒目录不动。不重跑旧自然题、不造反馈、不改task review或降低两失败门槛。

## 单项：负面结果消费者

文件：evolution/runtime各conversation-external-check.ts、conversation-guidance.ts、index.ts、ledger.ts、conversation-guidance-loop.ts、scripts/ancillary-type-result-contract.ts；现有 conversation-checked-counterevidence.spec.ts 和 ancillary-type-result-contract.spec.ts。运行根 D:/DevData/tianwen-checked-regression-20261001。

- [x] 先补合法完整已激活code研究与后续输入；初无条件失败假设被独立审查否决。原not-met离线漏回滚真首红1项，条件资格首红1失败/1对照过；初缺字段/诊断匹配不称真实缺陷。最终包含混合/单次/重复/错模型/非失败排除及历史规则。
- [x] 审查否决无条件rejected后，增加可信事前requiredCondition、本次failedRequiredConditionDigest及原状态绑定校验；旧rejected不追认。ancillary只有直接原保护条件违反才标注，普通编译失败不标注。实现薄负面谓词、显式政策、loop/ledger消费者及离线先回滚；wakeTask保持合并Promise身份、accepting保护、同步错误转rejection，原catch复用。原not-met仅回滚不添字段，旧 replay/幂等/已激活记录保持。
- [x] 最终六相关完整组367/367，八包类型/声明0；全部修改TS含三个完整测试联合strict原/当前0。独立只读重要资格问题收口，无剩余重要问题。
- [x] 清理本轮自有测试根，保留小失败/日志/源码身份/结果；更新operations、权威交接、路线和计划，推送DEV并核对准确SHA/干净/余量。真实模型/反馈/自然研究/激活/效果0，不把机制回滚当真实收益。

初实施59过/3旧mock缺retire异常保留，补真实委托并保持原Promise断言。准确推送身份/资源由D盘finish.json记录，详见operations同日交付。
