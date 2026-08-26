# Tianwen-Owned DSH Profile Dump Integration Design

**Date:** 2026-08-26
**Status:** Approved for implementation planning
**Scope:** Tianwen-owned integration of the reviewed Profile dump boundary fix into the fixed DSH
`0.1.0-rc.7` product dependency.

## 1. Problem

Tianwen's official installer currently deploys `@deepseek-ai/dsh@0.1.0-rc.7`. In that package,
`prepareProfile()` calls `healProfilesModuleFallback()` for both real Profile boot and the boot-free
`--dump-config` path. A fresh config dump therefore creates hundreds of module links and can take
roughly two minutes on the canonical Windows machine.

A natural ordinary Tianwen task produced and independently validated the correct source-level DSH
change in local commit `f99852985cbf6e31603b82480fc11c3019714e15`: boot-free preparation no longer
heals the fallback, while real boot heals immediately before Profile composition and Loader mount.
The external DSH repository has not received that commit, and Tianwen must not depend on permission
to publish there.

## 2. Product goal

The Tianwen repository must reproducibly install a DSH CLI with the reviewed behavior:

1. a fresh `--dump-config` composes configuration without creating
   `$DSH_HOME/profiles/node_modules`;
2. a later real Profile invocation creates the fallback before resolving and mounting plugins;
3. the official installer, Profile, Runtime Bundle, model configuration, and controlled lifecycle
   continue to use one internally consistent DSH `0.1.0-rc.7` package set.

This is a product behavior task. It does not add a new security layer, evidence protocol, receipt,
retry policy, or lifecycle framework.

## 3. Decision

Use pnpm's existing `patchedDependencies` mechanism to carry one Tianwen-owned patch for
`@deepseek-ai/dsh@0.1.0-rc.7`.

The npm package publishes built JavaScript rather than the upstream TypeScript source. The patch
therefore changes the package's exact built Profile boot module:

- remove the existing `healProfilesModuleFallback(INSTALL_ANCHOR)` call from `prepareProfile()`;
- add that same call at the beginning of `composeProfile()`.

The package version remains `0.1.0-rc.7`. The lockfile binds the patch content to that exact package
version. `pnpm install --frozen-lockfile` applies the patch before both the workspace tests and
`pnpm deploy`, so the ordinary development dependency and the DSH host deployed by the official
installer share the same behavior.

## 4. Why this is the correct ownership boundary

Tianwen already owns:

- the exact DSH version in `package.json` and `pnpm-lock.yaml`;
- the workspace's `patchedDependencies` policy;
- the `@tianwen/dsh-host` package used by `pnpm deploy`;
- the official installer that deploys that host and validates `--dump-config`.

The new patch therefore enters the product through the existing dependency and installer path. It
does not edit files inside an installed product, point the installer at a developer checkout, or
mix packages from DSH `0.1.1-rc.2` with the rc.7 dependency graph.

The local upstream commit is review provenance for the behavior and source architecture. It is not
a runtime dependency and is not pushed as part of this design.

## 5. Runtime state transitions

### 5.1 Official install and config inspection

1. Tianwen's frozen workspace install applies the rc.7 patch.
2. `@tianwen/dsh-host` deploys the patched DSH CLI.
3. The Profile deploy installs the existing rc.7 Base and Headless bundles plus the Tianwen Runtime
   Bundle.
4. Installer `--dump-config` calls boot-free `prepareProfile()`.
5. Profile manifest and patch layers are composed and validated.
6. `profiles/node_modules` remains absent.

### 5.2 First real Profile invocation

1. The DSH CLI dispatches to `runProfile()`.
2. `composeProfile()` first calls `healProfilesModuleFallback()`.
3. Bare plugin names resolve through the newly materialized fallback.
4. The Loader mounts the existing Profile normally.

The patch changes ownership, not the fallback algorithm.

## 6. Implementation surface

Expected product files:

- `patches/@deepseek-ai__dsh@0.1.0-rc.7.patch` — one compiled-module call move;
- `pnpm-workspace.yaml` — one new `patchedDependencies` entry;
- `pnpm-lock.yaml` — generated patch binding;
- `tests/dsh-migration/controlled-lifecycle-profile.spec.ts` — functional cold-dump assertion;
- installer/startup tests only if the existing public product tests cannot prove deployed behavior.

Do not modify the Tianwen Runtime Bundle, DSH Profile patch, model selection, controlled lifecycle,
installer receipt schema, or DSH package versions for this task.

## 7. Verification

### 7.1 Fast functional RED/GREEN

The existing controlled Profile test already exposes the bug: its two synchronous rc.7 config dumps
can exceed the test-local 60-second limit. Add the stable state assertion that the fallback is absent
before, between, and after the ordinary and controlled dumps.

Before the dependency patch, the first dump either times out or leaves the fallback present. After
the patch, the same test must finish within its existing 60-second limit and retain all existing
ordinary `normal/2`, controlled `normal/0`, title-LLM, and runner-presence assertions.

### 7.2 Dependency and installer gates

- `pnpm install --frozen-lockfile` succeeds with D:-hosted caches.
- `check:dsh-install` still reports one exact rc.7 package family and valid public surfaces.
- Type checking and focused migration tests pass.
- The official installer on a new product root deploys the patched DSH CLI.
- Installer config validation leaves `profiles/node_modules` absent.
- Official `tianwen model status` then starts the installed DSH with the model patch, so it is the
  first Provider-free real Profile invocation rather than another boot-free config dump. It must
  create the fallback, return the offline status receipt, and report zero model requests.

No additional help or usage command is needed: model status already proves the real boot boundary.
The real-boot check may allow enough time for the existing Windows link materialization cost. This
task does not optimize that cost or change unrelated upstream E2E timeouts.

## 8. Failure and rollback

If the patch no longer applies, pnpm installation must fail rather than silently deploy unpatched
DSH. A future DSH version upgrade must either contain the upstream fix or carry a separately reviewed
version-specific patch.

Rollback is the ordinary dependency rollback: remove the exact `patchedDependencies` entry and patch
file, regenerate the lockfile, and rerun the same functional test. No installed-product mutation or
data migration is required.

## 9. Alternatives rejected

### Wait for an external DSH release

This would make Tianwen's core behavior depend on repository permissions and an unknown release
schedule. It remains a possible later cleanup, not the product path.

### Build all of DSH source inside Tianwen

This would introduce a second large monorepo build, a new package publication pipeline, and version
coordination across the full DSH package graph for a one-package call move.

### Copy a locally built rc.2 CLI into the rc.7 product

This mixes incompatible CLI, Profile, and library versions and cannot be represented honestly by the
current lockfile or installer receipt.

### Edit the installed package after deployment

This is not reproducible, does not survive reinstall, and bypasses the dependency source of truth.

## 10. External upstream boundary

No DSH push, pull request, fork publication, or npm release is part of this implementation. External
publication remains a separately authorized optional task. Tianwen's product behavior must be complete
without it.
