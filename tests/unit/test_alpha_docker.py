from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from tianwen.alpha_docker import CheckExecutionRecord, CheckResult, DockerCheckExecutor, DockerExecutionError
from tianwen.alpha_tasks import freeze_task_bundle
from tianwen.alpha_workspace import _create_trial_workspace
from tianwen.domain import content_digest
from tianwen.store import StateStore


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


def _fake_completed(*, exit_code: int, stdout: str, stderr: str = ""):
    async def completed(*_args: object, **_kwargs: object) -> tuple[int, bytes, bytes]:
        return exit_code, stdout.encode(), stderr.encode()

    return completed


def _matching_labels(executor: DockerCheckExecutor) -> dict[str, str]:
    return {
        "tianwen.alpha.action_id": "action:never-started",
        "tianwen.alpha.config_digest": executor._normalized_config_digest("public"),
        "tianwen.alpha.trial_id": executor.paths.trial_id,
    }


def _execution_record(
    executor: DockerCheckExecutor,
    *,
    action_id: str,
    container_id: str,
    status: str,
    started_at: datetime | None = None,
) -> CheckExecutionRecord:
    argv, sanitized, _ = executor._create_command(action_id, "public")
    return CheckExecutionRecord(
        action_id=action_id,
        container_id=container_id,
        container_name=executor._container_name(action_id),
        trial_id=executor.paths.trial_id,
        check_id="public",
        image_digest=executor.bundle.image_lock.manifest_digest,
        normalized_config_digest=executor._normalized_config_digest("public"),
        sanitized_argv=tuple(sanitized),
        sanitized_argv_digest=content_digest("\n".join(sanitized)),
        status=status,
        result_type="public",
        created_at=datetime.now(UTC),
        started_at=datetime.now(UTC) if started_at is None and status != "created" else started_at,
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
    mounts = [item for item in argv if item.startswith("type=bind,")]
    assert all(str(executor.paths.state) not in item for item in mounts)
    assert str(executor.paths.state / "docker-config") not in "\n".join(sanitized)
    assert str(executor.paths.workspace) not in "\n".join(sanitized)
    assert str(executor.bundle.root / "checks" / "public.py") not in "\n".join(sanitized)
    assert "DEEPSEEK_API_KEY" not in environment


@pytest.mark.anyio
async def test_nonzero_public_check_is_an_observed_failed_check_not_an_action_failure(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        executor, "_create_start_and_collect", _fake_completed(exit_code=1, stdout="assertion failed\n")
    )

    result = await executor.run("action:one", "public")

    assert result.execution_ok
    assert result.check_passed is False
    assert result.exit_code == 1


@pytest.mark.anyio
async def test_invalid_verifier_json_is_inconclusive(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(executor, "_create_start_and_collect", _fake_completed(exit_code=0, stdout="not-json"))

    with pytest.raises(DockerExecutionError, match="verifier output"):
        await executor.run_final("action:final")


@pytest.mark.anyio
async def test_final_verifier_persists_a_terminal_record(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        executor,
        "_create_start_and_collect",
        _fake_completed(
            exit_code=0,
            stdout=(
                '{"verdict":"met","passed_checks":["public"],'
                '"failed_checks":[],"failure_categories":[],"summary":"verified"}'
            ),
        ),
    )

    result = await executor.run_final("action:final")

    assert result.verdict == "met"
    assert executor._record("action:final").status == "finished"


@pytest.mark.anyio
async def test_timeout_persists_a_terminal_unknown_result(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def timed_out(*_args: object, **_kwargs: object) -> tuple[int, bytes, bytes]:
        raise TimeoutError("not persisted")

    monkeypatch.setattr(executor, "_create_start_and_collect", timed_out)

    with pytest.raises(TimeoutError, match="docker_check_timeout"):
        await executor.run("action:timeout", "public")

    record = executor._record("action:timeout")
    assert record.status == "failed"
    assert CheckResult.model_validate_json(record.result_json).timed_out


@pytest.mark.anyio
async def test_recovery_requires_exact_container_identity(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    record = _execution_record(executor, action_id="action:one", container_id="container-exact", status="running")
    executor._save_record(record)
    monkeypatch.setattr(
        executor,
        "_inspect_container",
        lambda _container_id: {
            "Id": "container-replaced",
            "Config": {"Labels": {}},
            "State": {"Running": False, "ExitCode": 0},
        },
    )

    assert await executor.reconcile("action:one") is None
    assert executor._record("action:one").status == "running"


@pytest.mark.anyio
async def test_created_but_never_started_container_is_not_a_pass(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    executor._save_record(
        _execution_record(
            executor,
            action_id="action:never-started",
            container_id="container-created",
            status="created",
            started_at=None,
        )
    )
    monkeypatch.setattr(
        executor,
        "_inspect_container",
        lambda _container_id: {
            "Id": "container-created",
            "Name": f"/{executor._container_name('action:never-started')}",
            "Config": {"Labels": _matching_labels(executor), "Image": executor.bundle.image_lock.immutable_reference},
            "HostConfig": {"ReadonlyRootfs": True},
            "Mounts": [],
            "State": {"Running": False, "ExitCode": 0},
        },
    )

    assert await executor.reconcile("action:never-started") is None


def test_credential_sentinel_never_crosses_the_docker_boundary(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    sentinel = "secret-credential-value"
    monkeypatch.setenv("DEEPSEEK_API_KEY", sentinel)
    argv, sanitized, environment = executor._create_command("action:one", "public")
    record = _execution_record(executor, action_id="action:one", container_id="container-id", status="created")
    fake_log = executor._safe_log_bytes(b"docker failed", b"more failure")

    rendered = "\n".join((*argv, *sanitized, json.dumps(record.model_dump(mode="json")), fake_log.decode()))
    assert sentinel not in rendered
    assert "DEEPSEEK_API_KEY" not in rendered
    assert "DEEPSEEK_API_KEY" not in environment


@pytest.mark.anyio
async def test_command_failure_persists_only_digests_and_fixed_reason(
    executor: DockerCheckExecutor, monkeypatch: pytest.MonkeyPatch
) -> None:
    secret = "raw-docker-stderr-and-host-path"
    monkeypatch.setattr(executor, "_create_start_and_collect", _fake_completed(exit_code=125, stdout="", stderr=secret))

    with pytest.raises(DockerExecutionError) as raised:
        await executor.run("action:one", "public")

    assert secret not in str(raised.value)
    assert str(executor.paths.workspace) not in str(raised.value)
    record = executor._record("action:one")
    assert record is not None and record.status == "failed"
    assert secret not in record.model_dump_json()
