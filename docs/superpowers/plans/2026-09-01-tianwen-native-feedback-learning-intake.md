# Tianwen Native Feedback and Learning Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DSH Message Feedback the only editable feedback source and durably bridge every message-level revision or retraction into Tianwen Learning Intake without requiring a Goal page, analysis button, or child Session.

**Architecture:** DSH owns the current feedback value in the `message_feedback` storage-domain sidecar. Tianwen listens only after durable `domain/changed` events and reconciles by calling `messageFeedback.list()`. Evolution remains an append-only audit ledger: one event records each feedback revision and its superseded predecessor, and one event records retraction. The identity is `(sessionId, messageId)`, while `(sessionId, messageId, feedbackVersion)` is the idempotent revision key. Profile-scoped auto-analysis consent is another append-only Evolution projection so no new database or settings service is introduced.

**Tech Stack:** TypeScript 6, Node.js 22.19, Cordis 4, DSH `0.1.1-rc.2`, `@deepseek-ai/dsh-message-feedback`, Vitest 4, pnpm 11.

## Global Constraints

- Begin only after the stage 1 completion gate in `2026-09-01-tianwen-native-dsh-execution-plane.md` is green.
- DSH Message Feedback is the only mutable current-value store. Do not copy a second editable feedback table into Tianwen.
- Do not assume the target is the Session's last assistant message. DSH permits any persisted, non-empty, append-origin finalized assistant message.
- Never claim "learning started" until the Evolution receipt is durable. If only DSH persistence succeeded, report "feedback saved; learning recovery pending."
- DSH feedback and Evolution append are not one transaction. Recovery is idempotent reconciliation, never rollback of the user's DSH feedback.
- Do not send feedback notes or referenced replies to any model without consent that was already enabled when that revision was ingested. Enabling consent later does not retroactively analyze history.
- Keep feedback notes out of public receipts, status RPCs, logs, errors, and UI projections. The private ledger event may retain the note for governed analysis.
- Use the single-host assumption explicitly. Do not add multi-process messaging or a distributed lock.
- Remove the duplicate Goal Task feedback write path before this stage completes.
- Keep Runtime/Desktop versions unchanged until rollout stage 4.

---

### Task 1: Re-key Learning Intake by Session and assistant message

**Files:**
- Modify: `packages/tianwen-evolution/src/learning-intake.ts`
- Modify: `packages/tianwen-evolution/src/ledger.ts`
- Modify: `packages/tianwen-evolution/src/runtime-binding.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Modify: `tests/dsh-probe/learning-intake.spec.ts`
- Modify: `tests/dsh-probe/evolution.spec.ts`

- [ ] Replace the Session-only status test with two feedback messages in the same Session and exact message-level reads after reload.

```ts
expect(ledger.getLearningIntakeStatus('session-1', 'message-1')?.messageId)
  .toBe('message-1')
expect(ledger.getLearningIntakeStatus('session-1', 'message-2')?.messageId)
  .toBe('message-2')
expect(ledger.listLearningIntakeStatuses('session-1').map(item => item.messageId))
  .toEqual(['message-1', 'message-2'])
```

- [ ] Change the in-memory projection key to an unambiguous nested map or canonical tuple key. Do not concatenate ids with a character that user-controlled ids can contain.

```ts
type MessageLearningState = ReadonlyMap<string, ReadonlyMap<string, LearningIntakeStatus>>
```

- [ ] Change the public Runtime binding to exact and enumeration APIs.

```ts
getLearningIntakeStatus(
  sessionId: string,
  messageId: string,
): LearningIntakeStatus | undefined

listLearningIntakeStatuses(sessionId: string): readonly LearningIntakeStatus[]
```

- [ ] Remove the one-argument getter and update every call site. Do not retain a misleading compatibility overload that silently returns the last Session item.

- [ ] Preserve old `tianwen.learning-intake.v1` events unchanged and rebuild the new message index by replaying their existing `sessionId` and `messageId` fields.

- [ ] Run the focused tests.

```powershell
pnpm vitest run tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/evolution.spec.ts
```

- [ ] Commit.

```powershell
git add packages/tianwen-evolution/src/learning-intake.ts packages/tianwen-evolution/src/ledger.ts packages/tianwen-evolution/src/runtime-binding.ts packages/tianwen-evolution/src/index.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/evolution.spec.ts
git commit -m "refactor: index learning intake by message"
```

### Task 2: Record supersession, retraction, and consent as append-only facts

**Files:**
- Modify: `packages/tianwen-evolution/src/learning-intake.ts`
- Modify: `packages/tianwen-evolution/src/ledger.ts`
- Modify: `packages/tianwen-evolution/src/runtime-binding.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Modify: `tests/dsh-probe/learning-intake.spec.ts`

- [ ] Write failing tests for initial revision, changed note/rating, exact replay, retraction, repeated retraction, reload, and consent enable/disable.

- [ ] Add a v2 intake event that atomically appends the new intake and its optional predecessor link in one ledger line. Do not write the new intake and supersession as two independently crashable lines.

```ts
export interface LearningIntakeRecordedV2Event {
  readonly schemaVersion: 'tianwen.learning-intake.v2'
  readonly type: 'learning-intake-recorded'
  readonly at: string
  readonly input: LearningIntakeInput
  readonly inputDigest: Sha256Digest
  readonly receipt: Omit<LearningIntakeReceipt, 'duplicate'>
  readonly supersedesFeedbackVersion?: string
  readonly analysisConsentRevision?: number
  readonly signal?: LearningSignal
}

export interface LearningFeedbackRetractedEvent {
  readonly schemaVersion: 'tianwen.learning-feedback-retracted.v1'
  readonly type: 'learning-feedback-retracted'
  readonly at: string
  readonly sessionId: string
  readonly messageId: string
  readonly retractedFeedbackVersion: string
}
```

- [ ] Add one formal write for a full current snapshot and one for retraction.

```ts
recordLearningFeedbackRevision(input: {
  readonly intake: LearningIntakeInput
  readonly supersedesFeedbackVersion?: string
  readonly analysisConsentRevision?: number
}): LearningIntakeReceipt

recordLearningFeedbackRetraction(input: {
  readonly sessionId: string
  readonly messageId: string
  readonly retractedFeedbackVersion: string
}): { readonly duplicate: boolean }
```

- [ ] Project each message as `active` or `retracted`. Old revisions remain addressable in audit events but cannot be returned as the current opinion.

- [ ] Preserve Ticket history while exposing whether each explicit-correction Signal is currently active. A Ticket with other active Signals remains supported; a Ticket with none becomes unsupported without deleting it.

- [ ] Add profile-scoped consent facts to the same ledger.

```ts
export interface LearningAnalysisConsent {
  readonly revision: number
  readonly enabled: boolean
  readonly policyVersion: 'tianwen-auto-analysis.v1'
  readonly recordedAt: string
}
```

- [ ] Enforce revision increments by one, idempotent exact replay, and no note text in consent/status receipts.

- [ ] Run tests.

```powershell
pnpm vitest run tests/dsh-probe/learning-intake.spec.ts
```

- [ ] Commit.

```powershell
git add packages/tianwen-evolution/src/learning-intake.ts packages/tianwen-evolution/src/ledger.ts packages/tianwen-evolution/src/runtime-binding.ts packages/tianwen-evolution/src/index.ts tests/dsh-probe/learning-intake.spec.ts
git commit -m "feat: govern feedback revisions and consent"
```

### Task 3: Accept any DSH-valid feedback target in Runtime Learning Intake

**Files:**
- Modify: `packages/tianwen-runtime/src/learning-intake.ts`
- Modify: `tests/dsh-probe/learning-intake-runtime.spec.ts`
- Modify: `scripts/run-explicit-correction-demo.ts`
- Modify: `tests/dsh-probe/explicit-correction-demo.spec.ts`

- [ ] Add a Runtime test that completes two assistant Turns, then consumes feedback for the first finalized assistant message after the second Turn exists.

- [ ] Replace `finalAssistant()` equality with an exact target lookup.

```ts
function feedbackTarget(session: Session, messageId: string) {
  return session.events.find(event =>
    event.type === 'assistant/message'
    && event.surfaceOp === 'append'
    && String(event.data.message.id) === messageId
    && event.data.message.content.length > 0)
}

if (feedbackTarget(session, String(feedback.messageId)) === undefined) {
  throw new Error('feedback messageId must identify a finalized append-origin assistant message')
}
```

- [ ] Route DSH snapshot revisions through `recordLearningFeedbackRevision()`, passing the predecessor and consent revision supplied by the bridge.

- [ ] Keep `sessionDigest` and Evidence projection non-mutating. Assert the Session event digest is unchanged before and after intake.

- [ ] Update the explicit-correction demo so its receipt is message-keyed; it may still call the Runtime service directly as a mechanism test.

- [ ] Run tests.

```powershell
pnpm vitest run tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts
```

- [ ] Commit.

```powershell
git add packages/tianwen-runtime/src/learning-intake.ts tests/dsh-probe/learning-intake-runtime.spec.ts scripts/run-explicit-correction-demo.ts tests/dsh-probe/explicit-correction-demo.spec.ts
git commit -m "fix: consume feedback for any finalized message"
```

### Task 4: Build the durable DSH Message Feedback bridge

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/message-feedback-bridge.ts`
- Create: `tests/dsh-migration/message-feedback-bridge.spec.ts`
- Modify: `packages/tianwen-runtime-bundle/src/runtime.ts`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `package.json`

- [ ] Add exact direct development and peer dependencies on `@deepseek-ai/dsh-message-feedback@0.1.1-rc.2`; do not import its private storage implementation.

- [ ] Write bridge tests for a `domain/changed` put, changed version, removed item, duplicate event, Evolution write failure followed by reconciliation, host restart, and two messages in one Session.

- [ ] Implement one serialized lane per Session. Filter only the public domain identity and table.

```ts
const offChanged = ctx.on('domain/changed', change => {
  if (change.domain !== 'message_feedback' || change.table !== 'sessions') return
  void enqueueReconciliation(String(change.key))
})
```

- [ ] Reconciliation must call `messageFeedback.list({ sessionId })`, inspect the persisted Session, compare all DSH current items against Evolution message statuses, then:
  - ingest unseen revisions;
  - ingest a new revision with `supersedesFeedbackVersion` equal to the prior active version;
  - retract an active Evolution item absent from the DSH current row;
  - no-op on exact replay.

- [ ] Resolve scope in this order: bound Run/Task scope for the message's Session, otherwise a stable workspace scope derived from normalized `Session.header.cwd`, otherwise a profile scope. Store only the scope key; do not expose the raw path in public status.

- [ ] Capture `analysisConsentRevision` only when consent is enabled before the new DSH revision is observed. A later consent change must not mutate old intake events.

- [ ] Reconcile at Runtime startup over `sessionPersistence.list()` with maximum concurrency 8, on `agent/created` for that Session, and through an explicit read-only `reconcileSession(sessionId)` method used by status queries.

- [ ] Do not retry in a tight loop. A failed lane stays pending until the next domain change, startup, agent creation, or status query.

- [ ] Mount the bridge only when `messageFeedback`, `sessionPersistence`, `tianwenLearningIntake`, and `tianwenEvolution` are all injected.

- [ ] Run tests and typecheck.

```powershell
pnpm vitest run tests/dsh-migration/message-feedback-bridge.spec.ts
pnpm --filter @tianwen/runtime-bundle typecheck
```

- [ ] Commit.

```powershell
git add packages/tianwen-runtime-bundle/src/message-feedback-bridge.ts tests/dsh-migration/message-feedback-bridge.spec.ts packages/tianwen-runtime-bundle/src/runtime.ts packages/tianwen-runtime-bundle/package.json package.json pnpm-lock.yaml
git commit -m "feat: bridge native feedback into learning intake"
```

### Task 5: Make consent a one-time main-chat interaction

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/learning-consent-agent.ts`
- Create: `tests/dsh-migration/learning-consent-agent.spec.ts`
- Modify: `packages/tianwen-runtime-bundle/src/runtime.ts`
- Modify: `packages/tianwen-runtime-bundle/src/message-feedback-bridge.ts`
- Modify: `tests/dsh-migration/message-feedback-bridge.spec.ts`

- [ ] Write tests proving the consent tool is installed only for root/main Sessions, accepts only `enable`, `disable`, and `status`, uses `exec.agent`, and never accepts a caller-supplied Session id.

- [ ] Add one main-Agent-scoped tool, not a new UI button.

```ts
defineTool({
  name: 'tianwen_learning_consent',
  description: 'Enable, disable, or inspect Tianwen automatic feedback analysis for this profile.',
  parameters: {
    action: { type: 'string', enum: ['enable', 'disable', 'status'], required: true },
  },
  output: {
    schema: { type: 'object' },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  },
  async execute(args, exec) {
    if (exec.agent === undefined || exec.agent.session.header.origin === 'subagent') {
      throw new Error('learning consent is available only in a main Session')
    }
    return updateOrReadConsent(args.action)
  },
})
```

- [ ] When the first negative feedback with a note arrives without consent, record the intake but deliver one tool-disabled main-chat notice containing exactly these facts:
  - native feedback normally does not enter the model;
  - enabling Tianwen sends the feedback note and referenced reply to the configured model for internal analysis;
  - analysis cannot edit the current project, install a Skill, or expand permission;
  - only evaluated changes may affect future Runs;
  - the user can disable automatic analysis later.

- [ ] The notice must not include the private note. Deduplicate it by consent policy version, including across restart.

- [ ] Enabling consent affects only later feedback revisions. Disabling blocks future analysis scheduling; already durable learning/audit facts remain.

- [ ] Run tests.

```powershell
pnpm vitest run tests/dsh-migration/learning-consent-agent.spec.ts tests/dsh-migration/message-feedback-bridge.spec.ts
```

- [ ] Commit.

```powershell
git add packages/tianwen-runtime-bundle/src/learning-consent-agent.ts tests/dsh-migration/learning-consent-agent.spec.ts packages/tianwen-runtime-bundle/src/runtime.ts packages/tianwen-runtime-bundle/src/message-feedback-bridge.ts tests/dsh-migration/message-feedback-bridge.spec.ts
git commit -m "feat: manage learning consent in the main chat"
```

### Task 6: Delete Tianwen's duplicate Goal Task feedback write path

**Files:**
- Delete: `packages/tianwen-runtime-bundle/src/goal-task-feedback.ts`
- Delete: `tests/dsh-migration/goal-task-feedback.spec.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-host.ts`
- Modify: `packages/tianwen-runtime-bundle/src/learn-loop-client.ts`
- Modify: `packages/tianwen-runtime-bundle/src/client.tsx`
- Modify: `tests/dsh-migration/learn-loop-client.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-client-module.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-host.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-web-product.spec.ts`

- [ ] Change product tests first so `feedback-status` and `record-task-feedback` RPCs are absent, Goal Task feedback buttons are absent, and native per-message feedback remains visible through DSH.

- [ ] Delete the custom current-value storage and its test.

- [ ] Remove the two write RPC handlers and all client calls to them. Do not leave a deprecated write alias.

- [ ] Keep any historical Learning Clue projection read-only until stage 3 replaces its analysis controls. It may read Evolution status, but it cannot accept feedback edits.

- [ ] Verify no duplicate source symbols remain.

```powershell
rg -n "feedback-status|record-task-feedback|GoalTaskFeedback|goal-task-feedback" packages tests scripts -g '*.ts' -g '*.tsx'
```

Expected: no product code or test invokes the removed write path.

- [ ] Run the product tests.

```powershell
pnpm vitest run tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/learn-loop-client-module.spec.ts tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/learn-loop-web-product.spec.ts
```

- [ ] Commit.

```powershell
git add packages/tianwen-runtime-bundle/src/goal-task-feedback.ts tests/dsh-migration/goal-task-feedback.spec.ts packages/tianwen-runtime-bundle/src/long-goal-host.ts packages/tianwen-runtime-bundle/src/learn-loop-client.ts packages/tianwen-runtime-bundle/src/client.tsx tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/learn-loop-client-module.spec.ts tests/dsh-migration/learn-loop-host.spec.ts tests/dsh-migration/learn-loop-web-product.spec.ts
git commit -m "refactor: remove duplicate task feedback controls"
```

### Task 7: Prove feedback update, retraction, recovery, and privacy in the real web profile

**Files:**
- Create: `tests/dsh-migration/native-feedback-profile.e2e.spec.ts`
- Modify: `tests/dsh-migration/runtime-composition.spec.ts`
- Modify: `tests/dsh-migration/runtime-governance.spec.ts`
- Modify: `tests/dsh-migration/runtime-session-evidence.spec.ts`

- [ ] Add a real-profile test for ordinary main-chat feedback with no Tianwen Goal binding.

- [ ] Add a two-message Session test, update the first message's note, delete it, restart Runtime, and prove exact active/retracted projections without duplicate Signals or Tickets.

- [ ] Inject one Evolution write failure after DSH persistence, restart, and prove reconciliation completes the intake while DSH feedback stays unchanged.

- [ ] Prove no model request contains the note before consent, and that enabling consent does not analyze the already-recorded historical revision.

- [ ] Run rollout-stage gate 2.

```powershell
pnpm vitest run tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-migration/message-feedback-bridge.spec.ts tests/dsh-migration/learning-consent-agent.spec.ts tests/dsh-migration/native-feedback-profile.e2e.spec.ts tests/dsh-migration/runtime-composition.spec.ts tests/dsh-migration/runtime-governance.spec.ts tests/dsh-migration/runtime-session-evidence.spec.ts
pnpm run typecheck
```

- [ ] Commit.

```powershell
git add tests/dsh-migration/native-feedback-profile.e2e.spec.ts tests/dsh-migration/runtime-composition.spec.ts tests/dsh-migration/runtime-governance.spec.ts tests/dsh-migration/runtime-session-evidence.spec.ts
git commit -m "test: prove native feedback learning intake"
```

## Stage 2 Completion Gate

- [ ] DSH Message Feedback is the only editable feedback current-value source.
- [ ] Exact message-level status and Session enumeration survive ledger reload.
- [ ] Supersession and retraction preserve history and recompute active support.
- [ ] Bridge failure never rolls back DSH feedback; restart reconciliation is idempotent.
- [ ] No feedback note reaches a model without prior consent for that exact revision.
- [ ] The duplicate Goal Task feedback storage, RPCs, and buttons are deleted.
- [ ] All stage 2 tests and `pnpm run typecheck` pass before stage 3 begins.
