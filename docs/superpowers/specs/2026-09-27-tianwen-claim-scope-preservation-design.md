# Tianwen claim-scope preservation diagnostic

## Decision

M2/M5 showed that an extracted substring can lose “I suggest / in my view” and turn ordinary advice into an allegedly unsupported fact. M6 showed that a recommendation can also contain an independently asserted external fact. The current production claim review asks two models to classify and audit answer units, but E068 proves their agreement is not semantic proof. Therefore this candidate stays outside the product and outside learning eligibility.

Compare three approaches: keyword exemptions would also exempt M6-like false premises; checking a substring against a source repeats M2/M5; **preserving the complete utterance for each atomic span** keeps speaker stance available while still allowing a separate fact premise to be judged. The third is the narrow diagnostic choice. It is not a claim that the model is reliable enough for release.

## Contract

Stage 1 reads the complete answer and extracts every independently meaningful recommendation or externally checkable assertion as an exact answer substring. It does **not** classify a span as fact or advice. Each span carries the exact complete answer as `contextQuote`. The controller checks nonempty substring identity, full-context identity, count bounds and duplicates. These syntactic checks cannot establish semantic completeness; a separate human audit compares spans with the frozen expected propositions.

Stage 2 receives the original source, complete answer, one exact span and its complete context in an independent native session. It decides whether the speaker actually **asserts an external fact or rule** (`fact`) or **proposes an action/opinion** (`advice`). It checks source entailment only for `fact`, preserving actor, scope, time, certainty and necessity. An advice sentence does not become a fact because it contains “after” or “if”; an independent factual premise introduced by “because” is still a fact. The controller validates the returned source quote, mode/status combination and first native result. No model result changes the production review, learning ledger or main/Daily.

## New prospective cases and stop condition

Freeze eight new source/answer pairs before the first call: explicit advice, implicit optional advice, supported external restriction, unsupported invented restriction, advice with an unsupported factual premise, advice alongside a supported fact, an opinion about waiting for a client reply, and advice followed by a false approval claim. None reuse M1–M6 or E068 text. Cases, expectations, scripts, exact model configuration and runtime bytes are hash-frozen on D:. Run each case once; preserve errors. A case fails if an expected independent proposition is missing, advice is treated as unsupported fact, a false external statement is accepted, a sourced restriction is rejected, or frozen/native records drift. No retry or revised prompt on this set.

If all eight pass, this remains only a short fixed-answer diagnostic. The next gate would require new natural product answers and manual completeness checking before considering any integration. If any case fails, stop this model-only candidate and move to a different safety mechanism; do not keep tuning these examples. E068 semantic safety and main/Daily remain NO-GO throughout.
