# Task 1 report: shared source identity and natural source ledger binding

Status: DONE. This is the source contract/ledger checkpoint only, not connected runtime or real-source-use evidence.

Working directory for every command: `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`.
Base checked before commit: `663df3957b257dafd3ac68d955cf5667eeb99088`.
Read the complete assigned brief, frozen design, and implementer prompt template. No interface ambiguity required escalation. No other implementation worker's files were changed.

## Implementation

- Extracted `LearningSkillReference` and `parseLearningSkillReference`: the old nine identity fields and validation rules. `LearningSkillAdmission` extends that identity and retains its exact eleven-field gate plus the old scope/tool safe-text validation.
- Added the separate exact twelve-field natural admission parser. It accepts only `conversation:sha256:<64 lowercase hex>` scope, the specified purpose, and a correctly shaped environment digest. It uses the shared identity parser without constructing a fake legacy admission.
- Added full-definition parsing: ordinary JSON object, actual native name/provider match, model-invocable true, correctly typed description/source/invocation flags, string content of at most 16,384 UTF-8 bytes, and exact whole-definition digest. The parser validates JSON representability, then uses the existing canonical JSON representation and JSON parsing to return a detached definition. Optional native path/resourceBase/metadata remain part of the definition and digest.
- Nonserializable/omitted/coerced values are rejected: undefined, functions, bigint, symbols, cycles, nonfinite numbers, non-plain objects, hidden non-JSON properties and decorated/sparse arrays. No smaller overall-material cap was introduced; the existing 96 KiB host material boundary remains host-owned.
- Added exact three-field `GuidanceSourceUse` with digest, adapted/not-used status and bounded nonblank, NUL-free rationale.
- Added `source-reference-read` parsing and immutable study slot in the existing guidance state. The record binds its full definition to the parsed natural reference and its scope to the opened study. It can occur only after opening and before exploration/candidate/decision/stop. Its selection proof reserves the existing global native-session set.
- Candidate parsing preserves the old shape when no declaration exists. State validation permits sourceUse iff there is a source read and requires `readDigest === sha256(sourceReference)`. Both statuses retain the existing formal five-case/ten-arm requirement.
- Source read can precede one existing exploration. An insufficient-evidence stop remains possible and must carry a fresh independent proof under the existing rules.
- Extended the existing mutation-only quality gate to source reads and source-bound candidates. Extended the shared chronological ledger validator to check their consent, actual task/feedback support, and current frozen parent. Exact duplicates still return before current guards. Today's quality check was not added to historical replay.
- Exported the new types/parsers from the evolution package index.

## TDD evidence

All test invocations used this exact PowerShell prefix:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'; & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs'
```

### RED 1: parser/export contract before production changes

Command (complete):

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'; & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-skill-source.spec.ts
```

Actual output at 16:54:33:

```text
Test Files  1 failed (1)
Tests       4 failed | 31 passed (35)
TypeError: parseLearningSkillReference is not a function
TypeError: parseConversationSkillAdmission is not a function
TypeError: parseGuidanceSourceUse is not a function
Duration    1.42s
```

The four positive round-trip/export assertions failed because the required APIs did not exist. The 31 rejection assertions passed vacuously on missing functions at this stage and are not presented as evidence of correct validation; all were rerun with the real implementation in GREEN.

### RED 2: state binding before state changes

Command:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'; & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-guidance.spec.ts -t 'natural source reference state binding'
```

Actual output at 16:57:46:

```text
Test Files  1 failed (1)
Tests       10 failed | 35 skipped (45)
TypeError: unknown guidance record kind
AssertionError: expected ... /source/i but got 'guidance record has invalid fields'
Duration    628ms
```

The source-read kind and optional source declaration were not yet implemented. Subsequent focused execution exposed one malformed exploration fixture: changing its proof also changes the request identity. The test now calls the existing exploration factory with the replacement proof and explicitly confirms parser acceptance before testing session independence; the rejection cannot come from a stale request digest.

### RED 3: actual ledger authority/quality gaps before ledger changes

Command:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'; & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-guidance-ledger.spec.ts -t 'natural source|for source-|for %s|historical source'
```

Actual output at 17:00:28:

```text
Test Files  1 failed (1)
Tests       8 failed | 4 passed | 37 skipped (49)
AssertionError: expected [Function] to throw an error
Duration    3.41s
```

The eight unexpected acceptances were real authority/quality failures for otherwise valid records: source read and source-bound candidate after actual support withdrawal; both source steps after consent change; both source steps after a competing parent activation; and new source read / source-bound candidate mutations on historical-quality studies. Four positive persistence/historical replay cases already passed. The ledger production gates were changed only after these failures were recorded.

### RED 4: self-review found silent JSON omission

Command:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'; & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-skill-source.spec.ts -t 'silently omit'
```

Actual output at 17:04:30:

```text
Test Files  1 failed (1)
Tests       1 failed | 37 skipped (38)
AssertionError: expected [Function] to throw an error
Duration    1.35s
```

The failing definition had a reviewed canonical digest but contained a nonenumerable function that JSON would omit. Added own-property checks for objects and JSON-array element shape checks so the parser rejects silent stripping. The regression also covers decorated arrays and symbol properties.

## Final GREEN and verification

Complete final focused command:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'; & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-skill-source.spec.ts tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts tests/dsh-migration/learning-skill-reuse.spec.ts
```

Final actual output at 17:05:08 (exit 0):

```text
Test Files  4 passed (4)
Tests       140 passed (140)
Duration    9.85s (transform 1.50s, setup 0ms, import 3.00s, tests 5.57s, environment 1ms)
```

Complete final typecheck command:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'; & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' --filter '@tianwen/evolution' typecheck
```

Actual output (exit 0): `$ tsc -b --pretty false`.

`git diff --check`: exit 0, no output. No warnings or stray test output in the final focused gate. No full suite was run.

## Binding and authority evidence

- Parser tests round-trip the native-shaped fixture, preserve detached path/resourceBase/nested metadata, accept a body exactly 16 KiB and metadata over 16 KiB, and reject missing/extra admission fields, malformed scope/environment/purpose, reviewed identity mismatch, body/hash/provider/name tamper, invalid structural types, oversized multibyte body and non-JSON definitions.
- Both sourceUse statuses go through nine arms without a possible decision; only the tenth allows the unchanged acceptance rule. Both persist and disk-replay the exact source and declaration.
- State fixtures recompute natural scope, baseline parent version and study identity. A parser-valid different natural scope reaches and fails the actual state scope gate. Unknown study, late reads, replacement and incorrect/missing/unsolicited source declaration are rejected.
- Read→existing exploration→candidate works; candidate before both exploration arms fails. Reusing the selection session as proposal, exploration proposal, execution or review fails. A new study cannot select with a previous selection, proposal, execution, review or insufficient-evidence session. Returned source state is detached from caller mutation.
- Ledger records are tested against real existing feedback assessment/retraction fixtures, disabled v3 consent, a revised but still enabled v3 consent, and an actual competing accepted activation. Both source read and source-bound candidate are blocked after those changes.
- Those authority tests also append the otherwise valid forbidden event directly to each isolated test ledger and verify that a fresh ledger rejects it during disk replay. This exercises chronological validation, not only the mutation API.
- Four historical-quality disk fixtures replay opened-only, read-only, read→candidate and read→exploration→candidate histories. Exact frozen projections survive, old-quality new source/candidate mutations fail, exact existing records remain duplicate-idempotent, and replay/duplicate calls add zero events.
- Valid alternate source content with a correspondingly recomputed reference digest still cannot replace the immutable read. Exact read and candidate duplicates remain accepted after consent is disabled, with zero additional events.
- Legacy source-reuse regression is included in the final four-file gate; no legacy runtime semantics or native observation code was modified.

## Files changed (exclusive ownership)

1. `packages/tianwen-evolution/src/learning-analysis.ts`
2. `packages/tianwen-evolution/src/conversation-skill-source.ts` (new)
3. `packages/tianwen-evolution/src/conversation-guidance.ts`
4. `packages/tianwen-evolution/src/ledger.ts`
5. `packages/tianwen-evolution/src/index.ts`
6. `tests/dsh-migration/conversation-skill-source.spec.ts` (new)
7. `tests/dsh-migration/conversation-guidance.spec.ts`
8. `tests/dsh-migration/conversation-guidance-ledger.spec.ts`
9. This assigned report.

## Self-review and limits

The source parser stays a small contract adapter and the state/ledger changes reuse their existing owners. No new engine, scheduler, retry, database, tool expansion, dependency or Run/SkillUse model was introduced. Existing large state/ledger files were not reorganized. Reviewed changed production lines, named tests, diff boundaries and ownership before commit. The malformed exploration-proof test and silent-JSON-omission issue found in self-review were fixed and reverified.

The proof objects in new state/ledger fixtures are deliberately synthetic. This layer validates shape, frozen binding, global session independence and chronological state; it cannot establish a real completed native Session or authorize an external read. Loaded configuration, explicit absolute evolutionRoot/environment identity matching, actual registry snapshot/get, native capture/request/model proof verification, source-only proposal material routing, disposal and recovery remain the assigned host/runtime integration work. The pure environment field parser does not grant access.

No model call, browser, external-source access, Desktop build, dependency install, Daily change, R11, repeated cohort, release action or full suite was performed. Existing overall 96 KiB proposal-material enforcement remains a runtime responsibility; this task only enforces the source body's 16 KiB bound and the source-use rationale bound. No claim is made about actual source selection, adoption effectiveness, activation, production quality or later user benefit.
