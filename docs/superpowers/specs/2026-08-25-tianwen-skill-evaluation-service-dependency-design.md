# Tianwen Skill Evaluation Service Dependency Ownership Design

## Problem

Activity-05 proved the seed repair on the real installed path: both seed Runs and the Candidate closed. The lifecycle then stopped before the first evaluation Agent and before an evaluation plan was recorded.

A zero-Provider installed-Profile diagnostic narrowed the stop to `TianwenSkillEvaluationService.runControlledArms()`. The caller and service contexts both reported the frozen DeepSeek selection, call configuration digest, and normal/0 retry policy as matching. During the real method call, `currentSelection()` completed, but `llm.resolveCallConfig()` was never entered and the service returned `configured-route-mismatch`. No Agent was created and Session/Evolution counts did not change.

The service declares only `tianwenEvidence`, `tianwenEvolution`, `tianwenLearningIntake`, and `skills`, while its methods also directly use `agentDefaultModel`, `agents`, `llm`, `sessionPersistence`, `sessions`, and `tools`. The source harness exposes these services broadly, but the installed Cordis Profile enforces declared dependency ownership.

## Decision

`TianwenSkillEvaluationService` will declare every service it directly consumes:

- `agentDefaultModel`
- `agents`
- `llm`
- `sessionPersistence`
- `sessions`
- `skills`
- `tianwenEvidence`
- `tianwenEvolution`
- `tianwenLearningIntake`
- `tools`

The service remains the owner of controlled evaluation, evaluator, Shadow, and transition execution. The runner continues to pass domain inputs and consume receipts. No dependency will be passed through new method parameters and no evaluation logic will move into the runner.

## Product Flow

1. Cordis starts the Tianwen Runtime and settles the evaluation service only after all declared runtime capabilities exist in its context.
2. The controlled runner closes seed and Candidate facts.
3. The evaluation service reads the same configured route and creates evaluation Agents through its owned dependencies.
4. Existing evaluation, evaluator, Shadow, and transition behavior continues unchanged.

This repairs component ownership before changing orchestration. It does not alter model selection, prompts, tool surfaces, Session persistence semantics, Evolution facts, receipts, retry, or lifecycle stage ordering.

## Alternatives Rejected

- Passing six runtime services through every public evaluation method would duplicate Cordis dependency injection and expand the product API.
- Moving evaluation orchestration into the controlled runner would split Runtime ownership and recreate existing behavior.
- Adding another safe error label would make the failure easier to name without making the installed path work.

## Verification

- A focused RED test must show that the service's declared dependencies omit capabilities used by its real methods.
- The minimal GREEN is the dependency declaration only.
- Existing controlled evaluation, full controlled lifecycle runner, Runtime Bundle, command, and installed Profile tests must remain green.
- Build, typecheck, private-import, and diff gates must pass.
- After controlled integration and exact-main CI, a fresh formal activity—not Activity-05—will verify the real Provider lifecycle.

## Boundaries

- Activity-05 remains consumed and read-only.
- The installed diagnostic is evidence, not a production subsystem.
- No new adapter, service, interface, logging framework, retry policy, budget, checker, or postmortem path is introduced.
