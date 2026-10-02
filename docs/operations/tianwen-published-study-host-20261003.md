# 实际发行宿主自动研究：独立功能结果与模型决定分别核验

本轮继承c7408d6公开工厂与实际发行宿主，不增加生产循环。完整 Runtime 事前配置普通检查 dispatcher 和既有 closed cohort 供应器，原生三个明确受控任务自动形成两项功能失败及成功对照，再由原 loop 自动准备五检查、设计、提议和十臂试验。没有手工补写来源、研究或决定。

## 实测与原规则

两个全新、故意可控的场景都在实际发行公开入口执行，真实提供者请求0：

| 环节 | 功能条件满足 | 候选留出功能错误 |
| --- | --- | --- |
| 原三任务模型双审 | met/met/met | met/met/met |
| 原三任务独立功能检查 | rejected/rejected/verified | rejected/rejected/verified |
| 研究来源 | 原 checkedFailureSources 两项；原成功对照 | 相同机制，独立新临时档 |
| 设计前供应/准备/执行 | 1/5/0 | 1/5/0 |
| 十臂独立结果 | 8 verified、2原必需条件基线 rejected | 7 verified、2基线及1候选留出 rejected |
| 留出候选模型双审 | 两项met | 两项met，不能掩盖功能错误 |
| 原模型研究决定 | accepted | accepted |
| 保存独立采用条件 | satisfiedStudies=1 | satisfiedStudies=0 |
| 实际状态工具阻止原因 | quarantined=1、independentResultsNotSatisfied=0 | quarantined=1、independentResultsNotSatisfied=1 |
| 激活 | 0，正式隔离保持 | 0，正式隔离保持 |

供应器使用原宿主传入的精确保存来源/模型身份，独立JSON期望及五角色合同在候选前声明；没有从生成答案推导期望。每项原任务准备/检查一次、每研究供应1/准备5/检查10。状态工具查询无模型、无结果检查重执行、账本字节不改。

两个成功场景同档重新挂载完整发行 Runtime，原tasks/studies/账本精确恢复、0请求，准备/执行计数不增长。没有解除隔离，所以这不能单凭“未激活”证明非隔离环境的完整激活路径、未来任务收益或回滚。

## 首失败与纠偏

cc653d7事前计划误把独立检查失败写成原study-decided必须rejected。首次实际两场景：正常通过；负例运行完整十臂后，预期rejected/实际accepted失败。调查原10-01 study-result-check设计明确“原study-decided和accepted含义保持”，以及独立采用guard/状态投影后，确认是控制端对决定含义的假设错误，不是生产缺失新激活门。bc2b58a在下一运行前修正设计与测试为核对两个独立结论：模型accepted保留、独立留出rejected且采用条件不满足；原功能输入/期望/准入、历史和验收要求都没有改变。

修正后完整两场景2/2通过；不是单次全绿。首次失败日志及回执保留，不当模型失败或自然来源。最后新测试完整严格类型检查首5诊断（缺源码Context声明引入及一个可选变量类型引用），补仅类型导入/原配置注解/明确HostContext后0诊断，没有降低严格选项；这些类型修改不改变执行行为。默认最后2项明确跳过，公开发行JS只在Docker opt-in回调加载。

独立静态审查最终无P1/P2，复核原模型决定/独立条件/状态说明的语义一致性。审查者前次未读到accepted原约定的遗漏已明确记录；静态审查不冒充实测，新增测试的源码接口类型不证明发行声明完整。

## 下一项已复现的交付缺口

按真实发布 manifest 单独构造 runtime 子入口的 TypeScript 消费者，首红TS7016/退出2、零TS2307依赖缺失：包清单只有dist/runtime.js、没有对应可独立发布的声明。工作区虽有tsc生成runtime.d.ts，它引用未发布相邻模块，不能直接加进清单冒充完整声明交付。包根工厂声明通过的上轮结论仍成立；本轮发现的是runtime子入口，不能混同。

下一补实际 runtime 子入口声明闭包与公开配置消费，复用原API及当前声明构建工具，不改功能/权限/学习标准。先让同一个实际发布清单消费者通过，再核对工厂接入配置和不合法配置的类型拒绝。该红证据是有据工程待办，不要求用户供题或等反馈。

## 准确边界与清理

本轮只新增2个不同工程集成用例，因首假设修正运行两次共52容器，全部boundaryVerified/removed、历史84容器ID逐项不变。随机临时Profile残余0，Docker恢复停止/后端0。类型消费者临时1.8MB实际runtime.js拷贝核对SHA后已移除，只留小manifest/消费者/红日志；本轮运行根约118KB，D18.90GiB≥15，尚未达20GiB偏好。

正式持续DEV Profile未挂载，完整账本SHA仍 `8a5fb4411926eeb533c41a5937f2e6cf2cc16afa24dec51eb8fe99a58de32408`；继承13task/0study/0反馈评估未变。0真实模型/自然来源/反馈/正式研究/激活/未来效果。完整目标active/incomplete，main/Daily NO-GO、原同意、隔离、原发布门槛及十工作日窗口保持。没有把受控功能失败当自然来源，也没有宣称开放语义安全或完整自动学习。

证据根：`D:/DevData/tianwen-published-study-host-20261002`，包括before、host-study-v1/v2、study-*-场景报告、types-initial/final、default-skip-final、container-cleanup、public-runtime-types-red及final-verification。生产源码未修改，现有已验证类型/构建不重复跑。
