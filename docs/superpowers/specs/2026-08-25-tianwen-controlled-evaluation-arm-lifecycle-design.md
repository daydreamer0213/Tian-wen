# Controlled Evaluation Arm Lifecycle Design

## Problem

Activity-06 proved that the repaired evaluation service can enter and complete the first real
baseline arm. It then stopped before the matching Candidate arm. The durable state is precise:
one evaluation objective was not recorded, the baseline Session was persisted and governed, the
Candidate Session was absent, and all ten future Run bindings and manifests already existed.

The current implementation creates all ten B/C Agents and writes all ten Run bindings before the
first model request. After the first baseline completes it reads the mutable root Skill registry
again before starting the Candidate. The Candidate workspace did not drift. Therefore the only
reachable pre-Candidate stop gate was the ambient root Skill lookup.

This is a lifecycle design defect, not primarily a receipt or security-format defect:

- a plan for future work is represented as already-started runtime work;
- an evaluation frozen from immutable Skill definitions still depends on a mutable ambient
  registry between arms;
- partial durable state describes ten starts when only one arm actually ran;
- the next functional transition can be blocked by unrelated service-scope lifetime.

## Decision

The evaluation plan may allocate all Session and Run identities up front, but runtime activity is
strictly sequential and lazy. Each arm follows one lifecycle:

1. validate the frozen plan and initial root Skill identity;
2. create exactly one Agent for the next arm;
3. install that arm's frozen Skill definition in the Agent scope;
4. verify the Agent-local Skill, tool surface, cwd, and model options;
5. bind exactly that Run;
6. execute, flush, validate, and record the arm result;
7. dispose that Agent before acquiring the next arm.

A future arm has an allocated identity in the plan, but no Agent, Session, Run binding, or Run
manifest until its lifecycle begins.

## Skill authority

The root Skill registry is checked during initial preflight. The resulting parent manifest and
Candidate payload are the immutable execution inputs for this evaluation. Agent-local registration
uses those frozen definitions.

The service must not re-read the mutable root registry between B and C or after all arms. Doing so
does not strengthen the frozen evaluation; it replaces the approved input with ambient mutable
state. Workspace snapshots remain checked before the relevant arm because workspace bytes are task
inputs, not service-discovery state.

## State transitions

The state model is:

```text
planned -> baseline acquired -> baseline closed -> candidate acquired -> candidate closed -> pair recorded
```

On failure, only transitions already entered may leave durable facts. In particular:

- first-baseline Provider failure: one Agent creation, one Run binding, no Candidate start;
- first-Candidate Provider failure: two Agent creations, two Run bindings, no later task start;
- pre-Candidate workspace drift: only the baseline was created and bound;
- a stopped arm is disposed before the method returns;
- successful execution still produces ten B/C Sessions and five objectives in the same order.

The evaluation plan remains the complete allocation record. Run bindings remain the record of
actual starts.

## Error and replay behavior

Existing finite stop reasons and public receipt schemas remain unchanged. This change does not add
diagnostic formats. Existing partial-activity replay remains fail-closed: a later invocation does
not start a second model attempt after any persisted or bound partial arm.

## Scope

Production changes are limited to the controlled B/C orchestration in
`packages/tianwen-runtime/src/skill-evaluation.ts`. Tests are limited to the controlled evaluation
runtime and the installed lifecycle runner. No Provider adapter, retry, budget, schema framework,
database, transaction layer, or public receipt field is added.

## Acceptance

The implementation is accepted when tests prove:

- the first request observes one bound Run, not ten;
- first-baseline failure creates one Agent and binds one Run;
- first-Candidate failure creates two Agents and binds two Runs;
- removing the ambient root registration after initial preflight does not block later frozen arms;
- future Session files and Run facts are absent after an earlier stop;
- the full controlled lifecycle still completes 25 formal Sessions in canonical order;
- compatibility, build, typecheck, and import gates pass.
