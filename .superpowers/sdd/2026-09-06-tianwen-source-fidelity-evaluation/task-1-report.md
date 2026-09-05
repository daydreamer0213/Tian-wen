# Task 1 implementation report

## Status

DONE. Implemented the future-only source-fidelity evaluation/Shadow protocol path while preserving legacy v2 serialization, identities, hashes, rejection behavior and replay.

The implementation is mechanism-only. It does not claim a real-model success or alter the already completed old-protocol result.

## What changed

- Added one small pure policy module with the frozen source-fidelity rubric, five score keys, minimum original-task improvement (`1`), and Shadow minimum per-dimension score (`3`).
- Added explicit v3 dispatch only where serialized meaning changes:
  - evaluation protocol/plan;
  - blind map and evaluator observation;
  - evaluation result;
  - Shadow plan/result.
- Kept the objective record at v2 because its serialized fields and interpretation did not change.
- Froze explicit-feedback source identity before Candidate materialization: signal, Session, message, feedback version, Session lifecycle, Session digest, Evidence-set digest, acceptance-subject digest, packet digest and packet version.
- Kept Outcome-origin analyses on the existing legacy path. The v3 source contract cannot fabricate a feedback target for Outcome evidence.
- Preserved the five paired task types/order. Only v3 allows clean ID ties into blind review. Ties are not counted as improvement.
- Required `sourceFidelity` scores with no fallback/default. Evaluation v3 requires:
  - every Candidate objective hard gate to pass and no objective regression;
  - original-task source fidelity at least one point above baseline;
  - no source-fidelity drop on the other four tasks;
  - the existing four-dimension total and per-dimension protections unchanged.
- Added the v3 Shadow path with one fixed unseen Candidate holdout and one distinct frozen review Session/contract. A met holdout cannot pass without a persisted semantic observation; inconclusive or any score below 3 is non-promotable.
- Added a private durable ledger event plus record/get accessors for the semantic observation. Ledger write and cold replay revalidate the exact accepted Run, accepted Evidence ID, accepted material digest, frozen rubric/config/material/evidence/source-packet bindings, and reject drift.
- Existing promotion-readiness construction now receives a passing v3 Shadow result only after the ledger has replayed the complete observation-bound result.

## New public APIs

- Policy constants:
  - `CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC`
  - `CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST`
  - `CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY`
  - `CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY_DIGEST`
  - `CONTROLLED_SKILL_SOURCE_FIDELITY_SCORE_KEYS`
- Review reducer/parser:
  - `prepareControlledSkillShadowReviewObservation`
  - `parseControlledSkillShadowReviewObservation`
- Ledger accessors:
  - `recordControlledSkillShadowReviewObservation`
  - `getControlledSkillShadowReviewObservation`
- New exported v2/v3 discriminated types for changed evaluation and Shadow records, plus source-fidelity source/holdout/review contracts and `RecordControlledSkillShadowReviewObservationInput`.
- New private ledger event type: `controlled-skill-shadow-review-observation-recorded` / `tianwen.controlled-skill-shadow-review-observation.v1`.

## TDD evidence

### RED — evaluation policy blind spot

Command:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/controlled-skill-evaluation.spec.ts
```

Relevant output before implementation:

```text
Test Files  1 failed (1)
Tests  3 failed | 28 passed (31)
TypeError: Cannot read properties of undefined (reading 'schemaVersion')
```

The three new tests failed because the source-fidelity policy/version APIs did not exist. The tests covered frozen v3 source/holdout identity, ID ties with real prose-score improvement, and missing/fake/swapped fidelity evidence.

### RED — Shadow ordering/review gap

Command:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/controlled-skill-shadow.spec.ts
```

Relevant output before implementation:

```text
Test Files  1 failed (1)
Tests  3 failed | 15 passed (18)
TypeError: unexpected field: holdoutSessionId, reviewSessionId
```

The three new tests failed because Shadow accepted only the legacy task list and had no independent review contract/observation gate.

### GREEN — owned domain suites

Command:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/controlled-skill-evaluation.spec.ts tests/dsh-probe/controlled-skill-shadow.spec.ts
```

Final output:

```text
Test Files  2 passed (2)
Tests  51 passed (51)
Duration  10.33s
```

This includes the existing ledger replay coverage, an exact legacy-v2 protocol ID/hash assertion, new v3 source freeze/replay/stale-source rejection, and a full real-ledger v3 flow that:

1. rejects a met holdout result/readiness while review proof is missing;
2. durably records the exact semantic observation;
3. rejects a changed observation instead of overwriting it;
4. cold-reopens and reads the observation;
5. records/replays the passing v3 Shadow result;
6. generates the existing promotion pointer/readiness only after the complete proof.

### GREEN — type gates

Focused package gate:

```text
$ tsc -b --pretty false
```

Output: exit 0, no diagnostics.

Root gate:

```text
$ node scripts/typecheck-packages.mjs
```

Final output: exit 0, no diagnostics.

The first root-gate attempt exposed 13 TypeScript union-narrowing diagnostics and the second exposed 9 remaining annotations; these were static typing issues only. They were corrected without changing serialized values, then the focused package and final root gates passed.

## Files changed

- `packages/tianwen-evolution/src/controlled-skill-source-fidelity.ts`
- `packages/tianwen-evolution/src/controlled-skill-evaluation.ts`
- `packages/tianwen-evolution/src/controlled-skill-shadow.ts`
- `packages/tianwen-evolution/src/ledger.ts`
- `packages/tianwen-evolution/src/index.ts`
- `tests/dsh-probe/controlled-skill-evaluation.spec.ts`
- `tests/dsh-probe/controlled-skill-shadow.spec.ts`
- `.superpowers/sdd/2026-09-06-tianwen-source-fidelity-evaluation/task-1-report.md`

## Self-review

- Completeness: checked every Task 1 contract item against the implementation and tests. The real ledger test covers durable write/reopen/read/readiness, not only pure reducers.
- Legacy fidelity: the pre-existing v2 protocol remains exactly `eval-protocol:9493071682afc593f7402860b1c400326be741869865a5f55aa9033999f41caf` with record digest `sha256:b939a96396136c8c99f47075d64cb971cce97ed8c7f330110039fb15a7857000`; all old rejection/replay tests pass.
- Strictness: no default score or source identity was introduced. Missing, foreign, stale, inconclusive and insufficient review data fails closed. Exact duplicates return duplicate receipts; changed completed proof is rejected.
- Scope: no Profile, dependency, provider, scheduler, model, deployment or publication changes. No general store or new framework was added.
- Corrections made during review: removed an unsupported equality assumption between two distinct frozen material contracts; made v3 pre-Candidate duplicate freezing idempotent without changing legacy provenance behavior; tightened independent Session reuse rejection and parser status validation.
- Diff check: `git diff --check` produced no output for owned tracked files.

## Integration obligations / concerns

- The future runtime/orchestration path must construct v3 only for a new explicit-feedback analysis and supply the exact frozen source/packet/holdout/review inputs. Outcome-origin analysis must continue selecting v2.
- The runtime reviewer must pass its exact persisted request/evidence/accepted-material bindings to `recordControlledSkillShadowReviewObservation`; it must not synthesize scores or retry a completed reviewer Run.
- No genuine new real-model Candidate has exercised this future path yet, so real success promotion remains unobserved. This does not affect the mechanism-level proof or the completed old-protocol acceptance result.
