# Alpha-C mainline clean live sample handoff

Date: 2026-08-19  
Status: stopped before Provider; shared Alpha Trial lifecycle blocker confirmed

## Git and scope

- Base/main at stage creation: `f6694d12d6550bca822ba575203287633720e8d3`.
- Branch: `codex/tianwen-alpha-c-live-sample-mainline`.
- Thin-runner code commit: `574e5dabf65fa9c0dd7892fe5a637151b813f03d`.
- Scope stayed fixed at A1, at most two independent Trials, Alpha-C cumulative CNY 20, and `Candidate=None`.
- No Attribution, Lesson, Candidate creation, Promotion, Shadow, Alpha-D, recovery, resume wrapper, TTY gate, or price-freshness gate was added.

## Offline and review evidence

- Tests-first runner RED: 13 expected failures while the entry script was absent.
- GREEN: direct runner 13 passed; related Alpha Docker/Trial/Intake 156 passed; full Python 569 passed, 4 skipped.
- Full Ruff, compile, and `git diff --check` passed.
- Independent correctness before live: C0/I0; one non-blocking test-only Minor for the symmetric second-Trial interruption receipt.
- Independent Ponytail/YAGNI: approved; no safe removable production path.

## Zero-paid real Docker contract gate

- Proof root: `D:\DevData\tianwen-alpha-c-live-sample-mainline-free-gate`.
- Proof receipt: `free-gate-proof.json`, SHA-256 `b503463a4dd3723c89539c9aed074123c937796a65357d640fc9f116932d850a`.
- Two actual A1 prepares used independent Trial/workspace/store identities and distinct trial-scoped `seed-preflight` container names.
- The same real A1 producer output travelled through Docker logs, the production JSON parser, Pydantic validation, and durable `finished/not_met` settlement.
- Observed raw stdout was 310 bytes, SHA-256 `94011985da972e00624174e3763bab8c7890893034a568063499a7137fd5f66d`.
- Both stores had zero budget, model-request reservation, action, and event rows. Requests/tokens/estimated CNY were `0/0/0`.
- All three proof containers were removed by their exact IDs; the formal live root remained absent until the real invocation.

## One authorized live invocation

- Consumed root: `D:\DevData\tianwen-alpha-c-live-sample-mainline`. It must not be rerun, removed, overwritten, or treated as a recovery authority.
- Trial ID: `trial-2f7e37a0562ccb539b9ad2bece64ea96`.
- Final receipt SHA-256: `1d38fa961158870699d4ae3598e15ecbf0c27440e584da12fd8a41bf1593de1b`.
- Stop: `trial_execution_interrupted`; requests `0`, tokens `0`, reserved requests/tokens `0/0`, estimated CNY `0`, remaining Alpha-C budget `20`, Case `null`, Candidate `null`.
- SQLite SHA-256: `3f86a9a1436d71c421339da900b608f713f68e92f7eacfdeac748d68e2c9294e`.
- Durable objects are exactly one active pointer, preview, prepared Trial state, app config, Champion artifact, finished seed check, and eval protocol. Goal/Run/Manifest/Result and all budget/request/action/event/promotion rows are absent.
- Retained exact container `7743e9482d5cff75d838f404059d46e00c073407603c35dbdd9dd93b0304fcb4` is exited(0), error empty, and bound to the persisted `seed-preflight` record. Its raw A1 output is the same 310-byte digest above.

## Confirmed blocker and stop line

`AlphaTrialRunner.prepare()` runs and durably settles `seed-preflight`, leaving its terminal container. Before Goal creation, `execute()` calls `_revalidate_prepared()`, which calls `run_seed_preflight()` again. Container identity is deterministically derived from the same Trial ID plus `seed-preflight`; `_begin()` therefore tries to create a second container with the already occupied name. The failure happens before Provider, Goal, Run, or budget reservation.

Independent post-stop review classified this as C1/I0. Do not retry this root, create another live root, or call the Provider. The only recommended next entrance is a shared, tests-first Alpha Trial lifecycle fix: keep the existing model/provider/Docker/workspace checks, but revalidate the already durable seed result through `docker.reconcile("seed-preflight")` and compare it exactly with `prepared.seed_verifier`, failing closed on `None`. Do not add a recovery or scheduling framework.
