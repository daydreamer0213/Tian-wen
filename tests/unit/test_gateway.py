from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest
from pydantic_ai import Agent, DeferredToolRequests, DeferredToolResults
from pydantic_ai.models.test import TestModel
from pydantic_ai.tools import ToolDefinition

from tianwen.domain import (
    ActionStatus,
    BudgetLimit,
    BudgetUsage,
    ExplorationBrief,
    ExplorationStopReason,
    ExplorationUsage,
)
from tianwen.gateway import (
    ActionApprovalRequired,
    ActionGatewayCapability,
    ActionReservation,
    EffectClass,
    PolicyDecision,
    decide_action,
    execute_action,
    freeze_action,
)
from tianwen.store import BudgetExceeded, StateConflict, StateStore


def make_store(tmp_path: Path) -> StateStore:
    tmp_path.mkdir(parents=True, exist_ok=True)
    store = StateStore(tmp_path / "state.db")
    store.initialize()
    return store


def make_brief() -> ExplorationBrief:
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
        max_searches=1,
        max_fetches=1,
        max_tokens=1,
        max_cost_microunits=1,
        wall_seconds=60,
        expected_outputs=("answer",),
        sufficiency_criteria=("evidence",),
        stop_conditions=(ExplorationStopReason.SUFFICIENT,),
    )


def test_policy_has_only_four_model_independent_decisions() -> None:
    assert decide_action(EffectClass.READ_ONLY, True) is PolicyDecision.ALLOW
    assert (
        decide_action(EffectClass.REVERSIBLE_WORKSPACE_WRITE, True)
        is PolicyDecision.NOTIFY
    )
    assert (
        decide_action(EffectClass.EXTERNAL_READ_ONLY, True) is PolicyDecision.NOTIFY
    )
    assert (
        decide_action(EffectClass.EXTERNAL_OR_IRREVERSIBLE, True) is PolicyDecision.ASK
    )
    assert decide_action(EffectClass.FORBIDDEN, True) is PolicyDecision.DENY
    assert decide_action(EffectClass.READ_ONLY, False) is PolicyDecision.DENY


def test_frozen_action_changes_identity_when_args_change(tmp_path: Path) -> None:
    store = make_store(tmp_path)
    first = freeze_action(
        store=store,
        run_id="run",
        tool_call_id="call",
        tool_name="write_file",
        args={"path": "a.txt", "content": "a"},
        effect_class=EffectClass.REVERSIBLE_WORKSPACE_WRITE,
    )

    assert first.status is ActionStatus.PROPOSED
    assert first.args_json == '{"content":"a","path":"a.txt"}'
    with pytest.raises(StateConflict):
        freeze_action(
            store=store,
            run_id="run",
            tool_call_id="call",
            tool_name="write_file",
            args={"path": "a.txt", "content": "different"},
            effect_class=EffectClass.REVERSIBLE_WORKSPACE_WRITE,
        )


@pytest.mark.anyio
async def test_direct_execution_persists_single_shared_lifecycle(tmp_path: Path) -> None:
    store = make_store(tmp_path)

    async def fetch(args: dict[str, Any]) -> dict[str, str]:
        action = freeze_action(
            store,
            "run",
            "call",
            "fetch",
            args,
            EffectClass.READ_ONLY,
        )
        assert action.status is ActionStatus.RUNNING
        return {"seen": args["url"]}

    action, result = await execute_action(
        store=store,
        run_id="run",
        tool_call_id="call",
        tool_name="fetch",
        args={"url": "https://example.test"},
        effect_class=EffectClass.READ_ONLY,
        authorized=True,
        handler=fetch,
    )

    assert result == {"seen": "https://example.test"}
    assert action.status is ActionStatus.SUCCEEDED
    persisted = store.get_action(action.action_id)
    assert persisted.status is ActionStatus.SUCCEEDED
    assert persisted.result_digest == "sha256:fb4d0bab6e90995e4a7d54c5bff1f1d32edfb782c758e78dfc9e6001a867087d"


@pytest.mark.anyio
async def test_direct_ask_persists_waiting_for_approval_before_raising(tmp_path: Path) -> None:
    store = make_store(tmp_path)

    with pytest.raises(ActionApprovalRequired) as raised:
        await execute_action(
            store, "run", "call", "publish", {}, EffectClass.EXTERNAL_OR_IRREVERSIBLE,
            True, lambda args: _return(args),
        )

    assert store.get_action(raised.value.action_id).status is ActionStatus.WAITING_APPROVAL
    with pytest.raises(ActionApprovalRequired):
        await execute_action(
            store, "run", "call", "publish", {}, EffectClass.EXTERNAL_OR_IRREVERSIBLE,
            True, lambda args: _return(args),
        )


@pytest.mark.anyio
async def test_cancelled_direct_action_becomes_unknown(tmp_path: Path) -> None:
    store = make_store(tmp_path)

    with pytest.raises(asyncio.CancelledError):
        await execute_action(
            store, "run", "call", "fetch", {}, EffectClass.READ_ONLY,
            True, _cancel,
        )

    action = freeze_action(store, "run", "call", "fetch", {}, EffectClass.READ_ONLY)
    assert action.status is ActionStatus.UNKNOWN


@pytest.mark.anyio
async def test_reservation_is_atomic_and_exact_replay_charges_once(tmp_path: Path) -> None:
    store = make_store(tmp_path)
    store.create_budget("loop", None, BudgetLimit(model_requests=0, tool_calls=1, tokens=0))
    store.create_exploration(make_brief())
    too_large = ActionReservation(
        loop_id="loop",
        budget_delta=BudgetUsage(tool_calls=1),
        brief_id="brief",
        exploration_delta=ExplorationUsage(searches=2),
    )

    with pytest.raises(BudgetExceeded):
        await execute_action(
            store, "run", "too-large", "search", {"q": "one"}, EffectClass.READ_ONLY,
            True, lambda args: _return(args), too_large,
        )
    assert store.count_actions("run", "search") == 0
    assert store.charge_budget("loop", BudgetUsage(tool_calls=1)).tool_calls == 1
    assert store.get_exploration_usage("brief") == ExplorationUsage()

    # A fresh store keeps the successful replay check independent of the probe charge above.
    store = make_store(tmp_path / "success")
    store.create_budget("loop", None, BudgetLimit(model_requests=0, tool_calls=1, tokens=0))
    store.create_exploration(make_brief())
    reservation = ActionReservation(
        loop_id="loop",
        budget_delta=BudgetUsage(tool_calls=1),
        brief_id="brief",
        exploration_delta=ExplorationUsage(searches=1),
    )
    first, _ = await execute_action(
        store, "run", "exact", "search", {"q": "one"}, EffectClass.READ_ONLY,
        True, lambda args: _return(args), reservation,
    )
    replay, _ = await execute_action(
        store, "run", "exact", "search", {"q": "one"}, EffectClass.READ_ONLY,
        True, lambda args: _return(args), reservation,
    )

    assert (first.status, replay.status) == (ActionStatus.SUCCEEDED, ActionStatus.SUCCEEDED)
    assert store.get_exploration_usage("brief") == ExplorationUsage(searches=1)
    with pytest.raises(BudgetExceeded):
        store.charge_budget("loop", BudgetUsage(tool_calls=1))


class _GatewayModel(TestModel):
    def gen_tool_args(self, tool_def: ToolDefinition) -> dict[str, Any]:
        if tool_def.name == "touch":
            return {"label": "alpha"}
        return super().gen_tool_args(tool_def)


@pytest.mark.anyio
async def test_capability_denies_before_handler_and_defers_ask(tmp_path: Path) -> None:
    store = make_store(tmp_path)
    effects: list[str] = []
    denied = ActionGatewayCapability(
        store=store,
        tianwen_run_id="deny-run",
        classify=lambda _name, _args: EffectClass.FORBIDDEN,
        authorized=lambda _name, _args: True,
    )
    deny_agent = Agent(
        _GatewayModel(call_tools=["touch"], custom_output_text="done"),
        capabilities=[denied],
    )

    @deny_agent.tool_plain(name="touch")
    def denied_touch(label: str) -> str:
        effects.append(label)
        return label

    await deny_agent.run("touch")
    assert effects == []
    assert store.count_actions("deny-run", "touch") == 1

    asked = ActionGatewayCapability(
        store=store,
        tianwen_run_id="ask-run",
        classify=lambda _name, _args: EffectClass.EXTERNAL_OR_IRREVERSIBLE,
        authorized=lambda _name, _args: True,
    )
    ask_agent: Agent[object, str | DeferredToolRequests] = Agent(
        _GatewayModel(call_tools=["touch"], custom_output_text="done"),
        output_type=[str, DeferredToolRequests],
        capabilities=[asked],
    )

    @ask_agent.tool_plain(name="touch")
    def asked_touch(label: str) -> str:
        effects.append(label)
        return label

    result = await ask_agent.run("touch")
    assert isinstance(result.output, DeferredToolRequests)
    assert effects == []
    request = result.output.approvals[0]
    action_id = result.output.metadata[request.tool_call_id]["action_id"]
    assert store.get_action(action_id).status is ActionStatus.WAITING_APPROVAL

    resumed = await ask_agent.run(
        message_history=result.all_messages(),
        deferred_tool_results=DeferredToolResults(
            approvals={request.tool_call_id: True}
        ),
    )
    assert resumed.output == "done"
    assert effects == ["alpha"]
    assert store.get_action(action_id).status is ActionStatus.SUCCEEDED


async def _return(value: Any) -> Any:
    return value


async def _cancel(_: dict[str, Any]) -> None:
    raise asyncio.CancelledError
