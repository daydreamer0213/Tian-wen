# Task36：许可例外的只读状态

主线历史已合并（f9c247d5），563份生产/测试字节与def1b226一致，历史维护文档增加三份。独立审查发现原只读提示仍说隔离阻止所有启用，且把获得独立clear记录的pending研究也一律算成quarantine；原正式精确许可激活与此矛盾。这是具体产品错误，不是新的学习验收门槛。

ROOT负责learning-consent-agent.ts、原status测试和记录。最窄修改：保留实际隔离布尔；说明默认隔离允许已有精确独立许可路线，所有原守卫保留；把有对应study/scope的已记录clear单列，不断言当前有效/可启用/效果。其pending原因保持未确定，不把reject、错scope或单纯accepted算许可。读取不触发模型、文件核查或写账本。

- [x] 原状态夹具先RED→修正文案与计数→原完整42/42、Runtime noEmit0。
- [x] 既有审查者只读复核PASS，P2关闭。
- [ ] 更新候选构建及成品后准确CI。

不更改ledger/研究/许可/撤权，不重做Task31/33，不增加模型面板。旧模型证据、首次失败和成品保留收据；运行物复用Task35 controller，D>=15GiB。goal active/mainDaily暂NO-GO。
