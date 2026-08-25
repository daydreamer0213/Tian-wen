# Tianwen Controlled Verifier Verdict Ownership Design

**Status:** approved design

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
it completed. Before governance writes, the runner must require both sources to agree:

| Live verifier verdict | Durable Evidence requirement |
| --- | --- |
| `met` | complete, `isError=false`, no error code |
| `not-met` | complete, `isError=true`; optional code, when present, must be the frozen not-met code |
| absent | reject before governance |

This is not a fallback from Evidence to memory. It is a two-source agreement: the verifier owns the
semantic verdict, while the persisted Session proves that the corresponding call and result were
actually committed.

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

## 5. TDD and acceptance

The regression test must reproduce the installed boundary without a Provider request:

1. run the ordinary full controlled lifecycle fixture;
2. preserve the D1 verifier Evidence as complete and `isError=true`;
3. remove only its optional `errorCode`, matching the official installed Session shape;
4. require the complete lifecycle to pass with unchanged role, Session, Evidence, Ticket and pointer
   contracts.

The original implementation must fail this test at the seed boundary. The minimal implementation
then adds only the private verdict field, assigns it in the verifier, and replaces the Evidence-only
verdict inference with the two-source agreement above.

Existing negative tests must continue to prove that invalid task identity, duplicate verifier calls,
wrong Evidence polarity, persistence failure and missing Skill-use proof stop before Outcome or
Skill-use governance writes.

## 6. Scope and completion

Allowed implementation files:

- `packages/tianwen-runtime-bundle/src/controlled-lifecycle-runner.ts`
- `tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts`

No DSH patch, Evidence-projector change, installer/Profile/workflow change, new dependency, public
receipt field, retry, budget, checker or framework is permitted.

Completion requires focused RED/GREEN, the full runner suite, controlled compatibility tests,
Runtime Bundle build, repository typecheck, no-private-import check, diff check, independent
correctness/architecture/YAGNI review, normal feature integration and automatic exact-main CI.

Activity-04 is terminal and must not be rerun. A later formal activity requires a new reviewed
operation identity after this repair is merged and CI is green.
