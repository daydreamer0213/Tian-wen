# Tianwen DSH `0.1.1-rc.2` Managed Product Migration Design

Date: 2026-08-27 (Asia/Shanghai)

Status: approved direction, written design awaiting user review

## Decision

Tianwen will migrate its current managed product from the older exact DSH version
`0.1.0-rc.7` to the newer exact DSH version `0.1.1-rc.2`.

The project will not introduce a permanent dual-version product framework. After this migration,
all current product code, the official installer, the installed host, managed Profiles, receipts,
current lifecycle manifests, and newly produced evaluation records use exact `0.1.1-rc.2`.

The installer retains one narrowly defined predecessor path for an exact, complete managed
`0.1.0-rc.7` installation. This exists only to upgrade the product that Tianwen currently ships.
It is not a general multi-version compatibility layer.

## Version terminology

This design always uses the full versions because the release-candidate suffix alone is
misleading:

- **new version:** `0.1.1-rc.2`;
- **old version and only supported predecessor:** `0.1.0-rc.7`.

`0.1.1-rc.2` is newer because `0.1.1` is greater than `0.1.0`; the `rc.2` and `rc.7` counters are
only ordered inside their respective base versions.

## Authority and evidence

- The approved portable-product direction is recorded in
  `docs/superpowers/specs/2026-08-27-tianwen-portable-dsh-plugin-and-optional-desktop-design.md`.
- The reviewed compatibility research record is
  `docs/operations/tianwen-dsh-rc2-compatibility-spike-handoff.md` at commit
  `d41508ad44264c254495a3bb6e496589718c7ea6`.
- The exact old managed-product source authority is local `main` commit
  `ceafb6bc5d842402c83a0030cb2c2c57105c0dd8`. At that commit, the workspace and official
  installer use `0.1.0-rc.7`.
- The compatibility candidate uses exact upstream tag `dsh-v0.1.1-rc.2`, peeled commit
  `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.
- Both DSH boundary patches remain required on the new exact version: boot-free cold config dump
  and atomic Windows Profile publication are each classified `port`.

The compatibility research passed the candidate-specific runtime gates but recorded a red full
TypeScript repository gate: 661 tests passed, 8 skipped, and 12 failed. Seven failures came from
the official product still describing `0.1.0-rc.7`, four from a fixed Python A1 authority root,
and one from missing explicit offline-cache preparation. This design resolves those three product
and validation boundaries without rewriting historical evidence.

## Goals

1. Make the official Tianwen installer deploy and verify exact DSH `0.1.1-rc.2`.
2. Upgrade an exact managed `0.1.0-rc.7` installation to `0.1.1-rc.2` without losing persistent
   Tianwen state.
3. Preserve the installer's current atomic replacement and rollback behavior.
4. Make current product manifests, receipts, lifecycle output, and new evaluation records name the
   new version honestly.
5. Preserve old operation documents and persisted facts byte-for-byte and keep their old version
   labels readable.
6. Allow full-suite A1 tests to use a controller-authorized fresh `D:\DevData` root without
   weakening path containment.
7. Make the default Profile test's dependency-preparation phase explicit while keeping the actual
   public Profile installation offline and single-attempt.
8. Return the complete local repository gate to green before integration or portable-plugin work.

## Non-goals

- No portable plugin implementation, public package publication, or Desktop work.
- No real DeepSeek request, external/live Provider request, or billing inference.
- No edit to historical Activity, operation, receipt, evidence, research, release, or completed
  dated design/plan documents.
- No in-place use of an existing real Tianwen product directory. Product installation and upgrade
  verification use new isolated directories under `D:\DevData`.
- No general DSH version negotiation, version range, retry framework, new receipt schema, or
  multi-version runtime abstraction.
- No support for directly upgrading `0.1.0-rc.6` to `0.1.1-rc.2`. The supported predecessor is the
  product's current exact version, `0.1.0-rc.7`.

## Product version boundary

### One current exact version

All active current-product version constants and exact dependency pins converge on
`0.1.1-rc.2`:

- workspace DSH dependencies and lockfile;
- `@tianwen/dsh-host` and `@tianwen/profile-host`;
- Runtime and Runtime Bundle DSH dependencies;
- official installer host and Profile dependencies;
- installed-product version preflight in the Runtime Bundle;
- install receipt, controlled-lifecycle manifest, and newly emitted learning/evaluation records;
- current public README and architecture-status statements.

The migration does not add a new shared version helper. Package manifests, the installer, and
runtime code already have separate compile-time responsibilities; exact closure tests detect
drift between them.

### One supported predecessor

The installer changes its current version from `0.1.0-rc.7` to `0.1.1-rc.2` and changes its sole
predecessor from `0.1.0-rc.6` to `0.1.0-rc.7`.

The predecessor classification accepts only a complete managed layout whose host, base/headless
Profile dependencies, archive metadata, and existing receipt consistently identify exact
`0.1.0-rc.7`. Partial, arbitrary, mixed-version, source-linked, or unproven layouts remain
rejected unless an existing explicit repair path already covers them.

The existing `tianwen.install.v1` receipt schema remains sufficient because it already records the
exact `dshVersion`; only the value changes for a successful new installation.

### Historical facts remain historical

Current producers write `0.1.1-rc.2`. Readers that replay already persisted lifecycle or
evaluation facts continue to accept an old `0.1.0-rc.7` fact and preserve its original version.
They must not translate an old fact into the new version.

The following remain unchanged:

- `docs/operations/**` and Activity packets;
- `docs/research/**` and the `v0.1.0` release record;
- completed dated specs and plans, including the compatibility spike handoff;
- the frozen JSONL forward-compatibility generator's `0.1.0-rc.7` source version;
- the `0.1.0-rc.7` versus `0.1.1-rc.2` performance comparison labels;
- retained old-version patch files used as historical patch source evidence.

Tests that assert the contents of those historical files remain on `0.1.0-rc.7`. Tests that
construct the current official product, current receipt, current Profile, or newly produced
manifest change to `0.1.1-rc.2`.

## Installer behavior

### Fresh installation

In a new isolated product root, the official installer must:

1. install an exact `0.1.1-rc.2` DSH host;
2. install exact `0.1.1-rc.2` base and headless Profile dependencies;
3. apply the two reviewed exact-version pnpm patches;
4. deploy the current Tianwen Runtime Bundle;
5. validate boot-free dump and real Profile boot;
6. write a ready receipt containing `dshVersion: 0.1.1-rc.2`;
7. leave no staging or backup residue.

### Upgrade from the old managed product

The real upgrade acceptance uses two code authorities in one new isolated test root:

1. The exact old product source at `ceafb6bc5d842402c83a0030cb2c2c57105c0dd8` installs a real
   managed `0.1.0-rc.7` product.
2. The controller writes synthetic, non-secret Session and Tianwen persistent-state fixtures and
   records their byte hashes.
3. The candidate official installer runs exactly once against that isolated product root.
4. Host, Profiles, Runtime, and receipt must become exact `0.1.1-rc.2`.
5. Persistent-state fixture bytes must remain unchanged.
6. Dump, real offline boot, and bounded current CLI commands must succeed.
7. A second installer invocation verifies current-version idempotence: no repeated deployment,
   duplicate Runtime layer, staging residue, or backup residue.

The old installer is invoked from an isolated Git worktree or packed authority. The verification
does not modify local `main`, the existing real installed product, or any historical evidence root.

### Rollback

The current rollback skeleton is retained and retargeted from the former predecessor to exact
`0.1.0-rc.7`. Scripted failure tests continue to cover failure after host deployment and during
Profile/package/dump validation. On failure, the old host, Profile, archive, receipt, and persistent
state must be restored. A second real failure-injection framework is not added.

## Fresh A1 authority root

`PythonA1EvaluatorOptions` gains one optional controller-owned field:

```ts
readonly authorityRoot?: string
```

When omitted, current default behavior remains unchanged. When provided, the root is accepted only
when it is:

- an existing absolute directory;
- a strict child of `D:\DevData`, never `D:\`, `D:\DevData`, a system directory, or another drive;
- not a symlink, junction, or other reparse point;
- realpath-equal to the supplied canonical path.

The evaluator's state root and explicitly selected Python executable must remain inside that
authority root, apart from the already-supported repository-local default Python environment.
Evaluations, workspaces, TEMP, and TMP retain their existing descendant and reparse-point checks.

The TypeScript controller passes the validated root to the Python worker through a fixed
`--authority-root` process argument. The worker independently validates the same containment. The
model, evaluation request JSON, and ambient environment cannot choose this authority.

Tests pass their already selected fresh `TIANWEN_DSH_PROBE_ROOT` explicitly as `authorityRoot`.
Negative tests keep proving rejection of a non-Python executable and escaping evaluation roots,
and add narrow checks for a relative root, `D:\`, `D:\DevData`, another drive/system directory,
and an authority-root reparse point.

This is a parameterized existing boundary, not a general filesystem-authority framework.

## Explicit offline dependency preparation

The default Profile test calls the existing `prefetchOfflineDependencies()` fixture before its
single verifier invocation, matching the already-passing opt-in migration test.

The prefetch phase:

- uses the selected fresh root's own store, cache, temp directory, and empty npm configuration;
- receives no user/global npm configuration or credentials;
- may access the package registry only during the named preparation phase;
- removes its temporary preparation workspace afterward.

The actual public `dsh plugin ... add --offline` and Profile verification remain offline and run
once. A failure remains a failure; no retry, fallback registry access, or shared-cache assumption is
introduced. Preparing a few unused Runtime dependencies in the default test is acceptable and
smaller than creating a second prefetch abstraction.

## Test classification

The implementation updates tests by what they represent, not by searching and replacing version
strings:

1. **Current product tests** move to `0.1.1-rc.2`: official installer, startup, model
   configuration, installed-product lifecycle, current Profile, and current record producers.
2. **Predecessor tests** move from the former predecessor to exact `0.1.0-rc.7`: upgrade,
   rollback, and idempotence.
3. **Historical evidence tests** remain unchanged and continue to assert old documents and old
   persisted facts as `0.1.0-rc.7`.
4. **Forward-compatibility tests** continue to read old facts and prove they are not rewritten.

No historical document is edited merely to make a contract test green.

## Acceptance gates

The migration is acceptable only when all of the following are true:

1. Exact dependency closure, typecheck, public-root imports, and both new-version pnpm patches pass.
2. Focused Runtime, Goal, Session, resume, Tool, Skill, Evidence, HMR, and Profile suites pass.
3. Installer unit and integration tests pass for fresh install, old-version upgrade, rollback, and
   current-version idempotence.
4. The isolated real `0.1.0-rc.7` to `0.1.1-rc.2` official-installer upgrade passes once, with a
   second bounded idempotence invocation and byte-preserved persistent state.
5. Python Ruff, compileall, and pytest pass in a D-drive environment.
6. The complete TypeScript repository gate passes with zero failed tests using a new authorized
   `D:\DevData` root.
7. The managed-style real Profile, one-shot lifecycle, and concurrent Profile probes pass from new
   roots without an external/live Provider request.
8. Independent review finds no historical evidence rewrite, version-check weakening, private DSH
   import, Desktop dependency, or generated data staged in Git.
9. After controlled integration, exact-main CI must pass Python, TypeScript, and
   `installer-windows` for the exact merged SHA before the migration is called shipped.

The branch is not merged or pushed merely because focused compatibility tests pass.

## Failure classification

- A failure in exact `0.1.1-rc.2` public API, Runtime, official installation, old-product upgrade,
  rollback, persistent-state preservation, or real Profile boot blocks migration.
- A registry timeout during explicit dependency preparation is an external setup failure and is
  reported separately; it is not hidden with repeated product execution.
- A test that still models the current product as `0.1.0-rc.7` is corrected only after confirming
  it is not a historical-evidence assertion.
- A historical evidence assertion that remains `0.1.0-rc.7` is expected and must not be changed.

## Integration and next product stage

Implementation occurs on a new isolated branch/worktree derived from the reviewed compatibility
record. Each bounded task receives an independent review. The official installer and real upgrade
run only in new `D:\DevData` product roots.

After all local gates are green, the reviewed branch may be integrated through a controlled merge
and exact-main CI. Only then does the project write and execute the portable-plugin implementation
plan. The portable Runtime remains dependent on DSH CLI/Profile services rather than DSH Desktop;
Desktop stays an optional later shell.
