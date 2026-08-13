from __future__ import annotations

import fnmatch
import json
import os
import shutil
import stat
import subprocess
import uuid
from collections.abc import Iterable, Mapping
from pathlib import Path, PurePosixPath
from typing import Any

from pydantic import Field

from tianwen.alpha_tasks import HARD_MAX_LOG_BYTES, AlphaTask, AlphaTaskBundle
from tianwen.domain import FrozenModel, content_digest

_PUBLIC_DRIVE = "D:"
_RESULT_RESERVE_BYTES = 1024 * 1024
_TASK_BY_TRIAL_DIR: dict[Path, AlphaTask] = {}
_AUTHORITY_RELATIVE_PATH = "state/authority.json"


class AlphaWorkspaceError(ValueError):
    """A trial workspace action would violate Alpha-A's local safety boundary."""


class FileEntry(FrozenModel):
    path: str
    bytes: int = Field(ge=0)
    digest: str


class TreeSnapshot(FrozenModel):
    digest: str
    files: tuple[FileEntry, ...]
    total_bytes: int = Field(ge=0)
    changed_files: int = Field(default=0, ge=0)
    changed_bytes: int = Field(default=0, ge=0)


class AlphaTrialPaths(FrozenModel):
    trial_id: str
    data_root: Path
    trial_dir: Path
    workspace: Path
    state: Path
    logs: Path
    diff_patch: Path
    trial_manifest_json: Path
    trial_result_json: Path


class GitEvidence(FrozenModel):
    changed_files: tuple[str, ...]
    numstat: tuple[str, ...]
    patch_digest: str
    final_tree_digest: str


class ArtifactEntry(FrozenModel):
    path: str
    artifact_type: str
    digest: str
    bytes: int = Field(ge=0)


def _error(message: str) -> None:
    raise AlphaWorkspaceError(message)


def _is_reparse(path: Path) -> bool:
    return bool(getattr(path.lstat(), "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0))


def _validate_data_root(data_root: Path, *, allowed_drive: str | None = None) -> Path:
    required_drive = _PUBLIC_DRIVE if allowed_drive is None else allowed_drive
    resolved = data_root.resolve(strict=False)
    if resolved.drive.casefold() != required_drive.casefold():
        _error(f"data root must be on {required_drive}")
    if "," in str(resolved):
        _error("Docker mount path cannot contain a comma")
    return resolved


def _validate_trial_id(trial_id: str) -> None:
    allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
    if not trial_id or any(char not in allowed for char in trial_id):
        _error("invalid trial_id")


def _git_environment(paths: AlphaTrialPaths) -> dict[str, str]:
    return {
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": "NUL",
        "GIT_TERMINAL_PROMPT": "0",
        "HOME": str(paths.state / "git-home"),
        "PATH": os.environ["PATH"],
        "SYSTEMROOT": os.environ["SYSTEMROOT"],
    }


def _authority_snapshot(task: AlphaTask) -> bytes:
    task_json = task.model_dump(mode="json")
    payload = {
        "task": task_json,
        "task_digest": content_digest(task_json),
    }
    return (json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def _write_authority_snapshot(paths: AlphaTrialPaths, task: AlphaTask) -> None:
    raw = _authority_snapshot(task)
    write_bounded_artifact(paths, task, _AUTHORITY_RELATIVE_PATH, raw)


def _load_authority_snapshot(paths: AlphaTrialPaths) -> AlphaTask:
    _, target = _artifact_relative(paths, _AUTHORITY_RELATIVE_PATH)
    try:
        raw = target.read_bytes()
        payload = json.loads(raw.decode("utf-8"))
        task_data = payload["task"]
        task_digest = payload["task_digest"]
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError) as error:
        raise AlphaWorkspaceError("invalid authority snapshot") from error
    if not isinstance(task_digest, str) or content_digest(task_data) != task_digest:
        _error("invalid authority snapshot digest")
    try:
        task = AlphaTask.model_validate(task_data)
    except ValueError as error:
        raise AlphaWorkspaceError("invalid authority snapshot") from error
    if _authority_snapshot(task) != raw:
        _error("invalid authority snapshot canonical encoding")
    return task


def _run_git(paths: AlphaTrialPaths, argv: list[str]) -> bytes:
    try:
        completed = subprocess.run(
            argv,
            cwd=paths.workspace,
            env=_git_environment(paths),
            check=True,
            stdin=subprocess.DEVNULL,
            capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError):
        _error(f"git command failed: {argv[1] if len(argv) > 1 else 'git'}")
    return completed.stdout


def _walk_files(
    root: Path, *, exclude_git: bool = False, excluded_top_level: frozenset[str] = frozenset()
) -> list[tuple[str, bytes]]:
    try:
        root_info = root.lstat()
    except OSError as error:
        raise AlphaWorkspaceError(f"missing directory: {root}") from error
    if stat.S_ISLNK(root_info.st_mode) or _is_reparse(root) or not stat.S_ISDIR(root_info.st_mode):
        _error(f"unsafe directory: {root}")
    entries: list[tuple[str, bytes]] = []

    def visit(directory: Path) -> None:
        for child in sorted(directory.iterdir(), key=lambda item: item.name):
            relative = child.relative_to(root).as_posix()
            info = child.lstat()
            if stat.S_ISLNK(info.st_mode) or _is_reparse(child):
                _error(f"symbolic link or reparse point is forbidden: {relative}")
            if stat.S_ISDIR(info.st_mode):
                if (exclude_git and child.name == ".git") or relative in excluded_top_level:
                    continue
                visit(child)
            elif stat.S_ISREG(info.st_mode):
                try:
                    entries.append((relative, child.read_bytes()))
                except OSError as error:
                    raise AlphaWorkspaceError(f"cannot read file: {relative}") from error
            else:
                _error(f"non-regular file: {relative}")

    visit(root)
    return entries


def _snapshot(entries: Mapping[str, bytes], baseline: TreeSnapshot | None = None) -> TreeSnapshot:
    files = tuple(
        FileEntry(path=path, bytes=len(raw), digest=content_digest(raw)) for path, raw in sorted(entries.items())
    )
    digest_entries = [{"path": f"seed/{item.path}", "bytes": item.bytes, "digest": item.digest} for item in files]
    baseline_entries = {item.path: item for item in baseline.files} if baseline else {}
    current_entries = {item.path: item for item in files}
    changed = [
        path
        for path in sorted(set(baseline_entries) | set(current_entries))
        if baseline_entries.get(path, FileEntry(path=path, bytes=0, digest=""))
        != current_entries.get(path, FileEntry(path=path, bytes=0, digest=""))
    ]
    changed_bytes = sum(
        max(baseline_entries.get(path, _empty_entry(path)).bytes, current_entries.get(path, _empty_entry(path)).bytes)
        for path in changed
    )
    return TreeSnapshot(
        digest=content_digest(json.dumps(digest_entries, ensure_ascii=False, sort_keys=True, separators=(",", ":"))),
        files=files,
        total_bytes=sum(item.bytes for item in files),
        changed_files=len(changed),
        changed_bytes=changed_bytes,
    )


def snapshot_tree(root: Path) -> TreeSnapshot:
    return _snapshot(dict(_walk_files(root, exclude_git=True)))


def _empty_entry(path: str) -> FileEntry:
    return FileEntry(path=path, bytes=0, digest="")


def create_trial_workspace(
    data_root: Path, trial_id: str, bundle: AlphaTaskBundle
) -> tuple[AlphaTrialPaths, TreeSnapshot]:
    return _create_trial_workspace(data_root, trial_id, bundle, allowed_drive=_PUBLIC_DRIVE)


def _create_trial_workspace(
    data_root: Path, trial_id: str, bundle: AlphaTaskBundle, *, allowed_drive: str
) -> tuple[AlphaTrialPaths, TreeSnapshot]:
    root = _validate_data_root(data_root, allowed_drive=allowed_drive)
    _validate_trial_id(trial_id)
    trial_dir = root / "runs" / trial_id
    if any("," in str(path)
        for path in (root, trial_dir, trial_dir / "workspace", trial_dir / "state", trial_dir / "logs")
    ):
        _error("Docker mount path cannot contain a comma")
    if trial_dir.exists():
        _error(f"trial directory already exists: {trial_dir}")
    paths = AlphaTrialPaths(
        trial_id=trial_id,
        data_root=root,
        trial_dir=trial_dir,
        workspace=trial_dir / "workspace",
        state=trial_dir / "state",
        logs=trial_dir / "logs",
        diff_patch=trial_dir / "diff.patch",
        trial_manifest_json=trial_dir / "trial-manifest.json",
        trial_result_json=trial_dir / "trial-result.json",
    )
    try:
        paths.workspace.parent.mkdir(parents=True, exist_ok=False)
        paths.state.mkdir()
        paths.logs.mkdir()
        (paths.state / "docker-config").mkdir()
        (paths.state / "git-home").mkdir()
        shutil.copytree(bundle.root / "seed", paths.workspace)
    except OSError as error:
        raise AlphaWorkspaceError(f"cannot create trial workspace: {trial_dir}") from error
    baseline = snapshot_tree(paths.workspace)
    if baseline.digest != bundle.task.baseline_tree_digest:
        _error("baseline tree digest mismatch")
    _run_git(paths, ["git", "init"])
    _run_git(paths, ["git", "-c", "core.autocrlf=false", "-c", "core.hooksPath=NUL", "add", "--all"])
    _run_git(
        paths,
        [
            "git",
            "-c",
            "user.name=Tianwen Alpha",
            "-c",
            "user.email=alpha@invalid",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.hooksPath=NUL",
            "commit",
            "--no-gpg-sign",
            "-m",
            "alpha baseline",
        ],
    )
    _write_authority_snapshot(paths, bundle.task)
    _TASK_BY_TRIAL_DIR[paths.trial_dir.resolve()] = bundle.task
    return paths, snapshot_tree(paths.workspace)


def _relative_target(root: Path, value: object) -> tuple[str, Path]:
    if not isinstance(value, str) or not value:
        _error("path must be a non-empty relative path")
    candidate = Path(value)
    invalid_part = any(part in ("", ".", "..") for part in candidate.parts)
    if candidate.is_absolute() or "\\" in value or "," in value or invalid_part:
        _error("path must be a safe relative path")
    resolved_root = root.resolve(strict=True)
    target = (resolved_root / candidate).resolve(strict=False)
    try:
        target.relative_to(resolved_root)
    except ValueError:
        _error("path escapes workspace")
    return candidate.as_posix(), target


def _matches(path: str, patterns: Iterable[str]) -> bool:
    pure_path = PurePosixPath(path)
    return any(
        path == pattern or pure_path.match(pattern) or fnmatch.fnmatchcase(path, pattern) for pattern in patterns
    )


def _project_content(current: bytes | None, tool_name: str, args: dict[str, Any]) -> bytes | None:
    if tool_name == "create_directory":
        return current
    if tool_name == "write_file":
        content = args.get("content")
        if not isinstance(content, str):
            _error("write_file content must be text")
        return content.encode("utf-8")
    if tool_name == "edit_file":
        if current is None:
            _error("edit_file target does not exist")
        old_text = args.get("old_text")
        new_text = args.get("new_text")
        if not isinstance(old_text, str) or not isinstance(new_text, str):
            _error("edit_file text must be text")
        try:
            text = current.decode("utf-8")
        except UnicodeDecodeError as error:
            raise AlphaWorkspaceError("edit_file target is not UTF-8 text") from error
        if text.count(old_text) != 1:
            _error("edit_file old_text must match exactly once")
        return text.replace(old_text, new_text, 1).encode("utf-8")
    _error(f"unsupported file action: {tool_name}")


def project_file_action(
    workspace: Path, baseline: TreeSnapshot, task: AlphaTask, tool_name: str, args: dict[str, Any]
) -> TreeSnapshot:
    relative, target = _relative_target(workspace, args.get("path"))
    if _matches(relative, task.protected_patterns):
        _error("path is protected")
    if not _matches(relative, task.allowed_write_patterns):
        _error("path is not allowed")
    current_entries = dict(_walk_files(workspace, exclude_git=True))
    current = current_entries.get(relative)
    expected_hash = args.get("expected_hash")
    if expected_hash is not None:
        if not isinstance(expected_hash, str) or current is None or content_digest(current) != expected_hash:
            _error("expected_hash does not match current file")
    projected_content = _project_content(current, tool_name, args)
    if tool_name == "create_directory":
        if target.exists() and not target.is_dir():
            _error("create_directory target is a file")
    elif projected_content is not None:
        current_entries[relative] = projected_content
    projected = _snapshot(current_entries, baseline)
    if projected.changed_files > task.limits.max_changed_files:
        _error("projected changed files exceed limit")
    if projected.changed_bytes > task.limits.max_changed_bytes:
        _error("projected changed bytes exceed limit")
    return projected


def capture_git_evidence(paths: AlphaTrialPaths) -> GitEvidence:
    status = _run_git(paths, ["git", "--no-pager", "status", "--short", "--untracked-files=all"])
    patch = _run_git(
        paths,
        [
            "git", "--no-pager", "-c", "diff.external=", "diff", "--no-ext-diff", "--no-textconv",
            "--binary", "HEAD", "--",
        ],
    )
    numstat = _run_git(
        paths,
        [
            "git", "--no-pager", "-c", "diff.external=", "diff", "--no-ext-diff", "--no-textconv",
            "--numstat", "HEAD", "--",
        ],
    )
    write_bounded_artifact(paths, _task_for_artifact_limit(paths), "diff.patch", patch)
    changed_files = tuple(line[3:] for line in status.decode("utf-8", errors="replace").splitlines() if len(line) >= 4)
    return GitEvidence(
        changed_files=changed_files,
        numstat=tuple(numstat.decode("utf-8", errors="replace").splitlines()),
        patch_digest=content_digest(patch),
        final_tree_digest=snapshot_tree(paths.workspace).digest,
    )


def _task_for_artifact_limit(paths: AlphaTrialPaths) -> AlphaTask:
    try:
        return _TASK_BY_TRIAL_DIR[paths.trial_dir.resolve(strict=True)]
    except KeyError:
        task = _load_authority_snapshot(paths)
        _TASK_BY_TRIAL_DIR[paths.trial_dir.resolve(strict=True)] = task
        return task


def _artifact_relative(paths: AlphaTrialPaths, relative_path: str) -> tuple[str, Path]:
    if not isinstance(relative_path, str) or not relative_path:
        _error("artifact path must be relative")
    candidate = Path(relative_path)
    if candidate.is_absolute() or "\\" in relative_path or any(part in ("", ".", "..") for part in candidate.parts):
        _error("artifact path must be relative")
    target = (paths.trial_dir.resolve(strict=True) / candidate).resolve(strict=False)
    try:
        target.relative_to(paths.trial_dir.resolve(strict=True))
    except ValueError:
        _error("artifact path escapes trial directory")
    return candidate.as_posix(), target


def _trial_size(paths: AlphaTrialPaths) -> int:
    return sum(len(raw) for _, raw in _walk_files(paths.trial_dir))


def write_bounded_artifact(
    paths: AlphaTrialPaths,
    task: AlphaTask,
    relative_path: str,
    raw: bytes,
    *,
    reserve_bytes: int = 0,
) -> Path:
    if not isinstance(raw, bytes):
        _error("artifact content must be bytes")
    relative, target = _artifact_relative(paths, relative_path)
    if relative.startswith("logs/") and len(raw) > HARD_MAX_LOG_BYTES:
        _error("log exceeds HARD_MAX_LOG_BYTES")
    if target.exists():
        if not target.is_file() or target.read_bytes() != raw:
            _error("immutable artifact cannot be replaced")
        return target
    required_reserve = reserve_bytes if relative == "trial-result.json" else max(reserve_bytes, _RESULT_RESERVE_BYTES)
    projected_size = _trial_size(paths) + len(raw) + required_reserve
    if projected_size > task.limits.max_trial_bytes:
        _error("artifact would exceed trial limit including trial-result reserve")
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
        temporary.write_bytes(raw)
        os.replace(temporary, target)
    except OSError as error:
        raise AlphaWorkspaceError(f"cannot write artifact: {relative}") from error
    return target


def artifact_entries(paths: AlphaTrialPaths, relative_paths: Iterable[str]) -> tuple[ArtifactEntry, ...]:
    if _trial_size(paths) > _task_for_artifact_limit(paths).limits.max_trial_bytes:
        _error("trial directory exceeds frozen artifact limit")
    entries: list[ArtifactEntry] = []
    for relative_path in relative_paths:
        relative, target = _artifact_relative(paths, relative_path)
        if relative == "trial-result.json":
            _error("trial-result.json is not an artifact entry")
        if not target.is_file():
            _error(f"missing artifact: {relative}")
        raw = target.read_bytes()
        entries.append(
            ArtifactEntry(
                path=relative,
                artifact_type=target.parent.name or "trial",
                digest=content_digest(raw),
                bytes=len(raw),
            )
        )
    return tuple(entries)


def scan_for_credential_value(paths: AlphaTrialPaths, sentinel: str) -> tuple[str, ...]:
    if not sentinel:
        return ()
    needle = sentinel.encode("utf-8")
    locations: list[str] = []
    for relative, raw in _walk_files(
        paths.trial_dir, exclude_git=True, excluded_top_level=frozenset({"workspace"})
    ):
        if needle in raw:
            locations.append(relative)
    return tuple(sorted(set(locations)))
