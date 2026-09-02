# Task 2 report — repair round 2

Base: `c79bc317c2cfedf7b3669c2ae02a3baaee382ffb`

## Scope

- Made the concise main-conversation delivery idempotent with a small, analysis-specific durable intent/delivered record.  It stores only binding ids, the digest of the public concise report, and DSH's report message id — never the correction note or private analysis.
- Reused the exact main Session's persisted `subagent-report` evidence before sending again, so an accepted-but-unrecorded DSH report is adopted rather than duplicated.
- Recovered the exact native child after the documented `DUPLICATE_CHILD` race only after live/persisted lineage and child-own descriptor verification.
- Folded continuable setup descriptors only from the child-owned event suffix.

## RED evidence

The first focused run after adding the delivery lifecycle exposed two intended missing expectations in the pre-existing mocks:

```text
tests/dsh-migration/learning-analysis-child.spec.ts (15 tests | 2 failed)
  reads a fresh durable projection after an unknown submission commit without resubmitting
  redelivers one exact durable submission after its main-chat report failed
```

The failures showed that the stale replay expected a second main-chat report and the mock overwrote a delivered lifecycle record.  The test was then corrected to model the ledger's idempotent intent/delivered behavior, and regressions were added for the two new race cases.  This round started from an already-in-progress production skeleton, so this is an honest post-change RED observation rather than a clean test-first initial commit.

## GREEN evidence

```powershell
pnpm vitest run tests/dsh-migration/learning-analysis-child.spec.ts
# 1 file passed, 18 tests passed

pnpm vitest run tests/dsh-probe/learning-analysis.spec.ts tests/dsh-migration/message-feedback-bridge.spec.ts
# 2 files passed, 50 tests passed

pnpm -r --filter @tianwen/evolution --filter @tianwen/runtime-bundle typecheck
# both packages passed

pnpm run check:no-private-dsh-imports
# privateImportViolations: []
```

## Changed files

- `packages/tianwen-evolution/src/learning-analysis.ts`
- `packages/tianwen-evolution/src/ledger.ts`
- `packages/tianwen-evolution/src/runtime-binding.ts`
- `packages/tianwen-evolution/src/index.ts`
- `packages/tianwen-runtime-bundle/src/learning-analysis-child.ts`
- `packages/tianwen-runtime-bundle/src/learning-analysis-tool.ts`
- `tests/dsh-migration/learning-analysis-child.spec.ts`

## Self-review

- Same canonical submission reports once after successful delivery; a known report failure remains pending and the exact retry only re-reports, without another submission or Candidate.
- An unknown report-delivery append reads the durable ledger before returning; replay sees the delivered record and does not re-send.
- A non-`DUPLICATE_CHILD` native start failure still propagates. A duplicate is adopted only after exact persisted child proof; wrong lineage/descriptor remains fail-closed.
- Revocation after native acceptance still interrupts the native child and does not record it started. DSH cannot retract a prompt already accepted by `startContinuable`.
- The duplicate-adoption path performs that same post-acceptance consent check before recording, so revocation while its durable proof is being read also interrupts rather than starts it.

Commits: `4aebc980e586cba2fdeb0fbeecd019a271da49ac` plus pending follow-up

## Repair round 2 follow-ups

- `2b3a001f50216566a35617e8f0a1ceefc4208be9` rechecks current consent/admission after a `DUPLICATE_CHILD` adoption and interrupts instead of recording when it changed.
- The final report-recovery repair verifies the actual rc.2 persisted UserMessage: `user/message.data` is the direct message, and `reportFrom()` frames content as `Background subagent <childId> reported:` followed by the concise report. It still checks `source.kind`, exact sender, id, and full framed content.

### Final RED/GREEN

With the pre-repair raw-content matcher temporarily restored, the real-shape regression failed as intended:

```text
expected reportFrom to be called 2 times, but got 3 times
```

The persisted DSH envelope was therefore not adopted. After restoring the framed `data.content` matcher:

```powershell
pnpm vitest run tests/dsh-migration/learning-analysis-child.spec.ts
# 1 file passed, 18 tests passed

pnpm -r --filter @tianwen/evolution --filter @tianwen/runtime-bundle typecheck
# both packages passed

pnpm run check:no-private-dsh-imports
# privateImportViolations: []
```

Final follow-up commit: `6f153006564c443b22972f0b94286cab4ef0f162`
