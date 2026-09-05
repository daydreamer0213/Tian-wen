# Safe learning failure diagnostics

## Evidence and scope

A genuine governed source task and native negative feedback produced Candidate
`d7d9fdcf6d8c70f01f520769670efc6f6d26d99cb5dde1193a9cde3211da82a8`.
Evaluation failed before any controlled Run opened. The failure recurred at
`candidate-ready`; the existing durable record retained only that phase.
`runLearningLoopPhase` catches the actual exception but discards it when invoking
`fail(status)`. This prevents the next engineering decision from distinguishing
a package mismatch, unavailable model route, missing Skill or another cause.

This narrow repair supplies diagnostic evidence. It does not claim to repair the
underlying evaluation failure, change criteria, resume completed Runs, or make
the genuine Candidate pass.

## Alternatives and decision

1. Print arbitrary error messages/stacks: small, but could disclose model/source
   text, local paths or provider details. Rejected.
2. Forward the error internally and log only a known preflight code through the
   existing host logger: selected, sufficient for the first failing boundary.
3. Introduce a new error store or evolve every ledger/status schema immediately:
   deferred until the actual cause shows a durable user decision needs that data.

## Contract

- `runLearningLoopPhase` forwards the caught `unknown` error to its existing fail
  callback as a second argument. Existing one-argument callbacks remain valid.
- The standard service fail handler still records the same durable failure with
  the same resume phase. It additionally writes one host diagnostic containing
  only phase, analysis ID and a strictly allowlisted existing
  `ControlledSkillEvaluationPreflightError.code`.
- Only an actual instance of that public Runtime error class and one of its nine
  known codes is recognized. Unknown errors, forged objects and malformed codes
  yield `unclassified`; never log raw error, message, stack, cause or arbitrary
  enumerable properties.
- Use the existing `tianwen-learning` logger; no new dependency, storage,
  scheduler, exported product configuration or evaluation bypass.
- Failure of best-effort diagnostic output must not erase the durable failure.
- No change to model/provider/config, source history, Candidate payload, protocol
  digest or global/scoped Skill selection.

## Verification and resumption

Write failing behavioral tests first: exact callback error forwarding; actual
service failure preserves the durable phase and emits only the safe known code;
unknown/forged/malicious-message input leaks no text. Run the focused orchestrator
suite and typecheck. After independent review, build a separate diagnostic Runtime
under the retained D: acceptance directory, never overwriting the frozen released
bundle or the user's installation. Close only the owned idle acceptance server,
select that diagnostic bundle in the isolated Profile, restart, then use one
ordinary main-task continue. If preflight succeeds unexpectedly, let the genuine
gate execute; never intercept or substitute model results. Preserve every formal
receipt and the original frozen source/Candidate.

The user has delegated in-scope continuation without repeated check-ins. This
diagnostic step does not add a permission or external-source trust boundary.
