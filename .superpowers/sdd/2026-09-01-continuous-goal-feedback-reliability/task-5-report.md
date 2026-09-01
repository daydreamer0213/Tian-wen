# Task 5 report: Runtime 0.1.10 and Desktop preview.11

## Delivered version boundary

- Runtime Bundle manifest, portable Profile, controlled lifecycle, installer, profile verifier, desktop stage/audit scripts, and Desktop resource path now require Runtime `0.1.10` and `tianwen-runtime-bundle-0.1.10.tgz`.
- Same-DSH Runtime migration recognizes only the complete `0.1.9` predecessor and retains older archives.
- Desktop manifest is `0.1.0-preview.11`; its host accepts `0.1.10`, identifies `0.1.9` as the known old Runtime, and localized update copy states `0.1.9` to `0.1.10`.
- The approved Task 1 Runtime peer/import contract is reflected in `runtime-bundle.spec.ts`: `@deepseek-ai/dsh-subagent@0.1.1-rc.2` and `src/long-goal-subagent.ts` are exact accepted inputs.

## Test-first evidence

1. Desktop artifact RED: 6 failed / 9 total after assertions changed first.  The first failure was Desktop `0.1.0-preview.10` received where `0.1.0-preview.11` was required; remaining failures showed fixed `0.1.9` archive names in stage/audit scripts.
2. Desktop host and locale RED: 17 failed / 55 total after their assertions changed first.  The host still accepted Runtime `0.1.9` and rejected `0.1.10`; locale copy still stated `0.1.8` to `0.1.9`.
3. Desktop host and locale GREEN: 55 passed / 55 total.
4. Runtime Bundle was rebuilt before packing.  The exact archive was created at `D:\DevData\tianwen-0.1.10-artifacts\tianwen-runtime-bundle-0.1.10.tgz` (341291 bytes) and staged into Desktop.  Existing Desktop archives `0.1.0`, `0.1.6`, `0.1.7`, `0.1.8`, and `0.1.9` remain present.

## Goal-first probe

The exact Goal-first preset test was re-run by itself with `CI=true`, single worker, no file parallelism, and the required D: probe environment.  It failed after 60.43 seconds: `spawnSync ... ETIMEDOUT`.

At 12 seconds, the DSH process was running with the expected profile and two expected patch paths, with no stdout or stderr.  The audit plugin prints only after `loader.await()` resolves; it emitted neither success nor error before timeout.  The available evidence therefore locates the stall in DSH loader initialization/handshake, before audit-plugin completion and not in child-process exit cleanup.  The timeout was not relaxed.

## Full repository gate

Executed with the required environment:

```powershell
CI=true
COREPACK_HOME=D:\DevData\corepack-home
TIANWEN_DSH_PROBE_ROOT=D:\DevData\tianwen-dsh-probe
TIANWEN_DSH_PROBE_PYTHON=D:\DevData\tianwen-dsh-probe\venv-task-6\Scripts\python.exe
pnpm run check
```

Result: failed before typecheck or Vitest at `check:dsh-install`.

Exact failure: `direct DSH dependencies differ from the probe contract`, whose actual direct-dependency list includes `@deepseek-ai/dsh-subagent`.  The root direct-dependency declaration/checker is outside Task 5's approved production-file boundary, so this task did not alter it.  The lockfile refresh command completed successfully using `D:\DevData\pnpm-store`; it produced no lockfile diff.

## Follow-up: approved DSH subagent contract synchronization

The Task 1-approved root devDependency `@deepseek-ai/dsh-subagent@0.1.1-rc.2` was absent from both the install-closure test expectation and `DSH_LIBRARY_PACKAGES` in `scripts/check-dsh-install.mjs`.

Test-first evidence: adding the exact package to `tests/dsh-probe/install-closure.spec.ts` first produced RED (1 failed / 4 tests) because the checker still reported `direct DSH dependencies differ from the probe contract`.  Adding that one package to `DSH_LIBRARY_PACKAGES` then produced GREEN: install-closure 4 passed / 4 and `pnpm run check:dsh-install` exited 0 under the required D: environment.  No version ranges were changed.

## Follow-up: Goal-first cold Profile budget

Read-only diagnosis established that the 60-second child deadline elapsed during DSH `healProfilesModuleFallback()` dependency-closure traversal and temporary junction creation, before DSH boot and before the audit plugin's `loader.await()`.  The test is a correctness probe and its existing outer budget remains 180 seconds.

Only the child `spawnSync` deadline was changed from 60 seconds to 120 seconds.  The exact test was then run alone with one worker and no file parallelism in the required D: environment: GREEN, 1 passed / 60 skipped, total duration 111.05 seconds and test duration 109.21 seconds.  This remains below the unchanged outer 180-second budget.
