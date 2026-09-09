# Task 3 implementation report

## Status

Ready to commit by the root controller. This worker did not stage or commit files.

## Implemented

- Added the pure Evolution `ConversationFileTrialOutput` / `ConversationFileTrialReceipt` contract and strict `parseConversationFileTrialReceipt` parser.
- Added `runConversationFileTrial` using a unique empty child below the required absolute `replicaParent`, Task 1 file seeding, a fresh native Agent with no conversation seed, and actual final-file capture.
- The child synchronously captures delegated policy, resolves native child lineage/model options, joins the parent's live preset, forces native presentation, and restricts visible and executable tools to the file task's exact capability set.
- Added an awaited native around-dispatch guard. Reads are limited to the frozen entry set; write/edit are limited to declared output paths. Outside, case-aliased, linked, nested, escalated, and unknown calls cannot reach a work-tool body.
- Added finite request/tool bounds, caller cancellation, exact frozen call configuration on every request, completed-turn validation, and successful native read/mutation proof.
- Added host receipt retention before return, child disposal, or replica cleanup. The callback receives a separately cloned recursively frozen receipt. Retention failure propagates and preserves the exact replica for diagnosis.
- Added `recoverConversationFileTrial`, which performs cold persistence inspection after the live child is disposed, checks the unchanged native session digest, exact request/material/guidance/config and successful tool/completion evidence, then returns only receipt-retained output. It never reads current files or invokes a model.
- File output digest is `sha256({ answer, files })`. Missing output is an observed failure; chat text cannot substitute for a missing file. Chat trials require a real successful native input read and expose no write/edit tools.
- Historical text trial APIs and Task 4 review/ledger/selection consumers were not changed.

## TDD evidence

### Initial RED

Command:

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/dsh-migration/conversation-file-trial.spec.ts'
```

Relevant result before production implementation:

```text
Test Files  1 failed (1)
Tests       1 failed (1)
AssertionError: expected undefined to be type of 'function'
Expected: "function"
Received: "undefined"
```

This was the expected RED: the test required the new native executor export, which did not exist.

### Initial GREEN

Commands:

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/typescript/bin/tsc' -b 'packages/tianwen-evolution/tsconfig.json' --pretty false
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/dsh-migration/conversation-file-trial.spec.ts'
```

Relevant result:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
```

The Evolution build step is required while iterating because runtime-bundle source resolves the workspace package's generated `dist` entry; the first attempted GREEN correctly exposed the stale build as `parseConversationFileTrialReceipt is not a function`.

### Security RED/GREEN cycles

- Denied outside/unknown calls initially made proof validation fail with `file trial native tool proof is invalid`. Proof validation was corrected to permit recorded failed denials while still rejecting any successful disallowed call; 8/8 tests then passed.
- The policy race test initially recovered `{ mode: 'danger-full-access', source: 'delegation' }` instead of the call-boundary `{ mode: 'read-only', source: 'delegation' }`. Policy capture and child-depth resolution were moved before the first filesystem await.
- The oversized-worker test initially reached execution and failed as an incomplete turn instead of `material-too-large`. A 96 KiB frozen material/guidance bound was added before replica work.

Focused RED command:

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/dsh-migration/conversation-file-trial.spec.ts' -t 'rejects cancellation|captures delegated policy'
```

RED result: 2 failed, 9 skipped. GREEN result after the two fixes: 2 passed, 9 skipped.

## Native preset composition evidence

The test creates and mounts a real `AgentPresets` composition containing the installed `@deepseek-ai/dsh-agent-tool-presentation` plugin in Code Mode, backed by the real installed worker-thread code runtime. Before the trial, the parent advertises reserved `run_code`. The child's actual model request advertises exactly `edit`, `read`, and `write`; `run_code` is absent. The persisted child header names the parent's live `code-test` preset, and the parent's tool presentation is identical after the child retires.

Focused command:

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/dsh-migration/conversation-file-trial.spec.ts' -t 'joins the parent live preset'
```

Result: 1 passed, 9 skipped.

## Cold recovery and live-session boundary

`runConversationFileTrial` captures files, flushes, inspects persistence, retains the receipt, disposes the child Agent, and only then resolves. The recovery test calls `recoverConversationFileTrial` after that return, when the child is absent from the live Agent registry. Recovery uses `ctx.sessionPersistence.inspect` plus the supplied receipt; it does not access `ctx.sessions`, a live Agent, the replica, or current workspace files. The test changes the original workspace bytes before recovery and still recovers the retained exact answer/files.

## Independent task-scoped review

Reviewer: `/root/local_file_trial_implement/task3_independent_review` (`v2_terra`). The reviewer read only the Task 3 brief and the four owned implementation/test files, performed a static security and contract audit, made no edits, and ran no tests or model calls.

The review found:

1. High: cleanup resolved the trial child before checking whether the declared child entry had been replaced by a junction. RED reproduced deletion of the junction target under the same parent. The fix now checks the declared direct child with `lstat` before `realpath`, rejects a link, revalidates containment, and deletes the declared entry rather than the resolved target.
2. High: cold recovery accepted a self-consistent receipt whose file paths did not match the frozen material. RED covered an omitted input, an added path, and a declared output with `null` content. Recovery now requires the exact ordered frozen entry path set and present declared outputs before returning receipt data.
3. Medium suggestion: reject every file trial whose final bytes equal its preimage. The reviewer tied this to the checklist sentence requiring the candidate RED to actually change its replica. This was not adopted as a general product invariant: that sentence defines the required integration-test observation, while an already-correct file or an intentional same-content write can be a valid task. The native-success invariant remains a successful write/edit for every declared output plus actual final output presence. The integration test itself continues to prove a real byte change, and a separate targeted test now locks the clarified rule that a successful native same-bytes save remains valid.

Review-fix RED command:

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/dsh-migration/conversation-file-trial.spec.ts' -t 'refuses cleanup|binds cold receipt|rejects a successful no-op'
```

RED result before triage: 3 failed, 11 skipped. After rejecting the over-broad third suggestion and implementing findings 1 and 2, the focused command for `refuses cleanup|binds cold receipt` passed 2 tests with 11 skipped.

## Final focused verification

Commands:

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/typescript/bin/tsc' -b 'packages/tianwen-evolution/tsconfig.json' 'packages/tianwen-runtime-bundle/tsconfig.json' --pretty false
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/dsh-migration/conversation-file-trial.spec.ts' 'tests/dsh-migration/conversation-file-observer.spec.ts'
git diff --check
```

Result: typecheck exit 0; 2 test files passed, 25/25 tests passed; `git diff --check` exit 0 with no whitespace errors.

## Files changed

- `packages/tianwen-runtime-bundle/src/conversation-file-trial.ts` (new)
- `tests/dsh-migration/conversation-file-trial.spec.ts` (new)
- `packages/tianwen-evolution/src/conversation-files.ts`
- `packages/tianwen-evolution/src/index.ts`
- `.superpowers/sdd/2026-09-09-tianwen-local-file-learning/task-3-report.md` (new report)

## Scope and concerns

- No dependencies, stores, custom Session events, Task 4 consumers, Daily files, network calls, model calls outside the scripted native harness, broad cleanup, staging, or commits were added.
- Successful trials remove only their verified owned child replica and never the parent. A retention failure intentionally leaves one diagnostic child directory.
- The executor is intentionally a focused adapter file; no broader runtime refactor was performed.
