# Natural conversation learning

Status: direction approved by the project owner on 2026-09-07 (option 2).
Implementation steps 1–4 and final engineering gates are complete. The finite
real DeepSeek U cohort is closed with a rejected automatic study and retained
semantic errors, not full quality acceptance or efficacy. Integration and ordinary
016/preview.17 delivery are complete; the exact payload commit's four CI jobs and
actual daily installation/lifecycle/data-preservation checks passed. See the
[delivery record](../../operations/tianwen-natural-conversation-delivery-20260907.md).

## Product contract

People use the normal DSH conversation: unstructured requests, follow-ups,
corrections and feedback. Tianwen identifies the task, retains its boundary,
reviews the result, and initiates learning when the evidence supports it.
Neither a slash command, a new conversation, a research packet nor a request
to reflect is a prerequisite. Ordinary execution stays in the native Agent.

The user has authorized continuous implementation, configured DeepSeek use,
ordinary integration and real browser acceptance. Routine design and test
choices do not require another approval. The previously approved source-only
external Skill remains restricted to its original isolated acceptance home.

## Inherited decisions and the original gap

DSH owns Agent execution, model calls, tools, Sessions, persistence, native
subagents and permissions. Tianwen owns task boundaries, evidence attribution,
learning decisions and changes to future behavior. Existing learning records
and their historical verdicts remain immutable.

The legacy `research-summary-admission.ts` requires a structured slash gesture
before the first request of the first Turn. The existing ledger deliberately
binds one Session to one Run. Natural conversation therefore requires its own
task-span identity; removing the gesture check alone cannot implement it.
The original ordinary-Session feedback path lacked a frozen task/behavior
identity. The implemented natural task and feedback records now supply that
identity without changing the legacy admission or one-Run-per-Session rule.

The new span record supplements existing Run records. It references a native
Session lifecycle, direct-user message IDs and a Turn interval. It does not
fabricate a Session, rewrite a historical Run or make an old answer appear to
have used a new Skill. A follow-up is another attempt linked to its source task.

An exact first Turn already admitted by the legacy research-summary adapter is
not observed twice. Its native feedback retains the verified legacy Run scope.
This exception is bound to the lifecycle, scope, tool and Turn, not the entire
Session: later ordinary follow-ups still enter natural observation. Their
current-task context uses up to eight earlier native direct-user Turns, including
legacy or pre-consent context when present, without creating historical task
reviews or changing earlier results. Freeze and recovery use the same algorithm.

## Ownership and upstream reuse

Use the installed DSH 0.1.1-rc.2 public pre-step/request and session-event hooks.
Use native one-shot subagents for bounded model judgments and native Session
persistence for their evidence. Use the existing Evolution ledger for durable
task and learning transitions; do not add a database, generic scheduler or
another Agent loop. Task, feedback-assessment and guidance schemas have small
separate domain modules, folded through the ledger's existing validation and
append path.

Upstream references checked 2026-09-07:

- [DSH core hooks](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md)
- [DSH Skill invocation](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md)
- [Background memory and reflection](https://docs.langchain.com/oss/python/concepts/memory)

The installed public contracts govern implementation; upstream master is
comparative evidence, not an implicit dependency upgrade.

## Normal task flow

1. At the first direct-user step of each native Turn, snapshot the original
   user input and bounded prior conversation references before task execution.
   Root ordinary conversations participate, including later Turns in an
   existing Session. Internal review, evaluation and coordinator-only Turns do
   not recursively create tasks.
2. A read-only native model judgment identifies task versus conversation,
   objective, criteria, task family and relation to a prior task. Criteria are
   derived from the request and available context before seeing the answer.
   It also distinguishes corrections, persistent preferences, positive
   feedback, ordinary continuation and changed requirements. A quoted sentence
   is not automatically an instruction or a user correction.
3. Freeze the source task span and whole workspace guidance snapshot digest
   before admission; freeze the derived objective, criteria and evaluation
   mode before the answer. Native request-header configuration is recorded
   before model output, including later request epochs within the same task.
   Missing or mixed model configuration is not eligible learning evidence.
   A model or persistence failure leaves ordinary execution usable and records
   unavailable observation where persistence is possible; it cannot invent success.
4. DSH executes the original task normally. Any selected verified guidance is
   scoped to the task family and workspace and frozen for the current attempt.
5. At native Turn completion, capture the exact answer boundary and available
   tool facts. A separate read-only review compares them with frozen criteria.
   Facts needing an external result remain inconclusive when that result is
   unavailable. Subjective satisfaction requires actual user feedback.
6. Natural corrections and native message feedback bind to the target task and
   answer. Keep the user's evidence separate from model interpretation; edits,
   retractions and changed requirements do not overwrite original results.
7. Two compatible, distinct source requests can trigger a guidance study when
   they support the same problem category or explicit durable preference, and
   a separately successful counterexample exists. A one-off correction,
   changed requirement, ambiguous rating or insufficient evidence cannot by
   itself authorize a future method change.

## Data-only guidance and existing governance storage

`conversation-guidance.ts` projects a workspace-scoped snapshot containing
plain-text rules by task family (`summarization`, `writing`, `planning`, `code`,
`other`). Its version is the digest of the complete snapshot. A candidate must
change exactly one family rule, with a nonempty, bounded text change. The host
injects that rule for the admitted future task, subordinate to the user's
request and existing permissions; it does not execute the text as code.

The adapter reuses the existing content-addressed `recordArtifact` and generic
`EvaluationRecord` storage. Study, decision, activation and rollback records
live in the same Evolution JSONL ledger. The active workspace snapshot is a
projection of those records, not a new database or pointer file. This path
does **not** modify the legacy executable Skill/plugin `Champion` pointer,
forge a Skill-bound Run or substitute natural evidence for a research packet.

## Evidence selection and frozen evaluation

Eligible sources must be completed text tasks in the same workspace, task
family, parent behavior version and current v3 consent revision. The two
requests must be distinct and share the problem category and exact native
model configuration. Support is an attributable failed review or an active
independent feedback assessment with narrow supplemental criteria. An explicit
durable preference may supply such criteria without claiming the earlier
answer was objectively wrong. Later positive feedback, retraction and changed
requirements retain their separate meanings. The successful counterexample
must share the same family and model configuration and have no conflicting
active feedback.

Before proposing a method, freeze exactly five cases: the two source tasks,
the successful counterexample, a generated adjacent task and a generated
holdout. Generated cases are labelled synthetic, not actual user outcomes.
The proposer receives the source evidence, not the generated holdout. Workers
receive the original request/context, not the source task's completed answer
or hidden reviewer criteria. Full `materialDigest` retains the original criteria binding;
a separate `inputDigest` normalizes NFKC and whitespace for both source and
generated text. It rejects generated copies across different material wrappers
or criteria. The host also checks against original/context text already seen
in case design; source-to-source repetition is not itself fabricated evidence.

Each case has one baseline and one candidate execution: ten actual native
text-task trials, each followed by a separate blind native judge. Stored proofs
bind the real child Session, request and persisted Session bytes. Proposer,
trial and judge Sessions cannot be reused as each other's evidence. A model
verdict cannot replace a missing native execution receipt.

The host derives acceptance only from all ten exact arm receipts: all five
candidate results must be `met`, the baseline must reproduce at least one of
the two source failures, the baseline counterexample must be `met`, and no
arm may be inconclusive. An incomplete arm set cannot produce a decision.
Activation additionally requires the exact shared evaluation receipt, current
consent and support, and a compare-and-swap check that the active parent
snapshot is still the one frozen before proposal.

## Model identity and evaluator limits

Source model identity comes from native request-header configuration, not a
provider/model label alone. The host recovers the persisted source headers and
checks the task span digests. Case design, proposal, trials and judges freeze
that full call configuration. A scoped native `agent/request` waterfall hook
sets all fields because `AgentOptions` alone does not carry every sampling
field; persisted child request headers are then checked against the frozen
configuration. Drift or unavailable evidence stops the study.

A verified method is family/workspace guidance rather than a model-specific
executable Skill, so another model can use it on a later eligible task. This
does **not** establish cross-model effectiveness. Study source evidence,
baseline/candidate trials and automatic regression evidence must use the same
frozen native configuration; a different model's result is not interchangeable
comparison evidence.

The implemented automatic candidate route is text-only. Ordinary task reviews
retain available tool-result evidence, but `external` and `subjective` modes
cannot be marked successful by a text judge. There is no claim that every tool,
file or external-effect evaluator is connected. Missing external verification
stays inconclusive; satisfaction requires actual user evidence. This route
does not replay external writes to make an apparent text-only success.

## Retraction, regression and recovery

Completion and attributable feedback wake the existing native-event consumer.
Invalidating unsupported guidance is synchronous ledger work before waiting
for a busy Agent to become idle, including when another study is already
running. Native history remains immutable; the next direct-user Turn explicitly
expires earlier task guidance and selects only the current family rule.

Disablement, retracted support, or two distinct later failed tasks under the
active version, same family and frozen model configuration can revert to the
exact recorded parent snapshot. Disabling learning traverses the recorded
active chain back to baseline. No rollback rewrites the original trial or
feedback verdicts.

Recorded failed, unavailable and stopped studies are retained, not rerun to
obtain a pass. Source-pair deduplication prevents recycling an opened study. Restart
terminates unfinished undecided studies; a durable accepted-but-unactivated
decision may only finish activation after revalidating consent, support and
persisted native proofs, without another trial or judge call. Fresh evidence
may justify a new study; missing receipts cannot manufacture success.

## Consent and visibility

Natural observation expands the previous summary-only automatic-analysis
scope through `tianwen-auto-analysis.v3`. The product gives a one-time
plain-language disclosure and supports enabling/disabling it through the
ordinary conversation. Old consent does not silently authorize this expanded
scope or retrospective analysis. Planned real acceptance uses the already
authorized isolated environment and the ordinary enable action.

Ordinary conversation remains the user surface. Learning status reports
observed tasks, pending/unavailable reviews, attributed feedback, candidates
and applied changes separately. Routine no-change reviews stay quiet. Material
learning outcomes and failures are visible through the existing status path.

## Engineering checkpoint — 2026-09-07

The eight new conversation suites passed 95/95 before the final busy-Agent
feedback-retraction adjustment. Two new red checks then reproduced delayed
invalidation; moving rollback ahead of the idle wait made the guidance-loop
suite pass 10/10. These are separate checkpoints, not a claim that the entire
updated suite has already been rerun.

The complete Runtime bundle build and public-import audit passed before that
last adjustment. Its typecheck is still in progress at this documentation
checkpoint. The latest independent review found no new Critical/Important
issue; this does not replace final regression or real-model acceptance.

## Remaining acceptance and delivery

Mechanism checks cover multiple tasks in one conversation, no slash/packet,
input frozen before answer, follow-up/correction attribution, quotation and
changed-requirement counterexamples, subjective unknowns, cancellation,
restart deduplication, consent revocation and immutable version selection.

Real acceptance is still pending. It will use Codex's in-app browser and the
packaged DSH runtime with the configured DeepSeek model. Freeze task inputs and
criteria before outputs.
Use ordinary unstructured inputs and later natural feedback without telling
the product to run its internal tools. Inspect source and review Sessions and
durable decisions. Retain all attempts and their actual outcomes.

Report separately what normal use reached, what deterministic branch checks
proved, and whether a candidate actually improved a future task. Historical
B/G/J/K outcomes are not rerun or regraded; H remains reserved for an actual
post-promotion task under the earlier protocol.

Full regression against the final revision, real DeepSeek browser acceptance,
formal commit/push, resulting CI and ordinary installation are not complete.
No deterministic fixture result is a claim of real-user improvement or release
readiness.

## Prospective quality-contract repair after R3 observation

R3's frozen `07dfeeb6b9019eb82d959eff8c04e88ac1da0615` exercised real ordinary
use, valid raw-evidence capture and automatic study startup. It also exposed a
generic contract gap: S1's admission froze only four coverage criteria, and the
review returned met despite unsupported factual assertions elsewhere in the
complete answer. Raw quotation proves that text occurred, not that it is true.
Neither that old review nor the ongoing S study is rewritten or regraded.

For future tasks, freeze one explicitly host-provided factual-integrity condition
before the main answer, separately from the model's own admitted criteria and
native proof: factual assertions must preserve source certainty, must not turn
unstated information into established fact, and must distinguish inference,
assumption and advice without contradicting the source. User-requested fiction
is not a factual assertion. This is one general condition, not a blacklist of
the particular hardware/training claims seen in S1.

The contract must be versioned and durable. Preserve every original user/model
criterion rather than dropping one to make room. Original review and blind
review check the complete answer under the same frozen condition; independent
adjacent/holdout cases receive it before proposal creation, not after answers.
Older records without this contract remain readable with their original meaning
but cannot be used as successful counterexamples or combined with new-contract
evidence. A weaker-contract accepted decision cannot be newly activated, and any
already active weaker-contract method must stop affecting future tasks through
an explicit accurately named rollback, without rewriting historical results.

The existing native model, permissions, consent and evidence-led selection remain
unchanged. A complete contract still does not guarantee a model never misjudges;
actual answers and review reliability must continue to be checked independently.
