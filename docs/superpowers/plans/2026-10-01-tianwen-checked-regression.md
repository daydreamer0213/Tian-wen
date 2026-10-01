# 后续独立检查失败与回滚实施计划

> **For agentic workers:** Use executing-plans，按单项完整交付执行；复用原工作区，不复制依赖或Profile。

**Goal:** 消费合法后续文件代码任务的事前独立 rejected，与原模型 not-met 共用原两失败回滚机制，保留历史。

**Architecture:** evolution 原检查模块提供薄负面谓词；原 rollback 记录一个可选失败政策，原 ledger 和 loop 分别验证/生产，没有新增执行器或事件。

**Tech Stack:** 现有 TypeScript、Vitest、DSH/Cordis；无安装。

## 全局约束

完整目标active；main/Daily NO-GO、新激活隔离、原发布门槛/十工作日决策窗口不变。D生成物、余量>=15GiB优先20GiB；只清本轮自有临时根，旧451/4和旧被拒目录不动。不重跑旧自然题、不造反馈、不改task review或降低两失败门槛。

## 单项：负面结果消费者

文件：conversation-external-check.ts、conversation-guidance.ts、index.ts、ledger.ts、conversation-guidance-loop.ts；现有 conversation-checked-counterevidence.spec.ts 和必要的原ledger机制测试。运行根 D:/DevData/tianwen-checked-regression-20261001。

- [ ] 先补合法完整已激活code研究与后续输入；复现两程序rejected/model met不自动回滚，记录真首红。加入混合失败、未配置、pending/unverifiable/verified、仅一次、重复输入、身份/模型/族/版本/策略边界及旧无政策负面规则，不因缺新字段类型而代替首红。
- [ ] 实现薄负面谓词、显式新政策解析/验证、loop/ledger消费者；迟到事件复用现有task lane。原not-met仅回滚不添新字段，旧 replay/幂等/已激活记录保持。
- [ ] 定向绿后运行checked-counterevidence/ledger/loop/file-learning四相关完整组，八包类型/声明；全部修改TS含完整测试联合strict对基线逐项诊断比较。独立只读正确性/治理/历史/简化审查收口。
- [ ] 清理本轮自有测试根，保留小失败/日志/源码身份/结果；更新operations、权威交接、路线和计划，推送DEV并核对准确SHA/干净/余量。真实模型/反馈/自然研究/激活/效果0，不把机制回滚当真实收益。
