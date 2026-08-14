# DeepSeek Harness probe Task 5 handoff

**Date:** 2026-08-14

**Status:** Task 5 complete locally, independently reviewed, and ready for the
required fast-forward push

**Branch target:** `codex/deepseek-harness-probe`

**Starting local and remote SHA:**
`c49192897d7f25810e1bd9de107fb837bace5fbd`

**Implementation commits:**

- `4555432caeb063da1de64b1337449c8663f1d59f`
  `feat: project harness events into tianwen evidence`
- `a5557a8315ec0848f94b6869e50566c095eb2c1c`
  `test: cover reverse tool result ordering`

The controlling handoff carries the exact final local and remote SHA because
this document cannot identify the commit that contains itself.

This result proves only Task 5. It does not start Task 6, authorize a full
Tianwen-on-DSH migration, change Goal or Champion policy, or start Alpha
Task 10.

## Implemented scope

Task 5 changed only:

- `packages/tianwen-evidence/package.json`;
- `packages/tianwen-evidence/tsconfig.json`;
- `packages/tianwen-evidence/src/index.ts`;
- `packages/tianwen-evidence/src/projector.ts`;
- `tests/dsh-probe/evidence.spec.ts`;
- the mechanical `packages/tianwen-evidence` importer in `pnpm-lock.yaml`;
- this canonical handoff.

No Task 0–4 implementation, Task 3 Bundle/Profile, dependency version, Python
Alpha runtime, Goal/Champion/Candidate policy, Sandbox, approval flow, UI, or
Task 6 file was changed.

## EvidenceRecord v1 projection

`@tianwen/evidence` consumes a public rc.6 `Session` or a `SessionId` plus its
append-only public `SessionEvent[]`. It emits the planned
`tianwen.evidence.v1` shape.

Each record contains only:

- Session id;
- call event sequence and optional result event sequence;
- call id and tool name;
- SHA-256 argument and result digests;
- `complete` or `missing-result`;
- optional tool error code.

It does not copy raw user conversation, raw tool arguments, or raw tool
results. DSH remains the source of the original execution facts.

The projector:

1. recursively sorts object keys;
2. serializes canonical JSON;
3. hashes its UTF-8 bytes with SHA-256 and the `sha256:` prefix;
4. pairs results through `message.toolCallId`;
5. preserves tool-call order even when results finish in reverse order;
6. emits one explicit `missing-result` record for an unmatched call;
7. rejects duplicate calls, duplicate results, orphan results, results before
   their own calls, and unsupported canonical values;
8. derives `evidenceId` from the exact planned identity fields.

Replaying the same event sequence returns the same record order, deep
structure, and canonical JSON bytes. It does not append to a Tianwen store or
create replay duplicates.

## Real AgentLoop and two-ledger evidence

The focused suite registers a real public `defineTool()` implementation on a
real mounted AgentLoop, sends one human message, executes one scripted model
tool call, waits for idle, and projects the resulting real Session.

The test proves:

- exactly one complete EvidenceRecord is produced;
- call and result sequence locations are ordered and bind the same call id;
- argument and result digests are stable;
- Tianwen Evidence does not contain `private input` or `private result`;
- the DSH Session still contains those original facts.

This is the executable proof of the two-ledger split: DSH keeps the raw
single-Session history while Tianwen keeps only the minimum projection.

## Cross-Context persistence and replay

The persistence test uses the real JSONL Session persistence:

1. Context 1 runs the tool flow and projects Evidence;
2. it flushes the Session and disposes the whole Context;
3. Context 2 mounts over the same JSONL root;
4. it resumes the Session without sending a new message;
5. it projects Evidence again.

The two projections are deeply equal and have identical canonical JSON bytes.
Context 2's scripted adapter records zero model requests during the comparison.

## Read-only capability boundary

The package has one dependency:

```text
@tianwen/dsh-compat: workspace:*
```

`TianwenEvidenceService` exposes only `project(session)`. The package has no:

- `GoalService`;
- `DynamicCordisRunnerService`;
- sandbox;
- filesystem-write service;
- approval service;
- version or promotion mutation API;
- database, event bus, or general redaction framework.

All DSH and Cordis imports use public package roots. No
`@deepseek-ai/*/src/*` import, copied upstream source, or DSH fork was added.

The root test imports the authored evidence entry module by its relative
`.js` source path because the Task 5 file allowlist does not permit adding a
root workspace dependency. The package build separately proves the declared
`@tianwen/evidence` root export and declaration output. Root `package.json`
remains unchanged.

## TDD and mutation evidence

The genuine RED was:

```text
pnpm.cmd exec vitest run tests/dsh-probe/evidence.spec.ts
FAIL: Cannot find package '@tianwen/evidence'
```

The failure was caused by the absent Task 5 package and projector, not by a
typo or a passing pre-existing behavior.

The initial GREEN produced:

```text
Task 5 focused: 6 passed
Tasks 0–5 Node regression: 27 passed
```

Final review required a direct test for two calls whose results complete in
reverse order. The added test fixes literal call/result sequences and literal
independently calculated result digests. A temporary uncommitted mutation
sorted output by result sequence; the new test failed with `[call-B, call-A]`
instead of `[call-A, call-B]`. Restoring production code produced:

```text
Task 5 focused: 7 passed
Tasks 0–5 Node regression: 28 passed
```

The mutation was not committed, and the final fix commit changes only the
test.

## Lockfile and offline replay

The lockfile contains only the new workspace importer linking
`@tianwen/dsh-compat`.

The planned offline lockfile-only command was attempted. It could not
re-resolve an unchanged optional dependency because the local store lacked its
registry metadata, and it made no change. No live registry fallback was used.
The importer was added mechanically and then accepted by the authoritative
offline frozen replay:

```text
pnpm 11.20.0
--offline
--frozen-lockfile
--trust-lockfile
registry=http://127.0.0.1:9/
Already up to date
exit 0
```

## Fresh final verification

Final verification on
`a5557a8315ec0848f94b6869e50566c095eb2c1c` produced:

```text
@tianwen/evidence build
exit 0

Task 5 focused
1 file, 7 tests passed

Tasks 0–5 Node regression
6 files, 28 tests passed

TypeScript workspace typecheck
exit 0

DSH dependency closure
187 installed packages at 0.1.0-rc.6; 15 public surfaces

Private DSH source import scan
0 violations

Offline frozen pnpm install
exit 0; already up to date

Python A1
1 passed, 9 deselected

Full Python pytest
424 passed, 4 skipped

Ruff
All checks passed

git diff --check
exit 0

Authorized implementation file scope
6 changed files; 0 unexpected files

Worktree before this handoff
clean
```

The four Python skips are the paid live-model probe, two unavailable Windows
symlink cases, and the separately covered Windows ACL case. No paid test or
model key was used.

## Independent review

Fresh scoped reviewer:

```text
019fff4a-36f6-7d00-a194-25e90a99acad
Critical: 0
Important: 0
Minor: 1
Task quality: Approved
```

The Minor requested a direct reverse-result-completion regression.

Fresh whole-branch reviewer:

```text
019fff50-66da-7c91-9ae4-201fdd299e06
Critical: 0
Important: 1
Minor: 0
Ready: with fixes
```

It promoted that regression gap because call ordering is a load-bearing replay
contract. The test-only fix was committed as `a5557a8`.

Fresh scoped re-review:

```text
019fff5b-4253-7ac0-afe1-01691cc4746d
Important finding: ADDRESSED
New breakage: none
Open Critical/Important: 0
```

## Storage and forbidden effects

Large or generated data stayed under:

```text
D:\DevData\pnpm-store
D:\DevData\corepack-home
D:\DevData\tianwen-dsh-probe\virtual-store-task-5-*
D:\DevData\tianwen-dsh-probe\temp-task-5-*
D:\DevData\tianwen-dsh-probe\venv-task-5-*
D:\DevData\tianwen-dsh-probe\pycache-task-5-*
D:\DevData\tianwen-dsh-probe\sessions
```

Task 5 did not use:

- live web, search, fetch, or npm registry access;
- paid models, provider traffic, or model API keys;
- Docker, a real sandbox, or interactive DSH;
- the Task 3 Windows Profile-install `shell: true` exception;
- a DSH fork or private source import;
- merge, rebase, force-push, or global Git configuration changes.

## Remaining risks and next boundary

- DSH remains pinned to Developer Preview `0.1.0-rc.6`; Task 5 proves this
  exact event surface, not future release compatibility.
- The offline store cannot independently regenerate the entire lockfile
  because one unchanged optional package lacks cached registry metadata.
  Frozen installation of the committed lockfile is green.
- Task 6 and Alpha Task 10 remain frozen. The controller must separately
  authorize the next task after accepting this handoff.
