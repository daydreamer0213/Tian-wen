# 原生方法生命周期验证

基线6d2ef0f，事前设计/计划2315105。生产loop与ledger已支持独立失败回滚，限定追踪没有发现需要新增回滚机制的证据；本次补此前未同链验证的公开具体工厂、原生启用后请求、反向模型复核标签、自动回滚与冷恢复。生产代码、原两失败门槛和正式Runtime两处隔离没有修改。

## 实际完成

新增`tests/dsh-migration/native-method-lifecycle.spec.ts`，使用实际发行根的普通/cohort工厂及既有独立非隔离实验宿主装配。原core构建模块和原observer/file observer/feedback bridge/guidance loop执行，不是正式发行`/runtime`解除隔离，也没有手工补任务结果、研究决定、启用或回滚记录。

唯一新环境首轮1/1通过（约45秒）：

1. 三个新原生任务按原参考文件的精确JSON值核验。双模型复核全met，独立结果rejected/rejected/verified。五角色合同/检查在候选前固定，原loop自动研究、十臂真实执行；原决定accepted并自动产生一次实验激活。
2. 第一个新后续任务实际请求包含当前方法，任务行为版本为原候选版本，功能检查verified。随后两个不同原输入任务实际请求仍携带方法、原双审均met，但原功能检查rejected：第一项不回滚，第二项按原阈值自动回滚。
3. 回滚保存两项真实新任务ID与`model-or-code-check.v1`策略；下一新任务的实际请求明确旧方法不再适用、当前方法none，任务行为恢复原父版本且功能verified。三次方法注入/一次撤销均在真实原生请求回调检查，不能靠旧对话中出现方法文字蒙混。
4. 同档冷启动恢复全部7task/1study及原启用/回滚、完整ledger字节完全一致；0请求、普通prepare/evaluate仍7/7、研究供给/prepare/evaluate仍1/5/10。未重新执行候选或功能检查。

七任务原review全met，原功能结果依次rejected/rejected/verified/verified/rejected/rejected/verified，各自保持；没有把实验脚本结果当实际模型收益或改变原复核标签。新增1个不同完整生命周期机制用例。相关原独立结果门槛12项通过，新增Docker用例在默认环境1项明确跳过，不会自动启动实验。

## 类型装配及审查

新完整测试严格检查首遇原core源码与其他包dist声明混合导致两个TS2717；改用原core dist后暴露原Evidence类型图未加载，18依赖诊断。最终type-only引入原Evidence dist声明，没有手写接口、any或skipLibCheck；完整测试图对比上轮宿主测试baseline0/current0/added0。初始诊断与最终证据分别保存。此调整只在测试宿主，不是产品学习失败。

事前与事后独立只读审查均无P1/P2；核对事前合同、公开工厂、原生最新指导消息、原版本、原阈值和冷恢复。Docker实际运行前冻结测试SHA`6c98a49210e1539db909562d83dccff02a942db90caa8e68552729bc357d3303`，运行后相同；方法/案例/后续值/停止条件没有事后改动。没有重跑本次原生环境或旧结束题目。

## 清理和边界

17个真实受控隔离执行回执逐项boundaryVerified/removed全true；历史84容器ID排序逐项精确保持。随机临时Profile/候选文件残余0，Docker已恢复停止/后端0；本次运行根约48KB，仅小日志、合同/执行摘要、冻结hash/类型/环境回执，没有依赖或环境副本。D约18.89GiB≥15，未达20偏好。

正式持续Profile未挂载，完整账本SHA仍`8a5fb4411926eeb533c41a5937f2e6cf2cc16afa24dec51eb8fe99a58de32408`；继承13task/0study/0反馈评估。真实模型/自然来源/正式激活/自然后续收益均0；实验激活1/回滚1/方法请求3/撤回1分别记账。main/Daily完整学习NO-GO、正式隔离、原同意/发布门槛与十工作日窗口不变，完整目标继续active/incomplete。

## 下一实际接缝

本次已证明原受控生命周期链可运行；重复微型JSON场景不能填自然学习或开放语义安全。下一优先接天问本身的实际JavaScript/TypeScript研发待办：现`scripts/conversation-typescript-check.ts`明确只检查strict noEmit/约束，不能证明函数行为；实际公开隔离功能工厂目前仅Python。先核对可复用的隔离执行、现有Node环境和原结果协议，再为实际项目代码补独立功能核验接缝，而非改学习标准或追加结束练习。只有新实际任务的原失败、成功对照和独立案例足够时才让原产品启动研究，不预造失败/反馈；开放文本语义和自然收益保持未证，不索用户供题或催评价。

证据根`D:/DevData/tianwen-native-method-lifecycle-20261003`：before、frozen-test-sha256、test-types首/v2/v3、lifecycle-v1、唯一lifecycle-*-result、related-regression、17执行回执、historical-container-ids、container-cleanup、docker-stop及final-verification。
