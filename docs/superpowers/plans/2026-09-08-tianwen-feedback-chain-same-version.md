# Same-Version Feedback Chain Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute only the assigned task brief; no product implementation is authorized here.

**Goal:** Run the scoped R11 real-model protocol against the unchanged reviewed Runtime021 and retain actual original-feedback consumer evidence.

**Architecture:** Reuse pinned R10 runtime/verifier/archive as read-only artifacts. Adapt its small native Web launcher and inspection controls into a new isolated profile/state; production build identity and new protocol/control identity remain separate.

**Tech Stack:** Existing Node22, native DSH0.1.1-rc.2 and Windows PowerShell; no new dependency, runtime, model override or product source change.

## Global Constraints

- Worktree: D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge, codex/conversation-claim-evidence. Never delete it or modify dist/tianwen-desktop/win-unpacked, the actual Daily shortcut target.
- New root: D:/DevData/tianwen-feedback-chain-r11-20260908. Artifact root: D:/DevData/tianwen-natural-acceptance-r10-20260908. All R1–R10 frozen evidence and artifact bytes are immutable.
- Production source: 7b3eb01994ddee9021b8ffe5412d57427fb90f3e; Runtime0.1.21/Desktop0.1.0-preview.22; qualityv6/auditv2. No v7, product prompt edits, version bump, build-verifiers, full rebuild or package install.
- Archive SHA256: 223c024e319b8d729f8f51876ae8232903e7562126a2a40faab9a6af6163fd6d. Runtime SHA256: 6665a376b79ec3cb5c2b4eed15542176812f49bfebae891e8c0914ea80b2c1b9. Verifier SHA256: b3c2a703096806fdca13682158b3fe15cfe50220abb0c4c30ceab96307f14d6c. Original source-build.json SHA256: cf7a45ae8c108e99869da3f9328bf0911d2ea2b1d7d2711f4036c9ef962ccd80.
- Existing archived Desktop root: E:/待清理/D盘迁移-2026-09-08/Tianwen-验收残余-R10/DevData/tianwen-natural-acceptance-r10-20260908/desktop. Read-only references only, no copy back to D. Original relocation receipt stays authoritative.
- Shared dependencies: D:/DevData/tianwen-real-user-retest-20260905/node_modules. Preserve its physical identity and all package junctions. Do not install or replace dependencies.
- Model configuration remains exactly deepseek-official/deepseek-v4-flash, reasoningEffort high, maxTokens256000. Do not print credential values, move credentials or substitute the provider.
- Keep all existing task/feedback/guidance schemas, thresholds, permissions, consent, native capture/recovery and material/proof validation unchanged. No scripted product answers, forced learning, old-result retry, regrading or source-state copying.
- User delegated routine implementation and actual configured model use; only root runs the real browser protocol and makes release/integration decisions. No worker starts the actual R11 runtime or makes a model request.
- Use apply_patch for authored edits and D-local short temporary paths. New generated records use exclusive creation; never overwrite first evidence. You are not alone: preserve all other edits.

## Task 1: Prepare lightweight isolated R11 controls

**Ownership:** Only new files under D:/DevData/tianwen-feedback-chain-r11-20260908 and the assigned report/review artifacts. No repo source/tests, old root files, Daily paths or protocol edits. No repo commit from the worker; root later records hashes and review.

**Input contract:** docs/operations/tianwen-feedback-chain-real-use-r11-20260908.md is the frozen prospective usage design (7 ordinary inputs plus onboarding). Existing R10 controls are the proven templates; copy only necessary source controls and adapt paths/provenance mechanically, not a new generalized harness.

**Files:** New dsh-home/profiles/web/package.json, cordis.yml, cordis.patch.yml; runtime/workspace-bootstrap.mjs; evidence/precall-contract.mjs, process-probe.mjs, launch-r11.mjs, preflight.mjs, freeze.mjs, inspect.mjs, native-module-identity.mjs, audit-native-receipts.mjs. Small adapted self-checks and optional project-answers.mjs are allowed when existing ones are needed. Reuse old feedback-provenance.mjs directly: it has no root binding. No copied sessions/state/storages, Desktop, tgz or runtime JS. Create only the required new dependency junction.

**Interfaces:**

```js
export const root = 'D:/DevData/tianwen-feedback-chain-r11-20260908';
export const artifactRoot = 'D:/DevData/tianwen-natural-acceptance-r10-20260908';
export const productionSourceCommit = '7b3eb01994ddee9021b8ffe5412d57427fb90f3e';
// Existing launcher stdin: preflight. Existing inspection JSON contracts remain unchanged.
// Keep original sourceBuild.sourceCommit/sourceTree; record protocolCommit separately.
```

- [ ] Read the selected R10 controls and the new protocol. Map all root-bearing config and imports before edits. Use the existing supported provider configuration/reference mechanism without printing secret contents. If safe shared reference cannot be preserved, report the specific issue to root before changing credentials.
- [ ] Write a small offline check first for the changed reuse boundary: wrong artifact hash, source package/script diff, or accidental old stateRoot must reject; a current docs-only commit with pinned unchanged production inputs must be accepted. It must exercise exported validation behavior on controlled values, not grep source strings or fake native success. Retain RED result before adapting validation.

```js
assert.throws(() => validateReuse({ ...valid, archiveSha256: '0'.repeat(64) }));
assert.throws(() => validateReuse({ ...valid, productionChangedPaths: ['packages/tianwen-runtime-bundle/src/index.ts'] }));
assert.doesNotThrow(() => validateReuse({ ...valid, productionChangedPaths: [], protocolCommit: 'new-docs-only-commit' }));
```

`validateReuse` is a narrow exported function in precall-contract, not a new validation service; adapt to actual checked material and use independently literal expectations. Real filesystem hash/build-input/native-module checks still run before freezing.

- [ ] Create fresh profile/state paths and lightweight controls. The runtime plugin points to artifactRoot/runtime/runtime-candidate.js. Every workspace/evolution/session/state path and bootstrap registration points to new root. Never call prepare-desktop-profile/plugin add. Old runtime and profile resolve the same native module realpaths through the shared dependency junction.
- [ ] Preserve the launcher readiness -> freeze zero-state -> same live-launcher preflight -> browser-call order. Freeze records source-build bytes and all 64 current build-input hashes, current protocol/control hashes, and known artifact paths/hashes separately. Check tracked production inputs relative to pinned source; allow only documentation drift, not a blanket removal of source validation. Record source-build as reused, not freshly built. Old evidence paths are only read references; include R10 in bounded history inventory.
- [ ] Adapt inspect/audit runtime createRequire and verifier import to artifactRoot; all inspected native Sessions/state and current frozen controls come from new root. Retain the full original-feedback provenance logic, first-outcome guards, process ownership, full configuration check and exclusive evidence writes. No fabricated receipts in offline tests.
- [ ] Run the focused offline checks, existing applicable origin/process/feedback controls tests and syntax checks once. Verify zero new sessions/model requests and unchanged old files. Do not run freeze/preflight before actual root-owned launch; report these as unexecuted. If existing test exports require a small adaptation, keep it confined to new control tests.

```powershell
& 'D:/hermes/node/node.exe' --test 'D:/DevData/tianwen-feedback-chain-r11-20260908/evidence/reuse-contract.test.mjs'
& 'D:/hermes/node/node.exe' --check 'D:/DevData/tianwen-feedback-chain-r11-20260908/evidence/launch-r11.mjs'
```

- [ ] Self-review and report all new files, template-to-new differences, expected artifacts, exact test commands/results/RED evidence, old/new hash checks, and any credentials/process constraints. Provide a full diff against corresponding old controls in the assigned review package without sensitive config values. Root and an independent task reviewer approve before any real startup.

## Task 2: Root-owned real usage and closure

**Ownership:** Root only; new protocol results/progress and new exclusive evidence files. Keep production unchanged.

- [ ] Review prepared controls and their evidence; independently verify known pinned values, fresh zero-state, safe paths and actual module identity. Commit the protocol before startup and freeze new controls before first request. Launch only the new owned runtime, then freeze and perform same-process preflight.
- [ ] Execute U0–U7 through a fresh in-app browser using the exact protocol. Record first outcomes, first-study terminal/absent checkpoint and actual timing. No extra feedback to get a preferred result.
- [ ] Independently review source attribution and any trial results before revealing product verdicts. Verify exact originalFeedback at all reached consumers, isolation from workers/factual evidence, native receipts, decisions and future-current-instruction boundary. Preserve unreached coverage separately.
- [ ] Close only the owned runtime/tab, check post-exit consistency, retain records and archive only actually inactive unnecessary large outputs to E. Report new D-space usage accurately; no repeated Desktop copy was needed.
- [ ] Make an explicit scoped release decision from all retained evidence. Any new finding must identify its layer and actual impact; do not automatically add a quality version or another cohort. If release is justified, resume the parent feedback-source-semantics Task4 protected integration/Daily route; otherwise state the exact remaining proof/decision, not a generic model-quality blocker.
