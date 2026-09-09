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

- [ ] Add the minimal failing check for existing file capture, exact original bytes and absent output.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-material.spec.ts`; verify the failure names the missing behavior.
- [ ] Implement the above helpers with Node standard-library filesystem primitives and the established path/snapshot constraints.
- [ ] Cover escape, link/ancestor, nonempty seed root, invalid UTF-8, over-cap material and two independently seeded replicas.
- [ ] Verify focused tests and review helper scope before integration.

Example contract check:

```ts
const captured = await readConversationFile(sourceRoot, 'input.md')
expect(captured).toEqual({ path: 'input.md', content: 'unchanged\r\n' })
await seedConversationFiles(replicaRoot, [captured, { path: 'output.md', content: null }])
expect(await readConversationFile(replicaRoot, 'input.md')).toEqual(captured)
expect(await readConversationFile(replicaRoot, 'output.md')).toEqual({ path: 'output.md', content: null })
```

## Task 2: Native task capture and immutable learning identity

Files: `conversation-learning.ts`, observer/task-material modules, native
conversation-learning/observer tests. Add a narrow file-evidence record/module
only if needed to avoid coupling pure Evolution records to filesystem code.

- [ ] Write RED for an actual native file call whose original input survives a later write, plus absent output and capture failure.
- [ ] Add pre-answer local-file mode while keeping historical admission shapes valid.
- [ ] Capture first preimages at the approved native tool around-dispatch boundary; bind task/call/path and do not block ordinary work on capture failure.
- [ ] Persist final actual artifacts and validate their task/native result association; recovery never reconstructs a missing preimage from current files.
- [ ] Check missing, out-of-scope, mixed-tool and interrupted tasks stay ineligible, and unchanged text/historical fixtures still pass.
- [ ] Review before opening selection to the new contract.

Required assertion: a model saying `saved` with missing `output.md` must not create
a successful file receipt; re-reading a changed source after restart must not
replace the saved preimage.

## Task 3: Real replica trial and existing study integration

Files: a narrow `conversation-file-trial.ts`, existing guidance loop, audited
review/material modules and corresponding native integration tests.

- [ ] Write RED that the candidate trial must actually change its own replica,
  while baseline and original workspace bytes remain unchanged.
- [ ] Use `agents.create({ meta: { cwd: replicaRoot, origin: 'subagent', parentSession }, setup })` and native `followup`/`whenIdle`; register no new work tools.
- [ ] Restrict and guard native read/write/edit by exact replica/allowed paths;
  preserve cancellation and exact native model/persistence proof.
- [ ] Give reviewers original frozen inputs plus actual outputs, never output
  content as its own factual source. Bind file output to recovered audit proof.
- [ ] Select compatible verified file evidence through existing support and
  counterexample rules; replay actual files for source/exploration/holdout cases.
- [ ] Verify accepted/rejected/unknown, source/reference ordering, withdrawal,
  no reapplication on restart and existing text behavior with focused tests.
- [ ] Independent correctness/scope review; fix only reproduced findings.

## Task 4: Targeted real-model branches and delivery

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
- No production implementation or new model acceptance is complete at plan creation.
