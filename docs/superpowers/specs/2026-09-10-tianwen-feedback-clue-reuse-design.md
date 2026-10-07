# Reuse bounded feedback clues without promoting partial file evidence

Status: owner approved the partial-clue / independent-adoption direction and
continuous execution of A, B and C. This is the concrete implementation boundary
for A, not a new total roadmap. Baseline: 838350b.

## Decision and reuse

Incomplete file work can already have a native, attributed feedback assessment,
but the guidance selector discards the task because its replay material is not
complete. Preserve that existing separation: such a task is a proposal clue,
never one of the study's two supports or its successful counterexample.

Selected: reuse the existing feedback service and guidance study. Once a normal
study has qualified complete sources, supply at most two compatible incomplete
file-task feedback clues to its proposer. The proposer may use or ignore them;
its output still runs through the existing five-case, two-arm independent checks.
No clue enters case design, trial execution or reviewers. No new service, queue,
background model call, database or alternative study engine is needed.

This does not make an incomplete task replayable, and cannot start a study when
complete independent sources are absent. That is a disclosed limitation, not a
reason to silently fabricate sources or count proposal clues as successful work.
The increment closes the loss of usable proposal context, not universal file
learning or stable improvement. Work package B must report this distinction.

Rejected alternatives: copying partial fileInputs as facts loses provenance;
allowing incomplete tasks to count as full study sources weakens adoption;
building generic command replay or cross-root capture exceeds this increment.
Installed DSH persistence/feedback and native Agent judgment already supply the
needed execution identities. Existing upstream inspection is recorded in the
[scope analysis](../../research/2026-09-10-tianwen-file-evidence-scope.md).

## Contract

- Future task-started records carry optional `proposalCluePolicy: 'feedback.v1'`.
  Missing means historical: never recruit it as a new clue. Existing record
  shapes and hashes without the field remain byte-semantically unchanged.
- Study-opened may carry `proposalClues`, a nonempty list of at most two
  `GuidanceProposalClue` references. Each has `taskId`, `assessmentId`,
  `assessmentDigest` and `materialDigest`. References are unique by task and
  assessment and disjoint from all three actual study sources. They are part of
  the study identity. Only local-files studies may have them.
- Eligible clues are completed local-files tasks with incomplete file evidence,
  the new marker, the same scope, family, output kind, parent behavior, consent,
  quality contract and native model configuration as the study. Use the latest
  active conclusive feedback assessment; attributable-problem/preference requires
  matching category and nonempty supplemental criteria. Later positive feedback,
  pending replacement assessment, invalid identity or revoked support excludes it.
- Reuse `materialForAssessment` for exact original request, visible assistant
  answer and attributed direct user feedback. Verify its native judgment proof,
  exact structured result and material digest before projecting a clue. A clue
  contains those three attributed surfaces plus assessment classification/category
  and suggested criteria. It contains no fileInputs, fileResult, tool output,
  filesystem contents, ancillary records, historical prior context or inferred
  file truth. No current file is reread. This proves what was said, not whether an
  external effect happened. Full-object JSON is capped at 8192 UTF-8 bytes per
  clue; skip oversized material without truncating or rewriting stored evidence.
- The proposer sees `proposalClues` only when nonempty, clearly labelled
  untrusted hypotheses, not source facts, required standards or successful tests.
  It must not copy names, answers or private case facts into general guidance.
  New instructions are conditional on actual clues so old no-clue requests retain
  their existing shape. Preserve the original admission/review/feedback verdict.
- Bind the actual projected material to the references and native proposal proof.
  Recheck activity before model calls and activation, including cold recovery.
  A selected clue's withdrawal or replacement invalidates that study's proposal
  dependency through the existing support-retracted / ancestor rollback path.
  Historical studies without clues keep their prior semantics. No old task,
  assessment or closed cohort is regraded or re-executed.

## Three stories and acceptance

Normal: an ordinary incomplete file task receives attributable user feedback.
Later a compatible study with two complete supports and one complete counterexample
opens; its proposal receives the exact bounded clue, and candidate comparison still
uses only the original complete sources plus the two independently designed cases.

Counterexample: a clue alone, failed read, bare rating, ambiguous feedback, later
positive correction, different workspace or legacy task does not qualify a study
or become an original fact. No-clue source selection and request shapes are unchanged.

Failure: consent/feedback/native provenance changes during a study or before cold
activation. Stop it or roll back the affected active chain; do not launch another
model attempt to replace it. 023–025 remain closed and unchanged.

Engineering acceptance must observe actual native request packets: clue delivered
only to proposal, unchanged complete source identities, ten comparison arms and
independent checks, future application, zero-call recovery and withdrawal behavior.
Scripted model responses prove mechanics only. B uses a fresh ordinary IAB / real
DeepSeek task and genuine feedback if warranted; no forced study, planted ledger
or scripted answers. Missing natural study opportunity remains missing, not failure
of a branch never reached. C separately decides release versus explicit NO-GO.
