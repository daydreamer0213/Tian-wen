# 状态维护 024：主线与日常交付（2026-09-30）

独立只读状态维护已实际交付。Runtime `0.1.24` / Desktop `0.1.0-preview.25` 已进入两个日常 Profile 和原快捷方式指向的桌面程序。状态工具公开新的方法激活暂停策略，保留历史激活读取；没有导入开发分支其他学习实验代码，也没有开启分析同意或新的方法激活。完整自然自动学习仍 **NO-GO**。

## 发布证据

状态源码由 [PR #3](https://github.com/daydreamer0213/Tian-wen/pull/3) 先行交付；可升级版本由 [PR #4](https://github.com/daydreamer0213/Tian-wen/pull/4) 交付。独立只读审查未发现可操作缺陷；版本 head `ceda95d3c06e83ef16995558fd08c3fd0fb07643` 的 [CI 36670700569](https://github.com/daydreamer0213/Tian-wen/actions/runs/36670700569) 四项成功后按匹配 head 合入。

准确主线为 `f163c71aff2de390d855e6662ef7b65f91bc9bd5`，文件树与上述已验证 head 相同；其 [CI 36671288129](https://github.com/daydreamer0213/Tian-wen/actions/runs/36671288129) 的 Python、TypeScript、Windows 安装和 Windows 桌面四项成功，包括云端 NSIS 构建。本机没有执行 NSIS 安装器。

本地版本升级相关五组 **285/285**、正式运行包和打包 **64/64**、八包类型检查、Runtime 构建和桌面目录成品审计通过。聚合测试超时与 Electron 缓存多余文件的初次失败和处理保留在 PR 的 `docs/operations/tianwen-status-024-release-20260930.md`，不把第二次结果冒充首次通过。

运行包 SHA-256 为 `9122cfcdfe8f53914dcbb31b045bf23e30f188008e8e5b34cc77ac0d6e9c17c7`。两个已安装 Runtime 的二十份发布内容逐文件匹配正式源码；`runtime.js` 为 `331f1e8d550d721b8ad2f4f469331cea9e73d6d50eaf213f4ba47bbec6c11afe`。

## 安装与数据

确认实际 Daily 未运行后，再次核对 E: 备份和原件：`E:/Tianwen-status-024-backup-20260930` 的 **172 文件、379,067,978 字节**逐项哈希相同。未整树复制共享依赖或重复备份全部历史包。

正式受管安装器升级 `D:/DevData/tianwen-experience`，返回 `ready` 且包摘要一致。Web 经正常 DSH `plugin --profile web --allow-build=koffi add` 更新；两个 Profile 均为 `0.1.24`。重复受管安装返回 `ready`，收据哈希不变。桌面在原路径逐文件切换，82 文件与候选清单一致，旧内嵌 023 包换为 024；正式成品审计通过。原 `deepseek.lnk` 字节未变。

安装和两次启动后，受保护 DSH 目录 **45 文件路径未增删**，内容仅三份预期版本清单变化：`profiles/tianwen/package.json`、`profiles/web/package.json`、`profiles/web/pnpm-lock.yaml`。其余配置、会话、Storage 和 Web 状态逐文件哈希未变；未创建独立 Daily `state` 目录。

核对脚本首次误按原件路径把另外备份的程序包计为用户数据，之后又误取 LICENSE 源码位置和全部开发 dist 文件。按备份受保护子目录、仓库根 LICENSE 和正式 manifest 发布清单纠正后重新核验通过。三项都是核对脚本错误，没有改产品文件来迎合核对；原因保留于 `D:/DevData/tianwen-release-024/audit-script-correction.json`。

## 启动与边界

正式宿主使用实际 Web Profile 启动，动态本地服务返回 HTTP `200`；经宿主停止入口退出，端口消失。实际打包桌面随后使用原快捷方式参数启动，完成真实窗口 `did-finish-load`；以产品既有 `TIANWEN_DESKTOP_E2E_EXIT_AFTER_LOAD=1` 在加载后关闭窗口，经原正常关闭协调器退出。桌面退出码 `0`，所拥有 DSH 进程和端口消失。两项是分别记录的服务与窗口检查，不冒充人工操作。

桌面 stderr 保留两条 Chromium GPU 状态诊断；本次窗口仍加载完成并正常退出，没有宣称 GPU 输出为空或因此扩展验收。本轮升级和启动**未向模型发送任务**，没有新反馈、研究、激活或未来收益证据。

收据、日志、清单和小体积正式包在 `D:/DevData/tianwen-release-024`。下一步沿用[固定范围](tianwen-product-learning-scope-20260928.md)的真实工作／自然反馈触发条件和十个工作日决策窗口，不制造同类样本、重跑旧答案或增加通过次数。

重复候选桌面目录的递归删除被自动审批拒绝，理由为 `blocked by policy`，故没有删除或改用其他方式绕过。改用 NTFS 原生压缩后，逻辑 `364,899,361` 字节占用 `237,984,081` 字节，减少 `126,915,280` 字节（约 121 MiB）；压缩后的 82 文件及实际 Daily 均仍与交付清单逐项同哈希。没有压缩正在使用的 Daily 或用户状态。候选副本仍留在维护工作区，清理收据在上述 D: 目录。
