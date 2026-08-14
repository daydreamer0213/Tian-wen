# DeepSeek Harness probe Task 0–2 handoff

**Date:** 2026-08-14

**Status:** blocked in Task 1; Task 2 was not started

**Branch:** `codex/deepseek-harness-probe`

**Worktree:** `C:\Users\Administrator\.codex\worktrees\7c86\AGi`

## Scope and stopping point

- Task 0 is complete.
- Task 1 reached the published-package public-export gate and is blocked.
- Task 2 was not started.
- Task 3 and all later tasks were not started.
- Alpha Task 10 remains frozen.

The blocking fact is that the exact published package
`@deepseek-ai/dsh@0.1.0-rc.6` exposes a CLI binary but no root `"."` library
export:

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

The implementation plan requires every required published package to expose
its `package.json` publicly and to have a root `"."` export. The user
instruction requires a blocked handoff when the rc.6 public export/type
surface is incompatible. No private path or `@deepseek-ai/*/src/*` import was
used to bypass this result.

## Git facts

- Required Alpha base:
  `67ef50f673c7786872cf5729a808dd3fe85afcfb`
- Local starting HEAD:
  `67ef50f673c7786872cf5729a808dd3fe85afcfb`
- Verified remote
  `refs/heads/codex/alpha-a-real-task`:
  `67ef50f673c7786872cf5729a808dd3fe85afcfb`
- Blocked evidence commit:
  `5b7c820b1a1b1b9abd5a4edddbaad06ecb0a889f`
- Remote probe SHA: not pushed because the phase is blocked.
- `main` was not modified, merged, checked out, or pushed.

The Codex-provided linked worktree was used as the Task 0 isolation boundary.
No nested worktree was created.

## Task 0 baseline

Environment:

- Node: `v22.23.1`
- pnpm: `11.20.0`
- Python environment:
  `D:\DevData\tianwen-dsh-probe\venv-task-0-2-7c86`
- uv cache: `D:\DevData\uv-cache`
- baseline TEMP/TMP:
  `D:\DevData\tianwen-dsh-probe\task0-temp-foreground`
- `UV_OFFLINE=1`

Results:

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

Direct versions are exact:

- `@deepseek-ai/cordis@4.0.1`
- `@deepseek-ai/cordis-plugin-timer@1.1.3`
- `@deepseek-ai/dsh@0.1.0-rc.6`
- all direct `@deepseek-ai/dsh-*` dependencies:
  `0.1.0-rc.6`
- TypeScript `6.0.3`
- Vitest `4.1.8`
- tsx `4.22.4`
- `@types/node@22.20.0`

Lock evidence:

- `pnpm-lock.yaml` SHA-256:
  `3891965faf8a799893914a08924f0e9433cfc44f69b011942bd5dcd3b8e76641`
- `@deepseek-ai/dsh@0.1.0-rc.6` integrity:
  `sha512-brpZfED7ieRa2PQ5tUxMhHrM1pb2CmKFVM/f6yMULBDMicahk+Z2OsHgTwTDnoiZm23Ftu9rQz0NN4pflaoJcg==`
- All 187 enumerated installed packages named `@deepseek-ai/dsh` or beginning
  `@deepseek-ai/dsh-` reported version `0.1.0-rc.6`.
- Private import scan reported `privateImportViolations: []`.

Version authority remains split:

- GitHub source audit:
  `47f943859bef60e4160492346772ded9b24f765a`, rc.5 manifests.
- Probe execution authority:
  published npm package and lockfile for exact rc.6.
- rc.6 public manifest contains no `gitHead`; no Git tag/source identity was
  inferred.

Large dependency data is under:

- pnpm store: `D:\DevData\pnpm-store`
- virtual store:
  `D:\DevData\tianwen-dsh-probe\virtual-store-task-0-2-7c86`

Six install scripts were explicitly denied through `allowBuilds: false`
because Task 0–2 do not use their native subprocess, telemetry, or build
integrations. The frozen offline reinstall completed without executing those
scripts:

```text
pnpm.cmd install --offline --frozen-lockfile ...
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 1.3s using pnpm v11.20.0
```

## RED, partial GREEN, and blocker

Valid pre-install RED:

```text
[ERR_PNPM_VERIFY_DEPS_BEFORE_RUN] Cannot check whether dependencies are outdated
Run "pnpm install"
```

This was produced with pnpm 11's automatic run-before-install behavior set to
`error`, so the RED represented the missing installed closure/lockfile rather
than an implicit install.

Partial GREEN:

- exact lockfile generated;
- D drive store populated;
- offline/frozen reinstall passed;
- TypeScript package enumerator exited 0 with no package tsconfig present;
- all enumerated DSH versions were rc.6;
- private import violations were empty.

Blocking focused test:

```text
pnpm.cmd run test:dsh -- tests/dsh-probe/install-closure.spec.ts
Test Files  1 failed (1)
Tests       1 failed | 1 passed (2)

@deepseek-ai/dsh: published package has no root "." export
```

`pnpm.cmd run check:dsh-install` and
`pnpm.cmd run check:no-private-dsh-imports` also exit 1 for the same public
export failure. The latter still emits an empty private-import violation list.

Task 1 therefore has no GREEN completion and was committed only as blocked
evidence. Task 2 has no files, RED, GREEN, build, or typecheck result because
it was not started.

## pnpm/Windows implementation notes

Three plan/runtime incompatibilities were recorded without weakening the
public DSH gate:

1. pnpm 11.20.0 `install` does not accept the plan's `--save-exact` option.
   Exact manifests plus `--config.save-exact=true` were used.
2. Node 22 on Windows returns `EINVAL` for
   `execFileSync("pnpm.cmd", ..., { shell: false })`. The scripts instead run
   the exact Corepack-managed `pnpm.mjs` through `node` with separate argv and
   `shell: false`.
3. Infinite-depth pnpm JSON was larger than the default 1 MiB child-process
   buffer. The read-only list command uses a 16 MiB buffer.

Before the valid RED, pnpm 11's default `verifyDepsBeforeRun=install` caused
one accidental implicit install attempt. It was terminated after the process
tree showed the unintended install and after one package had been downloaded
to the pre-existing C drive pnpm store. No lockfile was produced by that
attempt. Partial generated `node_modules` data was moved into ignored
quarantine:

- worktree quarantine:
  `.dsh-probe\partial-node_modules-auto-install-20260814-1100`
- D drive quarantine:
  `D:\DevData\tianwen-dsh-probe\quarantine-node_modules-auto-install-20260814-1100`

The deliberate exact install then used the D drive store and virtual store.
All later package operations were offline/frozen or read-only. The accidental
event is a process deviation, not evidence that the closure gate passed.

## Independent review

Fresh scoped review of
`67ef50f673c7786872cf5729a808dd3fe85afcfb..5b7c820b1a1b1b9abd5a4edddbaad06ecb0a889f`
was completed by reviewer `019ffe42-e3ab-7ec1-80ec-b38e86b6c3e9`.

Result:

- Critical: none.
- Important: none.
- Minor: the draft handoff was intentionally left untracked and outside the
  reviewed code range; it must be reviewed and staged separately. This final
  document is being committed separately as recommended.
- Assessment: ready to hand off as blocked.

The reviewer independently confirmed:

- the exact plan lists `@deepseek-ai/dsh` as required and requires each
  required package to have a root `"."` export;
- all 187 enumerated DSH packages are rc.6;
- the recursive closure traversal and public manifest resolution are sound;
- the Windows pnpm invocation preserves argv separation and `shell: false`;
- private source violations are zero;
- the committed range contains no model, Docker, live web, or private-source
  invocation.

The review also narrowed the conclusion correctly: this is a failure of Task
1's required root-export predicate for the CLI-only `@deepseek-ai/dsh`
package. It does not prove that all specialized rc.6 runtime-library types
are unusable.

## Forbidden capabilities and scope controls

Not used:

- paid models;
- model API keys;
- live web/search;
- Docker or Docker Engine;
- real DSH sandbox;
- Alpha Task 10;
- DeepSeek Harness fork or copied source;
- `@deepseek-ai/*/src/*`;
- private upstream test files;
- Task 2 compatibility package;
- Task 3 or later probe code;
- Python/Alpha deletions or refactors;
- `main` mutation, merge, or push;
- force-push.

The only network activity was npm dependency installation. No Git push was
performed for this blocked phase.

## Remaining risk and controller decision

The immediate question for the architecture controller is whether the plan
incorrectly classified the CLI-only meta package `@deepseek-ai/dsh` as a
library package that must expose `"."`, or whether the missing root export is
intentionally a release-blocking public-surface failure.

The implementation session must not answer that architecture question by
weakening the contract. Recommended next action:

1. controller reviews this handoff, the exact manifest, the lockfile, and the
   fresh scoped review;
2. if the root-export requirement is intentional, retain blocked status and
   do not start Task 2;
3. if the controller formally narrows the requirement to importable library
   packages while treating `@deepseek-ai/dsh` only as a CLI `bin`, update the
   plan and resume Task 1 in this implementation session;
4. do not start Task 3 or migration work.

This probe does not make Tianwen production-ready and does not authorize full
migration.
