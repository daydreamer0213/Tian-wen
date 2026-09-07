# Shared Claim Review Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the prospectively tested claim review into ordinary learning, preserve old records, verify real use, and deliver the next normal version.

**Architecture:** Native DSH owns all model calls and persistence. A small domain audit parser retains typed review receipts; both runtime callers use the same tested claim adapter. Recovery verifies native original material rather than trusting a saved verdict alone.

**Tech Stack:** TypeScript, existing DSH0.1.1-rc.2 public APIs, Vitest, pnpm11.20.0, Node22, existing Python gates and Electron delivery.

## Global Constraints

- Repository: `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`; branch `codex/conversation-claim-evidence`; merge base `11a4a293b176d63da726a1386477fdc6a0309d2e`. Never delete this daily-shortcut worktree.
- Binding design: `docs/superpowers/specs/2026-09-07-tianwen-claim-review-integration-design.md`, extending the approved claim-to-source design. R3 passed only a finite gate; no incremental semantic benefit was proved. R1/R2/R3 frozen evidence is immutable.
- Both ordinary task review and new method-study review use the existing tested `runConversationClaimReview`. Preserve its exact prompts, source projection, status mapping and the existing native lifecycle.
- Quality v4 identifies an audit-bearing review method; its criterion text is byte-identical to v3. Preserve exact historical v1/v2/v3 objects and their hashes. No historical regrading, mixed-quality support, trigger relaxation, third judge, retries, output repair or new model/dependency/service/tool authority.
- Legacy review-check parsing stays strict and rejects audit. Audited pairs require two audits; mixed pairs are invalid. Parent-quality validation is mandatory at both task and study state boundaries. Unavailable/proof-null behavior and two-review consensus remain unchanged.
- Native recovery must bind the exact successful capture, initial request, projection, audit, focus/purpose, study material/output and model digest without model calls. An authentic but invalid audit never becomes recoverable passing evidence.
- TDD and independent task spec+quality review precede task completion. A final broad independent review, final-code local gates, a fresh frozen ordinary actual-model browser cohort and exact-main CI precede daily delivery.
- Runtime0.1.18, Desktop0.1.0-preview.19, DSH0.1.1-rc.2. Normal installer/profile paths only; preserve user data, shortcut, configs and previous archives with fresh backups. No package/tag publication.
- Generated files and caches belong on D:. Use apply_patch for edits; preserve others' changes. Never print credentials. Never relaunch a frozen first-attempt cohort to obtain a different result.

## Execution environment

Load the existing gate environment before every pnpm invocation:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run <task-owned test files>
```

The angle-bracket argument above describes selecting the exact files listed per task, not a literal shell argument. Store logs under `D:/DevData/tianwen-claim-evidence-integration-20260907`. Record exact BASE before each implementer. Root owns plans, protocol, acceptance and delivery; fresh workers own each code task and may commit only their scoped files. One implementation worker at a time.

### Task 1: Typed audit records and exact v4 domain boundary

**Files:**
- Create: `packages/tianwen-evolution/src/conversation-claim-audit.ts`.
- Modify: `packages/tianwen-evolution/src/conversation-learning.ts`, `conversation-guidance.ts`, `index.ts`.
- Test: `tests/dsh-migration/conversation-review-panel.spec.ts`, `conversation-learning.spec.ts`, `conversation-guidance.spec.ts`, `conversation-guidance-ledger.spec.ts`; create `conversation-claim-audit.spec.ts` and a literal legacy-quality fixture if shared by these tests.

**Interfaces:**
- Consume the exact ClaimAudit shape/status rules from runtime `conversation-claim-review.ts` and the existing legacy summary parser.
- Produce the native-free `ClaimAudit`, `parseClaimAudit(value: unknown, verdict: 'met' | 'not-met' | 'inconclusive'): ClaimAudit`.
- Keep legacy `ConversationReviewCheck` and `parseConversationReviewChecks` unchanged in accepted keys/summary rules.
- Produce `ConversationAuditedReviewCheck extends ConversationReviewCheck { readonly audit: ClaimAudit }`, `ConversationStoredReviewChecks` (union of wholly legacy and wholly audited two-tuples), `parseConversationAuditedReviewChecks(value: unknown)`, `parseStoredConversationReviewChecks(value: unknown)`, and `parseConversationQualityReviewChecks(value: unknown, quality: ConversationQualityContract | undefined)`.
- `conversationReviewConsensus` accepts and revalidates a stored tuple, but keeps its existing result semantics. Parent-aware parsing is called by both state validators before accepting evidence.

- [ ] Step1: Add RED tests with a literal v3 contract copied from pre-change source, not constructed from the new current builder. Preserve existing literal v1/v2 tests. Include exact old hashes or literal record round trips, v4 criterion equality, and this boundary matrix:

```ts
expect(conversationQualityContract().schemaVersion).toBe('tianwen.conversation-quality.v4')
expect(conversationQualityContract().criterion).toBe(legacyV3.criterion)
expect(parseConversationQualityContract(legacyV3)).toEqual(legacyV3)
expect(hasCurrentConversationQuality(legacyV3)).toBe(false)
expect(() => parseConversationReviewChecks(auditedPair)).toThrow()
expect(parseConversationAuditedReviewChecks(auditedPair)).toEqual(auditedPair)
expect(() => parseStoredConversationReviewChecks([auditedPair[0], legacyPair[1]])).toThrow()
expect(() => parseConversationQualityReviewChecks(auditedPair, legacyV3)).toThrow()
expect(() => parseConversationQualityReviewChecks(legacyPair, conversationQualityContract())).toThrow()
expect(conversationReviewConsensus(auditedPair).verdict).toBe('met')
```

Use real parser/state transitions for task and study replay, not mocked parser results. Include v4 missing audit, legacy audit injection, malformed audit, mixed pair, consensus disagreement and proof-null unavailable records. A syntax-valid audit needs nonempty units/claims/quotes/explanations, exact keys/version/digest format, unique unit IDs/source IDs, 128 units/512 claims/32KiB limits, known kind/status, no source-fact/permitted, no non-source-fact/supported and no met with unsupported/contradicted/uncertain. Role/quote/complete-coverage checks await actual runtime evidence; do not pretend syntax can prove them.

- [ ] Step2: Run the five listed domain test files plus new audit file; preserve expected RED failures before implementation.
- [ ] Step3: Implement the smallest domain syntax module and reuse the existing summary parser by removing audit only in the audited-parser wrapper, then restoring the exact validated audit. No duplicate summary validation block. Both audits must have the same evidenceDigest. Stored parser may discriminate whole tuples by audit presence, but must reject mixed forms, including explicitly undefined/null audit fields. Keep the legacy v3 builder exact and make current v4 change only schemaVersion. Retain audited tuples in `task-reviewed` / `arm-recorded` record parsers; use actual admission/study quality at both aggregate validation sites to require the right form. Widen only these typed fields; no unknown audit fallback. Preserve current support/decision thresholds. Exercise the existing ledger append/replay paths to prove complete audited records survive and literal old records/arm material/study IDs remain unchanged; malformed v4 serialized records must fail replay as well as fresh input.
- [ ] Step4: Run all domain files above plus evolution typecheck. Current native integration fixtures can remain v3-shaped until Task2; do not call that a full branch regression or alter runtime files in Task1. Update manual fixtures that intentionally represent new current v4 records while retaining separate literal old-format evidence.
- [ ] Step5: Self-review, commit scoped files and report RED/GREEN commands/output, exact interfaces, all changed files and concerns. Root supplies the diff for independent task review before continuing.

### Task 2: Shared runtime path and proof-bound restart

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`, `conversation-judgment.ts`, `conversation-observer.ts`, `conversation-guidance-loop.ts`.
- Test: `tests/dsh-migration/conversation-claim-review.spec.ts`, `conversation-judgment.spec.ts`, `conversation-observer.spec.ts`, `conversation-feedback.spec.ts`, `conversation-guidance-loop.spec.ts`; create `conversation-claim-recovery.spec.ts` and one shared native audited-response fixture only if used by several tests.

**Interfaces:**
- Consume Task1 domain `ClaimAudit`, `parseClaimAudit`, `ConversationAuditedReviewCheck`, `parseConversationAuditedReviewChecks` and unchanged consensus.
- Preserve `projectClaimEvidence`, `validateClaimAudit`, `runConversationClaimReview` public exports; re-export ClaimAudit if needed. Runtime validation invokes domain syntax parser then applies existing exact evidence checks.
- Add `recoverConversationJudgmentRequest(ctx, check: ConversationReviewCheck): Promise<{ readonly instruction: string; readonly material: unknown; readonly modelConfigDigests: readonly string[] }>` beside legacy native verification. It checks the exact successful capture including extra typed audit if present; return only recovered persisted data, no model work.
- Add `verifyConversationClaimReviewCheck(ctx, check: ConversationAuditedReviewCheck, expected: { readonly purpose: 'method-study'; readonly materialDigest: string; readonly outputDigest: string; readonly modelConfigDigest: string }): Promise<void>` in claim adapter. Production recovery invokes it for every arm check with hashes from that actual arm/study.

- [ ] Step1: Add RED tests showing both ordinary task and study records retain two audits, normal next-turn work is not blocked by pending review, valid restart activates with zero extra requests, and invalid restart never activates. Include authentic native captures rejected for nonexistent/nonexact answer quote, assistant-only support or missing answer coverage, not only a changed raw hash. Also cover substituted projection, requestDigest/focus mismatch, wrong task/answer/model binding and missing/changed second proof. Reuse native harness; clearly label scripted deterministic tests as non-acceptance.

```ts
const before = harness.adapter.requests.length
await restartGuidanceLoop()
expect(harness.adapter.requests).toHaveLength(before)
expect(studyAfterRestart.activation).toBeUndefined() // invalid-audit scenario
expect(task.review.reviewChecks.every(check => check.audit.schemaVersion === 'tianwen.claim-audit.v1')).toBe(true)
```

The illustrative locals refer to the existing loop harness; implement the restart using its existing fiber dispose/plugin sequence, not a new test service. Cover valid restart separately with activation defined once. Test raw persisted initial prompt and request digest using real native sessions; never forge a passing native output in the acceptance environment.

- [ ] Step2: Run affected native files and retain RED. A failing old script lacking audit is migration work, not sufficient proof for the new recovery tests.
- [ ] Step3: Move only audit type/syntax responsibilities to Task1 module; keep native projection and byte limits as before. Replace strip-summary/re-attach composition with the typed audited parser and unchanged consensus. Switch both production imports to `runConversationClaimReview`; leave old helper for legacy tests/diagnostics. Preserve tested prompt strings and full callConfig/isolated two-session lifecycle.
- [ ] Step4: Recover native one-shot request with the existing Session digest/capture check. Require a one-shot child, exactly one initial direct-user append in its one-shot interval, one text-block host prompt and matching `proof.requestDigest = sha256({persona: unchangedObserverPersona, prompt: actualContent})`. Extract material using the fixed host delimiter after matching the exact claim instruction; do not search assistant text or split on every occurrence inside JSON. Native one-shot descriptor has no persona. Check all request headers and return their config hashes. Claim verifier checks exact wrapper keys, projection equality from original, complete audit, exact raw evidence quotes, expected purpose/focus, task/answer/model hashes. No circular import from judgment into claim adapter, no general request framework.
- [ ] Step5: Update affected scripted native response fixtures to generate valid syntax/audit for the actual request projection. Keep deterministic fixed verdict intent, and keep literal legacy tests using the legacy adapter. Preserve all preexisting feedback, rollback, cancellation, model-identity and no-rerun assertions. Do not delete failing scenarios or silently return met in a shared helper.
- [ ] Step6: Run all affected files, review-panel/audit/domain regressions and full runtime dependency build/typecheck. Self-review/commit/report; independent task review gates the next task.

### Task 3: Versioned packaging and CI coverage

**Files:**
- Modify runtime/Desktop package versions, `portable-profile.ts`, `controlled-lifecycle.ts`, Desktop `host.ts`, `main.ts`, `locale.ts`; existing installer/stage/audit/verify-profile scripts; `.github/workflows/ci.yml`; current-version expectations in `tests/dsh-migration`.
- Modify current operational setup documents only where they advertise the active version; historical evidence reports remain unchanged. No dependency/lockfile update unless a verified existing workspace version reference requires it.

**Interfaces:** Runtime018 archive is `tianwen-runtime-bundle-0.1.18.tgz`, Desktop is preview.19, DSH exact rc.2. Add017 to known-old upgrade allowlists without dropping010..016 or broadening malformed/unknown-version acceptance.

- [ ] Step1: Add RED test for normal017 predecessor upgrade to018 and pin embedded preview.19 to018:

```ts
expect(desktopManifest.version).toBe('0.1.0-preview.19')
expect(desktopRuntimeArchive).toBe('tianwen-runtime-bundle-0.1.18.tgz')
expect(resolveKnownOldDesktopTarget(previous017Target).profileRoot).toBe(previous017Target.profileRoot)
```

Use the existing installer/Desktop fixture builders, with unchanged user data/config preservation and unknown/mismatched predecessor rejection assertions. Run installer/desktop-artifact/desktop-host/profile-prepare focused tests and retain RED.
- [ ] Step2: Mechanically update current version references only (`rg -n '0\\.1\\.17|preview\\.18' packages scripts tests .github`), distinguishing predecessor references. Keep the existing artifact names/contracts aligned; no release framework refactor.
- [ ] Step3: Add `conversation-review-panel.spec.ts`, `conversation-claim-audit.spec.ts`, `conversation-claim-review.spec.ts`, `conversation-claim-recovery.spec.ts` to the existing natural-conversation CI test command.
- [ ] Step4: Run installer, runtime-bundle, controlled-lifecycle command/profile, runtime-profile, Desktop host/bootstrap/profile-prepare/artifact and portable/ordinary goal CLI deterministic tests. Build/typecheck, self-review, commit and report for independent task review. E2E/live skips are reported as skips, not acceptance.

### Task 4: Final code verification and fresh ordinary browser acceptance

**Files:** Create `docs/operations/tianwen-natural-conversation-acceptance-r7-20260907.md` and honest results document. Evidence root `D:/DevData/tianwen-natural-acceptance-r7-20260907` must be new. Root owns this task; independent reviewers own read-only control/proof/answer review reports.

- [ ] Step1: Run final whole-branch review with exact merge-base..HEAD diff and the ledger. Handle findings through one scoped worker fix wave and scoped re-review per SDD. Any final code fix invalidates prior final-code gates/freeze.
- [ ] Step2: Run current source build, full typecheck, DSH install identity/import checks, full Vitest; Python ruff/compileall/pytest. Logs use a new D: fixture root. Require real exit codes and explicit pass/skip counts. Do not reuse R3 gates after integration.

```powershell
pnpm --filter '@tianwen/runtime-bundle...' build
pnpm run typecheck
node scripts/check-dsh-install.mjs
node scripts/check-dsh-install.mjs --imports
pnpm exec vitest run
```

Use the verified absolute launchers/environment above. Python interpreter: `D:/DevData/tianwen-resume-stage-closeout-python312/Scripts/python.exe`; run `-m ruff check .`, `-m compileall -q src tests`, `-m pytest`.

- [ ] Step3: Pack exact Runtime018 and Desktop preview.19 to the isolated D: root, normal new Web Profile preparation, artifact/private-module identity checks and lifecycle checks. Use existing `scripts/stage-desktop-runtime.mjs`, `scripts/audit-desktop-artifact.mjs` and predecessor delivery scripts only after reading and adapting paths into this fresh root. Never overwrite the live `dist/tianwen-desktop/win-unpacked` before backup; direct candidate build output to the isolated root.
- [ ] Step4: Before first model call, write and independently review/freeze R7 protocol, code/archive/runtime/profile/model identity and natural request sequence. Include fresh incomplete-source drafting, follow-up current format overriding old preference, honest feedback tied to actual answer, allowed advice/fiction and a normal next request while old review is pending. No frozen assistant answers or outcome labels in runtime requests. Use one actual attempt each; capture all actual responses, feedback and native proof IDs. Do not infer success from buffered partial logs.
- [ ] Step5: Read computer-use skill, operate a fresh in-app browser tab at the actual isolated service URL using normal DSH controls and actual configured DeepSeek. Observe consent normally. Let automatic studies finish their first attempts and inspect all baseline/candidate checks, activation/inactivity and subsequent tasks. If no study opens, record the concrete missing conditions; never force it or loosen gates mid-cohort.
- [ ] Step6: Independently assess actual user inputs/answers without system verdicts first, then compare system audits/decisions. Audit frozen hashes and native receipts. Report the first outcomes and finite semantic limits; unavailable/misjudged results cannot be relabeled as pass. A release-blocking issue requires an evidenced prospective fix and new independent acceptance, preserving R7.

### Task 5: Normal merge, exact-main CI and daily delivery

**Files:** Honest results/status/018 delivery documentation. Fresh delivery evidence and backups under the R7 root, or a successor root if a prospective fix was necessary.

- [ ] Step1: Read finishing-a-development-branch skill; inspect clean scoped branch and remote, perform the authorized ordinary merge/push with no force/reset/tag/package publication. Use current exact-source checks, not an old green run. User already authorized normal merge/delivery; do not reopen routine choice prompts.
- [ ] Step2: Query CI on exact main SHA and require all four existing jobs successful before touching daily install. Failure is investigated and fixed in scope with new tests/review, never bypassed. Preserve any external branch changes.
- [ ] Step3: Fresh inventory of user data, two profile configurations, shortcut and current installed runtime; verify no live process owns exact replace targets, without killing unrelated processes. Create recoverable D: backups. Use the existing managed installer and normal Web Profile upgrade, verify018 exact archive and receipt, repeat install idempotence, then replace Desktop with verified candidate and check its normal launch/page-ready/exit.
- [ ] Step4: Compare data/config/shortcut inventories and package/resource hashes after delivery; retain017 package and previous Desktop. Report what changed, actual acceptance limits and user action (same existing shortcut). Commit final honest status docs and require their exact-main CI too. Remove only this plan's verified scratch workspace when final review is clean; preserve all evidence roots and the daily worktree.
