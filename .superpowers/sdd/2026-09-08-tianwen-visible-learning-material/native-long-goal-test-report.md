# Native Long Goal settlement assertion review

## Scope

Changed only `tests/dsh-migration/native-long-goal-profile.e2e.spec.ts`.
No product source, lifecycle implementation, model/provider path, package, or
real-use artifact was changed.  The scripted test used
`D:/DevData/tianwen-dsh-probe` as its temporary probe root.

## Root cause and RED evidence

The first full TypeScript gate retained at
`E:/待清理/D盘迁移-2026-09-08/Tianwen-自然入口复用-022/visible-material-fix/final-typescript-e9b5a0268daa-20260908-223645/vitest.log`
failed this one assertion with `plannerSettlements.length === 1`:

```ts
expect(plannerSettlements.length).toBeGreaterThanOrEqual(2)
```

That is a meaningful RED for a timing-sensitive test expectation, not a
runtime lifecycle failure: the same run had already reached Task completion,
main-session idle, both native lineage checks, and the Planner request checks.

The existing DSH continuable contract explains the variable count.  The first
Planner turn creates one resident Planner child and admits its Task as an owned
child.  On Task completion, the Task's settlement and the host's coordinator
followup can race.  Depending on which activation boundary wins, the same
Planner identity may yield one final settlement, or a natural settlement then a
cold-resumed/followup settlement.  Both outcomes retain the required public
lineage; neither is a path-root decision.

Two direct repetitions with the existing local Vitest binary used the D: root.
The diagnostic repetition recorded only `type`, `seq`, `source.kind`, and
`source.sender` at
`E:/待清理/D盘迁移-2026-09-08/Tianwen-自然入口复用-022/visible-material-fix/native-long-goal-event-sequence-task-e9b5a02.log`.
It observed the Planner progress at main seq 7 and two same-Planner settlement
notices at seq 20 and 31.  The retained Task sequence has its terminal
`goal/change` at seq 18.  These are separate Session-local sequence spaces, so
the test does not compare them numerically.  It instead records the main
Session boundary immediately before calling `goals.complete()`.

The first attempt through `pnpm exec` did not run a test: pnpm tried to repair
the modules directory and safely aborted in the non-interactive environment.
No install was allowed or performed.  The existing `node_modules/.bin/vitest`
runner was then used for every actual reproduction.

## Corrected assertion

The test now requires at least one exact same-Planner `subagent-settled`
message whose main-session sequence is after the Task completion request.  It
also retains the pre-existing requirement that a Planner settlement occurs
after the public progress report.  The test does not lower lineage checks,
replace the real scripted runtime, or assert an arbitrary exact number of
settlements.

This catches the actual behavioral regression: if Task completion no longer
results in a visible final Planner settlement, the post-completion filter is
empty.  It allows the documented one- or two-activation timing outcomes.

## GREEN verification

```powershell
$env:TIANWEN_DSH_PROBE_ROOT='D:/DevData/tianwen-dsh-probe'
.\\node_modules\\.bin\\vitest.cmd run tests/dsh-migration/native-long-goal-profile.e2e.spec.ts
git diff --check -- tests/dsh-migration/native-long-goal-profile.e2e.spec.ts
```

- Entire test file: 1 file, 4 passed.
- Diff whitespace check: passed.

The focused GREEN log is
`E:/待清理/D盘迁移-2026-09-08/Tianwen-自然入口复用-022/visible-material-fix/native-long-goal-test-green-e9b5a02.log`.

No full gate, real model, desktop process, install, or package build was run
for this bounded test correction.
