# Tianwen Runtime 0.1.5 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the final DSH-native continuous-Goal product immutable Runtime `0.1.5` and Desktop `0.1.0-preview.6` identities, then prove one real exact `0.1.4 -> 0.1.5` installed upgrade without external publication.

**Architecture:** Reuse the existing explicit release constants, managed installer transition, Desktop Profile update path, build scripts, and artifact audit. The only product change is the exact current/predecessor version boundary; no release framework, updater, or new UI is added. The controller builds real local artifacts and validates one isolated product root under `D:\DevData`.

**Tech Stack:** TypeScript/Node.js 22, pnpm 11.20.0, Vitest, DSH `0.1.1-rc.2`, Electron Builder, PowerShell, GitHub Actions.

## Global Constraints

- DSH remains exact `0.1.1-rc.2`.
- Runtime current is exact `0.1.5`; sole same-DSH Runtime predecessor is exact `0.1.4`.
- Desktop current is exact `0.1.0-preview.6` and embeds the exact Runtime `0.1.5` archive.
- Retain predecessor Runtime archives; do not mutate Session/evolution state or historical proof directories.
- Do not change lock files, internal private package versions, DSH dependencies, Goal schemas, or data models.
- Do not call a Provider or repeat the continuous-Goal natural task.
- Do not add an updater, scheduler, retry framework, generic migration range, version registry, or UI clicker.
- Do not publish npm packages, tags, GitHub Releases, installers, or external DSH changes.
- Large caches, build artifacts, proof products, and temporary sources stay under `D:\DevData`.

---

### Task 1: Freeze Runtime 0.1.5 and Desktop preview.6 identities

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/tianwen-architecture-overview-v2.md`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `packages/tianwen-runtime-bundle/src/portable-profile.ts`
- Modify: `packages/tianwen-runtime-bundle/src/controlled-lifecycle.ts`
- Modify: `packages/tianwen-desktop-host/package.json`
- Modify: `packages/tianwen-desktop-host/src/host.ts`
- Modify: `packages/tianwen-desktop-host/src/locale.ts`
- Modify: `packages/tianwen-desktop-host/src/main.ts`
- Modify: `scripts/install-tianwen.mjs`
- Modify: `scripts/verify-dsh-profile.mjs`
- Modify: `scripts/stage-desktop-runtime.mjs`
- Modify: `scripts/audit-desktop-artifact.mjs`
- Modify: `tests/dsh-migration/controlled-lifecycle-command.spec.ts`
- Modify: `tests/dsh-migration/controlled-lifecycle-profile.spec.ts`
- Modify: `tests/dsh-migration/one-shot-profile-lifecycle.spec.ts`
- Modify: `tests/dsh-migration/ordinary-long-goal-cli.spec.ts`
- Modify: `tests/dsh-migration/portable-goal-cli.spec.ts`
- Modify: `tests/dsh-migration/portable-plugin-lifecycle.e2e.spec.ts`
- Modify: `tests/dsh-migration/portable-profile-composition.e2e.spec.ts`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `tests/dsh-migration/runtime-profile.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-artifact.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-host.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-locale.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts`
- Modify: `tests/dsh-migration/tianwen-installer.spec.ts`
- Modify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`
- Modify: `tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts`

**Interfaces:**
- Consumes: current identity Runtime `0.1.4`, Desktop `0.1.0-preview.5`, same-DSH predecessor Runtime `0.1.3`.
- Produces: current identity Runtime `0.1.5`, Desktop `0.1.0-preview.6`, same-DSH predecessor Runtime `0.1.4`, archive `tianwen-runtime-bundle-0.1.5.tgz`.

- [ ] **Step 1: Install the locked workspace dependencies on `D:`**

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack-home'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
$env:NPM_CONFIG_CACHE = 'D:\DevData\npm-cache'
pnpm install --frozen-lockfile
```

Expected: exit 0; `pnpm-lock.yaml` remains unchanged.

- [ ] **Step 2: Change the existing release-contract tests first**

Update current Runtime assertions and filenames from `0.1.4` to `0.1.5`,
Desktop assertions from `preview.5` to `preview.6`, and only semantic predecessor
assertions from `0.1.3` to `0.1.4`. Historical/tampered fixture values such as
`0.0.0`, `0.1.1`, or future/unknown versions remain unchanged.

The key exact assertions must include:

```ts
expect(runtimeManifest.version).toBe('0.1.5')
expect(desktopManifest.version).toBe('0.1.0-preview.6')
expect(desktopRuntimeArchive).toBe('tianwen-runtime-bundle-0.1.5.tgz')
expect(classifyManagedInstallation(runtime014Fixture)).toBe('managed-runtime-predecessor')
```

- [ ] **Step 3: Run the smallest release tests and observe the red state**

```powershell
node node_modules/vitest/vitest.mjs run `
  tests/dsh-migration/tianwen-installer.spec.ts `
  tests/dsh-migration/tianwen-desktop-artifact.spec.ts `
  tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts
```

Expected: FAIL because production still identifies Runtime `0.1.4` / Desktop
`preview.5` and recognizes Runtime `0.1.3` as predecessor.

- [ ] **Step 4: Implement the exact version boundary with existing constants**

Apply these values consistently in the production/version-source files:

```text
current Runtime package/version:        0.1.5
current Runtime archive:                tianwen-runtime-bundle-0.1.5.tgz
same-DSH Runtime predecessor:           0.1.4
predecessor archive:                    tianwen-runtime-bundle-0.1.4.tgz
current Desktop package/version:        0.1.0-preview.6
Desktop update copy:                    Runtime 0.1.4 -> 0.1.5
DSH current/predecessor versions:       unchanged
```

In `scripts/install-tianwen.mjs`, preserve the existing exact-state classifier
and rollback flow. Only move its current and same-DSH predecessor identities
forward one Runtime release. In Desktop, preserve the existing confirmation,
single `plugin add`, strict revalidation, and refusal/error behavior.

- [ ] **Step 5: Correct only current public release facts**

Update README and architecture statements that describe the currently shipped
Runtime/Desktop identity or upgrade instruction. Do not rewrite historical
operation handoffs or claim that `0.1.5` has already passed installed proof.

- [ ] **Step 6: Run the focused release contract set**

```powershell
node node_modules/vitest/vitest.mjs run `
  tests/dsh-migration/controlled-lifecycle-command.spec.ts `
  tests/dsh-migration/controlled-lifecycle-profile.spec.ts `
  tests/dsh-migration/one-shot-profile-lifecycle.spec.ts `
  tests/dsh-migration/ordinary-long-goal-cli.spec.ts `
  tests/dsh-migration/portable-goal-cli.spec.ts `
  tests/dsh-migration/portable-plugin-lifecycle.e2e.spec.ts `
  tests/dsh-migration/portable-profile-composition.e2e.spec.ts `
  tests/dsh-migration/runtime-bundle.spec.ts `
  tests/dsh-migration/runtime-profile.spec.ts `
  tests/dsh-migration/tianwen-desktop-artifact.spec.ts `
  tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts `
  tests/dsh-migration/tianwen-desktop-host.spec.ts `
  tests/dsh-migration/tianwen-desktop-locale.spec.ts `
  tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts `
  tests/dsh-migration/tianwen-installer.spec.ts `
  tests/dsh-migration/tianwen-startup.e2e.spec.ts `
  tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Run Runtime/Desktop build checks and verify the diff**

```powershell
pnpm --filter '@tianwen/runtime-bundle...' build
pnpm --filter '@tianwen/desktop-host' build
git diff --check
git status --short
```

Expected: builds pass; no lock-file or generated `dist` change is staged.

- [ ] **Step 8: Commit the release identity**

```powershell
git add .github/workflows/ci.yml README.md README.zh-CN.md `
  docs/tianwen-architecture-overview-v2.md `
  packages/tianwen-runtime-bundle packages/tianwen-desktop-host `
  scripts/install-tianwen.mjs scripts/verify-dsh-profile.mjs `
  scripts/stage-desktop-runtime.mjs scripts/audit-desktop-artifact.mjs `
  tests/dsh-migration
git commit -m "chore: release Tianwen Runtime 0.1.5"
```

---

### Task 2: Build and prove the installed 0.1.4 -> 0.1.5 product

**Files:**
- Create: `docs/operations/tianwen-runtime-0.1.5-release-handoff.md`
- Generated outside Git: timestamped `D:\DevData\tw015-artifacts-*\**`
- Generated outside Git: timestamped `D:\DevData\tw015-proof-*\**`
- Temporary detached worktree: `D:\DevData\tianwen-worktrees\tw014-predecessor`

**Interfaces:**
- Consumes: Task 1 Runtime `0.1.5`/Desktop `preview.6`, exact accepted predecessor source `c39c7c6d9e755aff31ee0e5358b3b5d02557837b`, historical predecessor archive SHA-256 `46d7641ed7e086d5091c47a4ad97ad767629b4542d456d3f92ec9782a8dd71ed`.
- Produces: packed Runtime archive, unpacked Desktop, one NSIS installer, managed upgrade/replay result, release handoff.

- [ ] **Step 1: Allocate short isolated product and artifact roots**

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$artifactRoot = "D:\DevData\tw015-artifacts-$stamp"
$proofRoot = "D:\DevData\tw015-proof-$stamp"
New-Item -ItemType Directory -Path "$artifactRoot\packs" -Force
```

Record the two exact paths in the handoff. Do not reuse or mutate any historical
proof/product directory.

- [ ] **Step 2: Build the exact Runtime and Desktop artifacts**

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack-home'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
$env:NPM_CONFIG_CACHE = 'D:\DevData\npm-cache'
$env:ELECTRON_CACHE = 'D:\DevData\electron-cache'
$env:ELECTRON_BUILDER_CACHE = 'D:\DevData\electron-builder-cache'

pnpm --filter '@tianwen/runtime-bundle...' build
pnpm --filter '@tianwen/runtime-bundle' pack --pack-destination "$artifactRoot\packs"
$runtimeArchive = "$artifactRoot\packs\tianwen-runtime-bundle-0.1.5.tgz"
node scripts/stage-desktop-runtime.mjs $runtimeArchive
pnpm --filter '@tianwen/desktop-host' build
pnpm --filter '@tianwen/desktop-host' pack:dir
pnpm --filter '@tianwen/desktop-host' pack:win
node scripts/audit-desktop-artifact.mjs 'dist\tianwen-desktop\win-unpacked' $runtimeArchive
```

Expected: exit 0; `Get-FileHash $runtimeArchive -Algorithm SHA256` succeeds;
`dist\tianwen-desktop` contains exactly one
`Tianwen Desktop Setup 0.1.0-preview.6.exe`.

- [ ] **Step 3: Establish the exact accepted Runtime 0.1.4 predecessor**

Create the detached source through Git's supported worktree mechanism:

```powershell
git worktree add --detach 'D:\DevData\tianwen-worktrees\tw014-predecessor' `
  c39c7c6d9e755aff31ee0e5358b3b5d02557837b
node 'D:\DevData\tianwen-worktrees\tw014-predecessor\scripts\install-tianwen.mjs' `
  --data-dir $proofRoot --json
```

Expected: exit 0, `status=ready`, DSH `0.1.1-rc.2`, Runtime `0.1.4`, and the
produced predecessor archive hash equals
`46d7641ed7e086d5091c47a4ad97ad767629b4542d456d3f92ec9782a8dd71ed`.
If deterministic pack bytes differ, stop and report the exact archive hash;
do not relabel the predecessor or use the historical proof directory in place.

- [ ] **Step 4: Snapshot only product-owned preservation facts**

Before upgrade, record SHA-256 manifests for the installed DSH host, receipt,
managed Profile, Runtime archives, and any naturally existing Session/evolution
files. Sort by path before hashing. Do not create a fake Session or place a
marker under `DSH_HOME`.

- [ ] **Step 5: Upgrade once with the candidate official installer**

```powershell
node scripts/install-tianwen.mjs --data-dir $proofRoot --json
```

Expected: exit 0 and `status=ready`; exact Runtime becomes `0.1.5`; DSH host
manifest and naturally existing user-state manifests are unchanged; both
`0.1.4` and `0.1.5` archives remain; the receipt's `archiveDigest` equals the
candidate packed archive digest.

- [ ] **Step 6: Replay current installation once**

```powershell
node scripts/install-tianwen.mjs --data-dir $proofRoot --json
```

Expected: exit 0 and `status=ready`; receipt, Profile, current archive, DSH
host, and user-state manifests remain byte-identical; no `.install-*` or
`.tianwen-backup-*` directory remains.

- [ ] **Step 7: Run one provider-free installed startup boundary**

Use the built unpacked Desktop and the installed exact-current Profile with the
existing Desktop host E2E boundary. Clear Provider credential variables. Verify
one loopback HTTP root response, normal stop, and no owned DSH process remains.
Do not automate or repeat the interactive outdated-Profile confirmation path;
the focused deterministic tests cover it.

- [ ] **Step 8: Write and commit the release handoff**

Create `docs/operations/tianwen-runtime-0.1.5-release-handoff.md` with separate
sections:

```text
Product result
Artifact identities and hashes
Installed upgrade and replay
Provider-free startup
Deterministic verification
Failures retained honestly
External actions not taken
Cleanup and retained evidence
```

Record actual SHAs, paths, hashes, commands, exit results, and uncertainty. Do
not turn internal events into Provider billing facts.

```powershell
git add docs/operations/tianwen-runtime-0.1.5-release-handoff.md
git commit -m "docs: record Tianwen Runtime 0.1.5 release"
```

---

### Task 3: Review, integrate, and close exact main

**Files:**
- No planned product changes. Review findings return to their owning task with a focused regression test.

**Interfaces:**
- Consumes: exact feature SHA, Task 1 tests/builds, Task 2 artifact/proof handoff.
- Produces: controlled main merge, pushed exact main SHA, exact-main CI result, supported worktree cleanup.

- [ ] **Step 1: Run one final independent diff review**

Review the feature range from merge base through HEAD for release identity,
predecessor correctness, historical-fact honesty, unnecessary abstraction, and
unplanned external effects. Do not rerun tests already recorded by Tasks 1-2.

- [ ] **Step 2: Recheck only the final feature facts**

```powershell
git diff --check
git status --short --branch
git log --oneline --decorate -5
```

Confirm the worktree is clean and the final feature SHA is the reviewed SHA.

- [ ] **Step 3: Merge into current clean main and push**

Fetch `origin/main`, require local main and origin main to match, merge with a
normal merge commit, verify the merge tree, then push `main`. Do not tag or
publish artifacts.

- [ ] **Step 4: Check exact-main CI once**

Use the GitHub read-only Actions API for the exact pushed SHA. Report Python,
TypeScript, installer-windows, and desktop-windows separately. Do not trigger,
cancel, or rerun workflows.

- [ ] **Step 5: Clean only reproducible execution residue**

Remove the detached `tw014-predecessor` through `git worktree remove` after its
SHA and artifact hash are in the handoff. Retain the final `tw015-artifacts-*`
and `tw015-proof-*` roots as release evidence. Remove only installer temporary
directories and regenerable caches confirmed unused; do not touch historical
proof/evidence/product/debug directories or sibling worktrees.
