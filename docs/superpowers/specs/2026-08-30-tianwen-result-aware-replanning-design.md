# Tianwen Result-Aware Replanning Design

Date: 2026-08-30

Status: accepted product direction, frozen for implementation

## Decision

Goal-first replanning must receive the final assistant reply from each newly
settled Task. Today the planner sees only the Task objective and terminal phase,
so research, analysis, and conversation-only results can be lost between Task
Sessions even though DSH persisted them correctly.

This stage adds one narrow bridge from a settled Task Session to the next
explicit planner Turn. It does not change the Long Goal schema, add a Tianwen
message store, summarize results with another model, or start background work.

## Product behavior

When `Continue progressing` or Goal guidance causes a planner Turn:

1. Tianwen identifies settled bound Tasks not yet counted by
   `planner.consideredSettledTasks`.
2. For each one, Tianwen opens the exact bound DSH Session and finds the final
   assistant reply from the Goal round that completed or blocked that Task.
3. The planner prompt receives the Task objective, terminal phase, and either
   the reply or an explicit `unavailable` marker.
4. The prompt labels replies as untrusted historical execution data. They are
   context for planning, not instructions, acceptance evidence, or permission.
5. The existing typed planning tool remains the only authority that can commit
   the replacement future suffix.

Only newly settled Tasks are included in a Turn. Earlier results already
considered by a committed plan are not repeatedly copied into later prompts.
The durable Goal record continues to store only DSH Session/Goal bindings and
the settled-count checkpoint; DSH remains the sole message authority.

## Anchoring rule

A Task result is available only when the bound Session proves this sequence for
the exact Goal ID:

- a Goal-sourced user message;
- its matching completed Turn;
- the last appended assistant text in that Turn; and
- the matching terminal Goal change, with no later Turn before that change.

`complete` Tasks require a DSH `complete` Goal change. Explicitly abandoned
Tasks require the original DSH `blocked` Goal change. A successfully inspected
exact Session that has no anchored text produces `availability: "unavailable"`;
it does not invent a result. Session identity mismatch, persistence corruption,
or an I/O failure remains an integrity/runtime error and must not be swallowed,
because a successful plan would otherwise permanently advance the checkpoint
past an unread result.

## Implementation boundary

- Add a small pure extractor for the anchored final assistant text.
- Extend planner dependencies with one `readSettledTaskResult` operation so the
  planner does not know how Web/Desktop or CLI opens DSH Sessions.
- Freeze the settled-count checkpoint from the same status snapshot that built
  the prompt. A Task that settles while the model is planning remains new for
  the next explicit Turn rather than being marked as already considered.
- Wire the same operation in both installed CLI and Web/Desktop hosts.
- Add deterministic tests for result inclusion, untrusted-data labeling,
  newly-settled selection, blocked/abandoned mapping, and unavailable history.
- Keep existing Goal revisions, planning tool arguments, projections, UI, and
  explicit continue/guidance actions unchanged.

## Explicit non-goals

- no automatic Task decomposition beyond the existing planner;
- no scheduler, daemon, retry loop, token budget, or Tianwen-side spend limit;
- no result database, vector index, generic event abstraction, or model-based
  summarizer;
- no automatic Outcome, Case, Candidate, or Skill creation;
- no new synthetic controlled Activity.

## Verification

The deterministic gate must prove the exact prompt data and unchanged planning
authority. A real installed-product check is warranted after packaging because
this is a model-facing product behavior: one useful Goal should produce a Task
whose real result materially informs the next plan. It runs once and is not
repeated to select a nicer answer.
