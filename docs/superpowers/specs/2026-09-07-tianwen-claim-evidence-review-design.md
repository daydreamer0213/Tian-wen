# Claim-to-source review

Direction approved by the user: distinguish original user/source/tool information from assistant-origin wording, require explicit claim/source correspondence, preserve normal advice and drafting, and validate the approach prospectively before normal delivery. Standing authorization covers implementation, configured DeepSeek, independent review, browser acceptance and normal merge/delivery without routine reapproval.

## Problem and hypothesis

Base `11a4a293b176d63da726a1386477fdc6a0309d2e` is delivered017. R6 retained four definite false positives. W6's reviewer saw the wider claim but accepted “does not contradict” as sufficient support; W7 treated a prior assistant claim as the factual baseline. Original text and the existing warning were already present. This is a semantic source-authority/checking failure, not missing transport or inability to auto-trigger a study.

Hypothesis: requiring both existing reviewers to retain specific answer-claim/source assessments, with host-verifiable source identity and complete answer-unit coverage, will reduce these false positives without penalizing legitimate advice/fiction. It is a hypothesis, not an assurance that structured output makes a model semantically correct. More identical reviewers and switching model are alternatives; no third reviewer or model change in this round.

## Ownership and scope

DSH continues to own native one-shot Agents, structured capture, Sessions, configuration, cancellation and persistence. Tianwen owns a thin evidence projection and validation of its review receipts. Reuse `conversation-task-material.ts`, `runConversationJudgment`, the shared review entry and existing ledger. No dependency, service, database, new general Agent loop, external Skill or increased tool authority. Ordinary answering is unchanged; this change improves evaluation and therefore learning eligibility, not a hidden rewrite of the user's answer.

First build an opt-in experimental review module with tests. Current production review remains v3 until a separately frozen controlled model comparison passes. Then integrate one shared path for ordinary-result and method-study review with quality v4; exact v1/v2/v3 remain readable and unchanged. No historical regrading, no old output repair, no mixed-quality study support.

## Evidence projection

Project the actual frozen material into evidence items with host-assigned stable local IDs, source class, and exact raw text. Source classes are `user`, `assistant`, `tool`, and `answer`. Preserve chronological order within request/context; identify current request versus previous context. Native user and assistant roles are not inferred from text. Tool evidence retains the actual result/error status, not an invented successful action. Generated independent case prompt is user task evidence. Derived criteria/feedback are separate standards, never factual source items.

Split raw text only into lossless bounded display units (lines / at most384 Unicode code points); no semantic summary, dedup across different source roles, truncation or invented facts. Multiple identical quotes from different roles retain distinct IDs. The source projection digest binds the complete ordered items. All emitted answer units must be assessed once. Native conversation IDs and evidence boundaries remain in the original material/receipt; no new persistent fact store.

The observer supplies recovered source, current answer messages and actual tool events. The study supplies its frozen task and newly produced answer. Earlier assistant text remains visible to understand rewriting requests, but cannot alone support source-dependent facts. Explicit later user correction/confirmation is visible as user evidence; a generic continuation is not confirmation. Missing context is uncertainty, not permission to invent a source. Existing history bound remains unchanged.

## Structured checks

Both isolated native review Sessions receive identical frozen material and evidence items, but neither receives the other result or method identity. Each returns the existing `verdict`, `category`, `explanation`, `evidenceQuotes`, plus an `audit`:

```ts
interface ClaimAudit {
  schemaVersion: 'tianwen.claim-audit.v1'
  evidenceDigest: string
  units: {
    answerId: string
    claims: {
      quote: string
      kind: 'source-fact' | 'advice' | 'inference' | 'fiction' | 'general-knowledge' | 'non-factual'
      status: 'supported' | 'unsupported' | 'contradicted' | 'permitted' | 'uncertain'
      sourceIds: string[]
      explanation: string
    }[]
  }[]
}
```

At least one claim assessment per answer unit; `non-factual/permitted` covers greetings or formatting-only units. Each claim quote is an exact nonempty fragment of its assigned answer unit. Sources are IDs from the supplied non-answer evidence, with exact role binding. A supported source-fact requires at least one user or tool source; assistant references alone are invalid support. Tool failure text may support a failure statement, not successful execution; semantic matching is the reviewer's job. `permitted` requires a non-source-fact kind and task-compatible advice/inference/fiction/general knowledge or nonfactual text, not a bypass for new task-specific facts. Source-dependent statements need positive support at the same scope, time, certainty and commitment level; non-contradiction is insufficient.

Host checks structure, bounds, exact quotes, source existence/roles, digest, and one-to-one answer-unit coverage. It does not pretend to prove semantic entailment or complete claim extraction within a unit. Those remaining risks are tested in the real comparison. Unsupported/contradicted claims cannot coexist with a passing verdict; uncertain claims cannot coexist with a passing verdict. A specific supported instruction violation may still yield not-met even if factual claims are otherwise fine. Existing two-review consensus remains unchanged; disagreement stays inconclusive, never a confirmed learning failure or success. Malformed/unavailable audit cannot establish success. Native proof covers the exact complete returned value including audit, and recovery verifies that value.

Retain existing material96KiB and answer32KiB ceilings. Bound audit to128 units/512 claims and32KiB total; if the complete answer cannot fit, report unavailable rather than silently dropping it. This is an explicit capacity limit, not a model-call budget. No token/model-budget restrictions beyond the actual supported existing model configuration are added.

## Expression boundary

Normal courtesy without additional facts/commitments is allowed. Requested advice, labeled inference and fiction are allowed. A current request for a single paragraph overrides an older three-part preference. A new commitment is not automatically acceptable just because a notice often contains it; user-authorized drafting of a proposed commitment is distinct from claiming an existing arrangement. Real ambiguity remains inconclusive. No word blacklist or permanent prohibition on specific R6 phrases.

## Prospective comparison gate

Before any model call, freeze twelve new controlled cases: six definite bad answers paired with six valid alternatives, across scope widening, present-to-future certainty, unsupported cause/decision timing, assistant-origin carryover, explicit user confirmation/correction, and authorized advice/fiction/output restrictions. Include standalone normal courtesy. Inputs/answers/expected classifications are fixed once and independently reviewed before execution. These are evaluator diagnostics, not natural user outcomes and never study support.

Each case runs exactly once with the delivered v3 shared review and once with the experimental structured review, with two native checks in each arm, same configured DeepSeek and source material. Alternate arm order by case; expected labels are not sent to the model. Keep first outcomes, including malformed output, disagreement and failure. Pass requires: experimental review never passes a definite bad answer; all valid controls conclusively pass; at least four of six bad controls conclusively fail; total correct conclusive decisions is not below baseline. If baseline misses any bad answer, experimental must reduce that count. These are finite design gates, not statistical reliability claims. Failure ends this frozen comparison; no revision/retry against its answers to manufacture a pass. Reconsider the hypothesis before integration.

## Natural acceptance and delivery

After the gate and integration/review/full regression, freeze a new isolated runtime and ordinary-browser protocol before new calls. Include unscripted actual model answers to natural drafting, follow-up format changes, corrective/preference feedback and ordinary advice. No command or prescribed user packet, no prewritten assistant answers, no requesting internal reflection. Let any automatically opened study finish its first attempts; inspect candidate, all reviews, activation and subsequent tasks separately. Never force activation. A result can establish the scoped mechanism without proving long-term benefit, but any remaining semantic false positive must be reported.

Only after exact code review, full gates, frozen real use and exact-main CI may normal runtime/Desktop delivery proceed with backups and unchanged user data. Keep old cohorts and the current daily worktree/shortcut. No external package/tag release. Report semantic limits separately from engineering completion.
