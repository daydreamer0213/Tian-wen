# Tianwen Alpha-C Real-Evidence Canonical Handoff

**Date:** 2026-08-18
**Stage branch:** `codex/tianwen-alpha-c-real-evidence`
**Base `main` and `origin/main`:** `4638026f210c0de29262d307dd051934570d975e`
**Proportional-safety design commit:** `774e5195b8ac3ef49dcd39b8f006a8b21b45cf49`
**Implementation parent before this final-fix commit:** `7b01aa7671cd06065c8be778121607e36ac2b306`
**Canonical final-fix revision:** the commit containing this document
**Status:** proportional-safety correction implemented and offline-regressed; live sampling not started

## 1. Current conclusion

The Alpha-C operator is ready for final review and then one bounded live invocation. The approved
stage Goal, authority and cumulative CNY 20 budget authorize the fixed Trial. The preview, frozen
conditions and receipts are audit records; they are not extra approval prompts.

There is no local-TTY, stdin, pipe, environment-confirmation, price-file, network-refresh or
price-freshness gate. After a legal zero-paid preflight, the script automatically executes the
first fixed A1 Trial. It may automatically execute one independent repeat only after the first
Trial is a qualifying verifier-backed failure and the repeat authorities match exactly.

Live sampling has not been invoked. Current factual outcome remains:

- real Trial count: `0`;
- paid model requests: `0`;
- model tokens: `0`;
- CNY charged or reserved by a live run: `0`;
- real Docker invocations: `0`;
- qualified real Case: none;
- conditional Lesson: none;
- Candidate: none;
- Promotion or Shadow change: none.

This is an offline-ready state, not real learning evidence. Stage A remains a failed live proof;
its exhausted Goal must not be replayed, and its historical `usage-invalid` fact remains
operational evidence only.

## 2. Fixed authority and scope

The operator is deliberately fixed to:

- registered task `A1`;
- `deepseek:deepseek-v4-pro` through the existing PydanticAI DeepSeek Provider;
- the current active `repo_task_skill` Champion from the production governance store;
- per-Trial limits of 4 model requests, 8 tool calls, 40,000 tokens, 300 seconds and 8 action
  effects;
- a 4,096-token maximum output setting per provider request;
- one natural Trial and at most one independent repeat;
- the cumulative Alpha-C paid-model ceiling of CNY 20; and
- the existing Alpha Trial runner, Docker verifier and LearningIntake APIs.

The stage does not modify Runtime or DSH, add a scheduler or prompt shim, replay Stage A, run an
external Skill market, materialize a Candidate, change the ActivePointer, promote, enter Shadow or
enter Alpha-D.

## 3. Proportional price and execution safety

The official DeepSeek Chinese pricing page is recorded as
`https://api-docs.deepseek.com/zh-cn/quick_start/pricing/`. The recorded 2026-08-18 maximum for
`deepseek:deepseek-v4-pro` is CNY 27 per million tokens. This estimate is persisted in receipts.
The script still validates the exact source, model and a positive integer rate, but the age of the
observation, network availability and local-file presence do not block a legal Trial.

Before each possible Trial, the fixed 40,000-token ceiling is reserved at the recorded maximum:

- one Trial: CNY 1.08 conservative upper bound;
- two-Trial maximum: CNY 2.16 conservative upper bound;
- cumulative hard stop: CNY 20.

For a qualified real result, the final conservative charge uses exact settled total tokens. If a
result is non-real or usage is unsettled, the full 40,000-token reservation remains charged. It is
never described as an invoice or exact provider bill.

`AlphaTrialRunner` still requires a `TrialConfirmation` audit object with the exact Trial ID and
preview digest. The stage writes the truthful source `approved_goal_budget`. The earlier
`local_tty` source remains backward-compatible for older Alpha callers, but this operator neither
requests nor simulates it.

## 4. Actual automatic execution sequence

One invocation of `scripts/run_alpha_c_real_evidence.py` performs these steps in order:

1. Check only whether `DEEPSEEK_API_KEY` is configured; never print or persist its value.
2. Validate the exact branch/base, clean tracked checkout, production Champion, provider/model,
   fixed budget and CNY 20 ceiling.
3. Atomically create `D:\DevData\tianwen-alpha-c-real-evidence` as the one-use stage root. An
   existing root stops the process; it is never overwritten or reused.
4. Prepare fixed A1, complete Docker/seed/baseline preflight, prove zero Goal/Run/model usage, and
   persist the stage authority, bounded preview and zero-paid preflight receipt.
5. Create the exact `approved_goal_budget` audit binding and automatically execute the first Trial.
6. Reload and validate the durable TrialResult, TrialManifest, final-verifier Evidence and exact
   budget usage, then write the honest stop/charge decision.
7. Stop after any success, non-real result, operational result, incomplete verification, boundary
   problem, non-verifier failure or other non-qualifying outcome.
8. Only after a qualifying first failure, prepare one fresh A1 Trial with
   `previous_trial_id=None`. Require distinct Trial/store/workspace identities, the same complete
   condition snapshot, and the same Champion version and digest.
9. Persist one retry receipt containing bounded first and second prepared bindings for Trial ID,
   condition digest, Champion version/digest, workspace and store, plus the first Result digest.
10. Automatically execute that one repeat. Never prepare or execute a third Trial.
11. Form a Case only when both real verifier failures have identical capability scope and problem
    fingerprint. Otherwise stop without manufacturing learning evidence.

## 5. Learning and product stop boundaries

- A qualified success is projected and observed once, then stops with no Case.
- A single qualified failure is observation only.
- Non-real, operational, usage, environment, verification or boundary failures never enter real
  learning intake.
- Two matching qualified failures may create one Case, then stop at
  `case_requires_attribution`.
- Recurrence does not prove causality. Unknown, out-of-scope or insufficient Attribution produces
  no Lesson.
- No Candidate may exist without a persisted real Case, resolved `repo_task_skill` Attribution and
  conditional Lesson.
- Candidate creation, if separately authorized later, must not change the ActivePointer.
- Promotion, Shadow, Runtime, DSH and Alpha-D remain outside this stage.

## 6. Offline evidence and review state

Historical comprehensive offline gates at `babf37698d409d6941bd52d462b5612543ec605d`
passed, including the full Python suite (`537 passed, 4 skipped`), A1-A5 tests, Ruff, Runtime
Bundle build, TypeScript typecheck, DSH public/private-surface checks, Vitest (`244 passed,
7 skipped`) and `git diff --check`.

The proportional-safety implementation at `7b01aa7671cd06065c8be778121607e36ac2b306`
removed the obsolete TTY and price freshness/file gates. Its focused runner, Alpha Trial and
Alpha-C Intake regression set passed `67` tests.

The final correctness review then reported C1/I2/M0:

- C1: this handoff still described the removed gates;
- I1: unsettled usage could erase the full reservation charge;
- I2: the retry receipt omitted the complete bounded second prepared authority.

This final-fix revision corrects all three findings. Its focused RED failed for the two exact code
gaps, focused GREEN passed, and the runner + Alpha Trial + Alpha-C Intake regression set passed
`68` tests. A final whole-stage correctness/YAGNI review must confirm closure before the live
invocation.

## 7. Current local state

At this final-fix handoff update:

- branch: `codex/tianwen-alpha-c-real-evidence`;
- implementation parent: `7b01aa7671cd06065c8be778121607e36ac2b306`;
- local `main`: `4638026f210c0de29262d307dd051934570d975e`;
- local `origin/main`: `4638026f210c0de29262d307dd051934570d975e`;
- pre-fix remote stage ref: `c26232094d4bf5638230fa01b8224c6a2910c1cb`;
- fixed live root `D:\DevData\tianwen-alpha-c-real-evidence`: absent;
- live Provider/Docker execution: not started;
- credential value: never read into receipts, printed or persisted.

The final-fix commit SHA and updated remote stage ref must be recorded by the supervising session
after commit/push. The stage is not merged to `main`.

## 8. Residual risks and mandatory stops

- The live Provider, Docker image and verifier have not yet been exercised by this stage.
- The stage root is intentionally non-restartable. Do not invoke the script merely to inspect it,
  and do not delete or recreate the root after a stop to obtain another batch.
- Stop if checkout, Champion, provider/model, Docker, verifier, receipts, condition equality or
  cumulative cost fails validation.
- Stop at CNY 20, any Goal/authority expansion, credential exposure or major irreversible risk.
- Do not weaken the two-Trial maximum or the real-evidence learning gates.

## 9. Only recommended next entrance

After the final correctness and YAGNI reviews accept this fix and the reviewed commit is pushed:

1. Confirm the reviewed stage branch is checked out, the tracked worktree is clean, the fixed live
   root is still absent, and `DEEPSEEK_API_KEY` is configured without printing it.
2. Invoke the fixed script exactly once from the project root:

   ```powershell
   .\.venv\Scripts\python.exe scripts\run_alpha_c_real_evidence.py
   ```

3. Do not type or pipe confirmation. After legal preflight the first Trial starts automatically;
   the only possible repeat is also automatic and only after a qualifying first failure.
4. Let the script reach its durable final receipt. Do not rerun it or delete/recreate the one-use
   root.
5. Return the receipts, Trial evidence and conservative CNY accounting to the supervising session.

Do not start Attribution by guesswork, Candidate materialization, Promotion, Shadow or Alpha-D
after the run. Those require later evidence and separate governed decisions.
