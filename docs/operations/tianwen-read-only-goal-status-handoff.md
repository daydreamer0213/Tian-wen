# Tianwen Read-only Goal Status Handoff

Date: 2026-08-16

Branch: `codex/tianwen-read-only-goal-status`

Base: `327327108f2f4666a99824e5aeaaaccace5afdc6`

Implementation HEAD before this handoff: `71afd96`

## Result

This phase is complete.

The installed Tianwen DSH Profile now contains a small read-only command:

```text
tianwen status --goal <goal-id> --data-dir <absolute-tianwen-data-dir>
```

Add `--json` for the stable machine-readable projection.

The command reports:

- the durable Goal and its progress;
- the owning Session and event count;
- minimal Evidence counts and ordered tool name/status rows;
- the formal Champion pointer, or `none`;
- an explicit read-only Runtime marker with zero model requests.

It does not resume a Goal, start an Agent, call a model, mutate Session state,
repair governance state, promote an Artifact, or add a UI.

## Installed invocation

The formal Profile proof installed the package at:

```text
D:\DevData\tianwen\dsh-home\profiles\tianwen\node_modules\@tianwen\runtime-bundle
```

The installed bin link exists at:

```text
D:\DevData\tianwen\dsh-home\profiles\tianwen\node_modules\.bin\tianwen.CMD
```

Example:

```powershell
& 'D:\DevData\tianwen\dsh-home\profiles\tianwen\node_modules\.bin\tianwen.CMD' `
  status `
  --goal '<goal-id>' `
  --data-dir 'D:\DevData\tianwen' `
  --json
```

The E2E gate resolves and executes the package's installed `bin.tianwen`
target directly through Node, rather than relying on a workspace source path.

## Authority and read-only behavior

### Goal and Session

The command uses public DSH `0.1.0-rc.6` package-root APIs:

- `JsonlSessionPersistence.list()`;
- `JsonlSessionPersistence.inspect()`;
- `foldGoal()`.

It creates no Agent and mounts no Goal service or Goal round driver. A missing
Goal returns a stable not-found result. If two durable Sessions claim the same
current Goal id, the command fails as ambiguous instead of guessing.

### Evidence

The command reuses the existing pure `@tianwen/evidence/projector` entry. It
returns only counts plus ordered tool name/status rows. Raw user messages,
tool arguments, tool results, call ids, workspace paths and task text are not
copied into the status projection.

### Champion

The command does not instantiate `EvolutionLedger`, because that constructor
may create or repair state. It performs a narrow, read-only replay of canonical
`ledger.jsonl` plus `champion.json` instead.

The replay validates the formal event sequence needed to trust the derived
Champion pointer, including latest evaluation authority, human approvals,
approval consumption, promote/rollback history, runtime bindings and failure
events. It deliberately does not read or verify immutable Artifact source
bytes; Artifact verification and repair remain owned by the mutation path.

Malformed or contradictory governance state returns an integrity error and is
never repaired by the status command.

## Packaging

`@tianwen/runtime-bundle` now publishes:

- `./runtime`;
- `./smoke`;
- `./status`;
- bin `tianwen` -> `dist/cli.js`.

The CLI uses Node's standard-library argument parser. No CLI framework or new
runtime dependency was added. DSH/Cordis remain external public dependencies;
the minimal Evidence projector is bundled without test-harness code.

Formal archive:

```text
D:\DevData\tianwen\packs\tianwen-runtime-bundle-0.0.0.tgz
sha256:cfd046663c0e92d9da320b67455ba1d712db19500a627318e71d50243f6f6ef7
```

## Formal installed Profile proof

The strict offline E2E performed one complete sequence:

1. build and pack the Runtime Bundle;
2. install it into the isolated DSH Profile;
3. run the existing scripted Tianwen smoke task;
4. persist and dispose its Session;
5. execute the installed status CLI for the completed Goal;
6. compare Session and Evolution directory entries and file bytes before and
   after the status process.

Observed result:

- Goal phase: `complete`;
- model steps before status: `4`;
- model steps after status, recomputed from the post-command Session: `4`;
- Evidence: `create_goal`, `tianwen_smoke_action`, `update_goal`, all complete;
- Champion: `null` for this fixture;
- Runtime marker: `not-loaded`, `readOnly=true`, `modelRequests=0`;
- Session and Evolution state: byte-for-byte unchanged.

Receipt:

```text
D:\DevData\tianwen\receipts\phase3-goal-status-receipt.json
sha256:41909501165c512914688ab1c92265fff6c843a16e7df0edd7915c3993b7be8f
```

## Commits

- `8c175eb` `docs: plan read-only goal status`
- `e8c346f` `feat: add read-only goal status projection`
- `2e796b0` `feat: ship read-only goal status cli`
- `a1e6fd4` `test: prove installed read-only goal status`
- `71afd96` `fix: validate read-only champion replay`

The commit containing this document is the canonical final phase head.

## Verification

All final gates used the exact implementation tree at `71afd96`; committing
this document changes no product or test code.

| Gate | Result |
|---|---|
| offline frozen pnpm install | passed; already up to date; no download |
| Runtime Bundle build | passed; runtime/smoke/status/CLI built |
| DSH closure | 187 exact `0.1.0-rc.6` packages; 15 public surfaces |
| private DSH imports | 0 violations |
| workspace typecheck | passed |
| default Node suite | 91 passed, 8 expected skips |
| installed Profile E2E | 2 passed in 42.84 s |
| Windows local sandbox gate | 3 passed |
| Python A1-A5 author proof | 10 passed in 291.03 s |
| foreground full Python suite | 424 passed, 4 expected skips in 8060.00 s |
| Ruff | all checks passed |
| base-to-HEAD `git diff --check` | passed |
| independent final review | Critical 0, Important 0, Minor 0; Ready |

The unusually long Python duration was host I/O/subprocess latency. The run
remained a single foreground pytest process, completed normally, and reported
no failed tests.

No paid model, API key, live web/search, real Docker, private DSH source import,
automatic promotion, Runtime cutover or interactive DSH UI was used.

## Error contract

- usage error: exit `2`;
- Goal not found: exit `3`;
- ambiguous or integrity failure: exit `1`;
- success: exit `0`.

Errors do not echo the supplied data directory.

## Known boundaries

- DSH remains pinned to Developer Preview `0.1.0-rc.6`.
- Windows local sandbox remains partial; high-risk execution still requires a
  container, remote sandbox or microVM.
- Same-process plugins installed into the trusted Profile remain reviewed,
  versioned trusted code for v1.
- The Python evaluator bridge is still A1-only, while A1-A5 authoring and
  verifier contracts remain intact.
- This phase is a read-only control projection, not a full task panel or UI.

## Recommended next phase

Keep the same thin-runtime strategy. The next useful slice is a minimal
read-only list command over durable Goals/Sessions, so a user can discover the
Goal id before calling `status`. Reuse the same projection and error contracts;
do not build a desktop task panel yet.
