# Tianwen Controlled Verifier Verdict Ownership Implementation Plan

> Execute continuously. Stop only for a different product failure, an authority mismatch, an
> irreversible action outside this plan, or a failed integration gate.

**Goal:** Let the official controlled runner recognize a valid D1 `not-met` verdict even when the
installed DSH topology omits the optional durable HarnessError code.

**Architecture:** The verifier records its private semantic verdict. The flushed Session Evidence
independently proves the exact verifier call and result polarity. Governance proceeds only when the
two facts agree.

**Design:**
`docs/superpowers/specs/2026-08-25-tianwen-controlled-verifier-verdict-ownership-design.md`
at `97248a644eee2772d7fb61ddcecafb8fb941a229`.

## Constraints

1. Core state-machine behavior is the acceptance target. Do not add evidence inventories or
   transport rules unrelated to the verdict.
2. Modify only the runner and its existing runner spec for product implementation.
3. Do not modify DSH packages, the Evidence projector, installer, Profile, workflow, dependencies or
   lockfile.
4. Do not parse raw error text or infer not-met from `isError` alone.
5. Preserve the existing verifier error shown to the model and all existing receipt schemas.
6. Activity-04 is terminal. Do not run any product command against it.

## Task 1: Reproduce the installed topology at the runner boundary

**File:** `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts`

1. Add one test around the ordinary full lifecycle fixture.
2. Wrap the existing Evidence projector and remove only
   `ARCHITECTURE_DECISION_NOT_MET` from the first error Evidence outcome.
3. Preserve `status=complete`, `isError=true`, exact action arguments and every other projected fact.
4. Assert that the lifecycle still passes, D1 creates one Ticket, both seed Skill uses are recorded,
   25 Sessions persist and the final pointer reaches C revision 4.
5. Run only this test and retain the expected original `seed-failed` RED.

## Task 2: Make the verifier own its verdict

**File:** `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts`

1. Add optional private `verdict: 'met' | 'not-met'` to `DecisionState`.
2. In the verifier body, set `not-met` immediately before the existing not-met throw and set `met`
   immediately before the existing success return.
3. Leave all inconclusive paths without a verdict.
4. After Session flush/readback, derive acceptance only when:
   - call counts, order, arguments digest and Evidence cardinality remain exact;
   - `met` agrees with a complete non-error Evidence result and no error code;
   - `not-met` agrees with a complete error Evidence result, and any present error code equals the
     frozen not-met code.
5. Keep the existing proof-before-Outcome and Outcome-before-Skill-use ordering unchanged.
6. Run the new focused test, then the full runner spec.

## Task 3: Compatibility and verification

Run, in order:

1. controlled runner, natural Evidence, controlled evaluation, controlled command, Runtime Bundle
   and installer focused specs;
2. recursive `@tianwen/runtime-bundle` build;
3. full repository typecheck;
4. no-private-DSH-import check;
5. public repository contract and focused Ruff only if the authority docs changed their public
   contract surface;
6. `git diff --check`.

Do not rerun the known local Profile 60-second timing case as an isolated ritual. Exact-main CI owns
that platform/runtime integration proof.

## Task 4: Review and integration

1. Review correctness: live verdict assignment, durable polarity agreement and zero-governance
   failure paths.
2. Review architecture/evidence: no raw-text routing, no Evidence-projector scope expansion and no
   Activity-04 overclaim.
3. Review YAGNI: only one private field and the smallest validation change.
4. Commit the implementation separately from these authority documents.
5. Push the feature normally, perform one no-ff merge after exact tree equality and diff checks, and
   push main normally.
6. Require the unique automatic exact-main push attempt 1 to complete with Python, TypeScript and
   installer-windows all successful.
7. Stop before any future real-Provider activity. A new formal activity needs separate reviewed
   identity and fresh workspaces/Sessions.
