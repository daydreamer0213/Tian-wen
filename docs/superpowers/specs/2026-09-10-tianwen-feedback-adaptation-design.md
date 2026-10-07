# Feedback clues independent of whole-task replayability

Status: the owner approved continued execution after the 026 NO-GO and the
proposal to separate clue eligibility from whole-task verification, reuse the
existing material budget, and diagnose the retained reviews before any new run.
Baseline: 26fd588. This supersedes the future-work stop in the 026 handoff, not
the original 026 result. Routine implementation decisions remain delegated.

## Proven gap and selected approach

026 had a real attributable feedback assessment, but a normal file/hash task was
classified external, and its exact proposal projection exceeded the separate
8192-byte cutoff. Neither means the feedback cannot inform a hypothesis. The
project governs learning; it does not own arbitrary task execution or repair
every answer's domain-specific mistake.

Reuse the existing native assessment, proposer, complete-source study and
independent validation. New external-task feedback can inform a compatible
text or local-files study. It does not become a replay source. The resulting
method remains scoped to the task mode actually tested; a text study cannot
prove file/command execution improved.

Alternatives rejected: accepting partial files as facts loses provenance;
implementing arbitrary external replay expands ownership; automatic clue
summarization adds another model-dependent transformation when complete native
material already fits the ordinary budget. No new service or model call.

## Prospective contract

- New task starts use `proposalCluePolicy: 'feedback.v2'`. Missing and v1 fields
  keep their historical meanings and hashes. No migration, regrading or new use
  of old external v1 tasks. Existing v1 local-file clues keep their 8192-byte
  rule and local-files-study restriction, including cold recovery.
- A v2 clue may come from a completed external task or an incomplete local-files
  task. Text/subjective tasks and complete local-files tasks do not become this
  separate clue source. Same scope, family, failure category, consent revision,
  parent behavior, quality contract and verified native model remain mandatory.
  Local-file clues still require a local-file study and matching fileOutputKind;
  external clues have no fileOutputKind and may inform either complete study
  mode. Do not invent a fileOutputKind for an external task.
- At most two latest active attributable-problem/preference assessments, with
  nonempty criteria, exact native proof and disjoint task/assessment identities.
  Pending replacement, latest positive feedback, withdrawal or identity drift
  excludes a clue. Source result and direct request/answer/feedback projections
  stay exact; no tool output, partial file truth, prior context or current reread.
- v2 uses the existing `CONVERSATION_MATERIAL_MAX_BYTES` (256 KiB serialized
  material) instead of an extra 8 KiB per-clue cutoff. Before study-opened freezes
  references, greedily retain only whole clues whose exact initial proposal
  packet fits that budget, including metadata, complete sources and catalog.
  Optional oversize clues are skipped without blocking an otherwise valid
  complete study. No truncation, summarization or stored-evidence rewrite.
  Later proposal rounds retain the frozen clues and existing whole-packet guard;
  a later oversize exploration/source payload stops rather than silently
  changing dependencies. Historical no-clue request shapes stay unchanged.
- Only proposer receives clues, clearly as untrusted hypotheses. Case design,
  trial workers and independent reviewers do not. Still require two complete
  compatible supports and a successful complete counterexample before opening;
  five cases and both arms remain unchanged. New clue alone cannot open a study.
- Frozen packet verification, native model binding, activity checks before
  calls/activation, cold recovery and existing support-withdrawal/ancestor
  rollback remain load-bearing. No new ledger or Agent execution system.

## Normal, counterexample and failure stories

Normal: a mixed task produces a reliable user-feedback clue. Later two complete
supports plus an independent successful counterexample qualify a study. The
proposer can consider that exact clue; only independent results decide adoption.

Counterexample: an old external task, different family/workspace/model, lone
clue, complete external-effect claim or answer copied into a method is not a
successful test or adoption permission. If all clues exceed remaining capacity,
the ordinary complete study still runs with no clue field.

Failure: feedback changes after freezing, or the native proof drifts. Existing
stop/recovery/rollback applies, not a replacement model attempt. The 026 reviews
are diagnosed offline from retained native output; that diagnosis does not
retroactively change their ledger verdicts or authorize replay.

## Verification and release boundary

Engineering covers v1/absent compatibility, v2 external-to-text and external-to-
file admission, incomplete-file mode matching, native packet capacity and
isolation, withdrawal and cold recovery. Reuse the old independent-evaluation
proof; do not rerun unrelated scenarios merely to increase counts.

Before a new real run, freeze a finite cohort that includes actual study
prerequisites: complete-source tasks and honest problem/preference feedback,
not just a lone external task. Use IAB and actual DeepSeek with ordinary input;
no seeded ledger, model answers, candidate, forced study or fabricated negative
feedback. State which prerequisites actually qualify and whether the proposer
receives the clue. If the finite cohort does not qualify or produces a valid
rejection, record that result instead of tuning inputs to obtain acceptance.

Daily remains Runtime022/preview23 until focused engineering, review, genuine
new-connection evidence, exact integration/CI and supported upgrade checks pass.
All new generated artifacts belong under E:/待清理/D盘迁移-2026-09-08/
Tianwen-反馈适配-027. Old 026 evidence and refused cleanup targets stay untouched.
