# Tianwen Goal-First Task Execution Handoff

## Product result

The Goal-first Task-execution stage is `task-passed`. One official installed
Tianwen product used the configured DeepSeek Agent to plan a small natural Goal,
run three ordered Tasks in three distinct DSH Goal/Session pairs, survive a
product update and Web Host restart, and close the Long Goal at revision 8.

The task was to build a tiny greeting CLI and document it. The Agent created
`greet.js` and updated `README.md`. Independent controller validation confirmed
that `node greet.js Alice` prints exactly `Hello, Alice!` and that the README
contains the runnable command and expected output.

The Long Goal was
`tianwen-long-goal-68ce5d92-00b1-4a07-ac27-587f03f94fc1`. Its stable planner
Session was `a6bbf2f6-724d-4d39-a3da-3cb9ff20f7d4`. The three Task Sessions were:

- `session-c773b137-f730-4155-a405-1b351fe4fee3` — create `greet.js`;
- `session-a5223092-ecf9-4b03-9410-876fbb3b2625` — document usage;
- `session-272e935a-aa99-4f9f-bcc3-4fa1680f4d36` — verify the result.

All three Task Goals are complete. The final Long Goal projection reports
`phase=complete`, `completedTasks=3`, `totalTasks=3`, `currentTaskId=null`, and
planner `phase=complete`, `planRevision=4`.

## Product defects found and repaired

The run found two deterministic integration defects before the full lifecycle
could close:

1. Runtime Bundle installed a second copy of identity-sensitive DSH service
   packages inside the Web Profile. Host Agent Loop and Profile ToolRuntime then
   used different module-local scheduler Symbols, so a typed tool call failed at
   `prepare`. Commit `657125a` makes the eleven DSH/Cordis server seams required
   peers while keeping exact development versions. The assembled Web regression
   now proves the Planner Session itself has paired tool calls and results.
2. Tianwen's read-only Goal scanner forced uncompressed JSONL while the official
   DSH Web Profile writes `.jsonl.zstd`. The first Task had already completed,
   but the response failed while projecting its durable status. Commit `3219a9c`
   selects the root's actual DSH Session encoding. The same persisted Long Goal
   and Task Session then recovered without replanning or rerunning Task 1.

The supporting Web host repairs are commits `7cb2341` (open the admitted Task
Session) and `97c19da` (declare the model-selection and preset host services).

One later `continue-progress` call, after all three Tasks were already complete,
failed before a Planner Turn with `cannot get property "goals" without inject`.
It created no `turn/start`, model request, or Long Goal mutation. Restarting the
same Web Host and retrying the same revision-7 continuation succeeded immediately
and produced the fourth Planner Turn and final `complete` transition. The error
is consistent with the DSH/Cordis in-process Agent-resume and preset-composition
boundary, but the available evidence does not identify one specific upstream
module or prove a deterministic Tianwen lifecycle defect. It remains a recorded
non-blocking, not-stably-reproduced host observation. No retry framework or
hidden restart behavior was added.

## Natural runtime evidence

- Final official installer receipt: DSH `0.1.1-rc.2`, pnpm `11.20.0`, status
  `ready`, Runtime archive digest
  `sha256:910f8ca38cb3145b7b6f53a61aefa8131abec87e1da8ae7d68bb337a9e02f042`.
- The Runtime was installed into the standard `web` Profile through the public
  DSH plugin command. The Profile contains no private copies of the eleven
  identity-sensitive DSH/Cordis server packages.
- The stable Planner Session persisted four completed Turns. Each started Task
  used a different Session and persisted one completed Turn.
- Across the Planner and three Task Sessions there are 10 persisted model
  request headers and 41 tool calls. All 41 calls have corresponding results.
  These are runtime event counts, not Provider billing facts.
- Task 1 used filesystem and shell tools to create and inspect `greet.js`, then
  completed its DSH Goal. Task 2 used the edit and shell tools to update and
  verify `README.md`, then completed its Goal. Task 3 independently read and ran
  the result before completing its Goal.
- The Long Goal, Planner Session, Task bindings, completed Task states, and
  workspace changes survived both the Runtime update and Web Host restarts.
- No failed model output was rerun to select a nicer answer. The deterministic
  Runtime defects were fixed around the already persisted natural Goal, and the
  same Goal continued forward.

## Independent validation

- The official assembled Web product regression passed 1/1 and proves the exact
  Planner Session has `tool/call > 0` with an equal number of `tool/result`
  events.
- The complete Goal-status suite passed 27/27 for both legacy uncompressed roots
  and official zstd roots. The zstd regression checks both Goal listing and
  status projection and proves the Session bytes are unchanged.
- Type checking passed for `@tianwen/dsh-compat` and
  `@tianwen/runtime-bundle`.
- Controller acceptance passed: exact CLI output, README command and output,
  clean diff formatting, and a review of the two-file scratch change.
- Independent reviews found no blocker in the DSH peer-identity repair or the
  Session-compression repair. The latter intentionally adds no migration,
  fallback reader, error-string matching, or configuration layer.

## Learning facts

This run did not create an Evolution ledger entry, Skill, Case, Candidate,
Champion, or explicit learning decision. It proves the Goal-first execution and
recovery lifecycle, not cross-task learning. The corrected planner tool
submission and recovered process-local failure are ordinary within-run behavior
and must not be described as learned reusable capability.

## External facts

- Persisted request headers identify the configured Provider/model as
  `deepseek-official / deepseek-v4-pro`.
- Session, Turn, request-header, and tool counts do not establish Provider
  invoice or quota usage.
- No controlled Activity was created.
- No external DSH repository was changed or pushed.

## Closed boundary and next product step

Goal-first planning, Task admission, real Task execution, per-Task Session
identity, restart recovery, and final completion are now proven on the official
installed-product Web path. More synthetic greeting-style natural tasks would
not add meaningful product evidence for this boundary.

The next stage should improve the user-facing Goal experience: the user supplies
one Goal and guidance, while Tianwen owns Task derivation, progress, and ordinary
continuation. Manual Task entry and per-Task round controls should remain an
advanced or compatibility path rather than the primary Desktop workflow.

That next-stage UI boundary was subsequently closed by
[`tianwen-goal-first-desktop-ux-handoff.md`](tianwen-goal-first-desktop-ux-handoff.md).
