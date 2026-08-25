# Tianwen Skill Evaluation Service Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installed Tianwen evaluation service own its common Cordis runtime capabilities without disabling ordinary paired evaluation.

**Architecture:** Keep all controlled evaluation behavior in `TianwenSkillEvaluationService`. Its static declaration owns the eight capabilities directly consumed in every mounted mode. `agentDefaultModel` and `sessionPersistence` remain controlled-operation prerequisites checked at their existing `ctx.get()` call sites.

**Tech Stack:** TypeScript, Cordis services, Vitest, pnpm workspace builds, GitHub Actions.

## Global Constraints

- Do not change evaluation order, model configuration, prompts, tools, Session persistence, Evolution facts, receipts, retry, or budgets.
- Do not add a service, adapter, method parameter, diagnostic framework, dependency, or lockfile change.
- Activity-05 is consumed and read-only; a later real validation must use a fresh activity and fresh identities.
- Keep package caches and generated fixtures on `D:\DevData`.

---

### Task 1: Lock and repair service dependency ownership

**Files:**
- Modify: `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts`
- Modify: `packages/tianwen-runtime/src/skill-evaluation.ts`

**Interfaces:**
- Consumes: `TianwenSkillEvaluationService.inject`
- Produces: the common Cordis dependency list for the existing service

- [ ] **Step 1: Write the failing dependency contract**

Import `TianwenSkillEvaluationService` from the Runtime index and add:

```ts
it('declares common runtime capabilities without requiring controlled-only prerequisites', () => {
  expect(TianwenSkillEvaluationService.inject).toEqual([
    'agents',
    'llm',
    'sessions',
    'skills',
    'tianwenEvidence',
    'tianwenEvolution',
    'tianwenLearningIntake',
    'tools',
  ])
})
```

- [ ] **Step 2: Run the focused RED**

Run:

```powershell
pnpm exec vitest run tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts -t "declares common runtime capabilities without requiring controlled-only prerequisites"
```

Expected: FAIL because the four missing common runtime capabilities are absent.

- [ ] **Step 3: Implement the minimal GREEN**

Replace the existing four-item `static inject` list with the exact eight-item list from the test. Do not edit method bodies.

- [ ] **Step 4: Run focused and full service tests**

Run the focused test, then:

```powershell
pnpm exec vitest run tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts
```

Expected: focused PASS and full file PASS.

- [ ] **Step 5: Commit the TDD change**

Commit only the Runtime source and its focused spec with message:

```text
fix: declare evaluation service runtime dependencies
```

---

### Task 2: Verify product compatibility and review the boundary

**Files:**
- Review: `packages/tianwen-runtime/src/skill-evaluation.ts`
- Review: `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts`

**Interfaces:**
- Consumes: the Task 1 dependency declaration
- Produces: a reviewed exact feature SHA

- [ ] **Step 1: Run focused compatibility**

Run ordinary paired evaluation and its demo, controlled evaluation, lifecycle runner, Runtime Bundle, command, and Profile specs using the existing step-local `TIANWEN_DSH_PROBE_ROOT` on `D:\DevData`.

- [ ] **Step 2: Run build and static gates**

Run:

```powershell
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: all PASS, no dependency or lockfile diff.

- [ ] **Step 3: Review correctness, architecture, and simplicity**

Confirm that the declaration matches every direct scoped-context service consumed by `TianwenSkillEvaluationService`, while the two controlled-only `ctx.get()` prerequisites remain method-level checks. Confirm that this introduces no circular ownership and does not change evaluation behavior.

### Task 2A: Close the exact-main compatibility finding

The first implementation incorrectly promoted `agentDefaultModel` and `sessionPersistence` to class-level hard dependencies. Automatic exact-main run `32822067134` attempt 1 kept Python and installer-windows green but failed the TypeScript ordinary evaluation step because the service no longer mounted in the core runtime harness.

- [ ] Preserve that run as the RED; do not rerun it.
- [ ] Reduce `static inject` to the exact eight common dependencies.
- [ ] Restore the two invalid-input tests to the dependency-light core harness.
- [ ] Run both ordinary and controlled evaluation specs together before the broader compatibility gate.

- [ ] **Step 4: Record the exact feature SHA**

Require a clean worktree and committed diff-check.

---

### Task 3: Controlled integration and exact-main CI

**Files:**
- No additional source files

**Interfaces:**
- Consumes: the reviewed exact feature SHA
- Produces: a merge SHA and a successful automatic exact-main push attempt 1

- [ ] **Step 1: Push the feature normally**

Use one non-force feature push and verify the remote exact SHA.

- [ ] **Step 2: Merge without feature-tree changes**

Create one no-fast-forward merge with message:

```text
merge: declare evaluation service dependencies
```

Require parent1 to equal the then-current remote main, parent2 to equal the reviewed feature SHA, merge tree to equal the feature tree, and both diff-check forms to pass.

- [ ] **Step 3: Push main once and verify automatic CI**

Require the unique `push` run at the exact merge SHA, attempt 1, with Python, TypeScript, and installer-windows all successful. Do not rerun or dispatch.

---

### Task 4: Fresh real lifecycle verification

**Files:**
- Create only new operation/evidence artifacts under new `D:\DevData` roots

**Interfaces:**
- Consumes: exact merged main, exact-main successful CI, and the existing reviewed 15-task operation authority
- Produces: one terminal real lifecycle receipt and offline final state

- [ ] **Step 1: Create fresh product, evidence, operation, workspace, and Session identities**

Do not reuse or modify Activity-05 artifacts.

- [ ] **Step 2: Install once and prove offline readiness**

Use the official installer and official installed CLI. Verify the canonical install receipt, 18 manifest publication files, fresh Session/Evolution state, and offline model status.

- [ ] **Step 3: Freeze the same reviewed 15 tasks**

Use the existing generator structure only for mechanical identity/root/main/CI/archive substitutions. Verify 20 workspaces and 25 distinct Sessions before any model selection change.

- [ ] **Step 4: Execute the five official commands once each**

Run DeepSeek use, DeepSeek status, exactly one controlled lifecycle, offline use, and final offline status. Always perform offline recovery and never rerun the lifecycle.

- [ ] **Step 5: Classify the terminal result**

Separate receipt-certified facts, durable filesystem facts, and unknown Provider-account/tool-body counts. A new failure must drive architecture analysis before another activity.
