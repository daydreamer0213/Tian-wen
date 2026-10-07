# Task38/39：原CI跨系统收口与桌面权限启动修复

原四CI run37547547369（5d8648f）：Python/installer成功，Linux自然学习组2失败/880通过/2原跳过，Desktop12失败。两Linux失败实际都是产品明确定义仅Windows的DEV边界：原direct-adoption、原budget-cli-exit-withdrawal。Task38 daeb0f6b明确非Windows不运行两控制，在原Windows installer合法D映射内执行同两控制，原断言/边界/覆盖不变；严格workflow快照同步原命令，保持等值断言。public合同首次1失败/26通过、改后27/27，长行ruff纠正后0；本地两DEV+ordinary对照3/3。

原 run37549195023（daeb0f6b）实际终态：Python、TypeScript、installer-windows三成功，Desktop仍12失败。失败诊断另自有目录、精确原PS/minimalenv、5s额外预算：ETIMEDOUT/status null/SIGTERM/stderr空/elapsed5017ms；原prod预算10秒未变，首次stock和原继承ACL/Administrators owner保持。已证实超时重放，尚不能把某一环境变量单独定为根因，日志github-job-112560360037-1791331270996.log:468；不重开学习研究或增加模型票。

Task39修复只传Windows运行所需TEMP/TMP/USERPROFILE/APPDATA/LOCALAPPDATA；保留SystemRoot/windir/当前owned path、NoProfile、EncodedCommand、原10秒和失败stock。模型密钥、token、PATH、PSModulePath等不整体透传。先应用原private DACL，只有实际owner不是当前用户才再设置当前owner，随后原owner/保护/规则数量/身份/继承/传播/FullControl验证全部保留。绝不把Administrators owner当合格。

环境凭据隔离专项RED missing helper 1 → GREEN1，原source类型检查0；第一次命令误用不存在的package内tsc MODULE_NOT_FOUND保留，改为现有根tsc后0（非源码类型错误、0安装）。本地原5Desktop套实际229/229，含原native28及新增隔离检查/实际native startup；来源receipt task39-desktop-full-result.json，耗时296.25s。只读审查发现诊断仍传旧3变量（P2），修正直接使用同一产品helper，保留首次stock/另一owned目录/5秒界限；最新专项补验与下一原云端四CI仍需记录，不能冒称云端已绿。

本机设置Administrators owner的模拟仍不被OS允许（task39-owner-fixture-capability.json supported=false），仅夹具能力探测，不能算有效产品RED/owner修正效果。云端原owner为Administrators的观察案例须依原完整ACL断言验修复，不新增放宽。

## 日常交付准备

实际Daily仍Runtime0.1.24/Desktoppreview.25，未安装，47保护文件哈希保持。E原public回滚127files373,438,322B再核原件/副本一致。补45项保护数据（会话/配置/状态）5,632,873B到E:/Tianwen-runtime-025-pre-delivery-20261007/protected-data，private ACL当前user/SYSTEM，owner当前，逐hash一致；只是copy不移动原件/凭据，无共享依赖。首ACL不必要无条件SetOwner当前（原owner已当前）被WRITE_OWNER拒绝、0copy；v2去掉不必要owner写并原owner严格核验成功，首失败保留。

旧managed Profile树184,030,074逻辑字节/27513files/25973硬链接/1787junction；D约15.4GiB，按完整额外树仍有约247MB高于15GiB的余量，实际部署必须各阶段核空间，不据此承诺所有波动安全。预期47路径仅5项变化：受管manifest/native patch、Webmanifest/lock、安装receipt；其余42（包括会话/long-goal/配置/shortcut）须原hash，任何意外变化先查/恢复。原备份源未改。

main/Daily仍NO-GO，goal active。Task31/33已有原学习闭环，不重评旧答案、第三票或等待自然事件；剩原CI与实际受管升级/运行/数据保护收口。两个旧递归删除目标被自动审批blocked by policy，未执行未绕过，D未达20GiB不冒称全清理。

最新补验：P2修后环境隔离+首launch 2/2实际0，产品source未改；独立终审规格PASS/代码质量PASS/P2关闭，报告task39-final-review.md SHA256 3090cbde98d24c33ea255a148d26495f915a11ffddbf9535e3194c5615adb40a。接下来提交原四CI、重建同一owned候选Desktop，不在云端成功前安装Daily。

## Task40/41：推翻五路径假设，消除模块发现依赖

Task39 原四项 CI37550791826 已结束：Python、TypeScript、installer-windows 成功，Desktop 12失败/217通过；补五个环境路径没有解决超时，旧失败保留。Task40 短诊断37551738408只表示诊断运行结束，不是发布通过；同一云端主机九种启动的原始结果显示：原三/八变量最小环境在首个 Select-Object -Unique 管道处停住，完整标准环境下同一权限脚本完成。系统组件自动加载是解释，未把某个变量单独认定为原因。

Task41 将两处去重管道改为 PowerShell 语言原生数组，当前用户与 SYSTEM 相同则只保留一次；恢复原三环境变量，原10秒预算、owner 条件修复和全部严格 ACL 检查保留。本机 native 原套29/29、启动及隔离专项2/2、类型检查0，0模型。下一先在临时诊断分支验证同一修复，再移除临时诊断并运行原四项发布 CI；不新增学习门槛。Task31/33 原自动学习证据保持，不重开模型研究。

目标 active，main/Daily仍 NO-GO；实际Daily Runtime0.1.24/Desktoppreview.25未安装升级，原47项数据保护仍要求验收。D约15.38GiB（16,512,679,936字节），高于15GiB但尚未20GiB。三次旧残余删除被自动审批 blocked by policy，均未执行、不绕过、不称清理完成。详情见[tianwen-desktop-acl-startup-result-20261007.md](tianwen-desktop-acl-startup-result-20261007.md)。

以下保留历史记录，以本节为当前状态。
