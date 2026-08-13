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
    _StreamResult,
)
from tianwen.alpha_tasks import freeze_task_bundle
from tianwen.alpha_workspace import _create_trial_workspace
from tianwen.domain import content_digest
from tianwen.store import StateStore

_CONTAINER_ID = "a" * 64


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
            "Image": executor.bundle.image_lock.immutable_reference,
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
            "LogConfig": {"Type": "local", "Config": {"max-size": "16", "max-file": "1"}},
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
    assert sum(item.startswith("type=bind,") for item in argv) == 2
    assert "docker.sock" not in joined.casefold()
    assert str(executor.paths.state) not in "\n".join(sanitized)
    assert str(executor.paths.workspace) not in "\n".join(sanitized)
    assert str(executor.bundle.root / "checks" / "public.py") not in "\n".join(sanitized)
    assert "DEEPSEEK_API_KEY" not in environment


@pytest.mark.anyio
async def test_create_start_stream_inspect_persists_observed_nonzero_including_125(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []

    async def checked(argv: list[str], *, kind: str, timeout: float = 10) -> tuple[bytes, bytes]:
        calls.append(kind)
        assert "docker.sock" not in " ".join(argv)
        return ((_CONTAINER_ID + "\n").encode(), b"") if kind == "create" else (b"", b"")

    async def stream(*_args: object, **_kwargs: object) -> _StreamResult:
        return _StreamResult(125, b"assertion failed\n", b"", False)

    async def inspected(_container_id: str) -> dict[str, Any]:
        return _inspect(executor, "action:one", code=125)

    monkeypatch.setattr(executor, "_checked_cli", checked)
    monkeypatch.setattr(executor, "_start_stream", stream)
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

    async def stream(*_args: object, **_kwargs: object) -> _StreamResult:
        return _StreamResult(None, b"12345678", b"abcdef", True)

    async def inspected(_container_id: str) -> dict[str, Any]:
        return _inspect(executor, "action:timeout", code=137)

    monkeypatch.setattr(executor, "_checked_cli", checked)
    monkeypatch.setattr(executor, "_start_stream", stream)
    monkeypatch.setattr(executor, "_inspect", inspected)

    with pytest.raises(TimeoutError, match="docker_check_timeout"):
        await executor.run("action:timeout", "public")

    record = executor._record("action:timeout")
    result = CheckResult.model_validate_json(record.result_json)
    assert calls == ["create", "stop", "wait"]
    assert result.timed_out and result.stdout_digest == content_digest(b"12345678")
    assert result.stderr_digest == content_digest(b"abcdef")


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
        "Config": {"max-size": str(final_limit), "max-file": "1"},
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
    assert [command[0] for command in calls] == ["version", "info", "image"]


def test_credential_sentinel_never_crosses_durable_boundary(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    sentinel = "secret-credential-value"
    monkeypatch.setenv("DEEPSEEK_API_KEY", sentinel)
    argv, sanitized, environment = executor._create_command("action:one", "public")
    record = _record(executor, "action:one")
    rendered = "\n".join((*argv, *sanitized, record.model_dump_json()))
    assert sentinel not in rendered and "DEEPSEEK_API_KEY" not in rendered and "DEEPSEEK_API_KEY" not in environment
