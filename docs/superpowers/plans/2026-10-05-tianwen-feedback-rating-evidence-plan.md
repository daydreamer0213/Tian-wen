# Native feedback rating evidence repair

Owner authorization: missing development conditions are actively simulated; do not wait for natural tasks or add release criteria. Full automatic-learning goal stays active; main/Daily NO-GO and existing release requirements remain.

## Observed defect and design

The original r6 bare negative assessor captured an inconclusive judgment with an exact quote of `"rating":"negative","note":""`. Those fields are in the immutable SDK feedback and the supplied model material, but the host evidence whitelist only includes request, answer and note text. The host discarded a valid rating citation as invalid-judgment. Preserve r6 as failed, do not reassess its original version.

Include the compact JSON representation of only the native rating and optional note in the quotable evidence. Use the same field order and JSON escaping as the supplied material. Do not include derived criteria, source identity or synthetic judgments. Existing exact substring checking and all classification, version, consent and proof checks remain. No change to natural feedback without a native rating, immutable material, historical digests or original task reviews.

Alternatives considered: deleting bad quotes would alter the native captured judgment; disabling quote checks would accept invented evidence. Both are unnecessary. Including omitted original evidence is the smallest repair.

## Execution

1. Add public SDK adapter tests for exact rating/empty-note metadata accepted with native proof, and fabricated positive metadata rejected for an actual negative rating. Observe the positive control fail first.
2. Add only native rating/note evidence in conversation-feedback-assessment.ts. Run the original feedback/bridge/profile controls and original Runtime build, then controls against published dist.
3. Continue the same r2 profile read-only over its two settled original tasks and assessments. Execute only the untouched positive task, then original case2 version update and case1 retraction. Cold restart checks original records without model calls. Keep old r2/r6 terminal failures and full traces unchanged.
4. Record exact results and storage use. Only then progress to native new-policy study activation, future task effects and withdrawal. No human satisfaction, activation or improvement claim from these feedback controls.
