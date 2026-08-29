# Tianwen Goal-First Planning Handoff

## Product result

The Goal-first planning stage is `task-passed` for its frozen scope. The official
installed Tianwen product used the configured DeepSeek Agent to turn one user Goal
into three ordered Tasks, admitted the first Task through its own DSH Goal and
Session, then accepted one user guidance message and replanned only the unbound
suffix.

This result proves the new planning and admission path. It does not claim that the
admitted documentation Task ran to completion: the scratch repository remained
unchanged, and the first Task runtime was still `not-loaded` after admission.

The successful Goal was
`tianwen-long-goal-f83c88c8-2834-4419-af1b-2d7202f74abe`. Its stable planner
Session was `8679e06d-fb54-43d3-b405-bd17ae0622ba`; the admitted Task used the
distinct Session `1a8309e0-f0e3-448c-8859-0d9132a2ad05`.

## Natural runtime evidence

- The official installer reported `ready` for DSH `0.1.1-rc.2` and pnpm
  `11.20.0`. The installed Runtime Bundle archive digest was
  `sha256:b2eee1117cb7e110053b6071785afb471c18bf35c16d2272837fb22071ff8091`.
- One Provider-capable `goal start` returned
  `tianwen.goal-first-progress-result.v2` with action `started`, Goal revision 3,
  planner revision 1, and three Tasks.
- The first Task was bound and active. Its Goal/Session identity differed from
  the planner Session; the other two Tasks were pending and unbound.
- One `goal guide` at expected Goal revision 3 returned
  `tianwen.long-goal-guidance-result.v2` with `planning=updated`, Goal revision 5,
  and planner revision 2.
- Replanning preserved the active Task byte-for-byte, including its Task ID,
  objective, Goal ID, and Session ID. It replaced only the two pending Tasks with
  fresh Task IDs.
- The planner Session persisted two completed Turns and two configured model
  request headers. It made three typed `submit_long_goal_plan` calls: the first
  invalid `complete`-with-tasks submission was rejected, the Agent corrected it
  to a valid `continue` submission in the same Turn, and the guidance Turn made
  one valid replacement-suffix submission.
- The scratch repository remained clean with only its original `README.md`.
  No Task Turn edited the repository during this planning/admission smoke.

The first three installed-product start attempts stopped before a Provider request
while deterministic integration defects were diagnosed and fixed: a production
runner imported a test-only package, a YAML expression parsed the revision as an
object, and the managed Profile disabled the shell host service required by the
`standard` preset. The third failure had already persisted one unplanned v2 Goal
record, as required by the create-before-Session design, but it created no planner
Session or model request. The successful attempt was the only Provider-capable
start; no model output was rerun to select a nicer plan.

## Independent validation

- The Goal-first managed Profile now restores only `sandbox` and the original
  platform-conditioned `pwsh-sandbox` service needed by the `standard` coding
  preset. It does not enable `permission`, the root `tool-pwsh`, or another tool
  surface.
- A dynamic offline regression composes the formal installed Profile, disables
  the one-shot runner, mounts the `standard` preset through
  `standingKeyFor('standard')`, and proves that no Goal, Session, or Turn is
  created. The full Runtime Bundle suite passed 57/57.
- The Runtime Bundle focused TypeScript build passed. The root typecheck wrapper
  could not start because pnpm wanted to purge `node_modules` without a TTY; this
  was treated as an environment preflight issue rather than a product failure or
  a reason to repeat unrelated validation.
- Independent review approved the Profile fix and its dynamic regression, and
  confirmed that the permission boundary was not widened.

## Learning facts

No reusable Skill, Case, Candidate, policy, or learning decision was produced by
this product smoke. The Agent corrected one rejected typed plan submission within
the same Turn; that is a local self-correction, not evidence of cross-task learning.

## External facts

- The persisted request headers identify the configured Provider/model as
  `deepseek-official / deepseek-v4-pro` for both planner Turns.
- Session, Turn, request-header, and tool-call counts are runtime evidence only.
  They are not Provider billing facts.
- No controlled Activity was created.
- No external DSH repository was changed or pushed.

## Remaining boundary

Goal-first planning, persistence, Task admission, and user guidance are now on the
official installed-product path. The next product stage may drive admitted Tasks
to completion and expose the same lifecycle more naturally in Desktop, but that
work is not required to reinterpret this planning-stage result.
