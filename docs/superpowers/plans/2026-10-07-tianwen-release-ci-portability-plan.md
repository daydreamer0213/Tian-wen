# Task37：原发布 CI 的路径与权限问题

Task36 候选 dafc2e41 已实际 clean 构建、110/110 bundle/native/public 回归、pack、Desktop 成品审计。PR6 原 CI 37545783570：Python 成功；Linux 自然学习组 168 失败/714 通过/2 跳过；Windows Desktop 12 失败，其余四套通过。保留首次云端日志，不重开学习研究或增加标准。

ROOT 负责源码/测试/文档。沿用既有只读 reviewer，不新建 agent。生成物位于 D:/DevData/tianwen-025-release-controller-20261007。

- [x] 修复四个测试文件的系统路径、缺失 tmpdir 导入及 Linux CLI fallback 初始化，两个受管 bundle fixture 固定原合法 D 路径；不更改案例、断言、超时和产品绝对路径校验。
- [ ] 用明确模拟的非当前用户目录所有者复现 Windows 启动权限失败，先 RED；只在证实后修复，保留原 ACL 权限拒绝和无损观察要求。
- [ ] 原对应完整套件与实际 native startup 核验，独立复核后提交并运行原四项 CI。
- [ ] 更新准确候选包与安装验证，满足原发布条件后再考虑 main/Daily；目标保持 active。

D 剩余约 15.4GiB。复用候选目录、依赖和缓存；不全量复制环境。此前 scratch 删除和本轮已结束 pytest 残余删除均被自动审批 blocked by policy，未执行、未绕过；压缩冷候选字节保持相同，不冒称删除完成。

本地原四套436/436、bundle81/81、native28/28及诊断专项1/27未选退出0；两独立静态审查PASS。管理员owner模拟在设置夹具时拒绝，不是有效RED，不能据此修产品；Desktop下一原CI保存失败ACL快照。首次原CI准确结果为Python成功/其余三失败，见当前Task37结果记录。
