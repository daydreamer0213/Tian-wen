# Complete grading criteria implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver complete, neutral domain criteria to future research-summary reviewers while preserving all frozen legacy evidence.

**Architecture:** One new known rubric/policy family in the existing Evolution module, selected by existing digests through ordinary, controlled and exploration paths. Native graders use one safe projection; old requests keep their exact projection. Immutable015/preview16 packages deliver the repair.

**Tech Stack:** TypeScript, existing Vitest/DSH native harness, Node22.23.1, pnpm11.20.0.

## Global Constraints

- Work only in `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`, branch `codex/research-summary-complete-grading`; baseline `46bc73a79f760c82af16b58a7763663cb7106e1c`.
- Binding spec: `docs/superpowers/specs/2026-09-06-tianwen-complete-grading-criteria.md`; its four criteria strings are exact. Legacy rubric/policy exports and serialized request/proof/transition identities remain unchanged.
- Keep five dimensions,0–4 anchors and every current ordinary/candidate/holdout threshold. No retry, extra model round, parent/tool/schema/authorization/summary-packet limit change. Internal known-family rubric selection is not a user setting.
- New rubric schema `tianwen.controlled-skill-eval-rubric.v3`, policy `tianwen.controlled-skill-source-fidelity-policy.v2`, exploration metric `research-summary-source-fidelity.v2`. Retain old semantic.v1 and ID-only metrics, never silently downgrade.
- New native grader projection contains scoreAnchors, dimensions, criteria only. No candidatePassRules, arm roles, feedback, scores, answers or winner hints. Old ordinary full-rubric and old controlled projected-rubric envelopes stay unchanged.
- No real model calls or user-data mutation by implementers/reviewers. B/G/J/K remain terminal, H reserved, isolated source authorization unchanged. Daily upgrade and real acceptance belong to controller.
- New runtime0.1.15/Desktop0.1.0-preview.16;014 remains immutable and recoverable. No dependency updates. Generated artifacts/caches/test roots stay onD:.
- You are not alone in the codebase. Preserve controller/user work, commit only owned files, do not amend others' commits or restructure unrelated code. Reuse existing harnesses and small explicit family resolver; no generic framework.

## Task 1: Versioned criteria end to end

**Ownership:**
- Modify `packages/tianwen-evolution/src/controlled-skill-source-fidelity.ts`, `index.ts`, `outcome-intake.ts`, `controlled-skill-evaluation.ts`, `controlled-skill-shadow.ts`, `learning-exploration.ts`, `ledger.ts`.
- Modify `packages/tianwen-runtime/src/research-summary-quality.ts`, `skill-evaluation.ts`.
- Modify `packages/tianwen-runtime-bundle/src/research-summary-admission.ts`, `explicit-correction-protocol.ts`, `learning-loop-orchestrator.ts`, `learning-exploration.ts`.
- Extend corresponding existing tests in `tests/dsh-probe/`: research-summary-quality, outcome-intake, outcome-intake-runtime, controlled-skill-evaluation, controlled-skill-evaluation-runtime, controlled-skill-shadow, controlled-skill-shadow-runtime, learning-exploration; and `tests/dsh-migration/`: research-summary-admission, explicit-correction-protocol, learning-loop-orchestrator, learning-loop-controlled-executor.integration, learning-exploration. Confirm exact existing names before use. A single focused new `tests/dsh-probe/controlled-skill-source-fidelity.spec.ts` is allowed for pure family invariants.
- No packaging/version/daily/docs ownership except checkbox completion and assigned report. Raise a needed additional file to controller rather than change scope silently.

**Interfaces / exact decisions:**

Keep existing exports meaning legacy. Add these exports in the existing module and index:

```ts
// Old constants remain byte-identical; add the calibrated family.
export const CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC = Object.freeze({
  ...CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC,
  schemaVersion: 'tianwen.controlled-skill-eval-rubric.v3',
  criteria, // exact frozen object from the binding spec
})
export const CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC_DIGEST = sha256(
  CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC,
)
export const CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_POLICY = Object.freeze({
  ...CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY,
  schemaVersion: 'tianwen.controlled-skill-source-fidelity-policy.v2',
  rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC_DIGEST,
})
export const CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_POLICY_DIGEST = sha256(
  CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_POLICY,
)
// Implement locally with two exact branches; unknown returns undefined.
export function resolveControlledSkillSourceFidelityFamily(rubricDigest: string) {
  // Return { rubric, rubricDigest, policy, policyDigest, metric } for a known family.
  // metric is research-summary-source-fidelity.v1 (old) or .v2 (complete).
}
```

One shared complete-family projection `{scoreAnchors, dimensions, criteria}` may be
returned by the same module. Legacy ordinary callers retain the full old rubric,
legacy controlled callers retain only old scoreAnchors/dimensions. Do not change
the ordinary system prompt; complete criteria are conveyed in new rubric material.
The frozen run qualityContract chooses ordinary envelope/proof, not a global
latest constant. The frozen plan/holdout chooses controlled material. Existing
schemas already carry their identities; reject incoherent combinations.

Extend v3 `resolveExplicitCorrectionProtocol` input with optional `rubricDigest`.
Absent means complete-family; own undefined or any unknown digest rejects. The
builder's policy, rubric and holdout review match the selected family. Retained
orchestrator recovery passes saved rubric explicitly, validates policy and holdout
coherence, and reproduces full freeze input; do not reset timing/capacity. Existing
Run bindings retain their old review contract. Newly frozen protocols default new;
no existing protocol is converted. Fresh admission selects complete. Exploration
mapping must explicitly distinguish the two semantic families from ID-only.

- [x] Read the binding spec, owned call paths and existing fixture entrypoints.
  Pin legacy rubric digest (67d59c1ab275a180539b092adb83026e3f5813620ece21f91341b64829b317a6)
  and current policy/whole legacy protocol/request snapshots before edits. Record
  task BASE. Do not treat unpinned new defaults as legacy tests.
- [x] Add focused RED tests for new constants/projection and known-family selection:

```ts
expect(CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST).toBe(
  'sha256:67d59c1ab275a180539b092adb83026e3f5813620ece21f91341b64829b317a6',
)
expect(CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC.candidatePassRules)
  .toEqual(CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC.candidatePassRules)
expect(CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_POLICY.originalTaskMinimumImprovement).toBe(1)
expect(CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_POLICY.holdoutMinimumDimensionScore).toBe(3)
expect(resolveControlledSkillSourceFidelityFamily('sha256:' + '0'.repeat(64))).toBeUndefined()
```

  Extend real native fixtures to capture first provider material for ordinary,
  aggregate and holdout new-family requests and assert the exact criteria and
  absence of role/pass/winner leakage. Existing scripted provider is a construction
  test only. Test legacy byte-exact request and completed cold-recovery with zero
  extra model calls. Add crossed old/new proof/envelope/metric and policy rejection.
  In one new-family ordinary fixture return scope2/fidelity4 and confirm no new
  failure threshold; return fidelity2 and confirm existing not-met semantics.
- [x] Run the focused tests before production edits; retain expected failures and
  exact log path. Then implement the exported family, validators and all native
  propagation paths, with current record ownership and exact field validation.

```powershell
$env:PATH = 'D:/hermes/node;D:/hermes/git/bin;' + $env:PATH
$env:COREPACK_HOME = 'D:/DevData/corepack-home'
$env:PNPM_CONFIG_STORE_DIR = 'D:/DevData/pnpm-store'
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
$env:TEMP = 'D:/DevData/tianwen-dsh-probe/temp'
$env:TMP = $env:TEMP
$env:TIANWEN_DSH_PROBE_ROOT = 'D:/DevData/tianwen-dsh-probe'
$env:TIANWEN_DSH_PROBE_PYTHON = 'D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge/.venv/Scripts/python.exe'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-probe/research-summary-quality.spec.ts tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts tests/dsh-migration/learning-loop-controlled-executor.integration.spec.ts tests/dsh-migration/learning-exploration.spec.ts
```

- [x] Run GREEN on all touched test files and typecheck. Add explicit retained
  old/new family ×60,000/300,000ms ×old/new capacity recovery checks and mixed
  rubric/holdout/policy rejection before writes/provider calls. Preserve existing
  v2/transition/restore snapshots. Native new controlled successful path still
  uses10 paired+1aggregate+1holdout+1holdout-review+1promotion transition, not
  extra rounds. Source/analysis/exploration Sessions are counted separately.
- [x] Self-review full owned diff for fixed-old constants, semantic downgrade and
  blind material leaks. Commit only owned code/tests. Report RED/GREEN commands,
  evidence logs, compatibility pins, deviations and concerns. Controller runs the
  final full suite once after Task2; worker does not run it or model acceptance.

## Task 2: Immutable normal-delivery015 version

Task1 source30b351a is independently Approved for spec and quality, with429 focused
tests and later14 test-only refinements passing. Legacy/new identities and exact
native requests/recovery are covered. Supplemental aggregate/holdout criteria
checks used disclosed mutationRED after initial propagation; no initialTDD claim
is made for that subset. Task1 is complete; no redispatch.

**Ownership:**
- Modify current-version references in `packages/tianwen-runtime-bundle/package.json`, `src/controlled-lifecycle.ts`, `src/portable-profile.ts`; `packages/tianwen-desktop-host/package.json`, `src/main.ts`, `src/host.ts`, `src/locale.ts`; `scripts/install-tianwen.mjs`, `stage-desktop-runtime.mjs`, `audit-desktop-artifact.mjs`, `verify-dsh-profile.mjs`; `.github/workflows/ci.yml`.
- Update version assertions in existing `tests/dsh-migration/` installer, runtime-bundle, runtime-profile, desktop host/profile/artifact/distribution, version-upgrade and portable/ordinary/controlled lifecycle suites where current-version references require it. Do not change historical docs or replace old upgrade fixture meaning. No dependency change; lockfile only if workspace version bookkeeping requires it.

**Interfaces:** Consumes Task1 reviewed product with no packaging edits. Produces
new version0.1.15 archive identity, Desktop0.1.0-preview.16, same normal install and
Webupdate paths; known old versions0.1.10 through0.1.14 all stay recognized.

- [x] Add RED assertions for current015/preview16 and014→015 normal Web upgrade.
  Preserve existing010–013 compatibility and unknown-version rejection cases.

```ts
expect(runtimeManifest.version).toBe('0.1.15')
expect(desktopManifest.version).toBe('0.1.0-preview.16')
// Extend the existing outdated-version table with 0.1.14; do not drop 0.1.10.
```

- [x] Run installer/Desktop profile focused tests and record expected RED. Update
  only current identities and explicit knownOldRuntimeVersions:

```ts
const runtimeVersion = '0.1.15'
const knownOldRuntimeVersions = ['0.1.14', '0.1.13', '0.1.12', '0.1.11', '0.1.10'] as const
```

  Include localized upgrade copy and immutable archive names in staging/audit/CI.
  Use targeted edits, never a blanket whole-repo replacement of historical014.
  `scripts/install-tianwen.mjs` also needs an explicit014 predecessor branch in
  `classifyManagedInstallation`: exact014 archive, unchanged frozen learning-loop
  predecessor patch, matching DSH/profile/receipt and existing mixed-archive
  refusal. Add014 to the existing installer predecessor test table, preserving
  missing/tampered/mixed/source-linked refusals and rollback/idempotency checks.
  Add the new pure source-fidelity test to CI's explicit test list if Task1 creates
  it; native ordinary/controlled/shadow/exploration suites are already listed.
- [x] Rebuild existing Runtime dependencies/declarations/bundle and Desktop
  declarations before artifact/version assertions, so old generated014 bytes
  cannot mask an015 packaging defect. Use the existing package build scripts;
  do not package Desktop into its active directory. Run touched focused suites
  and typecheck using this complete environment:

```powershell
$env:PATH = 'D:/hermes/node;D:/hermes/git/bin;' + $env:PATH
$env:COREPACK_HOME = 'D:/DevData/corepack-home'
$env:PNPM_CONFIG_STORE_DIR = 'D:/DevData/pnpm-store'
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
$env:TEMP = 'D:/DevData/tianwen-dsh-probe/temp'
$env:TMP = $env:TEMP
$env:TIANWEN_DSH_PROBE_ROOT = 'D:/DevData/tianwen-dsh-probe'
$env:TIANWEN_DSH_PROBE_PYTHON = 'D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge/.venv/Scripts/python.exe'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' --filter '@tianwen/runtime-bundle...' build
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' run typecheck
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts
```

  Include the other touched version-assertion test files in the final focused run.
  Report
  and commit only owned version/test files. Do not build over active Desktop,
  install daily, run real models, merge or publish.

## Controller follow-through

- [x] Resolve the fresh full-suite regression at productionbe1a28c: four existing
  explicit-correction-product stories receive candidate-rejected instead of
  expected promotion. Diagnose actual rejection evidence, fix narrowly with
  covering RED/GREEN and independent review; preserve promotion assertions and
  product gates. Initial full run1822pass/4fail/18skip is retained, not green.
  Test-onlyfixf308f1d uses each blind envelope's actual source packet; original
  9stories plus4newregressions and64relatedchecks pass. Independent scopedreview
  confirms addressed/no new Critical or Important issue; finalfullrerun pending.
- [ ] Task-scoped review after each task, then final whole-branch independent review.
- [ ] Final full Vitest/typecheck/public-surface verification on final source; exact
  runtime/Desktop candidate artifact/native/real packaged lifecycle gates.
- [ ] Integrate reviewed branch, verify exact-main CI, normal daily015 and Web
  upgrade/repeated-install with original data/shortcut preservation, recoverable
  previous program and exact identity receipt.
- [ ] Resume fresh real-user UI acceptance without rerunning/regrading B/G/J/K;
  retain all met/failure/tie/rejection evidence. Close route only at original gates.
