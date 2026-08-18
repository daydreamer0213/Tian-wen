# Alpha Docker verifier framing handoff

Date: 2026-08-18
Status: shared fix verified; no new live run or main merge started

## Result

- Branch: `codex/tianwen-alpha-docker-verifier-framing`
- Base: `48efe0b9626ebc5631270bc89008cfd2fc545975`
- Implementation commit: `50921d224ccbf1e0e8fe34e1f8a19381dc376571`
- Production change: remove the two custom whitespace/newline rejection lines from
  `DockerCheckExecutor._parse_verifier`; keep strict UTF-8, standard `json.loads`, and
  existing `VerifierResult` validation.
- Model requests / tokens / estimated CNY: `0 / 0 / 0`.

## Contract and root cause

A1-A5 all produce one JSON document with `print(json.dumps(...))`. Fresh execution
parses only after attached stdout reaches EOF and the container exits; recovery parses
bounded `docker logs` only after terminal state. `json.loads` already accepts JSON
whitespace and rejects multiple documents, trailing garbage, empty input, and malformed
JSON. Pydantic rejects invalid fields, types, and extras.

The prior tests were green because they did not execute a repository verifier producer,
parser tests supplied handwritten ideal bytes, and Alpha Trial tests returned fake
`VerifierResult` objects.
No test connected real producer bytes to parser and durable settlement. The initially
suggested exact-one-LF protocol was therefore withdrawn before implementation or commit;
it was another custom framing rule rather than the standard JSON document contract.

The new permanent contract test runs the repository A1 verifier against its real seed
with `text=False`, feeds those exact bytes through `reconcile()`, and reloads the finished
`CheckExecutionRecord` from a new `StateStore`. The boundary matrix accepts ordinary JSON,
LF, CRLF, and legal JSON whitespace, while rejecting two documents, trailing garbage,
empty/whitespace-only output, invalid UTF-8/JSON, invalid schema, and extra fields.

## Evidence

- RED on the old parser: real A1 producer bytes caused `1 failed / 48 deselected` before
  durable settlement.
- GREEN: Alpha Docker `49 passed`; Alpha Trial plus A1-A5 `50 passed`; full Python
  `537 passed, 4 skipped`; Ruff, `py_compile`, and `git diff --check` passed.
- Independent correctness: `C0 / I0 / M0`; the reviewer confirmed the test uses the real
  producer and crosses parser, Pydantic, `_save_terminal`, and StateStore reload.
- Independent Ponytail/YAGNI: approved; production net change is minus two lines and no
  helper, parser framework, config, fallback, or recovery mechanism was added.
- Free real-Docker proof used the locked A1 image and real verifier: 310 stdout bytes,
  raw SHA-256 `94011985da972e00624174e3763bab8c7890893034a568063499a7137fd5f66d`,
  `not_met`, and durable `finished` settlement. Its exited test container was removed by
  exact ID and confirmed absent.
- The earlier retained live container produced the same 310-byte digest and parsed as
  `not_met` with the fixed parser. Its receipt remained zero request/token/CNY and its
  store had no Goal, Run, action, or budget usage. It too was removed by exact ID after
  evidence binding and confirmed absent.

`CheckExecutionRecord.output_digest` for a verifier is the structured result digest, not
a general durable raw-stdout digest. Raw bytes were independently hashed for these proofs;
adding a durable raw-output contract is outside this fix.

## Next entry

Report this branch to supervision. Do not start a new live root, Provider call, Candidate,
or main merge until the supervisor decides the next clean live entry and Git收口 order.
Pending user decisions: none.
