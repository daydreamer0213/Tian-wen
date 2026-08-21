# Tianwen Natural DSH Run Evidence Trial Design

**Date:** 2026-08-21

**Status:** Canonical Stage 7 design

**Base:** `main@8fc8ef81caf8fd2d101d74b8a60cb1ea90c973d1`

## 1. Decision

Stage 7 adds one opt-in, thin operational path that connects a **useful,
ordinary DSH Goal Run** to the Run binding, Evidence, Outcome, Signal, and
Ticket capabilities already proved in Stages 1–3.

It does not add another learning algorithm. It does not build live B/C
Evaluation, Shadow, Promotion, a Provider wrapper, a price service, or a
budget scheduler.

The intended path is:

```text
useful ordinary task
  -> freeze one Tianwen Run and parent Skill before the first DSH Turn
  -> let DSH execute normally
  -> persist the DSH Session normally
  -> consume the final structured verifier Outcome
  -> record actual DSH Skill-use proof when it exists
  -> no-case / continue-observing / signal / ticket
  -> stop
```

If a natural run opens a Ticket and an honest four-category EvalProtocol can
already be stated, that protocol may be frozen on the Ticket before any Case
or Candidate is created. Otherwise the Ticket remains open. Stage 7 must not
invent protocol cases merely to continue the pipeline.

This stage closes an operational gap: the repository has the required
services, but current production CLI paths do not compose them around a
normal Goal Run. The demos prove the individual mechanics; they are not a
substitute for a useful natural task.

## 2. Product boundary

DSH `0.1.0-rc.7` remains the only product Agent Runtime.

DSH continues to own:

- Agent creation and resume;
- the Agent loop, Provider, model selection, requests, and retries;
- Goal rounds, Session events, tools, MCP, and sandbox;
- Skill loading and the public `skill` tool;
- tool permissions and approval;
- persistence of the DSH Session.

Tianwen adds only the cross-Run governance calls already present:

- `bindRunWithSkill()` before the first Turn;
- Evidence projection from the completed DSH Session;
- `consumeOutcome()` after the final Turn;
- `recordSkillUse()` after the durable Outcome exists;
- the existing Signal/Ticket reducer;
- optional existing EvalProtocol freezing on a real open Ticket.

Stage 7 must not add:

- an Agent loop, Session, Goal runner, Provider abstraction, or Skill loader;
- a second ledger, database, queue, worker, scheduler, or generic trial
  framework;
- a `natural-run-recorded` or trial lifecycle event;
- Candidate generation, live Evaluation, Shadow, Active Pointer, Promotion,
  Reject, or Rollback;
- Candidate registration in the root DSH Skill registry;
- Python Alpha, `RepoTaskRuntime`, `AlphaRuntime`, Artifact, Dynamic Cordis, or
  global Champion activation;
- a price snapshot service, periodic pricing lookup, request reservation
  engine, or product budget state machine.

The existing `goal-live-smoke` path is not reused as the learning entry. It is
a narrowly frozen smoke proof and explicitly checks that Evolution state stays
unchanged. Stage 7 extends the ordinary Goal resume composition instead.

## 3. Why Stage 7 stops before live Evaluation

The current repository can truthfully persist a natural Run, Outcome,
Evidence, Signal, Ticket, parent Skill manifest, and Skill-use proof.

It still cannot truthfully produce a Shadow-ready Evaluation:

- the current Stage 4 executable path accepts only the service-owned zero-cost
  scripted adapter;
- its Policy/authorization fact is `unobservable`;
- workspace, data, and validator bindings are `unbound`;
- its executable evidence class is `scripted-mechanism`; the broader domain
  type reserves `objective-screening`, but no current trusted producer emits
  it;
- its result is therefore `INCONCLUSIVE`, `not-comparable`, and stale for
  Shadow;
- Stage 5 has no natural Shadow record or routed Run;
- Stage 6 has no ready branch, Active Pointer, or Promotion transition.

Adding a live Evaluation runner before a natural Ticket and Candidate exist
would create infrastructure without an evidence-backed input. Stage 8 will
design the trusted B/C producer only after Stage 7 yields an honest reason to
evaluate a Candidate.

## 4. Opt-in trial entry

### 4.1 Command surface

The smallest product entry extends the existing command:

```text
tianwen resume --goal GOAL_ID --data-dir ABSOLUTE_PATH \
  --trial-manifest ABSOLUTE_PATH --json
```

Without `--trial-manifest`, ordinary `tianwen resume` remains behaviorally
compatible in input validation, DSH composition, output, and exit semantics.

The trial mode is allowed only for the first Turn of the Goal's existing DSH
Session. Preflight must prove that the durable Goal is still resumable and the
Session contains no `turn/start`. A later Goal round is not silently rebound
to a new Tianwen Run in Stage 7.

### 4.2 Ephemeral manifest

The manifest is a strict, bounded input file. It is not copied into the
Evolution ledger and its filesystem path is not persisted or printed.

```ts
interface NaturalRunTrialManifest {
  readonly schemaVersion: 'tianwen.natural-run-trial.v1'
  readonly goalId: string
  readonly taskRef: string
  readonly scopeKey: string
  readonly parentSkillName: string
  readonly acceptanceContract: RunAcceptanceContract
  readonly verifierArguments: Readonly<Record<string, unknown>>
}
```

The manifest accepts only canonical JSON values: `null`, booleans, finite
numbers, strings, arrays, and plain string-keyed objects. `verifierArguments`
has a maximum depth of 16 and at most 16 KiB after the same sorted-key
canonical JSON serialization used by the Evidence projector. Unsupported
values, non-finite numbers, excessive depth, or excessive bytes are rejected
before child execution. Stage 7 adds no generic schema engine or resource
accounting for this manifest.

`goalId` must match the durable Goal selected by the command. `taskRef`,
`scopeKey`, and reusable `problemCategory` are short governance labels, not
copies of the Goal objective or user request. Labels use a documented
allowlist of ASCII letters, digits, `.`, `_`, `-`, `:`, and `/`, with a
128-byte limit. After that syntax check, labels reject a leading `/`, a Windows
drive-path prefix matching `^[A-Za-z]:[\\/]`, and a URI scheme matching
`^[A-Za-z][A-Za-z0-9+.-]*://`. The parser does not pretend to detect every
possible secret by content; callers must not place credentials, Provider
configuration, user prose, URLs with query material, or absolute paths in
these fields or in `verifierArguments`.

`parentSkillName` is resolved through the prepared Agent's public DSH Skill
scope. Stage 7 does not register or inject a Candidate.

The `acceptanceContract` reuses the existing Stage 2 schema. Its tool must be
an already configured, stable verifier whose successful result means the task
contract was met and whose frozen error code means it was not met. A model
statement, `update_goal` call, final answer, or self-assessment is not an
independent verifier.

The raw `verifierArguments` remains outside the Evolution ledger. Before the
first Turn, its canonical SHA-256 digest is frozen in the existing Run-binding
event as `acceptanceSubjectDigest`. Before Outcome intake, the trial
composition compares the **last call in the whole Session** for the acceptance
tool against that digest. It must not search backward for an earlier matching
call. A mismatch produces no Outcome or Skill-use intake and is reported as
`verifier-call-mismatch`; it must never be converted to `met` or `not-met`.

Stage 7 introduces `tianwen.run-binding.v2` for this one additional digest.
Existing `tianwen.run-binding.v1` events and callers retain their exact replay
and identity behavior. `acceptanceContractDigest` continues to mean exactly the
hash of the reusable acceptance rule; it does **not** include the subject. This
preserves Stage 2 recurrence grouping and Stage 3 counterevidence across
different task instances. The v2 Run ID and binding input digest separately
include `acceptanceSubjectDigest`, so exact replay remains idempotent and any
changed subject digest is a conflicting binding. Later Case/Evaluation work
may require v2 provenance but must not reinterpret a legacy v1 binding as if
it had a frozen subject.
The Evidence package exposes its existing argument-digest helper for this use;
Stage 7 must not implement a second canonicalizer that can drift from the
projector.

The manifest contains no price table, price timestamp, CNY reservation, model
credentials, prompt, expected answer, or Candidate content. “Ephemeral” means
Tianwen does not copy the raw arguments into the ledger or receipt; it does not
delete or otherwise manage the user-owned source manifest file.

## 5. Execution sequence

### 5.1 Parent process preflight

Before starting the DSH child process:

1. reuse the existing Goal scan and integrity checks;
2. verify that the target profile's installed `@tianwen/runtime-bundle` is the
   exact package identity expected by the parent CLI;
3. require an absolute, readable, bounded manifest file;
4. parse the exact manifest schema and safe governance labels;
5. require matching Goal identity;
6. require a resumable first-round Session with no prior Turn;
7. compute the normalized manifest's canonical digest and pass only the source
   path plus that digest through the child patch environment; the child reads
   the same bounded file, revalidates it, requires the digest to match, and
   deletes both environment entries before Agent creation;
8. do not load credentials into the parent output or manifest.

This path-plus-digest handoff avoids copying the manifest, avoids a large
Base64 environment payload, and fails closed if the user-owned file changes
between parent and child validation.

The runtime-bundle check is mandatory because the parent selects the patch
while the child resolves the runner from the target DSH profile. A mismatch
must stop before child execution; trial mode must never fall back to an older
runner's ordinary resume behavior.

Any failure here happens before an Agent, model request, tool call, Run
binding, or ledger write.

### 5.2 Prepared Agent and Run binding

The child process uses the existing selected DSH provider and model. It calls
the existing `ctx.agents.resume()` path and keeps the existing model-selection
setup.

After the handle is prepared but before `ctx.goals.resume()` starts the first
Turn, it must:

1. recheck that the Session identity and durable Goal revision still match;
2. recheck that no `turn/start` exists;
3. confirm the verifier tool is visible in the prepared Agent scope;
4. resolve the parent Skill from the same prepared Agent scope;
5. derive `goalRef` only from the rechecked durable DSH Goal as
   `dsh-goal:<goal-id>@<revision>`; it is never accepted from the manifest;
6. call `bindRunWithSkill()` with that reference, the manifest's existing
   acceptance contract, and its precomputed `acceptanceSubjectDigest`;
7. verify the Session digest is unchanged.

If any check fails, dispose the handle and stop before the Goal is driven.

### 5.3 Normal DSH execution

The runner then calls the existing DSH Goal resume seam. It does not replace
the Agent loop, restrict ordinary tools merely for Tianwen, force the Agent to
load the parent Skill, insert a hidden answer, or retry to obtain a desired
learning result.

The task must be useful even if Tianwen produces `no-case`. The Agent may load
the governed parent Skill through DSH's public `skill` tool, but Stage 7 does
not manufacture that call. Absence of Skill-use proof is a valid outcome.

After DSH settles, the existing Session persistence is flushed before
learning intake reads the final facts. The flush must return `true`. A thrown
error or `false` means `persistence-unavailable`: preserve the completed
primary DSH result, perform no learning intake, and report the learning-side
failure.

### 5.4 Post-Run intake

After a terminal Turn:

1. project Evidence once from the flushed Session and select the final record
   in the whole Session for the acceptance contract's tool by call sequence;
2. use that exact record's call sequence, result sequence, and originating
   tool-call arguments for the ephemeral manifest comparison;
3. require the Session digest to remain unchanged, then call
   `consumeOutcome()`;
4. require the intake receipt to reference that same selected Evidence ID;
5. only after the durable Outcome exists, call `recordSkillUse()`;
6. return a safe trial receipt.

This prevents a Session with multiple calls to the same verifier from checking
an earlier call's arguments while consuming a later call's result.

The safe receipt includes the frozen `acceptanceSubjectDigest` and the selected
Evidence ID, but never the raw verifier arguments.

This order is mandatory because the existing ledger rejects Skill-use facts
without the Run's durable Outcome.

The safe receipt contains only:

- Goal, Session, Run, Ticket, and version IDs;
- fixed decisions and reason codes;
- Session event, model request, tool call, and reported token counts;
- whether the verifier call matched;
- whether Skill-use proof was recorded;
- whether the Session remained unchanged by governance intake.

Model request and token usage are derived once from durable
`assistant/message.data.usage` facts. Raw `assistant/chunk` usage is not added
again, so streaming and final-message records cannot double-count the same
request.

It contains no Goal objective, task prompt, final answer, feedback note, tool
arguments or result, Skill body, absolute path, URL, Provider configuration,
or credential.

## 6. Decision semantics

Stage 7 preserves the existing reducer exactly:

| Final fact | Result |
|---|---|
| verifier succeeds | `met -> no-case` |
| verifier result is absent, mismatched, unrecognized, or infrastructure-only | `inconclusive` or no intake; continue observing |
| verifier returns the frozen not-met error and disposition is `observe` | `continue-observing` |
| verifier returns the frozen not-met error and disposition is `ordinary-correction` | `ordinary-correction` |
| first ordinary reusable not-met Run | one Signal only |
| second different natural Run with the same fingerprint | open Ticket |
| severity at least 4 or `blocksGoal=true` | the existing immediate Ticket rule |

The runner must never repeat a task to manufacture the second failure. A
successful task and `no-case` are the preferred normal outcome, not an
incomplete demonstration.

For a reusable contract, `severity` and `blocksGoal` are frozen in the v2 Run
binding before the first Turn from the real task's already-known risk. They
cannot be edited after observing the result and must not be inflated merely to
obtain an immediate Ticket or advance to Stage 8.

Provider, network, Runtime, unrelated tool, persistence, or Evidence failures
remain different from a verified business `not-met` result. They do not create
a reusable learning problem merely because the command failed.

## 7. Ticket and EvalProtocol boundary

If no Ticket is created, Stage 7 ends.

If a Ticket is created, the next governance step is still not Candidate
generation. Before opening a Case, the supervisor must decide whether the
problem can be evaluated with an honest protocol containing:

- problem cases;
- regression cases;
- counterexample cases;
- safety cases;
- a stable verifier and data/subject identity;
- the same model, tools, permissions, input, and decision rules for B and C.

When those facts are available, Stage 7 may call the existing
`freezeSkillEvalProtocol()` on the open Ticket. If they are not available, the
Ticket remains open and the system stops. It does not insert placeholder cases
or construct a Candidate whose test will be chosen later.

Actual Case, Attribution, Lesson, Candidate, and B/C execution are separate
Stage 8 work and require a new design based on the natural Ticket facts.

## 8. Budget and Provider policy

Budget control is not a Stage 7 product subsystem.

- The ordinary Run uses the model, Provider, retry, token, and time behavior
  already owned by DSH.
- The user's existing cumulative 60 CNY authorization is supervised outside
  the product ledger.
- Stage 7 does not query official pricing periodically, persist price
  snapshots, create reservations, or add a mechanical request-count gate.
- Before a real paid trial, the supervisor checks once that the intended small
  run is reasonably inside the remaining authorization. No repeated user
  confirmation is required inside that boundary.
- After the Run, the receipt reports DSH-observed model requests and token
  usage when the adapter supplied it. It does not claim an exact CNY charge
  when DSH has no provider billing receipt.
- Missing exact CNY billing data is reported as unavailable; it does not turn a
  completed ordinary task into failure or block Evidence intake.

Only a clear need to exceed the remaining cumulative authorization stops the
run and returns to the user. Pricing or cost telemetry may be improved later
after the main learning path is stable and real usage proves it necessary. It
is not a Stage 7 bearing test or completion gate, and it is not allowed to
dominate the learning control plane.

## 9. Failure and non-interference rules

### 9.1 Before the first Turn

Manifest, Goal, Session, Skill, verifier, or Run-binding failure stops before
DSH execution. No automatic ordinary fallback is attempted under the trial
label, because that would produce a task result with missing promised
provenance.

### 9.2 After the user task settled

Evidence projection, Outcome intake, or Skill-use recording failure cannot
rewrite the Goal phase, DSH Session, artifacts, tool results, or final answer.
The trial receipt reports a fixed learning-side failure reason while preserving
the primary DSH result.

Commit-unknown or ledger integrity errors remain fail-closed for later
governance writes and require a fresh replay. They do not trigger a blind
retry of the user task.

### 9.3 Resume behavior

Stage 7 binds only the fresh first-Turn Session. Later ordinary resumes remain
the existing product behavior and do not select the latest Candidate or create
a second Run binding for the same Session. Supporting multiple governed Runs
inside one resumed Session requires a separately designed Run-boundary model;
Stage 7 does not guess one.

## 10. Privacy and public surface

The existing public ledger allowlist remains unchanged. Run binding, Outcome,
Skill-use, Signal, Ticket, and protocol events remain internal.

The trial path persists only the existing governed facts plus the new subject
digest: opaque IDs, safe scope/category labels, digests, fixed enums, and
Evidence references. The existing private Stage 3 Run Skill manifest remains
the deliberate exception: it stores the full immutable parent Skill payload so
later B/C evaluation can reconstruct B. That internal payload and all other
internal governance events remain outside the public event allowlist. DSH
remains the fact source for prompts, model output, verifier arguments/results,
and Session history; Stage 7 adds no other raw content to the ledger.

The public CLI summary must not include raw user or model content. A public
documentation update may describe the mechanism and its limits, but it may
claim a natural trial only after a real useful task has run. A zero-cost fixture
may prove wiring; it may not be called natural efficacy evidence.

## 11. Verification

### 11.1 Contract and unit proof

Tests must prove:

1. strict manifest parsing, size bounds, safe labels, and Goal identity;
2. ordinary resume without a manifest is unchanged;
3. non-fresh Session, missing Skill, or missing verifier stops before any DSH
   request or Run binding;
4. installed runtime-bundle mismatch stops before an Agent or Goal drive and
   never falls back to ordinary resume;
5. `goalRef` comes only from the rechecked DSH Goal ID and revision;
6. Run binding and parent manifest occur before the first `turn/start`;
7. a normal DSH Agent executes without a Tianwen Agent loop;
8. a failed or `false` Session flush prevents intake without changing the
   primary Goal result;
9. v1 Run bindings replay unchanged while v2 identity includes the canonical
   verifier-argument digest;
10. exact verifier arguments and Outcome intake use the same final Evidence
   call/result sequences and Evidence ID, including a trailing mismatched call
   after an earlier matching call;
11. matching successful verifier output produces `met/no-case`;
12. missing or mismatched verifier facts cannot produce `met` or `not-met`;
13. `consumeOutcome()` precedes `recordSkillUse()`;
14. no Skill-use proof is legal and cannot become Attribution;
15. severity and `blocksGoal` cannot change after the pre-Turn binding;
16. usage comes only from final assistant messages and is not double-counted;
17. post-Run learning failure leaves the DSH Session and Goal result unchanged;
18. duplicate replay is idempotent;
19. public events and safe output contain no internal event, raw content, path,
    URL, or credential;
20. Candidate, Evaluation, Shadow, Active Pointer, Promotion, rollback, old
    Champion, Dynamic Cordis, and Alpha state remain unchanged;
21. no price lookup, budget store, Provider wrapper, dependency, or lockfile is
    added.

### 11.2 Zero-cost mechanism demo

One deterministic demo may compose a normal DSH Agent with an already
registered parent Skill and stable verifier. It must execute a useful fixed
fixture that succeeds and therefore ends in `met/no-case`.

The demo proves only:

- the CLI/runtime composition order;
- real DSH Session/Evidence/Outcome producer-to-consumer flow;
- non-interference;
- safe output;
- zero Candidate, Shadow, Promotion, Provider network, paid token, CNY, Docker,
  external database, and user data.

It must not deliberately fail to create a Signal or Ticket.

### 11.3 Natural paid or configured-Provider trial

After the mechanism is merged, choose one small repository task that is useful
on its own and has a stable, independent verifier. Run it once through the
normal configured DSH Provider path under the existing cumulative budget.

The correct possible outcomes are all acceptable:

- `met/no-case`;
- verified reusable `not-met` and one Signal;
- `inconclusive` because the verifier or infrastructure is insufficient.

Do not rerun to obtain a Ticket. A Ticket is evidence only when another
different natural Run later encounters the same problem, or when the existing
high-severity/blocked-Goal rule already applies.

If no suitable useful task and stable verifier exist, return a non-persistent
safe receipt `natural-trial-pending` and stop. The supervisor may record that
fact in the external handoff, but no Evolution event is written. The mechanism
can be mainline-ready while the natural-evidence claim remains explicitly
unproven.

## 12. Stop conditions

Stage 7 stops without weakening the contract when:

- no useful natural task exists;
- no stable verifier and frozen not-met code exist before execution;
- the Goal or Session is no longer fresh;
- the parent Skill cannot be resolved before the first Turn;
- Run binding cannot be durably established before execution;
- verifier arguments do not match the frozen trial input;
- the Run ends without a reliable verifier fact;
- the failure is attributable only to Provider, network, Runtime, environment,
  or another unrelated infrastructure condition;
- the first ordinary reusable failure has already produced one Signal and a
  second run would be scheduled only to force recurrence;
- a Ticket exists but an honest four-category protocol cannot be frozen;
- current Evidence cannot distinguish Skill attribution from model, tool,
  Runtime, Policy, or environment causes;
- the next action would exceed the remaining user authorization;
- continuing would require a second Runtime, old Alpha/Dynamic/Artifact path,
  public raw content, Candidate activation, Shadow, or Promotion.

These are legal product outcomes, not implementation failures.

## 13. Completion and next entry

Stage 7 implementation is complete when the thin opt-in entry, zero-cost
mechanism proof, privacy contracts, regression gates, and exact-main CI are
green.

The stronger statement “natural evidence trial completed” requires a separate
fresh receipt from one useful configured-Provider task. It is not inferred from
the fixture or CI.

The only next learning-governance entry is:

1. a natural Ticket with preserved Run/Evidence/Skill provenance;
2. an honest pre-Case EvalProtocol;
3. a new Stage 8 design for trusted B/C Evaluation based on those exact facts.

Until then, Tianwen continues running ordinary DSH Goals and accepting
`no-case` as the normal outcome.
