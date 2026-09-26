# Bounded exact answer-quote choices

E041 and E042 both reached native structured review but stopped at an invalid per-claim quote. E041 copied text across two answer units; E042 added Markdown backticks around a line reference. The host correctly rejected both. The current tool asks the model to transcribe arbitrary quote text, while the host later requires that text to be an exact substring of the specified answer unit.

## Decision

For each nonblank answer unit, offer a small closed set of **exact substrings from that unit** as its claim `quote` schema when the complete quote-choice payload stays within 65,536 UTF-8 bytes. Include the complete raw unit so existing whole-unit audits remain possible. Also include deterministic sentence/clause pieces cut after `。！？!?；;`, preserving original punctuation and bytes; trim only edge whitespace on each piece. If there is no split, include the trimmed unit when it differs from the raw unit. Cap segmentation at 16 pieces by leaving the rest as one final piece. Deduplicate candidates. The same unit-local choices apply to its required first claim and optional additional claims. Above that payload budget, keep the previous free-text quote parameter and strict host validation; this avoids worsening the already large native schema at the 128-unit extreme. Blank answer units still require `null` audit.

Within the budget, the model must choose a supplied quote rather than invent or reformat one. Keep the current host checks: each quote must still be a substring of its declared unit, every source ID must exist in frozen source evidence, supported source-facts need authoritative user/tool evidence, and recovery rechecks the same captured native value. Never repair or normalize an invalid historical quote. The choices contain answer text only, not source-file text or source-ID enumerations. The full tool schema must stay below 200 KiB for the representative 74,744-byte input fixture. A near-limit 128-unit answer has a roughly 349 KiB schema even without quote choices; its free-text fallback must keep the complete schema below 400 KiB rather than growing toward the observed 483 KiB enumerated version.

## Alternatives considered

- A stronger free-text prompt is smallest but the existing schema and prompt already demand exact bytes and Markdown preservation; E041/E042 show that instruction alone is unreliable.
- Character offsets or automatic host normalization avoid transcription but either ask the model to count Unicode positions or change the proof relationship between the native captured value and the stored audit. Those need a separate design and recovery migration.

## Verification

First prove by a failing test that the current native schema accepts an E042-style reformatted quote and an E041-style cross-unit quote as tool parameters. Then verify the new unit-local enum includes exact raw and clause options, excludes both malformed quotes, and stays bounded on the existing large-file fixture. An additional near-limit answer test must show that enumeration falls back to free text without removing strict host validation. Keep host rejection tests for a forged source ID and an inexact quote, and run the conversation review and persistence suites plus package type checks. This is engineering evidence only. A new exact-commit desktop task must establish whether the real reviewer can submit two valid independent audits and whether the answer itself satisfies its request. main/Daily remains NO-GO until then.
