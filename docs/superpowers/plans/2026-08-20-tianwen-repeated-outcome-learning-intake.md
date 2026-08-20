# Tianwen Repeated Outcome Learning Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind distinct Tianwen Runs to real DSH Sessions, project one frozen structured acceptance outcome, and create or merge a durable Learning Ticket only when the existing governance gates are satisfied.

**Architecture:** DSH `0.1.0-rc.7` remains the only product Agent Runtime. The existing Tianwen runtime service adds two explicit, non-interfering calls around a normal DSH execution: bind one fresh Session to an immutable Tianwen Run before its first Turn, then consume the final structured verifier outcome after the Run ends. The existing evolution ledger stores Run bindings, Outcome observations, immutable Signals, and the single open Ticket per problem fingerprint; it does not add a second store, worker, scheduler, or Candidate path.

**Tech Stack:** TypeScript 6.0, Node.js 22, pnpm 11.20.0, Vitest 4.1.8, DeepSeek Harness `0.1.0-rc.7`, existing Tianwen Evidence/Evolution JSONL ledger.

## Global Constraints

- The canonical design is `docs/superpowers/specs/2026-08-20-tianwen-repeated-outcome-learning-intake-design.md`; read it completely before editing.
- Also read `docs/tianwen-architecture-overview-v2.md`, `docs/superpowers/specs/2026-08-19-tianwen-runtime-boundary-reset-design.md`, `docs/superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md`, and `docs/superpowers/specs/2026-08-20-tianwen-explicit-feedback-learning-intake-design.md` completely. Plans and historical Alpha documents cannot override them.
- DSH `0.1.0-rc.7` remains the sole product Agent Runtime. Do not add an Agent loop, provider abstraction, Session, Goal runner, tool pipeline, scheduler, worker, queue, database, generic Outcome bus, or Python product path.
- Do not modify or run Python Alpha, RepoTaskRuntime, AlphaRuntime, Docker verifier, Provider, paid model, runtime-profile, Candidate, Case, Lesson, Evaluation, Shadow, Promotion, Reject, or Rollback paths.
- Stage 1 explicit-feedback behavior, public event privacy, research-preview no-case demo, and explicit-correction demo are frozen regressions.
- Run binding occurs before the Session's first `turn/start`; Outcome intake occurs only after a terminal `turn/end`. Neither call may append to or mutate the DSH Session.
- A first ordinary reusable failure records one Signal and zero Tickets. A second distinct Tianwen `runId` with the same problem fingerprint creates exactly one open Ticket. Same-Run replay never increases recurrence.
- Preserve the canonical immediate Ticket gates for explicit user correction, trusted `blocksGoal`, and trusted `severity >= 4`; the two-Run threshold applies to ordinary non-blocking severity 1–3 Outcome Signals.
- Do not parse free-form messages or tool-result text. Route only on the frozen tool name, structured DSH `isError`, and stable DSH `error.code`; absent, uncoded-error, unrelated, interrupted, Provider, Runtime, or infrastructure results are `inconclusive`.
- Persist no Goal/Task text, tool-result body, error message, user content, absolute path, Provider credential, or private data in the Outcome event, receipt, demo, or public list.
- Reuse the existing `ledger.jsonl`; add no second JSONL or migration framework. Existing corrupt/truncated/unknown records continue to fail closed.
- Reuse the clean Stage 1 D-drive implementation worktree at `D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake` and its existing project-local `node_modules`. Do not create a second clone, implementation worktree, venv, node_modules, DSH Profile, or disposable probe.
- Do not rerun dependency installation when the existing `node_modules/.modules.yaml` is present. If it is genuinely missing, allow exactly one `pnpm install --frozen-lockfile --offline --store-dir D:\DevData\pnpm-store`; if the locked packages are absent from that store, stop before any network download.
- Build `@tianwen/runtime...` before the full workspace typecheck. The clean-build ordering omission is known and must not be misreported as a product failure or “fixed” by adding a second Runtime.
- Every implementation Task uses TDD: focused RED, minimal GREEN, focused regression, `git diff --check`, then one ordinary commit.
- Do not merge `main`, create a PR/tag/Release, change repository metadata/visibility, submit an application, or perform another external product action until Task 7 is explicitly released by the architecture/supervision session.
- The only CI change allowed in Stage 2 is adding the new focused Outcome tests and zero-cost repeated-Outcome demo to the existing TypeScript job. Do not change triggers, permissions, runners, action pins, install/build order, Python job, cache policy, or add a new job.

---

## Workspace Setup and Baseline Stop Gate

The supervisor will provide the exact plan-bearing commit as `TIANWEN_PLAN_SHA`. Use it once; do not fetch repeatedly or start from a detached C-drive worktree.

- [ ] **Step 1: Verify the plan-bearing source**

Run from the common repository:

```powershell
git rev-parse $env:TIANWEN_PLAN_SHA
git show --stat --oneline $env:TIANWEN_PLAN_SHA
git diff --exit-code ${env:TIANWEN_PLAN_SHA}^ $env:TIANWEN_PLAN_SHA -- docs/superpowers/specs/2026-08-20-tianwen-repeated-outcome-learning-intake-design.md docs/superpowers/plans/2026-08-20-tianwen-repeated-outcome-learning-intake.md
```

Expected: the commit exists and contains the canonical Stage 2 design and this plan. Do not infer the SHA from another worktree.

- [ ] **Step 2: Reuse the clean Stage 1 D-drive implementation worktree**

```powershell
$implementation = 'D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake'
git -C $implementation status --short
git -C $implementation rev-parse HEAD
git -C $implementation rev-parse refs/remotes/origin/codex/tianwen-explicit-feedback-intake
git show-ref --verify --quiet refs/heads/codex/tianwen-repeated-outcome-learning-intake
if ($LASTEXITCODE -eq 0) {
  throw 'Stage 2 branch already exists; do not overwrite or create another worktree'
}
git -C $implementation switch -c codex/tianwen-repeated-outcome-learning-intake $env:TIANWEN_PLAN_SHA
Set-Location $implementation
git status --short
git rev-parse HEAD
git branch --show-current
```

Expected before the switch: tracked clean and local/tracking SHA both `769a066aff7d587b1192036c00fbbfd68df54c26`. Expected after the switch: same physical D-drive worktree, exact plan SHA, branch `codex/tianwen-repeated-outcome-learning-intake`, and the existing ignored `node_modules` retained.

- [ ] **Step 3: Reuse the existing project-local dependencies**

```powershell
if (-not (Test-Path node_modules\.modules.yaml)) {
  pnpm install --frozen-lockfile --offline --store-dir D:\DevData\pnpm-store
  if ($LASTEXITCODE -ne 0) {
    throw 'offline dependency reconstruction failed; do not download'
  }
} else {
  'reused existing Stage 1 node_modules; install skipped'
}
```

Expected: the existing Stage 1 `node_modules` is found and installation is skipped. If offline reconstruction was necessary, it must report `downloaded 0`. Preserve which path occurred for the completion report.

- [ ] **Step 4: Run the baseline in the known clean-build order**

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-stage2-test-fixtures'
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts
git status --short
```

Expected: all commands pass, DSH closure is exact rc.7, private import violations are empty, and tracked status is clean. Any unrelated pre-existing failure is a stop condition; report it without modifying product code or rerunning until green by accident.

---

### Task 1: Immutable Tianwen Run Binding

**Files:**
- Create: `packages/tianwen-evolution/src/outcome-intake.ts`
- Modify: `packages/tianwen-evolution/src/ledger.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Modify: `packages/tianwen-evolution/src/runtime-binding.ts`
- Modify: `packages/tianwen-evolution/src/learning-intake.ts`
- Create: `tests/dsh-probe/outcome-intake.spec.ts`
- Modify: `tests/dsh-probe/learning-intake-runtime.spec.ts`

**Interfaces:**
- Consumes: existing `Sha256Digest`, canonical JSON/SHA-256 semantics, `EvolutionLedger`, and the single-writer `formalWrite()` boundary.
- Produces: `TianwenRunId`, `RunAcceptanceContract`, `RunBindingInput`, `TianwenRunBinding`, `RunBindingReceipt`, `prepareRunBinding()`, `EvolutionLedger.recordRunBinding()`, `EvolutionLedger.getRunBinding()`, and matching `TianwenEvolutionService` methods.

- [ ] **Step 1: Write the failing Run binding contract**

Create `tests/dsh-probe/outcome-intake.spec.ts` with the D-drive fixture pattern already used by `learning-intake.spec.ts` and this initial contract:

```ts
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LedgerIntegrityError,
  prepareRunBinding,
  type RunBindingInput,
} from '../../packages/tianwen-evolution/src/index.js'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'

const roots: string[] = []
const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_summary',
  notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 2,
  blocksGoal: false,
} as const

const base: RunBindingInput = {
  goalRef: 'goal:research-preview',
  taskRef: 'task:summarize-observation',
  sessionId: 'session:run-1',
  scopeKey: 'project:tianwen/capability:research-summary',
  acceptanceContract: acceptance,
}

function root(prefix: string): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
    'outcome-intake-ledgers',
  )
  mkdirSync(parent, { recursive: true })
  const value = mkdtempSync(join(parent, `${prefix}-`))
  roots.push(value)
  return value
}

afterEach(() => {
  for (const value of roots.splice(0)) {
    rmSync(value, { recursive: true, force: true })
  }
})

describe('Tianwen Run binding', () => {
  it('prepares a stable immutable Run identity', () => {
    const first = prepareRunBinding(base)
    expect(prepareRunBinding(structuredClone(base))).toEqual(first)
    expect(first).toMatchObject({
      schemaVersion: 'tianwen.run-binding.v1',
      goalRef: base.goalRef,
      taskRef: base.taskRef,
      sessionId: base.sessionId,
      scopeKey: base.scopeKey,
      acceptanceContract: acceptance,
    })
    expect(first.runId).toMatch(/^run:[a-f0-9]{64}$/u)
    expect(first.acceptanceContractDigest)
      .toMatch(/^sha256:[a-f0-9]{64}$/u)
  })

  it('replays the same binding and rejects a changed binding for one Session', () => {
    const ledger = new EvolutionLedger(root('binding'))
    expect(ledger.recordRunBinding(base)).toMatchObject({ duplicate: false })
    expect(ledger.recordRunBinding(base)).toMatchObject({ duplicate: true })
    expect(() => ledger.recordRunBinding({
      ...base,
      scopeKey: 'project:other/capability:research-summary',
    })).toThrow(LedgerIntegrityError)
  })
})
```

In `tests/dsh-probe/learning-intake-runtime.spec.ts`, add a public-boundary RED contract using its existing mounted harness. Inside the test set `const ctx = mounted.harness.ctx`, record one Run binding through `ctx.tianwenEvolution.recordRunBinding()` with this local fixture, then prove both type and runtime facts:

```ts
const runBindingInput = {
  goalRef: 'goal:public-boundary',
  taskRef: 'task:public-boundary',
  sessionId: 'session:public-boundary',
  scopeKey: 'project:tianwen/capability:public-boundary',
  acceptanceContract: {
    source: 'dsh-tool-result',
    toolName: 'verify_summary',
    notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
    gapDisposition: 'observe',
  },
} as const
ctx.tianwenEvolution.recordRunBinding(runBindingInput)

type PublicRunBindingEvent = Extract<
  LedgerEvent,
  { readonly type: 'run-binding-recorded' }
>
const publicRunBindingEventIsExcluded:
  PublicRunBindingEvent extends never ? true : false = true

expect(publicRunBindingEventIsExcluded).toBe(true)
expect(JSON.stringify(ctx.tianwenEvolution.listEvents()))
  .not.toContain('run-binding-recorded')
```

The RED is the missing service/domain API; after implementation the compile-time and runtime assertions must both stay GREEN.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-stage2-test-fixtures'
pnpm exec vitest run tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts
```

Expected: FAIL because `prepareRunBinding`, `RunBindingInput`, and ledger methods do not exist.

- [ ] **Step 3: Reuse the existing canonical hash helpers**

In `packages/tianwen-evolution/src/learning-intake.ts`, export the existing package-internal helpers without adding them to the package root. Replace the existing private declarations with these exact bodies:

```ts
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    return `{${entries.join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) {
    throw new TypeError('canonical JSON does not support this value')
  }
  return encoded
}

export function sha256(value: unknown): Sha256Digest {
  const hex = createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')
  return `sha256:${hex}`
}

export function normalizeLearningText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}
```

Replace the existing private `normalizeNote()` call with `normalizeLearningText()`. Do not change Stage 1 hashes or export these helpers from `src/index.ts`.

- [ ] **Step 4: Define the Run binding domain**

Create `packages/tianwen-evolution/src/outcome-intake.ts` with these exact public types and preparation entry point:

```ts
import type { Sha256Digest } from './ledger.js'
import { normalizeLearningText, sha256 } from './learning-intake.js'

export type TianwenRunId = `run:${string}`
export type OutcomeSeverity = 1 | 2 | 3 | 4 | 5

interface ToolAcceptanceBase {
  readonly source: 'dsh-tool-result'
  readonly toolName: string
  readonly notMetErrorCode: string
}

export type RunAcceptanceContract =
  | (ToolAcceptanceBase & {
      readonly gapDisposition: 'observe' | 'ordinary-correction'
    })
  | (ToolAcceptanceBase & {
      readonly gapDisposition: 'reusable'
      readonly problemCategory: string
      readonly severity: OutcomeSeverity
      readonly blocksGoal: boolean
    })

export interface RunBindingInput {
  readonly goalRef: string
  readonly taskRef: string
  readonly sessionId: string
  readonly scopeKey: string
  readonly acceptanceContract: RunAcceptanceContract
}

export interface TianwenRunBinding extends RunBindingInput {
  readonly schemaVersion: 'tianwen.run-binding.v1'
  readonly runId: TianwenRunId
  readonly acceptanceContractDigest: Sha256Digest
}

export interface RunBindingReceipt {
  readonly runId: TianwenRunId
  readonly duplicate: boolean
}

export interface RunBindingRecordedEvent {
  readonly schemaVersion: 'tianwen.run-binding.v1'
  readonly type: 'run-binding-recorded'
  readonly at: string
  readonly binding: TianwenRunBinding
  readonly inputDigest: Sha256Digest
}

export function prepareRunBinding(input: RunBindingInput): TianwenRunBinding {
  const validated = validateRunBindingInput(input)
  const acceptanceContractDigest = sha256(validated.acceptanceContract)
  const runDigest = sha256({
    goalRef: validated.goalRef,
    taskRef: validated.taskRef,
    sessionId: validated.sessionId,
    scopeKey: validated.scopeKey,
    acceptanceContractDigest,
  })
  return {
    schemaVersion: 'tianwen.run-binding.v1',
    runId: `run:${runDigest.slice('sha256:'.length)}`,
    ...validated,
    acceptanceContractDigest,
  }
}
```

`validateRunBindingInput()` must:

- require non-empty, non-blank `goalRef`, `taskRef`, `sessionId`, `scopeKey`, `toolName`, and `notMetErrorCode`;
- return trimmed identifiers but never lowercase opaque IDs, tool names, or error codes;
- accept only the three `gapDisposition` values;
- require normalized non-blank `problemCategory`, integer severity 1–5, and a boolean `blocksGoal` for `reusable`;
- reject `problemCategory`, `severity`, or `blocksGoal` on the two non-reusable variants by checking exact keys;
- return a detached object; do not retain mutable caller references.

`sha256()` remains the only hashing entry point; do not duplicate canonical JSON or hashing logic in this file.

- [ ] **Step 5: Add one strict ledger event and state map**

In `packages/tianwen-evolution/src/ledger.ts`:

1. add `RunBindingRecordedEvent` to internal `LedgerEvent`;
2. exclude it from `PublicLedgerEvent` together with `LearningIntakeRecordedEvent`;
3. add `#runBindings = new Map<TianwenRunId, TianwenRunBinding>()` and `#runIdBySession = new Map<string, TianwenRunId>()`;
4. parse `run-binding-recorded` with exact keys and recompute `prepareRunBinding()` to reject a mismatched `runId`, digest, or contract;
5. add these methods:

```ts
recordRunBinding(input: RunBindingInput): RunBindingReceipt {
  const prepared = prepareRunBinding(input)
  const sessionRunId = this.#runIdBySession.get(prepared.sessionId)
  if (sessionRunId !== undefined) {
    if (sessionRunId !== prepared.runId) {
      throw new LedgerIntegrityError(
        `DSH Session is already bound to another Tianwen Run: ${prepared.sessionId}`,
      )
    }
    return { runId: prepared.runId, duplicate: true }
  }
  this.#accept({
    schemaVersion: 'tianwen.run-binding.v1',
    type: 'run-binding-recorded',
    at: this.#now(),
    binding: prepared,
    inputDigest: sha256(prepared),
  })
  return { runId: prepared.runId, duplicate: false }
}

getRunBinding(runId: TianwenRunId): TianwenRunBinding | undefined {
  const binding = this.#runBindings.get(runId)
  return binding === undefined ? undefined : clone(binding)
}
```

During parsing, recompute `prepareRunBinding()` from the stored binding fields and require `inputDigest === sha256(prepared)`; reject duplicate `runId` and duplicate `sessionId`. During apply, populate both maps. On replay, the same malformed or duplicate event must fail instead of being treated as a live idempotent call.

- [ ] **Step 6: Expose only the narrow service methods**

In `packages/tianwen-evolution/src/runtime-binding.ts`, add synchronous `formalWrite()` wrappers:

```ts
recordRunBinding(input: RunBindingInput): RunBindingReceipt {
  return this.formalWrite(() => this.state().ledger.recordRunBinding(input))
}

getRunBinding(runId: TianwenRunId): TianwenRunBinding | undefined {
  return this.state().ledger.getRunBinding(runId)
}
```

Extend the existing public event guard at the same time; do not add a DTO or serializer:

```ts
function isPublicLedgerEvent(
  event: LedgerEvent,
): event is PublicLedgerEvent {
  return event.type !== 'learning-intake-recorded'
    && event.type !== 'run-binding-recorded'
}
```

In `packages/tianwen-evolution/src/index.ts`, export the Run binding types and `prepareRunBinding()`. Do not export `RunBindingRecordedEvent` or add it to public `LedgerEvent`.

- [ ] **Step 7: Run GREEN and focused Stage 1 regression**

```powershell
pnpm exec vitest run tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: all pass; Stage 1 hash behavior and public event type remain unchanged.

- [ ] **Step 8: Commit Task 1**

```powershell
git add packages/tianwen-evolution/src/outcome-intake.ts packages/tianwen-evolution/src/learning-intake.ts packages/tianwen-evolution/src/ledger.ts packages/tianwen-evolution/src/index.ts packages/tianwen-evolution/src/runtime-binding.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts
git diff --cached --check
git commit -m "feat: bind Tianwen Runs to DSH sessions"
```

---

### Task 2: Outcome Triage and Cross-Run Ticket Merge

**Files:**
- Modify: `packages/tianwen-evolution/src/outcome-intake.ts`
- Modify: `packages/tianwen-evolution/src/ledger.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Modify: `packages/tianwen-evolution/src/runtime-binding.ts`
- Modify: `tests/dsh-probe/outcome-intake.spec.ts`
- Modify: `tests/dsh-probe/learning-intake-runtime.spec.ts`

**Interfaces:**
- Consumes: Task 1 `TianwenRunBinding`, `TianwenRunId`, acceptance contract, ledger Run lookup, existing `LearningSignalId`, `LearningTicketId`, and `LearningTicket`.
- Produces: `OutcomeIntakeInput`, `OutcomeLearningSignal`, `OutcomeIntakeReceipt`, `OutcomeIntakeRecordedEvent`, `prepareOutcomeIntake()`, `EvolutionLedger.recordOutcomeIntake()`, and service wrapper.

- [ ] **Step 1: Add failing triage and recurrence tests**

Append tests that create bindings through `ledger.recordRunBinding()` and then record these exact outcomes:

```ts
const digest = (character: string) => `sha256:${character.repeat(64)}` as const

function bind(
  ledger: EvolutionLedger,
  sessionId: string,
  patch: Partial<RunBindingInput> = {},
) {
  const receipt = ledger.recordRunBinding({
    ...base,
    sessionId,
    ...patch,
  })
  return receipt.runId
}

it('records one Signal first and creates one Ticket on the second Run', () => {
  const ledger = new EvolutionLedger(root('recurrence'))
  const firstRun = bind(ledger, 'session:run-1')
  const secondRun = bind(ledger, 'session:run-2')
  const first = ledger.recordOutcomeIntake({
    runId: firstRun,
    verdict: 'not-met',
    sessionDigest: digest('1'),
    evidenceIds: [digest('2')],
  })
  expect(first).toMatchObject({
    decision: 'signal-recorded',
    duplicate: false,
    ticketId: undefined,
  })
  expect(ledger.listLearningSignals()).toHaveLength(1)
  expect(ledger.listLearningTickets()).toEqual([])

  const second = ledger.recordOutcomeIntake({
    runId: secondRun,
    verdict: 'not-met',
    sessionDigest: digest('3'),
    evidenceIds: [digest('4')],
  })
  expect(second).toMatchObject({
    decision: 'ticket-created',
    duplicate: false,
  })
  expect(ledger.listLearningSignals()).toHaveLength(2)
  expect(ledger.listLearningTickets()).toMatchObject([{
    ticketId: second.ticketId,
    status: 'open',
    signalIds: [first.signalId, second.signalId],
  }])
  expect(ledger.recordOutcomeIntake({
    runId: secondRun,
    verdict: 'not-met',
    sessionDigest: digest('3'),
    evidenceIds: [digest('4')],
  })).toMatchObject({ duplicate: true })
})
```

Add separate focused cases for:

```ts
expect(record('met')).toMatchObject({ decision: 'no-case' })
expect(record('inconclusive')).toMatchObject({ decision: 'continue-observing' })
expect(recordNotMet({ gapDisposition: 'observe' }))
  .toMatchObject({ decision: 'continue-observing' })
expect(recordNotMet({ gapDisposition: 'ordinary-correction' }))
  .toMatchObject({ decision: 'ordinary-correction' })
```

Also prove:

- a third distinct Run returns `ticket-merged` and appends one Signal;
- another scope/category/error code/acceptance contract does not merge;
- one reusable binding with severity 4 or `blocksGoal: true` creates a Ticket on the first Run;
- same ingestion with changed verdict, Evidence, or session digest throws `LedgerIntegrityError`;
- reload reproduces identical bindings, Signals, Tickets, and ordering;
- a malformed `outcome-intake-recorded` line fails closed.

Extend the same public-boundary contract in `learning-intake-runtime.spec.ts`: the public root `LedgerEvent` must exclude `outcome-intake-recorded`, and after recording an Outcome through `ctx.tianwenEvolution.recordOutcomeIntake()` the serialized runtime `listEvents()` result must contain neither `run-binding-recorded` nor `outcome-intake-recorded`. Use the same compile-time `Extract<...> extends never` assertion plus `JSON.stringify()` runtime assertion so the test never weakens the public union merely to inspect a forbidden discriminant.

- [ ] **Step 2: Run focused RED**

```powershell
pnpm exec vitest run tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts
```

Expected: FAIL because Outcome types and `recordOutcomeIntake()` are missing.

- [ ] **Step 3: Define the Outcome domain and deterministic preparation**

Append these interfaces to `outcome-intake.ts`:

```ts
import type {
  LearningSignalId,
  LearningTicketId,
} from './learning-intake.js'

export type OutcomeVerdict = 'met' | 'not-met' | 'inconclusive'

export interface OutcomeIntakeInput {
  readonly runId: TianwenRunId
  readonly verdict: OutcomeVerdict
  readonly sessionDigest: Sha256Digest
  readonly evidenceIds: readonly Sha256Digest[]
}

export interface OutcomeLearningSignal {
  readonly signalId: LearningSignalId
  readonly ingestionId: Sha256Digest
  readonly runId: TianwenRunId
  readonly sessionId: string
  readonly scopeKey: string
  readonly problemFingerprint: Sha256Digest
  readonly problemCategory: string
  readonly failureSignature: Sha256Digest
  readonly severity: OutcomeSeverity
  readonly blocksGoal: boolean
  readonly sessionDigest: Sha256Digest
  readonly evidenceIds: readonly Sha256Digest[]
}

export interface OutcomeIntakeReceipt {
  readonly decision:
    | 'no-case'
    | 'continue-observing'
    | 'ordinary-correction'
    | 'signal-recorded'
    | 'ticket-created'
    | 'ticket-merged'
  readonly ingestionId: Sha256Digest
  readonly signalId?: LearningSignalId
  readonly ticketId?: LearningTicketId
  readonly duplicate: boolean
}

export interface OutcomeIntakeRecordedEvent {
  readonly schemaVersion: 'tianwen.outcome-intake.v1'
  readonly type: 'outcome-intake-recorded'
  readonly at: string
  readonly input: OutcomeIntakeInput
  readonly inputDigest: Sha256Digest
  readonly receipt: Omit<OutcomeIntakeReceipt, 'duplicate'>
  readonly signal?: OutcomeLearningSignal
}

export type PreparedOutcomeIntake =
  | {
      readonly kind: 'no-signal'
      readonly decision:
        | 'no-case'
        | 'continue-observing'
        | 'ordinary-correction'
      readonly ingestionId: Sha256Digest
      readonly inputDigest: Sha256Digest
    }
  | {
      readonly kind: 'reusable'
      readonly ingestionId: Sha256Digest
      readonly inputDigest: Sha256Digest
      readonly signalId: LearningSignalId
      readonly ticketId: LearningTicketId
      readonly problemFingerprint: Sha256Digest
      readonly failureSignature: Sha256Digest
      readonly problemCategory: string
      readonly severity: OutcomeSeverity
      readonly blocksGoal: boolean
    }
```

`prepareOutcomeIntake(binding, input)` must validate the Run ID, SHA-256 digests, verdict, and Evidence cardinality. `met` and `not-met` require exactly one relevant Evidence ID; `inconclusive` accepts zero or one. It must compute:

```ts
const ingestionId = sha256({
  runId: binding.runId,
  acceptanceContractDigest: binding.acceptanceContractDigest,
})

const failureSignature = sha256({
  source: binding.acceptanceContract.source,
  toolName: binding.acceptanceContract.toolName,
  notMetErrorCode: binding.acceptanceContract.notMetErrorCode,
  acceptanceContractDigest: binding.acceptanceContractDigest,
})

const problemFingerprint = sha256({
  scopeKey: binding.scopeKey,
  problemCategory: normalizeLearningText(
    binding.acceptanceContract.problemCategory,
  ),
  failureSignature,
})
```

After validating and cloning `input`, compute `inputDigest = sha256(validatedInput)`. Return `kind: 'no-signal'` with:

- `decision: 'no-case'` for `met`;
- `decision: 'continue-observing'` for `inconclusive` or `gapDisposition: 'observe'`;
- `decision: 'ordinary-correction'` for that disposition.

Only `not-met` plus the frozen `reusable` contract returns `kind: 'reusable'`. For that branch compute the remaining IDs exactly as follows:

```ts
const relevantEvidenceId = validatedInput.evidenceIds[0]!
const signalDigest = sha256({
  runId: binding.runId,
  problemFingerprint,
  relevantEvidenceId,
})
const signalId: LearningSignalId =
  `signal:${signalDigest.slice('sha256:'.length)}`
const ticketId: LearningTicketId =
  `ticket:${problemFingerprint.slice('sha256:'.length)}`
```

Return those IDs together with `ingestionId`, `inputDigest`, fingerprint, failure signature, normalized category, severity, and `blocksGoal`. Do not include a proposed fix, raw tool body, error message, or Ticket decision in the prepared domain value.

- [ ] **Step 4: Add the strict Outcome event to the existing ledger**

In `ledger.ts`:

1. add `OutcomeIntakeRecordedEvent` to internal `LedgerEvent` and exclude it from `PublicLedgerEvent`;
2. widen the internal Signal map to `LearningSignal | OutcomeLearningSignal` and the list return type to the same union;
3. add `#outcomeIntakes = new Map<Sha256Digest, OutcomeIntakeRecordedEvent>()`;
4. strictly parse the event and recompute `prepareOutcomeIntake(binding, input)`;
5. add this method using the existing append path:

```ts
recordOutcomeIntake(input: OutcomeIntakeInput): OutcomeIntakeReceipt {
  const binding = this.#runBindings.get(input.runId)
  if (binding === undefined) {
    throw new LedgerIntegrityError(`unknown Tianwen Run: ${input.runId}`)
  }
  const prepared = prepareOutcomeIntake(binding, input)
  const existing = this.#outcomeIntakes.get(prepared.ingestionId)
  if (existing !== undefined) {
    if (existing.inputDigest !== prepared.inputDigest) {
      throw new LedgerIntegrityError(
        `Outcome ingestion replay changed content: ${prepared.ingestionId}`,
      )
    }
    return { ...existing.receipt, duplicate: true }
  }

  const prior = prepared.kind === 'reusable'
    ? [...this.#learningSignals.values()].filter(isOutcomeSignal)
      .filter(signal =>
        signal.problemFingerprint === prepared.problemFingerprint)
    : []
  const ticketExists = prepared.kind === 'reusable'
    && this.#learningTickets.has(prepared.ticketId)
  const createImmediately = prepared.kind === 'reusable'
    && (prepared.blocksGoal || prepared.severity >= 4)
  const recurredInAnotherRun = prepared.kind === 'reusable'
    && prior.some(signal => signal.runId !== input.runId)
  const decision = prepared.kind !== 'reusable'
    ? prepared.decision
    : ticketExists
      ? 'ticket-merged'
      : createImmediately || recurredInAnotherRun
        ? 'ticket-created'
        : 'signal-recorded'

  const signal: OutcomeLearningSignal | undefined =
    prepared.kind === 'reusable'
      ? {
          signalId: prepared.signalId,
          ingestionId: prepared.ingestionId,
          runId: input.runId,
          sessionId: binding.sessionId,
          scopeKey: binding.scopeKey,
          problemFingerprint: prepared.problemFingerprint,
          problemCategory: prepared.problemCategory,
          failureSignature: prepared.failureSignature,
          severity: prepared.severity,
          blocksGoal: prepared.blocksGoal,
          sessionDigest: input.sessionDigest,
          evidenceIds: input.evidenceIds,
        }
      : undefined
  const receipt: Omit<OutcomeIntakeReceipt, 'duplicate'> = {
    decision,
    ingestionId: prepared.ingestionId,
    ...(prepared.kind === 'reusable'
      ? {
          signalId: prepared.signalId,
          ...(decision === 'signal-recorded'
            ? {}
            : { ticketId: prepared.ticketId }),
        }
      : {}),
  }
  this.#accept({
    schemaVersion: 'tianwen.outcome-intake.v1',
    type: 'outcome-intake-recorded',
    at: this.#now(),
    input,
    inputDigest: prepared.inputDigest,
    receipt,
    ...(signal === undefined ? {} : { signal }),
  })
  return { ...receipt, duplicate: false }
}
```

Use a real type guard `isOutcomeSignal(signal): signal is OutcomeLearningSignal` based on the presence of `runId`; do not cast. In `#apply`, always store a present Outcome Signal first. For `signal-recorded`, return without touching the Ticket map. For `ticket-created`, derive the Ticket's `signalIds` from all prior same-fingerprint Outcome Signals followed by the new Signal. For `ticket-merged`, append only the new Signal to the existing Ticket. Never append a separate Ticket event.

Expand the existing `isPublicLedgerEvent()` guard by one exact clause:

```ts
return event.type !== 'learning-intake-recorded'
  && event.type !== 'run-binding-recorded'
  && event.type !== 'outcome-intake-recorded'
```

Keep this as one type guard shared by `listEvents()`; do not introduce a second public event projection layer.

Replay validation must recompute the decision from state at that ledger position, verify no duplicate Signal, verify the Ticket fingerprint, and reject a receipt carrying an illegal `signalId` or `ticketId` for its decision.

- [ ] **Step 5: Expose narrow types and service methods**

From `src/index.ts`, export `prepareOutcomeIntake` and the Outcome types, but not `OutcomeIntakeRecordedEvent`. Change `TianwenEvolutionService.listLearningSignals()` to return the explicit union and add:

```ts
recordOutcomeIntake(input: OutcomeIntakeInput): OutcomeIntakeReceipt {
  return this.formalWrite(() =>
    this.state().ledger.recordOutcomeIntake(input))
}
```

- [ ] **Step 6: Run GREEN, replay, and Stage 1 regression**

```powershell
pnpm exec vitest run tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: all pass. Confirm a Stage 1 explicit correction still creates a Ticket on its first Signal and no raw note appears in public events.

- [ ] **Step 7: Commit Task 2**

```powershell
git add packages/tianwen-evolution/src/outcome-intake.ts packages/tianwen-evolution/src/ledger.ts packages/tianwen-evolution/src/index.ts packages/tianwen-evolution/src/runtime-binding.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts
git diff --cached --check
git commit -m "feat: merge repeated Outcome signals"
```

---

### Task 3: Real DSH Run Outcome Adapter

**Files:**
- Modify: `packages/tianwen-runtime/src/learning-intake.ts`
- Modify: `packages/tianwen-runtime/src/index.ts`
- Modify: `packages/tianwen-evidence/src/projector.ts`
- Modify: `tests/dsh-probe/evidence.spec.ts`
- Create: `tests/dsh-probe/outcome-intake-runtime.spec.ts`

**Interfaces:**
- Consumes: existing DSH public `Session`, `SessionEvent`, structured tool-result `isError`, Evidence projector, Task 1 Run binding, and Task 2 Outcome intake.
- Produces: one added `EvidenceRecord.outcome.isError` fact for complete results, `TianwenLearningIntakeService.bindRun()`, `TianwenLearningIntakeService.consumeOutcome()`, `RuntimeRunBindingReceipt`, and `RuntimeOutcomeIntakeReceipt`.

- [ ] **Step 1: Write a failing real DSH two-Run integration test**

Create `tests/dsh-probe/outcome-intake-runtime.spec.ts`. Use `mountCoreHarness`, two sequential fresh Agents, the public `HarnessError` from `@deepseek-ai/dsh-llm`, and a deterministic verifier tool:

```ts
class SummaryRequirementNotMet extends HarnessError {
  constructor() {
    super(
      'synthetic summary requirement was not met',
      'SUMMARY_REQUIREMENT_NOT_MET',
    )
  }
}

function registerVerifier(
  harness: Awaited<ReturnType<typeof mountCoreHarness>>,
): void {
  harness.ctx.tools.register(defineTool({
    name: 'verify_summary',
    description: 'verify one synthetic summary contract',
    parameters: { text: { type: 'string', required: true } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      throw new SummaryRequirementNotMet()
    },
  }))
}
```

Before each Agent's first `followup()`, call:

```ts
const binding = harness.ctx.tianwenLearningIntake.bindRun(
  handle.agent.session,
  {
    goalRef: 'goal:research-preview',
    taskRef: `task:summary-${index}`,
    scopeKey: 'project:tianwen/capability:research-summary',
    acceptanceContract: acceptance,
  },
)
```

After `waitForIdle()`, snapshot the Session Events, call `consumeOutcome(session, binding.runId)`, and assert:

```ts
expect(first).toMatchObject({
  decision: 'signal-recorded',
  duplicate: false,
  sessionUnchanged: true,
})
expect(second).toMatchObject({
  decision: 'ticket-created',
  duplicate: false,
  sessionUnchanged: true,
})
expect(harness.ctx.tianwenEvolution.listLearningSignals()).toHaveLength(2)
expect(harness.ctx.tianwenEvolution.listLearningTickets())
  .toMatchObject([{ signalIds: [first.signalId, second.signalId] }])
expect(handle.agent.session.events).toEqual(before)
```

Use two scripted responses per Run: one `toolCallResponse()` for `verify_summary`, then one `textResponse()` so the user result completes even though the verifier tool returned a structured not-met result.

Add focused cases proving:

- `bindRun()` rejects a Session after its first `turn/start` without a ledger write;
- `consumeOutcome()` rejects a `runId` bound to another Session;
- a successful final verifier result with `isError = false` and no error identity is `no-case`;
- no verifier call, missing result, `isError = true` without an error code, unrelated error code, and a non-completed terminal Turn are `continue-observing`;
- if the Session has an older `turn/end` followed by a newer unmatched `turn/start`, `consumeOutcome()` rejects before writing because the Run has not ended;
- a failed evolution write leaves Session bytes unchanged;
- public `LedgerEvent` excludes `run-binding-recorded` and `outcome-intake-recorded` at compile time and runtime.

- [ ] **Step 2: Run the integration test and verify RED**

```powershell
pnpm exec vitest run tests/dsh-probe/outcome-intake-runtime.spec.ts
```

Expected: FAIL because runtime methods and receipt types are missing.

- [ ] **Step 3: Preserve the DSH tool-result success/failure fact in Evidence**

First extend the existing `tests/dsh-probe/evidence.spec.ts` helper so it can create `isError: true` with and without `data.error`. Add RED assertions that a complete successful result projects `isError: false`, a coded error projects `isError: true` plus the code, and an uncoded error projects `isError: true` without a code.

Run before changing the projector:

```powershell
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts
```

Expected: FAIL because complete Evidence does not yet expose `isError`.

In `packages/tianwen-evidence/src/projector.ts`, change only the complete Outcome variant:

```ts
readonly outcome:
  | {
      readonly status: 'complete'
      readonly resultDigest: `sha256:${string}`
      readonly isError: boolean
      readonly errorCode?: string
    }
  | {
      readonly status: 'missing-result'
    }
```

Populate `isError` from the DSH tool-result block with `result.data.message.content[0].isError === true`. Do not parse rendered error text, change `evidenceId`, add an error message, or create a second projector.

Run `pnpm exec vitest run tests/dsh-probe/evidence.spec.ts`; expected: GREEN with existing Evidence IDs and redaction behavior unchanged.

- [ ] **Step 4: Add the two explicit runtime calls**

In `packages/tianwen-runtime/src/learning-intake.ts`, keep the existing feedback `consume()` unchanged and add:

```ts
export type RuntimeRunBindingInput = Omit<RunBindingInput, 'sessionId'>

export interface RuntimeRunBindingReceipt extends RunBindingReceipt {
  readonly sessionUnchanged: true
}

export interface RuntimeOutcomeIntakeReceipt extends OutcomeIntakeReceipt {
  readonly sessionUnchanged: true
}

bindRun(
  session: Session,
  input: RuntimeRunBindingInput,
): RuntimeRunBindingReceipt {
  const before = sessionDigest(session.events)
  if (session.events.some(event => event.type === 'turn/start')) {
    throw new Error('Tianwen Run must be bound before the first DSH Turn')
  }
  const receipt = this.ctx.tianwenEvolution.recordRunBinding({
    ...input,
    sessionId: String(session.id),
  })
  if (sessionDigest(session.events) !== before) {
    throw new Error('Run binding changed the DSH Session')
  }
  return { ...receipt, sessionUnchanged: true }
}
```

Add `consumeOutcome(session, runId)` using this deterministic projector:

```ts
const binding = this.ctx.tianwenEvolution.getRunBinding(runId)
if (binding === undefined) throw new Error(`unknown Tianwen Run: ${runId}`)
if (binding.sessionId !== String(session.id)) {
  throw new Error('Tianwen Run is bound to another DSH Session')
}
const before = sessionDigest(session.events)
const finalBoundary = session.events.findLast(event =>
  event.type === 'turn/start' || event.type === 'turn/end')
if (finalBoundary?.type !== 'turn/end') {
  throw new Error('DSH Session does not have a terminal Turn')
}
const turnEnd = finalBoundary
const matches = this.ctx.tianwenEvidence.project(session)
  .filter(record =>
    record.action.toolName === binding.acceptanceContract.toolName)
  .sort((left, right) => left.source.callSeq - right.source.callSeq)
const finalEvidence = matches.at(-1)

const verdict = turnEnd.data.reason.kind !== 'completed'
  || finalEvidence === undefined
  || finalEvidence.outcome.status === 'missing-result'
  ? 'inconclusive'
  : finalEvidence.outcome.isError === false
      && finalEvidence.outcome.errorCode === undefined
    ? 'met'
    : finalEvidence.outcome.isError === true
        && finalEvidence.outcome.errorCode
        === binding.acceptanceContract.notMetErrorCode
      ? 'not-met'
      : 'inconclusive'

const receipt = this.ctx.tianwenEvolution.recordOutcomeIntake({
  runId,
  verdict,
  sessionDigest: before,
  evidenceIds: finalEvidence === undefined ? [] : [finalEvidence.evidenceId],
})
if (sessionDigest(session.events) !== before) {
  throw new Error('Outcome intake changed the DSH Session')
}
return { ...receipt, sessionUnchanged: true }
```

Do not subscribe to Agent lifecycle events or auto-run intake. The Host remains the explicit owner of call timing.

- [ ] **Step 5: Export runtime types without adding another service**

In `packages/tianwen-runtime/src/index.ts`, export the four new runtime types from the existing `learning-intake.ts`. Do not create `TianwenOutcomeService`, a registry, or a plugin.

- [ ] **Step 6: Run GREEN and the complete affected surface**

```powershell
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: all pass, exact rc.7 closure, no private imports, and every Session comparison remains byte-for-byte equal.

- [ ] **Step 7: Commit Task 3**

```powershell
git add packages/tianwen-evidence/src/projector.ts packages/tianwen-runtime/src/learning-intake.ts packages/tianwen-runtime/src/index.ts tests/dsh-probe/evidence.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts
git diff --cached --check
git commit -m "feat: consume structured DSH Run outcomes"
```

---

### Task 4: Deterministic Repeated Outcome Demo

**Files:**
- Create: `scripts/run-repeated-outcome-demo.ts`
- Create: `tests/dsh-probe/repeated-outcome-demo.spec.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 3 runtime API, existing scripted DSH test harness, existing demo cleanup and JSON patterns.
- Produces: `runRepeatedOutcomeDemo()`, `RepeatedOutcomeDemoResult`, `pnpm demo:repeated-outcome`, and exact mainline CI coverage for the new Stage 2 contracts.

- [ ] **Step 1: Write the failing demo contract**

Create `tests/dsh-probe/repeated-outcome-demo.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { runRepeatedOutcomeDemo } from '../../scripts/run-repeated-outcome-demo.js'

describe('repeated Outcome demo', () => {
  it('creates one Ticket only after two distinct synthetic Run outcomes', async () => {
    const result = await runRepeatedOutcomeDemo()
    expect(result).toMatchObject({
      schemaVersion: 'tianwen.repeated-outcome-demo.v1',
      fixture: { syntheticContractFixture: true },
      execution: { runs: 2, sessions: 2, status: 'completed' },
      outcomes: ['not-met', 'not-met'],
      learning: {
        firstDecision: 'signal-recorded',
        secondDecision: 'ticket-created',
        signals: 2,
        openTickets: 1,
        candidateCreated: false,
      },
      replay: { duplicate: true },
      nonInterference: { sessionsUnchanged: true },
      costs: {
        network: 0,
        providerRequests: 0,
        paidTokens: 0,
        cny: 0,
        docker: 0,
        userData: 0,
      },
    })
  })
})
```

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run tests/dsh-probe/repeated-outcome-demo.spec.ts
```

Expected: FAIL because the script does not exist.

Also prove the existing workflow is RED for Stage 2 coverage without adding a permanent YAML test:

```powershell
$ci = Get-Content .github/workflows/ci.yml -Raw
if ($ci -notmatch 'outcome-intake\.spec\.ts' -or
    $ci -notmatch 'outcome-intake-runtime\.spec\.ts' -or
    $ci -notmatch 'repeated-outcome-demo\.spec\.ts' -or
    $ci -notmatch 'pnpm demo:repeated-outcome') {
  throw 'Stage 2 is not yet covered by the TypeScript CI job'
}
```

Expected: FAIL because none of the new Stage 2 commands exists yet.

- [ ] **Step 3: Implement one self-cleaning synthetic contract demo**

Follow `scripts/run-explicit-correction-demo.ts` exactly for temp-root creation, harness disposal, Session digesting, direct-execution detection, and one formatted JSON output. Use the same `SummaryRequirementNotMet` class and acceptance contract as the integration test. Run two Agents sequentially so the scripted adapter order is deterministic.

Define the result type with these exact top-level fields:

```ts
export interface RepeatedOutcomeDemoResult {
  readonly schemaVersion: 'tianwen.repeated-outcome-demo.v1'
  readonly fixture: { readonly syntheticContractFixture: true }
  readonly execution: {
    readonly status: 'completed'
    readonly runs: 2
    readonly sessions: 2
    readonly modelRequests: number
    readonly toolCalls: number
  }
  readonly outcomes: readonly ['not-met', 'not-met']
  readonly learning: {
    readonly firstDecision: 'signal-recorded'
    readonly secondDecision: 'ticket-created'
    readonly signals: 2
    readonly openTickets: 1
    readonly candidateCreated: false
    readonly ticketId: string
  }
  readonly replay: { readonly duplicate: true }
  readonly nonInterference: {
    readonly beforeDigests: readonly [`sha256:${string}`, `sha256:${string}`]
    readonly afterDigests: readonly [`sha256:${string}`, `sha256:${string}`]
    readonly sessionsUnchanged: true
  }
  readonly costs: {
    readonly network: 0
    readonly providerRequests: 0
    readonly paidTokens: 0
    readonly cny: 0
    readonly docker: 0
    readonly userData: 0
  }
}
```

Before returning, fail loud unless all of these are true: two different `runId`s, two Signals, one Ticket containing both Signal IDs in order, duplicate replay, zero Artifact events, two matching before/after Session digests, two completed final Turns, and the expected decisions.

Always remove the temp root in `finally`. Do not write a receipt file, use a persistent database, or retain fixture data.

- [ ] **Step 4: Add the package command**

Add exactly one script to `package.json`:

```json
"demo:repeated-outcome": "tsx scripts/run-repeated-outcome-demo.ts"
```

Do not change dependencies or the lockfile.

- [ ] **Step 5: Extend only the existing TypeScript CI proof**

In `.github/workflows/ci.yml`, append these three files to the existing focused Vitest command, keeping the command as one step:

```text
tests/dsh-probe/outcome-intake.spec.ts
tests/dsh-probe/outcome-intake-runtime.spec.ts
tests/dsh-probe/repeated-outcome-demo.spec.ts
```

Immediately after the existing `pnpm demo:explicit-correction` step, add exactly:

```yaml
      - run: pnpm demo:repeated-outcome
```

Do not change any other workflow line. Re-run the one-shot Stage 2 workflow coverage check from Step 2; expected: PASS.

- [ ] **Step 6: Run GREEN and all three demos**

```powershell
pnpm exec vitest run tests/dsh-probe/repeated-outcome-demo.spec.ts
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
git diff --check
git status --short
```

Expected: each command outputs one JSON object; no fixture root remains; lockfile is unchanged.

- [ ] **Step 7: Commit Task 4**

```powershell
git add .github/workflows/ci.yml package.json scripts/run-repeated-outcome-demo.ts tests/dsh-probe/repeated-outcome-demo.spec.ts
git diff --cached --check
git commit -m "test: prove repeated Outcome learning intake"
```

---

### Task 5: Accurate Architecture and Bilingual Public Surface

**Files:**
- Modify: `docs/tianwen-architecture-overview-v2.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `CONTRIBUTING.md`
- Modify: `tests/contracts/test_public_repository_surface.py`

**Interfaces:**
- Consumes: verified Task 1–4 behavior and the canonical Stage 2 design.
- Produces: one accurate bilingual statement of proven Stage 2 behavior and unchanged limitations.

- [ ] **Step 1: Extend the existing public fact contract and verify RED**

Append one focused test to `tests/contracts/test_public_repository_surface.py`; reuse its existing readers and plain string assertions:

```py
def test_repeated_outcome_public_facts_and_ci() -> None:
    readme_en = read_public_document("README.md")
    readme_zh = read_public_document("README.zh-CN.md")
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(
        encoding="utf-8"
    )

    assert "pnpm demo:repeated-outcome" in readme_en
    assert "pnpm demo:repeated-outcome" in readme_zh
    assert "first ordinary reusable failure records only a Signal" in readme_en
    assert "synthetic contract fixture" in readme_en
    assert "第一次普通可复用失败只记录 Signal" in readme_zh
    assert "合成合同夹具" in readme_zh
    for command in (
        "tests/dsh-probe/outcome-intake.spec.ts",
        "tests/dsh-probe/outcome-intake-runtime.spec.ts",
        "tests/dsh-probe/repeated-outcome-demo.spec.ts",
        "pnpm demo:repeated-outcome",
    ):
        assert command in ci
```

Run the contract using the existing reusable D-drive environment:

```powershell
D:\DevData\tianwen-worktrees\tianwen-oss-application-prep\.venv\Scripts\python.exe -m pytest tests/contracts/test_public_repository_surface.py -q
```

Expected: FAIL only on the new README facts. The CI assertions already pass from Task 4. Do not create another venv.

- [ ] **Step 2: Update the architecture overview from the new evidence**

In `docs/tianwen-architecture-overview-v2.md`:

- mark Stage 2 repeated structured Outcome intake as proven;
- state that Tianwen Run identity is distinct from the bound DSH Session;
- state that the first ordinary reusable failure records a Signal and the second distinct Run creates one Ticket;
- state that `met`, `inconclusive`, observe, ordinary correction, and unrelated infrastructure errors do not create a Ticket;
- keep Candidate/Case/Lesson/Shadow/Promotion unimplemented;
- set the next entry to Stage 3 Case/Attribution/Lesson/finite Candidate design;
- do not rewrite the architecture or revive Python Alpha as a product Runtime.

- [ ] **Step 3: Update English and Chinese as factual mirrors**

In both READMEs, make the same factual changes:

- the first-screen preview includes repeated structured Outcome intake after the existing Evidence and explicit-feedback claims;
- add `pnpm demo:repeated-outcome` to the demo commands;
- include the English sentence `The first ordinary reusable failure records only a Signal; the second matching failure from a different Tianwen Run creates one open Ticket.` and its factual Chinese mirror `第一次普通可复用失败只记录 Signal；来自另一个 Tianwen Run 的第二次同类失败才创建一个开放 Ticket。`;
- include the English sentence `This is a zero-cost synthetic contract fixture, not naturally accumulated production learning evidence.` and its factual Chinese mirror `这是零成本合成合同夹具，不是生产环境中自然积累的学习证据。`;
- state that it uses two distinct Tianwen Runs/two DSH Sessions, replay is idempotent, and Sessions are unchanged;
- keep the claims that Candidate, Shadow, Promotion, production SLA, and finished UI are incomplete;
- add the new script to the repository map and focused test command;
- do not claim semantic text clustering, automatic root-cause analysis, autonomous Skill changes, or completed general learning.

In `CONTRIBUTING.md`, add the repeated-outcome demo/test command and allow contributors to describe only the proven Run binding/Outcome/Signal/Ticket behavior. Preserve the ban on claiming Candidate/Shadow/Promotion complete.

- [ ] **Step 4: Run documentation contracts**

```powershell
D:\DevData\tianwen-worktrees\tianwen-oss-application-prep\.venv\Scripts\python.exe -m pytest tests/contracts/test_public_repository_surface.py -q
git diff --check
```

Expected: all public contract tests pass. If that exact existing interpreter no longer exists, stop and report the missing reusable environment before creating another venv.

- [ ] **Step 5: Run the final demo facts before committing docs**

```powershell
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
```

Expected: the outputs exactly support the public claims; no raw error message, path, credential, or user data appears.

- [ ] **Step 6: Commit Task 5**

```powershell
git add docs/tianwen-architecture-overview-v2.md README.md README.zh-CN.md CONTRIBUTING.md tests/contracts/test_public_repository_surface.py
git diff --cached --check
git commit -m "docs: publish repeated Outcome intake proof"
```

---

### Task 6: Final Verification, Independent Reviews, and Feature Push

**Files:**
- Modify only files required to close review findings within the approved Stage 2 scope.

**Interfaces:**
- Consumes: Tasks 1–5 complete commits.
- Produces: one reviewed, clean, ordinarily pushed feature branch and a structured completion report to the architecture/supervision session.

- [ ] **Step 1: Run the exact affected TypeScript gate once**

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-stage2-test-fixtures'
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/evolution.spec.ts tests/dsh-probe/research-preview-demo.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/repeated-outcome-demo.spec.ts
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
git diff --check
```

Expected: all pass. Do not run runtime-profile, Provider, Docker, Alpha, or unrelated broad probes.

- [ ] **Step 2: Audit generated storage and fixture cleanup**

```powershell
Get-ChildItem D:\DevData\tianwen-stage2-test-fixtures -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum
Get-ChildItem . -Force -Directory | Where-Object Name -Match 'tianwen|dsh-probe' | Select-Object FullName
git status --short
```

Expected: Stage 2 fixture files are zero after tests; no second venv/node_modules/profile/clone exists; only planned tracked changes are present.

- [ ] **Step 3: Request correctness and architecture review**

Use the requesting-code-review skill with reviewers instructed to read the canonical Stage 2 spec and inspect the whole feature diff from the plan SHA. The review must explicitly answer:

- Does DSH remain the sole Runtime?
- Is Tianwen Run identity distinct from Session/Turn/DSH Goal?
- Can absent/error infrastructure facts be misclassified as `met` or reusable `not-met`?
- Can an open latest Turn or an uncoded `isError = true` tool result be consumed as a completed successful Run?
- Can one Run or one Session inflate recurrence?
- Does the second Run Ticket contain both immutable Signals?
- Do Stage 1 explicit correction and public event privacy remain intact?
- Can any intake outcome change the DSH Session or current Run?
- Are internal Run/Outcome events or raw contents exposed publicly?

Critical or Important findings are blockers. Fix each blocker with a focused RED/GREEN test and a narrow ordinary commit. Re-run only the directly affected gate plus Task 6 Step 1 once after all fixes.

- [ ] **Step 4: Run Ponytail/YAGNI review**

Use ponytail-review on the whole feature diff. The required result is no Critical/Important complexity finding and no second store/service/framework. Remove speculative helpers, registration layers, source abstractions, config frameworks, unused fields, duplicate hashing code, or broad refactors not required by the spec.

If a simplification changes behavior, add or adjust the smallest focused test before editing. Commit only the final minimal fix.

- [ ] **Step 5: Verify the final feature history and push once**

```powershell
git status --short
git log --oneline --decorate $env:TIANWEN_PLAN_SHA..HEAD
git diff --stat $env:TIANWEN_PLAN_SHA..HEAD
git diff --check $env:TIANWEN_PLAN_SHA..HEAD
git push -u origin codex/tianwen-repeated-outcome-learning-intake
git rev-parse HEAD
git rev-parse refs/remotes/origin/codex/tianwen-repeated-outcome-learning-intake
git ls-remote origin refs/heads/codex/tianwen-repeated-outcome-learning-intake
```

Expected: clean worktree and all three SHAs equal after one ordinary non-force push.

- [ ] **Step 6: Report and stop before Task 7**

Send the architecture/supervision session:

- plan base SHA, branch, commit sequence, final feature SHA, and push equality;
- exact files changed and confirmation that no unplanned package/store/runtime was added;
- Run binding, Outcome triage, first/second/third Run decisions, same-Run replay, Ticket contents, and Stage 1 regression facts;
- exact DSH integration and all three demo outputs without raw private content;
- typecheck, closure, private import, focused Vitest, public Python contract, diff check, and review results;
- D-drive dependency summary (existing Stage 1 `node_modules` reused with install skipped, or offline reconstruction with `downloaded 0`), fixture cleanup, and confirmation that no second implementation worktree/node_modules was created;
- explicit statement that Candidate/Case/Lesson/Evaluation/Shadow/Promotion remain unstarted;
- the only next entry: architecture/supervision review and explicit release of Task 7.

Do not merge main or trigger main CI before that release.

---

### Task 7: Mainline Integration and Exact-SHA CI

**Files:**
- No planned product changes. Merge only the already approved feature tree.

**Interfaces:**
- Consumes: architecture/supervision approval of the exact Task 6 feature SHA.
- Produces: one `--no-ff` main merge, one ordinary main push, and one successful exact-SHA GitHub Actions run.

- [ ] **Step 1: Verify the approved feature and clean main worktree**

Use the existing D-drive main worktree. Confirm the feature local/tracking/remote SHA equals the supervisor-approved SHA and both worktrees are clean. Do not fetch unless the supervisor reports an actual remote mismatch.

```powershell
git -C D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake status --short
git -C D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake rev-parse HEAD
git -C D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge status --short
git -C D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge rev-parse main
git -C D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge rev-parse refs/remotes/origin/main
git ls-remote origin refs/heads/main
```

- [ ] **Step 2: Merge exactly once and verify tree equality**

```powershell
Set-Location D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge
git merge --no-ff codex/tianwen-repeated-outcome-learning-intake -m "merge: add repeated Outcome learning intake"
git rev-parse 'HEAD^{tree}'
git rev-parse 'codex/tianwen-repeated-outcome-learning-intake^{tree}'
git diff --check HEAD^1..HEAD
```

Expected: merge tree equals the approved feature tree exactly. Do not make a merge-only fix.

- [ ] **Step 3: Push main once and wait for the automatic exact-SHA run**

```powershell
git push origin main
git rev-parse HEAD
git rev-parse refs/remotes/origin/main
git ls-remote origin refs/heads/main
```

Use the GitHub CLI/API to identify the single automatic `push` run whose `head_sha` equals the new merge SHA. Wait without rerunning. Both Python and TypeScript jobs must finish `success`; the focused Evidence, Stage 1, and Stage 2 tests plus all three demo steps must be visible as successful steps in the exact-SHA TypeScript job.

If CI fails, download the exact failed job log to a new small directory under `D:\DevData\tianwen-public-audit`, report the deterministic root cause, and stop. Do not rerun, skip, add retries, change platforms, or begin Stage 3.

- [ ] **Step 4: Report exact main completion and stop**

Report merge SHA/parents/tree equality, local/tracking/remote equality, exact GitHub Actions run and job URLs, resource actions, and unchanged product boundaries. Do not create a tag, Release, PR, visibility change, application submission, post-CI attestation commit, or Stage 3 implementation.
