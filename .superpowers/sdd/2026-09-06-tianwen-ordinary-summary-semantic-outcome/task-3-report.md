# Task 3 implementation report

## Status

DONE. Ordinary semantic Outcomes now enter the existing native analysis and exploration loop, semantic explorations use the same independent source-fidelity reviewer, and fresh semantic Outcome analyses freeze a genuine Outcome-source controlled protocol v3. Historical Outcome/feedback protocols and the legacy exploration metric retain their existing interpretation.

No real model, installer, packaging, publication, or daily Desktop state was used or changed.

## New source, metric, and recovery interfaces

- `ControlledSkillSourceIdentity` is now the exact union of the unchanged feedback shape and `ControlledSkillOutcomeSourceIdentity`:
  `{source:'outcome',signalId,runId,sessionId,outcomeIngestionId,sessionLifecycleFingerprint,sessionDigest,evidenceSetDigest,acceptanceSubjectDigest,packetDigest,semanticReviewDigest}`. It has no `messageId` or `feedbackVersion`.
- Evolution derives the Outcome branch from the first sorted failed `analysis.signalIds` member and the actual Run v3, Outcome v2 completed review, Run Skill use, Signal and source Evidence. The selected fact is marked internally with `selectedOutcomeSource:true`; caller protocol data is not trusted as a fact.
- `recoverOutcomeResearchSummarySourceCase(ctx,status)` reconstructs that deterministic failed source from its persisted native Session, exact first-turn packet/call/result/Evidence, canonical submission, lifecycle and completed semantic review.
- Fresh reviewed semantic Outcome analysis selects controlled protocol v3. Legacy Outcome remains v2, explicit feedback remains v3, retained old v2 still wins its crash window, and missing semantic proof throws without a v2 fallback.
- `LearningExplorationMetric` adds exact `research-summary-source-fidelity.v1`. It is selected only from the frozen semantic quality contract and participates in the existing request/environment digests. The absent/default path remains exact `research-summary-required-id-coverage.v1`; its request digest stays `sha256:042240f48341928ead9798a81826db11ab93b57525c218bc9fa7c8505283e500` in the fixed regression.
- Semantic exploration arms bind the same quality contract, register the existing `source-capture` tool, preserve `{verdict:'not-evaluated',submission}`, and start/await `runResearchSummaryQualityReview` inside the accepted source-tool execution with its native signal, actual Agent, call id and accepted request config. Reconciliation authenticates the resulting durable proof with `recoverResearchSummaryQualityReview`; it never starts a late post-turn review. Completed ID gates plus `sourceFidelity >= 3` decide the arm; missing/invalid/incomplete proof is inconclusive. Legacy arms retain `controlled-enforce` and the local ID oracle.
- `RecoverResearchSummaryQualityReviewInput` no longer accepts `parentAgent`. Recovery inspects `run.sessionId`, checks exact stored Run/lifecycle/source Evidence, derives parent id/cwd/delegation depth from persisted metadata, validates the deterministic reviewer, and registers the existing one-shot trust relation. Warm `RunResearchSummaryQualityReviewInput` still requires the real source Agent. The ordinary admission call removed only its obsolete recovery argument.
- Shadow forbidden-identity collection excludes only the structural union field named `source`; every opaque Outcome Run/Session/proof identity remains forbidden.

## Downstream eight-failure trace and resolution

Task 2's baseline was 1 product E2E file with 8 failures and 1 pass.

1. `... via skill-change`: fresh source requests reached no quality-grade responder, so semantic Outcomes were inconclusive; even with a grade, v2 categories were rejected by ordinary analysis admission. Added the legitimate five-score mechanism response and semantic category/completed-review admission. GREEN.
2. `... via reuse-skill`: same two producer/admission causes prevented analysis creation; the unchanged reviewed-source reuse path now runs after semantic admission. GREEN.
3. `... via reuse-drift`: same causes prevented the intended inspected-source drift result; semantic admission now reaches the unchanged fail-closed reuse check. GREEN.
4. `... via explore-skill-change`: same causes prevented analysis, then the repaired path exposed a separate replay bug: replay rebuilt the request with the legacy default metric. Replay now retains `existing.metric`; the semantic paired observation is `control:not-met/treatment:met`. GREEN.
5. `waits for post-consent...`: absent valid semantic failures meant no reusable ticket and therefore no consent notice. Valid review fixtures plus semantic intake restore the existing post-consent timing and success-counterexample rule. GREEN.
6. `returns one indistinguishable...`: analysis was absent for the same reasons; after admission, semantic native arms also required source-capture, independent reviews, and frozen-metric replay. The result is the expected two `not-met` observations and no Candidate. GREEN.
7. `resumes the same interrupted analysis...`: no semantic analysis existed to persist or resume. With valid source reviews and semantic admission, the same native analysis child is persisted and resumed only after the main-conversation continuation. GREEN.
8. `learns, reports...`: the parent now legitimately has one quality-review child and one analysis child. The assertion now selects the exact analysis role and separately requires exactly one quality preset; it still proves the analysis child is continuable and no child Agent remains live. GREEN.

These are scripted mechanism fixtures only. They do not claim genuine model quality or acceptance.

## TDD evidence

- Cold recovery RED: `pnpm exec vitest run tests/dsh-probe/research-summary-quality.spec.ts` after removing caller parent authority produced 5 recovery failures in the 10-test file. GREEN: 10/10, including full Context disposal/remount, no live source/reviewer Agent and zero new provider requests.
- Analysis RED: focused semantic admission expected an Outcome analysis and received `undefined` from the v1-only gate. GREEN: semantic failures plus later reviewed success are admitted; mixed legacy failures cannot substitute.
- Source union RED: the controlled protocol parser rejected the genuine `source/runId/outcomeIngestionId/semanticReviewDigest` branch. GREEN: exact union parse, deterministic ledger freeze/replay, changed review digest and source swap rejection.
- Orchestrator RED: fresh semantic Outcome froze v2 and missing source proof could fall back. GREEN: semantic Outcome freezes v3 from recovered Outcome material; missing proof freezes nothing; legacy Outcome and feedback behavior remain.
- Metric RED: semantic exploration returned `research-summary-required-id-coverage.v1`. GREEN: it returns `research-summary-source-fidelity.v1`, while the exact legacy digest is unchanged.
- Native-arm RED: `pnpm exec vitest run tests/dsh-migration/learning-exploration.spec.ts -t "reviews semantic native arms independently"` received two inconclusive arms before the source-capture/reviewer integration. GREEN: 1 passed/12 skipped; source results remain `not-evaluated`, two independent review requests contain only packet/submission/rubric, scores 2/3 produce not-met/met.
- Shadow RED: a genuine Outcome source caused legitimate holdout text containing `outcome` to stop as `identity-exposed`. GREEN: ordinary structural text passes, while an actual selected source Session id still stops as `identity-exposed`.
- Product baseline RED: `pnpm exec vitest run tests/dsh-migration/explicit-correction-product.e2e.spec.ts` had the eight named Task 2 failures. Final GREEN: 9/9 in 20.10s.

## Verification

- Focused core gate: 6 files passed, 148 tests passed, 13.77s (`outcome-learning-analysis`, orchestrator, controlled protocol, both exploration suites, quality review).
- Full Shadow Runtime: 1 file passed, 38 tests passed, 39.26s.
- Product E2E: 1 file passed, 9 tests passed, 20.10s.
- Complete Vitest, run once: `pnpm run test:dsh` — 102 files passed, 5 skipped; 1740 tests passed, 18 skipped; 482.61s; zero failures.
- TypeScript: `pnpm run typecheck` — PASS.
- Public import check: `pnpm run check:no-private-dsh-imports` — PASS, `privateImportViolations: []`.
- Python gate was not repeated, as required.

## Changed files

Production:

- `packages/tianwen-evolution/src/controlled-skill-evaluation.ts`
- `packages/tianwen-evolution/src/learning-exploration.ts`
- `packages/tianwen-evolution/src/ledger.ts`
- `packages/tianwen-runtime-bundle/src/learning-exploration.ts`
- `packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.ts`
- `packages/tianwen-runtime-bundle/src/outcome-learning-intake.ts`
- `packages/tianwen-runtime-bundle/src/research-summary-admission.ts`
- `packages/tianwen-runtime-bundle/src/research-summary-source-case.ts`
- `packages/tianwen-runtime/src/research-summary-quality.ts`
- `packages/tianwen-runtime/src/skill-evaluation.ts`

Tests:

- `tests/dsh-migration/explicit-correction-product.e2e.spec.ts`
- `tests/dsh-migration/learning-exploration.spec.ts`
- `tests/dsh-migration/learning-loop-orchestrator.spec.ts`
- `tests/dsh-probe/controlled-skill-evaluation.spec.ts`
- `tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts`
- `tests/dsh-probe/learning-exploration.spec.ts`
- `tests/dsh-probe/outcome-learning-analysis.spec.ts`
- `tests/dsh-probe/research-summary-quality.spec.ts`

## Self-review and concerns

- Old A-D, legacy v2, v1 Outcome shapes/categories/digests and explicit-feedback source bytes were not reinterpreted. The new discriminator is additive and exact.
- Outer Outcome `evidenceIds` and `sessionDigest` remain source-owned. Reviewer Evidence remains inline semantic proof; no new receipt or persistence entity was added.
- Reviewer input is still only the exact packet, canonical submission and frozen rubric. Tests exclude temporary arm instruction and analyst hypothesis. There are no answer-fitting retries or invented feedback identities.
- Source raw arguments remain bound by native Evidence while canonical submission retains its separate digest; Task 2's normalization repair is preserved.
- Native DSH Agent/model/tool/persistence/cancellation surfaces are reused. No SDK, scheduler, generic evaluator, budget, database or unrelated abstraction was introduced.
- The only additional service dependency is the existing root tool registry needed by the already-native reviewer helper.
- Full-remount evidence is genuine: the original parent and Context are disposed, the same persistence/evolution roots are remounted, both source/reviewer Agents are absent, and recovery makes zero provider requests.
- No implementation concern remains. Genuine browser/model acceptance and delivery are intentionally left to root.
