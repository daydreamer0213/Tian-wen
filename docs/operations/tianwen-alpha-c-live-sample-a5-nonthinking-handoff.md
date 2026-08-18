# Alpha-C A5 non-thinking live sample handoff

## Authority and scope

- Local authority base: `main@860f45c29b530b280834d1903ceb111aa41ce232`.
- Stage branch: `codex/tianwen-alpha-c-live-sample-a5-nonthinking`; runner HEAD before live: `6d906e04c72a9758205226f0c73fb6166f8d827d`.
- One-use root: `D:\DevData\tianwen-alpha-c-live-sample-a5-nonthinking`.
- Historical A4 authority was read only: receipt SHA-256 `88411442d38aea2b1d9fbe4796dfd5d6e35c10d376874ea6906212804cb0af30`, database SHA-256 `d367e62116eab5063598773341ef16a51327ac41905ea201466df07999085047`, prior uniform-rate projection upper CNY `14.658111`.
- Fixed condition: A5 1.0.0, `deepseek:deepseek-v4-pro`, `max_tokens=4096`, `thinking={"type":"disabled"}`, and per-Trial budget 12 model requests / 60,000 tokens / 20 tools / 20 action effects / 600 seconds.
- The stage never printed or persisted the API key and did not pass it into Docker.

## Offline and free gates

- TDD RED: `21 failed, 1 passed`; the A5 entry point did not exist. Focused GREEN: `22 passed`.
- Related tests: `227 passed, 2 skipped`; final full Python: `604 passed, 4 skipped`; Ruff, py_compile, and diff-check passed.
- Permanent A5 tests prove round-2 feedback is absent from round 1, both Runs share one Goal/workspace/Manifest but have distinct Run IDs, and resume skips a durable completed round 1.
- MockTransport proved the model mapping sends `max_tokens=4096` and top-level `thinking.type=disabled`, with no `max_completion_tokens` or `reasoning_effort`.
- A separate zero-request Docker contract used one workspace through the real parser and durable settlement path: seed was `not_met` 0/7; the trusted round-1 state passed `round-1` while final remained `not_met` 2/7; the incremental round-2 state passed `round-2` and final was `met` 7/7. Its SQLite SHA-256 is `2537abd11fcb2d7a696837bc30519a4f069df943f13b2fe9a12faea98d315f68`; budgets, model reservations, and Actions were zero. Its five temporary containers were removed by exact ID; the frozen DB records retain `removed_at=null` because cleanup was external.
- Independent correctness review: C0 / I0 / M0. Ponytail/YAGNI: P1=0 / P2=0.

## Unique live result

- The runner was invoked once. No replacement root, recovery, replay, or second Trial was used.
- Stop: `no_case_success`; Trial: `trial-86244392ac84c1b5bc76e1a75e2103a0`.
- Durable Result: execution `completed`, verification `completed`, boundary `passed`, verdict `met`, `qualifies_as_real_model_trial=true`, and no failure categories.
- Trial state is `finished` with completed rounds `round-1`, then `round-2`. Both Runs bind Goal `goal:pINSqE7cPJFZyHyX0byF9S3s`, Manifest `sha256:b2b0d7c7c5521e7864fdec1d43fa5b758e5b6e0e382ba1482b126a7c13587c28`, and workspace identity `sha256:3ba51f467bc048439cf847f12de8d8a7e4def43ae000c69f5066b3f1916a152d`; their Run IDs are distinct.
- Round 1 had `feedback=null`, wrote the first working implementation, and its public check passed. Round 2 alone bound feedback `sha256:827dd1e619362fe9e09a26658823813e7def6fa7cc9c39ed7407a6c5542f908d`; it read the retained round-1 file, observed one expected public failure, applied the local adjustment, and passed the next public check. The final verifier was `met` 7/7.
- The isolated workspace changed only `reports.py`. Durable `diff.patch` digest: `sha256:48929f1bd3ceecb047b931733e8de88fdf013b966b02cc2e5006008cb892222b`.
- One verified-success Outcome was recorded: `sha256:f89eacd8c2cdb85d49c01a44ddf37a6f838012380b1434db92e230cfb1491235`. Triage disposition was `observe`; no Gap, Signal, Ticket, Case, Candidate, eval request, or promotion exists.

## Usage and cumulative projection

- Twelve external model requests settled with total tokens `1,972 / 2,036 / 2,381 / 2,463 / 2,770 / 2,115 / 2,179 / 2,540 / 2,773 / 3,256 / 3,337 / 3,748`.
- Input tokens: `1,918 / 1,991 / 2,152 / 2,417 / 2,644 / 2,061 / 2,134 / 2,494 / 2,727 / 2,893 / 3,291 / 3,530` (total `30,252`).
- Output tokens: `54 / 45 / 229 / 46 / 126 / 54 / 45 / 46 / 46 / 363 / 46 / 218` (total `1,318`); the durable provider usage contains no reasoning-token entry.
- Total observed tokens: `31,570`; all reservations are `settled`, and aggregate reserved usage is zero. Trial usage was 10 tool calls and 10 action effects; the controller final verifier is recorded separately.
- Current uniform 27 CNY/M audit projection: CNY `0.852390`. Cumulative projection: CNY `15.510501`; remaining within the standing CNY20 pool: CNY `4.489499`.
- This is an audit projection, not a provider invoice.

## Durable evidence

- Final receipt SHA-256: `b2272a8b2c55db5aa0b8988fb73a9d1079cdc8524b98f1681f71efde5c3c3799`.
- SQLite SHA-256: `4ab55a6536715feaee253e912de135114bb87bd0801d2038460afa31350d0e79`; the read-only audit left a zero-byte WAL and a 32,768-byte SHM sidecar.
- Result digest: `sha256:cab7cf77e9355f138d13d3b1d9542211c837df2c70008ddbd5d577cdb95089a4`.
- Manifest digest: `sha256:b2b0d7c7c5521e7864fdec1d43fa5b758e5b6e0e382ba1482b126a7c13587c28`; it freezes A5, both round policies, the exact feedback, the 60k budget, non-thinking mode, and 4096.
- Final Evidence digest: `sha256:0e3f3d80b1c18aace1e1ddee22b83b5329c526c5b19765c501907e7800d9ee3d`, bound to the round-2 Run and Docker final verifier.
- Five durable check records are `finished` with `removed_at=null`; their exact terminal containers remain for audit:
  - seed: `3260fd04e3745e512bf6d89567aac50407cfd07bc5bc0128323b87c6cb68cd78`, exited 0;
  - round-1 public: `22029386a46d8ffeb1a0a8c41cc9965e6b4eb3409481845694242991b0914224`, exited 0;
  - first round-2 public: `308a764226ecbe68e0a6064dd7fb5cf8b25af350fb5773ac1fe860f51368dd82`, exited 1;
  - second round-2 public: `d39fa31a5bba01d8095bd9e9227da3894e87987808ecd460109f676ad4345979`, exited 0;
  - final verifier: `497bb17eaa003b21907c93a181e3826e259b71839265f4b28f62d63cc0829c29`, exited 0.

## Stop boundary

- This root is consumed and must not be replayed or replaced.
- Candidate remains `None`; Attribution/Lesson/Candidate, Promotion, Shadow, and Alpha-D were not entered.
- This one-shot stage is not merged to main. GitHub synchronization is deferred ordinary backup work and cannot trigger another live run.
