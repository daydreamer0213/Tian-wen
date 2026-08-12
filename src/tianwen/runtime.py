from __future__ import annotations

import shutil
import tempfile
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path
from typing import Any
from uuid import uuid4

from pydantic_ai import Agent, DeferredToolRequests, DeferredToolResults, ModelMessagesTypeAdapter
from pydantic_ai.models import KnownModelName, Model
from pydantic_ai_harness import FileSystem, Shell
from pydantic_ai_harness.skills import Skills
from pydantic_ai_harness.step_persistence import StepPersistence, StepStore

from tianwen.domain import CheckpointRecord, RunRecord, RunStatus, content_digest
from tianwen.gateway import ActionGatewayCapability, EffectClass
from tianwen.store import StateConflict, StateStore


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
            result = await self._agent(run).run(prompt, conversation_id=run.run_id)
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
            tool_approvals = {
                action_to_tool_call[action_id]: approved
                for action_id, approved in approvals.items()
                if action_id in action_to_tool_call
            }
            self._set_run_status(run, RunStatus.RUNNING)
            result = await self._agent(run).run(
                message_history=history,
                deferred_tool_results=DeferredToolResults(approvals=tool_approvals),
                conversation_id=run.run_id,
            )
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
            result = await self._agent(run).run(
                message_history=history,
                conversation_id=run.run_id,
            )
            return self._persist_result(run, result)
        finally:
            self.store.renew_lease(run.run_id, owner_id, generation, ttl_seconds=0)

    def _agent(self, run: RunRecord) -> Agent[object, str | DeferredToolRequests]:
        skills = self._frozen_skills()
        gateway = ActionGatewayCapability(
            store=self.store,
            tianwen_run_id=run.run_id,
            classify=self._classify,
            authorized=lambda _name, _args: True,
        )
        return Agent(
            self.model,
            output_type=[str, DeferredToolRequests],
            capabilities=[
                gateway,
                StepPersistence(store=self.harness_store, agent_name="repo_task"),
                FileSystem(root_dir=self.config.workspace),
                Shell(
                    cwd=self.config.workspace,
                    allowed_commands=list(self.config.allowed_commands),
                    denied_commands=[],
                    denied_env_patterns=["*KEY*", "*TOKEN*", "*SECRET*", "*COOKIE*"],
                    default_timeout=60,
                ),
                skills,
            ],
        )

    def _frozen_skills(self) -> Skills[object]:
        source = self.config.skill_dir / "repo_task"
        with tempfile.TemporaryDirectory(dir=self.config.workspace) as directory:
            destination = Path(directory) / "repo-task"
            shutil.copytree(source, destination)
            return Skills(Path(directory), include=["repo-task"])

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
        if manifest.model_id != getattr(self.model, "model_name", ""):
            raise StateConflict("model does not match run manifest")
        if prompt is not None and manifest.prompt_digest != content_digest(prompt):
            raise StateConflict("prompt does not match run manifest")
        skill = self.config.skill_dir / "repo_task" / "SKILL.md"
        if manifest.skill_digests.get("repo_task") != content_digest(skill.read_text(encoding="utf-8")):
            raise StateConflict("repo_task skill does not match run manifest")

    def _set_run_status(self, run: RunRecord, status: RunStatus, reason: str | None = None) -> None:
        self.store.put_object(
            "run",
            run.run_id,
            run.task_id,
            status.value,
            run.model_copy(update={"status": status, "status_reason": reason}),
        )

    @staticmethod
    def _classify(tool_name: str, _args: dict[str, Any]) -> EffectClass:
        if tool_name in {"read_file", "list_files", "find_files", "search_files", "load_capability"}:
            return EffectClass.READ_ONLY
        if tool_name in {"write_file", "edit_file", "delete_file", "move_file"}:
            return EffectClass.REVERSIBLE_WORKSPACE_WRITE
        if tool_name == "run_command":
            return EffectClass.EXTERNAL_OR_IRREVERSIBLE
        return EffectClass.FORBIDDEN

    @staticmethod
    def _lease_owner() -> str:
        return f"runtime:{uuid4().hex}"
