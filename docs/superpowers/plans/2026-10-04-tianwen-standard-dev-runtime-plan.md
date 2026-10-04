# Standard DEV Runtime Loading Implementation Plan

> **For agentic workers:** Use executing-plans for this single thin integration; request a separate read-only review after verification. Existing worktree is reused. Do not spawn overlapping implementation workers.

**Goal:** Load the existing DEV functional checks and actual published Runtime through the original Cordis plugin loader, without a per-task test harness or alternate learning rules.

**Architecture:** One plugin reads an operator-owned SHA-256-pinned JSON contract packet, validates its closed envelope and uses `createDevelopmentNativeCheckOptions`. Original `applyDevelopment` retains root, JSONL-backend, consent, source, study and activation governance. DSH owns Loader, normal services, Agent and provider lifecycle. A normal loader can import the plugin by its existing file URL; no installer or main/Daily change.

**Tech Stack:** Existing Node 22.23.1, ESM, SHA-256, Cordis Loader, published Runtime and DEV factories, Vitest.

## Global Constraints

- Preserve full automatic-learning objective, main/Daily NO-GO, original ten-business-day decision window and source qualifications.
- Do not regrade/retry original Tasks, invent feedback, manually activate methods or rerun closed exercise batches.
- Generated control material goes under D:/DevData. Reuse dependencies and runtime. D free >=15 GiB; preserve 29 previously refused recursive-delete targets.
- Read the packet once after an explicit raw-byte SHA-256 check. JSON is data: no expression interpolation, dynamic plugin/command/module fields, executable assertions or arbitrary Runtime flags.
- Envelope: exact `schemaVersion`, `ordinaryContract`, `studyContracts`, optional `goalContract`. Existing factories retain all original cases, references, required conditions, model and quality bindings. No requirement is inferred from model output.
- Loader config: exact `developmentRoot`, `contractPath`, `contractDigest`. Absolute canonical D paths, packet a regular non-link file outside the mutable project cwd; packet digest is `sha256:` plus 64 lowercase hex digits. No global settings, credentials or existing Profile are moved.
- The workspace is an existing directory; compare its physical path to the packet, so ancestor aliases cannot hide a mutable contract. Legitimate aliases with an external packet remain supported.
- Raw packet bounded at 8 MiB as an operator-loading resource limit, not a task result or release condition. Original per-file, source, input and output budgets stay unchanged.
- The plugin requires existing JSONL persistence before apply and calls the original DEV boundary. It creates no Agent, request, Task, consent or manual study event.

## Single deliverable

Files: create `scripts/development-native-runtime.mjs`; test `tests/dsh-migration/development-native-runtime.spec.ts`; record actual consumption in `docs/operations/tianwen-standard-dev-runtime-20261004.md` and current handoff.

Interface: `loadDevelopmentNativeRuntimeOptions(config)` validates and returns the existing Runtime options; plugin `name`, `inject`, `apply(ctx, config)` uses these and original `applyDevelopment`. It neither owns host disposal nor wraps Agent execution. For actual tasks continue using the existing permissions and `runDevelopmentNativeTask` until their standard application consumption has been independently shown; merely loading checks does not prove interactive path permissions or learning efficacy.

- [x] Add red tests for wrong digest/envelope, executable-looking JSON not interpreted, invalid roots/packet paths, invalid original study contract, caller extra Runtime fields; use actual original factories.
- [x] Implement minimum reader/plugin. Confirm the original library paths and public exports are reused.
- [x] Verify normal Loader imports the real plugin, waits for existing persistence, mounts DEV options, restores continuous history without requests or ledger changes. Use normal upstream services for this consumption, not `mountFeedbackHarness`.
- [x] Verify a constructor/mapping control consumes ordinary and Goal original check factories, without pretending this is a new natural task or replaying original outputs.
- [x] Run focused affected checks and independent review; reproduce/fix the physical-workspace path finding, verify 10 related checks. Add bounded cleanup for only each new test's owned roots and links; separate review found no supported P1/P2.
- [x] Record exact delivered scope and remaining normal execution/real-model/source/study/effect gaps in the operations document. Loading alone is not complete automatic learning.

Delivery commit/push is recorded by Git, not a learning completion event. Runtime artifacts and both original ledgers are unchanged. Early fixture cleanup was rejected before process creation (only `blocked by policy`); 42 new attempted roots join the prior29 protected roots, total71, listed in the control package's `cleanup-refusal.json`. No deletion/retry; no environment copies; D free17.944GiB and Docker stopped. Fresh final-test fixtures cleaned themselves and are not these refused roots.
