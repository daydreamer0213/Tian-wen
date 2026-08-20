# DeepSeek Harness probe Tasks 0–2 handoff

**Date:** 2026-08-14

**Status:** Tasks 0–2 complete; Task 3 and all later tasks not started

**Branch:** `codex/deepseek-harness-probe`

**Worktree:** `<probe-worktree>`

This probe does not make Tianwen production-ready and does not authorize full
migration.

## Scope and conclusion

The isolated probe proves the exact published DeepSeek Harness
`0.1.0-rc.6` dependency closure and a thin Tianwen compatibility seam through
public package-root APIs.

- Task 0: exact Alpha base and Python baseline sealed.
- Task 1: exact rc.6 closure, CLI surface, Runtime library surfaces, and
  private-import ban proved.
- Task 2: `@tianwen/dsh-compat`, deterministic scripted adapter, and reusable
  core/persistent harness mounting implemented and proved.
- Task 3 and every later probe task: not started.
- Alpha Task 10: remains frozen.

This is not a runtime-selection or migration decision. Installable
Bundle/Profile composition, Goal authority, restart recovery, Evidence,
Python worker bridging, Artifact/Champion governance, and real sandbox gates
belong to Task 3 or later and remain unproved.

## Git facts and commits

- Required Alpha base:
  `67ef50f673c7786872cf5729a808dd3fe85afcfb`
- Verified starting local HEAD:
  `67ef50f673c7786872cf5729a808dd3fe85afcfb`
- Verified starting remote
  `refs/heads/codex/alpha-a-real-task`:
  `67ef50f673c7786872cf5729a808dd3fe85afcfb`
- Initial blocked evidence:
  `5b7c820b1a1b1b9abd5a4edddbaad06ecb0a889f`
- Initial blocked handoff:
  `96a60f643949afa3c3eda5996b6345d2bb641a18`
- Corrected CLI/library classification:
  `b7743d7da69bfae6cd7c0baca4645828ad25997d`
- Closure hardening after review:
  `ee478f9a6cf25d6e5ac5ca7eb8ae2405f9662600`
- Task 2 compatibility seam:
  `afd0c9205ea88994412a84aa3aec937c35c23afc`
- Final review repair:
  `e521171f030fd5053ee18aab3f3c844d71579700`
- Fail-closed scanner repair:
  `df795e1a0cd4a1d62657cb63660210146850064e`
- Final handoff commit: the commit containing this document; its exact SHA is
  reported in the structured controller handoff after creation.
- Verified reviewed-code remote SHA:
  `df795e1a0cd4a1d62657cb63660210146850064e`
- Final branch remote SHA after the document-only commit: reported in the
  structured controller handoff because a Git commit cannot contain its own
  SHA.

The Codex-provided linked worktree was used as the Task 0 isolation boundary.
No nested worktree was created. `main` was not modified, merged, checked out,
or pushed. No force-push was used.

## Task 0 baseline

Environment:

- Node: `v22.23.1`
- pnpm: `11.20.0`
- Python environment:
  `D:\DevData\tianwen-dsh-probe\venv-task-0-2-7c86`
- uv cache: `D:\DevData\uv-cache`
- baseline TEMP/TMP:
  `D:\DevData\tianwen-dsh-probe\task0-temp-foreground`
- final verification TEMP/TMP:
  `D:\DevData\tianwen-dsh-probe\final-python-temp`
- `UV_OFFLINE=1`

Starting results:

```text
uv run pytest -q
424 passed, 4 skipped in 117.02s

uv run ruff check .
All checks passed!

git diff --check
exit 0
```

An initial hidden-background PowerShell run produced six Windows ACL failures
because redirected `icacls` output used different localized console behavior.
The same focused ACL test passed in the normal foreground environment, and the
required full foreground baseline then produced the canonical result above.
No Alpha/Python source was changed.

## Task 1 dependency and lock evidence

Direct external versions are exact:

- `@deepseek-ai/cordis@4.0.1`
- `@deepseek-ai/cordis-plugin-timer@1.1.3`
- `@deepseek-ai/dsh@0.1.0-rc.6`
- all 14 directly imported `@deepseek-ai/dsh-*` Runtime libraries:
  `0.1.0-rc.6`
- TypeScript `6.0.3`
- Vitest `4.1.8`
- tsx `4.22.4`
- `@types/node@22.20.0`

The root test project also declares the local
`@tianwen/dsh-compat: workspace:*` link. It adds no registry dependency.

Lock evidence:

- `pnpm-lock.yaml` SHA-256:
  `e3244bf53218d8a0da91ef3c3a20ef68443d6fc6eee01613af4d77a6e9f4715a`
- `@deepseek-ai/dsh@0.1.0-rc.6` integrity:
  `sha512-brpZfED7ieRa2PQ5tUxMhHrM1pb2CmKFVM/f6yMULBDMicahk+Z2OsHgTwTDnoiZm23Ftu9rQz0NN4pflaoJcg==`
- all 187 installed packages named `@deepseek-ai/dsh` or beginning
  `@deepseek-ai/dsh-` reported version `0.1.0-rc.6`;
- one CLI surface, `@deepseek-ai/dsh`, has a present file target for
  `bin.dsh`;
- all 14 directly imported Runtime libraries have public root
  `exports["."].types` and `exports["."].default` file targets;
- private DSH source import violations: `0`.

“Exact closure” refers to these resolved installed versions and lockfile
integrities. Some upstream manifests use transitive `^0.1.0-rc.6` ranges;
the frozen lock and installed-version gate still resolve every DSH package to
exactly rc.6.

Machine-readable reports:

- `D:\DevData\tianwen-dsh-probe\task0-2-final-install-report.json`
- `D:\DevData\tianwen-dsh-probe\task0-2-final-import-report.json`
- both report SHA-256:
  `2e93823e0ab8bf8d7a00608fb217abac8a36bf06eaa7b92b649ef0f564206311`

Version authority remains split:

- GitHub source audit:
  `47f943859bef60e4160492346772ded9b24f765a`, rc.5 manifests;
- probe execution authority:
  published npm package and lockfile for exact rc.6;
- rc.6 public manifest contains no `gitHead`; no Git tag/source identity was
  inferred.

Large dependency data is under:

- pnpm store: `D:\DevData\pnpm-store`
- virtual store:
  `D:\DevData\tianwen-dsh-probe\virtual-store-task-0-2-7c86`

Six install scripts were explicitly denied through `allowBuilds: false`
because Tasks 0–2 do not use those native subprocess, telemetry, or build
integrations.

## Initial blocker, controller correction, and recovery

The original plan used one root-library-export predicate for both the CLI
package and Runtime libraries. Under that plan the exact public manifest
produced a real failure:

```json
{
  "name": "@deepseek-ai/dsh",
  "version": "0.1.0-rc.6",
  "exports": null,
  "main": null,
  "module": null,
  "bin": {
    "dsh": "lib/bin.js"
  },
  "gitHead": null
}
```

That evidence was preserved in commits `5b7c820` and `96a60f6`; no private
path was used to bypass it.

The controller then ruled that `@deepseek-ai/dsh` is intentionally the CLI
package and corrected the plan on `main` commit
`33a7fb164ab39d38438ad13acafa5f04fc547d23`. The corrected contract requires:

- CLI package: public `bin.dsh` target exists;
- 14 directly imported Runtime packages: public root types/default targets
  exist.

Corrected TDD evidence:

```text
RED
old checker still rejected @deepseek-ai/dsh for no root "." export
1 failed, 1 passed

GREEN
CLI/library-aware checker
2 passed
```

Review then identified three Important weaknesses: target checks accepted
directories/escaping links, the exact 1+14 direct package set was not
enforced, and the regex scanner missed commented dynamic imports. Regression
tests were added first. The final implementation:

- validates lexical and real paths and requires a regular file;
- enforces the exact CLI plus 14 Runtime direct-package set;
- uses the TypeScript AST for declarations, dynamic imports, `require`,
  import types, and import-equals forms.

The hardened Task 1 test file passes all four tests.

## Task 2 public compatibility seam

The test was written before the package:

```text
RED
Cannot find package '@tianwen/dsh-compat'
```

The minimal implementation then added:

- exact public package-root re-exports and
  `DSH_VERSION = "0.1.0-rc.6"`;
- `ScriptedAdapter`;
- `textResponse()` and `toolCallResponse()`;
- `mountCoreHarness()`;
- `mountPersistentHarness()` with this order:
  test dependencies, `AgentLoop({ agents: [] })`,
  `JsonlSessionPersistence({ root, compression: "none" })`, adapter;
- `waitForIdle()`, using the public `Agent.whenIdle()` after verifying the
  supplied Context registry contains the Agent's unique `SessionId`.

No `@deepseek-ai/*/src/*` import exists.

Task 2 GREEN:

```text
@tianwen/dsh-compat build
exit 0

public-surface.spec.ts
2 passed

private source import scan
0 violations

runtime smoke
mountCoreHarness([]): mounted and disposed
mountPersistentHarness(root, []): mounted and disposed
```

The root Vitest tests require a standard workspace dependency link to resolve
the package name, so root `package.json` declares
`@tianwen/dsh-compat: workspace:*`; the lockfile records only
`link:packages/tianwen-dsh-compat`.

## Final verification

All package operations after the one authorized Task 1 network installation
were offline. Final Node verification:

```text
pnpm 11.20.0 install --offline --frozen-lockfile
Lockfile is up to date, resolution step is skipped
Already up to date
exit 0

check:dsh-install
187 rc.6 DSH packages; 1 CLI; 14 Runtime libraries
exit 0

check:no-private-dsh-imports
0 violations
exit 0

workspace typecheck
exit 0

install-closure.spec.ts + public-surface.spec.ts
2 files passed; 8 tests passed in 7.64s
```

Final Python verification:

```text
uv run pytest tests\alpha\test_task_packages.py -k A1 -q
1 passed, 9 deselected in 0.59s

uv run pytest -q
424 passed, 4 skipped in 115.74s

uv run ruff check .
All checks passed!
```

Repository checks:

```text
git diff --check 67ef50f673c7786872cf5729a808dd3fe85afcfb..HEAD
exit 0

git status --short --branch
clean branch before final handoff update
```

## pnpm and Windows deviations

These deviations remain material audit facts:

1. pnpm 11.20.0 `install` rejected the plan's `--save-exact` option. Exact
   manifests plus `--config.save-exact=true` were used.
2. Node 22 on Windows returned `EINVAL` for
   `execFileSync("pnpm.cmd", ..., { shell: false })`. Scripts run the exact
   Corepack-managed `pnpm.mjs` through `node`, with separate argv and
   `shell: false`.
3. Infinite-depth pnpm JSON exceeded the default 1 MiB child-process buffer.
   The read-only list command uses a 16 MiB buffer.
4. Before the valid RED, pnpm's default `verifyDepsBeforeRun=install`
   triggered one unintended implicit install. It was terminated after one
   package download to the pre-existing C-drive store. No lockfile resulted.
   Partial data was quarantined at:
   - `.dsh-probe\partial-node_modules-auto-install-20260814-1100`
   - `D:\DevData\tianwen-dsh-probe\quarantine-node_modules-auto-install-20260814-1100`
5. Task 2's first offline lockfile-only attempt could not re-resolve a new
   importer because optional-peer registry metadata was not cached. The new
   importer mechanically reused exact references already present in the same
   lockfile. A later `--offline --lockfile-only` and
   `--offline --frozen-lockfile` both passed.
6. Editing the lockfile invalidated pnpm's cached policy result while rc.6
   was still inside pnpm 11.20's global 24-hour minimum-release-age window.
   Task 2 used `minimum-release-age=0` for offline lock/install/build
   validation. Exact versions and integrity hashes remained frozen; downloads
   were `0`.

The accidental C-store event is not evidence for any passing gate and has not
been deleted or minimized.

## Independent reviews

Initial blocked review:

- reviewer: `019ffe42-e3ab-7ec1-80ec-b38e86b6c3e9`
- Critical: `0`
- Important: `0`
- conclusion under the original plan: blocked evidence was sound.

Corrected Task 1 review:

- reviewer: `019ffe56-1ca9-7b13-baba-732de195e367`
- first pass: Critical `0`, Important `3`;
- regression/fix commit: `ee478f9`;
- re-review: Critical `0`, Important `0`, Minor `0`;
- ready for Task 2: yes.

Final Tasks 0–2 scoped review:

- reviewer: `019ffe70-f88e-7dc2-b220-a1522ce876bb`
- first pass: Critical `0`, Important `1`, Minor `6`;
- Important: relative/constructed/createRequire private-source forms could
  bypass the import scanner;
- repair commit: `e521171`;
- additional repair evidence: exact compat manifest versions, real scripted
  Agent round, core/persistent harness tests, and corrected scoped-Context
  handling in `waitForIdle()`;
- first narrow re-review: Critical `0`, Important `1`, Minor `5`; aliased
  CJS/await `createRequire` and constructed scope/src forms required a broader
  fail-closed rule;
- final scanner repair: `df795e1`;
- final narrow re-review: Critical `0`, Important `0`, Minor `3`;
- handoff readiness: ready.

The three open Minor findings are:

1. fail-closed first-argument scanning may reject a future benign constructed
   string containing `@deepseek` even when it is not imported;
2. nested call-result specifiers and deliberately non-normalized package paths
   are not recursively evaluated by the scanner;
3. the test suite has no negative fixture proving which benign constructed
   strings should remain allowed.

The reviewer directly reran the 8 focused tests and current committed-source
scan. Both passed, and these future-hygiene findings do not block Tasks 0–2.

## Forbidden capabilities and zero-effect record

Not used:

- paid models or model API keys;
- live web/search/fetch;
- Docker, Docker Engine, or a real sandbox;
- DeepSeek Harness fork or copied source;
- `@deepseek-ai/*/src/*`;
- private upstream test files;
- Alpha Task 10;
- Task 3 or later probe code;
- Python/Alpha deletion or refactor;
- automatic Goal mutation;
- candidate activation or Champion movement;
- `main` mutation, merge, or push;
- force-push.

Authorized network effects were limited to the one Task 1 npm dependency
installation and the final normal Git pushes. The first direct GitHub push
attempt timed out without changing the remote; the plan-authorized
command-scoped local proxy `http://127.0.0.1:7897` was then used without
changing Git configuration. No paid model, live web
exploration, or Docker invocation occurred.

## Remaining risks and next action

- The public compatibility seam is proved only for exact rc.6. A future DSH
  release requires rerunning the closure and compile contracts.
- Published rc.6 has no source identity, so the rc.5 audited Git commit and
  rc.6 executable npm closure remain explicitly separate authorities.
- pnpm's release-age policy was overridden only to test the newly published,
  exact, integrity-locked rc.6 closure; controllers should decide a durable
  policy before any production dependency process.
- The private-import scanner deliberately fails closed for constructed
  DeepSeek-looking first arguments. Later tasks should use literal public
  package-root imports and treat a scanner false positive as a review item,
  not weaken the gate silently.
- The three final review Minor findings above remain documented technical
  debt; current committed source has zero private imports.
- Tasks 3+ remain necessary before any runtime-selection recommendation.

The architecture controller should verify the final remote SHA and this
handoff, keep Task 10 frozen, and decide whether to authorize a separate
Task 3 implementation session. This implementation session must not start
Task 3, migration, or production work.
