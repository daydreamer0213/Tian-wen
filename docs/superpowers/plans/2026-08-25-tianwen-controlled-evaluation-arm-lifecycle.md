# Controlled Evaluation Arm Lifecycle Implementation Plan

**Goal:** Make controlled B/C evaluation runtime state match actual sequential execution and remove
mid-run dependence on the mutable root Skill registry.

**Architecture:** Keep the frozen evaluation plan and initial preflight. Replace eager creation and
binding of all ten arms with one per-arm lifecycle that creates, validates, binds, runs, and disposes
the next Agent before continuing.

**Files:**

- `packages/tianwen-runtime/src/skill-evaluation.ts`
- `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts`
- `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts` only if lifecycle progress
  assertions need tightening

## Task 1: Lock the runtime truth with RED tests

Update the existing first-baseline Provider failure test so it requires one Agent creation and one
bound Run at the first request. Assert that the remaining nine Run bindings/manifests and future
Sessions are absent.

Update the first-Candidate Provider failure test so it requires two Agent creations and two bound
Runs, with no later task facts.

Replace the test that treats ambient root Skill disposal during B as a required Candidate stop. The
new contract removes the root registration after preflight and requires frozen B/C execution to
continue. Keep the workspace-drift stop test.

Run the narrow tests and preserve the eager-creation failures as RED.

## Task 2: Implement one arm lifecycle

In `runControlledArms()`:

- open the deterministic plan after preflight;
- create a local per-arm operation that constructs the guard and Agent;
- validate Agent-local Skill/tool/cwd/model facts;
- bind only that Run;
- execute the existing `runControlledArm()` path;
- always delete request tracking and dispose the Agent before returning the arm result;
- map creation, binding, validation, or disposal failures to the existing finite failure classes.

Iterate tasks in canonical order and call the operation for baseline then Candidate. Retain the
Candidate workspace snapshot check. Remove post-start root-registry checks. Do not change model
request, tool, outcome, persistence, objective, or receipt semantics.

## Task 3: Verify behavior

Run, in order:

1. the three focused RED/GREEN tests;
2. full `controlled-skill-evaluation-runtime.spec.ts`;
3. full `controlled-real-skill-lifecycle-runner.spec.ts`;
4. the controlled compatibility set excluding only the known local Profile timing case;
5. recursive Runtime Bundle build;
6. repository typecheck;
7. no-private-imports check;
8. diff checks.

Review correctness, architecture/evidence, and simplicity. Specifically reject any solution that
adds a transaction framework, copies frozen facts into a second planner, or changes public receipt
formats merely to diagnose this lifecycle defect.

## Task 4: Integrate and validate

Commit the reviewed implementation on the feature branch, push normally, merge once with `--no-ff`
after confirming remote main has not moved, and require the unique automatic exact-main push attempt
to pass Python, TypeScript, and installer-windows.

Do not rerun Activity-06. A later fresh activity is allowed only after the implementation and CI are
green; it must use new product, evidence, operation, workspace, and Session identities.
