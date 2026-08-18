# Alpha real evidence source gate handoff

Date: 2026-08-19

## Outcome

This fixes a missing real-evidence source gate, not a test naming issue.
Previously, any settled runtime request made a Trial look real, including a
deterministic `TestModel` request with no external provider. Learning Intake
also accepted that flag without independently requiring it before projection.

- Base: `97bdd9073ebaad740a0b5d0b44e761b279f6b474`.
- Shared code commit: `c8312afe04296b543fcb88901571a700b895c4f9`.
- Alpha settlement now requires a positive settled request, a non-stopped
  Trial, a non-`none` provider class, a non-test provider name, and a non-test
  model identity from the prepared durable provider snapshot.
- The rule is provider-neutral; it does not hard-code DeepSeek or add a
  provider registry.
- `record_trial_outcome()` requires durable `qualifies_as_real_model_trial=true`
  before reading/copying Evidence or writing any learning object.
- A supplied forged true flag still fails the exact durable-result comparison.
- Explicit user correction and persistent preference remain independent paths
  and may reference a non-real Trial receipt.
- `source_digest` and the problem fingerprint do not duplicate the flag: the
  only verifier-outcome entrance requires exact durable equality and durable
  true before either digest is computed.

## TDD and gates

- Initial RED: 3 failed / 3 passed. TestModel settled as real, the shared
  provider decision was absent, and Intake wrote a non-real outcome.
- Review RED: 3 failed, proving a first implementation incorrectly blocked
  user correction and preference attached to non-real Trials.
- Final focused: 8 passed, 100 deselected.
- Alpha Trial + Intake unit/integration: 108 passed.
- Full Python: 571 passed, 4 skipped.
- Ruff, `compileall`, and `git diff --check`: passed.
- Independent correctness: C0 / I0 / M0.
- Independent Ponytail/YAGNI: approved; P1/P2 0; no safely removable lines.

## Real-Docker negative proof

The real `AlphaTrialRunner`, actual A1 verifier, locked Docker image, and a
deterministic TestModel completed the full lifecycle. It settled one simulated
request and 105 simulated tokens, but correctly persisted
`qualifies_as_real_model_trial=false` because there was no provider authority.

- Proof: `D:\DevData\tianwen-alpha-real-source-dry-lifecycle\dry-real-source-proof.json`.
- Proof SHA-256: `bafb6c787094fef89322b244c6498f07c74d76043ba394dbde176e3bd5c4d902`.
- Trial: `trial-eaca8c405bdc203e9beb0dcd14b46571`.
- External Provider requests/tokens/CNY: `0 / 0 / 0`.
- The two proof containers were removed by exact ID and confirmed absent.

The earlier `707d0d...` dry proof remains unchanged as the negative evidence
that exposed this defect; it was never projected into Intake, so no learning
objects or Candidate were polluted.

## Stop and next entrance

- The new clean-live data root has not been created; Provider calls remain 0.
- No Candidate, Promotion, Shadow, recovery, or Alpha-D work occurred.
- Alpha-C's cumulative CNY 20 balance remains CNY 20.
- Merge this shared fix before resuming any clean live sample from the latest
  main. The paused runner branch must not execute against its pre-fix base.
