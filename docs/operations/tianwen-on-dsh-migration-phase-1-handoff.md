# Tianwen-on-DSH Migration Phase 1 handoff

## Status: BLOCKED

This is a runtime candidate, not an install-complete migration. Do not start Alpha 10 or another migration implementation from this branch.

Task 4 is blocked at the distribution boundary: a private workspace multi-package runtime cannot reliably load as one offline DSH plugin tarball from the Profile root without either publishing/installing multiple Tianwen packages or making a genuinely self-contained deployment Bundle that keeps DSH dependencies external. The recommended decision is **B**, the deployment Bundle, but it must not be implemented until the user approves it.

## Exact baseline and branch receipt

- Base: `1eef994a82c4ff39de311d5c2b61dff92bf94162`.
- Pre-document local HEAD: `13cd92be75466285b2497e21a4962482b4577c9f`.
- Branch: `codex/tianwen-dsh-migration-phase-1`.
- Pre-document remote SHA: `13cd92be75466285b2497e21a4962482b4577c9f`.
- The documentation commit and post-push remote SHA are recorded in the ignored Task 5 receipt after commit; this document is not amended to fabricate a self-reference.

Main-branch specification rulings are `fb497f316f9cadc9f65f4664005415bad0493428` (the in-repo evaluator source import governs; no root dependency is added for the test) and `81dbf36ec52663fd3dde464f27c38082750dec7b` (fresh Context bindings are authoritative; opaque rc.6 dynamic IDs may repeat across Contexts).

Task 1–3 commits:

- `af6b8900747b01cfc82dbf1dfb508bb932713a3f` — thin Tianwen runtime composed on public DSH rc.6 surfaces.
- `3f5f467e7388f6a9951ab974a7a3d9865a49e317` — Session and Evidence recovery.
- `13cd92be75466285b2497e21a4962482b4577c9f` — separate Python A1 and Cordis governance proof.

The `base..13cd92b` range has eight paths: runtime manifest/source/tsconfig, `pnpm-lock.yaml`, three migration tests, and `vitest.config.ts`. It contains no Task 4 Bundle, packlist, installer, or Profile product diff. The pre-write diff check and status were clean.

## Established code behavior

- `@tianwen/runtime` is a thin composition seam over public rc.6 APIs; the recorded closure is 187 exact rc.6 packages and 15 public surfaces.
- Session/Goal/Tool/Evidence Context behavior and recovery have Task 1–3 evidence. Restart does not use dynamic IDs as cross-Context identity.
- Python A1 authoring and Cordis Plugin governance are separate chains. An A1 receipt is explicitly not bound to a Cordis Plugin Artifact.
- Task 3 controller review was 2/2 and adjacent checks 35/35; Task 1–3 reviews were clean. Task 5 made zero repair waves and no new product review because the controller's Task 4 breaker ruling is authoritative.

## Task 4 failure evidence — not a product change

Both permitted standard-pnpm experiments were uncommitted and cleaned. First, `bundledDependencies` recursively carried workspace source and unrelated DSH-native closure. Closing source with `files` packlists then left the runtime nested below the Profile root, where the required Profile-anchor import could not resolve it. The public Bundle-subpath continuation reached its nested closure but failed loading the missing Landlock native dependency `@deepseek-ai/node-addon-landlock-run`.

No stale Profile report is three-layer migration proof: the verifier failed before it could write a current report. No registry install, absolute `file:` path, private DSH import, copied runtime source, model call, live web request, real Docker operation, or Task 4 commit was used.

Required user decision:

1. **A:** publish/install the multiple Tianwen packages.
2. **B (recommended):** build one self-contained deployment Bundle whose DSH dependencies remain external.

Hold Phase 1 until the decision is approved and implemented in a separately scoped task. Do not claim the Profile installation loop is complete.

## Task 5 final gate receipt

All commands used D:-based worktree, stores, caches, and temporary directory in offline mode. The current `node_modules/.modules.yaml` records `D:\\DevData\\tianwen-dsh-migration-phase-1\\workspace-virtual-store`; the brief-required invocation set `PNPM_CONFIG_VIRTUAL_STORE_DIR` to `D:\\DevData\\tianwen-dsh-migration-phase-1\\virtual-store-final`. pnpm 11.20.0 therefore attempted a modules-directory replacement and, without a TTY, stopped with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` before dependency or test execution. Each requested Node command was attempted once and was not re-run with a changed confirmation setting.

| Gate | Result | Evidence |
| --- | --- | --- |
| Offline frozen install | Not reached | preflight abort; no download count is available |
| Closure, private-import, typecheck | Not reached | each stopped at the same pnpm preflight |
| Default full Node Vitest | Not reached | same preflight; no migration flag was set |
| Migration Profile gate | **Not run** | `runtime-profile.spec.ts` is absent, as required |
| Explicit sandbox gate | Not reached | invoked once with sandbox flag; same preflight, so no sandbox assertion ran |
| Python A1 author proof | Pass | `10 passed in 5.87s` |
| Foreground full pytest | No usable receipt | invoked once; runner did not retain final output or exit receipt, so no pass claim |
| Ruff | Pass | `All checks passed!` |
| Base diff check / pre-write status / remote | Pass | check clean, status clean, remote at `13cd92b…` |

This distinguishes successful code evidence, the real Task 4 distribution failure, and gates intentionally not run or not reached. The Task 4 blocker remains the canonical hold reason; the pnpm non-TTY preflight is a Task 5 environment-receipt limitation, not Task 4 repair evidence.

## Remaining risks and recommendation

Risks remain: rc.6 Developer Preview behavior; fixed offline Profile install debt; trusted same-process plugin model; Windows partial sandbox; A1-only bridge; and JSONL probe ledger. The deferred product decision for the first unified learning object remains `repo_task` versus `cordis_plugin`, with `repo_task` recommended.

Forbidden-effect counts for this closeout: zero Task 4 product diffs, zero migration Profile-gate runs, zero paid-model calls, zero live-web calls, zero real-Docker runs, and zero commits other than this documentation handoff.
