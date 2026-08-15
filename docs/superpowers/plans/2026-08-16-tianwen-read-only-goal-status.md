# Tianwen Read-only Goal Status Implementation Plan

> Execute with subagent-driven development, strict TDD, scoped independent
> review, and low-load serial final gates.

**Goal:** Ship and prove the first installed, read-only Tianwen control command:
`tianwen status --goal GOAL_ID --data-dir PATH`.

**Base:** `327327108f2f4666a99824e5aeaaaccace5afdc6`
(`codex/tianwen-dsh-migration-phase-2`).

**Target branch:** `codex/tianwen-read-only-goal-status`

## Global constraints

- Keep Python Runtime and A1-A5 unchanged.
- Do not merge or cut over `main`.
- Do not call a paid model, live web/search, or real Docker.
- Use exact public DSH `0.1.0-rc.6` package-root APIs; no private source import.
- Put caches, stores, temporary roots and generated profiles on `D:\DevData`.
- Do not add a CLI framework, database, daemon, event bus, UI framework, or new
  workspace package.
- Final expensive gates run strictly serially.

## Task 1: Build the pure read-only status projection

**Files:**

- Create: `packages/tianwen-runtime-bundle/src/status.ts`
- Create: `tests/dsh-migration/goal-status.spec.ts`
- Modify only if required for public root imports:
  `packages/tianwen-dsh-compat/src/runtime.ts`

### Step 1: Write RED projection tests

Cover:

- one Goal projection with deterministic ordered fields;
- Evidence exposes only tool name/status and counts;
- Champion is the last formal promote/rollback transition;
- no Champion when both ledger and pointer are absent;
- mismatched or malformed ledger/pointer fails;
- duplicate current Goal id in two Sessions fails ambiguous;
- private prompt, message, argument and result fixture strings never appear.

Run only:

```powershell
pnpm exec vitest run tests/dsh-migration/goal-status.spec.ts
```

Confirm RED is missing status exports, not setup failure.

### Step 2: Implement the minimal projection

Use standard library plus:

- public `JsonlSessionPersistence.list/inspect`;
- public `foldGoal`;
- existing `projectEvidence`;
- narrow read-only ledger/pointer parser.

Do not instantiate `AgentLoop`, `GoalService`, `EvolutionLedger`, a model
Adapter, or a Dynamic plugin runner.

### Step 3: Prove exact read-only behavior

Create a real temporary JSONL Session fixture under `D:\DevData`, dispose its
writer Context, snapshot every product-data path and byte, call the projection,
and compare the complete snapshot afterward. Include fresh-Context restart and
not-found coverage.

Expected GREEN: focused Task 1 tests pass; typecheck and Ruff are clean.

### Step 4: Scoped independent review

Review only Task 1 for:

- raw-data leakage;
- accidental Agent/model activation;
- state writes or pointer repair;
- authority mismatch;
- unnecessary abstraction.

Close all Critical/Important findings before Task 2.

## Task 2: Ship the `tianwen` bin in the Runtime Bundle

**Files:**

- Create: `packages/tianwen-runtime-bundle/src/cli.ts`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `packages/tianwen-runtime-bundle/tsconfig.json` only if required
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `tests/dsh-migration/goal-status.spec.ts`
- Modify: `pnpm-lock.yaml` only for exact direct public DSH dependencies

### Step 1: Write RED CLI and package tests

Prove:

- required grammar and concise usage errors;
- deterministic text and `--json` output;
- not-found and malformed-state exits;
- `bin.tianwen` points to `dist/cli.js`;
- tarball contains only approved status/CLI additions;
- built entries contain no private source, probe helper or unrelated workspace
  input.

### Step 2: Implement with Node standard library

Use `node:util.parseArgs`; do not add Click/Typer/yargs/commander/Rich/Ink.
Write stdout/stderr directly and set a stable process exit code.

Build `status.ts` and `cli.ts` through the existing Runtime Bundle build. Keep
all Tianwen implementation self-contained in the tarball and list the exact
public DSH runtime dependencies in the package manifest.

### Step 3: Focused GREEN

Run:

```powershell
pnpm --filter @tianwen/runtime-bundle... build
pnpm exec vitest run tests/dsh-migration/goal-status.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
pnpm run typecheck
pnpm run check:dsh
pnpm run check:dsh:private-imports
```

### Step 4: Scoped independent review

Review package closure, CLI grammar, deterministic output, no-state-change
proof and ponytail scope. Close all Critical/Important findings.

## Task 3: Prove the installed formal Profile path

**Files:**

- Modify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`
- Create: `docs/operations/tianwen-read-only-goal-status-handoff.md`

### Step 1: Extend the existing Phase 2 E2E

After the existing offline smoke finishes and flushes its Session:

1. resolve the installed Runtime Bundle bin from the Profile;
2. snapshot Session, ledger and Champion bytes;
3. run fixed Node + `dist/cli.js status --goal ... --data-dir ... --json`;
4. assert the exact Goal, Session, Evidence and Champion projection;
5. assert no second model request and byte-for-byte unchanged durable state;
6. assert no secret message, argument or result text in output.

Do not start a second smoke run just for status.

### Step 2: Whole-phase review

Review base-to-HEAD for architecture conformance, package closure, read-only
proof, deterministic user output and hidden scope expansion. Final readiness
requires 0 open Critical and 0 open Important findings.

### Step 3: Final serial gates

Use the same D-drive and offline environment proven in Phase 2:

1. offline frozen pnpm install, 0 downloads;
2. Runtime Bundle build;
3. closure/private-import/typecheck;
4. default Node suite;
5. one explicit installed Profile E2E;
6. one Windows local sandbox gate;
7. Python A1-A5 author proof;
8. foreground full pytest;
9. Ruff;
10. base-to-HEAD `git diff --check` and clean status.

If any gate fails, stop on the first root cause. Do not run later expensive
gates and do not hide environment preparation inside final offline evidence.

### Step 4: Handoff and push

The handoff records:

- branch and exact SHA;
- command examples and output schema;
- installed tarball/bin evidence;
- no-state-change hashes;
- all final gates and reviews;
- retained risks and non-goals;
- recommendation for the next user-facing projection only after real use.

Commit and normally push the dedicated branch. Do not merge to `main` without
an explicit cutover decision. Update the master-session memory on `main` in a
separate docs-only commit after controller acceptance.
