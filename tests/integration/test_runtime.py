from __future__ import annotations

import sqlite3
from importlib.metadata import version
from pathlib import Path
from typing import Any

import pytest
from pydantic_ai import Agent
from pydantic_ai.models.test import TestModel
from pydantic_ai.tools import ToolDefinition
from pydantic_ai_harness.step_persistence import InMemoryStepStore

from tianwen.domain import ActionRecord, ActionStatus, RunManifest, RunRecord, RunStatus, content_digest
from tianwen.gateway import ActionGatewayCapability, EffectClass, freeze_action
from tianwen.store import StateConflict, StateStore


class _WriteFileModel(TestModel):
    def gen_tool_args(self, tool_def: ToolDefinition) -> dict[str, Any]:
        if tool_def.name == "write_file":
            return {"path": "inside.txt", "content": "inside"}
        return super().gen_tool_args(tool_def)


class _ShellModel(TestModel):
    def __init__(self, command: str) -> None:
        super().__init__(call_tools=["run_command"], custom_output_text="done")
        self.command = command

    def gen_tool_args(self, tool_def: ToolDefinition) -> dict[str, Any]:
        if tool_def.name == "run_command":
            return {"command": self.command}
        return super().gen_tool_args(tool_def)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _run(prompt: str, runtime: Any, *, model_id: str = "test", **manifest_updates: str) -> RunRecord:
    from tianwen.runtime import runtime_manifest_digests

    digests = runtime_manifest_digests(runtime.config)
    manifest = RunManifest(
        workflow_version="1",
        schema_version="1",
        pydantic_ai_version=version("pydantic-ai-slim"),
        harness_version=version("pydantic-ai-harness"),
        model_id=model_id,
        prompt_digest=content_digest(prompt),
        skill_versions={"repo_task": "1"},
        skill_digests={"repo_task": content_digest(_skill_text())},
        policy_digest=digests["policy_digest"],
        tool_contract_digest=digests["tool_contract_digest"],
        goal_contract_digest="goal-owned-by-task-9",
        workspace_digest=digests["workspace_digest"],
    ).model_copy(update=manifest_updates)
    return RunRecord(
        run_id="run-1",
        task_id="task-1",
        status=RunStatus.QUEUED,
        manifest=manifest,
    )


def _skill_text() -> str:
    return (Path(__file__).parents[2] / "skills" / "repo_task" / "SKILL.md").read_text(encoding="utf-8")


def _runtime(tmp_path: Path, model: Any, allowed_commands: tuple[str, ...] = ("python",)) -> Any:
    from tianwen.runtime import RepoTaskRuntime, RuntimeConfig

    workspace = tmp_path / "repo"
    workspace.mkdir(parents=True)
    store = StateStore(tmp_path / "state.db")
    store.initialize()
    return RepoTaskRuntime(
        store=store,
        harness_store=InMemoryStepStore(),
        model=model,
        config=RuntimeConfig(
            workspace=workspace,
            skill_dir=Path(__file__).parents[2] / "skills",
            allowed_commands=allowed_commands,
        ),
    )


def _persist_run(runtime: Any, run: RunRecord) -> None:
    runtime.store.put_object("run", run.run_id, run.task_id, run.status.value, run)


def _actions(runtime: Any, run_id: str) -> list[ActionRecord]:
    with sqlite3.connect(runtime.store.database) as connection:
        rows = connection.execute("SELECT body_json FROM tw_actions WHERE run_id = ?", (run_id,)).fetchall()
    return [ActionRecord.model_validate_json(row[0]) for row in rows]


@pytest.mark.anyio
async def test_run_writes_inside_workspace_through_gateway_and_records_tool_result(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path, _WriteFileModel(call_tools=["write_file"], custom_output_text="done"))
    run = _run("write inside.txt", runtime)
    _persist_run(runtime, run)

    outcome = await runtime.run(run, "write inside.txt")

    records = await runtime.harness_store.list_runs(conversation_id=run.run_id)
    events = await runtime.harness_store.list_events(run_id=records[0].run_id)
    tool_call_id = next(event.tool_call_id for event in events if event.kind == "tool_call_completed")
    assert tool_call_id is not None
    with sqlite3.connect(runtime.store.database) as connection:
        row = connection.execute(
            "SELECT body_json FROM tw_actions WHERE run_id = ? AND tool_call_id = ?",
            (run.run_id, tool_call_id),
        ).fetchone()
    assert row is not None
    action = ActionRecord.model_validate_json(row[0])
    assert outcome.output == "done"
    assert (tmp_path / "repo" / "inside.txt").read_text(encoding="utf-8") == "inside"
    assert (action.tool_name, action.status) == ("write_file", ActionStatus.SUCCEEDED)
    assert action.result_digest is not None
    assert "tool_call_completed" in [event.kind for event in events]


@pytest.mark.anyio
async def test_manifest_rejects_policy_tool_contract_and_workspace_mismatches(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path, TestModel(custom_output_text="done", call_tools=[]))
    for field in ("policy_digest", "tool_contract_digest", "workspace_digest"):
        run = _run("go", runtime, **{field: "sha256:wrong"})

        with pytest.raises(StateConflict, match=field.removesuffix("_digest").replace("_", " ")):
            await runtime.run(run, "go")


@pytest.mark.anyio
async def test_string_known_model_name_validates_without_a_provider_request(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path, "test")
    run = _run("go", runtime, model_id="test")

    runtime._validate_manifest(run, "go")


@pytest.mark.anyio
async def test_resume_rejects_a_policy_change_after_the_approval_pause(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path, _ShellModel("python --version"))
    run = _run("run the command", runtime)
    _persist_run(runtime, run)
    paused = await runtime.run(run, "run the command")
    checkpoint = runtime.store.latest_checkpoint(run.run_id)
    changed = _runtime(tmp_path / "changed", _ShellModel("python --version"), ("cmd",))
    changed.store = runtime.store

    assert checkpoint is not None
    with pytest.raises(StateConflict, match="policy"):
        await changed.resume_approval(run, checkpoint.checkpoint_id, {paused.waiting_action_ids[0]: True})


@pytest.mark.anyio
async def test_gateway_denies_shell_escape_forms_before_the_shell_can_write_outside(tmp_path: Path) -> None:
    outside = tmp_path / "outside.txt"
    for command in (
        f'python -c "open(r\"{outside}\", \"w\").write(\"bad\")"',
        'python -c "open(\"/tmp/tianwen-outside.txt\", \"w\").write(\"bad\")"',
        'python -c "open(\"../outside.txt\", \"w\").write(\"bad\")"',
        'cmd /d /c type \\server\\share\\secret.txt',
    ):
        runtime = _runtime(tmp_path / str(abs(hash(command))), _ShellModel(command))
        run = _run("run", runtime)
        _persist_run(runtime, run)

        result = await runtime._agent(run).run("run", conversation_id=run.run_id)

        assert result.output == "done"
        assert [action.status for action in _actions(runtime, run.run_id)] == [ActionStatus.DENIED]
        assert not outside.exists()


@pytest.mark.anyio
async def test_gateway_denies_unknown_tools_before_their_handler_runs(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path, TestModel(call_tools=["unknown"], custom_output_text="done"))
    run = _run("unknown", runtime)
    _persist_run(runtime, run)
    effects: list[str] = []
    agent = Agent(
        runtime.model,
        capabilities=[
            ActionGatewayCapability(
                runtime.store,
                run.run_id,
                runtime._classify,
                runtime._authorized,
            )
        ],
    )

    @agent.tool_plain(name="unknown")
    def unknown() -> str:
        effects.append("called")
        return "unexpected"

    result = await agent.run("unknown", conversation_id=run.run_id)

    assert result.output == "done"
    assert effects == []
    assert [action.status for action in _actions(runtime, run.run_id)] == [ActionStatus.DENIED]


@pytest.mark.anyio
async def test_approval_checkpoint_replays_exactly_the_frozen_action_once(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path, _ShellModel("python --version"))
    run = _run("run the command", runtime)
    _persist_run(runtime, run)

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
async def test_false_approval_denies_the_frozen_action_without_running_it(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path, _ShellModel("python --version"))
    run = _run("run the command", runtime)
    _persist_run(runtime, run)
    paused = await runtime.run(run, "run the command")
    checkpoint = runtime.store.latest_checkpoint(run.run_id)

    assert checkpoint is not None
    resumed = await runtime.resume_approval(run, checkpoint.checkpoint_id, {paused.waiting_action_ids[0]: False})

    assert resumed.output == "done"
    assert runtime.store.get_action(paused.waiting_action_ids[0]).status is ActionStatus.DENIED
    assert runtime.store.unresolved_actions(run.run_id) == []
    audit = [event for event in runtime.store.list_events(run.run_id) if event.kind == "action_denied_by_approval"]
    assert audit[-1].payload == {"action_id": paused.waiting_action_ids[0]}


@pytest.mark.anyio
async def test_recover_marks_started_action_unknown_without_replaying_the_effect(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path, TestModel(custom_output_text="done", call_tools=[]))
    run = _run("recovery", runtime)
    _persist_run(runtime, run)
    effects: list[str] = []

    async def effect(_: dict[str, Any]) -> str:
        effects.append("once")
        return "effect"

    class ReplayProbe:
        async def run(self, **_: Any) -> None:
            await effect({"command": 'python -c "print(1)"'})

    action = freeze_action(
        runtime.store,
        run.run_id,
        "call-1",
        "run_command",
        {"command": 'python -c "print(1)"'},
        EffectClass.EXTERNAL_OR_IRREVERSIBLE,
    )
    assert action.action_id != ""
    runtime.store.transition_action(action.action_id, {ActionStatus.PROPOSED}, ActionStatus.RUNNING)
    await effect({"command": 'python -c "print(1)"'})
    runtime._agent = lambda _: ReplayProbe()  # type: ignore[method-assign]

    recovered = await runtime.recover(run)

    assert effects == ["once"]
    assert recovered.waiting_action_ids == (action.action_id,)
    assert runtime.store.get_action(action.action_id).status is ActionStatus.UNKNOWN
    assert "action_unknown_after_recovery" in [event.kind for event in runtime.store.list_events(run.run_id)]
