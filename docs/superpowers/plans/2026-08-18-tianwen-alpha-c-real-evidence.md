# Tianwen Alpha-C Real-Evidence Sampling Implementation Plan

> Execute serially. All automated tests are offline. No paid request is allowed before Tasks 1-5
> are complete and independently reviewed.

**Goal:** Collect one bounded natural A1 sample, repeat only after a true verifier-backed failure,
and feed only qualified real evidence into the existing Alpha-C gate.

**Architecture:** One stage-local interactive runner composes existing AlphaTrialRunner and
LearningIntake. It writes bounded JSON receipts under `D:\DevData`; it does not modify Runtime,
DSH, Alpha-B, Promotion, Shadow, or the ActivePointer.

**Base:** `4638026f210c0de29262d307dd051934570d975e`
**Branch:** `codex/tianwen-alpha-c-real-evidence`

## Task 1: Freeze design and prove the missing entry

**Files:**

- Add `docs/superpowers/specs/2026-08-18-tianwen-alpha-c-real-evidence-design.md`
- Add `docs/superpowers/plans/2026-08-18-tianwen-alpha-c-real-evidence.md`
- Add `tests/integration/test_alpha_c_real_evidence.py`

Steps:

1. Commit the reviewed design and plan before implementation.
2. Add an import-level test for `scripts.run_alpha_c_real_evidence` and run it.
3. Preserve the genuine collection/import failure as RED evidence.
4. Do not call Docker, a Provider, or a paid model.

## Task 2: Implement the fixed zero-paid preflight

**Files:**

- Add `scripts/run_alpha_c_real_evidence.py`
- Modify `tests/integration/test_alpha_c_real_evidence.py`

The runner must:

1. accept only a new stage data root below `D:\DevData`;
2. require the fixed A1 task, fixed model/provider/settings, fixed BudgetLimit, and current
   official maximum CNY rate snapshot;
3. require a non-empty DeepSeek credential without reading, printing, or persisting it;
4. construct the native PydanticAI model and existing AlphaTrialRunner;
5. call `prepare()` and freeze condition plus Champion identity;
6. verify no Goal/Run/model usage exists;
7. write a new-only sanitized preflight receipt;
8. reject a non-TTY stdin before `execute()`;
9. in a real TTY, render the bounded preview and require exact `CONFIRM <trial-id>`.

Offline tests must prove fake model request count remains zero for missing credential, provider
mismatch, Git/task/Champion/Docker/seed failure, cost exhaustion, receipt collision, non-TTY, and
wrong confirmation.

## Task 3: Implement one Trial and honest stop classification

**Files:**

- Modify `scripts/run_alpha_c_real_evidence.py`
- Modify `tests/integration/test_alpha_c_real_evidence.py`

Steps:

1. Execute the prepared Trial only after exact real-TTY confirmation.
2. Reload durable Manifest, Result, final verifier Evidence, and store usage.
3. Reject `qualifies_as_real_model_trial=false` before calling LearningIntake.
4. For a qualified success, project and triage only that success, write `no_case`, and stop.
5. For operational/inconclusive/unverified/boundary failure, write a non-learning stop receipt and
   do not call Intake.
6. For a single qualified verifier failure, project and triage it as `observe`; do not create a
   Case yet.
7. Record exact requests/tokens and conservative CNY upper bound. Unsettled provider usage keeps
   the pre-reserved ceiling charged.

Offline tests must cover success, provider error, usage error, boundary/verification states,
non-real fixtures, and the single-failure observe path.

## Task 4: Implement at most one independent repeat

**Files:**

- Modify `scripts/run_alpha_c_real_evidence.py`
- Modify `tests/integration/test_alpha_c_real_evidence.py`

Steps:

1. Prepare a second independent A1 only after the first qualifying failure.
2. Keep `previous_trial_id=None` and prove trial/store/workspace identity is different.
3. Compare the complete condition snapshots plus Champion version/digest.
4. Write a retry authority before the second confirmation.
5. Any drift or budget shortage stops with second-model request count zero.
6. After the one repeat, never create a third Trial.
7. Success or non-qualifying/mismatched failure stops without mixed triage.
8. Only two qualifying failures with identical scope/fingerprint enter existing Case triage.

Offline tests must prove the request counts, independence, exact condition/Champion gate, no mixed
triage, matching Case path, and hard two-Trial maximum.

## Task 5: Prove learning and Candidate stop gates

**Files:**

- Modify `tests/integration/test_alpha_c_real_evidence.py`
- Modify production code only if a failing test exposes a missing requirement in the already
  approved narrow operator.

Steps:

1. Use the first Trial store as LearningIntake's aggregate store.
2. Prove two matching real failures can form one durable Case.
3. Prove unknown and out-of-scope Attribution end in `no_lesson` and no Candidate.
4. Prove no artifacts or ActivePointer rows change for all no-Case/no-Lesson paths.
5. Do not build a Candidate materializer unless actual live evidence reaches a persisted
   conditional Lesson. If it does, stop paid execution, write the exact follow-up test first, and
   add only a current-Champion direct-child, one-Candidate boundary around the existing API.

## Task 6: Offline release gates and independent review

Run serially with caches and temporary data on `D:\DevData`:

1. focused real-evidence integration tests;
2. Alpha Trial and Alpha-C Intake integration tests;
3. A1-A5 author tests;
4. full Python suite;
5. Ruff and `git diff --check`;
6. affected TypeScript/DSH public-surface, private-import, Vitest, typecheck, and Runtime Bundle
   build gates;
7. independent correctness review;
8. independent Ponytail/YAGNI review.

Any Critical or Important finding returns to a focused tests-only RED before implementation.

## Task 7: One-time live preflight

Before any paid request:

1. re-check branch/base/status;
2. re-audit the production governance DB and confirm no prior qualified real Case/Candidate;
3. open the official current DeepSeek pricing page and freeze the maximum current CNY rate;
4. verify remaining cumulative Alpha-C budget;
5. verify configured credential as a boolean only;
6. run the fixed script through prepare only;
7. inspect the persisted preview, condition/Champion digests, Docker/seed/baseline/verifier, and
   zero Goal/Run/model usage;
8. report the exact reserved upper bound before entering a real local TTY.

If any check fails, record zero paid requests and stop.

## Task 8: Bounded live sampling

In a real local interactive terminal:

1. run the fixed stage script;
2. type the exact displayed `CONFIRM <trial-id>`;
3. inspect the first Result and stop classification;
4. only if it is a qualifying verifier-backed failure, allow the script to prepare one independent
   repeat, inspect the equality authority, and type its exact confirmation;
5. never run a third Trial;
6. record request count, total tokens, conservative CNY upper bound, remaining cumulative budget,
   Docker executions, and all external effects.

## Task 9: Learning decision and stage closure

1. Reload every durable receipt and evidence binding.
2. If no Case exists, write the canonical handoff with no Case/Lesson/Candidate.
3. If a Case exists, perform evidence-based Attribution. Unknown/out-of-scope/insufficient evidence
   produces `no_lesson` and stops.
4. Only a persisted conditional Lesson allows at most one current-Champion direct-child Candidate;
   never move the ActivePointer or enter evaluation/promotion/shadow without a later stage decision.
5. Re-run proportional gates after any post-live code/document change.
6. Obtain final correctness and Ponytail reviews, commit, push the stage branch, and record the
   exact remote SHA.
7. Send the structured completion/blocker report to supervisor task
   `01a00d5a-8974-7c41-b660-127c15fcecb6` and wait. Do not merge main or enter Alpha-D.
