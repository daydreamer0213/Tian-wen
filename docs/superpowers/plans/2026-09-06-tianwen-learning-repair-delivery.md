# Learning Repair Versioned Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute only after the trusted-parent task review; one implementer, no concurrent production owner.

**Goal:** Prepare the existing immutable local upgrade path for the reviewed learning repairs.

**Architecture:** Reuse the current installer and Desktop native plugin-add flow.
Only release identities and exact predecessor recognition change. Controller owns
real upgrades, genuine acceptance, final whole-branch review, full gates and CI.

**Tech Stack:** Existing TypeScript/Vitest, Node 22, pnpm 11.20.0, DSH 0.1.1-rc.2.

**Design:** [Versioned delivery](../specs/2026-09-06-tianwen-learning-repair-delivery-design.md).

## Global Constraints

- New Runtime `0.1.13`; Desktop `0.1.0-preview.14`; DSH remains `0.1.1-rc.2`.
- Add exact same-DSH predecessor `0.1.12`; preserve `0.1.11`, `0.1.10` and the
  independently frozen old `0.0.0` / DSH `0.1.0-rc.7` migration paths.
- Current receipt/archive identities remain immutable. Never delete a receipt or
  overwrite same-version installed bytes to force an upgrade. Unknown versions reject.
- Reuse the verified identical frozen learning-loop patch for `0.1.11`/`0.1.12`;
  keep the `0.1.10` no-learning-loop patch distinct. Do not validate historical
  bytes against the evolving current renderer or duplicate identical templates.
- No dependency/toolchain/version-policy framework, ledger/schema, source-fidelity
  rule, model setting, permission, external source or acceptance-history changes.
- No real model calls, install/upgrade, Profile writes, default Electron packaging,
  CI dispatch, push, external package/tag/release or installer publication by worker.
- You are not alone in the codebase: preserve all other edits and commit only
  owned implementation/tests/README/CI metadata. Controller owns operation and plan docs.
- All generated data on D:. The active shortcut points to the worktree's default
  Desktop dist; never run `pack:dir` or `pack:win` into that output.

## Task 1: Patch identities and exact current-predecessor upgrade

**Owned production/metadata files:**
- `packages/tianwen-runtime-bundle/package.json`
- `packages/tianwen-runtime-bundle/src/portable-profile.ts`
- `packages/tianwen-runtime-bundle/src/controlled-lifecycle.ts`
- `packages/tianwen-desktop-host/package.json`
- `packages/tianwen-desktop-host/src/host.ts`
- `packages/tianwen-desktop-host/src/main.ts`
- `packages/tianwen-desktop-host/src/locale.ts`
- `packages/tianwen-desktop-host/src/profile-prepare.ts` for its predecessor comment only.
- `scripts/install-tianwen.mjs`
- `scripts/verify-dsh-profile.mjs`
- `scripts/stage-desktop-runtime.mjs`
- `scripts/audit-desktop-artifact.mjs`
- `README.md` current install commands, `.github/workflows/ci.yml` current archive arguments.

**Owned existing tests (only directly affected release/predecessor fixtures):**
- `tests/dsh-migration/tianwen-installer.spec.ts`
- `tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts`
- `tests/dsh-migration/tianwen-desktop-host.spec.ts`
- `tests/dsh-migration/tianwen-desktop-artifact.spec.ts`
- `tests/dsh-migration/runtime-bundle.spec.ts`
- `tests/dsh-migration/controlled-lifecycle-command.spec.ts`
- `tests/dsh-migration/controlled-lifecycle-profile.spec.ts`
- `tests/dsh-migration/one-shot-profile-lifecycle.spec.ts`
- `tests/dsh-migration/ordinary-long-goal-cli.spec.ts`
- `tests/dsh-migration/portable-goal-cli.spec.ts`
- `tests/dsh-migration/runtime-profile.spec.ts`
- `tests/dsh-migration/portable-plugin-lifecycle.e2e.spec.ts`
- `tests/dsh-migration/portable-profile-composition.e2e.spec.ts`
- `tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts`
- `tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts`
- `tests/dsh-migration/tianwen-startup.e2e.spec.ts`

**Interfaces:** Consume existing `deriveInstallPaths`, `classifyManagedInstallation`,
`installTianwen`, `resolveKnownOldDesktopTarget` and native plugin-add. Produce the
same public schemas with exact new release identity, using existing
`managed-runtime-predecessor` and `outdated-runtime` results. No new public API.

- [x] RED: add `0.1.12` cases alongside existing `0.1.11` historical fixtures,
  preserving their independent frozen patch. A small parameter on existing
  learning-loop fixture helpers may avoid copying their entire setup. Check the
  new current archive basename and demonstrate missing predecessor support before
  implementing it. The key behavior is:

  ```ts
  expect(deriveInstallPaths('D:\\DevData\\version-gate', 'win32').archivePath)
    .toBe('D:\\DevData\\version-gate\\packs\\tianwen-runtime-bundle-0.1.13.tgz')
  // For each actual independently assembled historical 0.1.11/0.1.12 fixture:
  expect(classifyManagedInstallation(paths)).toBe('managed-runtime-predecessor')
  ```

  Run installer/Desktop focused cases; retain command, expected failing output and
  cause. A missing file or fixture exception is not the intended RED.
- [x] Update current identities, archive basenames, README and CI arguments.
  Do not globally rewrite historical `0.1.12` evidence or new predecessor cases.
  Desktop's exact old-version list becomes:

  ```ts
  const knownOldRuntimeVersions = ['0.1.12', '0.1.11', '0.1.10'] as const
  ```

- [x] Installer recognizes the new exact old archive with the independently
  frozen learning-loop patch and existing receipt checks. Reuse/rename the frozen
  `renderRuntime011PredecessorProfilePatch` as appropriate for the two proven
  identical historical releases; preserve its body. Add the `0.1.12` archive to
  the existing old-DSH mixed-install refusal. Do not alter the current patch.
- [x] GREEN: run both learning-loop predecessors through real installer logic
  using existing isolated fixture runner. Assert archive/Session/state bytes are
  retained, no same-DSH host redeploy, one Profile deploy, ready receipt, repeat
  returns identical receipt without child effects, and failure restores the
  complete before snapshot. Preserve all old `0.1.10`/rc.7 regressions. Existing
  assertions to retain for each new case include:

  ```ts
  expect(scripted.calls.filter(argv => argv.includes('@tianwen/dsh-host'))).toHaveLength(0)
  expect(scripted.calls.filter(argv => argv.includes('@tianwen/profile-host'))).toHaveLength(1)
  expect([readFileSync(session), readFileSync(ledger)]).toEqual(durableBefore)
  expect(installWindowsFixture({ dataDir: paths.dataDir, runner: scripted.runner })).toEqual(migrated)
  expect(scripted.calls).toHaveLength(childEffects)
  ```

- [x] Negative fixtures: missing/tampered old archive, wrong receipt or changed
  frozen Profile, source-linked publication and unknown version refuse before
  child effects, with before/after snapshot equality. Keep current-version archive
  immutability checks. Desktop covers exact old recognition, cancellation, one
  plugin-add, selected DSH home/store and strict `0.1.13` post-update validation.
- [x] Update only current-version fixture expectations across the owned release
  suites. Old rc.7-to-rc.2 real E2E stays labeled as that test, not new upgrade
  proof. No model-dependent optional E2E activation by worker.
- [x] Run the owned covering suites with existing opt-in skips, root typecheck,
  forced all-package type build followed by Runtime bundle rebuild, then built
  artifact checks, public-import guard and diff check. Preserve first failures;
  forced tsc after bundle would make artifact evidence stale. Run no full repo
  regression or real installation; controller owns those once code is stable.
- [x] Self-review and commit only owned files. Write report with exact RED/GREEN,
  test commands/output, changed files, immutable predecessor evidence and remaining
  limits; independent task review is required before controller final gates.

## Controller closure

### Full-gate verification repair (separate from release metadata)

The first complete gate at `ff078bb` found one actual native integration failure
(1699 passed /1 failed /18 skipped). The new source reader accesses
`tianwenEvidence` through `TianwenLearningLoopService`, whose native inject list
does not declare that existing service. Diagnostic evidence shows failure before
Candidate or evaluator. The aggregate request fix's sole scoped review is clean;
this separate execution defect still prevents delivery.

- [x] Reproduce the native product story and add the missing existing service to
  `packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.ts` inject list.
  No new tools, services, permissions, Context escape or weaker source checks.
- [x] Synchronize `tests/dsh-migration/explicit-correction-product.e2e.spec.ts`
  with current explicit-feedback v3, preserving ordinary Outcome v2, public
  Candidate/evaluation/holdout/activation/transfer/rollback/report assertions and
  its no-test-owned-authority guard. Distinguish 14 total controlled Sessions
  from 13 Skill-using product Sessions; do not mechanically change both counts.
- [x] Focused native RED/GREEN and covering tests, build before artifact checks,
  independent scoped task review, then controller final full regression. No real
  model/history/installation mutation or reopened broad evaluation design.

Follow-through found a second existing native assembly defect: the declaration
repair reaches verified v3 promotion, but withdrawal rollback re-enters strict
active-feedback recovery and fails after feedback is withdrawn. Repair rollback
from its exact persisted governed chain and frozen execution configuration through
the existing native transition path, without reading revoked feedback as new
positive authority or changing source creation/evaluation/promotion gates. If
needed, extract the existing shared transition builder in the protocol module and
add focused protocol/orchestrator tests; preserve version/task identity, pointer
revision checks, rollback post-check, ordinary future-task and report assertions.

Implemented at `530d338`: 141 covering tests and 71 artifact/interface tests pass,
with root typecheck and forced eight-project build followed by bundle rebuild.
The complete native story includes withdrawal rollback and future root reuse;
six negative binding/config/version cases reject before provider execution.
Independent task review is Approved; controller full regression passes1707 with
18 conditional skips. Scripted mechanism checks are not real-model acceptance.
The separate final frozen status-only real-model UI turn subsequently passes;
it does not demonstrate new exploration, source adaptation or promotion.

Task 1 is independently approved at `c576d7b`: exact release/predecessor identities,
unchanged frozen patch, retained state, idempotence, rollback and strict refusal.
Covering tests: 286 passed / 13 existing opt-in skips after forced type build and
bundle rebuild. Existing nonfatal dts composite warning is retained for final
review. Read-only real-layout preflight recognizes both current installed 0.1.12
roots as eligible predecessors; no actual upgrade or efficacy is implied.

- [x] One whole-branch review and full exact-source gates after parent and delivery
  task reviews. Carry deferred minors and actual-vs-mechanism proof boundaries.
- [x] Distinct isolated candidate with native module identity gate; actual retained
  `0.1.12` predecessor upgrade and preserved records, no acceptance-history edits.
  Normal installer upgraded the actual retained012 installation to013, repeat
  preserved the ready receipt, old archive stayed unchanged, installed Runtime
  matched the genuine final UI candidate. Correct Profile module identity14/14,
  actual native cold boot/help exit0, separate Desktop candidate audit passed.
- [ ] Reviewed main integration, exact-main CI, then authorized daily upgrade and
  Desktop startup/exit using existing preservation and rollback boundaries.
- [ ] Honest route handoff: engineering delivery is not genuine learning efficacy.
