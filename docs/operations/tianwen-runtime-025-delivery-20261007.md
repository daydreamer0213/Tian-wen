# 天问自动学习目标与 0.1.25 实际交付（2026-10-07）

本次固定目标已完成产品实现、原有自动学习闭环验证及主线／日常实际交付；原范围的 main/Daily 发布结论为 **GO**。不再等待自然重复问题、不重评旧样本、不增加第三票或新的通过次数。目标完成不表示所有未来任务都会改善，也不把模拟反馈说成自然用户评价。

用户现在可继续使用原桌面 **deepseek** 快捷方式。Tianwen 和 Web 两个日常 Profile 均为 Runtime **0.1.25**，桌面为 **0.1.0-preview.26**，原快捷方式的路径、参数及字节保持。已有分析同意、撤权及全局隔离设置保留，未因升级强行开启用户分析或写入新方法。

## 自动学习已经做到什么

Task31 在普通产品路线完成“任务和反馈 → 归因及持续偏好资格 → 正式方法研究 → 原生独立许可 → 实际方法启用 → 新后续任务改善 → 不相关任务不注入／撤权回滚／恢复”。首次 **82 次真实模型请求、0 脚本回答**；反馈和受控失败明确标注为模拟。五候选通过原正式研究，原生许可 clear 后 Runtime 实际启用；两项后续真实任务的原六项效果要求均 met。来源、实际方法注入及撤权证据分别记录，没有用人工改账本代替启用。

原六个普通 Task 有五个 met、一项 future2 inconclusive：当时检查误把四句的一段正文当作违反单段要求。旧票保持，不用效果结果替换普通任务判定。Task32 澄清段落／句子边界，并保留其首次晚校验失败；Task33 将原非空白摘要引文要求提前执行，两个全新固定样例首次 **5 次真实请求／4 个合法检查 met**，同一原生子流程自行纠正纯换行引文。原审计与实际结束均完成，不重开原研究。

公开包及受管配置已接入原有独立研究许可入口，避免方法研究通过后永久停在待审；仍按原许可、作用范围、撤权和隔离规则使用方法。Windows 权限启动超时及并发文件别名初始捕获竞态已经修复。原完整权限、路径校验、序号守卫及实际工具并发保持。

有限模拟环境证明这条自动产品链路可运行并改善后续任务；没有宣称自然长期满意度、普遍正确率，或把旧 Task29 更细条件的失败改写成通过。详见原 [Task31](tianwen-method-construction-prospective-result-20261007.md)、[Task33](tianwen-nonblank-summary-quote-result-20261007.md)、[文件捕获修复](tianwen-file-capture-order-result-20261007.md)。

## 发布和同一成品的证据

代码 source `d6b45ccf3fd1621c25e4972c22143ee5cae8a982` 由 [PR #6](https://github.com/daydreamer0213/Tian-wen/pull/6) 合入 main `04e49f9095864e3d1f5118a182bb3ff516501148`。两者 Git 文件树相同；原四项检查 Python、TypeScript、Windows installer、Windows Desktop 在 [分支 CI 37554140520](https://github.com/daydreamer0213/Tian-wen/actions/runs/37554140520) 和 [main CI 37554717924](https://github.com/daydreamer0213/Tian-wen/actions/runs/37554717924) 分别全部成功，含原目录成品／云端 NSIS 审计。临时诊断不是发布 CI；本机没有运行 NSIS 安装器。

Task43 修复阶段三套文件观察回归 122/122，最后适用边界改动后补验 10/10，类型检查退出0；公开包81/81与两套公共反馈／独立研究29/29分别通过。原16步公开构建／11份元数据和正式产品输入绑定保留。文档收尾若生成后续 commit，只是状态记录更新，不能把上述 CI 冒称对文档新 HEAD 运行。

实际受管安装器完成原锁定的离线安装、两次 Runtime 构建和打包稳定性、生产部署与 CLI 配置检查，全部 **8 个子步骤退出0**，真正返回 ready。最终正式包 SHA-256：`bc4354c45a508c9e17564851b663860e7162d7493c5bfe8f645d1302093ad719`；两个已安装 `runtime.js` 都为 `2e58768e03003226ee1c7345111050622e5b478a982cb2968ce04175d05d0758`。

先前候选包 `5f11d39d…` 与实际安装器包 `bc4354c4…` 的28个归档条目，唯一字节差异是 package manifest 内两个开发依赖的键顺序；解析后的完整 JSON 相同，其余27条内容、全部条目元数据及顺序一致。V5 安装器成功与外围旧摘要断言失败分开保留，没有修改安装收据迎合检查。最终采用实际安装器生成的 bc 包，以新不可覆盖的 seal/gate 引用原成功 gate：候选83文件只替换内嵌包1项、其他82字节保持；重新通过原成品审计和真实候选窗口／正常关闭，固定新的83份摘要。没有因包内开发依赖顺序改变而重开模型或改产品源。

Managed deploy 的 Runtime manifest 完整字节按锁定源码核验（`e94a290e…`）；Web 正常 SDK plugin add 的 manifest 完整字节按锁定归档核验（`f2275c72…`）。二者真实安装来源不同，不只检查版本号。全部27项正式发布内容（包含 LICENSE） 按源码逐 hash 核验，均不是源码目录链接。

## 真实日常交付与数据

Web 经正常 SDK 更新入口变为 ready；Desktop 在原路径逐文件切换，仅复制7项，最终83文件与固定候选清单相同，没有再复制一整套桌面或 SDK。安装后的正式成品审计退出0。

实际 Daily Web 宿主返回 HTTP200，经原停止入口退出、端口消失。随后真实已安装 Desktop 使用原快捷方式参数和实际 Daily home 完成窗口加载，沿原关闭协调器退出0，所拥有 DSH 进程和端口均消失。使用产品既有加载后退出开关；这些是实际服务／窗口检查，不冒充人工操作或新模型研究。

原47项保护路径中 **42项字节未变**，原 dsh-home 45文件路径未增删。仅以下五项预期变化：Tianwen package.json、Tianwen cordis.patch.yml 的原生独立审查接线、Web package.json、Web pnpm-lock.yaml、安装 receipt。旧会话、目标、设置、Storage 和原快捷方式保持；E盘程序127文件及受保护数据45文件的备份172项仍逐 hash 完整。实际重复调用原安装器返回 ready、0子命令、收据 SHA不变。

Native 启动准备按已发布源码创建并在关闭后留下 `state/learning-loop/native-observation-launch` 两层空父目录；全部 state 内 **0文件、0链接**，没有新学习账本或用户数据副本。末次核对严格只允许这两条空目录，不删除目录迎合旧“根目录必须不存在”的错误假设。

## 首次失败与核对脚本纠正

离线安装曾缺固定 SDK／依赖缓存，原失败及自动回滚保持；V4还发现 node-pty 索引存在但三个实际内容文件缺失。只补原精确版本的 D盘缓存，未更换 SDK／依赖版本、关闭离线模式或新复制完整 SDK。随后对 Windows x64 生产图 **367包／27,037文件** 实际存在和内容 digest 一次全量只读检查，bad=[]。

旧部署脚本目录递归以 `/locales` 重置盘根，在任何复制前失败，原82桌面文件逐 hash 保持；其后对仍为024的旧桌面执行审计失败也保留。V3只修相对路径，完成正式原位切换。核对器先前误把 managed manifest 来源当成tar，又要求正常启动后的空父目录完全不存在；按真实源码和精确来源修正，未改产品迎合核对。一次外围 PowerShell 引号错误在文件写入前失败，也已记录。旧5f installer／gate／seal及所有首次失败均为历史，不再作为后续部署步骤。

## 最终记录和停止条件

完整收据位于 `D:/DevData/tianwen-025-release-controller-20261007`：`task44-main-release-gate-v2.json`、`task44-managed-install-adoption-v2-result.json`、`task44-web-update-v2-result.json`、`task44-desktop-delivery-v3-result.json`、`task44-installed-desktop-audit-v3-result.json`、`task44-installed-host-v2-result.json`、`task44-installed-window-v2-result.json`、`task44-delivery-verification-v4.json`、`task44-delivered-idempotency-v2-result.json`。独立终审实际 **PASS、无P1/P2**，见 `task44-final-delivery-review.md`，SHA-256 `098c87d52eb6020e910f370e938ef16e2ef87d16540a10842f532f78db84b4ad`；独立重算83成品、42保护、172备份及全部绑定。

当前原固定目标已经收尾。后续在没有新故障或新需求时保持安静，不因旧历史 NO-GO 标题重新开实验，也不为了等待自然反馈／任意增加验收条件而拖延结束。新的用户任务、反馈或具体故障属于下一轮正常产品工作。

D盘末次剩余 `16,409,071,616` 字节，约 `15.28 GiB`，高于15GiB底线，尚未20GiB偏好。Task28旧scratch、pytest残余和两旧隔离窗口删除共三次被自动审批以 `blocked by policy` 拒绝，未执行、未换方式绕过；这些残余仍在。没有宣称已清理干净。
