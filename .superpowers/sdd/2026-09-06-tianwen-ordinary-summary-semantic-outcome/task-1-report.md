# Task 1 implementation report

## Status and scope

- Status: DONE
- Task code base: `50ff7a9` (root docs-only continuation commits are outside this task's product/test diff)
- Implemented only the Task 1 Evolution contract, ledger, barrel exports, and the two specified fixture test files.
- Did not add Runtime/native model calls, receipt entities, storage, databases, dependencies, or framework abstractions.

## What was implemented

1. Added an optional research-summary semantic quality contract to every existing `RunAcceptanceContract` variant. The parser requires the exact schema version and the frozen source-fidelity rubric digest. Contracts without `qualityContract` retain their prior exact key set and digest.
2. Required `acceptanceSubjectDigest` whenever a Run uses the semantic quality contract, while preserving legacy v1/v2/v3 Run binding behavior and identity rules.
3. Added a strict parser for completed and explicit inconclusive semantic reviews. It rejects null, undefined, extra/missing keys, malformed digests, bad verdicts, and non-integer/out-of-range values in the existing five score dimensions.
4. Made `OutcomeIntakeInput` a legacy/semantic union. Semantic Runs require `semanticReview`, including outer inconclusive outcomes; legacy Runs reject that extra field.
5. Bound completed and attempted reviews to the frozen acceptance subject and rubric. Reviewer Session identity/digest and reviewer Evidence cannot reuse the source Run's Session identity/digest or source Evidence.
6. Recomputed the fixed completed-review verdict in `prepareOutcomeIntake`: ID gates must be `met` and `sourceFidelity >= 3`; otherwise the fixed verdict is `not-met`. Only an outer `inconclusive` may conservatively downgrade a completed review. Explicit inconclusive review proof permits only outer inconclusive and cannot emit a failure Signal.
7. Kept source-owned outer `sessionDigest` and `evidenceIds` unchanged in Outcome Signals and Skill-use admission. Reviewer proof remains inline in the semantic Outcome input.
8. Preserved `tianwen.outcome-intake.v1` parsing/writing for legacy input and added exact `tianwen.outcome-intake.v2` parsing/writing for semantic input. Both live writes and cold replay call `prepareOutcomeIntake`, and `inputDigest` includes the semantic proof.
9. Preserved immutable same-Run behavior: identical semantic proof retries return `duplicate: true`; changed request/session/score proof is rejected; request-digest disk tampering fails cold replay.

## Exact exported interfaces

From `packages/tianwen-evolution/src/index.ts`:

```ts
interface ResearchSummaryQualityContract {
  readonly schemaVersion: 'tianwen.research-summary-semantic-contract.v1'
  readonly rubricDigest: Sha256Digest
}

type ResearchSummarySemanticReview =
  | {
      readonly schemaVersion: 'tianwen.research-summary-semantic-review.v1'
      readonly status: 'completed'
      readonly acceptanceSubjectDigest: Sha256Digest
      readonly submissionDigest: Sha256Digest
      readonly rubricDigest: Sha256Digest
      readonly reviewerSessionId: string
      readonly reviewerSessionDigest: Sha256Digest
      readonly requestDigest: Sha256Digest
      readonly reviewEvidenceId: Sha256Digest
      readonly idGateVerdict: 'met' | 'not-met'
      readonly scores: ControlledSkillEvaluatorDimensionScoresV3
    }
  | {
      readonly schemaVersion: 'tianwen.research-summary-semantic-review.v1'
      readonly status: 'inconclusive'
      readonly reasonCode:
        | 'no-canonical-submission'
        | 'review-not-completed'
        | 'review-invalid'
      readonly attempt: null | {
        readonly acceptanceSubjectDigest: Sha256Digest
        readonly submissionDigest: Sha256Digest
        readonly rubricDigest: Sha256Digest
        readonly reviewerSessionId: string
        readonly requestDigest: Sha256Digest
        readonly reviewerSessionDigest: Sha256Digest | null
      }
    }

function prepareResearchSummarySemanticReview(
  value: unknown,
): ResearchSummarySemanticReview
```

Existing exported interfaces changed as specified:

- `RunAcceptanceContract` has `readonly qualityContract?: ResearchSummaryQualityContract` in its shared base.
- `OutcomeIntakeInput` is `LegacyOutcomeIntakeInput | SemanticOutcomeIntakeInput`; the semantic member adds `readonly semanticReview: ResearchSummarySemanticReview`.
- `OutcomeIntakeRecordedEvent` is the v1 legacy event or v2 semantic event. The internal module exports the two named member interfaces for ledger typing; the public barrel continues to export the union.

## TDD evidence

### Baseline

Command:

```text
pnpm exec vitest run tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/skill-governance.spec.ts
```

Result before edits:

```text
Test Files  2 passed (2)
Tests       31 passed (31)
```

### RED cycle 1: quality contract and strict proof parser

Command:

```text
pnpm exec vitest run tests/dsh-probe/outcome-intake.spec.ts -t 'explicit research-summary quality contract|strictly prepares'
```

Expected failing output before implementation:

```text
Test Files  1 failed (1)
Tests       2 failed | 16 skipped (18)
prepares the explicit research-summary quality contract and requires its subject
  TypeError: Run binding input has an invalid shape
strictly prepares completed and explicit inconclusive semantic reviews
  expected 'undefined' to be 'function'
```

These were feature failures: the old exact acceptance parser rejected `qualityContract`, and the required exported strict review parser did not exist.

GREEN result for the same command:

```text
Test Files  1 passed (1)
Tests       2 passed | 16 skipped (18)
```

### RED cycle 2: semantic Outcome, v2 replay, and Skill-use source evidence

Command:

```text
pnpm exec vitest run tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/skill-governance.spec.ts -t 'requires independent proof|uses the five-dimension|allows only outer inconclusive|replays v2 proof|keeps source Outcome Evidence'
```

Expected failing output before implementation:

```text
Test Files  2 failed (2)
Tests       5 failed | 34 skipped (39)
requires independent proof bound to the subject, rubric, and fixed verdict
  expected function to throw an error, but it didn't
uses the five-dimension semantic grade without weakening ID gates
allows only outer inconclusive for an explicit inconclusive proof
replays v2 proof exactly and rejects proof tampering
keeps source Outcome Evidence separate from inline semantic review proof
  LedgerIntegrityError: Outcome intake input is invalid
  Caused by: TypeError: Run binding input has an invalid shape
```

These were feature failures: semantic Runs still admitted plain Outcomes, while the existing input parser rejected every semantic proof as an extra field.

GREEN result for the same command:

```text
Test Files  2 passed (2)
Tests       5 passed | 34 skipped (39)
```

## Final verification

Focused acceptance command:

```text
pnpm exec vitest run tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/skill-governance.spec.ts
```

Fresh result:

```text
Test Files  2 passed (2)
Tests       39 passed (39)
Duration    2.71s
```

Typecheck command and result:

```text
pnpm run typecheck
$ node scripts/typecheck-packages.mjs
exit 0
```

Full regression command and result:

```text
pnpm run test:dsh
Test Files  101 passed | 5 skipped (106)
Tests       1715 passed | 18 skipped (1733)
Duration    473.27s
exit 0
```

The commands used the required D: Node, pnpm/Corepack, probe root, probe Python, TEMP, and TMP environment values from the task brief.

## Files changed

- `packages/tianwen-evolution/src/outcome-intake.ts`
- `packages/tianwen-evolution/src/ledger.ts`
- `packages/tianwen-evolution/src/index.ts`
- `tests/dsh-probe/outcome-intake.spec.ts`
- `tests/dsh-probe/skill-governance.spec.ts`
- `.superpowers/sdd/2026-09-06-tianwen-ordinary-summary-semantic-outcome/task-1-report.md`

## Self-review

- Completeness: checked every Task 1 brief item against live-write and cold-replay coverage. Score 2, score 3, ID failure, forged verdicts, wrong subject/rubric, malformed scores/proof, explicit inconclusive, conservative downgrade, legacy digest/schema, immutable proof retry, disk tampering, and Skill-use source evidence are covered.
- Compatibility: legacy Run ID and legacy Outcome `inputDigest` remain pinned to their pre-change literal values; legacy event input has exactly its four prior keys and cold replays identically.
- Quality: reused the existing ledger entity, digest, exact-key, Run binding, Signal, and Skill-use mechanisms. No duplicate verdict path or new persistence concept was introduced.
- Mutation check: removing the subject/rubric, independent reviewer provenance, score boundary, ID gate, threshold, proof digest, event-version, or source-evidence checks causes at least one named test to fail.
- Scope: no Runtime or native model implementation was added.
- Concerns: none.
