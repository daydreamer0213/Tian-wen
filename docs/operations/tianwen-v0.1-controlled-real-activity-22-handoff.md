# Tianwen v0.1 controlled real Activity-22 handoff

## Conclusion

Activity-22 completed the installed configured-DeepSeek controlled lifecycle. The official one-shot
command returned a valid `tianwen.controlled-real-skill-lifecycle.v1` receipt with `status=passed`.
All 25 formal roles closed, the controlled pointer completed
`B@rev1 → C@rev2 → B@rev3 → C@rev4`, and the product was then restored to
`tianwen-offline/phase2-smoke` by the official model command and confirmed by final status.

This is a development-only synthetic-defect operation. It proves that the installed product's
controlled lifecycle can execute its complete state machine with the configured DeepSeek route. It
does not claim natural-user improvement, external-user validation, or general efficacy.

## Reviewed product identity

- exact main: `7d8344810f216c2275f4d307bd0674886027827b`
- automatic exact-main CI: `32883408309`
- CI result: Python, TypeScript, and installer-windows succeeded
- installed archive digest:
  `sha256:56001f3af96eb17a36c3688a212537ce70b4fdcbbee3d1e30b654b0b16264cb8`
- controlled manifest digest:
  `sha256:80e650e454134345dadf909c27884dd46e9f13b8b3d5c812126a255f2d8de2dc`

The operation used a fresh product, evidence, operation, workspace, and Session namespace. Earlier
Activities remain immutable historical evidence and were not reused or rewritten.

## Official operation sequence

The official installed launcher completed the five product commands in order:

1. select `deepseek-official/deepseek-v4-pro`;
2. confirm the configured DeepSeek selection with status;
3. run `controlled-lifecycle` exactly once;
4. restore `tianwen-offline/phase2-smoke`;
5. confirm the offline selection with final status.

The two model-selection commands and both status commands returned valid
`tianwen.model-config.v1` receipts with `modelRequestsDelta=0`. The lifecycle command returned exit
0, one JSON line, and no stderr. No lifecycle retry was performed.

## Receipt-certified lifecycle result

The passed receipt reported:

- 25 formal Sessions;
- `seedRuns=2`;
- `evaluationArms=10`;
- `evaluators=5`;
- `shadowRuns=5`;
- `transitions=3`;
- 70 model-request events;
- 72 tool-call events;
- 20 acceptance Evidence records;
- final pointer revision 4.

The fixed evidence labels remain:

- `source=configured-provider-capable`;
- `environment=development-only`;
- `defect=synthetic-defect`;
- `naturalUserEvidence=not-claimed`;
- `externalUserEvidence=not-claimed`.

## Durable cross-check

Independent readback found exactly the 25 allocated Session files and no extra formal Session. All
25 ended with a completed Turn. Their durable events contained the same 70 `step/start` and 72
`tool/call` totals reported by the receipt.

7 failed unavailable-tool results were ordinary model attempts to call
tools that the evaluator did not publish; the Agent received those failures and then used the one
published evaluator tool correctly. The controlled evaluator service accepted exactly one formal
blind-evaluation submission per evaluator, recorded five durable evaluator observations, and the
lifecycle continued into Shadow. These failed requests are not additional accepted submissions and
are not identity failures.

The Evolution ledger contains the complete governed chain, including five evaluation objectives,
five evaluator observations, one evaluation result, one Shadow result, one pointer initialization,
and one verified promote, rollback, and restore transition. The root public Champion remains absent;
the result is held by the controlled-scope pointer as designed.

## Evidence boundary

The official receipt certifies the lifecycle status, role counts, event counts, evidence labels,
digests, and final pointer. Session and ledger readback independently confirm the durable execution
shape. Provider-account request count remains unknown because this operation has no independent
Provider-account ledger. Tool-call events are not promoted into a separate claim about external tool
body execution.

No raw task text, prompt, model output, tool arguments or results, reasoning, credential value,
workspace path, or private Session/Run/Candidate identity is part of this handoff.

## Product implication

The controlled mechanism is no longer blocked on installed ingress, Profile shutdown, verifier
termination, blind-material identity, evaluator completion ownership, Shadow, or transition
execution. Repeating another synthetic controlled Activity would add little product knowledge. The
next meaningful evidence boundary is ordinary project-owner or external-user work that can test
whether the mechanism improves future tasks; those claims remain unmade.
