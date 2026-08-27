# Tianwen Portable DSH Plugin Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to execute this plan task-by-task, with isolated worktrees and a correctness review after each implementation task.

**Goal:** Make one ordinary `@tianwen/runtime-bundle` tarball installable into an existing exact `@deepseek-ai/dsh@0.1.1-rc.2` Profile, usable from stock DSH CLI/headless/Web, while preserving the optional Tianwen-managed installer path.

**Architecture:** DSH remains the host and owns Profile/session lifecycle. Tianwen adds one Bundle, derives its default state directory from the selected Profile, and exposes goal commands that accept either the existing managed product root or an explicit portable DSH target. Dynamic runner support becomes optional until a learned artifact is actually activated. Native `dsh plugin --profile ... add/remove` remains the install surface; Tianwen will not add a second plugin installer.

**Tech Stack:** Node.js 22, TypeScript, Cordis, exact `@deepseek-ai/dsh@0.1.1-rc.2`, pnpm 11, Vitest, PowerShell on Windows.

---

## Frozen scope and integration rules

- This branch is stacked on migration handoff commit `dd3c848a83fe50cdcacbc50569ab16491779c4b0`. It must not be merged independently to `main` until that base is either accepted or its required commits are integrated deliberately.
- Support only exact `@deepseek-ai/dsh@0.1.1-rc.2` in this increment. Fail clearly on another package name/version; do not build a compatibility framework.
- Keep one `@tianwen/runtime-bundle` artifact for ordinary DSH, the managed installer, headless/Web, and a later Desktop integration. Do not create a Desktop-specific Bundle.
- Keep `@tianwen/*` naming during this work. Public renaming and npm/GitHub/Desktop publication are separate decisions.
- Keep large caches, packed tarballs, disposable DSH homes, and run evidence under `D:\DevData`. Do not inspect, modify, or clean historical Activity/product/evidence/debug/legacy worktrees.
- Do not add a Tianwen UI, Desktop application code, telemetry, retry loops, backup framework, generic YAML parser, or a new install command.
- Use tests before implementation. A failed native DSH add/remove is reported once; do not retry to select a better result.
- Do not spend Provider requests until all offline/local gates are green. The final ordinary DeepSeek smoke is exactly once and is not a controlled Activity.

## Public contracts to preserve

```ts
export interface PortableProfileTargetInput {
  readonly dshRoot: string
  readonly dshHome: string
  readonly profile: string
  readonly stateRoot: string
}

export interface ResolvedPortableProfileTarget {
  readonly dshRoot: string
  readonly dshBin: string
  readonly dshHome: string
  readonly profile: string
  readonly profileRoot: string
  readonly sessionsRoot: string
  readonly stateRoot: string
  readonly evolutionRoot: string
}
```

Portable CLI commands receive the complete set `--dsh-root --dsh-home --profile --state-root`. Managed commands continue to receive `--data-dir`. Supplying neither mode, both modes, or only part of the portable set is an error. `model`, `controlled-lifecycle`, trial, and `--live-smoke` stay managed-only.

`dshRoot` is the installed DSH package directory, not `DSH_HOME` and not a guessed PATH executable. The resolver validates its `package.json`, exact name/version, and `bin.dsh`, then invokes the JavaScript bin with the current Node executable. `sessionsRoot` is `<dshHome>/sessions`; `profileRoot` is `<dshHome>/profiles/<profile>`; `evolutionRoot` is `<stateRoot>/evolution`.

### Task 1: Shared portable target and default state root

**Files:**

- Create: `packages/tianwen-runtime-bundle/src/portable-profile.ts`
- Create: `tests/dsh-migration/portable-profile.spec.ts`
- Modify: `packages/tianwen-runtime/src/index.ts`
- Modify: `tests/dsh-migration/runtime-composition.spec.ts`

- [ ] Write failing resolver tests for absolute paths, Profile name `[a-z0-9][a-z0-9-]*`, exact DSH manifest/bin validation, an existing Profile requirement, and derived roots.
- [ ] Write a failing runtime-composition test proving omitted `evolutionRoot` resolves to `<ctx.baseUrl>/state/evolution`, while an explicit absolute override still wins and invalid overrides fail.
- [ ] Run `pnpm exec vitest run tests/dsh-migration/portable-profile.spec.ts tests/dsh-migration/runtime-composition.spec.ts`; confirm the new assertions fail for the missing behavior.
- [ ] Implement `resolvePortableProfileTarget(input)` with direct filesystem/path operations only. Do not create directories and do not spawn DSH.
- [ ] Change `TianwenRuntimeConfig.evolutionRoot` to optional and derive the default from the exact DSH Profile-anchored `ctx.baseUrl`. Keep the current absolute-path validation after resolution.
- [ ] Rerun the two tests and `pnpm run typecheck`; expect all green.
- [ ] Commit: `feat: resolve portable DSH profile targets`

### Task 2: Make dynamic runner optional until activation

**Depends on:** Task 1. May run in parallel with Tasks 3 and 4 in its own worktree.

**Ownership:** `packages/tianwen-evolution/src/runtime-binding.ts`, `packages/tianwen-runtime/src/index.ts`, and directly related evolution/runtime tests only.

**Files:**

- Modify: `packages/tianwen-evolution/src/runtime-binding.ts`
- Modify: `packages/tianwen-runtime/src/index.ts`
- Modify: `tests/dsh-probe/evolution.spec.ts`
- Modify: `tests/dsh-migration/runtime-composition.spec.ts`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `tests/dsh-probe/skill-governance-runtime.spec.ts`

- [ ] Add failing tests that mount Tianwen without `dynamicCordisRunner`, record ordinary evidence/learning, and return `undefined` when no champion exists.
- [ ] Add a failing test that actual activation without the runner gives one clear error and leaves no binding.
- [ ] Remove the top-level Runtime `inject` requirement and `TianwenEvolutionService.static inject` requirement.
- [ ] Add one private runner accessor and call it only at define/run/stop/inventory operations. Do not precheck it before a no-champion `rehydrateChampion()` result.
- [ ] Preserve all existing runner-present lifecycle behavior.
- [ ] Run the owned tests plus `pnpm run typecheck`; expect green.
- [ ] Commit: `fix: allow Tianwen without the dynamic runner`

### Task 3: Productize the single Runtime Bundle

**Depends on:** Task 1. May run in parallel with Tasks 2 and 4 in its own worktree.

**Ownership:** Runtime Bundle manifest/default patch, packing/profile verification, and their direct tests/scripts only.

**Files:**

- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `packages/tianwen-runtime-bundle/cordis.patch.yml`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `tests/dsh-migration/runtime-profile.spec.ts`
- Modify: `scripts/verify-dsh-profile.mjs`

- [ ] Add failing assertions that the package is publishable as version `0.1.0`, packs the required runtime/CLI files, declares exact DSH peer/runtime dependencies, and contains no machine-specific state path.
- [ ] Change only the Bundle package from `0.0.0`/private to `0.1.0`/publishable; leave internal workspace packages private.
- [ ] Remove the hard-coded `D:/DevData/tianwen-dsh-probe/evolution` from the default patch so Runtime uses its Profile-relative default.
- [ ] Update profile verification to accept the missing optional config and the new no-top-level-runner contract after Task 2 integration.
- [ ] Build and pack to a disposable directory under `D:\DevData`; inspect the tarball manifest and files.
- [ ] Run owned tests, `node scripts/verify-dsh-profile.mjs` where applicable, and `pnpm run typecheck`; expect green.
- [ ] Commit: `feat: package the portable Tianwen bundle`

### Task 4: Add portable target mode to goal CLI commands

**Depends on:** Task 1. May run in parallel with Tasks 2 and 3 in its own worktree.

**Ownership:** CLI/status/create/resume source and goal command tests only.

**Files:**

- Modify: `packages/tianwen-runtime-bundle/src/cli.ts`
- Modify: `packages/tianwen-runtime-bundle/src/status.ts`
- Modify: `packages/tianwen-runtime-bundle/src/create.ts`
- Modify: `packages/tianwen-runtime-bundle/src/resume.ts`
- Modify: `packages/tianwen-runtime-bundle/src/create-runner.ts`
- Modify: `tests/dsh-migration/goal-status.spec.ts`
- Modify: `tests/dsh-migration/goal-create.spec.ts`
- Modify: `tests/dsh-migration/goal-resume.spec.ts`

- [ ] Add failing parse tests for exactly one complete target mode and for managed-only options.
- [ ] Refactor `scanDurableGoals`, `listGoals`, and `readGoalStatus` to receive explicit `sessionsRoot`/`evolutionRoot`; keep a thin managed adapter from `dataDir`.
- [ ] Make portable `status` and `list` strictly read-only; they must not initialize a Profile or start DSH.
- [ ] Make portable `create`/ordinary `resume` invoke the resolved exact DSH JS bin with `DSH_HOME`, `--profile`, and exact state/session roots. Preserve managed create/resume output and behavior.
- [ ] Print a portable follow-up command after portable create; do not silently convert it back to `--data-dir`.
- [ ] Reject portable `model`, `controlled-lifecycle`, trial, and `--live-smoke` paths with clear usage errors.
- [ ] Run the three goal test files and `pnpm run typecheck`; expect green.
- [ ] Commit: `feat: target existing DSH profiles from the CLI`

### Task 5: Verify native DSH add/remove lifecycle

**Depends on:** Tasks 2-4 integrated. May run in parallel with Task 6.

**Files:**

- Create: `tests/dsh-migration/portable-plugin-lifecycle.e2e.spec.ts`
- Modify only if a proven product defect requires it: `packages/tianwen-runtime-bundle/src/portable-profile.ts`

- [ ] Build and pack the same Runtime Bundle tarball to `D:\DevData`.
- [ ] Prepare disposable exact-DSH homes for (a) a pre-existing selected Profile plus untouched other Profile and (b) a missing Profile.
- [ ] Snapshot both Profiles and the Tianwen state root before each native command.
- [ ] Run the public contract once per scenario: `DSH_HOME=<home> dsh plugin --profile <name> add --offline <tarball>`.
- [ ] Assert the selected Profile records exactly one Runtime Bundle, the other Profile is byte-for-byte unchanged, and missing-Profile auto-initialization is reported as DSH behavior rather than Tianwen behavior.
- [ ] Run native `remove @tianwen/runtime-bundle`; assert Profile wiring is removed but Tianwen state is preserved.
- [ ] Exercise one invalid tarball/target failure and assert a single failed spawn with no Tianwen retry.
- [ ] Commit: `test: verify portable DSH plugin lifecycle`

### Task 6: Verify stock headless and Web composition

**Depends on:** Tasks 2-4 integrated. May run in parallel with Task 5.

**Files:**

- Create: `tests/dsh-migration/portable-profile-composition.e2e.spec.ts`
- Reuse without shipping as product UI: `packages/tianwen-dsh-probe-bundle/`

- [ ] Install the same local tarball into two disposable exact-DSH Profiles under `D:\DevData`.
- [ ] Start a real stock headless Host and wait for a probe receipt proving Tianwen mounted exactly once; then terminate cleanly.
- [ ] Start real `dsh web` on a disposable loopback port, receive an HTTP response, prove Tianwen mounted exactly once, and terminate cleanly.
- [ ] Assert both runs use Profile-local default state and do not require `dynamicCordisRunner` before activation.
- [ ] Do not add a Tianwen page or claim visual Desktop support from these checks.
- [ ] Commit: `test: verify portable headless and web composition`

### Task 7: Regress the optional managed installer and document use

**Depends on:** Tasks 5 and 6.

**Files:**

- Modify: `scripts/install-tianwen.mjs` only if the package version/default patch requires an installer adjustment
- Modify: `tests/installer/installer-windows.spec.py`
- Modify: `README.md`
- Create: `docs/operations/tianwen-portable-dsh-plugin-handoff.md`

- [ ] Prove the managed installer consumes the same `0.1.0` Runtime Bundle tarball and still writes its explicit managed state root.
- [ ] Run the installer Windows test against a fresh `D:\DevData` destination; do not reuse a historical product directory.
- [ ] Document exact native add/remove commands for existing DSH users, exact portable CLI target arguments, managed installer alternative, state location, and removal-with-state-preservation behavior.
- [ ] State plainly that Desktop remains a later host-integration task and package naming remains temporary.
- [ ] Record code/test facts separately from external publication and Provider facts.
- [ ] Commit: `docs: hand off the portable DSH plugin`

### Task 8: Complete gates and one ordinary real-model smoke

**Depends on:** Task 7.

- [ ] Review the combined diff against the approved design and this plan. Reject duplicate installers, UI work, broad abstractions, hidden retries, or evidence claims not produced by the run.
- [ ] Run targeted portable tests, then `pnpm run check`; expect all green.
- [ ] Run Python, TypeScript, and installer-Windows local gates from the fresh integration worktree with large data under `D:\DevData`.
- [ ] Through the officially installed product and configured DeepSeek, run one ordinary goal create/resume task against a disposable Profile exactly once. Do not create a controlled Activity and do not rerun to choose a better answer.
- [ ] Independently inspect the resulting code/state, task result, natural runtime evidence, learning facts, and external facts as separate categories.
- [ ] If the stacked migration base is still incomplete, stop at a reviewed handoff branch. If the base has been accepted and every gate is green, perform the controlled integration and verify exact-main CI without triggering retries.
- [ ] Update the handoff with final SHAs and honest pass/incomplete status.

## Parallel execution map

1. Task 1 is the shared foundation and runs first on the integration branch.
2. After Task 1 review, Tasks 2, 3, and 4 run concurrently in separate D-drive worktrees with the ownership above.
3. Integrate and review those commits one at a time; rerun the shared targeted suite after each.
4. Tasks 5 and 6 then run concurrently because they own separate E2E files and disposable data roots.
5. Tasks 7 and 8 run sequentially on the integration branch.

Every worker must preserve other workers' edits, avoid historical directories, commit only its owned files, and report exact tests and remaining risks. The controller performs final review and integration; worker success alone is not acceptance.
