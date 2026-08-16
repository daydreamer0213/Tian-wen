# Tianwen Explicit Goal Resume Implementation Plan

> Execute with current-turn subagent development, TDD, scoped independent
> review, ponytail scope, and low-load serial final gates.

**Goal:** Ship and prove the installed user command
`tianwen resume --goal GOAL_ID --data-dir ABSOLUTE_PATH`. The command must
reuse the installed DSH Profile and public Goal/Session/Agent services, perform
all read-only validation before the first durable mutation, and start work only
because the user explicitly invoked the command.

**Base:** `62020d2b94eec1b12e8dfa31dcd1e8682662d1d0`
(`codex/tianwen-read-only-goal-list`).

**Target branch:** `codex/tianwen-explicit-goal-resume`

## Design decision

Use the exact public `@deepseek-ai/dsh@0.1.0-rc.6` CLI that owns the installed
formal Profile. The installed `tianwen` package anchors `createRequire()` at
`<data-dir>/dsh-home/profiles/tianwen/package.json`, resolves the DSH package
through the public Profile fallback, validates its declared `bin.dsh`, and
invokes it with fixed Node + argv and `shell:false`. Do not add a duplicate DSH
CLI dependency, search `PATH`, accept a caller-supplied executable, copy Profile
boot code, or build another runtime.

The command performs this exact sequence:

1. reuse the existing durable Goal scanner to locate one exact Goal and its
   owning Session;
2. reject missing, duplicate, corrupt, complete, or round-exhausted state
   before loading the Profile;
3. invoke the existing installed `tianwen` Profile with `DSH_HOME` bound to
   `<data-dir>/dsh-home` and a fixed set of Tianwen-owned resume values;
4. pass the Runtime Bundle's fixed packaged `resume.patch.yml` as the final
   launcher overlay; it disables the ordinary headless startup/runner, binds
   Session/evolution roots to this data directory, and enables
   `@tianwen/runtime-bundle/resume-runner` only for that child invocation;
5. let the runner resume the persisted Session through `ctx.agents.resume()`,
   recheck the same Goal id/revision/round budget while it is still disarmed,
   and call public `ctx.goals.resume()` exactly once;
6. wait for the Goal driver to settle to a disarmed outcome, flush the Session,
   return a small receipt, dispose the Profile tree, and exit.

The installed Profile remains the authority for model route, tools, settings,
credentials and plugins. The child values contain only the already
validated Goal id, owning Session id, output mode and an unguessable invocation
nonce. The final fixed overlay binds only the existing Session and evolution
rows to the requested data directory. No generated or temporary patch file and
no new persisted configuration layer is created.

Preflight failures must add zero Session events and make zero model requests.
Once the explicit resume event has been durably accepted, a later model/tool
failure is retained as ordinary Session/Goal history rather than rolled back or
misreported as a preflight failure.

## Global constraints

- Keep Python Runtime, A1-A5 and all existing read-only CLI contracts.
- Do not merge or cut over `main`.
- Use exact public DSH `0.1.0-rc.6` package-root APIs.
- No automatic restart, watcher, scheduler, daemon, database, queue or UI.
- No paid model, live web/search, real Docker or private DSH source import.
- Put cache, store, temp, Profile and receipt data on `D:\DevData`.
- Treat reviewed same-process Profile plugins as trusted under the accepted v1
  model; do not add token/capability/process-isolation machinery.
- Do not add a CLI framework or duplicate DSH Session/Goal state.
- Run expensive final gates strictly serially.

## Task 1: Resume preflight and fixed Profile launcher

**Files:**

- Create: `packages/tianwen-runtime-bundle/src/resume.ts`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Create: `packages/tianwen-runtime-bundle/resume.patch.yml`
- Modify: `packages/tianwen-runtime-bundle/src/cli.ts`
- Modify: `pnpm-lock.yaml`
- Create: `tests/dsh-migration/goal-resume.spec.ts`

### Step 1: Write focused RED tests

Prove that preflight:

- returns the exact unique Goal/Session authority for an active, paused, or
  blocked Goal with remaining rounds;
- rejects missing, duplicate, malformed, complete and exhausted Goals;
- leaves the complete data tree byte-identical on every rejection;
- does not load a Profile or call a model on rejection;
- keeps `status` and `list` behavior unchanged.

Confirm RED is the missing resume API/CLI branch, not environment setup.

### Step 2: Implement the smallest public Profile launcher

Add only the exact public agent setup package actually imported by the runner.
Resolve the Profile-owning DSH CLI through the Profile manifest anchor and
require exact version/bin shape, lexical/real containment and a regular file.
Invoke `process.execPath` + that fixed JS bin with `shell:false`, the installed
Profile name `tianwen`, and a child environment that inherits normal DSH
settings/credentials while overriding only `DSH_HOME` and Tianwen's fixed
resume values.

The packaged overlay must use exact row ids. It disables only
`headless-startup` and `headless-runner`, replaces only the existing Session
and Tianwen evolution root configs, and inserts one fixed
`tianwen-resume-runner` row. Normal Profile invocations never receive this
overlay, so their historical headless behavior stays byte-for-byte unchanged.
Do not generate YAML or accept a caller-supplied patch/package/command path.

### Step 3: Focused GREEN and scoped review

Run the focused test, Runtime Bundle build and workspace typecheck. Review
preflight ordering, root binding, public API use, error behavior and unnecessary
machinery. Close all Critical/Important findings.

## Task 2: In-Profile resume runner and receipt

**Files:**

- Create: `packages/tianwen-runtime-bundle/src/resume-runner.ts`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `packages/tianwen-runtime-bundle/src/smoke.ts` only for the fixed
  offline resumed-Goal response used by acceptance
- Modify: `tests/dsh-migration/goal-resume.spec.ts`
- Modify package tests only for real export/packlist/metafile assertions.

### Step 1: Write runner RED tests

Using public DSH services, prove:

- Session restore alone leaves Goal activation disarmed and request count 0;
- runner rechecks exact Goal id/revision/session and remaining budget;
- a mismatch fails before `goals.resume()` and adds no events;
- one explicit call appends one resume edge, then the existing Goal driver owns
  continuation;
- the runner waits for a disarmed final state, flushes, and returns exact event
  and model-request deltas;
- no second resume call, direct JSONL append, or custom loop exists.

### Step 2: Implement one small runner plugin

Mount a single Profile plugin that uses `agentDefaultModel`, `agents`, `goals`
and `sessions`. Resume the Session with the Profile's current model selection,
install that selection on the Agent, validate the recovered Goal, call
`goals.resume()` once, observe its durable settlement, flush, and resolve a
process-facing receipt through stdout before asking the public DSH launcher to
exit. The package must publish the exact `./resume-runner` export and packed JS
file, and installed E2E must resolve/import that packed export.

Use the DSH launcher's existing bounded shutdown and signal handling. The
runner still owns `try/finally` Agent-handle cleanup and reports a clear runtime
error when Profile loading, Session recovery, model execution or flush fails.

### Step 3: Focused GREEN and review

Run focused tests and package build checks. Close all Critical/Important
findings before installed acceptance.

## Task 3: Installed CLI proof and handoff

**Files:**

- Modify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`
- Create: `docs/operations/tianwen-explicit-goal-resume-handoff.md`

### Step 1: Extend the existing installed Profile E2E

In the already installed formal Profile proof:

1. create and flush one resumable persisted Goal through the existing public
   DSH test harness, then dispose that harness;
2. run the installed `tianwen resume` once with the fixed offline adapter;
3. prove one exact resume event, Goal-round request(s), final disarmed Goal,
   unchanged Champion, and a structured command receipt;
4. prove a second exhausted/complete invocation fails before new events or
   model requests;
5. retain previous startup, status and list receipts and contracts.

Do not call a paid model or start a second Profile solely for read-only checks.
Snapshot only formal Session/Evolution product roots for zero-effect assertions;
exclude caches, diagnostic logs and test temporary directories.

### Step 2: Independent whole-phase review

Review base-to-HEAD for explicit user authority, preflight-before-mutation,
public DSH APIs, Profile fidelity, Session/Goal ownership, deterministic receipt,
package closure and hidden scope expansion. Readiness requires zero open
Critical and zero open Important findings.

### Step 3: Low-load serial final gates

1. offline frozen pnpm install with zero downloads;
2. Runtime Bundle build;
3. closure, private-import and workspace typecheck;
4. focused resume tests;
5. default Node suite;
6. one installed Profile E2E;
7. one explicit Windows local sandbox gate;
8. Python A1-A5 author proof;
9. foreground full pytest;
10. Ruff;
11. base-to-HEAD diff check and clean status.

Stop at the first real failure and diagnose it before retrying. Do not
parallelize expensive Python/Node gates.

### Step 4: Handoff and push

Record branch/SHA, command examples, receipt schema, accepted failure
semantics, installed archive/receipt, all gates/reviews, retained risks and
non-goals. Commit and normally push the dedicated branch. After controller
acceptance, update the master-session memory on `main` in a separate docs-only
commit. Do not merge the feature branch without an explicit cutover decision.
