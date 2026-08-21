# Tianwen Explicit Skill Registry Run-Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair governed pre-Turn Run binding by passing the caller-authorised
DSH Skill registry capability explicitly, so Cordis never reads `skills` from
the Learning Intake service's undeclared Context.

**Architecture:** Keep `TianwenLearningIntakeService` dependent only on
Evidence and Evolution. Its governed binding method receives a structural,
read-only `get` capability from callers that already hold `ctx.skills`.
Natural resume uses the `injectedCtx` supplied by its existing Cordis gate;
all other callers pass their existing harness registry.

**Tech Stack:** TypeScript 6, Vitest 4, Cordis 4, DSH `0.1.0-rc.7`, existing
pnpm workspace.

## Global Constraints

- Work from the supervisor-approved exact design branch/commit; do not move a
  branch tip implicitly.
- DSH `0.1.0-rc.7` is the sole product Agent Runtime.
- Reuse the single designated D-drive worktree, node_modules, Corepack cache,
  and pnpm store. Do not install, download, relink, clone, create a second
  worktree, `.venv`, Profile, probe, or fixture root.
- Set `pnpm_config_verify_deps_before_run=false` for local pnpm commands; do
  not commit configuration changes.
- The final repair has no dependency, lockfile, workflow, installer, Python,
  Provider, paid-model, Docker, Alpha, Goal, resume, model-selection, or
  product-data operation.
- Preserve the existing safe natural-trial receipt schema and closed failure
  codes. This code change does not authorise a retry.
- Do not add a Runtime, service, loader, registry, adapter, logger,
  telemetry, store, queue, worker, scheduler, retry, budget, price feature,
  Candidate, Evaluation, Shadow, Promotion, rollback, or legacy path.
- `consumeOutcome()` and `recordSkillUse()` must retain their existing
  independent dependency boundary; do not add `skills` to their service or
  runtime injection requirements.
- Every code task follows RED → minimal GREEN → focused regression →
  `git diff --check` → a narrow normal commit.

---

## Workspace Setup and Baseline Stop Gate

- [ ] Confirm the designated implementation worktree is clean and has the
  exact supervisor-approved baseline on both local and tracking refs. Record
  `git status --short --branch`, `git rev-parse HEAD`, and the tracking SHA.
- [ ] Verify `node_modules/.modules.yaml` exists. Do not run installation if
  it exists.
- [ ] Set only process-local prerequisites:

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack'
$env:pnpm_config_verify_deps_before_run = 'false'
```

- [ ] Run the current focused baseline once:

```powershell
pnpm --filter @tianwen/runtime... build
pnpm --filter @tianwen/runtime-bundle... build
pnpm exec vitest run `
  tests/dsh-probe/skill-governance-runtime.spec.ts `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: all commands pass after the established runtime-bundle prerequisite
build. A failure unrelated to the proven Cordis isolation defect is a stop
condition; preserve the scene and report it without a compensating change.

## Task 1: Explicit Skill lookup capability and true Cordis-isolation regression

**Files:**
- Modify: `packages/tianwen-runtime/src/learning-intake.ts`
- Modify: `tests/dsh-probe/skill-governance-runtime.spec.ts`

**Consumes:** Existing `RuntimeRunBindingInput`, DSH `Context['skills']`, and
the module-level `tianwen-runtime` Cordis plugin metadata.

**Produces:**

```ts
type SkillLookup = Pick<Context['skills'], 'get'>

bindRunWithSkill(
  agent: Agent,
  input: RuntimeRunBindingInput,
  skillName: string,
  skills: SkillLookup,
): Promise<RuntimeGovernedRunBindingReceipt>
```

- [ ] **Step 1: Write the isolation RED in the existing governed runtime spec**

Change that spec's runtime mount helper to import the entire
`tianwen-runtime` module namespace and call `await harness.ctx.plugin(
TianwenRuntime, { evolutionRoot })`, rather than directly invoking exported
`apply()`. Keep `SkillRegistry` mounted on the outer harness and register the
same `research-summary` fixture.

Add a binding call with the fourth argument `harness.ctx.skills` before any
Turn. It must assert the successful result is Session-unchanged and that the
existing Evolution Run binding/Skill manifest were recorded. On the old
implementation, the new argument is ignored and the actual service-owned
`this.ctx.skills` access rejects with the Cordis undeclared-service diagnostic;
assert that exact RED and assert no Evolution write happened.

Update every existing `bindRunWithSkill` test call in this file to pass
`harness.ctx.skills`, `runHarness.ctx.skills`, or
`manifestHarness.ctx.skills` from its own harness. Preserve each existing
unknown-Skill, non-model, sidecar, persistence, and asynchronous pre-Turn
race assertion.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run tests/dsh-probe/skill-governance-runtime.spec.ts
```

Expected: the module-mounted explicit-registry case fails before an Evolution
write because the current method illegally reads `this.ctx.skills`; unchanged
direct-mount tests must not be counted as proof.

- [ ] **Step 3: Make the smallest implementation change**

In `learning-intake.ts`, add the final `skills: Pick<Context['skills'],
'get'>` parameter. Replace exactly this lookup:

```ts
const skill = await this.ctx.skills.get(skillName, {
  cwd: session.header.cwd,
  scope: agent,
})
```

with:

```ts
const skill = await skills.get(skillName, {
  cwd: session.header.cwd,
  scope: agent,
})
```

Do not add `skills` to `TianwenLearningIntakeService.static inject`,
`tianwen-runtime`'s `inject`, or any unrelated method. Do not move existing
pre-Turn, manifest, persistence, or Session checks.

- [ ] **Step 4: Run focused GREEN**

```powershell
pnpm --filter @tianwen/runtime... build
pnpm exec vitest run tests/dsh-probe/skill-governance-runtime.spec.ts
pnpm run typecheck
git diff --check
```

Expected: the module-mounted capability path passes; all existing guarded and
persistence behaviour remains unchanged.

- [ ] **Step 5: Commit Task 1**

```powershell
git add packages/tianwen-runtime/src/learning-intake.ts `
  tests/dsh-probe/skill-governance-runtime.spec.ts
git commit -m "fix: pass Skill lookup to governed Run binding"
```

## Task 2: Use the injected registry in natural resume and update every caller

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/resume-runner.ts`
- Modify: `scripts/run-governed-skill-candidate-demo.ts`
- Modify: `scripts/run-paired-skill-evaluation-demo.ts`
- Modify: `tests/dsh-probe/natural-run-evidence-runtime.spec.ts`

**Consumes:** Task 1's four-argument binding method and the existing natural
`ctx.inject(['skills'])` gate.

**Produces:** Natural resume passes the callback-authorised registry and every
demo continues to make its governed binding through its existing harness.

- [ ] **Step 1: Write runner and demo REDs**

Extend `natural-run-evidence-runtime.spec.ts` with a pre-Turn test that wraps
the runner's existing `ctx.inject` call and supplies a distinct frozen
`injectedCtx.skills` double. Spy on `bindRunWithSkill()` to record its fourth
argument and reject with an existing classified binding error so the runner
returns its ordinary safe pre-Turn receipt without `ctx.goals.resume()`.
Assert the recorded argument is the injected double, not the outer Context;
assert zero adapter requests and no `turn/start`.

Update both governed demos to pass `harness.ctx.skills` at their existing
binding calls. Their TypeScript compile failure before the implementation is
the direct caller RED; preserve all existing demo assertions and zero-cost
mechanism counts.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run tests/dsh-probe/natural-run-evidence-runtime.spec.ts
pnpm --filter @tianwen/runtime-bundle... build
```

Expected: current runner ignores the callback parameter and cannot supply the
fourth binding argument; no Goal or Provider execution is permitted while the
test is red.

- [ ] **Step 3: Implement the caller-only changes**

In `resume-runner.ts`, change only the existing gate and binding declaration:

```ts
bindRunWithSkill(agent, input, skillName, skills: Pick<Context['skills'], 'get'>)

await ctx.inject(['skills'], async injectedCtx => {
  binding = await learning.bindRunWithSkill(
    handle.agent,
    bindingInput,
    trial.manifest.parentSkillName,
    injectedCtx.skills,
  )
})
```

Pass `harness.ctx.skills` to the two demo calls. Do not access `agent.ctx`,
add a global registry, broaden service injection, alter receipt types/codes,
or change pre-Turn error handling.

- [ ] **Step 4: Run focused GREEN**

```powershell
pnpm --filter @tianwen/runtime... build
pnpm --filter @tianwen/runtime-bundle... build
pnpm exec vitest run `
  tests/dsh-probe/skill-governance-runtime.spec.ts `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts
pnpm demo:governed-skill-candidate
pnpm demo:paired-skill-evaluation
pnpm demo:natural-run-evidence
pnpm run typecheck
git diff --check
```

- [ ] **Step 5: Commit Task 2**

```powershell
git add packages/tianwen-runtime-bundle/src/resume-runner.ts `
  scripts/run-governed-skill-candidate-demo.ts `
  scripts/run-paired-skill-evaluation-demo.ts `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts
git commit -m "fix: bind natural Runs with injected Skills"
```

## Task 3: Final evidence, reviews, and feature handoff

**Files:** No planned product-file changes. Only proven Critical or reachable
Important review findings may add the smallest directly relevant change.

- [ ] **Step 1: Run the final TypeScript bearing gates**

```powershell
pnpm --filter @tianwen/runtime... build
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run `
  tests/dsh-probe/evidence.spec.ts `
  tests/dsh-probe/research-preview-demo.spec.ts `
  tests/dsh-probe/learning-intake.spec.ts `
  tests/dsh-probe/learning-intake-runtime.spec.ts `
  tests/dsh-probe/explicit-correction-demo.spec.ts `
  tests/dsh-probe/outcome-intake.spec.ts `
  tests/dsh-probe/outcome-intake-runtime.spec.ts `
  tests/dsh-probe/repeated-outcome-demo.spec.ts `
  tests/dsh-probe/skill-governance.spec.ts `
  tests/dsh-probe/skill-governance-runtime.spec.ts `
  tests/dsh-probe/governed-skill-candidate-demo.spec.ts `
  tests/dsh-probe/skill-evaluation.spec.ts `
  tests/dsh-probe/skill-evaluation-runtime.spec.ts `
  tests/dsh-probe/paired-skill-evaluation-demo.spec.ts `
  tests/dsh-probe/skill-shadow.spec.ts `
  tests/dsh-probe/skill-shadow-eligibility-demo.spec.ts `
  tests/dsh-probe/skill-promotion.spec.ts `
  tests/dsh-probe/skill-promotion-readiness-demo.spec.ts `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-probe/natural-run-evidence-demo.spec.ts `
  tests/dsh-probe/evolution.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts `
  tests/dsh-migration/runtime-bundle.spec.ts `
  tests/dsh-migration/runtime-composition.spec.ts
git diff --check
```

- [ ] **Step 2: Run the existing eight zero-cost demos**

```powershell
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
pnpm demo:paired-skill-evaluation
pnpm demo:shadow-eligibility
pnpm demo:promotion-readiness
pnpm demo:natural-run-evidence
```

- [ ] **Step 3: Audit resources and boundaries**

Verify the planned fixture roots and worktree `.dsh-probe` contain zero files
and bytes after tests. Verify no install, download, relink, second worktree,
clone, `.venv`, Profile, Goal, manifest, installer, Provider, token, CNY,
Docker, Alpha, or legacy Runtime action occurred. Do not delete unknown data.

- [ ] **Step 4: Obtain three independent reviews**

1. correctness: actual module-mounted Cordis isolation, all fourth-argument
   callers, pre-Turn ordering, Session immutability, and safe receipt
   compatibility;
2. architecture/privacy/DSH: explicit capability ownership, no broad `skills`
   injection, no Context escape, sole rc.7 Runtime, no raw diagnostics or
   added persistence; and
3. Ponytail/YAGNI: no second service, DI adapter, registry wrapper, or
   unnecessary documentation/workflow/dependency change.

Address only a demonstrated Critical or reachable Important finding by fresh
RED → minimal GREEN, then re-run its affected gate and repeat the relevant
review.

- [ ] **Step 5: Push once and stop**

```powershell
git status --short --branch
git push -u origin codex/tianwen-explicit-skill-registry-run-binding
git rev-parse HEAD
git rev-parse '@{u}'
git ls-remote --heads origin codex/tianwen-explicit-skill-registry-run-binding
```

Require a clean worktree and equal local/tracking/remote SHA. Report the exact
feature SHA, commit sequence, file audit, RED/GREEN evidence, gates, reviews,
and resource audit to the supervisor. Stop before merge, main CI, installer,
Goal, model, Provider, or any natural retry.

## Task 4: Mainline integration (supervisor-only)

Only after independent review of the exact feature SHA: merge once with
`--no-ff`, prove merge-tree equality, push main once normally, and require the
unique exact-SHA automatic CI to pass. No product installation or natural Run
is authorised by this task.

## Task 5: Operational retry (separate supervisor release only)

Only after Task 4 exact-main CI and a fresh product-state review: authorise at
most one official offline installer invocation and at most one existing
Goal/manifest configured-Provider resume. It must consume only the source-owned
safe receipt and must not retry, create a Goal, or enter Evaluation, Shadow,
or Promotion.
