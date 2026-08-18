# Alpha-C 80k clean live sample handoff

Date: 2026-08-19

## Scope and authority

- Base: `bf670db26eda99cf9ce6df46961c4be1865aa530` (`main` at stage start).
- Stage branch: `codex/tianwen-alpha-c-live-sample-80k`.
- Runner commit: `5fe9060f556c2886e264e4609780063af051d9bf`.
- One-use root: `D:\DevData\tianwen-alpha-c-live-sample-80k`.
- Historical authority was read-only bound to request-8 receipt SHA-256 `5cb5c25670dbadc76b98090c4cca88688c417c140add9268a03d59dcbe12c114`, database SHA-256 `bb78f4095b2d8d8cc7ac604e031f13f40ff2848a921e9d2767119604d319bf2b`, and prior Alpha-C audit upper projection CNY 12.533697.
- The root has been consumed exactly once. Do not rerun it, replace it, or describe a later run as a recovery.

## Fixed trial contract

- Task/model: A1 / `deepseek:deepseek-v4-pro`, constructed through `tianwen.deepseek.deepseek_chat_model`.
- Model settings: `max_tokens=4096`; the transport contract test proved the request used `max_tokens` and omitted `max_completion_tokens`.
- Per-Trial budget: 8 model requests, 80,000 tokens, 12 tool calls, 12 action effects, 300 seconds; at most two independent Trials.
- Admission projection before execution: CNY 12.533697 + 160,000 tokens at CNY 27/M = CNY 16.853697, below the standing CNY 20 pool.
- Candidate, Promotion, Shadow, and Alpha-D were outside scope.

## Offline and free gates

- Direct runner tests: 21 passed.
- Related Alpha Trial, Intake, Alpha Docker, live-script, and provider-contract suite: 195 passed.
- Full Python: 595 passed, 4 skipped; Ruff, `py_compile`, and `git diff --check` passed.
- Independent correctness and Ponytail reviews both ended C0/I0/M0 and approved the bounded live entry.
- A real free Docker A1 seed gate completed `not_met` with a durable `finished` record. Its exact probe container `0f120183294f9e8ce4353e11dc46255bdef8a9e9b2d0c7fd1745aa859b380d65` was removed by ID; the audit root remains at `D:\DevData\tianwen-alpha-c-live-sample-80k-docker-gate`.

## Actual live result

- Trial: `trial-dfbd780ad70e307fb39656998a346821`; no second Trial was created.
- Receipt stop: `non_qualifying_trial`.
- Durable Result: real-source `true`, verifier `not_met` (1/7, `behavior_mismatch`), verification `completed`, boundary `passed`, but execution `failed` with `UnexpectedModelBehavior`.
- Exact runtime error: `Model token limit (4096) exceeded before any response was generated.` The fourth response used all 4,096 output tokens for reasoning and produced no usable response.
- The Agent performed only `list_directory`, `read_file`, and `run_check`; it made no write and the workspace diff is empty.

Provider usage recorded durably:

| request | input | output | reasoning | total |
|---:|---:|---:|---:|---:|
| 1 | 1,983 | 59 | 16 | 2,042 |
| 2 | 2,060 | 51 | 6 | 2,111 |
| 3 | 2,200 | 472 | 427 | 2,672 |
| 4 | 2,853 | 4,096 | 4,096 | 6,949 |
| total | 9,096 | 4,678 | 4,545 | 13,774 |

- Four reservations are `settled`; durable budget usage is 4 requests / 13,774 tokens / 3 tools / 3 action effects, with zero reserved usage.
- Unified CNY 27/M audit projection: current CNY 0.371898; cumulative CNY 12.905595; remaining projection CNY 7.094405. These are audit projections, not a provider invoice.
- Final receipt SHA-256: `8e5db61e4d07578c490941ccc3c26e1e105e48cfb1ed539017e231a0b0546164`.
- Database SHA-256: `4d5ef26371add49f1b709ffa5da2e7b2961771cfe13559da5a1e6223d3b0b525`; WAL is zero bytes.
- Durable object digests: Result `sha256:8323714ad38fd75d08b1851f748c9a72f94ecde4e8896f9549bb126d593c6994`, Manifest `sha256:6a7fdb35c8b04860ff329bc6bdd7637ee5a25f51122249c73d49e8ca35db805d`, final Evidence `sha256:a09e363a3551cbfcb142a46136871de9f4e4aeb84c3a196cab2a59fe7ac0afcb`.

## Governance stop

- Because execution was `failed`, the thin runner correctly refused Intake even though the provider identity was real and the final verifier was `not_met`.
- Outcome, Gap, Signal, Ticket, Case, Attribution, Lesson, and Candidate counts are all zero; `candidate_version_id` is `null`.
- Three live containers remain retained and exited for audit: seed `4dfb1d0dfcd87c353cf0130678e243660d454954a86c4c4ed656c8bb2d9951d2` (exit 0), public check `332f6e4526c7da0612bc78d72969dd9048d71fba9ea97d8627dc125596e8a332` (exit 1), and final verifier `bf39877d24f8b463425ff5b05884817d137f22b8246101ae0ff7f89e75fd9e12` (exit 0). No broad Docker cleanup was performed.
- Do not issue another paid request or create another live root from this stage. The next decision is to review the real thinking-output limit evidence and choose an explicitly bounded model-output contract; this stage itself is complete and must not be replayed.
