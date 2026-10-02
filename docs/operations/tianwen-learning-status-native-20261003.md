# 实际学习状态任务、独立功能失败及工程修复

本轮有具体进展，完整自动学习目标继续 **active/incomplete**。实际开发任务首次消费固定 DEV Node 宿主入口，独立运行发现了模型复核没有识别的字段层级错误；原失败保存，随后执行者完成独立工程修复。不能把修复后的检查追记成原任务成功，也不能把一次真实问题当作已经完成研究或学会改进。

## 原任务与真实失败

事前源码 `d0a76552a665d2c74d3f2e03463134f5af4c948a`，真实待办是将注册 `tianwen_learning_status` 快照解释成中文，明确任务完成、检查通过、研究与启用的不同含义。原合同、实际输入、28项期望、固定 adapter/JSON/发行文件及权限均在模型作答前冻结。首只读捕获因控制端漏装原服务返回 unavailable；原结果保留，补齐原生装配后零模型捕获有效原状态。这不是天问任务失败，未计为正式尝试。

唯一正式任务 `conversation-task:78fb60e713288cf36b1e741c4b68e94d4e01e5a00f71a50797ec9d5849942db5` 使用实际发布 Runtime、同一正式 DEV 档案及固定 `scripts/development-isolated-node-check.mjs`；12提供者请求、6根请求、5文件工具动作，检查准备1/执行1、1尝试/0重试。根任务交付结束，原两模型复核均为 met，但独立功能检查 rejected。只执行了第一项 `actual-status-14`，其余27项未执行，不得声称原稿已经接受完整28项测试。

原程序从 `history.completion` 读取完成数，而实际合同及注册快照在 `history.naturalConversation.completion`。合同第11行的层级明确；第12–15行“同一history对象”的简称存在表述不够精确之处，不能说所有字段描述毫无歧义。完成数字段的明确违约已足够支持第一项拒绝，不用其他描述凑归责，也不更改原合同或原期望。

原容器正常退出2、stdout `{"error":"invalid-learning-status"}`、stderr空，无传输中断/OOM；边界核验和清理通过。回执与原稿原字节SHA256一致：`ab48185e7019cf49b0cacb0674e86127d16a212da2a7ff3e58a03dd1ffdcaba9`。不是环境失败。`hasRejectedConversationCodeCheck` 原谓词为 true，提供一项绑定原必需条件的负面结果；它不代替研究来源组的全部资格。

## 独立工程修复与可用交付

原稿保存为运行根 `unverified-candidate.mjs`，原 task/material/program/两模型复核已零请求、零重新检查精确冷恢复。随后执行者从保存原稿复制工程文件，仅将五个历史子对象的父对象改为 `historyNaturalConversation`；没有重新让天问作答或改掉原功能拒绝结果。

新增四个可移植回归测试：正确原嵌套及不同计数、根层元数据不得覆盖、根层仿字段不得补缺失嵌套、未知状态及非隔离不代表启用。原稿首红1通过/3失败，修复后4/4通过。工程稿在宿主 Node 下与原冻结28项期望逐项比较，28/28通过；另处理本轮之后的真实注册快照并保留原计数和语义。上述是修复工程回归，**不是原任务的隔离检查、成功对照或自然学习效果**，未新增正式任务或改账本。独立只读工程审查确认原P2关闭，无新增有据P1/P2。

交付：`scripts/summarize-learning-status.mjs`；验证：`node --test scripts/summarize-learning-status.test.mjs`。调用时将原注册工具JSON经stdin传入，stdout得到中文JSON，不读取其他文件、联网或启动子进程。生成的本轮实际中文说明位于运行根 `learning-status-readable.json`。

## 当前学习事实与下一步

正式档案当前有15项观察记录、14项识别并完成的任务，不能把观察记录数叫作完成任务数；反馈评估0、研究0、隔离true，当前工作区 readiness 仍 `awaiting-compatible-sources`。历史2项功能拒绝与1项已撤回结果同时保留，不能用原始拒绝总数推断两项合格来源。旧完整1799b99f…账本字节前缀保持，新完整SHA256 `bc1b30d23c2d228492bbd9c6b2eb5901e0ac20798c51e3caf6881ddd08a6f586`。

这次实际证明：模型复核说代码符合要求，并不能证明程序正确；独立功能检查已能保存与原必需条件绑定的真实失败。尚未证明重复问题形成研究、方法独立有效、正式采用或未来任务收益。main/Daily 完整学习 **NO-GO**、原同意、正式隔离、来源/结果门槛及十个工作日决策窗口不变。

下一自主推进实际宿主的研究结果组合接缝：公开包已有普通/单研究/五角色研究结果工厂，固定 DEV adapter 目前仅接普通任务工厂。先复用固定宿主配置装配研究结果检查，不增加第二套研究循环或宽松开关；按原五角色合同与完整保存材料绑定检查，在合法兼容来源出现时接原 loop。该工程接入不依赖所有者供题或评价，也不冒充自然研究。随后继续本来有价值的项目开发，保留实际结果，不制造第二次失败、不改条件拼来源、不重跑旧成功任务。

## 保留与资源

运行根 `D:/DevData/tianwen-learning-status-native-20261003`，终审约0.63MB，根原生会话仅压缩保留，无全量档案/依赖副本、新下载。唯一自有容器已清，历史84个容器ID精确保持，临时执行目录0、Docker后端0；D约18.66GiB，满足15GiB底线，未达20GiB偏好。容器审计首命令误读配置属性导致退出125，另存控制错误并纠正，未修改容器，不当原任务失败。

证据索引：`frozen.json`、`launch-seal.json`、`status-capture.json`、`task-result.json`、`native-result.json`、`functional-result.json`、`unverified-candidate.mjs`、`root-native.json.gz`、`cold-read.json`、`after-status.json`、`repair-red.log`、`repair-green.log`、`repair-verification.json`、`final-audit.json`。精确DEV交付与远端以 git HEAD 和本运行根 `remote-final.json` 核对，不合并或发布 main/Daily。
