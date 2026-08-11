from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest
from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import (
    LoadCapabilityReturnPart,
    ToolCallPart,
)
from pydantic_ai.models.test import TestModel
from pydantic_ai.tools import ToolDefinition
from pydantic_ai_harness import (
    FileSystem,
    GuardrailResult,
    InputGuardrail,
    OutputGuardrail,
    Shell,
)
from pydantic_ai_harness.skills import Skills

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class _LoadSkillModel(TestModel):
    def gen_tool_args(self, tool_def: ToolDefinition) -> dict[str, str]:
        if tool_def.name == "load_capability":
            return {"id": "alpha"}
        return super().gen_tool_args(tool_def)


class _WriteFileModel(TestModel):
    def gen_tool_args(self, tool_def: ToolDefinition) -> dict[str, Any]:
        if tool_def.name == "write_file":
            return {"path": "inside.txt", "content": "inside"}
        return super().gen_tool_args(tool_def)


@dataclass
class _ToolRecorder(AbstractCapability[object]):
    names: list[str] = field(default_factory=list)

    async def before_tool_execute(
        self,
        ctx: RunContext[object],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        del ctx, call
        self.names.append(tool_def.name)
        return args


def _shell_commands() -> tuple[str, str, str, str, str]:
    if os.name == "nt":
        return (
            "cmd",
            'cmd /d /c "echo out & echo err 1>&2 & exit /b 7"',
            (
                'cmd /d /c "if defined OPENAI_CONTRACT_SECRET '
                '(echo PRESENT) else (echo ABSENT)"'
            ),
            'cmd /d /c "echo nope > file.txt"',
            'powershell -NoProfile -Command "Write-Output nope"',
        )
    return (
        "sh",
        "sh -c 'printf \"out\\n\"; printf \"err\\n\" >&2; exit 7'",
        (
            "sh -c 'if [ -n \"${OPENAI_CONTRACT_SECRET+x}\" ]; "
            "then echo PRESENT; else echo ABSENT; fi'"
        ),
        "sh -c 'echo nope > file.txt'",
        "python -c 'print(1)'",
    )


async def test_filesystem_enforces_root_and_protected_paths(
    tmp_path: Path,
) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    (tmp_path / "outside.txt").write_text("outside", encoding="utf-8")
    recorder = _ToolRecorder()
    agent = Agent(
        _WriteFileModel(
            call_tools=["write_file"],
            custom_output_text="done",
        ),
        capabilities=[recorder, FileSystem(root_dir=root)],
    )
    run_result = await agent.run("write inside.txt")
    toolset = FileSystem(root_dir=root).get_toolset()

    assert run_result.output == "done"
    assert (root / "inside.txt").read_text(encoding="utf-8") == "inside"
    assert recorder.names == ["write_file"]
    with pytest.raises(ModelRetry, match="protected"):
        await toolset.write_file(".env", "SECRET=x")
    with pytest.raises(ModelRetry, match="resolves outside"):
        await toolset.read_file("../outside.txt")


async def test_shell_enforces_command_operator_env_and_exit_contracts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    executable, failing, inspect_env, redirect, other = _shell_commands()
    monkeypatch.setenv("OPENAI_CONTRACT_SECRET", "hidden")
    toolset = Shell(
        cwd=tmp_path,
        allowed_commands=[executable],
        denied_commands=[],
        denied_env_patterns=["OPENAI_*"],
        default_timeout=5,
    ).get_toolset()

    result = await toolset.run_command(failing)
    env_result = await toolset.run_command(inspect_env)

    assert "[stdout]" in result
    assert "[stderr]" in result
    assert "[exit code: 7]" in result
    assert "ABSENT" in env_result
    assert "hidden" not in env_result

    restrictive = Shell(
        cwd=tmp_path,
        allowed_commands=[executable],
        denied_commands=[],
        denied_operators=[">"],
    ).get_toolset()
    with pytest.raises(ModelRetry, match="operator"):
        await restrictive.run_command(redirect)
    with pytest.raises(ModelRetry, match="not in the allowed list"):
        await restrictive.run_command(other)


async def test_skills_freeze_selected_markdown_at_construction(
    tmp_path: Path,
) -> None:
    library = tmp_path / "skills"
    skill = library / "alpha"
    references = skill / "references"
    references.mkdir(parents=True)
    skill_file = skill / "SKILL.md"
    skill_file.write_text(
        "---\ndescription: Alpha.\n---\n\nORIGINAL\n",
        encoding="utf-8",
    )
    (references / "secret.md").write_text(
        "BUNDLED",
        encoding="utf-8",
    )
    skills = Skills(library, include=["alpha"])
    skill_file.write_text(
        "---\ndescription: Alpha.\n---\n\nMUTATED\n",
        encoding="utf-8",
    )

    leaves: list[object] = []
    skills.apply(leaves.append)
    assert [leaf.id for leaf in leaves] == ["alpha"]

    agent = Agent(
        _LoadSkillModel(call_tools=["load_capability"]),
        capabilities=[skills],
    )
    result = await agent.run("load alpha")
    returns = [
        part
        for message in result.all_messages()
        for part in message.parts
        if isinstance(part, LoadCapabilityReturnPart)
    ]
    loaded = returns[-1].content["instructions"]

    assert "ORIGINAL" in loaded
    assert "MUTATED" not in loaded
    assert "BUNDLED" not in loaded


async def test_guardrails_only_filter_input_and_output() -> None:
    blocked_model = TestModel(
        custom_output_text="model was called",
        call_tools=[],
    )
    input_agent = Agent(
        blocked_model,
        capabilities=[
            InputGuardrail(
                guard=lambda prompt: GuardrailResult.block("blocked")
            )
        ],
    )
    blocked = await input_agent.run("secret")

    assert blocked.output == "blocked"
    assert blocked_model.last_model_request_parameters is None

    output_agent = Agent(
        TestModel(custom_output_text="raw", call_tools=[]),
        capabilities=[
            OutputGuardrail(
                guard=lambda output: GuardrailResult.replace("redacted")
            )
        ],
    )
    redacted = await output_agent.run("go")

    assert redacted.output == "redacted"
