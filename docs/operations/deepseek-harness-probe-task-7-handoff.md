# DeepSeek Harness probe Task 7 handoff

**Date:** 2026-08-14

**Status:** Task 7 implementation complete, fully verified, independently
reviewed, and ready for the required fast-forward push

**Branch target:** `codex/deepseek-harness-probe`

**Starting local and remote SHA:**
`33308a69b5ab08e2d8b432fd920e75854be1ed43`

**Implementation commits:**

- `1887abb1d2cb5af0143b4c68afa12b3e7e109f96`
  `feat: govern dynamic harness artifact versions`
- `f08946001194cf0a74675b12ef251e5e5df804a3`
  `fix: harden evolution governance transitions`
- `1647d1afc059c5df9ed0ec45185ea6e1f8162e4b`
  `fix: fail close evolution persistence errors`
- `e68230a8854cee8d0fb29ef1d53ebba814ecae05`
  `fix: block on uncertain ledger commits`
- `b5dd22720a1a2ee88c767f8c554f442aef726486`
  `fix: complete evolution ledger writes`

The controlling handoff carries the final local and remote SHA because this
document cannot identify the commit that contains itself.

This result proves only Task 7. It does not start Task 8, authorize a full
Tianwen-on-DSH migration, change Goal product policy, modify the Python Alpha
runtime, or change Evidence, Evaluator, Sandbox, UI, or dependency versions.

## Plan and baseline provenance

Before implementation:

- local `HEAD` and remote
  `origin/codex/deepseek-harness-probe` both resolved exactly to
  `33308a69b5ab08e2d8b432fd920e75854be1ed43`;
- the worktree was clean and already isolated by Codex;
- no merge, rebase, baseline change, nested worktree, or global Git
  configuration change was made.

The Task 7 baseline contains the Task 6 handoff but not the three canonical
architecture/spec/plan files. Those files were read without copying or
cherry-picking from the clean repository checkout at
`<main-worktree>`, whose blobs matched `origin/main` exactly:

- `docs/architecture-master-session-memory.md`;
- `docs/superpowers/specs/2026-08-14-deepseek-harness-runtime-selection-design.md`;
- Task 7 only from
  `docs/superpowers/plans/2026-08-14-deepseek-harness-compatibility-probe.md`.

The baseline-local
`docs/operations/deepseek-harness-probe-task-6-handoff.md` was also read in
full.

## Implemented scope

Task 7 changes only:

- `packages/tianwen-evolution/package.json`;
- `packages/tianwen-evolution/tsconfig.json`;
- `packages/tianwen-evolution/src/index.ts`;
- `packages/tianwen-evolution/src/ledger.ts`;
- `packages/tianwen-evolution/src/runtime-binding.ts`;
- `tests/dsh-probe/evolution.spec.ts`;
- the mechanical `packages/tianwen-evolution` importer in `pnpm-lock.yaml`;
- this canonical handoff.

`@tianwen/evolution` has only the planned dependencies:

- `@deepseek-ai/cordis-plugin-timer` `1.1.3`;
- `@tianwen/dsh-compat` `workspace:*`.

The service injects only `dynamicCordisRunner`. It does not import or inject
`GoalService`, model-facing Goal tools, Session persistence internals, user
conversation data, or any DSH private source path. The public package root
does not export the executable `EvolutionLedger` transition API, so callers
cannot bypass Dynamic activation through the normal package surface.

No database, marketplace, migration framework, generic event bus, queue,
RPC service, Docker integration, model call, or UI was added.

## Formal append-only authority

The Tianwen ledger is the formal authority for:

- `ArtifactVersion`;
- `EvaluationRecord`;
- `ApprovalRecord`;
- Promotion and rollback history;
- monotonic `ChampionPointer` revisions;
- activation failure, recovery failure, and process-local runtime binding
  audit events.

Source bytes are encoded as UTF-8 and identified by SHA-256:

```text
artifact:<64 lowercase hex>
sha256:<64 lowercase hex>
```

The same bytes replay to the same `ArtifactId`; different bytes produce a
different Artifact. A replay with changed parent metadata is rejected.

Immutable source is stored as:

```text
<ledger-root>\artifacts\sha256-<64 lowercase hex>.mjs
```

New source uses `wx` creation. Existing bytes at the same digest must compare
exactly. A new blob is fully written and `fsync`ed before the corresponding
`artifact-recorded` event is accepted.

Every event is one canonical JSON object followed by one LF in
`ledger.jsonl`. Complete UTF-8 buffers are written with a checked short-write
loop, then `fsync`ed before in-memory apply. Once an append begins, any
write/fsync/close error becomes `LedgerCommitUnknownError`; the runtime
blocks and requires fresh replay rather than guessing whether the event is
durable.

`champion.json` is only an atomic derived pointer. Its temporary file is
fully written with the same checked loop, `fsync`ed, then renamed. Startup:

- rebuilds the formal Champion from ledger events;
- accepts an exact pointer;
- repairs only a missing revision-1 pointer or a pointer exactly equal to
  the immediately previous committed transition;
- rejects arbitrary disagreement, malformed JSON, and unproven revisions.

All source blobs referenced by ledger events are rehashed during reload.
Rollback only appends a `rolled-back` event; it never deletes Artifact,
evaluation, approval, promotion, failure, or runtime-binding history.

## Evaluation and approval gates

Transition validation order is:

```text
recorded Artifact
-> latest evaluation exists
-> verdict is exactly met
-> unused human approval exists
-> immutable source can be read and rehashed
-> Dynamic define/run
-> formal transition event and derived pointer
```

`not_met`, `inconclusive`, a missing evaluation, or a missing human approval
cannot reach Dynamic `define()` or `run()`.

Approvals are globally unique and consumed by a promotion, rollback, or
failed activation audit. The initial V1 approval cannot be reused for a V1
rollback; a second human approval is required.

Promotion, rollback, and rehydration are serialized. Formal record writes
are rejected while a transition is queued, preventing two concurrent calls
from using the same approval or changing the selected evaluation during an
activation.

## V1, V2, rollback, BROKEN, and UNAPPROVED

The real public Dynamic Cordis integration mounts:

```text
Context
cordis-plugin-timer
SystemPrompt
ToolRuntime
DynamicCordisRunnerService
TianwenEvolutionService
```

It uses the exact planned host-only source bodies:

```ts
const V1 = 'return { name: "v1", apply() {} }'
const V2 = 'return { name: "v2", apply() {} }'
const BROKEN = 'throw new Error("broken update")'
const UNAPPROVED = 'return { name: "unapproved", apply() {} }'
```

The proven sequence is:

1. V1 is recorded, evaluated `met`, approved, activated, and promoted to
   Champion revision 1.
2. V2 is recorded with V1 as parent, evaluated, approved, activated, and
   promoted to revision 2 while V1 history remains.
3. A rollback attempt without a new V1 approval is rejected before Dynamic
   inventory changes.
4. A second V1 human approval permits rollback to a newly defined
   process-local V1 package at revision 3; V2 and the first V1 package remain
   in history.
5. BROKEN is recorded, evaluated `met`, approved, and defined. Its activation
   fails.
6. The formal Champion remains V1 revision 3, and the previous V1 package is
   explicitly rerun and verified active before `EvolutionActivationError`
   returns.
7. UNAPPROVED is recorded and evaluated `met`, but promotion is rejected
   before `define()` or `run()`; Dynamic inventory is byte-for-byte
   unchanged.

If old-Champion activation or required recovery audit fails, the service
returns `EvolutionRecoveryError` and remains blocked. Audit append failure
cannot prevent the old Champion from being rerun and verified active.

If a formal transition append has unknown durability, the newly activated
candidate is not stopped and the old runtime is not guessed back into place.
The service blocks, appends no second governance event, and requires fresh
ledger replay to determine the durable Champion.

If the formal transition event is durable but atomic pointer replacement
fails, the candidate remains the formal active Champion, the service blocks,
and fresh replay repairs only the provable derived pointer state.

## Process restart and ephemeral IDs

After the V1/V2/rollback/BROKEN/UNAPPROVED sequence:

1. the first Context is disposed;
2. a fresh Context and Dynamic runner are created;
3. the same Tianwen ledger is reloaded;
4. Dynamic inventory is initially empty;
5. `rehydrateChampion(agent)` reads the formal V1 Artifact and immutable
   source bytes;
6. the source is defined and run under newly minted process-local
   `pluginId` and `packageId`;
7. exactly one new `runtime-bound` event is appended;
8. formal V1 `ArtifactId` and Champion revision 3 do not change.

Opaque Dynamic ID strings are not compared across processes and are never
used as restart authority. Their values may be reused by an upstream
process-local counter, but each binding is a new mint in a new empty
registry. Old runtime-binding events are audit only and are ignored for
rehydration authority.

## TDD evidence

The first attempted run was not accepted as RED because the existing
`@tianwen/dsh-compat` dist had not yet been rebuilt.

The valid initial RED was:

```text
tests/dsh-probe/evolution.spec.ts
FAIL: Cannot find module
../../packages/tianwen-evolution/src/index.js
```

It failed because the Task 7 package did not exist.

The first GREEN produced:

```text
1 file, 6 tests passed
```

Independent review then drove real RED/GREEN regressions for:

- service-level mutable ledger bypass;
- concurrent reuse of one approval;
- activation-failure audit I/O blocking Champion recovery;
- source blob fsync ordering;
- provably stale derived pointer recovery while arbitrary mismatch rejects;
- failed rehydrate plus failed audit;
- successful rehydrate plus failed runtime-binding audit;
- synchronous Champion pointer rename failure;
- transition ledger `fsync` reporting EIO after a real fsync;
- short ledger writes;
- short pointer writes.

Final focused result:

```text
1 file, 17 tests passed
```

## Independent review

Fresh scoped reviewer:

```text
019fffc4-b2a0-7ee0-9d39-e106fae87abd
```

The initial review found:

```text
Critical: 3
Important: 2
Minor: 0
Ready: With fixes
```

The review loop found additional load-bearing persistence paths after the
first fixes. Each Critical or Important finding received a focused
RED/GREEN regression before implementation.

Final re-review on `b5dd22720a1a2ee88c767f8c554f442aef726486`:

```text
Critical: 0
Important: 0
Minor: 0
Ready: Yes
```

The reviewer confirmed that all governance, recovery, durability,
concurrency, public-surface, commit-uncertainty, and short-write findings
were closed. No ponytail Minor remains.

## Fresh final verification

Final verification on code commit
`b5dd22720a1a2ee88c767f8c554f442aef726486` produced:

```text
@tianwen/evolution build
exit 0

Task 7 focused
1 file, 17 tests passed

Tasks 0–7 Node regression
8 files, 63 tests passed

TypeScript workspace typecheck
exit 0

DSH dependency closure
187 installed packages at 0.1.0-rc.6; 15 public surfaces; 0 violations

Private DSH source import scan
187 installed packages at 0.1.0-rc.6; 15 public surfaces; 0 violations

Offline frozen pnpm install
exit 0; already up to date

Python A1 author proof
1 passed, 9 deselected

Full Python pytest
424 passed, 4 skipped

Ruff
All checks passed

git diff --check
exit 0

git status --short
clean
```

The four Python skips are the paid live-model probe, two unavailable Windows
symlink cases, and the separately covered Windows ACL case. No paid model,
model key, real Docker, interactive DSH, or hidden-background Windows ACL
run was used.

## Storage and offline operation

Final generated data and reusable caches are on D:

```text
D:\DevData\pnpm-store
D:\DevData\corepack
D:\DevData\pnpm-home
D:\DevData\uv-cache
D:\DevData\tianwen-dsh-probe\virtual-store-task-7
D:\DevData\tianwen-dsh-probe\temp-task-7
D:\DevData\tianwen-dsh-probe\pycache-task-7
D:\DevData\tianwen-dsh-probe\task-7-ledgers
```

The final install used the locally cached exact pnpm `11.20.0` entry, an
unreachable local registry, `--offline`, `--frozen-lockfile`,
`--trust-lockfile`, the D-drive store, and the D-drive virtual store.

The first environment bootstrap set an empty D-drive `COREPACK_HOME`;
Corepack printed that it was about to download pnpm before the offline pnpm
install reported zero package downloads. That bootstrap is not counted as
offline verification. Every subsequent and final command directly executed
the cached D-drive pnpm entry with the unreachable local registry.

The planned offline lockfile-only command also failed when the unreachable
registry name caused pnpm to look for metadata under that registry-specific
cache key. No network resolution succeeded. The importer was added
mechanically from already locked timer and workspace-link entries, then
validated by the final offline frozen install.

## Remaining risks and next boundary

- DSH remains pinned to Developer Preview `0.1.0-rc.6`; Task 7 does not
  prove future-version compatibility.
- JSONL plus synchronous file locking is deliberately process-local and
  serialized for this probe. It is not a multi-process database.
- A commit-unknown or unpersisted required audit intentionally blocks the
  current evolution service and requires fresh replay; no automatic repair
  daemon or migration system was added.
- The narrow derived-pointer recovery accepts only a first missing pointer
  or one exact committed-transition lag. Other disagreement remains a
  hard integrity error.
- Dynamic IDs remain process-local audit data, never formal identity.
- Task 8 and Alpha Task 10 remain frozen. The main controller must
  separately accept this handoff before any next task begins.
