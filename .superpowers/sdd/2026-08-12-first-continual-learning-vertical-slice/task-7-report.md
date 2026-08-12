# Task 7 report: governed learning chain

## RED / GREEN

- RED: `uv run pytest tests/unit/test_learning.py -q` failed during collection with `ModuleNotFoundError: No module named 'tianwen.learning'`.
- GREEN: focused learning suite passed `20 passed`; full unit suite passed `157 passed`.

## Transaction design

`LearningEngine.enqueue` first stores every `LearningSignal` as an immutable recorded object. Low-value signals stop there. For qualifying signals, `StateStore.create_learning_ticket` opens one `BEGIN IMMEDIATE` transaction that validates the persisted parent loop and goal, reserves the frozen child budget, inserts exactly one child `LoopRecord`, one `TaskRecord(kind=LEARNING)`, and one immutable ticket. A budget failure rolls back every one of those learning records; the separately recorded signal remains.

The ticket and child/task identities are deterministic from the signal ID. Exact replay reads and returns the existing ticket, while conflicting immutable identity replays raise `StateConflict`. Exploration briefs attach to the created learning task and use its child-loop budget through the existing exploration path.

## Changes

- Added `src/tianwen/learning.py`: deterministic high-value signals, finite tickets, cases, attribution scope enforcement, immutable lessons, and candidate-only `repo_task_skill` artifact creation.
- Updated `src/tianwen/store.py`: immutable persistence helper, read-only budget helper, and one-transaction learning ticket creation.
- Added `tests/unit/test_learning.py`: triggers, signal durability, atomic/reopen idempotency, rollback, exploration budget ownership, safety investigation mode, attribution rules, immutable lessons/candidates, structure validation, and unchanged active pointer coverage.

## Self-review / concerns

- No active pointer read or write occurs in candidate creation. Candidate records are stored only as `kind=artifact`, `status=CANDIDATE`.
- No queue framework, message bus, registry, active-pointer manager, or additional loop type was introduced.
- Learning budget is explicit at `LearningEngine` construction and frozen on each ticket.
- Attribution records intentionally describe competing hypotheses and a distinguishing experiment without asserting an unverified root cause.
