# Alpha-C A2 non-thinking live sample handoff

## Authority and scope

- Local authority base: `main@860f45c29b530b280834d1903ceb111aa41ce232`.
- Stage branch: `codex/tianwen-alpha-c-live-sample-a2-nonthinking`; runner HEAD before live: `371d9fc572ce7b61d6e2abff8d3b88b237d0393a`.
- One-use root: `D:\DevData\tianwen-alpha-c-live-sample-a2-nonthinking`.
- Historical A1 authority was read only: receipt SHA-256 `55cc4e97115061f4d81c5c28de254962e577da8871f92f182475ebfc6a41e835`, database SHA-256 `ccb26569d3cb5a9fd5278fb3551b538eb92f44bdae3f981a70a00137cf994162`, prior uniform-rate projection upper CNY `13.307382`.
- Fixed condition: A2 1.0.0, `deepseek:deepseek-v4-pro`, `max_tokens=4096`, `thinking={"type":"disabled"}`, and per-Trial budget 8 model requests / 40,000 tokens / 12 tools / 12 action effects / 300 seconds.
- The stage never printed or persisted the API key and did not pass it into Docker.

## Offline and free gates

- TDD RED: `21 failed, 1 passed`; the A2 entry point did not exist. Focused GREEN: `22 passed`.
- Related Alpha Docker / Trial / Intake / task-package tests: `212 passed`; full Python: `604 passed, 4 skipped`; Ruff, py_compile, and diff-check passed.
- MockTransport proved the real model mapping sends `max_tokens=4096` and top-level `thinking.type=disabled`, with no `max_completion_tokens` or `reasoning_effort`.
- A separate zero-request Docker contract used the real A2 producer/parser/settlement path: seed `not_met` 0/7, then the reference patch made public and final checks pass 7/7. Its SQLite SHA-256 is `02290cf8b0dcc06ee1e842912a87a92ee8740b9b4fbb0f81394304fd477b4e7d`; model requests, tokens, and CNY were all zero.
- Independent correctness review: C0 / I0 / M0. Ponytail/YAGNI: P1=0 / P2=0.

## Unique live result

- The runner was invoked once. No replacement root, recovery, replay, or second Trial was used.
- Stop: `no_case_success`; Trial: `trial-9fccc3acf730c0f6410d76183c9e7e56`.
- Durable Result: execution `completed`, verification `completed`, boundary `passed`, verdict `met`, `qualifies_as_real_model_trial=true`, and no failure categories.
- Seed verifier was `not_met` 0/7; the public check passed; final verifier was `met` 7/7.
- The isolated workspace change was only `statuses.py`, seven added lines. Durable `diff.patch` digest: `sha256:dde1cf0192521d581977894f3e0e7ac1e92b2dcd32969163af918a7f774d56de`.
- Model tool sequence: `find_files`, `read_file`, `edit_file`, `run_check`, `read_file`.
- One verified-success Outcome was recorded: `sha256:65851fb1cd76e40834b7982267dbfe1c624c6234b4e4e741e70f501955586c33`. Triage disposition was `observe`; no Gap, Signal, Ticket, Case, Candidate, eval request, or promotion exists.

## Usage and cumulative projection

- Six external model requests settled with total tokens `1,959 / 2,019 / 2,343 / 2,422 / 2,663 / 3,088`.
- Input tokens: `1,894 / 1,974 / 2,155 / 2,369 / 2,605 / 2,905` (total `13,902`).
- Output tokens: `65 / 45 / 188 / 53 / 58 / 183` (total `592`); the durable provider usage contains no reasoning-token entry.
- Total observed tokens: `14,494`; all six reservations are `settled`, and aggregate reserved usage is zero.
- Current uniform 27 CNY/M audit projection: CNY `0.391338`. Cumulative projection: CNY `13.698720`; remaining within the standing CNY20 pool: CNY `6.301280`.
- This is an audit projection, not a provider invoice.

## Durable evidence

- Final receipt SHA-256: `fd0ed0248eddccf6f36d7302fde5ef2a104d85f67ecf9c250c674dbb897bd856`.
- SQLite SHA-256: `19c007490593f922711aa778e4a48b7fb71f32a8c3267e9abe900b407e420197`; a zero-byte WAL and a 32,768-byte SHM file remain after the read-only audit.
- Result digest: `sha256:2ff7aad08af7566d305fd1c2cd039adb3dee7c29af4ff232ec8a3a971c6a65b8`.
- Manifest digest: `sha256:32784871ca791f1510317956f01d53a0d9870025583eeeded6a7dfbab4f56837`; it freezes A2, the 40k budget, non-thinking mode, and 4096 exactly.
- Final Evidence digest: `sha256:7de8690a0641adc33a520d249369fe38cb169abdc5aea45a08651e447d41571b`, bound to the final round Run and Docker verifier.
- Three durable check records are `finished` with `removed_at=null`; their exact terminal containers remain for audit:
  - seed: `aaaf77b6c92d61b9f2bc565155641ec9e2393f7e7939803d186d8627d2d35c01`, exited 0;
  - public check: `9b03779330c6a4183ff4eda35a8251869e08b7a57029f54b7ef5ac41ace1f3b6`, exited 0;
  - final verifier: `a74b1b2d88c31eea880651b4d7674c715c2c49ff785af178781a9009180c3c75`, exited 0.

## Stop boundary

- This root is consumed and must not be replayed or replaced.
- Candidate remains `None`; Attribution/Lesson/Candidate, Promotion, Shadow, and Alpha-D were not entered.
- This one-shot stage is not merged to main. GitHub synchronization is deferred ordinary backup work and cannot trigger another live run.
