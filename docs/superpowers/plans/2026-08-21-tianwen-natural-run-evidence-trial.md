# Tianwen Natural DSH Run Evidence Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one opt-in path that lets a useful first-round DSH Goal Run
produce durable Run, Evidence, Outcome, and optional Skill-use governance facts
without changing ordinary resume or creating a second Runtime.

**Architecture:** Extend the existing resume parent/child composition rather
than introducing a runner. Freeze one subject digest in a backward-compatible
Run-binding v2 before the first Turn, let DSH execute normally, flush the
Session, then feed the final acceptance Evidence through the existing
`consumeOutcome()` and `recordSkillUse()` services. A zero-cost fixture proves
the mechanism; a configured-Provider natural trial is a separate, non-bearing
operational receipt after mainline integration.

**Tech Stack:** TypeScript 6.0.3, Node 22, Vitest 4.1.8, pnpm 11.20.0, DSH
`0.1.0-rc.7`, existing Tianwen Evidence/Evolution/Runtime packages. No new
third-party version; the existing exact DSH Skill package becomes an honest
direct dependency of the deployable Runtime Bundle.

## Global Constraints

- Canonical design:
  `docs/superpowers/specs/2026-08-21-tianwen-natural-run-evidence-trial-design.md`
  at exact commit `5157d809f29719d4c5381bc4fa625c966700f928`.
- DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- Reuse the existing Goal resume, Agent, Session, Skill, tool, Provider,
  permission, and persistence seams; do not implement a Tianwen Agent loop.
- Do not add a second ledger, trial database, queue, worker, scheduler, generic
  repository, Provider wrapper, price service, budget state machine, or request
  reservation layer.
- Do not query official pricing, persist price snapshots, add periodic pricing
  work, or make exact CNY telemetry a test or completion gate.
- The user's cumulative 60 CNY authorization remains an external supervisor
  boundary. A single small configured-Provider trial inside the remaining
  authorization does not require another confirmation.
- Missing exact provider billing data is reported as unavailable; it does not
  change the DSH task result or block Evidence intake.
- Do not create Candidate, live B/C Evaluation, Shadow, Active Pointer,
  Promotion, Reject, Rollback, a root Skill registration, or a trial lifecycle
  event.
- Do not import or call Python Alpha, RepoTaskRuntime, AlphaRuntime, legacy
  Artifact/Evaluation/Approval, Dynamic Cordis activation, global Champion,
  `promote()`, `rollback()`, `rehydrateChampion()`, or `champion.json`.
- Ordinary `tianwen resume` without `--trial-manifest` keeps its current input,
  execution, output, and exit semantics.
- Use TDD for every code-bearing task. A RED must fail for the intended missing
  contract; GREEN uses the smallest implementation.
- Review findings block work only when they are reachable through current
  public APIs and normal execution and violate an existing core promise.
  Extreme hypothetical states are recorded as non-bearing notes, not expanded
  into frameworks.
- Do not run Provider, paid model, Docker, Alpha, or runtime-profile before the
  explicit post-mainline natural-trial task.
- Do not install or download dependencies. Reuse the existing D-drive
  `node_modules`, shared caches, and conditional Python interpreter. One
  `--lockfile-only --offline --ignore-scripts` refresh is authorized solely to
  declare the already-installed exact DSH Skill package in the Runtime Bundle;
  it must download zero packages and must not relink `node_modules`.
- After that lockfile-only refresh, set the process-local
  `pnpm_config_verify_deps_before_run=false` for remaining local commands. This
  prevents pnpm from turning a script run into an implicit install against the
  intentionally unrelinked existing workspace. Do not persist the setting in
  `.npmrc`; exact-main CI performs its normal fresh frozen install.

---

## Execution baseline and workspace stop condition

This plan must first be committed and normally pushed on
`codex/tianwen-natural-evidence-trial-design`. The supervisor will supply the
resulting exact design+plan SHA in the formal execution order. The executor
must not infer a moving branch tip.

Use only:

- implementation worktree:
  `D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake`;
- its existing `node_modules`;
- shared stores/caches already under `D:\DevData`;
- dedicated local fixture root:
  `D:\DevData\tianwen-stage7-test-fixtures`.

Do not create a second implementation worktree, clone, `node_modules`, `.venv`,
DSH Profile, disposable probe, or cache.

Before Task 1:

- [ ] Verify the supervisor-recorded design+plan SHA exists and the canonical
  branch local/tracking/remote all equal it. Read the design and plan fully.
- [ ] Verify `main`, `origin/main`, and `git ls-remote` all equal
  `8fc8ef81caf8fd2d101d74b8a60cb1ea90c973d1`.
- [ ] Switch the existing implementation worktree to
  `codex/tianwen-natural-run-evidence-trial` from the exact design+plan SHA.
- [ ] Require a clean tracked tree and an existing
  `node_modules/.modules.yaml`. Do not install when either check fails.
- [ ] Read the dedicated fixture root and require zero files and zero bytes.
  Unknown content is a stop condition; do not delete it.
- [ ] Run the clean-build order and current 22-file baseline:

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack'
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-stage7-test-fixtures'
pnpm --filter @tianwen/runtime... build
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
  tests/dsh-probe/evolution.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts `
  tests/dsh-migration/runtime-bundle.spec.ts `
  tests/dsh-migration/runtime-composition.spec.ts
```

Any baseline failure is a stop condition. Do not wash a first clean-build
failure green by creating another environment or changing an unrelated gate.

---

## File map

### Existing files modified

- `packages/tianwen-evidence/src/projector.ts`: expose the projector's existing
  canonical JSON digest helper.
- `packages/tianwen-evidence/src/index.ts`: export that one helper.
- `packages/tianwen-evolution/src/outcome-intake.ts`: add Run-binding v2 while
  preserving exact v1 identity/replay and recurrence semantics.
- `packages/tianwen-evolution/src/ledger.ts`: parse, replay, compare, and expose
  v1/v2 Run bindings from the same ledger/event type.
- `packages/tianwen-evolution/src/index.ts`: export the v2 types and acceptance
  contract normalizer.
- `packages/tianwen-evolution/package.json`: expose one pure `./run-binding`
  subpath without changing dependencies.
- `packages/tianwen-runtime/src/learning-intake.ts`: accept the v2 binding input
  and return the selected Outcome Evidence ID.
- `packages/tianwen-runtime/src/index.ts`: export the narrow v2 runtime types.
- `packages/tianwen-runtime/package.json`: expose one pure `./run-binding`
  subpath without changing dependencies.
- `packages/tianwen-dsh-compat/src/runtime.ts`: keep the existing narrow bundle
  alias and export only the public DSH/runtime seams actually used by the
  mounted Tianwen services.
- `packages/tianwen-runtime-bundle/package.json`: declare the already-installed
  exact `@deepseek-ai/dsh-skill` `0.1.0-rc.7` package as a direct deployable
  dependency.
- `pnpm-lock.yaml`: refresh only the runtime-bundle importer offline for that
  direct dependency.
- `packages/tianwen-runtime-bundle/src/cli.ts`: add the opt-in manifest option.
- `packages/tianwen-runtime-bundle/src/resume.ts`: parent preflight, installed
  bundle check, and path+digest child handoff.
- `packages/tianwen-runtime-bundle/src/resume-runner.ts`: pre-Turn binding and
  post-flush intake around the existing DSH Goal resume.
- `packages/tianwen-runtime-bundle/resume.patch.yml`: pass two bounded trial
  config values into the existing runner.
- `package.json`: add one zero-cost demo command.
- `.github/workflows/ci.yml`: make the existing TypeScript build gate build the
  Runtime Bundle dependency closure, then add two focused specs and the demo
  step.
- `tests/dsh-probe/evidence.spec.ts`,
  `tests/dsh-probe/outcome-intake.spec.ts`,
  `tests/dsh-probe/outcome-intake-runtime.spec.ts`,
  `tests/dsh-probe/evolution.spec.ts`: v2 and selected-Evidence contracts.
- `tests/dsh-migration/goal-resume.spec.ts`,
  `tests/dsh-migration/runtime-bundle.spec.ts`: ordinary-resume and bundle
  packaging regression.
- `tests/contracts/test_public_repository_surface.py`: permanent public truth
  and CI wiring contract.

### New files

- `packages/tianwen-runtime-bundle/src/natural-run-trial.ts`: strict manifest
  parser, canonical path+digest handoff facts, safe receipt types, and pure
  helpers only.
- `tests/dsh-probe/natural-run-evidence-runtime.spec.ts`: parent/child/runtime
  composition contract.
- `packages/tianwen-runtime/src/run-binding.ts`: pure re-export seam for the
  acceptance parser/types; it imports the pure Evolution subpath, not the
  Evolution root or any Runtime service.
- `packages/tianwen-evolution/src/run-binding.ts`: pure re-export seam from
  `outcome-intake`; it imports no ledger/runtime binding or DSH compat root.
- `scripts/run-natural-run-evidence-demo.ts`: zero-cost successful useful
  fixture.
- `tests/dsh-probe/natural-run-evidence-demo.spec.ts`: safe truthful demo
  output contract.
- `docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md`:
  durable scope and evidence handoff.

No new third-party version, database schema, second patch, or second Runtime is
added. The only package/lockfile topology change is the direct declaration of
the exact DSH Skill package that the deployable bundle already imports. The
root `package.json` changes only by one demo command.

---

## Task 1: Expose the existing canonical Evidence digest

**Files:**

- Modify: `packages/tianwen-evidence/src/projector.ts`
- Modify: `packages/tianwen-evidence/src/index.ts`
- Test: `tests/dsh-probe/evidence.spec.ts`

**Interfaces:**

- Consumes: the projector's current sorted-key canonical JSON algorithm.
- Produces:

```ts
export function canonicalEvidenceDigest(
  value: unknown,
): `sha256:${string}`
```

- [ ] **Step 1: Write the failing digest contract**

Add tests proving object key order does not change the digest, nested arrays
and plain objects match the current projected `argumentsDigest`, and the
existing unsupported `undefined` and `bigint` values still throw. Finite-number
validation belongs to the manifest parser and must not change the projector's
current algorithm.

```ts
expect(canonicalEvidenceDigest({ b: 2, a: [true, null] }))
  .toBe(canonicalEvidenceDigest({ a: [true, null], b: 2 }))
expect(projectEvidence(sessionId, events)[0]!.action.argumentsDigest)
  .toBe(canonicalEvidenceDigest({ path: 'fixture', strict: true }))
```

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts
```

Expected: compile/import failure because `canonicalEvidenceDigest` is not
exported.

- [ ] **Step 3: Make the current helper public without changing its algorithm**

Rename the existing private digest function and use it inside
`projectEvidence()`. Do not add another JSON package or canonicalizer.

```ts
export function canonicalEvidenceDigest(
  value: unknown,
): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`
}
```

- [ ] **Step 4: Run GREEN and package build**

```powershell
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts
pnpm --filter @tianwen/evidence... build
```

Expected: focused tests and build pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/tianwen-evidence/src/projector.ts `
  packages/tianwen-evidence/src/index.ts `
  tests/dsh-probe/evidence.spec.ts
git commit -m "feat: expose canonical evidence digest"
```

---

## Task 2: Add backward-compatible Run-binding v2 provenance

**Files:**

- Modify: `packages/tianwen-evolution/src/outcome-intake.ts`
- Modify: `packages/tianwen-evolution/src/ledger.ts`
- Modify: `packages/tianwen-evolution/src/index.ts`
- Modify: `packages/tianwen-runtime/src/learning-intake.ts`
- Modify: `packages/tianwen-runtime/src/index.ts`
- Create: `packages/tianwen-runtime/src/run-binding.ts`
- Modify: `packages/tianwen-runtime/package.json`
- Test: `tests/dsh-probe/outcome-intake.spec.ts`
- Test: `tests/dsh-probe/outcome-intake-runtime.spec.ts`
- Test: `tests/dsh-probe/evolution.spec.ts`

**Interfaces:**

- Produces:

```ts
export interface RunBindingInputV2 extends RunBindingInputV1 {
  readonly acceptanceSubjectDigest: Sha256Digest
}

export interface TianwenRunBindingV2 extends RunBindingInputV2 {
  readonly schemaVersion: 'tianwen.run-binding.v2'
  readonly runId: TianwenRunId
  readonly acceptanceContractDigest: Sha256Digest
}

export type RunBindingInput = RunBindingInputV1 | RunBindingInputV2
export type TianwenRunBinding =
  | TianwenRunBindingV1
  | TianwenRunBindingV2

export function prepareRunAcceptanceContract(
  value: unknown,
): RunAcceptanceContract
```

- Extends `RuntimeOutcomeIntakeReceipt` with:

```ts
readonly acceptanceEvidenceId?: Sha256Digest
```

- [ ] **Step 1: Write v1/v2 RED contracts**

Prove:

1. the existing v1 fixture retains its exact Run ID and serialized event;
2. v2 stores `acceptanceSubjectDigest`;
3. changing only the subject changes v2 Run ID and binding input digest;
4. changing only the subject does **not** change
   `acceptanceContractDigest`, problem fingerprint, or the reusable recurrence
   contract;
5. exact v2 replay is duplicate; same Session rebound with a changed subject
   is a conflict;
6. malformed v2 digests fail closed;
7. package-root public `LedgerEvent` still excludes internal Run-binding
   events;
8. `consumeOutcome()` returns the exact final selected Evidence ID.

Use two different subject digests with the same reusable acceptance contract:

```ts
const subjectA = canonicalEvidenceDigest({ file: 'a.ts' })
const subjectB = canonicalEvidenceDigest({ file: 'b.ts' })
expect(v2A.acceptanceContractDigest).toBe(v2B.acceptanceContractDigest)
expect(v2A.runId).not.toBe(v2B.runId)
```

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run `
  tests/dsh-probe/outcome-intake.spec.ts `
  tests/dsh-probe/outcome-intake-runtime.spec.ts `
  tests/dsh-probe/evolution.spec.ts
```

Expected: missing v2 types/field and missing Outcome Evidence ID.

- [ ] **Step 3: Split the input types without changing v1**

Keep the current v1 preparation branch byte-for-byte equivalent. For v2:

```ts
const acceptanceContract = prepareRunAcceptanceContract(
  input.acceptanceContract,
)
const acceptanceContractDigest = sha256(acceptanceContract)
const runDigest = sha256({
  goalRef,
  taskRef,
  sessionId,
  scopeKey,
  acceptanceContractDigest,
  acceptanceSubjectDigest,
})
```

Do not include `acceptanceSubjectDigest` in
`acceptanceContractDigest`. The existing outcome fingerprint must continue to
group the same real problem across different task subjects.

Export `prepareRunAcceptanceContract`, the v2 input type, and the v1/v2 union
through `@tianwen/evolution`. Add a pure `@tianwen/runtime/run-binding` subpath
that only re-exports the acceptance parser and binding types needed by the
bundled CLI. Do not make the CLI import the Runtime service root, and do not
expose raw private ledger events through the package-root `LedgerEvent` type.

- [ ] **Step 4: Add one parser branch to the existing event**

`run-binding-recorded` remains one private event type. Parse
`tianwen.run-binding.v1` with its exact old key set and v2 with one additional
binding key. Replay recomputes the appropriate version and compares all fields.
No migration, rewrite, second event, or fallback cast is allowed.

- [ ] **Step 5: Return the selected Evidence ID**

In `consumeOutcome()`, return:

```ts
return {
  ...receipt,
  ...(finalEvidence === undefined
    ? {}
    : { acceptanceEvidenceId: finalEvidence.evidenceId }),
  sessionUnchanged: true,
}
```

Do not change verdict selection or Evidence projection.

- [ ] **Step 6: Run GREEN and bearing regressions**

```powershell
pnpm --filter @tianwen/runtime... build
pnpm exec vitest run `
  tests/dsh-probe/outcome-intake.spec.ts `
  tests/dsh-probe/outcome-intake-runtime.spec.ts `
  tests/dsh-probe/skill-governance.spec.ts `
  tests/dsh-probe/skill-governance-runtime.spec.ts `
  tests/dsh-probe/evolution.spec.ts
```

Expected: v1, v2, Stage 3 recurrence/counterevidence, runtime, and old Dynamic
regression contracts pass.

- [ ] **Step 7: Commit**

```powershell
git add packages/tianwen-evolution/src/outcome-intake.ts `
  packages/tianwen-evolution/src/ledger.ts `
  packages/tianwen-evolution/src/index.ts `
  packages/tianwen-runtime/src/learning-intake.ts `
  packages/tianwen-runtime/src/index.ts `
  packages/tianwen-runtime/src/run-binding.ts `
  packages/tianwen-runtime/package.json `
  tests/dsh-probe/outcome-intake.spec.ts `
  tests/dsh-probe/outcome-intake-runtime.spec.ts `
  tests/dsh-probe/evolution.spec.ts
git commit -m "feat: bind verifier subjects to Tianwen Runs"
```

---

## Task 2A: Repair the existing deployable Runtime Bundle surface

This is a narrow prerequisite discovered by the first Task 3 product build.
The approved baseline already fails because Stage 3/4 mounted services consume
public DSH seams that the older `@tianwen/dsh-compat/runtime` bundle entry does
not export. It is not a Stage 7 feature and must not become a new facade or
Runtime composition.

**Files:**

- Modify: `packages/tianwen-dsh-compat/src/runtime.ts`
- Create: `packages/tianwen-evolution/src/run-binding.ts`
- Modify: `packages/tianwen-evolution/package.json`
- Modify: `packages/tianwen-runtime/src/run-binding.ts`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`

**Interfaces:**

- Keeps the existing `@tianwen/dsh-compat/runtime` alias.
- Adds only these already-used runtime exports:
  `SessionId`, `callConfigEquals`, `createUserMessage`,
  `isAgentLoopRequest`, `isSkillName`, `renderSkillContent`, and
  `ScriptedAdapter`.
- Keeps `Context`, `Service`, and `DSH_VERSION` unchanged.
- Declares `@deepseek-ai/dsh-skill: 0.1.0-rc.7` as a direct
  `@tianwen/runtime-bundle` dependency.
- Keeps `@tianwen/runtime/run-binding` pure by routing it through the new
  `@tianwen/evolution/run-binding` subpath rather than the Evolution root.

- [ ] **Step 1: Record the two exact RED contracts**

First update the existing Runtime Bundle contract so that:

- its package dependency expectation includes exact
  `@deepseek-ai/dsh-skill: 0.1.0-rc.7`;
- its runtime metafile allowlist permits only
  `../tianwen-dsh-compat/dist/scripted-adapter.js` in addition to the existing
  Tianwen/runtime inputs;
- its runtime external list is exactly `@deepseek-ai/cordis`,
  `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-session`, and
  `@deepseek-ai/dsh-skill`;
- `test-harness`, probe helpers, private DSH paths, native addons, and unrelated
  workspace inputs remain forbidden.
- CLI inputs contain only the existing CLI/resume/status modules plus the
  Tianwen Evidence digest, Runtime run-binding, Evolution run-binding,
  `outcome-intake`, and `learning-intake` pure modules; they must not contain
  Evolution ledger/runtime-binding/governance modules or the DSH compat root.

When comparing esbuild external package paths, normalize them through a
`Set` before sorting. Multiple modules may legally import the same declared
external package; duplicate import records are not duplicate dependencies.

Run the focused manifest assertion and confirm it fails because the direct DSH
Skill dependency is absent. Then run:

```powershell
pnpm --filter @tianwen/runtime-bundle... build
```

Expected second RED: TypeScript compilation passes, then esbuild reports the
missing named exports from `@tianwen/dsh-compat/runtime`. Preserve the exact
error list; do not edit the alias or broaden it to the root compat entry.

- [ ] **Step 2: Add only the missing public runtime exports**

In `packages/tianwen-dsh-compat/src/runtime.ts`, re-export the exact public DSH
symbols listed in the Interfaces block and re-export the existing local
`ScriptedAdapter`. Do not export `test-harness`, test helpers, the root compat
surface, or any private DSH path.

- [ ] **Step 3: Keep the CLI Run-binding import pure**

Create `packages/tianwen-evolution/src/run-binding.ts` that explicitly
re-exports only:

```ts
export {
  prepareRunAcceptanceContract,
  prepareRunBinding,
} from './outcome-intake.js'
export type {
  RunAcceptanceContract,
  RunBindingInput,
  RunBindingInputV1,
  RunBindingInputV2,
  TianwenRunBinding,
  TianwenRunBindingV1,
  TianwenRunBindingV2,
  TianwenRunId,
} from './outcome-intake.js'
```

Expose it as `./run-binding` in the Evolution package. Change the existing
Runtime `./run-binding` source to re-export from
`@tianwen/evolution/run-binding`. Do not import the Evolution root, duplicate
any acceptance parser, or add a second schema.

- [ ] **Step 4: Declare the one honest deployable dependency**

Add exact `@deepseek-ai/dsh-skill: 0.1.0-rc.7` beside the Runtime Bundle's
existing public DSH dependencies. Refresh only the lockfile:

```powershell
pnpm install --lockfile-only --offline --ignore-scripts `
  --store-dir D:\DevData\pnpm-store
```

Require the command to download zero packages. Inspect the diff: only the
runtime-bundle importer may gain the direct dependency; `node_modules`, other
importers, package versions, and integrity records must not change. Any wider
lockfile rewrite is a stop condition, not permission to normalize the file.

Then set for this execution process only:

```powershell
$env:pnpm_config_verify_deps_before_run = 'false'
```

The already-installed package remains resolvable from the existing workspace
root. This flag disables only pnpm's implicit pre-script install; it does not
change dependency resolution, build output, source, lockfile, or CI. Do not
authorize a relink merely to satisfy local metadata freshness.

- [ ] **Step 5: Run GREEN and the packaging boundary**

```powershell
pnpm --filter @tianwen/runtime-bundle... build
pnpm exec vitest run tests/dsh-migration/runtime-bundle.spec.ts
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: the Runtime Bundle builds; the runtime metafile contains the exact
local scripted adapter required by approved Stage 4 and no test harness/probe
input; the CLI metafile contains only the narrow run-binding/digest modules and
no Evolution service/DSH compat root; all external imports are declared exact
public DSH dependencies. This does not authorize a second adapter, Provider
wrapper, or live Evaluation path.

- [ ] **Step 6: Commit the prerequisite repair**

```powershell
git add packages/tianwen-dsh-compat/src/runtime.ts `
  packages/tianwen-evolution/src/run-binding.ts `
  packages/tianwen-evolution/package.json `
  packages/tianwen-runtime/src/run-binding.ts `
  packages/tianwen-runtime-bundle/package.json `
  pnpm-lock.yaml `
  tests/dsh-migration/runtime-bundle.spec.ts
git commit -m "fix: align the deployable Tianwen runtime bundle"
```

---

## Task 3: Add the strict opt-in parent CLI preflight

**Files:**

- Create: `packages/tianwen-runtime-bundle/src/natural-run-trial.ts`
- Modify: `packages/tianwen-runtime-bundle/src/cli.ts`
- Modify: `packages/tianwen-runtime-bundle/src/resume.ts`
- Modify: `packages/tianwen-runtime-bundle/resume.patch.yml`
- Modify: `tests/dsh-migration/goal-resume.spec.ts`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Create: `tests/dsh-probe/natural-run-evidence-runtime.spec.ts`

**Interfaces:**

- Produces:

```ts
export interface NaturalRunTrialManifest {
  readonly schemaVersion: 'tianwen.natural-run-trial.v1'
  readonly goalId: string
  readonly taskRef: string
  readonly scopeKey: string
  readonly parentSkillName: string
  readonly acceptanceContract:
    RunBindingInputV2['acceptanceContract']
  readonly verifierArguments: Readonly<Record<string, unknown>>
}

export interface PreparedNaturalRunTrialManifest {
  readonly manifest: NaturalRunTrialManifest
  readonly manifestDigest: `sha256:${string}`
  readonly acceptanceSubjectDigest: `sha256:${string}`
}

export function readNaturalRunTrialManifest(
  absolutePath: string,
  expectedDigest?: `sha256:${string}`,
): PreparedNaturalRunTrialManifest
```

- Adds `preflightNaturalRunTrial(goalId, dataDir, manifestPath)` and extends
  `launchGoalResume()` with the prepared trial branch.

- [ ] **Step 1: Write parser and CLI RED tests**

The tests must cover:

- exact keys and schema version;
- absolute readable source path and at most 16 KiB canonical manifest;
- canonical JSON values only and nesting depth at most 16;
- label length at most 128 UTF-8 bytes;
- label character allowlist plus rejection of leading `/`, Windows drive
  prefix, and `scheme://`;
- `goalId` equality and first Session with no `turn/start`;
- pre-Turn reusable `severity`/`blocksGoal` values survive normalization;
- changed file after parent preparation fails child digest validation;
- `--trial-manifest` is mutually exclusive with `--live-smoke` and requires
  `--json`;
- no manifest keeps ordinary resume output/exit behavior;
- installed runtime-bundle mismatch stops before child spawn;
- patch/package include the two trial config values.

Do not add a semantic credential scanner. The parser enforces structure and
the documented caller boundary only.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts `
  tests/dsh-migration/runtime-bundle.spec.ts
```

Expected: missing manifest module, CLI option, and trial preflight.

- [ ] **Step 3: Implement the bounded parser**

Use `canonicalEvidenceDigest()` for both `manifestDigest` and
`acceptanceSubjectDigest`. Reuse the exported
`prepareRunAcceptanceContract()`; do not duplicate the acceptance union.
Traverse only to enforce JSON value type and depth. The 16 KiB canonical byte
limit already bounds total content, so do not add a member-count or resource
accounting subsystem.

- [ ] **Step 4: Implement parent preflight and path+digest handoff**

The parent:

1. reads and normalizes the manifest;
2. reuses ordinary Goal scan/integrity checks;
3. requires manifest Goal equality and no prior `turn/start`;
4. calls the existing installed runtime-bundle identity check;
5. passes only manifest source path and canonical digest through the child
   patch environment.

The child must reread and revalidate the same file, require the digest to
match, then delete both environment entries before Agent creation. Do not copy
the file or Base64-encode the payload.

- [ ] **Step 5: Preserve ordinary resume**

Keep the existing ordinary and live-smoke branches separate. Trial preflight
failure returns exit 1 with a safe fixed message and never calls ordinary
resume as fallback.

- [ ] **Step 6: Run GREEN and packaging checks**

```powershell
pnpm --filter @tianwen/runtime-bundle... build
pnpm exec vitest run `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts `
  tests/dsh-migration/runtime-bundle.spec.ts
```

Expected: parser, CLI, no-fallback, packaging, and ordinary regression pass.

- [ ] **Step 7: Commit**

```powershell
git add packages/tianwen-runtime-bundle/src/natural-run-trial.ts `
  packages/tianwen-runtime-bundle/src/cli.ts `
  packages/tianwen-runtime-bundle/src/resume.ts `
  packages/tianwen-runtime-bundle/resume.patch.yml `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts `
  tests/dsh-migration/runtime-bundle.spec.ts
git commit -m "feat: preflight natural DSH evidence trials"
```

---

## Task 4: Compose the child runner around the normal DSH Goal

**Files:**

- Modify: `packages/tianwen-runtime-bundle/src/natural-run-trial.ts`
- Modify: `packages/tianwen-runtime-bundle/src/resume-runner.ts`
- Modify: `tests/dsh-probe/natural-run-evidence-runtime.spec.ts`
- Modify: `tests/dsh-probe/outcome-intake-runtime.spec.ts`

**Interfaces:**

- Produces a safe receipt:

```ts
export interface NaturalRunTrialReceipt {
  readonly schemaVersion: 'tianwen.natural-run-trial-receipt.v1'
  readonly status: 'settled' | 'settled-with-learning-error'
  readonly goal: {
    readonly id: string
    readonly revision: number
    readonly phase: 'paused' | 'blocked' | 'complete'
  }
  readonly session: {
    readonly id: string
    readonly eventCountDelta: number
    readonly unchangedByGovernance: true
  }
  readonly run: {
    readonly runId: string
    readonly acceptanceSubjectDigest: `sha256:${string}`
    readonly acceptanceEvidenceId?: `sha256:${string}`
  }
  readonly learning: {
    readonly decision:
      | 'no-case'
      | 'continue-observing'
      | 'ordinary-correction'
      | 'signal-recorded'
      | 'ticket-created'
      | 'ticket-merged'
      | 'not-recorded'
    readonly reason?:
      | 'persistence-unavailable'
      | 'verifier-evidence-missing'
      | 'verifier-call-mismatch'
      | 'evidence-projection-failed'
      | 'outcome-intake-failed'
      | 'outcome-evidence-mismatch'
      | 'skill-use-intake-failed'
      | 'governance-session-changed'
    readonly ticketId?: string
    readonly skillUse: 'recorded' | 'no-use-proof' | 'not-attempted'
  }
  readonly usage: {
    readonly modelRequests: number
    readonly toolCalls: number
    readonly tokens?: {
      readonly inputTokens: number
      readonly outputTokens: number
      readonly cacheReadTokens?: number
      readonly cacheWriteTokens?: number
      readonly reasoningTokens?: number
    }
    readonly exactCny: 'unavailable'
  }
}
```

- [ ] **Step 1: Write the runtime RED matrix**

Cover these normal reachable paths:

1. manifest/Goal/Session/verifier/parent failure: zero request and zero Goal
   drive;
2. Run binding and parent manifest precede the first `turn/start`;
3. DSH runs its normal Agent loop and configured tools;
4. `ctx.sessions.flush()` must return `true`;
5. `false` or thrown flush preserves the settled primary Goal result, returns
   `settled-with-learning-error/persistence-unavailable`, and writes no
   Outcome/Skill-use;
6. the Session's final acceptance-tool Evidence is selected by largest
   `callSeq`;
7. an earlier matching call followed by a mismatched call produces
   `verifier-call-mismatch` and no Outcome/Skill-use;
8. a matching successful final call produces `met/no-case`;
9. `consumeOutcome()` happens before `recordSkillUse()`;
10. no parent Skill call is legal `no-use-proof`;
11. post-Run projection/intake failure does not alter the Goal or Session;
12. only `assistant/message.data.usage` is summed; `assistant/chunk` is not
    double-counted;
13. raw arguments, Skill body, Goal objective, paths, URLs, and credentials are
    absent from the serialized receipt. Inject a learning-side error whose
    message contains an absolute-path and credential-shaped sentinel and prove
    the receipt emits only the matching fixed reason code.
14. settled `paused` and `blocked` Goal phases remain truthful receipt values
    and may proceed to matching Outcome intake; a Goal still `active` remains a
    primary execution failure and exits 1.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-probe/outcome-intake-runtime.spec.ts
```

Expected: trial runner branch and receipt do not exist.

- [ ] **Step 3: Add the pre-Turn composition**

After `ctx.agents.resume()` and before `ctx.goals.resume()`:

1. recheck Session ID, Goal ID/revision, and no `turn/start`;
2. require the verifier tool in the prepared Agent's public tool schemas;
3. derive `goalRef` as `dsh-goal:<goal-id>@<revision>`;
4. call `bindRunWithSkill(agent, v2Input, parentSkillName)`;
5. require the Session digest unchanged.

Do not restrict ordinary tools, force a Skill call, insert an answer, change
the Provider/model, or add a retry.

- [ ] **Step 4: Add the post-Run composition**

After the existing Goal settles:

1. flush and require `true`;
2. project Evidence once;
3. select the final acceptance-tool record by call sequence;
4. require its `argumentsDigest === acceptanceSubjectDigest`;
5. freeze the flushed Session digest and require it unchanged between Evidence
   selection and intake;
6. call `consumeOutcome()`;
7. require `acceptanceEvidenceId` equals the selected Evidence ID;
8. call `recordSkillUse()` only after the durable Outcome;
9. assemble the safe receipt.

No call or trailing mismatch returns a fixed learning-side reason and performs
no intake. Missing result with a matching call may use the existing
`inconclusive` Outcome semantics.

- [ ] **Step 5: Preserve the primary result**

Once the DSH Goal has settled, learning-side failures return
`settled-with-learning-error` and exit 0 because DSH reached a valid settled
phase (`paused`, `blocked`, or `complete`). Pre-Turn trial failures and primary
DSH execution failures remain exit 1. Never rerun the Goal automatically.

- [ ] **Step 6: Run GREEN and regression**

```powershell
pnpm --filter @tianwen/runtime-bundle... build
pnpm exec vitest run `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-probe/outcome-intake-runtime.spec.ts `
  tests/dsh-probe/skill-governance-runtime.spec.ts `
  tests/dsh-migration/goal-resume.spec.ts `
  tests/dsh-migration/runtime-composition.spec.ts
```

Expected: runtime matrix, Stage 2/3 ordering, ordinary resume, and composition
pass.

- [ ] **Step 7: Commit**

```powershell
git add packages/tianwen-runtime-bundle/src/natural-run-trial.ts `
  packages/tianwen-runtime-bundle/src/resume-runner.ts `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-probe/outcome-intake-runtime.spec.ts
git commit -m "feat: consume natural DSH Run evidence"
```

---

## Task 5: Add the truthful zero-cost proof and public contract

**Files:**

- Create: `scripts/run-natural-run-evidence-demo.ts`
- Create: `tests/dsh-probe/natural-run-evidence-demo.spec.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Create:
  `docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md`
- Modify: `tests/contracts/test_public_repository_surface.py`

**Interfaces:**

- Adds:

```json
"demo:natural-run-evidence": "tsx scripts/run-natural-run-evidence-demo.ts"
```

- [ ] **Step 1: Write the demo RED contract**

The fixture uses a normal DSH Agent with a registered parent Skill and stable
verifier. Its scripted sequence is:

```text
request 1 -> public skill tool loads the parent
request 2 -> stable verifier succeeds for the frozen subject
request 3 -> normal final assistant message
```

Assert:

- primary Goal completes;
- one v2 Run and parent manifest are durable before the Turn;
- final Outcome is `met`, learning is `no-case`;
- Skill-use proof is recorded because the Agent actually loaded the parent;
- Candidate/Case/Evaluation/Shadow/Pointer/Promotion remain zero;
- Session digest is unchanged by governance intake;
- the dedicated manifest/Session fixture files are removed by the demo's own
  `finally` cleanup, leaving the allowed Stage 7 fixture root empty;
- Provider network, paid token, exact CNY, Docker, external database, and user
  data are zero;
- serialized output contains no raw objective, arguments, result, Skill body,
  path, URL, or credential.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run `
  tests/dsh-probe/natural-run-evidence-demo.spec.ts
```

Expected: missing demo module and command.

- [ ] **Step 3: Implement the smallest demo**

Reuse the existing DSH probe harness and the product trial composition. Do not
copy the Agent loop, create a trial-only ledger schema, or deliberately return
not-met. Print exactly one JSON object.

- [ ] **Step 4: Add focused CI wiring**

Replace the existing TypeScript build command:

```text
pnpm --filter @tianwen/runtime... build
```

with:

```text
pnpm --filter @tianwen/runtime-bundle... build
```

This one command builds the Runtime Bundle and its Tianwen dependency closure;
do not add a second duplicate build step.

Append these two specs to the current explicit Vitest command:

```text
tests/dsh-probe/natural-run-evidence-runtime.spec.ts
tests/dsh-probe/natural-run-evidence-demo.spec.ts
```

Append this step after `pnpm demo:promotion-readiness`:

```text
pnpm demo:natural-run-evidence
```

Do not change triggers, permissions, runners, setup actions, cache, Python
job, any other dependency command, Docker, matrix, artifact, release, or
deploy behavior.

- [ ] **Step 5: Write the handoff and permanent public contract**

The handoff must state:

- DSH rc.7 is the only Runtime;
- the fixture proves mechanism, ordering, provenance, and no-case only;
- no configured-Provider natural receipt is claimed until one actually runs;
- no Ticket, Case, Candidate, live B/C Evaluation, Shadow, or Promotion was
  manufactured;
- exact CNY billing is unavailable and non-bearing;
- no price polling, snapshot, budget store, reservation, or request gate was
  added;
- old Alpha/Dynamic/Artifact/global Champion was not used.

The Python contract permanently checks both new spec paths, the demo command,
the cautious handoff wording, and unchanged personal-path/privacy gates.

- [ ] **Step 6: Run GREEN**

```powershell
pnpm exec vitest run `
  tests/dsh-probe/natural-run-evidence-runtime.spec.ts `
  tests/dsh-probe/natural-run-evidence-demo.spec.ts
pnpm demo:natural-run-evidence
```

Conditionally reuse the existing D-drive Python only:

```powershell
$python = 'D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $python) {
  & $python -m pytest `
    (Resolve-Path 'tests/contracts/test_public_repository_surface.py') -q
  if ($LASTEXITCODE -ne 0) { throw 'public contract failed' }
} else {
  Write-Output 'local Python gate unavailable; exact-main Python CI required'
}
```

Never use bare `uv run` and never create a Python environment.

- [ ] **Step 7: Commit**

```powershell
git add scripts/run-natural-run-evidence-demo.ts `
  tests/dsh-probe/natural-run-evidence-demo.spec.ts `
  package.json .github/workflows/ci.yml `
  docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md `
  tests/contracts/test_public_repository_surface.py
git commit -m "test: prove natural DSH evidence intake"
```

---

## Task 6: Final local gates, independent reviews, and feature push

- [ ] **Step 1: Run the final 24-file bearing gate**

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack'
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-stage7-test-fixtures'
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
```

- [ ] **Step 2: Run all eight demos**

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

- [ ] **Step 3: Run static and conditional Python gates**

```powershell
git diff --check
$python = 'D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $python) {
  & $python -c 'import pytest, ruff'
  if ($LASTEXITCODE -ne 0) { throw 'existing Python environment lacks gates' }
  & $python -m ruff check .
  if ($LASTEXITCODE -ne 0) { throw 'Ruff failed' }
  & $python -m pytest `
    (Resolve-Path 'tests/contracts/test_public_repository_surface.py') -q
  if ($LASTEXITCODE -ne 0) { throw 'public repository contract failed' }
} else {
  Write-Output 'local Python gates unavailable; exact-main Python CI required'
}
```

If Python is unavailable, report it only as unavailable. Exact-main Python CI
in Task 7 remains the required completion witness.

- [ ] **Step 4: Audit resources**

Require:

- fixture root and worktree `.dsh-probe` end with zero files/zero bytes;
- one existing `node_modules`, no `.venv`, clone, Profile, or disposable probe;
- dependency operations downloaded zero;
- Provider, paid token, CNY, Docker, and Alpha calls remain zero;
- the only dependency topology change is exact
  `@deepseek-ai/dsh-skill@0.1.0-rc.7` becoming a direct Runtime Bundle
  dependency, and the lockfile diff is limited to that importer declaration.

Do not delete unknown data or shared caches.

- [ ] **Step 5: Obtain three independent reviews**

1. correctness/replay: v1/v2 identity, final Evidence alignment, failure
   semantics, idempotency;
2. architecture/privacy/DSH: sole Runtime, public seams, safe output, no old
   path, no price/budget subsystem;
3. Ponytail/YAGNI: remove only speculative or duplicate code; do not add
   abstractions for extreme hypothetical states.

Any Critical or reachable Important must be fixed with focused RED/GREEN and
re-reviewed. A low-prob theoretical note is not automatically a release
blocker.

- [ ] **Step 6: Push the exact feature**

Commit any review fix narrowly, require a clean tree, then perform one normal
push. Verify feature local/tracking/`git ls-remote` exact equality and report:

- exact design+plan baseline;
- commit sequence and file scope;
- fresh gates/demos/reviews;
- v1/v2 provenance result;
- zero-cost/resource/download audit;
- explicit statement that no natural paid receipt, Ticket, Candidate, live
  Evaluation, Shadow, or Promotion has been claimed.

Stop before main merge.

---

## Task 7: Mainline integration and exact-SHA CI (supervisor release only)

Only after the supervisor independently accepts the exact feature SHA:

- [ ] Require feature and main worktrees clean and remote facts unchanged.
- [ ] Merge the exact feature SHA into main once with `--no-ff`; no merge-only
  fix.
- [ ] Prove merge tree equals the reviewed feature tree.
- [ ] Run `git diff --check`.
- [ ] Push main once normally; never force.
- [ ] Locate the single automatic push run for the exact main SHA.
- [ ] Require Python and TypeScript jobs to complete successfully.
- [ ] In TypeScript, require both new specs and
  `pnpm demo:natural-run-evidence` to be successful.
- [ ] On failure, download only the failing job log to
  `D:\DevData\tianwen-public-audit\ci-<short-sha>`, report its digest and root
  cause, and stop without rerun or speculative fourth fix.

Task 7 completion means the Stage 7 mechanism is mainline-ready. It does not
mean a configured-Provider natural task has run.

---

## Task 8: One conditional configured-Provider natural trial

This is an operational evidence task after Task 7, not a mainline code gate.

- [ ] Read-only audit existing D-drive DSH data directories. Select only an
  existing product-like profile with configured credentials, an existing
  parent Skill, and a stable independent verifier. The supervisor may select a
  small real repository need and create a fresh first-round DSH Goal for it;
  the Goal does not need to exist before this task. Do not use a historical
  probe/Alpha fixture as natural evidence.
- [ ] Freeze the task value, acceptance contract, verifier, parent Skill, and
  trial manifest before the Run. The task must remain useful even with Tianwen
  learning disabled. Do not create a simulated-user service, task generator,
  hidden answer, scripted Provider result, or retry loop.
- [ ] If no such profile/task/verifier exists, output the non-persistent safe
  result `natural-trial-pending`, record it in the supervisor handoff, and stop
  successfully. Do not create a Profile merely to make the stage look green.
- [ ] If the existing profile is suitable but its Tianwen bundle is stale,
  update it only through the existing offline installer and D-drive pnpm store.
  Require install logs to show zero downloads; otherwise stop before Provider
  execution.
- [ ] Confirm once that one small Run is reasonably within the remaining
  cumulative 60 CNY authorization. Do not fetch official prices, create a
  snapshot, reserve money, or ask for repeated approval inside that boundary.
- [ ] Run the useful Goal exactly once with `--trial-manifest --json`.
- [ ] Accept every truthful result:
  `met/no-case`, one verified Signal, or `inconclusive`.
- [ ] Do not rerun to manufacture recurrence or a Ticket. Do not increase
  `severity`/`blocksGoal` after seeing the result.
- [ ] Report the safe receipt, DSH-observed request/token usage, and
  `exactCny=unavailable` when no provider billing receipt exists.
- [ ] Do not commit the raw manifest, user content, Session history, or local
  receipt to Git.

Only a naturally occurring Ticket with full v2 provenance and an honest
pre-Case four-category protocol authorizes a separate Stage 8 trusted B/C
Evaluation design. A normal `no-case` or `natural-trial-pending` is a legal
project result, not evidence to manufacture the next stage.
