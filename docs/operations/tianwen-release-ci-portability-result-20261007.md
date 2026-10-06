# 0.1.25 发布检查修复与当前进度（Task37）

自动学习原 Task31/33 闭环保持完成，不重开正式研究、效果检查或自然等待。目标仍 active；main/Daily 暂 NO-GO，日常 Runtime 0.1.24 / Desktop preview.25 没有升级。

## 新候选成品

Task36 `dafc2e4145ef860152168edd33f28d4e4fed6718` 在 clean tree 实际完成原构建，收据 16 steps（含原类型图）、11 metafiles。新 runtime.js 为 `bbd888284029684e188a16c14429876ee002fe431850e3145a6192185b808952`；原 bundle/native/public 三套 **110/110**。新 pack 为 `2651fdbc55b9f55a1bfbb67447b7d08d4058bdd6e5d65729d60a49a4a36ad54b`。桌面更新同一候选目录、成品审计退出 0，83 文件；冷目录 NTFS 压缩前后逐项字节相同，释放 127,070,208 字节。此前首次构建的控制脚本把 Windows 反斜杠插入 JS 字符串，构建步骤成功但写收据失败；原脚本/失败说明保留，另一个使用正斜杠的 v2 完整执行退出 0，不把首次退出 1 写成成功。

Task35 完整 Python v2 已结束：**611 通过、4 原条件跳过、退出 0**，不是仍在运行。原英文/中文权限汇总与隔离检查保持。

## 原云端 CI 的真实失败与修复

[PR6](https://github.com/daydreamer0213/Tian-wen/pull/6) 已无主线冲突、仍为 draft，但 [原 CI 37545783570](https://github.com/daydreamer0213/Tian-wen/actions/runs/37545783570) 在准确 dafc2e41 上只有 Python 成功，其他三项失败。原日志保留，不能称全绿。

- Linux 自然学习组 168 失败 / 714 通过 / 2 跳过。测试把 `D:/DevData` 用作 Linux SDK 绝对 cwd、漏导入 tmpdir、文件材料固定 Windows cwd；CLI fallback 安装只在 Windows 初始化，Linux 共享链接指向缺失根。四个测试只修平台默认路径、导入与 profiles 父目录初始化，Windows 原 D 路径不变。后续原 native review suite 的相同默认路径也一并修复。生产绝对路径校验、案例、票、断言和 timeout 不改。
- Windows installer 598 通过 / 2 失败。两个需真实受管路径的 bundle fixture 使用云端 runner 临时根，一个不在 D:/DevData 下，另一个含下划线，均被原安装器正确拒绝。仅把这两项 Windows 夹具建在 D:/DevData/tianwen-runtime-bundle-tests/managed-entry，保持独立随机子目录、完整路由和原断言；不放宽生产路径规则。
- Windows Desktop 12 项 observed 期望收到 stock，其余四套通过。根因还没有确认。本地模拟管理员 owner 在设置测试 owner 时自己被拒，属于无效夹具，保留失败，不据此改产品或宣称有效 RED。首观察测试只在失败时尝试只读 ACL 快照；读取失败缩成错误名，原断言仍执行，成功路径不额外调用 PowerShell。下一次原 CI 获取实际诊断。

本地四套学习回归 **436/436**、原完整 bundle **81/81**；native observation 原完整 **28/28**（开启真实 startup/junction），包含实际 Web 服务、目录操作收据与正常关闭。失败消息最后限定分支修改另核原 first case **1 通过 / 27 未选、退出 0**。两份独立静态审查 PASS；不是云端全绿或新增模型效果。全程 0 真实 provider，未改 Task31/33 的原票。

## 日常数据与下一步

当前实际 Daily 只读预检：受管安装器识别 `managed-runtime-predecessor`，Web 识别 `outdated-runtime`，两个实际版本均 0.1.24；47 份受保护数据/收据/原快捷方式逐项摘要未变，未安装、未发送模型任务。生成物在 `D:/DevData/tianwen-025-release-controller-20261007`。

接下来提交这份最窄测试修复，运行原四项 CI，按实际权限诊断定位 Desktop；准确 CI、安装和数据保护满足原条件后才形成发布结论。现有学习门槛不增，目标不能在此次检查结束时标 complete。

D 剩余约 15.4GiB，仍高于 15、未达 20。已结束 pytest 残余约 150MB 删除被自动审批 `blocked by policy` 拒绝，未执行、未改用另一种删除绕过；此前 scratch 拒绝同样保留。只复用环境/候选目录和压缩已审冷候选，不声称清理干净。
