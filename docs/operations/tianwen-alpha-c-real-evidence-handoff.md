# Tianwen Alpha-C Real-Evidence Canonical Handoff

**Date:** 2026-08-18
**Stage branch:** `codex/tianwen-alpha-c-real-evidence`
**Base `main` and `origin/main`:** `4638026f210c0de29262d307dd051934570d975e`
**Proportional-safety design commit:** `774e5195b8ac3ef49dcd39b8f006a8b21b45cf49`
**Implementation parent before this final-fix commit:** `7b01aa7671cd06065c8be778121607e36ac2b306`
**Canonical final-fix revision:** the commit containing this document
**Status:** proportional-safety correction complete; one live launch stopped at zero-paid Docker preflight

## 1. Current conclusion

The Alpha-C proportional-safety correction is implemented, independently reviewed and fully
verified offline. One authorized invocation of the fixed operator was then made. It stopped during
`AlphaTrialRunner.prepare()` because Docker Desktop's Linux engine was not running. Docker CLI
reported that `dockerDesktopLinuxEngine` did not exist, so no container, verifier or model request
started.

There is no local-TTY, stdin, pipe, environment-confirmation, price-file, network-refresh or
price-freshness gate. After a legal zero-paid preflight, the script automatically executes the
first fixed A1 Trial. It may automatically execute one independent repeat only after the first
Trial is a qualifying verifier-backed failure and the repeat authorities match exactly.

Current factual outcome:

- real Trial count: `0`;
- paid model requests: `0`;
- model tokens: `0`;
- CNY charged: `0`;
- Docker engine/container executions: `0` (the CLI preflight failed before engine access);
- qualified real Case: none;
- conditional Lesson: none;
- Candidate: none;
- Promotion or Shadow change: none.

This is a truthful zero-paid environment stop, not a real Trial and not learning evidence. The
one-use root was not deleted, moved or recreated, and the script was not rerun. Stage A remains a
failed live proof; its exhausted Goal must not be replayed, and its historical `usage-invalid`
fact remains operational evidence only.

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

The proportional-safety implementation at `7b01aa7671cd06065c8be778121607e36ac2b306`
removed the obsolete TTY and price freshness/file gates. Its focused runner, Alpha Trial and
Alpha-C Intake regression set passed `67` tests.

The final correctness review then reported C1/I2/M0:

- C1: this handoff still described the removed gates;
- I1: unsettled usage could erase the full reservation charge;
- I2: the retry receipt omitted the complete bounded second prepared authority.

Commit `325a36a94fc7b1186e8d00a36494392985fcf68f` corrected all three findings. Its
focused RED failed for the two exact code gaps, focused GREEN passed, and the runner + Alpha Trial
+ Alpha-C Intake regression set passed `68` tests. Scoped correctness re-review returned C0/I0;
Ponytail/YAGNI returned `Lean already. Ship.` and `net: -0 lines possible`.

Fresh final gates after that fix:

- real-evidence + Alpha Trial + Alpha-C Intake: `68 passed`;
- learning, vertical slice and learning-intake regressions: `63 passed`;
- A1-A5: `10 passed`;
- full Python: `534 passed, 4 skipped`;
- Ruff, py_compile and full-branch `git diff --check`: passed;
- Runtime Bundle dependency-topology build: passed;
- workspace TypeScript typecheck: passed;
- DSH public surface: exact `0.1.0-rc.6`, passed;
- private DSH imports: `0`;
- full Vitest: `244 passed, 7 skipped`.

## 7. Current local state

After the single live launch:

- branch: `codex/tianwen-alpha-c-real-evidence`;
- reviewed live-launch code: `325a36a94fc7b1186e8d00a36494392985fcf68f`;
- local `main`: `4638026f210c0de29262d307dd051934570d975e`;
- local `origin/main`: `4638026f210c0de29262d307dd051934570d975e`;
- pre-fix remote stage ref: `c26232094d4bf5638230fa01b8224c6a2910c1cb`;
- fixed live root `D:\DevData\tianwen-alpha-c-real-evidence`: present and consumed;
- attempted prepared identity: `trial-633752d776238190a9411a1cd8b7c71a`;
- durable stage receipt: `receipts/stage-authority.json`;
- Trial store objects: one existing Artifact, ActivePointer, AppConfig and EvalProtocol only;
- Trial store Goal/Run/budget rows: `0 / 0 / 0`;
- preflight/final Trial receipt: absent because Docker preflight raised before `prepare()` returned;
- Provider/model execution: not started;
- credential value: never read into receipts, printed or persisted.

The final-fix commit SHA and updated remote stage ref must be recorded by the supervising session
after commit/push. The stage is not merged to `main`.

## 8. Residual risks and mandatory stops

- The live Provider, Docker image and verifier were not exercised because Docker Desktop's Linux
  engine was unavailable.
- The operator does not yet turn an exception raised inside Docker preflight into a dedicated
  final stop receipt. The stage authority plus read-only database counts prove zero paid work, but
  this is weaker operational packaging than the intended final receipt.
- The stage root is intentionally non-restartable. Do not delete, move, overwrite or recreate it
  to obtain another batch, and do not bypass the fixed root through a custom invocation.
- Stop if checkout, Champion, provider/model, Docker, verifier, receipts, condition equality or
  cumulative cost fails validation.
- Stop at CNY 20, any Goal/authority expansion, credential exposure or major irreversible risk.
- Do not weaken the two-Trial maximum or the real-evidence learning gates.

## 9. Pending user decisions

None.

This is an engineering recovery question inside the existing Goal, authority and CNY 20 ceiling,
not a new product-value or authorization decision. The supervising session must still review the
evidence before authorizing a recovery implementation because the existing one-use root has been
consumed.

## 10. Only recommended next entrance

First report this zero-paid Docker-preflight stop and the consumed root to the supervising session.
Do not rerun or merge the stage. If supervision approves recovery, the only recommended narrow
follow-up is:

1. start and verify Docker Desktop's Linux engine before creating any new execution authority;
2. add one bounded recovery authority tied to the existing failed stage receipt and exact zero
   Goal/Run/budget proof;
3. allow at most one replacement one-use root without deleting or changing the failed root;
4. write a dedicated preflight-failure/final receipt for any repeated environment stop; and
5. re-review and run only after confirming cumulative paid usage remains zero and the CNY 20
   ceiling is unchanged.

No Candidate, Promotion, Shadow or Alpha-D work may start from this environment failure.
