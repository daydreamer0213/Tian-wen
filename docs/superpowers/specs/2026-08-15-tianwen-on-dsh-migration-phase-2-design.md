# Tianwen-on-DSH Migration Phase 2 设计

**日期：** 2026-08-15

**状态：** 方案 1 已获用户批准；书面设计等待用户复审

**实施基线：**
`codex/tianwen-dsh-migration-phase-1@cffc8e51ad829adf016967491830402b0ed91bd5`

## 1. 结论

Phase 2 不再扩建底层框架，而是把已经完成的 Tianwen Runtime Bundle 接到
DeepSeek Harness 的正式单次任务入口上，形成第一个不依赖测试 harness 的
产品启动闭环：

```text
正式 tianwen Profile
→ DSH headless 单次任务
→ 人类来源创建顶层 Goal
→ 一个固定、无副作用的 Tianwen smoke action
→ DSH Session JSONL
→ Tianwen Evidence
→ 进程退出并生成验收回执
```

整个闭环不调用付费模型、不读取模型密钥、不访问网络、不使用真实 Docker。
它证明“天问能作为一个正式 DSH Profile 启动并完成受治理任务”，不是完整
持续学习、真实模型效果或 UI 交付。

## 2. 为什么采用这个方案

现有阶段已经证明：

- DSH 能提供 Agent Loop、Session、Goal、Tools、Profile、headless 和普通沙盒；
- `@tianwen/runtime-bundle` 已把 Runtime、Evidence、Evolution 打成一个可安装
  tarball；
- Profile 可以通过公开 DSH CLI 离线安装并加载该 tarball；
- Python A1–A5 和旧 Runtime 仍保持完整。

因此最短路径不是再写一个 Tianwen CLI、Agent Loop 或桌面端，而是直接复用
DSH 的 headless 产品入口，把已有 Bundle 从“可以安装”推进到“可以完成一次
正式任务”。

本阶段比较过三条路径：

1. **采用：正式 Profile + DSH headless。** 改动最小，同时验证真实产品启动面。
2. **不采用：先做 Tianwen CLI/UI。** 当前还没有稳定的用户控制数据合同，先做
   界面只会把尚未确定的状态结构固化。
3. **不采用：继续直接驱动测试 harness。** 它能验证组件，却不能证明用户实际
   使用的 DSH 启动链。

## 3. 产品边界

### 3.1 继续复用 DSH

- Profile 初始化、Bundle 层叠和公开 CLI；
- headless 单次任务入口；
- Agent Loop 和默认模型选择；
- Session Event、JSONL 持久化和 flush；
- Goal、Goal round driver 和 Goal tools；
- Tool call/result；
- 普通本地沙盒能力。

Phase 2 不新增这些能力的 Tianwen 替代品。

### 3.2 Tianwen 负责

- 正式 `tianwen` Profile 的组合合同；
- 已有 Runtime Bundle；
- 一个仅用于离线产品 smoke 的确定性 adapter；
- 一个固定、无外部副作用的 smoke action；
- Session 到最小 Evidence 的投影；
- 本次运行的可核验回执。

Evolution 服务必须真实挂载，但本任务不创建 Artifact、Evaluation、Approval、
Promotion、Rollback 或 Champion。一次启动证明不能伪装成一次持续学习晋升。

### 3.3 Python 继续保留

Phase 2 不修改或删除：

- Python Runtime 和 StateStore；
- Alpha-A Tasks 1–9；
- A1–A5 task bundle、seed、reference、verifier 和 image lock；
- typed A1 evaluator bridge；
- Python 全量测试基线。

Python A1–A5 只作为回归门，不进入本次 headless smoke 的业务链。

## 4. 正式 `tianwen` Profile

### 4.1 Profile 层顺序

`tianwen` Profile 的 Bundle 顺序固定为：

1. `@deepseek-ai/dsh-base@0.1.0-rc.6`
2. `@deepseek-ai/dsh-headless@0.1.0-rc.6`
3. 当前构建的 `@tianwen/runtime-bundle` tarball

不得出现 `@tianwen/dsh-probe-bundle`、测试 adapter、workspace 链接、绝对
`file:` 开发路径或 DSH 私有源码导入。

Profile 名固定为 `tianwen`。它是第一版正式产品组合，不替换 DSH 自带的
`headless`、`web` 或其他 Profile。

### 4.2 D 盘状态根

本阶段固定使用：

```text
D:\DevData\tianwen\
├── dsh-home\
├── state\evolution\
├── workspaces\phase2-smoke\
├── receipts\
└── temp\
```

Profile、Session、Evolution、临时文件和回执不得静默写入 `C:`。这些路径是
受信任部署配置，不接受模型或任务文本提供的路径。

### 4.3 安装边界

继续使用已经验证的公开 DSH plugin/Profile 安装机制，以一次固定、离线、
无用户输入的安装把精确 headless 包和 Runtime Bundle tarball 加入 `tianwen`
Profile。

Windows 上游 rc.6 plugin CLI 内部的窄 `shell: true` 例外保持原边界：只允许
这一次固定 Profile 安装。Tianwen 自己启动 headless、运行任务和验证回执的
进程全部使用固定 executable + argv、`shell: false`。该例外不得扩散到
Runtime、Tool、学习资产或用户指定 package spec。

## 5. 无密钥确定性任务

### 5.1 为什么需要一个 smoke adapter

DSH headless 必须经过真实 Agent Loop；如果接入真实模型，本阶段就会依赖密钥、
网络、价格和模型输出波动。现有 `dsh-probe-bundle` 又是测试夹具，不能进入正式
Profile。

最小方案是在现有 Runtime Bundle 中增加一个明确命名的、仅供离线 smoke 使用
的公开子入口，例如 `@tianwen/runtime-bundle/smoke`。它不成为通用模型层，也不
支持任意脚本、任意响应或用户配置。

### 5.2 固定行为

smoke adapter 只接受固定 provider/model：

```text
provider = tianwen-offline
model = phase2-smoke
```

它按真实 Agent 请求顺序只产生四个固定响应：

1. 调用 `create_goal`，objective 固定，`max_goal_rounds = 1`；
2. 在 Goal 创建结果后结束人类发起的 turn；
3. 在唯一 Goal round 中调用 `tianwen_smoke_action`；
4. 在 action 结果后输出固定文本 `TIANWEN_PHASE2_OK` 并结束。

请求次数、当前工具结果或工具名与预期不符时立即失败，不回退为普通文本回答，
也不继续猜测。

`tianwen_smoke_action` 是一个无参数或固定参数、无网络、无文件写入、无 Champion
写入的最小 Tool，只返回固定成功值。它存在的唯一目的，是让正式 Session 与
Evidence 同时包含 Goal 创建和一个非 Goal action。它不扩展成通用命令层。

smoke 子入口实际使用到的 DSH 公共包根（预计为 LLM 与 Tool 公共 API）必须按
Runtime Bundle 已有规则成为精确 external 和 manifest 依赖；不得把 DSH 源码
打进 tarball，也不得为了保持当前“只有 Cordis”这一旧集合而手写协议替身。

### 5.3 Profile 配置

Runtime Bundle 的默认产品补丁继续只挂载 Runtime。`tianwen` Profile 自己的
受信任 patch 才负责：

- 把 `agent-default-model` 指向 `tianwen-offline/phase2-smoke`；
- 插入 Runtime Bundle 的 smoke 子入口；
- 把 Runtime 的 `evolutionRoot` 覆盖为正式 D 盘状态根。

这样后续换成真实模型时，只需要移除 Profile 的 smoke 路由，不需要改
Runtime/Evidence/Evolution。

## 6. 一次完整运行

### 6.1 启动

使用 DSH 公开 CLI 启动：

```text
dsh --profile tianwen "run the Tianwen phase 2 smoke task"
```

实现测试使用解析后的绝对 Node/DSH executable 和固定 argv，不通过 shell 拼接
命令。任务文本固定，不接受测试外部输入。

### 6.2 运行结果

有效运行必须同时满足：

- 进程 exit code 为 0；
- stdout 最终文本精确为 `TIANWEN_PHASE2_OK`；
- 只有一个新 Session；
- 顶层 Goal 来自 headless 创建的真实 user source；
- Goal objective 和 `maxGoalRounds=1` 精确；
- 最终 Goal 已完成唯一 round，处于 `blocked`/`round-limit` 且 `disarmed`；
- Session 中 `create_goal` 和 `tianwen_smoke_action` 都有完整 call/result；
- Tianwen Evidence 对两者各产生一条 `complete` 记录；
- Evidence 不复制原始任务文本、Goal objective、工具参数或结果；
- Evolution Ledger 没有新增治理 transition，Champion 指针没有变化。

### 6.3 回执

本阶段只生成一个 `phase2-startup-receipt.json`。它记录实际运行路径、Session ID、
退出码和断言结果，作为单次运行回执；这些环境字段会变化，因此不把整份文件
SHA 当作跨机器语义不变量。

验收直接比较固定语义字段和实际 Session/Evidence 权威，不再另建“标准化哈希”
协议。回执使用 canonical UTF-8 + LF、原子写入；运行开始前先删除旧回执，失败
时不得保留旧成功文件。

## 7. 权威关系

- 原始对话、tool call/result、Goal 事件：DSH Session JSONL；
- 最小可重放证据：Tianwen Evidence；
- 跨版本正式治理：Tianwen Evolution Ledger/Champion；
- 启动回执：验收记录，不是业务权威。

Profile 只决定启动组合，不能成为 Goal、Evidence、Artifact 或 Champion 权威。
smoke adapter 只提供确定性离线输入，也不能直接写这些权威。

## 8. 失败处理

以下任一情况都必须失败并返回非零：

- Profile 不是精确三层或出现 probe/private/workspace 依赖；
- Runtime Bundle tarball、安装位置或公开 export 不匹配；
- DSH 版本不是精确 rc.6；
- 需要模型密钥、网络、Docker 或交互输入；
- adapter 请求顺序或工具 authority 与固定脚本不一致；
- headless 非零退出、stdout 不匹配或没有唯一新 Session；
- Goal、Session、Evidence 任一承重断言不成立；
- Evolution/Champion 出现意外变化；
- 回执无法原子发布。

如果 DSH 的公开 headless/Profile 接口不能完成该闭环，阶段应报告真实公共接口
边界；不得改写 DSH headless、复制上游源码或转回自建 Agent runner 来制造通过。

## 9. 测试设计

采用最小 TDD，测试集中在一条真实启动链和少量静态边界：

1. **Profile 合同测试**：精确三层、正式名称、无 probe/private/workspace 依赖；
2. **smoke adapter 单元测试**：四步固定响应，顺序偏差 fail closed；
3. **真实 headless E2E**：公开 DSH CLI 启动、exit 0、固定 stdout；
4. **Session/Goal/Evidence 验收**：检查唯一 Session、Goal round 和两条 Evidence；
5. **无 Evolution 变更**：运行前后没有新增 Ledger transition，Champion 不变；
6. **失败回执测试**：前置失败不会留下旧成功回执；
7. **全量回归**：Node、closure、private import、typecheck、普通沙盒、Python
   A1–A5、全量 pytest、Ruff、diff check。

不为该 smoke 新建数据库、RPC、队列、事件总线、通用 adapter DSL、通用回执框架
或第二套 Profile 管理器。

## 10. 明确不做

- 不接入真实 DeepSeek 或其他付费模型；
- 不做模型配置 UI；
- 不做 Web、TUI 或桌面端；
- 不做 `tianwen status`；
- 不做跨 Session Goal Graph；
- 不做 LearningSignal、Exploration 或完整学习循环；
- 不做 A2–A5 evaluator bridge 扩展；
- 不做 Candidate 生成、评测、Approval、Promotion 或 Champion 变更；
- 不做强沙盒、Docker、remote runner 或 microVM；
- 不合并、删除或重写 Python Runtime；
- 不 Fork DSH，不导入私有源码；
- 不把 smoke adapter 扩展成生产模型 abstraction。

## 11. 完成条件

Phase 2 只有同时满足以下条件才完成：

1. 正式 `tianwen` Profile 可在隔离 D 盘根目录离线安装；
2. Profile 层精确为 DSH base、DSH headless、Tianwen Runtime Bundle；
3. 不依赖 probe Bundle 或测试 harness；
4. 通过 DSH 公开 headless 完成一次真实 Agent/Goal/Tool/Session 流程；
5. exit code、stdout、Goal、Session 和 Evidence 精确满足合同；
6. 运行不触发付费模型、密钥、网络、Docker 或交互输入；
7. Evolution/Champion 没有意外变化；
8. 失败不会保留旧成功回执；
9. Python/A1–A5 和既有 Runtime Bundle 合同全部保持通过；
10. fresh review 没有开放 Critical/Important；
11. 独立迁移分支普通推送并以 `ls-remote` 核对精确 SHA。

## 12. 下一阶段

Phase 2 通过后，推荐先做一个只读 `tianwen status --goal` 控制面，而不是直接
开发桌面 UI。它只读取已经存在的 Goal、Session、Evidence 和 Champion 投影，
向用户显示：当前目标、正在做什么、为什么、最近证据、是否需要用户参与。

等这个数据合同在真实使用中稳定后，再决定复用 DSH Web/TUI 还是增加 Tianwen
自己的桌面壳。这样可以避免先造界面、后返工状态模型。
