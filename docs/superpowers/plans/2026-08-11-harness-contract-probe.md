# Harness Public Contract Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用可重复的契约测试确认 PydanticAI 与 Harness 的公开接口能支撑天问首个持续学习切片，并把已知限制转化为明确的 Runtime 适配责任。

**Architecture:** 本计划只建立依赖锁、上游契约测试和核查报告，不实现天问生产 Runtime。测试通过 PydanticAI 公开能力钩子验证 Action Gateway，通过天问侧消息 JSON Checkpoint 验证待审批恢复，并分别核查 Harness 的持久化、FileSystem、Shell、Skills 与输入/输出 Guardrail。

**Tech Stack:** Python 3.11、uv 0.11.28、pydantic-ai-slim 2.18.0、pydantic-ai-harness 0.13.0、pytest 9.0.3、anyio 4.13.0、ruff 0.15.12、Python 标准库 SQLite。

## Global Constraints

- Runtime 使用 Python；本计划不创建天问生产 Runtime、数据库领域模型或 CLI。
- PydanticAI 负责模型、Provider、工具往返、流式事件和结构化输出；Harness 只提供可组合的通用 Agent 能力。
- 只依赖公开导入和公开方法；禁止导入名称以 `_` 开头的 Harness 或 PydanticAI 模块。
- 精确锁定 `pydantic-ai-slim==2.18.0` 与 `pydantic-ai-harness[skills]==0.13.0`；升级必须重新运行全部契约测试。
- 不调用真实模型，不读取模型密钥，不进行 Provider 网络请求；所有 Agent 测试使用 `TestModel`。
- Action Gateway 必须排在 `StepPersistence` 前面，使 `ask`/`deny` 在 Harness 写入 `tool_call_started` 前生效。
- 一个天问 Run 可以映射多个框架 `run_id`；框架调用以共同的 `conversation_id` 关联。
- 待审批消息由天问 Checkpoint 保存为 `all_messages_json()`，并用 `ModelMessagesTypeAdapter.validate_json(...)` 恢复。
- 天问只管理 `tw_*` 表；Harness 数据只能通过公开 `StepStore` 方法访问。
- Skills 的只读物化和版本选择属于天问；Harness `Skills` 只负责读取构造时快照。
- Harness Shell 规则不是操作系统安全边界；契约测试只证明配置行为。
- `.venv` 放在项目目录 `D:\Guo\zuochong\AGi`，uv 下载缓存固定到 `D:\DevData\uv-cache`，不新增 C 盘依赖缓存。
- 任一硬性契约失败时停止本计划，不修改上游包、不调用私有接口绕过，并将结论记为 `NO-GO`。

---

## File Structure

- Create: `.gitignore` — 排除项目虚拟环境和测试缓存。
- Create: `pyproject.toml` — 固定契约核查依赖和 pytest/ruff 配置。
- Create: `uv.lock` — 记录完整可重复依赖图，由 `uv lock` 生成。
- Create: `tests/contracts/test_runtime_and_gateway.py` — 版本、Action Gateway、审批恢复、`unknown` 与 SQLite 共存契约。
- Create: `tests/contracts/test_harness_capabilities.py` — FileSystem、Shell、Skills、InputGuardrail 与 OutputGuardrail 契约。
- Create: `docs/research/2026-08-11-harness-contract-audit.md` — 核查证据、限制和继续实施的条件。
- Modify: `docs/superpowers/specs/2026-08-11-pydanticai-harness-integration-design.md:447` — 写入已验证版本组合和核查报告链接。

### Task 1: Freeze the Contract Environment

**Files:**

- Create: `.gitignore`
- Create: `pyproject.toml`
- Create: `uv.lock`
- Create: `tests/contracts/test_runtime_and_gateway.py`

**Interfaces:**

- Consumes: Python 3.11 与 uv 0.11.28。
- Produces: 精确依赖组合，以及 `test_exact_dependency_versions()` 升级门禁。

- [ ] **Step 1: Create the ignore rules**

Create `.gitignore`:

```gitignore
.venv/
__pycache__/
*.py[cod]
.pytest_cache/
.ruff_cache/
.coverage
```

- [ ] **Step 2: Create the pinned project configuration**

Create `pyproject.toml`:

```toml
[project]
name = "tianwen"
version = "0.0.0"
description = "A continual-learning agent runtime."
requires-python = ">=3.11,<3.15"
dependencies = [
    "pydantic-ai-harness[skills]==0.13.0",
    "pydantic-ai-slim==2.18.0",
]

[dependency-groups]
dev = [
    "anyio==4.13.0",
    "pytest==9.0.3",
    "ruff==0.15.12",
]

[tool.pytest.ini_options]
addopts = "-ra"
testpaths = ["tests"]

[tool.ruff]
line-length = 120
target-version = "py311"

[tool.ruff.lint]
select = ["B", "E", "F", "I", "UP"]
```

- [ ] **Step 3: Write the dependency contract test**

Create `tests/contracts/test_runtime_and_gateway.py`:

```python
from importlib.metadata import version


def test_exact_dependency_versions() -> None:
    assert version("pydantic-ai-slim") == "2.18.0"
    assert version("pydantic-ai-harness") == "0.13.0"
```

- [ ] **Step 4: Resolve and install only into D-drive locations**

Run:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv lock
uv sync --all-groups
```

Expected: both commands exit `0`, `uv.lock` exists, and `.venv` is created under `D:\Guo\zuochong\AGi`.

- [ ] **Step 5: Verify the exact pair**

Run:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv run pytest tests/contracts/test_runtime_and_gateway.py::test_exact_dependency_versions -v
```

Expected: `1 passed`.

- [ ] **Step 6: Lint the first contract**

Run:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv run ruff check tests/contracts/test_runtime_and_gateway.py
```

Expected: `All checks passed!`

- [ ] **Step 7: Commit**

```powershell
git add .gitignore pyproject.toml uv.lock tests/contracts/test_runtime_and_gateway.py
git commit -m "chore: pin harness contract environment"
```

### Task 2: Prove Pre-effect Approval and Denial

**Files:**

- Modify: `tests/contracts/test_runtime_and_gateway.py`

**Interfaces:**

- Consumes: `AbstractCapability.before_tool_execute(...)`, `ApprovalRequired`, `SkipToolExecution`, `DeferredToolRequests`, `DeferredToolResults`, `AgentRunResult.all_messages_json()` and `ModelMessagesTypeAdapter.validate_json(...)`.
- Produces: 经验证的能力顺序 `[ActionGateway, StepPersistence]`，以及“同一待审批调用恢复后只执行一次”的接口证据。

- [ ] **Step 1: Add tests against not-yet-defined probe capabilities**

Replace the imports with:

```python
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
```

Keep `test_exact_dependency_versions()` and append:

```python
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
```

- [ ] **Step 2: Run the new tests to verify the probe seam is still missing**

Run:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv run pytest tests/contracts/test_runtime_and_gateway.py -v
```

Expected: FAIL with `NameError: name '_ApprovalProbe' is not defined`.

- [ ] **Step 3: Add the minimum test-only probe implementations**

Insert these definitions after the imports and before the tests:

```python
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
```

- [ ] **Step 4: Run the gateway contracts**

Run:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv run pytest tests/contracts/test_runtime_and_gateway.py -v
uv run ruff check tests/contracts/test_runtime_and_gateway.py
```

Expected: `3 passed` and `All checks passed!`

- [ ] **Step 5: Commit**

```powershell
git add tests/contracts/test_runtime_and_gateway.py
git commit -m "test: prove action gateway contract"
```

### Task 3: Prove Persistence, Unknown Effects, and SQLite Coexistence

**Files:**

- Modify: `tests/contracts/test_runtime_and_gateway.py`

**Interfaces:**

- Consumes: `StepPersistence`, `InMemoryStepStore.list_unresolved_tool_effects(...)` and `SqliteStepStore(database=...)`.
- Produces: “副作用后硬中断映射为 `unknown`”与“一个 SQLite 文件可同时保存 `tw_*` 和 Harness 状态”的证据。

- [ ] **Step 1: Add the persistence tests before defining the interrupt probe**

Replace the standard-library import block at the top with:

```python
import asyncio
import sqlite3
from contextlib import closing
from dataclasses import dataclass, field
from importlib.metadata import version
from pathlib import Path
from typing import Any
```

Replace the capability and StepPersistence imports with:

```python
from pydantic_ai.capabilities import (
    AbstractCapability,
    WrapToolExecuteHandler,
)
from pydantic_ai_harness.step_persistence import (
    InMemoryStepStore,
    SqliteStepStore,
    StepPersistence,
    continue_run,
)
```

Append:

```python
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
        capabilities=[
            StepPersistence(store=store, run_id="closed-run")
        ],
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
        capabilities=[
            StepPersistence(store=store, run_id="sqlite-probe")
        ],
    )
    result = await agent.run("go")

    assert result.output == "done"
    assert await store.get_run(run_id="sqlite-probe") is not None
    with closing(sqlite3.connect(database)) as connection:
        marker = connection.execute(
            "SELECT id FROM tw_contract_marker"
        ).fetchone()
    assert marker == ("kept",)
```

- [ ] **Step 2: Run the crash test to verify the interrupt probe is missing**

Run:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv run pytest tests/contracts/test_runtime_and_gateway.py::test_crash_after_effect_leaves_unresolved_started_record -v
```

Expected: FAIL with `NameError: name '_InterruptAfterEffect' is not defined`.

- [ ] **Step 3: Add the minimum interruption probe**

Insert after `_DenyProbe`:

```python
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
```

- [ ] **Step 4: Run the complete runtime contract module**

Run:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv run pytest tests/contracts/test_runtime_and_gateway.py -v
uv run ruff check tests/contracts/test_runtime_and_gateway.py
```

Expected: `6 passed` and `All checks passed!`

- [ ] **Step 5: Commit**

```powershell
git add tests/contracts/test_runtime_and_gateway.py
git commit -m "test: prove harness persistence boundaries"
```

### Task 4: Audit the Harness Capability Set

**Files:**

- Create: `tests/contracts/test_harness_capabilities.py`

**Interfaces:**

- Consumes: `FileSystem.get_toolset()`, `Shell.get_toolset()`, `Skills(...)`, `InputGuardrail(...)` and `OutputGuardrail(...)`.
- Produces: 首切片五类 Harness 能力的可执行兼容性门禁。

- [ ] **Step 1: Write the complete upstream capability contract module**

Create `tests/contracts/test_harness_capabilities.py`:

```python
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
    assert [getattr(leaf, "id") for leaf in leaves] == ["alpha"]

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
```

- [ ] **Step 2: Run the capability discovery gate**

Run:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv run pytest tests/contracts/test_harness_capabilities.py -v
```

Expected: `4 passed`. Any failure is a `NO-GO` signal for the affected capability; do not patch around it in this plan.

- [ ] **Step 3: Run all contract tests and lint**

Run:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv run pytest tests/contracts -v
uv run ruff check tests/contracts
```

Expected: `10 passed` and `All checks passed!`

- [ ] **Step 4: Commit**

```powershell
git add tests/contracts/test_harness_capabilities.py
git commit -m "test: audit harness capability contracts"
```

### Task 5: Record the Conditional Go Decision

**Files:**

- Create: `docs/research/2026-08-11-harness-contract-audit.md`
- Modify: `docs/superpowers/specs/2026-08-11-pydanticai-harness-integration-design.md:447`

**Interfaces:**

- Consumes: exact output `10 passed` from Task 4.
- Produces: `GO（有条件）` 决策，以及下一份持续学习垂直切片实施计划的固定前提。

- [ ] **Step 1: Re-run the release gate before writing a positive report**

Run:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv sync --frozen --all-groups
uv run pytest tests/contracts -q
uv run ruff check tests/contracts
```

Expected: `10 passed` and `All checks passed!` If either command fails, stop and report `NO-GO`; do not perform the remaining steps.

- [ ] **Step 2: Write the audit report**

Create `docs/research/2026-08-11-harness-contract-audit.md`:

```markdown
# Harness 公共接口契约核查报告

**日期：** 2026-08-11  
**结论：** GO（有条件）  
**版本：** `pydantic-ai-slim==2.18.0`、`pydantic-ai-harness[skills]==0.13.0`

## 已证明

1. PydanticAI 的公开 `before_tool_execute` 钩子可以在真实副作用前执行，并能观察 Harness FileSystem 提供的工具。
2. Action Gateway 排在 `StepPersistence` 前时，`ask` 和 `deny` 不会产生虚假的 `tool_call_started`。
3. 待审批调用可由 `all_messages_json()` 持久化，并由 `ModelMessagesTypeAdapter.validate_json(...)` 恢复；恢复后原调用只执行一次。
4. 一个天问 Run 可以通过共同 `conversation_id` 关联多个不同的框架 `run_id`。
5. 副作用完成后发生硬中断时，StepPersistence 保留 `started` 副作用记录，可映射为天问 `unknown`。
6. StepPersistence 可以恢复已经闭合的工具调用快照，并保留 `conversation_id`。
7. `SqliteStepStore(database=...)` 可以与天问拥有的 `tw_*` 表共用一个 SQLite 文件。
8. FileSystem 能限制根目录并保护 `.env` 等路径。
9. Shell 能限制命令、操作符和环境变量，并把非零退出码作为已知结果返回。
10. Skills 在构造时冻结选中的 `SKILL.md` 内容，只暴露选中 Skill，不自动载入附带文件。
11. InputGuardrail 与 OutputGuardrail 分别处理输入和输出，不承担工具授权。

## 已知限制

1. StepPersistence 0.13.0 不为尚未闭合的待审批工具调用保存可恢复快照。天问 Checkpoint 必须保存待审批消息 JSON 和 DeferredToolResults 关联信息。
2. Harness Skills 不提供文件权限边界，也不加载 Skill 附带资源。只读物化、资源访问和版本治理仍由天问负责。
3. Harness Shell 的命令规则是应用层约束，不是操作系统沙箱。首切片仍须在受限 worktree 或临时仓库运行。
4. Harness 管理的 SQLite 表没有天问命名前缀。天问只能通过 StepStore 访问这些表，自己的表统一使用 `tw_*`。

## 进入垂直切片计划的硬条件

1. Action Gateway 能力顺序固定为 `ActionGateway → StepPersistence → 其他执行能力`。
2. `ask` 在返回用户前原子保存 Action Proposal、消息 JSON、框架调用 ID 和共同 `conversation_id`。
3. 恢复审批时核对 Action ID、工具名、参数摘要、Run、Skill 和策略版本，再提交 DeferredToolResults。
4. 发现 unresolved Harness tool effect 时先进入 `unknown` 和核对流程，禁止盲目重试。
5. Skill 目录按 Run 物化，Harness `Skills` 在物化完成后构造。

满足以上条件后，可以编写首个持续学习垂直切片实施计划；当前证据不支持 Fork Hermes。
```

- [ ] **Step 3: Link the verified baseline from the approved spec**

Under the first paragraph of section `## 15. 依赖与后备路线`, insert:

```markdown
首个已核查组合为 `pydantic-ai-slim==2.18.0` 与 `pydantic-ai-harness[skills]==0.13.0`。核查结论、限制和适配前提见 [`2026-08-11-harness-contract-audit.md`](../../research/2026-08-11-harness-contract-audit.md)。
```

- [ ] **Step 4: Verify the report, link, repository state, and full suite**

Run:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv run pytest tests/contracts -q
uv run ruff check tests/contracts
Test-Path -LiteralPath 'docs\research\2026-08-11-harness-contract-audit.md'
rg -n "GO（有条件）|2\.18\.0|0\.13\.0|harness-contract-audit" docs
git diff --check
```

Expected: `10 passed`, `All checks passed!`, `True`, matching report/spec lines, and no output from `git diff --check`.

- [ ] **Step 5: Commit**

```powershell
git add docs/research/2026-08-11-harness-contract-audit.md docs/superpowers/specs/2026-08-11-pydanticai-harness-integration-design.md
git commit -m "docs: record harness contract decision"
```

## Completion Boundary

This plan is complete when the pinned environment, ten contract tests, and conditional GO report are committed and the full contract suite passes from `uv sync --frozen`.

This plan deliberately does not create Goal, Loop, Task, Run, Action, Evidence, Skill Registry, evaluation, promotion, CLI, or model-provider production code. Those belong in the next independent plan, written only from this contract report.
