# Tianwen Installer Stage Environment Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the official offline installer finish workspace materialization and final DSH configuration boot without losing deterministic Runtime Bundle archives.

**Architecture:** Keep one common installer child environment for ordinary pnpm work, derive one pack-only environment that sets `UV_THREADPOOL_SIZE=1`, and make every child lifetime explicit at its owning stage. Workspace installation, deployment, and final DSH configuration boot wait for completion; pnpm version, builds, and packs retain their bounded deadlines.

**Tech Stack:** Node.js `spawnSync`, pnpm `11.20.0`, TypeScript, Vitest, PowerShell, GitHub Actions.

## Global Constraints

- Historical Tasks 0–3 use design SHA `a9daa2b20d066229159ae8a6e1c4fe4d148546fe`; the active R1 correction authority is frozen below.
- The official Task 6 installer failure on `main@8dc47eb732e58dd33987a1b0bf4941707af4694e` remains permanent evidence and is never retried or overwritten.
- Production changes are limited to `scripts/install-tianwen.mjs`; test changes are limited to `tests/dsh-migration/tianwen-installer.spec.ts`.
- Do not change packages, lockfiles, dependencies, workflow, receipt schemas, Runtime, Profile, CLI, model selection, Provider, Agent, Session, Evolution, or controlled-lifecycle behavior.
- Do not add a retry, watchdog, progress protocol, background process, configuration option, timeout framework, archive normalizer, or helper abstraction.
- Ordinary pnpm children must not inherit a caller `UV_THREADPOOL_SIZE`; exactly the two Runtime Bundle pack children receive the fixed string `1`.
- Workspace install, host deploy, Profile deploy, and DSH config boot use timeout `0`; pnpm version uses `120_000`, and the two Runtime Bundle builds and two packs retain `300_000`.
- Workspace install remains offline, frozen-lockfile, ignore-scripts, trust-lockfile, shell-free, and stage-labelled `workspace-install` on a genuine failure.
- Large generated data and caches stay under `D:\DevData`.

---

### Task 0: Exact authority takeover

**Files:**
- Read: `docs/superpowers/specs/2026-08-25-tianwen-installer-stage-environment-repair-design.md`
- Read: `docs/superpowers/plans/2026-08-25-tianwen-installer-stage-environment-repair.md`
- Read: `scripts/install-tianwen.mjs`
- Read: `tests/dsh-migration/tianwen-installer.spec.ts`

**Interfaces:**
- Consumes: design SHA `a9daa2b20d066229159ae8a6e1c4fe4d148546fe` and the current scripted installer `calls`, `childEnvironments`, and `spawnOptions` arrays.
- Produces: a clean, exact implementation baseline; no files changed.

- [ ] **Step 1: Verify exact identity and isolation**

Run from the linked worktree:

```powershell
git rev-parse HEAD
git branch --show-current
git status --porcelain=v1
git rev-parse --git-dir
git rev-parse --git-common-dir
```

Expected: exact HEAD `a9daa2b20d066229159ae8a6e1c4fe4d148546fe`, branch `codex/tianwen-installer-stage-environment-repair`, clean status, and distinct Git/common directories proving a linked worktree.

- [ ] **Step 2: Read all authority and touched code to EOF**

Read the four files listed above. Confirm the implementation still has:

```js
UV_THREADPOOL_SIZE: '1'
```

in `childEnvironment()`, workspace timeout `300_000`, and both pack calls using the common `invokePnpm()` environment.

- [ ] **Step 3: Record the unmodified focused baseline**

Run:

```powershell
$env:PNPM_CONFIG_STORE_DIR='D:\DevData\pnpm-store'
$env:COREPACK_HOME='D:\DevData\corepack-home'
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
```

Expected: the existing installer contract passes before the new RED assertions are added. Stop on any unrelated failure.

---

### Task 1: Scope pnpm concurrency and workspace lifetime by stage

**Files:**
- Modify: `tests/dsh-migration/tianwen-installer.spec.ts:700-720,1143-1160`
- Modify: `scripts/install-tianwen.mjs:609-656,740-810`

**Interfaces:**
- Consumes: `scriptedInstaller()` arrays aligned by child-call index and the existing `invokePnpm(args, timeout)` seam.
- Produces: common pnpm environment with normal libuv concurrency, pack-only deterministic environment, and completion-owned workspace installation.

- [ ] **Step 1: Write the timeout RED**

Add a focused test named `uses completion-owned workspace installation while
keeping build and pack deadlines`. Run one scripted install, align each call
with its spawn options, and identify the workspace install using:

```ts
const workspaceInstallIndex = scripted.calls.findIndex(argv =>
  argv.includes('install') && argv.includes('--offline'))
const hostDeployIndex = scripted.calls.findIndex(argv =>
  argv.includes('deploy') && argv.includes('@tianwen/dsh-host'))
const profileDeployIndex = scripted.calls.findIndex(argv =>
  argv.includes('deploy') && argv.includes('@tianwen/profile-host'))
```

Assert:

```ts
expect(scripted.spawnOptions[workspaceInstallIndex]?.timeout).toBe(0)
expect(scripted.spawnOptions[hostDeployIndex]?.timeout).toBe(0)
expect(scripted.spawnOptions[profileDeployIndex]?.timeout).toBe(0)

const buildAndPackIndexes = scripted.calls
  .map((argv, index) => argv.includes('build') || argv.includes('pack') ? index : -1)
  .filter(index => index >= 0)
expect(buildAndPackIndexes.map(index => scripted.spawnOptions[index]?.timeout))
  .toEqual([300_000, 300_000, 300_000, 300_000])
```

Update the existing “every other timeout is positive” assertion to exclude the three completion-owned indexes and keep every unrelated child positive.

The existing replay test runs the installer twice, so update its broad positive
timeout assertion by excluding every call whose argv is either a host/Profile
deploy or the offline workspace install. Do not change its expected call order
or counts.

- [ ] **Step 2: Write the stage-environment RED**

Replace the existing test that expects every pnpm child to use one libuv worker
and name it `serializes only Runtime Bundle pack children`. Keep the caller
override `UV_THREADPOOL_SIZE: '64'`, run one scripted install, then align each
call and environment by index:

```ts
const pnpmChildren = scripted.calls.map((argv, index) => ({
  argv,
  env: scripted.childEnvironments[index]!,
})).filter(({ argv }) => /pnpm\.(?:c?js|mjs)$/iu.test(argv[0] ?? ''))

const packChildren = pnpmChildren.filter(({ argv }) => argv.includes('pack'))
const ordinaryChildren = pnpmChildren.filter(({ argv }) => !argv.includes('pack'))

expect(packChildren).toHaveLength(2)
expect(packChildren.every(({ env }) => env.UV_THREADPOOL_SIZE === '1')).toBe(true)
expect(ordinaryChildren.every(({ env }) => env.UV_THREADPOOL_SIZE === undefined)).toBe(true)
```

- [ ] **Step 3: Run RED and confirm both product facts are missing**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts -t "uses completion-owned workspace installation|serializes only Runtime Bundle pack children"
```

Expected: timeout assertion receives `300000` instead of `0`; ordinary child
environment receives `1` instead of `undefined`. If the failure is different,
fix only the call-index predicates or assertion selection; do not change the
scripted runner behavior. Rerun until the intended RED is observed.

- [ ] **Step 4: Implement the minimum stage-local behavior**

In `childEnvironment()`, delete only:

```js
UV_THREADPOOL_SIZE: '1',
```

Immediately after the common environment is created, derive:

```js
const packEnv = { ...env, UV_THREADPOOL_SIZE: '1' }
```

Allow the existing pnpm seam to select the environment without adding a helper:

```js
const invokePnpm = (args, timeout, childEnv = env) => runFixed(
  process.execPath,
  [pnpm, ...args],
  { cwd: repoRoot, env: childEnv, runner, timeout },
)
```

Change only the workspace-install timeout:

```js
() => invokePnpm(
  ['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--trust-lockfile'],
  0,
)
```

Pass `packEnv` as the third argument only to the existing pack call:

```js
invokePnpm([
  '--filter', RUNTIME_PACKAGE, 'pack', '--skip-manifest-obfuscation',
  '--pack-destination', archiveStage,
], 300_000, packEnv)
```

- [ ] **Step 5: Run focused GREEN**

Run the same two-test command from Step 3.

Expected: both tests pass and the scripted call counts stay unchanged.

- [ ] **Step 6: Run the complete installer contract**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
```

Expected: all installer tests pass, including archive stability, failure stages, D-drive cache ownership, replay, rollback, shell-free invocation, and existing host/Profile deployment behavior.

- [ ] **Step 7: Commit the implementation**

Run:

```powershell
git diff --check
git add scripts/install-tianwen.mjs tests/dsh-migration/tianwen-installer.spec.ts
git diff --cached --check
git commit -m "fix: scope installer pnpm stage policy"
```

Expected: one implementation commit with exactly two changed files.

---

### Task 2: Functional verification, review, and exact-main integration

**Files:**
- Verify: `scripts/install-tianwen.mjs`
- Verify: `tests/dsh-migration/tianwen-installer.spec.ts`
- Verify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 1 implementation SHA.
- Produces: reviewed feature SHA, exact no-ff main merge, and one automatic exact-main push attempt with all three jobs green.

- [ ] **Step 1: Run the Windows-owned functional group**

Run serially with D-drive caches:

```powershell
$env:PNPM_CONFIG_STORE_DIR='D:\DevData\pnpm-store'
$env:COREPACK_HOME='D:\DevData\corepack-home'
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-dsh-probe'
pnpm --filter @tianwen/runtime-bundle... build
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/controlled-lifecycle-command.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/one-shot-profile-lifecycle.spec.ts
pnpm run typecheck
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: every command passes; no Profile or product command is invoked outside tests.

- [ ] **Step 2: Run the repository gate once**

Run with the canonical evaluator Python:

```powershell
$env:TIANWEN_DSH_PROBE_PYTHON='D:\DevData\tianwen-dsh-probe\venv-task-6\Scripts\python.exe'
pnpm run check
uv run pytest -q tests/contracts/test_public_repository_surface.py
uv run ruff check .
git diff --check
```

Expected: all gates pass. Do not weaken or extend an unrelated timeout to manufacture green.

- [ ] **Step 3: Perform three independent read-only reviews**

Review the exact design-parent-to-feature diff for:

1. correctness and installer lifecycle;
2. architecture and evidence/privacy boundaries;
3. simplicity/YAGNI.

Expected: no reachable Critical or Important. The central review question is whether ordinary workspace work and pack determinism are now owned by the correct stages without adding a second path.

- [ ] **Step 4: Archive the approved feature**

Push the reviewed feature branch once with a normal non-force push. Verify local feature, tracking ref, and `git ls-remote` all equal the approved feature SHA.

- [ ] **Step 5: Integrate to exact main**

After a fresh fetch, require local main, `origin/main`, and `ls-remote main` to equal expected previous main `8dc47eb732e58dd33987a1b0bf4941707af4694e`. Create one no-ff merge:

```powershell
$approvedFeature = (git rev-parse codex/tianwen-installer-stage-environment-repair).Trim()
git merge --no-ff $approvedFeature -m "merge: repair installer stage environment"
```

Require merge parent 1 to be the expected previous main, parent 2 to be the approved feature, merge tree to equal feature tree, both first-parent diff checks to pass, and no merge-only changes. Push main once with a normal non-force push.

- [ ] **Step 6: Verify the unique automatic exact-main CI**

Resolve the merge SHA from `git rev-parse main`. Locate the unique `CI` workflow
run with `event=push`, that exact `head_sha`, and `run_attempt=1`. Require
Python, TypeScript, and installer-windows to complete successfully. Do not
rerun, dispatch, or supplement jobs.

---

### Task 3: Fresh official zero-request product proof

**Files:**
- Create outside repository: `D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r1-product`
- Create outside repository: `D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r1-evidence`

**Interfaces:**
- Consumes: exact merged main and its successful automatic CI.
- Produces: one ready install receipt and four valid model-config receipts proving the installed CLI starts and exits without Provider requests or durable product activity.

- [ ] **Step 1: Freeze fresh roots and exact identity**

Require local main, `origin/main`, and remote main to equal the exact merge SHA; repository clean; all three CI jobs successful; both `-r1-` roots absent. Reserve evidence transports with exclusive creation before the installer.

- [ ] **Step 2: Run the official installer exactly once**

From exact main, run:

```powershell
node --run install:tianwen -- --data-dir D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r1-product --json
```

Use D-drive pnpm/corepack/temp/probe roots. Capture stdout, stderr, and exit
separately. Require exit `0`, stderr empty, one canonical ready receipt, and the
official `.CMD` and CLI paths named by that receipt to exist. Do not repeat the
separate archive/publication audit in this functional proof. On failure, stop
without retry.

- [ ] **Step 3: Run four installed zero-request model commands**

Use only the official `.CMD` from the install receipt. On Windows, start the
fixed `%SystemRoot%\System32\cmd.exe` with `shell: false` and exact
`/d /s /c` arguments that invoke that `.CMD`; capture the official invocation's
stdout, stderr, and exit separately. Supply a runtime-generated dummy credential
and a loopback Provider URL. Run each at most once in this order:

```text
model use --model deepseek-v4-pro --data-dir D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r1-product --json
model status --data-dir D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r1-product --json
model use --model offline --data-dir D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r1-product --json
model status --data-dir D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r1-product --json
```

Require each process to exit, emit one valid model-config receipt, and report `modelRequestsDelta=0`. The first two must select DeepSeek; the final two must restore and confirm offline. If activation fails, skip DeepSeek status but still run offline use and final offline status once.

- [ ] **Step 4: Close durable state and report**

Verify no Session, Evolution ledger, Goal, activity, Agent, or controlled-lifecycle facts were created. Classify Provider-account request count as unknown unless an independent Provider fact source exists; do not infer it from `modelRequestsDelta`. Preserve both failed Task 6 and fresh R1 evidence roots. Do not run controlled-lifecycle, Goal, checker, postmortem, smoke, or a second installer.

Expected terminal result: installer ready, installed CLI four-command lifecycle passed, final offline receipt valid, and zero product-owned model requests/durable activity.

---

## R1 correction constraints

- Tasks 0–3 above are the preserved first-repair history. Their reviewed feature
  was integrated as `main@ff4d93bf87c8cabcf3f00af943f53021c77db792`,
  and automatic CI run `32801883746`, push attempt 1, passed Python,
  TypeScript, and installer-windows.
- Exact correction-design authority is
  `e0f3c87da767110001cd8fcad84961b3998888ee`.
- The single R1 official installer invocation is permanent failed evidence:
  exit `1`, stdout `110` bytes, stderr `0` bytes, safe stage
  `dsh-config-validation`, total elapsed `1399.680` seconds, no install receipt,
  no installed model command, and no Session or Evolution state.
- Never rerun, repair, clean, or reuse either R1 root:
  `D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r1-product` and
  `D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r1-evidence`.
- Production remains limited to `scripts/install-tianwen.mjs`; tests remain
  limited to `tests/dsh-migration/tianwen-installer.spec.ts`.
- Do not change packages, dependencies, lockfiles, workflow, DSH/Profile/CLI
  configuration, receipt schemas, Provider, Agent, Session, Evolution, model,
  or controlled-lifecycle behavior.
- Do not add a retry, larger guessed timeout, watchdog, polling loop, progress
  protocol, reason-code schema, timeout framework, option, helper, telemetry,
  background process, or second installer path.
- Every `runFixed()` call must receive an explicit timeout from its owning
  stage. The final DSH config-validation boot uses timeout `0`; pnpm version
  remains `120_000`; all other stage values remain as frozen in the design.
- The new functional proof uses only the fresh `-r2-` roots under
  `D:\DevData` and invokes the official installer at most once.

### Task 4: Take over the R1 authority and preserve the failed proof

**Files:**
- Read: `docs/superpowers/specs/2026-08-25-tianwen-installer-stage-environment-repair-design.md`
- Read: `docs/superpowers/plans/2026-08-25-tianwen-installer-stage-environment-repair.md`
- Read: `scripts/install-tianwen.mjs:665-678,739-857`
- Read: `tests/dsh-migration/tianwen-installer.spec.ts:195-218,680-739`

**Interfaces:**
- Consumes: design correction SHA
  `e0f3c87da767110001cd8fcad84961b3998888ee`, failed R1 transport, and the
  existing scripted call/options arrays.
- Produces: an exact clean implementation baseline and one unmodified installer
  contract result; no product invocation.

- [ ] **Step 1: Verify exact branch identity and isolation**

Run:

```powershell
git rev-parse HEAD
git branch --show-current
git status --porcelain=v1
git rev-parse --git-dir
git rev-parse --git-common-dir
```

Expected: exact correction-plan SHA, branch
`codex/tianwen-installer-config-lifecycle-repair`, clean status, and distinct
Git/common directories.

- [ ] **Step 2: Re-read the complete stage flow**

Read the four files above. Confirm the only implicit timeout consumers are:

```js
invokePnpm(['--version'])
runFixed(process.execPath, [dshBin, '--profile', PROFILE, '--dump-config'], ...)
```

Confirm workspace install, both deployments, both builds, and both packs already
carry their intended explicit values.

- [ ] **Step 3: Record the unmodified installer baseline**

Run with D-drive stores:

```powershell
$env:PNPM_CONFIG_STORE_DIR='D:\DevData\pnpm-store'
$env:COREPACK_HOME='D:\DevData\corepack-home'
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
```

Expected: the existing 46-test contract passes before the new RED assertion.
Stop on any unrelated failure.

### Task 5: Make every installer child lifetime stage-owned

**Files:**
- Modify: `tests/dsh-migration/tianwen-installer.spec.ts:714-739`
- Modify: `scripts/install-tianwen.mjs:665-678,749-757,852-856`

**Interfaces:**
- Consumes: `scripted.calls[index]` and `scripted.spawnOptions[index]`.
- Produces: no hidden `runFixed()` timeout, bounded pnpm version preflight, and
  completion-owned DSH config-validation boot.

- [ ] **Step 1: Write the DSH-lifecycle RED**

Rename the existing timeout test to
`assigns every child lifetime to its installer stage`. After the existing
workspace/host/Profile indexes, identify the one DSH dump and pnpm version:

```ts
const dshConfigIndexes = scripted.calls
  .map((argv, index) => argv.includes('--dump-config') ? index : -1)
  .filter(index => index >= 0)
const pnpmVersionIndex = scripted.calls.findIndex(argv =>
  /pnpm\.(?:c?js|mjs)$/iu.test(argv[0] ?? '') && argv[1] === '--version')
```

Require:

```ts
expect(dshConfigIndexes).toHaveLength(1)
expect(dshConfigIndexes.map(index => scripted.spawnOptions[index]?.timeout))
  .toEqual([0])
expect(scripted.spawnOptions[pnpmVersionIndex]?.timeout).toBe(120_000)
```

Add `...dshConfigIndexes` to the completion-owned exclusion set used by the
final positive-timeout assertion. Preserve the exact `0` assertions for
workspace/host/Profile and exact `[300_000, 300_000, 300_000, 300_000]` build
and pack assertion.

- [ ] **Step 2: Run RED and require the observed hidden default**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts -t "assigns every child lifetime to its installer stage"
```

Expected: exactly the DSH timeout assertion fails with actual `120000` and
expected `0`; the pnpm version, deploy, workspace, build, and pack assertions
already pass. If the failure is an index mistake, fix only the predicate until
this exact RED is observed.

- [ ] **Step 3: Implement the smallest explicit stage ownership**

Remove the generic default:

```js
function runFixed(executable, argv, { cwd, env, runner, timeout }) {
```

Make pnpm version explicit:

```js
const actual = invokePnpm(['--version'], 120_000).stdout.trim()
```

Make DSH config startup completion-owned:

```js
const dump = atInstallStage(INSTALLER_FAILURE_STAGE.DSH_CONFIG_VALIDATION, () => runFixed(
  process.execPath,
  [dshBin, '--profile', PROFILE, '--dump-config'],
  { cwd: repoRoot, env, runner, timeout: 0 },
))
```

Do not edit any other call, stage, failure mapping, validation, or rollback
behavior.

- [ ] **Step 4: Run focused GREEN and the complete installer contract**

Run serially:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts -t "assigns every child lifetime to its installer stage"
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
```

Expected: focused 1/1 and full 46/46 pass.

- [ ] **Step 5: Commit the correction**

Run:

```powershell
git diff --check
git add scripts/install-tianwen.mjs tests/dsh-migration/tianwen-installer.spec.ts
git diff --cached --check
git commit -m "fix: complete installer child lifetime ownership"
```

Expected: one implementation commit with exactly the two allowed files.

### Task 6: Verify, integrate, and run one fresh R2 functional proof

**Files:**
- Verify: `scripts/install-tianwen.mjs`
- Verify: `tests/dsh-migration/tianwen-installer.spec.ts`
- Create outside repository:
  `D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r2-product`
- Create outside repository:
  `D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r2-evidence`

**Interfaces:**
- Consumes: Task 5 implementation SHA and expected previous main
  `ff4d93bf87c8cabcf3f00af943f53021c77db792`.
- Produces: reviewed exact feature, one no-ff main merge, one automatic exact-main
  push attempt, and one fresh official zero-request functional proof.

- [ ] **Step 1: Run affected verification**

Run serially with D-drive caches:

```powershell
$env:PNPM_CONFIG_STORE_DIR='D:\DevData\pnpm-store'
$env:COREPACK_HOME='D:\DevData\corepack-home'
$env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-dsh-probe'
pnpm --filter @tianwen/runtime-bundle... build
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/controlled-lifecycle-command.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
pnpm run typecheck
pnpm run check:no-private-dsh-imports
uv run pytest -q tests/contracts/test_public_repository_surface.py
uv run ruff check .
git diff --check
```

Expected: every command passes. Do not rerun or alter the unrelated local
120-second one-shot Profile wrapper; exact-main Windows CI remains its standard
environment gate.

- [ ] **Step 2: Review the exact correction diff**

Review design-parent-to-feature for:

1. correctness and complete installer stage ownership;
2. architecture, product flow, evidence, and privacy boundaries;
3. simplicity/YAGNI.

Expected: no reachable Critical or Important. Specifically reject a generic
timeout framework, retry, second execution path, or receipt expansion.

- [ ] **Step 3: Archive and integrate once**

Push the reviewed feature once with a normal non-force push. Require local,
tracking, and `ls-remote` feature refs to equal the approved SHA. Fetch, then
require local main, `origin/main`, and remote main to equal
`ff4d93bf87c8cabcf3f00af943f53021c77db792`. Create one merge:

```powershell
$approvedFeature = (git rev-parse codex/tianwen-installer-config-lifecycle-repair).Trim()
git merge --no-ff $approvedFeature -m "merge: complete installer child lifetime"
```

Require exact parents, merge tree equal to feature tree, both first-parent diff
checks, no merge-only change, and a clean tree. Recheck remote main, then push
main once normally.

- [ ] **Step 4: Require one exact-main automatic CI success**

Locate the unique CI run with the merge SHA, `event=push`, `run_attempt=1`.
Require Python, TypeScript, and installer-windows success. Never rerun, dispatch,
or supplement the run.

- [ ] **Step 5: Freeze R2 roots and run one official installer**

Require both R2 roots absent, exact merged main locally/remotely, clean repo, and
green CI. Reserve new installer stdout/stderr/exit files exclusively. Run once:

```powershell
node --run install:tianwen -- --data-dir D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r2-product --json
```

Use D-drive pnpm/corepack/temp/probe roots. Persist stdout, stderr, and exit before
parsing. If the stdout schema is a failure receipt, report only its safe stage
and stop without assuming ready-only fields. On success require exit `0`, empty
stderr, canonical ready receipt, persisted receipt byte equality, and existing
official CLI and `.CMD` paths. Do not repeat the archive/publication audit.

- [ ] **Step 6: Run the four official zero-request model commands**

Only after a ready receipt, use fixed `cmd.exe /d /s /c`, outer `shell:false`, a
runtime dummy credential, and loopback Provider URL. Run each at most once:

```text
model use --model deepseek-v4-pro --data-dir D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r2-product --json
model status --data-dir D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r2-product --json
model use --model offline --data-dir D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r2-product --json
model status --data-dir D:\DevData\tianwen-one-shot-profile-lifecycle-proof-r2-product --json
```

Require valid model-config receipts and `modelRequestsDelta=0`; final selection
must be offline. If activation fails, skip DeepSeek status but still run offline
use and final status once.

- [ ] **Step 7: Close product facts and stop**

Verify no Session, Evolution ledger, Goal, activity, Agent, or
controlled-lifecycle fact. Provider-account requests and actual tool bodies stay
`unknown` absent an independent source. Preserve Task 6, R1, and R2 roots. Do not
run controlled-lifecycle, Goal, checker, postmortem, smoke, or another installer.
