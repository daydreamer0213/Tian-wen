from __future__ import annotations

from pathlib import Path

import pytest

from tianwen.domain import (
    ArtifactStatus,
    ArtifactVersion,
    BudgetLimit,
    BudgetUsage,
    CaseRecord,
    ExplorationBrief,
    ExplorationStopReason,
    GoalContract,
    LessonRecord,
    LoopKind,
    LoopRecord,
    RunManifest,
    RunRecord,
    RunStatus,
    TaskKind,
    TaskRecord,
)
from tianwen.exploration import ExplorationEngine
from tianwen.learning import (
    AttributionRecord,
    LearningEngine,
    LearningSignal,
    MutationNotAllowed,
)
from tianwen.store import BudgetExceeded, StateConflict, StateStore


def make_engine(tmp_path: Path, *, parent_budget: BudgetLimit | None = None) -> LearningEngine:
    store = StateStore(tmp_path / "state.db")
    store.initialize()
    budget = parent_budget or BudgetLimit(model_requests=4, tool_calls=12, tokens=1200)
    goal = GoalContract(
        goal_id="goal-1",
        objective="deliver safely",
        success_criteria=("done",),
        constraints=("bounded",),
        authorization=(),
        budget=budget,
    )
    parent = LoopRecord(
        loop_id="meta",
        goal_id=goal.goal_id,
        kind=LoopKind.META,
        objective="supervise delivery",
        budget=budget,
    )
    store.put_object("goal", goal.goal_id, None, "active", goal)
    store.put_object("loop", parent.loop_id, goal.goal_id, "active", parent)
    store.create_budget(parent.loop_id, None, budget)
    return LearningEngine(
        store,
        learning_budget=BudgetLimit(model_requests=1, tool_calls=3, tokens=300),
    )


def make_signal(**updates: object) -> LearningSignal:
    values: dict[str, object] = {
        "signal_id": "signal-1",
        "loop_id": "meta",
        "category": "repeated_planning_delay",
        "severity": 2,
        "recurrence": 2,
        "blocks_goal": False,
        "user_corrected": False,
        "evidence_ids": ("e-1",),
    }
    values.update(updates)
    return LearningSignal(**values)


def accepted_lesson(*, lesson_id: str = "lesson-1") -> LessonRecord:
    return LessonRecord(
        lesson_id=lesson_id,
        case_ids=("case-1",),
        claim="Prefer a narrow repository task skill.",
        when=("a repository task repeats",),
        not_when=("the task is exploratory",),
        evidence_ids=("e-1",),
        counterevidence_ids=("e-2",),
        confidence_basis="two competing hypotheses were tested",
        target_scope="repo_task_skill",
        status="accepted",
    )


def parent_skill() -> ArtifactVersion:
    return ArtifactVersion(
        artifact_id="repo-task",
        artifact_type="repo_task_skill",
        version_id="version-parent",
        parent_version_id=None,
        content_digest="sha256:parent",
        content="---\nname: repo-task\n---\n# Repository task\nExisting guidance.",
        evidence_ids=("e-parent",),
        status=ArtifactStatus.ACTIVE,
    )


def candidate_markdown() -> str:
    return """---
name: repo-task
---
# Repository task
Existing guidance.

## Conditions
- When: a repository task repeats

## Counterexamples
- Not when: the task is exploratory

## Evidence
- Evidence: e-1
- Counterevidence: e-2
"""


def running_manifest() -> RunManifest:
    return RunManifest(
        workflow_version="1",
        schema_version="1",
        pydantic_ai_version="test",
        harness_version="test",
        model_id="test",
        prompt_digest="sha256:prompt",
        skill_versions={},
        skill_digests={},
        policy_digest="sha256:policy",
        tool_contract_digest="sha256:tools",
        goal_contract_digest="sha256:goal",
        workspace_digest="sha256:workspace",
    )


def test_low_value_signal_is_recorded_without_learning_job(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    signal = make_signal(signal_id="s1", category="single_minor_delay", severity=1, recurrence=1)

    assert engine.enqueue(signal) is None
    assert engine.store.get_object("learning_signal", signal.signal_id, LearningSignal) == signal
    assert engine.store.list_objects("learning_ticket", object) == []


@pytest.mark.parametrize(
    "updates",
    (
        {"user_corrected": True},
        {"blocks_goal": True},
        {"severity": 4, "recurrence": 1},
        {"recurrence": 2},
    ),
)
def test_each_high_value_trigger_creates_a_finite_ticket(
    tmp_path: Path, updates: dict[str, object]
) -> None:
    engine = make_engine(tmp_path)
    signal = make_signal(**updates)

    ticket_id = engine.enqueue(signal)

    assert ticket_id is not None
    ticket = engine.get_ticket(ticket_id)
    assert ticket.allowed_mutation_targets == ("repo_task_skill",)
    assert ticket.max_experiments == 3
    assert ticket.learning_budget == BudgetLimit(model_requests=1, tool_calls=3, tokens=300)
    assert ticket.problem_statement == (
        f"Learning signal: {signal.category} (severity={signal.severity}, recurrence={signal.recurrence}, "
        f"blocks_goal={signal.blocks_goal}, user_corrected={signal.user_corrected})."
    )
    task = engine.get_learning_task(ticket_id)
    assert task.kind is TaskKind.LEARNING
    assert task.loop_id == ticket.loop_id


def test_serious_safety_signal_uses_investigation_mode_without_a_lesson(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)

    ticket_id = engine.enqueue(make_signal(category="unsafe_shell", severity=4, recurrence=1))

    assert engine.get_ticket(ticket_id).investigation_mode is True
    assert engine.store.list_objects("lesson", LessonRecord) == []


def test_learning_ticket_is_atomic_and_idempotent_after_reopen(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    signal = make_signal()

    ticket_id = engine.enqueue(signal)
    reopened = LearningEngine(
        StateStore(tmp_path / "state.db"), learning_budget=BudgetLimit(model_requests=1, tool_calls=3, tokens=300)
    )
    reopened.store.initialize()

    assert reopened.enqueue(signal) == ticket_id
    assert len(reopened.store.list_objects("learning_ticket", type(reopened.get_ticket(ticket_id)))) == 1
    assert len(reopened.store.list_objects("task", TaskRecord)) == 1
    assert len(reopened.store.list_objects("loop", LoopRecord)) == 2
    _, _, reserved = reopened.store.get_budget("meta")
    assert reserved == BudgetUsage(**BudgetLimit(model_requests=1, tool_calls=3, tokens=300).model_dump())


def test_learning_task_owns_exploration_and_charges_its_child_budget(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    goal = engine.store.get_object("goal", "goal-1", GoalContract).model_copy(
        update={"authorization": ("workspace_read",)}
    )
    engine.store.put_object("goal", goal.goal_id, None, "active", goal)
    ticket_id = engine.enqueue(make_signal())
    task = engine.get_learning_task(ticket_id)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "README.md").write_text("learning evidence", encoding="utf-8")
    run = RunRecord(
        run_id="learning-run",
        task_id=task.task_id,
        status=RunStatus.RUNNING,
        manifest=running_manifest(),
    )
    brief = ExplorationBrief(
        brief_id="learning-brief",
        task_id=task.task_id,
        question="What diverged?",
        decision_use="distinguish hypotheses",
        known_evidence_ids=("e-1",),
        unknowns=("root cause",),
        allowed_local_roots=(".",),
        allowed_source_classes=(),
        allowed_domains=(),
        max_searches=0,
        max_fetches=0,
        max_tokens=0,
        max_cost_microunits=0,
        wall_seconds=60,
        expected_outputs=("evidence",),
        sufficiency_criteria=("finding",),
        stop_conditions=(ExplorationStopReason.SUFFICIENT,),
    )
    engine.store.put_object("run", run.run_id, task.task_id, run.status.value, run)
    engine.store.create_exploration(brief)
    exploration = ExplorationEngine(engine.store, workspace, None, None, 0, 0)

    assert exploration.search_local(run.run_id, brief, "learning evidence")
    _, usage, _ = engine.store.get_budget(task.loop_id)
    assert usage.tool_calls == 1


def test_budget_shortfall_rolls_back_ticket_loop_task_and_reservation(tmp_path: Path) -> None:
    engine = make_engine(tmp_path, parent_budget=BudgetLimit(model_requests=0, tool_calls=12, tokens=1200))
    signal = make_signal()

    with pytest.raises(BudgetExceeded):
        engine.enqueue(signal)

    assert engine.store.get_object("learning_signal", signal.signal_id, LearningSignal) == signal
    assert engine.store.list_objects("learning_ticket", object) == []
    assert engine.store.list_objects("task", TaskRecord) == []
    assert len(engine.store.list_objects("loop", LoopRecord)) == 1
    _, _, reserved = engine.store.get_budget("meta")
    assert reserved == BudgetUsage()


def test_conflicting_signal_identity_is_rejected_without_overwrite(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    engine.enqueue(make_signal())

    with pytest.raises(StateConflict):
        engine.enqueue(make_signal(category="different"))


def test_create_case_is_bound_to_the_learning_loop_and_signal_evidence(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    ticket_id = engine.enqueue(make_signal())

    case = engine.create_case(ticket_id)

    assert case.loop_id == engine.get_ticket(ticket_id).loop_id
    assert case.evidence_ids == ("e-1",)
    assert engine.store.get_object("case", case.case_id, CaseRecord) == case


def test_illegal_mutation_target_keeps_recommendation_only_attribution(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    case = engine.create_case(engine.enqueue(make_signal()))

    with pytest.raises(MutationNotAllowed):
        engine.record_attribution(
            case,
            hypotheses=("policy too strict", "planner context is stale"),
            earliest_divergence="before write_file",
            mutation_target="action_gateway",
            rejected_targets=("repo_task_skill",),
        )

    records = engine.store.list_objects("attribution", AttributionRecord)
    assert len(records) == 1
    assert records[0].recommendation_only is True
    assert records[0].mutation_target == "action_gateway"


def test_attribution_requires_competing_hypotheses_unless_verifier_failure(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    case = engine.create_case(engine.enqueue(make_signal()))

    with pytest.raises(StateConflict, match="two hypotheses"):
        engine.record_attribution(case, ("only one",), "before write_file", "repo_task_skill", ())
    verifier_case = case.model_copy(update={"outcome": "deterministic_verifier_failure: schema mismatch"})
    record = engine.record_attribution(
        verifier_case, ("schema mismatch",), "before write_file", "repo_task_skill", ()
    )
    assert record.hypotheses == ("schema mismatch",)
    assert record.observed_outcome == verifier_case.outcome
    assert record.reproduction_scope
    assert record.distinguishing_experiment


def test_accept_lesson_is_immutable_and_keeps_conditions_counterexamples_and_evidence(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    lesson = accepted_lesson()

    engine.accept_lesson(lesson)
    engine.accept_lesson(lesson)

    assert engine.store.get_object("lesson", lesson.lesson_id, LessonRecord) == lesson
    with pytest.raises(StateConflict):
        engine.accept_lesson(lesson.model_copy(update={"claim": "different"}))


def test_candidate_requires_accepted_lesson_and_preserves_front_matter(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    lesson = accepted_lesson()
    engine.accept_lesson(lesson)
    parent = parent_skill()
    engine.store.put_object("artifact", parent.version_id, None, parent.status.value, parent)
    engine.store.put_object("active_pointer", "repo-task", None, "active", parent)

    candidate = engine.create_repo_task_candidate(parent, lesson, candidate_markdown())

    assert candidate.status is ArtifactStatus.CANDIDATE
    assert candidate.parent_version_id == parent.version_id
    assert candidate.content.startswith("---\nname: repo-task\n---")
    assert candidate.version_id == candidate.content_digest
    assert engine.store.get_object("active_pointer", "repo-task", ArtifactVersion) == parent


@pytest.mark.parametrize(
    "markdown",
    (
        "---\nname: repo-task\n---\n## Conditions\n\n## Counterexamples\n- no\n\n## Evidence\n- e-1\n",
        "---\nname: repo-task\n---\n## Conditions\n- yes\n\n## Counterexamples\n\n## Evidence\n- e-1\n",
        "---\nname: repo-task\n---\n## Conditions\n- yes\n\n## Counterexamples\n- no\n\n## Evidence\n",
    ),
)
def test_candidate_rejects_empty_required_sections(tmp_path: Path, markdown: str) -> None:
    engine = make_engine(tmp_path)
    lesson = accepted_lesson()
    engine.accept_lesson(lesson)

    with pytest.raises(StateConflict, match="section"):
        engine.create_repo_task_candidate(parent_skill(), lesson, markdown)


def test_candidate_exact_replay_is_idempotent_and_different_content_is_new_version(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    lesson = accepted_lesson()
    engine.accept_lesson(lesson)
    parent = parent_skill()
    first = engine.create_repo_task_candidate(parent, lesson, candidate_markdown())
    second = engine.create_repo_task_candidate(parent, lesson, candidate_markdown())
    changed = engine.create_repo_task_candidate(
        parent,
        lesson,
        candidate_markdown().replace("Existing guidance.", "Updated guidance."),
    )

    assert second == first
    assert changed.version_id != first.version_id
    assert len(engine.store.list_objects("artifact", ArtifactVersion)) == 2


def test_candidate_rejects_non_skill_parent_or_unaccepted_lesson(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    lesson = accepted_lesson()
    with pytest.raises(StateConflict, match="accepted"):
        engine.create_repo_task_candidate(parent_skill(), lesson, candidate_markdown())
    engine.accept_lesson(lesson)
    with pytest.raises(StateConflict, match="repo_task_skill"):
        engine.create_repo_task_candidate(
            parent_skill().model_copy(update={"artifact_type": "eval_protocol"}),
            lesson,
            candidate_markdown(),
        )
