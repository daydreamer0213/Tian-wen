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

The installer CI file set was executed with the same existing matrix: 125 passed / 3 failed. All three failures are in `runtime-bundle.spec.ts` public-import/publication assertions for the separately approved native adapter: two reject current `@tianwen/*` imports and one reports a missing `explicit-correction-protocol.d.ts` in the packed declaration list. They do not involve this release identity diff. This task intentionally did not alter that adapter behavior.

## Review and limits

- `git diff --check` passed.
- The release version review checked every owned current constant/fixture filename; historical `0.1.21` values are retained only where they name the new predecessor or predecessor fixture.
- README keeps Daily017 as historical delivery, not as an installation claim.
- No packaged-install result, Desktop package result, actual Daily017-to-022 acceptance, full regression, main CI, or final branch review is claimed here.
