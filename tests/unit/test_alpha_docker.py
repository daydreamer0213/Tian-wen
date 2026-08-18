from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from tianwen.alpha_docker import (
    CheckExecutionRecord,
    CheckResult,
    DockerCheckExecutor,
    DockerExecutionError,
    VerifierResult,
)
from tianwen.alpha_tasks import freeze_task_bundle
from tianwen.alpha_workspace import _create_trial_workspace
from tianwen.domain import content_digest
from tianwen.store import StateStore

_CONTAINER_ID = "a" * 64
_INHERITED_IMAGE_ENV = (
    "PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "LANG=C.UTF-8",
    "GPG_KEY=7169605F62C751356D054A26A821E680E5FA6305",
    "PYTHON_VERSION=3.12.11",
    "PYTHON_SHA256=c30bb24b7f1e9a19b11b55a546434f74e739bb4c271a3e3a80ff4380d49f7adb",
)
_CONTROLLED_ENV = {
    "HOME": "/tmp",
    "TMPDIR": "/tmp",
    "PYTHONDONTWRITEBYTECODE": "1",
}


class _Reader:
    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = iter(chunks)

    async def read(self, _size: int) -> bytes:
        return next(self.chunks, b"")


class _Attached:
    def __init__(self, stdout: list[bytes], stderr: list[bytes], code: int) -> None:
        self.stdout = _Reader(stdout)
        self.stderr = _Reader(stderr)
        self.code = code
        self.wait_calls = 0

    async def wait(self) -> int:
        self.wait_calls += 1
        return self.code


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _bundle(tmp_path: Path):
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
    task_dir.joinpath("task.json").write_text(
        json.dumps(
            {
                "schema_version": "tianwen.alpha_task.v1",
                "task_id": "A1",
                "task_version": "1.0.0",
                "title": "Docker test",
                "rounds": [{"round_id": "round-1", "public_check_ids": ["public"]}],
                "public_acceptance": ["passes"],
                "named_checks": [
                    {
                        "check_id": "public",
                        "script": "public.py",
                        "argv": ["python", "-I", "/checks/public.py", "/workspace"],
                        "timeout_seconds": 15,
                        "output_limit_bytes": 16,
                    }
                ],
                "final_verifier": {
                    "verifier_id": "final",
                    "argv": ["python", "-I", "/checks/verify.py", "/workspace"],
                    "timeout_seconds": 15,
                    "output_limit_bytes": 1024,
                },
                "limits": {
                    "max_seed_bytes": 4096,
                    "max_changed_files": 1,
                    "max_changed_bytes": 4096,
                    "max_trial_bytes": 4 * 1024 * 1024,
                    "min_free_bytes": 0,
                    "memory_bytes": 268435456,
                    "cpus": 1.0,
                    "pids": 64,
                    "tmpfs_bytes": 1048576,
                },
                "allowed_write_patterns": ["module.py"],
                "protected_patterns": [".git/**"],
            }
        ),
        encoding="utf-8",
    )
    return freeze_task_bundle(task_dir, lock)


@pytest.fixture
def executor(tmp_path: Path) -> DockerCheckExecutor:
    bundle = _bundle(tmp_path)
    data_root = tmp_path / "data"
    data_root.mkdir()
    paths, _ = _create_trial_workspace(data_root, "trial-1", bundle, allowed_drive=data_root.drive)
    store = StateStore(paths.state / "state.db")
    store.initialize()
    return DockerCheckExecutor(paths, bundle, store, docker_executable=Path("D:/fake/docker.exe"))


def _inspect(executor: DockerCheckExecutor, action_id: str, *, code: int, running: bool = False) -> dict[str, Any]:
    script, _spec = executor._selected_script("public")
    limits = executor.bundle.task.limits
    return {
        "Id": _CONTAINER_ID,
        "Name": f"/{executor._container_name(action_id)}",
        "Config": {
            "Image": f"docker.io/library/{executor.bundle.image_lock.immutable_reference}",
            "User": "65532:65532",
            "WorkingDir": "/workspace",
            "Cmd": ["python", "-I", "/checks/public.py", "/workspace"],
            "Env": ["HOME=/tmp", "TMPDIR=/tmp", "PYTHONDONTWRITEBYTECODE=1"],
            "Labels": {
                "tianwen.alpha.action_id": action_id,
                "tianwen.alpha.config_digest": executor._normalized_config_digest("public"),
                "tianwen.alpha.trial_id": executor.paths.trial_id,
            },
        },
        "HostConfig": {
            "ReadonlyRootfs": True,
            "NetworkMode": "none",
            "CapDrop": ["ALL"],
            "SecurityOpt": ["no-new-privileges"],
            "PidsLimit": limits.pids,
            "Memory": limits.memory_bytes,
            "NanoCpus": int(limits.cpus * 1_000_000_000),
            "Tmpfs": {"/tmp": f"rw,nosuid,nodev,noexec,size={limits.tmpfs_bytes}"},
            "LogConfig": {"Type": "local", "Config": {"max-size": "16", "max-file": "1", "compress": "false"}},
        },
        "Mounts": [
            {"Type": "bind", "Source": str(executor.paths.workspace), "Destination": "/workspace", "RW": False},
            {"Type": "bind", "Source": str(script), "Destination": "/checks/public.py", "RW": False},
        ],
        "State": {"Running": running, "ExitCode": code},
    }


def _record(executor: DockerCheckExecutor, action_id: str, *, final: bool = False) -> CheckExecutionRecord:
    check_id = "final" if final else "public"
    argv, sanitized, _environment = executor._create_command(action_id, check_id, final=final)
    del argv
    return CheckExecutionRecord(
        action_id=action_id,
        container_id=_CONTAINER_ID,
        container_name=executor._container_name(action_id),
        trial_id=executor.paths.trial_id,
        check_id=check_id,
        image_digest=executor.bundle.image_lock.manifest_digest,
        normalized_config_digest=executor._normalized_config_digest(check_id, final=final),
        sanitized_argv=tuple(sanitized),
        sanitized_argv_digest=content_digest("\n".join(sanitized)),
        status="running",
        result_type="final" if final else "public",
        created_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
        deadline_at=datetime.now(UTC) + timedelta(seconds=15),
    )


def _make_final_inspect(executor: DockerCheckExecutor, observed: dict[str, Any], action_id: str) -> None:
    verifier, _spec = executor._selected_script("final", final=True)
    observed["Name"] = f"/{executor._container_name(action_id)}"
    observed["Config"]["Labels"]["tianwen.alpha.action_id"] = action_id
    observed["Config"]["Labels"]["tianwen.alpha.config_digest"] = executor._normalized_config_digest(
        "final", final=True
    )
    observed["Config"]["Cmd"] = ["python", "-I", "/checks/verify.py", "/workspace"]
    observed["HostConfig"]["LogConfig"] = {
        "Type": "local",
        "Config": {
            "max-size": str(executor.bundle.task.final_verifier.output_limit_bytes),
            "max-file": "1",
            "compress": "false",
        },
    }
    observed["Mounts"][1] = {
        "Type": "bind",
        "Source": str(verifier),
        "Destination": "/checks/verify.py",
        "RW": False,
    }


def test_create_argv_has_every_required_boundary_and_only_two_mounts(executor: DockerCheckExecutor) -> None:
    argv, sanitized, environment = executor._create_command(action_id="action:one", check_id="public")
    joined = "\n".join(argv)

    assert argv[0] == str(executor.docker_executable)
    assert "--network" in argv and "none" in argv
    assert "--read-only" in argv
    assert "--user" in argv and "65532:65532" in argv
    assert argv.count("--cap-drop") == 1 and "ALL" in argv
    assert "no-new-privileges" in joined
    assert "--pids-limit" in argv and "64" in argv
    assert "--memory" in argv and "268435456" in argv
    assert "--cpus" in argv and "1.0" in argv
    assert "--pull" in argv and "never" in argv
    assert tuple(argv[index + 1] for index, value in enumerate(argv) if value == "--log-opt") == (
        "max-size=16",
        "max-file=1",
        "compress=false",
    )
    assert sum(item.startswith("type=bind,") for item in argv) == 2
    assert "docker.sock" not in joined.casefold()
    assert f"docker.io/library/{executor.bundle.image_lock.immutable_reference}" in argv
    assert executor.bundle.image_lock.immutable_reference not in argv
    assert str(executor.paths.state) not in "\n".join(sanitized)
    assert str(executor.paths.workspace) not in "\n".join(sanitized)
    assert str(executor.bundle.root / "checks" / "public.py") not in "\n".join(sanitized)
    assert "DEEPSEEK_API_KEY" not in environment


def test_normalized_local_log_configuration_disables_compression(executor: DockerCheckExecutor) -> None:
    config = executor._normalized_config("public")

    assert config["log_driver"] == "local"
    assert config["log_options"] == ("max-size=16", "max-file=1", "compress=false")


def test_recovery_identity_accepts_local_log_configuration_with_compression_disabled(
    executor: DockerCheckExecutor,
) -> None:
    record = _record(executor, "action:log-compression")
    observed = _inspect(executor, "action:log-compression", code=0)

    assert observed["HostConfig"]["LogConfig"]["Config"] == {
        "max-size": "16",
        "max-file": "1",
        "compress": "false",
    }
    assert executor._inspect_matches(record, observed)


def test_recovery_identity_accepts_image_inherited_environment(executor: DockerCheckExecutor) -> None:
    record = _record(executor, "action:inherited-env")
    observed = _inspect(executor, "action:inherited-env", code=0)
    observed["Config"]["Env"] = [
        *_INHERITED_IMAGE_ENV,
        *(f"{key}={value}" for key, value in _CONTROLLED_ENV.items()),
    ]

    assert executor._inspect_matches(record, observed)


@pytest.mark.parametrize("controlled", tuple(_CONTROLLED_ENV))
@pytest.mark.parametrize("mutation", ("missing", "changed", "duplicate"))
def test_recovery_identity_rejects_missing_changed_or_duplicate_controlled_environment(
    executor: DockerCheckExecutor, controlled: str, mutation: str
) -> None:
    record = _record(executor, f"action:controlled-env-{controlled}-{mutation}")
    observed = _inspect(executor, f"action:controlled-env-{controlled}-{mutation}", code=0)
    environment = [*_INHERITED_IMAGE_ENV, *(f"{key}={value}" for key, value in _CONTROLLED_ENV.items())]
    if mutation == "missing":
        environment = [item for item in environment if not item.startswith(f"{controlled}=")]
    elif mutation == "changed":
        environment = [
            f"{controlled}=changed" if item.startswith(f"{controlled}=") else item for item in environment
        ]
    else:
        environment.append(f"{controlled}={_CONTROLLED_ENV[controlled]}")
    observed["Config"]["Env"] = environment

    assert not executor._inspect_matches(record, observed)


@pytest.mark.parametrize(
    "environment",
    (
        {"HOME": "/tmp"},
        [*_INHERITED_IMAGE_ENV, *(f"{key}={value}" for key, value in _CONTROLLED_ENV.items()), 1],
        [*_INHERITED_IMAGE_ENV, *(f"{key}={value}" for key, value in _CONTROLLED_ENV.items()), "missing-equals"],
        [*_INHERITED_IMAGE_ENV, *(f"{key}={value}" for key, value in _CONTROLLED_ENV.items()), "=empty-key"],
    ),
)
def test_recovery_identity_rejects_malformed_observed_environment(
    executor: DockerCheckExecutor, environment: Any
) -> None:
    record = _record(executor, "action:malformed-env")
    observed = _inspect(executor, "action:malformed-env", code=0)
    observed["Config"]["Env"] = environment

    assert not executor._inspect_matches(record, observed)


@pytest.mark.anyio
async def test_create_start_stream_inspect_persists_observed_nonzero_including_125(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []

    async def checked(argv: list[str], *, kind: str, timeout: float = 10) -> tuple[bytes, bytes]:
        calls.append(kind)
        assert "docker.sock" not in " ".join(argv)
        return ((_CONTAINER_ID + "\n").encode(), b"") if kind == "create" else (b"", b"")

    async def inspected(_container_id: str) -> dict[str, Any]:
        return _inspect(executor, "action:one", code=125)

    async def spawn(_id: str) -> _Attached:
        return _Attached([b"failed\n", b""], [b""], 125)

    monkeypatch.setattr(executor, "_checked_cli", checked)
    monkeypatch.setattr(executor, "_spawn_attached", spawn)
    monkeypatch.setattr(executor, "_inspect", inspected)

    result = await executor.run("action:one", "public")

    assert result.execution_ok and result.check_passed is False and result.exit_code == 125
    assert calls == ["create"]
    assert executor._record("action:one").status == "finished"


@pytest.mark.anyio
async def test_output_limit_stops_waits_inspects_and_persists_captured_timeout(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []

    async def checked(_argv: list[str], *, kind: str, timeout: float = 10) -> tuple[bytes, bytes]:
        calls.append(kind)
        return ((_CONTAINER_ID + "\n").encode(), b"") if kind == "create" else (b"", b"")

    async def inspected(_container_id: str) -> dict[str, Any]:
        return _inspect(executor, "action:timeout", code=137)

    async def spawn(_id: str) -> _Attached:
        return _Attached([b"12345678901234567"], [b""], 137)

    async def cli(argv: list[str], *, timeout: float) -> tuple[int, bytes, bytes]:
        kind = argv[-2]
        calls.append(kind)
        return 0, b"", b""

    monkeypatch.setattr(executor, "_checked_cli", checked)
    monkeypatch.setattr(executor, "_spawn_attached", spawn)
    monkeypatch.setattr(executor, "_cli", cli)
    monkeypatch.setattr(executor, "_inspect", inspected)

    with pytest.raises(TimeoutError, match="docker_check_timeout"):
        await executor.run("action:timeout", "public")

    record = executor._record("action:timeout")
    result = CheckResult.model_validate_json(record.result_json)
    assert calls == ["create", "stop", "wait"]
    assert result.timed_out and result.stdout_digest == content_digest(b"1234567890123456")
    assert result.stderr_digest == content_digest(b"")


@pytest.mark.anyio
@pytest.mark.parametrize("failed_kind", ("stop", "wait"))
async def test_timeout_control_failure_still_inspects_and_persists_terminal_result(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch, failed_kind: str
) -> None:
    calls: list[str] = []

    async def checked(_argv: list[str], *, kind: str, timeout: float = 10) -> tuple[bytes, bytes]:
        return ((_CONTAINER_ID + "\n").encode(), b"") if kind == "create" else (b"", b"")

    async def spawn(_id: str) -> _Attached:
        return _Attached([b"x" * 17], [b""], 137)

    async def cli(argv: list[str], *, timeout: float) -> tuple[int, bytes, bytes]:
        kind = argv[-2]
        calls.append(kind)
        return (1 if kind == failed_kind else 0), b"raw-out", b"raw-err"

    async def inspected(_id: str) -> dict[str, Any]:
        return _inspect(executor, "action:control", code=137)

    monkeypatch.setattr(executor, "_checked_cli", checked)
    monkeypatch.setattr(executor, "_spawn_attached", spawn)
    monkeypatch.setattr(executor, "_cli", cli)
    monkeypatch.setattr(executor, "_inspect", inspected)

    with pytest.raises(TimeoutError, match="docker_check_timeout"):
        await executor.run("action:control", "public")

    assert calls == ["stop", "wait"]
    assert executor._record("action:control").status == "failed"


@pytest.mark.anyio
async def test_timeout_stop_cli_exception_still_inspects_exact_terminal_container(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def checked(_argv: list[str], *, kind: str, timeout: float = 10) -> tuple[bytes, bytes]:
        return ((_CONTAINER_ID + "\n").encode(), b"") if kind == "create" else (b"", b"")

    async def spawn(_id: str) -> _Attached:
        return _Attached([b"x" * 17], [b""], 137)

    async def cli(argv: list[str], *, timeout: float) -> tuple[int, bytes, bytes]:
        if argv[-2] == "stop":
            raise DockerExecutionError("docker_command_unavailable")
        return 0, b"", b""

    async def inspected(_id: str) -> dict[str, Any]:
        return _inspect(executor, "action:stop-exception", code=137)

    monkeypatch.setattr(executor, "_checked_cli", checked)
    monkeypatch.setattr(executor, "_spawn_attached", spawn)
    monkeypatch.setattr(executor, "_cli", cli)
    monkeypatch.setattr(executor, "_inspect", inspected)

    with pytest.raises(TimeoutError, match="docker_check_timeout"):
        await executor.run("action:stop-exception", "public")

    assert executor._record("action:stop-exception").status == "failed"


@pytest.mark.anyio
async def test_timeout_control_running_inspect_keeps_durable_running_record(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def checked(_argv: list[str], *, kind: str, timeout: float = 10) -> tuple[bytes, bytes]:
        return ((_CONTAINER_ID + "\n").encode(), b"") if kind == "create" else (b"", b"")

    async def spawn(_id: str) -> _Attached:
        return _Attached([b"x" * 17], [b""], 1)

    async def cli(_argv: list[str], *, timeout: float) -> tuple[int, bytes, bytes]:
        return 1, b"raw-out", b"raw-err"

    async def inspected(_id: str) -> dict[str, Any]:
        return _inspect(executor, "action:running", code=0, running=True)

    monkeypatch.setattr(executor, "_checked_cli", checked)
    monkeypatch.setattr(executor, "_spawn_attached", spawn)
    monkeypatch.setattr(executor, "_cli", cli)
    monkeypatch.setattr(executor, "_inspect", inspected)

    with pytest.raises(DockerExecutionError, match="docker_timeout_control_unverified"):
        await executor.run("action:running", "public")

    assert executor._record("action:running").status == "running"


@pytest.mark.anyio
async def test_timeout_inspect_error_always_reaps_attached_process(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    attached = _Attached([b"x" * 17], [b""], 137)

    async def checked(_argv: list[str], *, kind: str, timeout: float = 10) -> tuple[bytes, bytes]:
        return ((_CONTAINER_ID + "\n").encode(), b"") if kind == "create" else (b"", b"")

    async def spawn(_id: str) -> _Attached:
        return attached

    secret = f"{executor.paths.workspace} DEEPSEEK_API_KEY secret-value raw-stderr"

    async def cli(argv: list[str], *, timeout: float) -> tuple[int, bytes, bytes]:
        if argv[-2] == "inspect":
            raise TimeoutError(secret)
        return 0, b"", b""

    monkeypatch.setattr(executor, "_checked_cli", checked)
    monkeypatch.setattr(executor, "_spawn_attached", spawn)
    monkeypatch.setattr(executor, "_cli", cli)

    with pytest.raises(DockerExecutionError, match="docker_timeout_control_unverified") as raised:
        await executor.run("action:inspect-error", "public")

    assert attached.wait_calls == 1
    assert executor._record("action:inspect-error").status == "running"
    assert secret not in str(raised.value)
    from tianwen.alpha_docker import CheckExecutionAudit

    audit = executor.store.get_object(
        "check_execution_audit", "action:inspect-error:check_timeout_control_failed", CheckExecutionAudit
    )
    assert secret not in audit.detail_digest


@pytest.mark.anyio
async def test_exact_output_limit_with_eof_is_not_timeout(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def checked(_argv: list[str], *, kind: str, timeout: float = 10) -> tuple[bytes, bytes]:
        return ((_CONTAINER_ID + "\n").encode(), b"") if kind == "create" else (b"", b"")

    async def spawn(_id: str) -> _Attached:
        return _Attached([b"1234567890123456", b""], [b""], 0)

    async def inspect(_id: str) -> dict[str, Any]:
        return _inspect(executor, "action:limit", code=0)

    monkeypatch.setattr(executor, "_checked_cli", checked)
    monkeypatch.setattr(executor, "_spawn_attached", spawn)
    monkeypatch.setattr(executor, "_inspect", inspect)

    result = await executor.run("action:limit", "public")

    assert result.check_passed and not result.timed_out


@pytest.mark.anyio
async def test_reconcile_final_timeout_logs_failure_still_persists_replayable_verdict(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    record = _record(executor, "action:reconcile-final", final=True).model_copy(
        update={"deadline_at": datetime.now(UTC) - timedelta(seconds=1)}
    )
    executor._save_record(record)
    running = _inspect(executor, "action:reconcile-final", code=0, running=True)
    terminal = _inspect(executor, "action:reconcile-final", code=137)
    _make_final_inspect(executor, running, "action:reconcile-final")
    _make_final_inspect(executor, terminal, "action:reconcile-final")
    inspections = iter((running, terminal, terminal))

    async def inspect(_id: str) -> dict[str, Any]:
        return next(inspections)

    async def cli(_argv: list[str], *, timeout: float) -> tuple[int, bytes, bytes]:
        return 0, b"", b""

    async def logs(_id: str, _limit: int) -> tuple[bytes, bytes]:
        raise DockerExecutionError("docker_logs_failed:exit=1")

    monkeypatch.setattr(executor, "_inspect", inspect)
    monkeypatch.setattr(executor, "_cli", cli)
    monkeypatch.setattr(executor, "_logs", logs)

    result = await executor.reconcile("action:reconcile-final")

    assert isinstance(result, VerifierResult)
    assert result.verdict == "inconclusive" and result.failure_categories == ("timeout",)
    assert await executor.reconcile("action:reconcile-final") == result


@pytest.mark.anyio
async def test_reconcile_final_timeout_logs_timeout_still_persists_replayable_verdict(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    record = _record(executor, "action:reconcile-final-timeout", final=True).model_copy(
        update={"deadline_at": datetime.now(UTC) - timedelta(seconds=1)}
    )
    executor._save_record(record)
    running = _inspect(executor, "action:reconcile-final-timeout", code=0, running=True)
    terminal = _inspect(executor, "action:reconcile-final-timeout", code=137)
    _make_final_inspect(executor, running, "action:reconcile-final-timeout")
    _make_final_inspect(executor, terminal, "action:reconcile-final-timeout")
    inspections = iter((running, terminal, terminal))

    async def inspect(_id: str) -> dict[str, Any]:
        return next(inspections)

    async def cli(_argv: list[str], *, timeout: float) -> tuple[int, bytes, bytes]:
        return 0, b"", b""

    async def logs(_id: str, _limit: int) -> tuple[bytes, bytes]:
        raise TimeoutError("docker_command_timeout")

    monkeypatch.setattr(executor, "_inspect", inspect)
    monkeypatch.setattr(executor, "_cli", cli)
    monkeypatch.setattr(executor, "_logs", logs)

    result = await executor.reconcile("action:reconcile-final-timeout")

    assert isinstance(result, VerifierResult)
    assert result.verdict == "inconclusive" and result.failure_categories == ("timeout",)
    assert await executor.reconcile("action:reconcile-final-timeout") == result


@pytest.mark.anyio
async def test_start_spawn_failure_leaves_created_record_for_never_started_recovery(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def checked(_argv: list[str], *, kind: str, timeout: float = 10) -> tuple[bytes, bytes]:
        return ((_CONTAINER_ID + "\n").encode(), b"") if kind == "create" else (b"", b"")

    async def failed_spawn(_id: str) -> _Attached:
        raise DockerExecutionError("docker_start_spawn_failed")

    monkeypatch.setattr(executor, "_checked_cli", checked)
    monkeypatch.setattr(executor, "_spawn_attached", failed_spawn)

    with pytest.raises(DockerExecutionError, match="docker_start_spawn_failed"):
        await executor.run("action:never", "public")

    record = executor._record("action:never")
    assert record.status == "created" and record.started_at is None


@pytest.mark.anyio
async def test_final_timeout_persists_inconclusive_verifier_and_replays(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def checked(_argv: list[str], *, kind: str, timeout: float = 10) -> tuple[bytes, bytes]:
        return ((_CONTAINER_ID + "\n").encode(), b"") if kind == "create" else (b"", b"")

    async def spawn(_id: str) -> _Attached:
        return _Attached([b"x" * 1025], [b""], 137)

    async def cli(_argv: list[str], *, timeout: float) -> tuple[int, bytes, bytes]:
        return 0, b"", b""

    inspected = _inspect(executor, "action:final-timeout", code=137)
    _make_final_inspect(executor, inspected, "action:final-timeout")

    async def inspect(_id: str) -> dict[str, Any]:
        return inspected

    monkeypatch.setattr(executor, "_checked_cli", checked)
    monkeypatch.setattr(executor, "_spawn_attached", spawn)
    monkeypatch.setattr(executor, "_cli", cli)
    monkeypatch.setattr(executor, "_inspect", inspect)

    with pytest.raises(TimeoutError, match="docker_check_timeout"):
        await executor.run_final("action:final-timeout")

    record = executor._record("action:final-timeout")
    result = VerifierResult.model_validate_json(record.result_json)
    assert result.verdict == "inconclusive" and result.failure_categories == ("timeout",)
    assert await executor.reconcile("action:final-timeout") == result


@pytest.mark.anyio
async def test_create_failure_never_fabricates_record_or_leaks_stderr(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    secret = f"{executor.paths.workspace}: raw Docker stderr"

    async def failed(*_args: object, **_kwargs: object) -> tuple[bytes, bytes]:
        raise DockerExecutionError("docker_create_failed:exit=1")

    monkeypatch.setattr(executor, "_checked_cli", failed)

    with pytest.raises(DockerExecutionError) as raised:
        await executor.run("action:failure", "public")

    assert secret not in str(raised.value)
    assert executor._record("action:failure") is None


@pytest.mark.anyio
async def test_final_recovery_reads_logs_and_returns_only_verifier_result(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    record = _record(executor, "action:final", final=True)
    executor._save_record(record)
    final = '{"verdict":"met","passed_checks":["public"],"failed_checks":[],"failure_categories":[],"summary":"ok"}'
    inspected = _inspect(executor, "action:final", code=0)
    inspected["Config"]["Labels"]["tianwen.alpha.config_digest"] = executor._normalized_config_digest(
        "final", final=True
    )
    inspected["Name"] = f"/{executor._container_name('action:final')}"
    verifier, _spec = executor._selected_script("final", final=True)
    final_limit = executor.bundle.task.final_verifier.output_limit_bytes
    inspected["Mounts"][1] = {
        "Type": "bind",
        "Source": str(verifier),
        "Destination": "/checks/verify.py",
        "RW": False,
    }
    inspected["Config"]["Cmd"] = ["python", "-I", "/checks/verify.py", "/workspace"]
    inspected["HostConfig"]["LogConfig"] = {
        "Type": "local",
        "Config": {"max-size": str(final_limit), "max-file": "1", "compress": "false"},
    }
    async def inspect(_id: str) -> dict[str, Any]:
        return inspected

    monkeypatch.setattr(executor, "_inspect", inspect)

    async def logs(_id: str, _limit: int) -> tuple[bytes, bytes]:
        return final.encode(), b""

    monkeypatch.setattr(executor, "_logs", logs)

    result = await executor.reconcile("action:final")

    assert isinstance(result, VerifierResult)
    assert result.verdict == "met"
    assert executor._record("action:final").status == "finished"


@pytest.mark.anyio
async def test_recovery_mismatch_is_durably_classified_without_rerun(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    record = _record(executor, "action:mismatch")
    executor._save_record(record)
    mismatch = _inspect(executor, "action:mismatch", code=0)
    mismatch["HostConfig"]["ReadonlyRootfs"] = False
    async def inspect(_id: str) -> dict[str, Any]:
        return mismatch

    monkeypatch.setattr(executor, "_inspect", inspect)

    assert await executor.reconcile("action:mismatch") is None
    from tianwen.alpha_docker import CheckExecutionAudit

    audit = executor.store.get_object(
        "check_execution_audit", "action:mismatch:check_identity_unverified", CheckExecutionAudit
    )
    assert audit.classification == "check_identity_unverified"


def test_recovery_identity_rejects_extra_or_weakened_container_configuration(executor: DockerCheckExecutor) -> None:
    record = _record(executor, "action:config")
    observed = _inspect(executor, "action:config", code=0)
    observed["HostConfig"]["NetworkMode"] = "bridge"

    assert not executor._inspect_matches(record, observed)


def test_preflight_rejects_missing_appdata_before_any_docker_command(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("APPDATA", raising=False)

    with pytest.raises(DockerExecutionError, match="docker_appdata_missing"):
        executor.preflight()


def test_recovery_identity_rejects_extra_non_bind_mount(executor: DockerCheckExecutor) -> None:
    record = _record(executor, "action:mount")
    observed = _inspect(executor, "action:mount", code=0)
    observed["Mounts"].append({"Type": "volume", "Source": "ignored", "Destination": "/extra", "RW": False})

    assert not executor._inspect_matches(record, observed)


def test_recovery_identity_requires_the_canonical_locked_image_reference(executor: DockerCheckExecutor) -> None:
    record = _record(executor, "action:canonical-image")
    observed = _inspect(executor, "action:canonical-image", code=0)

    assert executor._inspect_matches(record, observed)
    observed["Config"]["Image"] = executor.bundle.image_lock.immutable_reference
    assert not executor._inspect_matches(record, observed)


def test_preflight_uses_private_fakeable_cli_boundary(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple[str, ...]] = []
    monkeypatch.setenv("APPDATA", str(executor.paths.state))
    monkeypatch.setattr(executor, "paths", executor.paths.model_copy(update={"data_root": Path("D:/trial-data")}))
    settings = executor.paths.state / "Docker" / "settings-store.json"
    settings.parent.mkdir()
    settings.write_text(json.dumps({"dataFolder": "D:/Docker"}), encoding="utf-8")

    def fake(command: tuple[str, ...]) -> dict[str, Any]:
        calls.append(command)
        if command[0] == "version":
            return {"Client": {"Version": "test"}, "Server": {"Os": "linux", "Arch": "amd64"}}
        if command[0] == "info":
            return {"Architecture": "amd64", "ID": "engine"}
        return {
            "Os": "linux",
            "Architecture": "amd64",
            "RepoDigests": [executor.bundle.image_lock.immutable_reference],
        }

    monkeypatch.setattr(executor, "_preflight_cli_json", fake)
    monkeypatch.setattr("tianwen.alpha_docker.shutil.disk_usage", lambda _path: type("Disk", (), {"free": 1})())

    preflight = executor.preflight()

    assert preflight.image_digest == executor.bundle.image_lock.manifest_digest
    assert calls == [
        ("version", "--format", "{{json .}}"),
        ("info", "--format", "{{json .}}"),
        ("image", "inspect", f"docker.io/library/{executor.bundle.image_lock.immutable_reference}"),
    ]


def test_credential_sentinel_never_crosses_durable_boundary(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    sentinel = "secret-credential-value"
    monkeypatch.setenv("DEEPSEEK_API_KEY", sentinel)
    argv, sanitized, environment = executor._create_command("action:one", "public")
    record = _record(executor, "action:one")
    rendered = "\n".join((*argv, *sanitized, record.model_dump_json()))
    assert sentinel not in rendered and "DEEPSEEK_API_KEY" not in rendered and "DEEPSEEK_API_KEY" not in environment
