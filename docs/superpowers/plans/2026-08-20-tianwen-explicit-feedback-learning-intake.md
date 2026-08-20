# Tianwen Explicit Feedback Learning Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that one real DSH `0.1.0-rc.7` negative message-feedback item with a concrete note becomes exactly one durable Tianwen LearningSignal and one open LearningTicket without changing the DSH Session or creating a Candidate.

**Architecture:** Keep DSH as the only Agent Runtime. Add deterministic feedback classification and identifiers to `@tianwen/evolution`, persist one new event type through its existing append-only ledger, and mount one thin `@tianwen/runtime` adapter that binds a real DSH Session, Tianwen Evidence, and a DSH `MessageFeedbackItem`. Reuse DSH's public message-feedback and storage packages only for the real integration harness; do not build a worker, queue, second ledger, or second Runtime.

**Tech Stack:** TypeScript 6.0.3, Node.js 22, pnpm 11.20.0, Vitest 4.1.8, Cordis services, DSH 0.1.0-rc.7, existing Tianwen Evidence/Evolution packages.

## Global Constraints

- DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- Do not modify or extend Python Alpha, `RepoTaskRuntime`, `AlphaRuntime`, Docker verifier, Candidate activation, Shadow, Promotion, Reject, or Rollback behavior.
- Do not add a package, database, message queue, scheduler, worker, generic event-store abstraction, or second JSONL ledger.
- Reuse the existing `@tianwen/evolution` `ledger.jsonl`; add only `learning-intake-recorded` events.
- The normal DSH result is finalized before Intake; Intake must never append Session events, trigger follow-up, or change the current Run.
- `positive` means `no-case`; `negative` without a note means `observed-gap`; only `negative` with a non-blank note creates a Signal/Ticket.
- Treat every DSH feedback version as one immutable observation. Do not implement feedback update/delete reconciliation in Stage 1.
- Use deterministic NFKC + trim + Unicode-whitespace collapse + lowercase normalization. Do not use a model or semantic clustering.
- Preserve raw notes only in the local evolution ledger. Never print them in receipts, demo JSON, CI artifacts, or ordinary errors.
- Run no Provider, paid model, Docker, live Alpha Trial, release, application, or other paid/external product action.
- Use one implementation worktree under `D:\DevData\tianwen-worktrees`; do not install dependencies in the executor's `C:` worktree.
- Reuse `D:\DevData\pnpm-store` and `D:\DevData\uv-cache`. Run installs once with `--offline`; if an exact cached package is missing, stop and report before allowing network traffic.
- Do not create a second clone, second `node_modules`, second `.venv`, or disposable probe tree for this stage.
- Do not run the known non-bearing runtime-profile diagnostic. Use only affected tests and existing stable closure/import/type gates.
- Tests are supporting evidence; the real DSH feedback → Signal/Ticket demo is the bearing completion gate.
- Complete each task with correctness, architecture-fitness, and Ponytail/YAGNI checks appropriate to its scope. Do not replace architecture-fitness with “the tests pass.”
- Stop after the feature-branch completion checkpoint and report to the architecture supervisor. Main merge and public CI require the supervisor's continuation message.

---

## Execution Workspace Setup

The supervisor will provide the exact plan-bearing commit in the `TIANWEN_PLAN_SHA` environment variable. Use that commit once; do not fetch repeatedly or start from the executor's detached `C:` worktree.

- [ ] **Step 1: Verify the D target and branch do not already exist**

Run from any clean Git worktree:

```powershell
git worktree list --porcelain
git show-ref --verify --quiet refs/heads/codex/tianwen-explicit-feedback-intake
Test-Path -LiteralPath 'D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake'
```

Expected: the branch ref is absent and `Test-Path` returns `False`. If either exists, inspect it and report instead of deleting or overwriting it.

- [ ] **Step 2: Create exactly one implementation worktree from the supervisor-provided SHA**

```powershell
if ([string]::IsNullOrWhiteSpace($env:TIANWEN_PLAN_SHA)) {
  throw 'TIANWEN_PLAN_SHA must come from the supervisor handoff'
}
git cat-file -e "$env:TIANWEN_PLAN_SHA^{commit}"
git worktree add -b codex/tianwen-explicit-feedback-intake `
  'D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake' `
  $env:TIANWEN_PLAN_SHA
```

Expected: the new worktree is clean and its parent contains the approved design and this plan. Never infer the SHA from local `main`.

- [ ] **Step 3: Install once from the existing D cache**

```powershell
$env:COREPACK_HOME='D:\DevData\corepack'
pnpm install --frozen-lockfile --offline --store-dir 'D:\DevData\pnpm-store'
```

Expected: install succeeds with cached/reused packages and no downloads. Record the `reused` and `downloaded` counts. Do not create another worktree if this fails.

- [ ] **Step 4: Record the baseline**

```powershell
git status --short --branch
git rev-parse HEAD
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm run typecheck
```

Expected: clean worktree; exact plan-bearing SHA; DSH closure/import/type gates pass. A pre-existing failure is a stop condition, not permission to repair unrelated code.

---

### Task 1: Deterministic feedback classification and identifiers

**Files:**
- Create: `packages/tianwen-evolution/src/learning-intake.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Create: `tests/dsh-probe/learning-intake.spec.ts`

**Interfaces:**
- Consumes: plain strings, DSH rating vocabulary, Session/Evidence digests supplied by the later runtime adapter.
- Produces: `LearningIntakeInput`, `PreparedLearningIntake`, `LearningIntakeReceipt`, `LearningSignal`, `LearningTicket`, `prepareLearningIntake()` and stable branded identifier types.

- [ ] **Step 1: Write the failing classification and idempotency-domain tests**

Add focused cases like these to `tests/dsh-probe/learning-intake.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  prepareLearningIntake,
  type LearningIntakeInput,
} from '../../packages/tianwen-evolution/src/index.js'

const base: LearningIntakeInput = {
  sessionId: 'session-1',
  messageId: 'message-1',
  feedbackVersion: '11111111-1111-4111-8111-111111111111',
  rating: 'negative',
  note: '  Preserve   tool feedback.  ',
  scopeKey: 'project:tianwen/capability:agent-feedback',
  sessionDigest: `sha256:${'1'.repeat(64)}`,
  evidenceIds: [`sha256:${'2'.repeat(64)}`],
}

describe('Tianwen learning intake domain', () => {
  it('classifies positive and note-free negative feedback without a ticket', () => {
    expect(prepareLearningIntake({ ...base, rating: 'positive' }).kind)
      .toBe('no-case')
    expect(prepareLearningIntake({ ...base, note: undefined }).kind)
      .toBe('observed-gap')
  })

  it('creates stable ids for an explicit correction', () => {
    const first = prepareLearningIntake(base)
    const replay = prepareLearningIntake(structuredClone(base))

    expect(first).toEqual(replay)
    expect(first).toMatchObject({
      kind: 'explicit-correction',
      normalizedNote: 'preserve tool feedback.',
    })
    expect(first.signalId).toMatch(/^signal:[a-f0-9]{64}$/)
    expect(first.ticketId).toMatch(/^ticket:[a-f0-9]{64}$/)
  })

  it('merges only exact normalized corrections inside the same scope', () => {
    const first = prepareLearningIntake(base)
    const whitespaceVariant = prepareLearningIntake({
      ...base,
      messageId: 'message-2',
      feedbackVersion: '22222222-2222-4222-8222-222222222222',
      note: 'PRESERVE tool feedback.',
    })
    const anotherScope = prepareLearningIntake({
      ...base,
      scopeKey: 'project:other/capability:agent-feedback',
    })

    expect(first.ticketId).toBe(whitespaceVariant.ticketId)
    expect(first.ticketId).not.toBe(anotherScope.ticketId)
  })
})
```

Also add validation tests for blank `scopeKey`, malformed digests, empty identifiers, a positive item with a note (`no-case`), and a negative note that normalizes to empty (`observed-gap`). Do not add semantic-equivalence examples that require a model.

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
pnpm exec vitest run tests/dsh-probe/learning-intake.spec.ts
```

Expected: FAIL because the module/exports do not exist. If it fails for dependency installation or an unrelated runtime problem, stop and fix the test setup rather than writing product code.

- [ ] **Step 3: Implement the minimal pure domain module**

Use these exact public shapes in `packages/tianwen-evolution/src/learning-intake.ts`:

```ts
import type { Sha256Digest } from './ledger.js'

export type LearningSignalId = `signal:${string}`
export type LearningTicketId = `ticket:${string}`

export interface LearningIntakeInput {
  readonly sessionId: string
  readonly messageId: string
  readonly feedbackVersion: string
  readonly rating: 'positive' | 'negative'
  readonly note?: string
  readonly scopeKey: string
  readonly sessionDigest: Sha256Digest
  readonly evidenceIds: readonly Sha256Digest[]
}

export type PreparedLearningIntake =
  | { readonly kind: 'no-case'; readonly ingestionId: Sha256Digest; readonly inputDigest: Sha256Digest }
  | { readonly kind: 'observed-gap'; readonly ingestionId: Sha256Digest; readonly inputDigest: Sha256Digest }
  | {
    readonly kind: 'explicit-correction'
    readonly ingestionId: Sha256Digest
    readonly inputDigest: Sha256Digest
    readonly signalId: LearningSignalId
    readonly ticketId: LearningTicketId
    readonly problemFingerprint: Sha256Digest
    readonly noteDigest: Sha256Digest
    readonly normalizedNote: string
  }
```

Keep normalization and hashing private to this file:

```ts
function normalizeNote(note: string): string {
  return note.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}
```

Use recursively key-sorted canonical JSON and Node `createHash('sha256')`, matching the existing Evidence approach. `ingestionId` hashes only `{ sessionId, messageId, feedbackVersion }`; `inputDigest` hashes the full validated input so later replay can reject same-id/different-content conflicts. `noteDigest` hashes the original note string, while `problemFingerprint` hashes the normalized note plus `scopeKey` and the fixed `explicit-user-correction` label. Build `signalId` from the source binding plus `noteDigest`; build `ticketId` directly from `problemFingerprint`, exactly as the approved design specifies.

Export the module from `packages/tianwen-evolution/src/index.ts`. Do not introduce zod or another dependency.

- [ ] **Step 4: Run focused GREEN and static checks**

```powershell
pnpm exec vitest run tests/dsh-probe/learning-intake.spec.ts
pnpm --filter @tianwen/evolution typecheck
git diff --check
```

Expected: all pass.

- [ ] **Step 5: Review the task for architecture fitness and minimalism**

Confirm in the diff:

- no DSH runtime import in the pure domain module;
- no Candidate or Artifact creation;
- no semantic model, scheduler, repository abstraction, or configurable normalization pipeline;
- every id derives from frozen input rather than current time.

- [ ] **Step 6: Commit Task 1**

```powershell
git add packages/tianwen-evolution/src/learning-intake.ts `
  packages/tianwen-evolution/src/index.ts `
  tests/dsh-probe/learning-intake.spec.ts
git commit -m "feat: classify explicit learning feedback"
```

---

### Task 2: Persist Signal and Ticket events in the existing evolution ledger

**Files:**
- Modify: `packages/tianwen-evolution/src/learning-intake.ts`
- Modify: `packages/tianwen-evolution/src/ledger.ts`
- Modify: `packages/tianwen-evolution/src/runtime-binding.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Modify: `tests/dsh-probe/learning-intake.spec.ts`

**Interfaces:**
- Consumes: `LearningIntakeInput` and `prepareLearningIntake()` from Task 1.
- Produces: `EvolutionLedger.recordLearningIntake()`, `listLearningSignals()`, `listLearningTickets()` and matching `TianwenEvolutionService` methods.

- [ ] **Step 1: Add RED tests for write, replay, merge, duplicate, and conflict**

Extend `tests/dsh-probe/learning-intake.spec.ts` with a temporary-root helper and these contracts:

```ts
const ledger = new EvolutionLedger(root, { clock: () => '2026-08-20T00:00:00.000Z' })

const created = ledger.recordLearningIntake(base)
expect(created).toMatchObject({
  decision: 'ticket-created',
  duplicate: false,
})
expect(ledger.listLearningSignals()).toHaveLength(1)
expect(ledger.listLearningTickets()).toMatchObject([{
  status: 'open',
  signalIds: [created.signalId],
}])

const replay = ledger.recordLearningIntake(base)
expect(replay).toMatchObject({
  decision: 'ticket-created',
  duplicate: true,
})
expect(ledger.listLearningSignals()).toHaveLength(1)

const reloaded = new EvolutionLedger(root)
expect(reloaded.listLearningSignals()).toEqual(ledger.listLearningSignals())
expect(reloaded.listLearningTickets()).toEqual(ledger.listLearningTickets())
```

Add separate cases proving:

- a second message with the same normalized correction returns `ticket-merged` and adds one signal to the same Ticket;
- positive and note-free negative feedback append observations but create no Signal/Ticket;
- same ingestion id with a changed note, scope, digest, or Evidence list throws `LedgerIntegrityError`;
- a malformed `learning-intake-recorded` line makes fresh ledger construction fail closed;
- receipt/error serialization does not contain the raw note.

- [ ] **Step 2: Run the ledger tests and confirm RED**

```powershell
pnpm exec vitest run tests/dsh-probe/learning-intake.spec.ts
```

Expected: the Task 1 cases pass and the new ledger-method cases fail because the methods/event type are absent.

- [ ] **Step 3: Add the exact learning records and receipt types**

Add these public domain shapes to `learning-intake.ts`:

```ts
export interface LearningSignal {
  readonly signalId: LearningSignalId
  readonly ingestionId: Sha256Digest
  readonly sessionId: string
  readonly messageId: string
  readonly feedbackVersion: string
  readonly scopeKey: string
  readonly problemFingerprint: Sha256Digest
  readonly noteDigest: Sha256Digest
  readonly sessionDigest: Sha256Digest
  readonly evidenceIds: readonly Sha256Digest[]
}

export interface LearningTicket {
  readonly ticketId: LearningTicketId
  readonly problemFingerprint: Sha256Digest
  readonly status: 'open'
  readonly signalIds: readonly LearningSignalId[]
}

export interface LearningIntakeReceipt {
  readonly decision: 'no-case' | 'observed-gap' | 'ticket-created' | 'ticket-merged'
  readonly ingestionId: Sha256Digest
  readonly signalId?: LearningSignalId
  readonly ticketId?: LearningTicketId
  readonly duplicate: boolean
}

export interface LearningIntakeRecordedEvent {
  readonly schemaVersion: 'tianwen.learning-intake.v1'
  readonly type: 'learning-intake-recorded'
  readonly at: string
  readonly input: LearningIntakeInput
  readonly inputDigest: Sha256Digest
  readonly receipt: Omit<LearningIntakeReceipt, 'duplicate'>
  readonly signal?: LearningSignal
}
```

The raw note remains only inside `event.input.note`; `LearningSignal`, `LearningTicket`, and receipts expose only digests and ids.

- [ ] **Step 4: Extend `EvolutionLedger` without refactoring its existing paths**

In `ledger.ts`:

1. Add `LearningIntakeRecordedEvent` to `LedgerEvent`.
2. Add private maps for ingestion events, Signals, and Tickets.
3. Extend `parseEvent()` with an exact-key parser for `learning-intake-recorded`, including the literal `tianwen.learning-intake.v1` schema version.
4. Add an early `learning-intake-recorded` branch in `#validateAgainstState()` before the existing Artifact-id logic.
5. Add a `learning-intake-recorded` branch in `#apply()` before Artifact handling.
6. Add the three public methods.

Use this decision logic in `recordLearningIntake()`:

```ts
const prepared = prepareLearningIntake(input)
const existing = this.#learningIntakes.get(prepared.ingestionId)
if (existing !== undefined) {
  if (existing.inputDigest !== prepared.inputDigest) {
    throw new LedgerIntegrityError(
      `learning ingestion replay changed content: ${prepared.ingestionId}`,
    )
  }
  return { ...existing.receipt, duplicate: true }
}

const decision = prepared.kind === 'explicit-correction'
  ? this.#tickets.has(prepared.ticketId) ? 'ticket-merged' : 'ticket-created'
  : prepared.kind
```

Append through the existing `#accept()` method so strict parsing, validation, `fsync`, replay, and `LedgerCommitUnknownError` remain unchanged. Do not create another file or generic persistence helper.

- [ ] **Step 5: Expose narrow service methods**

In `runtime-binding.ts`, add only:

```ts
recordLearningIntake(input: LearningIntakeInput): LearningIntakeReceipt {
  return this.formalWrite(() =>
    this.state().ledger.recordLearningIntake(input))
}

listLearningSignals(): readonly LearningSignal[] {
  return this.state().ledger.listLearningSignals()
}

listLearningTickets(): readonly LearningTicket[] {
  return this.state().ledger.listLearningTickets()
}
```

Do not call `recordArtifact()`, `promote()`, `rollback()`, or `dynamicCordisRunner` from Intake.

- [ ] **Step 6: Run focused GREEN and the existing evolution regression**

```powershell
pnpm exec vitest run `
  tests/dsh-probe/learning-intake.spec.ts `
  tests/dsh-probe/evolution.spec.ts
pnpm --filter @tianwen/evolution typecheck
git diff --check
```

Expected: all pass; existing Artifact/Evaluation/Promotion behavior remains unchanged.

- [ ] **Step 7: Review event privacy and branch ownership**

Check that:

- raw note appears only in the local ledger event input and focused synthetic fixtures;
- public list methods and receipt errors do not return it;
- `#validateAgainstState()` does not route learning events through Artifact requirements;
- no Candidate event is emitted as a side effect;
- no whole-file ledger refactor entered the diff.

- [ ] **Step 8: Commit Task 2**

```powershell
git add packages/tianwen-evolution/src/learning-intake.ts `
  packages/tianwen-evolution/src/ledger.ts `
  packages/tianwen-evolution/src/runtime-binding.ts `
  packages/tianwen-evolution/src/index.ts `
  tests/dsh-probe/learning-intake.spec.ts
git commit -m "feat: persist learning signals and tickets"
```

---

### Task 3: Bind a real DSH Session and Evidence without interference

**Files:**
- Create: `packages/tianwen-runtime/src/learning-intake.ts`
- Modify: `packages/tianwen-runtime/src/index.ts`
- Create: `tests/dsh-probe/learning-intake-runtime.spec.ts`

**Interfaces:**
- Consumes: real `Session`, structural DSH feedback snapshot, `ctx.tianwenEvidence`, and `ctx.tianwenEvolution.recordLearningIntake()`.
- Produces: `TianwenLearningIntakeService.consume(session, scopeKey, feedback)` and `ctx.tianwenLearningIntake`.

- [ ] **Step 1: Write RED runtime-adapter tests**

Create a scripted DSH AgentLoop session using `mountCoreHarness`. In the test setup, mount the existing public `DynamicCordisRunnerService` and then the `@tianwen/runtime` plugin with a temporary absolute `evolutionRoot`; do not hand-wire a second ledger. Derive the final append-origin assistant message id, and use this structural snapshot:

```ts
const feedback = {
  messageId: finalMessage.data.message.id,
  rating: 'negative' as const,
  note: 'Preserve the tool result in the final answer.',
  version: '11111111-1111-4111-8111-111111111111',
}
```

Test:

```ts
const before = structuredClone(handle.agent.session.events)
const receipt = harness.ctx.tianwenLearningIntake.consume(
  handle.agent.session,
  'project:tianwen/capability:research-summary',
  feedback,
)

expect(receipt).toMatchObject({
  decision: 'ticket-created',
  duplicate: false,
  sessionUnchanged: true,
})
expect(handle.agent.session.events).toEqual(before)
```

Add cases for a message id from another Session and for a non-final/non-assistant id; both must fail before ledger write. Add an injected ledger write failure case and assert the Session remains byte-for-byte unchanged.

For the failure case, spy on the mounted `ctx.tianwenEvolution.recordLearningIntake()` method and make that call throw. Do not add a production fault-injection interface solely for this test.

- [ ] **Step 2: Run the adapter test and confirm RED**

```powershell
pnpm exec vitest run tests/dsh-probe/learning-intake-runtime.spec.ts
```

Expected: FAIL because `TianwenLearningIntakeService` is not mounted/exported.

- [ ] **Step 3: Implement the thin service**

Use a structural feedback type so this product adapter does not duplicate DSH storage or mutation logic:

```ts
export interface FeedbackSnapshot {
  readonly messageId: string
  readonly rating: 'positive' | 'negative'
  readonly note?: string
  readonly version: string
}

export interface RuntimeLearningIntakeReceipt extends LearningIntakeReceipt {
  readonly sessionUnchanged: true
}
```

`TianwenLearningIntakeService` must:

1. Compute a SHA-256 digest of `session.events` using the same JSON serialization already used by the research-preview demo.
2. Find an append-origin, non-empty `assistant/message` whose message id equals `feedback.messageId`.
3. Call `ctx.tianwenEvidence.project(session)` and pass only Evidence ids into the evolution input.
4. Call `ctx.tianwenEvolution.recordLearningIntake()`.
5. Recompute the Session digest and reject if it changed.
6. Return the ledger receipt plus `sessionUnchanged: true`.

Declare `static inject = ['tianwenEvidence', 'tianwenEvolution'] as const` on the service so Cordis enforces the real dependency order.

Declare the Cordis context augmentation:

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    tianwenLearningIntake: TianwenLearningIntakeService
  }
}
```

Mount the service after Evidence and Evolution in `packages/tianwen-runtime/src/index.ts`:

```ts
await ctx.plugin(TianwenEvidenceService)
await ctx.plugin(TianwenEvolutionService, { root: config.evolutionRoot })
await ctx.plugin(TianwenLearningIntakeService)
```

Do not register tools, prompts, jobs, timers, follow-ups, or Session events.

- [ ] **Step 4: Run focused GREEN and package type checks**

```powershell
pnpm exec vitest run `
  tests/dsh-probe/learning-intake.spec.ts `
  tests/dsh-probe/learning-intake-runtime.spec.ts `
  tests/dsh-probe/evidence.spec.ts
pnpm --filter @tianwen/runtime typecheck
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: all pass and `privateImportViolations=[]`.

- [ ] **Step 5: Review non-interference**

Reject the task if the adapter:

- changes Session state;
- blocks final-answer creation;
- invokes a model/tool/job;
- imports Python/Alpha code;
- handles feedback `put/delete` itself instead of consuming a snapshot;
- creates Candidate/Artifact records.

- [ ] **Step 6: Commit Task 3**

```powershell
git add packages/tianwen-runtime/src/learning-intake.ts `
  packages/tianwen-runtime/src/index.ts `
  tests/dsh-probe/learning-intake-runtime.spec.ts
git commit -m "feat: bind DSH feedback to learning intake"
```

---

### Task 4: Prove the real DSH Message Feedback path and zero-cost demo

**Files:**
- Modify: `packages/tianwen-dsh-compat/package.json`
- Modify: `packages/tianwen-dsh-compat/src/index.ts`
- Modify: `packages/tianwen-dsh-compat/src/test-harness.ts`
- Modify: `pnpm-lock.yaml`
- Create: `scripts/run-explicit-correction-demo.ts`
- Create: `tests/dsh-probe/explicit-correction-demo.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: DSH public `MessageFeedbackService.put/list`, DSH public storage services, normal AgentLoop, Tianwen runtime adapter from Task 3.
- Produces: `mountFeedbackHarness()`, `runExplicitCorrectionDemo()`, and `pnpm demo:explicit-correction`.

- [ ] **Step 1: Add a RED demo contract before dependency changes**

Create `tests/dsh-probe/explicit-correction-demo.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { runExplicitCorrectionDemo } from '../../scripts/run-explicit-correction-demo.js'

describe('Tianwen explicit-correction demo', () => {
  it('turns real DSH feedback into one durable Ticket without a Candidate', async () => {
    const result = await runExplicitCorrectionDemo()
    expect(result).toMatchObject({
      schemaVersion: 'tianwen.explicit-correction-demo.v1',
      execution: { status: 'completed' },
      feedback: { rating: 'negative', stored: true },
      learning: {
        decision: 'ticket-created',
        signals: 1,
        openTickets: 1,
        candidateCreated: false,
      },
      replay: { duplicate: true },
      nonInterference: { sessionUnchanged: true },
    })
    expect(JSON.stringify(result)).not.toContain(
      'Preserve the tool result in the final answer.',
    )
  })
})
```

- [ ] **Step 2: Run the demo test and confirm RED**

```powershell
pnpm exec vitest run tests/dsh-probe/explicit-correction-demo.spec.ts
```

Expected: FAIL because the demo and feedback harness do not exist.

- [ ] **Step 3: Add only the existing rc.7 packages required to mount real feedback**

Add these exact dependencies to `packages/tianwen-dsh-compat/package.json`:

```json
"@deepseek-ai/dsh-message-feedback": "0.1.0-rc.7",
"@deepseek-ai/dsh-storage": "0.1.0-rc.7",
"@deepseek-ai/dsh-storage-domain": "0.1.0-rc.7",
"@deepseek-ai/dsh-storage-json": "0.1.0-rc.7"
```

They already exist in the locked DSH closure and D cache; no version range or new third-party dependency is allowed.

Refresh the importer and links offline once:

```powershell
pnpm install --lockfile-only --offline --store-dir 'D:\DevData\pnpm-store'
pnpm install --frozen-lockfile --offline --store-dir 'D:\DevData\pnpm-store'
```

Expected: `downloaded 0`; only `packages/tianwen-dsh-compat` importer entries change in the lockfile.

- [ ] **Step 4: Add the smallest feedback harness**

Export `MessageFeedbackService` and its public item type from `@tianwen/dsh-compat`:

```ts
export { default as MessageFeedbackService } from '@deepseek-ai/dsh-message-feedback'
export type { MessageFeedbackItem } from '@deepseek-ai/dsh-message-feedback'
```

In `test-harness.ts`, add `mountFeedbackHarness(root, script)`. Its plugin order is:

```ts
await mountAgentLoopTestDependencies(ctx)
await ctx.plugin(AgentLoop, { agents: [] })
await ctx.plugin(JsonlSessionPersistence, {
  root: join(root, 'sessions'),
  compression: 'none',
})
await ctx.plugin(Storage)
await ctx.plugin(JsonStorage, { root: join(root, 'feedback-storage') })
await ctx.plugin(StorageDomain, { backend: 'json', routes: {} })
await ctx.plugin(MessageFeedbackService, { maxNoteBytes: 8192 })
await ctx.plugin(DynamicCordisRunnerService, {})
```

`JsonStorage` and `StorageDomain` are public namespace plugins (`import * as ...`). This helper is deterministic test composition only; it must not create a profile, poll, or start a Provider.

- [ ] **Step 5: Implement the real correction demo**

`runExplicitCorrectionDemo()` must:

1. Create one temporary root and one `mountFeedbackHarness()`.
2. Mount the existing `@tianwen/runtime` plugin with `evolutionRoot` under that same temporary root.
3. Run the same scripted two-request/one-tool normal DSH flow used by the research-preview demo.
4. Find the finalized assistant message id.
5. Call real `ctx.messageFeedback.put({ sessionId, messageId, rating: 'negative', note, ifVersion: null })`.
6. Call real `ctx.messageFeedback.list({ sessionId })` and pass the returned `MessageFeedbackItem` to `ctx.tianwenLearningIntake.consume()`.
7. Replay that exact item and assert the second receipt is duplicate.
8. Read Signal/Ticket counts from `ctx.tianwenEvolution`.
9. Return only redacted counts, ids/digests, and booleans.
10. Dispose the Cordis fiber and remove the one temporary root in `finally`.

If `put` or `list` returns `{ ok: false }`, throw with its stable `error.code`, never with the note.

Add this script only:

```json
"demo:explicit-correction": "tsx scripts/run-explicit-correction-demo.ts"
```

- [ ] **Step 6: Run the real integration GREEN**

```powershell
pnpm exec vitest run `
  tests/dsh-probe/learning-intake.spec.ts `
  tests/dsh-probe/learning-intake-runtime.spec.ts `
  tests/dsh-probe/explicit-correction-demo.spec.ts
pnpm demo:explicit-correction
```

Expected demo facts:

```text
execution.status=completed
feedback.rating=negative
learning.decision=ticket-created
learning.signals=1
learning.openTickets=1
learning.candidateCreated=false
replay.duplicate=true
nonInterference.sessionUnchanged=true
```

The JSON must not contain the note, a local path, Provider credentials, or user data.

- [ ] **Step 7: Run DSH closure/import/type gates**

```powershell
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: exact rc.7 closure; no private imports; all type checks pass.

- [ ] **Step 8: Review actual dependency and disk impact**

Record:

- `pnpm` reused/downloaded counts;
- worktree `node_modules` logical size;
- exact manifest/lock diff;
- number of new temp roots left after demo (must be zero).

Reject any implementation that adds a second harness clone, downloads the same closure again, or leaves the demo ledger/session root behind.

- [ ] **Step 9: Commit Task 4**

```powershell
git add packages/tianwen-dsh-compat/package.json `
  packages/tianwen-dsh-compat/src/index.ts `
  packages/tianwen-dsh-compat/src/test-harness.ts `
  pnpm-lock.yaml package.json `
  scripts/run-explicit-correction-demo.ts `
  tests/dsh-probe/explicit-correction-demo.spec.ts
git commit -m "test: prove real DSH feedback learning intake"
```

---

### Task 5: Update the accurate bilingual public surface and CI bearing gate

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/tianwen-architecture-overview-v2.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/contracts/test_public_repository_surface.py` only if the existing contract cannot express the new exact claim without weakening old claims.

**Interfaces:**
- Consumes: passing Stage 1 demo facts from Task 4.
- Produces: matching English/Chinese claims and CI execution of both zero-cost demos.

- [ ] **Step 1: Write the documentation/CI contract RED**

Extend the existing public-surface contract only with exact, shared facts:

```text
DSH 0.1.0-rc.7 is still the only Agent Runtime.
Explicit negative feedback with a concrete note can create a durable Signal/Ticket.
Positive and note-free negative feedback create no Ticket.
Candidate, Shadow, and Promotion remain unimplemented.
```

Add a narrow YAML assertion that CI runs:

```text
pnpm demo:research-preview
pnpm demo:explicit-correction
```

Do not introduce a Markdown generator, bilingual synchronization framework, or YAML abstraction.

- [ ] **Step 2: Run the public contract and confirm RED**

Reuse one D-based Python environment only:

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
uv sync --frozen --dev --offline
uv run pytest tests/contracts/test_public_repository_surface.py -q
```

Expected: only the newly added Stage 1 assertions fail. Do not run the full Python suite locally for this TypeScript/docs change.

- [ ] **Step 3: Update the bilingual surface with proven facts only**

In both README files:

- keep the “DSH is the only Runtime” first-screen boundary;
- add one current-capability bullet for explicit correction → Signal/Ticket;
- keep `no-case` as the correct outcome when no qualifying correction exists;
- keep Candidate/Shadow/Promotion/SLA/UI explicitly unfinished;
- add `pnpm demo:explicit-correction` beside the existing demo command;
- do not call the project a completed autonomous-learning Agent.

In `docs/tianwen-architecture-overview-v2.md`, mark the non-blocking Learning Ticket entry as Stage 1 proven and identify repeated attributable failure as the next stage. Do not rewrite the architecture or revive historical Alpha wording.

- [ ] **Step 4: Update CI minimally**

Keep the existing two jobs, permissions, action pins, caches, and install/build order. Only:

- add `tests/dsh-probe/learning-intake.spec.ts`, `learning-intake-runtime.spec.ts`, and `explicit-correction-demo.spec.ts` to the focused Vitest command;
- add `pnpm demo:explicit-correction` immediately after the existing research-preview demo.

Do not add a job, matrix, service, Docker, artifact upload, coverage, runtime-profile test, retry, or write permission.

- [ ] **Step 5: Run documentation and CI static GREEN**

```powershell
uv run pytest tests/contracts/test_public_repository_surface.py -q
pnpm exec vitest run `
  tests/dsh-probe/evidence.spec.ts `
  tests/dsh-probe/research-preview-demo.spec.ts `
  tests/dsh-probe/learning-intake.spec.ts `
  tests/dsh-probe/learning-intake-runtime.spec.ts `
  tests/dsh-probe/explicit-correction-demo.spec.ts
pnpm demo:research-preview
pnpm demo:explicit-correction
git diff --check
```

Expected: all pass; both demo outputs remain redacted and deterministic.

- [ ] **Step 6: Review public wording**

Confirm English and Chinese say the same thing and do not claim:

- repeated-failure attribution;
- Case/Lesson/Candidate generation;
- Shadow/Promotion;
- production SLA, UI, or autonomous self-improvement completion.

- [ ] **Step 7: Commit Task 5**

```powershell
git add README.md README.zh-CN.md `
  docs/tianwen-architecture-overview-v2.md `
  .github/workflows/ci.yml `
  tests/contracts/test_public_repository_surface.py
git commit -m "docs: publish explicit feedback intake proof"
```

If the contract file did not require a change, omit it from `git add`; never touch it merely to match this command.

---

### Task 6: Feature-branch completion gate and supervisor checkpoint

**Files:**
- No planned product changes.
- A review-found defect may be fixed only in the owning Task 1–5 file set, followed by the affected RED/GREEN gate and a narrow fix commit.

**Interfaces:**
- Consumes: all Task 1–5 commits.
- Produces: a clean, pushed feature branch and a structured completion report; does not merge main.

- [ ] **Step 1: Run the bearing local gate once**

```powershell
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run `
  tests/dsh-probe/evidence.spec.ts `
  tests/dsh-probe/evolution.spec.ts `
  tests/dsh-probe/research-preview-demo.spec.ts `
  tests/dsh-probe/learning-intake.spec.ts `
  tests/dsh-probe/learning-intake-runtime.spec.ts `
  tests/dsh-probe/explicit-correction-demo.spec.ts
pnpm demo:research-preview
pnpm demo:explicit-correction
uv run pytest tests/contracts/test_public_repository_surface.py -q
git diff --check
```

Expected: all pass. Do not run Provider, Docker, runtime-profile, full Python pytest, or unrelated historical probes.

- [ ] **Step 2: Perform correctness review**

Review the full feature diff against the approved design. Required findings format:

```text
Critical: count and exact locations
Important: count and exact locations
Minor: count and exact locations
Ready: yes/no
```

Critical/Important findings must be fixed before continuing. Do not accept “tests pass” as evidence that the plan itself is reasonable.

- [ ] **Step 3: Perform architecture-fitness review**

Answer explicitly:

1. Did the implementation reuse real DSH Feedback rather than copy it?
2. Did it preserve DSH as the only Runtime?
3. Did Tianwen add only cross-Run Signal/Ticket governance?
4. Does Intake stay after final result and leave Session unchanged?
5. Did any safety/audit rule block normal DSH behavior?
6. Did any test foundation exceed what the direct demo needs?
7. Did Candidate/Promotion behavior remain untouched?

Any “no” is an Important finding.

- [ ] **Step 4: Perform Ponytail/YAGNI review**

Look specifically for removable:

- generic repositories/event buses;
- feedback lifecycle state machines;
- configurable normalizer pipelines;
- duplicate ledger/persistence helpers;
- worker/job/scheduler code;
- wrappers around standard DSH calls;
- unused public types or extension points.

Expected: “Lean / Ready” after any justified simplification.

- [ ] **Step 5: Verify exact Git scope and clean state**

```powershell
git status --short --branch
git log --oneline --decorate --max-count=10
git diff --check "$env:TIANWEN_PLAN_SHA..HEAD"
git diff --name-only "$env:TIANWEN_PLAN_SHA..HEAD"
```

Expected: only plan-approved files changed; worktree clean; no generated roots, logs, `.venv`, or `node_modules` tracked.

- [ ] **Step 6: Push the feature branch once**

```powershell
git push -u origin codex/tianwen-explicit-feedback-intake
git rev-parse HEAD
git rev-parse refs/remotes/origin/codex/tianwen-explicit-feedback-intake
git ls-remote origin refs/heads/codex/tianwen-explicit-feedback-intake
```

Expected: local, tracking, and `ls-remote` SHAs match. Use ordinary non-force push.

- [ ] **Step 7: Stop and send the supervisor report**

Report:

- exact branch/base/head SHAs and commit list;
- exact file scope;
- real Message Feedback `put/list` evidence;
- Signal/Ticket/no-case/idempotency facts;
- both demo JSON summaries without note/path data;
- all local gate results;
- review findings;
- `pnpm` reused/downloaded counts and logical disk impact;
- confirmation of 0 Provider/paid/Docker/Alpha;
- local/tracking/remote SHA equality.

Do not merge main or trigger an extra CI run until the supervisor replies.

---

### Task 7: Mainline integration after supervisor continuation

**Files:**
- No planned source changes.

**Interfaces:**
- Consumes: supervisor-approved feature HEAD.
- Produces: one no-ff main merge, one exact-SHA GitHub Actions run, and the Stage 1 final report.

- [ ] **Step 1: Verify the exact approved feature and clean main worktree**

```powershell
git -C 'D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake' status --short --branch
git -C 'D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake' rev-parse HEAD
git -C 'D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge' status --short --branch
git -C 'D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge' rev-parse HEAD
```

Expected: feature SHA equals the supervisor-approved SHA; main is clean and matches current `origin/main`. If public main advanced, stop and ask the supervisor to rebase the decision; do not merge blindly.

- [ ] **Step 2: Merge with an explicit no-ff commit and verify tree equality**

```powershell
git -C 'D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge' `
  merge --no-ff codex/tianwen-explicit-feedback-intake `
  -m "merge: add explicit feedback learning intake"
git -C 'D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge' `
  diff --quiet codex/tianwen-explicit-feedback-intake^{tree} HEAD^{tree}
```

Expected: merge succeeds and tree comparison returns zero.

- [ ] **Step 3: Push main once and observe the exact automatic CI run**

```powershell
git -C 'D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge' push origin main
```

Use the GitHub CLI/API only to locate the single push run whose `head_sha` equals the new main SHA. Do not manually rerun.

- [ ] **Step 4: Enforce the CI stop line**

If either Python or TypeScript job fails:

1. retrieve the exact job log once;
2. identify whether the cause is in the Stage 1 file set;
3. stop and report;
4. do not retry, skip, add a platform matrix, or begin Stage 2.

If both jobs succeed, record run/job URLs and exact SHA.

- [ ] **Step 5: Send the final Stage 1 completion report**

Include:

- merge SHA and parents;
- exact successful CI run and both job URLs;
- final real-feedback/demo facts;
- public wording boundaries;
- resource/download facts;
- confirmation that Candidate/Shadow/Promotion and Stage 2 remain unstarted;
- unique next entry: supervisor designs Stage 2 only after reviewing this completion gate.

Do not create a tag, Release, application, or post-CI attestation commit.
