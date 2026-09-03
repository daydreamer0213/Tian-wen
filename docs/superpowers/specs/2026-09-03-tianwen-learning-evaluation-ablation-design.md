# Tianwen Learning Evaluation Ablation Design

## Status

Approved direction: reduce repeated evaluation while preserving independent evidence that a learned Skill is better, safe, generalizable, and actually active in DSH.

## Problem

The current production-learning plan can use 21 model Runs for one promotion:

- 10 paired Runs across five baseline/Candidate cases;
- five blind evaluator Runs;
- five Candidate Shadow Runs over substantially the same case classes;
- one post-promotion activation Run.

More gates do not automatically create more assurance. Repeating the same packet class with the same oracle increases cost, latency, restart surface, and inconclusive failures without demonstrating a new property. This can prevent the learning loop from completing during ordinary DSH use.

## Considered Approaches

### A. Evidence-preserving reduction — selected

Keep the five paired case classes, aggregate the blind quality review into one Run, replace five repeated Shadow Runs with one unseen holdout Run, and keep one post-promotion activation Run. This reduces the expected total from 21 to 13 Runs while retaining four independent kinds of evidence.

### B. Candidate-only evaluation

Run only the Candidate on the five cases and keep the activation check. This is cheaper, but it loses controlled evidence that the Candidate caused the improvement and makes model variability harder to distinguish from Skill improvement.

### C. Keep every existing gate

This preserves the current structure but repeats the same evidence, creates more failure points, and conflicts with the requirement that learning remain usable during normal DSH interaction.

## Selected Gate Model

| Gate | Runs | Unique question | Blocking result |
| --- | ---: | --- | --- |
| Paired product cases | 10 | Did the Candidate fix the original and adjacent defects without breaking regression, extraction, or safety behavior? | Candidate `not-met`, inconclusive evidence, or no demonstrated improvement |
| Aggregate blind quality review | 1 | Did the Candidate materially damage readability, usefulness, reasoning, or restraint in a way the deterministic ID oracle cannot see? | Clear aggregate regression or inconclusive review |
| Unseen holdout Shadow | 1 | Does the frozen Candidate generalize to a packet that was not used by paired evaluation, before the active pointer changes? | `not-met` or inconclusive |
| Post-promotion activation | 1 | Does a new DSH Agent actually resolve and execute the promoted frozen version through the native Skill and tool surfaces? | Wrong version, missing native proof, `not-met`, or inconclusive |

The learning loop must not add another blocking gate unless a test demonstrates a failure that none of these four gates detects.

## Product Protocol

All controlled Runs use the production `research-summary` Skill and an Agent-scoped `submit_research_summary` tool. The tool is installed before the exact DSH tool restriction is applied. It is never registered globally for ordinary or child conversations.

The deterministic oracle receives only the frozen packet and canonical submission. It must not receive role names, Session IDs, Candidate IDs, version IDs, or an expected winner. It checks required finding IDs, decision-relevant uncertainty IDs, exclusion of background uncertainty IDs, and exclusion of unsupported IDs.

Both `met` and `not-met` are successful tool results. The tool closure's private verdict and the durably projected DSH Evidence must agree before outcome intake accepts the verdict. Missing, duplicate, oversized, or mismatched submissions are inconclusive.

Evaluator material is the accepted canonical submission plus task ID and digest. Final assistant prose is not evidence because it can differ from the accepted tool submission.

## Ablation Tests

The implementation will include a compact mutation matrix rather than a permanent configurable ablation framework:

| Removed or broken behavior | Expected detecting gate |
| --- | --- |
| Candidate still omits decision uncertainty | Paired original/adjacent cases |
| Candidate promotes background uncertainty or unsupported material | Paired counterexample/safety cases |
| Submission IDs are correct but the summary becomes clearly unusable | Aggregate blind quality review |
| Candidate overfits the five known packets | Unseen holdout Shadow |
| Promotion pointer or scoped Skill/tool wiring resolves the wrong version | Post-promotion activation |
| Repeat the five known packets during Shadow | No unique detection; therefore forbidden |
| Run five separate blind reviews instead of one aggregate review | No unique detection; therefore forbidden |

Every retained gate must have at least one mutation caught only at that gate. If a later test shows that two gates always detect the same mutations, the later and more expensive gate is removed or reduced to a non-blocking diagnostic.

## Failure and Recovery

Each gate persists its own exact input and result before the next gate begins. Restart resumes from the first missing durable result and must not rerun a completed gate. An inconclusive result blocks promotion but produces one terminal explanation in the main DSH conversation; it must not ask the user to open a child Agent.

The aggregate blind review and holdout Shadow are bounded single Runs. They use the same configured Provider, Model, retry policy, permission, and limits as the frozen protocol. No hidden retry or alternate model is introduced to make a Candidate pass.

## Non-goals

- No general-purpose experiment platform or runtime feature flag matrix.
- No repeated five-case Shadow suite.
- No five independent blind evaluator Agents.
- No custom approval UI or child-conversation workflow.
- No relaxation of native DSH Full access requirements when the configured Provider or filesystem operation actually needs them.

## Acceptance

- The normal promotion path uses no more than 13 model Runs.
- Every blocking gate has a documented unique fault mutation.
- The original two defects improve; the three preservation cases remain met.
- The holdout packet is not present in paired evaluation inputs.
- A fresh post-promotion Agent proves the active version through native Skill and tool evidence.
- Failures and progress remain visible in the main DSH conversation.
