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
TASK_IDS = ("A1", "A2", "A3", "A4", "A5")


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


def _run_check(task_dir: Path, check: str, workspace: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-I", str(task_dir / "checks" / check), str(workspace)],
        capture_output=True,
        text=True,
        timeout=15,
    )


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


def test_a5_has_exactly_two_frozen_rounds_and_preregistered_feedback() -> None:
    bundle = load_task_bundle(ROOT / "alpha" / "tasks" / "A5", IMAGE_LOCK)

    assert [round_.round_id for round_ in bundle.task.rounds] == ["round-1", "round-2"]
    assert bundle.task.rounds[0].public_check_ids == ("round-1",)
    assert bundle.task.rounds[1].public_check_ids == ("round-2",)
    assert bundle.task.rounds[0].follow_up_feedback_digest is None
    assert bundle.task.rounds[1].follow_up_feedback_digest
    assert bundle.feedback_by_round["round-2"].startswith("# 第二轮反馈")


def test_a4_public_check_is_repeatable_before_and_after_reference_patch(tmp_path: Path) -> None:
    task_dir = ROOT / "alpha" / "tasks" / "A4"
    workspace = _workspace(tmp_path, task_dir)

    nop_results = [_run_check(task_dir, "public.py", workspace) for _ in range(2)]
    assert all(result.returncode != 0 for result in nop_results)
    assert nop_results[0].stdout == nop_results[1].stdout

    subprocess.run(
        ["git", "apply", "--whitespace=nowarn", str(task_dir / "reference" / "solution.patch")],
        cwd=workspace,
        check=True,
        capture_output=True,
        timeout=15,
    )
    oracle_results = [_run_check(task_dir, "public.py", workspace) for _ in range(2)]
    assert all(result.returncode == 0 for result in oracle_results)
    assert oracle_results[0].stdout == oracle_results[1].stdout


def test_a5_round_one_fixture_and_final_oracle_are_repeatable(tmp_path: Path) -> None:
    task_dir = ROOT / "alpha" / "tasks" / "A5"
    fixture = '''from __future__ import annotations

from collections.abc import Iterable


def render_report(
    rows: Iterable[tuple[str, str]],
    groups: Iterable[str] = (),
) -> str:
    grouped: dict[str, list[str]] = {}
    for group, title in rows:
        grouped.setdefault(group, []).append(title)
    sections = [
        "\\n".join((f"[{group}]", *(f"- {title}" for title in titles)))
        for group, titles in grouped.items()
    ]
    return "\\n\\n".join(sections)
'''

    first = _workspace(tmp_path, task_dir)
    first.joinpath("reports.py").write_text(fixture, encoding="utf-8")
    first_checks = [_run_check(task_dir, "round_1.py", first) for _ in range(2)]
    assert all(result.returncode == 0 for result in first_checks)
    assert first_checks[0].stdout == first_checks[1].stdout
    first_raw = _run_verifier(task_dir, first)
    assert first_raw == _run_verifier(task_dir, first)
    assert json.loads(first_raw)["verdict"] == "not_met"

    final = _workspace(tmp_path / "final", task_dir)
    subprocess.run(
        ["git", "apply", "--whitespace=nowarn", str(task_dir / "reference" / "solution.patch")],
        cwd=final,
        check=True,
        capture_output=True,
        timeout=15,
    )
    round_one_results = [
        subprocess.run(
            [sys.executable, "-I", str(task_dir / "checks" / "round_1.py"), str(final)],
            capture_output=True,
            text=True,
            timeout=15,
        )
        for _ in range(2)
    ]
    assert all(result.returncode != 0 for result in round_one_results)
    assert round_one_results[0].stdout == round_one_results[1].stdout
    assert round_one_results[0].stderr == round_one_results[1].stderr
    final_checks = [_run_check(task_dir, "round_2.py", final) for _ in range(2)]
    assert all(result.returncode == 0 for result in final_checks)
    assert final_checks[0].stdout == final_checks[1].stdout
    final_raw = _run_verifier(task_dir, final)
    assert final_raw == _run_verifier(task_dir, final)
    assert json.loads(final_raw)["verdict"] == "met"


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
