# DEV 自动研究检查宿主交付

实际开发入口的研究检查接缝已实现并由发行 Runtime 消费。完整自然自动学习仍未完成；本轮没有要求用户提供任务，没有重跑旧自然答案，没有新增验收门槛或重置十工作日窗口。

## 交付内容

原 `scripts/development-isolated-node-project-check.mjs` 新增 `createDevelopmentFunctionalStudyResultCheck(config)`。启动时深拷贝单项目的事前合同，复用原文件/质量解析器和 SDK 构造器检查请求、路径、JSON 断言、入口及独立标准；只读输入必须有原内容，图不能占用执行器原保留路径或产生原 TS 别名冲突。没有环境准备、任务伪造、来源写入、配置注册平台或新的学习裁决。

研究选中实际两份来源和成功对照后，沿原纯装配器匹配完整原请求和初始文件图，委托公开闭合 cohort。每次独立准备先清旧绑定，仅成功、未取消且最新的准备发布；未知、重复、漂移、错误、取消不借上一轮合同。旧 prepared evaluator 仍保留自己的冻结合同，新模型或 cohort 不会改写它。

同时新增 `createDevelopmentNativeCheckOptions(ordinaryContract, studyContracts)`。两种合同必须同一冻结 cwd；未来实际 DEV 调用者在 mount 之前这样接入，保留原状态根、捕获、拒绝记录及生命周期配置：

```js
import { createDevelopmentNativeCheckOptions } from './scripts/development-isolated-node-project-check.mjs'
const checks = createDevelopmentNativeCheckOptions(ordinaryFrozenContract, studyFrozenContracts)
await applyBundle(ctx, { ...originalRuntimeConfig, ...checks })
```

`studyFrozenContracts` 含原 cwd/quality、至少三份 original 原合同，以及尚未执行的 adjacent/holdout 独立合同。每份合同保留原请求或独立 prompt、完整初始 entries/outputPaths、entryPath、原 cases/requiredCondition；独立合同还保留 criteria。不能从模型答案或检查结果生成期望，不空配、不晚注入、不重试旧 pair。此工厂返回既有 Runtime 的两个选项，没有新 Runtime 包装。

## 实际验证

新工厂缺失首红后，DEV 三组最终 **44/44** 检查通过，其中包含实际固定 SDK 五种角色、两输出图、反序权限、原正确/错误期待、配置复制、未知/漂移/重复、取消、模型切换和旧 evaluator。实际 SDK 的旧 evaluator 在更换或取消新 cohort 后仍执行原合同；候选留出错误仍返回原 requiredCondition 摘要的 rejected。

新增实际发行 Runtime 控制 **1/1** 通过：三个普通工程控制分别原功能 rejected/rejected/verified；自动准备一次独立案例、五角色检查，再执行十臂。十臂原功能结果为 rejected/verified/rejected/verified/verified/verified/verified/verified/verified/rejected。候选留出双审 met，但其原功能 rejected，独立结果不满足、激活未发生，原 accepted 模型裁决含义保持。真实状态工具也报告该区别。

控制使用 89 个 scripted 请求、0 真实模型请求、0 正式自然来源。同 Context 重新 mount 的冷恢复 task/study/完整 ledger 精确、0 请求，ordinary prepare/eval 仍 3/3、独立供给/prepare/eval 仍 1/5/10，没有重执行。这些数据只证明接线和原机制，不证明自然学习、正式采用或未来收益。

独立审查先发现只读 null 原校验太晚，启动检查已落实。实现审查发现执行器保留路径/TS 别名冲突原本到执行才拒绝，8 控制首红后提前检查；其中一个目录别名控制的原预期有误，按原执行器源码修成真实冲突，原错误日志保留，没有改产品规则。再审两个 P2 均关闭，无新增有据 P1/P2。

本轮只改 DEV 宿主及检查，SDK 源码/发行根和固定 checker 身份逐字不变，因此没有重复整包构建、旧全量模型实验或旧 Python 功能合同。新增启动路径检查后再次跑实际发行控制，保存为独立工程记录，不改判旧控制或自然任务。

## 正式状态与下一动作

最终实际发行 Runtime/真实状态工具新进程读取正式档，0 模型/程序执行：20 观察、19 完成、13 来源初筛、1 可信问题、5 成功初筛候选，兼容问题组合 false；反馈归因 0、研究 0、隔离 true。完整 ledger 1140550 字节、SHA-256 `034d966f48633797f462ef07f30721c76dd392e7a894c3041470d539a265c187`，原 81fc103 首结果所有封存文件逐字保持。固定发行 checker 根 `1c0718e6c99fc8f9836859da23db663179caea255bdb454754c72368f5492abf` 保持。

剩余原验收证据是：自然任务里可归因的问题触发独立研究，合格方法在原治理下采用，后续实际任务有收益且能回滚。缺兼容问题组合限制目前的自然研究，并不要求整个项目停工或用户再出题。

下一整理后续原生执行的调用配置，默认采用上述双检查工厂；从确有用途的开发待办选择工作，为其完整原合同及尚未执行的邻近/留出合同事前冻结，再交天问一次未知答案。优先考虑已有任务归档完整性核验及本轮生成物的容量/所有权核验，它们服务真实续跑与 D 盘约束，不是新增发布门槛。成功照实交付，真实问题才进入原研究链；不得预设失败、堆近似练习、重评旧答案或要求用户补评价。

完整目标 active/incomplete，main/Daily NO-GO 与原同意、隔离、历史、资格、去重、停止和十工作日窗口保持。小型证据在 `D:/DevData/tianwen-dev-study-result-host-20261003`，无依赖安装、镜像下载或整工作区/Profile 副本；本轮临时 Runtime 根清空、快照 0、原 84 容器 ID 精确保持并关闭 Docker，D 盘硬底线保持，最终容量及生成字节见该根 `final-audit.json`。旧自动审查拒绝的清理未重试或绕过。
