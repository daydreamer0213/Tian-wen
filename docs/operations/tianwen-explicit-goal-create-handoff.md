# Tianwen Explicit Goal Create Handoff

**Date:** 2026-08-16

**Status:** Complete

## Outcome

The installed Tianwen CLI now has a minimal explicit Goal ingress:

```powershell
tianwen create --objective "Build the project" --data-dir D:\DevData\tianwen
```

The command creates one top-level Goal and one JSONL-backed DSH Session. It
does not start a Goal round or request a model. The user can inspect it with
the existing `list` and `status` commands, then spend one round explicitly:

```powershell
tianwen resume --goal GOAL_ID --data-dir D:\DevData\tianwen
```

`--max-rounds` is optional and defaults to 3. Creating and running remain two
separate user decisions.

## Git scope

- Base: `95701d5838ee0a062f579788c8701326f0e5ef37`
  (`codex/tianwen-installer`).
- Branch: `codex/tianwen-goal-create`.
- Code-review HEAD: `80762c7ba257b53a509fb4db67fae19c40a57ad6`.

Commits before this handoff:

1. `103a81d` — `docs: plan explicit goal creation`;
2. `c2a56e7` — `feat: create durable Tianwen goals`;
3. `1cebab5` — `test: prove installed goal creation`;
4. `3dbbdcd` — `fix: complete goal create receipts`;
5. `80762c7` — `fix: quote goal resume instructions`.

The product diff adds only:

- the `create` CLI branch;
- one fixed shell-free DSH launcher;
- one fixed create runner and `create.patch.yml`;
- Runtime Bundle packaging for that runner and patch;
- focused and installed E2E coverage.

No daemon, scheduler, desktop UI, database, generic task API, automatic
resume, provider setup, paid-model path or new runtime was added.

## Runtime contract

The CLI validates an absolute data directory, non-empty objective and positive
safe-integer round budget before loading the installed Profile. It resolves the
same exact installed DSH `0.1.0-rc.6` host used by `resume`, and launches it via
`process.execPath` with fixed argv and `shell:false`.

The create-only patch:

- binds the existing JSONL Session root and Tianwen Evolution root;
- disables `headless-startup`, `headless-runner` and `goal-round-driver`;
- inserts only `@tianwen/runtime-bundle/create-runner`.

The runner uses the Profile's current model selection only to form a normal
Agent identity. It records the invoking working directory as Session `cwd`,
creates the Goal, requires `ctx.sessions.flush()` to confirm a persistence
listener accepted the Session, and returns `tianwen.goal-create.v1` only when
the model-request delta is exactly zero.

The non-JSON receipt prints a directly runnable PowerShell `resume` command.
Its data directory uses a single-quoted PowerShell literal and doubles embedded
single quotes, so paths containing `$()` are not expanded.

## TDD evidence

The first valid RED was the missing `src/create.js` import after existing
workspace dependencies had been built. The minimum implementation then made
the focused create suite green.

Later executable REDs proved and closed three integration gaps:

1. a recovered Session lacked `cwd`, causing DSH prompt assembly to fail before
   the model request; the runner now persists `process.cwd()`;
2. a mocked `flush() === false` previously returned a success receipt; it now
   throws `Session persistence is unavailable`;
3. a PowerShell path containing `$()` and `'` was not safely copyable from the
   human receipt; single-quote escaping now preserves it exactly.

The final focused create and Runtime Bundle result is 25 passed.

## Installed E2E

The real installed test replaced the previous private test fixture with the
actual user path:

1. repeat the offline installer into
   `D:\DevData\tianwen-installer-e2e`;
2. run installed `tianwen create --max-rounds 1 --json`;
3. prove one Goal change, zero request headers, zero model steps and unchanged
   Evolution/Champion bytes;
4. find the Goal with installed `list` and `status`;
5. run installed `resume` once through the fixed offline adapter;
6. prove a second resume fails without changing state.

The final installed E2E passed 1/1 in 221.90 seconds. Its receipt recorded:

- Goal revision 1, phase `active`, rounds started 0, budget 1;
- Session event count 1;
- model request delta 0.

Artifacts from that run:

- create receipt SHA-256:
  `eb294a831c026f5caed2edc4dca1df4c6ca523488311bf2d2ae605688c51f3b2`;
- resume receipt SHA-256:
  `bdeaff4fd2e519e625912b42a7abc9cc2359244b0f2821fc222c6a3009cb2c3a`;
- Runtime Bundle archive SHA-256:
  `7c6c8513b03b196dbaade706ecf2e2e48361744e174bafd0b7e39dc1c0e8379c`.

The later `80762c7` change affects only non-JSON PowerShell instruction
formatting. Its focused, package typecheck and full Node gates were rerun; the
JSON installed path above is unchanged.

## Final verification

All heavy commands were serialized. Generated data, caches and virtual
environments remained on `D:`.

- offline frozen pnpm install: already up to date, zero downloads;
- DSH closure: 187 exact rc.6 packages, 15 public surfaces;
- private DSH imports: 0 violations;
- TypeScript project build/typecheck: passed;
- focused create + Runtime Bundle: 25 passed;
- exact code-HEAD default Node suite: 143 passed, 7 planned skips;
- installed create/list/status/resume E2E: 1 passed;
- Windows local sandbox gate: 3 passed; report SHA-256
  `ddcc714a9b30896f380cba20a29530cc633cfa874ec4dea890c4a7c3ef498ef1`;
- A1-A5 author proof: 10 passed;
- foreground Python suite: 424 passed, 4 planned skips;
- Ruff: all checks passed;
- base-to-HEAD diff check: clean after removing one trailing documentation
  blank line.

The Python/Ruff gate ran immediately before the final TypeScript-only
PowerShell quoting commit. No Python file, dependency or Alpha authority
changed; the exact final code HEAD then reran the focused, typecheck and full
Node gates.

## Review

Two current-turn subagents reviewed the phase without editing it:

- correctness review initially found three Important items: unconfirmed
  Session flush, an incomplete human resume command, and a contract mismatch
  around duplicate options;
- the flush and human command issues were fixed with executable RED/GREEN;
  duplicate options retain `node:util.parseArgs` standard last-value behavior,
  and the design was simplified from “exactly once” to “required”;
- narrow re-review found one further Important PowerShell quoting issue, which
  was fixed and re-reviewed;
- final correctness result: Critical 0, Important 0;
- ponytail review found no medium/high over-engineering. Its useful reductions
  removed the speculative future `start` paragraph and the unnecessary full
  UUID-v4 format gate. The duplicate defensive test cleanup was not expanded
  into a cleanup framework.

## Environment events

- A first offline install command pointed pnpm at the wrong D-drive store and
  failed before installation; the explicit audited `--store-dir` path then
  reused all 576 packages with zero downloads.
- A wrapper typecheck attempted pnpm's dependency-status auto-check through a
  system Corepack path. The final gate invoked the installed TypeScript compiler
  directly with the same tsconfig set.
- One full Node attempt omitted the two pre-existing probe environment
  variables and failed only in test setup. The correctly configured final suite
  passed 143/7.
- Installed E2E runs took about 220 seconds because installer/process scanning
  remained slower than ordinary tests. Only one heavy instance ran at a time.

## Retained limits

- DSH remains pinned to Developer Preview `0.1.0-rc.6`.
- `create` records the Goal; it deliberately does not run it. The user must
  issue `resume` explicitly.
- the Session workspace is the directory from which the user invokes
  `tianwen create`; there is no workspace-picker UI yet.
- the round budget limits Goal rounds, not model tokens or provider cost.
- Windows local sandbox remains partial; high-risk workloads still need a
  container, remote sandbox or microVM.
