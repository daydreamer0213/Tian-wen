# Tianwen Alpha-C Real-Evidence Sampling Design

**Date:** 2026-08-18
**Status:** Approved stage goal; proportional-safety revision approved; live evidence pending
**Base:** `4638026f210c0de29262d307dd051934570d975e`

## 1. Purpose

This stage asks one narrow question: does the current `repo-task` Champion produce a real,
repeatable, attributable failure on an already registered Alpha task?

The stage succeeds when it produces an honest, durable answer. A successful task, a one-off
failure, an operational failure, an unknown attribution, no Lesson, and no Candidate are all
valid outcomes. The stage must not manufacture a learning artifact merely to demonstrate
progress.

The cumulative user-authorized paid-model ceiling for Alpha-C is CNY 20. This stage uses a
smaller internal ceiling and never spends merely because budget remains.

## 2. Frozen boundaries

- Use only the existing PydanticAI DeepSeek Provider, `deepseek:deepseek-v4-pro`,
  `AlphaTrialRunner`, A1-A5 task packages, fixed Docker verifier, current Champion, and
  existing LearningIntake/LearningEngine APIs.
- Do not replay the exhausted Stage-A Goal. Stage-A `usage-invalid` remains an operational
  Runtime fact and is never Alpha-C learning evidence.
- Do not modify Runtime or DSH, add a scheduler, add a prompt shim, build a general evidence
  framework, run an external Skill market, promote, enter Shadow, or enter Alpha-D.
- The approved Goal, authority and cumulative CNY 20 budget authorize bounded Trial execution.
  Preview, frozen conditions and receipts remain audit records; they are not per-Trial approval
  gates. After a legal preflight the operator executes automatically without TTY, pipe or
  environment confirmation.
- No Candidate may exist without a persisted real Case and conditional Lesson. Candidate
  creation never changes the active pointer.

## 3. Existing facts

### 3.1 Current durable state

The production governance store `D:\Guo\zuochong\AGi\.tianwen\tianwen.db` currently contains
one active `repo-task` Artifact, its ActivePointer, one approved evaluation protocol, and one app
configuration. It contains zero Outcome, Gap, Triage, Signal, Ticket, Case, Attribution, Lesson,
Conclusion, Alpha Trial Manifest/Result, or Candidate objects.

Therefore there is no existing qualified real Case to resume or materialize.

### 3.2 Reusable execution and learning controls

`AlphaTrialRunner.prepare()` already performs all of the following before paid execution:

- load and digest the immutable task package;
- create an independent workspace and baseline commit;
- bootstrap and materialize the current Champion;
- run Docker/image/container preflight and the seed verifier;
- sanitize the model and Provider identity without persisting a credential;
- persist the Trial preview and prepared state.

`condition_snapshot()` already freezes task input, model/provider class and settings, budget,
container, checks, verifier, baseline, policy, and tools. It deliberately excludes Champion
identity, so this stage must bind `champion_version_id` and `champion_digest` separately.

`LearningIntake` already requires two distinct durable verifier failures with the same capability
scope and problem fingerprint before it creates a Case. It does not, however, require
`TrialResult.qualifies_as_real_model_trial`; the stage operator must reject a non-real Result
before calling the Intake projector. The global Intake contract remains unchanged because its
offline fixtures are deliberate governance tests rather than production evidence.

## 4. Considered approaches

### 4.1 General production controller

Add reusable controller, pricing, retry, receipt, and Candidate services.

Rejected. The stage has one fixed task choice, at most two Trials, and may legitimately end after
one success. A general lifecycle would be speculative Runtime duplication.

### 4.2 One stage-local evidence runner (selected)

Add one thin operations script and focused offline tests. The script composes existing public
Runner and Intake APIs and writes bounded, sanitized JSON receipts under the stage data root.
It contains no scheduler and exposes no arbitrary prompt, task bundle, Skill, Provider, or
Candidate input.

Selected because it gives a reproducible paid boundary and durable stop evidence without
changing Runtime or creating a reusable framework.

### 4.3 Direct pytest or ad-hoc Python invocation

Rejected. It makes the one-retry, cumulative-cost, durable-receipt and stop decisions too easy to
bypass accidentally. The stage-local operator remains useful for bounded execution and audit,
not for adding another approval layer.

### 4.4 Run all A1-A5

Rejected. Natural sampling does not require spending across five tasks. A1 is the smallest
single-round registered task and is representative of the existing repository-editing chain.

## 5. Stage operator

The only new execution entry is `scripts/run_alpha_c_real_evidence.py`.

It has fixed product choices:

- task: A1;
- model: `deepseek:deepseek-v4-pro` through PydanticAI's native DeepSeek Provider;
- model settings: at most 4 model requests, 40,000 aggregate tokens, and 4,096 output tokens
  per provider request;
- tools/actions: existing Alpha A1 policy, at most 8 tool calls and 8 action effects;
- wall time: 300 seconds per Trial;
- repeat count: zero or one, never more;
- data root: one new stage directory below `D:\DevData`;
- production governance input: read-only initial audit only. Trial/learning evidence stays in the
  first Trial's own durable store.

The script is dependency-injected for offline tests, but the public CLI does not accept arbitrary
model, prompt, task, Skill, verifier, Docker image, or budget values.

## 6. Price and budget accounting

The official DeepSeek Chinese pricing page is
`https://api-docs.deepseek.com/zh-cn/quick_start/pricing/`. It was checked on 2026-08-18.
For `deepseek-v4-pro`, the highest published category is peak-time output at CNY 27 per million
tokens. This observed maximum is a conservative estimate for this one bounded stage, not an
execution authority. Network availability, cache age, or a refresh timestamp do not block a Trial
while the resulting estimate remains clearly below the approved CNY 20 ceiling.

Python's current durable Trial usage contains total tokens but not input/cache/output categories.
This stage therefore records two different facts:

1. exact settled model request count and exact settled total tokens from the Trial store;
2. a **conservative CNY upper bound**, never called an invoice or actual bill, computed as
   `tokens * highest current published CNY rate / 1_000_000`.

Before each Trial, its full 40,000-token budget is reserved against the stage ledger at the
observed maximum rate. At CNY 27/M this is CNY 1.08 per Trial and CNY 2.16 for the two-Trial
maximum, well inside the cumulative CNY 20 authorization. If a provider request fails before
exact settlement, the still-reserved token ceiling remains charged to the conservative ledger.
The script records the model, source, observed rate and estimate in receipts and refuses to start
a Trial only when the projected cumulative amount would exceed the remaining Alpha-C budget.

## 7. Zero-paid preflight

The preflight must complete before automatic bounded execution. It verifies and records:

- exact Git branch/base and a clean tracked worktree;
- fixed task A1 and immutable task/image-lock digests;
- current Champion version/digest and unchanged ActivePointer;
- model/provider class, fully-qualified ID, sanitized settings, and official base URL;
- only a boolean that `DEEPSEEK_API_KEY` is configured; the name/value are absent from receipts,
  prompts, Docker environment, stdout, and argv;
- fixed BudgetLimit and conservative CNY reservation;
- real Docker preflight, container snapshot, task baseline, seed verifier, checks, and final
  verifier;
- Trial store, workspace, and condition snapshot digest;
- zero Goal, zero Run, zero model budget usage, and `paid_execution_not_started`.

It writes a new-only sanitized preflight receipt and bounded preview before execution. Any missing
credential, provider mismatch, stale Git/task/Champion, Docker/seed failure, existing receipt
collision, or insufficient budget stops with zero paid requests. The preview and receipt prove
what ran; they do not ask for another approval already granted at the stage boundary.

## 8. Natural sampling state machine

### 8.1 First Trial

After legal preflight, execute exactly one A1 Trial and reload its immutable Manifest, Result,
final verifier Evidence, and exact budget usage.

- `verdict=met`, completed execution/verification, passed boundary, and real model usage:
  project `verified_success`, triage it as `observe`, write the final stage stop receipt, and stop
  with no Case/Lesson/Candidate.
- Any non-real Result, provider/usage/environment failure, incomplete verification, inconclusive
  verdict, boundary violation/unknown, or non-verifier failure: do not call the real Trial
  projector; write a non-learning stop receipt and stop.
- Only completed execution, completed final verification, passed boundary, `verdict=not_met`,
  non-empty failure categories, and `qualifies_as_real_model_trial=true` permit a repeat.
  Project the single failure and triage it as `observe` before continuing.

### 8.2 One independent repeat

Prepare a fresh A1 Trial with `previous_trial_id=None`. Before automatically executing it, require:

- different trial IDs, stores, workspaces, Goals, and future Run contexts;
- exact equality of the full condition snapshots;
- exact equality of Champion version and content digest;
- enough remaining conservative budget;
- a new-only retry authority receipt binding the first Result digest and both prepared Trials.

Any mismatch stops before the second model request.

Execute the repeat once. A success or non-qualifying result stops without mixing unlike Outcomes.
A qualifying failure proceeds only when the two projected Outcomes have exactly equal capability
scope and problem fingerprint. Only then may existing
Intake triage create Gap, Signal, Ticket, and Case.

The first Trial store is the aggregate Intake store because it owns the first Goal and parent META
loop. The second Trial's validated Evidence is copied into it through the existing projector. A
new blank governance database is not used.

## 9. Attribution, Lesson, and Candidate

Two matching failures prove recurrence, not causality. When a Case exists, the controller reviews
durable Actions, checks, diffs, final verifier Evidence, and counterevidence.

- If earliest divergence or causal layer is unclear, record governed Attribution as `unknown`,
  conclude `no_lesson`, and stop.
- If the cause is outside `repo_task_skill`, record recommendation-only/out-of-scope attribution,
  conclude `no_lesson`, and stop.
- A resolved `repo_task_skill` attribution requires at least two hypotheses, an evidence-backed
  earliest divergence, rejected targets, supporting Evidence, and counterevidence. A conditional
  Lesson must include exact `when`, `not_when`, capability scope, Case, and Evidence bindings.
- If a distinguishing experiment is necessary, it is a new explicit one-run decision using the
  remaining Alpha-C ledger. It is not guessed or automatically launched by this script.

Candidate materialization is deferred unless the live chain actually reaches a persisted
conditional Lesson. At that point the smallest follow-up must reload the current ActivePointer,
require it still names the original Champion, ensure no different direct-child Candidate already
exists, call the existing low-level Candidate API once, and verify the pointer remains unchanged.
No Candidate code is built speculatively before that branch is reached.

## 10. Receipts and data placement

All generated Trial workspaces, stores, logs, and stage receipts live under a new fixed directory
below `D:\DevData`. They are not committed. Git contains only the runner, offline tests, design,
plan, and final canonical handoff.

The stage writes new-only, bounded JSON receipts for:

- each zero-paid preflight;
- the optional retry authority;
- the final stop decision and conservative budget ledger.

Receipts contain digests and bounded classifications, not credentials, raw prompts, model private
reasoning, full source files, or unbounded provider responses.

## 11. Completion and stop conditions

The stage stops immediately on any of the following:

- cumulative conservative charge would exceed CNY 20;
- credential/provider/model/Docker/task/baseline/verifier/store/authority check fails;
- a Result is not a qualified real model Trial;
- first Trial succeeds or produces any non-qualifying failure;
- repeat conditions, Champion, scope, or fingerprint differ;
- Attribution is unknown/out of scope or evidence is insufficient;
- Goal, permissions, success criteria, budget, or irreversible risk would expand.

Completion does not require a Candidate. It requires durable proof that the system advanced only
when real evidence met every gate and otherwise stopped without inventing learning.

## 12. One-time recovery after the zero-paid Docker stop

The first live launch consumed `D:\DevData\tianwen-alpha-c-real-evidence` while Docker was
unavailable, before any Goal, Run, budget reservation, Trial Result, model request, token usage,
container execution, or CNY charge. That root remains immutable evidence and is never deleted,
moved, overwritten, or replayed.

One fixed replacement batch may use only
`D:\DevData\tianwen-alpha-c-real-evidence-recovery-1`, and only while that path does not exist.
Before creating it, the operator must reload the old stage authority and old Trial store and prove
that Goal, Run, budget, Result, model-request, and token-usage state are all empty. The new stage
authority binds the old authority path and content digest plus the old Trial ID as `recovery_of`.
There is no automatic numbering, retry loop, scheduler, recovery registry, or additional approval.

If `prepare()` fails before a formal Trial Result exists, the replacement root records one bounded
preflight-failure/final-stop receipt with zero model requests, zero tokens, zero CNY, no Case, no
Lesson, and no Candidate. A non-zero old store or an existing replacement root fails closed. All
other natural-sampling, cumulative CNY 20, maximum-two-A1, Candidate, Promotion, Shadow, and
Alpha-D boundaries remain unchanged.
