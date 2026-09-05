# Tool Preflight Detail Implementation Plan

> **For agentic workers:** Use subagent-driven-development, one bounded task.

**Goal:** Distinguish the exact failing tool-preflight boundary without changing evaluation behavior or exposing raw errors.

**Architecture:** Optional fixed detail on the existing Runtime preflight error, rendered by the existing safe host classifier. Keep Runtime and Evolution ownership unchanged.

## Global Constraints

- Preserve primary preflight codes, ledger events, model configuration, tool schemas/allowlists, Candidate/protocol/evidence and every evaluation gate. Do not run models or edit the isolated host.
- Never emit raw error, message, stack, cause, arbitrary fields or unknown detail strings. Only actual Runtime error instances with known primary/detail combinations can enrich the diagnostic.
- Do not serialize lookups, add a scheduler/store/dependency, or implement a hypothesized repair. Existing temporary scopes must always be disposed.
- Apply patches only to owned files; you are not alone and must preserve other changes. Main owns route/operation/design records.

## Task 1: Fixed substage detail through the existing failure seam

**Files owned:**
- Modify `packages/tianwen-runtime/src/skill-evaluation.ts`.
- Modify `packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.ts`.
- Modify `tests/dsh-migration/learning-loop-orchestrator.spec.ts`.
- Add focused behavioral tests to the existing controlled evaluation runtime preflight test file; locate by `runControlledArms` and `ControlledSkillEvaluationPreflightError` in `tests/dsh-probe`. Do not add a new test framework.

**Interfaces and exact contract:**
- Extend `ControlledSkillEvaluationPreflightError` with an optional readonly `detail`, restricted by a TypeScript union to: `research-tool-construction`, `research-tool-presence`, `root-schema-read`, `global-product-tool`, `native-skill-scope`, `native-skill-load`, `native-skill-missing`, `native-skill-dispose`, `visible-schema-shape`, `task-schema-digest`, `aggregate-schema-digest`.
- Its existing `code` and message remain unchanged. Existing one-argument callers remain valid. No ledger schema change.
- In the `runControlledArms` tool-table preflight, distinguish research tool construction/presence, schema shape and per-task/aggregate digest checks using these literals. Preserve a typed helper detail when caught; otherwise classify at the known boundary, never from arbitrary exception text.
- In `controlledToolSchemas`, distinguish root schema read, forbidden globally registered product tool, native scope creation/load/missing-tool/disposal. Keep tool schemas/order and cleanup behavior identical. The schema returned by the helper must remain byte-for-byte equivalent when successful.
- The host classifier renders a valid tool mismatch as `tool-surface-mismatch:<detail>`. Without a recognized detail, retain `tool-surface-mismatch`. Ignore detail on every other primary code and on forged objects. Keep the warning's other fields phase and analysisId unchanged.
- The isolated exporter will be updated separately by the controller only after review; do not edit that environment.

- [ ] Add failing public-boundary tests for expected substage propagation, no raw data leakage, forged/unknown detail suppression and guaranteed cleanup. Preserve tests for the original primary code and no model requests before preflight acceptance.
- [ ] Implement only fixed diagnostic metadata at the existing boundaries; no speculative behavior fix.
- [ ] Run the covering preflight/host focused suites, root typecheck and diff check. The full route gate is downstream; do not run the full repository suite for this diagnostic increment.
- [ ] Commit only owned files and write the exact RED/GREEN commands, output, changed files, self-review and concerns in the task report. Return concise status and commit IDs for independent task review.
