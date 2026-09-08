# Native Claim Capture Implementation Plan

2026-09-08 closeout: Tasks1–2 and Task3's exact-source gates, packaging,
single R9 run, independent assessment and release decision are complete.
R9 is NO-GO: raw-feedback actor drift and semantic false-met judgments are
confirmed. The service/tab had already disappeared when checked; terminal
state was verified unchanged, but a graceful stop was not performed or proved.
See [R9 results](../../operations/tianwen-natural-conversation-acceptance-r9-results-20260908.md).
Task4 delivery was not executed. Its authorized route continues under the
[prospective repair plan](2026-09-08-tianwen-feedback-source-semantics.md),
not by repeating this plan's closed implementation or R9 cohort.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the proven R8 model-output/consumer contract gap, then finish the existing integration release route on fresh evidence.

**Architecture:** Native DSH remains responsible for one-shot calls, structured_output validation, correction within its native loop, Sessions and persistence. Tianwen describes one fixed property per projected answer unit and stores that exact typed v2 capture. Current quality v5 separates the representation from immutable v4/v1 history; original semantic criteria and two-review consensus do not change.

**Tech Stack:** Existing TypeScript, DSH0.1.1-rc.2, its public schema validators, Vitest, Node22, pnpm11.20.0, existing Python and Electron gates. No new dependency/service/tool authority.

## Global Constraints

- Repo `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`, branch `codex/conversation-claim-evidence`; parent integration merge base11a4a293b176d63da726a1386477fdc6a0309d2e. Never delete this daily-shortcut worktree.
- Binding spec: `docs/superpowers/specs/2026-09-08-tianwen-native-claim-capture-design.md`. Parent integration Tasks1–3 and final broad review are already closed; this plan continues the actual Task4 acceptance failure, not a redispatch of completed work.
- R8 frozen source7879bb6ce9f91f8064703a677d6dc59fb37b8610, actual responses/outcomes/audit and R1–R7 evidence remain immutable. Daily017/preview.18 and original shortcut remain untouched until delivery.
- Preserve PURPOSE, COMMON, FOCUS, lossless projection bytes/IDs/digest, full configured model and semantic criteria. Current quality v5 criterion/source equal literal v4; no historical conversion/regrading or mixed-quality support.
- Store exact native v2 capture, not a transformed v1 record. Keep old v1 audit parser/acceptance for v4, old pre-audit records for v1–v3, and exact native recovery with zero model calls. Unavailable/consensus/eligibility/rollback behavior remains unchanged.
- Audit128units/512claims/32KiB, material96KiB, answer32KiB limits unchanged. Do not add unsupported schema keywords, a JSON parser, output repair, host retry, third judge or new model settings.
- Candidate Runtime0.1.20 / Desktop0.1.0-preview.21; DSH0.1.1-rc.2 unchanged. Preserve known010–019 predecessors and reject future Runtime021/current-identity mismatches. No dependency/lockfile changes, external Skill, tag or package publication.
- Root owns plans, acceptance protocol/evidence and delivery. One implementation worker at a time; independent read-only review can overlap. Use apply_patch; generated data/cache/logs under D:; never print credentials.
- Existing standing authorization covers ordinary implementation/model calls/normal merge/Daily delivery. No routine reapproval; a material strategy or authority expansion still requires user direction.

## Environment and evidence

Read `D:/DevData/tianwen-claim-evidence-integration-20260907/r8-u5-first-terminal-diagnosis.md` and the native feasibility report before Task1. The feasibility result is an offline prerequisite, not product acceptance.

Before every pnpm invocation:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-claim-audit.spec.ts tests/dsh-migration/conversation-claim-review.spec.ts
```

Native TS gates use the actual repository `.venv/Scripts/python.exe`, not an interpreter outside authorityRoot. Full Python uses `D:/DevData/tianwen-resume-stage-closeout-python312/Scripts/python.exe`. Record exact BASE per implementation task. Use new task fixture directories under `D:/DevData/tianwen-native-claim-capture-20260908`, not any old full-gate or cohort directory.

### Task 1: Exact native-enforceable v2 audit and v5 boundary

**Files:**
- Modify `packages/tianwen-evolution/src/conversation-claim-audit.ts`, `conversation-learning.ts`, `conversation-guidance.ts`, `index.ts`.
- Modify `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`; only necessary current audited-type/recovery integration sites in `conversation-observer.ts`, `conversation-guidance-loop.ts`, `conversation-judgment.ts` if the exact unchanged public recovery interface needs an explicit type narrowing.
- Modify tests `tests/dsh-migration/conversation-claim-audit.spec.ts`, `conversation-review-panel.spec.ts`, `conversation-learning.spec.ts`, `conversation-guidance.spec.ts`, `conversation-guidance-ledger.spec.ts`, `conversation-claim-review.spec.ts`, `conversation-claim-recovery.spec.ts`, `conversation-observer.spec.ts`, `conversation-feedback.spec.ts`, `conversation-guidance-loop.spec.ts`, `conversation-judgment.spec.ts`, `learning-consent-agent.spec.ts`, and shared `conversation-audited-response.ts` only where current v5/v2 fixtures need migration. Literal historical fixtures remain separate.
- Create `tests/dsh-migration/conversation-claim-capture.spec.ts` for actual producer/native capture tests; no general schema framework or extra production file unless reuse across these callers requires a small shared definition.

**Interfaces:**

```ts
export interface ClaimAssessment {
  readonly quote: string
  readonly kind: 'source-fact' | 'advice' | 'inference' | 'fiction' | 'general-knowledge' | 'non-factual'
  readonly status: 'supported' | 'unsupported' | 'contradicted' | 'permitted' | 'uncertain'
  readonly sourceIds: readonly string[]
  readonly explanation: string
}
// ClaimAuditV1 is the exact existing v1 shape and accepted-value contract.
export interface ClaimAuditV2 {
  readonly schemaVersion: 'tianwen.claim-audit.v2'
  readonly evidenceDigest: Sha256Digest
  readonly units: Readonly<Record<string, null | {
    readonly firstClaim: ClaimAssessment
    readonly additionalClaims: readonly ClaimAssessment[]
  }>>
}
export type ClaimAudit = ClaimAuditV1 | ClaimAuditV2
export function parseClaimAudit(value: unknown, verdict: 'met' | 'not-met' | 'inconclusive'): ClaimAudit
```

Keep existing run/verify/project public signatures, widening only ClaimAudit's union as needed. `parseConversationAuditedReviewChecks` accepts wholly v1 or wholly v2 pairs, never mixed versions; `parseConversationQualityReviewChecks` maps v4→v1 and v5→v2 while pre-v4 remains strictly unaudited. Store the entire original audit shape in task and arm records, so unchanged native exact-value comparison still works.

- [x] Step1: Create the new fixture root, record BASE and capture literal v4 quality object/hash plus v1 records from BASE before changing the current builder. Add RED tests for v5/v2, malformed/mixed parent boundaries and v4 readability. Example assertions:

```ts
expect(conversationQualityContract().schemaVersion).toBe('tianwen.conversation-quality.v5')
expect(conversationQualityContract().criterion).toBe(literalV4.criterion)
expect(parseConversationQualityContract(literalV4)).toEqual(literalV4)
expect(hasCurrentConversationQuality(literalV4)).toBe(false)
expect(() => parseConversationQualityReviewChecks(v1Pair, conversationQualityContract())).toThrow()
expect(() => parseConversationQualityReviewChecks(v2Pair, literalV4)).toThrow()
expect(() => parseConversationAuditedReviewChecks([v1Pair[0], v2Pair[1]])).toThrow()
```

`literalV4`, `v1Pair`, `v2Pair` are local named fixtures built from the exact spec types; the historical expected value must not come from the new current builder. Include actual ledger append/replay round trips and unchanged historic hashes, not only standalone parsing.

- [x] Step2: In the producer test, capture the actual structured_output.parameters supplied by runConversationClaimReview through the existing native harness. Feed it to public `assertSupportedJsonSchema` and `validateJsonSchemaValue`, not a hand-recreated schema. Use a three-unit original answer `正文。\n\n---\n`: first/nonblank and third/Markdown require firstClaim; the middle blank is null. Assert legal input passes and missing/extra unit, nonblank null, missing firstClaim, blank object/quote/source fail at the native schema layer. Keep a consumer-invalid empty/nonexact substantive quote to demonstrate the remaining defense. Add native same-one-shot capture rejection/correction tests and assert the rejected tool attempt is not counted as the successful capture; no extra parent turn or host retry.

- [x] Step3: Run affected focused RED tests and preserve actual failures. Implement smallest domain union dispatch with common claim syntax validation, preserving exact old v1 behavior. V2 fixed-unit keys must match `^answer-[1-9][0-9]*$`; reject unknown/extra unit-object keys, invalid null/object shapes, limits and statuses. Current v5 builder spreads an explicit legacy-v4 builder so old parse/hash cannot silently resolve to v5. Update both parent state-boundary checks, not only the union parser.

- [x] Step4: Build the v2 native schema using only supported properties:

```ts
const unitProperties = Object.fromEntries(answerItems.map(item => [item.id,
  item.text.trim() === '' ? { type: 'null' } : object({
    firstClaim: claimSchema,
    additionalClaims: { type: 'array', items: claimSchema },
  }),
]))
const unitsSchema = object(unitProperties) // object() marks every property required and closes extras
```

The local claim schema has the existing five required fields, existing enums and general descriptions of their already-required meaning. It does not include expected verdicts or actual R8 answer phrases. Store the exact native v2 result. Runtime validation requires exact projected keys/null eligibility and applies the existing claim/source/quote/digest guards to firstClaim and each additionalClaim; do not synthesize a claim or convert a saved record. Preserve the v1 evidence-validation path for historical proof verification. PURPOSE/COMMON/FOCUS remain byte-identical.

- [x] Step5: Update only current scripted fixtures to produce v2 from their actual supplied projection; keep explicit legacy-v1 fixture support for historic recovery tests. Run real persisted complete-runtime restart cases: valid v2 study activates once with0new requests and a second full restart still makes0requests/0duplicate activation; authentic v2 capture with a schema-valid nonexact quote/assistant-only source/substituted material fails recovery with0requests/no activation. Do not replace these with fixtures now rejected before persistence. Preserve old v1 positive/negative no-call recovery evidence tests and ensure old quality is not new support. Add a new ordinary turn while prior review remains pending.

- [x] Step6: Run all listed conversation tests, evolution/runtime dependency build and typechecks. Record exact commands/pass/fail/skip counts plus initial failures; self-review and commit only owned code/tests. Root generates BASE..HEAD review package; independent SPEC and QUALITY approval is required. Any genuine blocker gets one bounded fix/review loop, not unreviewed controller edits.

### Task 2: Runtime020 / Desktop preview.21 packaging identity

**Files:** Current version declarations and predecessor allowlists in runtime/Desktop manifests, portable/controlled-profile modules, Desktop host/bootstrap, installer/stage/audit/verify scripts, associated tests, current operational setup commands. Add `conversation-claim-capture.spec.ts` to the existing natural-conversation CI group and its literal Python workflow-name expectation. No historical evidence report, Daily path or dependency lockfile modification.

**Interfaces:** Exact archive `tianwen-runtime-bundle-0.1.20.tgz`; Desktop0.1.0-preview.21 embeds that archive; declared native dependency stays DSH0.1.1-rc.2;019 becomes an explicitly supported predecessor without dropping010–018.

- [x] Step1: Record BASE and add RED normal019→020 migration, embedded020/preview21 identity, unknown021 rejection, old data/config/shortcut preservation and exact CI suite-name assertions.

```ts
expect(desktopManifest.version).toBe('0.1.0-preview.21')
expect(desktopRuntimeArchive).toBe('tianwen-runtime-bundle-0.1.20.tgz')
expect(resolveKnownOldDesktopTarget(previous019Target).profileRoot).toBe(previous019Target.profileRoot)
```

Use existing fixture builders and preserve all unknown/malformed target rejection tests.

- [x] Step2: Mechanically update current019/preview20 references only, distinguish predecessor/historical literals, add019 predecessor and the new CI suite name. No source build may overwrite the live Desktop output.
- [x] Step3: Run runtime-bundle, installer, portable/controlled/runtime-profile, Desktop artifact/host/bootstrap/profile-prepare and ordinary goal CLI tests plus the Python CI contract file; build/typecheck and report real counts. Self-review/commit; root provides the full task diff for independent scoped review.

### Task 3: Fresh final-source gates and R9 real use

**Files:** Root-owned R9 protocol/results documents and a new isolated `D:/DevData/tianwen-natural-acceptance-r9-20260908`. Adapt the reviewed R8 controls prospectively; no changes to R8 frozen helpers/results. Reviews and receipts stay on D:.

- [ ] Step1: Review this plan's entire exact source delta from its recorded BASE through final code; carry forward parent review outcomes without reopening unrelated completed tasks. Apply the final single fix wave/scoped re-review if needed. Run fresh complete TS/Python gates at clean final SHA using a new no-reuse fixture root; preserve failures and exact start/end SHA receipts. Do not reuse7879bb6 gates.
- [ ] Step2: Pack Runtime020 twice, compare bytes, build isolated Desktoppreview21, verify current strict artifact/private-module identity, normal new-profile setup and actual prepared-Desktop lifecycle. Keep live Desktop untouched. Only byte-verified original Electron distribution extras may be recoverably quarantined before strict audit, with a receipt.
- [ ] Step3: Independently review/freeze the R9 ordinary protocol, new helpers, exact source/archive/runtime/Desktop/model/native configuration,0-state and bounded R1–R8 history before first model call. Adapt the audit to qualityv5 and native v2 without changing its provenance checks. Reuse the nine ordinary-input sequence from the committed R8 protocol once each with no expected answers or outcome labels; this new source/protocol cohort is prospective, not an old-result regrade. Keep U1–U5 first-study terminal checkpoint before U6–U9. No extra near-duplicate inputs to force a branch.
- [ ] Step4: Own one persistent isolated service and fresh in-app tab. Use native controls, ordinary learning consent and actual configured DeepSeek. Finish every first ordinary/review/study result; retain native same-one-shot correction attempts. Project all ordinary answers for independent blind assessment before revealing system verdicts. Audit full frozen bytes/receipts and compare valid judgments; record exact timing and activation/inactivity separately. Do not turn an invalid/inconclusive result into pass.
- [ ] Step5: Make an explicit evidence-led release decision. Formatting availability, semantic source authority, ordinary response latency and successful improvement are distinct claims. A new proven blocker requires a specifically evidenced next decision; do not start another identical cohort for a better outcome. Close only owned terminal service/tab and verify post-stop native state unchanged.

### Task 4: Finish parent integration and authorized Daily delivery

**Files:** Current results/handoff and fresh R9 delivery controls/backups, following the already independently reviewed R8 delivery safety sequence.

- [ ] Step1: Only after release gates pass, inspect clean source/remote and complete the authorized ordinary merge/push without force/reset. Require all four existing CI jobs on exact main SHA before Daily mutation.
- [ ] Step2: Fresh exact-target process/data/config/shortcut inventory and exclusive recoverable backup. Pin reviewed control bytes before import, validate backup/frozen bytes before Desktop mutators. Normal managed Runtime020 install and Web update must preserve all protected user files and differ only in exact allowed version fields; compare archive receipt to the frozen candidate. Then recoverably back up/replace Desktop with the verified isolated candidate, never delete the shortcut worktree.
- [ ] Step3: Run post-update verification, actual prepared-profile Desktop/Web lifecycle, post-lifecycle unchanged-old-data/new-file inventory and repeat managed-install idempotence. Retain017 packages and previous Desktop. No full NSIS/uninstall claim or package/tag publication.
- [ ] Step4: Commit honest final results/handoff, verify their exact-main CI, mark parent integration Task4/5 and this plan complete only for actually achieved scope, preserve necessary reports before removing only this plan's scratch directory. State whether improvement/adoption was actually observed and that finite use does not prove long-term benefit.
