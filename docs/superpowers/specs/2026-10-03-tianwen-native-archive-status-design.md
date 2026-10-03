# DEV归档状态：工作包收口设计

基线0c25a49，继承bac5397事前固定的status合同/入口，答案尚未知，不改断言追求通过。目标是实际展示五个独立事实：归档字节/集合、任务状态、原程序记录、整体评审、不能据此推断方法采用。完整自动学习仍须原研究/语义/激活/未来效果证据。

首先由实际Tianwen原生Task实现唯一纯模块formatDevelopmentNativeArchiveStatus；现有Runtime/guard/双检查/固定镜像/Profile复用，20KB单目标、原共同条件、一次未知答案、0重试。原任务/result/native/首稿先保存，再新进程准确cold；有据工程遗漏才单独修复，不回评原结果。reader与status成为已执行普通任务后，旧study snapshot不能再当未知独立case。

消费者采用现有DEV宿主的只读检查入口inspectDevelopmentNativeTaskArchive(ctx, config)，不扩SDK包、Web界面、调度器或保存另一份原生档。config声明resultRoot/sessionId/outputPaths、真实signal、可选maxArchiveBytes（省略64MiB，与现有收尾一致）。读取实际六文件和既有archive-seal.json，复用reader/verifier；通过调用方实际Evolution取得该session的原Task，用已有summary投影，再调用formatter。返回{verification,summary,status}。不从task.json/native gzip重建SDK身份、任务裁决或成功，也不推断自动学习；当前SDK记录与归档字节事实分别呈现。

选择只读入口而不改变runDevelopmentNativeTask返回result或每轮多写status档：展示失败不改变原执行结果，已存字节清单可直接复用，不制造成功回执。真实缺seal/损坏JSON/读取失败保持错误，无现场新造seal或补原文件。输入参数须在I/O前校验；seal文件同样受实际字节读取上限约束，超限不解析。原档有后续SDK事件时，只读入口表示当前SDK原记录，不把旧封存档改写成最新状态。

工程验证包含成功/取消/不完整/原整体未定、seal缺失或损坏、大小边界、错误signal及session、输入不变和零模型/程序再执行。实际发行控制及新进程cold沿既有SDK恢复/proof校验，再消费只读展示。最终以真实原生档核验完整路径；旧无host seal的归档不补文件或自行声称一致。source原判断仍由SDK，不用漂亮标签替代研究证据。

读取上限按六个原记录与seal文件的实际字节总和计，恰等上限可读；读取前核对文件大小，读取后再核对实际长度，seal超限在JSON解析前拒绝。取消保留原signal.reason，既有封存与SDK账本均不写。无SDK任务时保留原summary的null/false，而不从归档补任务。

原有限归档工作包在此收口，不追加近似小题逼出失败。运行根D:/DevData/tianwen-native-archive-status-20261003，复用依赖/镜像/正式档，保留必要首结果而无全量环境副本；程序容器、快照和自有测试临时根收回、Docker关闭、D≥15GiB。原同意/隔离/门槛/停止/去重/十工作日决策期限保持，目标active/incomplete、main/Daily完整学习NO-GO不变。
