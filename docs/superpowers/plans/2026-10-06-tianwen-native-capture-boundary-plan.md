# Native capture boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent two observed native capture defects from discarding valid work: late kind/status mismatch in reviews, and transport closing tags mistaken for requested answer content.

**Architecture:** Extend the existing pre-capture diagnostic with only the already-invalid kind/status combinations, allowing the native model to correct its own submission. Add a literal-deliverable description to the text trial answer schema; preserve exact user-requested XML and all returned bytes. Neither change normalizes answers, changes quality contracts, verdicts, old proof records or decision policies.

**Tech Stack:** TypeScript, original native structured-output SDK, Vitest, original package build, isolated original CLI zero-model recovery control; no dependencies.

## Global Constraints

- Continuous user authorization includes controlled simulation; no new approval question, natural-repeat wait, formal release condition or old-sample replay.
- main/Daily NO-GO/R9 remains. Default/v1/new DEV policy meanings remain unchanged.
- Old future1 invalid-judgment and study054c candidate-failed are immutable. `</answer>` in the old delivered answer remains literal, not stripped or regraded.
- Do not change `trialInstruction`: recovery binds its exact old text. Native schema field descriptions may evolve prospectively; restored proof uses the original frozen header/schema.
- Only malformed field tuples get correction diagnostics; met/not-met/inconclusive decisions, honest uncertainty and legitimate user formats remain available.
- Generated assets under D:/DevData; D free >=15GiB, prefer >=20GiB, no new dependency or full-old-ledger copies, clean owned temporary fixtures.

## Task 1: Reject invalid review field tuples before native capture

**Files:** modify `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`; test `tests/dsh-migration/conversation-claim-review.spec.ts`.

**Interfaces:** existing `validateCapture(value)` callback still returns only `string | undefined`. Existing final `validateClaimAudit`, native proof/cold recovery, schema and event formats remain unchanged.

- [x] Add original native same-child correction controls for `source-fact + permitted` and each known non-fact kind + `supported`, including additionalClaims. Reuse the existing repair harness; first malformed submission must produce a specific native error, next valid submission in the same Session must succeed, independent second focus remains a different Session. A valid source-fact/supported or inference/permitted must remain accepted, and uncorrected invalid fields must never form valid dual review. Cold recover corrected proof with zero new calls and one successful capture only.
- [x] Run and save actual RED JSON in `D:/DevData/tianwen-native-capture-boundary-engineering-20261006` before source changes.
- [x] Inside the existing unit/claim traversal after exact-quote checking, return a precise message for the original forbidden tuples only:

```ts
if (record(claim) && (claim.kind === 'source-fact' && claim.status === 'permitted'
  || ['advice', 'inference', 'fiction', 'general-knowledge', 'non-factual'].includes(String(claim.kind)) && claim.status === 'supported')) {
  return `Invalid claim kind/status in ${answer.id}: source-fact cannot use permitted; advice, inference, fiction, general-knowledge and non-factual cannot use supported. Correct the fields according to the original evidence and allowed statuses; do not change the evidence or presume a passing verdict.`
}
```

- [x] Run full review/recovery/audit suites, save GREEN, review the scoped diff. Root owns other files, builds/docs/real operator; worker does not edit them or launch real provider.

## Task 2: Explain literal trial answer boundary without sanitizing

**Files:** modify `packages/tianwen-runtime-bundle/src/conversation-judgment.ts`; verify existing native trial coverage in `tests/dsh-migration/conversation-judgment.spec.ts` and actual old proof with original CLI in `D:/DevData/tianwen-native-capture-boundary-engineering-20261006`.

**Interfaces:** `runConversationTrial` returns its native `answer` exactly, and `recoverConversationTrial` restores its original native text/proof unchanged. No parser filter, automatic removal, new output restriction or instruction change.

- [x] Change only TRIAL_SCHEMA.answer description to clarify that the string is literal user-deliverable content. Tool envelopes/capture delimiters such as `</answer>`/`</invoke>` are not user content; when the user explicitly asks for XML/HTML/literal markup, include that requested markup normally.
- [x] Verify native requested XML/literal markup remains returned unchanged; current literal bad-tag answer is not host-normalized. Run existing meaningful trial tests, not a test that merely mirrors the description string.
- [x] Use the original CLI/read-only JSONL backend to recover the previously captured actual study054c adjacent candidate with zero model calls after rebuilding. Bind original output/material/model/guidance/proof digests; confirm old literal `</answer>` remains, original ledger byte-for-byte and no Runtime/Evolution/Loop mount. This confirms backward compatibility, not a new grade.
- [x] Run original Runtime build, relevant published suites and private import check after both source tasks; obtain scoped review and commit code/evidence/doc handoff.

## Task 3: Fresh prospective continuation

**Files:** create new frozen operator/input/audit artifacts under D:/DevData and update authoritative project handoff/result docs.

- [ ] Preserve completed 16actual/1scripted and 56actual/2scripted/1simulated-feedback results and old shared ledger. Add a new distinct summary source, not the consumed source1/source2 pair; use saved met normal counter and original native loop.
- [ ] Read-only zero-call preflight, then actual native proposal/arms/decision/activation. Accept only original native qualified method; do not treat the descriptor as guaranteed model compliance.
- [ ] On actual acceptance, complete real ordinary future/new-task and semantic safety checks, original withdrawal/no-injection/zero-call cold recovery. Keep baseline unknown resolution separate from confirmed content improvement. Independently audit terminal state/old-record preservation/resources and clean reproducible residuals. No mechanical blocked or new user-task request on failure.

Prospective effect clarification, before new execution: the saved ordinary future baseline is unknown/pass, so an after pass/pass cannot establish content improvement. Add a separately disclosed controlled future fault before learning: a new frozen request and deliberately wrong answer, assessed by the same original native dual claim review without admitting it as a learning source. After actual activation, run that same request as a new ordinary task using the actual provider and original method injection, and compare the native review verdicts. This demonstrates correction of that simulated fault only; preserve actual unknown resolution/pass maintenance separately. No manually forced review, source leakage into the proposal, retrospective regrading, or claim of natural model-population improvement.
