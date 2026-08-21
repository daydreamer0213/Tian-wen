# Tianwen managed rc.6 to rc.7 install migration implementation plan

**Goal:** Make the existing official installer upgrade the two known
installer-produced rc.6 layouts to the already-supported exact rc.7 ready
state, transactionally and offline, so Stage 7 Task 8 can continue on the
existing product Profile.

**Base main:** `a2d131d479e6ad5e282478e526059773e67622b1`

**Design:**
`docs/superpowers/specs/2026-08-21-tianwen-rc6-rc7-managed-install-migration-design.md`

**Implementation branch:** `codex/tianwen-rc6-rc7-managed-install-migration`

## Fixed boundaries

- Reuse `scripts/install-tianwen.mjs`; add no new command, dependency, package,
  Runtime, Profile, store, database, migration framework or background process.
- Support only exact managed rc.6 -> rc.7. Unknown/modified/mixed layouts fail.
- Do not read credentials or run Provider, model, Docker, Alpha or old Dynamic
  Runtime code.
- Reuse the existing D-drive `node_modules` and pnpm store. No install,
  download, new worktree, clone, Profile, `.venv` or probe is authorized.
- Never clean unknown files. Fixture roots must be empty before tests and empty
  after tests; unknown content is a stop condition.
- Write tests before implementation and stop on any unrelated baseline failure.

## Workspace setup

1. Reuse the clean D-drive Stage 7 implementation worktree only after the
   supervisor supplies an exact committed design+plan SHA.
2. Create/switch to the implementation branch at that exact SHA.
3. Confirm local HEAD, origin tracking and `git ls-remote` agree with the
   supplied docs SHA.
4. Confirm the Stage 7 fixture root has zero files and zero bytes.
5. Run the existing clean-build prerequisite, then the focused baseline:

```powershell
pnpm --filter @tianwen/runtime... build
pnpm --filter @tianwen/runtime-bundle... build
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-startup.e2e.spec.ts
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
```

Do not run the legacy `runtime-profile.spec.ts` diagnostic.

## Task 1: Freeze the two real predecessor contracts

**Files:**

- Modify `scripts/install-tianwen.mjs`.
- Modify `tests/dsh-migration/tianwen-installer.spec.ts`.

### RED

Add fixture helpers for:

1. the original installer rc.6 host/Profile now present at
   `D:\DevData\tianwen` (fixed archive dependency and original patch);
2. the later locked-deploy rc.6 host/Profile (normalized Runtime version and
   current managed patch).

The first RED must show a pure predecessor-classification seam is missing or
rejects both complete historical shapes. Also prove rc.5, partial, mixed and
one modified managed Profile remain incompatible. For every incompatible
already-existing root, snapshot its entries and bytes and require zero child
calls plus zero filesystem changes; in particular the installer must not
create a missing `receipts` directory before rejecting it.

### GREEN

Refactor only the shared host/Profile validators enough to classify:

- absent/fresh;
- exact current rc.7;
- exact known managed rc.6 predecessor;
- incompatible.

Keep final `validateInstalledHost()` and `validateProfile()` strict rc.7
validators. Add no registry, migration class or generic version table. The
known original patch may be one fixed renderer/string beside the current
renderer. Task 1 only recognizes the predecessor; `installTianwen()` must not
start replacing it until Task 2's rollback contract is RED.

Move/refactor the existing data-root containment check only as much as needed
to classify an already-existing root before any `mkdirSync`. Preserve the
current fresh-install behavior for an absent data root. Do not add a generic
filesystem transaction or preflight framework.

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
git diff --check
```

Commit only after GREEN:

```text
feat: recognize managed rc6 installer predecessors
```

## Task 2: Replace the managed host transactionally

**Files:**

- Modify `scripts/install-tianwen.mjs`.
- Modify `tests/dsh-migration/tianwen-installer.spec.ts`.

### RED

Add one migration success contract plus two failure contracts: failure during
the new host deploy after it has written a partial candidate, and failure after
the new host has validated. The contracts must capture bytes for a host
sentinel, Profile manifest/patch, archive/receipt when present, Session fixture
and Evolution fixture.

Required RED facts:

- the current installer cannot produce an rc.7 host from the rc.6 fixture;
- the existing host transaction does not yet exist, so a partial host deploy or
  a later pack/Profile/dump failure cannot restore the rc.6 fixture.

### GREEN

Use the existing same-volume backup pattern:

1. rename the validated rc.6 host to a unique sibling backup;
2. deploy `@tianwen/dsh-host` to the original final path;
3. validate exact rc.7;
4. keep the old host backup until the existing archive/Profile/receipt
   transaction commits;
5. force Profile replacement for every recognized rc.6 predecessor regardless
   of any stale receipt/archive digest equality;
6. on any later failure remove the candidate and restore the old host;
7. after receipt commit remove the backup best-effort.

The same rollback `try/catch` must cover the interval from the rc.6 host rename
through host deployment, host validation, Runtime/Profile work and receipt
publication. A deploy command that writes a partial host and then exits nonzero
must remove that candidate and restore the exact rc.6 host, with no candidate
or backup residue.

Do not change Session/Evolution paths or receipt schema. Do not alter fresh
install behavior beyond code movement necessary to share validation.

Prove:

- both known predecessors migrate;
- exact rc.7 host/Profile/receipt validate;
- durable Session/Evolution bytes are unchanged;
- no backup remains after success;
- failure restores the rc.6 bytes and last published archive/receipt;
- second invocation is ordinary rc.7 replay with no host/Profile deploy;
- no plugin command, network option or shell invocation appears.

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
pnpm --filter @tianwen/runtime-bundle... build
git diff --check
```

Commit:

```text
fix: migrate managed DSH installs to rc7
```

## Task 3: Product regression and cautious handoff

**Files:**

- Modify `tests/dsh-migration/tianwen-startup.e2e.spec.ts` only if the existing
  installer E2E can cover migration without duplicating its setup.
- Create
  `docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md`.
- Modify `tests/contracts/test_public_repository_surface.py` only to lock the
  cautious handoff wording if needed.

Prefer extending the existing installer test over creating another E2E. The
handoff must say:

- exact rc.6 -> rc.7 managed migration is supported;
- arbitrary versions/modified installs remain unsupported;
- Session/Evolution bytes are preserved;
- this is not a second Runtime or migration framework;
- no Provider, paid model, Docker or new Profile was used;
- Task 8 remains pending until main CI and the real product migration finish.

Run the available local Python contract only with the existing D-drive Python.
If it is absent, record the local Python gate unavailable and rely on exact-main
Python CI; do not create a `.venv` or run bare `uv`.

## Task 4: Final local gates, review and feature push

Run serially:

```powershell
pnpm --filter @tianwen/runtime... build
pnpm --filter @tianwen/runtime-bundle... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-startup.e2e.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/goal-resume.spec.ts tests/dsh-probe/install-closure.spec.ts tests/dsh-probe/public-surface.spec.ts tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/natural-run-evidence-demo.spec.ts
pnpm demo:natural-run-evidence
git diff --check a2d131d479e6ad5e282478e526059773e67622b1..HEAD
```

Also run the focused Python public contract if the existing D-drive interpreter
is available. Confirm fixture root zero files/zero bytes and no new Profile,
worktree, clone, `node_modules`, `.venv` or probe.

Require three independent reviews against exact feature HEAD:

1. correctness/rollback and installer replay;
2. architecture/privacy/DSH-only boundary;
3. Ponytail/YAGNI and exact plan conformance.

Resolve only demonstrated Critical/Important findings. Do not implement
speculative live-process coordination, arbitrary version support or a backup
framework. Ordinary-push the feature branch and stop for supervisor approval.

## Task 5: Main integration (supervisor-only release gate)

After exact feature SHA approval:

1. merge once with `--no-ff` into clean main;
2. prove merge tree equals approved feature tree;
3. ordinary-push main once;
4. verify the unique automatic CI run has exact merge SHA and both Python and
   TypeScript jobs green.

On CI failure, collect only the failing job log and stop. Do not rerun, retry or
apply a main-only fix.

## Task 6: Resume Stage 7 Task 8

Only after exact-main CI is green:

1. record read-only digests/counts for files under the real Session and
   Evolution roots without printing contents;
2. invoke the main installer exactly once with
   `pnpm install:tianwen -- --data-dir D:\DevData\tianwen --json`, using the
   existing offline D-drive package-store environment;
3. confirm exact rc.7 host/Profile/receipt, zero downloads, no backup residue,
   and unchanged durable digests/counts;
4. resume the already-approved configured-Provider natural trial from its
   original preflight; do not create a replacement Profile or retry a failed
   model request;
5. keep the existing total 60 CNY user authorization as an external supervisor
   boundary only. Do not add price polling, snapshots, reservation or billing
   code.

If the real migration fails, restore/confirm the rc.6 product state, report the
precise failed gate and stop with 0 Provider. If it succeeds but Provider
preflight fails, stop with `natural-trial-pending` and 0 Provider as before.
