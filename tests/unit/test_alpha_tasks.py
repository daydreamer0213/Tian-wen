from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from tianwen.alpha_tasks import (
    AlphaTaskError,
    directory_digest,
    freeze_task_bundle,
    load_task_bundle,
)


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _minimal_bundle(tmp_path: Path, *, task_id: str = "A1") -> tuple[Path, Path]:
    task_dir = tmp_path / task_id
    _write(task_dir / "seed" / "module.py", "VALUE = 1\n")
    _write(task_dir / "instruction.md", "Change the module.")
    _write(task_dir / "checks" / "public.py", "print('public')\n")
    _write(task_dir / "verifier" / "verify.py", "print('verify')\n")
    _write(task_dir / "reference" / "solution.patch", "diff --git a/module.py b/module.py\n")
    lock = tmp_path / "image.lock"
    lock.write_text(
        json.dumps(
            {
                "schema_version": "tianwen.alpha_image.v1",
                "reference": "python:3.12.11-slim-bookworm",
                "immutable_reference": "python@sha256:manifest",
                "platform": "linux/amd64",
                "manifest_digest": "sha256:manifest",
                "platform_digest": "sha256:platform",
            }
        ),
        encoding="utf-8",
    )
    raw: dict[str, Any] = {
        "schema_version": "tianwen.alpha_task.v1",
        "task_id": task_id,
        "task_version": "1.0.0",
        "title": "Minimal task",
        "rounds": [{"round_id": "round-1", "public_check_ids": ["public"]}],
        "public_acceptance": ["public check passes"],
        "named_checks": [
            {
                "check_id": "public",
                "script": "public.py",
                "argv": ["python", "-I", "/checks/public.py", "/workspace"],
                "timeout_seconds": 15,
                "output_limit_bytes": 65536,
            }
        ],
        "final_verifier": {
            "verifier_id": "final",
            "argv": ["python", "-I", "/checks/verify.py", "/workspace"],
            "timeout_seconds": 15,
            "output_limit_bytes": 65536,
        },
        "limits": {
            "max_seed_bytes": 4096,
            "max_changed_files": 1,
            "max_changed_bytes": 4096,
            "max_trial_bytes": 8192,
            "min_free_bytes": 0,
            "memory_bytes": 1024 * 1024,
            "cpus": 1.0,
            "pids": 16,
            "tmpfs_bytes": 1024 * 1024,
        },
        "allowed_write_patterns": ["module.py"],
        "protected_patterns": [".git/**"],
    }
    if task_id == "A5":
        _write(task_dir / "feedback" / "round-2.md", "Try again.\n")
        raw["rounds"].append({"round_id": "round-2", "public_check_ids": ["public"]})
    if task_id == "A3":
        _write(task_dir / "sources" / "search.json", '[{"href":"https://example.test/doc"}]')
        _write(task_dir / "sources" / "page.md", "URL: https://example.test/doc\nrecorded fetch\n")
        raw["sources"] = [
            {
                "url": "https://example.test/doc",
                "title": "Example",
                "retrieved_date": "2026-08-13",
                "search_results_path": "sources/search.json",
                "fetched_content_path": "sources/page.md",
            }
        ]
    (task_dir / "task.json").write_text(json.dumps(raw), encoding="utf-8")
    freeze_task_bundle(task_dir, lock)
    return task_dir, lock


def _raw(task_dir: Path) -> dict[str, Any]:
    return json.loads((task_dir / "task.json").read_text(encoding="utf-8"))


def _save(task_dir: Path, raw: dict[str, Any]) -> None:
    (task_dir / "task.json").write_text(json.dumps(raw), encoding="utf-8")


def test_freeze_writes_derived_fields_and_runtime_load_is_read_only(tmp_path: Path) -> None:
    task_dir, lock = _minimal_bundle(tmp_path)
    before = (task_dir / "task.json").read_bytes()

    bundle = load_task_bundle(task_dir, lock)

    assert bundle.task.task_id == "A1"
    assert bundle.instruction == "Change the module."
    assert bundle.feedback_by_round == {}
    assert bundle.task_bundle_digest != bundle.model_input_digest
    assert (task_dir / "task.json").read_bytes() == before
    assert _raw(task_dir)["instruction_digest"].startswith("sha256:")


def test_directory_digest_is_canonical_and_rejects_non_regular_entries(tmp_path: Path) -> None:
    root = tmp_path / "tree"
    _write(root / "z.txt", "z")
    _write(root / "a" / "x.txt", "x")
    assert directory_digest(root) == directory_digest(root, logical_prefix="")
    outside = tmp_path / "outside.txt"
    outside.write_text("outside", encoding="utf-8")
    try:
        (root / "escape.txt").symlink_to(outside)
    except OSError:
        pytest.skip("this Windows account cannot create test symlinks")
    with pytest.raises(AlphaTaskError, match="symbolic link"):
        directory_digest(root)


def test_loader_rejects_shell_text_and_runtime_placeholders(tmp_path: Path) -> None:
    task_dir, lock = _minimal_bundle(tmp_path)
    raw = _raw(task_dir)
    raw["named_checks"][0]["argv"] = ["python -I /checks/public.py /workspace && echo escaped"]
    _save(task_dir, raw)

    with pytest.raises(AlphaTaskError, match="argv"):
        load_task_bundle(task_dir, lock)


def test_loader_rejects_symlinks_and_seed_escape(tmp_path: Path) -> None:
    task_dir, lock = _minimal_bundle(tmp_path)
    outside = tmp_path / "outside.py"
    outside.write_text("print('outside')", encoding="utf-8")
    try:
        (task_dir / "seed" / "escape.py").symlink_to(outside)
    except OSError:
        pytest.skip("this Windows account cannot create test symlinks")

    with pytest.raises(AlphaTaskError, match="symbolic link"):
        load_task_bundle(task_dir, lock)


@pytest.mark.parametrize("changed", ("instruction.md", "seed/module.py"))
def test_loader_rejects_changed_instruction_or_seed(tmp_path: Path, changed: str) -> None:
    task_dir, lock = _minimal_bundle(tmp_path)
    (task_dir / changed).write_text("changed", encoding="utf-8")

    with pytest.raises(AlphaTaskError, match="digest"):
        load_task_bundle(task_dir, lock)


def test_loader_rejects_limits_above_controller_ceiling(tmp_path: Path) -> None:
    task_dir, lock = _minimal_bundle(tmp_path)
    raw = _raw(task_dir)
    raw["limits"]["max_changed_files"] = 13
    _save(task_dir, raw)

    with pytest.raises(AlphaTaskError, match="max_changed_files"):
        load_task_bundle(task_dir, lock)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    (
        ("task_id", "A6", "task_id"),
        ("task_id", "A 1", "task_id"),
        ("allowed_write_patterns", ["../escape.py"], "path"),
    ),
)
def test_loader_rejects_invalid_authority_fields(tmp_path: Path, field: str, value: object, message: str) -> None:
    task_dir, lock = _minimal_bundle(tmp_path)
    raw = _raw(task_dir)
    raw[field] = value
    _save(task_dir, raw)

    with pytest.raises(AlphaTaskError, match=message):
        load_task_bundle(task_dir, lock)


def test_loader_rejects_sensitive_seed_names(tmp_path: Path) -> None:
    task_dir, lock = _minimal_bundle(tmp_path)
    _write(task_dir / "seed" / ".env", "TOKEN=secret\n")

    with pytest.raises(AlphaTaskError, match="sensitive"):
        load_task_bundle(task_dir, lock)


def test_loader_rejects_private_key_material_in_seed(tmp_path: Path) -> None:
    task_dir, lock = _minimal_bundle(tmp_path)
    _write(task_dir / "seed" / "module.py", "-----BEGIN PRIVATE KEY-----\nsecret\n")

    with pytest.raises(AlphaTaskError, match="sensitive"):
        load_task_bundle(task_dir, lock)


def test_loader_rejects_unrecognized_task_file(tmp_path: Path) -> None:
    task_dir, lock = _minimal_bundle(tmp_path)
    _write(task_dir / "notes.md", "unfrozen material")

    with pytest.raises(AlphaTaskError, match="unrecognized task file"):
        load_task_bundle(task_dir, lock)


def test_loader_requires_a5_round_shape_and_feedback_binding(tmp_path: Path) -> None:
    task_dir, lock = _minimal_bundle(tmp_path, task_id="A5")
    raw = _raw(task_dir)
    raw["rounds"] = [raw["rounds"][0]]
    _save(task_dir, raw)

    with pytest.raises(AlphaTaskError, match="A5"):
        load_task_bundle(task_dir, lock)


def test_loader_allows_only_a3_one_bound_https_source(tmp_path: Path) -> None:
    task_dir, lock = _minimal_bundle(tmp_path)
    raw = _raw(task_dir)
    raw["sources"] = [
        {
            "url": "https://example.test/doc",
            "title": "Example",
            "retrieved_date": "2026-08-13",
            "search_results_path": "sources/search.json",
            "fetched_content_path": "sources/page.md",
            "content_digest": "sha256:later",
            "search_results_digest": "sha256:later",
        }
    ]
    _save(task_dir, raw)

    with pytest.raises(AlphaTaskError, match="A3"):
        load_task_bundle(task_dir, lock)


def test_a3_source_is_admitted_to_model_input_but_checks_are_not(tmp_path: Path) -> None:
    task_dir, lock = _minimal_bundle(tmp_path, task_id="A3")
    bundle = load_task_bundle(task_dir, lock)
    _write(task_dir / "checks" / "public.py", "print('changed check')\n")
    changed_bundle = freeze_task_bundle(task_dir, lock)

    assert bundle.model_input_digest == changed_bundle.model_input_digest
    assert bundle.task_bundle_digest != changed_bundle.task_bundle_digest
