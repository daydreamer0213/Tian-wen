# Task 4 report: real Learn Loop Web/Desktop product path

## Status

**Automated Task 4 proof PASS, with one explicit manual boundary.** The real DSH
Web product path passed, and the Desktop package contains the exact same proven
Runtime Bundle tarball and client artifact. A trustworthy manual observation of
the Desktop overlay was not possible in this non-interactive session and is not
claimed.

- Branch: `codex/tianwen-learn-loop-web-entry`
- Baseline: `be94cabdfe2dd4987320ab44fa044bef2600fcdc`
- Commit: `HEAD` containing this report, with subject
  `test: prove the Learn Loop Web product path`

## Scope and files

Task 4 changed only its brief-owned files plus two files explicitly authorized
by the supervising agent:

- `tests/dsh-migration/learn-loop-web-product.spec.ts`
- `scripts/verify-dsh-profile.mjs`
- `scripts/stage-desktop-runtime.mjs`
- `scripts/audit-desktop-artifact.mjs`
- `docs/operations/tianwen-learn-loop-web-entry-handoff.md`
- `packages/tianwen-runtime-bundle/package.json` — authorized to export
  `./package.json`, required by the exact DSH client registry.
- `tests/dsh-migration/tianwen-desktop-artifact.spec.ts` — authorized to use a
  minimal real tgz fixture and prove the strict missing-client failure.
- `.superpowers/sdd/2026-08-29-tianwen-learn-loop-web-entry/task-4-report.md`

No design or plan document was changed. The implementation reuses the existing
DSH Profile bootstrap, installer Koffi policy, Runtime staging, and artifact
audit. It does not copy a DSH runtime or introduce a browser harness.

## RED

1. The first meaningful product-spec RED failed at the verifier's exact
   installed Runtime file-set check because `dist/client.js` was not yet
   accepted or verified.
2. A focused registry RED proved the fresh Profile could not resolve
   `@tianwen/runtime-bundle/package.json` because `./package.json` was absent
   from the root package exports.
3. After client discovery succeeded, the first real `run-current-task` attempt
   failed with `Mismatched native Koffi modules`. Allowing a fresh Koffi build
   alone selected `3.1.6` and required CMake. Read-only diagnosis established
   that exact DSH host compatibility requires the installer's already managed
   `koffi: 3.1.4` override.
4. The strict Desktop audit RED rejected an otherwise valid Runtime tgz missing
   `package/dist/client.js`.

Cache-prewarming failures were setup issues and are not presented as product
RED evidence.

## GREEN

The minimum product fixes were:

- verify and package the exact Runtime client artifact only for the Web Profile;
- export `./package.json` for exact DSH registry resolution;
- merge `overrides.koffi: 3.1.4` into the disposable Web Profile while
  preserving the official `nodeLinker` and `allowBuilds` policy;
- verify source/staged/packaged Runtime digest equality;
- require `package/dist/client.js` inside the actual Desktop tgz without
  relaxing the existing embedded-runtime rejection rules.

The final flagged product test passed once after the Koffi policy fix:

```text
tests/dsh-migration/learn-loop-web-product.spec.ts: 1 passed
Duration: 73.31s (test 72.95s)
```

The focused Desktop artifact spec passed:

```text
tests/dsh-migration/tianwen-desktop-artifact.spec.ts: 8 passed
Duration: 958ms
```

## Real product proof facts

- Receipt:
  `D:\DevData\tianwen-learn-loop-web-product-tests\proof\product-proof.json`
- DSH: `0.1.1-rc.2`
- Web Profile:
  `D:\DevData\tianwen-learn-loop-web-product-tests\proof\home\profiles\web`
- Runtime tarball:
  `D:\DevData\tianwen-learn-loop-web-product-tests\proof\packs\tianwen-runtime-bundle-0.1.0.tgz`
- Runtime SHA-256:
  `cef72497e6f75b6ead7c40f5e78fd478a6bfcbe6e6f495ec54e303981a80e2ac`
- Client graph included `@tianwen/runtime-bundle`; its product
  `/plugins/@tianwen/runtime-bundle/client.js` endpoint was reachable.
- Long Goal: `tianwen-long-goal-6b9d7975-81bc-430a-8a26-8e49cd925202`
- Task 1 binding: Goal `goal-64fa6504-6284-414c-8a70-1569d3ccb3c2`, Session
  `session-a1a7d02d-bd14-4859-8af8-a40fc119911f`.
- Task 2 binding: `null`.
- Create and status-read both kept Session and `turn/start` counts at zero and
  made zero model requests.
- `run-current-task` created exactly one Session. Binding timestamp
  `1788001692840` preceded first `turn/start` timestamp `1788001692876`.
- The proof owned PID `10336`; `finally` stopped its exact process tree and
  confirmed the endpoint closed.
- Desktop unpacked output:
  `D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge\dist\tianwen-desktop\win-unpacked`
- The Desktop audit passed against the same tarball digest and confirmed the
  client file is inside that tgz. Desktop did not rerun the semantic scenario.

## Proportional gate

```text
@tianwen/runtime-bundle build: PASS
Focused migration suite: 8 files passed, 1 intentionally skipped
Tests: 152 passed, 1 intentionally skipped
check:no-private-dsh-imports: PASS, 0 violations
typecheck: PASS
git diff --check: PASS
```

The product spec is skipped by default and was counted separately in the
flagged real proof above. Historical natural-task and controlled Activity suites
were not repeated.

## Unproved boundary and concerns

- No trustworthy GUI observer was available, so the Desktop sidebar action and
  overlay were not manually seen or clicked. This is the only planned product
  boundary left unproved by this session.
- The automated Desktop evidence is artifact-level: the existing Desktop build
  contains the exact Web-proven Runtime tarball and client file, with the strict
  no-duplicate-runtime audit still active.
- No paid Provider, natural task, controlled Activity, learning-efficacy run,
  npm publication, GitHub Release, or DSH upstream push occurred.
- All disposable Profiles, package data, Electron caches, and artifacts used by
  this task were kept under `D:\DevData`; no large generated data was placed on
  `C:`.
