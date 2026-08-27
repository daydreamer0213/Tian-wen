# Tianwen DSH `0.1.1-rc.2` Managed Product Migration Handoff

Date: 2026-08-27

## Result

The managed-product migration implementation is complete on the isolated integration branch, but
the migration acceptance is classified as **incomplete**. It must not be described as a fully passed
release or merged to `main` under the frozen plan.

The final reviewed candidate before this handoff is
`965ee937e1df8f46e299f8dd7d99cdc9a0bd13e8` on
`codex/tianwen-dsh-rc2-product-migration`. The branch moves the current managed product from exact DSH
`0.1.0-rc.7` to exact DSH `0.1.1-rc.2`, carries the two Tianwen-owned exact-version patches, updates
current producers and documentation, and keeps historical `0.1.0-rc.7` facts unchanged.

The implementation, complete TypeScript/Python gates, managed Profile load, one-shot Profile
lifecycle, and concurrent cold boot passed. Two frozen one-shot acceptance commands did not pass:

1. the real old-product upgrade exposed a managed-predecessor receipt regression;
2. the combined formal-startup/installed-controlled command exposed two test-fixture isolation
   defects.

Both causes were corrected and independently reviewed with repeatable offline tests. In accordance
with the frozen one-shot boundary, neither real command was rerun to replace its original result.

## Authority

- Migration design authority:
  `docs/superpowers/specs/2026-08-27-tianwen-dsh-0.1.1-rc.2-managed-product-migration-design.md`.
- Implementation plan:
  `docs/superpowers/plans/2026-08-27-tianwen-dsh-0.1.1-rc.2-managed-product-migration.md`.
- Integration worktree:
  `D:\DevData\tianwen-worktrees\tianwen-dsh-rc2-product-migration`.
- Exact old-product authority:
  `ceafb6bc5d842402c83a0030cb2c2c57105c0dd8` in the detached worktree
  `D:\DevData\tianwen-worktrees\tianwen-dsh-rc7-upgrade-authority`.
- Final implementation candidate before this handoff:
  `965ee937e1df8f46e299f8dd7d99cdc9a0bd13e8`.

## Implemented product changes

- Every current managed DSH dependency is pinned to exact `0.1.1-rc.2`.
- The installer recognizes only the exact current managed layout or the exact supported
  `0.1.0-rc.7` predecessor layout. Predecessor CLI proof follows the public installed CLI's exact
  canonical realpath and remains fail-closed for missing, tampered, or source-linked paths.
- Both existing Tianwen-owned DSH patches were moved to the exact new package versions: boot-free
  Profile config dump and atomic Windows Profile dependency publication.
- Newly produced lifecycle, skill-evaluation, shadow, and model-configuration records identify
  `0.1.1-rc.2`. Exact old-version parsing remains only where persisted predecessor records must replay.
- The Python A1 evaluator accepts a controller-selected existing strict child of `D:\DevData` while
  preserving independent TypeScript and Python containment checks.
- Default Profile verification performs its existing offline dependency prefetch explicitly before
  the one public Profile add.
- Startup acceptance fixtures inherit the controller-selected pnpm store and keep TEMP/virtual-store
  directories beside, rather than inside, the supposedly fresh product root.

No second Agent loop, Profile system, migration database, retry framework, telemetry system, or
general version-negotiation layer was added.

## Real old-product upgrade result

The enabled acceptance ran exactly once at candidate
`64c881aa5dcc9a35886144e3eb488f11a9c90afb`, from
2026-08-27T21:30:37+08:00 to 21:37:36+08:00.

- The official exact `0.1.0-rc.7` install succeeded.
- Synthetic Session and Evolution sentinels were written and hashed.
- The candidate upgrade stopped at `managed-layout-preflight` before mutation.
- The installed product remained exact `0.1.0-rc.7`.
- Sentinel hashes remained unchanged.
- No installer backup, temporary-copy, or staging residue remained.

Evidence:
`D:\DevData\tianwen-dsh-rc2-product-migration\evidence\real-upgrade-one-shot-20260827.log`.

Read-only diagnosis proved that the old receipt stores the canonical pnpm virtual-store CLI path,
whereas the new predecessor proof had compared it with the public linked CLI path. The strict fix is
commit `3831ce35f9d0607079b7c09b0f008d21c7143aad`. Its regression suite constructs a real public-to-
canonical junction and passes 50/50 installer tests. A read-only classification against the
preserved old product now returns exact `managed-predecessor`.

This is evidence that the identified regression was fixed; it is not a replacement passed upgrade
run. The frozen real-upgrade result remains failed.

## Fresh install and managed real-process results

The combined formal-startup and installed-controlled acceptance ran once and failed; it was not
rerun.

- Formal startup stopped at `managed-layout-preflight` because the test helper had created its TEMP
  and pnpm virtual-store directories inside the fresh product root before invoking the strict
  installer.
- Installed-controlled setup stopped at installer `workspace-install` because the helper overrode
  the repository's selected project pnpm store with another D-drive store.
- The helper defects were fixed in
  `965ee937e1df8f46e299f8dd7d99cdc9a0bd13e8` without changing installer or Runtime behavior.
- Independent default verification passed 3 tests with the 2 real opt-in tests skipped; typecheck
  passed.

Evidence:
`D:\DevData\tianwen-dsh-rc2-product-migration\evidence\real-process-startup-one-shot.log`.

Other one-shot managed product paths passed:

- Managed Profile: 6 passed / 1 skipped, exit 0, 55.76 seconds.
  Evidence: `D:\DevData\tianwen-dsh-rc2-product-migration\evidence\managed-profile-one-shot.log`.
- One-shot Profile lifecycle: 3/3 passed, exit 0, 50.49 seconds.
  Evidence: `D:\DevData\tianwen-dsh-rc2-product-migration\evidence\profile-lifecycle-one-shot.log`.
- Concurrent cold Profile boot: 8/8 passed, 428 links, 7268 ms, exit 0.
  Evidence: `D:\DevData\tianwen-dsh-rc2-product-migration\evidence\profile-concurrent-one-shot.log`.

These passing paths prove that the exact new Runtime/Profile combination builds, prepares, loads,
stops, and publishes concurrent dependencies correctly. They do not turn either failed acceptance
command into a pass.

## Complete local gates

The complete local repository gate ran at implementation candidate
`3831ce35f9d0607079b7c09b0f008d21c7143aad`. The later commit
`965ee937e1df8f46e299f8dd7d99cdc9a0bd13e8` changes only the startup test fixture and subsequently
passed its focused default spec and typecheck.

- Frozen pnpm install: passed.
- Runtime Bundle build: passed.
- TypeScript typecheck: passed.
- DSH install consistency: passed with exact `0.1.1-rc.2` current dependencies.
- No-private-DSH-import check: passed.
- Full TypeScript gate: 55 files, 53 passed / 2 skipped; 716 tests, 707 passed / 9 skipped; exit 0.
- Ruff: passed.
- Python compileall: passed.
- Pytest: 608 passed / 4 skipped; exit 0. The paid live-model test and documented Windows capability
  cases remained skipped.
- Final startup fixture default spec: 3 passed / 2 real opt-in skipped; exit 0.
- Final typecheck: passed.

All dependency stores, virtual environments, selected products, caches, and generated evidence were
kept under `D:\DevData`. No generated product or dependency tree is committed.

## Historical and external facts

- Historical Activity, operation, release, evidence, debug, and legacy data were not rewritten,
  migrated, or cleaned.
- Historical records that actually used `0.1.0-rc.7` keep that exact version.
- No controlled Activity was created.
- No real DeepSeek or other external/live Provider request was enabled for this migration.
- Tool counts and Session events are not presented as Provider billing facts.
- No DSH upstream branch or patch was pushed.
- No npm package, GitHub Release, installer, or desktop build was externally published.
- No exact-main CI result exists for this candidate because the candidate is not integrated to
  `main`.

## Integration decision and next stage

Under the frozen plan, this branch is **not eligible for `main` integration** because the real
old-product upgrade and the combined formal-startup/installed-controlled acceptance did not finish
green. The stage is closed as an honest incomplete acceptance, not kept open for repeated real runs.

The next product work is the already approved portable DSH plugin stage:

1. make one Runtime Bundle target a user-selected DSH home, Profile, and Tianwen state root;
2. install/remove it through DSH's public Profile command without modifying other Profiles or
   deleting persistent state;
3. make the same package load in headless and Web hosts without a desktop-only capability;
4. retain the Tianwen managed installer as an optional convenience path;
5. build an optional desktop distribution from a fixed DSH Desktop source only after the portable
   Profile contract is stable.

Package/state-root, CLI lifecycle, and headless/Web composition may proceed as separate reviewed
lanes after their shared minimal interface is frozen. Desktop source review, naming research, and
packaging design may run in parallel, but desktop implementation must consume the same portable
Bundle rather than create a second Tianwen product.
