# Incomplete local-file result review: fail before model judgment

Status: selected under the owner's standing direction to continue without repeated routine approvals. Base: `bf51507225df7931856bbc820c193b7dcbe6d8fc`. This changes future task reviews only; E038 records remain unchanged.

## Observed problem and boundary

E038's ordinary task made three successful native `read` calls and several `pwsh` calls. The third file was 41,350 bytes, above the 32,768-byte per-file capture bound; the later content-processing PowerShell commands also lie outside the currently certified directory-command subset. The ledger therefore contains `task-file-evidence-unavailable / material-unavailable` and no complete `files` result. Despite that, the original-result path ran two model checks with `toolEvidence: []` and no `source.files`. One check declined to judge; the other claimed to have inspected workspace files although its child Session contains only `structured_output` calls. The aggregate was `inconclusive`, but spent two calls and retained misleading source claims. E038's separate attributed-feedback assessment remains valid and must not be rewritten.

The existing local-file design requires complete, native-bound file material for a replayable task. A tool readback or later filesystem read is not a substitute, especially after arbitrary shell work. This increment does not relax that rule, raise limits, certify PowerShell, infer a task failure, or count incomplete work as learning support.

## Options and decision

1. Raise size and review-material caps: does not certify E038's PowerShell commands; can increase review cost while still failing. Defer.
2. Pass raw native readbacks to the two judges: they do not prove complete original file material, and can include generated post-write output. Defer until a separate provenance contract exists.
3. **Selected:** after native task/request recovery, stop original-result review before judgment when a `local-files` task has no recovered `source.files`. Persist `inconclusive`, null proof, empty quotes and a new `file-evidence-unavailable` reason. Do not create a `task-review-started` intent or launch model children. Continue ordinary task completion and independent feedback assessment. Complete file tasks retain the existing two-check path.

## Contract and tests

- Add `file-evidence-unavailable` to the additive review reason enum/parser. Admission and feedback retain their four existing unavailable reasons; historical values and record shapes are unchanged, with no migration or regrade.
- The reason applies only to a completed task admitted as `local-files` whose exact recovered material lacks `files`; existing consent, quality-contract and completion checks retain their order. Recheck consent after asynchronous material recovery so a withdrawn review stays `cancelled`.
- Record the known file-capture reason in the explanation when present, without claiming it was the only cause or exposing file paths/content. When no capture reason exists, use the neutral `material-not-recovered` label. The durable task's `fileUnavailable` record remains the detailed source. The separate feedback record type continues to accept only its four existing unavailable reasons.
- Reproduce with an actual native oversized-file task in the scripted harness: ordinary `read` and answer succeed; review is `inconclusive` / `file-evidence-unavailable` with no native review request. Use a complete bounded file task as a positive control for two reviews. Check feedback assessment/clue behavior remains independent through affected existing suites.
- Run the focused runtime and parser suites, package typecheck, and repo diff checks. This engineering gate does not establish natural user benefit, end-to-end learning, or Daily readiness. Next real use must be a new frozen task; do not rerun E038 with altered inputs.
