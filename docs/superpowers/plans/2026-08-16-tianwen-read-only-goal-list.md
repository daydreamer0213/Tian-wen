# Tianwen Read-only Goal List Implementation Plan

> Execute with current-turn subagent development, TDD, scoped independent
> review, ponytail scope, and low-load serial final gates.

**Goal:** Ship and prove the installed read-only discovery command
`tianwen list --data-dir PATH` while preserving the existing status contract.

**Base:** `c3ece065f246faaec31222593a8a5a8dc1ed5ec0`
(`codex/tianwen-read-only-goal-status`).

**Target branch:** `codex/tianwen-read-only-goal-list`

## Global constraints

- Keep Python Runtime, A1-A5 and existing DSH migration behavior unchanged.
- Do not merge or cut over `main`.
- Use exact public DSH `0.1.0-rc.6` package-root APIs.
- No paid model, live web/search, real Docker or private DSH source import.
- Put cache, store, temp, Profile and receipt data on `D:\DevData`.
- Do not add a package, CLI framework, database, index, daemon, event bus or UI.
- Treat reviewed same-process plugins as trusted under the accepted v1 model.
- Run expensive final gates strictly serially because antivirus scanning can
  make Python subprocess tests unusually slow.

## Task 1: Shared durable Goal scan and list projection

**Files:**

- Modify: `packages/tianwen-runtime-bundle/src/status.ts`
- Modify: `tests/dsh-migration/goal-status.spec.ts`

### Step 1: Write focused RED tests

Add tests for:

- multiple current Goals, deterministic recent-first ordering and tie breaks;
- exact `tianwen.goal-list.v1` fields;
- empty/missing Session root success without state creation;
- Session without a Goal ignored;
- duplicate Goal id rejected;
- malformed/incomplete replay rejected;
- repeated projection and complete product-tree bytes unchanged;
- existing status projection remains unchanged.

Confirm RED is the missing `listGoals` export, not environment setup.

### Step 2: Implement the smallest shared scanner

Extract only the Session list/inspect/fold logic already present in
`readGoalStatus()`. Return validated in-memory snapshots, reject duplicate
current Goal ids, and dispose the temporary Context. Map them through a new
`listGoals({dataDir})` projection.

Do not move Champion replay, add storage, or expose raw events publicly.

### Step 3: Focused GREEN and scoped review

Run the focused test and typecheck. Review projection fields, ordering,
read-only proof, raw-data leakage and accidental complexity. Close all open
Critical/Important findings before Task 2.

## Task 2: Extend the installed CLI

**Files:**

- Modify: `packages/tianwen-runtime-bundle/src/cli.ts`
- Modify: `tests/dsh-migration/goal-status.spec.ts`
- Modify package/build tests only when a real packaging assertion requires it.

### Step 1: Write CLI RED tests

Prove exact grammar, deterministic human and JSON output, empty output, invalid
option exit 2, integrity exit 1, and unchanged `status --goal` behavior.

### Step 2: Implement with the existing Node bin

Add one positional dispatch branch and one short text formatter. Continue using
`node:util.parseArgs`; do not add a command framework. Keep JSON as canonical
single-line `JSON.stringify(...) + LF`.

### Step 3: Package-focused GREEN and review

Build the Runtime Bundle, run focused list/status and package closure tests,
then review CLI behavior and packed-file boundaries. Close all Critical and
Important findings.

## Task 3: Installed Profile proof and handoff

**Files:**

- Modify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`
- Create: `docs/operations/tianwen-read-only-goal-list-handoff.md`

### Step 1: Extend the existing installed Profile E2E

After the existing persisted Goal/status proof:

1. run installed `tianwen list --data-dir ... --json` once;
2. assert the existing Goal is discoverable with exact summary fields;
3. re-read durable Session events and compare all product bytes;
4. prove model request/step counts remain unchanged;
5. write one D-drive list receipt without placing it in product state.

Do not launch a second Runtime smoke solely for list.

### Step 2: Independent whole-phase review

Review base-to-HEAD for public API use, read-only authority, stable projection,
existing status compatibility, packaging closure and hidden scope expansion.
Readiness requires zero open Critical and zero open Important findings.

### Step 3: Low-load serial final gates

1. offline frozen pnpm install with zero downloads;
2. Runtime Bundle build;
3. closure, private-import and workspace typecheck;
4. default Node suite;
5. one installed Profile E2E;
6. one explicit Windows local sandbox gate;
7. Python A1-A5 author proof;
8. foreground full pytest;
9. Ruff;
10. base-to-HEAD diff check and clean status.

Stop at the first real failure. Do not parallelize expensive Python/Node gates.

### Step 4: Handoff and push

Record branch/SHA, command examples, output schema, installed archive/receipt,
read-only evidence, all gates/reviews, retained risks and non-goals. Commit and
normally push the dedicated branch. After controller acceptance, update the
master-session memory on `main` in a separate docs-only commit. Do not merge the
feature branch to `main` without an explicit cutover decision.
