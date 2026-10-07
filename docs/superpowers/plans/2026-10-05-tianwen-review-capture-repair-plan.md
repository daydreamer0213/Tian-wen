# 原评审提交修正实现计划

按所有者持续授权直接执行，使用 executing-plans。目标为原评审可恢复提交错误，不改变完整自动学习目标。

修改 conversation-claim-review.ts 原捕获检查；conversation-judgment.ts 原一次提醒和证明恢复；tests/dsh-migration/conversation-claim-review.spec.ts 原 SDK 控制。生成物 D:/DevData/tianwen-review-capture-repair-20261005。

- [x] 新失败测试：普通文字评审原会话提醒并可恢复；非法摘要/答案引用工具拒绝后修正，未修正拒绝，提醒变造拒绝。
- [x] 最小修复：review 专用一次固定提醒；所有原 claim review 捕获前同谓词的引用错误提示，默认两审及后置谓词保持。
- [x] 定向回归、原构建、独立审查，修复有据问题。通过即收口，不增加样本。
- [x] 保存100请求原失败及诊断、更新交接/资格/计划；核旧账本和84容器、停止本轮自启Docker、记录D空闲并提交推送。继续新前瞻故障学习。
