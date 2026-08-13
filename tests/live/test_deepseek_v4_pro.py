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
