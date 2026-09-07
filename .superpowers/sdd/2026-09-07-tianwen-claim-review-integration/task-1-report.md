# Task 1 report: native-free v4 audit persistence

## Status

Task 1 domain implementation is complete. The pure evolution boundary now preserves exact legacy review tuples, accepts exact wholly audited tuples, rejects mixed tuples, binds tuple form to the parent quality contract in both task and guidance state validation, and makes v4 current without changing the v3 criterion. The manual current-quality status fixture now also writes valid audited records.

## RED evidence

Command (after loading `D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1`):

`D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs exec vitest run tests/dsh-migration/conversation-claim-audit.spec.ts`

Observed: exit 1; suite could not import `packages/tianwen-evolution/src/conversation-claim-audit.js`, proving the new boundary did not exist.

## GREEN evidence

- New audit boundary: exit 0; 1 file, 3 tests passed.
- Manual status fixture RED: `learning-consent-agent.spec.ts -t "counts natural task and review states"`; exit 1 with `audited review check is invalid`, because its current-quality record still contained legacy checks.
- Manual status fixture GREEN: the same focused command exited 0; 1 passed, 36 skipped.
- `mixed-counter` diagnosis: its isolated run initially failed while the helper wrote current v4 tasks through the live API and then directly appended an absent-contract historical task to the same file. Restoring the intended literal v3 historical pair made the isolated command exit 0; 1 passed, 29 skipped. This was a domain test-fixture error, not assigned to Task 2.
- Exact final Task 1 command: `D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs exec vitest run tests/dsh-migration/conversation-review-panel.spec.ts tests/dsh-migration/conversation-learning.spec.ts tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts tests/dsh-migration/learning-consent-agent.spec.ts tests/dsh-migration/conversation-claim-audit.spec.ts`; exit 0, 6 files passed, 122 tests passed.
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
- `tests/dsh-migration/learning-consent-agent.spec.ts`

## Self-review and concerns

- Legacy parser exactness and consensus thresholds are unchanged.
- v4 unavailable task reviews remain valid only in the existing proof-null/inconclusive/no-check form.
- Every v4 task review with native proof and every v4 arm requires two audits; both audit evidence digests must match.
- The domain parser intentionally cannot authenticate quotes, source roles, complete coverage, or the audit digest against original material. Those checks remain runtime responsibilities.
- No runtime file was changed. This focused Task 1 result is not a full branch regression and does not establish Task 2 native recovery behavior.
