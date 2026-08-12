from __future__ import annotations

import ntpath
import re
import shlex
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path
from typing import Any
from uuid import uuid4

from pydantic_ai import Agent, DeferredToolRequests, DeferredToolResults, ModelMessagesTypeAdapter
from pydantic_ai.models import KnownModelName, Model
from pydantic_ai.models.wrapper import WrapperModel
from pydantic_ai_harness import FileSystem, Shell
from pydantic_ai_harness.skills import Skills
from pydantic_ai_harness.step_persistence import StepPersistence, StepStore

from tianwen.domain import ActionStatus, CheckpointRecord, RunRecord, RunStatus, TaskRecord, content_digest
from tianwen.gateway import ActionGatewayCapability, EffectClass
from tianwen.store import BudgetExceeded, StateConflict, StateStore


@dataclass(frozen=True)
class RuntimeConfig:
    workspace: Path
    skill_dir: Path
    allowed_commands: tuple[str, ...]


@dataclass(frozen=True)
class RuntimeOutcome:
    output: str | None
    waiting_action_ids: tuple[str, ...] = ()
    checkpoint_id: str | None = None


class ModelUsageUnavailable(StateConflict):
    """Raised when a completed provider request cannot be safely metered."""


class _BudgetedModel(WrapperModel):
    """Persistently reserve and settle every actual model request."""

    def __init__(self, wrapped: Model | KnownModelName, store: StateStore, run_id: str, loop_id: str) -> None:
        super().__init__(wrapped)
        self._store = store
        self._run_id = run_id
        self._loop_id = loop_id

    async def request(
        self,
        messages: list[Any],
        model_settings: Any,
        model_request_parameters: Any,
    ) -> Any:
        request_id = f"model-request:{uuid4().hex}"
        self._store.reserve_model_request(self._run_id, self._loop_id, request_id)
        response = await super().request(messages, model_settings, model_request_parameters)
        observed_tokens = response.usage.total_tokens
        if observed_tokens <= 0:
            raise ModelUsageUnavailable("model provider returned no usable token accounting")
        self._store.settle_model_request(request_id, observed_tokens)
        return response


_SHELL_DENIED_OPERATORS = (">>", "||", "&&", ">", "|", ";", "\n", "\r")
_FILE_EFFECTS = {
    "read_file": EffectClass.READ_ONLY,
    "list_directory": EffectClass.READ_ONLY,
    "find_files": EffectClass.READ_ONLY,
    "search_files": EffectClass.READ_ONLY,
    "file_info": EffectClass.READ_ONLY,
    "write_file": EffectClass.REVERSIBLE_WORKSPACE_WRITE,
    "edit_file": EffectClass.REVERSIBLE_WORKSPACE_WRITE,
    "create_directory": EffectClass.REVERSIBLE_WORKSPACE_WRITE,
}
_SHELL_EFFECTS = {
    "run_command": EffectClass.EXTERNAL_OR_IRREVERSIBLE,
    "start_command": EffectClass.EXTERNAL_OR_IRREVERSIBLE,
    "check_command": EffectClass.READ_ONLY,
    "stop_command": EffectClass.REVERSIBLE_WORKSPACE_WRITE,
}


def _runtime_policy(config: RuntimeConfig) -> dict[str, Any]:
    return {
        "schema": "tianwen.runtime_policy.v1",
        "file_effects": {name: effect.value for name, effect in sorted(_FILE_EFFECTS.items())},
        "shell_effects": {name: effect.value for name, effect in sorted(_SHELL_EFFECTS.items())},
        "allowed_commands": list(config.allowed_commands),
        "denied_operators": list(_SHELL_DENIED_OPERATORS),
        "workspace_rules_version": "best_effort_shell_boundary.v1",
        "authorization": "workspace_tools_and_checked_shell_only; unknown_forbidden",
    }


def _tool_contract(config: RuntimeConfig) -> dict[str, Any]:
    return {
        "schema": "tianwen.runtime_tool_contract.v1",
        "tools": {
            **{name: effect.value for name, effect in sorted(_FILE_EFFECTS.items())},
            **{name: effect.value for name, effect in sorted(_SHELL_EFFECTS.items())},
        },
        "shell": {
            "allowed_commands": list(config.allowed_commands),
            "denied_operators": list(_SHELL_DENIED_OPERATORS),
            "default_timeout": 60,
            "denied_env_patterns": ["*KEY*", "*TOKEN*", "*SECRET*", "*COOKIE*"],
        },
    }


def runtime_manifest_digests(config: RuntimeConfig) -> dict[str, str]:
    return {
        "policy_digest": content_digest(_runtime_policy(config)),
        "tool_contract_digest": content_digest(_tool_contract(config)),
        "workspace_digest": content_digest(str(config.workspace.resolve())),
    }


class RepoTaskRuntime:
    def __init__(
        self,
        store: StateStore,
        harness_store: StepStore,
        model: Model | KnownModelName,
        config: RuntimeConfig,
    ) -> None:
        self.store = store
        self.harness_store = harness_store
        self.model = model
        self.config = config

    async def run(self, run: RunRecord, prompt: str) -> RuntimeOutcome:
        owner_id = self._lease_owner()
        generation = self.store.acquire_lease(run.run_id, owner_id, ttl_seconds=5)
        try:
            self._validate_manifest(run, prompt)
            self._set_run_status(run, RunStatus.RUNNING)
            self.store.append_event(run.run_id, "run_started", {"owner_id": owner_id})
            try:
                result = await self._agent(run).run(prompt, conversation_id=run.run_id)
            except ModelUsageUnavailable:
                self._set_run_status(run, RunStatus.WAITING, "unmetered_model_usage")
                raise
            except BudgetExceeded:
                self._set_run_status(run, RunStatus.WAITING, "model_budget_exhausted")
                raise
            return self._persist_result(run, result)
        finally:
            self.store.renew_lease(run.run_id, owner_id, generation, ttl_seconds=0)

    async def resume_approval(
        self,
        run: RunRecord,
        checkpoint_id: str,
        approvals: dict[str, bool],
    ) -> RuntimeOutcome:
        owner_id = self._lease_owner()
        generation = self.store.acquire_lease(run.run_id, owner_id, ttl_seconds=5)
        try:
            self._validate_manifest(run)
            checkpoint = self._checkpoint(run, checkpoint_id)
            history = ModelMessagesTypeAdapter.validate_json(checkpoint.state["messages_json"])
            action_to_tool_call = checkpoint.state["action_to_tool_call"]
            unknown = set(approvals).difference(action_to_tool_call)
            if unknown:
                raise StateConflict("approval contains an action outside the checkpoint")
            for action_id, approved in approvals.items():
                if not approved:
                    self.store.transition_action(
                        action_id,
                        {ActionStatus.WAITING_APPROVAL},
                        ActionStatus.DENIED,
                    )
                    self.store.append_event(run.run_id, "action_denied_by_approval", {"action_id": action_id})
            tool_approvals = {
                action_to_tool_call[action_id]: approved
                for action_id, approved in approvals.items()
                if action_id in action_to_tool_call
            }
            self._set_run_status(run, RunStatus.RUNNING)
            try:
                result = await self._agent(run).run(
                    message_history=history,
                    deferred_tool_results=DeferredToolResults(approvals=tool_approvals),
                    conversation_id=run.run_id,
                )
            except ModelUsageUnavailable:
                self._set_run_status(run, RunStatus.WAITING, "unmetered_model_usage")
                raise
            except BudgetExceeded:
                self._set_run_status(run, RunStatus.WAITING, "model_budget_exhausted")
                raise
            return self._persist_result(run, result)
        finally:
            self.store.renew_lease(run.run_id, owner_id, generation, ttl_seconds=0)

    async def recover(self, run: RunRecord) -> RuntimeOutcome:
        owner_id = self._lease_owner()
        generation = self.store.acquire_lease(run.run_id, owner_id, ttl_seconds=5)
        try:
            self._validate_manifest(run)
            unresolved = self.store.unresolved_actions(run.run_id)
            affected = self.store.mark_inflight_actions_unknown(run.run_id)
            waiting = tuple(action.action_id for action in [*unresolved, *affected])
            if waiting:
                waiting = tuple(dict.fromkeys(waiting))
                self.store.append_event(
                    run.run_id,
                    "recovery_waiting_for_unknown_action",
                    {"action_ids": waiting},
                )
                self._set_run_status(run, RunStatus.WAITING, "unknown_action")
                return RuntimeOutcome(None, waiting)
            checkpoint = self.store.latest_checkpoint(run.run_id)
            if checkpoint is None:
                self._set_run_status(run, RunStatus.WAITING, "missing_stable_checkpoint")
                return RuntimeOutcome(None)
            history = ModelMessagesTypeAdapter.validate_json(checkpoint.state["messages_json"])
            try:
                result = await self._agent(run).run(
                    message_history=history,
                    conversation_id=run.run_id,
                )
            except ModelUsageUnavailable:
                self._set_run_status(run, RunStatus.WAITING, "unmetered_model_usage")
                raise
            except BudgetExceeded:
                self._set_run_status(run, RunStatus.WAITING, "model_budget_exhausted")
                raise
            return self._persist_result(run, result)
        finally:
            self.store.renew_lease(run.run_id, owner_id, generation, ttl_seconds=0)

    def _agent(self, run: RunRecord) -> Agent[object, str | DeferredToolRequests]:
        skills = self._frozen_skills()
        task = self.store.get_object("task", run.task_id, TaskRecord)
        gateway = ActionGatewayCapability(
            store=self.store,
            tianwen_run_id=run.run_id,
            classify=self._classify,
            authorized=self._authorized,
            loop_id=task.loop_id,
        )
        return Agent(
            _BudgetedModel(self.model, self.store, run.run_id, task.loop_id),
            output_type=[str, DeferredToolRequests],
            capabilities=[
                gateway,
                StepPersistence(store=self.harness_store, agent_name="repo_task"),
                FileSystem(root_dir=self.config.workspace),
                Shell(
                    cwd=self.config.workspace,
                    allowed_commands=list(self.config.allowed_commands),
                    denied_commands=[],
                    denied_operators=list(_SHELL_DENIED_OPERATORS),
                    denied_env_patterns=["*KEY*", "*TOKEN*", "*SECRET*", "*COOKIE*"],
                    default_timeout=60,
                ),
                skills,
            ],
        )

    def _frozen_skills(self) -> Skills[object]:
        return Skills(self.config.skill_dir, include=["repo-task"])

    def _persist_result(self, run: RunRecord, result: Any) -> RuntimeOutcome:
        if isinstance(result.output, DeferredToolRequests):
            action_to_tool_call = {
                metadata["action_id"]: tool_call_id
                for tool_call_id, metadata in result.output.metadata.items()
                if "action_id" in metadata
            }
            checkpoint = self._save_checkpoint(
                run,
                result.all_messages_json(),
                action_to_tool_call,
            )
            self._set_run_status(run, RunStatus.WAITING, "user_approval")
            return RuntimeOutcome(None, tuple(action_to_tool_call), checkpoint.checkpoint_id)
        checkpoint = self._save_checkpoint(run, result.all_messages_json(), {})
        self._set_run_status(run, RunStatus.COMPLETED)
        return RuntimeOutcome(str(result.output), checkpoint_id=checkpoint.checkpoint_id)

    def _save_checkpoint(
        self,
        run: RunRecord,
        messages_json: bytes,
        action_to_tool_call: dict[str, str],
    ) -> CheckpointRecord:
        events = self.store.list_events(run.run_id)
        state = {
            "messages_json": messages_json.decode("utf-8"),
            "action_to_tool_call": action_to_tool_call,
        }
        checkpoint = CheckpointRecord(
            checkpoint_id=f"checkpoint:{uuid4().hex}",
            run_id=run.run_id,
            event_sequence=events[-1].sequence if events else 0,
            state_digest=content_digest(state),
            state=state,
        )
        self.store.save_checkpoint(checkpoint)
        return checkpoint

    def _checkpoint(self, run: RunRecord, checkpoint_id: str) -> CheckpointRecord:
        checkpoint = self.store.latest_checkpoint(run.run_id)
        if checkpoint is None or checkpoint.checkpoint_id != checkpoint_id:
            raise StateConflict(f"missing checkpoint {checkpoint_id}")
        if checkpoint.state_digest != content_digest(checkpoint.state):
            raise StateConflict("checkpoint digest does not match state")
        return checkpoint

    def _validate_manifest(self, run: RunRecord, prompt: str | None = None) -> None:
        manifest = run.manifest
        if manifest.pydantic_ai_version != version("pydantic-ai-slim"):
            raise StateConflict("pydantic-ai version does not match run manifest")
        if manifest.harness_version != version("pydantic-ai-harness"):
            raise StateConflict("harness version does not match run manifest")
        if manifest.model_id != self._model_id():
            raise StateConflict("model does not match run manifest")
        if prompt is not None and manifest.prompt_digest != content_digest(prompt):
            raise StateConflict("prompt does not match run manifest")
        skill = self.config.skill_dir / "repo-task" / "SKILL.md"
        if manifest.skill_digests.get("repo_task") != content_digest(skill.read_text(encoding="utf-8")):
            raise StateConflict("repo_task skill does not match run manifest")
        digests = runtime_manifest_digests(self.config)
        for field, digest in digests.items():
            if getattr(manifest, field) != digest:
                raise StateConflict(f"{field.removesuffix('_digest').replace('_', ' ')} does not match run manifest")

    def _set_run_status(self, run: RunRecord, status: RunStatus, reason: str | None = None) -> None:
        self.store.put_object(
            "run",
            run.run_id,
            run.task_id,
            status.value,
            run.model_copy(update={"status": status, "status_reason": reason}),
        )

    def _model_id(self) -> str:
        if isinstance(self.model, str):
            return self.model
        return self.model.model_name

    def _classify(self, tool_name: str, args: dict[str, Any]) -> EffectClass:
        if not self._authorized(tool_name, args):
            return EffectClass.FORBIDDEN
        return _FILE_EFFECTS.get(tool_name, _SHELL_EFFECTS.get(tool_name, EffectClass.FORBIDDEN))

    def _authorized(self, tool_name: str, args: dict[str, Any]) -> bool:
        if tool_name in _FILE_EFFECTS:
            return True
        if tool_name in {"check_command", "stop_command"}:
            command_id = args.get("command_id")
            return isinstance(command_id, str) and bool(re.fullmatch(r"[A-Za-z0-9_-]+", command_id))
        if tool_name not in {"run_command", "start_command"}:
            return False
        command = args.get("command")
        if not isinstance(command, str) or not command.strip():
            return False
        if any(operator in command for operator in _SHELL_DENIED_OPERATORS):
            return False
        if ".." in command or "\\\\" in command or re.search(r"[A-Za-z]:[\\/]", command):
            return False
        if re.search(r"(?:^|[^A-Za-z0-9])/(?!/)", command):
            return False
        try:
            tokens = shlex.split(command, posix=False)
        except ValueError:
            return False
        if any(ntpath.isabs(token) or ntpath.splitdrive(token)[0] for token in tokens):
            return False
        if not tokens or tokens[0] not in self.config.allowed_commands:
            return False
        return tokens[0].lower() not in {"cd", "cmd", "powershell", "pwsh", "sh", "bash", "zsh"}

    @staticmethod
    def _lease_owner() -> str:
        return f"runtime:{uuid4().hex}"
