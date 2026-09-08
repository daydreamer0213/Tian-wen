# Task 1 implementation report

BASE: `f3acd73f2faa6670a4f11606def699f0c55dbf2a`.

## RED

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-claim-audit.spec.ts tests/dsh-migration/conversation-review-panel.spec.ts
```

Result: 3 expected failures of 15 tests: current contract was v5 rather than v6 and did not contain the semantic clarification.

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-claim-review.spec.ts
```

Result: 4 expected failures of 31 tests: the v6 method-study instruction did not yet contain raw-feedback precedence or actor/time/scope/commitment/premise guidance.

## GREEN

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/typescript/bin/tsc' -b packages/tianwen-evolution packages/tianwen-runtime-bundle --pretty false
```

Result: exit 0. This is the two affected package incremental compile required because integration fixtures load their existing `dist` outputs.

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-guidance-loop.spec.ts -t "learns from native"
```

Result: 2 passed, 15 skipped. Both native attributable-problem and preference paths bind exact recovered feedback into reviewer material, keep it out of trial-worker input and claim evidence, and retain retraction behavior.

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-claim-audit.spec.ts tests/dsh-migration/conversation-review-panel.spec.ts tests/dsh-migration/conversation-claim-review.spec.ts
```

Result: 3 files passed, 46 tests passed. `git diff --check` was clean.

## Changed files

- `packages/tianwen-evolution/src/conversation-learning.ts`
- `packages/tianwen-evolution/src/conversation-guidance.ts`
- `packages/tianwen-runtime-bundle/src/conversation-task-material.ts`
- `packages/tianwen-runtime-bundle/src/conversation-feedback-assessment.ts`
- `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`
- `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`
- `tests/dsh-migration/conversation-claim-audit.spec.ts`
- `tests/dsh-migration/conversation-claim-review.spec.ts`
- `tests/dsh-migration/conversation-guidance-ledger.spec.ts`
- `tests/dsh-migration/conversation-guidance-loop.spec.ts`
- `tests/dsh-migration/conversation-observer.spec.ts`
- `tests/dsh-migration/conversation-review-panel.spec.ts`

## Self-review and warnings

- v1-v5 contract builders and old review prompt constants remain byte-identical; v5 has an explicit legacy builder and hash assertion.
- v6 requires audited v2 checks, two independent proofs, and the completed-review proof guard in both parent state machines.
- The shared selector validates any present quality contract, uses v6 only for exact v6, and rejects a v6 feedback standard lacking recovered original feedback. Historical/absent material remains on the exact old instruction.
- Feedback is kept out of `conversationEvidenceTexts`, `projectClaimEvidence`, and the explicit worker request projection.
- A five-file focused run was started during disk cleanup but its wrapper detached after the 30-second tool window, so it is intentionally not claimed as evidence. Full affected-suite/build/root-typecheck gates remain deferred under the disk-cleanup instruction.
- One exploratory `pnpm exec tsx` attempted pnpm's dependency consistency check and aborted at its noninteractive modules-directory prompt; no install, deletion or lockfile change occurred.
