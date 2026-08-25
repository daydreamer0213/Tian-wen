# Tianwen Controlled Verifier Terminal Design

**Status:** implementation design

**Date:** 2026-08-26

**Baseline:** `main@2d7cb78cc7bfa304cab02ceae5b4f791454a5e76`

## 1. Product problem

Activity-18 reached the real B/C evaluation stage. One baseline Agent had already loaded the Skill,
recorded a valid decision and completed the verifier call. The verifier correctly determined
`not-met`. The Agent nevertheless started another Provider request only to produce optional prose.
That request streamed reasoning until the 180-second activity deadline and left an aborted Turn.

The system then attempted Outcome intake before checking the terminal Run state, so the public stop
reason became `run-fact-mismatch` instead of the actual timeout. This is a core lifecycle defect, not
a timeout-sizing or receipt-format defect.

## 2. Correct state machine

The controlled architecture task has one formal output: the first accepted
`record_architecture_decision` submission. The verifier owns the business verdict for that submission.
Therefore the successful protocol is:

1. load the required Skill;
2. record exactly one `{ taskId, choice, explanation }` submission;
3. verify exactly once;
4. persist the verifier result and end the Turn immediately;
5. only after terminal and persistence checks, write Outcome and Skill-use governance facts.

There is no fourth model step. A concise explanation already belongs to the recorded decision, so a
second prose rendering adds no product information.

## 3. Domain verdict is not tool failure

`met` and `not-met` are both valid business outcomes. The verifier returns `verified` or `not-met` as
a successful tool result and calls the existing DSH `ToolRunContext.concludeTurn()` seam. Only broken
protocol conditions—missing context, invalid arguments, missing submission or duplicate invocation—
remain tool failures.

The coordinator's private `DecisionState` remains the semantic owner. Durable Evidence proves that
the exact verifier call and result were committed. Learning Intake may accept an attested `not-met`
paired with either the older error-shaped Evidence or the new successful terminal Evidence; callers
without an attestation retain their existing Evidence-only behavior.

## 4. Evaluator material

The evaluator no longer depends on a final assistant message. For this controlled manifest, material
is the canonical JSON representation of the one successful recorded decision submission. Extraction
requires one exact decision call, valid `taskId`, `choice` and `explanation`, a successful matching
tool result, a completed Turn and the existing byte limit.

The blind evaluator envelope names this generic field `materialText`, not `finalText`, because the
same evaluator service now supports both final prose and governed decision submissions.

The generic controlled-evaluation runtime keeps supporting
`final-completed-assistant-text` for other protocols. The real lifecycle manifest uses the new
`recorded-decision-submission` source and freezes `completed-verifier-result` as its stop condition.

## 5. Failure ordering

After Session flush, the runtime validates request identity, guard cancellation and terminal Turn
before Outcome or Skill-use intake. A timeout remains `timeout`; a Provider failure remains
`provider-failed`; an incomplete protocol remains a run-fact failure. No invalid or aborted activity
writes Outcome merely because a verifier Evidence record exists.

## 6. Scope and acceptance

The implementation reuses the existing DSH Agent loop, tool registry, Evidence projector, Learning
Intake and controlled evaluator. It adds no retry, budget, scheduler, transport, checker or security
framework.

Acceptance requires:

- the full 25-Session scripted lifecycle to pass with 65 model requests, 65 tool bodies and 20
  acceptance Evidence records;
- both `met` and `not-met` verifiers to end their Turn after the third request for ordinary roles;
- evaluators to consume recorded decision material without a final assistant message;
- timeout and Provider failures to stop before Outcome/Skill-use governance writes;
- existing generic final-text evaluation protocols to remain compatible;
- Runtime Bundle build, typecheck, no-private-import checks and exact-main CI to pass before another
  formal Provider activity is created.
