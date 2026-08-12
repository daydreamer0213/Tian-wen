from pathlib import Path

import pytest

from tianwen.domain import (
    ActionRecord,
    ActionStatus,
    BudgetLimit,
    BudgetUsage,
    ExplorationBrief,
    ExplorationStopReason,
    ExplorationUsage,
    LoopKind,
    LoopRecord,
    RunManifest,
    RunRecord,
    RunStatus,
)
from tianwen.store import BudgetExceeded, LeaseConflict, StateConflict, StateStore


def store_at(path: Path) -> StateStore:
    store = StateStore(path)
    store.initialize()
    return store


def make_loop(
    loop_id: str,
    *,
    goal_id: str,
    parent_loop_id: str | None = None,
) -> LoopRecord:
    return LoopRecord(
        loop_id=loop_id,
        goal_id=goal_id,
        parent_loop_id=parent_loop_id,
        kind=LoopKind.CHILD if parent_loop_id else LoopKind.USER,
        objective="test loop",
        budget=BudgetLimit(model_requests=2, tool_calls=3, tokens=40),
    )


def make_brief(*, max_tokens: int, max_cost_microunits: int) -> ExplorationBrief:
    return ExplorationBrief(
        brief_id="brief",
        task_id="task",
        question="question",
        decision_use="decision",
        known_evidence_ids=(),
        unknowns=("unknown",),
        allowed_local_roots=(".",),
        allowed_source_classes=("source_code",),
        allowed_domains=(),
        max_searches=2,
        max_fetches=3,
        max_tokens=max_tokens,
        max_cost_microunits=max_cost_microunits,
        wall_seconds=60,
        expected_outputs=("answer",),
        sufficiency_criteria=("evidence",),
        stop_conditions=(ExplorationStopReason.SUFFICIENT,),
    )


def make_run(*, model_id: str = "model-a") -> RunRecord:
    return RunRecord(
        run_id="run",
        task_id="task",
        status=RunStatus.QUEUED,
        manifest=RunManifest(
            workflow_version="1",
            schema_version="1",
            pydantic_ai_version="2.18.0",
            harness_version="0.13.0",
            model_id=model_id,
            prompt_digest="sha256:prompt",
            skill_versions={},
            skill_digests={},
            policy_digest="sha256:policy",
            tool_contract_digest="sha256:tools",
            goal_contract_digest="sha256:goal",
            workspace_digest="sha256:workspace",
        ),
    )


def prepare_running_action(store: StateStore, *, run_id: str) -> None:
    action = ActionRecord(
        action_id="a1",
        run_id=run_id,
        tool_call_id="call",
        tool_name="write_file",
        args_json='{"path":"a.txt"}',
        args_digest="sha256:args",
        effect_class="reversible_workspace_write",
        idempotency_key=f"{run_id}:call",
        status=ActionStatus.PROPOSED,
    )
    store.prepare_action(action)
    store.transition_action("a1", {ActionStatus.PROPOSED}, ActionStatus.RUNNING)


def test_event_sequence_is_append_only(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    first = store.append_event("run-1", "started", {})
    second = store.append_event("run-1", "checkpointed", {})
    assert (first.sequence, second.sequence) == (1, 2)


def test_child_budget_is_reserved_from_parent(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    store.create_budget(
        "parent", None, BudgetLimit(model_requests=4, tool_calls=8, tokens=100)
    )
    store.reserve_child_budget(
        "parent",
        "child",
        BudgetLimit(model_requests=2, tool_calls=3, tokens=40),
    )
    with pytest.raises(BudgetExceeded):
        store.reserve_child_budget(
            "parent",
            "other",
            BudgetLimit(model_requests=3, tool_calls=1, tokens=1),
        )


def test_parent_charge_cannot_spend_child_reservation(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    store.create_budget(
        "parent", None, BudgetLimit(model_requests=4, tool_calls=4, tokens=40)
    )
    store.reserve_child_budget(
        "parent", "child", BudgetLimit(model_requests=2, tool_calls=2, tokens=20)
    )
    with pytest.raises(BudgetExceeded):
        store.charge_budget("parent", BudgetUsage(model_requests=3))


def test_create_budget_cannot_bypass_parent_reservation(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    store.create_budget(
        "parent", None, BudgetLimit(model_requests=1, tool_calls=1, tokens=10)
    )
    with pytest.raises(StateConflict):
        store.create_budget(
            "unreserved-child",
            "parent",
            BudgetLimit(model_requests=1, tool_calls=1, tokens=10),
        )


def test_existing_exploration_brief_cannot_expand_persisted_limits(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    brief = make_brief(max_tokens=10, max_cost_microunits=10)
    store.create_exploration(brief)
    expanded = brief.model_copy(update={"max_tokens": 20})
    with pytest.raises(StateConflict):
        store.put_object("exploration_brief", brief.brief_id, None, "active", expanded)
    with pytest.raises(BudgetExceeded):
        store.reserve_exploration_usage(brief.brief_id, ExplorationUsage(admitted_tokens=11))


def test_exploration_brief_can_only_be_created_with_create_exploration(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    brief = make_brief(max_tokens=10, max_cost_microunits=10)
    with pytest.raises(StateConflict):
        store.put_object("exploration_brief", brief.brief_id, None, "active", brief)


def test_existing_run_cannot_replace_its_frozen_manifest(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    run = make_run()
    store.put_object("run", run.run_id, None, run.status.value, run)
    replacement = make_run(model_id="model-b")
    with pytest.raises(StateConflict):
        store.put_object("run", run.run_id, None, replacement.status.value, replacement)
    assert store.get_object("run", run.run_id, RunRecord).manifest.model_id == "model-a"


def test_existing_run_cannot_replace_its_persisted_parent_id(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    run = make_run()
    store.put_object("run", run.run_id, None, run.status.value, run)
    with pytest.raises(StateConflict):
        store.put_object("run", run.run_id, "different-parent", run.status.value, run)


def test_budget_and_lease_survive_reopen(tmp_path: Path) -> None:
    path = tmp_path / "state.db"
    store = store_at(path)
    store.create_budget(
        "loop", None, BudgetLimit(model_requests=2, tool_calls=2, tokens=20)
    )
    store.charge_budget("loop", BudgetUsage(model_requests=1, tokens=5))
    generation = store.acquire_lease("run", "worker-a", 60)

    reopened = store_at(path)
    assert reopened.charge_budget(
        "loop", BudgetUsage(model_requests=1, tokens=15)
    ).tokens == 20
    with pytest.raises(BudgetExceeded):
        reopened.charge_budget("loop", BudgetUsage(tokens=1))
    with pytest.raises(LeaseConflict):
        reopened.acquire_lease("run", "worker-b", 60)
    reopened.renew_lease("run", "worker-a", generation, 60)


def test_started_action_without_terminal_result_is_unresolved(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    action = ActionRecord(
        action_id="a1",
        run_id="run",
        tool_call_id="call",
        tool_name="write_file",
        args_json='{"path":"a.txt"}',
        args_digest="sha256:args",
        effect_class="reversible_workspace_write",
        idempotency_key="run:call",
        status=ActionStatus.PROPOSED,
    )
    store.prepare_action(action)
    store.transition_action(
        "a1", {ActionStatus.PROPOSED}, ActionStatus.RUNNING
    )
    assert store.unresolved_actions("run")[0].status is ActionStatus.RUNNING


def test_recovery_persists_running_action_as_unknown(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    prepare_running_action(store, run_id="run")
    changed = store.mark_inflight_actions_unknown("run")
    assert changed[0].status is ActionStatus.UNKNOWN
    events = store.list_events("run")
    assert events[-1].kind == "action_unknown_after_recovery"


def test_child_loop_must_keep_persisted_parent_goal(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    store.put_object(
        "loop", "parent", None, "active", make_loop("parent", goal_id="goal-a")
    )
    with pytest.raises(StateConflict):
        store.create_child_loop(
            "parent", make_loop("child", goal_id="goal-b", parent_loop_id="parent")
        )


def test_exploration_usage_is_cumulative_and_survives_reopen(tmp_path: Path) -> None:
    path = tmp_path / "state.db"
    store = store_at(path)
    brief = make_brief(max_tokens=100, max_cost_microunits=10)
    store.create_exploration(brief)
    store.reserve_exploration_usage(
        brief.brief_id, ExplorationUsage(admitted_tokens=60, cost_microunits=6)
    )
    reopened = store_at(path)
    with pytest.raises(BudgetExceeded):
        reopened.reserve_exploration_usage(
            brief.brief_id, ExplorationUsage(admitted_tokens=41, cost_microunits=5)
        )
