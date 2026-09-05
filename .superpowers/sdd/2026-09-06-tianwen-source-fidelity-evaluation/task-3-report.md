# Task 3 implementation report

## Status

DONE. The retained v3 source-fidelity protocol now reaches the existing native
aggregate blind evaluator and a native Candidate holdout plus independent semantic
reviewer before Shadow readiness. Legacy v2 remains on its original thirteen-Run
path. This is deterministic mechanism coverage only; no real model, Profile,
installation, publication, admission policy or completed procurement record was
changed or exercised.

## Implementation

- Dispatched the existing blind evaluator by frozen evaluation-plan version. V3
  presents the exact five-dimension rubric and strict `sourceFidelity` integer
  field for every X/Y score while retaining one randomized aggregate review,
  native route/retry/tool restrictions and Evidence verification. Both old
  pre-review tie exits now apply only to v2, so a clean v3 ID tie reaches review;
  the domain reducer still requires real source-fidelity improvement.
- Extended the public Shadow task parser only for v3's already-reviewed frozen
  holdout/review fields. V2 keeps its prior one-task executable shape and replay.
- Recovered the holdout's evaluator material only from the accepted canonical
  `submit_research_summary` call and rendered result. The reviewer receives only
  the frozen packet, normalized accepted submission and rubric. Its Session has
  one locally registered `submit_holdout_review` tool, no inherited tools or Skill
  catalog, the established model/config/retry route, one submission and a bounded
  material/time surface.
- Verified reviewer request identity, complete native tool Evidence, accepted
  material digest and reviewed Run before forwarding the observation through the
  ordinary Evolution service. The observation is persisted before the Shadow
  result. Missing Evidence, swapped/stale material, inconclusive review or any
  low dimension remains non-promotable.
- Added the two reviewed Evolution service forwarders through the existing
  `formalWrite` commit-unknown wrapper. No ledger/schema/state behavior changed.
- Reuses an exact durable v3 review observation to finish a commit-unknown Shadow
  result without repeating either native Run. Other partial activity continues to
  stop instead of duplicating work.
- The existing retained-version orchestrator/builders already forwarded the v3
  task fields, so no bundle production change was needed. Integration coverage
  now proves rejected semantic Shadow cannot become ready and that the successful
  retained v3 route uses 14 distinct controlled Sessions (10 arms + aggregate
  evaluator + holdout + reviewer + activation); retained v2 asserts 13.
- Registered only the built Runtime source-case module and pure source-fidelity
  policy module in the exact runtime/status/controlled-lifecycle artifact input
  allowlists. Existing foreign, private, native and test-input rejections remain.
- Added the deferred `research-tool-presence` preflight-detail regression.

## TDD and repair evidence

### RED — clean v3 ties were stopped before blind review

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts -t "sends clean v3 ID ties"
```

Relevant output before implementation:

```text
Test Files 1 failed (1)
Tests 1 failed | 71 skipped
expected state awaiting-evaluator; received stopped
stop.stage: postflight
stop.reasonCode: run-fact-mismatch
```

This used valid v3 task/Run bindings. The failure was the old pre-blind tie branch,
not an incomplete native fixture. The final test crosses both old tie guards,
creates one aggregate evaluator and rejects equal fidelity as
`original-source-fidelity-not-improved`.

### RED — v3 Shadow package and native review did not exist

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts -t "native v3 holdout|reviewer Evidence"
```

Relevant output before implementation:

```text
Test Files 1 failed (1)
Tests 2 failed | 28 skipped
ControlledSkillShadowPreflightError: controlled Skill Shadow preflight failed: task-package-mismatch
```

### Integration RED — reviewed ledger methods were not on the service

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec tsc -b packages/tianwen-evolution/tsconfig.json packages/tianwen-runtime/tsconfig.json --pretty false --force
```

Relevant output on the first integration attempt:

```text
TS2339: Property 'getControlledSkillShadowReviewObservation' does not exist on type 'TianwenEvolutionService'.
TS2339: Property 'recordControlledSkillShadowReviewObservation' does not exist on type 'TianwenEvolutionService'.
```

The narrow service forwarders repaired the actual public native seam; Runtime
tests do not access the ledger privately.

### Built-artifact RED — exact new local inputs were rejected

After building the bundle:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/runtime-bundle.spec.ts -t "bundles Tianwen code|bundles the status entry"
```

```text
Test Files 1 failed (1)
Tests 2 failed | 61 skipped
Received: ["src/research-summary-source-case.ts"]
Received: ["../tianwen-evolution/dist/controlled-skill-source-fidelity.js"]
```

The complete artifact suite then exposed the same pure policy module in the
controlled-lifecycle closure. It was registered as one exact path; no directory
root or wildcard was widened.

### Regression repair — v2 Shadow cardinality

The first six-suite covering run reported three old integration failures at
`task-package-mismatch`. The new version check had incorrectly compared v2's
single executable Shadow task with five evaluation tasks. It was narrowed to
require exactly one reviewed task only for v3. The previously failing focused
rerun passed 8 tests with 69 skipped, and the full covering gate below passed.

## Final verification

Focused new mechanisms:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts -t "clean v3 ID ties|research-tool-presence|native v3 holdout|reviewer Evidence|durable v3 review"
Test Files 2 passed (2)
Tests 5 passed | 99 skipped (104)
```

Native v3 route:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/learning-loop-controlled-executor.integration.spec.ts -t "retained v3 evaluator"
Test Files 1 passed (1)
Tests 1 passed | 12 skipped (13)
```

Covering Runtime, activation, orchestrator, native integration and built-artifact
gate:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts tests/dsh-probe/controlled-skill-activation-runtime.spec.ts tests/dsh-migration/learning-loop-orchestrator.spec.ts tests/dsh-migration/learning-loop-controlled-executor.integration.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
Test Files 6 passed (6)
Tests 268 passed (268)
Duration 121.42s
```

Reviewed domain and retained migration regressions:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/controlled-skill-evaluation.spec.ts tests/dsh-probe/controlled-skill-shadow.spec.ts tests/dsh-migration/explicit-correction-protocol.spec.ts tests/dsh-migration/research-summary-admission.spec.ts tests/dsh-migration/controlled-lifecycle-command.spec.ts
Test Files 5 passed (5)
Tests 106 passed (106)
Duration 18.30s
```

Build:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec tsc -b packages/tianwen-evolution/tsconfig.json packages/tianwen-runtime/tsconfig.json --pretty false --force
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs --filter @tianwen/runtime-bundle run build
exit 0; Runtime, status and controlled-lifecycle artifacts rebuilt successfully
```

Root type/public API/diff gates:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec tsc -b packages/tianwen-desktop-host/tsconfig.json packages/tianwen-dsh-compat/tsconfig.json packages/tianwen-dsh-probe-bundle/tsconfig.json packages/tianwen-evaluator-python/tsconfig.json packages/tianwen-evidence/tsconfig.json packages/tianwen-evolution/tsconfig.json packages/tianwen-runtime-bundle/tsconfig.json packages/tianwen-runtime/tsconfig.json --pretty false --force
exit 0, no diagnostics

D:\hermes\node\node.exe scripts/typecheck-packages.mjs
exit 0, no diagnostics

D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run check:no-private-dsh-imports
privateImportViolations: []

git diff --check
exit 0, no output
```

## Changed files

- `packages/tianwen-runtime/src/skill-evaluation.ts`
- `packages/tianwen-evolution/src/runtime-binding.ts`
- `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts`
- `tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts`
- `tests/dsh-migration/learning-loop-orchestrator.spec.ts`
- `tests/dsh-migration/learning-loop-controlled-executor.integration.spec.ts`
- `tests/dsh-migration/runtime-bundle.spec.ts`
- `.superpowers/sdd/2026-09-06-tianwen-source-fidelity-evaluation/task-3-report.md`

The root-owned plan edit and untracked second-generation parent diagnostic were
left untouched and are excluded from this task's commit.

## Self-review and concerns

- Checked every Task 3 brief item against code and tests. Version dispatch is
  driven by the retained plan schema, not scope/latest policy. V2 has no new
  required field or changed executable task count.
- Reviewer input is constructed from the new holdout Session's canonical accepted
  tool call, never the historical source answer or final assistant prose. Tests
  inspect the actual request and exclude X/Y, patch, feedback, role/version IDs.
- The reviewer is intentionally a narrow sibling of the existing evaluator, not
  a generic framework. No dependency, provider, permission, store or scheduler
  was added.
- Durable observation-before-result ordering and commit-unknown replay are covered;
  exact observation drift is rejected by the existing domain reducer through the
  ordinary service.
- No known mechanism-level blocker remains. The principal residual risk is native
  authenticity complexity, so the controller's planned whole-task most-capable
  review should scrutinize request/evidence/material recovery before any genuine
  UI acceptance. Real-model efficacy and promotion remain deliberately unclaimed.

## Fix round 1 — exact native reviewer request binding

The independent review found that the reviewer request guard bound the Session,
route and tool name but not the exact material or tool schema. That allowed a
different non-forbidden packet/submission/rubric envelope, or a same-name changed
tool, to be scored while the observation retained the original Run and accepted
material digest.

The repair keeps two expected digests in the existing ephemeral reviewer state:
the canonical envelope constructed from the frozen packet, accepted canonical
submission and v3 rubric, plus the sole tool schema projected from the created
reviewer Agent. The existing `llm/stream` guard now hashes the actual native
request's single user envelope and full tool array and rejects any mismatch before
recording the request. No persisted schema, retry/history path, v2 path, provider,
permission or material limit changed.

The three tests mutate the independent reviewer immediately before DSH builds its
frozen `GenerateOptions`: packet and submission through the reviewer follow-up,
and the tool description through native prompt assembly after the production
precheck. This exercises the actual request boundary while leaving model config
and tool name unchanged.

### RED

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts -t "rejects native reviewer .* drift" --reporter=dot
Test Files 1 failed (1)
Tests 3 failed | 32 skipped (35)
All packet, submission and schema cases received state: terminal instead of the
required reviewer/request-contract-mismatch stop.
```

### GREEN and covering gates

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts -t "rejects native reviewer .* drift" --reporter=dot
Test Files 1 passed (1)
Tests 3 passed | 32 skipped (35)

D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts --reporter=dot
Test Files 1 passed (1)
Tests 35 passed (35)
```

The six-suite covering run passed all five Runtime/Shadow/activation/orchestrator/
native integration suites but initially found three stale built-artifact failures:

```text
Test Files 1 failed | 5 passed (6)
Tests 3 failed | 268 passed (271)
Failures: runtime and status outputs still contained workspace imports, and the
package tarball was missing one declaration from the stale dist tree.
```

After the required force build and runtime-bundle rebuild, the artifact suite was
clean:

```text
D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec tsc -b packages/tianwen-desktop-host/tsconfig.json packages/tianwen-dsh-compat/tsconfig.json packages/tianwen-dsh-probe-bundle/tsconfig.json packages/tianwen-evaluator-python/tsconfig.json packages/tianwen-evidence/tsconfig.json packages/tianwen-evolution/tsconfig.json packages/tianwen-runtime-bundle/tsconfig.json packages/tianwen-runtime/tsconfig.json --pretty false --force
exit 0, no diagnostics

D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs --filter @tianwen/runtime-bundle run build
exit 0; Runtime, status and controlled-lifecycle artifacts rebuilt successfully

D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/runtime-bundle.spec.ts --reporter=dot
Test Files 1 passed (1)
Tests 64 passed (64)
```

Final type/public API/diff gates:

```text
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false D:\hermes\node\node.exe scripts/typecheck-packages.mjs
exit 0, no diagnostics

D:\hermes\node\node.exe D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run check:no-private-dsh-imports
privateImportViolations: []

git diff --check
exit 0, no output
```

One first root typecheck invocation omitted the required
`PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false`; pnpm aborted before changing or
installing dependencies with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. The
corrected command above passed.

### Fix self-review and residual concern

- Packet, submission and rubric are bound together by the exact canonical
  envelope digest; the complete single visible tool array is bound independently.
- Each drift case stops before a review observation and before any Shadow result,
  so no passing or other governed Shadow effect can be produced.
- The test seam changes only the native reviewer request construction and retains
  the ordinary Agent, provider, route, tool execution and Evidence path.
- The reviewer's cold-restart coverage suggestion remains a deferred Minor. This
  fix does not call a same-Context retry a cold restart and adds no such claim.
