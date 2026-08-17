from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Literal, TypedDict, cast

from tianwen.alpha_tasks import load_task_bundle

PROBE_ROOT = Path(r"D:\DevData\tianwen-dsh-probe")
TASK_BUNDLE_DIGEST = "sha256:15e08373a535c14bb0de636724170afb05cbb2e8ace1f91ca53bc877f73184d0"
MODEL_INPUT_DIGEST = "sha256:b8f76aae549aeca56d9a4749aa188788648fc0fae578f422c85cfb6da28eb490"
SHA256 = re.compile(r"sha256:[0-9a-f]{64}\Z")
REQUEST_KEYS = {
    "schema_version",
    "request_id",
    "task_id",
    "candidate_kind",
    "expected_task_bundle_digest",
    "expected_model_input_digest",
}
A1_CHECKS = [
    "escaped_quote",
    "escaped_quote_interior_whitespace",
    "malformed_quote",
    "ordinary_fields",
    "quoted_field_whitespace",
    "quoted_final_field_whitespace",
    "quoted_separator",
]


class EvalRequest(TypedDict):
    schema_version: Literal["tianwen.eval_request.v1"]
    request_id: str
    task_id: Literal["A1"]
    candidate_kind: Literal["nop", "oracle"]
    expected_task_bundle_digest: str
    expected_model_input_digest: str


def _sha256(raw: bytes) -> str:
    return f"sha256:{hashlib.sha256(raw).hexdigest()}"


def _within(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
    except ValueError:
        return False
    return True


def _probe_root() -> Path:
    expected = Path(os.path.abspath(PROBE_ROOT))
    attributes = getattr(expected.lstat(), "st_file_attributes", 0)
    if attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0):
        raise ValueError(f"{PROBE_ROOT} must not be a reparse point")
    resolved = expected.resolve(strict=True)
    if os.path.normcase(str(resolved)) != os.path.normcase(str(expected)):
        raise ValueError(f"{PROBE_ROOT} must resolve to itself")
    return resolved


def _existing_directory(path: str, label: str) -> Path:
    candidate = Path(path)
    if not candidate.is_absolute():
        raise ValueError(f"{label} must be absolute")
    resolved = candidate.resolve(strict=True)
    if not resolved.is_dir():
        raise ValueError(f"{label} must be a directory")
    return resolved


def _existing_file(path: str, label: str) -> Path:
    candidate = Path(path)
    if not candidate.is_absolute():
        raise ValueError(f"{label} must be absolute")
    resolved = candidate.resolve(strict=True)
    if not resolved.is_file():
        raise ValueError(f"{label} must be a file")
    return resolved


def _result_file(path: str, state_root: Path) -> Path:
    candidate = Path(path)
    if not candidate.is_absolute():
        raise ValueError("result must be absolute")
    parent = candidate.parent.resolve(strict=True)
    resolved = parent / candidate.name
    if not _within(state_root, resolved):
        raise ValueError("result must remain below state-root")
    if resolved.exists():
        raise ValueError("result must not already exist")
    return resolved


def _request_id(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("request_id must be a string")
    try:
        parsed = uuid.UUID(value)
    except ValueError as error:
        raise ValueError("request_id must be a canonical UUID") from error
    if str(parsed) != value:
        raise ValueError("request_id must be a canonical UUID")
    return value


def _digest(value: object, label: str) -> str:
    if not isinstance(value, str) or SHA256.fullmatch(value) is None:
        raise ValueError(f"{label} must be an exact lowercase sha256 digest")
    return value


def _load_request(path: Path) -> EvalRequest:
    try:
        value = json.loads(path.read_bytes().decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("request must be UTF-8 JSON") from error
    if not isinstance(value, dict) or set(value) != REQUEST_KEYS:
        raise ValueError("request fields do not match EvalRequestV1")
    if value["schema_version"] != "tianwen.eval_request.v1":
        raise ValueError("unsupported request schema_version")
    if value["task_id"] != "A1":
        raise ValueError("request task_id must be A1")
    if value["candidate_kind"] not in {"nop", "oracle"}:
        raise ValueError("request candidate_kind must be nop or oracle")
    _request_id(value["request_id"])
    _digest(value["expected_task_bundle_digest"], "expected_task_bundle_digest")
    _digest(value["expected_model_input_digest"], "expected_model_input_digest")
    return cast(EvalRequest, value)


def _minimal_env() -> dict[str, str]:
    return {
        name: os.environ[name]
        for name in ("SYSTEMROOT", "WINDIR", "TEMP", "TMP")
        if name in os.environ
    }


def _verdict(raw_stdout: str) -> Literal["met", "not_met", "inconclusive"]:
    try:
        value = json.loads(raw_stdout)
    except json.JSONDecodeError as error:
        raise ValueError("verifier stdout must contain one JSON value") from error
    if not isinstance(value, dict):
        raise ValueError("verifier stdout must be a JSON object")
    verdict = value.get("verdict")
    if verdict not in {"met", "not_met", "inconclusive"}:
        raise ValueError("verifier verdict is invalid")
    if verdict == "met":
        if (
            value.get("summary") != "7/7 checks passed"
            or value.get("failed_checks") != []
            or value.get("failure_categories") != []
            or value.get("passed_checks") != A1_CHECKS
        ):
            raise ValueError("verifier cannot report met without exact 7/7 checks")
    return cast(Literal["met", "not_met", "inconclusive"], verdict)


def _atomic_json(path: Path, value: dict[str, object]) -> None:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(serialized.encode("utf-8"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--state-root", required=True)
    parser.add_argument("--request", required=True)
    parser.add_argument("--result", required=True)
    return parser.parse_args()


def run() -> None:
    arguments = _arguments()
    repo_root = _existing_directory(arguments.repo_root, "repo-root")
    if repo_root != Path.cwd().resolve(strict=True) or not (repo_root / ".git").exists():
        raise ValueError("repo-root must be the current Tianwen worktree")

    state_root = _existing_directory(arguments.state_root, "state-root")
    request_path = _existing_file(arguments.request, "request")
    result_path = _result_file(arguments.result, state_root)
    if os.name == "nt":
        probe_root = _probe_root()
        for label, path in (
            ("state-root", state_root),
            ("request", request_path),
            ("result", result_path),
            ("TEMP", _existing_directory(os.environ.get("TEMP", ""), "TEMP")),
            ("TMP", _existing_directory(os.environ.get("TMP", ""), "TMP")),
        ):
            if not _within(probe_root, path):
                raise ValueError(f"{label} must remain below {PROBE_ROOT}")
    if not _within(state_root, request_path):
        raise ValueError("request must remain below state-root")

    request = _load_request(request_path)
    task_dir = repo_root / "alpha" / "tasks" / "A1"
    image_lock = repo_root / "alpha" / "environment" / "image.lock"
    bundle = load_task_bundle(task_dir, image_lock)
    if (
        bundle.task_bundle_digest != TASK_BUNDLE_DIGEST
        or bundle.model_input_digest != MODEL_INPUT_DIGEST
        or request["expected_task_bundle_digest"] != TASK_BUNDLE_DIGEST
        or request["expected_model_input_digest"] != MODEL_INPUT_DIGEST
    ):
        raise ValueError("request or repository does not match the frozen A1 authority")

    git_name = shutil.which("git")
    if git_name is None or not Path(git_name).is_absolute():
        raise ValueError("git must resolve once to an absolute executable")
    git_executable = Path(git_name).resolve(strict=True)
    if not git_executable.is_file():
        raise ValueError("git executable must be a file")

    workspace_parent = state_root / "workspaces"
    workspace_parent.mkdir(exist_ok=True)
    workspace_parent = workspace_parent.resolve(strict=True)
    if not _within(state_root, workspace_parent):
        raise ValueError("workspaces must remain below state-root")
    workspace = Path(tempfile.mkdtemp(prefix=f"a1-{request['request_id']}-", dir=workspace_parent))
    shutil.copytree(task_dir / "seed", workspace, dirs_exist_ok=True)
    solution_patch = task_dir / "reference" / "solution.patch"
    candidate_raw = b""
    if request["candidate_kind"] == "oracle":
        candidate_raw = solution_patch.read_bytes()
        subprocess.run(
            [str(git_executable), "apply", "--whitespace=nowarn", str(solution_patch)],
            cwd=workspace,
            check=True,
            capture_output=True,
            timeout=15,
            env=_minimal_env(),
        )

    completed = subprocess.run(
        [
            sys.executable,
            "-I",
            str(task_dir / "verifier" / "verify.py"),
            str(workspace),
        ],
        check=True,
        capture_output=True,
        timeout=15,
        env=_minimal_env(),
    )
    raw_stdout_bytes = completed.stdout
    try:
        raw_stdout = raw_stdout_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("verifier stdout must be UTF-8") from error
    receipt = {
        "schema_version": "tianwen.eval_receipt.v1",
        "request_id": request["request_id"],
        "task_id": "A1",
        "candidate_kind": request["candidate_kind"],
        "candidate_digest": _sha256(candidate_raw),
        "task_bundle_digest": bundle.task_bundle_digest,
        "model_input_digest": bundle.model_input_digest,
        "verdict": _verdict(raw_stdout),
        "raw_stdout": raw_stdout,
        "raw_stdout_digest": _sha256(raw_stdout_bytes),
    }
    _atomic_json(result_path, receipt)


def main() -> None:
    try:
        run()
    except Exception as error:
        print(f"A1 evaluator error: {error}", file=sys.stderr)
        raise SystemExit(2) from error


if __name__ == "__main__":
    main()
