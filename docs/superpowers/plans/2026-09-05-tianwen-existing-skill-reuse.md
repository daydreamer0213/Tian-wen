# Existing Skill Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a bounded learning analyst discover admitted existing native Skills and trace narrow adaptation through the current Candidate gate.

**Architecture:** Use DSH `skills.snapshot/get` and native durable tool results. Add optional provenance to the existing analysis submission; reuse Candidate/evaluation/promotion without a second registry or execution lane.

**Tech Stack:** TypeScript, Cordis, DSH 0.1.1-rc.2, existing Vitest suites.

**Acceptance:** all engineering tasks below are complete. The final 20-file / 364-test gate and fresh isolated installer passed. No suitable new genuine task was supplied; therefore no new real-model run or natural-effectiveness claim was made. Main integration and the user's installed product remain unchanged. Exact source/receipt identities are in `docs/operations/tianwen-learning-route-20260905-handoff.md`.

## Global Constraints

- Preserve all existing uncommitted work and upstream Skill definitions.
- Work in `D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge`.
- Keep generated artifacts in D: disposable state; no external publish or user-profile replacement.
- Current main conversation owns continuation; opening a Session must not start work.
- No added dependencies, Skill marketplace, background queue or model budget.
- Real-task efficacy must not be inferred from scripted tests.

### Task 1: Resolve Stage 2 review

**Files:** existing runtime-bundle `learning-exploration.ts`, `learning-loop-orchestrator.ts`; matching migration specs.

**Interface:** existing `run({ analysisId, parent, proposal, signal })`; native `subagents.interrupt` owns stopping accepted execution.

- [x] Reproduce cancellation of an accepted native arm; assert native interruption and no further execution while stopped. The separate loop test proves withdrawal aborts that signal. A timeout-only signal is not a pass.
- [x] Route the existing cancellation controller to native interruption and recheck support at async boundaries.
- [x] Prove cold recovery of a genuinely interrupted native arm, not only mocked followup; assert the completed arm is not rerun.

### Task 2: Source inspection and immutable provenance

**Files:** new `packages/tianwen-runtime-bundle/src/learning-skill-reuse.ts`; evolution `learning-analysis.ts`; child/tool/runtime configuration seams; existing `learning-candidate.ts`; new `tests/dsh-migration/learning-skill-reuse.spec.ts`.

**Interfaces:** `LearningSkillAdmission` is a host-reviewed exact source record. `inspectLearningSkills(registry, admissions, scopeKey, name, signal)` reads a native snapshot/get. `LearningAnalysisSubmission.reuseSource` adds its exact reference plus rationale. No source content is interpreted as executable instructions.

- [x] Add RED tests for the pure reference parser: `parseLearningAnalysisSubmission({ ...skillChange, reuseSource })` preserves the exact reference; no-case plus reuse, unknown fields and malformed digests reject.
- [x] Add RED native registry tests: empty admissions, matching source, digest drift, incomplete catalog, incompatible scope/tool/license and non-model-invocable entries.
- [x] Implement the minimum source inspection function and reference validation. Require exact host review, self-contained text, supported task contract and complete native catalog.
- [x] Expose the optional read-only tool only when host sources are configured; preserve no-source tool lists and all existing source evidence constraints.
- [x] Recheck source and consent after awaited reads before durable submission. Preserve duplicate already-durable submissions without consulting changed sources.
- [x] Record the exact source reference/rationale in existing attribution while leaving Candidate parent and scope unchanged.
- [x] Add a native analyst test proving inspection → reference submission → original scoped Candidate, plus rejection when the source changes after inspection.

### Task 3: Review, local packaging and handoff

**Files:** affected tests, existing installer/runtime bundle checks; `docs/operations/tianwen-current-project-handoff.md` and current route handoffs.

- [x] Run the affected suites with `TIANWEN_DSH_PROBE_ROOT=D:\DevData\tianwen-dsh-probe`, root typecheck, private-import check and diff whitespace check.
- [x] Obtain focused independent review for new source trust/provenance boundaries, address concrete findings and rerun changed checks.
- [x] Run existing disposable local packaging/installer tests against current working-tree output. Label evidence by actual source state and artifact digest, never call uncommitted work exact-main CI.
- [x] Inspect genuine backlog/task availability; record a bounded real task only if its value and criteria exist independently of an intended learning result.
- [x] Refresh the canonical current header, remaining evidence and rollback/install boundary. Report exactly which roadmap segments are implemented, locally accepted, installed or still require real-task evidence.
