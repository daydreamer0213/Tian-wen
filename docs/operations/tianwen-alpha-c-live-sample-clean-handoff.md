# Alpha-C clean live sample handoff

Date: 2026-08-18
Status: stopped before Provider; zero paid usage; this root must not be rerun

## Scope and Git

- Branch: `codex/tianwen-alpha-c-live-sample-clean`
- Base: local verified main merge `da3dd4c80e384b7f12c5b1f94cf2f7dc829cb5d3`
- Stage commits:
  - `ae82a55ce00caf5f2bbfe37e6b9b4c6b984a03d4` — trial-scoped Docker container names
  - `762d68a8f105f247efb88b3d99c1f9aaa0fb9fb3` — approved bounded confirmation and real Alpha provenance
  - `e9af9cd1e51ad4e82e1bdae016636640746ad186` — bounded A1 live sample
- Fixed root: `D:\DevData\tianwen-alpha-c-live-sample-clean` (now consumed and preserved)
- No old live root, recovery chain, Candidate, Promotion, Shadow, or Alpha-D path was reused.

## Offline and free-Docker gates

- Related Python: `143 passed`.
- Full Python: `556 passed, 4 skipped`.
- Ruff, `py_compile`, and `git diff --check`: passed.
- Independent correctness: `C0 / I0 / M1`; M1 was only the absence of a committed
  second-Trial interruption test, and an independent offline probe verified that symmetric path.
- Independent Ponytail/YAGNI: approved; no safely removable functional code and no recovery,
  TTY, price-freshness, checkout-lock, CNY-database, or Candidate framework.
- Paid-preflight contract proof used the real A1 producer and locked Docker image through
  real `docker logs`, the production parser, Pydantic, terminal settlement, and a reopened
  StateStore. Its independently observed raw stdout was 310 bytes with SHA-256
  `94011985da972e00624174e3763bab8c7890893034a568063499a7137fd5f66d`,
  verdict `not_met`, status `finished`, exit `0`. Its container was removed by exact ID.

## Actual clean-stage result

The single authorized invocation stopped as `infrastructure_preflight_failed` before any
Goal, Run, model reservation, or Provider request. Final receipt:

- request usage: `0`
- token usage: `0`
- estimated CNY: `0.0`
- remaining Alpha-C budget: `20.0`
- Outcome / Case / Candidate: none / none / none
- receipt SHA-256: `cab5378238176243a7aff316107d7a48aeecbf1ea45c1e6f4ba54524b69278ba`
- trial store SHA-256: `91e8d934dd30481db2935f85b271604a710d84183b38820e067aa1103ee4415c`
- durable object kinds: one each of active pointer, app config, artifact, eval protocol,
  and the finished seed-preflight check execution; no Goal, Run, Manifest, or Result.
- budget, model-request reservation, action reservation, action, and event row counts: all `0`.

The real seed verifier itself succeeded: trial
`trial-08e11e7eb6e2e8bed6c872fd4198e195`, container exit `0`, durable
`seed_preflight/finished/not_met`. Its independently observed raw stdout had the same
310-byte digest above; this is not `CheckExecutionRecord.output_digest`, which binds the
structured `VerifierResult`. After evidence was bound, that exited container was removed
by exact ID and confirmed absent. The frozen durable record still has `removed_at=null`
because that exact external cleanup was not replayed into the consumed stage root.

## Root cause and stop line

`AlphaTrialRunner.prepare()` failed after the successful Docker seed verifier when it
called `sanitize_model_settings()` on the approved model wrapper. The only model-setting
key was the standard, non-secret `max_tokens`, but `_json_value()` currently rejects any
key containing the substring `token` as credential-like. A pure offline reproduction gives:

`AlphaTrialError: model settings contain a credential-like key`

This is an over-broad shared sanitizer rule, not a Docker, Provider, model, task, or
learning failure. It also explains why fake-runner tests were green: they asserted the
wrapper settings but did not run the real `AlphaTrialRunner.prepare()` sanitizer path.

Do not rerun this root, create a replacement root, or call Provider from this stage.
The unique next engineering entry is a narrow TDD correction to permit the explicitly
approved harmless `max_tokens` setting while retaining fail-closed credential handling,
followed by real-runner preflight coverage. A future live entry requires a new supervisor
decision and must not be described as a retry of this root.

Pending user decisions: none.
