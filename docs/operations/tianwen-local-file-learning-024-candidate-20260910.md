# 024 候选与恢复记录（真实使用已结束）

最新结论见[024真实使用结果](tianwen-local-file-learning-024-real-results-20260910.md)：
IAB已恢复，两项真实普通任务完成，但F1判断提交失败、C1聚合材料超32KiB，完整
文件学习均未通过。学习已关闭，原历史/文件保留，自有host已停止；未合并/升级。
下文保留候选和入口恢复各时点，不把旧“尚未输入”当作当前状态。

## 当前结论

五项改造、一次新增量总审查及一次集中修正复核均已关闭。最后代码修正
`5a80a9ffb8000c44a00af3a29086059db9298a0d`，限定复核无Critical/Important/新增Minor；
原M1饱和管道背压证明仍延后，不声称已经实测。

本次候选源码提交`c6fbde439f9f8bb9d5d45bcd077cd2b9ebbc4a64`，
树`6d2c81285851a5704ffbba7c48693189ee11663b`。Runtime`0.1.24`，
Desktop`0.1.0-preview.25`。候选包已完成，尚无新的DeepSeek模型输入，
因此不是024真实验收完成，也未合并或升级Daily022。

## 新候选及保留的打包问题

产物根：`E:/待清理/D盘迁移-2026-09-08/Tianwen-本地文件学习-024/`。
有效候选目录：`candidate-c6fbde439f9f-attempt2`，以
`continuation-receipt.json`和此前未改写的`receipt.json`共同解释本次执行。

1. 首次`candidate-c6fbde439f9f`在复制7zip缓存时原生崩溃，尚未打包。
   单独同调用复现Node22.23.1的`fs.cpSync`退出码`-1073741819`，没有JavaScript
   错误或finally；原收据因此保留running，另附`FAILED-ATTEMPT.md`说明。
   系统Copy-Item复制相同六文件成功，1375442字节，六个哈希均与原文件相同。
   这不是删除/权限保护拒绝；未改权限、未删文件、未改产品代码。
2. 第二次两个正常pnpm包只在package.json三个工作区依赖的键顺序上不同。
   27项归档条目的名称、元数据相同；其余26项逐字节相同，package.json解析后
   完全相同。保留两份原包，不反复重包挑选一致结果，不宣称逐字节可重复打包。
   固定第一份原包不改写，后续要求选定原包与内嵌包逐字节同一。
3. 继续既有正常stage、显式E盘Desktop目录、NSIS及资源/字节审计，全数exit0。
   目录打包12.36秒，安装包43.86秒，资源审计0.49秒。没有默认输出覆盖，
   没有发布、Daily或桌面快捷方式改动。

| 产物 | SHA-256 |
| --- | --- |
| 选定Runtime原包及Desktop内嵌包 | `55a7d84c5e50d1e01204834644841f8a9737826bbdab0dcd60e9d239a030dbe0` |
| 第二份原包，仅清单键顺序不同 | `e30382925392a80298f95a9ffe1fd70b97d60677e9aeca344d27ee6cab5e5f98` |
| Desktop.exe | `d26b5a27ee7af3e2e7cb091422d11cb91172a712a99a4adaed6c936e3ed05929` |
| Setup.exe | `0e4486b850d528198b7cdb93e89af9e08b667c1c6d9289eb8f808a788ea811b0` |
| packaged host.js | `a0df66dbda3b034ededd216683c019cc69b86d0d0067e91fad5b3a49b1d8426d` |
| packaged native-observation-launch.js | `c493c17fdfe56309306c667bb00b53d2ce3aca3a421bd168b1b1580842eefa1e` |

## 独立正常入口已准备

`native-use`为新的独立环境。使用实际候选的`prepareMissingWebProfile`安装正规
Runtime依赖；Profile声明base/web/Runtime三个bundle，没有旧的抽取Runtime替身，
没有旧IPC探针或工作区bootstrap。只配置正常Runtime、同一已批准固定摘要来源
及DeepSeek预期模型，不增加权限。原先按字符串判断空patch的辅助脚本误把原生
注释头当作自定义内容；正常安装实际已成功，改用YAML解析确认空数组后继续配置，
不重装、不重做来源批准，保留该失败收据。

实际打包host的公开`startDesktopWebHost`无依赖替换启动成功：
2026-09-10 06:35:22（本地），PID3228，`http://127.0.0.1:50072/`，
`observation.kind=observed`。该地址后续会随自有服务退出失效，恢复时以新的实时
收据为准。HTTP首页实际200，14797字节。仅证明服务就绪及启动观察配置被接受，
不是实际工具调用或模型证明。

`static-freeze.json`固定两份原始材料、未修改请求、预期交付类型/路径、Profile配置、
实际原生bundle根、19个原生入口/清单、已安装Runtime及零会话/零账本状态。
新协议仍是F1文件交付、C1读文件后聊天各一次；不预设答案、反馈、工具顺序或采用。
旧023失败不改写。来源准入按新环境重新绑定，但来源本体和原授权范围不变。

一次性审计helper属于验收工具，不是产品发布API或替代执行器。它必须绑定实际
public Session export、完整原始字节、文件/辅助调用/评审证据；完整恢复检查在
关闭学习前完成，因为关闭后Runtime按真实授权状态禁止恢复辅助材料。
关闭后仅验证原历史摘要和disabled状态，不冒充仍获授权的完整恢复。

`pre-input-ready.json`已完成最后绑定：原输入/已安装包/源码及外部验证依赖哈希
逐项未漂移，仍为零会话、无任务账本、零模型输入。审计helper V2已构建并做静态
检查，保留初版及其构建失败；未运行真实审计。根复查另统一glob/pwsh没有语义
投影时的空值、先保存当前项再做断言，并核对原任务会话及真实目录。它们只改
验收工具，没有改产品或重新打包。helper源码副本也保存在本环境evidence目录。
恢复浏览器后复用这些材料；首次发送前只核对绑定仍有效及没有先前输入。

## 前次IAB阻点（已由本轮恢复取代）

IAB控制会话真实创建页面返回`Browser is not available`，刷新表面为
`apps:[]/browsers:[]`。根控制工具及已有备用Node工具均在初始化时返回
`failed to write kernel assets` / Windows错误3。Codex打开页面操作仅返回queued。
本地浏览器插件配置仍enabled；配置指向的当前named pipe实际存在。因此不能根据
现有证据断言用户关了开关、更新损坏或某个配置键就是根因，未盲改全局设置。
没有切换Edge/Chrome，没有用HTTP后台发送模型任务。用户已被请确认当前任务右侧
能否打开DSH页面；不重复要求模型额度或任务执行批准。

恢复IAB后先完成首次输入前最后绑定/零任务检查，再按既定协议正常输入、审计、关闭
学习并停止自有host。必要门禁通过后才推送合并、核验准确main CI、备份并升级Daily022。
首次失败现场和后续判断均保留；不重跑旧模型队列，不删除共享证据或日常数据。

本轮大产物与新独立环境均在E盘。本轮只读空间快照：D约12.73GiB、E约296.92GiB
可用。未清理被保护规则拒绝的旧夹具，未绕过删除，也未删除本轮失败证据。

## 本轮恢复：IAB已可用，原生目录选择随后由用户完成

2026-09-10 09:24（本地）恢复同一公开打包host，PID12772，
`http://127.0.0.1:55050/`，`observation.kind=observed`，自有终端会话95941。
旧PID3228/端口50072均不存在，零会话文件且无账本；未发送过正式任务，所以没有
重跑模型队列。复用同一包、已安装Profile、两份文件、请求、验证器和来源批准。
恢复前共146份文件绑定通过；原live-host及所有冻结收据不覆盖，另写
`pre-input-resume-1.json`（SHA-256
`8098eedd9cf3313ea797704494df254fffc63f51bd082f288892e3a702dc0e6e`）和
`live-host-resume-1.json`。首次核对失败来自旧builder元数据使用URL.pathname留下
`/D:/...`；保留`resume-1-failure.json`，恢复脚本仅把该格式按file URL转换后核对原哈希。
该恢复收据的checkedFiles.sha256保存的是含resolvedPath/sha256的对象，不是纯哈希字符串；
按其实际结构读取，不改写原收据。没有产品代码修改、重新构建或重新安装。

审计脚本只增加第三个显式live-host收据参数，原E盘冻结源码副本不改；新副本为
`evidence/audit-024-use-resume-1.mjs`。待真正任务及评审终结后使用：
`node audit-024-use-resume-1.mjs before-disable <绝对路径/live-host-resume-1.json>`，
撤回后的after-disable同样显式传该收据。未提前执行一次性审计。

根CUA已实际打开IAB浏览器1/页面1并进入DSH，之前的browser unavailable不再成立。
点击添加/选择工作区后页面无弹层；已查明DSH native directory picker在宿主Windows
打开`Select Workspace Directory`（真实两个worker子进程已确认），不是网页文件选择器。
Windows computer-use已按技能加载，能读取原生窗口；点击报
`coordinate input geometry is unavailable`，截图报
`SetIsBorderRequired failed: 不支持此接口 (0x80004002)`，文本设值报
`read UIA value read-only state: 所需属性不在 CacheRequest 中 (0x80070057)`。
刷新后仍可读，Alt+D返回后焦点未离开搜索框；不据此宣称成功输入。
没有自制Win32/UIA脚本、后台workspace.create、替换目录选择插件或改安全配置。

已请用户在原生窗口选定
`E:\待清理\D盘迁移-2026-09-08\Tianwen-本地文件学习-024\native-use\workspace`。
这是一次具体人工界面操作，不是重复申请模型或项目权限。选定后继续同一IAB的
consent/F1/C1/withdrawal各独立会话及真实DeepSeek调用；不得把本轮入口工具兼容
失败记成学习功能失败。尚无024模型验收结果，main CI/Daily升级继续留待真实门禁。

后续用户回复ok且UI/原生存储均确认选定正确E盘workspace。手选过程中曾加入E迁移
父目录空工作区，保留未删除且不在其中发送任务；正式workspace的ID为
`af2e255c-1e2e-481f-b6e3-11e25b8d1566`，首次空会话
`session-487133a9-a78d-42fe-ae1f-1d935007a002`。09:35在该普通IAB会话发送原consent，
真实DeepSeek调用学习工具开启revision1并完成披露。09:36新会话发送原F1一次，
模型自然glob、pwsh、读取两文档并调用summarization；尚在执行，不提前判定学习通过。
