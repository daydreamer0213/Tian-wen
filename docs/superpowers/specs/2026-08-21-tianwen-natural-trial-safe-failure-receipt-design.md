# Tianwen Natural Trial Safe Failure Receipt Design

**Date:** 2026-08-21
**Status:** Approved direction, canonical written design
**Baseline:** `eb00292bfcd29ddf00fd0776f64d716f1a8a8df2`

## 1. Purpose

Stage 7 can now run a configured-Provider natural DSH Goal through the installed
Tianwen CLI while keeping DSH `0.1.0-rc.7` as the only product Agent Runtime.
The first real attempt proved the privacy boundary but exposed a normal-path
diagnostic gap:

- the child exited before the first DSH Turn;
- the Goal, Session, Evidence, and Evolution state remained unchanged;
- Provider requests, tool calls, tokens, and cost were zero;
- the parent correctly suppressed raw child stdout and stderr;
- the resulting fixed error could not distinguish Agent resume, verifier
  visibility, Skill resolution, or Run binding failure.

The product therefore needs one privacy-safe, machine-readable failure receipt
for pre-Turn failures. This is evidence gathering for an observed blocker, not
a general logging system and not a fix for an unproved root cause.

## 2. Existing architecture remains authoritative

- DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- DSH owns Agent construction, Session rehydration, Goal execution, model and
  Provider selection, tools, Skills, permissions, and the current Run.
- Tianwen owns only cross-Run governance facts and the installed CLI boundary.
- The natural trial continues to bind its Run and parent Skill before the
  first Turn, then lets DSH execute the Goal normally.
- The existing Evolution ledger remains the only Tianwen governance ledger.
- Python Alpha, RepoTaskRuntime, AlphaRuntime, Dynamic Cordis, legacy Artifact,
  global Champion, Shadow, and Promotion paths remain outside this work.

## 3. Why the current result is unresolved

The safe metadata proves that execution did not pass `ctx.goals.resume()` and
did not persist a Run binding. Static inspection also proves that:

- the manifest shape and digest are valid now;
- the Session cwd is the clean main worktree;
- the repository-relative verifier target exists;
- `read` is a public rc.7 filesystem tool loaded by the Profile;
- `systematic-debugging` exists under the configured DSH Agent home and is not
  marked non-model-invocable;
- filesystem reads are not rejected merely because that Skill lives outside
  the repository workspace.

Those facts do not prove the runtime state of the prepared Agent scope during
the failed child. The suppressed output was not retained and the same attempt
must not be replayed merely to guess. The first actual failing condition is
therefore `UNRESOLVED`.

## 4. Chosen approach

Reuse the existing `goal-live-smoke` pattern:

1. The child converts a known pre-Turn failure into one strict structured
   receipt containing a closed failure code.
2. The parent accepts either one exact success receipt or one exact failure
   receipt, validates Goal and Session identity, normalizes it, and emits one
   JSON line.
3. Raw stdout, raw stderr, stack traces, paths, Skill bodies, prompts, tool
   arguments/results, credentials, and arbitrary error messages never cross
   the parent boundary.
4. Unknown, malformed, mixed, oversized, or identity-mismatched child output
   remains a generic fixed child failure.

This gives the next explicitly authorized attempt enough evidence to identify
the failing subsystem without creating a diagnostic Runtime, probe Profile,
second store, log archive, retry system, or general observability framework.

## 5. Receipt contract

`NaturalRunTrialReceipt` becomes a discriminated union of the existing success
receipt and one failure receipt.

```ts
export type NaturalRunTrialFailureCode =
  | 'manifest-revalidation-failed'
  | 'services-unavailable'
  | 'agent-resume-failed'
  | 'session-goal-preflight-failed'
  | 'verifier-unavailable'
  | 'run-binding-precondition-failed'
  | 'skill-unavailable'
  | 'skill-not-model-invocable'
  | 'run-binding-persistence-failed'
  | 'pre-turn-internal-error'

export interface NaturalRunTrialFailureReceipt {
  readonly schemaVersion: 'tianwen.natural-run-trial-receipt.v1'
  readonly status: 'pre-turn-failed'
  readonly failureCode: NaturalRunTrialFailureCode
  readonly goal: { readonly id: string }
  readonly session: { readonly id: string }
  readonly usage: {
    readonly modelRequests: 0
    readonly toolCalls: 0
    readonly exactCny: 'unavailable'
  }
}
```

The failure receipt deliberately has no Run ID, Evidence ID, learning decision,
ticket, Skill content, filesystem path, Provider response, or free-form reason.
A pre-Turn failure cannot truthfully claim those facts.

The existing success receipt remains unchanged. Existing success consumers do
not receive a new optional field; they narrow on `status`.

## 6. Failure ownership

Each code is produced where the relevant fact is known. The parent never
infers a code from terminal text.

| Failure code | Fact known at source |
|---|---|
| `manifest-revalidation-failed` | Child cannot re-read, validate, or digest-match the frozen manifest. |
| `services-unavailable` | Required Tianwen/DSH services are absent before Agent resume. |
| `agent-resume-failed` | DSH cannot construct or rehydrate the prepared Agent handle. |
| `session-goal-preflight-failed` | Agent/Session/Goal identity, revision, phase, or first-Turn freshness is not the frozen fact. |
| `verifier-unavailable` | The prepared Agent scope does not expose the frozen verifier tool schema. |
| `run-binding-precondition-failed` | A Turn/session mutation invalidates the pre-Turn binding boundary. |
| `skill-unavailable` | The prepared Agent scope cannot resolve the named public DSH Skill. |
| `skill-not-model-invocable` | The resolved Skill explicitly cannot be loaded by the model. |
| `run-binding-persistence-failed` | The existing Evolution service cannot durably record the Run binding/Skill manifest. |
| `pre-turn-internal-error` | A pre-Turn error is real but does not match one of the known safe facts. |

`TianwenLearningIntakeService.bindRunWithSkill()` already owns the Skill and
binding facts. It may attach one closed internal code to its existing errors,
while preserving current messages and behavior for existing callers. The code
is not a public event, is not persisted, and is not derived by matching error
message text.

If a failure happens after the first Turn, this receipt is not used. Existing
settled and settled-with-learning-error semantics continue to report the
actual Run result and post-Run learning outcome.

## 7. Child and parent behavior

### Child

The natural trial runner tracks only the current pre-Turn boundary. On failure
it creates a receipt from a closed code and the already-frozen Goal/Session
IDs. It reports zero usage because the receipt is legal only while the Session
still has no `turn/start` and no new model/tool events.

Before emitting a failure receipt the runner must verify that no first Turn was
created. If that cannot be proven, it emits no structured natural-trial
failure receipt; the parent falls back to its generic fixed failure.

The child writes exactly one JSON line to stdout, writes nothing to stderr, and
exits non-zero for `pre-turn-failed`.

### Parent

The existing bounded child monitor continues to cap each stream at 65,536
bytes. On child close it parses one exact receipt even when the exit code is
non-zero:

- success receipt + exit `0` is accepted;
- `pre-turn-failed` receipt + non-zero exit is accepted and re-emitted as one
  normalized JSON line while the parent returns exit `1`;
- any other status/exit pairing is rejected;
- any stderr, extra JSON, prefix/suffix, unknown key, invalid enum, unsafe
  counter, or Goal/Session mismatch is rejected without forwarding content.

This keeps the safe boundary strict while making a legitimate failure useful.

## 8. Error-handling rules

- The failure code describes the first boundary that did not complete.
- It does not claim the underlying operating-system or library cause.
- The code must not be selected from a caller-supplied string.
- No raw `Error.message`, stack, `cause`, path, URL, or configuration object is
  serialized.
- The parent never searches child output for JSON and never strips ANSI.
- No automatic retry, fallback ordinary resume, replacement Goal, or second
  manifest is introduced.
- A failure receipt is not an Evolution event and is not learning Evidence.
- A failure receipt does not create a Signal, Ticket, Candidate, Evaluation,
  Shadow observation, or Promotion readiness fact.

## 9. Verification

Tests must prove:

1. every closed failure code parses and normalizes with exact Goal/Session IDs;
2. success receipts remain byte-for-byte compatible after normalization;
3. the parent accepts failure receipts only with non-zero child exit;
4. the parent rejects raw stderr, mixed output, unknown keys/codes, unsafe
   counters, identity mismatch, overflow, and success/failure exit mismatch;
5. injected exceptions containing path-, credential-, prompt-, and Skill-shaped
   sentinel text never appear in stdout or stderr;
6. Agent resume failure creates no Turn, Provider request, tool call, Evidence,
   or Evolution event;
7. unavailable verifier and unavailable/non-model-invocable Skill receive their
   exact codes;
8. Run binding precondition and persistence failures receive distinct codes;
9. ordinary resume, live-smoke, and the existing successful scripted natural
   trial remain unchanged;
10. DSH closure stays exactly `0.1.0-rc.7` and private DSH imports remain zero.

The final local bearing gate reuses the existing Stage 7 suites and adds no new
test framework or dependency. Exact-main GitHub CI remains the completion
gate before any new configured-Provider attempt.

## 10. Next real attempt

Only after implementation review, main integration, exact-main Python and
TypeScript CI success, and installation of that exact main bundle may the
supervisor authorize one new attempt using the unchanged Goal and manifest.

The attempt has three legitimate results:

- a normal settled receipt: report the real Outcome and usage;
- a safe pre-Turn failure receipt: investigate only the named subsystem;
- a generic boundary failure: stop and reassess the contract rather than
  layering another diagnostic framework.

The existing external project budget remains an authorization ceiling, not a
pricing subsystem. This work adds no price lookup, snapshot, polling, reserve,
or budget state machine.

## 11. Explicit non-goals

- no self-built Agent Runtime or second Agent loop;
- no generic logger, telemetry pipeline, diagnostics database, trace store, or
  crash reporter;
- no raw child output preservation;
- no Provider wrapper or retry policy;
- no price lookup, pricing snapshot, billing estimator, or budget gate;
- no new Profile, Goal, manifest, Skill copy, or probe;
- no Candidate, Evaluation, Shadow, Active Pointer, Promotion, or Rollback;
- no Alpha, RepoTaskRuntime, Dynamic Cordis, Artifact, or Champion changes.
