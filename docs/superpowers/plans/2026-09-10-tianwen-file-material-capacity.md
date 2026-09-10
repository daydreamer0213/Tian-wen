# Bounded file material capacity implementation plan

> For agentic workers: use executing-plans for inline execution in this existing
> isolated worktree. Do not delegate this tightly coupled, small increment.

**Goal:** Admit the observed scale of multiple small documents without losing
exact source bytes or merely moving the failure to the next material guard.

**Architecture:** Retain existing capture, native execution, immutable receipts
and model-review material. Separate the single-entry limit from the aggregate
limit and coordinate the shared serialized material bound.

**Tech stack:** TypeScript, Vitest, installed DSH 0.1.1-rc.2; no dependencies.

## Global constraints

- Base e942b96; source design is the adjacent 2026-09-10 capacity specification.
- 8 files; 32768 bytes per entry; 65536 bytes per snapshot; 32768-byte trial reply.
- 262144-byte shared serialized judgment material; unchanged claim-audit bounds.
- No model calls, candidate packaging, Daily writes or old cohort reopening here.
- Existing D:/E: data paths and owned-fixture cleanup only; preserve all failures.
- Execute locally under standing delegated design authority, no routine approval.

## Task 1: Coordinate the existing producer/consumer capacity contract

Files:

- Modify `packages/tianwen-evolution/src/conversation-files.ts` and its public
  export if the existing wildcard does not expose the new entry constant.
- Modify `packages/tianwen-runtime-bundle/src/conversation-file-material.ts`.
- Modify `packages/tianwen-runtime-bundle/src/conversation-judgment.ts`.
- Test `tests/dsh-migration/conversation-file-material.spec.ts` and
  `tests/dsh-migration/conversation-claim-review.spec.ts`.
- Test unchanged receipt-reply boundary in file-learning/file-trial tests.

Interfaces: consume the existing file entry, native review and receipt APIs.
Produce the same return objects; only export the new named per-entry constant.

- [ ] Add a failing parser check with three synthetic files totaling 45339
  bytes and individually below 32768; assert exact unchanged contents.

```ts
const entries = [8614, 8231, 28494].map((size, index) => ({
  path: `input-${index}.txt`, content: 'x'.repeat(size),
}))
expect(parseConversationFileEntries(entries)).toEqual(entries)
```

- [ ] Add boundary checks: two 32768-byte entries accepted, aggregate 65537
  rejected; a single 32769-byte entry rejected even below aggregate capacity.
  Use a UTF-8 multibyte entry and a third one-byte entry for the overflow case.
- [ ] Add a native claim-review engineering check with three synthetic input
  files, chat output, valid exact result digest and unchanged final entries.
  Assert the actual child material exceeds 98304 but is below 262144, both
  isolated reviewers receive it, and the persisted request recovers exactly.
  Scripted judgments should be inconclusive, not claim a real semantic pass.
- [ ] Run only these new checks; record the actual pre-fix failures.
- [ ] Implement the constants and per-entry check; use entry bound in file read
  allocation/stat checks and retain the old trial-reply bound.

```ts
export const CONVERSATION_FILE_MAX_ENTRY_BYTES = 32768
export const CONVERSATION_FILE_MAX_BYTES = 65536
// In each non-null entry before the aggregate check:
if (bytes.byteLength > CONVERSATION_FILE_MAX_ENTRY_BYTES) {
  throw new Error('conversation file material exceeds the single-file byte limit')
}
// Judgment material:
export const CONVERSATION_MATERIAL_MAX_BYTES = 256 * 1024
```

- [ ] Replace tests that assumed the shared material cap was literally 96 KiB
  with the exported constant, retaining the original overflow intent.
- [ ] Run the new checks green, then the affected suites and two typechecks.
- [ ] Build Evolution and Runtime with existing project build entries; do not
  install dependencies, alter shared package files or overwrite Desktop output.
- [ ] Review the scoped diff for accidental reply-limit expansion, swallowed
  overflow, rewritten historical identities or added model retries.
- [ ] Commit exact scoped files and update current handoff with actual results.

Commands use `D:/hermes/node/node.exe node_modules/vitest/vitest.mjs run` plus
the exact above test paths. Typecheck/build entries are taken from each package's
current package.json; use existing resolved executables, not a new pnpm install.
Engineering completion does not close the outstanding real file-learning gate.

## Execution checkpoint

27f264b implements the eight-file scoped delta. New checks RED4fail/1pass; the
first post-edit run still consumed stale Evolution dist (retained). After the
Evolution build, GREEN5/5. Affected six suites113/113, targeted shared-limit
feedback1/1, Evolution/Runtime typechecks0, full Runtime build14 stages0.
One scoped independent review is closed: Critical/Important/Minor all zero.
No new candidate or live model run. All Task 1 checks above are completed; the
checkbox wording is retained as the original execution plan, not an open queue.
See the [engineering result](../../operations/tianwen-file-material-capacity-20260910.md).
