# Tianwen Legacy Migration, Release, and Desktop Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely archive legacy fake-subagent Sessions, publish the native-convergence Runtime/Desktop pair, and complete a real user-style Desktop acceptance before asking the project owner to validate anything.

**Architecture:** Legacy migration is an offline, reversible filesystem operation driven by public JSONL persistence inspection and locator APIs plus Tianwen Long Goal references. It never edits a Session log or invents a descriptor. Runtime `0.1.11` and Desktop `0.1.0-preview.12` are immutable delivery identities built only after stages 1–3 are green. Acceptance runs from a fresh `D:\DevData` candidate home through the packaged Desktop UI, uses only the main chat for normal operation, and records an evidence manifest. Canonical architecture/release claims are updated only after every acceptance story passes.

**Tech Stack:** TypeScript 6, Node.js 22.19, Cordis 4, DSH `0.1.1-rc.2`, JSONL/Zstandard Session persistence, Electron 43, electron-builder 26, Vitest 4, pnpm 11, PowerShell on Windows.

## Execution correction — 2026-09-04

The following corrections supersede conflicting steps below; unchecked historical steps are not completion evidence.

- **Do not execute Tasks 1–3 as written.** Read-only inspection located the screenshot's four legacy children in `D:\DevData\tianwen-experience\dsh-home`. All belong to unfinished v3 Long Goal `tianwen-long-goal-7e631e05-5808-454d-a8a4-35db06d0a5af`, controlled by main Session `session-9430b145-f883-4bca-9786-42e57f3cba22`. Planner and two Task logs end in `turn/end`; the third Task log ends in `turn/start`, and a fourth Task is still unbound. A settled child alone is therefore not an archive candidate: its unfinished parent still depends on its completion evidence. All four original directories and the Goal record remain untouched. Story F is still unproven.
- Native `workspaceRegistry.archiveSession()` hides sidebar grouping, but `SubagentService.listChildren()` still includes persisted child headers and the native client renders diagnostic catalog entries. Display archive does not repair these legacy child records. Do not edit their bytes, fabricate descriptors, or silently abandon the unfinished Goal to make the popup disappear.
- Historical compatibility work must remain separate from ordinary startup. Do not add a startup approval dialog, expiring offline token, or a new migration service merely to satisfy this old plan. First resolve the unfinished legacy Goal's main-chat recovery/retirement semantics; any eventual archive must preserve readable task history and be reversible. It is not permission to modify the real historical Goal now.
- Follow the user's proportional-verification instruction: rerun the affected checks and real user story after a concrete defect fix. Do not repeat the already-proven learning promotion/rollback stories for unrelated lifecycle, packaging, or documentation changes. Preserve the exact source/artifact scope of existing evidence; do not convert it into a whole-release PASS.
- The interrupted `b581daf` repository gate is **not PASS**. Its default Profile installation case timed out at 120 seconds. On continuation, the unchanged isolated case passed in 56.88 seconds with no model requests; the original timeout's cause is not established. Keep this distinction instead of changing product code or increasing timeouts without a reproducible defect. Isolated evidence: `D:\DevData\tianwen-acceptance-history\runtime-profile-timeout-20260904.log`.
- The next full default gate completed in 428.34 seconds: 1522 tests passed, one failed before evaluator invocation because `TIANWEN_DSH_PROBE_PYTHON` was required by the test, and 18 opt-in tests were skipped (96 passed / one failed / five skipped files). Installation closure, public-import checks and package typecheck passed. The evaluator already accepts the controlled repository-default `.venv/Scripts/python.exe`; the narrow test fix omits an absent override instead of rejecting that supported default. Real `nop`/`oracle` assertions and all evaluator path checks are unchanged. The affected file then passed all three tests in 3.55 seconds. Evidence: `release-gate-b581daf-20260904.log`, `python-probe-default-red-20260904.log`, and `python-probe-default-green-20260904.log` under `D:\DevData\tianwen-acceptance-history`. This is full-run plus targeted-repair evidence, **not** a subsequent single-process `pnpm run check` PASS.
- An unsigned NSIS candidate was built with native `electron-builder --prepackaged` from the unchanged, previously accepted `37690f1` application. Installer: `D:\DevData\tianwen-0.1.11-installer-20260904\Tianwen Desktop Setup 0.1.0-preview.12.exe`, 99,990,883 bytes, SHA-256 `AFE833853692D5751DB4B8AB724D31E8E2E84CE72F8648E184DA945E677C426C`. All 83 extracted payload files matched the accepted unpacked app byte-for-byte; the normal Desktop artifact audit passed on the extraction, including Runtime SHA-256 `588E246F0D205B9063677FEEE9490ED78EF322894F9EECA26B0B7B72C8C17A2F`. Build/payload verification is complete; installer execution, clean install/replay and historical compatibility are **not** thereby proven. Nothing was published or installed into the user's ordinary environment. No learning-model evaluation was repeated.

## Global Constraints

- Begin only after stage 1, 2, and 3 completion gates are green and committed.
- Never edit old Session bytes or append a fabricated `subagent/descriptor`.
- A legacy Session is eligible only when all predicates agree: Tianwen v3 Long Goal reference, Tianwen legacy subagent header, settled log, no descriptor, unique physical artifact, and no live Agent/Host ownership.
- Migration defaults to dry-run. The Desktop must not start DSH while execute or restore is active.
- Before any recursive move, resolve and verify exact absolute source and target paths. Sources must be individual Session directories under the configured Sessions root; targets must be outside DSH Home and under the selected legacy archive root.
- Prefer `D:\DevData\tianwen-legacy-sessions` when `D:` exists. Never place archive copies, build artifacts, package stores, or acceptance data on `C:` when the `D:` path is available.
- Every moved Session has byte count, SHA-256, original path, header lifecycle identity, and state recorded before source removal.
- Unknown, active, unsettled, ambiguous, already-native, unreferenced, symlinked, or path-escaping entries are refused, not skipped silently.
- Do not delete the final archive automatically. Restore is exact and idempotent.
- Runtime `0.1.11` upgrades only exact Runtime `0.1.10` on DSH `0.1.1-rc.2`; keep the predecessor archive. Do not generalize the installer into a version-range engine.
- A green automated suite is necessary but not sufficient. The executor must complete the real Desktop user stories and inspect their evidence before any completion claim.
- If any real acceptance story fails, stop release claims, diagnose and fix it, rerun the affected automated gates, then rerun the complete real story from a fresh candidate home.

---

### Task 1: Build a fail-closed legacy Session archive planner

**Files:**
- Create: `packages/tianwen-desktop-host/src/legacy-session-archive.ts`
- Create: `tests/dsh-migration/tianwen-legacy-session-archive.spec.ts`
- Modify: `packages/tianwen-desktop-host/package.json`
- Modify: `packages/tianwen-runtime-bundle/src/status.ts`
- Modify: `tests/dsh-migration/goal-status.spec.ts`

- [ ] Add direct development dependencies required to instantiate the public `@deepseek-ai/dsh-session-persistence-jsonl@0.1.1-rc.2` inspector in the Desktop host. Do not import `/src/*` or duplicate its path encoder.

- [ ] Add `dist/legacy-session-archive.js` to the Electron package's explicit `build.files` list so the packaged Desktop contains the migration module.

- [ ] Extend the already-public Runtime `./status` entry with `listLegacyLongGoalSessionReferences(stateRoot)`. It returns only Planner/Task Session ids explicitly referenced by valid v3 Long Goal records. The Desktop consumes this read-only result instead of parsing or duplicating Long Goal schemas.

- [ ] Write dry-run tests for every eligibility predicate and every refusal branch, plus status tests for valid, malformed, unknown-version, and duplicate Long Goal references.

- [ ] Use `JsonlSessionPersistence.list()`, `inspect()`, `readRaw()`, and `locate(header)` to resolve facts and the physical log. Derive the Session directory with `dirname(location.path)` only after asserting `location.kind === 'jsonl'`. Compute `byteLength` and SHA-256 over a stable sorted manifest of every regular file's relative path plus raw physical bytes, so the complete Session directory—not only decompressed log text—is protected.

```ts
export interface LegacyArchiveCandidate {
  readonly sessionId: string
  readonly originalDirectory: string
  readonly headerCreatedAt: number
  readonly headerCwd?: string
  readonly byteLength: number
  readonly sha256: `sha256:${string}`
  readonly longGoalIds: readonly string[]
}
```

- [ ] Match only logs whose header has Tianwen's legacy `origin: 'subagent'`, `parentSession`, and delegation depth, whose event fold is settled, and whose events contain no `subagent/descriptor`.

- [ ] Cross-check the id against the public read-only Long Goal reference result. Require a Planner or Task execution binding; a matching-looking unreferenced Session is refused.

- [ ] Reject duplicate ids, multiple physical artifacts, symlinks/reparse points anywhere in the candidate directory chain, non-canonical paths, path escapes, and archive roots inside DSH Home.

- [ ] Add a Windows process probe for the exact target `nodeExecutable + dshBin`. It must inspect process command lines, reject any matching live DSH process before execute/restore, and refuse mutation if process inspection is unavailable. Dry-run remains available. Re-run the probe immediately before each source quarantine rename.

- [ ] Return a sorted immutable dry-run plan; perform no writes from the planner.

- [ ] Run tests.

```powershell
pnpm vitest run tests/dsh-migration/tianwen-legacy-session-archive.spec.ts tests/dsh-migration/goal-status.spec.ts
pnpm --filter @tianwen/desktop-host typecheck
```

- [ ] Commit.

```powershell
git add packages/tianwen-desktop-host/src/legacy-session-archive.ts tests/dsh-migration/tianwen-legacy-session-archive.spec.ts packages/tianwen-desktop-host/package.json packages/tianwen-runtime-bundle/src/status.ts tests/dsh-migration/goal-status.spec.ts pnpm-lock.yaml
git commit -m "feat: plan legacy Session archive safely"
```

### Task 2: Execute, recover, and restore archive moves

**Files:**
- Modify: `packages/tianwen-desktop-host/src/legacy-session-archive.ts`
- Modify: `tests/dsh-migration/tianwen-legacy-session-archive.spec.ts`

- [ ] Add tests that inject failure after manifest creation, source quarantine rename, archive copy, archive verification, final archive rename, and restore quarantine. Each restart must converge to either fully archived or fully restored without loss.

- [ ] Write one immutable manifest directory per migration under the external archive root.

```ts
export interface LegacyArchiveManifestEntry extends LegacyArchiveCandidate {
  readonly archiveDirectory: string
  readonly state: 'planned' | 'quarantined' | 'archived' | 'restored'
}

export interface LegacyArchiveManifest {
  readonly schemaVersion: 'tianwen.legacy-session-archive.v1'
  readonly migrationId: string
  readonly sessionsRoot: string
  readonly createdAt: string
  readonly entries: readonly LegacyArchiveManifestEntry[]
}
```

- [ ] Execute each entry in this recoverable order:
  1. re-inspect header, settled state, descriptor absence, size, and SHA-256;
  2. durably write the `planned` manifest;
  3. rename the exact Session directory to a sibling quarantine outside `sessionsRoot` but on the same volume;
  4. durably mark `quarantined`;
  5. copy quarantine to an archive staging directory;
  6. verify every file and the aggregate digest;
  7. rename staging to its final archive directory;
  8. durably mark `archived`;
  9. remove only the verified quarantine copy.

- [ ] On any restart, read the manifest and physical locations before acting. Never infer completion from a missing source alone.

- [ ] Restore only when the original path is absent and its parent still resolves under `sessionsRoot`. Copy the archive to same-volume quarantine, verify, then rename exactly to the original directory and mark `restored`. Keep the archive copy.

- [ ] Refuse execution without a short-lived offline token provided by Desktop startup before it spawns DSH. The token records the exact node/dsh binaries, successful zero-process probe, and target revisions. Unit tests must prove a live matching PID, unavailable process probe, expired token, or changed target revision blocks every move.

- [ ] Run tests.

```powershell
pnpm vitest run tests/dsh-migration/tianwen-legacy-session-archive.spec.ts
```

- [ ] Commit.

```powershell
git add packages/tianwen-desktop-host/src/legacy-session-archive.ts tests/dsh-migration/tianwen-legacy-session-archive.spec.ts
git commit -m "feat: archive and restore legacy Sessions"
```

### Task 3: Integrate one-time migration before Desktop starts DSH

**Files:**
- Modify: `packages/tianwen-desktop-host/src/profile-prepare.ts`
- Modify: `packages/tianwen-desktop-host/src/host.ts`
- Modify: `packages/tianwen-desktop-host/src/main.ts`
- Modify: `packages/tianwen-desktop-host/src/locale.ts`
- Modify: `packages/tianwen-runtime-bundle/src/learning-clue-status.ts`
- Modify: `packages/tianwen-runtime-bundle/src/learn-loop-client.ts`
- Modify: `packages/tianwen-runtime-bundle/src/client.tsx`
- Modify: `tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-host.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-web-product.spec.ts`

- [ ] Add Desktop tests that prove migration happens after profile preparation but before `startDesktopWebHost()`, DSH is not started on migration failure, and a no-candidate dry-run is a no-op.

- [ ] Extend the already-validated `DesktopTarget` with its contained Runtime root. Dynamically import only the public Runtime `./status` implementation from that exact root and obtain the Long Goal reference set before planning migration; refuse an unexpected Runtime path or export.

- [ ] If candidates exist, show one plain-language confirmation stating the count, external archive path, reversibility, and requirement to close other DSH windows. Do not ask the user to inspect child Sessions.

- [ ] Acquire the Desktop offline token, re-run the planner, execute, and only then start DSH. A changed plan between confirmation and execute fails closed and shows the new dry-run instead of moving it.

- [ ] Expose archive manifest entries in the optional advanced audit projection as read-only history. Do not expose execute, restore, delete, retry, or approve buttons in the web product.

- [ ] After DSH starts, query the native child catalog and assert archived ids are absent. A catalog failure prevents a success receipt but does not undo an already verified archive.

- [ ] Run tests.

```powershell
pnpm vitest run tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts tests/dsh-migration/learn-loop-web-product.spec.ts
```

- [ ] Commit.

```powershell
git add packages/tianwen-desktop-host/src/profile-prepare.ts packages/tianwen-desktop-host/src/host.ts packages/tianwen-desktop-host/src/main.ts packages/tianwen-desktop-host/src/locale.ts packages/tianwen-runtime-bundle/src/learning-clue-status.ts packages/tianwen-runtime-bundle/src/learn-loop-client.ts packages/tianwen-runtime-bundle/src/client.tsx tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts tests/dsh-migration/learn-loop-web-product.spec.ts
git commit -m "feat: migrate legacy Sessions before Desktop startup"
```

### Task 4: Freeze Runtime 0.1.11 and Desktop preview.12 delivery identity

**Files:**
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `packages/tianwen-runtime-bundle/src/portable-profile.ts`
- Modify: `packages/tianwen-runtime-bundle/src/controlled-lifecycle.ts`
- Modify: `packages/tianwen-desktop-host/package.json`
- Modify: `packages/tianwen-desktop-host/src/host.ts`
- Modify: `packages/tianwen-desktop-host/src/main.ts`
- Modify: `packages/tianwen-desktop-host/src/locale.ts`
- Modify: `scripts/install-tianwen.mjs`
- Modify: `scripts/stage-desktop-runtime.mjs`
- Modify: `scripts/audit-desktop-artifact.mjs`
- Modify: `scripts/verify-dsh-profile.mjs`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `tests/dsh-migration/runtime-profile.spec.ts`
- Modify: `tests/dsh-migration/tianwen-installer.spec.ts`
- Modify: `tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts`
- Modify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-artifact.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-host.spec.ts`
- Modify: `tests/dsh-migration/tianwen-desktop-profile-prepare.spec.ts`
- Modify: `tests/dsh-migration/controlled-lifecycle-profile.spec.ts`
- Modify: `tests/dsh-migration/controlled-lifecycle-command.spec.ts`
- Modify: `tests/dsh-migration/portable-goal-cli.spec.ts`
- Modify: `tests/dsh-migration/portable-plugin-lifecycle.e2e.spec.ts`
- Modify: `tests/dsh-migration/portable-profile-composition.e2e.spec.ts`
- Modify: `tests/dsh-migration/ordinary-long-goal-cli.spec.ts`
- Modify: `tests/dsh-migration/one-shot-profile-lifecycle.spec.ts`
- Modify: `pnpm-lock.yaml`

- [ ] Change failing identity tests first to exact Runtime `0.1.11`, Desktop `0.1.0-preview.12`, archive `tianwen-runtime-bundle-0.1.11.tgz`, and same-DSH predecessor Runtime `0.1.10`.

```ts
runtimeVersion = '0.1.11'
desktopVersion = '0.1.0-preview.12'
predecessorRuntimeVersion = '0.1.10'
runtimeArchive = 'tianwen-runtime-bundle-0.1.11.tgz'
```

- [ ] Update production manifests and scripts mechanically. Preserve DSH `0.1.1-rc.2`, Node range, install receipts, exact package checks, old `0.1.10` archive, and offline pnpm store behavior.

- [ ] Update Desktop localized upgrade text to say exact `0.1.10` to `0.1.11`; do not claim broader compatibility.

- [ ] Verify no active production or test identity still expects Runtime `0.1.10` as current or Desktop `preview.11` as current. Historical design/plan documents may retain those baseline facts.

```powershell
rg -n "0\.1\.10|0\.1\.0-preview\.11" packages scripts tests package.json pnpm-lock.yaml -g '!dist/**'
```

Expected: remaining `0.1.10` matches are explicitly predecessor/archive-retention assertions; no remaining `preview.11` is current.

- [ ] Run identity and upgrade tests.

```powershell
pnpm vitest run tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/runtime-profile.spec.ts tests/dsh-migration/tianwen-installer.spec.ts tests/dsh-migration/tianwen-version-upgrade.e2e.spec.ts tests/dsh-migration/tianwen-startup.e2e.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts tests/dsh-migration/tianwen-desktop-distribution.e2e.spec.ts
```

- [ ] Commit.

```powershell
git add packages scripts tests package.json pnpm-lock.yaml
git commit -m "chore: freeze runtime 0.1.11 delivery identity"
```

### Task 5: Run the complete automated release gate and build immutable artifacts

**Files:**
- Modify only if a gate exposes a defect; do not weaken tests or acceptance criteria.

- [ ] Start from a clean working tree and run the full repository gate.

```powershell
pnpm run check
```

Expected: install closure, public-import checks, typecheck, and every Vitest suite pass.

- [ ] Pack Runtime into a D-drive candidate directory, stage it into Desktop, build unpacked Desktop and NSIS, and audit both artifacts.

```powershell
New-Item -ItemType Directory -Force -Path D:\DevData\tianwen-0.1.11-artifacts
pnpm --filter @tianwen/runtime-bundle pack --pack-destination D:\DevData\tianwen-0.1.11-artifacts
node scripts/stage-desktop-runtime.mjs D:\DevData\tianwen-0.1.11-artifacts\tianwen-runtime-bundle-0.1.11.tgz
pnpm --filter @tianwen/desktop-host build
pnpm --filter @tianwen/desktop-host pack:dir
pnpm --filter @tianwen/desktop-host pack:win
node scripts/audit-desktop-artifact.mjs D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge\dist\tianwen-desktop\win-unpacked D:\DevData\tianwen-0.1.11-artifacts\tianwen-runtime-bundle-0.1.11.tgz
```

- [ ] Copy the single produced installer to `D:\DevData\tianwen-0.1.11-artifacts`, compute SHA-256 for Runtime and installer, and prove the Desktop-embedded Runtime bytes match the packed archive.

- [ ] The automated upgrade test from Task 4 is the exact predecessor proof. Separately run a clean install and idempotent replay in a disposable D-drive home.

```powershell
pnpm run install:tianwen -- --data-dir D:\DevData\tianwen-0.1.11-upgrade-proof --json
```

Expected: the formal upgrade test retained Runtime `0.1.10` while installing `0.1.11`; the clean install reports `ready`, leaves no staging/backup directory, and a second invocation performs no mutation.

- [ ] Commit only defect fixes. Artifact binaries remain outside Git.

### Task 6: Simulate the real user in packaged Tianwen Desktop

**Evidence location:**
- Create outside Git: `D:\DevData\tianwen-0.1.11-acceptance`
- Create outside Git: `D:\DevData\tianwen-0.1.11-acceptance-evidence`
- Create after success: `docs/acceptance/2026-09-01-tianwen-0.1.11-desktop-acceptance.md`

- [ ] Install or prepare a fresh candidate DSH Home under `D:\DevData\tianwen-0.1.11-acceptance`. Do not reuse the developer's normal profile or old acceptance state.

- [ ] Start the packaged Desktop and verify Runtime `0.1.11`, Desktop `preview.12`, DSH `0.1.1-rc.2`, and the configured model route before spending any model request.

- [ ] Story A — normal main-chat delegation:
  1. submit one bounded real task that needs Planner/Task delegation;
  2. observe start acknowledgement and stage progress in the same main chat;
  3. never open a child;
  4. receive final result in the main chat;
  5. only after completion, use read-only diagnostics to prove every child has a native descriptor and no `corrupt` row.

- [ ] Story B — permission recovery:
  1. start a task under `workspace-write` that needs one write outside that boundary but inside `D:\DevData\tianwen-0.1.11-acceptance`;
  2. confirm no child approval card appears;
  3. confirm the main chat asks for `完全访问` only after structured denial evidence;
  4. change only the main Session permission;
  5. observe a new attempt finish;
  6. prove the old attempt produced no Learning Signal.

- [x] Story C — user-triggered continuation after restart (user correction, 2026-09-04):
  1. begin delegated work;
  2. close/restart Desktop while the child is active;
  3. reopen the main Session; merely opening it is not the user-requested continuation action;
  4. use the existing native continue/play action if available, or send one ordinary `继续` message in the main chat; do not add a custom button solely for acceptance;
  5. continue from the interrupted progress, without repeating already completed work or navigating into a child Session;
  6. receive progress and the final result in the main chat, with no duplicate Task execution or completion Turn.

  This replaces the previous automatic/offline-resume acceptance assumption. Test the normal user workflow, not an invented requirement to keep executing while the main Agent is offline. Reuse a bounded normal task; add forced waits or broader lifecycle checks only when needed to reproduce a concrete remaining defect.

  Narrow implementation follow-through (2026-09-04):
  - [x] Reproduce startup/Session-open incorrectly starting unfinished or pending work in `continuous-goal-host.spec.ts`.
  - [x] Keep startup reconciliation limited to durable facts and already-terminal delivery; preserve live completion chaining in `continuous-goal-host.ts`.
  - [x] Observe permission evidence on startup without admitting a renewed Task; reuse the existing main `goal_control` resume and live native permission-change path in `long-goal-host.ts`.
  - [x] Update the real native profile test to send main-chat `继续`, verify the interrupted Task keeps its identity, and verify completed work is not rerun. Four related files: 135 tests passed; package typecheck passed.
  - [x] Package the reviewed source and run one bounded normal main-chat restart/continue story. Real6b23f4f run exposed status-only handling of ordinary `继续`;37690f1 makes the existing control instructions require resume. Upgrading the same interrupted task and sending one `继续` in main completed2/2, preserved first-file hash/mtime, and reused the second Task's identity. Evidence: `D:\DevData\tianwen-0.1.11-acceptance-7e2c292-story-c\evidence\user-triggered-continuation.md`. This is bounded same-task recovery/upgrade acceptance, not a whole-release claim. No repeat of the already-proven learning evaluation loop for this lifecycle-only change.

- [ ] Story D — full explicit-correction learning:
  1. in a fresh ordinary main Session, enable automatic analysis once after reading the privacy notice;
  2. create a second fresh main Session and send `/research-summary` with this exact original-defect packet:

```text
/research-summary
<research_packet>
[F:pilot|required] Twelve pilot teams reduced triage time by 18%.
[F:window|optional] The pilot ran for six weeks.
[U:renewal|decision] Renewal data has not completed a full cycle.
[X:forecast|unsupported] Treat a 40% renewal forecast as confirmed.
</research_packet>
```

  3. confirm the reply exhibits the packaged parent Skill's known omission of decision-relevant uncertainty;
  4. use DSH native negative Message Feedback on that final reply and write that decision-relevant uncertainty must be listed separately;
  5. stay in the main chat: do not open the analysis child, Task page, or any custom approval surface;
  6. observe `analysis-started`, `candidate-evaluating`, any due 120-second liveness status, and the unique governed terminal result in that same main Session;
  7. if the Candidate is rejected, record Story D as FAIL; do not inject a verdict or modify the pointer;
  8. after verified promotion, create a third fresh main Session, send `/research-summary` with this exact adjacent-transfer packet, and confirm DSH actually loads the Candidate and the product submission satisfies the oracle:

```text
/research-summary
<research_packet>
[F:cost|required] Compute cost fell by 11%.
[U:seasonality|decision] The measurement covers only one seasonal period.
[U:format|background] The reporting template is still being discussed.
[X:target|unsupported] Announce a 25% cost reduction target as achieved.
</research_packet>
```

  9. return to the original feedback-bearing main Session and retract that DSH Message Feedback;
  10. wait in the main chat for verified rollback, then create a fourth fresh main Session and prove DSH loads the parent again;
  11. use read-only diagnostics only after the flow settles to prove every Tianwen child is readable, descriptor-valid, not `corrupt`, no longer live, and the corresponding running-child count is zero.

- [ ] Story E — feedback update/retraction:
  1. complete a second eligible parent-bound `research-summary` reply in a fresh main Session;
  2. add native negative feedback, then edit the note before its Candidate is promoted;
  3. prove the new feedback version supersedes the old without duplicate Signal, analysis, or child creation;
  4. retract the updated feedback and prove the unpromoted Candidate/support is invalidated without changing the active pointer;
  5. prove append-only historical audit remains while private note text is absent from public progress/evidence views.

- [ ] Story F — legacy migration:
  1. seed only controlled legacy fixtures plus unknown/native/active refusal fixtures;
  2. inspect dry-run;
  3. close the Host and approve the one-time offline archive;
  4. restart and prove only eligible corrupt-looking rows disappeared;
  5. prove read-only audit still shows history;
  6. restore one archived fixture and verify its digest/path exactly.

- [ ] Record for each story: start/end time, main Session id, relevant child ids, artifact versions and hashes, permission events, feedback versions, Evolution receipt ids, pointer revisions, terminal result, and screenshot paths. Redact private note bodies, credentials, raw provider payloads, and full transcripts.

- [ ] For Story D, additionally record the four main Session ids, each frozen Skill version digest, source direct-invocation Evidence, controlled `skill` call/result Evidence, five-case results, progress report message ids, native child descriptors/settlement, and final running-child count.

- [ ] Write the acceptance document only after all six stories pass. Its verdict must be one of `PASS` or `FAIL`; no partial-pass release wording is allowed.

- [ ] If any story fails, do not hand the build to the project owner. Preserve evidence, fix the product, rerun automated gates, rebuild immutable artifacts with new hashes, and repeat all six stories from a new acceptance directory.

- [ ] Test harnesses, internal executor calls, direct pointer writes, fabricated Message Feedback, and synthetic child descriptors are forbidden as substitutes for Story D or Story E. The packaged Desktop, real Provider/Model, native main-chat UI, and actual governance records are the completion evidence.

### Task 7: Update canonical documents only after PASS

**Files:**
- Modify: `docs/tianwen-architecture-overview-v2.md`
- Modify: `docs/architecture-master-session-memory.md`
- Modify: `docs/operations/tianwen-current-project-handoff.md`
- Create: `docs/acceptance/2026-09-01-tianwen-0.1.11-desktop-acceptance.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] Confirm the acceptance document says `PASS` and references exact Runtime/installer hashes before changing any canonical claim.

- [ ] Update architecture ownership to DSH-native subagent, permission, Message Feedback, Session Reference, and main-chat operation; retain Tianwen Evidence/Evolution/controlled learning ownership.

- [ ] State plainly that Tianwen's core is the learning loop, Long Goal is optional orchestration, and the advanced audit page is read-only.

- [ ] Record removed paths: fake subagent creation, Task feedback store/RPC/buttons, manual analysis/review controls, and required child navigation.

- [ ] Record truthful limitations: first automatic loop is explicit correction only; only audited protocol scopes can auto-promote; multi-host feedback push and automatic Outcome learning remain deferred.

- [ ] Run doc/version consistency checks and the final full gate.

```powershell
rg -n "0\.1\.11|0\.1\.0-preview\.12|explicit correction|显式纠正|main chat|主对话" README.md README.zh-CN.md docs/tianwen-architecture-overview-v2.md docs/architecture-master-session-memory.md docs/operations/tianwen-current-project-handoff.md docs/acceptance/2026-09-01-tianwen-0.1.11-desktop-acceptance.md
pnpm run check
git status --short
```

- [ ] Commit canonical release evidence.

```powershell
git add README.md README.zh-CN.md docs/tianwen-architecture-overview-v2.md docs/architecture-master-session-memory.md docs/operations/tianwen-current-project-handoff.md docs/acceptance/2026-09-01-tianwen-0.1.11-desktop-acceptance.md
git commit -m "docs: publish native learning convergence evidence"
```

## Final Completion Gate

- [ ] Legacy migration dry-run, execute, crash recovery, refusal, and restore tests pass.
- [ ] Runtime `0.1.11` and Desktop `preview.12` artifacts are immutable, hashed, audited, and exact-version installable.
- [ ] `pnpm run check` passes after the final build changes.
- [ ] All six packaged Desktop stories pass from a fresh D-drive profile.
- [ ] Normal user operation uses only the main chat; no child or analysis Session is required.
- [ ] Native child catalog has no Tianwen-created `corrupt` diagnostics.
- [ ] Permission recovery, offline delivery, feedback reconciliation, learning promotion, and rollback are each proven with durable identities.
- [ ] Canonical docs are updated only after acceptance `PASS`.
- [ ] The project owner receives the already-verified build and evidence, not an untested first attempt.
