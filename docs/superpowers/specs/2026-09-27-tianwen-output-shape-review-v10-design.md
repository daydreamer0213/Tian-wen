# Output-shape review v10 design

## Evidence and problem

The consented natural 霁川 writing task asked for “一段简短的本周状态”; its frozen admission criterion also said “产出一段”. The answer instead had a heading, bullets, separator and closing note. Both v9 native checks marked it `met` while correctly tracing all project facts. A new frozen four-case direct-review contrast found F1 allowed-list `met/met`, F2 explicit-one-paragraph compliant `met/met`, F3 explicit-one-paragraph list `not-met/not-met` with `instruction-following`, and F4 natural “写一段” list `met/met`. The fourth case failed its frozen expectation. This is an output-form boundary, not a source-fidelity failure. “一段” can be colloquial, so a broad lexical host rule would create unjustified false positives.

## Decision

Add a versioned v10 host quality contract and native reviewer instruction. Require the reviewer to separately check the complete answer against output-form constraints, including a user request for a single paragraph when it denotes the requested deliverable. A heading, bullet list, divider or extra addendum may violate that form even when each unit is `non-factual/permitted` in the claim audit. Do not automatically forbid structured output in requests that allow headings/lists, ask merely for short text without a one-paragraph form, or contain “一段” as quoted data rather than an instruction. Keep the claim-audit v2 shape, existing source rules, two blind native checks and host validation. Do not add a keyword-based deterministic gate, a third reviewer, retries, or a prompt change to the ordinary answer generator.

Freeze exact v9 contract and native instruction for legacy replay. Only new admissions get v10; v9 records remain valid and unchanged, and mixed v9/v10 learning support stays incompatible under the existing same-contract rule. Update versioned dual-audit and study guards to recognize v10. This change can correctly classify new results; it cannot repair an already-delivered answer, retroactively change the 霁川 record, or establish semantic safety of research-generated methods.

## Verification and stop

Before implementation, fail focused tests for current v10 admission, v9 exact parsing/replay, v10 output-form instruction, and two-review guards. Then implement the smallest version additions. Run the claim/review/observer/ledger suites and all package type checks. Freeze a new isolated candidate, novel allowed-list and single-paragraph controls plus an incompatible heading/list case, expected decisions, model config and first-mismatch stop before any model call. Any missed format violation, valid-list rejection, unavailable proof or legacy drift stops the candidate. Direct-review success would remain only mechanism evidence; a later new consented natural task is still required for product-chain evidence. main/Daily remains NO-GO.
