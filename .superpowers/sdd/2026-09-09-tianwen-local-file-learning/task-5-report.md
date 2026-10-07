# Task 5 source-preparation report — not Task 5 completion

Date: 2026-09-09

Base: `90ec163fa89874651372696595b9725437e74476`

Scope: coordinated release/version/source-closure/CI source and affected contract
fixtures only. Root still owns candidate freeze and packaging, Browser/real-model
acceptance, external Git operations, merge, backup, Daily upgrade and delivery.

## Prepared source

- Runtime identity is `0.1.23`; the exact archive basename is
  `tianwen-runtime-bundle-0.1.23.tgz`.
- Desktop identity is `0.1.0-preview.24`; its manifest, main resource,
  stage/audit scripts and CI inputs name the exact Runtime archive.
- Installer, portable profile, controlled lifecycle and Desktop host require the
  new current Runtime while retaining `0.1.22` as a recognized predecessor.
- The Runtime closure allowlist adds only the three real new Runtime inputs:
  `conversation-file-material.ts`, `conversation-file-observer.ts` and
  `conversation-file-trial.ts`.
- The rebuilt status/CLI/Goal-first closure also required the one exact pure
  Evolution input `../tianwen-evolution/dist/conversation-files.js`. The
  preparation note said this file was already covered by an allowed root, but
  the executed metafiles showed that these three entries use the exact
  `isAllowedStatusInput` file list instead. The correction adds this single
  generated Evolution input; it does not broaden a directory allowlist or add
  a raw module to the published tarball.
- The five new suites are enrolled in the existing `installer-windows` lane,
  after its supported `D:` mapping is established:
  `conversation-file-material.spec.ts`, `conversation-file-observer.spec.ts`,
  `conversation-file-trial.spec.ts`, `conversation-guidance-files.spec.ts` and
  `conversation-file-learning.spec.ts`. Existing Ubuntu conversation claim and
  ledger coverage remains unchanged.

## TDD evidence

All Vitest commands used the installed Node entry directly:
`D:\hermes\node\node.exe node_modules/vitest/vitest.mjs`. Test process
`TEMP`, `TMP`, `NODE_COMPILE_CACHE` and `TIANWEN_DSH_PROBE_ROOT` pointed to
owned children under `D:\DevData`; `COREPACK_HOME` was
`D:\DevData\corepack-home`. All documented opt-in heavy switches were unset.

### Initial RED

After changing only the release/closure contract fixtures, before production
constants were changed:

```powershell
D:\hermes\node\node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts
```

Result: exit `1`; 4 files failed; 77 tests failed and 162 passed. The first
failures were the expected identity mismatch (`0.1.23` expected, `0.1.22`
received), Desktop `preview.24`/Runtime `0.1.23` expectations against the old
source, and the rebuilt Runtime closure delta.

### Narrow closure RED after the coordinated identity update

The same four-file command then returned exit `1`; 3 files passed and one
failed; 236 tests passed and 3 failed. All three failures reported only:

```text
../tianwen-evolution/dist/conversation-files.js
```

in the status, CLI and Goal-first exact closure checks. This evidence corrected
the preparation note's old allowlist assumption and motivated the single exact
Evolution entry described above.

### Closure GREEN

```powershell
D:\hermes\node\node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/runtime-bundle.spec.ts
```

Result: exit `0`; 1 file passed; 64 tests passed.

### Affected contracts and new Windows-lane suites GREEN

```powershell
D:\hermes\node\node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/controlled-lifecycle-command.spec.ts tests/dsh-migration/controlled-lifecycle-profile.spec.ts tests/dsh-migration/one-shot-profile-lifecycle.spec.ts tests/dsh-migration/ordinary-long-goal-cli.spec.ts tests/dsh-migration/portable-goal-cli.spec.ts tests/dsh-migration/portable-plugin-lifecycle.e2e.spec.ts tests/dsh-migration/portable-profile-composition.e2e.spec.ts tests/dsh-migration/portable-profile.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-startup.e2e.spec.ts tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts tests/dsh-migration/conversation-file-material.spec.ts tests/dsh-migration/conversation-file-observer.spec.ts tests/dsh-migration/conversation-file-trial.spec.ts tests/dsh-migration/conversation-guidance-files.spec.ts tests/dsh-migration/conversation-file-learning.spec.ts
```

Result: exit `0`; 19 files passed and 3 opt-in files skipped; 473 tests passed
and 10 opt-in tests skipped. This was a local Windows run with a real `D:`
drive. It is not a claimed Linux CI run.

### Final release/closure GREEN after the last direct build

```powershell
D:\hermes\node\node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts
```

Result: exit `0`; 4 files passed; 239 tests passed.

## Build and type evidence

- Direct TypeScript build used the sorted package tsconfig list from
  `scripts/typecheck-packages.mjs`, but invoked the installed compiler itself:

  ```powershell
  D:\hermes\node\node.exe node_modules/typescript/bin/tsc -b <all sorted packages/*/tsconfig.json> --pretty false
  ```

  Result: exit `0`, no output.
- Runtime outputs were built on `D:` with the installed
  `packages/tianwen-runtime-bundle/node_modules/esbuild/bin/esbuild` entry for
  `index`, `runtime`, `smoke`, `status`, `cli`, `model-runner`, `create-runner`,
  `goal-first-runner`, `resume-runner` and `controlled-lifecycle-runner`, using
  the same bundle/platform/format/target/external/alias/metafile/output arguments
  declared by the package. `build-client.mjs` and the installed
  `dts-bundle-generator` entry were then invoked directly. Result: exit `0`.
  The declaration generator emitted its existing warning that composite
  projects are unsupported, then generated and checked `dist/index.d.ts`.
- No `pnpm exec`, `pnpm run`, dependency install, Desktop pack or candidate
  publication command was run. The audited ephemeral `pnpm pack` child inside
  `runtime-bundle.spec.ts` ran as part of that contract and removed its owned
  pack fixture in the test's `finally` block.

## Isolated Runtime Profile evidence

The three ordinary tests were selected by exact name so the default-install
test could not run implicitly:

```powershell
D:\hermes\node\node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/runtime-profile.spec.ts -t 'contains dependency preparation despite contaminated user and npm environments|keeps the real migration Profile gate opt-in|rejects forbidden references in full Runtime manifest and metafile'
```

Result: exit `0`; 1 file passed; 3 tests passed and 4 unselected tests skipped.
The default-install Runtime Profile test remains a separate outstanding gate.

## Files in this source slice

Release, lifecycle and CI source:

- `.github/workflows/ci.yml`
- `packages/tianwen-desktop-host/package.json`
- `packages/tianwen-desktop-host/src/host.ts`
- `packages/tianwen-desktop-host/src/locale.ts`
- `packages/tianwen-desktop-host/src/main.ts`
- `packages/tianwen-runtime-bundle/package.json`
- `packages/tianwen-runtime-bundle/src/controlled-lifecycle.ts`
- `packages/tianwen-runtime-bundle/src/portable-profile.ts`
- `scripts/audit-desktop-artifact.mjs`
- `scripts/install-tianwen.mjs`
- `scripts/stage-desktop-runtime.mjs`
- `scripts/verify-dsh-profile.mjs`

Affected contract fixtures:

- `tests/dsh-migration/controlled-lifecycle-command.spec.ts`
- `tests/dsh-migration/controlled-lifecycle-profile.spec.ts`
- `tests/dsh-migration/one-shot-profile-lifecycle.spec.ts`
- `tests/dsh-migration/ordinary-long-goal-cli.spec.ts`
- `tests/dsh-migration/portable-goal-cli.spec.ts`
- `tests/dsh-migration/portable-plugin-lifecycle.e2e.spec.ts`
- `tests/dsh-migration/portable-profile-composition.e2e.spec.ts`
- `tests/dsh-migration/runtime-bundle.spec.ts`
- `tests/dsh-migration/runtime-profile.spec.ts`
- `tests/dsh-migration/tianwen-desktop-artifact.spec.ts`
- `tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts`
- `tests/dsh-migration/tianwen-desktop-host.spec.ts`
- `tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts`
- `tests/dsh-migration/tianwen-installer.spec.ts`
- `tests/dsh-migration/tianwen-startup.e2e.spec.ts`
- `tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts`

This report is the only documentation file owned by this slice. No Task 4
functional module, Task 3 executor, root progress/handoff/coverage document,
acceptance protocol, lockfile or dependency manifest was changed.

## Compatibility and remaining gates

- `0.1.22` is explicitly retained by installer classification, Desktop host
  upgrade classification, bilingual Desktop copy and their contract fixtures.
  Earlier supported Runtime versions remain in the same lists. Historical
  results and deliberate old-version fixtures were not blanket-rewritten.
- `git diff --check` returned exit `0`.
- This source slice has not frozen or packed an actual release candidate, run
  the default-install Runtime Profile gate, run concurrent cold boot, exercised
  opt-in portable/controlled/Desktop lifecycle E2E, launched Desktop, connected
  the built-in Browser, called DeepSeek, performed real UI acceptance, run
  exact-main CI, staged/committed/pushed/merged, backed up to `E:`, changed Daily
  or verified upgrade/lifecycle delivery.
- Browser availability is not a source-preparation blocker. It remains a root
  acceptance obligation. Nothing here is actual-model acceptance or Task 5
  completion.
