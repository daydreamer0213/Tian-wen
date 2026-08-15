# Tianwen-on-DSH Migration Phase 1 handoff

## Status: BLOCKED

This is a runtime candidate with verified code gates, not an install-complete migration. Do not start Alpha 10 or another migration implementation from this branch.

Task 4 is blocked at the distribution boundary: a private workspace multi-package runtime cannot reliably load as one offline DSH plugin tarball from the Profile root without either publishing/installing multiple Tianwen packages or making a genuinely self-contained deployment Bundle that keeps DSH dependencies external. The recommended decision is **B**, the deployment Bundle, but it must not be implemented until the user approves it.

## Exact baseline and branch receipt

- Base: `1eef994a82c4ff39de311d5c2b61dff92bf94162`.
- Pre-finalization local and remote HEAD: `855cce4384b153c1ced24a52ef375775139c47ad`.
- Branch: `codex/tianwen-dsh-migration-phase-1`.
- The finalization documentation commit and post-push remote SHA are recorded in the ignored Task 5 receipt after commit; this document is not amended to fabricate a self-reference.

Main-branch specification rulings are `fb497f316f9cadc9f65f4664005415bad0493428` (the in-repo evaluator source import governs; no root dependency is added for the test) and `81dbf36ec52663fd3dde464f27c38082750dec7b` (fresh Context bindings are authoritative; opaque rc.6 dynamic IDs may repeat across Contexts).

Task 1–3 commits:

- `af6b8900747b01cfc82dbf1dfb508bb932713a3f` — thin Tianwen runtime composed on public DSH rc.6 surfaces.
- `3f5f467e7388f6a9951ab974a7a3d9865a49e317` — Session and Evidence recovery.
- `13cd92be75466285b2497e21a4962482b4577c9f` — separate Python A1 and Cordis governance proof.

The only cross-task repair is `855cce4384b153c1ced24a52ef375775139c47ad` — `test: wait for goal round settlement`. It wraps the exact final Goal assertion in bounded `vi.waitFor`; it neither relaxes a field, adds a sleep, nor changes product code. The `base..855cce4` range contains the original handoff, Task 1–3 paths, and this one test-only repair; it contains no Task 4 Bundle, packlist, installer, or Profile product diff.

## Established code behavior

- `@tianwen/runtime` is a thin composition seam over public rc.6 APIs; closure verifies 187 exact rc.6 packages, 15 public surfaces, and zero violations.
- Session/Goal/Tool/Evidence Context behavior and recovery have Task 1–3 evidence. Restart does not use dynamic IDs as cross-Context identity.
- Python A1 authoring and Cordis Plugin governance are separate chains. An A1 receipt is explicitly not bound to a Cordis Plugin Artifact.
- Task 1–3 reviews were clean. The one repair wave is test timing only; its fresh scoped reviewer found **0 Critical / 0 Important / 0 Minor** (all addressed).

## Task 4 failure evidence — not a product change

Both permitted standard-pnpm experiments were uncommitted and cleaned. First, `bundledDependencies` recursively carried workspace source and unrelated DSH-native closure. Closing source with `files` packlists then left the runtime nested below the Profile root, where the required Profile-anchor import could not resolve it. The public Bundle-subpath continuation reached its nested closure but failed loading the missing Landlock native dependency `@deepseek-ai/node-addon-landlock-run`.

No stale Profile report is three-layer migration proof: the verifier failed before it could write a current report. No registry install, absolute `file:` path, private DSH import, copied runtime source, model call, live web request, real Docker operation, or Task 4 commit was used.

Required user decision:

1. **A:** publish/install the multiple Tianwen packages.
2. **B (recommended):** build one self-contained deployment Bundle whose DSH dependencies remain external.

Hold Phase 1 until the decision is approved and implemented in a separately scoped task. Do not claim the Profile installation loop is complete.

## Controller final gate receipt

The original local Task 5 non-TTY failures are **historical and superseded**. They came from incorrectly switching from the installed D-drive virtual store `D:\\DevData\\tianwen-dsh-migration-phase-1\\workspace-virtual-store` to `...\\virtual-store-final`; they are not a product, dependency, or Task 4 failure. The controller reran the gates once against the recorded existing D-drive store, offline.

| Gate | Final controller result |
| --- | --- |
| Offline frozen install | exit 0; Already up to date; 0 downloads |
| Closure | exit 0; 187 exact rc.6 packages, 15 public surfaces, 0 violations |
| Private imports | exit 0; 0 violations |
| Typecheck | exit 0; rerun clean after repair |
| Initial default full Node | 67 passed, 1 failed, 3 skipped; exposed real Goal settlement race |
| Repair focused Node | 1 passed of 1 |
| Fresh default full Node | 68 passed, 3 skipped |
| Explicit sandbox | 3 passed of 3; Windows enforcement remains partial |
| Python A1 author proof | 10 passed |
| Foreground full pytest | 424 passed, 4 planned skips in 124.99s |
| Ruff | All checks passed |
| Base diff / status | clean |
| Migration Profile gate | **Not run**; `runtime-profile.spec.ts` remains absent because Task 4 is still blocked |

Node, Python, and sandbox green results prove the recorded code gates only. They do not prove a Profile installation loop, do not turn the Windows sandbox into full enforcement, and do not remove the Task 4 distribution blocker.

## Remaining risks and recommendation

Risks remain: rc.6 Developer Preview behavior; fixed offline Profile install debt; trusted same-process plugin model; Windows partial sandbox; A1-only bridge; and JSONL probe ledger. The deferred product decision for the first unified learning object remains `repo_task` versus `cordis_plugin`, with `repo_task` recommended.

Forbidden-effect counts for this closeout: zero Task 4 product diffs, zero migration Profile-gate runs, zero paid-model calls, zero live-web calls, and zero real-Docker runs. The only post-Task-4 repair is the single test-only settlement-race commit above.
