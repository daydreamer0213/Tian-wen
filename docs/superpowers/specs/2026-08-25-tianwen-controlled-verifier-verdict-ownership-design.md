# Tianwen Controlled Verifier Verdict Ownership Design

**Status:** superseded for the controlled runner by
[`2026-08-26-tianwen-controlled-verifier-terminal-design.md`](2026-08-26-tianwen-controlled-verifier-terminal-design.md)

This document remains the audit record for the optional-error-code repair. Activity-18 later proved
that preserving `not-met` as a tool failure also preserved an unnecessary post-verifier model step;
the newer design corrects that deeper lifecycle mistake.

**Date:** 2026-08-25

**Baseline:** `main@147e9f922d39525af727dfaae348f8c44c379dbc`

## 1. Product problem

Activity-04 reached the real DeepSeek seed path. The Agent loaded the parent Skill, recorded one
decision and called the verifier once. The verifier correctly rejected D1's deliberately wrong
choice, the Session was durable, and the verifier result was durably marked `isError=true`.

The runner nevertheless stopped with `seed-failed`. It required the durable Evidence projection to
contain `errorCode=ARCHITECTURE_DECISION_NOT_MET`, but the installed DSH result contained no
structured error identity.

This is a product state-machine defect: an expected D1 `not-met` verdict cannot advance to the
governed Outcome/Ticket path in the official installed topology.

## 2. Root cause

The installed DSH host and the installed Tianwen Profile have separate physical copies of
`@deepseek-ai/dsh-llm`. The controlled runner's verifier throws a Profile-owned `HarnessError`.
The host-owned Tool Runtime classifies structured errors with `instanceof` against its own
`HarnessError` constructor.

The two constructors have identical package versions and bytes but different JavaScript identities:

```text
profile error instanceof profile HarnessError = true
profile error instanceof host HarnessError    = false
```

Consequently the tool's human-visible error content and `isError=true` survive, while the optional
internal `{name, code}` identity does not. The DSH Session schema explicitly makes that internal
identity optional.

The Activity-04 durable verifier result exactly matched the known not-met message, but this design
does not parse or route on that text. Text is presentation, not business truth.

## 3. Ownership decision

The verifier tool owns the architecture verdict because it has the exact task identity, the first
recorded submission and the frozen hidden expected choice at execution time. It must record one
private live verdict in `DecisionState`:

- exact valid submission with matching choice: `met`, then return success;
- exact valid submission with different choice: `not-met`, then preserve the existing tool error;
- missing context, duplicate calls, invalid arguments or absent submission: no verdict.

The Evidence projection owns the independent durable proof that the verifier call occurred and how
it completed. Before governance writes, Learning Intake must require both sources to agree:

| Live verifier verdict | Durable Evidence requirement |
| --- | --- |
| `met` | complete, `isError=false`, no error code |
| `not-met` | complete, `isError=true`; optional code, when present, must be the frozen not-met code |
| absent | reject before governance |

This is not a fallback from Evidence to memory. It is a two-source agreement: the verifier owns the
semantic verdict, while the persisted Session proves that the corresponding call and result were
actually committed.

### 3.1 One narrow attestation seam

The first runner-only TDD attempt correctly recorded `DecisionState.verdict`, but the focused test
still stopped at D1. That failure exposed the real interface boundary: `consumeOutcome()` independently
re-derived the verdict from Evidence and therefore still classified the missing error code as
inconclusive. The same method is used by controlled evaluation, Shadow and transition activities.
A runner-only exception would merely move the failure to the next stage.

Learning Intake therefore accepts one optional internal attestation alongside the existing Session
and Run id:

```text
{ verdict: met | not-met, acceptanceEvidenceId }
```

It does not trust the attestation alone. It resolves the same final acceptance Evidence and requires
the id, completion status and error polarity to agree with the attested verdict. A present error code
must still match the frozen contract. Only then does it write the existing Outcome fact. Calls that
omit the attestation preserve the current Evidence-only behavior without change.

The controlled coordinator already owns one `DecisionState` per exact Session. For seeds it passes
the attestation directly. For evaluation arms, Shadow runs and transitions it passes a read-only
Session-id resolver as a second, non-manifest argument to the existing controlled service method.
That resolver is consulted after the Agent is idle and the Session is flushed, immediately before
Outcome intake. It is not serialized, hashed, persisted or added to the frozen task packet.

No global verdict registry or second service is introduced. The resolver lives only for the duration
of the existing controlled call and reads the coordinator's existing private map.

## 4. Rejected alternatives

1. **Parse the rendered error text.** Rejected because presentation text is not a stable API and
   would repeat the same transport-first design mistake.
2. **Accept every error result as not-met.** Rejected because an unavailable, duplicate or invalid
   verifier call must remain inconclusive.
3. **Change the shared Evidence projector to infer codes.** Rejected because the projector correctly
   reports only durable facts and is not the owner of this verifier's business meaning.
4. **Patch the installed DSH packages.** Rejected for this repair because Tianwen does not own the
   upstream class-identity mechanism, and the controlled verifier can close its own semantics without
   changing the host, installer or dependency graph.
5. **Return not-met as a successful tool result.** Rejected because it would change model feedback
   and the existing verifier contract.
6. **Fix only the seed runner.** Rejected by the focused GREEN attempt: Learning Intake remained the
   Outcome owner, and the same missing-code condition is reachable in later controlled phases.
7. **Add a global verdict registry.** Rejected because the coordinator already owns the exact
   per-Session state and can pass a bounded read-only resolver through the existing call stack.

## 5. TDD and acceptance

The regression test must reproduce the installed boundary without a Provider request:

1. run the ordinary full controlled lifecycle fixture;
2. preserve each not-met verifier Evidence as complete and `isError=true`;
3. remove only its optional `errorCode`, matching the official installed Session shape;
4. require the complete lifecycle to pass with unchanged role, Session, Evidence, Ticket and pointer
   contracts.

The original implementation must fail this test at the seed boundary. The recorded runner-only
attempt must also remain documented: adding the private verdict without connecting Learning Intake
still failed at D1. The completed implementation must carry the same two-source agreement through
seed, evaluation arm, Shadow and transition Outcome intake.

Existing negative tests must continue to prove that invalid task identity, duplicate verifier calls,
wrong Evidence polarity, persistence failure and missing Skill-use proof stop before Outcome or
Skill-use governance writes.

## 6. Scope and completion

Allowed implementation files:

- `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts`
- `packages/tianwen-runtime/src/learning-intake.ts`
- `packages/tianwen-runtime/src/skill-evaluation.ts`
- `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts`
- `tests/dsh-probe/outcome-intake-runtime.spec.ts`

No DSH patch, Evidence-projector change, installer/Profile/workflow change, new dependency, public
receipt field, retry, budget, checker or framework is permitted.

Completion requires focused RED/GREEN, the full runner suite, controlled compatibility tests,
Runtime Bundle build, repository typecheck, no-private-import check, diff check, independent
correctness/architecture/YAGNI review, normal feature integration and automatic exact-main CI.

Activity-04 is terminal and must not be rerun. A later formal activity requires a new reviewed
operation identity after this repair is merged and CI is green.
