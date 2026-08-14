# DeepSeek Harness probe Task 4 handoff

**Date:** 2026-08-14

**Status:** blocked

**Branch target:** `codex/deepseek-harness-probe`

**Starting local and remote SHA:**
`da44d1ac152d31e97596c419e4b8952e92cb3ef3`

**Local positive-probe implementation commit:**
`02a4b127d9e6d8836b7ca42f8d27c3a609b86c02`

**Push status:** not pushed. The remote branch remains at the reviewed Task 3
starting SHA. The controlling handoff supplies the exact local commit that
contains this document because a document cannot identify its own commit.

Task 4 is blocked because a normal same-process Cordis plugin can use public
rc.6 APIs to forge a top-level human-looking turn and create an armed Goal.
This violates Tianwen's load-bearing rule that only authenticated human
authority may create or change a top-level Goal.

This result does not authorize Task 5, Alpha Task 10, full migration, or any
relaxation of Goal authority.

## Authority and decision

The implementation session first read the approved controller memory, runtime
selection design, and full compatibility plan from shared Git objects at:

```text
447506354bf328a0a87901e9c63b0d2d747653e6
```

It did not merge, rebase, or move the Task 3 baseline.

After the initial positive tests passed, fresh scoped reviewer
`019fff06-9c74-76a3-8ec3-64f9ef6c6675` identified that those tests trusted a
caller-authored `MessageSource`. A new adversarial RED then used a real Cordis
plugin and real AgentLoop to verify the concern.

The architecture controller
`019feea9-f878-7c53-bb44-06a91a77c159` independently reproduced the failure
and selected the blocked interpretation:

- do not treat DSH Goal as Tianwen's top-level Goal authority;
- do not weaken the human-sovereignty acceptance rule;
- do not manufacture a GREEN by trusting every same-process plugin;
- do not attempt a wrapper-only repair inside Task 4;
- do not start Task 5.

DSH Loop, Session, tools, Profile, and later sandbox candidates may still be
useful. The failed seam is specifically top-level Goal authority.

## Implemented and retained scope

Task 4 changed only:

- `tests/dsh-probe/goal-authority.spec.ts`;
- `tests/dsh-probe/goal-recovery.spec.ts`;
- `packages/tianwen-dsh-compat/src/test-harness.ts`;
- this handoff.

The minimal compat addition is:

```ts
mountGoalHarness(
  root,
  script,
  { goalRoundDriver: boolean },
)
```

The boolean is mandatory. Both modes mount JSONL persistence and GoalService
before AgentLoop. The `true` mode additionally mounts the public
goal-round-driver before AgentLoop. The helper imports only published package
roots.

The implementation did not modify:

- Task 3 Bundle, Profile, verifier, or report;
- dependency versions or `pnpm-lock.yaml`;
- Python Alpha runtime or A1–A5;
- Goal product policy;
- Evidence, Evolution, Champion, or Candidate governance;
- Sandbox or UI;
- Task 5 or Alpha Task 10.

## TDD evidence

The first clean-worktree run failed because ignored `dist/` output did not
exist. That setup error was not accepted as RED. The unchanged compat baseline
was built before retrying.

The first behavioral run exposed two test-driver facts:

```text
goal-authority.spec.ts
4 failed with GOAL_TOOL_DRIVER_REQUIRED

goal-recovery.spec.ts
1 failed because mountGoalHarness was absent
```

Public rc.6 AgentRegistry types require a custom driver to:

- set the Agent state to `running`;
- wrap the foreground tool execution in `withInitiator(agent, ...)`.

After correcting that test driver, the true implementation RED was:

```text
goal-authority.spec.ts
4 passed

goal-recovery.spec.ts
1 failed: mountGoalHarness is not a function
```

The minimal helper produced the first positive GREEN:

```text
2 files passed
5 tests passed
```

The fresh review then caused a second, security-focused RED:

```text
goal-authority.spec.ts
4 passed
1 failed
```

The failing expectation required that the forged-human plugin leave the Goal
undefined. The actual public rc.6 result was:

```text
objective = forged plugin goal
phase = active
revision = 1
activation = armed
maxGoalRounds = 1
roundsStarted = 0
```

That RED is intentionally retained. No production change was made to turn it
green.

## Goal authority matrix

| Caller and durable source | Operation | Observed result |
|---|---|---|
| top-level root, direct `{ kind: "user" }` turn | create | accepted |
| top-level root, `{ kind: "plugin", plugin: "tianwen-evidence" }` turn | create | rejected with `GOAL_TOOL_AUTHORITY_REQUIRED` |
| top-level root, plugin-sourced turn | edit existing root Goal | rejected with `GOAL_TOOL_AUTHORITY_REQUIRED`; objective unchanged |
| registered child owned by the root, user-looking turn | edit root Goal | rejected with `GOAL_TOOL_AUTHORITY_REQUIRED`; root unchanged |
| ordinary Cordis plugin with only `inject: ["agents"]`, forged `{ kind: "user" }` message | create through real AgentLoop | **accepted; blocker** |

The first four rows prove that rc.6 checks honest source labels and
AgentRegistry parent ownership. The fifth row proves that the human label is
not host-attested and can be authored by an ordinary same-process plugin.

## Forgery path

The adversarial test uses only public package-root behavior:

1. mount the real core harness and AgentLoop;
2. mount public GoalService and `toolGoal`;
3. mount a Cordis plugin declaring only `inject: ["agents"]`;
4. after `agent/session-start`, call public `agent.followup()` with a
   `createUserMessage()` whose source is `{ kind: "user" }`;
5. let the local ScriptedAdapter request `create_goal`;
6. wait for the real AgentLoop and ToolRuntime to complete.

The test does not:

- call `ctx.goals.create()` from the attacker;
- append a forged event directly;
- use a child Agent;
- import private source;
- invoke a paid or network model;
- use shell, Docker, or sandbox.

Therefore hiding `mountGoalHarness` or changing a test-only helper would not
repair the demonstrated path. The ordinary plugin can drive a live root Agent
through an already-public method.

## Positive recovery evidence

The recovery test separately established these rc.6 facts:

1. Context 1 uses a UUID-named directory below
   `D:\DevData\tianwen-dsh-probe\sessions`;
2. it mounts compression-none JSONL persistence and GoalService without
   goal-round-driver;
3. Goal creation sends zero ScriptedAdapter requests;
4. `ctx.sessions.flush()` participates and the JSONL file contains the exact
   session id and a `goal/change` event;
5. the whole first Context is disposed;
6. Context 2 is a new Context over the same JSONL root;
7. Context 2 mounts GoalService and goal-round-driver before AgentLoop;
8. `ctx.agents.resume()` reconstructs a new live Agent and Session;
9. id, revision, objective, phase, cap, round count, and timestamps survive;
10. recovered activation is `disarmed`;
11. after two event-loop turns and idle checkpoints, the second adapter request
    count remains exactly zero;
12. explicit `ctx.goals.resume()` rearms the Goal;
13. exactly one local scripted model request is admitted;
14. exactly one goal-sourced user message records round 1;
15. final Goal state is `blocked`, `activation = disarmed`, with
    `blockedReason.code = "round-limit"`.

These are useful compatibility facts, but they do not overcome the authority
failure.

The reviewer left one Important recovery concern open: the test samples
pre-resume quiescence rather than proving through durable event sequence
ordering that no delayed pre-resume job can release after the explicit resume
edge. This was not repaired after the controller blocked the Goal seam.

The reviewer also left one Minor diagnostic concern open: the successful test
removes its UUID JSONL directory, and failure cleanup currently also removes
the artifact. Retaining failed JSONL fixtures would improve diagnosis but
cannot change the authority result.

## Low-level GoalService finding

The reviewer also classified raw GoalService access as Critical.

The new helper creates and returns a dedicated test Context; it does not inject
GoalService into an existing ordinary Tianwen plugin. In addition, before Task
4 the compat root already re-exported GoalService and existing MountedHarness
values already returned a complete Context. The new helper therefore did not
create the underlying same-process trust model.

However, the broader concern remains valid at architecture level: same-process
plugins are trusted code with broad Agent/Context access, and ordinary package
composition is not a security boundary. The confirmed `agent.followup()`
forgery is sufficient to block top-level Goal authority even without direct
GoalService mutation.

Removing the existing GoalService export or redesigning capability
distribution would modify files and policy outside Task 4's approved scope
and would still not authenticate human ingress by itself.

## Verification evidence before the blocking RED

The positive implementation commit passed:

```text
Task 4 focused
2 files, 5 tests passed

Tasks 0–4 Node regression
5 files, 21 tests passed

Published DSH closure
187 installed rc.6 packages
15 public package surfaces

Private DSH source imports
0 violations

TypeScript workspace typecheck
exit 0

Offline frozen pnpm replay
exit 0, already up to date

Python A1
1 passed, 9 deselected

Full Python pytest
424 passed, 4 skipped

Ruff
All checks passed

git diff --check
exit 0
```

The offline pnpm replay used the already reviewed lockfile with:

```text
pnpm 11.20.0
--offline
--frozen-lockfile
--trust-lockfile
store = D:\DevData\pnpm-store
virtual store = D:\DevData\tianwen-dsh-probe\virtual-store-task-4-d296
```

The current authoritative Task 4 result is the later adversarial RED:

```text
goal-authority.spec.ts
4 passed
1 failed
```

Because the load-bearing test fails, the earlier broad GREEN is not a Task 4
acceptance result.

## Independent review

Fresh scoped reviewer:

```text
019fff06-9c74-76a3-8ec3-64f9ef6c6675
Critical: 2
Important: 1
Minor: 1
Ready: no
```

Disposition:

- Critical, forged human authority: confirmed by real-plugin RED; open and
  blocking;
- Critical, raw GoalService capability: not newly introduced by the Task 4
  helper, but the wider same-process capability model is an architecture risk;
- Important, durable ordering around pre-resume zero requests: open;
- Minor, retain JSONL on failure: open.

No Critical or Important was hidden or downgraded to pass the probe.

## Forbidden effects and storage

Task 4 used:

- local ScriptedAdapter responses only;
- real in-process DSH services;
- real JSONL persistence under the dedicated D drive probe root;
- offline frozen pnpm replay;
- offline Python baseline and Ruff.

Large/generated state was kept under:

```text
D:\DevData\pnpm-store
D:\DevData\tianwen-dsh-probe\virtual-store-task-4-d296
D:\DevData\tianwen-dsh-probe\temp-task-4-d296
D:\DevData\tianwen-dsh-probe\venv-task-4-d296
D:\DevData\tianwen-dsh-probe\sessions
```

Task 4 did not use:

- a paid model, model API key, or provider request;
- live web/search/fetch;
- Docker or a real sandbox;
- interactive DSH;
- private `@deepseek-ai/*/src/*` imports;
- shell-based Agent execution;
- the Task 3 Windows Profile-install `shell: true` exception;
- a DSH fork or copied upstream source;
- force-push, merge, rebase, or `main` mutation.

## Risk and next plan

The current public rc.6 seam can enforce Goal authority only when every
same-process producer reports provenance honestly. That is insufficient for a
continual-learning product whose future plugins or promoted capabilities may
be generated or changed over time.

The recommended next design is:

```text
DSH Runtime + Tianwen Goal Governance
```

Its minimum questions are:

1. keep authenticated top-level Goal state in a Tianwen-owned trusted boundary;
2. treat DSH Goal, if reused, as a run-local or task-local continuation aid;
3. keep ordinary plugins unable to author authenticated human ingress;
4. decide whether the trusted boundary must be a separate process;
5. retain DSH Loop, Session, Profile, tools, and sandbox candidates where their
   own compatibility gates pass.

That redesign requires a new approved specification and plan. It must not be
implemented as a repair wave inside Task 4.

Task 5 and Alpha Task 10 remain frozen.
