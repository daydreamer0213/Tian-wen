# Tianwen 受治理 Skill Candidate 设计

**日期：** 2026-08-20
**状态：** architecture approved direction / implementation not started
**阶段：** Stage 3
**基线：** `main@ca98ad789e96475bb3d641da0330076a0edaa303`

## 1. 决策摘要

Stage 3 在 Stage 2 已证明的真实 `Outcome → Signal → Ticket` 之后，只补齐一条最窄的后台治理链：

```text
open Outcome Ticket
→ background Case
→ resolved / unknown Attribution
→ accepted scoped Lesson 或合法 no-Lesson
→ 至多一个 immutable Skill Candidate
→ 停止
```

本阶段不进入 Evaluation、Shadow、Promotion、Rollback，也不让 Candidate 参与任何当前或未来 Run。Candidate 只是“已经冻结、以后可以交给 DSH 评测的提案”，不是可运行插件、已安装 Skill、Challenger 或 Champion。

DSH `0.1.0-rc.7` 继续是唯一产品 Agent Runtime。Tianwen 复用 DSH 公开的 `SkillRegistration` 类型表达纯文本 Skill 负载，但不调用 `ctx.skills.register()`，不写入 DSH Skill 扫描目录，不建设 provider、catalog、loader、安装器或第二 Runtime。

Stage 3 只处理 Stage 2 Outcome Ticket。Stage 1 显式反馈 Signal 没有 Tianwen Run ID，不能为了串起链路虚构 Run provenance；它保留为合法开放 Ticket，等未来真实 Run binding 可用后再进入 Case。

用户已经授权架构会话根据权威文档自主细化阶段方案，无需逐字段确认。本设计因此采用下文推荐方案；只有产品方向、权限、预算扩大或不可逆外部动作才重新请求用户决定。

## 2. 权威来源与不可改写边界

本文必须同时服从：

1. `docs/tianwen-architecture-overview-v2.md`；
2. `docs/superpowers/specs/2026-08-19-tianwen-runtime-boundary-reset-design.md`；
3. `docs/superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md`；
4. `docs/superpowers/specs/2026-08-20-tianwen-repeated-outcome-learning-intake-design.md`；
5. `docs/research/2026-08-19-dsh-upstream-capability-overlap-audit.md`。

由这些文档继承的硬边界是：

- DSH 是唯一产品 Agent Runtime；
- Case 只引用真实 Run、Signal 和 Evidence，不复制 Session 或原始轨迹；
- Attribution 允许得到 `unknown`，证据不足不是失败补丁的理由；
- Lesson 必须有 `when`、`notWhen`、支持 Evidence、反证和目标作用域；
- Lesson 被接受并持久化之后才能创建 Candidate；
- Candidate 不可变，记录父版本、作用域、内容摘要和 Evidence；
- 学习默认在用户结果完成后后台运行，不能撤销成功结果或热换当前 Run；
- 普通成功、证据不足、归因未知和 no-Candidate 都是合法结果；
- 不扩建 Python Alpha、RepoTaskRuntime 或 AlphaRuntime；
- 不把 DSH Dynamic Package 当作持久 Candidate registry、Promotion 或未来 Champion。

## 3. 方案比较

### 3.1 推荐：独立治理记录 + 受限 DSH Skill 负载

在现有 `EvolutionLedger` 和同一个 `ledger.jsonl` 中追加 Case、Attribution、Lesson、Candidate 内部事件。新 Candidate 使用独立的 `candidate:` ID，负载是 DSH 公共 `SkillRegistration` 的受限纯文本子集。

优点：

- 复用同一账本、fsync、重放、串行写和现有 Service；
- Candidate 从类型、ID、事件和存储行为上都无法进入旧 Dynamic Cordis 热激活链；
- 负载与唯一 Runtime 的公开 Skill seam 对齐，不再造 Tianwen Skill 格式；
- Stage 4 可以在不改变 Stage 3 记录的情况下增加独立 Evaluation。

代价是 Stage 3 只支持纯文本 Skill 指令。脚本、资源目录、安装步骤和通用 Overlay 包继续延期，这是有意边界，不是缺陷。

### 3.2 不采用：复用旧 Artifact / Evaluation / promote

现有 `recordArtifact()` 把 JavaScript 源码写入 `artifacts/*.mjs`；`TianwenEvolutionService.promote()` 随后会调用 Dynamic Cordis `define/run/update` 并改变 `champion.json`。这是一条历史进程内激活实验链，不是新的治理 Candidate。

即使给旧 Artifact 增加一个 `candidate` 状态，也仍然存在误调用 `promote()`、当前进程热换、全局 Champion 与作用域冲突等风险。少写几个类型不值得破坏产品边界，因此不复用。

### 3.3 不采用：移植 Python LearningEngine / StateStore

Python 原型已验证过 Case、Attribution、Lesson 和 Candidate 的部分语义，但把它接回产品会产生第二数据库、第二状态机和第二产品实现。Stage 3 只参考其字段门和失败语义，不复制 Pydantic 模型、StateStore、RepoTask Skill 或 Alpha 调度。

## 4. 当前代码碰撞与隔离规则

### 4.1 旧 Dynamic Cordis 路径保留为冻结实验资产

本阶段不删除或重构旧 `ArtifactVersion`、`EvaluationRecord`、`ApprovalRecord`、`promote()`、`rollback()`、`rehydrateChampion()`。它们有历史回归价值，但不具有新 Candidate 产品语义。

新链必须满足：

- 不使用 `ArtifactId`；
- 不调用 `recordArtifact()`；
- 不写 `artifacts/*.mjs`；
- 不读取旧全局 `getChampion()` 作为父版本；
- 不调用旧 `recordEvaluation()` / `recordApproval()`；
- 不调用 `promote()` / `rollback()` / `rehydrateChampion()`；
- 不写 `champion.json`；
- Candidate 状态中不存在 active、approved、shadow、promoted 或 champion。

### 4.2 公开事件改为白名单

当前 `PublicLedgerEvent` 和 runtime `listEvents()` 依靠内部事件黑名单。Stage 1 和 Stage 2 已经两次要求人工补过滤项，继续扩张会让未来内部事件默认泄露。

Stage 3 把公开事件改成明确白名单。权威白名单只含现有八个旧实验审计事件判别值：

```text
artifact-recorded
evaluation-recorded
approval-recorded
promoted
rolled-back
runtime-bound
activation-failed
recovery-failed
```

现有 learning-intake、run-binding、outcome-intake、Stage 3 的 Run Skill manifest/use 和四种新治理事件默认都不在白名单。实现使用一份 `as const` 判别值 tuple 派生 `PublicLedgerEventType`，再用 `Extract<LedgerEvent, { type: PublicLedgerEventType }>` 得到 `PublicLedgerEvent`；runtime type guard 直接查询同一 tuple。不能再维护第二份内部事件 deny list，也不创建第二套 DTO 或 serializer。

公开类型合同继续用 `Extract<...>` 在真实 TypeScript 编译面证明所有内部事件均为 `never`。运行时合同同时证明序列化 `listEvents()` 不含内部类型和治理正文。

### 4.3 旧 runtime-bundle status 不成为承重面

旧 `runtime-bundle/status.ts` 只理解历史八类 Evolution 事件，面对 Stage 1/2 内部事件已经不是稳定承重面。Stage 3 不顺手扩建或修复它，也不把新 Candidate 投影成旧 Champion。后续如果该 CLI 重新成为产品入口，再单独设计“忽略内部事件”的薄兼容修复。

## 5. DSH Skill Candidate 负载

### 5.1 只复用公开类型

`@tianwen/dsh-compat` 薄导出 DSH 根包的：

```ts
export { isSkillName } from '@deepseek-ai/dsh-skill'
export { renderSkillContent } from '@deepseek-ai/dsh-skill'
export { apply as applySkillTool } from '@deepseek-ai/dsh-tool-skill'
export type {
  SkillDefinition,
  SkillInvocationPolicy,
  SkillRegistration,
} from '@deepseek-ai/dsh-skill'
```

`@deepseek-ai/dsh-skill@0.1.0-rc.7` 已在根依赖中精确固定，`@deepseek-ai/dsh-tool-skill@0.1.0-rc.7` 已在锁文件闭包中。本阶段只补 `@tianwen/dsh-compat` 包级 manifest / lock importer 的如实精确依赖，不下载新包。

不得使用 DSH 的 `SkillCandidate`。该类型属于 provider 目录发现阶段，包含 rank、locator、provider 和路径，与 Tianwen 治理 Candidate 同名但语义不同。

### 5.2 受限纯文本子集

Stage 3 定义：

```ts
type GovernedSkillPayload = Pick<
  SkillRegistration,
  'name' | 'description' | 'whenToUse' | 'source' | 'content'
> & {
  readonly invocation: SkillInvocationPolicy
}
```

持久化前必须做严格 shape 验证：

- `name` 通过 DSH `isSkillName()`；
- `description`、`content` 非空；
- `invocation.modelInvocable` 与 `userInvocable` 都是显式 boolean；
- `source` 非空且与父版本冻结值相同；
- 不接受 `path`、`resourceBase`、`metadata`、`provider` 或额外键；
- 不接受脚本、assets、references、安装清单、远程 URL base 或任何 sidecar resource 字段。

这里的限制是可机械验证的序列化边界，不对任意 Markdown 正文做语义猜测。`content` 可以像普通说明文档一样提到命令或 URL，但 Stage 3 没有执行命令、解析链接、加载远程内容或解析附属资源的能力；不得新增脆弱的关键词扫描器冒充安全边界。

Candidate 可以调整 description、whenToUse 和 Markdown content，因为它们就是需要未来评测的行为变化；第一版不能改变 Skill 名称、来源或 invocation surface。

### 5.3 不注册、不安装

Stage 3 不能为了“验证格式”调用 `ctx.skills.register()`。DSH 的运行时注册会让 Candidate 进入当前进程，违背惰性边界。

本阶段只复用类型、`isSkillName()`、`renderSkillContent()`、DSH 公开 `ctx.skills.get()` 和 DSH 自己的 `skill` 工具；其余最小字段验证由 Tianwen 在写账本前完成。测试夹具可以通过 DSH 公共 registry 注册并读取固定的**父** Skill，但绝不能注册 Candidate。实际临时注册 Candidate 和独立比较属于 Stage 4 Evaluation 设计；正式未来 Run 选择属于更后的 Shadow/Promotion 设计。

## 6. 领域记录

### 6.1 `RunSkillManifest`

Stage 3 先补齐架构总览已经要求、但 Stage 2 尚未携带的最窄 Run Skill 冻结关系。它不是 Skill registry，而是对“这个 Run 开始时选择了哪个父 Skill”的不可变内部记录：

```ts
interface RunSkillManifest {
  readonly schemaVersion: 'tianwen.run-skill-manifest.v1'
  readonly runId: TianwenRunId
  readonly parentVersionId: `skill-version:${string}`
  readonly contentDigest: Sha256Digest
  readonly resolvedProvider: string
  readonly parent: GovernedSkillPayload
}
```

运行适配层在 DSH 第一个 Turn 之前，用 DSH 公共 `ctx.skills.get()` 返回的 resolved `SkillDefinition` 构造受限 `parent`。原始 filesystem definition 可以携带 `path`、`resourceBase` 和 `metadata` 这类运行时 transport 字段；它们不能直接进入治理负载。自然 Run 只对一个目录内恰有一个常规 `SKILL.md` 的 incumbent parent 投影 `name`、`description`、可选 `whenToUse`、`invocation`、`source`、`provider` 和 `content`，并只在同一 Agent scope 注册该纯文本 snapshot。模型实际看见的 snapshot 与冻结的 `parent` 是同一内容；Candidate 仍绝不注册。多文件或 sidecar parent 在绑定前拒绝，不把本 Stage 3 边界扩展成资源治理。`parentVersionId` 使用 `skill-version:<64 lowercase hex>`，由完整规范化 parent payload 和 resolved provider 确定性计算；`contentDigest` 单独冻结正文。完整 parent payload 和 provider 必须保留，不能只存 digest，否则 Stage 4 无法重建公平的 B-vs-C 对照或核对本次 DSH tool result。

现有无 Skill manifest 的 Stage 1/2 Run 继续可读取、重放和做 Outcome intake，但不能进入本阶段 `dsh-skill` Case/Candidate。相同 Run + 相同 manifest 重放幂等；改换 name、内容、source、invocation 或任何 payload 字段都拒绝。manifest 必须在首个 `turn/start` 前记录，记录失败或提交结果未知时停止该 Run，不得执行后再补写。

这是 Tianwen 已有 Run binding 薄适配的一个字段关系，不改变 DSH Agent loop，不创建加载器、活动指针或第二 Runtime。它只证明父 Skill 在 Run 前被选择并冻结，**不单独证明 Agent 已经使用它**；实际使用还必须满足下一节的 DSH Session 派生证明。Candidate 仍绝不注册。

### 6.2 `RunSkillUse`

第一版只认 DSH 自己公开 `skill` 工具的成功加载，不从 catalog 出现、host 侧 `get()`、模型自评或文本提及推断“已使用 Skill”。运行适配层提供独立的后台 `recordSkillUse(session, runId)`，在正常 Outcome intake 之后检查真实 Session events：

1. 存在 `tool/call`，工具名精确为 `skill`，参数精确解析为 manifest 的 Skill name；
2. 存在顺序在后的匹配 `tool/result`，`isError = false`；
3. result 的单一文本与 DSH `renderSkillContent({ name, provider, content })` 对该 frozen manifest 的结果逐字节相同；
4. 该加载发生在本 Run 最终验收工具调用之前；
5. 对应 Tianwen Evidence 投影存在，且 session / call / result 序号一致。

若最终验收调用前有多个成功匹配，确定性选择序号最后的一次。满足时，Tianwen 只持久化不含正文的 `RunSkillUse`：`runId`、`parentVersionId`、Skill name、content digest、DSH Session ID、skill-load Evidence ID 和 call/result 序号。相同记录重放幂等；任何名称、摘要、序号或 Evidence 变化都拒绝。原始 tool 参数和 `<skill_content>` 正文继续只存在于 DSH Session，不复制到 Evolution ledger。

现有 `consumeOutcome()` 不调用这条新路径，也不因缺 use proof 或 use 记录失败而改变普通 Outcome/Signal/Ticket；这保证 Stage 2 行为不被 Stage 3 反向改变。区别只在后续治理：缺 use proof 的 Case 可以得到 `unknown` / `outside-stage3`，但不能接受 `dsh-skill` Attribution，因此不能形成 Skill Lesson/Candidate。

### 6.3 `LearningCase`

Stage 3 只允许 Stage 2 Outcome Ticket 打开 Case。账本从已有 Ticket、Outcome Signal 和 Run binding 派生而不是信任调用方重复提交：

- `ticketId`；
- `problemFingerprint`、`problemCategory`、`scopeKey`；
- 一个或多个不可变 `signalId`；
- 对应的不同 `runId`；
- 从这些 Signal 派生的 supporting Evidence ID；
- 每个 Run 可选的、从 DSH Session 派生的 `RunSkillUse` reference；
- 零个或多个显式关联、通过同源校验的 counterevidence Outcome reference；
- 同一冻结验收合同摘要；
- 所有 Signal Run 完全一致的 `RunSkillManifest` / `parentVersionId`；
- `learningMode = experience-consolidation`；
- `schedule = background`；
- `experimentLimit = 0`；
- `candidateLimit = 1`；
- 固定停止条件 `sufficient | insufficient-evidence | risk-boundary`。

`experimentLimit = 0` 表示 Stage 3 不假装已经实现假设探索或 Experimental Run。需要新实验才能区分原因的 Ticket 应记录 unknown Attribution 并停止；未来有独立设计时再激活新的有预算探索版本。

Case 不能接收调用方在事后提交的父 Skill 快照或 use 声明。它必须从每条 Signal 对应的 Run binding、`RunSkillManifest` 和已有 `RunSkillUse` 派生关系；任一 Run 没有 manifest 或多个 Run 的 parent payload / version 不一致，就不能建立本阶段 governed Skill Case。缺 use proof 不妨碍保留 Case，但只允许后续 `unknown` / `outside-stage3`。

Case 的 counterevidence 由调用方只提交 `runId` 选择，账本再从该 Run 的真实 `outcome-intake-recorded` 派生 Evidence 和可选 `RunSkillUse`。每个 counterevidence Run 必须同时满足：最终 verdict 为 `met`、至少一条 Evidence、`scopeKey` 相同、冻结 acceptance contract digest 相同、`parentVersionId` 和完整 parent payload 相同。Case 持久保存规范化的 `{ runId, evidenceIds, skillUse? }` 关系；不允许用“全账本存在这个 digest”代替同 Case 关联证明。

父 manifest 不是旧全局 Champion，也不会更新任何 Active Pointer。一个 Ticket 第一版最多打开一个 Case。相同 Ticket、Signal 集和 counterevidence Run 集重放返回 duplicate；任何父版本、Signal、反证关系、预算或验收事实变化都拒绝，不原地改写。

### 6.4 `AttributionRecord`

Attribution 是显式结构化输入，不由 error text、模型自评或自由文本自动推断。它引用一个已持久化 Case，并给出以下三种结论之一：

- `dsh-skill`：原因已得到现有 Evidence 支持，且允许进入本阶段 Skill Lesson；
- `outside-stage3`：问题可能真实，但归因到工具、模型、Runtime、Policy 或其他本阶段不修改的层，只保存建议；
- `unknown`：现有 Evidence 无法区分原因，合法停止。

`dsh-skill` 归因至少保存：

- 一条非空、可证伪的 hypothesis；
- 目标 Skill name，必须等于 Case 父 Skill；
- supporting Evidence ID，只能来自 Case 的 Signal Evidence 关系；
- counterevidence ID，只能来自 Case 已持久化且通过同源校验的 counterevidence Outcome relation；
- 被排除或尚未支持的其他层说明。

`dsh-skill` 还要求 Case 的**每个** Signal Run 和被选择的 met counterevidence Run 都有与同一 manifest 匹配的 `RunSkillUse`；catalog 出现或 host-side `get()` 不满足此门。Attribution replay 必须重新验证 use proof，并验证 supporting/counterevidence 集合仍是 Case 已冻结关系的子集，而不是只查询全账本 known-Evidence 集合。不得提交任意摘要或无关 Run 的 Evidence 冒充证据。

相同 Attribution 重放幂等；同一 Case 改变 resolution、target 或证据集合会拒绝。

### 6.5 `AcceptedLesson`

只有持久化的 `dsh-skill` Attribution 才能接受 Lesson。Lesson 必须包含：

- `claim`；
- 非空 `when`；
- 非空 `notWhen`；
- supporting Evidence ID；
- counterevidence ID；
- 与 Case 一致的 `targetScope`；
- 对 Case、Attribution 和 Ticket 的引用；
- `status = accepted`。

Lesson 使用独立 `lesson:` 内容摘要 ID，写入后不可修改。新证据推翻 Lesson 时，未来只能追加 superseded / invalidated 记录；Stage 3 不实现这两个状态转换。

`outside-stage3` 或 `unknown` Attribution 都不能创建 Lesson。它们的正常结果是 no-Lesson / no-Candidate，不建立占位 Lesson。

### 6.6 `GovernedSkillCandidate`

只有已持久化的 AcceptedLesson 可以创建 Candidate：

```ts
interface GovernedSkillCandidate {
  readonly candidateId: `candidate:${string}`
  readonly ticketId: LearningTicketId
  readonly caseId: `case:${string}`
  readonly attributionId: `attribution:${string}`
  readonly lessonId: `lesson:${string}`
  readonly targetScope: string
  readonly parentVersionId: string
  readonly payloadDigest: Sha256Digest
  readonly payload: GovernedSkillPayload
  readonly evidenceIds: readonly Sha256Digest[]
  readonly status: 'recorded'
}
```

约束：

- Candidate ID 由 Case、Lesson、父版本和规范化 payload 摘要决定；
- payload Skill name、source、invocation 必须与父快照相同；
- Evidence 至少覆盖 Lesson 的支持 Evidence 和反证；
- 一个 Stage 3 Case 只能记录一个 Candidate；
- 相同内容重放幂等，改变 payload 或 Evidence 拒绝；
- Candidate 创建后不调用任何 DSH、Dynamic Cordis、Artifact、Evaluation、Approval 或 Champion API。

## 7. 内部事件与派生状态

同一 `ledger.jsonl` 增加六种内部事件：

```text
run-skill-manifest-recorded
run-skill-use-recorded
learning-case-opened
learning-attribution-recorded
learning-lesson-recorded
learning-candidate-recorded
```

事件正文分别包含完整不可变记录和输入摘要。`EvolutionLedger` 重放后派生：

- Case by ticket / case ID；
- Run Skill manifest by Run ID；
- Run Skill use by Run ID；
- Attribution by case / attribution ID；
- Lesson by attribution / lesson ID；
- Candidate by case / candidate ID；
- Case 内已验证的 supporting / counterevidence 关系。

不增加第二账本、数据库、repository、event-store、队列、worker 或 scheduler。仍使用现有 append、fsync、commit-unknown、strict replay 和 `formalWrite()`。

新增最窄 API：

```text
recordRunSkillManifest(runId, resolvedParentSkill)
recordRunSkillUse(reference)
openLearningCase(ticketId, counterevidenceRunIds)
recordAttribution(input)
recordAcceptedLesson(input)
recordSkillCandidate(input)
get/list LearningCase, Attribution, Lesson, Candidate
```

治理持久化方法加在现有 `EvolutionLedger` 和 `TianwenEvolutionService`。现有 `packages/tianwen-runtime` learning-intake 薄适配只增加两个动作：Run 前从 DSH resolved Skill 冻结 manifest；Run 后由显式后台 `recordSkillUse()` 从 DSH Session 事件投影成功的父 Skill tool use。现有 `consumeOutcome()` 保持独立。不增加 Agent loop、Session store、Skill loader 或执行服务。

## 8. 数据流与非干扰

承重链使用 Stage 2 的真实公开路径：

1. 用 DSH 公共 Skill registry 注册并 `get()` 一个固定父 Skill，并挂载 DSH 公共 `skill` 工具；
2. 三个 fresh DSH Session 分别绑定 Tianwen Run，并在首个 Turn 前冻结同一 resolved 父 Skill manifest；
3. 每个正常 DSH Agent loop 先真实调用 `skill` 工具加载父 Skill，再调用同一冻结 verifier；其中两个得到结构化 `not-met`；
4. Stage 2 形成两条 Outcome Signal 和一个 Ticket；
5. 第三个 Run 在同样成功加载父 Skill 后得到同合同、同父 manifest 的结构化 `met`，作为反证 Evidence，但不生成 Signal；
6. 后台以该 met Run ID 显式打开一个 experience-consolidation Case，账本验证并冻结反证关系；
7. 测试夹具提交结构化 `dsh-skill` Attribution；
8. 测试夹具提交 AcceptedLesson；
9. 测试夹具提交一个受限纯文本 Skill Candidate；
10. 重放整个 ledger，所有 ID、记录和顺序一致；
11. 三个 DSH Session 摘要前后不变，Dynamic Cordis inventory、旧 Artifact 事件和 Champion 指针均不变。

这里的 DSH execution、Evidence、Outcome、Signal 和 Ticket 是真实 producer→consumer；Attribution、Lesson 和 Candidate 内容是确定性的合成合同夹具。公开文档必须这样写，不能宣称已经实现模型自主归因、自动 Skill 改写或生产学习。

只有 `RunSkillManifest` 在 Run 的首个 Turn 前冻结；`RunSkillUse`、Case、Attribution、Lesson 和 Candidate 的治理写入都发生在相关 Run 完成之后。Run 后治理写入失败只影响后台学习记录，不改变用户结果、Session 或已完成 Run。

## 9. 错误与合法停止语义

以下情况 fail closed，不写部分状态：

- Ticket 不存在、不是 open 或没有 Outcome Signal；
- Signal 缺 Tianwen Run provenance；
- Signal / Run / Evidence / acceptance facts 相互矛盾；
- Signal Run 缺父 Skill manifest，或多个 Run 的父 manifest 不一致；
- counterevidence 不是 met Outcome，或 scope / acceptance / parent manifest 与 Case 不一致；
- `dsh-skill` Attribution 的任一 supporting/counter Run 缺匹配的真实 DSH Skill tool use；
- Case、Attribution、Lesson 或 Candidate 重放内容变化；
- Attribution 引用不在 Case supporting / counterevidence 关系中的 Evidence；
- Lesson 缺 `when`、`notWhen`、支持 Evidence 或反证；
- Candidate 早于 AcceptedLesson；
- Candidate 与父 Skill name/source/invocation 不一致；
- 第二个 Candidate 超过冻结上限；
- ledger append 结果未知。

以下是合法结果，不抛成系统失败：

- `unknown` Attribution → no-Lesson / no-Candidate；
- `outside-stage3` Attribution → recommendation-only / no-Candidate；
- Evidence 不足 → 停止并保留 Case/Attribution；
- 没有 Candidate → 用户结果和当前 Champion 均不受影响。

## 10. 隐私与公开面

- Case 只保存稳定 Run/Signal/Evidence 引用和规范化问题类别；
- 不复制 Session event、用户正文、feedback note、工具 result、error message、路径或凭据；
- Attribution / Lesson 只接受调用方主动提交的治理文本，不能自动拷贝原始轨迹；
- Candidate payload 是调用方明确提交的未来 Skill 内容，不从用户消息静默生成；
- 六种新事件不进入公开 `LedgerEvent` 或 runtime `listEvents()`；
- 专用 get/list API 只在显式调用时返回治理记录，并返回 defensive copy；
- demo 输出只含计数、ID、决策、摘要和零成本事实，不输出 Attribution、Lesson 或 Candidate 正文。

## 11. 测试与演示

### 11.1 状态机合同

最小测试必须覆盖：

- Stage 2 Outcome Ticket 可以打开 Case；Stage 1 feedback-only Ticket 因缺 Run provenance 暂不可打开；
- Run Skill manifest 只能在首个 Turn 前冻结；同 Run 改换父 Skill 拒绝；
- catalog 可见或 host-side `get()` 不能冒充 use；只有匹配 manifest 的成功 DSH `skill` tool result 才生成 use reference；
- Case 从账本派生 Signal、Run、supporting Evidence、acceptance 和父 Skill facts；
- counterevidence 必须来自同 scope、同 acceptance、同父 manifest 的真实 met Outcome；无关 met Run 拒绝；
- identical replay 幂等，changed replay 拒绝；
- unknown / outside-stage3 Attribution 不产生 Lesson/Candidate；
- 未知 Evidence、无反证、无条件的 Lesson 拒绝；
- Lesson 必须先持久化，Candidate 才可创建；
- Candidate 保持父 name/source/invocation，且最多一个；
- ledger restart 后 Case、Attribution、Lesson、Candidate 完整重放；
- malformed / tampered internal event fail closed；
- 新旧全部内部事件在唯一公开白名单类型和 runtime listEvents 中不可见；
- Dynamic Cordis define/run/stop 调用为 0；
- 不生成 `artifacts/*.mjs` 或 `champion.json`。

### 11.2 真实 DSH 集成和零成本 demo

新增一个确定性 demo，输出一条 JSON，证明：

- 3 Runs / 3 Sessions；
- 2 个 `not-met`、1 个 `met`；
- 3 个相同的 pre-Turn 父 Skill manifest binding；
- 3 个真实 DSH `skill` tool use reference；
- 2 Signals / 1 Ticket / 1 Case / 1 Attribution / 1 Lesson / 1 Candidate；
- Candidate status 仅为 `recorded`；
- `evaluated=false`、`shadowed=false`、`promoted=false`；
- 所有 Session 前后摘要相同；
- network / Provider / paid tokens / CNY / Docker / user data 都为 0；
- fixture 明确标记 synthetic attribution / lesson / candidate content。

CI 只扩展现有 TypeScript focused job 和 demo step，不增加新 workflow、matrix、Docker、secret、artifact 或付费门。

### 11.3 回归门

Stage 1 / Stage 2 的 Evidence、explicit feedback、Outcome ternary、open Turn、幂等、三条 demo 和公开文档合同继续通过。旧 runtime-profile 和 runtime-bundle status 不加入承重门。

## 12. 资源与实施边界

- 复用现有 D 盘 implementation worktree、node_modules 和 `D:\DevData\pnpm-store`；
- 依赖操作只能 frozen / offline，预期 downloaded=0；
- 不创建第二 implementation clone、node_modules、venv、DSH Profile 或 probe；
- 不运行 Provider、付费模型、Docker、Alpha、RepoTaskRuntime、AlphaRuntime 或 runtime-profile；
- 不修改仓库 visibility、metadata、tag、Release 或申请；
- Stage 3 成本目标为 0 CNY；用户已批准的 60 CNY 总预算不因本设计自动消耗。

## 13. 明确延期

以下内容不进入 Stage 3：

- hypothesis-exploration 的自动 DSH learning Run；
- Experimental Challenger；
- 带脚本、assets、references、远程资源或安装步骤的 Skill 包；
- Candidate 自动生成、模型自我归因或自由文本解析；
- EvalProtocol、Champion/Challenger 比较和三值 Evaluation；
- 临时注册 Candidate 到 DSH；
- Shadow 路由、Promotion、Reject、Rollback、Active Pointer；
- Candidate marketplace、provider、catalog、loader 或安装器；
- Python 学习引擎、StateStore、Alpha/Docker bridge；
- UI、遥测、SLA、多进程写入和分布式调度。

下一阶段 Stage 4 只在 Stage 3 Candidate 已稳定后设计独立 Evaluation：冻结父 Skill、Candidate、DSH Runtime、模型、工具、权限、预算和 EvalProtocol，在隔离的新 Run 中公平比较，并继续禁止 Promotion。

## 14. 完成标准

Stage 3 只有同时满足以下条件才完成：

1. exact main 基线和 DSH rc.7 closure 保持；
2. 一个真实 Stage 2 Outcome Ticket 能形成 Case；
3. 每个 Case 的父 Skill 来自 Run 前冻结的真实 DSH resolved Skill，不能事后注入；
4. `dsh-skill` Attribution 只接受每个相关 Run 都有匹配 DSH `skill` tool use 的 Case；
5. 支持证据与反证都通过 Case 内同源关系冻结；
6. resolved / unknown Attribution 都有确定语义；
7. 只有 accepted scoped Lesson 能形成 Candidate；
8. Candidate 使用受限 DSH SkillRegistration 负载、不可变且最多一个；
9. Candidate 与旧 Artifact / Dynamic Cordis / Champion 路径完全隔离；
10. 公开事件改为白名单，内部治理内容不可见；
11. 重放、篡改拒绝、幂等和非干扰合同通过；
12. zero-cost demo 和 exact main CI 通过；
13. Case、Attribution、Lesson、Candidate 的失败不改变用户结果或任何 DSH Session；
14. 文档准确说明合成夹具和未实现的 Evaluation/Shadow/Promotion；
15. correctness、architecture/privacy 和 Ponytail/YAGNI 审查无 Critical / Important。

如果这些门只能通过注册 Candidate、扩建 Dynamic Cordis、移植 Python Runtime 或建设新 Skill 平台才能满足，必须停止并回到架构层；不能在实现中静默绕过。
