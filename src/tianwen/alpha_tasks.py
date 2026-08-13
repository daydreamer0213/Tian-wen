from __future__ import annotations

import json
import re
import stat
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import Field, ValidationError

from tianwen.domain import FrozenModel, content_digest

ALPHA_TASK_SCHEMA = "tianwen.alpha_task.v1"
ALPHA_IMAGE_SCHEMA = "tianwen.alpha_image.v1"
HARD_MAX_SEED_BYTES = 4 * 1024 * 1024
HARD_MAX_CHANGED_FILES = 12
HARD_MAX_CHANGED_BYTES = 512 * 1024
HARD_MAX_TRIAL_BYTES = 64 * 1024 * 1024
HARD_MAX_MEMORY_BYTES = 256 * 1024 * 1024
HARD_MAX_PIDS = 64
HARD_MAX_TMPFS_BYTES = 64 * 1024 * 1024
HARD_MAX_CHECK_SECONDS = 60
HARD_MAX_LOG_BYTES = 256 * 1024
HARD_MAX_CPUS = 1.0

_ID = re.compile(r"^[A-Za-z0-9_-]+$")
_FORBIDDEN_ARGV = ("{", "}", "\n", "\0", "&&", "||", ";", "|", ">", "<")
_SENSITIVE_SEED_NAMES = (".git", ".gitattributes", ".env", "key", "token", "cookie", "credential", "private")


class AlphaTaskError(ValueError):
    """A task package is not a complete, safe frozen authority."""


class AlphaImageLock(FrozenModel):
    schema_version: Literal["tianwen.alpha_image.v1"]
    reference: str
    immutable_reference: str
    platform: Literal["linux/amd64"]
    manifest_digest: str
    platform_digest: str


class AlphaCheckSpec(FrozenModel):
    check_id: str
    script: str
    script_digest: str
    argv: tuple[str, ...]
    timeout_seconds: int = Field(gt=0, le=HARD_MAX_CHECK_SECONDS)
    output_limit_bytes: int = Field(gt=0, le=HARD_MAX_LOG_BYTES)


class AlphaVerifierSpec(FrozenModel):
    verifier_id: Literal["final"]
    digest: str
    argv: tuple[str, ...]
    timeout_seconds: int = Field(gt=0, le=HARD_MAX_CHECK_SECONDS)
    output_limit_bytes: int = Field(gt=0, le=HARD_MAX_LOG_BYTES)


class AlphaRoundSpec(FrozenModel):
    round_id: str
    instruction_digest: str
    public_check_ids: tuple[str, ...]
    follow_up_feedback_digest: str | None = None


class AlphaLimits(FrozenModel):
    max_seed_bytes: int = Field(gt=0, le=HARD_MAX_SEED_BYTES)
    max_changed_files: int = Field(gt=0, le=HARD_MAX_CHANGED_FILES)
    max_changed_bytes: int = Field(gt=0, le=HARD_MAX_CHANGED_BYTES)
    max_trial_bytes: int = Field(gt=0, le=HARD_MAX_TRIAL_BYTES)
    min_free_bytes: int = Field(ge=0)
    memory_bytes: int = Field(gt=0, le=HARD_MAX_MEMORY_BYTES)
    cpus: float = Field(gt=0, le=HARD_MAX_CPUS)
    pids: int = Field(gt=0, le=HARD_MAX_PIDS)
    tmpfs_bytes: int = Field(gt=0, le=HARD_MAX_TMPFS_BYTES)


class AlphaSourceSpec(FrozenModel):
    url: str
    title: str
    retrieved_date: date
    search_results_path: str
    fetched_content_path: str
    content_digest: str
    search_results_digest: str


class AlphaTask(FrozenModel):
    schema_version: Literal["tianwen.alpha_task.v1"]
    task_id: Literal["A1", "A2", "A3", "A4", "A5"]
    task_version: str
    title: str
    instruction_digest: str
    rounds: tuple[AlphaRoundSpec, ...]
    public_acceptance: tuple[str, ...]
    baseline_tree_digest: str
    container_image_digest: str
    named_checks: tuple[AlphaCheckSpec, ...]
    final_verifier: AlphaVerifierSpec
    limits: AlphaLimits
    allowed_write_patterns: tuple[str, ...]
    protected_patterns: tuple[str, ...]
    sources: tuple[AlphaSourceSpec, ...] = ()


@dataclass(frozen=True)
class AlphaTaskBundle:
    root: Path
    image_lock_path: Path
    task: AlphaTask
    image_lock: AlphaImageLock
    instruction: str
    feedback_by_round: Mapping[str, str]
    task_bundle_digest: str
    model_input_digest: str


def _error(message: str) -> None:
    raise AlphaTaskError(message)


def _is_reparse(path: Path) -> bool:
    return bool(getattr(path.lstat(), "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0))


def _regular(path: Path, *, label: str) -> bytes:
    try:
        info = path.lstat()
    except OSError as error:
        raise AlphaTaskError(f"missing {label}: {path}") from error
    if stat.S_ISLNK(info.st_mode) or _is_reparse(path):
        _error(f"symbolic link or reparse point is forbidden: {path}")
    if not stat.S_ISREG(info.st_mode):
        _error(f"non-regular {label}: {path}")
    try:
        return path.read_bytes()
    except OSError as error:
        raise AlphaTaskError(f"cannot read {label}: {path}") from error


def _walk(root: Path) -> list[tuple[Path, bytes]]:
    try:
        root_info = root.lstat()
    except OSError as error:
        raise AlphaTaskError(f"missing directory: {root}") from error
    if stat.S_ISLNK(root_info.st_mode) or _is_reparse(root):
        _error(f"symbolic link or reparse point is forbidden: {root}")
    if not stat.S_ISDIR(root_info.st_mode):
        _error(f"not a directory: {root}")
    result: list[tuple[Path, bytes]] = []

    def visit(directory: Path) -> None:
        try:
            entries = sorted(directory.iterdir(), key=lambda item: item.name)
        except OSError as error:
            raise AlphaTaskError(f"cannot list directory: {directory}") from error
        for entry in entries:
            info = entry.lstat()
            if stat.S_ISLNK(info.st_mode) or _is_reparse(entry):
                _error(f"symbolic link or reparse point is forbidden: {entry}")
            if stat.S_ISDIR(info.st_mode):
                visit(entry)
            elif stat.S_ISREG(info.st_mode):
                result.append((entry.relative_to(root), _regular(entry, label="file")))
            else:
                _error(f"non-regular file: {entry}")

    visit(root)
    return result


def _entries(items: Iterable[tuple[str, bytes]]) -> list[dict[str, object]]:
    return [
        {"path": path, "bytes": len(raw), "digest": content_digest(raw)}
        for path, raw in sorted(items, key=lambda item: item[0])
    ]


def _entries_digest(entries: list[dict[str, object]]) -> str:
    return content_digest(json.dumps(entries, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def directory_digest(root: Path, *, logical_prefix: str = "") -> str:
    _walk(root)
    resolved = root.resolve(strict=True)
    entries = ((f"{logical_prefix}{relative.as_posix()}", raw) for relative, raw in _walk(resolved))
    return _entries_digest(_entries(entries))


def _load_json(path: Path, model: type[AlphaTask] | type[AlphaImageLock]) -> AlphaTask | AlphaImageLock:
    try:
        value = json.loads(_regular(path, label="JSON").decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AlphaTaskError(f"invalid JSON: {path}") from error
    try:
        return model.model_validate(value)
    except ValidationError as error:
        raise AlphaTaskError(f"invalid frozen authority: {error}") from error


def _safe_relative(value: str, *, directory: str | None = None, suffix: str | None = None) -> Path:
    candidate = Path(value)
    if not value or candidate.is_absolute() or "\\" in value or any(
        part in ("", ".", "..") for part in candidate.parts
    ):
        _error(f"invalid path: {value!r}")
    expected_parts = 2 if directory is not None else 1
    if len(candidate.parts) != expected_parts:
        _error(f"invalid path: {value!r}")
    if directory is not None and candidate.parts[0] != directory:
        _error(f"invalid path: {value!r}")
    if suffix is not None and candidate.suffix != suffix:
        _error(f"invalid path: {value!r}")
    return candidate


def _validate_id(value: str, *, label: str) -> None:
    if not _ID.fullmatch(value):
        _error(f"invalid {label}: {value!r}")


def _validate_argv(argv: tuple[str, ...], expected: tuple[str, ...], *, label: str) -> None:
    if any(any(token in item for token in _FORBIDDEN_ARGV) for item in argv) or argv != expected:
        _error(f"invalid {label} argv")


def _validate_limits(limits: AlphaLimits, seed_bytes: int) -> None:
    ceiling = {
        "max_seed_bytes": HARD_MAX_SEED_BYTES,
        "max_changed_files": HARD_MAX_CHANGED_FILES,
        "max_changed_bytes": HARD_MAX_CHANGED_BYTES,
        "max_trial_bytes": HARD_MAX_TRIAL_BYTES,
        "memory_bytes": HARD_MAX_MEMORY_BYTES,
        "pids": HARD_MAX_PIDS,
        "tmpfs_bytes": HARD_MAX_TMPFS_BYTES,
        "timeout_seconds": HARD_MAX_CHECK_SECONDS,
        "output_limit_bytes": HARD_MAX_LOG_BYTES,
    }
    for name, maximum in ceiling.items():
        if name in ("timeout_seconds", "output_limit_bytes"):
            continue
        value = getattr(limits, name)
        if value <= 0 or value > maximum:
            _error(f"invalid {name}")
    if not 0 < limits.cpus <= HARD_MAX_CPUS:
        _error("invalid cpus")
    if seed_bytes > limits.max_seed_bytes or seed_bytes > HARD_MAX_SEED_BYTES:
        _error("seed exceeds max_seed_bytes")


def _validate_seed(root: Path) -> int:
    entries = _walk(root / "seed")
    for relative, raw in entries:
        name = relative.as_posix().casefold()
        is_git = any(part.casefold() == ".git" for part in relative.parts)
        private_key = b"-----BEGIN " in raw and b"PRIVATE KEY-----" in raw
        if is_git or private_key or any(token in name for token in _SENSITIVE_SEED_NAMES):
            _error(f"sensitive seed file: {relative}")
    return sum(len(raw) for _, raw in entries)


def _recorded_url(raw: bytes, url: str, *, kind: str) -> None:
    if kind == "search":
        try:
            decoded = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise AlphaTaskError("invalid source search_results JSON") from error

        def values(value: object) -> Iterable[str]:
            if isinstance(value, dict):
                for item in value.values():
                    yield from values(item)
            elif isinstance(value, list):
                for item in value:
                    yield from values(item)
            elif isinstance(value, str):
                yield value

        present = url in set(values(decoded))
    else:
        present = url in raw.decode("utf-8", errors="replace")
    if not present:
        _error(f"recorded {kind} URL does not match source URL")


def _validate_source(root: Path, task: AlphaTask) -> list[tuple[str, bytes]]:
    if task.task_id != "A3":
        if task.sources:
            _error("only A3 may declare sources")
        if (root / "sources").exists():
            _error("only A3 may contain sources")
        return []
    if len(task.sources) != 1:
        _error("A3 must declare exactly one HTTPS source")
    source = task.sources[0]
    if urlsplit(source.url).scheme != "https" or not urlsplit(source.url).netloc:
        _error("A3 source must use HTTPS")
    search_path = _safe_relative(source.search_results_path, directory="sources")
    content_path = _safe_relative(source.fetched_content_path, directory="sources")
    search = _regular(root / search_path, label="source")
    content = _regular(root / content_path, label="source")
    _recorded_url(search, source.url, kind="search")
    _recorded_url(content, source.url, kind="fetch")
    if content_digest(search) != source.search_results_digest or content_digest(content) != source.content_digest:
        _error("source digest mismatch")
    actual = {relative for relative, _ in _walk(root / "sources")}
    expected = {search_path.relative_to("sources"), content_path.relative_to("sources")}
    if actual != expected:
        _error("unrecognized source file")
    return [(source.search_results_path, search), (source.fetched_content_path, content)]


def _validate_task_files(root: Path, task: AlphaTask) -> tuple[str, dict[str, str], list[tuple[str, bytes]]]:
    instruction_raw = _regular(root / "instruction.md", label="instruction")
    instruction = instruction_raw.decode("utf-8")
    if content_digest(instruction_raw) != task.instruction_digest:
        _error("instruction digest mismatch")
    seed_bytes = _validate_seed(root)
    _validate_limits(task.limits, seed_bytes)
    seed_digest = directory_digest(root / "seed", logical_prefix="seed/")
    if seed_digest != task.baseline_tree_digest:
        _error("baseline tree digest mismatch")

    check_ids: set[str] = set()
    checks: list[tuple[str, bytes]] = []
    for check in task.named_checks:
        _validate_id(check.check_id, label="check_id")
        if check.check_id in check_ids:
            _error("duplicate check_id")
        check_ids.add(check.check_id)
        script = _safe_relative(check.script, suffix=".py")
        raw = _regular(root / "checks" / script, label="check script")
        if content_digest(raw) != check.script_digest:
            _error("check script digest mismatch")
        valid_limits = (
            0 < check.timeout_seconds <= HARD_MAX_CHECK_SECONDS
            and 0 < check.output_limit_bytes <= HARD_MAX_LOG_BYTES
        )
        if not valid_limits:
            _error("invalid check limits")
        _validate_argv(check.argv, ("python", "-I", f"/checks/{check.script}", "/workspace"), label="check")
        checks.append((f"checks/{check.script}", raw))
    if {relative for relative, _ in _walk(root / "checks")} != {Path(check.script) for check in task.named_checks}:
        _error("unrecognized check script")

    verifier = _regular(root / "verifier" / "verify.py", label="verifier")
    if content_digest(verifier) != task.final_verifier.digest:
        _error("verifier digest mismatch")
    verifier_limits = (
        0 < task.final_verifier.timeout_seconds <= HARD_MAX_CHECK_SECONDS
        and 0 < task.final_verifier.output_limit_bytes <= HARD_MAX_LOG_BYTES
    )
    if not verifier_limits:
        _error("invalid verifier limits")
    _validate_argv(task.final_verifier.argv, ("python", "-I", "/checks/verify.py", "/workspace"), label="verifier")
    if {relative for relative, _ in _walk(root / "verifier")} != {Path("verify.py")}:
        _error("unrecognized verifier file")
    if {relative for relative, _ in _walk(root / "reference")} != {Path("solution.patch")}:
        _error("reference must contain only solution.patch")
    return instruction, {}, checks + [("verifier/verify.py", verifier)]


def _validate_rounds(root: Path, task: AlphaTask) -> dict[str, str]:
    check_ids = {check.check_id for check in task.named_checks}
    round_ids: set[str] = set()
    feedback: dict[str, str] = {}
    for round_spec in task.rounds:
        _validate_id(round_spec.round_id, label="round_id")
        if round_spec.round_id in round_ids:
            _error("duplicate round_id")
        round_ids.add(round_spec.round_id)
        if round_spec.instruction_digest != task.instruction_digest:
            _error("round instruction digest mismatch")
        if not round_spec.public_check_ids or any(
            check_id not in check_ids for check_id in round_spec.public_check_ids
        ):
            _error("round references unknown check")
        if task.task_id != "A5" and round_spec.follow_up_feedback_digest is not None:
            _error("only A5 may bind feedback")
    if task.task_id in {"A1", "A2", "A3", "A4"}:
        if len(task.rounds) != 1:
            _error("A1-A4 require exactly one round")
        if (root / "feedback").exists():
            _error("A1-A4 may not contain feedback")
    else:
        if round_ids != {"round-1", "round-2"}:
            _error("A5 requires round-1 and round-2")
        by_id = {round_spec.round_id: round_spec for round_spec in task.rounds}
        if by_id["round-1"].follow_up_feedback_digest is not None or by_id["round-2"].follow_up_feedback_digest is None:
            _error("A5 binds feedback only in round-2")
        raw = _regular(root / "feedback" / "round-2.md", label="feedback")
        if content_digest(raw) != by_id["round-2"].follow_up_feedback_digest:
            _error("feedback digest mismatch")
        if {relative for relative, _ in _walk(root / "feedback")} != {Path("round-2.md")}:
            _error("unrecognized feedback file")
        feedback["round-2"] = raw.decode("utf-8")
    return feedback


def _validate_patterns(task: AlphaTask) -> None:
    for pattern in (*task.allowed_write_patterns, *task.protected_patterns):
        if not pattern or Path(pattern).is_absolute() or "\\" in pattern or ".." in Path(pattern).parts:
            _error("invalid path pattern")


def _all_task_entries(root: Path, lock_path: Path) -> list[tuple[str, bytes]]:
    return [("image.lock", _regular(lock_path, label="image lock"))] + [
        (relative.as_posix(), raw) for relative, raw in _walk(root)
    ]


def _validate_task_layout(root: Path, task: AlphaTask) -> None:
    allowed = {"task.json", "instruction.md", "seed", "checks", "verifier", "reference"}
    if task.task_id == "A5":
        allowed.add("feedback")
    if task.task_id == "A3":
        allowed.add("sources")
    actual = {entry.name for entry in root.iterdir()}
    if not actual <= allowed:
        _error("unrecognized task file")


def load_task_bundle(task_dir: Path, image_lock_path: Path) -> AlphaTaskBundle:
    _walk(task_dir)
    _regular(image_lock_path, label="image lock")
    root = task_dir.resolve(strict=True)
    lock_path = image_lock_path.resolve(strict=True)
    task = _load_json(root / "task.json", AlphaTask)
    image_lock = _load_json(lock_path, AlphaImageLock)
    assert isinstance(task, AlphaTask)
    assert isinstance(image_lock, AlphaImageLock)
    if root.name != task.task_id:
        _error("task directory name must equal task_id")
    _validate_id(task.task_id, label="task_id")
    if task.container_image_digest != image_lock.manifest_digest:
        _error("container image digest mismatch")
    if not image_lock.immutable_reference.endswith("@" + image_lock.manifest_digest):
        _error("immutable image reference does not bind manifest digest")
    _validate_task_layout(root, task)
    _validate_patterns(task)
    instruction, _, _ = _validate_task_files(root, task)
    feedback = _validate_rounds(root, task)
    sources = _validate_source(root, task)
    model_entries = [("instruction.md", instruction.encode("utf-8"))]
    model_entries.extend((f"feedback/{round_id}.md", text.encode("utf-8")) for round_id, text in feedback.items())
    model_entries.extend((f"seed/{relative.as_posix()}", raw) for relative, raw in _walk(root / "seed"))
    model_entries.extend(sources)
    return AlphaTaskBundle(
        root=root,
        image_lock_path=lock_path,
        task=task,
        image_lock=image_lock,
        instruction=instruction,
        feedback_by_round=feedback,
        task_bundle_digest=_entries_digest(_entries(_all_task_entries(root, lock_path))),
        model_input_digest=_entries_digest(_entries(model_entries)),
    )


def _raw_mapping(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(_regular(path, label="task JSON").decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AlphaTaskError("invalid task JSON") from error
    if not isinstance(value, dict):
        _error("task JSON must be an object")
    return value


def _fill_derived(mapping: dict[str, Any], key: str, value: str) -> None:
    mapping[key] = value


def freeze_task_bundle(task_dir: Path, image_lock_path: Path) -> AlphaTaskBundle:
    _walk(task_dir)
    _regular(image_lock_path, label="image lock")
    root = task_dir.resolve(strict=True)
    lock_path = image_lock_path.resolve(strict=True)
    raw = _raw_mapping(root / "task.json")
    image_lock = _load_json(lock_path, AlphaImageLock)
    assert isinstance(image_lock, AlphaImageLock)
    _fill_derived(raw, "instruction_digest", content_digest(_regular(root / "instruction.md", label="instruction")))
    _fill_derived(raw, "baseline_tree_digest", directory_digest(root / "seed", logical_prefix="seed/"))
    _fill_derived(raw, "container_image_digest", image_lock.manifest_digest)
    rounds = raw.get("rounds")
    if not isinstance(rounds, list):
        _error("rounds must be a list")
    for round_raw in rounds:
        if not isinstance(round_raw, dict):
            _error("round must be an object")
        _fill_derived(round_raw, "instruction_digest", raw["instruction_digest"])
        if round_raw.get("round_id") == "round-2" and raw.get("task_id") == "A5":
            _fill_derived(
                round_raw,
                "follow_up_feedback_digest",
                content_digest(_regular(root / "feedback" / "round-2.md", label="feedback")),
            )
    checks = raw.get("named_checks")
    if not isinstance(checks, list):
        _error("named_checks must be a list")
    for check in checks:
        if not isinstance(check, dict) or not isinstance(check.get("script"), str):
            _error("check must contain script")
        script = _safe_relative(check["script"], suffix=".py")
        _fill_derived(check, "script_digest", content_digest(_regular(root / "checks" / script, label="check script")))
    verifier = raw.get("final_verifier")
    if not isinstance(verifier, dict):
        _error("final_verifier must be an object")
    _fill_derived(verifier, "digest", content_digest(_regular(root / "verifier" / "verify.py", label="verifier")))
    sources = raw.get("sources", [])
    if not isinstance(sources, list):
        _error("sources must be a list")
    for source in sources:
        if not isinstance(source, dict):
            _error("source must be an object")
        search_path = source.get("search_results_path")
        content_path = source.get("fetched_content_path")
        if not isinstance(search_path, str) or not isinstance(content_path, str):
            _error("source paths are required")
        _fill_derived(
            source,
            "search_results_digest",
            content_digest(_regular(root / _safe_relative(search_path, directory="sources"), label="source")),
        )
        _fill_derived(
            source,
            "content_digest",
            content_digest(_regular(root / _safe_relative(content_path, directory="sources"), label="source")),
        )
    try:
        AlphaTask.model_validate(raw)
    except ValidationError as error:
        raise AlphaTaskError(f"invalid frozen authority: {error}") from error
    serialized = json.dumps(raw, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    (root / "task.json").write_text(serialized, encoding="utf-8")
    return load_task_bundle(root, lock_path)
