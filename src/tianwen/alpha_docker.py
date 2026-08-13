from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import stat
import subprocess
from dataclasses import dataclass
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


class CheckExecutionAudit(FrozenModel):
    action_id: str
    classification: Literal[
        "check_identity_unverified", "check_never_started", "check_reconciled", "check_timeout_control_failed"
    ]
    detail_digest: str
    created_at: datetime


@dataclass(frozen=True)
class _StreamResult:
    exit_code: int | None
    stdout: bytes
    stderr: bytes
    timed_out: bool
    process: Any


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
        if not final and script.parent.resolve(strict=True) != (self.bundle.root / "checks").resolve(strict=True):
            raise DockerExecutionError("check_script_not_direct")
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
            "log_driver": "local",
            "log_options": (f"max-size={spec.output_limit_bytes}", "max-file=1"),
            "mounts": ("/workspace", f"/checks/{script_name}"),
            "working_dir": "/workspace",
            "environment": ("HOME=/tmp", "TMPDIR=/tmp", "PYTHONDONTWRITEBYTECODE=1"),
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

    async def _cli(self, argv: list[str], *, timeout: float) -> tuple[int, bytes, bytes]:
        """Run one Docker CLI operation; its return code is never a container exit code."""
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

    async def _checked_cli(self, argv: list[str], *, kind: str, timeout: float = 10) -> tuple[bytes, bytes]:
        code, stdout, stderr = await self._cli(argv, timeout=timeout)
        if code != 0:
            raise DockerExecutionError(f"docker_{kind}_failed:exit={code}")
        return stdout, stderr

    async def _spawn_attached(self, container_id: str) -> Any:
        try:
            return await asyncio.create_subprocess_exec(
                *self._prefix(),
                "start",
                "--attach",
                container_id,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=self._docker_environment(),
            )
        except OSError as error:
            raise DockerExecutionError("docker_start_spawn_failed") from error

    async def _start_stream(
        self, record: CheckExecutionRecord, *, limit: int, deadline: datetime
    ) -> _StreamResult:
        """Read both attached streams incrementally, retaining at most the declared aggregate limit."""
        process = await self._spawn_attached(record.container_id)
        record = record.model_copy(update={"status": "running", "started_at": utc_now()})
        self._save_record(record)
        assert process.stdout is not None and process.stderr is not None
        pending = {
            asyncio.create_task(process.stdout.read(8192)): "stdout",
            asyncio.create_task(process.stderr.read(8192)): "stderr",
        }
        output = {"stdout": bytearray(), "stderr": bytearray()}
        used = 0
        timed_out = False
        while pending:
            remaining = (deadline - utc_now()).total_seconds()
            if remaining <= 0:
                timed_out = True
                break
            done, _pending = await asyncio.wait(pending, timeout=remaining, return_when=asyncio.FIRST_COMPLETED)
            if not done:
                timed_out = True
                break
            for task in done:
                stream = pending.pop(task)
                chunk = task.result()
                if not chunk:
                    continue
                take = min(len(chunk), max(0, limit - used))
                output[stream].extend(chunk[:take])
                used += take
                if take != len(chunk):
                    timed_out = True
                    break
                reader = process.stdout if stream == "stdout" else process.stderr
                pending[asyncio.create_task(reader.read(8192))] = stream
            if timed_out:
                break
        if timed_out:
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            return _StreamResult(None, bytes(output["stdout"]), bytes(output["stderr"]), True, process)
        return _StreamResult(await process.wait(), bytes(output["stdout"]), bytes(output["stderr"]), False, process)

    async def _inspect(self, container_id: str) -> dict[str, Any] | None:
        code, stdout, _stderr = await self._cli([*self._prefix(), "inspect", container_id], timeout=10)
        if code != 0:
            return None
        try:
            value = json.loads(stdout.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None
        return value[0] if isinstance(value, list) and len(value) == 1 and isinstance(value[0], dict) else None

    async def _reap_attached(self, process: Any | None) -> None:
        if process is None:
            return
        try:
            await asyncio.wait_for(process.wait(), timeout=10)
        except TimeoutError:
            raise DockerExecutionError("docker_attached_reap_timeout") from None

    async def _stop_wait_inspect(self, record: CheckExecutionRecord) -> tuple[dict[str, Any] | None, str]:
        details: list[str] = []
        for kind in ("stop", "wait"):
            try:
                code, stdout, stderr = await self._cli([*self._prefix(), kind, record.container_id], timeout=10)
                details.append(f"{kind}:exit={code}:stdout={content_digest(stdout)}:stderr={content_digest(stderr)}")
            except (DockerExecutionError, TimeoutError) as error:
                details.append(f"{kind}:error={content_digest(str(error))}")
        observed = await self._inspect(record.container_id)
        return observed, ";".join(details)

    async def _logs(self, container_id: str, limit: int) -> tuple[bytes, bytes]:
        stdout, stderr = await self._checked_cli([*self._prefix(), "logs", container_id], kind="logs")
        combined = stdout + stderr
        return combined[:limit], b""

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

    def _audit(
        self,
        action_id: str,
        classification: Literal[
            "check_identity_unverified", "check_never_started", "check_reconciled", "check_timeout_control_failed"
        ],
        detail: str,
    ) -> None:
        object_id = f"{action_id}:{classification}"
        try:
            self.store.get_object("check_execution_audit", object_id, CheckExecutionAudit)
        except StateConflict:
            pass
        else:
            return
        audit = CheckExecutionAudit(
            action_id=action_id,
            classification=classification,
            detail_digest=content_digest(detail),
            created_at=utc_now(),
        )
        self.store.put_immutable_object("check_execution_audit", object_id, action_id, classification, audit)

    async def _begin(
        self,
        action_id: str,
        check_id: str,
        *,
        final: bool,
        result_type: Literal["public", "final", "seed_preflight"] | None = None,
    ) -> CheckExecutionRecord:
        argv, _sanitized, _environment = self._create_command(action_id, check_id, final=final)
        created_out, _created_err = await self._checked_cli(argv, kind="create")
        text = created_out.decode("ascii", errors="ignore")
        if not re.fullmatch(r"[0-9a-f]{64}\n", text):
            raise DockerExecutionError("docker_create_full_container_id_required")
        record = self._new_record(action_id, check_id, text[:-1], final=final)
        if result_type is not None:
            record = record.model_copy(update={"result_type": result_type})
        self._save_record(record)
        return record

    def _save_terminal(
        self,
        record: CheckExecutionRecord,
        result: CheckResult | VerifierResult,
        *,
        code: int | None,
        output_evidence: str | None = None,
    ) -> None:
        self._save_record(
            record.model_copy(
                update={
                    "status": "failed" if isinstance(result, CheckResult) and result.timed_out else "finished",
                    "exit_code": code,
                    "result_json": result.model_dump_json(),
                    "output_digest": output_evidence or (
                        result.output_digest
                        if isinstance(result, CheckResult)
                        else content_digest(result.model_dump_json())
                    ),
                    "finished_at": utc_now(),
                }
            )
        )

    async def _run_record(self, record: CheckExecutionRecord, *, final: bool) -> CheckResult | VerifierResult:
        spec = self.bundle.task.final_verifier if final else self._check(record.check_id)
        if record.deadline_at is None:
            raise DockerExecutionError("docker_deadline_missing")
        stream = await self._start_stream(record, limit=spec.output_limit_bytes, deadline=record.deadline_at)
        record = self._record(record.action_id) or record
        if stream.timed_out:
            return await self._settle_timeout(record, stream)
        observed = await self._inspect(record.container_id)
        if observed is None or not self._inspect_matches(record, observed):
            raise DockerExecutionError("docker_terminal_identity_unverified")
        code = observed.get("State", {}).get("ExitCode")
        if not isinstance(code, int):
            raise DockerExecutionError("docker_terminal_exit_unavailable")
        if not final:
            result = self._result(record.check_id, code, stream.stdout, stream.stderr)
            self._save_terminal(record, result, code=code)
            return result
        if code != 0:
            raise DockerExecutionError("verifier_execution_failed")
        result = self._parse_verifier(stream.stdout)
        self._save_terminal(record, result, code=code)
        return result

    async def _settle_timeout(
        self, record: CheckExecutionRecord, stream: _StreamResult
    ) -> CheckResult | VerifierResult:
        observed: dict[str, Any] | None = None
        control_detail = "control"
        control_error = False
        try:
            observed, control_detail = await self._stop_wait_inspect(record)
        except (DockerExecutionError, TimeoutError) as error:
            control_detail = f"control_error={content_digest(str(error))}"
            control_error = True
        finally:
            try:
                await self._reap_attached(stream.process)
            except DockerExecutionError:
                self._audit(record.action_id, "check_timeout_control_failed", control_detail + ";reap")
                if control_error:
                    raise DockerExecutionError("docker_timeout_control_unverified") from None
                raise
        if control_error:
            self._audit(record.action_id, "check_timeout_control_failed", control_detail)
            raise DockerExecutionError("docker_timeout_control_unverified")
        if observed is None or not self._inspect_matches(record, observed) or observed.get("State", {}).get("Running"):
            self._audit(record.action_id, "check_timeout_control_failed", control_detail)
            raise DockerExecutionError("docker_timeout_control_unverified")
        code = observed.get("State", {}).get("ExitCode")
        if not isinstance(code, int):
            self._audit(record.action_id, "check_timeout_control_failed", control_detail + ";exit")
            raise DockerExecutionError("docker_timeout_control_unverified")
        stdout, stderr = stream.stdout, stream.stderr
        result = self._timeout_result(record, code, stdout, stderr)
        self._save_terminal(record, result, code=code, output_evidence=content_digest(stdout + stderr))
        raise TimeoutError("docker_check_timeout")

    def _timeout_result(
        self, record: CheckExecutionRecord, code: int, stdout: bytes, stderr: bytes
    ) -> CheckResult | VerifierResult:
        if record.result_type == "public":
            return self._result(record.check_id, code, stdout, stderr, timed_out=True)
        return VerifierResult(
            verdict="inconclusive",
            passed_checks=(),
            failed_checks=(),
            failure_categories=("timeout",),
            summary="verifier_timeout",
        )

    def _parse_verifier(self, stdout: bytes) -> VerifierResult:
        try:
            decoded = stdout.decode("utf-8")
            if decoded.strip() != decoded or decoded.count("\n") > 0:
                raise ValueError
            return VerifierResult.model_validate(json.loads(decoded))
        except (UnicodeDecodeError, json.JSONDecodeError, ValidationError, ValueError) as error:
            raise DockerExecutionError("verifier output invalid") from error

    async def run(self, action_id: str, check_id: str) -> CheckResult:
        record = await self._begin(action_id, check_id, final=False)
        result = await self._run_record(record, final=False)
        assert isinstance(result, CheckResult)
        return result

    async def _run_verifier(self, action_id: str, *, result_type: Literal["final", "seed_preflight"]) -> VerifierResult:
        record = await self._begin(action_id, "final", final=True, result_type=result_type)
        result = await self._run_record(record, final=True)
        assert isinstance(result, VerifierResult)
        return result

    async def run_final(self, action_id: str) -> VerifierResult:
        return await self._run_verifier(action_id, result_type="final")

    async def run_seed_preflight(self) -> VerifierResult:
        return await self._run_verifier("seed-preflight", result_type="seed_preflight")

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
        config = self._normalized_config(record.check_id, final=record.result_type != "public")
        host = observed.get("HostConfig", {})
        observed_config = observed.get("Config", {})
        log_config = host.get("LogConfig", {})
        expected_tmpfs = f"rw,nosuid,nodev,noexec,size={config['tmpfs_bytes']}"
        security = host.get("SecurityOpt")
        cap_drop = host.get("CapDrop")
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
            and isinstance(mounts, list)
            and len(mounts) == 2
            and actual_mounts == expected_mounts
            and host.get("NetworkMode") == config["network"]
            and observed_config.get("User") == config["user"]
            and cap_drop == ["ALL"]
            and security == ["no-new-privileges"]
            and host.get("PidsLimit") == config["pids"]
            and host.get("Memory") == config["memory_bytes"]
            and host.get("NanoCpus") == int(config["cpus"] * 1_000_000_000)
            and host.get("Tmpfs") == {"/tmp": expected_tmpfs}
            and log_config
            == {
                "Type": config["log_driver"],
                "Config": {"max-size": str(config["output_limit_bytes"]), "max-file": "1"},
            }
            and observed_config.get("WorkingDir") == config["working_dir"]
            and observed_config.get("Cmd") == list(config["argv"])
            and observed_config.get("Env") == list(config["environment"])
        )

    async def reconcile(self, action_id: str) -> CheckResult | VerifierResult | None:
        record = self._record(action_id)
        if record is None:
            return None
        observed = await self._inspect(record.container_id)
        if observed is None or not self._inspect_matches(record, observed):
            self._audit(action_id, "check_identity_unverified", "identity")
            return None
        if record.status == "created" or record.started_at is None:
            self._audit(action_id, "check_never_started", "created")
            return None
        state = observed.get("State", {})
        if state.get("Running"):
            if record.deadline_at is not None and record.deadline_at > utc_now():
                await asyncio.sleep((record.deadline_at - utc_now()).total_seconds())
                return await self.reconcile(action_id)
            observed, control_detail = await self._stop_wait_inspect(record)
            if (
                observed is None
                or not self._inspect_matches(record, observed)
                or observed.get("State", {}).get("Running")
            ):
                self._audit(action_id, "check_timeout_control_failed", control_detail)
                return None
            code = observed.get("State", {}).get("ExitCode")
            if not isinstance(code, int):
                self._audit(action_id, "check_timeout_control_failed", control_detail + ";exit")
                return None
            try:
                stdout, stderr = await self._logs(record.container_id, self._output_limit(record))
            except DockerExecutionError:
                stdout, stderr = b"", b""
                self._audit(action_id, "check_timeout_control_failed", control_detail + ";logs_unavailable")
            timeout_result = self._timeout_result(record, code, stdout, stderr)
            self._save_terminal(record, timeout_result, code=code, output_evidence=content_digest(stdout + stderr))
            self._audit(action_id, "check_reconciled", "timeout")
            return timeout_result
        if record.status in _TERMINAL and record.result_json:
            if record.result_type == "public":
                return CheckResult.model_validate_json(record.result_json)
            return VerifierResult.model_validate_json(record.result_json)
        code = state.get("ExitCode")
        if not isinstance(code, int):
            return None
        stdout, stderr = await self._logs(record.container_id, self._output_limit(record))
        if record.result_type == "public":
            result: CheckResult | VerifierResult = self._result(record.check_id, code, stdout, stderr)
        elif code == 0:
            result = self._parse_verifier(stdout)
        else:
            raise DockerExecutionError("verifier_execution_failed")
        self._save_terminal(record, result, code=code)
        self._audit(action_id, "check_reconciled", "exited")
        return result

    def _output_limit(self, record: CheckExecutionRecord) -> int:
        if record.result_type == "public":
            return self._check(record.check_id).output_limit_bytes
        return self.bundle.task.final_verifier.output_limit_bytes

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
            # Cleanup is intentionally best-effort and happens only after durable action settlement.
            try:
                asyncio.run(self._checked_cli([*self._prefix(), "rm", record.container_id], kind="rm"))
            except (DockerExecutionError, TimeoutError):
                continue
            self._save_record(record.model_copy(update={"removed_at": utc_now()}))

    def preflight(self) -> DockerPreflight:
        appdata = os.environ.get("APPDATA")
        if not appdata:
            raise DockerExecutionError("docker_appdata_missing")

        version = self._preflight_cli_json(("version", "--format", "{{json .}}"))
        info = self._preflight_cli_json(("info", "--format", "{{json .}}"))
        image = self._preflight_cli_json(("image", "inspect", self.bundle.image_lock.immutable_reference))
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
        if self.bundle.task.container_image_digest != self.bundle.image_lock.manifest_digest:
            raise DockerExecutionError("docker_bundle_image_digest_mismatch")
        settings_path = Path(appdata) / "Docker" / "settings-store.json"
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

    def _preflight_cli_json(self, command: tuple[str, ...]) -> dict[str, Any]:
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
