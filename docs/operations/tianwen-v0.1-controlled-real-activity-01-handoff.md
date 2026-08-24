# Tianwen v0.1 controlled real activity-01 handoff

## Conclusion

The result is final: activity-01 is consumed. The official `.CMD` launcher entered the official `main()` usage parser, which rejected the old operation authority with exit 2 because it was missing `--model`. This is an operation-authority error, not a product defect, not a Provider defect, and not a Candidate result. The real Provider lifecycle has not run.

The earlier outer-shell incident is separate evidence: it is classified as `pre-invocation-shell-launch-failure`, with `officialLauncherEntered=false`, `activityConsumed=false`, no product state mutation, and no lifecycle invocation. It did not consume activity-01. The later official usage failure crossed the product-entry boundary and did consume it, so it is not retried or rewritten as “never attempted.”

## Safe identity and result

- exact main: `ddaeffc0c486454cb923d9e31461b248be12475b`;
- automatic CI run: `32653721315`, push attempt 1, with Python, TypeScript, and installer-windows successful;
- installed archive digest: `sha256:c7137fa18889b5b9d84886ef3cc8e163d7a84d47fd805bbd08c0eb70a62b67bd`;
- semantic manifest digest: `sha256:fed85eae3ab8ef222b17cf3098e1144c91d4e5fe7ea10e8ff07e18efa49d43e0`;
- workspace-set digest: `sha256:f2034ffab3a6e6e2615bb16cc19a8ee4a9eab7b64cee67b732334fcbe98794bf`.

The official model-use attempt returned exit 2 with 0 stdout bytes and 270 stderr bytes, without a safe receipt. The lifecycle invocation=0 and closed roles=0/25. The offline recovery and final status receipts were valid: selection was `tianwen-offline/phase2-smoke`, credential configuration was present, and `modelRequestsDelta=0`.

Provider-account actual requests=unknown (none-observed), and tool-body actual executions=unknown (none-observed). Durable zero Session/Evolution observations are not promoted into Provider-account or tool-body facts. Evidence remains `naturalUserEvidence=not-claimed` and `externalUserEvidence=not-claimed`.

## Root cause and correction

The old operation text used a positional model name even though the existing public CLI requires an option. The exact supported argv is:

```text
model use --model deepseek-v4-pro --data-dir ABSOLUTE_PRODUCT_ROOT --json
```

The CLI, Runtime, installer, Profile patch, Provider integration, and lifecycle mechanism are unchanged. Recovery corrects only the reviewed operation authority. Activity-01 and all of its packet, workspace, allocation, and evidence artifacts remain preserved with no retry, cleanup, or partial continuation.

## Activity-02 boundary: historical checkpoint and current pointer

At this handoff's historical checkpoint, activity-02 had not started. A new product root, new evidence root,
new operation root, 20 new workspaces, and 25 new Sessions were still future requirements, and none could
reuse activity-01. That checkpoint is preserved as history, not as the current execution state.

Activity-02 now has its isolated product/evidence/operation roots, frozen packet, 20 workspaces, and 25
allocated Sessions. Its first direct official model-use invocation has not been called, so activity-02 remains
unconsumed and the real Provider lifecycle still has not run. Two readiness checkers each made their only
allowed call and failed safely with `unknown` values and `inspectionComplete=false`; neither produced an
independent zero-state attestation. They must not be rerun, replaced by a third checker, or treated as product
failure evidence.

The sole current authority is Task 4D in the reviewed [recovery design](../superpowers/specs/2026-08-24-tianwen-v0.1-controlled-real-activity-02-recovery-design.md), [packet](../superpowers/specs/2026-08-24-tianwen-v0.1-controlled-real-activity-02-packet.md), and [plan](../superpowers/plans/2026-08-24-tianwen-v0.1-controlled-real-activity-02-recovery.md). After that reviewed authority SHA enters main through controlled integration and a new automatic exact-main push attempt 1 has Python, TypeScript, and installer-windows all succeed, the preserved packet may proceed once. Readiness is then enforced by the official product-native fail-closed preflight before any Agent, Provider/model request, or tool body. The first direct official model-use invocation consumes activity-02; any official nonzero result stops without retry and only the frozen offline recovery follows.

## Privacy boundary

This handoff records only safe identity, digest, byte-count, receipt, and evidence-class facts. It excludes raw stderr, filesystem locations, credential values, prompt or output content, tool arguments or results, evaluator reasoning, Skill content, and private runtime identifiers.
