# 标准 Loader 一次性任务入口已交付

基线 f444d610。本轮把事前固定的任务数据接入既有执行器；不新建 Agent 生命周期、调度器、计时器、结果库或学习裁决。完整自动学习仍未完成，main/Daily NO-GO 与原十工作日决策窗口保持。

## 实际实现

`scripts/development-native-runtime.mjs` 保留原可信合同 JSON 与原 `applyDevelopment`，增加临时只读合同绑定。绑定只比较原 cwd、完整请求及输出/参考集合，数据深拷贝并冻结，不判断学习资格。原始 JSON 读取和工作区物理边界检查由两个插件共用，原摘要、8MiB 加载限额和工厂校验保持。

`scripts/development-native-task-job.mjs` 是原 Loader 插件：配置只有 `jobPath/jobDigest`，读取 SHA256 固定的原 UTF-8 JSON，拒绝额外回调或 Runtime 字段。任务原字节必须在可写工作区外；归档根必须在 D:/DevData、工作区外，已有规范父目录下，不能是链接根。原文件策略构造器验证原声明和目标预算。

挂载完成后，调用者通过 `ctx.tianwenDevelopmentNativeTaskJob.run(signal)` 执行。加载本身不发请求、创建 Task 或给予同意；调用者持有原 Context 和 AbortSignal。调用时再核匹配，直接委托原 `runDevelopmentNativeTask`。入口只检查原准备记录存在；执行器仍执行完整的原 Task/请求/header/输入/输出/模型准备门。原新会话、独占首次归档、文件权限、取消排空、释放 handle 和封存保持。普通合同入口不宣称已经交付 Goal 自动启动或整套交互宿主。

实际接入顺序：先挂原 SDK Llm/Session/Agent/Loop/Subagent、原观察工具、JSONL、文件与提供方服务，再由原 Loader 挂 Runtime 插件和 job 插件，等待原服务就绪，最后显式调用上述 run。操作者合同和 job 在未知答案前固定；不能把旧会话或旧归档配置成新任务。

## 验证与首失败

证据目录：`D:/DevData/tianwen-standard-native-job-20261004`。

- 初次 red 重定向父目录不存在，测试未运行，不能算红。随后匹配的 red 5项失败，确为缺少入口及绑定。
- 首 green 11项中7通过/4失败：Vitest 解析器不消费原生 Node hooks；Service 代理无法绑定不可配置的只读函数属性；测试误以为原 Loader 创建失败只留下 inactive fiber。分别改为真实子 Node 读取、冻结数据加 prototype 方法、断言原 create 拒绝。没有改原 SDK。
- 最终 `final-tests.json` 97项通过/0失败/0跳过：原 runner28、原准备门57、Runtime6、新入口5、原生导入1。两个脚本普通 Node 语法检查及 git diff 检查通过；本轮没有改 Runtime/Evolution 源码，既有发行字节保持，不无故重建。
- 独立只读复查无有据 P1/P2，并明确下面控制不能证明真实模型完成或学习效果。

首实际 SDK 控制顶层 `sdk-attempt` 原样保留。Docker 当时停止，原检查器 prepare 没有提交，脚本却在自己的 llm/stream 截获里断言准备存在。根 Task 以该断言错误结束；runner 正常返回失败摘要，所以外层“应拒绝”的断言失败。它不是成功取消证据。该截获早于原请求观察 guard，故后续控制改用原 LlmAdapter 终端注册，不通过截获绕过原 guard。没有修补或重评首 Task，没有修改产品来迎合控制。

随后是两个有不同环境条件的新独立工程场景，不是旧 Task 重试：

1. `unavailable/sdk-result.json`：原 Loader/原 runner，Docker 停止。脚本识别请求1、根 adapter0；原 guard 以“frozen checker before first native root request”拒绝根请求。失败 Task 与封存归档一致；第二次启动拒绝，归档字节不变、handle 已释放、调用者 Context 保留。
2. `prepared-cancel/sdk-result.json`：短暂启动现有 Docker，原检查器完成准备后，第一次根 adapter 调用取消。脚本识别1/根1，原取消抛出、Task 与完整 seal 一致；第二次启动拒绝且归档不变，handle 释放、调用者 Context 保留。最终自有 Context dispose。没有执行生成项目或创建运行容器，Docker随后停止。

两个工程场景均显式只在新隔离 Profile 记录工程同意，挂脚本 adapter、0真实模型、0自然任务、0研究；持续及正式业务账本摘要在 dispose 后保持。不能把它们充作第二个自然问题、成功对照、真实反馈、正常文件执行闭环或后续收益。

## 下一步与资源

本入口控制收口，不再重复以增加计数。接下来由执行者选择实际开发缺口，事前冻结要求及独立预期，经标准入口执行唯一首次真实任务，保存首次结果。仍缺第二个输入独立的兼容问题及兼容合格成功，之后依原五案例/十臂程序验证、研究裁决、受治理激活、未来任务效果和语义安全分别核实；不索题、催评、不改验收标准或自动延长窗口。

本轮没有新依赖、环境副本或删除请求；测试自清本轮自建根，71个原拒删路径保持。三个小工程 Profile 及首失败包暂留核验；最终 D 空间、大小及原账本摘要记录在本包 `final-audit.json`，不全量复制开发环境。
