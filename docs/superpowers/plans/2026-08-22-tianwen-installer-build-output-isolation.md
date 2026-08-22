# Tianwen Installer Build-Output Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the official installer from changing the current managed
Profile through workspace hardlinks before commit, and publish a Runtime Bundle
whose package files no longer share file identity with the workspace.

**Architecture:** Before the first existing Runtime Bundle dependency build,
remove exactly five ignored generated `dist` directories so the build creates
new inodes while the current Profile retains its old bytes. After the existing
final-path Profile deploy, but before validation, copy-replace the exact
sixteen-file Runtime Bundle publication in the uncommitted candidate and force
that Profile replacement whenever preflight observed a source-linked current
Profile. Keep the existing double-build/double-pack raw-tar equality check,
receipt schemas and rollback authority unchanged.

**Tech Stack:** Node.js 22.20 filesystem primitives, pnpm 11.20.0, TypeScript,
Vitest on native Windows, existing Python 3.12 contract environment.

**Design:**
`docs/superpowers/specs/2026-08-22-tianwen-installer-build-output-isolation-design.md`

**Approved design ancestor:** the design commit containing both the new design
and the minimal amendment to
`docs/superpowers/specs/2026-08-21-tianwen-rc6-rc7-managed-install-migration-design.md`.

**Base main:** `9fee61bd43a7c41ada774bdd4c3761b3d0308cd1`

**Implementation branch:**
`codex/tianwen-installer-build-output-isolation`

## Global Constraints

- The supervisor must provide an exact reviewed design+plan SHA in
  `TIANWEN_PLAN_SHA`. Do not hardcode this plan's future commit SHA in the plan
  itself. Missing or inconsistent authority is a stop condition.
- The reviewed docs source branch is
  `codex/tianwen-installer-build-output-isolation-design`; its local, tracking
  and remote refs must all resolve to `TIANWEN_PLAN_SHA` before implementation.
- DSH `0.1.0-rc.7` remains the sole product Agent Runtime.
- Product implementation may modify only `scripts/install-tianwen.mjs`,
  `tests/dsh-migration/tianwen-installer.spec.ts`,
  `docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md`, and
  `tests/contracts/test_public_repository_surface.py`. The two canonical
  design documents and this plan arrive through the reviewed baseline.
- Do not modify package manifests, `pnpm-lock.yaml`, workflow, receipt schemas,
  failure-stage vocabulary, Runtime/Agent/Goal/Provider/ledger/status code or
  public command grammar.
- Do not add a dependency, VFS/filesystem adapter, second worktree/clone,
  transaction framework, repair marker, logger, telemetry, retry, online
  recovery, price query or budget subsystem.
- Keep the two-build/two-pack order and raw tar SHA-256 comparison unchanged.
  The authorized clean-worktree diagnosis produced two byte-identical raw
  archives; there is no RED for a content-digest algorithm.
- Use real Windows hardlinks for the principal regression. A mocked identity
  boolean or two equal byte buffers is not bearing evidence.
- Reuse the existing D-drive worktree, `node_modules`, Corepack home and
  `D:\DevData\pnpm-store`. Set
  `pnpm_config_verify_deps_before_run=false` and offline environment for local
  pnpm commands. No install, download or relink is authorized.
- Do not touch `D:\DevData\tianwen`, run the product installer, status, Goal,
  resume, model or Provider during Tasks 1–4.
- The supervisor-identified dirty legacy Alpha worktree is out of scope and
  must not be read, switched, cleaned or changed. Do not record its personal
  absolute path in repository documentation.
- Only demonstrated Critical/Important issues may expand an approved task's
  files. Preserve the scene and request a narrow correction for any other
  bearing failure.

---

## Workspace Setup

- [ ] **Step 1: Verify the reviewed docs authority**

In the existing D-drive implementation worktree, require:

```powershell
if ([string]::IsNullOrWhiteSpace($env:TIANWEN_PLAN_SHA)) {
  throw 'missing TIANWEN_PLAN_SHA'
}
git rev-parse --verify "$env:TIANWEN_PLAN_SHA^{commit}"
git merge-base --is-ancestor 9fee61bd43a7c41ada774bdd4c3761b3d0308cd1 $env:TIANWEN_PLAN_SHA
git show "$env:TIANWEN_PLAN_SHA`:docs/superpowers/specs/2026-08-22-tianwen-installer-build-output-isolation-design.md" | Out-Null
git show "$env:TIANWEN_PLAN_SHA`:docs/superpowers/plans/2026-08-22-tianwen-installer-build-output-isolation.md" | Out-Null
```

Mechanically require the reviewed docs branch's three authorities to equal
`TIANWEN_PLAN_SHA`:

```powershell
$docsBranch = 'codex/tianwen-installer-build-output-isolation-design'
$docsLocal = git rev-parse "refs/heads/$docsBranch"
$docsTracking = git rev-parse "refs/remotes/origin/$docsBranch"
$docsRemote = (git ls-remote origin "refs/heads/$docsBranch").Split("`t")[0]
if ($docsLocal -ne $env:TIANWEN_PLAN_SHA
  -or $docsTracking -ne $env:TIANWEN_PLAN_SHA
  -or $docsRemote -ne $env:TIANWEN_PLAN_SHA) {
  throw 'reviewed docs authority mismatch'
}
```

Verify main local/tracking/`git ls-remote` still equals
`9fee61bd43a7c41ada774bdd4c3761b3d0308cd1`. Do not fetch, rebase, reset or
rewrite history to make a mismatch disappear.

- [ ] **Step 2: Reuse the one implementation worktree**

Require the existing worktree to be clean, then create/switch the implementation
branch at the exact reviewed SHA:

```powershell
git switch -c codex/tianwen-installer-build-output-isolation $env:TIANWEN_PLAN_SHA
git rev-parse HEAD
git status --porcelain=v1
```

If the branch already exists, it must already point at the same exact SHA and
have the expected tracking relationship; otherwise stop. Do not create another
worktree, clone, Profile, `.venv`, `node_modules` or probe.

- [ ] **Step 3: Record resource identity and fixture emptiness**

Record length, UTC mtime and SHA-256 for `node_modules/.modules.yaml`. Require:

- `D:\DevData\tianwen-installer-tests` is absent or contains zero files/zero
  bytes before the focused test creates its own UUID children;
- `D:\DevData\tianwen-installer-pack-determinism` exists with zero files/zero
  bytes or is absent;
- `.venv` and `.dsh-probe` are absent/empty; and
- there is no relevant pnpm/node installer child.

Unknown fixture data is a stop condition and must not be deleted.

- [ ] **Step 4: Run the existing baseline**

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack-home'
$env:COREPACK_ENABLE_NETWORK = '0'
$env:PNPM_CONFIG_OFFLINE = 'true'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'

pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
pnpm --filter @tianwen/runtime-bundle... build
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

Expected: the current installer contract passes, the build completes with the
five-package closure, both DSH checks pass and Git stays clean. Stop on an
unrelated failure; do not make a speculative baseline repair.

---

### Task 1: Isolate generated build outputs before the first build

**Files:**

- Modify: `scripts/install-tianwen.mjs:574-693`
- Modify: `tests/dsh-migration/tianwen-installer.spec.ts:1-814`

**Interfaces:**

- Produces private constant:

```js
const RUNTIME_BUILD_OUTPUTS = Object.freeze([
  'packages/tianwen-dsh-compat/dist',
  'packages/tianwen-evolution/dist',
  'packages/tianwen-evidence/dist',
  'packages/tianwen-runtime/dist',
  'packages/tianwen-runtime-bundle/dist',
])
```

- Produces private helpers:

```js
function sameFileIdentity(left, right) // -> boolean, compares bigint dev+ino
function runtimePublishedPaths(repoRoot) // -> exact 14 manifest `files` paths
function hasSourceLinkedRuntimePublication(repoRoot, profileRoot) // -> boolean
function isolateRuntimeBuildOutputs(repoRoot) // -> void, removes fixed dist roots
```

- Produces one transient local in `installTianwen()`:

```js
const sourceLinkedProfile = profileExists
  && !migratingRc6
  && hasSourceLinkedRuntimePublication(repoRoot, paths.profileRoot)
```

- Task 2 consumes `sourceLinkedProfile` and `runtimePublishedPaths()`.

- [ ] **Step 1: RED — reproduce product mutation with a real hardlink**

Import `linkSync` and the minimum additional filesystem primitives into the
existing installer spec. Extend `scriptedInstaller()` with a test-only options
object that may receive a fixture `repoRoot` and an `onBuild` callback. Do not
add a product hook: the existing injected `repoRoot` and child `runner` are the
approved seams.

Create a UUID fixture repo under the existing D-drive installer test root with
the five exact `dist` directories and a minimal Runtime Bundle manifest whose
`files` includes `dist/cli.js`. Create a managed current Profile with the
existing scripted installer, then replace the fixture installed CLI with a
real hardlink to the fixture source CLI:

```ts
rmSync(installedCli)
linkSync(sourceCli, installedCli)
expect(statSync(sourceCli, { bigint: true }).ino)
  .toBe(statSync(installedCli, { bigint: true }).ino)
```

On the first scripted build, overwrite `sourceCli`. Return two different
scripted archives so the call stops at `archive-stability` before Profile
deploy. Capture the whole fixture product tree before the call.

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts -t "protects the current Profile from source-linked builds"
```

Expected RED on the old implementation: the installed CLI bytes change through
the hardlink and the full post-tree differs from the pre-tree even though
Profile deploy was never invoked.

- [ ] **Step 2: GREEN — capture link identity, then remove five generated roots**

Implement `sameFileIdentity()` using `statSync(path, { bigint: true })` and
strict `dev` plus `ino` equality. `runtimePublishedPaths()` must read only the
existing Runtime Bundle package manifest and accept only its closed string
`files` array; it does not scan the workspace.

Capture `sourceLinkedProfile` during the existing managed-layout preflight,
before any output path is removed. Missing source outputs are simply not
shared; malformed manifests or invalid installed regular-file shapes fail the
existing managed-layout preflight without adding a new code.

Inside the first existing `atInstallStage(runtime-bundle-build-1, ...)` block,
before invoking pnpm, call `isolateRuntimeBuildOutputs(repoRoot)`. Resolve every
fixed path beneath `repoRoot`, reject containment escape, and use
`rmSync(path, { force: true, recursive: true })`. These paths are generated and
Git-ignored; do not remove any package root, source file or dependency tree.

The function is private and accepts no arbitrary caller list. Do not preserve
or transactionally back up ignored build outputs.

- [ ] **Step 3: Verify GREEN and the exact failure surface**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts -t "protects the current Profile from source-linked builds"
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
pnpm --filter @tianwen/runtime-bundle... build
git diff --check
```

Expected:

- the real-hardlink test observes source bytes changing and installed bytes
  unchanged;
- host/Profile/archive/receipt/Session/Evolution fixture tree equals pre-state;
- failure remains exactly `archive-stability` or the injected existing stage;
- the five-package build recreates complete outputs; and
- no Profile deploy occurs in the stability failure.

- [ ] **Step 4: Commit Task 1**

```powershell
git add -- scripts/install-tianwen.mjs tests/dsh-migration/tianwen-installer.spec.ts
git commit -m "fix: isolate installer build outputs"
```

---

### Task 2: Publish a detached Runtime Bundle candidate

**Files:**

- Modify: `scripts/install-tianwen.mjs:694-790`
- Modify: `tests/dsh-migration/tianwen-installer.spec.ts`

**Interfaces:**

- Consumes Task 1's `sourceLinkedProfile` and manifest `files` projection.
- Produces private helper:

```js
function materializeRuntimeBundlePublication(profileRoot, repoRoot) // -> void
```

- Produces the exact replacement decision:

```js
profileChanged = migratingRc6
  || !profileExists
  || installedArchiveDigest !== archiveDigest
  || sourceLinkedProfile
```

- The helper operates on the fourteen `package.json#files` paths plus
  `package.json` and `LICENSE`, and nothing else.

- [ ] **Step 1: RED — prove source-linked replay and candidate deployment remain linked**

Add two real-hardlink tests through the existing runner:

1. A current Profile whose old/new raw archive bytes are equal but whose
   installed Runtime Bundle is linked to the fixture source. The old
   `profileChanged` expression skips deployment; expect this RED to show zero
   Profile deploy when one detached replacement is required.
2. A successful Profile deploy whose runner creates the candidate's sixteen
   package files as real hardlinks to fixture source files. The old installer
   returns ready while source and installed `dev`/`ino` values remain equal;
   mutate one source fixture after the receipt and prove the installed bytes
   change.

The fixture publication set is exact:

```ts
const runtimePublication = [
  ...runtimeManifest.files,
  'package.json',
  'LICENSE',
]
```

Run both test names with focused `-t`. Expected RED is the missing Profile
deploy in case 1 and shared identity/source-write propagation in case 2.

- [ ] **Step 2: GREEN — force replacement and materialize sixteen files**

Add `sourceLinkedProfile` to the existing `profileChanged` expression. Inside
the existing `managed-profile-deploy` stage, after the final-path pnpm deploy
and before `normalizeDeployedProfile()`, call
`materializeRuntimeBundlePublication(paths.profileRoot, repoRoot)`.

The helper must:

1. parse the candidate Runtime Bundle's own manifest as a plain object;
2. require its `files` array to equal the workspace manifest's exact fourteen
   strings, preserving current package order/value;
3. append only `package.json` and `LICENSE`;
4. require each candidate entry to be a regular file contained by the installed
   Runtime Bundle root;
5. copy each file to a unique sibling with `copyFileSync`, remove/replace only
   the candidate path, and clean its own sibling on error; and
6. re-stat every candidate file and require `nlink === 1`, plus unequal
   `dev`/`ino` from the corresponding workspace file when that source exists.

Do not recurse through `node_modules`, copy dependencies, move the Profile from
another directory or add package-import configuration as a substitute for the
identity proof. The old Profile backup already exists before this helper runs;
any helper failure must use the existing catch to discard the candidate and
restore the backup.

- [ ] **Step 3: Lock all reachable failure and replay semantics**

Extend the real-hardlink fixture across the existing injected failures:

- `runtime-bundle-build-1`, `runtime-bundle-pack-1`,
  `runtime-bundle-build-2`, `runtime-bundle-pack-2`, `archive-stability`;
- partial managed Profile deploy and managed Profile validation;
- DSH config validation, archive publication and receipt publication.

For every case assert exact pre/post equality for host, Profile, archive,
receipt, installed Runtime/CLI, Session and Evolution fixture files. A normal
detached current replay must invoke neither host nor Profile deploy. A
source-linked current replay must invoke exactly one Profile deploy and no host
deploy even when the raw archive digest is unchanged.

Keep the existing safe failure receipt exact three-key tests, raw archive
comparison tests and rc.6 host rollback tests unchanged and green. Do not add a
durable degraded marker or assert that the product classifier blocks downstream
commands after a failed operation.

- [ ] **Step 4: Verify Task 2 and commit**

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
git diff --check
```

Inspect the child argv audit: no install beyond the existing workspace check,
no network option, no shell, no retry, no new command and no changed timeout.

Commit:

```powershell
git add -- scripts/install-tianwen.mjs tests/dsh-migration/tianwen-installer.spec.ts
git commit -m "fix: publish detached Runtime Bundle profiles"
```

---

### Task 3: Record the permanent operational boundary

**Files:**

- Modify: `docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md`
- Modify: `tests/contracts/test_public_repository_surface.py`

**Interfaces:**

- Consumes the exact Task 1/2 transaction guarantees.
- Produces only public, non-sensitive operational wording; it adds no product
  state or CLI field.

- [ ] **Step 1: RED — permanent handoff facts are absent**

Extend the existing handoff contract with exact durable statements that:

- a workspace build previously crossed a pnpm hardlink into the installed
  Profile before Profile backup;
- the corrected installer isolates the finite generated build outputs before
  build;
- a committed Runtime Bundle publication has independent file identity from
  the workspace;
- the raw double-pack comparison remains unchanged because the isolated
  diagnosis was `raw-equal`; and
- after a failed operation on the already-drifted product, stopping status and
  Provider is a supervisor authorization boundary, not a persisted product
  degraded marker.

Do not include product file paths, file identifiers, raw child bytes, user
content or exact local credential/Skill data.

Run:

```powershell
& 'D:\DevData\tianwen-ci-py312-env\Scripts\python.exe' -m pytest tests/contracts/test_public_repository_surface.py
```

Expected RED: the new handoff facts are absent. If this existing interpreter is
not a leaf or cannot import both `pytest` and `ruff`, mark the local Python gate
unavailable and rely on exact-main Python CI; do not create/install an
environment.

- [ ] **Step 2: GREEN — update only the current handoff**

Append a concise section to the existing migration handoff with:

- the exact observed failure stage and source-linked payload drift;
- the isolated diagnostic's `raw-equal` conclusion without claiming the
  earlier two deleted staged archives' cause is known;
- the bounded five-output isolation and sixteen-file candidate materialization;
- unchanged receipt/stage/archive algorithms;
- zero Provider/Goal/model activity; and
- the separately approved exact-main/one-operation stop line.

Do not rewrite frozen historical plans or claim the current product has already
been repaired.

- [ ] **Step 3: Verify and commit Task 3**

```powershell
& 'D:\DevData\tianwen-ci-py312-env\Scripts\python.exe' -m pytest tests/contracts/test_public_repository_surface.py
& 'D:\DevData\tianwen-ci-py312-env\Scripts\python.exe' -m ruff check .
git diff --check
```

Commit:

```powershell
git add -- docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md tests/contracts/test_public_repository_surface.py
git commit -m "docs: record installer hardlink isolation boundary"
```

---

### Task 4: Fresh bearing gates, independent reviews and feature push

**Files:** No new files. Modify approved Task 1–3 files only for demonstrated
Critical/Important findings.

**Interfaces:**

- Consumes the three independently reviewable commits.
- Produces one clean exact feature SHA for supervisor review; it does not merge
  main or run any product operation.

- [ ] **Step 1: Run the complete JavaScript/TypeScript bearing gates serially**

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack-home'
$env:COREPACK_ENABLE_NETWORK = '0'
$env:PNPM_CONFIG_OFFLINE = 'true'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'

pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/repeated-outcome-demo.spec.ts tests/dsh-probe/skill-governance.spec.ts tests/dsh-probe/skill-governance-runtime.spec.ts tests/dsh-probe/governed-skill-candidate-demo.spec.ts tests/dsh-probe/skill-evaluation.spec.ts tests/dsh-probe/skill-evaluation-runtime.spec.ts tests/dsh-probe/paired-skill-evaluation-demo.spec.ts tests/dsh-probe/skill-shadow.spec.ts tests/dsh-probe/skill-shadow-eligibility-demo.spec.ts tests/dsh-probe/skill-promotion.spec.ts tests/dsh-probe/skill-promotion-readiness-demo.spec.ts tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/natural-run-evidence-demo.spec.ts tests/dsh-migration/goal-status.spec.ts
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
pnpm demo:paired-skill-evaluation
pnpm demo:shadow-eligibility
pnpm demo:promotion-readiness
pnpm demo:natural-run-evidence
```

The separate installer spec command is the local native-Windows bearing gate;
the unchanged `installer-windows` job carries it in exact-main CI. Do not add it
to Ubuntu's focused command or change the workflow.

- [ ] **Step 2: Run the available Python gates**

```powershell
$python = 'D:\DevData\tianwen-ci-py312-env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw 'local Python gate unavailable; record and defer to exact-main CI'
}
& $python -c "import pytest, ruff"
& $python -m ruff check .
& $python -m compileall -q src tests
& $python -m pytest
```

Do not use bare `uv`, create a `.venv` or install a missing module.

- [ ] **Step 3: Audit exact scope and resources**

```powershell
git diff --check 9fee61bd43a7c41ada774bdd4c3761b3d0308cd1..HEAD
git diff --name-only 9fee61bd43a7c41ada774bdd4c3761b3d0308cd1..HEAD
git status --porcelain=v1
```

Require the approved planned file list only. Verify:

- all installer fixture roots and the pack-determinism root end at zero
  files/zero bytes;
- `.venv` and `.dsh-probe` are absent/empty;
- `node_modules/.modules.yaml` length/mtime/SHA-256 match Workspace Setup;
- no related child remains; and
- install/download/relink, product installer/status/Goal/resume/model/Provider,
  Docker, Alpha, PR/tag/Release counts are zero.

- [ ] **Step 4: Obtain three independent read-only reviews**

Review exact feature HEAD against `9fee61bd...`:

1. correctness/rollback/replay: real hardlink RED, fixed five outputs, every
   failure's exact product pre-state, source-linked replacement and detached
   replay;
2. architecture/privacy/DSH: no receipt/classifier/status/Runtime expansion,
   no raw/path/file-ID output and no generic filesystem transaction; and
3. Ponytail/YAGNI: fixed output list plus exact sixteen-file materialization is
   the smallest sufficient boundary; no clone/VFS/package-import guesswork.

Resolve only demonstrated Critical/Important findings with a fresh focused
RED/GREEN and repeat affected gates/review. Record Minor findings without
expanding scope.

- [ ] **Step 5: Push once and stop**

Ordinary-push the clean feature branch once. Verify local HEAD, tracking ref and
`git ls-remote` all equal the same exact SHA. Proactively report commits, file
scope, RED/GREEN, complete gates, reviews, resources and explicit zero product
actions. Stop before main integration.

---

### Task 5: Supervisor-only mainline integration

**Files:** None beyond the approved feature tree.

- [ ] **Step 1: Merge and push once after exact-SHA approval**

From the dedicated clean main worktree, require main local/tracking/remote to
remain the supervisor-specified exact parent. Merge the approved feature once
with `--no-ff`; prove parent order, merge tree equality with the approved
feature and diff-check. Ordinary non-force push main once. No merge-only fix,
fetch, rebase, amend, force push, PR, tag or Release.

- [ ] **Step 2: Require exact-main automatic CI**

Wait for the unique automatic `push` run whose `head_sha` is the merge SHA.
Python, TypeScript and `installer-windows` must all complete successfully. The
Windows job must execute the updated installer spec; TypeScript must complete
the focused tests and eight demos. On any failure, collect only the narrow safe
job evidence and stop without rerun or second push.

---

### Task 6: Separately authorized one-time product recovery and status proof

This task is not authorized by implementation or main integration. It requires
a new supervisor instruction after exact-main CI is green.

- [ ] **Step 1: Snapshot and run the official installer once**

Before the command, record read-only host/Profile/archive/receipt, exact
Runtime Bundle publication identities, backup/temp residues, related children,
and per-file Session/Evolution path/size/SHA-256 snapshots without content.
Keep path, native file-identity and per-file digest values only in process
memory for equality checks; do not print or persist them, source-link facts,
child bytes or raw diagnostics. The safe operational report is limited to
counts, equality/detached booleans, an aggregate durable-root equality result
and the canonical receipt schema/status/closed failure stage.

Run exactly once from clean exact main with the existing D-drive offline env:

```powershell
node --run install:tianwen -- --data-dir D:\DevData\tianwen --json
```

Accept only one canonical ready receipt or closed three-key failure receipt. A
failure/nonzero/ambiguous output stops the authorization chain: no retry,
repair, status, Goal, model or Provider. The operator must report that existing
classifier/receipt labels do not themselves persist the transient source-link
finding.

- [ ] **Step 2: Require a detached ready state before status**

On success, prove:

- current rc.7 host/Profile and canonical ready archive/receipt agree;
- all sixteen installed Runtime Bundle publication files are regular and do
  not share native file identity with exact-main workspace publication files;
- source-file writes are not performed as a proof;
- backup/temp residue and related children are zero; and
- Session/Evolution snapshots are byte-identical to pre-install.

Only then may the separately authorized installed CLI run one canonical JSON
status against the already-completed successful Stage 7 Goal. Status must stay
read-only and expose no private governed events. Re-snapshot durable roots and
stop. Never rerun a Goal, manifest, model or Provider, and do not enter
Candidate/Evaluation/Shadow/Promotion.
