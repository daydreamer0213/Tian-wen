from dataclasses import dataclass, field
from importlib.metadata import version
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
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart, ToolReturnPart
from pydantic_ai.models.test import TestModel
from pydantic_ai.tools import ToolDefinition
from pydantic_ai_harness.step_persistence import InMemoryStepStore, StepPersistence


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
