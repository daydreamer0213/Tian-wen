# Tianwen Alpha-C Real-Evidence Canonical Handoff

**Date:** 2026-08-18
**Stage branch:** `codex/tianwen-alpha-c-real-evidence`
**Base `main` and `origin/main`:** `4638026f210c0de29262d307dd051934570d975e`
**Proportional-safety design commit:** `774e5195b8ac3ef49dcd39b8f006a8b21b45cf49`
**One-time recovery design/plan commit:** `e919a06`
**One-time recovery implementation commit:** `d040692e5e2534ec887a34191f2492f11f712a44`
**Final recovery design/plan commit:** `6ea99eeef40746dbfa2460f478a9e9f0d0af22bc`
**Locked-image authority correction:** `a6de7c6`
**Reviewed operator/test HEAD:** `ab715f1341f1582ba20f12998764e02eeff01cd2`
**Canonical recovery-outcome revision:** the commit containing this document
**Status:** recovery-2 authorized but unconsumed; stopped at zero-paid Docker reference readiness;
no real Trial

## 1. Current conclusion

The fixed recovery-2 operator is implemented and reviewed, but its one-use root has not been
created. Docker 29.6.1 can inspect the locked image by content digest ID and by the full canonical
`docker.io/library/python@...` reference, and the returned exact RepoDigest is correct. The short
`python@...` reference used by the operator currently returns `No such image`. Readiness therefore
fails before root creation, model construction, Docker container execution or any paid request.
This is an honest zero-paid launch stop, not learning evidence and not a completed recovery-2.

The Alpha-C proportional-safety correction and its one-time recovery are implemented,
independently reviewed and fully verified offline. The first authorized invocation had stopped
because Docker Desktop's Linux engine was unavailable. Its original root remains unchanged and
its SQLite store still has zero Goal, Run, budget, Result, model-request, Action and Event rows.

After supervision started and verified Docker 29.6.1 Linux/amd64, one authorized fixed recovery
invocation used `D:\DevData\tianwen-alpha-c-real-evidence-recovery-1`. The recovery authority
correctly bound the old authority digest and exact old Trial ID, then `AlphaTrialRunner.prepare()`
stopped at Docker image preflight because the locked immutable image was not installed. Docker
reported `No such image` for
`python@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7`.
The daemon reported zero images and zero containers. No verifier or model request started.

There is no local-TTY, stdin, pipe, environment-confirmation, price-file, network-refresh or
price-freshness gate. After a legal zero-paid preflight, the script automatically executes the
first fixed A1 Trial. It may automatically execute one independent repeat only after the first
Trial is a qualifying verifier-backed failure and the repeat authorities match exactly.

Current factual outcome:

- real Trial count: `0`;
- paid model requests: `0`;
- model tokens: `0`;
- CNY charged: `0`;
- Docker containers/verifier executions: `0`;
- qualified real Case: none;
- conditional Lesson: none;
- Candidate: none;
- Promotion or Shadow change: none.

This is a second truthful zero-paid environment stop, not a real Trial and not learning evidence.
Neither one-use root was deleted, moved, overwritten or rerun. Stage A remains a failed live
proof; its exhausted Goal must not be replayed, and its historical `usage-invalid` fact remains
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

## 4. Historical recovery-1 execution sequence

The reviewed recovery invocation of `scripts/run_alpha_c_real_evidence.py` performs these steps in
order:

1. Check only whether `DEEPSEEK_API_KEY` is configured; never print or persist its value.
2. Validate the exact branch/base, clean tracked checkout, production Champion, provider/model,
   fixed budget and CNY 20 ceiling.
3. Reload the original authority and Trial store read-only, require the exact old Trial ID and zero
   Goal/Run/budget/Result/model/Action/Event state, then atomically create only
   `D:\DevData\tianwen-alpha-c-real-evidence-recovery-1`. An existing root stops the process.
4. Persist the recovery stage authority with the old path/content digest/Trial binding, then
   prepare fixed A1 and attempt Docker/seed/baseline preflight. A prepare exception writes the
   bounded zero-paid final stop receipt.
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

Task 11 then added only the fixed recovery root, read-only old-store validator, `recovery_of`
binding and bounded preflight-stop receipt. TDD evidence was:

- initial recovery RED: `10 failed, 1 passed, 25 deselected`;
- exact-old-state tightening RED: `2 failed, 36 deselected`;
- focused GREEN: `13 passed, 25 deselected` in the independent review;
- real-evidence + Alpha Trial + Alpha-C Intake: `81 passed`;
- direct real-evidence tests: `38 passed`;
- independent correctness: `C0 / I0 / M0`;
- Ponytail/YAGNI: `APPROVED / lean`, `net: -0 lines possible`.

Fresh release gates at `d040692e5e2534ec887a34191f2492f11f712a44`:

- full Python: `547 passed, 4 skipped`;
- Ruff, py_compile and full-branch `git diff --check`: passed;
- Runtime Bundle dependency-topology build: passed;
- workspace TypeScript typecheck: passed;
- DSH public surface: exact `0.1.0-rc.6`, passed;
- private DSH imports: `0`;
- full Vitest: `244 passed, 7 skipped`.

The first Vitest attempt omitted the already-required D-drive probe root and Python environment
variables and failed in test setup (`223 passed, 21 failed, 7 skipped`). Re-running the unchanged
suite with the audited fixed variables passed; this was an environment invocation error, not a
product failure.

Final recovery-2 and locked-image authority evidence at the current operator tree:

- final retry-preflight fix focused: `57 passed`;
- locked-image authority RED: `1 failed, 57 passed` for the obsolete `.Id` equality;
- locked-image authority GREEN: `58 passed`;
- real-evidence + Alpha Trial + Alpha-C Intake: `101 passed`;
- full Python before the two-line image-authority deletion: `566 passed, 4 skipped`;
- Runtime Bundle build, TypeScript typecheck, DSH `0.1.0-rc.6` public surface, zero private
  imports and full Vitest `244 passed, 7 skipped`: passed;
- locked-image scoped correctness: `C0 / I0`;
- locked-image scoped Ponytail/YAGNI: `APPROVED`; the final test-only cleanup removed 14 duplicate
  lines and changed no production behavior.

## 7. Current local state

After the original launch and the single authorized recovery launch:

- branch: `codex/tianwen-alpha-c-real-evidence`;
- reviewed operator/test HEAD: `ab715f1341f1582ba20f12998764e02eeff01cd2`;
- local `main`: `4638026f210c0de29262d307dd051934570d975e`;
- local `origin/main`: `4638026f210c0de29262d307dd051934570d975e`;
- pre-fix remote stage ref: `c26232094d4bf5638230fa01b8224c6a2910c1cb`;
- original root `D:\DevData\tianwen-alpha-c-real-evidence`: present, consumed and unchanged;
- original Trial: `trial-633752d776238190a9411a1cd8b7c71a`;
- original authority SHA-256: `66af629ca1e8b9ae7e1998ae0b1883952bcea9ee3afc9f7188568558f8d84192`;
- recovery root `D:\DevData\tianwen-alpha-c-real-evidence-recovery-1`: present and consumed;
- recovery Trial workspace: `trial-81c53da1ea42cc4330854a9e4182c2e5`;
- recovery authority SHA-256: `f7651000fb2fda294e4b45bcd23cca78bb9327df0121a1db1cf112d0bf5e13a4`;
- recovery stop receipt SHA-256: `78c2cd46d4ed03eca520c5ef8e555751872fe80bfa0def90198e5f990422e78e`;
- both Trial stores contain only Artifact, ActivePointer, AppConfig and EvalProtocol;
- both stores have zero budget, model-request reservation, Action and Event rows;
- recovery stop receipt records `DockerExecutionError`, zero requests/tokens/CNY and no
  Case/Lesson/Candidate;
- recovery-2 root `D:\DevData\tianwen-alpha-c-real-evidence-recovery-2`: absent and unconsumed;
- the current short locked image reference fails readiness even though content-ID and full
  canonical-reference inspection return the exact RepoDigest on Linux/amd64;
- Provider/model execution: not started;
- credential value: never read into receipts, printed or persisted.

The final-fix commit SHA and updated remote stage ref must be recorded by the supervising session
after commit/push. The stage is not merged to `main`.

## 8. Residual risks and mandatory stops

- The live Provider and verifier remain unexercised. The immutable image is present, but its short
  repository reference is not currently resolvable by `docker image inspect`.
- The recovery operator correctly wrote the dedicated zero-paid final stop receipt; the earlier
  missing-receipt limitation is closed.
- Both stage roots are intentionally non-restartable. Do not delete, move, overwrite or recreate
  either root, and do not bypass them through a custom invocation.
- Stop if checkout, Champion, provider/model, Docker, verifier, receipts, condition equality or
  cumulative cost fails validation.
- Stop at CNY 20, any Goal/authority expansion, credential exposure or major irreversible risk.
- Do not weaken the two-Trial maximum or the real-evidence learning gates.

## 9. Pending user decisions

None.

There is no pending user decision. Recovery-2 is already authorized; the supervising session is
handling the ordinary technical choice of restoring the short reference or explicitly selecting
the stable full canonical inspect target. The branch must not create recovery-3.

## 10. Only recommended next entrance

Keep recovery-2 unconsumed until the supervising session resolves the short-reference mismatch.
The only two evidence-supported entrances are to restore that exact short reference or explicitly
use the already-working full canonical `docker.io/library/python@digest` inspect target while
keeping the exact RepoDigest and Linux/amd64 checks. Then rerun read-only readiness and execute the
single authorized recovery-2. Do not add fallback logic, normalization, a new pull framework or
recovery-3. Do not merge the stage or enter Candidate, Promotion, Shadow or Alpha-D.
