# 天问安全维护 023：主线与日常交付记录（2026-09-28）

## 结论与边界

独立的新方法激活隔离补丁已通过 [PR #1](https://github.com/daydreamer0213/Tian-wen/pull/1) 进入主线。因为旧 `0.1.22` 的受管安装器会按同版本幂等退出，另以 [PR #2](https://github.com/daydreamer0213/Tian-wen/pull/2) 发布 Runtime `0.1.23` / Desktop `0.1.0-preview.24`，把安全补丁实际交付到两个日常 Profile 和原桌面快捷方式所指程序。远端 `main` 当前准确提交为 `15da16b546e0aabc1f53a56b19c0ccf1bb3d9f1d`，先前安全补丁为 `6b0a8e2f201e7feebae5b1453f400c144fe2f5fb`。

这项维护只隔离**新的**方法激活；历史已激活方法继续按旧记录读取。完整自然自动学习的研究裁决、独立语义安全和后续任务收益仍未由这次发布证明，继续 **NO-GO**。没有合入开发分支中的完整学习实验改动，也没有重跑旧模型样本凑成功。

## 发布检查

- 安全补丁的[准确主线 CI](https://github.com/daydreamer0213/Tian-wen/actions/runs/36419369157)、023 的 [PR CI](https://github.com/daydreamer0213/Tian-wen/actions/runs/36421837248) 与[准确主线 CI](https://github.com/daydreamer0213/Tian-wen/actions/runs/36422591220)均为四项 `completed/success`：Python、TypeScript、Windows 安装、Windows 桌面。
- 版本升级相关的本地五组定向测试 **306/306**；八包 TypeScript 检查通过；Runtime 正式构建、打包和桌面源码构建通过。本地整库 Vitest 运行因耗时和 D 盘生成数据主动停止，**不称为整库通过**。另一次扩大测试仅因当前机器 `COREPACK_HOME` 指向非核准目录失败；改用 `D:/DevData/corepack-home` 后该文件 4 项通过。
- 新安装器只读检查实际日常 `0.1.22` 时返回 `managed-runtime-predecessor`。023 运行包 SHA-256 为 `c4b3bf6897b047ce9ec94f23f6330ac3a010886f09d3d9275d93989a84c01669`。桌面内嵌包与它逐字节同哈希。
- 本地标准桌面打包曾因访问 Electron 下载源超时而失败；随后从 D 盘既有、可读的 `43.4.0` 压缩包指定本地 `electronDist` 成功构建目录包。该本地路径保留了 Electron 默认 `default_app.asar` 和 6 字节 `version` 文件；从**生成候选**中删去这两项多余文件后，82 文件成品通过正式 `audit-desktop-artifact.mjs`。云端正式桌面构建本身已通过。未在本机执行 NSIS 安装程序。

## 日常安装与数据保护

升级前确认桌面和 DSH 未运行、受管及 Web Runtime 均为 `0.1.22`。备份保存在 `E:/Tianwen-safety-023-backup-20260928`：受管 DSH 的 45 份配置、会话及状态文件，1 份安装收据、15 个历史运行包、旧桌面 82 份文件、原快捷方式，以及两个 Profile 各 21 份旧 Runtime 包文件。备份与原件逐文件 SHA-256 相同。旧 Profile 的共享 `node_modules` 未整树复制；保留旧包与上述运行包内容，可供必要时人工恢复。

随后正常受管安装器升级为 `ready`，Web 经 DSH 的 `plugin --profile web --allow-build=koffi add` 正常更新。两个实际 Profile 的运行包均为 `0.1.23`，受管收据的安装包哈希与上述正式包一致。再次运行受管安装器返回 `ready`，收据哈希不变。新桌面 82 文件在切换前后均与候选清单哈希相符，原 `deepseek.lnk` 字节未变、仍指向原程序路径。

原快捷方式参数启动后，桌面及其 DSH 子进程正常运行，本地 Web 服务返回 HTTP `200`；对窗口发送正常关闭请求后，两进程退出、监听端口消失。本次只做启动检查，没有向模型发送新任务。安装和启动后，备份中的 DSH 文件无缺失，仅 `profiles/tianwen/package.json`、`profiles/web/package.json`、`profiles/web/pnpm-lock.yaml` 三份预期版本清单变化；26 份 Session、2 份 Storage、5 份 Web state 文件的路径与内容均未增加、删除或改写。

曾尝试删除 D 盘已转存 E 的 `win-unpacked.before-023` 旧程序副本及本轮 `tianwen-release-023-test-fixtures`，但环境自动审批策略拒绝了递归删除命令，因此**两处仍在 D 盘**，没有绕过限制或宣称清理成功。核对时 D 盘可用约 `18.38 GiB`。旧程序 E 盘备份已逐文件验证；此项遗留只影响磁盘占用，不影响运行中的 023，也不构成新增自动学习证据。

## 后续

把已交付预览产品、安全维护和完整自然自动学习继续分开报告。开发分支 E106 的文本案例事实照搬窄门仍未入主线，且无法覆盖改写式语义复用；研究链路须用新的真实项目工作、真实反馈、研究裁决和后续任务效果分别取证。沿用[固定产品范围](tianwen-product-learning-scope-20260928.md)的十个工作日决策窗口与停止条件，不为通过次数加验收标准。
