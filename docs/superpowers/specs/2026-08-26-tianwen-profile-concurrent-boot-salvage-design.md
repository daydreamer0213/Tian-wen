# Tianwen Profile Concurrent Boot Salvage Design

**Date:** 2026-08-26

**Status:** Approved by the user for controller-owned implementation.

## 1. Outcome

Preserve the second natural task's immutable `task-incomplete` result, then evaluate its DSH code change in a new controller-owned follow-up. The follow-up replaces the flaky Agent-authored concurrency test with the smallest deterministic source-level regression, proves RED on the frozen parent and GREEN on the candidate, and only then decides whether the implementation can enter Tianwen's exact `@deepseek-ai/dsh@0.1.0-rc.7` pnpm patch.

This is not another natural task, does not call DeepSeek, and cannot retroactively change the natural-run receipt, learning decision, or task classification.

## 2. Current facts

- The frozen DSH parent is `b180ce297766abdd6608e95b5c547ebe899d6e6f`.
- The evaluated diff modifies `packages/boot/app-boot/src/profile.ts` and adds one test plus one child fixture.
- The frozen parent plus the Agent test reproduces the original Windows error: `exists and is not a symlink`.
- On the Agent tree, the new test timed out at 60 seconds in one combined run and two isolated runs, but a later isolated diagnostic completed successfully in 27.21 seconds.
- During that successful diagnostic, all eight child processes were still active after roughly ten seconds; the shared fallback had only ten completed links and eight private staged links.
- The Agent test makes every child import TypeScript source through `tsx` and heal an app plus 40 dependencies. Eight children therefore attempt 328 junction publications merely to exercise one publication race.
- The real built CLI completed four controller rounds with 32/32 concurrent launches successful. Each fresh home ended with the complete 233-link surface and no staged temporary entries.
- Existing Profile tests, typecheck, full build, built-bin config-dump tests, single real boot, and boot-free dump checks passed.

During Tianwen patch integration, the first built-product test revision put its
fresh Windows home under `os.tmpdir()` on `C:`. It produced the expected three
RED results, but its first patched GREEN timed out at 120 seconds with only 138
fallback links published and eight staged links left by the terminated
children. A controller diagnostic using the same patched package and eight
processes under a fresh `D:` home completed 8/8 in 8.438 seconds. These samples
temporarily reported 506 links because `pnpm patch-commit` had also refreshed
`content-type` and `negotiator`; those unrelated lock changes were rejected.
After restoring the exact rc.7 dependency graph, the Tianwen workspace install
surface is 505 links. The official installer's managed DSH host materializes a
slightly larger complete closure of 510 links. The DSH source build's 233-link
surface, the workspace package surface, and the managed-host surface are
distinct deployment facts rather than interchangeable correctness thresholds.

The first GREEN of that D:-hosted revision exposed a second test-only defect:
all eight CLI children had exited, while synchronous `rmSync(..., recursive)`
was still deleting the fallback and had reduced it from 506 to 191 links when
the unchanged 120-second test ceiling fired. Node's standard asynchronous
`rm()` removed a preserved full 506-link diagnostic home in 0.122 seconds.
The final test revision therefore changes only cleanup from `rmSync` to awaited
`fs/promises.rm`; it again restarts all RED/GREEN counters and preserves the
failed cleanup-timeout result.

The awaited-cleanup Vitest revision then exposed a separate Windows runner
distortion: all eight real CLI children were still active at 120 seconds. The
same exact patched package, same eight-child controller, and same `D:` probe
root completed from ordinary Node in 7.815--8.842 seconds with 505 links and no
staged entry. Wrapping that controller in another Node child did not help when
Vitest launched it; even `pnpm exec node` reproduced the slowdown, while direct
`node` did not. Environment-variable and path microbenchmarks did not explain
the difference. The package-boundary product regression is therefore a
standalone Windows Node check invoked directly by the Windows CI shell. The
deterministic DSH source regression remains the code-level Vitest gate.

The first patched workspace product run also exposed a second independent
concurrency defect before any favorable result was selected: while several
processes called `initProfile()` for the same fresh Profile, one process read a
partially written `package.json` and failed with `Unexpected end of JSON input`.
The controller stopped package integration and added a separate source
regression with eight synchronized writers and one observer. On the frozen
implementation it failed three out of three times with truncated JSON. The
minimal fix writes each initial Profile file to a private file, atomically
publishes it with a no-overwrite hard link, and removes the private file. The
same regression then passed three out of three times. Existing user files are
still never replaced, and no retry, lock service, dependency, or public test
hook was added.

These facts classify the failing gate as a flaky and over-amplified regression harness, not current evidence that the real Windows product path remains broken. They do not by themselves prove the candidate is ready to integrate.

## 3. Approaches considered

### A. Source test with an IPC start barrier and one managed link — selected

Each child imports the real source module, reports `ready` over Node's built-in IPC channel, and waits. After all eight children are ready, the parent sends `go` to all of them. The staged installation declares only its own package name, so the children race on exactly one fallback junction.

This keeps the source-under-test guarantee, removes unrelated dependency-closure work, and makes the race start deliberate instead of relying on eight expensive imports accidentally aligning.

### B. Built-bin E2E test only — rejected as the primary regression

The real built CLI is the strongest product check, but a source test can run before a fresh build. Making the regression depend only on existing `lib/` output risks testing stale code. Built-bin concurrency remains an independent controller gate, not the only code-level regression.

### C. Raise the timeout or retry the test — rejected

The current test has already both timed out and passed without a code change. A larger timeout or retry would select a favorable scheduling result while retaining the 328-operation amplification. It would not improve the test's causal precision.

## 4. Test design

The controller-owned fallback-link test keeps two files:

- `packages/boot/app-boot/tests/heal-concurrent.spec.ts`: stages one minimal installation, starts eight children, waits for every IPC `ready`, broadcasts `go`, checks all results, verifies the final junction, and removes the two temporary roots.
- `packages/boot/app-boot/tests/fixtures/heal-concurrent.mjs`: imports the real source module before signalling readiness, runs one `healProfilesModuleFallback()` call after `go`, prints `ok` or a concrete error, disconnects IPC, and exits.

No production test hook, exported private helper, mock filesystem, generic barrier utility, timeout increase, command retry, cache, installer prewarming, or new dependency is added.

The later `initProfile()` finding keeps another focused test and fixture:

- `packages/boot/app-boot/tests/init-concurrent.spec.ts`: starts eight writers
  plus one observer behind the same IPC start barrier and requires the observer
  to read only complete initial JSON;
- `packages/boot/app-boot/tests/fixtures/init-concurrent.mjs`: calls the real
  source initializer or repeatedly reads the manifest after `go`.

The large bundle list in this source-only test widens only the direct-write
publication window; it does not add work to the product path.

The name of the production behavior that makes the test fail is: publishing a Windows junction directly at its final fallback path. The candidate behavior that should make it pass is: create a complete private junction first, then publish it at the final path.

## 5. TDD and stability sequence

1. Create a new D:-hosted DSH salvage worktree at the frozen parent. Do not edit the evaluated workspace.
2. Add only the controller-owned test and fixture.
3. Run the focused test three times on the frozen parent. Every run must fail with the original concurrent-publication error; a timeout or unexpected failure does not count as RED.
4. Apply the evaluated production diff without altering its behavior.
5. Run the focused test three times. Every run must pass; there is no retry-on-failure or favorable-result selection.
6. If GREEN fails, diagnose the production implementation from the new evidence. Do not weaken the test or increase its timeout.
7. If product validation exposes another independent race, stop integration,
   add a focused deterministic RED-to-GREEN regression for that race, and keep
   its result separate from the original fallback-link test.
8. Run existing Profile tests, typecheck, full build, built-bin config-dump tests, and `git diff --check`.
9. From three fresh D:-hosted homes, run eight built `web --help` processes together. Require 24/24 exit 0, usage output, empty stderr, the complete 233-link surface, and no staged temporary entries.
10. From a separate fresh home, require built `web --dump-config` to succeed without creating `profiles/node_modules`.
11. Review correctness, Windows lifecycle behavior, cross-platform behavior, and simplicity before any commit or patch adaptation.

Three fixed repetitions are a stability gate, not a retry mechanism: all results are retained and any failure stops integration.

For the Tianwen package-boundary regression, Windows homes must also be created
under the existing `D:`-hosted probe root. A result from a `C:` temporary home
or a `pnpm exec`/Vitest descendant cannot be substituted for the ordinary Node
product path. If the test source changes, its RED/GREEN counters restart; the
invalidated or failed samples remain in the operation record.

## 6. Integration boundary

If every gate passes:

1. commit the controller-owned DSH salvage as local commits without pushing upstream;
2. preserve Tianwen's existing exact `@deepseek-ai/dsh@0.1.0-rc.7` dump-boundary patch and add an exact `@deepseek-ai/dsh-app-boot@0.1.0-rc.7` pnpm patch for both reviewed atomic-publication changes; the published CLI imports this implementation from app-boot, so placing it in the CLI patch would cross the verified package boundary;
3. run Tianwen's focused patch/Profile tests and repository gates;
4. perform controlled Tianwen main integration;
5. run exact-main CI and report its exact SHA and run result.

If any gate fails, preserve the salvage worktree and report the new blocker. Do not rerun DeepSeek, do not manufacture a passing natural result, and do not integrate a partial patch.

## 7. Learning and transport boundary

This follow-up is controller-owned engineering evidence, not natural learning evidence. The earlier `.CMD` multiline-argument failure occurred before Goal, Session, Run, or model creation and therefore remains outside the current Outcome intake. This salvage does not add a generic pre-Run failure collector or Skill-learning path.

If the same launcher defect later appears on an ordinary user path, prefer fixing the launcher to preserve argument arrays. Only design a narrow pre-Run ingress signal after a second reachable product occurrence shows that a code fix alone is insufficient.

## 8. Success statement

Success means both independently observed publication races have focused,
deterministic RED-to-GREEN regressions and the official installed product has
independently verified real behavior. It does not change the historical second
natural task from `task-incomplete`, does not create a learning Case, and does
not imply any upstream DSH publication.
