# 可复用独立结果检查 Implementation Plan

> Execute with executing-plans in the existing DEV worktree. Standing owner authorization covers implementation details; no repeated approval is pending.

**Goal:** 从实际发布 Runtime 包导入现有具体结果生产者，消除仅能靠每轮私有驱动导入工作区脚本的接缝。

**Architecture:** 提升两个既有模块并在原路径薄转发；沿用原 ordinary/study/cohort 工厂、隔离runner、结果协议。使用既有包根JS/声明构建和原生DSH接线，不增加平台、依赖或权限。

**Tech Stack:** Node22、TypeScript、esbuild、现有DSH、Vitest、已存在的D盘Docker隔离执行器。

## Global Constraints

- main/Daily NO-GO、有效同意、激活隔离、原发布要求、原十工作日窗口不变。
- 每个检查仍由可信宿主在答案前提供原合同/独立输入期望；不从模型输出补标准。
- 不重跑旧真实任务、旧51案例或改旧结果。只运行与接缝有直接关系的工程验证。
- 大生成物、临时测试根、日志均在D:/DevData，复用依赖/镜像，D余额≥15GiB。
- 旧源码字节/hash在变更前独立小存档，Git原提交仍可定位；新检查绑定新实际发布模块，不继承旧hash。

## Task 1: 一个可发布的具体结果适配器

计划形成后已先运行D:/DevData/tianwen-reusable-result-checks-20261002/public-consumer.mts，直接读取实际dist/index.js对应声明：三项TS2305缺具体工厂，零TS2307缺依赖、退出2。原日志/回执保存，无模型/候选/旧样本运行。它是下述公开消费接缝的红证据，不是产品交付。

消费者实际内容：
```ts
import { createConversationIsolatedPythonCheck, createConversationStudyIsolatedPythonCheck, createConversationStudyIsolatedPythonCohortCheck } from 'D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge/packages/tianwen-runtime-bundle/dist/index.js';
const factories = [createConversationIsolatedPythonCheck, createConversationStudyIsolatedPythonCheck, createConversationStudyIsolatedPythonCohortCheck];
void factories;
```

编译方式：现有D盘Node执行 `node_modules/typescript/bin/tsc --strict --noEmit --skipLibCheck --module nodenext --moduleResolution nodenext --target es2022 --types node D:/DevData/tianwen-reusable-result-checks-20261002/public-consumer.mts`。本项完成后同一消费者必须通过，另以发布清单范围执行JS入口与真实prepare/evaluate机制用例，不能只证明导出名字存在。

**Files:** 新建Runtime源码 `isolated-python-cli.ts`、`conversation-isolated-python-check.ts`；修改Runtime `src/index.ts`；原两个scripts改薄转发；修改受影响现有六组isolated-python检查测试的导入/源码身份预期；新建 `tests/dsh-migration/functional-check-public-api.spec.ts`。

**Interfaces:** 保留 `createConversationIsolatedPythonCheck`、`createConversationStudyIsolatedPythonCheck`、`createConversationStudyIsolatedPythonCohortCheck` 既有参数和返回接口。必要配置类型按原源码导出，不设计另一套运行时协议。

- [x] 存档两个旧源码原字节与SHA到D盘本项运行根；核对无原生任务存活，不修改旧运行包/账本。
- [x] 加包根消费者失败测试：TypeScript导入上述三个具体工厂和原配置类型，目前只有接口类型而没有工厂应失败；JS检查发行index.js出口不能借工作区内部模块。
- [x] 保存首次失败，确认原因是缺具体出口，不是未安装依赖或旧dist。
- [x] 提升原模块，调整相对import到包内；src/index.ts导出原工厂/配置类型。脚本薄转发格式为 `export * from '../packages/tianwen-runtime-bundle/src/conversation-isolated-python-check.js'`，执行器同理。
- [x] 核对源码身份在source/发行JS两个加载边界分别取实际文件字节；checksum变化发生在事前准备，不改变原结果。
- [x] 运行现有 isolated-python-cli、lifecycle、check、native、cohort、cohort-native 六组机制用例；包括输入漂移、无合同、非法/重复JSON、取消等待清理、原condition失败归属及五案例事前绑定，不添加镜像字符串测试。
- [x] 执行现有Runtime类型/构建/声明流程，核对完整JS入口与公开声明一致；保存首失败与修复归属。
- [x] 用发布files清单范围的JS/声明执行实际包根消费者测试，确认无需导入仓库scripts、源码路径或未发布文件；无Docker时明确标出未执行的实际隔离验证。
- [x] 独立审查权限/身份/取消/历史兼容和简洁性；只修明确问题。diff检查后提交DEV及推送，更新权威交接，明确“工程入口交付，非自然学习效果”。

执行选择在实现中顺序推进，不另建任务、不安装运行时或重复全量环境。后续宿主消费/闭环工作另按此项实际结果决定具体范围；不将未实施的后续路线当作已交付。

## Task 2: 实际发行 Runtime 宿主消费

Task1交付0d54289后追踪确认：runtime.ts的apply已经把externalCodeCheck/studyResultCheck传入既有observer/guidance loop，无证据支持增加第二套接线或循环。此次只补实际发行入口的集成验证：从公开根构造具体检查，从公开runtime子入口启动原bundle，使用既有DSH持久harness和明确标记的脚本提供者执行一个全新受控任务。普通准备/执行各一次，完整五对话服务实际就绪；同档重启原任务及账本精确恢复、零请求零再执行。研究服务挂载与检查配置传递不冒充研究发生或研究裁决通过。

宿主框架直接复用已有依赖；受控文件/会话均在本项D盘运行根的随机子目录，完成后只移除本轮已验证归属的目录。真实Docker只消费已有镜像，本次一容器自清后恢复停止。既有正式Profile不挂载/不改，旧案例不重跑。新增测试无新生产行为，沿用现有协议与停止条件；如实际失败，先保留日志定位，不靠复制平台或放宽边界修绿。

- [x] 增加发行包根工厂+runtime子入口的原生宿主集成检查，完整apply而非手动注册两个observer。
- [x] 使用全新明确受控的输出合同，核对真实隔离、一次准备/执行、结果落账与完整服务状态。
- [x] 同档重启验证精确task/账本、零请求/零再执行与激活隔离；清理本轮临时目录/容器、恢复Docker停止。
- [x] 独立审查新增验证范围，保存失败/结果与工程边界，DEV提交推送。完整目标仍active，不将此项当自然学习或Daily发布。
