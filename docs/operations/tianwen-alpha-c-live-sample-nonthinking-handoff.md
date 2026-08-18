# Alpha-C non-thinking live sample handoff

## Authority and scope

- Local authority base: `main@860f45c29b530b280834d1903ceb111aa41ce232`.
- Stage branch: `codex/tianwen-alpha-c-live-sample-nonthinking`.
- Runner commit before live: `c794c360898172ff5854544f6ca827ca680eb3cf`.
- One-use root: `D:\DevData\tianwen-alpha-c-live-sample-nonthinking`.
- Historical authority was read only: receipt SHA-256 `8e5db61e4d07578c490941ccc3c26e1e105e48cfb1ed539017e231a0b0546164`, database SHA-256 `4d5ef26371add49f1b709ffa5da2e7b2961771cfe13559da5a1e6223d3b0b525`, prior uniform-max-rate projection upper CNY `12.905595`.
- Fixed condition: A1, `deepseek:deepseek-v4-pro`, `max_tokens=4096`, `thinking={"type":"disabled"}`, and per-Trial budget 8 model requests / 80,000 tokens / 12 tools / 12 action effects / 300 seconds.
- The stage never printed or persisted the API key and did not pass it into Docker.

## Offline gates and independent review

- TDD RED: `20 failed, 1 passed`; the new entry point did not exist.
- Focused GREEN: `22 passed`.
- Related Alpha Docker / Trial / Intake / DeepSeek tests: `202 passed`.
- Full Python: `604 passed, 4 skipped`.
- Ruff, py_compile, and diff-check passed.
- MockTransport proved the actual request body contains `max_tokens=4096` and top-level `thinking.type=disabled`, with no `max_completion_tokens` or `reasoning_effort`.
- Independent correctness review: C0 / I0 / M0. Ponytail/YAGNI: P1=0 / P2=0.

## Unique live result

- The runner was invoked once. No replacement root, recovery, replay, or second Trial was used.
- Stop: `no_case_success`.
- Trial: `trial-7c8b76c735ca9cb0c978de047f5049a5`.
- Durable Result: execution `completed`, verification `completed`, boundary `passed`, verdict `met`, `qualifies_as_real_model_trial=true`, and no failure categories.
- Seed verifier was `not_met` (1/7); the final verifier was `met` (7/7). The isolated change was only `records.py` and its durable `diff.patch` digest is `sha256:e559674d7ab7c21171110469e306b3c3c1bb8ea1c5629a264c9762cb27c3f0c0`.
- Tool sequence: list directory, read file, public check (failed), write file, public check (passed), final verifier (passed).
- One verified-success Outcome was recorded: `sha256:53c2f7e92a4050c93721fa6948d5aa9563dfaf31478249ec53ff127aa941787d`.
- Triage disposition was `observe`; no Gap, Signal, Ticket, Case, Candidate, promotion request, or promotion exists.

## Usage and cumulative CNY projection

- Six external model requests settled with total tokens `1,949 / 2,011 / 2,144 / 2,740 / 2,820 / 3,217`.
- Input tokens: `1,889 / 1,967 / 2,100 / 2,325 / 2,776 / 3,001` (total `14,058`).
- Output tokens: `60 / 44 / 44 / 415 / 44 / 216` (total `823`). The provider usage records contain no reasoning-token entry.
- Total durable observed tokens: `14,881`; all six reservations are `settled`, and aggregate reserved usage is zero.
- Current uniform 27 CNY/M audit projection: CNY `0.401787`.
- Cumulative projection: CNY `13.307382`; remaining within the standing CNY20 pool: CNY `6.692618`.
- This is an audit projection, not a provider invoice.

## Durable evidence

- Final receipt SHA-256: `55cc4e97115061f4d81c5c28de254962e577da8871f92f182475ebfc6a41e835`.
- SQLite SHA-256: `ccb26569d3cb5a9fd5278fb3551b538eb92f44bdae3f981a70a00137cf994162`; no WAL file remained.
- Result digest: `sha256:1a677294efeb8da81c44f4eed91803db2a3db5b953e8902ea1a987a510b7ea9e`.
- Manifest digest: `sha256:0995357809b44f4ebe0c9b9e8b4e29f3681ecc48b71ebbf26670241b93f2ec10`; its model settings snapshot exactly freezes non-thinking mode and 4096.
- Final Evidence digest: `sha256:a229c308c1d3186481637e8acf726c381cb177c6839befcdea37264bee80b4fc`, bound to the final round Run and Docker verifier.
- Four durable check records are `finished`; no container with this Trial label remained after execution.

## Stop boundary

- This root is consumed and must not be replayed or replaced.
- Candidate remains `None`; Attribution/Lesson/Candidate, Promotion, Shadow, and Alpha-D were not entered.
- This one-shot stage is not merged to main. GitHub synchronization remains ordinary deferred backup work and cannot trigger another live run.
