# 任务准入模式约束实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在原生结构化提交时拒绝`text`等非文件模式携带`fileOutputKind`，避免重现027 S2的无效判断。

**Architecture:** 准入模型返回带`decision`字段的对象；该字段以互斥的两种对象模式约束文件与非文件任务。账本仍保存原`ConversationAdmissionDecision`，原生证明核验同时支持旧扁平提交和新包裹提交，各自必须逐字匹配。

**Tech Stack:** TypeScript、DSH原生`structured_output`、Vitest。

## Global Constraints

- 不改变旧027原生记录、判断或发布结论。
- 不把无效判断归一化为有效，不新增主控模型重试。
- X的含糊反馈关联规则不在本计划范围。
- 新代码只保存开发分支；真实端到端消费未证明前不合并或更新Daily。

---

### Task 1: 原生模式互斥

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/conversation-judgment.ts`
- Modify: `packages/tianwen-runtime-bundle/src/conversation-observer.ts`
- Test: `tests/dsh-migration/conversation-judgment.spec.ts`
- Test: `tests/dsh-migration/conversation-observer.spec.ts`

- [x] 写失败测试：S2的`text`+`fileOutputKind:"chat"`被原生schema拒绝；正确的普通任务和文件任务仍可提交。
- [x] 运行定向测试，确认因现有schema没有互斥限制而失败。
- [x] 加入带`decision`的互斥schema，在准入入口只解包一次；账本字段保持原状。
- [x] 运行定向测试，确认不合格组合不能进入有效准入，正确输入保留原任务行为。

### Task 2: 旧证明及受影响回归

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/conversation-judgment.ts`
- Modify: `tests/dsh-migration/conversation-observer.spec.ts`
- Modify: 受影响的`tests/dsh-migration/conversation-*.spec.ts`脚本响应辅助函数

- [x] 用旧准入证明核验在新格式下的失败确认兼容需求；加入新旧格式逐一精确核验及篡改拒绝测试。
- [x] 实现专用准入证明恢复入口，不放宽其他结构化证明核验。
- [x] 更新脚本化测试响应以匹配新准入格式，运行受影响测试、类型构建与差异检查。
- [ ] 保存准确工程结果；没有新真实提案消费时保留NO-GO。

## 工程检查记录

- 首个模式互斥定向测试先失败，原schema要求扁平字段且允许S2式组合；修改后通过。
- 旧准入证明测试先在新格式下报`invalid-judgment`，改用专用恢复入口后通过。
- 原生结构化工具测试确认S2式提交先被拒，随后同一子会话的合格提交才被记录；未增加主控重试。
- 六个受影响测试文件最终一次运行：196通过、0失败；Runtime包类型构建退出码0；差异空白检查通过。
- 这只证明工程合同，尚无新真实模型提案消费、采用或日常交付证据。
