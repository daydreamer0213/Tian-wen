# DeepSeek Harness probe Task 4 handoff

**Date:** 2026-08-14

**Status:** complete for Task 4 under the approved trusted-plugin model

**Branch target:** `codex/deepseek-harness-probe`

**Starting local and remote SHA:**
`da44d1ac152d31e97596c419e4b8952e92cb3ef3`

The controlling handoff carries the exact final local and remote SHA because
this document cannot identify the commit that contains itself.

This result proves only Task 4. It does not make Tianwen production-ready,
authorize full migration, start Task 5, or start Alpha Task 10.

## Final threat model

Authority commit
`e303fa7439f189b397eda39fbd2f5697fe21b80d` defines the first-version
boundary:

- reviewed, versioned, approved plugins installed in the same JavaScript
  process are trusted code;
- Cordis `inject` and message `source` are provenance/composition contracts,
  not a sandbox against malicious code already holding a root
  `Agent`/`Context`;
- unknown, third-party, or unpromoted plugins do not enter the main process;
- process isolation is deferred until an actual untrusted-plugin requirement
  exists.

Task 4 therefore gates:

- direct human-source root Goal creation;
- rejection of honestly plugin-sourced create/edit;
- rejection of a user-looking child attempt to mutate the root Goal;
- absence of Goal dependencies in ordinary Tianwen product packages;
- durable disarmed recovery and explicit one-round resume.

## Historical blocked finding

Fresh review initially asked whether malicious same-process code could forge
`source.kind: "user"`. A real Cordis plugin with `inject: ["agents"]` proved
that it could call public `agent.followup()`, forge that source, and cause a
scripted model to create an armed Goal.

The architecture controller first blocked Task 4, then the user rejected that
threat model as over-defensive and approved the narrower boundary above. The
forgery remains a known limitation, but is no longer a Task 4 gate. The
deliberately failing adversarial test was removed from the final suite; no
wrapper, token, capability framework, or process isolation was added.

## Implemented scope

Task 4 changed only:

- `packages/tianwen-dsh-compat/src/test-harness.ts`;
- `tests/dsh-probe/goal-authority.spec.ts`;
- `tests/dsh-probe/goal-recovery.spec.ts`;
- this handoff.

The compat helper is:

```ts
mountGoalHarness(root, script, { goalRoundDriver: boolean })
```

The boolean is mandatory. Both modes mount compression-none JSONL persistence
and GoalService before AgentLoop. The `true` mode additionally mounts the
public goal-round-driver before AgentLoop. Only public package-root imports are
used.

No Task 3 Bundle/Profile file, dependency version, lockfile, Python Alpha
runtime, Goal product policy, Evidence/Evolution/Champion package, Sandbox, or
UI was modified.

## Authority matrix

| Caller and durable source | Operation | Result |
|---|---|---|
| top-level root, direct `{ kind: "user" }` turn | create | accepted |
| top-level root, `{ kind: "plugin", plugin: "tianwen-evidence" }` turn | create | `GOAL_TOOL_AUTHORITY_REQUIRED` |
| top-level root, honestly plugin-sourced turn | edit | `GOAL_TOOL_AUTHORITY_REQUIRED`; objective unchanged |
| registered child owned by root, user-looking turn | edit root Goal | `GOAL_TOOL_AUTHORITY_REQUIRED`; root unchanged |

The authority test uses a real Session and Inbox, a registry-compatible
running Agent, `withInitiator(agent, ...)`, real ToolRuntime execution, and
model-facing `create_goal`/`update_goal` tools.

No evidence or evolution product package exists in Tasks 0–4, and Task 4 adds
no GoalService dependency outside the compat test harness.

## Durable recovery and explicit resume

Context 1:

1. creates a UUID directory below
   `D:\DevData\tianwen-dsh-probe\sessions`;
2. mounts JSONL persistence with `compression: "none"` and GoalService;
3. explicitly sets `goalRoundDriver: false`;
4. creates Goal `resume safely` with `maxGoalRounds: 1`;
5. observes zero adapter requests;
6. flushes the Session and confirms the JSONL contains the exact session id
   and `goal/change`;
7. disposes the whole Context.

Context 2:

1. creates a fresh Context over the same JSONL root;
2. mounts GoalService and goal-round-driver before AgentLoop;
3. resumes through `ctx.agents.resume()`;
4. preserves Goal id, revision, objective, phase, cap, round count, and
   timestamps;
5. recovers with `activation: "disarmed"`;
6. drains two event-loop turns and two idle checkpoints;
7. observes zero adapter requests.

The final test now records `session.firstLiveSeq` and the next durable sequence
before explicit resume. Before `ctx.goals.resume()` it requires:

- no new `goal/change`;
- no goal-sourced `user/message`;
- no `request/header`;
- zero adapter requests.

The explicit call must append the first new `goal/change` at the recorded
boundary with:

- `operation: "resume"`;
- the recovered Goal id;
- revision exactly `recovered.revision + 1`.

After that event:

- exactly one goal-sourced message appears;
- its source binds the same Goal id and resume revision;
- its sequence is greater than the resume event;
- exactly one `request/header` follows the goal message;
- exactly one ScriptedAdapter request occurs;
- final Goal state is `blocked`, `activation: "disarmed"`,
  `roundsStarted: 1`, with `blockedReason.code: "round-limit"`.

## TDD and mutation evidence

The original implementation RED was:

```text
goal-authority.spec.ts
4 passed

goal-recovery.spec.ts
1 failed: mountGoalHarness is not a function
```

The minimal helper produced:

```text
2 files passed
5 tests passed
```

The new durable-order assertions passed immediately because rc.6 already
behaved correctly. A temporary mutation inserted a hidden
`ctx.goals.resume()` before the explicit boundary. The test then failed
exactly at:

```text
expected pre-resume goal/change events: 0
received: 1
```

Removing that mutation restored the focused 5/5 GREEN. The mutation was not
committed.

## Review history

Initial scoped reviewer:

```text
019fff06-9c74-76a3-8ec3-64f9ef6c6675
Critical: 2
Important: 1
Minor: 1
Ready: no
```

Disposition under `e303fa7`:

- malicious same-process source forgery: documented known limitation, outside
  the approved gate;
- compat helper returning a test Context: explicitly allowed, not a product
  security boundary;
- durable pre-resume event ordering: fixed with public Session event seq;
- retaining JSONL on test failure: Minor, deferred without a cleanup framework.

Fresh post-correction reviewer:

```text
019fff24-00cf-7533-9a02-6fbbe32043c6
Critical: 0
Important: 0
Minor: 1
Ready: yes
```

The sole Minor is the already recorded failure-time JSONL cleanup. It remains
non-blocking diagnostic debt. The reviewer explicitly recommended against
adding wrappers, tokens, or process isolation to Task 4.

## Verification

The final controlling handoff records fresh command counts. Required gates are:

- Task 4 focused tests;
- Tasks 0–4 Node regression;
- exact rc.6 dependency closure;
- zero private DSH source imports;
- TypeScript typecheck;
- offline frozen pnpm replay;
- Python A1 and full pytest baseline;
- Ruff;
- `git diff --check`;
- clean worktree;
- fast-forward push and exact remote SHA.

## Forbidden effects and storage

Task 4 uses local ScriptedAdapter responses and real in-process DSH services.
Generated state stays under:

```text
D:\DevData\pnpm-store
D:\DevData\tianwen-dsh-probe\virtual-store-task-4-d296
D:\DevData\tianwen-dsh-probe\temp-task-4-d296
D:\DevData\tianwen-dsh-probe\venv-task-4-d296
D:\DevData\tianwen-dsh-probe\sessions
```

Task 4 does not use:

- paid models, model API keys, or provider traffic;
- live web/search/fetch;
- Docker or a real sandbox;
- interactive DSH;
- private `@deepseek-ai/*/src/*` imports;
- the Task 3 Profile-install `shell: true` exception;
- a DSH fork or copied upstream source;
- force-push, merge, rebase, or `main` mutation.

Task 5 and Alpha Task 10 remain frozen.
