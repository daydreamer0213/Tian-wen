import asyncio
import sqlite3
from contextlib import closing
from dataclasses import dataclass, field
from importlib.metadata import version
from pathlib import Path
from typing import Any

import pytest
from pydantic_ai import (
    Agent,
    ApprovalRequired,
    DeferredToolRequests,
    DeferredToolResults,
    ModelMessagesTypeAdapter,
    RunContext,
    SkipToolExecution,
)
from pydantic_ai.capabilities import (
    AbstractCapability,
    WrapToolExecuteHandler,
)
from pydantic_ai.messages import ToolCallPart, ToolReturnPart
from pydantic_ai.models.test import TestModel
from pydantic_ai.tools import ToolDefinition
from pydantic_ai_harness.step_persistence import (
    InMemoryStepStore,
    SqliteStepStore,
    StepPersistence,
    continue_run,
)


class _TouchModel(TestModel):
    def gen_tool_args(self, tool_def: ToolDefinition) -> dict[str, Any]:
        if tool_def.name == "touch":
            return {"label": "alpha"}
        return super().gen_tool_args(tool_def)


@dataclass
class _ApprovalProbe(AbstractCapability[object]):
    observed: list[tuple[str, bool, dict[str, Any]]] = field(default_factory=list)

    async def before_tool_execute(
        self,
        ctx: RunContext[object],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        del tool_def
        self.observed.append(
            (call.tool_call_id, ctx.tool_call_approved, dict(args))
        )
        if not ctx.tool_call_approved:
            raise ApprovalRequired(
                metadata={"action_id": f"action::{call.tool_call_id}"}
            )
        return args


@dataclass
class _DenyProbe(AbstractCapability[object]):
    denied_call_ids: list[str] = field(default_factory=list)

    async def before_tool_execute(
        self,
        ctx: RunContext[object],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        del ctx, tool_def, args
        self.denied_call_ids.append(call.tool_call_id)
        raise SkipToolExecution(
            {"status": "denied", "reason": "policy"}
        )


@dataclass
class _InterruptAfterEffect(AbstractCapability[object]):
    async def wrap_tool_execute(
        self,
        ctx: RunContext[object],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
        handler: WrapToolExecuteHandler,
    ) -> Any:
        del ctx, call, tool_def
        await handler(args)
        raise asyncio.CancelledError("worker lost after effect")


def test_exact_dependency_versions() -> None:
    assert version("pydantic-ai-slim") == "2.18.0"
    assert version("pydantic-ai-harness") == "0.13.0"


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_approval_pauses_before_effect_and_resumes_from_serialized_checkpoint() -> None:
    effects: list[str] = []
    store = InMemoryStepStore()
    gateway = _ApprovalProbe()
    agent: Agent[object, str | DeferredToolRequests] = Agent(
        _TouchModel(call_tools=["touch"], custom_output_text="done"),
        output_type=[str, DeferredToolRequests],
        capabilities=[gateway, StepPersistence(store=store, agent_name="probe")],
    )

    @agent.tool_plain
    def touch(label: str) -> str:
        effects.append(label)
        return f"touched {label}"

    first = await agent.run("touch alpha", conversation_id="tw-run-1")

    assert isinstance(first.output, DeferredToolRequests)
    assert effects == []
    request = first.output.approvals[0]
    assert request.args_as_dict() == {"label": "alpha"}
    assert first.output.metadata[request.tool_call_id] == {
        "action_id": f"action::{request.tool_call_id}"
    }

    first_record = (await store.list_runs(conversation_id="tw-run-1"))[0]
    assert await store.list_unresolved_tool_effects(run_id=first_record.run_id) == []
    assert await store.list_snapshots(
        run_id=first_record.run_id,
        include_interrupted=True,
    ) == []

    checkpoint_json = first.all_messages_json()
    restored_history = ModelMessagesTypeAdapter.validate_json(checkpoint_json)
    second = await agent.run(
        message_history=restored_history,
        deferred_tool_results=DeferredToolResults(
            approvals={request.tool_call_id: True}
        ),
        conversation_id="tw-run-1",
    )

    assert second.output == "done"
    assert effects == ["alpha"]
    records = await store.list_runs(conversation_id="tw-run-1")
    assert len(records) == 2
    assert records[0].run_id != records[1].run_id
    effect = await store.get_tool_effect(
        run_id=records[1].run_id,
        tool_call_id=request.tool_call_id,
    )
    assert effect is not None
    assert effect.status == "completed"
    assert gateway.observed == [
        (request.tool_call_id, False, {"label": "alpha"}),
        (request.tool_call_id, True, {"label": "alpha"}),
    ]


@pytest.mark.anyio
async def test_denial_returns_structured_result_without_starting_effect() -> None:
    effects: list[str] = []
    store = InMemoryStepStore()
    gateway = _DenyProbe()
    agent = Agent(
        TestModel(call_tools=["touch"], custom_output_text="done"),
        capabilities=[
            gateway,
            StepPersistence(store=store, run_id="deny-run"),
        ],
    )

    @agent.tool_plain
    def touch() -> str:
        effects.append("touched")
        return "ok"

    result = await agent.run("touch")
    returns = [
        part
        for message in result.all_messages()
        for part in message.parts
        if isinstance(part, ToolReturnPart)
    ]

    assert effects == []
    assert returns[-1].content == {
        "status": "denied",
        "reason": "policy",
    }
    assert await store.list_unresolved_tool_effects(run_id="deny-run") == []
    events = await store.list_events(run_id="deny-run")
    assert "tool_call_started" not in [event.kind for event in events]


@pytest.mark.anyio
async def test_crash_after_effect_leaves_unresolved_started_record() -> None:
    effects: list[str] = []
    store = InMemoryStepStore()
    agent = Agent(
        TestModel(call_tools=["touch"]),
        capabilities=[
            StepPersistence(store=store, run_id="crash-after-effect"),
            _InterruptAfterEffect(),
        ],
    )

    @agent.tool_plain
    def touch() -> str:
        effects.append("touched")
        return "ok"

    with pytest.raises(asyncio.CancelledError, match="worker lost after effect"):
        await agent.run("touch")

    assert effects == ["touched"]
    unresolved = await store.list_unresolved_tool_effects(
        run_id="crash-after-effect"
    )
    assert len(unresolved) == 1
    assert unresolved[0].status == "started"
    events = await store.list_events(run_id="crash-after-effect")
    assert [event.kind for event in events][-2:] == [
        "tool_call_started",
        "run_failed",
    ]


@pytest.mark.anyio
async def test_step_persistence_reloads_a_closed_tool_cycle() -> None:
    store = InMemoryStepStore()
    agent = Agent(
        TestModel(call_tools=["touch"], custom_output_text="done"),
        capabilities=[StepPersistence(store=store, run_id="closed-run")],
    )

    @agent.tool_plain
    def touch() -> str:
        return "ok"

    await agent.run("touch", conversation_id="closed-conversation")
    history = await continue_run(store, run_id="closed-run")
    returns = [
        part
        for message in history
        for part in message.parts
        if isinstance(part, ToolReturnPart)
    ]

    assert returns[-1].content == "ok"
    resumed = await Agent(
        TestModel(custom_output_text="resumed", call_tools=[])
    ).run("next", message_history=history)
    assert resumed.output == "resumed"
    assert resumed.conversation_id == "closed-conversation"


@pytest.mark.anyio
async def test_sqlite_store_coexists_with_tianwen_owned_tables(
    tmp_path: Path,
) -> None:
    database = tmp_path / "state.db"
    with closing(sqlite3.connect(database)) as connection:
        connection.execute(
            "CREATE TABLE tw_contract_marker (id TEXT PRIMARY KEY)"
        )
        connection.execute(
            "INSERT INTO tw_contract_marker (id) VALUES ('kept')"
        )
        connection.commit()

    store = SqliteStepStore(
        database=database,
        max_snapshots_per_run=3,
    )
    agent = Agent(
        TestModel(custom_output_text="done", call_tools=[]),
        capabilities=[StepPersistence(store=store, run_id="sqlite-probe")],
    )
    result = await agent.run("go")

    assert result.output == "done"
    assert await store.get_run(run_id="sqlite-probe") is not None
    with closing(sqlite3.connect(database)) as connection:
        marker = connection.execute(
            "SELECT id FROM tw_contract_marker"
        ).fetchone()
    assert marker == ("kept",)
