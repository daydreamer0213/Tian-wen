# Research-summary material capacity implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow future governed research-summary evaluations to transport every valid canonical submission without truncation, preserving old frozen protocols exactly.

**Architecture:** Configure existing material contracts in the explicit-correction builder; recover the correct known capacity set from frozen contract digests. No native execution or scoring rewrite.

**Tech Stack:** TypeScript, existing Vitest/native DSH harness, Node22.23.1/pnpm11.20.0.

## Global Constraints

- Work only in `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`, branch `codex/research-summary-material-capacity`; baseline `1c1e1f5fb5177641916d7ec82c217c522feaa375`.
- Summary text remains4,096 UTF-8 bytes; packet remains16KiB/32 rows. Parent Skill, tool schema, source-fidelity rubric, scoring, authorization, retry policy and activation remain unchanged.
- Future v3 paired and holdout material use32,768 bytes; holdout review material uses32,768. Legacy capacity selection reproduces4,096/4,096/8,192 exactly.
- Internal v3 choice is `materialMaxUtf8Bytes?: 4_096 | 32_768`; omitted selects32,768. Explicitundefined, strings, unsupported/fractional numbers and unknown fields reject.
- Retained all-five task, holdout and review material digests must match one known capacity set; mixed/unknown sets reject before ledger writes/model calls. Preserve independent retained60,000/300,000 timing and exact freeze equality.
- Legacy scope-only/v2 and shared promote/rollback/restore outputs remain unchanged. No new schema, transport, truncation, cache, configuration UI, dependency or runtime evaluator rewrite.
- Do not touch real acceptance/daily state, provider credentials, frozen tasks, Candidates, feedback, Outcomes or version pointers; never invoke a real model from tests. J and G remain incomplete, B remains rejected.
- Large/generated outputs and temporary test data stay onD:. User and controller changes must not be reverted; you are not alone in the codebase.

## Task 1: Sufficient future capacity with exact retained compatibility

**Files (ownership):**
- Modify: `packages/tianwen-runtime-bundle/src/explicit-correction-protocol.ts`.
- Modify: `packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.ts`.
- Test: `tests/dsh-migration/explicit-correction-protocol.spec.ts`.
- Test: `tests/dsh-migration/learning-loop-orchestrator.spec.ts`.
- Test: `tests/dsh-migration/research-summary-controlled-runtime.spec.ts` (or the existing source-fidelity native-runtime suite if its fixture provides the exact v3 flow; tell controller the file first).

**Interfaces:**
- Consumes `resolveExplicitCorrectionProtocol`, its built tasks/protocol/shadow input,
  existing `createExplicitCorrectionLearningLoopExecutor` retained-record path and
  native `runControlledArms` / accepted-material reader.
- Produces a v3 optional capacity selector and shared known material-contract
  construction used by both builder and retained-record recognition. Keep helpers
  local to the existing protocol module; no general registry/framework.

- [ ] Read the bounded spec and the complete touched code paths. Reuse existing
  native test fixtures. Record the source baseline and exact initial legacy
  protocol/transition snapshots before production edits.

- [ ] Add RED tests for fresh capacities and a valid summary whose JSON material
  exceeds4,096. Cover worst-case escaping with a compact generated fixture:

```ts
const text = '\u0000'.repeat(4_095) + 'x'
const packetText = `<research_packet>\n${Array.from({ length: 32 }, (_, index) =>
  `[F:${String(index).padStart(2, '0')}${'a'.repeat(62)}|required] fact ${index}`,
).join('\n')}\n</research_packet>`
// Normalize through the real product function, then JSON.stringify the exact
// { taskId, submission } shape and assert old < actual <= new capacity.
// A second near-limit Chinese summary reproduces normal multilingual framing.
```

  Extend the existing native-runtime fixture with a legal near-limit accepted
  submission. Assert current old-capacity execution stops with
  `evaluator-material-invalid`; fresh v3 reaches `awaiting-evaluator` with
  untruncated submission material. Do not export private production functions just
  to test them and do not duplicate the whole harness. Existing v3 source-fidelity
  integration is preferred over a newly invented seed flow.

- [ ] Run focused tests, retain their exact expected failure before production edits.

```powershell
$env:PATH = 'D:/hermes/node;' + $env:PATH
$env:TEMP = 'D:/DevData/tianwen-dsh-probe/temp'
$env:TMP = $env:TEMP
$env:TIANWEN_DSH_PROBE_ROOT = 'D:/DevData/tianwen-dsh-probe'
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/explicit-correction-protocol.spec.ts tests/dsh-migration/learning-loop-orchestrator.spec.ts tests/dsh-migration/research-summary-controlled-runtime.spec.ts
```

- [ ] Implement the minimal selector and consistent contract family. The three
  selected capacities are one known set, not independently configurable values:

```ts
// For v3, strict own-property handling like executionWindowMs:
// absent => 32_768; own undefined => TypeError.
// selected === 4_096: paired4_096, holdout4_096, review8_192.
// selected === 32_768: all three32_768.
// v2/scope-only remain on the existing legacy builder defaults.
```

- [ ] Recover retained selection using shared known contract construction and
  digests. Test both capacity sets across both existing execution windows;
  `freezeControlledSkillEvalProtocol` sees the identical saved full protocol.
  Test mixed paired digests, mismatched holdout, mismatched review, unknown digest,
  missing task and invalid selector. No freeze/model invocation on rejection.
  Existing tests must construct retained old records explicitly, not accidentally
  relabel new defaults as legacy. Pin meaningful complete legacy build outputs
  or digest snapshots (including restore) with path normalization if needed.

- [ ] Run GREEN focused tests, native covering suite, package typecheck; then one
  full Vitest run on final product code. Controller will not run concurrent builds.

```powershell
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' run typecheck
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run
```

- [ ] Self-review scope, compatibility and the maximum-size bound. Commit only
  owned files. Report RED/GREEN commands/results, full log paths, source SHA,
  any deviations and deferred concerns in the assigned report file. No real-model
  acceptance, installer run, version bump, merge or publication belongs to worker.

## Controller follow-through

- [ ] Task-scoped independent spec/quality review; fix loop only for actionable findings.
- [ ] Final whole-branch review against1c1e1f5; carry both deferred UX/diagnostic concerns.
- [ ] Rebuild/copy exact runtime and separate Desktop candidate; rerun artifact/native
  checks, integrate reviewed branch, confirm exact-main CI and perform normal daily
  upgrade with original30-file/shortcut preservation and recoverable old program.
- [ ] Update current handoff and I/J evidence. Close their one-attempt tranche as
  content-success with J native recovery; never classify invalid transport as a
  qualifying failed ordinary Outcome or re-evaluate frozen B/G/J for a better result.
