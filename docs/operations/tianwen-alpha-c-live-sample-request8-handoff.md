# Alpha-C request-8 clean live handoff

Date: 2026-08-19

Status: complete; stopped without qualified learning evidence

## Authority and scope

- Base main: `0838742f97e93cee9a1664ded33ed0cddb898ade`.
- Stage branch: `codex/tianwen-alpha-c-live-sample-request8`.
- Code and test commit: `199ae56c2f9e93968f36105b7bfbc7e120a970a8`.
- Fixed root: `D:\DevData\tianwen-alpha-c-live-sample-request8`; it was used once and must not be replayed.
- Fixed A1/DeepSeek v4-pro/max-output-4096 contract was retained. Per-Trial limits were 8 model requests, 40,000 tokens, 8 tool calls, 8 action effects, and 300 seconds.
- The prior receipt `sha256:e85949b628ecd0ec0335327713f781e4add22d57cf616885dfd2226d39facda0` bound CNY 0.56997 before the new root was created.
- No recovery, resume wrapper, Attribution, Lesson, Candidate, Promotion, Shadow, or Alpha-D path was entered.

## Offline gates

- Baseline shared tests: 158 passed.
- Direct runner tests: 17 passed, including mutation checks for the 8-request limit and cumulative CNY preflight.
- Related runner/Alpha Trial/Intake/Alpha Docker tests: 175 passed.
- Full Python: 588 passed, 4 skipped.
- Ruff, Python compilation, and branch `git diff --check`: passed.
- Independent correctness: C0/I0/M0. Independent Ponytail/YAGNI: approved, P1/P2=0.
- Before live: the new root did not exist; the credential was checked only as configured; Docker 29.6.1 was linux/amd64 and the exact locked image digest was present.

## Actual live result

- Exactly one Trial ran: `trial-1223b3fca8729e6d379758cd1c1679d8`.
- Final verifier: `not_met`, `1/7 checks passed`, with `behavior_mismatch`; boundary passed and verification completed.
- Execution status: `stopped`; stop reason: `model_budget_exhausted`.
- Durable Trial usage: 6 model-request charges, 40,000 tokens, 8 tool calls, 8 action effects, and 217 seconds.
- The request-count ceiling of 8 was not reached. The token/tool/action ceilings were reached first; the workspace diff remained empty.
- `qualifies_as_real_model_trial=false`, so the runner stopped as `non_qualifying_trial`. It did not project an Outcome or start a second Trial.
- Governance result: Outcome 0, Gap 0, Signal 0, Ticket 0, Case 0, Candidate `None`.

## Usage accounting

- Five model reservations settled with 24,491 provider-reported tokens.
- The sixth request retained a 15,509-token reservation with no persisted observed usage. The only matching runtime path is a returned provider usage value greater than 15,509 that raised `BudgetExceeded` before `observed_tokens` was stored.
- The final receipt charges the durable admission-ledger ceiling of 40,000 tokens: current estimate CNY 1.08, cumulative estimate CNY 1.64997, and ledger remaining CNY 18.35003.
- Actual provider usage for this Trial is greater than 40,000 tokens and the actual reference-rate cost is greater than CNY 1.08, but the exact values are unavailable. Therefore CNY 18.35003 is not a reliable hard remaining balance for another paid sample.

## Durable evidence

- Final receipt: `D:\DevData\tianwen-alpha-c-live-sample-request8\final-receipt.json`.
- Receipt SHA-256: `5cb5c25670dbadc76b98090c4cca88688c417c140add9268a03d59dcbe12c114`.
- State DB SHA-256: `bb78f4095b2d8d8cc7ac604e031f13f40ff2848a921e9d2767119604d319bf2b`; WAL is empty.
- TrialResult body digest: `sha256:4339ccdb19ab6dae10653e7480147c83686fa2526db49013372ad25ce78d4c58`.
- TrialManifest body digest: `sha256:d4a5600f8e3a3fc610c85aff393280fdeb778f50be4677047b01ee233298c933`.
- Final Evidence body digest: `sha256:f4435119dff5d68d823bdf203dbd84dd0219acba3f83907fbfa764ae4f714a30`.
- Exact seed/public/final containers remain retained as exited states on the locked image; no broad Docker cleanup was performed.

## Stop boundary

Do not rerun this root or create a replacement root. Do not reinterpret the stopped result as real learning evidence. Shared accounting must preserve over-reservation provider usage, or establish a provable provider-cost upper bound, before another paid sample can rely on the CNY 20 hard pool. This stage remains unmerged from main and no Candidate work is authorized.
