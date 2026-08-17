# Tianwen Read-only Goal List Handoff

Date: 2026-08-16

Branch: `codex/tianwen-read-only-goal-list`

Base: `c3ece065f246faaec31222593a8a5a8dc1ed5ec0`

Implementation HEAD before this handoff: `920ceb3d18c85df11f1422066b5307da26ee484b`

## Result

This phase is complete.

The installed Tianwen DSH Profile now exposes a minimal read-only discovery
command:

```text
tianwen list --data-dir <absolute-tianwen-data-dir>
```

Add `--json` for the stable `tianwen.goal-list.v1` projection. The existing
detail command remains unchanged:

```text
tianwen status --goal <goal-id> --data-dir <absolute-tianwen-data-dir>
```

`list` reports each persisted Session's current Goal with:

- Goal id, objective, phase and round progress;
- last durable update time;
- owning Session id and event count;
- an explicit read-only Runtime marker with zero model requests.

It does not show raw Session events, prompts, messages, tool arguments/results,
Evidence details, Champion details or workspace paths. Those details either
remain private or belong to the existing one-Goal status projection.

## Installed invocation

The formal Profile installs the Runtime Bundle under:

```text
D:\DevData\tianwen\dsh-home\profiles\tianwen\node_modules\@tianwen\runtime-bundle
```

Example:

```powershell
& 'D:\DevData\tianwen\dsh-home\profiles\tianwen\node_modules\.bin\tianwen.CMD' `
  list `
  --data-dir 'D:\DevData\tianwen' `
  --json
```

Human output prints the most recently updated Goal first, one line per Goal.
Persisted objective whitespace is collapsed only for the human one-line view;
JSON preserves the exact objective. Empty state succeeds with `No Goals.` or
`goals: []`.

## Authority and behavior

The existing status module now has one private shared scanner based only on
public DSH `0.1.0-rc.6` package-root APIs:

- `JsonlSessionPersistence.list()`;
- `JsonlSessionPersistence.inspect()`;
- `foldGoal()`.

`listGoals()` maps those strict replay snapshots to compact summaries. It
orders them by `updatedAt` descending, then Goal id and Session id ascending.
Sessions without a current Goal are ignored. Duplicate current Goal ids fail as
ambiguous, and any structurally damaged Session fails as an integrity error.

The scanner performs no append, flush, pointer repair, Agent construction,
Goal mutation or model call. Before/after tests compare every Session/Evolution
file and byte. Missing Session state returns an empty projection without
creating the sessions directory.

The prior `tianwen.goal-status.v1` contract remains intact. A legal duplicate
of an unrelated Goal id does not make a different Goal's status ambiguous;
strict structural replay failures retain the old fail-closed behavior.

## Packaging

No package, dependency or CLI framework was added. The existing
`@tianwen/runtime-bundle` continues to publish one `tianwen` bin and one
`./status` public entry. The already packed `status.js` and `cli.js` now include
the list projection and dispatch branch.

Formal archive:

```text
D:\DevData\tianwen\packs\tianwen-runtime-bundle-0.0.0.tgz
sha256:e885e9dfea2af4e6acb194328a83eb8d174e2e54ec408c38a1f2686c934b321d
```

## Formal installed Profile proof

The strict offline E2E performed one sequence:

1. build and pack the Runtime Bundle;
2. install it into the isolated formal DSH Profile;
3. run the existing scripted Tianwen smoke once;
4. persist its Goal and Session;
5. execute installed `status --goal ... --json`;
6. execute installed `list --data-dir ... --json`;
7. re-read Session/Evolution bytes and durable events after both commands.

The data root intentionally retained older Sessions. The proof finds the
current run by its exact Goal id and requires exactly one matching summary; it
does not assume the target Goal is the first or only row.

Observed list result for the current run:

- Goal phase: `complete`;
- Session event count: `45`;
- model steps before list: `4`;
- model steps after list, recomputed from post-command Session bytes: `4`;
- Session and Evolution state: byte-for-byte unchanged;
- Runtime marker: `not-loaded`, `readOnly=true`, `modelRequests=0`.

Receipt:

```text
D:\DevData\tianwen\receipts\phase4-goal-list-receipt.json
sha256:f9373de1d63ee9feffd2d5160f3cbf7612d4331fba8cbaf88cffe6589e9a9282
```

## Commits

- `d600326` `docs: plan read-only goal list`
- `c9cbf1a` `feat: project read-only goal list`
- `eaf66d4` `feat: add read-only goal list command`
- `e6dfe93` `test: prove installed read-only goal list`
- `920ceb3` `fix: select current goal in installed list proof`

The commit containing this document is the canonical final phase head.

The same design/plan is archived on `main` by commit `7c44e8c`.

## Verification

All valid final gates used exact implementation HEAD `920ceb3`; this handoff
changes no product or test code.

| Gate | Result |
|---|---|
| offline frozen pnpm install | passed; already up to date; zero downloads |
| Runtime Bundle dependency build | passed |
| DSH closure | passed; 187 exact `0.1.0-rc.6` packages; 15 public surfaces |
| private DSH imports | 0 violations |
| workspace typecheck | passed |
| default Node suite | 101 passed, 8 expected skips in 57.94 s |
| installed Profile E2E | 2 passed in 83.76 s |
| Windows local sandbox gate | 3 passed in 1.09 s |
| Python A1-A5 author proof | 10 passed in 4.13 s |
| foreground full Python suite | 424 passed, 4 expected skips in 158.55 s |
| Ruff | all checks passed |
| base-to-HEAD `git diff --check` | passed |
| final code status | clean |
| independent whole-phase review | Critical 0, Important 0; Ready |

The first default Node invocation omitted two required, previously established
test environment variables (`TIANWEN_DSH_PROBE_ROOT` and
`TIANWEN_DSH_PROBE_PYTHON`). It failed in test setup before product assertions
and is not acceptance evidence. The corrected fixed D-drive environment was
then run once and produced the valid 101/8 result above.

The 360 developer exclusions configured by the user materially fixed the prior
host slowdown: A1-A5 fell from about 291 seconds to 4.13 seconds, and the full
Python suite fell from 8060 seconds to 158.55 seconds.

No paid model, API key, live web/search, real Docker, private DSH source import,
automatic promotion, Runtime cutover or interactive DSH UI was used. The only
upstream Windows `shell:true` remains the previously accepted fixed offline DSH
Profile installation exception; it did not spread into Tianwen runtime code.

## Review history and retained Minor

Task 1 review found one Important compatibility regression: the first shared
scanner made an unrelated duplicate Goal id break `status(A)`. Validation was
moved to the correct caller and regression-tested. A technically incorrect
follow-up assumption about ignoring structurally invalid unrelated Sessions was
rejected after checking the actual rc.6 strict fold; the temporary fallback was
removed.

Whole-phase review found one Important E2E assumption that the list contained
only the new Goal. The proof now matches by exact Goal id and supports retained
history. Final scoped re-review reported Critical 0 / Important 0 / Minor 0 for
that repair.

One non-blocking CLI Minor remains: an unexpected, unclassified `list` failure
uses the inherited fallback wording `unable to read Goal status`. Known list
errors already use their specific messages. Changing the shared fallback would
alter existing status wording; under ponytail this is recorded instead of
adding another branch solely for a rare diagnostic.

## Known boundaries

- DSH remains pinned to Developer Preview `0.1.0-rc.6`.
- The first version scans all persisted Session snapshots; it adds no index
  until measured scale requires one.
- The projection is point-in-time while another process may append afterward.
- Windows local sandbox remains partial. Its verified report is
  `sha256:ddcc714a9b30896f380cba20a29530cc633cfa874ec4dea890c4a7c3ef498ef1`;
  high-risk execution still needs container/remote/microVM isolation.
- Same-process Profile plugins remain reviewed, versioned trusted code for v1.
- Python Runtime and A1-A5 remain preserved; no migration cutover occurred.

## Recommended next phase

Use the same installed read contract to add the smallest explicit user action,
not a desktop panel. The recommended next slice is a single guarded
`tianwen resume --goal ...` command that requires an exact Goal id and only
operates after an explicit user invocation. Design its write/approval contract
before implementation. Do not add a dashboard, watcher, database or broad
control API yet.
