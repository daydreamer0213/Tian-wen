# Natural Local File Learning Implementation Plan

> **For agentic workers:** Use executing-plans to implement task by task, with independently scoped investigation/review and test-first changes.

**Goal:** Let normal local-file work contribute verified evidence to the existing automatic learning path and evaluate changes through real replica file operations.

**Architecture:** Reuse native DSH file tools/Agents/persistence and the existing ConversationTask/GuidanceStudy ledger. Add bounded preimage/result capture and a file-trial adapter; preserve text and historical semantics.

**Tech Stack:** Existing TypeScript, Node 22, DSH 0.1.1-rc.2, Vitest. No new runtime dependency.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-09-tianwen-local-file-learning-design.md`.
- At most 8 files and 32768 UTF-8 content bytes per snapshot; unchanged 96 KiB model material cap.
- Only native read/write/edit replica tools; no shell/network or permission escalation.
- Capture actual approved tool targets, not model-guessed unrelated paths.
- Preserve user work, historical evidence, current quality requirements and existing acceptance thresholds.
- Work in the existing D worktree. Large acceptance artifacts go to the user's E migration area.
- Tests use existing installed Node/Vitest directly; do not allow pnpm's dependency health check to purge shared modules.

## Task 1: Bounded file material and replica primitives

Files: new `packages/tianwen-runtime-bundle/src/conversation-file-material.ts` and
`tests/dsh-migration/conversation-file-material.spec.ts`.

Interfaces:

```ts
export interface ConversationFileEntry { readonly path: string; readonly content: string | null }
export const CONVERSATION_FILE_MAX_COUNT = 8
export const CONVERSATION_FILE_MAX_BYTES = 32768
export function parseConversationFileEntries(value: unknown): readonly ConversationFileEntry[]
export function conversationFilePath(root: string, candidate: string): Promise<string>
export function readConversationFile(root: string, candidate: string): Promise<ConversationFileEntry>
export function seedConversationFiles(root: string, entries: readonly ConversationFileEntry[]): Promise<void>
```

`conversationFilePath` returns a canonical root-relative slash path, rejecting
escape, links at/below the supplied root, reserved/ambiguous paths and nonfiles.
The caller supplies authorization; the helper never infers it. Entries preserve
exact UTF-8 strings; null means absent. Parsing rejects duplicates/case aliases,
binary/NUL, over-count/byte limits, malformed paths and extra fields. Reads are
bounded and detect in-read replacement/change. Seeding requires an existing
empty nonlinked root and writes only non-null entries; it never deletes files.

- [x] Add the minimal failing check for existing file capture, exact original bytes and absent output.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-material.spec.ts`; verify the failure names the missing behavior.
- [x] Implement the above helpers with Node standard-library filesystem primitives and the established path/snapshot constraints.
- [x] Cover escape, link/ancestor, nonempty seed root, invalid UTF-8, over-cap material and two independently seeded replicas.
- [x] Verify focused tests and review helper scope before integration.

Example contract check:

```ts
const captured = await readConversationFile(sourceRoot, 'input.md')
expect(captured).toEqual({ path: 'input.md', content: 'unchanged\r\n' })
await seedConversationFiles(replicaRoot, [captured, { path: 'output.md', content: null }])
expect(await readConversationFile(replicaRoot, 'input.md')).toEqual(captured)
expect(await readConversationFile(replicaRoot, 'output.md')).toEqual({ path: 'output.md', content: null })
```

## Task 2: Native task capture and immutable learning identity

Files: new `packages/tianwen-evolution/src/conversation-files.ts`, existing
Evolution `conversation-learning.ts` and `index.ts`; new runtime-bundle
`conversation-file-observer.ts`, existing `conversation-file-material.ts`,
`conversation-observer.ts`, `conversation-judgment.ts`, `conversation-task-material.ts`,
`runtime.ts`; relevant conversation-learning/native observer tests.

This task captures truthful file evidence but does not yet admit it into a study
or call a file review successful. Task 3 owns real file comparison and positive
file-result review. Keep unsupported external/subjective verdicts unchanged.

Move the pure entry type/constants/parser from Task 1 into the new Evolution
file module and re-export them through the runtime helper, avoiding duplicated
validators or a reverse dependency from Evolution into Runtime. Expose these
additional contracts through Evolution's public index:

```ts
export interface ConversationTaskFileInput {
  readonly kind: 'task-file-input-captured'
  readonly taskId: string
  readonly callId: string
  readonly callSeq: number
  readonly path: string
  readonly content: string | null
}
export interface ConversationTaskFileUnavailable {
  readonly kind: 'task-file-evidence-unavailable'
  readonly taskId: string
  readonly reason: 'unsupported-tool' | 'unsafe-path' | 'material-unavailable' | 'capture-interrupted'
}
export interface ConversationFileResult {
  readonly schemaVersion: 'tianwen.conversation-file-result.v1'
  readonly outputKind: 'files' | 'chat'
  readonly inputsDigest: Sha256Digest
  readonly captureSeq: number
  readonly outputPaths: readonly string[]
  readonly entries: readonly ConversationFileEntry[]
}
export interface ConversationFileMaterial {
  readonly schemaVersion: 'tianwen.conversation-file-material.v1'
  readonly outputKind: 'files' | 'chat'
  readonly cwd: string
  readonly entries: readonly ConversationFileEntry[]
  readonly outputPaths: readonly string[]
}
export function parseConversationFileMaterial(value: unknown): ConversationFileMaterial
```

`ConversationTask` gains optional `fileInputs` and `fileUnavailable` projections;
`ConversationTaskCompletion` gains optional `files: ConversationFileResult`.
First captures append before the permitted file operation and before completion,
once per case-insensitive path; repeated reads/writes never replace a preimage.
The existing private conversation-learning event stores these records; do not
expose them as public ledger events. The domain validates capture timing, unique
path/call IDs, total count/bytes, final snapshot exact path coverage and digest,
output-kind/output-subset compatibility, completion status and local-files admission. All original
record shapes and hashes remain unchanged when new fields are absent.

Add `local-files` to the admission mode enum and instructions: bounded local
text-file work without commands, tests, network calls or other external effects.
Only local-files admission requires `fileOutputKind: 'files' | 'chat'`, frozen
before the answer. `files` means an actual file deliverable; `chat` means reading
local files to answer in chat. Other modes omit this field, and historical
records keep their original shapes/hashes. The native schema may make the new
field optional syntactically, but the parser enforces this exact mode-dependent
rule; never manufacture a default after seeing the answer. No new user fields
are required. Actual native operations decide captured paths, not a model path list.

Runtime service `TianwenConversationFileObserverService` exposes
`takeResult(taskId: string): ConversationFileResult | undefined`. It observes
root local-file tasks at `tools/execute` (after normal authorization and guards).
It captures the exact first `read/write/edit` target using Task 1 helpers, awaits
durable append, then always delegates the original allowed operation. Ineligible
material marks file evidence unavailable, not a failed user operation. No model
calls, prompt steering, argument rewriting or extra reads of guessed files.
Concurrent first reads must share the first capture, not append conflicting
preimages. A work tool outside those native file tools makes the file receipt
unavailable. Treat Code Mode/composite execution as unsupported for this first
contract rather than silently overlooking nested effects.
For a pre-admitted `chat` file task, only actual native read calls are supported;
write/edit makes learning evidence unavailable while ordinary execution continues.
Check the task's current consent revision before capture and again before
appending newly read content. Consent withdrawal discards pending results and
prevents further capture; it must not interrupt the user's authorized task.

Use awaited `agent/turn-stopping` to capture final entries and current event seq.
Replace the pending snapshot if steering causes a later stop attempt. Existing
observer completion calls `takeResult` and binds it to the actual completed
native result; failed/interrupted/unsupported turns receive no success-capable
file receipt. Recovery has no pending final snapshot and must not read current
files to manufacture one. Dispose hooks and pending memory through native
service lifecycle. Keep all capture failures contained from foreground work.

Extend `ConversationTaskMaterial` with optional `files: ConversationFileMaterial` containing the recorded
cwd, frozen input entries and output paths only (not final artifacts). Recovery
checks the native source span, first-call identity/arguments/path, compatible
mode, complete capture and final record binding without touching current files.
Only attach this optional file replay material when the complete binding can be
verified. Missing file evidence must not prevent recovery of the original user
request/context or ordinary feedback attribution; those existing paths remain
usable without `files`. A later study must separately require verified `files`.
Original final artifacts remain separately available on task completion for
the later original-result evaluator and feedback consumer.

- [ ] Write RED for an actual native file call whose original input survives a later write, plus absent output and capture failure.
- [ ] Add pre-answer local-file mode while keeping historical admission shapes valid.
- [ ] Capture first preimages at the approved native tool around-dispatch boundary; bind task/call/path and do not block ordinary work on capture failure.
- [ ] Persist final actual artifacts and validate their task/native result association; recovery never reconstructs a missing preimage from current files.
- [ ] Check missing, out-of-scope, mixed-tool and interrupted tasks stay ineligible, and unchanged text/historical fixtures still pass.
- [ ] Review before opening selection to the new contract.

Required assertion: a model saying `saved` with missing `output.md` must not create
a successful file receipt; re-reading a changed source after restart must not
replace the saved preimage. Pure domain RED must catch overwritten preimages,
late captures, wrong input digest and missing final paths. Native RED must show
an actual allowed write retains original bytes while changing the real file,
and a following turn cannot change the preceding task's captured final content.

`parseConversationFileMaterial` is strict data-only validation: exact fields,
schema, outputKind, nonblank absolute cwd, and a nonempty bounded entry list.
`files` requires a nonempty unique output subset using exact canonical entry
paths. `chat` requires outputPaths to be empty and at least one non-null input;
native binding additionally requires at least one real approved successful read
whose first preimage was captured. No read, failed read, guessed path or capture
alone is not sufficient. The parser itself never touches
the filesystem. Native recovery additionally proves that cwd is the recorded
task root; a synthetic case will have this root supplied by the host in Task 3.

The original `files` request cannot become `chat` merely because the model failed
to produce a file. Add RED for genuine read-to-chat material, no/failed read,
chat-with-write exclusion and frozen-kind mismatch, in addition to the file-write
tests. Real later edits must never rewrite the frozen read input after restart.

## Task 3: Real native replica execution and persisted output proof

Files: new `packages/tianwen-runtime-bundle/src/conversation-file-trial.ts`
and `tests/dsh-migration/conversation-file-trial.spec.ts`. Task 4 owns consumers.

Expose `runConversationFileTrial` and `recoverConversationFileTrial` using the
existing three-field `ConversationJudgmentProof`. Run input includes exact
worker material (request/context or synthetic prompt, plus initial `files`),
optional guidance, frozen callConfig, signal, and an explicit absolute replica
parent root supplied by the configured host. No operating-system tmpdir fallback.
The function creates one unique empty child per trial, seeds Task 1 preimages,
uses a native Agent at that cwd, and returns answer, actual final file entries,
output digest and persisted proof. Text trial APIs are unchanged.

Worker material excludes criteria, feedback standards, original final outputs,
arm labels and other trial answers. Provide an explicit original-cwd to replica
mapping without mutating user text or tool arguments. Native read/write/edit
must already be available; require them, do not register replacement work tools.
Restrict visibility AND execution in unpublished Agent setup, and use the
native around-dispatch seam for awaited path validation. Read only from the
frozen exact entry set; write/edit only exact output paths. Unknown, nested,
escalated or outside-replica calls are denied, not redirected. Preserve original
native permission checks. Use a modest finite native request/tool bound plus
cancellation so a failed file operation cannot loop indefinitely.
For outputKind chat, expose only native read and deny all write/edit; require
actual successful input reading rather than a claim of having read it. For files,
retain read/write/edit with its nonempty output path set. No cross-kind fallback.

The single-task Agent must have no parent conversation seed, no other Session
access, the exact requested native model configuration on every request, and
normal cancellation/disposal. An actual completed native turn is required;
assistant text alone does not create a file success. Capture final entries
from the replica's exact frozen set after the owned single turn stops.

Reuse the public `@deepseek-ai/dsh-subagent` composition exports: capture delegated
policy synchronously before the first await; `resolveChildDepth`,
`resolveChildAgentOptions`, `childSessionMeta` (override only cwd with replica),
then `appendDelegatedPolicyOverrides` and `applyChildComposition` in unpublished
setup. The latter joins the parent's live preset before applying the narrow
read/write/edit mask and persona. A bare agents.create can otherwise see no
production preset tools, even when a root-mounted test harness passes. These
public helpers also preserve the native never-ask delegation policy; do not
copy their internals or invent an approval wrapper. Test with agent-scoped
preset composition as well as ordinary native file calls. Use exported
`finalAssistantOutput` and keep only visible text for the final answer.

Append one host-only non-surface `tianwen/conversation-file-trial-result` Session
event after the completed turn, then flush and calculate sessionDigest. Its
strict bounded payload binds the file contract, exact worker request identity,
initial material digest, actual answer and final entries. No new store or
executable artifact is needed. `outputDigest = sha256({ answer, files })` for
file trials. Recovery validates unique receipt, native request and completion,
tool paths, model configuration and the output binding without reading current
files or invoking any model. Never accept an ordinary text execution proof as
file proof. Preserve bounded receipts when retiring only the exact owned replica;
validate the absolute child target before cleanup and never delete its parent.

- [ ] Write RED that the candidate trial must actually change its own replica,
  while baseline and original workspace bytes remain unchanged.
- [ ] Use `agents.create({ meta: { cwd: replicaRoot, origin: 'subagent', parentSession }, setup })` and native `followup`/`whenIdle`; register no new work tools.
- [ ] Restrict and guard native read/write/edit by exact replica/allowed paths;
  preserve cancellation and exact native model/persistence proof.
- [ ] Verify actual source/candidate isolation, missing output, denied original
  path, disallowed tools, cancellation, file tampering and exact receipt recovery.
- [ ] Independent task-scoped review before integrating the new executor.

## Task 4: Existing study and blind-review integration

Files: existing Evolution guidance/domain/ledger modules, guidance loop,
observer, audited review/material/feedback modules and native integration tests.

Study mode is optional `evaluationMode: 'local-files'`, with required
`fileOutputKind: 'files' | 'chat'` for that mode; absence retains the
historical text contract and no default field is inserted into parsed objects.
Existing whole-body studyId and materialDigest then bind the mode and initial
file contents automatically. Both loop selection and Evolution source validation
must require all three sources to match the frozen mode and outputKind, complete file material,
the same family/model/parent/consent/quality and existing support rules.

Generated adjacent/holdout file cases contain bounded initial entries and exact
output paths, not answers. The host supplies cwd, not the generator. Freeze
`{ prompt, criteria, qualityContract, files }` before proposing guidance. Text
input-digest semantics remain unchanged; file input identity includes normalized
request text and initial file contract so different real inputs are not mistaken
for duplicate requests. No missing file case may silently fall back to text.

Use `fileRules?: Partial<Record<ConversationFamily, Partial<Record<'files' | 'chat', string>>>>` alongside existing
Snapshot.rules; do not materialize absent maps. Old text snapshots/hashes remain
identical. A local-files candidate only changes its selected family/outputKind in fileRules; a text
candidate only changes its selected family in rules. All other map entries and
absence/presence remain fixed. Centralize mode-aware lookup; local-files has no
fallback to text or the other outputKind and external/subjective receive no unevaluated rule. File
activation must preserve the independently tested text rule. Keep one existing
snapshot/version chain, not two new stores or independent version systems.

Connect Task 3 to every file formal and exploration arm. File outputDigest is
the hash of answer plus actual final entries, used consistently in arm records,
exploration observations, source-selection recovery and claim-review recovery.
Recovery first verifies executor host receipt, then both blind reviewers used
the same frozen input and exact output. Neither recovery nor a retry reads the
current replica to reconstruct historical proof.

For original-result and method-study projection, original file preimages are
sources and contents of declared outputPaths plus the assistant reply are answer.
Unchanged input-only files are not additional answer units; chat has no file
answer units. Do not project post-write readback
or write success tool text as factual support for that output. Host-confirmed
file existence is narrow evidence of file existence, never of its asserted facts.
Keep unchanged v6 claim semantics and separate two-reviewer consensus. A missing
required output cannot be promoted to met; missing capture remains inconclusive.
Feedback attribution retains the original task/user feedback and adds verified
file results when available, never requiring file evidence to recover plain text.

Current rollback is chain-head only. Add a focused interleaving check (file
activation -> text activation -> file support withdrawn). The active inherited
file rule must not remain in use. Reuse whole-parent-snapshot rollback, with an
explicit verified ancestor-invalidated reason if a later head must be removed
before the unsupported ancestor; validate ancestry and the ancestor's actual
support/consent invalidation in the ledger. Do not silently bypass source gates
or introduce per-rule history replay at every injection. Exact API for this
narrow extension is finalized from the failing interleaving check, not speculation.

- [ ] Write RED for file-mode selection and snapshot/hash compatibility before modifying consumers.
- [ ] Give reviewers original frozen inputs plus actual outputs, never output
  content as its own factual source. Bind file output to recovered audit proof.
- [ ] Select compatible verified file evidence through existing support and
  counterexample rules; replay actual files for source/exploration/holdout cases.
- [ ] Verify accepted/rejected/unknown, source/reference ordering, withdrawal,
  no reapplication on restart and existing text behavior with focused tests.
- [ ] Independent correctness/scope review; fix only reproduced findings.

## Task 5: Targeted real-model branches and delivery

- [ ] Update verification matrix with exact newly changed contracts and reused historical evidence before launching any model episode.
- [ ] Freeze task inputs, preconditions, expected observable behavior, permitted alternative decisions and stop conditions in an E-backed isolated environment.
- [ ] Use normal built-in-browser inputs and actual configured DeepSeek. Preserve
  every attempt and artifact; do not supply judged outputs or force internal branches.
- [ ] Verify local-file learning connection, then separately targeted exploration
  and approved-reference selection where the protocol has a concrete evidence gap.
- [ ] Exercise normal user withdrawal/disablement against an actual active method
  when available; label seeded recovery checks as engineering, not natural use.
- [ ] Audit exact candidate, complete proportional regression/build checks,
  independent review, commit and controlled merge; exact-main CI before Daily update.
- [ ] Back up to E, preserve Daily data/shortcut and verify normal upgrade/lifecycle.
  Archive exact owned temporary replicas after retaining receipts; no broad deletion.

## Progress and retained failures

- 2026-09-09: baseline c13bad7 clean; targeted unchanged domain tests 61/61 passed.
- Initial `pnpm exec` invoked dependency-health installation and refused module
  removal without TTY. No purge approved; direct installed Vitest ran successfully.
- Read-only investigations confirmed native file tools and Agent creation reuse.
- Task 1: implementation 38839d5, BOM correction a5309ee; fresh helper 9/9,
  focused typecheck, and independent fix review passed. Earlier combined helper
  and unchanged domain check was 69/69. This is foundation evidence, not native
  file-learning or actual-model acceptance.
- No production implementation or new model acceptance is complete at plan creation.
