from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

import tianwen.alpha_workspace as alpha_workspace
from tianwen.alpha_tasks import freeze_task_bundle
from tianwen.alpha_workspace import (
    HARD_MAX_LOG_BYTES,
    AlphaWorkspaceError,
    artifact_entries,
    capture_git_evidence,
    create_trial_workspace,
    project_file_action,
    scan_for_credential_value,
    write_bounded_artifact,
)


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _bundle(tmp_path: Path, **limit_overrides: Any):
    task_dir = tmp_path / "A1"
    _write(task_dir / "seed" / "module.py", "X=1\n")
    _write(task_dir / "instruction.md", "Change module.py")
    _write(task_dir / "checks" / "public.py", "print('ok')\n")
    _write(task_dir / "verifier" / "verify.py", "print('ok')\n")
    _write(task_dir / "reference" / "solution.patch", "")
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
    task = {
        "schema_version": "tianwen.alpha_task.v1",
        "task_id": "A1",
        "task_version": "1.0.0",
        "title": "Workspace test",
        "rounds": [{"round_id": "round-1", "public_check_ids": ["public"]}],
        "public_acceptance": ["passes"],
        "named_checks": [
            {
                "check_id": "public",
                "script": "public.py",
                "argv": ["python", "-I", "/checks/public.py", "/workspace"],
                "timeout_seconds": 1,
                "output_limit_bytes": 1024,
            }
        ],
        "final_verifier": {
            "verifier_id": "final",
            "argv": ["python", "-I", "/checks/verify.py", "/workspace"],
            "timeout_seconds": 1,
            "output_limit_bytes": 1024,
        },
        "limits": {
            "max_seed_bytes": 4096,
            "max_changed_files": 1,
            "max_changed_bytes": 4096,
            "max_trial_bytes": 2 * 1024 * 1024,
            "min_free_bytes": 0,
            "memory_bytes": 1024 * 1024,
            "cpus": 1.0,
            "pids": 16,
            "tmpfs_bytes": 1024 * 1024,
        },
        "allowed_write_patterns": ["module.py"],
        "protected_patterns": [".git/**", ".gitattributes"],
    }
    task["limits"].update({key: value for key, value in limit_overrides.items() if key.startswith("max_")})
    if "allowed_write_patterns" in limit_overrides:
        task["allowed_write_patterns"] = list(limit_overrides["allowed_write_patterns"])
    (task_dir / "task.json").write_text(json.dumps(task), encoding="utf-8")
    return freeze_task_bundle(task_dir, lock)


@pytest.fixture
def alpha_data_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "DevData"
    root.mkdir()
    return root


def _create_for_test(data_root: Path, trial_id: str, bundle: Any):
    return alpha_workspace._create_trial_workspace(data_root, trial_id, bundle, allowed_drive=data_root.drive)


def test_public_trial_workspace_rejects_non_d_root(tmp_path: Path) -> None:
    bundle = _bundle(tmp_path)

    with pytest.raises(AlphaWorkspaceError, match="D:"):
        create_trial_workspace(Path("C:/alpha-workspace-test-root"), "trial-1", bundle)


def test_internal_resolved_root_validator_is_injectable_for_unit_tests(tmp_path: Path) -> None:
    root = tmp_path / "data"
    root.mkdir()

    assert alpha_workspace._validate_data_root(root, allowed_drive=root.drive) == root.resolve()


def test_workspace_copy_matches_seed_and_is_not_overwritten(alpha_data_root: Path, tmp_path: Path) -> None:
    bundle = _bundle(tmp_path)
    paths, baseline = _create_for_test(alpha_data_root, "trial-1", bundle)

    assert baseline.digest == bundle.task.baseline_tree_digest
    assert (paths.workspace / "module.py").is_file()
    assert not (paths.workspace / "instruction.md").exists()
    with pytest.raises(AlphaWorkspaceError, match="already exists"):
        _create_for_test(alpha_data_root, "trial-1", bundle)


def test_projected_edit_is_rejected_before_crossing_file_or_byte_quota(alpha_data_root: Path, tmp_path: Path) -> None:
    bundle = _bundle(tmp_path, max_changed_files=1, max_changed_bytes=8)
    paths, baseline = _create_for_test(alpha_data_root, "trial-1", bundle)

    projected = project_file_action(
        paths.workspace, baseline, bundle.task, "write_file", {"path": "module.py", "content": "12345678"}
    )
    assert projected.changed_files == 1
    assert projected.changed_bytes == 8
    with pytest.raises(AlphaWorkspaceError, match="bytes"):
        project_file_action(
            paths.workspace, baseline, bundle.task, "write_file", {"path": "module.py", "content": "123456789"}
        )


def test_projection_enforces_hash_exact_edit_and_write_path_boundaries(alpha_data_root: Path, tmp_path: Path) -> None:
    bundle = _bundle(tmp_path)
    paths, baseline = _create_for_test(alpha_data_root, "trial-1", bundle)

    with pytest.raises(AlphaWorkspaceError, match="expected_hash"):
        project_file_action(
            paths.workspace,
            baseline,
            bundle.task,
            "write_file",
            {"path": "module.py", "content": "x", "expected_hash": "sha256:wrong"},
        )
    with pytest.raises(AlphaWorkspaceError, match="exactly once"):
        project_file_action(
            paths.workspace,
            baseline,
            bundle.task,
            "edit_file",
            {"path": "module.py", "old_text": "missing", "new_text": "x"},
        )
    with pytest.raises(AlphaWorkspaceError, match="allowed"):
        project_file_action(
            paths.workspace, baseline, bundle.task, "write_file", {"path": "other.py", "content": "x"}
        )


def test_git_diff_does_not_execute_model_controlled_attributes(alpha_data_root: Path, tmp_path: Path) -> None:
    bundle = _bundle(tmp_path, allowed_write_patterns=("module.py",))
    paths, _ = _create_for_test(alpha_data_root, "trial-1", bundle)
    marker = paths.trial_dir / "external-diff-ran"
    (paths.workspace / ".gitattributes").write_text("*.py diff=hostcommand\n", encoding="utf-8")
    (paths.workspace / "module.py").write_text("changed\n", encoding="utf-8")

    evidence = capture_git_evidence(paths)

    assert "module.py" in evidence.changed_files
    assert not marker.exists()
    assert paths.diff_patch.is_file()


def test_bounded_artifacts_are_immutable_and_reserve_trial_result(alpha_data_root: Path, tmp_path: Path) -> None:
    bundle = _bundle(tmp_path, max_trial_bytes=2 * 1024 * 1024)
    paths, _ = _create_for_test(alpha_data_root, "trial-1", bundle)

    write_bounded_artifact(paths, bundle.task, "logs/run.log", b"ok")
    assert write_bounded_artifact(paths, bundle.task, "logs/run.log", b"ok") == paths.logs / "run.log"
    with pytest.raises(AlphaWorkspaceError, match="immutable"):
        write_bounded_artifact(paths, bundle.task, "logs/run.log", b"changed")
    with pytest.raises(AlphaWorkspaceError, match="reserve"):
        write_bounded_artifact(paths, bundle.task, "evidence.bin", b"x" * (1024 * 1024))
    with pytest.raises(AlphaWorkspaceError, match="log"):
        write_bounded_artifact(paths, bundle.task, "logs/huge.log", b"x" * (HARD_MAX_LOG_BYTES + 1))


def test_artifact_entries_and_credential_scan_are_bounded_and_secret_safe(
    alpha_data_root: Path, tmp_path: Path
) -> None:
    bundle = _bundle(tmp_path)
    paths, _ = _create_for_test(alpha_data_root, "trial-1", bundle)
    sentinel = "credential-value-should-not-echo"
    write_bounded_artifact(paths, bundle.task, "logs/model.log", sentinel.encode())
    write_bounded_artifact(paths, bundle.task, "trial-manifest.json", b"{}")

    entries = artifact_entries(paths, ("logs/model.log", "trial-manifest.json"))

    assert [entry.path for entry in entries] == ["logs/model.log", "trial-manifest.json"]
    assert scan_for_credential_value(paths, sentinel) == ("logs/model.log",)
    with pytest.raises(AlphaWorkspaceError, match="trial-result"):
        artifact_entries(paths, ("trial-result.json",))
    with pytest.raises(AlphaWorkspaceError, match="relative"):
        artifact_entries(paths, (str(paths.logs / "model.log"),))
