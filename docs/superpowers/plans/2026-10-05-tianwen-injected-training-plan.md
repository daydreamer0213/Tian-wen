# Explicit Training Fault Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 主动提供明确标注的两种训练故障，以真实研究和未来任务验证学习效果，不再等待模型偶然出错。

**Architecture:** 仅在隔离DEV的原llm/stream入口，对三个原绑定训练Task使用确定故障算法；其余所有模型请求继续真实派发。错误和生命周期工具都作为原SDK请求执行，host仍负责资格、研究、激活和未来评价。

**Tech Stack:** 已安装Node22、原发布DSH/Runtime、固定Python独立检查器、DeepSeek v4 flash。

## Global Constraints

按[设计](../specs/2026-10-05-tianwen-injected-training-design.md)，保持原预算、次数、阶段、权限、独立检查及发布门槛。所有运行数据D:/DevData；无依赖安装/环境副本，旧证据不补评；scripted训练不充自然模型错误。

### Task 1: 可审计训练模拟器

**Files:** D:/DevData/tianwen-real-injected-learning-20261005 下准备小型原脚本、新 training-injection.mjs 与 training-injection-controls.test.mjs；repo不改产品行为。

**Interfaces:** `injectedTrainingBlock({phase, role, record, goalId, nativeGoal, tools, closing, calls})` 对非training或非原Task返回null；其余返回原SDK text/tool-call block。`closing`仅来自当前轮原宿主标记，不能按active method分支。

- [x] 固定九新df-dn记录，三原训练命令加显式注入/非自然说明。保持原caller条件和固定Python判断，不修改研究案例预期。
- [x] 写控制：两个未解决记录注入failed、正常passed；未来/研究/Planner均null；标记轮先get_goal，再精确goal_id/revision的scoped完成；最终JSON不变、不同Goal拒绝。首RED保存。
- [x] 实现训练算法：`status=stages.every(s=>current[s]==='passed')?'passed':'failed'`；不能使用正确pending分类器或未知未来答案。
- [x] 在旧bootstrap原provider计数前加精确Task身份分支。保存`scripted-training-traces.jsonl`（原完整envelope+actualBlock+scripted/fault原因），零真实provider派发；其他路径原实际dispatch/完整JSONL不变。
- [x] 检查所有新控制GREEN、真实派发不触碰错误/答案/裁决、caller合同两臂同可读、三训练显式来源说明；冻输入、脚本、方法无关适配故障。

### Task 2: 唯一受控研究和未来比较

**Files:** 同根freeze-launch/launch-batch/bootstrap及原结果，repo更新权威交接。

- [x] 原清洁HEAD和二十九实际consumer/三账本冻结；Docker隐藏自启、原84完整身份与精确缓存镜像核验，不下载。原CLI0模型预检。
- [x] 唯一正式run已执行并保存首结果：四事前未来基线3/4、两scripted错误经真实内容评审拒绝；第三正常Task因第二次Planner恢复未认领而未完成，原预算停止。111真实+12scripted请求，未进入原五案例十臂，不写source/proposal/verdict/activation。
- [ ] 如产品原激活则四同一事前未来真实模型、记录方法材料与独立结果、原关闭同意撤回。真实baseline/after按原score比较，注入开关不会匹配两未来阶段。
- [x] 保存首结果与原错误，同句柄排空，actual与scripted请求轨迹分别完整、历史/输入/消费者未变、真人反馈仍零。Docker自停，六精确重复清2,106,091bytes，D17.14>=15；[准确结果](../../operations/tianwen-injected-learning-readmission-result-20261005.md)。
- [x] 更新准确首结果与后续修复范围；已有隔离分支提交推送，完整目标保持active，main/Daily NO-GO不以模拟结果冒充自然证据。

### Task 3: 修复重复恢复与无停止原因的运行假象

不是等待自然样本，不增加验收门槛。公共SDK历史敏感控制已复现旧提示第二次不认领，明确本轮提示恢复成功；原发布失败停止控制1 RED/6守卫GREEN。

- [x] 恢复工具说明、普通和权限恢复指令明确“当前这轮”，以前工具调用不授予本次临时恢复资格。
- [x] `recoverParent`获取失败，在原权限/身份/最新原结束轮和Goal仍有效且无已接受或pending续轮时，复用原stopTask持久暂停、记录planner-recovery-failed，原Task/Goal未完成且原cause继续上报；变化或取消不覆盖。审查补齐异步快照窗口，写停止前同步复核live事件。
- [x] 最终源码154、严格类型/差异、原15实际构建、发布包49/10原跳过、新发布控制7全部通过；新原CLI重复认领成功/未认领明确暂停共27scripted/0real，退出和排空0，不强行调用工具或修改Goal、driver、裁决。
- [ ] 提交准确修复及首结果；新身份继续原受控研究/未来/撤回，不重评本批或扩样本。
