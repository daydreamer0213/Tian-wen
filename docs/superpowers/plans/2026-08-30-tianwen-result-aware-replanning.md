# Tianwen Result-Aware Replanning Implementation Plan

Date: 2026-08-30

**Status:** implemented and retained in Tianwen Runtime `0.1.5`. This is a frozen historical plan,
not the current backlog. See the
[`result-aware replanning handoff`](../../operations/tianwen-result-aware-replanning-handoff.md).

## Task 1: Extract one anchored settled-Task result

- Add RED tests for complete, blocked, wrong Goal, later Turn, incomplete Turn,
  and non-text assistant content.
- Implement one pure extractor over DSH Session events.
- Reuse it from existing feedback/analysis code where that removes exact
  duplication without changing behavior.

## Task 2: Give newly settled results to the planner

- Add RED planner tests that prove only Tasks after
  `consideredSettledTasks` are read and included.
- Label result values as untrusted historical data and distinguish unavailable
  history without failing the Turn.
- Do not change the typed planning tool or Long Goal record schema.

## Task 3: Wire both ordinary product paths

- Web/Desktop host reads the exact live or persisted Task Session, waits for a
  live owner to become idle, flushes it, then extracts the anchored result.
- Installed CLI opens the exact persisted Task Session and applies the same
  extractor.
- Update focused host/CLI tests and TypeScript checks.

## Task 4: Review, integrate, and validate proportionally

- Review once for Session/Goal identity, prompt injection boundary, v1
  compatibility, and accidental scope expansion.
- Run affected deterministic tests and repository checks once after the diff is
  stable; rerun only a failing or changed area.
- Package through the ordinary Runtime release path, then run one useful real
  installed-product Goal to prove that a Task result changes the next plan.
- Report product result, Provider/runtime evidence, learning facts, and external
  facts separately.
