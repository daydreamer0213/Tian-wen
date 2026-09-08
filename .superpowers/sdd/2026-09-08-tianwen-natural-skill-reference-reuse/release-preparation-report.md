# Release preparation report

## Scope

- Base: `b7a9adf2e1d6107e34e89dc763db5af49196291b`.
- Prepared Runtime `0.1.22` and Desktop `0.1.0-preview.23` only in the assigned metadata, runtime/host constants, install/archive identities, CI, README, and assigned tests.
- `0.1.21` is a managed Desktop and installer predecessor. Existing `0.1.10` through `0.1.20`, including the delivered Daily017-era `0.1.17` identity and safeguards, remain in place. The host contract rejects unknown future `0.1.23`.
- The CI Desktop archive stage/audit input is now `tianwen-runtime-bundle-0.1.22.tgz`; the natural-conversation source suite and the matching Python tuple contain `conversation-skill-source.spec.ts`.

## RED

Before production constants were changed, `tests/dsh-migration/tianwen-desktop-host.spec.ts` was updated to require current Runtime `0.1.22`, valid predecessor `0.1.21`, and invalid future `0.1.23`.

Command (with a fresh, verified-nonexistent `D:\DevData\t22p-*` `TEMP`/`TMP`, the supplied gate environment, and the required Node/pnpm):

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-desktop-host.spec.ts
```

Result: expected RED, 17 failed / 44 passed. The failures consistently reported that the old `0.1.21` host Runtime manifest was not the newly required exact package.

## GREEN

All test commands used a new short task-local `D:\DevData\t22p-*` TEMP/TMP directory, the supplied gate environment, `D:\hermes\node\node.exe`, and the project pnpm runtime. No dependency installation, Desktop packing, installer operation, browser/model/network action, Daily action, or lockfile change was performed.

| Check | Result |
| --- | --- |
| `tianwen-desktop-host.spec.ts` | 61 passed / 0 failed |
| Desktop CI file set (`tianwen-desktop-host`, `tianwen-desktop-bootstrap`, `tianwen-desktop-profile-prepare`, `tianwen-desktop-artifact`) | 163 passed / 0 failed |
| `pnpm --filter @tianwen/runtime-bundle typecheck` | passed |
| `pnpm --filter @tianwen/desktop-host typecheck` | passed |
| `.venv\Scripts\python.exe -m pytest -q tests/contracts/test_public_repository_surface.py` | 26 passed |

The first run was only a four-file subset of the installer CI matrix (it omitted `tianwen-installer.spec.ts`): 125 passed / 3 failed. The exact command was:

```powershell
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/controlled-lifecycle-command.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/one-shot-profile-lifecycle.spec.ts tests/dsh-migration/learn-loop-host.spec.ts --reporter=json --outputFile D:\DevData\t22p-20260908200004\result.json
```

The exact persisted logs are `D:\DevData\t22p-20260908200004\result.json`, `D:\DevData\t22p-20260908200004\stdout.log`, and `D:\DevData\t22p-20260908200004\stderr.log` (0 bytes). The failures are all in `runtime-bundle.spec.ts`:

- line 1063: `bundles Tianwen code through the exact public DSH runtime seams` found an import matching `from @tianwen/` in `dist/runtime.js`. The generated file imports `@tianwen/dsh-compat`, `@tianwen/evolution`, and `@tianwen/runtime`.
- line 1132: `bundles the status entry through public DSH roots` found an import matching the same forbidden pattern in `dist/status.js`. The generated file imports `@tianwen/evidence/projector` and `@tianwen/evolution/inspection`.
- line 1331: `packs only the deployable runtime bundle files` reported `missing published declaration: package/dist/explicit-correction-protocol.d.ts` while walking declaration imports in the generated package archive.

No direct `pnpm --filter @tianwen/runtime-bundle build` was run in the first release-preparation pass; only the direct typecheck was run. The failed spec itself invokes `pnpm pack` in a test-local D: pack directory, so this was a Runtime package archive assertion, not a Desktop package action. This task intentionally did not alter the separately approved native-adapter behavior.

### Follow-up build-order diagnosis

The later fresh build evidence is owned by the project root at `E:\待清理\D盘迁移-2026-09-08\Tianwen-自然入口复用-022\build-order-check-20260908-2017\receipt.json`, with `runtime-build.log` and `three-original-failures.log` beside it. It rebuilt Runtime from commit `7686eedb6bfadfcb20dc2855059b5989bb6472ef` successfully before re-running the three original failures. That run changed the result from three failures to two passes and one failure: `runtime-bundle.spec.ts:1131` rejected the sole new metafile input `../tianwen-evolution/dist/conversation-skill-source.js`.

The traced path is `status -> inspection -> ledger -> conversation-guidance -> conversation-skill-source`. The added module is a ledger-inspection parser using `node:buffer` and already allowed learning-intake/learning-analysis dependencies; it is not a registry, model, runtime adapter, tool, or test harness. The narrow test correction adds only this exact existing compiled input to the Status allowlist and retains all existing external and harness guards. Focused results follow after the required test commands complete.

### Follow-up focused results

After the single allowlist correction, the required focused checks passed without a concurrent build or typecheck:

| Check | Result | Persisted evidence |
| --- | --- | --- |
| `pnpm exec vitest run tests/dsh-migration/runtime-bundle.spec.ts` | 64 passed / 0 failed | `E:\待清理\D盘迁移-2026-09-08\Tianwen-自然入口复用-022\release-followup-20260908-2021\runtime-bundle.result.json` |
| `pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts` | 98 passed / 0 failed | `E:\待清理\D盘迁移-2026-09-08\Tianwen-自然入口复用-022\release-followup-20260908-2021\tianwen-installer.result.json` |

The same E: directory contains one stdout/stderr log pair for each command; both stderr logs are empty. These are focused test results only. They do not establish a packaged archive, Desktop artifact, installer delivery, Daily delivery, full release regression, or main CI result.

## Review and limits

- `git diff --check` passed.
- The release version review checked every owned current constant/fixture filename; historical `0.1.21` values are retained only where they name the new predecessor or predecessor fixture.
- README keeps Daily017 as historical delivery, not as an installation claim.
- No packaged-install result, Desktop package result, actual Daily017-to-022 acceptance, full regression, main CI, or final branch review is claimed here.
