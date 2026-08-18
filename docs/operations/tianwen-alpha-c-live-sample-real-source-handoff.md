# Alpha-C clean live sample: real-source handoff

Date: 2026-08-19

Status: complete; stopped without learning evidence or Candidate

## Authority and scope

- Base main: `0838742f97e93cee9a1664ded33ed0cddb898ade`.
- Stage branch: `codex/tianwen-alpha-c-live-sample-real-source`.
- Stage code/test HEAD before this handoff: `a5eca5f4d8c5cc74bded376c2e62ce70cde449cc`.
- Fixed root: `D:\DevData\tianwen-alpha-c-live-sample-real-source`; it was used exactly once and must not be replayed.
- Fixed task/model: A1 `1.0.0`, `deepseek:deepseek-v4-pro`, `max_tokens=4096`.
- Bound: at most two independent Trials, CNY 20 total, conservative accounting at CNY 27 per million observed tokens.
- No Attribution, Lesson, Candidate creation, Promotion, Shadow, or Alpha-D path was entered.

## Pre-live evidence

- Direct runner tests: 14 passed.
- Related runner/Alpha Trial/Intake/Alpha Docker tests: 181 passed.
- Full Python: 584 passed, 4 skipped.
- Ruff, Python compile, and branch `git diff --check`: passed.
- Independent correctness: C0/I0/M0. Independent Ponytail/YAGNI: approved, P1/P2=0.
- The free seed path used the real A1 producer through Docker logs, the standard JSON parser, Pydantic validation, and durable settlement before any Provider request.

## Actual live result

- Exactly one Trial ran: `trial-1b6d87a8306d316040355c91671eed2f`.
- Final verifier: `met`, `7/7 checks passed`; boundary passed and verification completed.
- Execution status: `stopped`; stop reason: `model_budget_exhausted` after the fixed four-request limit.
- Durable usage: 4 model requests, 21,110 provider tokens, 4 tool calls, 4 action effects, 97 seconds.
- Conservative estimated charge: CNY 0.56997; remaining Alpha-C budget: CNY 19.43003.
- Because the execution stopped, `qualifies_as_real_model_trial=false`. The runner therefore stopped as `non_qualifying_trial` and did not project an Outcome or run a second Trial.
- Governance result: Outcome 0, Gap 0, Signal 0, Ticket 0, Case 0, Candidate `None`.

## Durable evidence

- Final receipt: `D:\DevData\tianwen-alpha-c-live-sample-real-source\final-receipt.json`.
- Receipt SHA-256: `e85949b628ecd0ec0335327713f781e4add22d57cf616885dfd2226d39facda0`.
- State DB SHA-256: `6e46f68636ee91558ebd45ccf013e583ce553980a4cb36c0dc4f7fd5b641a6ba`; WAL is empty.
- TrialResult body digest: `sha256:ec6e017381d174c090266c4ebb6c13fb0fb7f7fc3eda79b5aaa14c6425d358f3`.
- TrialManifest body digest: `sha256:f33a2c6e5e123a5a676efdedb89565d3b143c8b9f5f6db3f740ceada2ded2572`.
- Final Evidence body digest: `sha256:c2e47d27ff955f79a4976a071b9f5f68ca9bf0531ff681f55d72e78da795fa80`.
- All four model reservations are settled; aggregate reserved usage is zero.
- The three exact seed/public/final Docker containers are retained as exited(0), read-only, network-none evidence. No broad Docker cleanup was performed.

## Stop boundary

Do not rerun this root, create a replacement root, or treat verifier success alone as qualified learning evidence. The result is a valid product stop: the task was solved, but the execution did not satisfy the durable real-source completion gate. Await a new supervision decision before any further live sampling or Candidate work.
