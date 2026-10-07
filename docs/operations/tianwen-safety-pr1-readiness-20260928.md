# PR #1 安全维护合入前核对（2026-09-28）

## 当前判断

[PR #1](https://github.com/daydreamer0213/Tian-wen/pull/1) 是独立的新方法激活隔离补丁，不包含开发分支的自动学习实验改动。远端 `main` 为 `c13bad79052541751907a105d72ac43d7a5cd3c4`，PR head 为 `6b0a8e2f201e7feebae5b1453f400c144fe2f5fb`，共同祖先正是该 `main`；差异为 7 个代码／测试文件。GitHub API 当前报告 PR `open`、非草稿、`mergeable:true`、`mergeable_state:clean`，同一准确 head 上 `python`、`typescript`、`installer-windows`、`desktop-windows` 四项检查均为 `completed/success`。这些是**合入前**证据，不是准确 `main` 检查或日常安装证明。

隔离历史数据的只读核对使用 PR 分支已编译的账本代码和 R9 历史原件 `D:/DevData/tianwen-natural-acceptance-r9-20260908/state/evolution/ledger.jsonl`，以 `inspection` 模式及新激活隔离配置打开。77 条事件、1 项研究、1 个 `accepted` 和 1 个历史激活均恢复，`recoveryFailure:false`，已激活的方法仍可按原版本读取。原件 SHA-256 前后均为 `3303e8f04fe9a45d2ee98c7f5a22fc80a72a21d580e518d9da44d7e5212adcd1`。该原件属于**隔离 R9 实验**，不是当前 Daily 用户数据；它证明旧激活兼容性的一项真实历史回放，不证明 Daily 已受新隔离保护。新激活拒写由 PR 自身的定向测试和四项 CI 覆盖。

## 尚未跨过的边界

PR 尚未合入，因而没有合入后准确 `main` 的四项 CI，也没有针对新代码的日常安装包、安装前备份、旧数据逐项保护核对或正常启动／关闭收据。当前 `0.1.22` / Desktop `preview.23` 仍是已交付版本，PR 不能被称为已安装。若后续进入日常交付，沿用 022 交付的原程序、配置、用户数据与快捷方式保护方式；不把隔离 R9 回放替代当前用户数据的安装前后核对。

安全补丁只阻止**新的**自动激活，历史已激活方法继续回放。完整自然自动学习的语义安全、研究裁决与后续收益仍独立验收。当前 `main/Daily` 保持 **NO-GO**，直到原有合入和交付门槛实际完成。
