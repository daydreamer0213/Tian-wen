# DeepSeek V4 Pro Live Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `deepseek:deepseek-v4-pro` usable through Tian-wen's existing governed live runtime, with offline contract coverage and an explicit paid read-only probe.

**Architecture:** Reuse PydanticAI 2.18.0's native `DeepSeekProvider`; add only its existing `openai` optional dependency and one credential name to the live entry gate. Keep the Tian-wen runtime, budget wrapper, Action Gateway, checkpointing, evaluation, and learning logic unchanged.

**Tech Stack:** Python 3.11–3.14, PydanticAI 2.18.0, PydanticAI Harness 0.13.0, pytest 9.0.3, uv

## Global Constraints

- The supported model string is exactly `deepseek:deepseek-v4-pro`.
- The API key is read only from `DEEPSEEK_API_KEY`.
- Default tests must make no network requests and incur no model charges.
- A real model test runs only when both `TIANWEN_RUN_LIVE_MODEL_TESTS=1` and `DEEPSEEK_API_KEY` are present.
- The real probe uses a generated temporary repository and only accepts read-only file actions.
- Do not add a model factory, Provider registry, router, fallback model, retry policy, price table, or DeepSeek-specific runtime.
- Do not change continual-learning, evaluation, promotion, or rollback behavior.
- Keep uv's downloaded package cache under `D:\DevData\uv-cache`.

---

## File Map

- `pyproject.toml`: enable PydanticAI's existing OpenAI-compatible transport extra.
- `uv.lock`: record the exact resolved `openai` SDK dependency and transitive packages.
- `tests/contracts/test_model_providers.py`: offline installation and model-resolution contract.
- `scripts/run_live_vertical_slice.py`: accept the DeepSeek environment credential at the existing startup gate.
- `tests/integration/test_live_script.py`: verify all three supported credential names pass that gate.
- `tests/live/test_deepseek_v4_pro.py`: opt-in paid end-to-end read-only probe.
- `README.md`: copyable DeepSeek setup, live probe command, and data boundary.

### Task 1: Install and Resolve the Native DeepSeek Provider

**Files:**
- Create: `tests/contracts/test_model_providers.py`
- Modify: `pyproject.toml`
- Modify: `uv.lock`

**Interfaces:**
- Consumes: PydanticAI's public `infer_model("deepseek:deepseek-v4-pro")` API and `DEEPSEEK_API_KEY`.
- Produces: an installed environment where the returned model has `model_id == "deepseek:deepseek-v4-pro"` and uses the official `https://api.deepseek.com` Provider base URL.

- [ ] **Step 1: Write the failing offline dependency contract**

```python
from __future__ import annotations

import pytest
from pydantic_ai.models import infer_model


def test_deepseek_v4_pro_resolves_through_the_native_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Break caught: dropping the OpenAI-compatible extra leaves documented DeepSeek support uninstallable."""
    monkeypatch.setenv("DEEPSEEK_API_KEY", "offline-contract-key")

    model = infer_model("deepseek:deepseek-v4-pro")

    assert model.model_id == "deepseek:deepseek-v4-pro"
    assert model.provider is not None
    assert model.provider.base_url == "https://api.deepseek.com"
```

- [ ] **Step 2: Run the contract and verify the expected failure**

Run:

```powershell
uv run pytest tests/contracts/test_model_providers.py -q
```

Expected: FAIL while importing the DeepSeek Provider because the `openai` package is not installed. This proves the test catches the missing project dependency without sending a request.

- [ ] **Step 3: Enable PydanticAI's existing OpenAI-compatible extra**

Change the dependency in `pyproject.toml` to:

```toml
"pydantic-ai-slim[duckduckgo,openai,web-fetch]==2.18.0",
```

Do not add `openai` as a separately versioned direct dependency; PydanticAI owns the compatible SDK range.

- [ ] **Step 4: Refresh the locked environment on D:**

Run:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv sync
```

Expected: `uv.lock` records the `openai` dependency and the project environment installs it under the project-local `.venv` on `D:`.

- [ ] **Step 5: Run the contract and verify it passes offline**

Run:

```powershell
uv run pytest tests/contracts/test_model_providers.py -q
```

Expected: PASS with no network request.

- [ ] **Step 6: Commit the dependency contract**

```powershell
git add pyproject.toml uv.lock tests/contracts/test_model_providers.py
git commit -m "feat: install native DeepSeek provider"
```

### Task 2: Accept the DeepSeek Credential at the Live Gate

**Files:**
- Modify: `tests/integration/test_live_script.py`
- Modify: `scripts/run_live_vertical_slice.py`

**Interfaces:**
- Consumes: `TIANWEN_MODEL` and one of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `DEEPSEEK_API_KEY`.
- Produces: the existing live entry continues only when a model and at least one supported credential are present.

- [ ] **Step 1: Parameterize the existing no-evaluator flow over all supported credentials**

Change the existing test signature and credential setup:

```python
@pytest.mark.parametrize(
    "credential_name",
    ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY"],
)
def test_live_script_without_evaluator_stops_at_eval_request(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    credential_name: str,
) -> None:
    """Break caught: a valid provider credential can be rejected before its model is constructed."""
    script = _live_script()
    app = _RecordingApp()
    key = _public_key(tmp_path / "evaluator-public.pem")
    monkeypatch.setenv("TIANWEN_MODEL", "test-model")
    for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv(credential_name, "test-key")
    monkeypatch.setenv("TIANWEN_EVALUATOR_PUBLIC_KEY", str(key))
    monkeypatch.delenv("TIANWEN_EVALUATOR_COMMAND_JSON", raising=False)
    monkeypatch.setattr(script, "_make_app", lambda args, key: app)
    monkeypatch.setattr(script, "_validate_workspace", lambda workspace: None)

    assert script.main(_args(tmp_path)) == 0

    output = capsys.readouterr().out
    assert "EvalRequest ID: request-1" in output
    assert "Final label: inconclusive" in output
```

Keep the existing stronger output and call assertions after these lines.

- [ ] **Step 2: Run only the DeepSeek parameter and verify it fails at the credential gate**

Run:

```powershell
uv run pytest "tests/integration/test_live_script.py::test_live_script_without_evaluator_stops_at_eval_request[DEEPSEEK_API_KEY]" -q
```

Expected: FAIL with `SystemExit: 2` and the existing “provider credential” parser error.

- [ ] **Step 3: Add DeepSeek to the existing credential tuple**

Change the live gate in `scripts/run_live_vertical_slice.py` to:

```python
if not os.environ.get("TIANWEN_MODEL") or not any(
    os.environ.get(name)
    for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY")
):
```

Do not add a new helper or Provider-specific branch.

- [ ] **Step 4: Verify all credential variants and existing live orchestration**

Run:

```powershell
uv run pytest tests/integration/test_live_script.py -q
```

Expected: all tests pass; none contact a model Provider because `_make_app` is replaced below the credential boundary.

- [ ] **Step 5: Commit the live gate**

```powershell
git add scripts/run_live_vertical_slice.py tests/integration/test_live_script.py
git commit -m "feat: accept DeepSeek live credentials"
```

### Task 3: Add the Explicit Paid Read-Only Probe and User Instructions

**Files:**
- Create: `tests/live/test_deepseek_v4_pro.py`
- Modify: `README.md`

**Interfaces:**
- Consumes: an explicit live-test switch, `DEEPSEEK_API_KEY`, and PydanticAI's inferred DeepSeek model.
- Produces: observable proof that a real DeepSeek request, token settlement, read-only governed Action, and stable Checkpoint work together.

- [ ] **Step 1: Add the opt-in live probe**

```python
from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from pydantic_ai.models import infer_model

from tianwen.app import TianwenApp, TianwenConfig, default_eval_protocol
from tianwen.domain import ActionStatus, BudgetLimit, RunRecord, RunStatus


pytestmark = pytest.mark.skipif(
    os.environ.get("TIANWEN_RUN_LIVE_MODEL_TESTS") != "1"
    or not os.environ.get("DEEPSEEK_API_KEY"),
    reason="set TIANWEN_RUN_LIVE_MODEL_TESTS=1 and DEEPSEEK_API_KEY to run the paid live probe",
)


def test_deepseek_v4_pro_completes_a_governed_read_only_task(tmp_path: Path) -> None:
    marker = "TIANWEN-DEEPSEEK-PROBE-7F3A"
    workspace = tmp_path / "repo"
    workspace.mkdir()
    (workspace / "marker.txt").write_text(marker, encoding="utf-8")
    subprocess.run(["git", "init"], cwd=workspace, check=True, capture_output=True)
    app = TianwenApp(
        TianwenConfig(
            data_dir=tmp_path / "state",
            workspace=workspace,
            model=infer_model("deepseek:deepseek-v4-pro"),
            public_evaluator_key=Ed25519PrivateKey.generate().public_key(),
            approved_protocol=default_eval_protocol(),
            allowed_commands=(),
        )
    )
    goal = app.create_goal(
        objective="Read one generated marker without changing the repository.",
        criteria=("report the exact marker",),
        workspace=workspace,
        authorization=("workspace_read",),
        budget=BudgetLimit(
            model_requests=4,
            tool_calls=6,
            tokens=40_000,
            action_effects=6,
        ),
    )

    output = app.run_repo_task(
        goal.goal_id,
        workspace,
        "Use the read_file tool to read marker.txt and report its exact contents. "
        "Do not modify files and do not run shell commands.",
    )

    run = app.last_run(goal.goal_id)
    persisted = app.store.get_object("run", run.run_id, RunRecord)
    actions = app.store.list_actions(run.run_id)
    usage = app.store.get_run_budget_usage(run.run_id)
    assert marker in output
    assert persisted.status is RunStatus.COMPLETED
    assert usage.model_requests >= 2
    assert usage.tokens > 0
    assert any(action.tool_name == "read_file" for action in actions)
    assert all(action.status is ActionStatus.SUCCEEDED for action in actions)
    assert all(
        action.tool_name
        in {"read_file", "list_directory", "find_files", "search_files", "file_info"}
        for action in actions
    )
    assert app.store.latest_checkpoint(run.run_id) is not None
```

- [ ] **Step 2: Verify the probe is skipped by default**

Run:

```powershell
uv run pytest tests/live/test_deepseek_v4_pro.py -q
```

Expected: one skipped test and no network request.

- [ ] **Step 3: Document the normal model configuration**

Add to the README live section:

```powershell
$env:TIANWEN_MODEL = 'deepseek:deepseek-v4-pro'
$env:DEEPSEEK_API_KEY = '在 DeepSeek 控制台创建的密钥'
```

Explain immediately below it:

- keep the key only in the current terminal environment; do not paste it into chat or commit it;
- a real run sends model-visible prompts, tool results, and context to DeepSeek's official API;
- start with a disposable or public repository.

- [ ] **Step 4: Document the explicit probe command**

Add:

```powershell
$env:TIANWEN_RUN_LIVE_MODEL_TESTS = '1'
uv run pytest tests\live\test_deepseek_v4_pro.py -v
Remove-Item Env:TIANWEN_RUN_LIVE_MODEL_TESTS
```

State that the command uses a generated temporary repository, makes a paid API call, and does not publish a candidate.

- [ ] **Step 5: Run focused checks**

Run:

```powershell
uv run pytest tests/contracts/test_model_providers.py tests/integration/test_live_script.py tests/live/test_deepseek_v4_pro.py -q
uv run ruff check tests/contracts/test_model_providers.py tests/integration/test_live_script.py tests/live/test_deepseek_v4_pro.py scripts/run_live_vertical_slice.py
git diff --check
```

Expected: deterministic tests pass, the paid probe skips, lint and whitespace checks pass.

- [ ] **Step 6: Commit the probe and documentation**

```powershell
git add README.md tests/live/test_deepseek_v4_pro.py
git commit -m "test: add DeepSeek live contract probe"
```

### Task 4: Full Regression Verification and Push

**Files:**
- Verify all files changed by Tasks 1–3.

**Interfaces:**
- Consumes: the complete repository and locked environment.
- Produces: a pushed branch whose default validation is deterministic and network-free.

- [ ] **Step 1: Run the full deterministic suite**

```powershell
uv run pytest -q
```

Expected: all deterministic tests pass and exactly the platform/live opt-in tests allowed by their own skip conditions are skipped.

- [ ] **Step 2: Run repository-wide static checks**

```powershell
uv run ruff check .
git diff --check
git status --short
```

Expected: lint and whitespace checks pass; only intentional committed work exists.

- [ ] **Step 3: Inspect the final commit range**

```powershell
git log --oneline --decorate origin/main..HEAD
git diff --stat origin/main..HEAD
```

Expected: the design, plan, dependency, credential gate, opt-in probe, and README are present; no continual-learning core files changed.

- [ ] **Step 4: Push the completed branch**

```powershell
git push
```

Expected: the remote branch advances to the verified local HEAD. If GitHub is temporarily unreachable, preserve the commits and report the exact ahead count rather than retrying destructively.

