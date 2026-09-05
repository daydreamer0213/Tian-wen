# Tianwen Learning Failure Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the safe existing preflight reason for the genuine Candidate's pre-evaluation failure without changing learning/evaluation semantics.

**Architecture:** Preserve the exception across the existing phase-to-fail callback boundary, and classify it at the standard host failure handler. Keep the existing ledger and logger owners; introduce no error platform or persistence schema.

**Tech Stack:** TypeScript, Vitest, DSH 0.1.1-rc.2, existing Runtime error class and Cordis logger.

## Global Constraints

- Follow `docs/superpowers/specs/2026-09-05-tianwen-learning-failure-diagnostic-design.md`.
- Work in the existing `codex/learning-total-route-real-acceptance` worktree. Preserve unrelated route/evidence documents and all user changes.
- Do not run models, change real profile configuration, read credentials or modify genuine Session/ledger/Candidate/protocol data.
- Forward the actual error internally, but log only phase, analysis ID, and a strictly allowlisted existing preflight code or `unclassified`.
- Never log raw error, message, stack, cause, provider payloads or arbitrary object fields.
- Keep durable failure/resume behavior and every evaluation/authorization gate unchanged.
- No dependency additions, schema migration, source Skill changes, new task framework or unrelated refactor.

---

## Task 1: Preserve and safely classify the preflight failure

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.ts`.
- Test: `tests/dsh-migration/learning-loop-orchestrator.spec.ts`.
- Read: `packages/tianwen-runtime/src/skill-evaluation.ts` for the public error class and codes.

**Interfaces:**
- Consumes: the existing `ControlledSkillEvaluationPreflightError` exported by `@tianwen/runtime` and `ctx.logger('tianwen-learning')`.
- Produces: `runLearningLoopPhase` fail callback `(status: LearningLoopPhaseStatus, error: unknown) => unknown | Promise<unknown>`, plus a safe diagnostic in the normal service fail handler.
- Existing one-argument callback implementations remain source-compatible.

- [ ] **Step 1: Write the failing forwarding regression.** Extend the existing infrastructure-failure case so a specific Error from `evaluate` must reach `fail` unchanged, without allowing the gate to continue:

```ts
const failure = new Error('private diagnostic detail must not be logged')
const fail = vi.fn()
await runLearningLoopPhase({
  status: { ...base, phase: 'candidate-ready' },
  hasActiveSupport: () => true,
  evaluate: () => { throw failure },
  fail,
})
expect(fail).toHaveBeenCalledWith(expect.objectContaining({
  analysisId: base.analysisId, phase: 'candidate-ready',
}), failure)
```

- [ ] **Step 2: Add a service-boundary regression using the existing service/context test setup.** Throw `new ControlledSkillEvaluationPreflightError('task-package-mismatch')` from the evaluator, with an additional secret-like message/cause property. Assert the existing durable `recordLearningAnalysisFailed` receives the unchanged candidate-ready resume phase, no promote/evaluator-success path executes, and the collected host diagnostic contains `task-package-mismatch` but no secret-like sentinel. Test an ordinary Error, a plain object with `code: 'task-package-mismatch'`, and an actual error instance with a non-allowlisted code: they must log only `unclassified`. Make logger failure leave the durable failure intact. No source-text grep tests or production test-only cleanup APIs.

- [ ] **Step 3: Run the focused suite and preserve RED evidence.** From the project root, use the prepared Node/pnpm paths and D: probe root:

```powershell
$env:PATH='D:\hermes\node;'+$env:PATH
$env:COREPACK_HOME='D:/DevData/corepack-home'
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN='false'
$env:TIANWEN_DSH_PROBE_ROOT='D:/DevData/tianwen-dsh-probe'
& 'D:\hermes\node\node.exe' 'D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs' exec vitest run tests/dsh-migration/learning-loop-orchestrator.spec.ts
```

- [ ] **Step 4: Implement the smallest boundary repair.** Add the second error argument to the fail callback contract and use `await input.fail(status, error)` in the existing catch. In the standard fail handler, record the existing durable failure first, then perform a best-effort logger warning. Recognize only an actual `ControlledSkillEvaluationPreflightError` with one of these codes:

```ts
const preflightCodes = [
  'candidate-chain-mismatch', 'task-package-mismatch',
  'configured-route-mismatch', 'retry-policy-mismatch',
  'tool-surface-mismatch', 'session-not-empty',
  'persistence-unavailable', 'scripted-boundary-mismatch',
  'root-skill-mismatch',
] as const
```

Use a private small classifier if it improves clarity; test through the real service boundary, not an export created only for tests. Do not pass `error` as a logger formatting argument.

- [ ] **Step 5: Verify GREEN and compatibility.** Rerun the focused suite, root typecheck, and `git diff --check`. Update any existing callback assertion affected by the added argument while preserving what it originally proved. Do not run the full several-minute suite for this diagnostic-only increment.
- [ ] **Step 6: Self-review and commit only the owned source/test files.** Report the RED/GREEN commands and output, unchanged gate behavior, commit SHA and any concerns. The controller owns the design/plan/operation records and actual acceptance resumption.
