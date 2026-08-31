# Tianwen Goal-First Planning Handoff

**Current status:** this passed planning stage is implemented and retained in Runtime `0.1.5`.
The “next product stage” language below records the boundary at the time of this handoff; subsequent
Task completion, result-aware replanning, Desktop UX, and DSH-native continuous Goal work are now
implemented and linked from the current architecture overview.

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
- The full TypeScript project build, install-shape check, and private-import
  check passed.
- A bare local full-suite command omitted the repository's required fresh probe
  root, probe Python, and approved Corepack environment. It therefore had no
  product verdict and reproduced the already documented environment-only result:
  872 passed, 18 skipped, and 99 setup/fixture failures. The single valid local
  full-suite gate then ran with a fresh D-drive root and current-worktree Python;
  69 files and 971 tests passed, with 5 files and 18 opt-in tests skipped.
- Independent review approved the Profile fix and its dynamic regression, and
  confirmed that the permission boundary was not widened.
- Final whole-stage review found no integration blocker across v1 compatibility,
  v2 transitions, planner/Task Session identity, replacement-suffix behavior,
  CLI/installer/Desktop wiring, permission scope, or the handoff claims.

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

## Historical stage boundary

Goal-first planning, persistence, Task admission, and user guidance entered the
official installed-product path in this stage. Later stages drove admitted Tasks
to completion and exposed the lifecycle through Desktop and ordinary DSH conversation.
Those later results do not change this handoff's narrower planning-stage evidence.
