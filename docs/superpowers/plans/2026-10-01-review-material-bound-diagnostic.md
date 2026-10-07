# Review material bound diagnostic implementation plan

> 执行已有自主推进授权，复用当前隔离分支；按 executing-plans 逐项实施，完成后只读审查。

**Goal:** 将真正的投影材料超限准确记为已有 material-too-large，并给出不含内容的限额说明。
**Architecture:** 在 projectClaimEvidence 抛现有原因对应的窄类型错误，普通 observer 保存数字解释；不改变限额或账本格式。
**Tech Stack:** TypeScript、既有 Vitest/DSH、Node；无安装。

## Global constraints

- 整体 JSON 512 KiB、答案32768 UTF-8字节、答案单元128，不增大或截断。
- 原非法形状/空答案/摘要错误继续invalid-judgment；取消优先。
- 不修改原记录、不调用真实模型、不扩大学习资格或激活。
- 运行物 D:/DevData/tianwen-review-size-diagnostic-20261001；D >=15 GiB。

### Task 1: 原因投影与普通记录

Files: packages/tianwen-runtime-bundle/src/conversation-claim-review.ts、conversation-observer.ts；tests/dsh-migration/conversation-claim-review.spec.ts、conversation-file-observer.spec.ts。

- [x] 先添加超限类别/数值及精确边界测试，普通文件组合答案超限与独立检查分离测试；保存首次失败。
- [x] 仅改错误分类与数字解释，保持既有限额/投影/同意边界。
- [x] 跑受影响两组和普通 conversation 回归，联合严格类型、八包类型及包根声明（旧claim-review全strict有2项既存诊断，基线相同）。
- [x] 只读原材料再次诊断（非重判）、比对原账本身份；只读差异审查。
- [x] 更新交接与本项成果，提交开发分支，核对准确SHA/干净状态/空间；完整目标不标完成（最终收据存运行目录，不改旧原生记录）。
