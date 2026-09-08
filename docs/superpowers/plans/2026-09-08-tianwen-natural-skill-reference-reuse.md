# Natural skill reference reuse implementation plan

> Use subagent-driven-development in the existing isolated D: worktree. The user has authorized ordinary implementation decisions and continuous progress; do not ask between tasks.

**Goal:** Connect native reviewed source discovery/reference to automatic natural studies without rebuilding the legacy learning core.

**Architecture:** One optional model selection, one exact host read recorded in the existing guidance ledger, then a new native proposal. At most the already-supported exploration follows; no generic workflow engine or added model tools.

**Tech stack:** Existing TypeScript/Evolution ledger/DSH 0.1.1-rc.2 SkillRegistry and one-shot Sessions; existing Vitest native harness.

**Design:** `docs/superpowers/specs/2026-09-08-tianwen-natural-skill-reference-reuse-design.md`.

## Global Constraints

- Preserve old LearningSkillAdmission exact11fields, old summary scope/tool authorization, native inspect observation meaning and all old request/proof/record shapes. Do not invent Run/SkillUse or executable Skill promotion.
- Natural records stay in GuidanceStudy and the existing ledger; one immutable source read before any exploration/candidate/decision. No scheduler, retry, database or tool expansion.
- Natural admission is separate and default empty. Exact scope is `conversation:sha256:<64 lowercase hex>`, inherited from opened.scopeKey. environmentDigest is sha256({kind:'tianwen.conversation-skill-environment.v1',evolutionRoot}) for the exact explicit absolute root actually passed to Runtime initialization. No public Evolution root getter exists; do not access private fields. Absent explicit absolute root => no source discovery, not a failure of ordinary learning.
- Configuration changes take effect through runtime reload/reconstruction, cancelling old calls through existing disposal. Do not claim instantaneous disk-file revocation. Recheck current loaded admission and existing consent/support/parent at every source-related step.
- Source body is untrusted reference, max16384 UTF-8 bytes, whole actual definition must match reviewed digest/provider/name/modelInvocable. No external code, downloads, added tools or copied source authorization.
- Body only reaches source-aware proposals. Cases, workers, blind reviewers, facts/quote whitelist and formal five-case/ten-arm rule are unchanged. Reading/declaring use is not evaluation success or causal proof.
- No live/browser/external-source calls, R11, repeated cohorts, Desktop builds, Daily changes, dependency installs or full suites inside implementation tasks. Existing independent source permission is not extended to new homes/Daily. Use explicit owned files and preserve others' work.
- Working directory for every command is `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`, not the ambient C: checkout. Test prefix: source `D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1`; invoke `D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs`.

## Task 1: Shared source identity and natural source ledger binding

Ownership: `packages/tianwen-evolution/src/learning-analysis.ts`, new `packages/tianwen-evolution/src/conversation-skill-source.ts`, `packages/tianwen-evolution/src/conversation-guidance.ts`, `packages/tianwen-evolution/src/ledger.ts`, `packages/tianwen-evolution/src/index.ts`, new `tests/dsh-migration/conversation-skill-source.spec.ts`, existing `tests/dsh-migration/conversation-guidance.spec.ts`, `tests/dsh-migration/conversation-guidance-ledger.spec.ts`, and assigned report only. You are not alone; preserve other edits. No runtime code in this task.

**Interfaces produced:**

```ts
// learning-analysis.ts: shared nine fields, same validations as old parser.
export interface LearningSkillReference {
  readonly name: string; readonly provider: string; readonly digest: Sha256Digest
  readonly origin: string; readonly revision: string
  readonly license: 'MIT' | 'Apache-2.0' | 'BSD-2-Clause' | 'BSD-3-Clause' | 'ISC'
  readonly reviewedAt: string; readonly kind: 'self-contained-text'; readonly runtime: '0.1.1-rc.2'
}
export interface LearningSkillAdmission extends LearningSkillReference {
  readonly scopeKey: string; readonly toolName: string
}
export function parseLearningSkillReference(value: unknown): LearningSkillReference
// conversation-skill-source.ts
export interface ConversationSkillAdmission extends LearningSkillReference {
  readonly scopeKey: string
  readonly purpose: 'conversation-method-reference'
  readonly environmentDigest: Sha256Digest
}
export function parseConversationSkillAdmission(value: unknown): ConversationSkillAdmission
export function parseConversationSkillDefinition(value: unknown, reference: LearningSkillReference): Readonly<Record<string, unknown>>
export interface GuidanceSourceUse {
  readonly readDigest: Sha256Digest
  readonly status: 'adapted' | 'not-used'
  readonly rationale: string
}
export function parseGuidanceSourceUse(value: unknown): GuidanceSourceUse
// conversation-guidance.ts
export interface GuidanceSourceReferenceReadRecord {
  readonly kind: 'source-reference-read'; readonly studyId: GuidanceStudyId
  readonly reference: ConversationSkillAdmission
  readonly definition: Readonly<Record<string, unknown>>
  readonly selectionProof: GuidanceProof
}
// GuidanceStudy.sourceReference?: GuidanceSourceReferenceReadRecord
// GuidanceCandidateRecord.sourceUse?: GuidanceSourceUse
```

- [ ] RED: add the new parser/export tests first. A small self-contained native-shaped definition and reference must round-trip; use existing state/ledger fixtures for governance rather than another harness.

```ts
const definition = {name:'source-audit', provider:'test-reviewed-source', source:'bundled',
  description:'Separate findings from unknowns.', content:'Preserve stated uncertainty.',
  invocation:{modelInvocable:true,userInvocable:true}}
const reference = {name:definition.name, provider:definition.provider, digest:sha256(definition),
  origin:'https://example.invalid/test-fixture', revision:'fixture-v1', license:'MIT',
  reviewedAt:'2026-09-08T00:00:00.000Z', kind:'self-contained-text', runtime:'0.1.1-rc.2',
  scopeKey:`conversation:${sha256({cwd:'fixture-workspace'})}`, purpose:'conversation-method-reference',
  environmentDigest:sha256({kind:'tianwen.conversation-skill-environment.v1',evolutionRoot:'fixture-root'})}
expect(parseConversationSkillAdmission(reference)).toEqual(reference)
expect(() => parseConversationSkillAdmission({...reference, toolName:'research-summary'})).toThrow()
expect(() => parseConversationSkillDefinition({...definition,content:'replaced'},reference)).toThrow()
```

- [ ] Run `exec vitest run tests/dsh-migration/conversation-skill-source.spec.ts` and record the actual expected RED before production edits.
- [ ] Extract the old nine-field identity/validation into parseLearningSkillReference in learning-analysis.ts; retain old exact11key gate and scope/tool safeText behavior. Shared parser itself accepts exactly9keys. Natural parser accepts exactly12keys (common9+scopeKey+purpose+environmentDigest), validates precise scope/sha shape and purpose, and uses the common validator, never constructs a fake legacy admission.
- [ ] parseConversationSkillDefinition requires an object and verifies name/provider/modelInvocable/content/digest against reference. Preserve the FULL JSON definition, including optional native path/resourceBase/metadata. Use existing canonicalJson and JSON parsing for a stable detached value; reject nonserializable input. Body must be string within16384 UTF-8 bytes. Do not require a new runtime schema or strip fields to make the reviewed digest match. Native structural fields (description/source/invocation booleans) must be correctly typed. No new cap smaller than existing overall96KiB material limit. SourceUse exact3keys, valid digest/status, nonblank rationale <=4096 UTF-8 bytes/no NUL. Export these types/parsers via index.ts.
- [ ] Extend ConversationGuidanceRecord, parsing, existing(), validate() and apply() within their existing owners. Source-read record exact5keys above, definition bound to parsed reference. SourceReference scope must equal opened.scopeKey. Only after opened, before any exploration/candidate/decision/stop; one immutable slot. Reserve selectionProof.sessionId in existing global nativeSessions. Reject reuse across selection/proposals/arms/reviews/studies. Compute read identity with sha256(record) where needed; do not add a self-referential redundant digest field.
- [ ] Candidate with sourceReference must carry sourceUse whose readDigest is sha256(sourceReference); no sourceReference => sourceUse forbidden. Preserve old candidate shape when absent. Both statuses permit evaluation, neither skips formal arms/thresholds. A source read may precede exploration; after exploration starts, reading a source is forbidden. Insufficient-evidence can stop after read and must use an independent completed proof under existing rules.
- [ ] Extend existing mutation-only current quality gate to source-read and candidates whose study has a sourceReference. Extend chronological consent/support/current-parent validation for these mutations in the existing shared ledger validator. Current configuration/environment-source permission remains host-owned; pure records do not authorize reads. Preserve exact duplicate idempotency before current guards and historical replay after quality changes. Do not put today's quality check in historical replay (previous Task2 bug is already fixed).
- [ ] Add explicit tests, extending current fixtures with correctly recomputed natural scope/opening identity: valid read→candidate adapted/not-used→unchanged10arm decision; read→existing exploration→candidate; missing/extra field/hash/provider/body tamper/overlimit/nonserializable; cross-scope/unknown study; read after exploration/candidate/stop; one read replacement and exact duplicates; used without read/missing declaration/wrong readDigest; selection proof reuse within/across studies; actual support withdrawal, disabled consent, enabled revision mismatch, stale parent and historical quality mutation rejection. Use actual disk replay for historical source records, retaining frozen history and no new events. Do not let parser-invalid fixtures stand in for state/authority binding checks.
- [ ] GREEN scope: `exec vitest run tests/dsh-migration/conversation-skill-source.spec.ts tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts tests/dsh-migration/learning-skill-reuse.spec.ts`; `--filter @tianwen/evolution typecheck`. Legacy source suite regression validates extracted common identity without changing runtime behavior. Record exact output and git diff --check.
- [ ] Self-review; commit only owned files/report; return exact SHA, RED/GREEN and uncovered promises. This is a source contract/ledger checkpoint, not connected runtime or real source use.

## Task 2: Native registry selection, bounded proposal and recovery

Ownership: `packages/tianwen-runtime-bundle/src/learning-skill-reuse.ts`, `packages/tianwen-runtime-bundle/src/conversation-judgment.ts`, `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`, `packages/tianwen-runtime-bundle/src/runtime.ts`, `tests/dsh-migration/learning-skill-reuse.spec.ts`, `tests/dsh-migration/conversation-judgment.spec.ts`, `tests/dsh-migration/conversation-guidance-loop.spec.ts`, and report. You are not alone; preserve other edits. Depends on reviewed Task1. No domain/ledger edits without reporting the exact need.

**Interfaces:** consume Task1 types/parsers/record. Add Runtime config `conversationSkillSources?: readonly ConversationSkillAdmission[]`; pass with the same explicit `config.evolutionRoot` to guidance service config `{evolutionRoot?: string, skillSources?: readonly ConversationSkillAdmission[]}`. No fallback transfer from learningSkillSources. Service validates an explicit absolute root before using sources; when absent, no source discovery. DSH applyCore already rejects explicit relative roots. Do not read nonexistent service config/root properties or change the core default root algorithm.

Registry helpers live alongside existing helper, not a new service:

```ts
interface ConversationSkillOffer {
  readonly reference: ConversationSkillAdmission
  readonly description: string
  readonly whenToUse?: string
}
// Options are actual SkillViewOptions {cwd: agent.session.header.cwd, scope: agent, signal}.
listConversationSkillReferences(registry, admissions, scopeKey, environmentDigest, options)
// => Promise<{complete:boolean, skills: readonly ConversationSkillOffer[]}>
readConversationSkillReference(registry, selected: ConversationSkillOffer, options)
// => Promise<Readonly<Record<string, unknown>>>; rejects drift/unavailable.
```

- [ ] RED first: tests for no admission/wrong scope/wrong environment => zero snapshot/get; valid list => snapshot only; selected source => one get exact complete definition; partial catalog, duplicate admission names, provider/modelInvocable mismatch, changed digest or >16KiB body rejected. Use native SkillRegistry or narrow registry fixtures in the current source suite. No network.
- [ ] Reuse old reference/definition identity checks in a small shared helper only where behavior is identical. Preserve old inspectLearningSkills semantics (including its legacy list-time definition checks) and hasLearningSkillObservation native tool-call/result meaning. New list must prefilter parsed exact scope/environment/purpose and ambiguous names BEFORE snapshot; zero eligible => {complete:true,skills:[]}. Do not get bodies at list time. Native incomplete catalog is unavailable, not an authoritative empty list. Selected name/provider must match its frozen offer and actual complete definition; parse Task1 definition and preserve all bytes/fields.
- [ ] Extend conversationProposalSchema with a backwards-compatible optional third options argument `{sourceNames?: readonly string[], sourceReadDigest?: Sha256Digest}`. Initial allowExploration=true may include inspectSource enum from offered names. Subsequent proposals omit inspectSource. If a sourceReadDigest exists, sourceUse object is available with fixed digest enum, adapted/not-used and rationale; host requires it only alongside guidance. Native schema retains object root/optional closed properties; no type+oneOf root, minProperties/maxProperties or new tools.
- [ ] Host choice parsing still requires one decision key. Without source read, sourceUse forbidden. With read, guidance requires exact sourceUse; exploration/insufficient must not carry it. sourceUse alone/mixed decisions/blank strings/wrong digest/second inspection are invalid. Existing direct guidance and no-source request count/material remain unchanged.
- [ ] After opened study and assertCurrent, list only exact current admissions. Add sourceCatalog only when nonempty; it carries metadata/reference, not definitions. Initial proposer may select inspectSource or existing direct/exploration/insufficient. Prompt says optional reference, untrusted data, no predicted usefulness or permission changes. A real completed selectionProof is required before body read.
- [ ] On inspectSource: require exact frozen offer; assert current study plus currently loaded admission before and after get; record source-reference-read before another model call. A duplicate record returns without continuation. Read at most one definition. Current admission is checked by exact reference hash against loaded config and computed explicit environment digest; inspect step also validates admitted scope. The runtime instance's config is fixed until reload; disposal already aborts old work.
- [ ] Use explicit bounded sequence, not a generalized loop: initial proposal; optional source read→new proposal; optional existing exploration→new final proposal. After source read, every later proposal material includes exactly `{readDigest:sha256(record),reference,definition}` under sourceReference; actual sources/studyId/currentGuidance remain unchanged. Exploration observation is added separately. No inspector after exploration; no second source or exploration. Always retain existing insufficient/safe-stop exits. Source body never reaches cases/workers/reviews/quotes.
- [ ] Record candidate sourceUse from captured final response only; verify before append its exact read binding and current source admission. Existing formal trials/activation remain, with source authority also checked at current boundaries while the study is pending. Native/config/source failures stop without fallback selection/retry.
- [ ] Extract existing native session/request/capture verification into `recoverConversationStructuredJudgment(ctx, proof, expectedValue)` in conversation-judgment.ts returning `{instruction,material,modelConfigDigests}`. Reuse its descriptor/one turn/lineage/hash/exact successful structured capture/request digest/header checks. Existing recoverConversationJudgmentRequest(reviewCheck) remains public and delegates with its original stripped review value; do not fabricate review checks for proposals. Preserve existing verifyConversationReviewCheck API. No new persistence service.
- [ ] Accepted pending recovery with sourceReference validates current admission without snapshot/get, exact source definition/record digest, actual selection proof/captured `{inspectSource:name}` and initial request's matching studyId/sourceTaskIds/offered reference. Validate final candidate proof/captured `{guidance,sourceUse}` and actual request's matching sourceReference plus studyId/sourceTaskIds; every native header digest must equal opened.modelConfigDigest. Keep existing exploration/formal proofs and review audits; assertCurrent before activation. Missing/replaced native selection/proposal/body/declaration/current admission refuses activation with zero model/registry calls. Undecided source studies still cancel on initialization with no read/retry. Do not add rollback solely because a source configuration was removed AFTER legitimate activation; the adapted text no longer requires source reads and existing rollback rules govern it.
- [ ] Extend current native integration scenario table with normal user events reaching source selection (no manual study triggering in main scenario): adapted, not-used, insufficient after read, source then explored, outside/second source rejected, invalid sourceUse, actual consent/support invalidation during get and before candidate, one read interrupted then reinitialized, accepted intact zero-call recovery and genuine native but substituted source proposal rejection. Capture payloads to prove source body only in relevant proposals and raw attributed feedback remains exact at all existing consumers. Check actual native selection/final proof independence and source slot separate from exploration2/formal10. No-source current48call direct and55call explored baselines remain (existing harness including future user turn); source selection adds only one proposal in corresponding successful scenario.
- [ ] GREEN scope: `--filter @tianwen/runtime-bundle typecheck`; `exec vitest run tests/dsh-migration/learning-skill-reuse.spec.ts tests/dsh-migration/conversation-judgment.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts tests/dsh-migration/learning-exploration.spec.ts`. Confirm runtime config wiring in a focused existing harness assertion; do not introduce a fake alternate production entry just to test it. Record RED, GREEN, actual output and limitations, then self-review and commit owned files/report only.

## Completion boundary

Task gates are code/integration evidence, not natural occurrence or stable improvement. After both reviewed tasks, perform one whole-branch final review/validation at the stable exact candidate, with previous review receipts as context. Then prepare only required new-connection real-model checks; do not restart old cohorts. Actual external reference use needs explicit authority for that exact environment/source and is not supplied by these implementation notes. No merge/CI/Daily outcome is claimed in this plan.
