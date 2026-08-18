# Tianwen Alpha-C Real-Evidence Canonical Handoff

**Date:** 2026-08-18
**Stage branch:** `codex/tianwen-alpha-c-real-evidence`
**Base `main` and `origin/main`:** `4638026f210c0de29262d307dd051934570d975e`
**Proportional-safety design commit:** `774e5195b8ac3ef49dcd39b8f006a8b21b45cf49`
**One-time recovery design/plan commit:** `e919a06`
**One-time recovery implementation commit:** `d040692e5e2534ec887a34191f2492f11f712a44`
**Final recovery design/plan commit:** `6ea99eeef40746dbfa2460f478a9e9f0d0af22bc`
**Locked-image authority correction:** `a6de7c6`
**Pre-canonical operator/test HEAD:** `ab715f1341f1582ba20f12998764e02eeff01cd2`
**Canonical Docker CLI boundary correction:** `110873e6a1a0254ab2bcb650ca3f8e6f9376d157`
**Docker log/recovery-3 implementation:** `b76131c67249fe2ee94a2854da7f8917acafe3df`
**Formal container-Env identity correction:** `e1390794e4a74db2711a77f985e2c3c51b4ca497`
**Canonical recovery-outcome revision:** the commit containing this document
**Status:** recovery-3 consumed; its zero-paid seed-verifier identity failure is fixed and proven
read-only against the retained container; no real Trial

## 1. Current conclusion

The fixed recovery-3 ran once and consumed its one-use root. Its seed-verifier container was
created, started and exited `0`; the verifier returned the expected A1 seed verdict `not_met`
with `1/7 checks passed`. Alpha Docker then rejected prepare/seed-preflight identity settlement
because Docker inspect includes five locked base-image environment variables in addition to the
three explicitly passed variables, while the old `_inspect_matches()` required the entire
environment list to equal only those three. No paid model request was made, and the bounded stop
receipt records zero requests, tokens and CNY. This was not a real Trial or learning evidence.

Commit `e1390794e4a74db2711a77f985e2c3c51b4ca497` corrects the formal identity boundary: the
observed environment must be an unambiguous `key=value` list, all three explicitly controlled
keys must be present with exact values, and additional variables inherited from the immutable
locked image are allowed. A read-only check of the retained recovery-3 container now returns
`_inspect_matches() == true`; it did not call `reconcile()` and every file in the Trial state tree
had the same size and SHA-256 before and after the proof.

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
- Docker containers/verifier executions: recovery-3 has `1` exited-0 container and one verifier
  output that was not settled into the Tianwen store;
- qualified real Case: none;
- conditional Lesson: none;
- Candidate: none;
- Promotion or Shadow change: none.

No consumed one-use root was deleted, moved, overwritten or rerun. Recovery-3 must not be replayed
and recovery-4 is not authorized. Stage A remains a failed live proof; its exhausted Goal must not
be replayed, and its historical `usage-invalid` fact remains operational evidence only.

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

The final canonical Docker CLI boundary wave then proved and fixed all four short-reference uses:

- RED: `4 failed, 76 passed` for preflight inspect, create argv, reconcile `Config.Image` and
  operator readiness;
- GREEN: direct Alpha Docker + real-evidence `80 passed`;
- Alpha Docker + real-evidence + Alpha Trial + Alpha-C Intake: `123 passed`;
- final full Python: `568 passed, 4 skipped`;
- Ruff, py_compile and full-branch `git diff --check`: passed;
- independent correctness: `C0 / I0`;
- Ponytail/YAGNI: `APPROVED / lean`, no load-bearing removable production code.

The fixed Docker logging and recovery-3 wave then produced:

- log compatibility RED: `3 failed`; recovery-3 interface RED: `7 failed`; recovery-3 behavior
  RED: `6 failed, 1 passed`; actual recovery-2 schema RED: `2 failed`;
- direct Alpha Docker + real-evidence: `89 passed`;
- Alpha Docker + real-evidence + Alpha Trial + Alpha-C Intake: `132 passed`;
- final full Python: `577 passed, 4 skipped`;
- Ruff, py_compile and full-branch `git diff --check`: passed;
- independent correctness: `C0 / I0` before the one authorized recovery-3 invocation;
- Ponytail/YAGNI: `APPROVED / lean`, no log or recovery framework and no removable production
  complexity.

The formal container-Env identity correction then produced:

- RED: the real inherited-image environment plus the three controlled variables was rejected,
  `1 failed, 13 passed`;
- GREEN: the focused identity slice was `14 passed` and the full Alpha Docker unit file was
  `38 passed`;
- fresh Alpha Docker + real-evidence + Alpha Trial + Alpha-C Intake: `146 passed`;
- fresh full Python: `591 passed, 4 skipped`;
- Ruff, py_compile and full-branch `git diff --check`: passed;
- independent correctness: `C0 / I0 / M0`;
- Ponytail/YAGNI: `APPROVED / lean`, with zero removable production lines and no environment
  policy framework.

## 7. Current local state

After the original launch and all three authorized recovery launches:

- branch: `codex/tianwen-alpha-c-real-evidence`;
- reviewed operator/test HEAD: `e1390794e4a74db2711a77f985e2c3c51b4ca497`;
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
- recovery-2 root `D:\DevData\tianwen-alpha-c-real-evidence-recovery-2`: present and consumed;
- recovery-2 Trial: `trial-817225ebe2ff018604ee75a02094342c`;
- recovery-2 authority SHA-256: `6709f2dc2612c807590e9b3e89c2b00f937148c095619e3befbcc08320ae8bce`;
- recovery-2 stop receipt SHA-256: `78c2cd46d4ed03eca520c5ef8e555751872fe80bfa0def90198e5f990422e78e`;
- recovery-2 has zero budgets, model reservations, action reservations, Actions and Events; its
  only non-baseline object is the unsettled `seed-preflight` check execution, whose durable status
  remains `running` with no exit code because container start was rejected before settlement;
- exact container `083295b0646365640780f0eacb26cfc1bde4a362342ce2ef53f4c1e95d262a3e`
  had Docker daemon state `created`, never running, with exit code `128` and the local-log
  compression error before its exact-ID removal;
- that container's `Config.Image` is the exact canonical locked image, its `LogConfig` is
  `local` with `max-size=65536` and `max-file=1`, and its only mounts are the recovery-2 A1
  workspace and registered A1 verifier, both read-only;
- the container ID is the durable `seed-preflight` execution for the recovery-2 Trial and is bound
  here to `receipts/stop-preflight.json` with SHA-256
  `78c2cd46d4ed03eca520c5ef8e555751872fe80bfa0def90198e5f990422e78e`;
- after evidence commit `35742a8` and a fresh zero-ledger check, only this exact never-started
  container was removed without force; no other Docker object was targeted;
- recovery-3 root `D:\DevData\tianwen-alpha-c-real-evidence-recovery-3`: present and consumed;
- recovery-3 Trial: `trial-14381e4d2eacdab10efb2fb965c8478a`;
- recovery-3 authority SHA-256: `18ef4e1edd2977f9a338a6166347aceed85809ad66b3b42c19901c50e17ec5dd`;
- recovery-3 stop receipt SHA-256: `78c2cd46d4ed03eca520c5ef8e555751872fe80bfa0def90198e5f990422e78e`;
- recovery-3 has zero budgets, model reservations, action reservations, Actions and Events; its
  only non-baseline object is the unsettled `seed-preflight` check execution;
- exact container `bf1f7c200e84f9880fffeefc2dfbbbc41c0bcefbee50e5d960a48225470f63f2`
  has Docker state `exited`, exit code `0`, the canonical locked image, the exact
  `compress=false` log config and the two registered read-only mounts;
- the locked image environment is exactly
  `PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
  `LANG=C.UTF-8`, `GPG_KEY=7169605F62C751356D054A26A821E680E5FA6305`,
  `PYTHON_VERSION=3.12.11` and
  `PYTHON_SHA256=c30bb24b7f1e9a19b11b55a546434f74e739bb4c271a3e3a80ff4380d49f7adb`;
- the container environment is exactly `HOME=/tmp`, `TMPDIR=/tmp`,
  `PYTHONDONTWRITEBYTECODE=1` followed by those five exact image values; it contains no Provider
  credential;
- its verifier log SHA-256 is
  `94011985da972e00624174e3763bab8c7890893034a568063499a7137fd5f66d` and records
  `verdict=not_met`, `ordinary_fields` passed, six failed checks with the sole failure category
  `behavior_mismatch`, and summary `1/7 checks passed`;
- under the old code, a read-only in-memory check against the actual inspect payload returned
  `false`; replacing only `Config.Env` with the three explicit controlled values returned `true`,
  proving that environment equality was the sole identity mismatch;
- under `e1390794`, the same retained record and unmodified inspect payload return `true`; the
  proof read the SQLite database in read-only mode, did not call `reconcile()`, and left every
  state file byte-for-byte unchanged;
- Provider request execution: not started;
- credential value: never read into receipts, printed or persisted.

The final-fix commit SHA and updated remote stage ref must be recorded by the supervising session
after commit/push. The stage is not merged to `main`.

## 8. Residual risks and mandatory stops

- The live Provider remains unexercised. The seed verifier ran successfully but its historical
  recovery-3 record remains intentionally unsettled; this review did not mutate that consumed
  Trial store to manufacture a successful preflight.
- The recovery-1 operator correctly wrote the dedicated zero-paid final stop receipt; the earlier
  missing-receipt limitation is closed.
- All four stage roots are intentionally non-restartable. Do not delete, move, overwrite or
  recreate them, and do not bypass them through a custom invocation.
- Stop if checkout, Champion, provider/model, Docker, verifier, receipts, condition equality or
  cumulative cost fails validation.
- Stop at CNY 20, any Goal/authority expansion, credential exposure or major irreversible risk.
- Do not weaken the two-Trial maximum or the real-evidence learning gates.

## 9. Pending user decisions

None.

There is no pending user decision. The formal Alpha Trial environment identity contract is fixed
and independently approved. The supervising session must decide how to integrate the shared fix
and authorize any future true live entrance. The branch must not create recovery-4.

## 10. Only recommended next entrance

Commit and report the independently approved formal Env-identity correction, the zero-paid
recovery-3 receipt and the retained-container read-only proof to supervision. Do not replay
recovery-3, create recovery-4, run a Provider or start another live root. Supervision decides the
next true live entrance and how the shared Alpha Docker fix is integrated. Do not merge the stage
or enter Candidate, Promotion, Shadow or Alpha-D.
