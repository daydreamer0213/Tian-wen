# Task37：原发布 CI 的路径与权限问题

Task36 候选 dafc2e41 已实际 clean 构建、110/110 bundle/native/public 回归、pack、Desktop 成品审计。PR6 原 CI 37545783570：Python 成功；Linux 自然学习组 168 失败/714 通过/2 跳过；Windows Desktop 12 失败，其余四套通过。保留首次云端日志，不重开学习研究或增加标准。

ROOT 负责源码/测试/文档。沿用既有只读 reviewer，不新建 agent。生成物位于 D:/DevData/tianwen-025-release-controller-20261007。

- [x] 修复四个测试文件的系统路径、缺失 tmpdir 导入及 Linux CLI fallback 初始化，两个受管 bundle fixture 固定原合法 D 路径；不更改案例、断言、超时和产品绝对路径校验。
- [ ] 用明确模拟的非当前用户目录所有者复现 Windows 启动权限失败，先 RED；只在证实后修复，保留原 ACL 权限拒绝和无损观察要求。
- [ ] 原对应完整套件与实际 native startup 核验，独立复核后提交并运行原四项 CI。
- [ ] 更新准确候选包与安装验证，满足原发布条件后再考虑 main/Daily；目标保持 active。

D 剩余约 15.4GiB。复用候选目录、依赖和缓存；不全量复制环境。此前 scratch 删除和本轮已结束 pytest 残余删除均被自动审批 blocked by policy，未执行、未绕过；压缩冷候选字节保持相同，不冒称删除完成。

本地原四套436/436、bundle81/81、native28/28及诊断专项1/27未选退出0；两独立静态审查PASS。管理员owner模拟在设置夹具时拒绝，不是有效RED，不能据此修产品；Desktop下一原CI保存失败ACL快照。首次原CI准确结果为Python成功/其余三失败，见当前Task37结果记录。

## Task38：第二次原 CI 的剩余两项

原 run37547547369：Python、installer-windows成功；Linux自然学习仅2失败/880通过/2跳过，都是明确Windows-only的DEV边界用例。将这两原用例迁到原installer Windows job同一合法D映射内执行，Linux明确skip，不放宽产品边界、不丢覆盖。

Desktop仍12例stock失败约10秒，与原ACL子进程10秒deadline一致；protected=false/owner=Administrators且原继承规则未变，不能据此直接认定owner问题。仅在首次stock后，另一自有目录运行精确生产PS脚本/minimalenv，额外诊断最多5秒以保持原20秒用例deadline，记录stderr/status/code/signal/耗时；不重试首次准备、不修改首次路径或原断言。通过下一原CI定位根因，然后最小修复并复核。

本地DEV两原控制加ordinary对照3/3已通过（其余175未选）；不把管理员fixture设置失败算RED。

Task38本地三控制3/3、最新launch首例1/1退出0；原public-repository严格workflow快照RED1/26保留，逐字同步Windows两原控制后27/27。expected长行ruff失败以原精确command变量替换，等值断言保持。既有独立reviewer只读PASS；总耗时最坏受ACL快照影响，若下一CI诊断本身timeout只能如实保留，不能捏造根因。

## Task39：已捕获ACL超时的最小修复

Task38原云端Desktop仍12失败；另自有目录精确脚本/minimalenv已捕获ETIMEDOUT/statusnull/SIGTERM/stderr空/5017ms，原prod预算10s未改。保留此RED。Linux自然学习已过，原其余job仍待终态，不提前报全绿。

修复仅允许PS继承Windows运行必需TEMP/TMP/USERPROFILE/APPDATA/LOCALAPPDATA，不整体透传环境或模型密钥，保持NoProfile/原10s/fallback/完整ACL验证。先应用原私有DACL，再仅实际owner非当前时单独设当前owner；不无条件写owner，避免无必要WRITE_OWNER请求。原hostile ACL/启动28套保持覆盖，原4CI验证真实云端差异。

E保护数据45files5,632,873B已严格current/SYSTEM ACL复制/逐hash，无共享SDK、不移动原件；首次备份ACL无条件SetOwner当前（原owner已是当前）在WRITE_OWNER失败、0文件复制；v2只设DACL并原owner核验成功，失败收据保留。D旧managed树184,030,074逻辑字节，25973硬链接，1787junction；当前15.4GiB、按完整旧树额外copy后尚约247MB余量，实际安装仍需逐阶段空间核验。

## Task41 有限收口步骤

- [x] 保留 Task39 原 CI 三绿/桌面失败及 Task40 九臂原结果，不把诊断退出0当发布。
- [x] 两处 Select-Object -Unique 改语言原生去重，原3环境/10秒/ACL/owner要求保持；本机29/29、专项2/2及类型0。
- [x] 临时诊断分支37552691186九种启动退出0、原三变量完整脚本192ms；独立源码审查PASS。
- [ ] 移除临时诊断工作流/驱动，推送最终产品源码，原四CI全部成功。
- [ ] 同一候选Desktop重建、成品审计和实际窗口；Runtime输入未变则复用原实际构建并核绑定。
- [ ] 沿原发布流程实际受管升级、Web更新、Desktop切换，验47数据保护/真实运行/原main CI，给出发布结论。

不另开学习研究、第三票或新验收标准。生成物仅D，保留E回滚副本及自动审批拒绝，不重试拒绝删除目标。

## Task43 原文件证据竞态

Task41原桌面CI已成功，installer原600项出现1个已有并发别名检查失败，首次原记录保持。修复首次共享preimage预约的异步边界，保留完整路径安全和原序号守卫、不串行tools。受控屏障RED1→专项9/完整三套122及类型0。Runtime输入改变，原构建绑定不得复用为最新；下一原公开构建/准确CI/固定83摘要和实际受管交付，沿用原门槛。
