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

- [ ] 原清洁HEAD和二十九实际consumer/三账本冻结；Docker隐藏自启、原84完整身份与精确缓存镜像核验，不下载。原CLI0模型预检。
- [ ] 唯一正式run：四事前未来基线真实模型；启同意后三scripted训练+真实内容评审；产品自动研究五案例十臂。不能写source/proposal/verdict/activation。
- [ ] 如产品原激活则四同一事前未来真实模型、记录方法材料与独立结果、原关闭同意撤回。真实baseline/after按原score比较，注入开关不会匹配两未来阶段。
- [ ] 保存首结果与原错误，同句柄排空，确认actual与scripted请求轨迹分别完整、未修改历史/输入/消费者、真人反馈仍零。Docker自停、只清已证明的自有重复，D>=15。
- [ ] 更新准确范围并提交推送已有隔离分支；完整目标保持active，main/Daily NO-GO不以模拟结果冒充自然证据。
