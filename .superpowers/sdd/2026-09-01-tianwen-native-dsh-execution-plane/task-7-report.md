# Task 7 Report: Native Long Goal execution plane

## Status

Task 7 acceptance was strengthened on top of candidate `7559821d5b32ea19c3e5cb847e1edbf40c0ff2d7` after independent review found three Important test gaps and one Minor entry-point gap.

This report covers Task 7 only. It does not declare rollout Stage 1 complete.

## Acceptance stories

### One normal main Session and a real user command

The profile mounts the full published Runtime Bundle entry and the public DSH command runtime. It starts the Goal by executing the real user command:

```text
/goal Produce one verified native result.
```

The main Session persists the paired `command/run` and successful `command/done` events before the Long Goal proceeds. The test never calls the registered command handler directly and never opens, resumes, or sends user input to a child.

Tianwen delegates one native continuable Planner and one native continuable Task. Public `listChildren()` and persisted inspection prove:

- exact main -> Planner -> Task lineage;
- public `subagent/descriptor` with provider `spawn`;
- delegated sandbox policy from the main Session;
- delegated approval policy `never`;
- no `corrupt` catalog diagnostic.

### Auditable Stage progress in the main Session

While the real Task tool is still blocked and before final settlement, the exact Planner calls the production `reportLongGoalProgress()` path, which uses public `ctx.subagents.reportFrom(..., { delivery: 'next-step' })`.

The main Session persists exactly one `user/message` whose source is the exact Planner `subagent-report`. Its ordered visible text is:

```text
Background subagent <exact Planner id> reported:
Stage: active: Task 1 of 1
Waiting for: Task result: Produce one verified native result.
```

The report contains no percentage or invented progress. Its event sequence is earlier than the final exact Planner `subagent-settled` message, so settlement counts cannot impersonate progress.

### Permission renewal stays in the main Session

The first Task receives a structured sandbox denial under the main Session's `workspace-write` policy. The old attempt becomes `permission-limited`, the main Session receives the instruction to change that main Session to Full access, and Evolution contains zero Learning Signals.

The test changes only the main Session to `danger-full-access`. Tianwen creates epoch 2 with new native Planner and Task identities, delegated `danger-full-access`, and approval `never`. Epoch 1 stays byte-for-byte unchanged, epoch 2 settles, the Task tool runs once in the exact renewed child, and Evolution still contains zero Learning Signals.

No Tianwen approval button, child navigation, child-side permission mutation, or approval/rejection workflow is introduced.

### Real Host destruction and restart recovery

The recovery story starts from the same ordinary `/goal` command and real native Planner/Task path. The Task tool actually starts once. The real Task Goal emits its terminal event, the main Agent is then disposed, and only after the exact main Agent is absent is the Task tool released to settle.

Before restart, the durable state proves:

- one epoch and one exact Task child id;
- the exact attempt is `settled`;
- the terminal boundary is durable;
- no terminal delivery acknowledgement exists;
- no final Planner settlement reached the main Session.

The entire first Cordis/Agent/Long Goal Host composition is destroyed. A fresh composition mounts over the same JSONL Sessions, Long Goal state, and Evolution root, then publicly resumes the same main Session. Its public Session listing discovers the durable Planner/Task, and public continuable follow-up cold-resumes the exact Planner.

Recovery produces one completed terminal main Turn and one terminal-delivery acknowledgement. The attempt array, epoch, Planner parent id, Task child id, and terminal boundary remain unchanged. The recovery composition executes the Task tool zero times, so the total Task execution count remains exactly one.

### Full Runtime Bundle non-interference

The same ordinary DSH tool round runs with Tianwen disabled and with the full `@tianwen/runtime-bundle/runtime` entry enabled. Both compositions include real JSONL, Goal, AgentLoop, subagent, command, tool, prompt, permission, and Long Goal Host dependencies. The enabled run proves the Long Goal Host is actually mounted by observing the real `/goal` command registration.

With no Tianwen-specific input, the two ordinary turns have exactly equal normalized behavior across:

- the complete enumerable `GenerateOptions` payload except the process-local `AbortSignal`;
- full normalized messages, with only random message ids replaced by stable ordinals;
- system prompt, provider, model, reasoning effort, and session identity;
- complete tool list, descriptions, JSON Schemas, and tool-choice field;
- permission events;
- full assistant messages, with only random message ids normalized;
- tool execution count.

The enabled run records zero Learning Signals.

### Real stock headless and Web composition

The portable opt-in test builds and packs the current Runtime and probe bundles, installs a fresh stock DSH `0.1.1-rc.2` host and fresh headless/Web Profiles under `D:`, and proves:

- headless boots Tianwen once with no dynamic runner and exits 0;
- Web serves loopback HTTP, mounts Tianwen once, and exits 0;
- the installed Runtime Bundle declares exact Agent, preset, Goal, sandbox, JSONL, and subagent peer contracts;
- the native subagent implementation supplied by stock DSH Base is `0.1.1-rc.2`;
- all large installation, store, environment, and temporary data remains on `D:`.

The stock host installation uses pnpm's offline mode against the already selected `D:` store. This keeps the exact real install while preventing registry latency from invalidating the five-minute setup hook.

## TDD and controlled-mutation evidence

### Baseline

Before hardening, the three default Task 7 files reported 2 files and 7 tests passed, while the portable file and its 2 tests were skipped by the explicit opt-in guard. Source inspection confirmed the old gaps:

- progress acceptance counted only `subagent-settled` messages;
- `/goal` called a captured handler directly;
- offline recovery hand-wrote v3 attempt/boundary/settled state and called the delivery helper directly;
- non-interference applied only `@tianwen/runtime`, so the Long Goal Host was never mounted.

### Stage progress RED/GREEN

- RED: a controlled mutation dropped only `reportFrom()` content containing `Stage:`. The strengthened profile failed with `expected [] to have a length of 1`; old settlement-count assertions would still have passed.
- GREEN: the real production report produces one exact `subagent-report`, ordered Stage facts, no percentage, and a later final Planner settlement.

### Restart recovery RED/GREEN

- RED: on the rebuilt Host only, a controlled mutation rejected public `subagents.followup()`. The Goal stayed at Planner `ready`, the same Task attempt remained settled, and the delivery cursor stayed absent. This proves the test depends on public continuable recovery rather than handcrafted terminal state or direct delivery calls.
- GREEN: restoring public follow-up cold-resumes the same Planner, delivers one completed main Turn, acknowledges once, and executes no Task tool in the recovery composition.

### Full Runtime Bundle RED/GREEN

- RED: replacing the enabled path with core-only `apply()` made `hostMounted` false and failed the strengthened acceptance immediately, even though the ordinary model/tool behavior still matched.
- GREEN: the full Runtime Bundle mounts the real Long Goal Host; enabled and disabled ordinary behavior remains byte-equal after documented normalization, and enabled Learning Signals remain empty.

### Real command entry RED/GREEN

- RED: the old direct handler call could not produce DSH `command/run` / `command/done` lifecycle evidence.
- GREEN: public `commands.execute()` on the normal main Session produces one paired successful lifecycle and starts the durable Goal.

### Portable setup RED/GREEN

- RED: the first explicit run spent 753.14 seconds in a registry-dependent synchronous setup and exited 1 after the 300-second `beforeAll` hook timeout; both product tests were skipped.
- GREEN: adding only `--offline` to the exact stock DSH install reused the configured `D:` pnpm store. The complete real install/build/pack/headless/Web run then exited 0 with 1 file and 2 tests passed in 260.76 seconds.

## Verification

Task 7 default rollout gate:

```powershell
pnpm vitest run tests/dsh-probe/native-continuable-subagent.spec.ts tests/dsh-migration/native-long-goal-profile.e2e.spec.ts tests/dsh-migration/portable-profile-composition.e2e.spec.ts tests/dsh-migration/runtime-composition.spec.ts
```

Result: 3 files passed and 1 opt-in file skipped; 12 tests passed and 2 portable tests skipped.

Explicit portable gate:

```powershell
$env:TIANWEN_RUN_PORTABLE_COMPOSITION_E2E='1'
pnpm vitest run tests/dsh-migration/portable-profile-composition.e2e.spec.ts
```

Result: exit 0; 1 file passed; 2 tests passed; 260.76 seconds.

Task 6 settlement/race regression gate:

```powershell
pnpm exec vitest run tests/dsh-migration/ordinary-long-goal.spec.ts tests/dsh-migration/long-goal-liveness.spec.ts tests/dsh-migration/continuous-goal-feedback.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-migration/settled-task-result.spec.ts tests/dsh-migration/permission-attempt.spec.ts tests/dsh-migration/native-long-goal-child.spec.ts tests/dsh-probe/dsh-public-reuse-surface.spec.ts
```

Result: 8 files passed; 181 tests passed.

Static and build gates:

- workspace `pnpm run typecheck`: exit 0;
- Runtime Bundle `tsc -b --pretty false`: exit 0;
- `git diff --check`: exit 0;
- changed tests contain no private DSH `/lib` or `/src` import;
- the profile contains no direct command-handler call, handcrafted attempt/boundary/settled append, direct settlement delivery, or direct Long Goal Host mount;
- only the three Task 7 test files and this Task 7 report changed.

## Remaining risk

The deterministic profile stories use the real DSH AgentLoop, Goal, JSONL, continuable-subagent, delegated-policy, command runtime, public child catalog, full Runtime Bundle entry, and Long Goal Host with a deterministic model adapter. The separate portable gate proves the packed bundle in fresh stock headless and Web Profiles without requiring network model credentials.

This report deliberately does not claim Stage 1 completion. Independent review and the Stage 1 completion gate remain the supervising agent's responsibility.
