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
at `b9ca4cf65369b0340d2c6f76cf572d099d044b1d`.

## Constraints

1. Core state-machine behavior is the acceptance target. Do not add evidence inventories or
   transport rules unrelated to the verdict.
2. Modify only Learning Intake, controlled skill evaluation, the runner and their existing focused
   specs for product implementation.
3. Do not modify DSH packages, the Evidence projector, installer, Profile, workflow, dependencies or
   lockfile.
4. Do not parse raw error text or infer not-met from `isError` alone.
5. Preserve the existing verifier error shown to the model and all existing receipt schemas.
6. Activity-04 is terminal. Do not run any product command against it.

## Task 1: Reproduce the installed topology at the runner boundary

**File:** `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts`

1. Add one test around the ordinary full lifecycle fixture.
2. Wrap the existing Evidence projector and remove only
   `ARCHITECTURE_DECISION_NOT_MET` from every not-met Evidence outcome.
3. Preserve `status=complete`, `isError=true`, exact action arguments and every other projected fact.
4. Assert that the lifecycle still passes, D1 creates one Ticket, both seed Skill uses are recorded,
   25 Sessions persist and the final pointer reaches C revision 4.
5. Run only this test and retain the expected original `seed-failed` RED.
6. Retain the first runner-only GREEN attempt as a second RED: adding the live verdict alone still
   stops at D1 because Learning Intake owns the Outcome write.

## Task 2: Connect verdict ownership to Outcome intake

**Files:**

- `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts`
- `packages/tianwen-runtime/src/learning-intake.ts`
- `packages/tianwen-runtime/src/skill-evaluation.ts`
- `tests/dsh-probe/outcome-intake-runtime.spec.ts`

1. Add optional private `verdict: 'met' | 'not-met'` to `DecisionState`.
2. In the verifier body, set `not-met` immediately before the existing not-met throw and set `met`
   immediately before the existing success return.
3. Leave all inconclusive paths without a verdict.
4. Add an optional internal Outcome attestation containing only verdict and acceptance Evidence id.
5. The runner keeps its exact call counts, order, arguments digest and Evidence cardinality checks.
6. Learning Intake must independently resolve the final Evidence and accept the attestation only
   when:
   - `met` agrees with a complete non-error Evidence result and no error code;
   - `not-met` agrees with a complete error Evidence result, and any present error code equals the
     frozen not-met code.
7. Calls without an attestation keep the existing Evidence-only behavior.
8. Pass a read-only Session-id verdict resolver as a second argument through controlled arms,
   Shadow and transition methods. Do not add it to parsed task inputs, digests or durable facts.
9. Keep the existing proof-before-Outcome and Outcome-before-Skill-use ordering unchanged.
10. Add focused Learning Intake tests for accepted missing-code not-met and rejected polarity/id
   mismatch, then run the new runner test and full runner spec.

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
3. Review YAGNI: one private field, one small attestation value and direct optional resolver
   parameters; no registry or new service.
4. Commit the implementation separately from these authority documents.
5. Push the feature normally, perform one no-ff merge after exact tree equality and diff checks, and
   push main normally.
6. Require the unique automatic exact-main push attempt 1 to complete with Python, TypeScript and
   installer-windows all successful.
7. Stop before any future real-Provider activity. A new formal activity needs separate reviewed
   identity and fresh workspaces/Sessions.
