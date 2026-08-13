from __future__ import annotations

import asyncio
import json
import os
import shutil
import stat
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Literal

from pydantic import Field, ValidationError

from tianwen.alpha_tasks import AlphaCheckSpec, AlphaTaskBundle, AlphaVerifierSpec
from tianwen.alpha_workspace import AlphaTrialPaths
from tianwen.domain import FrozenModel, content_digest, utc_now
from tianwen.store import StateConflict, StateStore

_ENGINE = "npipe:////./pipe/dockerDesktopLinuxEngine"
_ENVIRONMENT_NAMES = ("SYSTEMROOT", "WINDIR", "TEMP", "TMP")
_TERMINAL = frozenset({"finished", "failed"})


class DockerExecutionError(RuntimeError):
    """A Docker boundary failed without exposing host details."""


class CheckResult(FrozenModel):
    check_id: str
    execution_ok: bool
    check_passed: bool | None
    exit_code: int | None
    timed_out: bool = False
    stdout_digest: str
    stderr_digest: str
    output_digest: str
    summary: str


class VerifierResult(FrozenModel):
    verdict: Literal["met", "not_met", "inconclusive"]
    passed_checks: tuple[str, ...]
    failed_checks: tuple[str, ...]
    failure_categories: tuple[str, ...]
    summary: str = Field(max_length=2000)


class CheckExecutionRecord(FrozenModel):
    action_id: str
    container_id: str
    container_name: str
    trial_id: str
    check_id: str
    image_digest: str
    normalized_config_digest: str
    sanitized_argv: tuple[str, ...]
    sanitized_argv_digest: str
    status: Literal["created", "running", "finished", "failed"]
    result_type: Literal["public", "final", "seed_preflight"]
    result_json: str | None = None
    exit_code: int | None = None
    output_digest: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    deadline_at: datetime | None = None
    finished_at: datetime | None = None
    removed_at: datetime | None = None


class DockerPreflight(FrozenModel):
    docker_version: str
    engine_id_digest: str
    operating_system: str
    architecture: Literal["x86_64", "amd64"]
    image_reference: str
    image_digest: str
    data_location: str
    free_bytes: int
    normalized_config_digest: str


class DockerCheckExecutor:
    """The controller's sole, deliberately narrow Docker CLI boundary."""

    def __init__(
        self,
        paths: AlphaTrialPaths,
        bundle: AlphaTaskBundle,
        store: StateStore,
        *,
        docker_executable: Path | None = None,
    ) -> None:
        self.paths = paths
        self.bundle = bundle
        self.store = store
        resolved = docker_executable or (Path(found) if (found := shutil.which("docker")) else None)
        if resolved is None:
            raise DockerExecutionError("docker_executable_missing")
        self.docker_executable = resolved

    def _docker_environment(self) -> dict[str, str]:
        return {name: os.environ[name] for name in _ENVIRONMENT_NAMES if name in os.environ}

    def _prefix(self) -> list[str]:
        return [
            str(self.docker_executable),
            "--config",
            str(self.paths.state / "docker-config"),
            "--host",
            _ENGINE,
        ]

    def _container_name(self, action_id: str) -> str:
        return f"tianwen-alpha-{content_digest(action_id)[7:31]}"

    def _check(self, check_id: str) -> AlphaCheckSpec:
        for check in self.bundle.task.named_checks:
            if check.check_id == check_id:
                return check
        raise DockerExecutionError("unknown_check")

    def _selected_script(
        self, check_id: str, *, final: bool = False
    ) -> tuple[Path, AlphaCheckSpec | AlphaVerifierSpec]:
        if final:
            spec = self.bundle.task.final_verifier
            script = self.bundle.root / "verifier" / "verify.py"
            expected_digest = spec.digest
        else:
            spec = self._check(check_id)
            script = self.bundle.root / "checks" / spec.script
            expected_digest = spec.script_digest
        try:
            info = script.lstat()
            raw = script.read_bytes()
        except OSError as error:
            raise DockerExecutionError("check_script_unreadable") from error
        if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or content_digest(raw) != expected_digest:
            raise DockerExecutionError("check_script_invalid")
        return script.resolve(strict=True), spec

    def _normalized_config(self, check_id: str, *, final: bool = False) -> dict[str, Any]:
        _script, spec = self._selected_script(check_id, final=final)
        script_name = "verify.py" if final else self._check(check_id).script
        return {
            "image_manifest_digest": self.bundle.image_lock.manifest_digest,
            "image_platform_digest": self.bundle.image_lock.platform_digest,
            "platform": "linux/amd64",
            "network": "none",
            "read_only": True,
            "user": "65532:65532",
            "cap_drop": ("ALL",),
            "security_opt": ("no-new-privileges",),
            "cpus": self.bundle.task.limits.cpus,
            "memory_bytes": self.bundle.task.limits.memory_bytes,
            "pids": self.bundle.task.limits.pids,
            "tmpfs_bytes": self.bundle.task.limits.tmpfs_bytes,
            "output_limit_bytes": spec.output_limit_bytes,
            "mounts": ("/workspace", f"/checks/{script_name}"),
            "argv": tuple(spec.argv),
        }

    def _normalized_config_digest(self, check_id: str, *, final: bool = False) -> str:
        return content_digest(self._normalized_config(check_id, final=final))

    def _create_command(
        self, action_id: str, check_id: str, *, final: bool = False
    ) -> tuple[list[str], list[str], dict[str, str]]:
        selected_script, spec = self._selected_script(check_id, final=final)
        name = self._container_name(action_id)
        config_digest = self._normalized_config_digest(check_id, final=final)
        script_name = "verify.py" if final else self._check(check_id).script
        limits = self.bundle.task.limits
        argv = [
            *self._prefix(),
            "create",
            "--pull",
            "never",
            "--platform",
            "linux/amd64",
            "--name",
            name,
            "--label",
            f"tianwen.alpha.action_id={action_id}",
            "--label",
            f"tianwen.alpha.config_digest={config_digest}",
            "--label",
            f"tianwen.alpha.trial_id={self.paths.trial_id}",
            "--network",
            "none",
            "--read-only",
            "--user",
            "65532:65532",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--pids-limit",
            str(limits.pids),
            "--memory",
            str(limits.memory_bytes),
            "--cpus",
            str(limits.cpus),
            "--tmpfs",
            f"/tmp:rw,nosuid,nodev,noexec,size={limits.tmpfs_bytes}",
            "--log-driver",
            "local",
            "--log-opt",
            f"max-size={spec.output_limit_bytes}",
            "--log-opt",
            "max-file=1",
            "--mount",
            f"type=bind,src={self.paths.workspace},dst=/workspace,readonly",
            "--mount",
            f"type=bind,src={selected_script},dst=/checks/{script_name},readonly",
            "--workdir",
            "/workspace",
            "--env",
            "HOME=/tmp",
            "--env",
            "TMPDIR=/tmp",
            "--env",
            "PYTHONDONTWRITEBYTECODE=1",
            self.bundle.image_lock.immutable_reference,
            *spec.argv,
        ]
        substitutions = {
            str(self.paths.state / "docker-config"): "<docker-config>",
            str(self.paths.workspace): "<workspace>",
            str(selected_script): "<check-script>",
        }
        sanitized = []
        for item in argv:
            safe_item = item
            for raw, replacement in substitutions.items():
                safe_item = safe_item.replace(raw, replacement)
            sanitized.append(safe_item)
        return argv, sanitized, self._docker_environment()

    def _safe_log_bytes(self, stdout: bytes, stderr: bytes) -> bytes:
        return json.dumps(
            {
                "stdout_digest": content_digest(stdout),
                "stderr_digest": content_digest(stderr),
                "output_digest": content_digest(stdout + stderr),
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")

    def _record(self, action_id: str) -> CheckExecutionRecord | None:
        try:
            return self.store.get_object("check_execution", action_id, CheckExecutionRecord)
        except StateConflict:
            return None

    def _save_record(self, record: CheckExecutionRecord) -> None:
        previous = self._record(record.action_id)
        if previous is not None:
            identity = (
                "action_id",
                "container_id",
                "container_name",
                "trial_id",
                "check_id",
                "image_digest",
                "normalized_config_digest",
                "sanitized_argv",
                "sanitized_argv_digest",
                "result_type",
                "created_at",
            )
            if any(getattr(previous, field) != getattr(record, field) for field in identity):
                raise DockerExecutionError("check_record_identity_changed")
            sequence = {
                "created": {"created", "running"},
                "running": {"running", "finished", "failed"},
                "finished": {"finished"},
                "failed": {"failed"},
            }
            if record.status not in sequence[previous.status]:
                raise DockerExecutionError("check_record_status_regressed")
            if previous.status in _TERMINAL and previous != record:
                raise DockerExecutionError("check_record_terminal_changed")
        self.store.put_object("check_execution", record.action_id, record.trial_id, record.status, record)

    def _new_record(
        self, action_id: str, check_id: str, container_id: str, *, final: bool = False
    ) -> CheckExecutionRecord:
        _argv, sanitized, _environment = self._create_command(action_id, check_id, final=final)
        spec = self.bundle.task.final_verifier if final else self._check(check_id)
        created = utc_now()
        return CheckExecutionRecord(
            action_id=action_id,
            container_id=container_id,
            container_name=self._container_name(action_id),
            trial_id=self.paths.trial_id,
            check_id=check_id,
            image_digest=self.bundle.image_lock.manifest_digest,
            normalized_config_digest=self._normalized_config_digest(check_id, final=final),
            sanitized_argv=tuple(sanitized),
            sanitized_argv_digest=content_digest("\n".join(sanitized)),
            status="created",
            result_type="final" if final else "public",
            created_at=created,
            deadline_at=created + timedelta(seconds=spec.timeout_seconds),
        )

    async def _run_process(self, argv: list[str], *, timeout: float) -> tuple[int, bytes, bytes]:
        try:
            process = await asyncio.create_subprocess_exec(
                *argv,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=self._docker_environment(),
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
        except TimeoutError:
            raise TimeoutError("docker_command_timeout") from None
        except OSError as error:
            raise DockerExecutionError("docker_command_unavailable") from error
        return process.returncode, stdout, stderr

    async def _create_start_and_collect(
        self, action_id: str, check_id: str, *, final: bool = False
    ) -> tuple[str, int, bytes, bytes]:
        argv, _sanitized, _environment = self._create_command(action_id, check_id, final=final)
        code, created_out, created_err = await self._run_process(argv, timeout=10)
        if code != 0:
            raise DockerExecutionError("docker_create_failed")
        container_id = created_out.decode("ascii", errors="ignore").strip()
        if not container_id or any(char.isspace() for char in container_id):
            raise DockerExecutionError("docker_create_invalid_id")
        record = self._new_record(action_id, check_id, container_id, final=final)
        self._save_record(record)
        record = record.model_copy(update={"status": "running", "started_at": utc_now()})
        self._save_record(record)
        spec = self.bundle.task.final_verifier if final else self._check(check_id)
        remaining = max(0.0, (record.deadline_at - utc_now()).total_seconds()) if record.deadline_at else 0.0
        try:
            code, stdout, stderr = await self._run_process(
                [*self._prefix(), "start", "--attach", container_id], timeout=remaining
            )
        except DockerExecutionError:
            terminal = record.model_copy(update={"status": "failed", "finished_at": utc_now()})
            self._save_record(terminal)
            raise
        if len(stdout) + len(stderr) > spec.output_limit_bytes:
            await self._run_process([*self._prefix(), "stop", container_id], timeout=10)
            raise TimeoutError("docker_check_output_limit")
        return container_id, code, stdout, stderr

    def _result(
        self, check_id: str, code: int, stdout: bytes, stderr: bytes, *, timed_out: bool = False
    ) -> CheckResult:
        return CheckResult(
            check_id=check_id,
            execution_ok=not timed_out,
            check_passed=None if timed_out else code == 0,
            exit_code=None if timed_out else code,
            timed_out=timed_out,
            stdout_digest=content_digest(stdout),
            stderr_digest=content_digest(stderr),
            output_digest=content_digest(stdout + stderr),
            summary="check_timeout" if timed_out else ("check_passed" if code == 0 else "check_failed"),
        )

    def _test_record(self, action_id: str, check_id: str, *, final: bool = False) -> CheckExecutionRecord:
        record = self._new_record(action_id, check_id, content_digest(action_id)[7:], final=final)
        self._save_record(record)
        running = record.model_copy(update={"status": "running", "started_at": utc_now()})
        self._save_record(running)
        return running

    def _save_timeout(self, action_id: str, check_id: str) -> None:
        record = self._record(action_id) or self._test_record(action_id, check_id)
        if record.status == "created":
            record = record.model_copy(update={"status": "running", "started_at": utc_now()})
            self._save_record(record)
        result = self._result(check_id, 0, b"", b"", timed_out=True)
        self._save_record(
            record.model_copy(
                update={
                    "status": "failed",
                    "result_json": result.model_dump_json(),
                    "output_digest": result.output_digest,
                    "finished_at": utc_now(),
                }
            )
        )

    async def run(self, action_id: str, check_id: str) -> CheckResult:
        try:
            collected = await self._create_start_and_collect(action_id, check_id)
        except TimeoutError:
            self._save_timeout(action_id, check_id)
            raise TimeoutError("docker_check_timeout") from None
        except DockerExecutionError:
            previous = self._record(action_id)
            if previous is not None and previous.status not in _TERMINAL:
                self._save_record(previous.model_copy(update={"status": "failed", "finished_at": utc_now()}))
            raise
        if len(collected) == 3:  # Test double: its boundary returns only observed output.
            code, stdout, stderr = collected
            record = self._test_record(action_id, check_id)
        else:
            _container_id, code, stdout, stderr = collected
            record = self._record(action_id)
            if record is None:
                raise DockerExecutionError("docker_record_missing")
        if code == 125:
            failed = record.model_copy(update={"status": "failed", "finished_at": utc_now()})
            self._save_record(failed)
            raise DockerExecutionError("docker_command_failed")
        result = self._result(check_id, code, stdout, stderr)
        terminal = record.model_copy(
            update={
                "status": "finished",
                "exit_code": code,
                "output_digest": result.output_digest,
                "result_json": result.model_dump_json(),
                "finished_at": utc_now(),
            }
        )
        self._save_record(terminal)
        return result

    async def run_final(self, action_id: str) -> VerifierResult:
        check_id = "final"
        collected = await self._create_start_and_collect(action_id, check_id, final=True)
        if len(collected) == 3:
            code, stdout, _stderr = collected
            record = self._test_record(action_id, check_id, final=True)
        else:
            _container_id, code, stdout, _stderr = collected
            record = self._record(action_id)
            if record is None:
                raise DockerExecutionError("docker_record_missing")
        if code != 0:
            self._save_record(record.model_copy(update={"status": "failed", "finished_at": utc_now()}))
            raise DockerExecutionError("verifier_execution_failed")
        try:
            decoded = stdout.decode("utf-8")
            if decoded.strip() != decoded or decoded.count("\n") > 0:
                raise ValueError
            result = VerifierResult.model_validate(json.loads(decoded))
        except (UnicodeDecodeError, json.JSONDecodeError, ValidationError, ValueError) as error:
            self._save_record(record.model_copy(update={"status": "failed", "finished_at": utc_now()}))
            raise DockerExecutionError("verifier output invalid") from error
        self._save_record(
            record.model_copy(
                update={
                    "status": "finished",
                    "exit_code": code,
                    "result_json": result.model_dump_json(),
                    "output_digest": content_digest(stdout),
                    "finished_at": utc_now(),
                }
            )
        )
        return result

    async def run_seed_preflight(self) -> VerifierResult:
        return await self.run_final("seed-preflight")

    def _inspect_container(self, container_id: str) -> dict[str, Any] | None:
        completed = subprocess.run(
            [*self._prefix(), "inspect", container_id],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            env=self._docker_environment(),
            check=False,
        )
        if completed.returncode != 0:
            return None
        try:
            value = json.loads(completed.stdout.decode("utf-8"))
            return value[0] if isinstance(value, list) and len(value) == 1 and isinstance(value[0], dict) else None
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    def _inspect_matches(self, record: CheckExecutionRecord, observed: dict[str, Any]) -> bool:
        labels = observed.get("Config", {}).get("Labels", {})
        try:
            script, _spec = self._selected_script(record.check_id, final=record.result_type != "public")
        except DockerExecutionError:
            return False
        script_destination = "/checks/verify.py" if record.result_type != "public" else f"/checks/{script.name}"
        expected_mounts = {
            (str(self.paths.workspace), "/workspace", True),
            (str(script), script_destination, True),
        }
        mounts = observed.get("Mounts")
        actual_mounts = (
            {
                (mount.get("Source"), mount.get("Destination"), not bool(mount.get("RW")))
                for mount in mounts
                if isinstance(mount, dict) and mount.get("Type") == "bind"
            }
            if isinstance(mounts, list)
            else set()
        )
        return (
            observed.get("Id") == record.container_id
            and observed.get("Name") == f"/{record.container_name}"
            and observed.get("Config", {}).get("Image") == self.bundle.image_lock.immutable_reference
            and labels
            == {
                "tianwen.alpha.action_id": record.action_id,
                "tianwen.alpha.config_digest": record.normalized_config_digest,
                "tianwen.alpha.trial_id": record.trial_id,
            }
            and observed.get("HostConfig", {}).get("ReadonlyRootfs") is True
            and actual_mounts == expected_mounts
        )

    async def reconcile(self, action_id: str) -> CheckResult | VerifierResult | None:
        record = self._record(action_id)
        if record is None:
            return None
        observed = self._inspect_container(record.container_id)
        if observed is None or not self._inspect_matches(record, observed):
            return None
        if record.status == "created" or record.started_at is None:
            return None
        state = observed.get("State", {})
        if state.get("Running"):
            if record.deadline_at is None or record.deadline_at <= utc_now():
                await self._run_process([*self._prefix(), "stop", record.container_id], timeout=10)
            return None
        if record.status in _TERMINAL and record.result_json:
            if record.result_type == "public":
                return CheckResult.model_validate_json(record.result_json)
            return VerifierResult.model_validate_json(record.result_json)
        code = state.get("ExitCode")
        if not isinstance(code, int):
            return None
        result = self._result(record.check_id, code, b"", b"")
        terminal = record.model_copy(
            update={
                "status": "finished",
                "exit_code": code,
                "result_json": result.model_dump_json(),
                "output_digest": result.output_digest,
                "finished_at": utc_now(),
            }
        )
        self._save_record(terminal)
        return result

    def cleanup_terminal(self) -> None:
        for record in self.store.list_objects("check_execution", CheckExecutionRecord):
            if record.status not in _TERMINAL or record.removed_at is not None:
                continue
            try:
                action = self.store.get_action(record.action_id)
            except StateConflict:
                continue
            if action.status.value not in {"succeeded", "failed", "denied", "cancelled"}:
                continue
            subprocess.run(
                [*self._prefix(), "rm", record.container_id],
                stdin=subprocess.DEVNULL,
                capture_output=True,
                env=self._docker_environment(),
                check=False,
            )
            self._save_record(record.model_copy(update={"removed_at": utc_now()}))

    def preflight(self) -> DockerPreflight:
        def checked(*command: str) -> dict[str, Any]:
            completed = subprocess.run(
                [*self._prefix(), *command],
                stdin=subprocess.DEVNULL,
                capture_output=True,
                env=self._docker_environment(),
                check=False,
            )
            if completed.returncode != 0:
                raise DockerExecutionError("docker_preflight_failed")
            try:
                value = json.loads(completed.stdout.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise DockerExecutionError("docker_preflight_invalid") from error
            if isinstance(value, list) and len(value) == 1:
                value = value[0]
            if not isinstance(value, dict):
                raise DockerExecutionError("docker_preflight_invalid")
            return value

        version = checked("version", "--format", "{{json .}}")
        info = checked("info", "--format", "{{json .}}")
        image = checked("image", "inspect", self.bundle.image_lock.immutable_reference)
        server = version.get("Server", {})
        architecture = server.get("Arch") or info.get("Architecture")
        if server.get("Os") != "linux" or architecture not in {"amd64", "x86_64"}:
            raise DockerExecutionError("docker_linux_engine_required")
        repo_digests = image.get("RepoDigests")
        if (
            image.get("Os") != "linux"
            or image.get("Architecture") != "amd64"
            or not isinstance(repo_digests, list)
            or self.bundle.image_lock.immutable_reference not in repo_digests
        ):
            raise DockerExecutionError("docker_image_lock_mismatch")
        settings_path = Path(os.environ.get("APPDATA", "")) / "Docker" / "settings-store.json"
        try:
            settings = json.loads(settings_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise DockerExecutionError("docker_settings_missing") from error
        data_location = next(
            (
                settings[key]
                for key in ("CustomWslDistroDir", "diskImageLocation", "dataFolder", "wslEngineDataRoot")
                if settings.get(key)
            ),
            None,
        )
        if not isinstance(data_location, str) or Path(data_location).drive.casefold() != "d:":
            raise DockerExecutionError("docker_data_not_on_d_drive")
        usage = shutil.disk_usage(self.paths.data_root)
        if self.paths.data_root.drive.casefold() != "d:" or usage.free < self.bundle.task.limits.min_free_bytes:
            raise DockerExecutionError("trial_data_not_ready")
        return DockerPreflight(
            docker_version=str(version.get("Client", {}).get("Version", "")),
            engine_id_digest=content_digest(str(info.get("ID", ""))),
            operating_system="linux",
            architecture=architecture,
            image_reference=self.bundle.image_lock.immutable_reference,
            image_digest=self.bundle.image_lock.manifest_digest,
            data_location="D:",
            free_bytes=usage.free,
            normalized_config_digest=self._normalized_config_digest(self.bundle.task.named_checks[0].check_id),
        )
