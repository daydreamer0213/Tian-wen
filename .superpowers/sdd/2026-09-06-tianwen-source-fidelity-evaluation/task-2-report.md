# Task 2 implementation report

## Status

DONE. Exact native explicit-feedback source recovery, deterministic v2/v3 protocol construction, retained-version dispatch, and the narrow legacy receipt compatibility adapter are implemented and verified.

This task changes policy only for new genuine explicit-feedback analyses. Outcome-origin analyses and unambiguously retained v2 analyses continue to use the legacy protocol. It does not run or claim a new real-model evaluation, mutate the completed procurement evaluation, publish, deploy, or change admission/Profile configuration.

## What changed

- Added one small read-only source recovery module. It resolves exactly one active negative intake, open Ticket signal, v3 Run binding and accepted native Evidence record; validates the Session lifecycle, frozen Session prefix, Evidence-set closure, acceptance subject, actual feedback target message, completed target turn, accepted tool call/result ordering, packet, and canonical accepted submission.
- Frozen-prefix recovery permits legitimate Session events appended after feedback. It incrementally hashes the exact `JSON.stringify(eventsPrefix)` array representation with `Hash.copy()` so every native event is serialized once while all prefixes are still checked for zero/multiple matches.
- Reused the existing research-packet parser and admission extraction. Missing, stale, foreign, ambiguous, wrong-scope, wrong-message/turn/tool/Evidence and call/result disagreement fail closed; no fixture packet or historical answer is substituted.
- Kept the existing scope-string protocol resolver as legacy compatibility and added an explicit discriminated construction input for v2/v3. It has no latest-version inference or new version family.
- The v3 builder replaces only `original-defect` with the exact verified native packet. Adjacent transfer and the three preservation classes remain fixed. The separate fixed unseen holdout is absent from all five paired inputs.
- Supplied Task 1's exact policy, rubric, source identity, holdout and review digests. The first v3 task input digest equals the native source packet digest. Task 1's real protocol reducer accepts and deterministically replays the constructed input.
- Raw source packet/submission content remains in native Session/Runtime material only. Neither the analyst submission, Candidate patch, feedback note nor historical accepted answer enters the frozen protocol builder.
- The orchestrator now selects:
  - v3 plus exact recovered source before the first new explicit-feedback freeze;
  - an exact matching retained v3 record on recovery;
  - the single retained v2 record even in the pre-Candidate crash window;
  - legacy v2 for Outcome-origin analyses.
- Multiple/nonmatching retained records are an explicit retryable interruption, never a latest-record choice. Source recovery/mismatch also flows through the existing durable `failed`/`resumePhase` mechanism with zero protocol/Candidate/model effects. Only unsupported scope keeps the existing `protocol-unavailable` terminal path.
- Migrated existing controlled-executor integration scenarios into explicit retained-v2 regression fixtures by freezing a genuine v2 ledger record before executor entry.
- Kept the legacy one-lifecycle v1 receipt enum unchanged. Its final adapter translates v3-only `original-source-fidelity-not-improved` and `paired-source-fidelity-regression` to the existing `evaluation-failed`; ordinary evaluation records keep the precise reasons.

## API and input contract

Smallest exported read-only recovery invocation:

```ts
import {
  recoverResearchSummarySourceCase,
  type ResearchSummaryFeedbackSourceBinding,
} from './packages/tianwen-runtime-bundle/src/research-summary-source-case.js'

const sourceCase = await recoverResearchSummarySourceCase(
  ctx,
  status satisfies ResearchSummaryFeedbackSourceBinding,
)
```

`ctx` is the native `Context` providing read-only Session inspection plus Evidence/Evolution readers. `ResearchSummaryFeedbackSourceBinding` is the explicit-feedback member of `LearningAnalysisBinding`; it requires the exact analysis, Ticket, Session, message, feedback version, consent revision, parent/child Session and phase binding and excludes Outcome bindings. The result is `ResearchSummarySourceCase`: frozen `ControlledSkillSourceIdentity`, parsed `ResearchPacket`, normalized accepted `ResearchSummarySubmission`, actual target turn and accepted Evidence ID. The function performs no writes.

Versioned protocol construction uses the existing exported resolver:

```ts
resolveExplicitCorrectionProtocol(scopeKey) // unchanged legacy behavior
resolveExplicitCorrectionProtocol({
  scopeKey,
  protocolSchemaVersion: 'tianwen.controlled-skill-eval-protocol.v2',
})
resolveExplicitCorrectionProtocol({
  scopeKey,
  protocolSchemaVersion: 'tianwen.controlled-skill-eval-protocol.v3',
  packetVersion: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.packetVersion,
  source: sourceCase.source,
  packet: sourceCase.packet,
})
```

The v3 discriminant accepts exactly those five keys. Extra analyst/Candidate fields are rejected. The packet version, packet digest and acceptance-subject digest must agree with the recovered source identity.

## TDD evidence

### RED — missing recovery/versioned builder

Commands:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/explicit-correction-protocol.spec.ts tests/dsh-migration/research-summary-admission.spec.ts
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/learning-loop-orchestrator.spec.ts
```

Relevant pre-implementation output:

```text
explicit-correction-protocol: 4 new tests failed because v3 resolution returned undefined or did not reject extra fields
research-summary-admission: 2 failed | 17 passed — research summary feedback source recovery is unavailable
learning-loop-orchestrator: 1 failed | 65 passed — new explicit feedback froze the legacy rubric instead of source fidelity
```

These failures established the absent exact source recovery, versioned construction, Candidate independence, retained-v2 and route-selection behavior.

### RED — source identity closure

Command:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/research-summary-admission.spec.ts
```

Relevant output:

```text
Tests 2 failed | 19 passed
foreign signal scope resolved instead of rejecting
stale acceptance subject rejected at packet recovery (the initial assertion was intentionally narrowed afterward)
```

The implementation now binds intake/signal identity, ingestion, scope and acceptance subject before returning source material.

### RED — legacy receipt adapter

Command:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/controlled-lifecycle-command.spec.ts -t "maps evaluation adapter errors"
```

Relevant output:

```text
Test Files 1 failed (1)
Tests 1 failed | 18 skipped
TypeError: controlled lifecycle stopped receipt enum is invalid
```

The actual `apply(ctx, config)` rejection boundary emitted the new precise evaluation reason into the old receipt. After the single adapter mapping, the same test passed without a new export or enum member.

### RED — retained history and interruption integration

Command:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/learning-loop-controlled-executor.integration.spec.ts
```

Relevant output before the retained-v2 fixture/dispatch correction:

```text
Test Files 1 failed (1)
Tests 8 failed | 3 passed
LedgerIntegrityError: learning analysis protocol is available or no longer eligible
```

The failures showed both gaps: incomplete old fixtures were entering new v3 recovery, and recovery failure was incorrectly converted into the guarded legacy `protocol-unavailable` write. The final real-ledger regression proves an exact active parent with unavailable native source becomes `phase: failed, resumePhase: running`, with no protocol, Candidate or model request.

### RED/GREEN — retained genuine Session performance

The controller's no-model read-only probe decoded 19,291 native events (3.82 MB). Repeated full-prefix serialization consumed more than 160 CPU seconds and was stopped. The linear exact-array hash replaced that quadratic path. A focused 20,000-appended-event regression passes, and the corrected genuine probe completed in 1.93 seconds total process time.

The genuine probe recovered the exact retained message/version/snapshot, 21-item packet, actual target turn and canonical 2,177-byte accepted summary. It made zero model calls, left the old evaluation rejected, and confirmed unchanged ledger and Session file hashes. This is source-compatibility evidence only, not new v3 evaluation efficacy.

### GREEN — focused suites

Command:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/explicit-correction-protocol.spec.ts tests/dsh-migration/research-summary-admission.spec.ts tests/dsh-migration/learning-loop-orchestrator.spec.ts tests/dsh-migration/learning-loop-controlled-executor.integration.spec.ts tests/dsh-migration/controlled-lifecycle-command.spec.ts
```

Final output:

```text
Test Files 5 passed (5)
Tests 136 passed (136)
Duration 19.74s
```

### GREEN — type gates

Commands:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec tsc -b packages/tianwen-desktop-host/tsconfig.json packages/tianwen-dsh-compat/tsconfig.json packages/tianwen-dsh-probe-bundle/tsconfig.json packages/tianwen-evaluator-python/tsconfig.json packages/tianwen-evidence/tsconfig.json packages/tianwen-evolution/tsconfig.json packages/tianwen-runtime-bundle/tsconfig.json packages/tianwen-runtime/tsconfig.json --pretty false --force
D:\hermes\node\node.exe scripts/typecheck-packages.mjs
```

Final outputs: both commands exited 0 with no diagnostics. `git diff --check` also exited 0 with no output.

## Files changed

- `packages/tianwen-runtime-bundle/src/research-summary-source-case.ts`
- `packages/tianwen-runtime-bundle/src/explicit-correction-protocol.ts`
- `packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.ts`
- `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts`
- `tests/dsh-migration/research-summary-admission.spec.ts`
- `tests/dsh-migration/explicit-correction-protocol.spec.ts`
- `tests/dsh-migration/learning-loop-orchestrator.spec.ts`
- `tests/dsh-migration/learning-loop-controlled-executor.integration.spec.ts`
- `tests/dsh-migration/controlled-lifecycle-command.spec.ts`
- `.superpowers/sdd/2026-09-06-tianwen-source-fidelity-evaluation/task-2-report.md`

The other listed Runtime bundle modules were not changed because their existing seams were sufficient. No Task 3 executor, Evolution domain, plan/design document, untracked diagnostic, Profile/admission, dependency, deployment or publication file was edited by this task.

## Self-review

- Completeness: checked each Task 2 brief item against code/tests, including later Session progress, actual target turn, stale/foreign closure, separate unseen holdout, Candidate independence, Outcome v2, retained v2 pre-Candidate recovery, retained ambiguity, missing-source retry and legacy receipt compatibility.
- Native fidelity: recovery reuses the product intake's exact Session digest formula and separately revalidates lifecycle metadata and native Evidence projection. The retained genuine-data probe validates this against DSH's public storage decoder rather than raw packed rows.
- Determinism: a constructed v3 input passes Task 1's real reducer twice with byte-equivalent prepared records. Legacy v2 packets/rubric remain unchanged after v3 construction.
- Scope: no new store, schema, configuration matrix, dependency or framework. One focused shared source module prevents duplicate recovery logic. The receipt repair is one switch at the existing adapter.
- Security/privacy: no raw analyst/Candidate content enters protocol construction; no historical answer is exposed to later blind reviewers. Errors passed to durable retry use bounded non-content messages.
- Corrections during review: added signal/intake scope and identity closure, converted prefix matching from quadratic to linear, recovered v2 before Candidate creation, separated source interruption from unsupported scope, and converted old integration fixtures into explicit retained-v2 ledger cases.
- Diff discipline: only the owned bundle/test/report files are staged for this task; root-owned plan edits and the untracked diagnostic remain untouched.

## Remaining Task 3 integration requirements

- Task 3 must execute v3 paired evaluator scoring from the new controlled baseline/Candidate Runs' accepted canonical submissions; it must not use the historical accepted answer recovered here.
- Task 3 must execute the fixed unseen holdout and its separate frozen review Session/material/config/evidence contracts, then persist Task 1's exact semantic observation before recording a passing v3 Shadow result.
- Task 3 must retain precise v3 evaluation/Shadow reason codes in ordinary governed reporting. Only the old one-lifecycle v1 receipt adapter collapses its two new evaluation reasons.
- Task 3 must dispatch by the retained protocol record schema and use the task/session/material fields produced here; it must not infer latest scope/version, synthesize scores, or reuse paired inputs for the holdout.
- A new genuine explicit-feedback Candidate/evaluation remains required before claiming real v3 efficacy or promotion. The completed old procurement evaluation remains immutable.

## Issues or concerns

No known Task 2 correctness blocker remains. The genuine probe proves exact source recovery and performance only; Task 3 runtime execution and a future genuine v3 evaluation are deliberately not claimed here.

## Fix round 1 — independent review

### Findings addressed

- Retained pre-Candidate protocols now rebuild the complete freeze input with the current task, material, rubric and execution configuration and compare it to the exact retained input. An exact match reuses the retained record and performs no ledger freeze. Any drift fails before another protocol-history effect.
- The executable v3 holdout now uses the exact frozen ID `shadow-task:research-summary-source-fidelity-holdout`. Legacy v2 continues returning `shadow-task:research-summary-unseen-holdout` unchanged.
- The v3 protocol regression hashes every returned holdout task/review material and asserts equality with its frozen descriptor, including task ID, goal/input/workspace/tool schema, authorization, verifier, stop condition, evaluator material, acceptance subject, review configuration/material/evidence and policy rubric.

### TDD RED

Command:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/explicit-correction-protocol.spec.ts tests/dsh-migration/learning-loop-orchestrator.spec.ts
```

Relevant output before the fix:

```text
Test Files 2 failed (2)
Tests 3 failed | 81 passed
v3 returned shadow-task:research-summary-unseen-holdout instead of the frozen source-fidelity ID
retained exact v2 appended another freeze input
retained v2 with changed model resolved instead of rejecting drift
```

### Focused GREEN

The same command after the minimal production changes produced:

```text
Test Files 2 passed (2)
Tests 84 passed (84)
Duration 3.54s
```

The existing real-ledger executor integration was also rerun:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/learning-loop-controlled-executor.integration.spec.ts

Test Files 1 passed (1)
Tests 12 passed (12)
Duration 13.07s
```

### Fix self-review

- The retained comparison uses the already reconstructed complete freeze input and the existing retained record; it adds no state, version, schema, or configuration mechanism.
- Exact retained recovery returns the retained provenance and does not call `freezeControlledSkillEvalProtocol`. New protocols still take the existing freeze path.
- Only the v3 runtime holdout ID changes; v2 serialization and executable ID remain covered unchanged.
- No Task 3 execution, model, deployment, Profile, old procurement data, root documentation, or untracked diagnostic was changed.

### Final fix verification

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/explicit-correction-protocol.spec.ts tests/dsh-migration/learning-loop-orchestrator.spec.ts tests/dsh-migration/learning-loop-controlled-executor.integration.spec.ts
Test Files 3 passed (3); Tests 96 passed (96); Duration 15.42s

D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec tsc -b packages/tianwen-desktop-host/tsconfig.json packages/tianwen-dsh-compat/tsconfig.json packages/tianwen-dsh-probe-bundle/tsconfig.json packages/tianwen-evaluator-python/tsconfig.json packages/tianwen-evidence/tsconfig.json packages/tianwen-evolution/tsconfig.json packages/tianwen-runtime-bundle/tsconfig.json packages/tianwen-runtime/tsconfig.json --pretty false --force
exit 0, no diagnostics

D:\hermes\node\node.exe scripts/typecheck-packages.mjs
exit 0, no diagnostics

git diff --check
exit 0, no output
```
