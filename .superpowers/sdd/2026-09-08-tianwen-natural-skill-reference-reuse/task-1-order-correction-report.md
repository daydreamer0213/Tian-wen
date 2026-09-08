# Task 1 order correction report

Status: DONE.

Base: `94ee716f0517282ee74a055a1c119608bc451546`.
All commands ran from `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`.
Read the complete correction brief, updated source-reuse design and updated Task 1 brief.

## Change and scope

The existing source-read order guard now accepts an absent exploration or an exploration whose existing `result` is present. It still rejects incomplete exploration, candidate/decision/stop, a second read, replacement, scope mismatch and reused proof. No new completion flag, parser field, record shape, exploration limit, authority rule or engine was added. The existing result owner already derives completion only after both arms.

Production change: one guard replacement (2 added lines / 1 removed line) in `packages/tianwen-evolution/src/conversation-guidance.ts`. No production ledger change was necessary: its existing shared chronology/authority validator accepts the corrected order once the state guard does.

Tests reuse the existing fixtures:

- Completed exploration → independent source read → correctly bound candidate succeeds in state.
- Selection cannot borrow the earlier exploration proposal, control execution or treatment review proof.
- Intent-only and one-arm exploration explicitly remain forbidden for source reading; both have no result.
- The real ledger accepts the completed order, still refuses a decision after nine formal arms, and derives acceptance after the tenth. Fresh disk replay preserves the exact projection/events, and a duplicate read appends no event.
- Existing tests for the opposite order, immutable source slots, scope, declaration binding, stop, proof independence, consent/support/parent/quality and historical replay are rerun in the scoped gate.

Code/tests size: 3 files, 50 insertions and 3 deletions. The fourth owned file is this report. Original Task 1 implementation/report and all frozen Task 2 files remain untouched.

## RED before production change

Complete command:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'; & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts -t 'completed exploration then|rejects reading after exploration'
```

Actual output at 17:42:18, exit 1:

```text
Test Files  2 failed (2)
Tests       2 failed | 2 passed | 93 skipped (97)
Error: guidance source must be read before exploration, candidate and decision
Duration    2.84s
```

Both expected positive paths reached the original source-read order guard after a complete exploration and failed there: `ConversationGuidanceState.validate`, `conversation-guidance.ts:370`. The intent-only/one-arm prohibition tests both passed. No malformed fixture or missing API stood in for the intended RED.

## GREEN and checks

Complete command:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'; & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts
```

Actual output at 17:42:38, exit 0:

```text
Test Files  2 passed (2)
Tests       97 passed (97)
Duration    8.31s (transform 1.40s, setup 0ms, import 1.97s, tests 5.72s, environment 0ms)
```

Typecheck command:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'; & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' --filter '@tianwen/evolution' typecheck
```

Exit 0, output: `$ tsc -b --pretty false`.

Owned code/test `git diff --check`: exit 0, no output. Reviewed the complete owned diff: only the intended guard and focused fixture tests changed. Final scoped test output has no warnings or stray output.

## Ownership and limits

Only these files are committed:

1. `packages/tianwen-evolution/src/conversation-guidance.ts`
2. `tests/dsh-migration/conversation-guidance.spec.ts`
3. `tests/dsh-migration/conversation-guidance-ledger.spec.ts`
4. This report.

The preexisting seven runtime source/test edits, frozen Task 2 report and project handoff document were not edited, staged or reverted. No model, browser, external-source, buildpack, Daily, dependency or full-suite action was run. Runtime-specific test files were not run.

This proves the corrected pure-state and persisted-ledger order. Runtime recovery still must verify that a source selection made after exploration has the same complete exploration observation in its real native request; an earlier selection session cannot be relabeled as a later one. That is the ongoing Task 2/runtime responsibility, not a new ledger field or authority. Fresh combined verification remains for the root after Task 2 stabilizes. No additional correction-scope concern remains.
