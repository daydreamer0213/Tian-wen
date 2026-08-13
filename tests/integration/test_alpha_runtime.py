from __future__ import annotations

import json
from importlib.metadata import version
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError
from pydantic_ai.messages import LoadCapabilityReturnPart
from pydantic_ai.models.test import TestModel
from pydantic_ai.tools import ToolDefinition
from pydantic_ai_harness.step_persistence import InMemoryStepStore

from tianwen.alpha_tasks import freeze_task_bundle
from tianwen.alpha_workspace import AlphaTrialPaths
from tianwen.domain import (
    ActionStatus,
    BudgetLimit,
    GoalContract,
    LoopKind,
    LoopRecord,
    RunManifest,
    RunRecord,
    RunStatus,
    TaskKind,
    TaskRecord,
    content_digest,
)
from tianwen.gateway import EffectClass, freeze_action
from tianwen.store import StateStore


class _ToolModel(TestModel):
    def __init__(self, tool_name: str, args: dict[str, Any]) -> None:
        super().__init__(call_tools=[tool_name], custom_output_text="done")
        self.tool_name = tool_name
        self.args = args

    def gen_tool_args(self, tool_def: ToolDefinition) -> dict[str, Any]:
        if tool_def.name == self.tool_name:
            return self.args
        return super().gen_tool_args(tool_def)


class _CheckExecutor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.preflight_calls = 0
        self.reconciled: dict[str, dict[str, str]] = {}

    def preflight(self) -> None:
        self.preflight_calls += 1

    async def run(self, action_id: str, check_id: str) -> dict[str, str]:
        self.calls.append((action_id, check_id))
        return {"check_id": check_id, "summary": "ok"}

    async def reconcile(self, action_id: str) -> dict[str, str] | None:
        return self.reconciled.get(action_id)


class _LoadSkillModel(TestModel):
    def gen_tool_args(self, tool_def: ToolDefinition) -> dict[str, str]:
        if tool_def.name == "load_capability":
            return {"id": "repo-task"}
        return super().gen_tool_args(tool_def)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _skill_text() -> str:
    return (Path(__file__).parents[2] / "skills" / "repo-task" / "SKILL.md").read_text(encoding="utf-8")


def _manifest(**updates: Any) -> RunManifest:
    values: dict[str, Any] = {
        "workflow_version": "1",
        "schema_version": "1",
        "pydantic_ai_version": version("pydantic-ai-slim"),
        "harness_version": version("pydantic-ai-harness"),
        "model_id": "test:test",
        "prompt_digest": content_digest("round prompt"),
        "skill_versions": {"repo_task": "1"},
        "skill_digests": {"repo_task": content_digest(_skill_text())},
        "policy_digest": "policy",
        "tool_contract_digest": "tools",
        "goal_contract_digest": "goal-owned-by-task-1",
        "workspace_digest": "workspace",
    }
    values.update(updates)
    return RunManifest(**values)


def _bundle(tmp_path: Path) -> Any:
    task_dir = tmp_path / "A1"
    for relative, text in {
        "seed/module.py": "VALUE = 1\n",
        "instruction.md": "Change module.py",
        "checks/public.py": "print('ok')\n",
        "verifier/verify.py": "print('ok')\n",
        "reference/solution.patch": "",
    }.items():
        target = task_dir / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    lock = tmp_path / "image.lock"
    lock.write_text(
        json.dumps(
            {
                "schema_version": "tianwen.alpha_image.v1",
                "reference": "python:3.12",
                "immutable_reference": "python@sha256:manifest",
                "platform": "linux/amd64",
                "manifest_digest": "sha256:manifest",
                "platform_digest": "sha256:platform",
            }
        ),
        encoding="utf-8",
    )
    (task_dir / "task.json").write_text(
        json.dumps(
            {
                "schema_version": "tianwen.alpha_task.v1",
                "task_id": "A1",
                "task_version": "1.0.0",
                "title": "Alpha runtime",
                "rounds": [{"round_id": "round-1", "public_check_ids": ["public"]}],
                "public_acceptance": ["passes"],
                "named_checks": [
                    {
                        "check_id": "public",
                        "script": "public.py",
                        "argv": ["python", "-I", "/checks/public.py", "/workspace"],
                        "timeout_seconds": 15,
                        "output_limit_bytes": 1024,
                    }
                ],
                "final_verifier": {
                    "verifier_id": "final",
                    "argv": ["python", "-I", "/checks/verify.py", "/workspace"],
                    "timeout_seconds": 15,
                    "output_limit_bytes": 1024,
                },
                "limits": {
                    "max_seed_bytes": 4096,
                    "max_changed_files": 1,
                    "max_changed_bytes": 4096,
                    "max_trial_bytes": 4 * 1024 * 1024,
                    "min_free_bytes": 0,
                    "memory_bytes": 268435456,
                    "cpus": 1.0,
                    "pids": 64,
                    "tmpfs_bytes": 1048576,
                },
                "allowed_write_patterns": ["module.py"],
                "protected_patterns": [".git/**"],
            }
        ),
        encoding="utf-8",
    )
    return freeze_task_bundle(task_dir, lock)


@pytest.fixture
def alpha_runtime(tmp_path: Path) -> Any:
    from tianwen.alpha_runtime import AlphaRuntime, AlphaRuntimeConfig

    bundle = _bundle(tmp_path)
    workspace = tmp_path / "trial" / "workspace"
    workspace.mkdir(parents=True)
    (workspace / "module.py").write_text("VALUE = 1\n", encoding="utf-8")
    trial_dir = workspace.parent
    paths = AlphaTrialPaths(
        trial_id="trial-1",
        data_root=tmp_path,
        trial_dir=trial_dir,
        workspace=workspace,
        state=trial_dir / "state",
        logs=trial_dir / "logs",
        diff_patch=trial_dir / "diff.patch",
        trial_manifest_json=trial_dir / "trial-manifest.json",
        trial_result_json=trial_dir / "trial-result.json",
    )
    store = StateStore(tmp_path / "state.db")
    store.initialize()
    runtime = AlphaRuntime(
        store=store,
        harness_store=InMemoryStepStore(),
        model=TestModel(custom_output_text="done", call_tools=[]),
        config=AlphaRuntimeConfig(
            workspace=workspace,
            skill_dir=Path(__file__).parents[2] / "skills",
            bundle=bundle,
            paths=paths,
            round_id="round-1",
            trial_manifest_digest="sha256:manifest",
        ),
    )
    runtime.check_executor = _CheckExecutor()
    return runtime


def _prompt(run: RunRecord) -> str:
    del run
    return "round prompt"


@pytest.fixture
def alpha_run(alpha_runtime: Any) -> RunRecord:
    from tianwen.alpha_runtime import alpha_runtime_manifest_digests

    digests = alpha_runtime_manifest_digests(alpha_runtime.config)
    manifest = _manifest(
        schema_version="2",
        model_id="test:test",
        prompt_digest=content_digest("round prompt"),
        policy_digest=digests["policy_digest"],
        tool_contract_digest=digests["tool_contract_digest"],
        workspace_digest=digests["workspace_digest"],
        trial_id="trial-1",
        round_id="round-1",
        trial_manifest_digest="sha256:manifest",
    )
    run = RunRecord(run_id="run-alpha", task_id="task-alpha", status=RunStatus.QUEUED, manifest=manifest)
    goal = GoalContract(
        goal_id="goal-alpha",
        objective="alpha",
        success_criteria=("passes",),
        constraints=(),
        authorization=("workspace_read", "workspace_write", "isolated_check_execution"),
        budget=BudgetLimit(model_requests=10, tool_calls=20, tokens=10_000, action_effects=20),
    )
    loop = LoopRecord(
        loop_id="loop-alpha", goal_id=goal.goal_id, kind=LoopKind.USER, objective="alpha", budget=goal.budget
    )
    task = TaskRecord(
        task_id=run.task_id, loop_id=loop.loop_id, kind=TaskKind.EXECUTION, objective="alpha", acceptance=("passes",)
    )
    alpha_runtime.store.put_object("goal", goal.goal_id, None, "active", goal)
    alpha_runtime.store.put_object("loop", loop.loop_id, goal.goal_id, "active", loop)
    alpha_runtime.store.create_budget(loop.loop_id, None, loop.budget)
    alpha_runtime.store.put_object("task", task.task_id, loop.loop_id, "active", task)
    alpha_runtime.store.put_object("run", run.run_id, run.task_id, run.status.value, run)
    return run


def test_v2_run_manifest_requires_exact_alpha_bindings() -> None:
    with pytest.raises(ValidationError, match="trial|prompt"):
        _manifest(schema_version="2", prompt_digest="")

    manifest = _manifest(
        schema_version="2",
        prompt_digest=content_digest("round prompt"),
        trial_id="trial-1",
        round_id="round-1",
        trial_manifest_digest="sha256:manifest",
    )
    assert manifest.round_id == "round-1"


@pytest.mark.anyio
async def test_alpha_agent_exposes_files_and_named_check_but_no_shell(alpha_runtime: Any, alpha_run: RunRecord) -> None:
    agent = alpha_runtime._agent(alpha_run)
    await agent.run("inspect", conversation_id=alpha_run.run_id)
    parameters = alpha_runtime.model.last_model_request_parameters
    assert parameters is not None
    names = {tool.name for tool in parameters.function_tools}
    assert {
        "read_file",
        "write_file",
        "edit_file",
        "list_directory",
        "search_files",
        "find_files",
        "create_directory",
        "file_info",
        "run_check",
    } <= names
    assert not {
        "run_command",
        "start_command",
        "check_command",
        "stop_command",
        "duckduckgo_search",
        "web_fetch",
    }.intersection(names)
    assert "load_capability" in names


@pytest.mark.anyio
async def test_alpha_agent_loads_only_the_frozen_champion_skill(alpha_runtime: Any, alpha_run: RunRecord) -> None:
    alpha_runtime.model = _LoadSkillModel(call_tools=["load_capability"], custom_output_text="done")
    alpha_runtime._set_run_status(alpha_run, RunStatus.RUNNING)
    result = await alpha_runtime._agent(alpha_run).run("load repo-task", conversation_id=alpha_run.run_id)

    loaded = [
        part.content["instructions"]
        for message in result.all_messages()
        for part in message.parts
        if isinstance(part, LoadCapabilityReturnPart)
    ]
    assert result.output == "done"
    assert len(loaded) == 1
    expected = _skill_text().split("---\n", 2)[-1].strip()
    assert content_digest(loaded[0]) == content_digest("# Skill: repo-task\n\n" + expected)
    actions = alpha_runtime.store.list_actions(alpha_run.run_id)
    assert [(action.tool_name, action.status) for action in actions] == [("load_capability", ActionStatus.SUCCEEDED)]


@pytest.mark.anyio
async def test_recover_reconciles_unknown_named_check_without_rerunning(
    alpha_runtime: Any, alpha_run: RunRecord
) -> None:
    alpha_runtime._set_run_status(alpha_run, RunStatus.RUNNING)
    action = freeze_action(
        alpha_runtime.store,
        alpha_run.run_id,
        "call-1",
        "run_check",
        {"check_id": "public"},
        EffectClass.EXTERNAL_READ_ONLY,
    )
    alpha_runtime.store.transition_action(action.action_id, {ActionStatus.PROPOSED}, ActionStatus.RUNNING)
    alpha_runtime.check_executor.reconciled[action.action_id] = {"check_id": "public", "summary": "already ran"}
    alpha_runtime._save_initial_checkpoint(alpha_run, _prompt(alpha_run))

    recovered = await alpha_runtime.recover(alpha_run)

    assert recovered.output == "done"
    assert alpha_runtime.check_executor.calls == []
    assert alpha_runtime.store.get_action(action.action_id).status is ActionStatus.SUCCEEDED


@pytest.mark.anyio
async def test_unknown_check_is_denied_before_executor(alpha_runtime: Any, alpha_run: RunRecord) -> None:
    alpha_runtime.model = _ToolModel("run_check", {"check_id": "not-registered"})
    await alpha_runtime.run(alpha_run, _prompt(alpha_run))
    assert alpha_runtime.check_executor.calls == []
    assert alpha_runtime.store.list_actions(alpha_run.run_id)[0].status is ActionStatus.DENIED
    assert alpha_runtime.store.list_events(alpha_run.run_id)[-1].payload == {
        "tool_name": "run_check",
        "reason_code": "check_not_allowed",
    }


@pytest.mark.anyio
async def test_write_quota_is_checked_before_harness_writes(alpha_runtime: Any, alpha_run: RunRecord) -> None:
    alpha_runtime.model = _ToolModel("write_file", {"path": "module.py", "content": "x" * 600_000})
    await alpha_runtime.run(alpha_run, _prompt(alpha_run))
    assert (alpha_runtime.config.workspace / "module.py").read_text(encoding="utf-8") != "x" * 600_000
    assert alpha_runtime.store.list_actions(alpha_run.run_id)[0].status is ActionStatus.DENIED


@pytest.mark.anyio
async def test_v2_manifest_rejects_provider_identity_and_prompt_changes(
    alpha_runtime: Any, alpha_run: RunRecord
) -> None:
    changed_model = alpha_run.model_copy(
        update={"manifest": alpha_run.manifest.model_copy(update={"model_id": "other:test"})}
    )
    with pytest.raises(Exception, match="model"):
        await alpha_runtime.run(changed_model, _prompt(changed_model))
    with pytest.raises(Exception, match="prompt"):
        await alpha_runtime.run(alpha_run, "changed prompt")
