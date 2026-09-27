# Status-strength claim review v8 design

## Problem and evidence

E085's original summary used “未通过状态尚未解除” where the source only said one item awaited retest. Its two current-quality reviewers captured the whole sentence and source ID but interpreted that phrase as merely not-yet-passed, returning `met`. This is a genuine ambiguity, not a proven historical false verdict. A prior fact/advice extractor failed on plain recommendations. The prospective P1–P6 independent two-stage diagnostic fixed both boundaries on six new synthetic cases; it did not test the product's unified dual review. Its frozen proof is documented in `docs/operations/tianwen-pending-status-claim-diagnostic-20260927.md`.

## Chosen candidate

Create quality contract `tianwen.conversation-quality.v8` with the existing `tianwen.claim-audit.v2` shape and two blind, independent review Sessions. Its host criterion and reviewer instruction state two general rules: (1) keep pending, unverified and not-yet-confirmed-passed distinct from an explicitly judged failure; don't infer an earlier failed verdict from absence of a pass; (2) preserve the speaker's complete advice speech act, while separately checking any independent factual assertion embedded in the same sentence. Explicit failed evidence may support a failed claim. The rule applies to original-result and method-study reviews. It changes the review decision, not the user's answer, task admission, feedback attribution, model, method generation or verdict consensus.

The v8 instruction is chosen only when the exact validated v8 quality contract is frozen in the task/study. Keep exact v1–v7 contracts, old instruction strings, proofs and audits readable and unmodified. Existing v7 sources cannot be silently paired with v8 sources or activate a new study. Unknown or mutated quality remains invalid. No keyword-based host rejection, third reviewer, retry, rewritten historical judgment or extra model call is introduced.

Alternatives: a word filter is brittle and would block valid advice and explicit failures; a separate two-stage learning judge matches the diagnostic more closely but adds native Session ownership, persistence and recovery complexity before the product's current reviewers have been tested prospectively. v8 is the smallest falsifiable product candidate, not a guarantee that the P1–P6 results transfer.

## Verification and stop conditions

First verify old v7 parsing, current v8 generation, audited review routing, study-arm/ledger compatibility and native recovery with focused tests. Then freeze a new isolated product profile, source/build bytes, novel normal tasks, model configuration, expected source-status and advice boundaries, and one-shot stop rules before any provider call. Inspect the actual assistant answer and both review audits. A missed independent failure assertion, false rejection of advice or explicit failure, invalid native proof, or any changed old-record interpretation stops this candidate; do not rerun the same source to seek a pass. Ordinary task quality, feedback attribution, research, activation and subsequent-task effect remain separate gates. main/Daily remains NO-GO regardless of this local candidate.
