# Alpha-C A3 non-thinking live sample handoff

## Authority and scope

- Local authority base: `main@860f45c29b530b280834d1903ceb111aa41ce232`.
- Stage branch: `codex/tianwen-alpha-c-live-sample-a3-nonthinking`; runner HEAD before live: `816952a6b33479a788b786947410df2189546fb4`.
- One-use root: `D:\DevData\tianwen-alpha-c-live-sample-a3-nonthinking`.
- Historical A2 authority was read only: receipt SHA-256 `fd0ed0248eddccf6f36d7302fde5ef2a104d85f67ecf9c250c674dbb897bd856`, database SHA-256 `19c007490593f922711aa778e4a48b7fb71f32a8c3267e9abe900b407e420197`, prior uniform-rate projection upper CNY `13.698720`.
- Fixed condition: A3 1.0.0, `deepseek:deepseek-v4-pro`, `max_tokens=4096`, `thinking={"type":"disabled"}`, and per-Trial budget 8 model requests / 40,000 tokens / 12 tools / 12 action effects / 300 seconds.
- The stage never printed or persisted the API key and did not pass it into Docker.

## Offline and free gates

- TDD RED: `21 failed, 1 passed`; the A3 entry point did not exist. Focused GREEN: `22 passed`.
- Four focused source-contract tests passed; related tests: `227 passed, 2 skipped`; final full Python: `604 passed, 4 skipped`; Ruff, py_compile, and diff-check passed.
- MockTransport proved the model mapping sends `max_tokens=4096` and top-level `thinking.type=disabled`, with no `max_completion_tokens` or `reasoning_effort`.
- The frozen source package binds search digest `sha256:db5b66aebe553d3e13e144e85e780b3b960127b836d05c02a136b787df6e9edb` and fetched-content digest `sha256:3a68852bc5741c495bfe5bee65b33831730b877de211917ab5ae9fa97f2e3374`; shared Alpha tests prove `external_read`, untrusted Evidence, and exploration-before-model ordering without live web tools.
- A separate zero-request Docker contract used the real A3 producer/parser/settlement path: seed `not_met` 3/6, then the frozen reference patch made the public check pass and the final verifier `met` 6/6. Its SQLite SHA-256 is `ad575ccab900d0f1f67a48c3595045135c9cd8a97edfd174bc67c362b031a7a1`; model requests, tokens, and CNY were all zero.
- Independent correctness review: C0 / I0 / M0. Ponytail/YAGNI: P1=0 / P2=0.

## Unique live result

- The runner was invoked once. No replacement root, recovery, replay, or second Trial was used.
- Stop: `no_case_success`; Trial: `trial-577efb1d16d4ceee7aab8dc6fdd75f05`.
- Durable Result: execution `completed`, verification `completed`, boundary `passed`, verdict `met`, `qualifies_as_real_model_trial=true`, and no failure categories.
- Seed verifier was `not_met` 3/6; the first public check failed, the second passed, and the final verifier was `met` 6/6.
- The isolated workspace change was only `query.py`: `urlencode(parameters)` became `urlencode(parameters, doseq=True)`. Durable `diff.patch` digest: `sha256:4fa546baa5e839c3e2e43bf17ee3443cf5f3f9067f9d97b1b62414511fb3f980`.
- Model tool sequence: `list_directory`, `read_file`, `run_check`, `edit_file`, `run_check`.
- Goal authorization included `external_read`. The durable official-documentation Source is `https://docs.python.org/3/library/urllib.parse.html`, with fetched-content digest `sha256:3a68852bc5741c495bfe5bee65b33831730b877de211917ab5ae9fa97f2e3374`; exploration stopped `sufficient` before the model run.
- One verified-success Outcome was recorded: `sha256:0b02d2c4784739347d9d5cad8db6b621d752695b49e88d48fb1eba30f3c50557`. Triage disposition was `observe`; no Gap, Signal, Ticket, Case, Candidate, eval request, or promotion exists.

## Usage and cumulative projection

- Six external model requests settled with total tokens `2,482 / 2,544 / 2,698 / 2,969 / 3,042 / 3,360`.
- Input tokens: `2,428 / 2,500 / 2,654 / 2,877 / 2,998 / 3,225` (total `16,682`).
- Output tokens: `54 / 44 / 44 / 92 / 44 / 135` (total `413`); the durable provider usage contains no reasoning-token entry.
- Total observed tokens: `17,095`; all six reservations are `settled`, and aggregate reserved usage is zero. Total Trial usage was 8 tool calls and 5 action effects, including governed exploration.
- Current uniform 27 CNY/M audit projection: CNY `0.461565`. Cumulative projection: CNY `14.160285`; remaining within the standing CNY20 pool: CNY `5.839715`.
- This is an audit projection, not a provider invoice.

## Durable evidence

- Final receipt SHA-256: `27548d94e1dfe878a7e2a54520fdcc840acdc3fe454d3e872c059ca0e43f27d3`.
- SQLite SHA-256: `294e6a523be43d078154da87ac5962ac0e3d7dc5e76db16288344acc8074b6f4`; a zero-byte WAL and a 32,768-byte SHM file remain after the read-only audit.
- Result digest: `sha256:a56196bba5c97ad900d20455b5ce784394628f5b7e0a9869fd3f7047179d2830`.
- Manifest digest: `sha256:c16a956e19b527273fc74d6c3b3203aa8690ef3f7a9e017d7e18901dfc07a83d`; it freezes A3, the 40k budget, non-thinking mode, 4096, and evidence packet digest `sha256:2809aa3e50a752c8c89d73a6adff28fd73ca725b05cdedc4f1907233508eed38`.
- Final Evidence digest: `sha256:a9f299a06d2360dda2d03cdd242f1675b33cd908e96d8c3cefec7bdbaa483dc5`, bound to the final round Run and Docker verifier.
- Four durable check records are `finished` with `removed_at=null`; their exact terminal containers remain for audit:
  - seed: `3e611c4a72d6343cfe1cc36d03caaae958e23e4f8ea642a8884ff19c18be3fec`, exited 0;
  - first public check: `4c3b84fd80d62bfd01fab284662c4101d91367b4504ad0b2865f34d1f952aaf9`, exited 1;
  - second public check: `e043d80474ae70acab8db5ccaf187685f3dbcbb93ba6ee5a7cd4ab9bfe7b557c`, exited 0;
  - final verifier: `ff48a3dc9bd8ce28229cf1218d516dce3d686c55f2b2053387e2a09fcf728a00`, exited 0.

## Stop boundary

- This root is consumed and must not be replayed or replaced.
- Candidate remains `None`; Attribution/Lesson/Candidate, Promotion, Shadow, and Alpha-D were not entered.
- This one-shot stage is not merged to main. GitHub synchronization is deferred ordinary backup work and cannot trigger another live run.
