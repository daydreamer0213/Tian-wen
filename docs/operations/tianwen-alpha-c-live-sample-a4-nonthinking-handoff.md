# Alpha-C A4 non-thinking live sample handoff

## Authority and scope

- Local authority base: `main@860f45c29b530b280834d1903ceb111aa41ce232`.
- Stage branch: `codex/tianwen-alpha-c-live-sample-a4-nonthinking`; runner HEAD before live: `c0be39e335bd5f71311845eb464c071b63fdb9fd`.
- One-use root: `D:\DevData\tianwen-alpha-c-live-sample-a4-nonthinking`.
- Historical A3 authority was read only: receipt SHA-256 `27548d94e1dfe878a7e2a54520fdcc840acdc3fe454d3e872c059ca0e43f27d3`, database SHA-256 `294e6a523be43d078154da87ac5962ac0e3d7dc5e76db16288344acc8074b6f4`, prior uniform-rate projection upper CNY `14.160285`.
- Fixed condition: A4 1.0.0, `deepseek:deepseek-v4-pro`, `max_tokens=4096`, `thinking={"type":"disabled"}`, and per-Trial budget 8 model requests / 40,000 tokens / 12 tools / 12 action effects / 300 seconds.
- The stage never printed or persisted the API key and did not pass it into Docker.

## Offline and free gates

- TDD RED: `21 failed, 1 passed`; the A4 entry point did not exist. Focused GREEN: `22 passed`.
- Related tests: `227 passed, 2 skipped`; final full Python: `604 passed, 4 skipped`; Ruff, py_compile, and diff-check passed.
- MockTransport proved the model mapping sends `max_tokens=4096` and top-level `thinking.type=disabled`, with no `max_completion_tokens` or `reasoning_effort`.
- The frozen A4 package has no external Source and grants no `external_read`; it limits writes to `headers.py` and binds the official public/final verifier digests.
- A separate zero-request Docker contract used the real A4 producer/parser/settlement path: seed `not_met` 1/8, then the frozen reference patch made the public check pass and the final verifier `met` 8/8. It covered blank, LF, CRLF, exact body/value preservation, header-only, malformed, and no-final-newline inputs. Its SQLite SHA-256 is `5e31f91d30b3637c7a6eacb8ba43abb1696cfeac66b269b8167458ff0f8c79b1`; model requests, tokens, and CNY were zero.
- Independent correctness review: C0 / I0 / M0. Ponytail/YAGNI: P1=0 / P2=0.

## Unique live result

- The runner was invoked once. No replacement root, recovery, replay, or second Trial was used.
- Stop: `no_case_success`; Trial: `trial-2ace9e57a2ed308b54ab89bb9f21967b`.
- Durable Result: execution `completed`, verification `completed`, boundary `passed`, verdict `met`, `qualifies_as_real_model_trial=true`, and no failure categories.
- Seed verifier was `not_met` 1/8; the first public check failed, the second passed, and the final verifier was `met` 8/8.
- The isolated workspace changed only `headers.py`; header names are lowercased while values, body bytes, malformed lines, and LF/CRLF forms remain governed by the passing final verifier. Durable `diff.patch` digest: `sha256:779da4db91af9e461589393dc96570751bc6e3c2dd79e7bc5d340e7a3993c15b`.
- Model tool sequence: `list_directory`, `read_file`, `run_check`, `write_file`, `run_check`, `read_file`.
- One verified-success Outcome was recorded: `sha256:38ed9c07e0a674382fb63bd063e9da9b2b3c77804a36f776c996b246d3219cd9`. Triage disposition was `observe`; no Gap, Signal, Ticket, Case, Candidate, eval request, or promotion exists.

## Usage and cumulative projection

- Six external model requests settled with total tokens `1,999 / 2,140 / 3,185 / 3,262 / 3,513 / 4,339`.
- Input tokens: `1,908 / 2,096 / 2,319 / 3,218 / 3,445 / 3,933` (total `16,919`).
- Output tokens: `91 / 44 / 866 / 44 / 68 / 406` (total `1,519`); the durable provider usage contains no reasoning-token entry.
- Total observed tokens: `18,438`; all six reservations are `settled`, and aggregate reserved usage is zero. Trial usage was 6 tool calls and 6 action effects.
- Current uniform 27 CNY/M audit projection: CNY `0.497826`. Cumulative projection: CNY `14.658111`; remaining within the standing CNY20 pool: CNY `5.341889`.
- This is an audit projection, not a provider invoice.

## Durable evidence

- Final receipt SHA-256: `88411442d38aea2b1d9fbe4796dfd5d6e35c10d376874ea6906212804cb0af30`.
- SQLite SHA-256: `d367e62116eab5063598773341ef16a51327ac41905ea201466df07999085047`; no WAL or SHM sidecar remained after the read-only audit.
- Result digest: `sha256:0e6da76d99ecb79ad47a597e3241c2b6cc0e80651317bfe48bc197f37d490ea6`.
- Manifest digest: `sha256:4bf330adbdb82e17ec3f5301cad6984bf2a653c3d27e1728e8fce73f6aebea4d`; it freezes A4, the 40k budget, non-thinking mode, 4096, and evidence packet digest `sha256:d653bfa8b373c72f3c3893bec3b25f4c40d79acf8bed27ce99308c126c86ff28`.
- Final Evidence digest: `sha256:7d973514436b1808571803bd8de7e80151376636c477c0d1a3f2615fcdeeae4d`, bound to the final round Run and Docker verifier.
- Four durable check records are `finished` with `removed_at=null`; their exact terminal containers remain for audit:
  - seed: `a46345a66688faed4ca78638f207053fdc6ecc17d39ac6af56a49852b3c97614`, exited 0;
  - first public check: `ca13ad1db56913401fc5bfa33d83568b97825d963641faf65cc47a4750f2a211`, exited 1;
  - second public check: `79ddfe1d0d8b902138c6601ed6c4ce972ae7bcaa337860b10d8ecb996111c66a`, exited 0;
  - final verifier: `9bde13cf13e45a909123eeba064a96b29281f20f2e2b822ecaebc91da87a4daf`, exited 0.

## Stop boundary

- This root is consumed and must not be replayed or replaced.
- Candidate remains `None`; Attribution/Lesson/Candidate, Promotion, Shadow, and Alpha-D were not entered.
- This one-shot stage is not merged to main. GitHub synchronization is deferred ordinary backup work and cannot trigger another live run.
