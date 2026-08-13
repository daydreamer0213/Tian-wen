from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from tianwen.alpha_tasks import load_task_bundle

ROOT = Path(__file__).parents[2]
IMAGE_LOCK = ROOT / "alpha" / "environment" / "image.lock"
TASK_IDS = ("A1", "A2", "A3")


def _run_verifier(task_dir: Path, workspace: Path) -> str:
    completed = subprocess.run(
        [
            sys.executable,
            "-I",
            str(task_dir / "verifier" / "verify.py"),
            str(workspace),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=15,
        env={
            name: os.environ[name]
            for name in ("SYSTEMROOT", "WINDIR", "TEMP", "TMP")
            if name in os.environ
        },
    )
    return completed.stdout


def _workspace(tmp_path: Path, task_dir: Path) -> Path:
    workspace = tmp_path / task_dir.name
    shutil.copytree(task_dir / "seed", workspace)
    return workspace


def test_run_verifier_retains_raw_stdout(tmp_path: Path) -> None:
    task_dir = ROOT / "alpha" / "tasks" / "A1"

    assert isinstance(_run_verifier(task_dir, _workspace(tmp_path, task_dir)), str)


def test_a3_freezes_one_official_source_and_excludes_checks_from_model_input() -> None:
    task_dir = ROOT / "alpha" / "tasks" / "A3"
    bundle = load_task_bundle(task_dir, IMAGE_LOCK)

    assert [source.url for source in bundle.task.sources] == [
        "https://docs.python.org/3/library/urllib.parse.html"
    ]
    assert bundle.task.sources[0].retrieved_date.isoformat() == "2026-08-13"
    assert bundle.task_bundle_digest != bundle.model_input_digest
    assert bundle.task.allowed_write_patterns == ("query.py",)


@pytest.mark.parametrize("task_id", TASK_IDS)
def test_task_package_nop_oracle_and_repeatability(
    task_id: str,
    tmp_path: Path,
) -> None:
    task_dir = ROOT / "alpha" / "tasks" / task_id
    bundle = load_task_bundle(task_dir, IMAGE_LOCK)
    workspace = _workspace(tmp_path, task_dir)

    first_nop_raw = _run_verifier(task_dir, workspace)
    second_nop_raw = _run_verifier(task_dir, workspace)
    assert first_nop_raw == second_nop_raw
    assert json.loads(first_nop_raw)["verdict"] == "not_met"

    subprocess.run(
        ["git", "apply", "--whitespace=nowarn", str(task_dir / "reference" / "solution.patch")],
        cwd=workspace,
        check=True,
        capture_output=True,
        timeout=15,
    )
    first_oracle_raw = _run_verifier(task_dir, workspace)
    second_oracle_raw = _run_verifier(task_dir, workspace)
    assert first_oracle_raw == second_oracle_raw
    assert json.loads(first_oracle_raw)["verdict"] == "met"
    assert bundle.task.final_verifier.digest
