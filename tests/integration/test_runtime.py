from __future__ import annotations

from importlib.metadata import version
from pathlib import Path
from typing import Any

import pytest
from pydantic_ai.models.test import TestModel
from pydantic_ai.tools import ToolDefinition
from pydantic_ai_harness.step_persistence import InMemoryStepStore

from tianwen.domain import ActionRecord, ActionStatus, RunManifest, RunRecord, RunStatus, content_digest
from tianwen.store import StateStore


class _WriteFileModel(TestModel):
    def gen_tool_args(self, tool_def: ToolDefinition) -> dict[str, Any]:
        if tool_def.name == "write_file":
            return {"path": "inside.txt", "content": "inside"}
        return super().gen_tool_args(tool_def)


class _ShellModel(TestModel):
    def gen_tool_args(self, tool_def: ToolDefinition) -> dict[str, Any]:
        if tool_def.name == "run_command":
            return {"command": "cmd /d /c echo once"}
        return super().gen_tool_args(tool_def)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _run(prompt: str) -> RunRecord:
    return RunRecord(
        run_id="run-1",
        task_id="task-1",
        status=RunStatus.QUEUED,
        manifest=RunManifest(
            workflow_version="1",
            schema_version="1",
            pydantic_ai_version=version("pydantic-ai-slim"),
            harness_version=version("pydantic-ai-harness"),
            model_id="test",
            prompt_digest=content_digest(prompt),
            skill_versions={"repo_task": "1"},
            skill_digests={"repo_task": content_digest(_skill_text())},
            policy_digest="policy-1",
            tool_contract_digest="tools-1",
            goal_contract_digest="goal-1",
            workspace_digest="workspace-1",
        ),
    )


def _skill_text() -> str:
    return (Path(__file__).parents[2] / "skills" / "repo_task" / "SKILL.md").read_text(encoding="utf-8")


def _runtime(tmp_path: Path, model: TestModel):
    from tianwen.runtime import RepoTaskRuntime, RuntimeConfig

    workspace = tmp_path / "repo"
    workspace.mkdir()
    store = StateStore(tmp_path / "state.db")
    store.initialize()
    return RepoTaskRuntime(
        store=store,
        harness_store=InMemoryStepStore(),
        model=model,
        config=RuntimeConfig(
            workspace=workspace,
            skill_dir=Path(__file__).parents[2] / "skills",
            allowed_commands=("cmd",),
        ),
    )


@pytest.mark.anyio
async def test_run_writes_inside_workspace_through_gateway_and_records_tool_result(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path, _WriteFileModel(call_tools=["write_file"], custom_output_text="done"))
    run = _run("write inside.txt")
    runtime.store.put_object("run", run.run_id, run.task_id, run.status.value, run)

    outcome = await runtime.run(run, "write inside.txt")

    assert outcome.output == "done"
    assert (tmp_path / "repo" / "inside.txt").read_text(encoding="utf-8") == "inside"
    assert runtime.store.unresolved_actions(run.run_id) == []
    records = await runtime.harness_store.list_runs(conversation_id=run.run_id)
    events = await runtime.harness_store.list_events(run_id=records[0].run_id)
    assert "tool_call_completed" in [event.kind for event in events]


@pytest.mark.anyio
async def test_approval_checkpoint_replays_exactly_the_frozen_action_once(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path, _ShellModel(call_tools=["run_command"], custom_output_text="done"))
    run = _run("run the command")
    runtime.store.put_object("run", run.run_id, run.task_id, run.status.value, run)

    paused = await runtime.run(run, "run the command")
    checkpoint = runtime.store.latest_checkpoint(run.run_id)

    assert paused.output is None
    assert len(paused.waiting_action_ids) == 1
    assert checkpoint is not None
    assert checkpoint.state["messages_json"]
    resumed = await runtime.resume_approval(run, checkpoint.checkpoint_id, {paused.waiting_action_ids[0]: True})

    assert resumed.output == "done"
    assert runtime.store.get_action(paused.waiting_action_ids[0]).status is ActionStatus.SUCCEEDED
    assert runtime.store.count_actions(run.run_id, "run_command") == 1


@pytest.mark.anyio
async def test_recover_marks_started_action_unknown_without_replaying_the_effect(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path, TestModel(custom_output_text="done", call_tools=[]))
    run = _run("recovery")
    runtime.store.put_object("run", run.run_id, run.task_id, run.status.value, run)
    runtime.store.prepare_action(
        ActionRecord(
            action_id="action-1",
            run_id=run.run_id,
            tool_call_id="call-1",
            tool_name="run_command",
            args_json='{"command":"cmd /d /c echo once"}',
            args_digest=content_digest('{"command":"cmd /d /c echo once"}'),
            effect_class="external_or_irreversible",
            idempotency_key="effect-1",
            status=ActionStatus.RUNNING,
        )
    )
    effects = ["once"]

    recovered = await runtime.recover(run)

    assert effects == ["once"]
    assert recovered.waiting_action_ids == ("action-1",)
    assert runtime.store.get_action("action-1").status is ActionStatus.UNKNOWN
    assert "action_unknown_after_recovery" in [event.kind for event in runtime.store.list_events(run.run_id)]
