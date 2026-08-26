# Tianwen-Owned DSH Profile Dump Integration Implementation Plan

> **For Codex:** Use `executing-plans`, `test-driven-development`, `systematic-debugging`,
> `ponytail`, and `verification-before-completion`. Complete the tasks in order without asking for
> routine approval. Stop only for a product-semantic blocker, an unauthorized external action, or a
> destructive operation whose exact target cannot be proven.

**Goal:** Make Tianwen's fixed `@deepseek-ai/dsh@0.1.0-rc.7` dependency keep boot-free config dumps
free of Profile fallback materialization while preserving ordinary real Profile boot.

**Architecture:** Carry the reviewed one-call move as a version-specific pnpm dependency patch owned
by Tianwen. Prove the behavior through the existing controlled Profile test and the official
installer path. Do not publish to the external DSH repository and do not substitute a different DSH
version.

**Tech stack:** pnpm patched dependencies, TypeScript/Vitest, Node.js, official Tianwen installer.

## Global constraints

- Work from a new implementation branch and D:-hosted worktree created from exact design commit.
- Keep package caches, test fixtures, product roots, and evidence under `D:\DevData`.
- Do not modify or push the local DSH source repository.
- Do not edit an installed package in place.
- Do not change DSH versions, installer receipt schemas, Runtime Bundle behavior, model policy, or
  controlled lifecycle behavior.
- Prefer one patch file and one focused behavioral assertion. Add no helper, adapter, service,
  fallback framework, dependency, or general patch-management layer.
- Run the expensive official installer once on a new product root after focused gates are green.

## Task 0: Exact takeover and unmodified baseline

**Files:** none.

1. Create `codex/tianwen-owned-dsh-profile-dump-integration` in a new D:-hosted worktree from the
   exact committed design SHA.
2. Verify branch, exact parent, clean status, and that the design file is the only design-commit
   change.
3. Read the design, this plan, `pnpm-workspace.yaml`, the patched-dependency section of
   `pnpm-lock.yaml`, `tests/dsh-migration/controlled-lifecycle-profile.spec.ts`, and the rc.7 built
   Profile boot module selected by the installed package manifest.
4. Set `PNPM_CONFIG_STORE_DIR`, `COREPACK_HOME`, `UV_CACHE_DIR`, and
   `TIANWEN_DSH_PROBE_ROOT` to D:-hosted locations.
5. Run the existing Profile spec once without changes. Preserve its current result and duration as
   baseline; the known cold fallback behavior may hit the test-local 60-second timeout.

## Task 1: Freeze the functional RED

**Modify:**

- `tests/dsh-migration/controlled-lifecycle-profile.spec.ts`

1. Define the exact fallback root locally as `join(paths.dshHome, 'profiles', 'node_modules')`.
2. Assert it is absent before the ordinary dump, after the ordinary dump, and after the controlled
   dump.
3. Preserve all existing retry, title-LLM, runner-presence, Session, and Evolution assertions.
4. Run only this Profile spec.
5. Record the first product failure: the unpatched rc.7 dump either materializes the fallback or
   exceeds the existing 60-second test timeout. Do not weaken the timeout or replace the behavioral
   assertion with a source-text snapshot.

## Task 2: Apply the exact rc.7 dependency patch

**Create:**

- `patches/@deepseek-ai__dsh@0.1.0-rc.7.patch`

**Modify:**

- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`

1. Inspect the exact rc.7 package manifest and built Profile boot filename. Confirm the package is
   `0.1.0-rc.7` and the old call is present in `prepareProfile()` but absent from `composeProfile()`.
2. Create one normal unified patch against the published built JavaScript:
   - remove `healProfilesModuleFallback(INSTALL_ANCHOR)` from `prepareProfile()`;
   - add the same call as the first operation in `composeProfile()`.
3. Add exactly one `patchedDependencies` entry for `@deepseek-ai/dsh@0.1.0-rc.7`.
4. Regenerate the lockfile using the existing pnpm version and D:-hosted store. Do not change package
   versions or dependencies.
5. Run a frozen install and verify the installed rc.7 module contains the call in the new location
   and no longer in the old location.
6. Run the Profile spec. It must pass within its unchanged 60-second limit, with the fallback absent
   before, between, and after both dumps.
7. Run `pnpm run check:dsh-install`, `pnpm run typecheck`, and the focused Runtime Bundle, model
   configuration, controlled lifecycle command, installer, and Profile specs.

Expected product outcome: config composition is fast and boot-free; all existing policy assertions
remain unchanged.

## Task 3: Prove the official installed product path

**Modify tests only if existing tests cannot observe deployed behavior:**

- `tests/dsh-migration/tianwen-installer.spec.ts`
- `tests/dsh-migration/tianwen-startup.e2e.spec.ts`

1. First inspect whether existing installer contracts already prove that patched dependencies flow
   through `pnpm deploy`. Add only the smallest missing assertion if necessary.
2. Run the official installer exactly once on a new D:-hosted product root and save its transport in
   a sibling evidence root.
3. Validate the ordinary install receipt and publication contracts already owned by the installer.
4. Verify `dsh-home/profiles/node_modules` is absent after installation.
5. Run official `tianwen model status --json` exactly once. Verify the expected offline receipt and
   confirm the fallback remains absent.
6. Run one Provider-free real installed DSH Profile help or usage invocation with a bounded timeout.
   Verify it exits normally and creates the fallback before plugin resolution.
7. Do not run model use, model smoke, controlled lifecycle, Goal, Provider, or any real product data.

If the real boot remains slow while completing successfully, record that as the existing Windows
link-materialization cost. It is outside this fix unless it prevents ordinary product boot from
completing within the bounded diagnostic.

## Task 4: Final verification and commit

1. Run the Profile spec fresh.
2. Run the focused migration/runner compatibility suite that CI owns.
3. Run the recursive Runtime Bundle build, `pnpm run check:dsh-install`, full typecheck,
   `check:no-private-dsh-imports`, and `git diff --check`.
4. Run `pnpm run check` once. A failure is acceptable only if it is byte-for-byte the already known
   unrelated baseline and all affected focused gates are green; otherwise diagnose it before
   completion.
5. Review the diff for:
   - correctness: dump is boot-free and real boot still heals;
   - architecture: one exact Tianwen dependency patch, no version mixing;
   - simplicity: no new abstraction or external publication dependency.
6. Commit only the patch, workspace/lock binding, and necessary tests with message:
   `fix: keep DSH profile dumps boot-free`.
7. Verify the committed diff and clean tree. Stop at the exact feature SHA for review; do not push or
   merge without the existing controlled-integration step.

## Completion criteria

- Tianwen's fixed rc.7 dependency is reproducibly patched by pnpm.
- Both ordinary and controlled config dumps complete under the existing focused timeout and leave
  the Profile fallback absent.
- A real official installed Profile invocation still creates the fallback and exits normally.
- Installer, model configuration, Runtime Bundle, and controlled lifecycle contracts remain green.
- No DSH upstream permission, push, pull request, fork, or release is required.
