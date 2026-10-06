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
