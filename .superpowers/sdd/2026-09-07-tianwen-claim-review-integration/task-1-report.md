# Task 1 report: native-free v4 audit persistence

## Status

Task 1 domain implementation is complete. The pure evolution boundary now preserves exact legacy review tuples, accepts exact wholly audited tuples, rejects mixed tuples, binds tuple form to the parent quality contract in both task and guidance state validation, and makes v4 current without changing the v3 criterion.

The full requested five-file test command is not green in this isolated Task 1 state: 81 tests pass and four runtime integration cases fail because the unchanged runtime still emits legacy six-field review results after admitting a current v4 task. Runtime claim-review integration belongs to Task 2. No runtime file was changed here.

## RED evidence

Command (after loading `D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1`):

`D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs exec vitest run tests/dsh-migration/conversation-claim-audit.spec.ts`

Observed: exit 1; suite could not import `packages/tianwen-evolution/src/conversation-claim-audit.js`, proving the new boundary did not exist.

## GREEN evidence

- New audit boundary: exit 0; 1 file, 3 tests passed.
- Five requested domain files: 5 files executed; 81 passed, 4 failed. All four failures are the pre-Task-2 native integration matrix in `conversation-guidance-ledger.spec.ts` (`active`, `active-loop`, `accepted`, `mixed-counter`). The first three never receive the answer because the legacy runtime response lacks the mandatory v4 audit. The mixed-counter path also reaches a runtime-owned current/legacy fixture transition before Task 2.
- Evolution typecheck: `D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs --filter @tianwen/evolution typecheck`; exit 0 (`tsc -b --pretty false`).

## Interfaces delivered

- `ClaimAudit`
- `parseClaimAudit(value, verdict)`
- `ConversationAuditedReviewCheck`
- `ConversationAuditedReviewChecks`
- `ConversationStoredReviewChecks`
- `parseConversationAuditedReviewChecks(value)`
- `parseStoredConversationReviewChecks(value)`
- `parseConversationQualityReviewChecks(value, quality)`
- `conversationReviewConsensus(checks)` widened to structurally revalidate either exact tuple while preserving its old summary semantics.

## Files changed

- `packages/tianwen-evolution/src/conversation-claim-audit.ts`
- `packages/tianwen-evolution/src/conversation-learning.ts`
- `packages/tianwen-evolution/src/conversation-guidance.ts`
- `packages/tianwen-evolution/src/index.ts`
- `tests/dsh-migration/conversation-claim-audit.spec.ts`
- `tests/dsh-migration/conversation-learning.spec.ts`
- `tests/dsh-migration/conversation-guidance.spec.ts`
- `tests/dsh-migration/conversation-guidance-ledger.spec.ts`
- `tests/dsh-migration/conversation-review-panel.spec.ts`

## Self-review and concerns

- Legacy parser exactness and consensus thresholds are unchanged.
- v4 unavailable task reviews remain valid only in the existing proof-null/inconclusive/no-check form.
- Every v4 task review with native proof and every v4 arm requires two audits; both audit evidence digests must match.
- The domain parser intentionally cannot authenticate quotes, source roles, complete coverage, or the audit digest against original material. Those checks remain runtime responsibilities.
- Full five-file green evidence depends on Task 2 updating the actual native runtime producer and its runtime integration fixtures. This Task 1 commit must not be described as a full branch regression.
