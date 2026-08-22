# Tianwen Canonical Parent Pure-Text Snapshot 设计

**日期：** 2026-08-22
**状态：** architecture approved direction / implementation not started
**阶段：** Stage 7 natural Run corrective design
**基线：** `main@a008686b0f1629225e36e8aa16b16b2851052249`

## 1. 决策摘要

这是一项已证明的自然 Run 前置阻塞修复，不是为所有 DSH Skill 建设资源治理：

```text
filesystem resolved parent
  -> validate one self-contained SKILL.md directory
  -> build canonical pure-text snapshot in memory
  -> register that snapshot in this Agent scope only
  -> freeze the same snapshot in RunSkillManifest
  -> normal DSH skill tool loads the same snapshot
  -> existing Skill-use proof compares the same rendered text
```

DSH `0.1.0-rc.7` 仍是唯一产品 Agent Runtime。Tianwen 不复制资源目录、不打包 sidecar、不增加 registry、service、store、logger、telemetry、retry 或新的 failure code。它只在已经创建、但仍未开始首个 Turn 的 Agent 中，借用 DSH 公开 `SkillRegistry` 的现有 scoped layer。

修复后的 Stage 7 自然验证只接受此次所需的**自包含单文件**父 Skill。原始 filesystem definition 的 `path`、`resourceBase`、`metadata` 只在 pre-Turn 内存校验中使用；它们不会进入 canonical parent、Run Skill manifest、Run Skill use、公开 event、safe receipt 或 CLI 输出。已有 Stage 3 的 private `RunSkillManifest.parent.content` 持久化边界保持不变：只有成功 bind 后才按既有设计冻结纯文本内容；失败时不写任何新的 parent/body 或路径事实。

Candidate 仍绝不注册。本设计只处理 incumbent parent 的当前 Agent scoped snapshot，不能成为 Candidate、Shadow、Active Pointer、Promotion 或资源安装的捷径。

## 2. 已证明事实与问题分类

本设计只基于已复现的当前路径：

1. 唯一 configured-Provider natural resume 在首个 Turn 前返回 source-owned `run-binding-precondition-failed`，Provider request、Turn、Evidence、Run、Outcome 和 Evolution 写入均为零。
2. `TianwenLearningIntakeService.bindRunWithSkill()` 对 `prepareRunSkillManifest()` 的失败明确映射该 code；Session freshness、Skill missing、non-model-invocable 和 Evolution persistence 失败各有不同 code 或可观察事实。
3. 一次 public resolver-only probe 成功解析 `systematic-debugging`：它是 model-invocable，definition 顶层同时包含 `content`、`description`、`invocation`、`name`、`path`、`provider`、`resourceBase`、`source`，其中 `resourceBase.kind = directory`。
4. 同一 resolved definition 直接交给 `prepareRunSkillManifest()` 失败；同进程的已知纯文本内存 Skill 通过。
5. rc.7 public `dsh-skill-filesystem` 对任何磁盘 Skill 的 candidate 和 loaded definition 都附带 `resourceBase: { kind: 'directory', path }` 与 `path`。rc.7 public `SkillDefinition` 类型也正式允许 `resourceBase?`、`path?`、`metadata?`。
6. 当前 `prepareParent()` 的 strict shape 只接受治理所需纯字段（可选 `whenToUse`），故把正常 filesystem transport/resource fields 误当非法字段。

因此这是 **Proven blocker**：它阻断所有经 rc.7 filesystem provider 解析的自然 Run 父 Skill，而不是 `systematic-debugging` 单独的正文、C 盘位置、Provider、Agent scope 或用户环境问题。

## 3. 现有权威边界

本设计同时服从：

- `docs/tianwen-architecture-overview-v2.md`；
- Stage 3 `2026-08-20-tianwen-governed-skill-candidate-design.md`；
- Stage 7 `2026-08-21-tianwen-natural-run-evidence-trial-design.md`；
- Stage 7 safe receipt / safe failure receipt canonical designs；
- DSH rc.7 public `SkillRegistry`、`skill-filesystem`、`tool-skill` API 与现有 runtime composition。

不可改变的事实：

- Stage 3 Candidate payload 仍是纯文本，仍拒绝 `path`、`resourceBase`、`metadata`、assets、references、远程 base 和安装清单；Candidate 永不注册。
- `RunSkillManifest` 在首个 Turn 前冻结，`RunSkillUse` 只能由真实 DSH `skill` tool 成功 result 派生；catalog 或 host-side `get()` 不能冒充 use proof。
- 正常 `tianwen resume`、live smoke、Stage 1–6、Stage 4 scripted mechanism、旧 Artifact/Dynamic Cordis/Champion 和 Python Alpha 路径不变。
- existing safe receipt schema 与 closed failure-code union 不增加成员。filesystem resolve、单文件验证、snapshot projection、scoped registration 或 `prepareRunSkillManifest()` precondition 失败都在任何 Evolution write 前、first Turn 前停止；不得输出原始异常、path、resource base、metadata、Skill body、prompt、tool 参数/结果或 credential。既有 binding persistence 失败仍是另一条 source-owned 语义，见 §6.3；本设计不把它伪称为 0 Evolution write。
- 60 CNY 仍只是外部累计授权；本设计和实现为 0 Provider、0 paid token、0 CNY、0 Docker，不引入价格查询、预算器、预留或轮询。

## 4. 方案比较

### 4.1 采用：canonical pure-text snapshot + Agent-scoped registration

先从 prepared Agent scope 解析现有 filesystem parent；只在确认其目录恰有一个 `SKILL.md` 后，投影出现有治理字段并在同一 Agent layer 注册这份内存 snapshot。随后 binding、model-facing `skill` tool 和 post-Run `recordSkillUse()` 都使用该 snapshot。

优点：

- manifest 冻结的 parent 与实际 render 的 Skill 是同一个纯文本对象，修复 provenance/Skill-use 漂移；
- 只用已经存在的 `SkillRegistry.register()` scoped layer 和 handle 生命周期；
- 不复制、持久化或暴露 filesystem location、sidecar 或 metadata；
- 多文件 Skill 以可解释的 pre-Turn refusal 停止，而不是悄悄丢资源后宣称同一 Skill；
- 改动只服务已证明的 one-parent natural Run seam。

代价是当前自然验证不能使用多文件 Skill。这是明确、诚实的阶段边界。

### 4.2 拒绝：仅忽略 `path` / `resourceBase` / `metadata`

这会让 ledger 冻结纯 content，却仍让 DSH `tool-skill` 以原 filesystem definition render。rc.7 `renderSkillContent()` 会把 `resourceBase` 放进模型可见的 resource hint；模型实际输入、manifest parent 与最终 tool result 因而不再是同一对象。该做法虽小，但破坏 Stage 3 的 parent/Skill-use identity 承诺，不能采用。

### 4.3 延期：完整资源治理、复制或打包 sidecar

复制目录、收集 references/assets、计算资源 graph 或为 provider resource base 建可重放 archive，确实能支持多文件 Skill；但当前只有一个 single-file natural parent 需求，没有 Evidence 证明它需要这些能力。此方案会引入资源生命周期、权限、持久化与隐私问题，属于未获授权的资源治理系统，延期到出现真实多文件 parent 需求时再设计。

## 5. rc.7 公开 API 与真实时序

### 5.1 已核对的 DSH seam

rc.7 `SkillRegistry.register()` 将 runtime Skill 写入**调用 Context 的 scope layer**；读取时最近的 scope layer 对同名项胜出。注册返回 Cordis effect disposer，并由调用 scope 的 fiber 生命周期收回。现有 Stage 4 runtime 已在 `agents.create({ setup: async agentCtx => agentCtx.inject(['skills'], scopedCtx => scopedCtx.skills.register(...)) })` 使用此确切机制：不是新增 registry，也不是全局覆盖。

`tool-skill` 在每个 Agent pre-step 以 `{ cwd: agent.session.header.cwd, scope: agent }` 查询 `ctx.skills`，并用 `renderSkillContent()` render full definition。`recordSkillUse()` 也以 frozen manifest parent 和 resolved provider 计算期待的 render。因此只要 bound manifest 与 scoped registered runtime Skill 相同，模型可见文本和 durable use proof 就是同一 canonical identity。

### 5.2 允许的 pre-Turn 顺序

`ctx.agents.resume()` 已先完成现有 Agent/Session rehydration 与 model-selection setup，但在 `ctx.goals.resume()` 前没有 `turn/start`。本设计只在这个既有窗口工作：

1. 继续调用现有 `ctx.agents.resume()`，获得 handle；不启动 Goal。
2. 完成现有 Goal、Session、verifier freshness checks。
3. 在 `handle.agent.ctx.inject(['skills', 'fs'], async scopedCtx => ...)` 中工作；`handle.agent` 同时作为 `skills.get()` 的 `scope`。这既使用 caller 已获授权的 capability，也确保查询和新 registration 都属于同一 prepared Agent scope。
4. 从 `scopedCtx.skills.get(parentSkillName, { cwd, scope: handle.agent })` 取得 filesystem definition，要求存在且 `modelInvocable === true`。
5. 用同一 public filesystem capability 做一次、仅一层的 directory shape check，随后构造 snapshot 并调用 `scopedCtx.skills.register(snapshot)`。
6. 在仍处于这个 callback 时，以同一 `scopedCtx.skills` 调用既有 `bindRunWithSkill()`；其 `get(..., { scope: agent })` 因 nearest-layer 规则返回刚注册的 snapshot。
7. 现有 binding 的 Session digest gate 通过后才调用原有 `ctx.goals.resume()`。任何较早失败都由已有 handle `finally` dispose；成功或失败都不需要额外 root cleanup。`handle.dispose()` 回收 Agent scope，root/global filesystem registry 不变。

这里刻意不在 `TianwenLearningIntakeService` 上增加 `skills` 或 `fs` inject。Stage 2 `consumeOutcome()` / `recordSkillUse()` 不需要这些服务；把依赖加到整个 service 会把一个 Stage 7 pre-Turn need 扩大成所有 intake 的装配门。

## 6. 受限 pure-text snapshot

### 6.1 单文件验证，不做资源扫描器

这次只接受 DSH filesystem definition 的以下即时形状：

- `resourceBase.kind === 'directory'`；
- `path` 是该 directory 的直接子项，文件名精确为 `SKILL.md`；
- 对该 directory 进行一次 public read-only `listDir`，其结果精确只有一个 regular entry `SKILL.md`。

没有递归遍历、glob、资源引用解析、URL 抓取或 content keyword scanner。directory 只有一个文件这一事实足以说明当前被允许的模型 render 不依赖同目录 sidecar；任何多文件、flat/path 不匹配、URL/opaque resource base、filesystem read 失败或不稳定目录都在 pre-Turn 停止。该检查不保存路径、条目名以外的目录信息或内容，也不把资源存在性变成 ledger 数据。

设计时对两个实际候选 `verification-before-completion` 和 `receiving-code-review` 的目录进行了安全元数据核验：两者都只有 `SKILL.md` 一个文件，且正文未见相对资源引用。未来实际 operation 默认重新核验 `verification-before-completion`；若 exact installed事实改变，就 0 Provider 停止，而不是改用多文件 Skill 或临时复制资源。`receiving-code-review` 仅是同样符合当前单文件条件的备选，不能在同一次 operation 中替换重跑。

### 6.2 Snapshot shape 与 identity

通过单文件 check 后，runner 从 resolved definition 构造新的 plain object，字段精确为：

```ts
{
  name,
  description,
  ...(whenToUse === undefined ? {} : { whenToUse }),
  invocation: { modelInvocable, userInvocable },
  source,
  provider,
  content,
}
```

它不保留引用、原型、`path`、`resourceBase`、`metadata`、rank、locator 或任何 provider-private property。既有 `prepareRunSkillManifest()` 接收这份 snapshot：其 parent 仍只持久化 `name/description/whenToUse?/invocation/source/content`，而 `provider` 仍是既有 `resolvedProvider`。`parentVersionId`、`contentDigest` 和 replay identity 继续由这同一纯文本 parent/provider 计算。

将同一个 snapshot（含 provider、无 resource base）注册到 Agent scoped registry 后，DSH `renderSkillContent()` 使用的正是 manifest 所冻结的字段。它会产生 rc.7 对无 resource base 的通用 provider resource hint，而不会暴露 filesystem directory；post-Run `recordSkillUse()` 对 frozen manifest 的现有 render 比较因而与真实 successful `skill` tool result 相等。

### 6.3 完整数据流

```text
filesystem get in prepared Agent scope
  -> one-directory/one-SKILL.md validation
  -> pure-text snapshot (ephemeral)
  -> scoped skills.register(snapshot)
  -> bindRunWithSkill() resolves snapshot
  -> private RunSkillManifest freezes snapshot parent + provider
  -> normal DSH Goal Turn
  -> DSH skill tool renders snapshot
  -> existing evidence + recordSkillUse compare frozen snapshot render
```

前四项与 `prepareRunSkillManifest()` 的 precondition 失败发生在任何 Evolution formal write 前，因此在 `ctx.goals.resume()` 前以 0 Evolution write、0 Turn/Model/Tool 停止。只有这些 snapshot-precondition failure 承诺 0 Evolution write。

成功进入既有 `bindRunWithSkill()` persistence sequence 后，真实顺序是先 `recordRunBinding()`，再 `recordRunSkillManifest()`；两者都是独立的既有 formal write。若其中任一 write 失败或其 commit 状态未知，继续使用现有 `run-binding-persistence-failed` 与 ledger/commit-unknown 语义：尤其是第二项失败时，Run binding 可能已经持久化。本设计仍保证该失败发生在 first Turn 前，Provider/Tool usage 为 0，且不把原始 resolved definition、directory/base、metadata 或 exception material写入 receipt、日志、CLI 或新文件；但不新增清理、rollback、transaction 或补偿写入，也不宣称 0 Evolution write。

只有完整 binding 成功后，正常 DSH Goal Turn 才可能开始；Turn 后才可能按既有路径写 Outcome、Evidence 派生的 Skill-use 等 facts。safe child receipt 保持现有 closed code 与零 usage 规则。

## 7. 保持不变的治理与隐私边界

- root/global filesystem registry 一直保留原 definition；snapshot 只在当前 Agent layer 生效，handle dispose 后消失。
- Candidate 不注册；任何 Candidate、live B/C Evaluation、Shadow、Active Pointer、Promotion、Reject、Rollback、Artifact 或 Dynamic Cordis action 都不发生。
- Evolution 继续是唯一治理账本；不新增 event、第二 ledger、database、resource archive、queue、worker、scheduler 或 state machine。
- `path`、`resourceBase`、`metadata` 不参与 parent version、content digest、Run identity、acceptance contract、recurrence、public whitelist 或 safe receipt。它们只在 pre-Turn memory check 中短暂存在。
- 原始 Skill body 不在 safe receipt、public event、CLI log 或 operation report 中输出。已批准的 private `RunSkillManifest.parent.content` 在 bind 成功后仍是 Stage 3 的既有、不可变内部事实；本设计不扩大其读者、字段或存储位置。
- 旧 natural Goal/manifest 不被修改或重跑。main/CI 绿后另行授权时，才创建一个 agent-authored、真实有价值且答案不预写的新 first-round Goal，并只做一次正常 configured-Provider attempt。

## 8. 测试与承重证明设计

后续 implementation plan 至少要求以下可执行合同：

1. **真实 filesystem RED：** 用 rc.7 filesystem provider 返回带 `path/resourceBase` 的 parent，证明旧直接 manifest 投影在 `prepareRunSkillManifest()` 处得到 `run-binding-precondition-failed`，且仍是 first Turn / 0 Evolution write。
2. **scoped snapshot GREEN：** 通过完整 module namespace mount 的 filesystem provider，在 prepared Agent scope resolve single-file parent、validate、register snapshot，再 bind；manifest parent 和 provider 与 snapshot 精确一致。
3. **模型与 ledger 同一 identity：** 经真实 DSH `skill` tool 的成功 result 必须等于 `renderSkillContent()` 对 frozen manifest parent/resolvedProvider 的 render；Skill-use evidence、content digest、version 一致。
4. **隐私与 non-interference：** manifest、receipt、public `listEvents()` 与序列化输出都没有 `path`、`resourceBase`、`metadata`；root snapshot 保持 filesystem winner，handle dispose 后 agent scoped registration 不再可见。
5. **明确拒绝多文件：** `SKILL.md` 加任一同目录 sidecar、URL/opaque base 或 directory/path mismatch 时在 `bindRunWithSkill()` 前安全失败，0 Evolution write、0 model request、0 Tool、0 Run/Outcome/Signal/Ticket/Candidate/Evaluation/Shadow/Promotion 写入。
6. **既有 persistence 语义：** 分别注入 `recordRunBinding()` 与 `recordRunSkillManifest()` 的失败，保留现有 source-owned `run-binding-persistence-failed` 与 commit-unknown 语义；不要求所有情形 0 Evolution write，且第二 formal write 失败时允许已有 Run binding。两种情形均须锁定 first Turn / Provider / Tool usage 为 0、无 raw transport/resource 字段输出，以及无新增 rollback/transaction。
7. **兼容：** ordinary resume、live smoke、Stage 1–6 既有回归、Stage 3 Candidate 不注册、Stage 7 safe receipt/failure receipt、v1/v2 replay 和 privacy whitelist 全部保持。

测试不会以 scripted fixture 冒充 configured-Provider natural evidence；它们只证明 scoped snapshot mechanism。未来实任务仍可产生 `met/no-case`、`continue-observing`、Signal、Ticket 或 inconclusive，不能为了证明 Skill-use 或 Ticket 重跑。

## 9. 旧规范的最小一致性修订范围

本轮**不修改**旧 canonical specs。后续实现计划必须只更新以下已发生矛盾的文字：

1. Stage 3 design §6.1 中“resolved definition 没有 `resourceBase`”的句子，改为：filesystem definition 可在 pre-Turn 被验证为单文件后投影为 canonical pure-text parent；raw resource fields 不进入 parent/ledger。
2. Stage 3 §5.2/§5.3 保持 Candidate pure-text 和 Candidate 不注册不变，并加一句区分：本设计的 scoped registration 仅为 incumbent parent、仅在 Agent scope，不能适用于 Candidate。
3. Stage 7 natural-run design §5.2 的 parent-resolution step，加入 resolve → one-file validate → scoped snapshot register → bind 的顺序，以及任何步骤失败均 first-Turn fail-closed。
4. Stage 7 privacy wording，明确 private manifest 继续持有 existing pure parent content，但不含 filesystem location/resource/metadata；safe receipt 不输出 body。

不需要重写历史 Stage 3/7 全文，不需要改变 safe receipt schema，也不改变 frozen prior Run records。

## 10. 自审与完成边界

### 10.1 一致性检查

- Stage 3 的“纯文本 Candidate、永不注册”与本设计一致；registration 的对象是当前 incumbent parent，作用域是当前 Agent，生命周期是 handle，不是 Candidate。
- Stage 7 的“first Turn 前 resolve/bind、正常 DSH execution、真实 tool-use proof”与本设计一致；snapshot 使这三项使用同一 identity。
- safe receipt 的 closed enum 与隐私边界未扩张；本设计不把本地路径或异常原因变成新的 code。
- 单文件检查是一个直接 directory shape assertion，不是资源框架；多文件支持明确延期。

### 10.2 Ponytail / YAGNI 结论

最小充分变更是一个 ephemeral pure-text object 和一次已有 scoped `register()`。不做资源 copier、archive、digest graph、provider wrapper、第二 registry、DI adapter、logger、telemetry 或 retry。若未来真实 single-file check 不足或真实任务需要 sidecar，再以该事实为证据单独设计资源治理。

### 10.3 后续唯一入口

下一步只能是独立 implementation plan，先对上述 real filesystem/scoped render RED→GREEN 作出精确文件与测试范围，再经 review、feature integration 和 exact-main CI。runtime-bundle 不得为了类型便利新增 `@deepseek-ai/dsh-fs` direct dependency 或 lockfile 变化；实现优先复用当前 Context 已公开能力或最窄 structural capability。若真实 typecheck/build 证明做不到，必须先报告，不能静默扩依赖。之后还需要单独 operational authorization，才能创建新的 agent-authored first-round Goal 并尝试一次 configured-Provider natural Run。此设计本身不授权安装、Goal、resume、model、Provider 或任何重试。
