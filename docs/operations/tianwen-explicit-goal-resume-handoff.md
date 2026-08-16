# Tianwen explicit Goal resume handoff

## Outcome

This phase adds the first deliberately mutating Tianwen CLI command:

```text
tianwen resume --goal GOAL_ID --data-dir ABSOLUTE_PATH [--json]
```

The command is explicit user authority. It does not create a daemon, scan and
resume Goals automatically, or change Champion/evolution state. It finds one
durable Goal, rejects an invalid target before loading DSH, then asks the
installed Tianwen Profile to run exactly one Goal round and waits for durable
settlement.

Branch: `codex/tianwen-explicit-goal-resume`

Base: `62020d2b94eec1b12e8dfa31dcd1e8682662d1d0`

Implementation commit: `55d0fb979ccee8d4578ec50016969f06eeb598fc`

The commit containing this document is the canonical phase handoff head.

## What was implemented

- `preflightGoalResume()` reuses the durable Session/Goal scanner and returns
  the exact Session id, Goal revision and data roots.
- Missing, duplicate, corrupt, complete and round-exhausted Goals fail before
  Profile startup, model requests or durable mutations.
- The CLI starts the exact public `@deepseek-ai/dsh@0.1.0-rc.6` host with fixed
  Node argv and `shell:false`.
- DSH is deployed once under `<data-dir>/dsh-host`; it is not reinstalled inside
  its own Profile and the launcher cannot fall back to the source worktree.
- A narrow packaged overlay disables the ordinary headless startup/runner only
  for this invocation and inserts one `tianwen-resume-runner`.
- The runner recovers the exact Session, checks the Goal id/revision/budget and
  disarmed state, calls `GoalService.resume()` once, waits for settlement,
  flushes JSONL, and emits one deterministic receipt.
- A model/tool failure that leaves the Goal `active + disarmed` is reported as
  failure instead of being mistaken for success.
- The scripted offline adapter now understands the real DSH ordering where
  runtime-context and Goal-complete plugin messages may follow the model/tool
  messages it needs to inspect.

The host deployment recipe is intentionally only one package manifest with one
exact DSH dependency. There is no second launcher framework or custom app boot.

## Installed proof

The formal installed Profile E2E used:

```text
D:\DevData\tianwen\dsh-host
D:\DevData\tianwen\dsh-home\profiles\tianwen
D:\DevData\tianwen\receipts\phase5-goal-resume-receipt.json
```

The resolved CLI was
`D:\DevData\tianwen\dsh-host\node_modules\@deepseek-ai\dsh\lib\bin.js`,
with package version exactly `0.1.0-rc.6`. The E2E asserts that its real path is
inside the installed host and outside the source repository.

One explicit command produced:

- one `resume` Goal transition;
- one Goal round;
- two model steps (tool call, then final answer) inside that round;
- final Goal phase `complete`, revision `3`, `roundsStarted=1`;
- no Champion change and no evolution transition.

Running the same command again returned exit code `1` with `Goal is complete`
and left Session and evolution bytes unchanged.

The machine receipt uses schema `tianwen.goal-resume-e2e.v1`. The command's
user-facing JSON uses schema `tianwen.goal-resume.v1` and reports the final Goal,
Session event counts and model-step delta.

## Verification

All acceptance work was serial and local. No paid model, live web search,
network dependency download, real Docker or private DSH source import was used.

| Gate | Result |
|---|---|
| offline frozen pnpm install | passed; zero downloads |
| Runtime Bundle dependency build | passed |
| DSH closure | 187 exact rc.6 packages; 15 public surfaces |
| private DSH imports | 0 violations |
| workspace typecheck | passed |
| focused resume tests | 44 passed, 2 expected skips |
| default Node suite | 115 passed, 8 expected skips |
| installed Profile E2E | 2 passed in 48.99 s |
| Windows local sandbox gate | 3 passed in 1.07 s |
| Python A1-A5 author proof | 10 passed in 4.71 s |
| foreground full Python suite | 424 passed, 4 expected skips in 174.31 s |
| Ruff | all checks passed |
| independent final review | Critical 0, Important 0, Minor 0; Ready |

The installed-host repair had one valid RED: the original optional-peer
launcher resolved DSH from the development worktree. A new unit test first
failed because `resolveInstalledDshBin()` did not exist; after the smallest
implementation it passed, and the installed E2E proved the independent host.

Two setup-only failures are not product evidence:

- the first corrected default Node run used a Python executable outside the
  previously governed D-drive probe root; the governed path then passed;
- the first Python author-proof command named a D-drive temp directory before
  creating it; after creating that directory the proof passed.

Fresh DSH host deployment copies many small files. With 360 real-time scanning,
one formal attempt exceeded the old 120-second test timeout after reaching
531/531 packages. The deployment is now idempotent and the installation E2E has
a realistic first-install timeout; ordinary resume never redeploys the host.

## Review history

The first independent review found three Important proof/behavior gaps:

1. a failed model turn could leave `active + disarmed` and be reported as
   success;
2. the launcher had no installed-path proof;
3. the preflight matrix did not directly cover all resumable phases.

All three were fixed with focused tests. A narrow re-review then found that the
optional peer still resolved from the source worktree. The final standalone
host repair closed that finding. Final review reported no Critical, Important
or Minor findings.

## Retained boundaries

- DSH remains pinned to Developer Preview `0.1.0-rc.6`.
- The installed Profile and standalone DSH host must exist before resume; a
  general end-user installer remains a later phase.
- This phase proves the offline scripted model route, not a paid provider.
- The Windows local sandbox is still partial; high-risk workloads still need a
  container, remote sandbox or microVM.
- There is no automatic resume, background scheduler, desktop UI, database,
  Goal-policy redesign, Champion promotion or Runtime cutover in this phase.
