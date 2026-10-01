# 受限宿主的原生事实工具曝光

## 实际问题与继承边界

535ad72 唯一新原生任务已完成 read/edit/read，但根另调 tianwen_captured_file_facts，事前三工具执行guard拒绝该调用，完整文件证据失效，原review inconclusive/external unverifiable，候选拒收、原文件已恢复。证据在 D:/DevData/tianwen-outcome-module-native-20261001；不重跑、修答案或回填原任务。

只读核对已安装 DSH 公开 restrict({allow:['read','write','edit']})：它过滤继承工具，Agent自己的注册保留，用于自身回答工具等正常能力。天问事实工具在 agent/created 注册到Agent自己层，因而绕过此过滤。不是上游过滤器缺陷，不能重建通用权限平台或修改上游。

## 最小实现

正式bundle与文件observer增加可选 `exposeCapturedFileFacts?: boolean`。仅显式false时跳过该工具的安装；默认及true保持原行为。宿主在启动时明确配置，配合原生restrict过滤其他继承能力；原guard继续约束路径/预算。该开关仅影响天问拥有的事实工具，不可剥夺子Agent自身回答/结构化工具、不影响文件前像/最终产物捕获与结果合同、不放宽被禁调用的证据规则。不能自动从自然语言猜权限，也不追加验收门槛。

能力代价：显式false的宿主不能使用初始文件字节/行数/摘要工具；需要这类任务的普通宿主继续默认。宿主负责跨启动保存同一配置；不写旧账本或借新配置改变旧失败。产品没有新增面向用户的设置流程。

## 执行

- [ ] 默认/true仍曝光，false新Agent及已存在Agent不安装；原生restrict后受限根恰好read/write/edit，零真实模型首红后修复。
- [ ] 禁用曝光仍能原生捕获完整文件结果、执行独立合同及原复核；原facts/变更后拒绝等旧测试保留。
- [ ] 正式bundle传递配置与实际服务启动通过0模型预检，原持久任务/ledger不变；不重跑原失败任务。
- [ ] 相关回归、八包类型/声明、修改文件与完整相关测试strict对照原基线、独立只读审查。
- [ ] 文档/小收据/本轮夹具清理与推送DEV；完整目标active、NO-GO/隔离/C—F/原十工作日窗口保持。
