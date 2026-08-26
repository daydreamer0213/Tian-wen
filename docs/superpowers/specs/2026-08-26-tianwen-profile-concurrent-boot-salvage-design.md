# Tianwen Profile Concurrent Boot Salvage Design

**Date:** 2026-08-26

**Status:** User approved the controller-owned salvage direction; written review pending.

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

The controller-owned test keeps two files:

- `packages/boot/app-boot/tests/heal-concurrent.spec.ts`: stages one minimal installation, starts eight children, waits for every IPC `ready`, broadcasts `go`, checks all results, verifies the final junction, and removes the two temporary roots.
- `packages/boot/app-boot/tests/fixtures/heal-concurrent.mjs`: imports the real source module before signalling readiness, runs one `healProfilesModuleFallback()` call after `go`, prints `ok` or a concrete error, disconnects IPC, and exits.

No production test hook, exported private helper, mock filesystem, generic barrier utility, timeout increase, command retry, cache, installer prewarming, or new dependency is added.

The name of the production behavior that makes the test fail is: publishing a Windows junction directly at its final fallback path. The candidate behavior that should make it pass is: create a complete private junction first, then publish it at the final path.

## 5. TDD and stability sequence

1. Create a new D:-hosted DSH salvage worktree at the frozen parent. Do not edit the evaluated workspace.
2. Add only the controller-owned test and fixture.
3. Run the focused test three times on the frozen parent. Every run must fail with the original concurrent-publication error; a timeout or unexpected failure does not count as RED.
4. Apply the evaluated production diff without altering its behavior.
5. Run the focused test three times. Every run must pass; there is no retry-on-failure or favorable-result selection.
6. If GREEN fails, diagnose the production implementation from the new evidence. Do not weaken the test or increase its timeout.
7. Run existing Profile tests, typecheck, full build, built-bin config-dump tests, and `git diff --check`.
8. From three fresh D:-hosted homes, run eight built `web --help` processes together. Require 24/24 exit 0, usage output, empty stderr, the complete 233-link surface, and no staged temporary entries.
9. From a separate fresh home, require built `web --dump-config` to succeed without creating `profiles/node_modules`.
10. Review correctness, Windows lifecycle behavior, cross-platform behavior, and simplicity before any commit or patch adaptation.

Three fixed repetitions are a stability gate, not a retry mechanism: all results are retained and any failure stops integration.

## 6. Integration boundary

If every gate passes:

1. commit the controller-owned DSH salvage on a local branch without pushing upstream;
2. update Tianwen's existing exact rc.7 pnpm patch with the reviewed production and test changes required by the package boundary;
3. run Tianwen's focused patch/Profile tests and repository gates;
4. perform controlled Tianwen main integration;
5. run exact-main CI and report its exact SHA and run result.

If any gate fails, preserve the salvage worktree and report the new blocker. Do not rerun DeepSeek, do not manufacture a passing natural result, and do not integrate a partial patch.

## 7. Learning and transport boundary

This follow-up is controller-owned engineering evidence, not natural learning evidence. The earlier `.CMD` multiline-argument failure occurred before Goal, Session, Run, or model creation and therefore remains outside the current Outcome intake. This salvage does not add a generic pre-Run failure collector or Skill-learning path.

If the same launcher defect later appears on an ordinary user path, prefer fixing the launcher to preserve argument arrays. Only design a narrow pre-Run ingress signal after a second reachable product occurrence shows that a code fix alone is insufficient.

## 8. Success statement

Success means the candidate has a focused, deterministic RED-to-GREEN regression and independently verified real product behavior. It does not change the historical second natural task from `task-incomplete`, does not create a learning Case, and does not imply any upstream DSH publication.
