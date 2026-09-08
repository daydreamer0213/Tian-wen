# Task 1 report: explicit natural exploration request contract

## Implementation

- Added the pure `prepareConversationLearningExploration` and persisted-request parser. The request freezes host-provided guidance-study, conversation-task, digest, proof, and proposal inputs; it derives its identity from `{ kind: 'tianwen.learning-exploration.v2', studyId }` and hashes the canonical body without `explorationId` or `requestDigest`.
- Added public exports for the new functions and types, including the guidance proof type required by the host context.
- Reused the existing exploration prediction validation and observation classifier. Classification now accepts only the structural prediction portion required by either request type.
- Kept legacy request construction and parsing available. The legacy fixed request-digest assertion remains `sha256:042240f48341928ead9798a81826db11ab93b57525c218bc9fa7c8505283e500`.

## RED evidence

Command:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'; & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-probe/learning-exploration.spec.ts
```

Result: exit 1; 15 tests ran and 10 new-contract tests failed because `prepareConversationLearningExploration is not a function` (and the parser export was likewise absent). The five legacy-only tests passed.

## GREEN and final verification evidence

Focused test command (same as RED): exit 0; `1 passed`, `15 passed`.

Package typecheck command:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'; & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' --filter @tianwen/evolution typecheck
```

Result: exit 0; `tsc -b --pretty false` completed without diagnostics.

## Covering tests

- Stable same-study identity and changed proposal, proof, and matching source task request digests.
- Changed study identity, JSON canonical round-trip, top-level unknown/missing fields, and tampered schema/source kind/metric/request digest/identity/proposal rejection.
- Source mismatch, indistinguishable explanations and predictions, malformed context identities/proof fields, NUL and UTF-8 session limit, and shared 4096-byte hypothesis limit.
- Recursive freezing and the shared classification table across legacy run and natural conversation sources.

## Self-review and scope

- Reviewed the owned diff and ran `git diff --check`; no whitespace errors.
- The legacy construction order and fixed digest are retained by the focused regression test. No Run, SkillUse, SkillVersionId, accepted outcome, authorization, runtime connection, live model, Daily, Desktop package, dependency, or external-source work was added.
- An unrelated pre-existing modification remains in `docs/superpowers/plans/2026-09-08-tianwen-natural-exploration-reuse.md`; it is not included in this task's commit.

## Files and concerns

- Owned implementation: `packages/tianwen-evolution/src/learning-exploration.ts`, `packages/tianwen-evolution/src/index.ts`, and `tests/dsh-probe/learning-exploration.spec.ts`.
- Assigned report: this file.
- Concern: this task intentionally defines and verifies only the pure request contract; runtime/ledger wiring is deliberately not connected here.
