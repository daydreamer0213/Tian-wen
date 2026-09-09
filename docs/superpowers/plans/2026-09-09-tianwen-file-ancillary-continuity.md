# Ordinary File Ancillary Continuity Implementation Plan

Status: Task1 complete/review clean at0c112af, focused36/36 and state17/17
GREEN plus Evolution tsc. Task2 complete/review clean ataefca18:11selected
GREEN plus real-loader fix1GREEN and unchanged typecheck/build. Task3 complete/
review clean atb228543: original69 covering + prior212 regressions, then fix1
60native/observer and7config/export checks, typecheck/build. Default environment
and consent-disposal findings both closed. Task4 ordinary startup next. Producer task
review closed atfe84013. Pure v1 compatibility reviewed; native
registration-time provenance mechanism passed a focused in-memory probe.
Use a derived ToolRuntime, not late tool wrappers or a new standard preset.
Ordinary Desktop startup will use public native configuration composition and
the native CLI's final overlay boundary;
that configuration preparation still requires its own product gate. See the native observation research
notes for rejected alternatives and the exact supported seams.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let certified native discovery and an approved method coexist with
ordinary file learning, without changing the task or leaking its answer into trials.

**Architecture:** Preserve existing v1 file snapshots and trial receipts. Add
bounded host ancillary records, independently rebind them to native history,
and project only verified source locations and approved method definitions to
the existing worker material. A derived native ToolRuntime observes original
registrations; tools, prompts, preset identity and permissions remain native.
An ordinary Desktop startup adapter preserves startup raw native configuration while
selecting the two observation services through a final temporary CLI overlay.

**Tech Stack:** Existing Evolution ledger, Cordis, Node22, DSH0.1.1-rc.2, Vitest,
and the preceding opt-in native directory producer. No third-party library.

## Global Constraints

- Work only in D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge on codex/conversation-claim-evidence.
- Follow docs/superpowers/specs/2026-09-09-tianwen-native-tool-observation-design.md; producer implementation must pass its task review before this plan starts.
- Daily022, its shortcut and frozen023 candidate/native-use stay untouched. Old failures and v1 digests are never rewritten.
- Keep 8 files/32768 UTF-8 content bytes and the existing96 KiB model material limit. No change to study thresholds, quality contract or activation/rollback policy.
- Host ancillary limits: at most16 records per task,65536 serialized UTF-8 bytes per record,256 glob paths or grep matches per record. Worker ancillary context at most24576 UTF-8 bytes; reject overflow, never silently truncate.
- New native fixtures and generated data go to E:/待清理/D盘迁移-2026-09-08/Tianwen-本地文件学习-023/consumer-tests, not C: or frozen native-use.
- No ordinary task restrictions, scripted acceptance answers, arbitrary Shell permission, shared dependency edits, model calls, push/merge/release or Daily installation in these feature/preparation tasks.
- DSH still executes and presents all tools. Unknown effects/receipts make learning unavailable, not the original task. Use apply_patch and preserve concurrent root docs.

### Task 1: Add bounded optional ancillary records and deterministic worker context

**Files:**
- Create: `packages/tianwen-evolution/src/conversation-file-ancillary.ts`.
- Modify: `packages/tianwen-evolution/src/conversation-learning.ts`, `packages/tianwen-evolution/src/index.ts`.
- Create: `tests/dsh-migration/conversation-file-ancillary.spec.ts`.
- Modify: `tests/dsh-migration/conversation-file-learning.spec.ts` for precise old-file compatibility assertions only.

**Interfaces:** Export the following contracts/functions from Evolution. Native
proof JSON stays host-side; Evolution must not import a Runtime module. Runtime
independently parses the pwsh receipt during capture and recovery.

```ts
export interface ConversationAncillaryProducer {
  readonly package: '@deepseek-ai/dsh-tool-fs-search' | '@deepseek-ai/dsh-tool-skill' | '@deepseek-ai/dsh-tool-pwsh'
  readonly version: '0.1.1-rc.2'
  readonly adapter: 'tianwen.file-ancillary.v1'
}
export type ConversationAncillaryPayload =
  | { readonly tool: 'glob'; readonly root: string; readonly paths: readonly string[] }
  | { readonly tool: 'grep'; readonly matches: readonly { readonly path: string; readonly lineNumber: number; readonly line: string }[] }
  | { readonly tool: 'skill'; readonly reference: ConversationSkillAdmission; readonly definition: Readonly<Record<string, unknown>> }
  | { readonly tool: 'pwsh'; readonly nativeReceiptJson: string; readonly nativeValueJson: string }
export interface ConversationTaskFileAncillary {
  readonly kind: 'task-file-ancillary-captured'
  readonly taskId: string
  readonly callId: string
  readonly callSeq: number
  readonly resultSeq: number
  readonly argumentsDigest: Sha256Digest
  readonly resultDigest: Sha256Digest
  readonly valueDigest: Sha256Digest
  readonly producer: ConversationAncillaryProducer
  readonly payload: ConversationAncillaryPayload
}
export interface ConversationFileAncillaryContext {
  readonly schemaVersion: 'tianwen.file-ancillary-context.v1'
  readonly methods: readonly { readonly reference: ConversationSkillAdmission; readonly definition: Readonly<Record<string, unknown>> }[]
  readonly positiveLocations: readonly { readonly path: string; readonly inputDigest: Sha256Digest; readonly lines: readonly number[] }[]
}
export function parseConversationTaskFileAncillary(value: unknown): ConversationTaskFileAncillary
export function parseConversationFileAncillaryContext(value: unknown, entries: readonly ConversationFileEntry[]): ConversationFileAncillaryContext
export function projectConversationFileAncillaryContext(records: readonly ConversationTaskFileAncillary[], entries: readonly ConversationFileEntry[]): ConversationFileAncillaryContext | undefined
```

The record's `resultDigest` hashes the complete matching persisted native
tool/result event. `valueDigest` hashes the actual final ToolExecutionResult.value,
not payload (skill payload includes host reference/definition instead of just
the smaller native result). Runtime validates that link; this pure parser
does not pretend persisted native output alone contains the canonical value.
Pwsh JSON must be bounded valid canonical JSON objects, not an executable string;
strict producer parsing and comparison to actual native value belong to Task3.

- [ ] **Step 1: Write RED for strict records and legacy compatibility.**

```ts
it('does not change old file identity without ancillary context', () => {
  expect(guidanceInputDigest(request, files)).toBe(sha256({ request: normalizedRequest, files }))
  expect(projectConversationFileAncillaryContext([], files.entries)).toBeUndefined()
})
it('does not give directory receipts to a worker', () => {
  expect(projectConversationFileAncillaryContext([globRecord, pwshRecord], files.entries)).toBeUndefined()
})
```

Use fixed small typed fixtures in the test file, not saved original acceptance
answers. Additional cases: exact-key rejection; wrong producer/tool pairing;
record/count/byte bounds; duplicate call IDs or call/result identities; post-
completion appends; non-local-files admission; invalid UTF-8/path/line; positive
grep lines re-derived from the complete input; method definition digest drift;
no blank optional context; absent fields preserve full old serialized tasks.

- [ ] **Step 2: Run focused RED directly and preserve the failure.**

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run tests/dsh-migration/conversation-file-ancillary.spec.ts tests/dsh-migration/conversation-file-learning.spec.ts
```

- [ ] **Step 3: Implement pure records/state without changing old v1 shapes.**

```ts
// Add to the existing union and optional task projection, not a new ledger:
type AddedRecord = ConversationTaskFileAncillary
type AddedTaskField = { readonly fileAncillary?: readonly AddedRecord[] }
// Optional context only when necessary:
return methods.length === 0 && positiveLocations.length === 0 ? undefined :
  parseConversationFileAncillaryContext({ schemaVersion: 'tianwen.file-ancillary-context.v1', methods, positiveLocations }, entries)
```

Reuse existing skill admission/whole-definition validators, file path rules and
canonical SHA helpers; do not duplicate those validators. Validate individual
relative metadata paths through a single-entry parseConversationFileEntries
call, then enforce collection duplicate/case-alias/ancestor consistency without
passing256 paths into the8-file parser or relaxing its old limit. Glob root is
an absolute host directory field, not a file entry; Runtime rechecks containment.
Keep glob/pwsh host
proofs out of worker context. Grep projection is deterministic, deduplicated
path+positive-line locations with `inputDigest=sha256({path,content})`; it contains
no query/pattern/result prose. Validate every match line exactly from the complete
preimage, respecting CRLF/LF line endings and native lineNumber semantics.
Skill context contains only exact admitted definition/reference, never tool-call
arguments or original answer. Native provider result is verified in Task3.

Keep `guidanceInputDigest(request, files)` unchanged. The same original request
and file material must remain one input even if method/query context differs;
optional context changes materialDigest/workerMaterialDigest, not source
independence. Add a test that different method context cannot turn the same
request/file material into source1 and source2.

State requires local-files admission, no completion/unavailable, source boundary
before callSeq and callSeq<resultSeq. Bound aggregate count/bytes, require distinct
call IDs and event sequences across fileInputs and fileAncillary, not just within
one collection; callSeq/resultSeq may not cross-occupy the same native event.
Add the new kind explicitly to existing/validate/apply, not the review fallback.
For skill require reference.scopeKey===task.source.scopeKey; current configured
admission/environment checks remain Runtime's responsibility. Preserve append
history. Grep records require existing
non-null captured inputs with earlier capture callSeq; the stronger successful
read/mutation/dispatch ordering is checked from native events by Task3. Finished
file captures require every ancillary resultSeq<=captureSeq. History without
ancillary retains the same object keys and digests, including old guidance input
digests and unchanged v1 file/result/trial-receipt parsing.

- [ ] **Step 4: Run focused GREEN and Evolution typecheck; self-review/commit.**

Use the RED command, plus the existing installed TypeScript build for the
Evolution package. No historical full-suite/model replay. Stage only owned
files and commit `feat: retain bounded file ancillary evidence`.
Report exact interfaces, RED/GREEN results, compatibility checks and concerns.

### Task 2: Observe original native tool registrations without replacing tools

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/native-tools-observer.ts`.
- Modify: `packages/tianwen-runtime-bundle/package.json`, `pnpm-lock.yaml` (only installed native peers actually imported and this public entry/build).
- Create: `tests/dsh-migration/native-tools-observer.spec.ts`.
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts` for exact new exports/dependencies only.

**Public seam:** Derive from installed `ToolRuntime`, override its public
`register`, and invoke `super.register` unchanged. Cordis traces `this.ctx` to
the registering plugin. Compare `this.ctx.fiber.runtime.callback` with
`this.ctx.registry.resolve(actualImportedNativeModule)`; this callback is the
public plugin identity key, not a name heuristic. Native plugin/source imports
must stay external in the built entry to preserve actual module identity.

**Interface:** Export named/default `NativeObservedToolRuntime` and:

```ts
export interface NativeToolRegistrationProducer {
  readonly package: '@deepseek-ai/dsh-tool-fs-search' | '@deepseek-ai/dsh-tool-skill' | '@deepseek-ai/dsh-tool-pwsh'
  readonly version: '0.1.1-rc.2'
  readonly adapter: 'tianwen.file-ancillary.v1'
}
// Public additional method on the derived service; returns only serializable
// producer identity after original reference/registration checks succeed.
nativeRegistration(definition: ToolDefinition): NativeToolRegistrationProducer | undefined
```

Consumers first obtain the actual scoped `tools.get(exec.name,exec.agent)`
winner. Query the optional observation method without cross-bundle instanceof
assumptions; unobserved runtimes simply supply no certificate. Keep the reference,
origin fiber and executable/finalizer/presentation references privately, with
the schema digest. Ambiguous/reused/mutated definitions are not certified. Do
not write methods onto an existing service, replace tools.register dynamically,
re-register definitions, modify tools or mount standard plugins again.

- [ ] **Step 1: Write RED using actual native registration and scope behavior.**

Reuse the small mechanism source under the approved E `consumer-tools-probe`
directory as supporting evidence, not product code. Product tests must mount
the new class and actual native fs-search, skill and pwsh plugins. Cover a
global native layer, two independent native scopes, an existing same-name
shadow, restrictions, plugin disposal, individual/idempotent disposer, failure
from parent registration, changed function/schema and ambiguous registrations.
Compare stock/observed complete declarations and untouched function references.
Test that observation exceptions cannot change the parent's result/error.

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run tests/dsh-migration/native-tools-observer.spec.ts
```

- [ ] **Step 2: Implement only the proper derived service and public export.**

Use the installed native parent's name/Config/defaults/injections/lifecycle.
Preserve super's disposer by exact reference; certificate bookkeeping must not
alter native registration/disposal. No metadata is serialized to a task here.
Track only successful native registrations at their original scope; root,
anonymous, custom or different module copies remain ordinary but unconfirmed.
No global singleton, private fiber reflection or function-text matching.

- [ ] **Step 3: Run focused GREEN, typecheck/build, explicit native composition.**

Verify the separately bundled provider through its public export, preserve
entry config/disabled/inject in an explicit composition, and check native
search result execution once on a new tiny E fixture. No model call. Confirm
one ToolRuntime, no duplicated catalog/handlers, scoped shadows remain visible
and restrictions still act. Native skill/pwsh registration identity must be
exercised, not inferred only from the earlier fs-search probe. No static patch
activation; ordinary launch wiring is Task4.

- [ ] **Step 4: Self-review and commit explicit owned files.**

Commit `feat: observe native tool registration provenance`. Report exact API,
RED/GREEN, native vs unit scope and any missing configuration semantics.

### Task 3: Bind actual native tools through capture, recovery and independent trials

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/conversation-file-ancillary.ts` (native observation/persisted verification only).
- Modify: `packages/tianwen-runtime-bundle/src/runtime.ts` (pass existing approved skill sources to the file observer).
- Modify: `conversation-file-observer.ts`, `conversation-task-material.ts`, `conversation-file-trial.ts`, `conversation-guidance-loop.ts` within that src directory.
- Modify: `conversation-claim-review.ts` only if a conditional ancillary authority instruction is needed; preserve historical no-context requests.
- Create: `tests/dsh-migration/conversation-file-ancillary-runtime.spec.ts`.
- Modify: `packages/tianwen-evolution/src/conversation-file-ancillary.ts` and its `conversation-file-ancillary.spec.ts` only for the confirmed leading-BOM comparison and optional glob/grep raw-value preservation described below.
- Modify: existing `conversation-file-observer.spec.ts`, `conversation-file-trial.spec.ts`, `conversation-guidance-loop.spec.ts`, `conversation-claim-review.spec.ts`, `runtime-bundle.spec.ts` for the affected integration contract.

**Inputs:** Task1 exact public contracts, Task2 native-registration method,
existing file preimage/result contracts, and the completed preceding producer's
`TianwenNativeToolObservationService.capture(identity,next)` returning original
result and optional strict NativeDirectoryReceipt. Read that producer report's
exact exported interface; do not reconstruct a different receipt schema.

**Outputs:** Optional `ancillaryContext` on ConversationTaskMaterial and on the
source branch of ConversationFileTrialMaterial. Historical absent context is
omitted, not `undefined` serialized as a field or an empty object. Recovery must
produce the same deterministic context; digests include it only when present.

Native nested-path integration exposed another representation seam: fs-search
can return backslash paths and retains relative root spelling, while the host's
payload paths are canonical forward-slash paths. Normalization must not alter
the actual native valueDigest or reject legitimate nested paths. Extend only
the glob/grep payload alternatives with `readonly nativeValueJson?: string`.
Reuse the existing canonical-object JSON validator used by pwsh. New captures
store the actual final raw value there and separately derive normalized payload
paths. Its bytes count toward the existing record limit; no separate budget,
truncation, new envelope, or file/result/trial v1 change. Old absent-field records
retain exact shape/digests and the old verifiable recovery path; no backfill.

- [ ] **Step 1: Write integration RED using real native tools and fixed model responses.**

```ts
it('accounts for native directory discovery before a real file read', async () => {
  const task = await runNativeAncillaryTask(['glob', 'pwsh', 'read'])
  expect(task.completion?.files?.outputKind).toBe('chat')
  expect(task.fileUnavailable).toBeUndefined()
  const recovered = await recoverConversationTaskMaterial(ctx, task)
  expect(recovered.files?.entries).toEqual(originalEntries)
  expect(recovered.ancillaryContext).toBeUndefined()
})
it('keeps query and original answer out of file trials', async () => {
  const trial = await runBoundFileTrialWithPositiveGrepAndMethod()
  expect(trial.sentMaterial.ancillaryContext.positiveLocations).toEqual(expectedLocations)
  expect(JSON.stringify(trial.sentMaterial)).not.toContain(queryCanary)
  expect(JSON.stringify(trial.sentMaterial)).not.toContain(originalAnswerCanary)
})
```

Implement the two test-local harness helpers using existing mountPersistentHarness,
actual native tool plugins and existing runConversationFileTrial. These are
engineering tests and must never be labelled real model acceptance. Add cases
for scoped same-name shadows; tampered native call/result/canonical payload;
partial/late/duplicate pending receipt; consent withdrawal; glob/read parallel;
successful read.result strictly before grep.call; simultaneous read/grep refusal;
write/edit call before or overlapping grep even if failed; valid method exact
admission/provider/body; unknown skill; no context leakage from command, grep
pattern, description, post-write output; cold recovery with zero new model calls.

- [ ] **Step 2: Run RED directly.**

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run tests/dsh-migration/conversation-file-ancillary-runtime.spec.ts tests/dsh-migration/conversation-file-observer.spec.ts tests/dsh-migration/conversation-file-trial.spec.ts
```

- [ ] **Step 3: Retain real native definitions and canonical results.**

Use Task2's original registration proof for the actual scoped winner. Bind
definitions by reference and preserved callable/schema identity, not names,
schema coincidence, preset headers or invented registration IDs. Recheck the
same winner/proof after execution; missing, changed or ambiguous registrations
refuse the ancillary receipt without altering the call. Keep the native
standard preset and original native tool plugins untouched. No pre-step tool
replacement or static host patch can stand in for this registration evidence.

The capture helper checks actual scoped identity at dispatch/result and binds
top-level native call IDs/arguments plus exec.token. The tools/execute next()
return is not final: native post-execute, cancellation and finalizeContent still
follow it. Use a synchronous tools/result listener to retain the frozen final
canonical result.value and its content/isError/error.info/meta projection;
native emit does not await async listeners. Recheck the winner/proof there.
At freeze, match the appended tool/result by source.callId,
sourceEventSeqs[0]===callSeq and turn/step, verify its final projection and store
the complete event digest separately from valueDigest. No finalizer/presentation
wrapper. See the final-result seam section in the native observation research.
Pwsh requires a strict directory receipt, exact task/session/call identity,
command/workdir/settings binding and nativeResultDigest matching foreground
value with the native-added kind field removed. Unknown/background/noncertified
calls invalidate this task's file evidence and continue the normal task.

The receipt's executionSettingsDigest is a producer-witnessed opaque digest of
the actual native execution spec/config, not independently reconstructable from
Session history. Require this capture's strict receipt, validate its digest
format and preserve its canonical bytes. Independently check available identity,
command/workspace/interpreter fields, qualification/frames and final native value
binding. Recovery rebinds the persisted events but must not claim they alone prove
the raw settings. Do not expose settings, recreate shell configuration or expand
the completed producer solely to recompute this field; the existing trusted-host
record boundary applies.

Glob root/returned paths must resolve within the task workspace. Grep match
paths must be previously read complete inputs and all returned lines validate;
raw native overflow/error and Tianwen bounds are refused. Skill requires current
configured ConversationSkillAdmission with exact scope/environment, a whole
definition matching its digest, and actual native name/provider/content/resourceBase
matching that frozen definition. Native skill loads text only; it does not
authorize later script/tool effects. Pass existing conversationSkillSources to
the file observer; do not add new sources or global roots.

"Complete inputs" means the existing host-captured complete first-access UTF-8
preimages, not that the native read presented every line to the model in one call.
A successful partial/offset read with a complete host preimage, followed by a
grep of unchanged content outside that read slice, is valid. Add that positive
case; do not create a model-facing full-read requirement. Missing/incomplete
host preimages, unsuccessful reads and ordering/mutation failures still refuse.
Likewise, the installed native search tools can be exclusive barriers: a shared
model batch can still yield ordered read.result before grep.call. Test the actual
persisted sequence relationship, not a batch label; use bounded rebind adversaries
for genuinely invalid simultaneous boundaries where native scheduling serializes.

For glob/grep, validate raw value shape and containment before normalization.
Preserve relative root spelling under the native parseGlobArgs/toWorkdirRelative
semantics when binding call/root identity; equivalent separators are not escapes.
Recovery checks nativeValueJson's valueDigest and normalized payload equality
alongside existing native event/producer/call binding. Keep realpath/symlink and
traversal checks intact. Never expose nativeValueJson to worker context. Native
presentation metadata/text can be sampled or truncated, so do not reconstruct
the complete native value from those display projections or add a new rejection
solely because a complete captured value had a bounded UI preview.

Cover actual nested backslash glob/grep results, relative root spelling,
raw/payload mismatch, old no-raw-field compatibility and raw JSON exclusion from
trial material. These checks address the new42/43 integration failure; rerun
the affected ancillary/pure files and build/typecheck, not the unchanged212-case
regression merely for this representation fix.

- [ ] **Step 4: Integrate capture/freeze/recovery and the existing trial path.**

Preserve read/write/edit first-access capture and no task serialization. Track
each ancillary call separately. At agent/turn-stopping, all native results and
producer terminal/EOF must be complete within captureSeq before appending the
corresponding bounded host records. Native append is initially in-memory;
await the public ctx.sessions.flush(agent.session) before new ancillary ledger
appends and require true (a durability listener participated). Add the sessions
injection to the file observer. Flush error/no listener makes evidence unavailable,
not an original tool error. Check consent again before every append.
Stopping can be steered into another step: keep repeated freezes/record writes
idempotent and reject stale/incomplete capture boundaries on final recovery.
Cover post/finalizer errors, skipped cancelled calls without tools/result,
async-listener lateness, repeated stopping and flush failure with focused tests.

Native integration check376664 confirmed bundled rg strips a UTF-8 BOM at the
start of input before returning grep's first line; Task1's pure splitter retains
it and would incorrectly reject that match. Add focused RED then the narrow line
comparison correction plus one actual native file grep regression. Never strip
or normalize stored original content or inputDigest; non-leading U+FEFF remains
ordinary line content. The report must distinguish this integration fix from
Task1's already closed original contract gate. Evidence is in the feasibility
note's Native grep UTF-8 BOM section; do not rerun the stdin probe.
Every task tool call must be either accounted-for native file access or a
validated ancillary receipt. Missing, unmatched, duplicate, revoked or late data
leaves no file result; never backfill by rereading after the task.

Recovery checks exact native span/terminal and existing first-preimage contract,
then each ancillary callSeq/resultSeq/ID/arguments/event digest and payload
producer linkage. Grep additionally requires read.result.seq<grep.call.seq
and no same-path write/edit CALL through grep.result.seq. Project context only
after all proof checks pass. No raw native proof/pattern/command/output enters
worker material. Directory receipts need no worker projection.

```ts
const optional = ancillaryContext === undefined ? {} : { ancillaryContext }
// source task and source trial inputs preserve absent keys:
return { request, context, files, ...optional }
// Source independence still uses only the existing request/file identity:
guidanceInputDigest(requestText, files)
```

Propagate to both new and recovered formal/exploration file trials in the
existing guidance loop. Keep generated cases unchanged. Existing worker
material/request digests bind it. Seed only preimage entries, never outputs.
Explain optional method context as untrusted method reference and positive
locations as navigation only; do not give it factual source IDs or put it in
conversationEvidenceTexts. Keep historical no-context instructions/digests exact.

- [ ] **Step 5: Run affected GREEN and native packaging checks once on final code.**

Run the RED command plus the affected pure ancillary, guidance-loop, claim-review
and runtime-bundle tests and this task's actual native pwsh consumer-binding case.
Reuse the closed unchanged producer core gate; do not repeat its full suite solely
for a new consumer commit. Run Evolution/Runtime typechecks
and runtime build/export/patch checks with installed tools. Confirm same native
tool declarations/results without capture and one shell provider in the normal
composition. Report exact successes, failures and skipped cases, not a vague
full-suite claim. No old full Python/model cohort rerun for these TS-only changes.

- [ ] **Step 6: Self-review, commit and hand off the new real-use gate.**

Commit explicit owned files as `feat: retain ordinary native file learning continuity`.
Report native registration/closure/restore tests, no-answer-leakage evidence,
old-v1 compatibility, public context shape and any unsupported ordinary cases.
Root performs task review, then proceeds to ordinary startup wiring below.
No model scenario is added merely to trigger adoption.

### Task 4: Wire observation into ordinary Desktop Web startup

**Files:**
- Create: `packages/tianwen-desktop-host/src/native-observation-launch.ts`.
- Modify: `packages/tianwen-desktop-host/src/host.ts`, `packages/tianwen-desktop-host/package.json` (include the new built helper).
- Modify: `scripts/audit-desktop-artifact.mjs` only to add the new helper to the current B2 resource allowlist; preserve the historical B1 set and current version until Task5.
- Create: `tests/dsh-migration/tianwen-native-observation-launch.spec.ts`.
- Modify: `tests/dsh-migration/tianwen-desktop-host.spec.ts`, `tianwen-desktop-artifact.spec.ts`, and `runtime-bundle.spec.ts` only for changed packaging/startup expectations.
- Read: `docs/research/2026-09-09-tianwen-native-observation-startup.md`.

**Boundary:** This is the existing product Desktop entry, not an acceptance-only
launcher. Continue calling native `dsh web`; no boot fork or new native CLI.
The same helper must be usable by the fresh independent browser acceptance
through the existing exported `startDesktopWebHost`, without a special tool
composition. Direct native-bin launches remain stock; do not label them observed.

**Internal contract:** A small preparation helper accepts the already verified
DesktopTarget and the exact launch environment, plus injected process/temp
dependencies for tests. It returns an optional temporary patch path, a bounded
non-sensitive observed/stock preparation status and an idempotent cleanup.
It does not start a model, change user input, grant permissions or change the
default standard preset. Retain existing host process/readiness/stop ownership.

- [ ] **Step 1: Write RED for native composition, CLI overlay and cleanup.**

Use public path-resolution helpers and composeEntries from the exact installed
DSH after the existing profile-ready check; discover sources with bounded reads
and parse patches through the native entryListSchema. Do not call loadProfile
or its unbounded readers, run a dump subprocess or evaluate expressions in Desktop.
Bound aggregate source bytes before parsing to1MiB and never log them; this is
an input-byte limit, not a generic JavaScript/YAML heap guarantee.
Test final `web --patch path --host ...`. Preserve
raw `!!js`, config, disabled, inject, isolate/intercept and normal patch order.
Test profile/home/bundle/overlay drift, duplicate/custom/missing targets,
unrepresentable metadata, failed/oversize configuration input, skipped-name-guard warning,
shutdown and startup failure. Unsupported observation preparation must use stock
Web, never empty/default tools. No full profile or unrelated model/provider
configuration can reach a temporary patch, receipt, error or logger. Necessary
raw fields in the two selected rows are sensitive configuration, not diagnostic text.

Use new fixtures under the approved E consumer-tests root. Existing host tests
that must run also use this root for this task, not new D/C fixture folders.

- [ ] **Step 2: Implement only native configuration preparation.**

Resolve public app-boot resolveProfileDir/resolveBundleDir/composeEntries and
cordis-plugin-include.entryListSchema from the already verified installed DSH,
not another package copy. Mirror only the installed source-discovery loop:
read the existing web Profile manifest; resolve its declared bundles in order
with the native installation-first anchor order; read each bundle manifest's
dsh.bundle.patch and that patch; then the Profile patch and optional home patch.
Use bounded file reads (at most remaining budget plus one byte), not stat followed
by an unbounded read; reject incomplete/oversize/invalid input. Bind manifests,
patch bytes and absent optional sources, and use public composeEntries for the
actual patch algorithm. Parse patch lists with the native schema and its native
list/object shape checks. Never initialize or normalize a profile in this helper.
loadProfile reads/parses everything before returning and can initialize a missing
profile after a precheck, so it cannot meet these two helper guarantees. This
small discovery loop is not a replacement configuration manager or boot path.
Serialize the
narrow final YAML through the native schema; never execute
its expressions in Desktop. Exact target IDs/names must be unique top-level
`tools`/`@deepseek-ai/dsh-tools` and
`pwsh-sandbox`/`@deepseek-ai/dsh-pwsh-sandbox`. Preserve their final raw metadata
while disabling the exact originals with name guards and inserting unique
Tianwen names. Copy no unrelated rows. Accept only the native closed config
keys: tools mode/maxParallelSubCalls; pwsh cwd/timeoutMs/maxTimeoutMs/
maxOutputBytes/maxSpillBytes/graceMs/pwshPath. Preserve valid scalars and native
JsExpr nodes without evaluating or normalizing them. Unknown config keys or
outer keys outside id/name/config/group/disabled/inject/isolate/intercept make
observation preparation unavailable; a target must not be a group. Never drop
fields and then silently substitute defaults. Known metadata must roundtrip
losslessly through the native schema; otherwise use stock.

Both new classes inherit native Config/default/injection behavior. Do not
override user's cwd, interpreter, budgets, disabled gates or permissions. If
an input cannot be represented safely, clean preparation state and run stock
Web without an observation claim. Closed-key validation excludes unrelated
configuration, not arbitrary secret text embedded in legitimate paths,
expressions or dependency metadata. Treat necessary target-row contents as
sensitive: preserve privately only for this launch and never log/include them
in receipts or errors. Do not claim generic secret detection from field-name regexes.

Use a fresh small per-launch folder under the existing owned state directory
(E fixture root in tests), with private access appropriate to the native host.
Never use frozen023, user profile patches or a broad cleanup target. Bind/recheck
the exact DSH version and relevant manifest/bundle/profile/home/overlay bytes
before launch; the programmatic native preset-root/telemetry overlays do not
touch these two rows. Treat name-guard drift as observer startup failure before
handing a partially adapted host to the user. Preserve original task capability.

Direct composition does not need the CLI dump's derived cordis.yml rewrite.
The final native launch retains its normal derived-file preparation; do not
back up/rewrite user patch files or create a profile manager.
No new generic health/telemetry store is required: actual runtime registration
and directory receipts remain the execution-time proof. A selected row in a
configuration document alone is not proof that it ran.

Normal Web has live profile/home reload. The fixed final overlay deliberately
locks only these two host service rows to this process's startup snapshot;
manual edits to those rows take effect on Desktop restart. Do not claim full
live-reload equivalence for them. Other native rows/settings keep native behavior.
This bounded compatibility choice was disclosed to the owner; no new watcher,
automatic task interruption or reload scheduler is added. Add a regression that
same-process raw-row edits do not silently produce a new observation claim,
and the next launch recomposes the new configuration or falls back to stock.

- [ ] **Step 3: Integrate with the existing Desktop lifecycle and package it.**

Reuse identical verified target/environment for preparation and final launch.
Preserve all existing readiness, stop-tree and navigation boundaries. Cleanup
only the exact owned overlay/folder on failed preparation, start failure,
timeout, normal child exit and host stop; never leave a background helper.
Keep the overlay until child exit if native reload may still read it. Report
unsupported observation without promising file learning; ordinary Web still
works. No new user choice or repeated model-usage permission prompt.

Package the new `app/dist/native-observation-launch.js` helper in the current
B2 artifact and require it in that exact resource allowlist. The allowlist is
static (audit-desktop-artifact.mjs48-63), so changing package.json alone cannot
pass the existing artifact audit. Add a missing-helper rejection using the
existing B2 fixture; retain unknown-file rejection and the historical B1 layout.

- [ ] **Step 4: Run focused GREEN and the actual product startup gate.**

Run new preparation/affected host and packaging tests, Desktop typecheck/build,
plus a single native isolated startup through product startDesktopWebHost with
the two built runtime entries. Verify one native tools service/one pwsh service,
unchanged standard declarations, preserved explicit config/disabled metadata,
and actual native registration/directory receipt capability in that composition.
Use fixed model replies only for this engineering gate if a loop is necessary;
it is not real DeepSeek acceptance. Stop the owned process and verify temporary
cleanup. Do not modify Daily, old artifacts or old whole-suite results.

- [ ] **Step 5: Self-review and commit; hand off exact-candidate acceptance.**

Commit explicit owned files as `feat: wire native observation into desktop startup`.
Report stock fallback and observed behavior separately, exact native evidence,
residual risks, privacy/cleanup and packaging outputs. Root performs task review,
the candidate/CI coordination below, then one final new-delta integration review
before freezing a fresh E candidate for the already specified bounded real-use
increment. No adoption-seeking extra cohort.

### Task 5: Coordinate the distinct candidate identity and portable CI gates

**Files:**
- Modify active versions/archive names in `packages/tianwen-runtime-bundle/package.json`, `src/portable-profile.ts`, `src/controlled-lifecycle.ts` in that package; `packages/tianwen-desktop-host/package.json`, `src/host.ts`, `src/main.ts`, `src/locale.ts` in that package.
- Modify `scripts/install-tianwen.mjs`, `scripts/stage-desktop-runtime.mjs`, `scripts/audit-desktop-artifact.mjs`, `scripts/verify-dsh-profile.mjs`, `.github/workflows/ci.yml`.
- Modify `tests/contracts/test_public_repository_surface.py` and the exact current-version expectations in `tests/dsh-migration/runtime-bundle.spec.ts`, `controlled-lifecycle-command.spec.ts`, `controlled-lifecycle-profile.spec.ts`, `one-shot-profile-lifecycle.spec.ts`, `ordinary-long-goal-cli.spec.ts`, `portable-goal-cli.spec.ts`, `portable-profile-composition.e2e.spec.ts`, `portable-plugin-lifecycle.e2e.spec.ts`, `runtime-profile.spec.ts`, `tianwen-startup.e2e.spec.ts`, `tianwen-version-upgrade.e2e.spec.ts`, `tianwen-installer.spec.ts`, `tianwen-desktop-host.spec.ts`, `tianwen-desktop-profile-prepare.spec.ts`, `tianwen-desktop-artifact.spec.ts`, `tianwen-desktop-distribution.e2e.spec.ts`.
- Modify only native package resolution/test-root portability in `tests/dsh-migration/native-pwsh-observer.spec.ts`, `native-tools-observer.spec.ts`; use the same test-only override for any Task4 launch fixture that still needs it.
- Root owns status/research docs and candidate construction; do not modify frozen artifacts, runtime behavior or archived version claims in this task.

**Interface:** Existing published versions and CLI/archive names, no new runtime
API. Current Runtime becomes `0.1.24`; Desktop `0.1.0-preview.25` embeds exactly
`tianwen-runtime-bundle-0.1.24.tgz`. Existing supported old layouts retain their
exact matchers; only a genuine frozen023 predecessor is added. The four feature
tasks must pass their own scoped reviews before this coordination starts.

- [ ] **Step 1: Update existing version/CI contract expectations and record RED.**

Use the existing current-package assertions, not a second generic version store:

```ts
expect(runtimeManifest.version).toBe('0.1.24')
expect(desktopManifest.version).toBe('0.1.0-preview.25')
```

Apply those values in the existing tests' actual manifest variables and current
archive checks. Add023 to the appropriate existing predecessor table only after
checking frozen5a30f225142d462bfca52d503cc1883257aaecaf profile rendering; assert
the old supported versions remain accepted. Extend the existing exact Windows
CI membership assertions first and run only those changed cases to record the
missing version/new-test membership failures before changing production files.

- [ ] **Step 2: Synchronize active release identity and new test portability.**

Update the active version/archive sites listed above, keeping every historical
predecessor literal/test distinct. For the two native tests replace author-local
package lookup with the already verified repository resolver:

```ts
const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const base = process.env.TIANWEN_FILE_TEST_ROOT ?? join(tmpdir(), 'tianwen-native-tests')
```

Use suite-specific child directories and existing finally cleanup. Set the local
override to the approved E consumer-tests root. Set CI's override to a dedicated
runner.temp directory; preserve its existing D-drive setup for older tests.
Do not install dependencies or modify the shared package copies.

- [ ] **Step 3: Add the missing exact Windows CI membership.**

Append to the existing installer-windows Vitest command and corresponding public
surface assertions, in the same order:

```text
tests/dsh-migration/native-tool-observation.spec.ts
tests/dsh-migration/native-pwsh-observer.spec.ts
tests/dsh-migration/native-tools-observer.spec.ts
tests/dsh-migration/conversation-file-ancillary.spec.ts
tests/dsh-migration/conversation-file-ancillary-runtime.spec.ts
```

Append `tests/dsh-migration/tianwen-native-observation-launch.spec.ts` to the
existing desktop-windows deterministic command and its exact contract. Keep
Windows-owned native suites out of Ubuntu's test command. Update stage/audit
archive names together with the package manifests; do not silently skip new
native tests because a runner lacks the author's private directories.

- [ ] **Step 4: Run focused current-version/installer/Desktop/CI checks and build.**

Use installed Node/Vitest for the amended version/installer/Desktop/packaging
checks and the existing Python interpreter for the changed public-surface
contract. Run affected package typechecks/build. Reuse feature-task native
execution gates when their code and resolved module files are unchanged;
package collection/resolution checks cover the test-only path adjustment.
No historical model cohort, full installed023 upgrade or unchanged full Python
suite merely for a version bump. Record exact commands/results/skips, including
any environment-only failures rather than relabelling an earlier run green.

- [ ] **Step 5: Self-review, commit only owned files and hand off candidate freeze.**

Commit `chore: prepare native observation candidate and CI gates`. Report exact
024/preview25 coherence,023 predecessor authority, legacy preservation, changed
CI membership and portable fixture behavior. Root reviews this scoped change,
then performs the one final new-delta review, fresh E packaging/byte audit and
the already authorized bounded real-use increment. No release or Daily mutation
occurs in this preparation task.

**Retained coordination rationale and evidence:**

Before candidate freeze/merge, add the new native producer, provenance, ancillary
and startup tests to the appropriate Windows CI gates and update the matching
tests/contracts/test_public_repository_surface.py CI assertions. Existing CI
lists predate this increment and do not yet cover these files.

Make native-pwsh-observer.spec.ts and native-tools-observer.spec.ts resolve
packages through the repository's installed @deepseek-ai/dsh/package.json,
not the author's D-drive retest installation. Use TIANWEN_FILE_TEST_ROOT for
local E fixtures with a portable CI fallback, not a required E drive. Root
read-only check ce8641 established that the portable resolver and the previous
resolver select the same six installed native modules locally; this change
does not warrant repeating model or file-learning cohorts. Task3 uses the same
portable resolver/root convention in its owned tests. Required new CI coverage
and the exact-main CI gate remain mandatory before a Daily update.

The next distinct private candidate is Runtime0.1.24/Desktop0.1.0-preview.25.
This is routine monotonic version coordination under the owner's standing
delegation, not a new release approval. Coordinate active manifests, archive
names, strict current-version checks and their existing tests; do not overwrite
frozen023 or blindly replace historical predecessor/version fixtures. The
read-only candidate-ci-preflight.md in this plan's SDD workspace lists the exact
active sources. Verify frozen023's actual managed profile shape before adding
its predecessor matcher; current edited source is not frozen023 authority.

That read-only comparison is now closed: frozen5a30f225's renderProfilePatch
(installer194-237) and frozen learning-loop predecessor renderer(310-353) have
identical templates. Reuse that renderer for023, retaining exact version/archive/
receipt checks; no new matcher shape. Root checked installer tests1153-1212:
their migration/rollback table uses scriptedInstaller, not actual deployment.
Adding023 to that existing deterministic table is allowed and simpler than a
new recognition-only parallel table. Do not confuse these small unit fixtures
with an additional real installed-upgrade cohort; the latter is not required.

Preserve every existing predecessor including Daily022. The required real
upgrade is from the user's actual Daily022 baseline after all delivery gates;
new023 predecessor matching needs focused contract coverage, not automatically
another full installed-upgrade cohort. Add a separate actual upgrade scenario
only for a concrete unmet upgrade risk. Reuse the established Task5 delivery/
upgrade protocol in the local-file-learning plan and existing version-coherence
checks; this inventory is not authority to add redundant generic checks.
