# Tianwen Ordinary Resume Persistence Natural Task Handoff

## Result

The ordinary Tianwen task is classified as `task-passed`. One official installed
Tianwen Turn, using configured DeepSeek, produced a two-file Runtime Bundle
change that prevents `tianwen resume` from reporting success when the final DSH
Session persistence result is unavailable.

The reviewed local feature commit is
`cba66cf01310fe80a138dcfa18a44e4c301b55e9`, based on the frozen design and
plan commit `6ba90326f3940fc0f054af1c1666358a8644c3b7`. It changes only:

- `packages/tianwen-runtime-bundle/src/resume-runner.ts`;
- `tests/dsh-migration/goal-resume.spec.ts`.

The branch has not been merged or pushed. Integration remains blocked by the
previous exact-main CI gate, not by this task result.

## Natural runtime facts

- Fresh Goal: `goal-7e0efc29-828d-4ce8-81f7-f9fcfab2ce10`.
- Fresh Session: `tianwen-goal-3686a7df-ec27-49e7-b553-164cf5f46f72`.
- Natural Run: `run:a87c174c40b78f06289f8dbf734740b54db41d6ea14e7024809fd0c93887f436`.
- Exactly one ordinary resume invocation and one Agent Turn settled; there was
  no replacement Goal or retry.
- The run recorded 32 model requests and 38 tool calls. It recorded 68,124
  input tokens, 34,854 output tokens, 1,756,544 cache-read tokens, and 29,870
  reasoning tokens.
- Exact Provider billing was unavailable. Session counters are not presented
  as a currency or invoice fact.
- The final exact read occurred after the final mutation.
- Tianwen restored the installed product to the offline model immediately after
  the run without making another model request.

## Controller acceptance

The source change treats both an explicit `false` persistence result and a
rejection as one fixed safe failure. It does not retry persistence, resume the
Goal again, issue a replacement model request, print a success receipt, or
expose the underlying storage error.

Independent frozen verification passed:

- ordinary Goal resume: 26 tests;
- related create, live-smoke, and Natural Run suites: 71 tests;
- TypeScript full suite: 52 files passed, 2 skipped; 670 tests passed, 8 skipped;
- Python full suite: 608 passed, 4 skipped;
- DSH installer check, private-import check, TypeScript type checking, Ruff,
  and `git diff --check`.

The controller also exercised the official installed product rather than only
the source-level test harness:

- the frozen parent reproduced the bug: the final explicit flush returned
  `false`, but the command still exited zero and printed a success receipt;
- the post-edit installed product exited one, printed no success receipt, and
  emitted only `Session persistence is unavailable`;
- the failed final flush was attempted once, with no later flush or Goal resume;
- the run used one model execution and the Agent handle could be reopened after
  failure, proving it was released;
- a fresh post-edit installer completed with DSH `0.1.0-rc.7`, and the installed
  product remained bootable and configurable offline.

Two independent read-only reviews agree on `task-passed` after the installed
black-box evidence closed their initial test-coverage concerns. Repository tests
could later assert more CLI details directly, but this is not a product blocker.
A simultaneous Agent-disposal rejection could still replace the persistence
error; that separate double-fault case is a non-blocking residual risk and was
not silently broadened into this small fix.

## Learning facts

The product recorded `learningDecision=no-case`; the generic project-owner Skill
was recorded. No Signal, Ticket, Case, Candidate, or policy change was created.
One successful task is not treated as reusable learning by itself.

## External facts

- No external repository branch was pushed and no pull request was opened.
- No DSH source or package was changed by this task.
- DSH remains exactly `0.1.0-rc.7` in the installed product.
- The feature exists only in the preserved local branch and commit until the
  previous exact-main CI gate permits controlled integration.

## Next step

Keep the passing feature branch unchanged. Once the previous exact-main CI is
confirmed green, integrate it through the controlled main path, rerun the local
exact-main gates, push Tianwen main once, and require CI whose head SHA equals
the merge SHA. External DSH publication remains out of scope.
