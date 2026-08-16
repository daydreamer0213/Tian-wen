# 天问架构主控会话交接（2026-08-16）

## 1. 用途与读取顺序

本文档用于把当前超长主控会话交给新的架构主控会话。新会话不要尝试重读或复述
整段旧聊天，按以下顺序恢复即可：

1. 完整阅读 `docs/architecture-master-session-memory.md`；
2. 完整阅读本文档；
3. 从已推送的 smoke 分支读取最近阶段 canonical handoff：
   `git show origin/codex/tianwen-live-model-smoke:docs/operations/tianwen-deepseek-v4-pro-live-smoke-handoff.md`；
4. 只在准备具体下一阶段时，再读取对应设计、计划和代码。

长期产品共识以主控记忆为准；本文档只保存当前执行位置、工作方法和准确 Git 入口。

## 2. 当前结论

天问仍是一个具有持续学习能力的独立通用 Agent，不是 Codex Skill、单一编程 Agent
或 DeepSeek Harness 的薄皮肤。

当前技术路线已经确定为：

- 精确锁定 `@deepseek-ai/dsh@0.1.0-rc.6`，复用它的 Agent Loop、模型路由、
  Session、Goal Round、工具、Profile、恢复和普通本地沙盒；
- 天问自己掌握顶层 Goal 主权、跨会话学习循环、Evidence、评测、Artifact、
  Champion、晋升和回滚；
- TypeScript 负责 DSH Runtime/Profile 和正式产品控制边界；
- Python 实现、Alpha-A Tasks 1–9、A1–A5 冻结任务包和评测合同继续保留，Python
  目前作为独立 evaluator/研究 Worker；
- 当前不 Fork DSH，也不删除 Python 基线；只有公开接口确实成为限制时再重开选型。

## 3. 已完成的产品链路

当前已形成以下连续能力：

```text
安装 Tianwen/DSH
→ 创建 Goal
→ list/status 查看
→ 显式 resume 一轮
→ Session/Goal/Evidence 持久化
→ Python A1 评测桥
→ Artifact/Champion 晋升、回滚、重启重绑定
→ 模型选择和凭据引用
→ 单次真实 DeepSeek V4 Pro 路由验收
```

这证明了底层 Runtime、持久化、治理、CLI 和真实模型路由可以连接起来，但还不等于
完整持续学习产品已经完成。尚未落地的核心仍包括：真正由用户 Goal 驱动的完整
“探索—执行—验证—记录—候选改进—独立评测—晋升”闭环、A2–A5 evaluator 扩展、
跨目标 Goal Graph、长期元学习调度和最终用户控制面。

## 4. 最近阶段与准确 Git 入口

- 主分支在写入本交接前：`main` =
  `1ea1de2a7cbbdc218cd767bf068cf82386a9c4d1`；
- DSH 完整兼容性探针远端分支：`origin/codex/deepseek-harness-probe` =
  `1eef994a82c4ff39de311d5c2b61dff92bf94162`，结论
  `ADOPT_DSH_RUNTIME_CANDIDATE`；
- 模型/凭据配置远端分支：`origin/codex/tianwen-model-config` =
  `4567eca10f88cc264d006bc8537d0a870db3999c`；
- 单次真实模型 smoke 远端分支：`origin/codex/tianwen-live-model-smoke` =
  `53ae351509ab1209a1f0f396e135703580b3e39b`，已推送并由 `ls-remote` 精确核对。

最近 smoke 的事实：

- 路由：`deepseek-official/deepseek-v4-pro`；
- 固定提示只要求返回 `TIANWEN_SMOKE_OK`；
- 真实付费请求总数：恰好 `1`，授权已消耗，不得重放；
- 结果：通过，marker 匹配；
- 用量：`29` tokens；本地估算费用：CNY `0.000114`；
- 硬上限：64 输出 tokens、512 总 tokens、CNY 0.01、90 秒、无自动重试；
- 外部脱敏回执：
  `D:\DevData\tianwen-live-model-smoke\receipts\deepseek-v4-pro-smoke.json`；
- 回执 SHA-256：
  `1924ce779d00eecc4ea8b7f586d0d1779baa0ef2ef5410a3667ab4ea2b8bc66c`；
- 最终 Runtime Bundle archive SHA-256：
  `044d3e1d6030cf4be893e1fc9025c9a259eca35b06692f0dbe9d2ebfb39d0c08`；
- smoke 后已立即切回 `tianwen-offline/phase2-smoke`，fresh status 为 0 模型请求；
- API key 只从一次子进程的用户环境继承，未打印、未进 argv、未写入回执或仓库。

最终代码门禁包括 70 项聚焦测试、Runtime Bundle build、workspace typecheck 和
diff check 全部通过。此前全量阶段门为 Node 195 passed/7 planned skips、Python
424 passed/4 planned skips、A1–A5 10 passed、Ruff clean。

## 5. Ponytail 与现实安全原则

这是新主控必须主动执行的原则，不是口号：

1. 优先选择能满足当前真实合同的最小方案；一行标准库能解决，就不建五十行框架。
2. 先复用 DSH、标准库和现有组件；只有天问差异化的 Goal、学习、证据和治理边界
   才自己实现。
3. 不为尚未出现的扩展点提前建设数据库、事件总线、通用 RPC、通用凭据系统、
   通用沙盒抽象、插件市场或完整 UI。
4. 安全检查必须对应真实权限边界、实际外部效果和可说明的损失。不要默认把已取得
   同用户代码执行能力的恶意宿主进程、已被攻陷的本机或已审核插件突然恶意化，
   当作普通功能阶段的阻塞条件。
5. 当前第一版明确把用户拥有的本地 Runtime 和经过审核、固定版本、正式装入同一
   进程的插件视为可信代码；未知、未审核、动态下载的插件不能进入这个边界。
6. Windows LocalSandbox 的 `partial` 只用于普通任务；高风险任务才考虑 container、
   remote sandbox 或 microVM，不能把 partial 冒充强隔离。
7. 复审意见是证据，不是自动命令。主控必须结合项目威胁模型和实际调用路径核实，
   对虚假安全假设、YAGNI 和过度防御性编程要明确降级或反驳。
8. 不因为“更完整”就增加状态、抽象或门禁。新增机制必须能说明它解决了哪个已经
   发生或即将进入验收的真实问题。

本阶段最终复审曾提出：同用户恶意进程可在 realpath 检查与 spawn 之间瞬间替换目录。
该情形技术上可能，但同一进程也能替换已安装 DSH 或读取同用户环境；再规范路径不能
形成 OS 隔离。因此它被记录为宿主机信任边界，而不是继续开发路径安全框架的阻塞。

## 6. 主控与实施方式

- 新会话继续作为架构主控：维护愿景、设计、计划、验收和阶段交接；具体编码优先交给
  本回合子代理，主控负责核对，不创建权限不稳定的长期派生实施会话。
- 用户只说“继续”时，主控恢复最近的架构、计划或监督事项；如果已有用户批准的设计和
  实施范围，可按推荐方案派本回合子代理继续，但主控本身不静默转成编码会话，也不借此
  扩大 Goal、权限或外部效果。只有 Goal 变化、权限扩大、真实费用、重大不可逆风险或
  价值取舍才需要用户决定。
- 遇到必须决策的阻塞，先记录，再推进不受影响的设计、测试或文档工作。
- 重测试严格串行运行。此前机器卡顿主要来自 360 防护；开发缓存、venv、临时目录、
  pnpm store 和生成物继续放在 `D:\DevData`。
- 不恢复旧的 30 分钟监督心跳；本回合子代理完成后直接回传主控即可。
- 每个阶段使用独立 `codex/` 分支、canonical handoff、独立复审和 GitHub 存档；
  不 force-push，不把阶段分支静默合并进 main。

## 7. 权限与外部效果

- 刚完成的单次 DeepSeek V4 Pro 付费授权已经消耗。没有新的用户明确预算时，不得再次
  调用付费模型、真实 provider 或复用旧授权。
- 不调用真实 Docker；普通本地工作继续使用已验证的 DSH LocalSandbox，强隔离另立阶段。
- 不进行 live web/search，除非新任务需要外部最新事实且符合主控授权；优先官方来源。
- 不打印、读取进模型上下文或持久化 API key 的值。
- GitHub push 可以继续使用命令级本机代理 `http://127.0.0.1:7897`，不得修改全局
  Git 配置。

## 8. 下一推荐入口

推荐下一阶段是“真实 Goal round 最小验收”的设计与离线实现准备：

1. 复用现有 `create -> status/list -> resume`、DSH model route、Session/Goal/Evidence；
2. 冻结一个无副作用的小 Goal、一个允许的固定工具和一轮预算；
3. 离线先证明模型请求次数、工具权限、Goal revision、Evidence 和失败回执；
4. 不新增自动 resume、daemon、scheduler、完整 UI、通用工具平台或计费系统；
5. 真正执行外部模型回合前，必须再向用户申请一次独立的最大 token/费用预算。

如果离线设计发现真实 Goal round 还缺承重产品能力，再按证据调整下一入口；不要为了
避免再次申请付费授权而堆叠更多没有真实信息增量的 dry-run 框架。

## 9. 当前未决事项

当前没有阻止新主控开始设计/离线工作的产品决策。需要以后向用户确认的最近事项只有：

- 是否以及何时授权一次新的真实 Goal round 付费请求和预算；
- 真实 Goal round 通过后，优先进入完整持续学习闭环，还是先做最小任务面板。

后者的默认推荐是先做核心闭环和可读进度投影，桌面面板后置；DSH 可以省掉大量
Runtime、Session、Profile、模型和普通沙盒工作，但不会自动提供天问差异化的持续学习
控制面和最终产品体验。
