# Tianwen Controlled Seed Integrity Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every controlled real seed expose its exact required tool contract, prove its exact DSH Session is durable, and validate the complete decision/verifier protocol before writing Outcome or Skill-use facts.

**Architecture:** Keep the existing `TianwenLearningIntakeService`, Evolution ledger, ordinary DSH Agent loop, stopped receipt schema, and single Runtime Bundle runner. Add only four `required: true` flags, one immediate `sessionPersistence.inspect()` readback gate, and local pre-write validation of the two seed tool calls plus acceptance Evidence. Do not create a transaction layer, retry loop, public diagnostic API, or new failure code.

**Tech Stack:** TypeScript 6, Node.js standard library, DSH `0.1.0-rc.7`, Cordis, Vitest, pnpm 11.20.0.

## Global Constraints

- Canonical design: `docs/superpowers/specs/2026-08-24-tianwen-controlled-seed-integrity-repair-design.md` at exact SHA `7aff44f61e642c887693f50a98783e862719d875`.
- Implementation worktree: `D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge`.
- Create `codex/tianwen-controlled-seed-integrity-repair` from the exact plan SHA; do not implement on `main` or amend design/plan commits.
- Product implementation scope is limited to `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts`.
- Product test scope is limited to `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts` unless a fresh build exposes a directly caused frozen bundle-contract mismatch; stop and report before expanding scope.
- Preserve Run binding and Run Skill manifest writes before the first Turn.
- Do not add ledger events, public receipt fields, failure codes, dependencies, helpers shared outside the runner, retries, model/token/price caps, or a second Agent loop.
- `seed-failed` remains the finite reason for invalid tool protocol or inconclusive verifier; `persistence-failed` remains the finite reason for flush/readback failure.
- D1 remains `not-met` with a Ticket; D2 remains `met` with no Ticket.
- No Provider, official installer, model selection, lifecycle, Goal, checker, postmortem, or Activity-03 operation is allowed in this plan.
- Do not read, modify, clean, relink, or reuse Activity-02 product/evidence roots or the preserved legacy dirty worktree.
- Keep package stores, fixtures, build caches, and generated artifacts on `D:`.
- Use `apply_patch` for source/test edits. Preserve unrelated user changes if the worktree is unexpectedly dirty; stop instead of cleaning them.
- After every task commit, stop and report the exact parent, exact SHA, RED, GREEN, files changed, gates, and clean/dirty state to the architecture supervisor. Do not start the next task until instructed.

## File Responsibility Map

- `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts`
  - Owns the two command-scoped decision tools.
  - Owns `runSeed()` and its Session/tool/Evidence/governance ordering.
  - May add only narrow file-local types or expressions required by these contracts.
- `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts`
  - Uses the existing mounted real Runtime + scripted adapter fixture.
  - Proves the actual model-facing tool schema, exact Session durability gate, zero premature governance writes, and unchanged D1/D2/full-lifecycle behavior.
- No other production or test file changes are planned.

---

### Task 0: Exact Takeover and Baseline

**Files:**
- Read: `docs/superpowers/specs/2026-08-24-tianwen-controlled-seed-integrity-repair-design.md`
- Read: `docs/superpowers/plans/2026-08-24-tianwen-controlled-seed-integrity-repair.md`
- Read: `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts:639-827`
- Read: `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts:964-1032`
- Read: `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts:1-360`
- Read: `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts:1168-1340`

**Interfaces:**
- Consumes: exact plan SHA supplied by the architecture supervisor.
- Produces: clean implementation branch `codex/tianwen-controlled-seed-integrity-repair` with no file changes.

- [ ] **Step 1: Verify the exact handoff**

Run:

```powershell
git status --short --branch
git rev-parse HEAD
git branch --show-current
```

Expected: the supplied plan SHA, the design/plan branch, and no dirty entries.

- [ ] **Step 2: Create the implementation branch**

Run:

```powershell
git switch -c codex/tianwen-controlled-seed-integrity-repair
```

Expected: new branch at the exact plan SHA and a clean tree.

- [ ] **Step 3: Read the complete authority and touched code**

Read every file and range listed above. Also inspect `packages/tianwen-runtime/src/learning-intake.ts:224-374` so Outcome and Skill-use receipt semantics are not reimplemented or weakened.

- [ ] **Step 4: Run the focused parent baseline once**

Run:

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-v0.1-eval-fixtures'
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts
```

Expected: the unmodified focused spec passes. If it does not, stop with the exact first failure; do not edit around an unknown baseline.

- [ ] **Step 5: Report takeover and stop**

Report branch, exact SHA, clean status, baseline count/result, and confirm no Provider/product operation. Do not commit an empty change.

---

### Task 1: Exact Required Tool Schemas

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts:967-1006`
- Test: `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts`

**Interfaces:**
- Consumes: existing `defineTool()` field schema and captured `ScriptedAdapter.requests`.
- Produces: model-facing JSON Schema with decision required array `['taskId', 'choice', 'explanation']` and verifier required array `['taskId']`; tool body validation remains unchanged.

- [ ] **Step 1: Add the failing assertions to the existing full-lifecycle test**

In `emits one exact safe passed receipt after the complete one-shot lifecycle`, reuse its one real runner execution and inspect the first captured model request. Assert the exact required arrays rather than only source-level `required` flags:

```ts
const tools = mounted.adapter.requests[0]!.tools ?? []
const decision = tools.find(tool => tool.name === 'record_architecture_decision')
const verifier = tools.find(tool => tool.name === 'verify_architecture_decision')
expect(decision?.parameters).toMatchObject({
  type: 'object',
  required: ['taskId', 'choice', 'explanation'],
})
expect(verifier?.parameters).toMatchObject({
  type: 'object',
  required: ['taskId'],
})
```

Do not snapshot the entire request or tool descriptions.

- [ ] **Step 2: Run the exact RED**

Run:

```powershell
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts -t "emits one exact safe passed receipt"
```

Expected: FAIL because both current JSON Schema required arrays are absent. If the first failure is unrelated, stop.

- [ ] **Step 3: Add the four minimal flags**

Change only the existing parameter entries:

```ts
parameters: {
  taskId: { type: 'string', required: true },
  choice: { type: 'string', required: true },
  explanation: { type: 'string', required: true },
},
```

and:

```ts
parameters: { taskId: { type: 'string', required: true } },
```

Do not add a schema helper or change `execute()`.

- [ ] **Step 4: Run focused GREEN and the full runner spec**

Run:

```powershell
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts -t "emits one exact safe passed receipt"
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts
pnpm --filter @tianwen/runtime-bundle... build
git diff --check
```

Expected: all pass. The full runner counts and 25-role scripted lifecycle remain unchanged.

- [ ] **Step 5: Commit and stop**

Run:

```powershell
git add packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts
git diff --cached --check
git commit -m "fix: require controlled seed tool inputs"
git status --short
```

Expected: one commit, clean tree. Report the structured Task 1 result and stop.

---

### Task 2: Exact Session Durability Before Governance

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts:734-780`
- Test: `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts`

**Interfaces:**
- Consumes: `ctx.sessions.flush(session)`, `ctx.sessionPersistence.inspect(SessionId)`, existing `sha256()` canonical digest.
- Produces: a seed-local persistence gate requiring exact id, cwd, and event digest before Outcome/Skill-use; failures use `persistence-failed`.

- [ ] **Step 1: Add a narrow ledger-event test helper**

Add this test-only helper near `fixtureRoot()` so later assertions can distinguish an inconclusive Outcome event from an empty learning-signal list:

```ts
function ledgerEventTypes(evolutionRoot: string): string[] {
  const ledgerPath = join(evolutionRoot, 'ledger.jsonl')
  if (!existsSync(ledgerPath)) return []
  const text = readFileSync(ledgerPath, 'utf8').trim()
  if (text.length === 0) return []
  return text.split('\n').map(line => (JSON.parse(line) as { type: string }).type)
}
```

Reuse it in the existing full-lifecycle event-order assertion instead of keeping a second inline parser.

- [ ] **Step 2: Write the first readback RED**

Add a test that keeps the real `flush()` result but makes only the first `inspect()` throw:

```ts
it('does not govern a seed when the flushed Session cannot be read back', async () => {
  const mounted = await mountRunner('seed-session-readback-missing')
  vi.spyOn(mounted.harness.ctx.sessionPersistence, 'inspect')
    .mockRejectedValueOnce(new Error('missing persisted Session'))
  const runner = await import(
    '../../packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.js'
  ) as unknown as { runControlledLifecycle(ctx: typeof mounted.harness.ctx, config: {
    manifestPath: string, manifestDigest: string,
  }): Promise<unknown> }
  try {
    await expect(runner.runControlledLifecycle(mounted.harness.ctx, {
      manifestPath: mounted.manifestPath,
      manifestDigest: mounted.prepared.manifestDigest,
    })).rejects.toMatchObject({ code: 'persistence-failed' })
    const types = ledgerEventTypes(mounted.manifest.roots.evolutionRoot)
    expect(types).toContain('run-binding-recorded')
    expect(types).toContain('run-skill-manifest-recorded')
    expect(types).not.toContain('outcome-intake-recorded')
    expect(types).not.toContain('run-skill-use-recorded')
    expect(mounted.harness.ctx.tianwenEvolution.listRunSkillUses()).toEqual([])
  } finally {
    await mounted.harness.ctx.fiber.dispose()
  }
})
```

- [ ] **Step 3: Run the exact RED**

Run:

```powershell
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts -t "flushed Session cannot be read back"
```

Expected: FAIL because current `runSeed()` never calls `inspect()` immediately after flush. If it fails for another reason, stop.

- [ ] **Step 4: Implement the exact readback gate**

Move the existing terminal/workspace validation block immediately before the `flush()` block without changing its conditions. After that validation and successful `flush()`, but before any intake call, add:

```ts
let inspection: Awaited<ReturnType<typeof ctx.sessionPersistence.inspect>>
try {
  inspection = await ctx.sessionPersistence.inspect(SessionId(task.sessionId))
} catch {
  throw new ControlledLifecycleRunnerError('persistence-failed')
}
if (
  String(inspection.meta.id) !== task.sessionId
  || inspection.meta.cwd !== task.workspaceRoot
  || sha256(inspection.events) !== sha256(handle.agent.session.events)
) throw new ControlledLifecycleRunnerError('persistence-failed')
```

Do not call `list()`, scan directories, add filesystem logic, or create a persistence helper.

- [ ] **Step 5: Add id/cwd and event-digest regression tests**

Using a saved bound original `inspect`, add two tests:

```ts
const inspect = mounted.harness.ctx.sessionPersistence.inspect
  .bind(mounted.harness.ctx.sessionPersistence)
vi.spyOn(mounted.harness.ctx.sessionPersistence, 'inspect')
  .mockImplementationOnce(async id => {
    const value = await inspect(id)
    return { ...value, meta: { ...value.meta, cwd: `${value.meta.cwd}-drift` } }
  })
```

and:

```ts
vi.spyOn(mounted.harness.ctx.sessionPersistence, 'inspect')
  .mockImplementationOnce(async id => {
    const value = await inspect(id)
    return { ...value, events: value.events.slice(0, -1) }
  })
```

Each test must expect `persistence-failed`, no `outcome-intake-recorded`, no
`run-skill-use-recorded`, and no Run Skill uses. Keep raw mismatch values out of the product error.

- [ ] **Step 6: Run Task 2 GREEN gates**

Run:

```powershell
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts -t "Session cannot be read back|Session identity|Session event digest"
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
git diff --check
```

Expected: all pass; normal seeds are persisted and the full lifecycle still has 25 Sessions.

- [ ] **Step 7: Commit and stop**

Run:

```powershell
git add packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts
git diff --cached --check
git commit -m "fix: verify controlled seed Session durability"
git status --short
```

Expected: one commit, clean tree. Report the structured Task 2 result and stop.

---

### Task 3: Validate Seed Protocol Before Outcome and Skill-use

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts:755-818`
- Test: `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts:1193-1284`

**Interfaces:**
- Consumes: live Session `tool/call` events, `DecisionState`, `tianwenEvidence.project()`, exact acceptance arguments digest.
- Produces: local pre-write verdict `'met' | 'not-met'`; only a valid exact protocol reaches existing `consumeOutcome()` and `recordSkillUse()`.

- [ ] **Step 1: Strengthen the existing duplicate-decision test for RED**

Keep its existing proof of two decision calls in the persisted Session and add:

```ts
const types = ledgerEventTypes(mounted.manifest.roots.evolutionRoot)
expect(types).not.toContain('outcome-intake-recorded')
expect(types).not.toContain('run-skill-use-recorded')
expect(mounted.harness.ctx.tianwenEvolution.listRunSkillUses()).toEqual([])
```

- [ ] **Step 2: Run the exact premature-write RED**

Run:

```powershell
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts -t "keeps the first submission and rejects a second decision"
```

Expected: FAIL because current code writes an inconclusive Outcome and a Skill-use before rejecting the duplicate protocol.

- [ ] **Step 3: Move source validation before intake**

Before `consumeOutcome()`, collect the two tool-call sequences and project acceptance Evidence. Expand only the existing file-local structural Evidence type with the fields needed to classify the verifier:

```ts
readonly outcome: {
  readonly status: string
  readonly isError?: boolean
  readonly errorCode?: string
}
```

Use the existing Session event order:

```ts
const decisionCalls = handle.agent.session.events.filter(event =>
  event.type === 'tool/call' && event.data.name === DECISION_TOOL)
const verifierCalls = handle.agent.session.events.filter(event =>
  event.type === 'tool/call' && event.data.name === ACCEPTANCE_TOOL)
```

Compute `verdict` before any intake:

```ts
const finalEvidence = evidence.at(-1)
const verdict = finalEvidence?.outcome.status === 'complete'
  && finalEvidence.outcome.isError === false
  && finalEvidence.outcome.errorCode === undefined
  ? 'met'
  : finalEvidence?.outcome.status === 'complete'
      && finalEvidence.outcome.isError === true
      && finalEvidence.outcome.errorCode === 'ARCHITECTURE_DECISION_NOT_MET'
    ? 'not-met'
    : undefined
```

Reject with `seed-failed` before intake unless all are true:

```ts
decisionCalls.length === 1
verifierCalls.length === 1
decisionCalls[0]!.seq < verifierCalls[0]!.seq
state.recordAttempts === 1
state.verifyAttempts === 1
state.submission?.taskId === task.taskId
evidence.length === 1
finalEvidence?.action.argumentsDigest === sha256(acceptanceArguments)
verdict !== undefined
```

Then call the unchanged intake methods and require:

```ts
outcome.acceptanceEvidenceId === finalEvidence.evidenceId
use.decision === 'recorded'
verdict === 'not-met'
  ? outcome.decision === 'ticket-created' && outcome.ticketId !== undefined
  : outcome.decision === 'no-case' && outcome.ticketId === undefined
```

Within Task 3, do not add a shared projector, service method, transaction, retry, or reason code.
Task 3A below is the separately reviewed correction for the later-proven Skill-use interface gap.

- [ ] **Step 4: Run the duplicate-decision GREEN**

Run the exact command from Step 2.

Expected: PASS; persisted failed Session still contains both decision calls, but the ledger contains only pre-Turn binding/manifest facts.

- [ ] **Step 5: Add malformed and duplicate-verifier regressions**

Add one scripted seed with a missing `explanation` property and one with two verifier calls. Each must:

- reject with `seed-failed`;
- leave the exact first Session readable through `sessionPersistence.inspect()`;
- have zero `outcome-intake-recorded` and zero `run-skill-use-recorded` rows;
- have zero Run Skill uses, Tickets, and Candidates;
- not expose raw tool errors in the product error.

Use these scripts without new fixture classes:

```ts
toolCallResponse('seed-d1-record-invalid', 'record_architecture_decision', {
  taskId: 'seed-task:d1', choice: 'session-as-run',
})
```

and two sequential:

```ts
toolCallResponse('seed-d1-verify-1', 'verify_architecture_decision', {
  taskId: 'seed-task:d1',
})
toolCallResponse('seed-d1-verify-2', 'verify_architecture_decision', {
  taskId: 'seed-task:d1',
})
```

- [ ] **Step 6: Strengthen wrong-task and success compatibility assertions**

Update the existing mismatched-verifier test to assert zero Outcome/Skill-use event rows. In the full successful lifecycle test, retain and explicitly assert:

```ts
expect(mounted.harness.ctx.tianwenEvolution.listLearningTickets()).toHaveLength(1)
expect(mounted.harness.ctx.tianwenEvolution.listRunSkillUses()
  .filter(use => String(use.sessionId).includes(':seed-'))).toHaveLength(2)
```

Do not change expected request/tool/session counts.

- [ ] **Step 7: Run Task 3 GREEN gates**

Run:

```powershell
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts -t "second decision|missing required decision|duplicate verifier|mismatched verifier|runs one full"
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts
pnpm exec vitest run tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts tests/dsh-migration/controlled-lifecycle-profile.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: every gate passes, no private DSH import appears, and bundle/public boundaries stay unchanged.

- [ ] **Step 8: Commit and stop**

Run:

```powershell
git add packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts
git diff --cached --check
git commit -m "fix: validate controlled seeds before governance"
git status --short
```

Expected: one commit, clean tree. Report the structured Task 3 result and stop.

---

### Task 3A: Prove Parent Skill Use Before Outcome Intake

**Files:**
- Modify: `packages/tianwen-runtime/src/learning-intake.ts:224-318`
- Modify: `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts:774-850`
- Test: `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts`

**Interfaces:**
- Consumes: the existing in-memory Skill call/result/Evidence proof inside
  `TianwenLearningIntakeService.recordSkillUse()`.
- Produces: `hasSkillUseProof(session: Session, runId: TianwenRunId): boolean`, a read-only
  check used before Outcome intake. It writes no ledger event and exposes no raw proof.

- [ ] **Step 1: Preserve the missing-Skill RED**

Use the existing Task 4 review regression: one seed omits the `skill` tool call but performs one
valid decision, one valid verifier, and a natural final response. It must return `seed-failed`, keep
the Session inspectable, and require zero `outcome-intake-recorded`, zero
`run-skill-use-recorded`, zero Run Skill uses, zero Tickets, and zero Candidates.

Expected RED on `d951ce7`: `outcome-intake-recorded` exists even though no Skill use can be proven.

- [ ] **Step 2: Extract one private Skill-use proof**

In `TianwenLearningIntakeService`, move only the current read-only binding/manifest, Evidence,
Skill call/result, rendered content, and Skill Evidence checks from `recordSkillUse()` into one
private `skillUseProof(session, runId)` method. It returns the already-derived facts used by the
existing ledger write, or `undefined`.

Do not change any comparison or add a second implementation. Do not move the Evolution write into
the helper.

- [ ] **Step 3: Add the thin read-only service seam**

Add:

```ts
hasSkillUseProof(session: Session, runId: TianwenRunId): boolean {
  return this.skillUseProof(session, runId) !== undefined
}
```

Update `recordSkillUse()` to reuse the same private proof and preserve its existing
`no-use-proof`/`recorded` receipts, ledger input, Session digest check, and Outcome-before-Skill-use
precondition.

- [ ] **Step 4: Gate Outcome without changing ledger order**

After the existing seed protocol/Evidence validation and before `consumeOutcome()`, call
`hasSkillUseProof()`. A false result or projection failure maps to `seed-failed` before any Outcome
or Skill-use write. Keep the formal write order unchanged:

```text
hasSkillUseProof (read-only) → consumeOutcome → recordSkillUse
```

Do not call `recordSkillUse()` before Outcome. Do not add a dry-run object, transaction, rollback,
new service, reason code, retry, or runner-local copy of the proof algorithm.

- [ ] **Step 5: Run the correction GREEN gates**

Run:

```powershell
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts -t "without parent Skill use"
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts
pnpm exec vitest run tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/controlled-lifecycle-command.spec.ts tests/dsh-migration/tianwen-installer.spec.ts
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: all pass; normal D1/D2/full lifecycle counts remain unchanged.

- [ ] **Step 6: Commit and stop**

Run:

```powershell
git add packages/tianwen-runtime/src/learning-intake.ts packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts
git diff --cached --check
git commit -m "fix: prove controlled seed Skill use before Outcome"
git status --short
```

Expected: one correction commit and a clean tree. Report the exact SHA and stop before final review.

---

### Task 4: Fresh Feature Gate and Exact-SHA Review

**Files:**
- Verify only: the three implementation files changed by Tasks 1-3A.
- Do not edit docs, workflow, package manifests, lockfile, Runtime, Evolution, DSH compat, or public contracts unless a reviewer first identifies a reachable Critical/Important and the architecture supervisor authorizes a new TDD correction task.

**Interfaces:**
- Consumes: Task 3A exact SHA and clean tree.
- Produces: reviewed feature exact SHA ready for controlled main integration; no push or merge.

- [ ] **Step 1: Set the proven D-drive environment in one PowerShell process**

```powershell
$env:COREPACK_HOME='D:\DevData\corepack-home'
$env:PNPM_CONFIG_STORE_DIR='D:\DevData\pnpm-store'
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-dsh-probe'
$env:TIANWEN_DSH_PROBE_PYTHON='D:\DevData\tianwen-dsh-probe\venv-task-6\Scripts\python.exe'
```

- [ ] **Step 2: Run the focused compatibility gate**

```powershell
pnpm exec vitest run tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts tests/dsh-migration/controlled-lifecycle-profile.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/controlled-lifecycle-command.spec.ts tests/dsh-migration/tianwen-installer.spec.ts
```

Expected: all selected specs pass. This is scripted/mechanism evidence only, not real Provider evidence.

- [ ] **Step 3: Run the fresh repository gates once**

```powershell
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:no-private-dsh-imports
pnpm run check
uv run pytest -q tests/contracts/test_public_repository_surface.py
uv run ruff check tests/contracts/test_public_repository_surface.py
git diff --check
```

Expected: all pass on the same tree. Do not hide a first failure with selective reruns; stop and report its exact first cause.

- [ ] **Step 4: Perform three read-only reviews**

Review the exact branch diff against the design under these separate lenses:

1. correctness/security: schema requiredness, readback identity/digest, no pre-write invalid Outcome/use, D1/D2 behavior;
2. architecture/evidence/privacy: no overclaim about Activity-02, no raw material or new public surface, existing DSH/Evolution seams only;
3. simplicity/YAGNI: only three implementation files, one thin read-only seam, no new dependency/framework/reason code/transaction/retry/budget.

Any reachable Critical/Important means stop without fixing. Report it to the architecture supervisor for a new bounded correction task.

- [ ] **Step 5: Verify exact identity and stop**

Run:

```powershell
$seedRepairBase = git merge-base codex/tianwen-controlled-seed-integrity-design HEAD
git status --short --branch
git rev-parse HEAD
git log --oneline --decorate -5
git diff "$seedRepairBase..HEAD" --check
git diff --name-only "$seedRepairBase..HEAD"
```

`$seedRepairBase` must equal the exact plan commit supplied in the handoff. Expected changed implementation files are exactly:

```text
packages/tianwen-runtime/src/learning-intake.ts
packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts
tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts
```

The design and plan files are inherited from the parent and are not implementation diff. Report exact feature SHA, commit chain, all fresh gates, review verdicts, changed files, and clean status. Do not push, merge, trigger CI, or begin Activity-03.

## Supervised Integration After This Plan

Controlled main integration is a separate architecture-supervised operation after Task 4 approval:

1. archive the approved feature SHA with a normal non-force push;
2. confirm remote `main` still equals the expected previous main;
3. make one no-ff merge with no merge-only fixes;
4. make one normal non-force main push;
5. observe the unique automatic exact-main push attempt 1;
6. require Python, TypeScript, and installer-windows all success;
7. do not rerun or dispatch a failed attempt.

Activity-03 design/packet/install/Provider execution remains a later project, not an implicit continuation of this repair.
