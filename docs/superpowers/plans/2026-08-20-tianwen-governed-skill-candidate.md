# Tianwen Governed Skill Candidate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn one provenance-complete Stage 2 Outcome Ticket into a background Case, evidence-bound Attribution, accepted scoped Lesson, and at most one inert immutable DSH Skill Candidate without registering, evaluating, or activating it.

**Architecture:** DSH `0.1.0-rc.7` remains the only product Agent Runtime. Tianwen extends its existing Run-binding and single evolution ledger with a frozen parent-Skill manifest, a post-Run proof that the normal DSH `skill` tool actually loaded that parent, and four private governance records. The Candidate reuses a restricted public DSH `SkillRegistration` payload but never enters DSH registration, Dynamic Cordis, Artifact, Champion, Evaluation, Shadow, or Promotion paths.

**Tech Stack:** TypeScript 6.0, Node.js 22, pnpm 11.20.0, Vitest 4.1.8, DeepSeek Harness `0.1.0-rc.7`, existing Tianwen DSH compatibility package, Evidence projector, Evolution JSONL ledger, and runtime learning-intake thin adapter.

## Global Constraints

- The canonical Stage 3 design is `docs/superpowers/specs/2026-08-20-tianwen-governed-skill-candidate-design.md`; read it completely before editing.
- Also read `docs/tianwen-architecture-overview-v2.md`, `docs/superpowers/specs/2026-08-19-tianwen-runtime-boundary-reset-design.md`, `docs/superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md`, `docs/superpowers/specs/2026-08-20-tianwen-explicit-feedback-learning-intake-design.md`, `docs/superpowers/specs/2026-08-20-tianwen-repeated-outcome-learning-intake-design.md`, and `docs/research/2026-08-19-dsh-upstream-capability-overlap-audit.md` completely. Historical Alpha and Dynamic Cordis plans are evidence only and cannot override these documents.
- DSH `0.1.0-rc.7` is the sole product Agent Runtime. Do not add or migrate an Agent loop, provider abstraction, Session store, Skill loader, catalog, registry, Goal runner, worker, scheduler, queue, database, generic repository/event-store, or Python product Runtime.
- Reuse only DSH public package roots. Add exact package-level dependencies for `@deepseek-ai/dsh-skill` and `@deepseek-ai/dsh-tool-skill` to `@tianwen/dsh-compat`; never import private `/src/` or `/lib/` paths.
- The only allowed runtime Skill registration is a deterministic test/demo **parent** fixture through DSH's public registry. Never call `ctx.skills.register()` with the Candidate and never write a Skill directory.
- Do not use DSH's provider-discovery `SkillCandidate` type. The Tianwen record uses the independent `candidate:<sha256>` identity and `GovernedSkillPayload` defined by the canonical design.
- Stage 3 supports only pure Markdown Skill bodies with no `resourceBase`, path, metadata, provider field in Candidate payload, sidecar scripts, assets, references, install manifest, or remote resource base. Do not add semantic keyword scanning of Markdown.
- A Run Skill manifest is frozen before the Session's first `turn/start`. It stores the complete restricted parent payload and resolved provider so the parent body can be reconstructed later.
- Availability is not use. `dsh-skill` Attribution requires a real successful DSH `skill` tool call/result in every Signal Run and selected met counter Run, byte-equal to DSH `renderSkillContent()` for the frozen parent and ordered before final acceptance. Catalog visibility, host-side `get()`, text mention, or model self-report is not sufficient.
- Existing `consumeOutcome()` behavior stays independent. Missing or failed Skill-use proof cannot suppress or alter Stage 2 Outcome, Signal, or Ticket records.
- Case support Evidence comes only from its Outcome Signals. Counterevidence comes only from a real `met` Outcome with the same scope, acceptance contract, and full parent manifest. Never accept an arbitrary ledger-known digest.
- Attribution may be `unknown` or `outside-stage3`, both legal no-Lesson/no-Candidate results. `dsh-skill` requires a hypothesis, Case support Evidence, Case counterevidence, and complete Skill-use proof.
- Lesson requires non-empty `claim`, `when`, `notWhen`, support, counterevidence, exact Case scope, and a persisted `dsh-skill` Attribution. Candidate requires that accepted Lesson and a payload that preserves parent name/source/invocation.
- Candidate status is only `recorded`. Stage 3 must not implement or call Evaluation, Approval, Shadow, Promotion, Reject, Rollback, Active Pointer, Champion, Challenger, `recordArtifact()`, `recordEvaluation()`, `recordApproval()`, `promote()`, `rollback()`, or `rehydrateChampion()`.
- Do not modify `packages/tianwen-runtime-bundle/src/status.ts`; it is a legacy non-bearing surface. Do not modify `packages/tianwen-runtime` beyond the existing `learning-intake.ts` thin adapter and its root exports.
- Use the existing `ledger.jsonl`, append/fsync/replay/commit-unknown handling, and `formalWrite()`. Add no second ledger, database, migration framework, repository, event store, queue, worker, or scheduler.
- Public Evolution events use one explicit whitelist of exactly: `artifact-recorded`, `evaluation-recorded`, `approval-recorded`, `promoted`, `rolled-back`, `runtime-bound`, `activation-failed`, and `recovery-failed`. All Stage 1/2/3 internal events remain private in both public TypeScript and runtime `listEvents()`.
- Evolution records must not copy user messages, feedback notes, tool arguments, tool results, `<skill_content>`, error text, absolute paths, credentials, or Provider data. Store only normalized governance text explicitly supplied by the test caller, stable IDs, digests, and DSH event sequence numbers.
- Reuse the existing D-drive implementation worktree `D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake`, its project-local `node_modules`, and `D:\DevData\pnpm-store`. Do not create a second implementation worktree, clone, `node_modules`, venv, DSH Profile, or disposable probe.
- For the small public Python contract only, reuse the already-retained interpreter `D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe`; it executes the current repository test by absolute path and does not import product code from that old checkout. If the interpreter is absent, stop and report instead of creating another venv or downloading packages.
- Do not reinstall dependencies during Workspace Setup when `node_modules/.modules.yaml` exists. Task 1 may run exactly one offline lockfile refresh and one frozen offline relink after adding already-cached direct dependency edges; both must report `downloaded 0`. If the store is missing a locked package, stop before network access.
- Build `@tianwen/runtime...` before full workspace typecheck. The known clean-build declaration order is not a product failure and must not be “fixed” by adding another Runtime.
- Every implementation Task uses TDD: focused RED, minimal GREEN, focused regression, `git diff --check`, then one ordinary commit. Do not wash a RED with unrelated generated artifacts.
- Provider, paid model, network model call, Docker, Alpha, RepoTaskRuntime, AlphaRuntime, runtime-profile, public Release, application, tag, repository metadata, and visibility actions are all forbidden. Stage 3 target cost is `0 CNY`; the user's separate 60 CNY authorization is not needed here.
- Stop after Task 6 feature closure and ordinary feature-branch push. Task 7 main integration requires a separate supervisor release after exact-SHA review; do not merge main or trigger main CI early.

---

## File Map

- Modify `packages/tianwen-dsh-compat/package.json`: declare the two exact public DSH Skill seams already present in the lock/store.
- Modify `packages/tianwen-dsh-compat/src/index.ts`: thin public exports for `SkillRegistry`, `isSkillName`, `renderSkillContent`, `SkillDefinition`, `SkillInvocationPolicy`, `SkillRegistration`, and `applySkillTool`.
- Modify `pnpm-lock.yaml`: only the `@tianwen/dsh-compat` importer/direct dependency edges produced by offline pnpm.
- Create `packages/tianwen-evolution/src/skill-governance.ts`: pure canonical validation/preparation types for parent manifest, Skill-use reference, Case, Attribution, Lesson, and Candidate. It owns no I/O or runtime calls.
- Modify `packages/tianwen-evolution/src/ledger.ts`: add six private event variants, derived maps, strict replay, getters/lists, idempotent record methods, and the single public-event whitelist.
- Modify `packages/tianwen-evolution/src/index.ts`: explicitly export only the intended public governance inputs/records and strengthen the compile-time privacy contract.
- Modify `packages/tianwen-evolution/src/runtime-binding.ts`: expose formal-write methods/getters and consume the ledger's one public-event guard; do not touch Dynamic Cordis transition code.
- Modify `packages/tianwen-runtime/src/learning-intake.ts`: add pre-Turn `bindRunWithSkill()` and post-Run `recordSkillUse()` thin adapters while preserving `bindRun()`, `consumeOutcome()`, and `consume()` behavior.
- Modify `packages/tianwen-runtime/src/index.ts`: export only the new runtime receipt/input types.
- Create `tests/dsh-probe/skill-governance.spec.ts`: pure domain, ledger replay, tamper, idempotency, privacy, and old-path isolation contracts.
- Create `tests/dsh-probe/skill-governance-runtime.spec.ts`: real DSH registry/tool/Session producer-to-consumer contracts and Stage 2 noninterference.
- Create `scripts/run-governed-skill-candidate-demo.ts`: deterministic three-Run zero-cost proof.
- Create `tests/dsh-probe/governed-skill-candidate-demo.spec.ts`: demo output/privacy contract.
- Modify `package.json`: add only `demo:governed-skill-candidate`.
- Modify `.github/workflows/ci.yml`: append only the two Stage 3 focused tests and one demo command to the existing TypeScript job.
- Modify `README.md`, `README.zh-CN.md`, `docs/tianwen-architecture-overview-v2.md`: accurately mark Stage 3 as deterministic research proof and keep Evaluation/Shadow/Promotion unfinished.
- Modify `tests/contracts/test_public_repository_surface.py`: enforce bilingual public-boundary wording without creating a second fact source.

---

## Workspace Setup and Baseline Stop Gate

The supervisor supplies the exact commit containing both canonical Stage 3 design and this plan as `TIANWEN_PLAN_SHA`. Do not infer it from another worktree or fetch repeatedly.

- [ ] **Step 1: Verify the plan-bearing commit and file scope**

```powershell
git rev-parse $env:TIANWEN_PLAN_SHA
git show --stat --oneline $env:TIANWEN_PLAN_SHA
git show --name-status --format= $env:TIANWEN_PLAN_SHA
git show $env:TIANWEN_PLAN_SHA:docs/superpowers/specs/2026-08-20-tianwen-governed-skill-candidate-design.md | Select-Object -First 8
git show $env:TIANWEN_PLAN_SHA:docs/superpowers/plans/2026-08-20-tianwen-governed-skill-candidate.md | Select-Object -First 8
```

Expected: the commit exists and contains this exact design and plan. Do not use `git diff --exit-code SHA^ SHA` as an equality check; a plan-bearing commit is expected to differ from its parent.

- [ ] **Step 2: Reuse the single clean implementation worktree**

```powershell
$implementation = 'D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake'
git -C $implementation status --short
git -C $implementation branch --show-current
git -C $implementation rev-parse HEAD
git -C $implementation rev-parse refs/remotes/origin/codex/tianwen-repeated-outcome-learning-intake
git show-ref --verify --quiet refs/heads/codex/tianwen-governed-skill-candidate
if ($LASTEXITCODE -eq 0) {
  throw 'Stage 3 implementation branch already exists; stop rather than overwrite it'
}
git -C $implementation switch -c codex/tianwen-governed-skill-candidate $env:TIANWEN_PLAN_SHA
Set-Location $implementation
git status --short
git rev-parse HEAD
git branch --show-current
```

Expected before switch: tracked clean, old feature branch at `b7f46045dc40ded9e8e49bfe70c3e183fda4b59b`, and matching origin tracking. Expected after switch: same physical D-drive worktree, exact plan SHA, new branch `codex/tianwen-governed-skill-candidate`, existing ignored `node_modules` retained.

- [ ] **Step 3: Confirm dependencies are reused, not reinstalled**

```powershell
if (-not (Test-Path node_modules\.modules.yaml)) {
  throw 'existing project-local node_modules is missing; stop before dependency installation'
}
Get-Item node_modules\.modules.yaml | Select-Object FullName,Length,LastWriteTime
```

Expected: the existing D-drive `node_modules` is present. Workspace Setup performs no install and no download.

- [ ] **Step 4: Run the known clean-build baseline**

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-stage3-test-fixtures'
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/evolution.spec.ts tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/repeated-outcome-demo.spec.ts
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
git status --short
```

Expected: build/typecheck/closure/private-import all pass; 9 bearing test files and all three existing demos pass; DSH closure is exact rc.7; tracked status remains clean. `evolution.spec.ts` is the direct regression for the frozen Dynamic Cordis/Artifact/Promotion path. Any unrelated baseline failure is a stop condition. Do not rerun until green by accident or modify product code before reporting it.

---

### Task 1: Public DSH Skill Seam and Fail-Private Event Whitelist

**Files:**
- Modify: `packages/tianwen-dsh-compat/package.json`
- Modify: `packages/tianwen-dsh-compat/src/index.ts`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/tianwen-evolution/src/ledger.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Modify: `packages/tianwen-evolution/src/runtime-binding.ts`
- Modify: `tests/dsh-probe/learning-intake-runtime.spec.ts`

**Interfaces:**
- Consumes: exact public packages `@deepseek-ai/dsh-skill@0.1.0-rc.7`, `@deepseek-ai/dsh-tool-skill@0.1.0-rc.7`, and current `LedgerEvent` union.
- Produces: `SkillRegistry`, `isSkillName`, `renderSkillContent`, `applySkillTool`, Skill public types, `PUBLIC_LEDGER_EVENT_TYPES`, `PublicLedgerEventType`, `PublicLedgerEvent`, and `isPublicLedgerEvent()`.

- [ ] **Step 1: Write the failing whitelist/privacy contract**

In `tests/dsh-probe/learning-intake-runtime.spec.ts`, replace the current single blacklist-shaped type assertion with an exact public-type assertion and preserve the runtime assertion:

```ts
type PublicType = LedgerEvent['type']
const publicTypes: readonly PublicType[] = [
  'artifact-recorded',
  'evaluation-recorded',
  'approval-recorded',
  'promoted',
  'rolled-back',
  'runtime-bound',
  'activation-failed',
  'recovery-failed',
]

expect(publicTypes).toHaveLength(8)
expect(JSON.stringify(ctx.tianwenEvolution.listEvents()))
  .not.toMatch(/learning-intake-recorded|run-binding-recorded|outcome-intake-recorded/u)
```

Add imports from `@tianwen/dsh-compat` and compile/runtime assertions proving the new public seam exists:

```ts
import {
  SkillRegistry,
  applySkillTool,
  isSkillName,
  renderSkillContent,
  type SkillDefinition,
  type SkillInvocationPolicy,
  type SkillRegistration,
} from '@tianwen/dsh-compat'

expect(isSkillName('research-summary')).toBe(true)
expect(typeof renderSkillContent).toBe('function')
expect(typeof applySkillTool).toBe('function')
expect(typeof SkillRegistry).toBe('function')
const typeWitness: [SkillDefinition?, SkillInvocationPolicy?, SkillRegistration?] = []
expect(typeWitness).toEqual([])
```

- [ ] **Step 2: Run RED**

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-stage3-test-fixtures'
pnpm exec vitest run tests/dsh-probe/learning-intake-runtime.spec.ts
```

Expected: FAIL at compile/import because the new DSH Skill seam and whitelist exports do not exist.

- [ ] **Step 3: Add exact public DSH package edges and thin exports**

In `packages/tianwen-dsh-compat/package.json`, add only:

```json
"@deepseek-ai/dsh-skill": "0.1.0-rc.7",
"@deepseek-ai/dsh-tool-skill": "0.1.0-rc.7"
```

Keep dependency keys sorted with the existing manifest. In `packages/tianwen-dsh-compat/src/index.ts`, add:

```ts
export { default as SkillRegistry } from '@deepseek-ai/dsh-skill'
export {
  isSkillName,
  renderSkillContent,
} from '@deepseek-ai/dsh-skill'
export type {
  SkillDefinition,
  SkillInvocationPolicy,
  SkillRegistration,
} from '@deepseek-ai/dsh-skill'
export { apply as applySkillTool } from '@deepseek-ai/dsh-tool-skill'
```

Do not export DSH `SkillCandidate`, provider interfaces, private modules, filesystem providers, or install helpers.

- [ ] **Step 4: Refresh only lock importer/link edges offline**

```powershell
pnpm install --lockfile-only --offline --store-dir D:\DevData\pnpm-store
if ($LASTEXITCODE -ne 0) { throw 'offline lock refresh failed; do not use network' }
pnpm install --frozen-lockfile --offline --store-dir D:\DevData\pnpm-store
if ($LASTEXITCODE -ne 0) { throw 'offline relink failed; do not use network' }
git diff -- packages/tianwen-dsh-compat/package.json pnpm-lock.yaml
```

Expected: both pnpm operations report `downloaded 0`; lock changes are limited to the `@tianwen/dsh-compat` importer/direct edges and deterministic integrity reuse. No second `node_modules` is created.

- [ ] **Step 5: Replace the event blacklist with one authoritative whitelist**

In `packages/tianwen-evolution/src/ledger.ts`, after the complete internal `LedgerEvent` union, define:

```ts
export const PUBLIC_LEDGER_EVENT_TYPES = [
  'artifact-recorded',
  'evaluation-recorded',
  'approval-recorded',
  'promoted',
  'rolled-back',
  'runtime-bound',
  'activation-failed',
  'recovery-failed',
] as const satisfies readonly LedgerEvent['type'][]

export type PublicLedgerEventType =
  typeof PUBLIC_LEDGER_EVENT_TYPES[number]

export type PublicLedgerEvent = Extract<
  LedgerEvent,
  { readonly type: PublicLedgerEventType }
>

export function isPublicLedgerEvent(
  event: LedgerEvent,
): event is PublicLedgerEvent {
  return (PUBLIC_LEDGER_EVENT_TYPES as readonly string[])
    .includes(event.type)
}
```

In `packages/tianwen-evolution/src/runtime-binding.ts`, import this guard and delete the local deny-list guard. Keep `listEvents()` as the existing ledger list followed by `.filter(isPublicLedgerEvent)`. In `index.ts`, export the public tuple/type only if needed by the test; do not export internal event shapes.

- [ ] **Step 6: Run GREEN and regressions**

```powershell
pnpm --filter @tianwen/dsh-compat build
pnpm --filter @tianwen/evolution build
pnpm exec vitest run tests/dsh-probe/evolution.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: tests pass; closure remains rc.7; no private imports; whitelist exposes exactly the eight historical audit event discriminators.

- [ ] **Step 7: Commit Task 1**

```powershell
git add packages/tianwen-dsh-compat/package.json packages/tianwen-dsh-compat/src/index.ts pnpm-lock.yaml packages/tianwen-evolution/src/ledger.ts packages/tianwen-evolution/src/index.ts packages/tianwen-evolution/src/runtime-binding.ts tests/dsh-probe/learning-intake-runtime.spec.ts
git diff --cached --check
git commit -m "refactor: make evolution events fail private"
```

Expected: one ordinary commit, only the listed files.

---

### Task 2: Frozen Parent Skill Manifest and Real DSH Skill-Use Record

**Files:**
- Create: `packages/tianwen-evolution/src/skill-governance.ts`
- Modify: `packages/tianwen-evolution/src/ledger.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Modify: `packages/tianwen-evolution/src/runtime-binding.ts`
- Create: `tests/dsh-probe/skill-governance.spec.ts`

**Interfaces:**
- Consumes: `TianwenRunId`, `TianwenRunBinding`, `OutcomeIntakeRecordedEvent`, canonical `sha256()`, DSH `SkillDefinition`, and `Sha256Digest`.
- Produces: `SkillVersionId`, `GovernedSkillPayload`, `RunSkillManifest`, `RunSkillManifestInput`, `RunSkillUse`, `RunSkillUseInput`, receipts, pure prepare functions, ledger/service record/get/list methods, and two private events.

- [ ] **Step 1: Write RED for manifest/use identities and replay**

Create `tests/dsh-probe/skill-governance.spec.ts` using the same `D:\DevData\tianwen-stage3-test-fixtures` mkdtemp/afterEach cleanup pattern as `outcome-intake.spec.ts`. Add these fixtures and tests:

```ts
const parent = {
  name: 'research-summary',
  description: 'Summarize one research observation',
  whenToUse: 'When a task asks for a concise research summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Research summary\n\nState the observed result before interpretation.',
} as const

it('freezes the complete pure-text parent and rejects sidecars', () => {
  const runId = bindReusableRun(ledger, 'session:manifest-1').runId
  const first = ledger.recordRunSkillManifest({ runId, skill: parent })
  expect(first).toMatchObject({ duplicate: false })
  expect(first.parentVersionId).toMatch(/^skill-version:[a-f0-9]{64}$/u)
  expect(ledger.getRunSkillManifest(runId)?.parent).toEqual({
    name: parent.name,
    description: parent.description,
    whenToUse: parent.whenToUse,
    invocation: parent.invocation,
    source: parent.source,
    content: parent.content,
  })
  expect(ledger.recordRunSkillManifest({ runId, skill: structuredClone(parent) }))
    .toMatchObject({ duplicate: true })
  expect(() => ledger.recordRunSkillManifest({
    runId,
    skill: { ...parent, resourceBase: { kind: 'url', url: 'https://invalid.test' } },
  })).toThrow()
})

it('records one post-Outcome use reference and rejects changed replay', () => {
  const seeded = seedMetOutcomeWithManifest(ledger, 'session:use-1', parent)
  const input = {
    runId: seeded.runId,
    parentVersionId: seeded.parentVersionId,
    sessionId: seeded.sessionId,
    sessionDigest: seeded.sessionDigest,
    skillName: parent.name,
    contentDigest: seeded.contentDigest,
    skillEvidenceId: digest('skill-load'),
    acceptanceEvidenceId: seeded.acceptanceEvidenceId,
    skillCallSeq: 10,
    skillResultSeq: 11,
    acceptanceCallSeq: 12,
  } as const
  expect(ledger.recordRunSkillUse(input)).toMatchObject({ duplicate: false })
  expect(ledger.recordRunSkillUse(structuredClone(input)))
    .toMatchObject({ duplicate: true })
  expect(() => ledger.recordRunSkillUse({ ...input, skillCallSeq: 9 }))
    .toThrow(LedgerIntegrityError)
})
```

The local helpers must create real ledger Run binding and Outcome intake records rather than casting private state. Add separate tests for unknown Run, no Outcome, wrong Session/digest, use after acceptance, wrong parent version/content digest, and restart replay.

- [ ] **Step 2: Run RED**

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-stage3-test-fixtures'
pnpm exec vitest run tests/dsh-probe/skill-governance.spec.ts
```

Expected: FAIL because the Stage 3 domain and ledger APIs do not exist.

- [ ] **Step 3: Define strict pure domain preparation**

Create `packages/tianwen-evolution/src/skill-governance.ts`. Use existing exported `canonicalJson`/`sha256` rather than a second hash implementation. Define these exact public shapes:

```ts
export type SkillVersionId = `skill-version:${string}`
export type LearningCaseId = `case:${string}`
export type AttributionId = `attribution:${string}`
export type LessonId = `lesson:${string}`
export type GovernedSkillCandidateId = `candidate:${string}`

export type GovernedSkillPayload = Pick<
  SkillRegistration,
  'name' | 'description' | 'whenToUse' | 'source' | 'content'
> & { readonly invocation: SkillInvocationPolicy }

export interface RunSkillManifestInput {
  readonly runId: TianwenRunId
  readonly skill: SkillDefinition
}

export interface RunSkillManifestReceipt {
  readonly parentVersionId: SkillVersionId
  readonly duplicate: boolean
}

export interface RunSkillManifest {
  readonly schemaVersion: 'tianwen.run-skill-manifest.v1'
  readonly runId: TianwenRunId
  readonly parentVersionId: SkillVersionId
  readonly contentDigest: Sha256Digest
  readonly resolvedProvider: string
  readonly parent: GovernedSkillPayload
}

export interface RunSkillUse {
  readonly schemaVersion: 'tianwen.run-skill-use.v1'
  readonly runId: TianwenRunId
  readonly parentVersionId: SkillVersionId
  readonly sessionId: string
  readonly sessionDigest: Sha256Digest
  readonly skillName: string
  readonly contentDigest: Sha256Digest
  readonly skillEvidenceId: Sha256Digest
  readonly acceptanceEvidenceId: Sha256Digest
  readonly skillCallSeq: number
  readonly skillResultSeq: number
  readonly acceptanceCallSeq: number
}

export type RunSkillUseInput = Omit<RunSkillUse, 'schemaVersion'>

export interface RunSkillUseReceipt {
  readonly parentVersionId: SkillVersionId
  readonly duplicate: boolean
}
```

`prepareRunSkillManifest(runId, skill)` must require exact strings/booleans, DSH `isSkillName()`, no `path`, `resourceBase`, or `metadata`, nonblank provider, and canonicalize the restricted payload without mutating input. Derive:

```ts
const contentDigest = sha256(parent.content)
const parentVersionId = `skill-version:${sha256({
  parent,
  resolvedProvider,
}).slice('sha256:'.length)}` as SkillVersionId
```

`prepareRunSkillUse(input, manifest, binding, outcome)` must require exact keys, positive integer sequences, `skillCallSeq < skillResultSeq < acceptanceCallSeq`, matching Run/session/sessionDigest/parent/name/content, and `acceptanceEvidenceId` in the stored Outcome input Evidence list. It must not accept raw Session content.

- [ ] **Step 4: Add two private events and ledger replay/state**

Add internal event interfaces in `skill-governance.ts`:

```ts
export interface RunSkillManifestRecordedEvent {
  readonly schemaVersion: 'tianwen.run-skill-manifest.v1'
  readonly type: 'run-skill-manifest-recorded'
  readonly at: string
  readonly manifest: RunSkillManifest
  readonly inputDigest: Sha256Digest
}

export interface RunSkillUseRecordedEvent {
  readonly schemaVersion: 'tianwen.run-skill-use.v1'
  readonly type: 'run-skill-use-recorded'
  readonly at: string
  readonly use: RunSkillUse
  readonly inputDigest: Sha256Digest
}
```

Include them in the private `LedgerEvent` union but not the public tuple. In `EvolutionLedger`, add maps by `runId`, strict event validators/replay handlers, defensive-copy getters/lists, and:

```ts
recordRunSkillManifest(input: RunSkillManifestInput): RunSkillManifestReceipt
recordRunSkillUse(input: RunSkillUseInput): RunSkillUseReceipt
getRunSkillManifest(runId: TianwenRunId): RunSkillManifest | undefined
getRunSkillUse(runId: TianwenRunId): RunSkillUse | undefined
listRunSkillManifests(): readonly RunSkillManifest[]
listRunSkillUses(): readonly RunSkillUse[]
```

Manifest requires an existing Run binding. Use requires manifest plus a persisted Outcome for the same Run. Follow existing ledger append/idempotency/commit-unknown patterns exactly; do not introduce a generic repository.

- [ ] **Step 5: Add formal-write service methods and narrow exports**

In `runtime-binding.ts`, add `record/get/list` methods that call the ledger through `formalWrite()` for writes. In `index.ts`, explicitly export the public inputs/records/receipts/IDs and pure prepare functions, but not the two recorded-event interfaces. Extend the `Extract<LedgerEvent, ...>` privacy contract with both new discriminator strings; it must compile only because public `LedgerEvent` excludes them.

- [ ] **Step 6: Run GREEN, mutation privacy proof, and replay regressions**

```powershell
pnpm --filter @tianwen/evolution build
pnpm exec vitest run tests/dsh-probe/skill-governance.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts
git diff --check
```

Then temporarily add `run-skill-manifest-recorded` to `PUBLIC_LEDGER_EVENT_TYPES`, run `pnpm --filter @tianwen/evolution build`, and confirm the public privacy assertion fails. Revert only that temporary mutation and rerun build GREEN. Do not commit the mutation.

- [ ] **Step 7: Commit Task 2**

```powershell
git add packages/tianwen-evolution/src/skill-governance.ts packages/tianwen-evolution/src/ledger.ts packages/tianwen-evolution/src/index.ts packages/tianwen-evolution/src/runtime-binding.ts tests/dsh-probe/skill-governance.spec.ts
git diff --cached --check
git commit -m "feat: freeze governed Run Skill evidence"
```

---

### Task 3: Evidence-Bound Learning Case and Attribution

**Files:**
- Modify: `packages/tianwen-evolution/src/skill-governance.ts`
- Modify: `packages/tianwen-evolution/src/ledger.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Modify: `packages/tianwen-evolution/src/runtime-binding.ts`
- Modify: `tests/dsh-probe/skill-governance.spec.ts`

**Interfaces:**
- Consumes: open Stage 2 `LearningTicket`, `OutcomeLearningSignal`, Run bindings, manifests, uses, and stored met Outcomes.
- Produces: `LearningCase`, `CaseEvidenceRelation`, `AttributionRecord`, discriminated inputs/receipts, pure preparers, ledger/service record/get/list methods, and two private events.

- [ ] **Step 1: Add failing Case relationship tests**

Extend `skill-governance.spec.ts` with a helper that seeds two distinct not-met Runs under one manifest to create one open Ticket, plus one same-contract met Run. Test:

```ts
it('derives one Case from Ticket facts and a related met Run', () => {
  const seeded = seedGovernedTicketAndCounterexample(ledger)
  const receipt = ledger.openLearningCase({
    ticketId: seeded.ticketId,
    counterevidenceRunIds: [seeded.metRunId],
  })
  expect(receipt).toMatchObject({ duplicate: false })
  const value = ledger.getLearningCase(receipt.caseId)!
  expect(value.ticketId).toBe(seeded.ticketId)
  expect(value.signalIds).toEqual(seeded.signalIds)
  expect(value.runIds).toEqual(seeded.notMetRunIds)
  expect(value.supportingEvidenceIds).toEqual(seeded.notMetEvidenceIds)
  expect(value.counterevidence).toEqual([{
    runId: seeded.metRunId,
    evidenceIds: [seeded.metEvidenceId],
    skillUse: seeded.metSkillUse,
  }])
  expect(value.parentVersionId).toBe(seeded.parentVersionId)
  expect(value.learningMode).toBe('experience-consolidation')
  expect(value.schedule).toBe('background')
  expect(value.experimentLimit).toBe(0)
  expect(value.candidateLimit).toBe(1)
})
```

Add table tests that reject: Stage 1 feedback-only Ticket, non-open/missing Ticket, Signal Run without manifest, mismatched parent manifests, counter Run that is not `met`, missing counter Evidence, different scope, different acceptance digest, different parent, duplicate/changed Case replay, and tampered replay event. A Case with matching manifests but missing use records must still open and carry absent `skillUse` fields.

- [ ] **Step 2: Add failing Attribution gate tests**

Add:

```ts
it('allows unknown without use proof but gates dsh-skill attribution', () => {
  const incomplete = seedCaseWithoutSkillUse(ledger)
  expect(ledger.recordAttribution({
    caseId: incomplete.caseId,
    resolution: 'unknown',
    reason: 'The frozen evidence does not distinguish Skill from tool behavior.',
  })).toMatchObject({ duplicate: false, decision: 'no-lesson' })

  const complete = seedGovernedCase(ledger)
  expect(() => ledger.recordAttribution({
    caseId: incomplete.caseId,
    resolution: 'dsh-skill',
    targetSkillName: 'research-summary',
    hypothesis: 'The parent instruction omits the required result-first ordering.',
    supportingEvidenceIds: incomplete.supportingEvidenceIds,
    counterevidenceIds: incomplete.counterevidenceIds,
    alternatives: 'Tool and Runtime causes remain unsupported by these fixtures.',
  })).toThrow(LedgerIntegrityError)

  const recorded = ledger.recordAttribution({
    caseId: complete.caseId,
    resolution: 'dsh-skill',
    targetSkillName: 'research-summary',
    hypothesis: 'The parent instruction omits the required result-first ordering.',
    supportingEvidenceIds: complete.supportingEvidenceIds,
    counterevidenceIds: complete.counterevidenceIds,
    alternatives: 'Tool and Runtime causes remain unsupported by these fixtures.',
  })
  expect(recorded).toMatchObject({ duplicate: false, decision: 'resolved' })
})
```

Also test `outside-stage3` requires a nonblank recommendation and returns `no-lesson`; dsh-skill rejects unknown/unrelated global Evidence, wrong Skill name, missing any Signal Run use, missing met Run use, empty hypothesis/alternatives, changed replay, and altered Case relation.

- [ ] **Step 3: Run RED**

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-stage3-test-fixtures'
pnpm exec vitest run tests/dsh-probe/skill-governance.spec.ts
```

Expected: FAIL on missing Case/Attribution APIs.

- [ ] **Step 4: Define exact Case and evidence relations**

In `skill-governance.ts`, define:

```ts
export interface CaseEvidenceRelation {
  readonly runId: TianwenRunId
  readonly evidenceIds: readonly Sha256Digest[]
  readonly skillUse?: RunSkillUse
}

export interface LearningCase {
  readonly caseId: LearningCaseId
  readonly ticketId: LearningTicketId
  readonly problemFingerprint: Sha256Digest
  readonly problemCategory: string
  readonly scopeKey: string
  readonly signalIds: readonly LearningSignalId[]
  readonly runIds: readonly TianwenRunId[]
  readonly supportingEvidenceIds: readonly Sha256Digest[]
  readonly supporting: readonly CaseEvidenceRelation[]
  readonly counterevidence: readonly CaseEvidenceRelation[]
  readonly acceptanceContractDigest: Sha256Digest
  readonly parentVersionId: SkillVersionId
  readonly parentSkillName: string
  readonly learningMode: 'experience-consolidation'
  readonly schedule: 'background'
  readonly experimentLimit: 0
  readonly candidateLimit: 1
  readonly stopConditions: readonly [
    'sufficient', 'insufficient-evidence', 'risk-boundary'
  ]
}

export interface OpenLearningCaseInput {
  readonly ticketId: LearningTicketId
  readonly counterevidenceRunIds: readonly TianwenRunId[]
}

export interface LearningCaseReceipt {
  readonly caseId: LearningCaseId
  readonly duplicate: boolean
}
```

`prepareLearningCase()` accepts only `{ ticketId, counterevidenceRunIds }` plus ledger-derived facts. Normalize/dedupe counter Run IDs, derive every other field, require distinct Signal Runs and equal scope/acceptance/full parent manifests, and validate each selected counter Run from a stored `met` Outcome. Case ID is the SHA-256 of the canonical derived record excluding the ID itself.

- [ ] **Step 5: Define discriminated Attribution records**

Use these exact resolutions:

```ts
export type AttributionRecord =
  | { readonly attributionId: AttributionId; readonly caseId: LearningCaseId;
      readonly resolution: 'unknown'; readonly reason: string }
  | { readonly attributionId: AttributionId; readonly caseId: LearningCaseId;
      readonly resolution: 'outside-stage3'; readonly recommendation: string }
  | { readonly attributionId: AttributionId; readonly caseId: LearningCaseId;
      readonly resolution: 'dsh-skill'; readonly targetSkillName: string;
      readonly hypothesis: string;
      readonly supportingEvidenceIds: readonly Sha256Digest[];
      readonly counterevidenceIds: readonly Sha256Digest[];
      readonly alternatives: string }

export type AttributionInput =
  | { readonly caseId: LearningCaseId; readonly resolution: 'unknown';
      readonly reason: string }
  | { readonly caseId: LearningCaseId;
      readonly resolution: 'outside-stage3'; readonly recommendation: string }
  | { readonly caseId: LearningCaseId; readonly resolution: 'dsh-skill';
      readonly targetSkillName: string; readonly hypothesis: string;
      readonly supportingEvidenceIds: readonly Sha256Digest[];
      readonly counterevidenceIds: readonly Sha256Digest[];
      readonly alternatives: string }

export interface AttributionReceipt {
  readonly attributionId: AttributionId
  readonly decision: 'resolved' | 'no-lesson'
  readonly duplicate: boolean
}
```

For `dsh-skill`, require every Case supporting and counter relation to contain a use matching the Case parent manifest; require submitted Evidence to be non-empty subsets of the respective Case relation sets and target name to equal parent name. Do not consult a global known-Evidence set.

- [ ] **Step 6: Persist/replay two private events**

Add `learning-case-opened` and `learning-attribution-recorded` to internal `LedgerEvent`, validators, derived maps, replay, public privacy type contract, and ledger/service APIs:

```ts
openLearningCase(input: OpenLearningCaseInput): LearningCaseReceipt
recordAttribution(input: AttributionInput): AttributionReceipt
getLearningCase(caseId: LearningCaseId): LearningCase | undefined
listLearningCases(): readonly LearningCase[]
getAttribution(attributionId: AttributionId): AttributionRecord | undefined
listAttributions(): readonly AttributionRecord[]
```

One Ticket may map to only one Case. One Case may map to only one Attribution. Identical replay returns duplicate; changed input or derived facts reject. Defensive copies must include nested arrays/records.

- [ ] **Step 7: Run GREEN and focused regressions**

```powershell
pnpm --filter @tianwen/evolution build
pnpm exec vitest run tests/dsh-probe/skill-governance.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/learning-intake.spec.ts
git diff --check
```

Expected: all pass; Stage 1/2 Ticket semantics unchanged; fixture root has no files after cleanup.

- [ ] **Step 8: Commit Task 3**

```powershell
git add packages/tianwen-evolution/src/skill-governance.ts packages/tianwen-evolution/src/ledger.ts packages/tianwen-evolution/src/index.ts packages/tianwen-evolution/src/runtime-binding.ts tests/dsh-probe/skill-governance.spec.ts
git diff --cached --check
git commit -m "feat: bind learning cases to governed evidence"
```

---

### Task 4: Accepted Lesson and Inert Immutable Candidate

**Files:**
- Modify: `packages/tianwen-evolution/src/skill-governance.ts`
- Modify: `packages/tianwen-evolution/src/ledger.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Modify: `packages/tianwen-evolution/src/runtime-binding.ts`
- Modify: `tests/dsh-probe/skill-governance.spec.ts`

**Interfaces:**
- Consumes: persisted `dsh-skill` Attribution and its Case parent/evidence relations.
- Produces: `AcceptedLesson`, `GovernedSkillCandidate`, inputs/receipts, pure validation/preparation, ledger/service record/get/list methods, and two private events.

- [ ] **Step 1: Write failing Lesson gates**

Add to `skill-governance.spec.ts`:

```ts
it('accepts a scoped Lesson only after dsh-skill attribution', () => {
  const chain = seedResolvedAttribution(ledger)
  const input = {
    caseId: chain.caseId,
    attributionId: chain.attributionId,
    claim: 'State the observed result before interpretation.',
    when: 'When summarizing a verified research observation.',
    notWhen: 'When the task requests raw extraction without interpretation.',
    supportingEvidenceIds: chain.supportingEvidenceIds,
    counterevidenceIds: chain.counterevidenceIds,
    targetScope: chain.scopeKey,
  } as const
  const receipt = ledger.recordAcceptedLesson(input)
  expect(receipt.lessonId).toMatch(/^lesson:[a-f0-9]{64}$/u)
  expect(ledger.getAcceptedLesson(receipt.lessonId)).toMatchObject({
    ...input,
    status: 'accepted',
  })
  expect(ledger.recordAcceptedLesson(structuredClone(input)))
    .toMatchObject({ duplicate: true })
})
```

Add table tests rejecting unknown/outside attribution, wrong Case/Attribution link, empty claim/when/notWhen, wrong scope, support/counter evidence outside Attribution, and changed replay.

- [ ] **Step 2: Write failing Candidate gates and old-path isolation**

Add:

```ts
it('records one inert Candidate without touching Artifact or Champion state', () => {
  const chain = seedAcceptedLesson(ledger)
  const beforeEvents = ledger.listEvents().map(event => event.type)
  const input = {
    lessonId: chain.lessonId,
    payload: {
      ...chain.parent,
      description: 'Summarize verified observations with result-first ordering.',
      content: '# Research summary\n\nState the observed result first, then interpret it.',
    },
    evidenceIds: [...chain.supportingEvidenceIds, ...chain.counterevidenceIds],
  } as const
  const receipt = ledger.recordSkillCandidate(input)
  expect(receipt.candidateId).toMatch(/^candidate:[a-f0-9]{64}$/u)
  expect(ledger.getSkillCandidate(receipt.candidateId)).toMatchObject({
    parentVersionId: chain.parentVersionId,
    status: 'recorded',
    payload: input.payload,
  })
  expect(ledger.getChampion()).toBeUndefined()
  expect(ledger.listEvents().filter(event =>
    ['artifact-recorded', 'evaluation-recorded', 'approval-recorded',
      'promoted', 'rolled-back', 'runtime-bound'].includes(event.type)))
    .toEqual(beforeEvents.filter(type =>
      ['artifact-recorded', 'evaluation-recorded', 'approval-recorded',
        'promoted', 'rolled-back', 'runtime-bound'].includes(type)))
})
```

Test Candidate rejection before Lesson, after unknown Attribution, with changed name/source/invocation, extra `path`/`resourceBase`/`metadata`/`provider`, empty description/content, missing Lesson Evidence, second changed Candidate, and changed replay. Test Markdown mentioning `https://example.test` or a shell command remains plain text and is not semantically scanned or executed.

- [ ] **Step 3: Run RED**

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-stage3-test-fixtures'
pnpm exec vitest run tests/dsh-probe/skill-governance.spec.ts
```

Expected: FAIL on missing Lesson/Candidate APIs.

- [ ] **Step 4: Define Lesson/Candidate records and deterministic IDs**

In `skill-governance.ts`, define:

```ts
export interface AcceptedLesson {
  readonly lessonId: LessonId
  readonly ticketId: LearningTicketId
  readonly caseId: LearningCaseId
  readonly attributionId: AttributionId
  readonly claim: string
  readonly when: string
  readonly notWhen: string
  readonly supportingEvidenceIds: readonly Sha256Digest[]
  readonly counterevidenceIds: readonly Sha256Digest[]
  readonly targetScope: string
  readonly status: 'accepted'
}

export type AcceptedLessonInput = Omit<
  AcceptedLesson,
  'lessonId' | 'ticketId' | 'status'
>

export interface AcceptedLessonReceipt {
  readonly lessonId: LessonId
  readonly duplicate: boolean
}

export interface GovernedSkillCandidate {
  readonly candidateId: GovernedSkillCandidateId
  readonly ticketId: LearningTicketId
  readonly caseId: LearningCaseId
  readonly attributionId: AttributionId
  readonly lessonId: LessonId
  readonly targetScope: string
  readonly parentVersionId: SkillVersionId
  readonly payloadDigest: Sha256Digest
  readonly payload: GovernedSkillPayload
  readonly evidenceIds: readonly Sha256Digest[]
  readonly status: 'recorded'
}

export interface SkillCandidateInput {
  readonly lessonId: LessonId
  readonly payload: GovernedSkillPayload
  readonly evidenceIds: readonly Sha256Digest[]
}

export interface SkillCandidateReceipt {
  readonly candidateId: GovernedSkillCandidateId
  readonly duplicate: boolean
}
```

Normalize governance text with the existing nonblank normalization; preserve Markdown body bytes except reject empty/whitespace-only content. Candidate payload uses exact keys only. Candidate ID hashes exactly Case ID, Lesson ID, parent version ID, and normalized payload digest. Evidence IDs are part of the immutable Candidate record but not its identity: when the same Case/Candidate ID already exists, compare the complete canonical payload and Evidence arrays; identical content is duplicate and any Evidence or payload change is a conflict. Do not add active/evaluated/approved flags; the demo reports those as external facts, not persisted Candidate state.

- [ ] **Step 5: Persist/replay final two private events**

Add `learning-lesson-recorded` and `learning-candidate-recorded` to internal event union, validators, maps, replay, privacy contract, and ledger/service APIs:

```ts
recordAcceptedLesson(input: AcceptedLessonInput): AcceptedLessonReceipt
recordSkillCandidate(input: SkillCandidateInput): SkillCandidateReceipt
getAcceptedLesson(lessonId: LessonId): AcceptedLesson | undefined
listAcceptedLessons(): readonly AcceptedLesson[]
getSkillCandidate(candidateId: GovernedSkillCandidateId): GovernedSkillCandidate | undefined
listSkillCandidates(): readonly GovernedSkillCandidate[]
```

One Attribution maps to at most one Lesson and one Case maps to at most one Candidate. Keep old Artifact/Evaluation/Approval/transition methods byte-for-byte unless imports or union exhaustiveness require mechanical edits.

- [ ] **Step 6: Run GREEN, full ledger restart, and privacy mutation**

```powershell
pnpm --filter @tianwen/evolution build
pnpm exec vitest run tests/dsh-probe/skill-governance.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/outcome-intake.spec.ts
git diff --check
```

Ensure one test closes/reopens the ledger and deep-compares all six Stage 3 record kinds. Temporarily whitelist `learning-candidate-recorded`; typecheck must fail. Revert the mutation and rerun GREEN.

- [ ] **Step 7: Commit Task 4**

```powershell
git add packages/tianwen-evolution/src/skill-governance.ts packages/tianwen-evolution/src/ledger.ts packages/tianwen-evolution/src/index.ts packages/tianwen-evolution/src/runtime-binding.ts tests/dsh-probe/skill-governance.spec.ts
git diff --cached --check
git commit -m "feat: record governed Skill candidates"
```

---

### Task 5: Real DSH Skill-Use Adapter and Zero-Cost Producer-to-Consumer Demo

**Files:**
- Modify: `packages/tianwen-runtime/src/learning-intake.ts`
- Modify: `packages/tianwen-runtime/src/index.ts`
- Create: `tests/dsh-probe/skill-governance-runtime.spec.ts`
- Create: `scripts/run-governed-skill-candidate-demo.ts`
- Create: `tests/dsh-probe/governed-skill-candidate-demo.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: public DSH Skill registry/tool, Agent/Session events, Tianwen Evidence projection, evolution manifest/use/governance methods, and existing scripted harness.
- Produces: `bindRunWithSkill(agent, input, skillName)`, `recordSkillUse(session, runId)`, runtime receipts, and one deterministic JSON demo.

- [ ] **Step 1: Write RED for pre-Turn DSH-resolved manifest binding**

Create `tests/dsh-probe/skill-governance-runtime.spec.ts`. Mount the normal harness, then DSH public services:

```ts
await harness.ctx.plugin(SkillRegistry)
await harness.ctx.plugin(applySkillTool)
await harness.ctx.plugin(DynamicCordisRunnerService, {})
await apply(harness.ctx, { evolutionRoot })
const disposeParent = harness.ctx.skills.register(parentRegistration)
```

Create a fresh Agent before any followup. Test:

```ts
const receipt = await harness.ctx.tianwenLearningIntake.bindRunWithSkill(
  handle.agent,
  runInput,
  parentRegistration.name,
)
expect(receipt.sessionUnchanged).toBe(true)
expect(receipt.parentVersionId).toMatch(/^skill-version:[a-f0-9]{64}$/u)
expect(harness.ctx.tianwenEvolution.getRunSkillManifest(receipt.runId)?.parent.name)
  .toBe(parentRegistration.name)
```

Add RED tests for unknown Skill, non-model-invocable Skill, resolved Skill with `resourceBase`, first Turn already started, and same Session rebind to changed Skill. Each rejected pre-Turn case must leave Session digest unchanged and must not create a manifest.

- [ ] **Step 2: Write RED for real Skill-use projection and deterministic final match**

Script one normal DSH Run with model responses in this order:

```ts
toolCallResponse('load-parent-1', 'skill', { name: parentRegistration.name }),
toolCallResponse('load-parent-2', 'skill', { name: parentRegistration.name }),
toolCallResponse('acceptance', 'verify_summary', { text: 'result first' }),
textResponse('synthetic summary complete'),
```

After `consumeOutcome()`, call:

```ts
const use = harness.ctx.tianwenLearningIntake.recordSkillUse(
  handle.agent.session,
  binding.runId,
)
expect(use).toMatchObject({
  decision: 'recorded',
  sessionUnchanged: true,
  skillCallSeq: expect.any(Number),
})
```

Assert it chose `load-parent-2`, the final successful matching load before acceptance. Add tests where only catalog is visible, the Skill tool name differs, result is error, rendered text is altered, Skill load occurs after acceptance, manifest differs, or Session differs; each returns `decision: 'no-use-proof'`, writes no use event, and does not affect the already-recorded Outcome/Signal/Ticket.

In the successful full-chain runtime test, spy on the already-mounted `dynamicCordisRunner.define`, `.run`, and `.stop` methods and assert all three call counts remain zero. This is the bearing proof that the new path never activates the historical Dynamic Cordis route; do not add call counters to production code.

- [ ] **Step 3: Run runtime RED**

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-stage3-test-fixtures'
pnpm exec vitest run tests/dsh-probe/skill-governance-runtime.spec.ts
```

Expected: FAIL on missing runtime APIs.

- [ ] **Step 4: Implement the two thin runtime methods**

In `packages/tianwen-runtime/src/learning-intake.ts`, add:

```ts
async bindRunWithSkill(
  agent: Agent,
  input: RuntimeRunBindingInput,
  skillName: string,
): Promise<RuntimeGovernedRunBindingReceipt>

recordSkillUse(
  session: Session,
  runId: TianwenRunId,
): RuntimeSkillUseReceipt
```

Define the receipts as discriminated public runtime results:

```ts
export interface RuntimeGovernedRunBindingReceipt
  extends RuntimeRunBindingReceipt {
  readonly parentVersionId: SkillVersionId
}

export type RuntimeSkillUseReceipt =
  | {
      readonly decision: 'no-use-proof'
      readonly sessionUnchanged: true
    }
  | {
      readonly decision: 'recorded'
      readonly parentVersionId: SkillVersionId
      readonly skillCallSeq: number
      readonly duplicate: boolean
      readonly sessionUnchanged: true
    }
```

`bindRunWithSkill()` must:

1. digest Session and reject any existing `turn/start`;
2. load through `this.ctx.skills.get(skillName, { cwd: agent.session.header.cwd, scope: agent })`;
3. require the resolved definition exists and `invocation.modelInvocable === true`;
4. call pure preparation first so sidecar/resource failures occur before writes;
5. record existing Run binding, then exact manifest; an exact retry may complete a prior partial write;
6. verify Session digest unchanged and return both IDs.

`recordSkillUse()` must leave existing `consumeOutcome()` unchanged. It finds the stored binding/manifest and stored final acceptance Evidence, scans Session events for successful `skill` call/results matching name and exact DSH-rendered text, restricts them to those before final acceptance, selects the greatest `skillCallSeq`, matches the Evidence projector's call/result sequence, and then records only the digest/ID reference. Return `no-use-proof` without a ledger write when no exact match exists. Do not parse `<skill_content>`; compare the single text block to `renderSkillContent({ name, provider, content })` byte-for-byte.

- [ ] **Step 5: Run runtime GREEN and Stage 2 noninterference regression**

```powershell
pnpm --filter @tianwen/runtime... build
pnpm exec vitest run tests/dsh-probe/skill-governance-runtime.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/repeated-outcome-demo.spec.ts
git diff --check
```

Expected: new runtime tests pass; all Stage 2 tests remain unchanged and pass.

- [ ] **Step 6: Build the deterministic three-Run demo**

Create `scripts/run-governed-skill-candidate-demo.ts` by following the cleanup/noninterference pattern in `run-repeated-outcome-demo.ts`, but move all setup that can throw inside `try/finally` so temporary roots and agent handles are always disposed.

The demo must:

1. mount one core harness, DSH Skill registry/tool, Dynamic Cordis service only for unchanged-inventory observation, and Tianwen runtime;
2. register one fixed pure-text parent Skill;
3. create three fresh Agents/Sessions and use `bindRunWithSkill()` before each first Turn;
4. make each scripted Agent call DSH `skill` then `verify_summary`; first two verifier calls throw the frozen reusable error, third returns success;
5. call existing `consumeOutcome()` and then `recordSkillUse()` after each completed Run;
6. open the Ticket Case with the third Run as counterevidence;
7. submit deterministic synthetic dsh-skill Attribution, Lesson, and one Candidate through the public Tianwen service;
8. replay duplicate Candidate input and restart the ledger to prove identity;
9. compare all Session digests and Dynamic Cordis inventory/Champion/Artifact counts before/after;
10. remove the temporary fixture root and dispose Agents/registrations in `finally`.

Print exactly one formatted JSON object with this stable public shape:

```ts
interface GovernedCandidateDemoResult {
  readonly schemaVersion: 'tianwen.governed-skill-candidate-demo.v1'
  readonly execution: {
    readonly runs: 3
    readonly sessions: 3
    readonly scriptedModelRequests: 9
    readonly toolCalls: 6
    readonly outcomes: readonly ['not-met', 'not-met', 'met']
  }
  readonly learning: {
    readonly signals: 2
    readonly tickets: 1
    readonly cases: 1
    readonly attributions: 1
    readonly lessons: 1
    readonly candidates: 1
    readonly skillManifests: 3
    readonly skillUses: 3
    readonly candidateStatus: 'recorded'
    readonly duplicateReplay: true
    readonly syntheticGovernanceContent: true
    readonly evaluated: false
    readonly shadowed: false
    readonly promoted: false
  }
  readonly isolation: {
    readonly sessionsUnchanged: true
    readonly dynamicCordisInventoryUnchanged: true
    readonly legacyArtifactEventsCreated: 0
    readonly artifactFilesCreated: 0
    readonly championChanged: false
  }
  readonly cost: {
    readonly network: 0
    readonly providerRequests: 0
    readonly paidTokens: 0
    readonly cny: 0
    readonly docker: 0
    readonly userData: 0
  }
}
```

If the scripted adapter reports a different exact request count because DSH performs a documented internal step, update both implementation and test to the freshly observed deterministic count and explain it in the Task report; do not hide Provider calls or add retries.

- [ ] **Step 7: Add demo contract and root script**

Add `"demo:governed-skill-candidate": "tsx scripts/run-governed-skill-candidate-demo.ts"` to root scripts. Create `governed-skill-candidate-demo.spec.ts` that runs the exported demo function directly and asserts the complete object above, plus:

```ts
const serialized = JSON.stringify(result)
expect(serialized).not.toMatch(/<skill_content>|State the observed|https?:\/\/|[A-Z]:\\/u)
expect(result.learning).toMatchObject({
  evaluated: false,
  shadowed: false,
  promoted: false,
})
```

- [ ] **Step 8: Run Task 5 GREEN and commit**

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-stage3-test-fixtures'
pnpm --filter @tianwen/runtime... build
pnpm exec vitest run tests/dsh-probe/skill-governance-runtime.spec.ts tests/dsh-probe/governed-skill-candidate-demo.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts
pnpm demo:governed-skill-candidate
git diff --check
git add packages/tianwen-runtime/src/learning-intake.ts packages/tianwen-runtime/src/index.ts tests/dsh-probe/skill-governance-runtime.spec.ts scripts/run-governed-skill-candidate-demo.ts tests/dsh-probe/governed-skill-candidate-demo.spec.ts package.json
git diff --cached --check
git commit -m "test: prove governed Skill candidate intake"
```

---

### Task 6: Accurate Public Surface, Minimal CI, Independent Review, and Feature Closure

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/tianwen-architecture-overview-v2.md`
- Modify: `tests/contracts/test_public_repository_surface.py`
- Modify: `.github/workflows/ci.yml`
- Review/fix only: files changed by Tasks 1–5 when an actual Critical/Important issue is found

**Interfaces:**
- Consumes: completed Stage 3 records/demo and all existing Stage 1/2 public facts.
- Produces: bilingual accurate research-preview claims, one minimal CI extension, independent correctness/architecture/privacy/Ponytail verdicts, clean feature branch, and ordinary push.

- [ ] **Step 1: Write public-surface RED**

Extend `tests/contracts/test_public_repository_surface.py` with bilingual assertions that both READMEs and the architecture overview say all of these facts:

```python
required_concepts = (
    "Case",
    "Attribution",
    "Lesson",
    "Candidate",
    "DSH",
)
for document in (readme_en, readme_zh):
    for concept in required_concepts:
        assert concept in document
    assert "Evaluation" in document
    assert "Shadow" in document
    assert "Promotion" in document
```

Add exact anti-overclaim assertions appropriate to each language: Candidate is only `recorded`/已记录; Attribution/Lesson/Candidate content is deterministic synthetic contract data; Candidate is not registered, evaluated, shadowed, promoted, or production autonomous learning; DSH rc.7 remains the sole Runtime. Keep the current personal-path and public-safety gates intact.

- [ ] **Step 2: Run RED**

```powershell
$python='D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw 'retained D-drive Python test environment is missing' }
& $python -m pytest tests/contracts/test_public_repository_surface.py -q
```

Expected: FAIL only on missing Stage 3 public wording.

- [ ] **Step 3: Update bilingual docs from the canonical design/demo only**

In both READMEs, add one compact “Governed Skill Candidate proof / 受治理 Skill Candidate 证明” paragraph and demo command. In the architecture overview, update the current-state section so it distinguishes:

- real DSH execution, Skill tool use, Outcome Signals/Ticket, and frozen provenance;
- deterministic synthetic Attribution/Lesson/Candidate content;
- Candidate status only `recorded` and inert;
- Evaluation, Shadow, Promotion, production SLA/UI, and autonomous generation remain unfinished;
- Alpha/Dynamic Cordis paths remain frozen experiments, not product Runtime/Candidate paths.

Do not add a new documentation framework, generated fact database, compatibility table, or claim that every historical Ticket is eligible.

- [ ] **Step 4: Add only the Stage 3 CI commands**

In `.github/workflows/ci.yml`, append these three files to the existing focused Vitest command:

```text
tests/dsh-probe/skill-governance.spec.ts
tests/dsh-probe/skill-governance-runtime.spec.ts
tests/dsh-probe/governed-skill-candidate-demo.spec.ts
```

Then add exactly one step after the existing three demos:

```yaml
      - run: pnpm demo:governed-skill-candidate
```

Do not change triggers, permissions, runners, action pins, Python job, install/build/typecheck order, cache, matrix, artifacts, secrets, Docker, or coverage.

- [ ] **Step 5: Run focused GREEN and complete local bearing gates**

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-stage3-test-fixtures'
$python='D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe'
& $python -m pytest tests/contracts/test_public_repository_surface.py -q
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/evolution.spec.ts tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/repeated-outcome-demo.spec.ts tests/dsh-probe/skill-governance.spec.ts tests/dsh-probe/skill-governance-runtime.spec.ts tests/dsh-probe/governed-skill-candidate-demo.spec.ts
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
git diff --check
```

Expected: every command passes, 12 bearing Vitest files pass (the 9-file baseline including `evolution.spec.ts` plus 3 Stage 3 files), exact DSH rc.7 closure, no private imports, four demos each emit one JSON result, and no Provider/Docker/paid path runs.

- [ ] **Step 6: Audit forbidden side effects and fixture cleanup**

```powershell
$root='D:\DevData\tianwen-stage3-test-fixtures'
$files=if(Test-Path $root){@(Get-ChildItem -LiteralPath $root -Recurse -File -Force)}else{@()}
$bytes=($files | Measure-Object Length -Sum).Sum
"fixtureFiles=$($files.Count) fixtureBytes=$($bytes ?? 0)"
$forbidden=@(rg --files -uu -g 'champion.json' -g '**/artifacts/*.mjs' -g '!node_modules/**' -g '!dist/**')
"forbiddenGeneratedFiles=$($forbidden.Count)"
git status --short
```

Expected: Stage 3 fixture files `0`, bytes `0`; forbidden generated files `0`; tracked changes only planned files. Existing build outputs under ignored `dist` are not product artifacts and must not be committed.

- [ ] **Step 7: Commit docs/CI contract**

```powershell
git add README.md README.zh-CN.md docs/tianwen-architecture-overview-v2.md tests/contracts/test_public_repository_surface.py .github/workflows/ci.yml
git diff --cached --check
git commit -m "docs: publish governed Skill candidate proof"
```

- [ ] **Step 8: Request independent three-axis review**

Give reviewers the exact plan-bearing base SHA and feature HEAD. Require:

1. correctness/replay review: deterministic IDs, strict validation, idempotency, commit-unknown, restart, and no partial governance state;
2. architecture/privacy review: actual DSH Skill use, Case-bound support/counterevidence, public whitelist, no raw content, DSH-only Runtime, no old Artifact activation route;
3. Ponytail/YAGNI review: identify abstractions/dependencies/files that can be removed without weakening the canonical proof.

Any Critical/Important finding must be verified against code and fixed with focused RED/GREEN in the smallest relevant files, one ordinary fix commit, then affected gates rerun. Do not implement speculative Minor suggestions; record genuine nonblocking debt for the supervisor.

- [ ] **Step 9: Fresh final verification after review fixes**

Rerun Step 5 exactly after the final code-bearing commit. Also run:

```powershell
git diff --check $env:TIANWEN_PLAN_SHA..HEAD
git diff --name-status $env:TIANWEN_PLAN_SHA..HEAD
git log --oneline --reverse $env:TIANWEN_PLAN_SHA..HEAD
git status --short
```

Expected: no Critical/Important findings, clean worktree, planned file set only, no uncommitted review fix.

- [ ] **Step 10: Ordinary feature push and structured stop report**

```powershell
git push -u origin codex/tianwen-governed-skill-candidate
$local=git rev-parse HEAD
$tracking=git rev-parse '@{upstream}'
$remote=(git ls-remote origin refs/heads/codex/tianwen-governed-skill-candidate).Split("`t")[0]
"local=$local"
"tracking=$tracking"
"remote=$remote"
git status --short
```

Expected: ordinary non-force push; three SHAs exact equal; worktree clean. Report commits, files, RED/GREEN evidence, demo JSON, review verdicts, DSH boundary, resource/download counts, fixture cleanup, and unresolved nonblocking items. Stop before Task 7.

---

### Task 7: Mainline Integration and Exact-SHA CI (Supervisor Release Required)

**Files:**
- No planned file edits

**Interfaces:**
- Consumes: supervisor-approved feature HEAD with Critical 0 / Important 0 and clean worktree.
- Produces: one `--no-ff` main merge, one ordinary main push, and exact-SHA automatic CI evidence.

- [ ] **Step 1: Wait for explicit supervisor release**

Do not infer approval from Task 6 success. Supervisor must provide the exact approved feature SHA and current expected main SHA.

- [ ] **Step 2: Verify merge inputs in the existing main worktree**

```powershell
git status --short
git rev-parse main
git rev-parse refs/remotes/origin/main
git rev-parse $env:TIANWEN_APPROVED_FEATURE_SHA
git diff --check $env:TIANWEN_EXPECTED_MAIN_SHA..$env:TIANWEN_APPROVED_FEATURE_SHA
```

Expected: main local/tracking both equal the supervisor-provided expected main SHA; approved feature exists; main worktree clean. Any mismatch is a stop condition; do not fetch/rebase/force.

- [ ] **Step 3: Merge once and prove exact tree equality**

```powershell
git merge --no-ff $env:TIANWEN_APPROVED_FEATURE_SHA -m "merge: add governed Skill candidate intake"
$merge=git rev-parse HEAD
$mergeTree=git rev-parse "$merge^{tree}"
$featureTree=git rev-parse "$env:TIANWEN_APPROVED_FEATURE_SHA^{tree}"
"merge=$merge mergeTree=$mergeTree featureTree=$featureTree"
if ($mergeTree -ne $featureTree) { throw 'merge tree differs from approved feature tree' }
git diff --check $env:TIANWEN_EXPECTED_MAIN_SHA..HEAD
```

Expected: exactly one no-ff merge, merge tree equals approved feature tree, no merge-only fix.

- [ ] **Step 4: Push main once and verify remote SHA**

```powershell
git push origin main
$local=git rev-parse main
$tracking=git rev-parse refs/remotes/origin/main
$remote=(git ls-remote origin refs/heads/main).Split("`t")[0]
"local=$local tracking=$tracking remote=$remote"
```

Expected: one ordinary non-force push; all three SHAs equal.

- [ ] **Step 5: Verify the automatic exact-SHA CI without rerun**

Use GitHub's read-only API or existing authenticated tooling to locate the single automatic `push` run whose `head_sha` equals the merge SHA. Wait for completion without manual dispatch or rerun. Require both Python and TypeScript jobs `success`, including the Stage 3 focused tests and `pnpm demo:governed-skill-candidate` step.

If CI fails, download only the failed job log under a new small `D:\DevData\tianwen-public-audit\ci-<short-sha>` directory, record its SHA-256, stop, and return the exact root cause to supervision. Do not retry, skip, or enter Stage 4.

- [ ] **Step 6: Report and stop**

Report merge SHA/parents/tree equality, main local/tracking/remote SHAs, exact CI run/job URLs and conclusions, no downloads/Provider/Docker/paid actions, and clean worktrees. Do not add a post-CI docs commit and do not begin Evaluation, Shadow, Promotion, Release, or application work.
