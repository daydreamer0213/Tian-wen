# Ordinary research-summary semantic Outcome

## Mandate and observed gap

The user delegates normal design, implementation, repair, testing, integration and
DeepSeek calls until the total route is complete. API-side quota is authoritative;
do not impose another call/cost budget or ask again for routine model permission.
Major strategy changes, new external authority and unrecoverable data changes
remain escalation boundaries. This is a narrow completion of the approved learning
route, not a new generic evaluation product.

The frozen A–D acceptance tranche contains a genuine prose error but all four ID
oracles report met. Its old B Candidate is terminally rejected under v2. None of
those records may be changed, regraded or reused as a fresh failure. Future ordinary
governed summaries need a real, independently checked content-quality result.

## Decision

Extend the existing Run acceptance contract and immutable Outcome input/event.
Keep the original source submission Evidence and source Session digest. Store a
versioned inline semanticReview proof; the native reviewer Session is the recovery
record, so there is no extra receipt entity, scheduler, provider runtime or database.

New ordinary research-summary contracts use problemCategory
`research-summary-result.v2:<skillVersion>` and an explicit qualityContract:

```ts
{
  schemaVersion: 'tianwen.research-summary-semantic-contract.v1',
  rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
}
```

The same qualityContract can accompany an exploration `observe` contract. Presence
is explicit and enters the existing acceptanceContractDigest; category prefix alone
is insufficient. Legacy shapes and digest/replay semantics remain unchanged.

The fixed rule is: valid source submission, existing ID hard gates met, and
independent sourceFidelity score >= 3. The reviewer records all five existing 0–4
dimensions with the existing rubric, but ordinary success uses source fidelity
only in addition to the hard gates. This does not alter v3 paired/holdout rules.

## Inline proof and integrity

Completed proof contains schemaVersion
`tianwen.research-summary-semantic-review.v1`, status `completed`,
acceptanceSubjectDigest, submissionDigest, rubricDigest, reviewerSessionId,
reviewerSessionDigest, requestDigest, reviewEvidenceId, idGateVerdict (`met` or
`not-met`), and the existing five-dimension scores. Inconclusive proof instead has
status `inconclusive`, reasonCode (`no-canonical-submission`,
`review-not-completed`, or `review-invalid`) and attempt (null, or exact subject,
submission, rubric, reviewer Session/request identities and nullable Session digest).

The pure Evolution parser checks exact shapes, bounded integer scores, fixed
rubric, subject binding, and derived verdict. Semantic contracts reject missing
proof and plain four-field met/not-met inputs. Old contracts reject semantic
proof. Completed proof may be downgraded to inconclusive if the source task did
not complete. Missing/invalid/incomplete review never creates a failed Signal.
Outcome event v1 keeps its exact old parser; v2 alone carries semantic proof.
The existing single Run+contract Outcome and inputDigest enforce immutability.

Runtime admission authenticates actual native source/reviewer records, actual
request configuration/material/tool schema, completed tool receipt and Evidence.
A shape-valid object alone is not runtime proof. Review Evidence belongs only in
semanticReview; the outer evidenceIds and sessionDigest remain source-owned so
RunSkillUse is attributable to the actual summary Skill.

## Native execution and recovery

Wrap the existing source-capture submit tool. First reserve/normalize the accepted
submission using the existing implementation (preserving its once-per-turn guard),
then await the independent native reviewer before returning the original
`{ verdict: 'not-evaluated', submission }` result. Do not expose grade to the source
model or permit answer-fitting resubmission. Do not capture the provisional
`run:pending` admission identity; resolve the actual frozen Run at execution.

Use DSH agents.create, existing controlled preset, native model selection and
provider configuration, a fresh child with no seed, parent metadata, sole grading
tool, deny inherited tools, existing Session persistence and native cancellation.
Relay the caller ToolRunContext.signal; do not add a new request/time/cost budget.
Freeze the source's actual configured call settings before reviewer execution and
check the actual reviewer request before it reaches the provider. The envelope
contains only canonical source packet, canonical submission and frozen rubric,
never Candidate, feedback, expected answer, desired winner or prior grading.

Use a deterministic reviewer identity per frozen source Run/turn (not per content
or verdict). A complete exact child is reused; a mismatched, invalid or incomplete
prior attempt is inconclusive and must not be replaced to obtain a better grade.
Cold recovery verifies persisted native records without rerunning the model.
No new learning state UI/controller is needed: review runs while the original
task is still active and the normal Stop button cancels it.

## Downstream learning

Existing ordinary Outcome intake accepts the new category and includes bound
semantic observations in analysis material. Existing two real failed Runs plus
success counterexample/same parent requirements remain unchanged.

New exploration requests freeze a semantic metric when their source contract is
semantic; both arms use the same independent reviewer and frozen metric. Legacy
request shapes/digests keep the existing ID metric. No arm labels or hypothesis
enter reviewer material.

New semantic Outcome analyses freeze v3 evaluation protocols with a real Outcome
source identity. Do not fabricate explicit-feedback message/version fields. Select
the original source Run from the first stable sorted frozen failed signal member,
consistent with existing Case/Candidate source selection, not analysis parent
(which may be the success counterexample), hypothesis, Candidate or scores. Bind
its Run, source Session/material, Outcome and semantic proof into protocol source
facts and verify both live freeze and ledger replay. Recover its exact packet
using existing source-case helpers. Old Outcome analyses stay v2; explicit-feedback
v3 remains unchanged. Keep adjacent/regression/counterexample/safety/holdout tasks
and the existing v3 14-run evaluation/activation semantics.

## Acceptance and delivery

Automated branch coverage may synthesize source packets and native test provider
outputs but is labelled mechanism testing. Genuine acceptance freezes new user
inputs before a single formal attempt, uses Codex in-app browser and real DeepSeek,
retains all outcomes, and never plants Candidates/history/feedback/answers.
No new external source authorization is required or inferred; the already approved
read-only summarization source remains isolated to the existing acceptance root.

After focused TDD and independent reviews, run fresh full gates, bundle identity
checks, then real native/browser acceptance. A passed code gate or rejected
Candidate is not total-route completion. A failed or inconclusive real scenario
is retained honestly, not retried for luck. Deliver new versioned bytes through
the normal installer after gates; preserve current daily data and previous stable
artifacts. Never overwrite the active Desktop package output while building.
