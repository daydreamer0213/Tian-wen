from __future__ import annotations

import json
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path
from typing import Any

from pydantic_ai import Agent, DeferredToolRequests, ModelMessagesTypeAdapter, RunContext
from pydantic_ai.models import KnownModelName, Model
from pydantic_ai.tool_manager import ToolManager
from pydantic_ai_harness import FileSystem
from pydantic_ai_harness.skills import Skills
from pydantic_ai_harness.step_persistence import StepPersistence, StepStore

from tianwen.alpha_docker import DockerCheckExecutor
from tianwen.alpha_tasks import AlphaTaskBundle
from tianwen.alpha_workspace import AlphaTrialPaths, TreeSnapshot, project_file_action, snapshot_tree
from tianwen.domain import (
    ActionStatus,
    CheckpointRecord,
    GoalContract,
    LoopRecord,
    RunRecord,
    RunStatus,
    TaskRecord,
    content_digest,
)
from tianwen.gateway import ActionGatewayCapability, EffectClass, proposal_action_id
from tianwen.runtime import (
    BudgetedModel,
    ModelUsageUnavailable,
    RepoTaskRuntime,
    RuntimeConfig,
    RuntimeOutcome,
    model_identity,
)
from tianwen.store import BudgetExceeded, StateConflict, StateStore

_SECRET_PATTERNS = (".env", ".env.*", "*.pem", "*.key", "**/secrets*")
_ALPHA_FILE_EFFECTS = {
    "read_file": EffectClass.READ_ONLY,
    "list_directory": EffectClass.READ_ONLY,
    "find_files": EffectClass.READ_ONLY,
    "search_files": EffectClass.READ_ONLY,
    "file_info": EffectClass.READ_ONLY,
    "write_file": EffectClass.REVERSIBLE_WORKSPACE_WRITE,
    "edit_file": EffectClass.REVERSIBLE_WORKSPACE_WRITE,
    "create_directory": EffectClass.REVERSIBLE_WORKSPACE_WRITE,
}


@dataclass(frozen=True)
class AlphaRuntimeConfig:
    workspace: Path
    skill_dir: Path
    bundle: AlphaTaskBundle
    paths: AlphaTrialPaths
    round_id: str
    trial_manifest_digest: str


def _round(config: AlphaRuntimeConfig) -> Any:
    return next((item for item in config.bundle.task.rounds if item.round_id == config.round_id), None)


def _policy(config: AlphaRuntimeConfig) -> dict[str, Any]:
    round_spec = _round(config)
    return {
        "schema": "tianwen.alpha_runtime_policy.v1",
        "authorization": ["workspace_read", "workspace_write", "isolated_check_execution"],
        "allowed_write_patterns": list(config.bundle.task.allowed_write_patterns),
        "protected_patterns": list(config.bundle.task.protected_patterns),
        "write_quotas": config.bundle.task.limits.model_dump(mode="json"),
        "effect_map": {name: effect.value for name, effect in sorted(_ALPHA_FILE_EFFECTS.items())}
        | {
            "run_check": EffectClass.EXTERNAL_READ_ONLY.value,
            "load_capability": EffectClass.READ_ONLY.value,
        },
        "round_id": config.round_id,
        "public_check_ids": list(round_spec.public_check_ids) if round_spec else [],
    }


def _tools(config: AlphaRuntimeConfig) -> dict[str, Any]:
    del config
    return {
        "schema": "tianwen.alpha_runtime_tools.v1",
        "shell": False,
        "tools": sorted([*_ALPHA_FILE_EFFECTS, "run_check", "load_capability"]),
    }


def alpha_runtime_manifest_digests(config: AlphaRuntimeConfig) -> dict[str, str]:
    return {
        "policy_digest": content_digest(_policy(config)),
        "tool_contract_digest": content_digest(_tools(config)),
        "workspace_digest": content_digest(str(config.workspace.resolve())),
    }


class AlphaRuntime(RepoTaskRuntime):
    def __init__(
        self,
        store: StateStore,
        harness_store: StepStore,
        model: Model | KnownModelName,
        config: AlphaRuntimeConfig,
        check_executor: DockerCheckExecutor | None = None,
    ) -> None:
        super().__init__(store, harness_store, model, RuntimeConfig(config.workspace, config.skill_dir, ()))
        self.config = config
        self.check_executor = check_executor or DockerCheckExecutor(config.paths, config.bundle, store)
        self._authorization_run_id: str | None = None
        self._baseline = snapshot_tree(config.workspace)

    async def run(self, run: RunRecord, prompt: str) -> RuntimeOutcome:
        owner_id = self._lease_owner()
        generation = self.store.acquire_lease(run.run_id, owner_id, ttl_seconds=5)
        try:
            self._validate_manifest(run, prompt)
            self.check_executor.preflight()
            self._set_run_status(run, RunStatus.RUNNING)
            self.store.append_event(run.run_id, "run_started", {"owner_id": owner_id})
            self._save_initial_checkpoint(run, prompt)
            try:
                with ToolManager.parallel_execution_mode("sequential"):
                    result = await self._agent(run).run(prompt, conversation_id=run.run_id)
            except ModelUsageUnavailable:
                self._set_run_status(run, RunStatus.WAITING, "unmetered_model_usage")
                raise
            except BudgetExceeded:
                self._set_run_status(run, RunStatus.WAITING, "model_budget_exhausted")
                raise
            except TimeoutError:
                action_ids = self._unknown_check_actions(run.run_id)
                if len(action_ids) == 1:
                    self._set_run_status(run, RunStatus.WAITING, "unknown_action")
                    self.store.append_event(run.run_id, "run_check_timeout", {"action_id": action_ids[0]})
                    return RuntimeOutcome(None, action_ids)
                self._set_run_status(run, RunStatus.FAILED, "TimeoutError")
                self.store.append_event(run.run_id, "run_failed", {"error_class": "TimeoutError"})
                raise
            except Exception as error:
                self._set_run_status(run, RunStatus.FAILED, type(error).__name__)
                self.store.append_event(run.run_id, "run_failed", {"error_class": type(error).__name__})
                raise
            return self._persist_result(run, result)
        finally:
            self.store.renew_lease(run.run_id, owner_id, generation, ttl_seconds=0)

    async def recover(self, run: RunRecord) -> RuntimeOutcome:
        owner_id = self._lease_owner()
        generation = self.store.acquire_lease(run.run_id, owner_id, ttl_seconds=5)
        try:
            self._validate_manifest(run)
            self.check_executor.preflight()
            self.store.mark_inflight_actions_unknown(run.run_id)
            reconciled: list[str] = []
            unknown = [
                action for action in self.store.unresolved_actions(run.run_id) if action.status is ActionStatus.UNKNOWN
            ]
            for action in unknown:
                result = (
                    await self.check_executor.reconcile(action.action_id) if action.tool_name == "run_check" else None
                )
                if result is None:
                    self._set_run_status(run, RunStatus.WAITING, "unknown_action")
                    return RuntimeOutcome(None, tuple(item.action_id for item in unknown))
                result_json = json.dumps(result, sort_keys=True)
                self.store.transition_action(
                    action.action_id,
                    {ActionStatus.UNKNOWN},
                    ActionStatus.SUCCEEDED,
                    content_digest(result_json),
                )
                reconciled.append(result_json)
            checkpoint = self.store.latest_checkpoint(run.run_id)
            if checkpoint is None:
                self._set_run_status(run, RunStatus.WAITING, "missing_stable_checkpoint")
                return RuntimeOutcome(None)
            if reconciled:
                checkpoint = self._save_alpha_checkpoint(
                    run,
                    checkpoint.state["messages_json"],
                    checkpoint.state["action_to_tool_call"],
                    checkpoint.state["initial_prompt"],
                    [*checkpoint.state.get("reconciled_results", []), *reconciled],
                )
            history = ModelMessagesTypeAdapter.validate_json(checkpoint.state["messages_json"])
            prompt = checkpoint.state["initial_prompt"]
            if content_digest(prompt) != run.manifest.prompt_digest:
                raise StateConflict("prompt does not match run manifest")
            controller_message = (
                f"Original prompt:\n{prompt}\n\n"
                "Reconciled check observations (do not repeat these checks):\n"
                + "\n".join(checkpoint.state.get("reconciled_results", []))
            )
            self._set_run_status(run, RunStatus.RUNNING)
            with ToolManager.parallel_execution_mode("sequential"):
                result = await self._agent(run).run(
                    controller_message,
                    message_history=history,
                    conversation_id=run.run_id,
                )
            return self._persist_result(run, result)
        except ModelUsageUnavailable:
            self._set_run_status(run, RunStatus.WAITING, "unmetered_model_usage")
            raise
        except BudgetExceeded:
            self._set_run_status(run, RunStatus.WAITING, "model_budget_exhausted")
            raise
        except Exception as error:
            self._set_run_status(run, RunStatus.FAILED, type(error).__name__)
            self.store.append_event(run.run_id, "run_failed", {"error_class": type(error).__name__})
            raise
        finally:
            self.store.renew_lease(run.run_id, owner_id, generation, ttl_seconds=0)

    def _agent(self, run: RunRecord) -> Agent[object, str | DeferredToolRequests]:
        self._authorization_run_id = run.run_id
        task = self.store.get_object("task", run.task_id, TaskRecord)
        agent = Agent(
            BudgetedModel(self.model, self.store, run.run_id, task.loop_id),
            output_type=[str, DeferredToolRequests],
            capabilities=[
                ActionGatewayCapability(
                    self.store,
                    run.run_id,
                    self._classify,
                    self._authorized,
                    task.loop_id,
                ),
                StepPersistence(store=self.harness_store, agent_name="alpha_repo_task"),
                FileSystem(
                    root_dir=self.config.workspace,
                    allowed_patterns=list(self.config.bundle.task.allowed_write_patterns),
                    denied_patterns=list(_SECRET_PATTERNS),
                    protected_patterns=list(self.config.bundle.task.protected_patterns),
                ),
                Skills(self.config.skill_dir, include=["repo-task"]),
            ],
        )

        @agent.tool(name="run_check", sequential=True, retries=0)
        async def run_check(ctx: RunContext[object], check_id: str) -> str:
            if ctx.tool_call_id is None:
                raise StateConflict("run_check requires a durable tool call id")
            action_id = proposal_action_id(
                run.run_id,
                ctx.tool_call_id,
                "run_check",
                {"check_id": check_id},
            )
            result = await self.check_executor.run(action_id, check_id)
            return (
                result.model_dump_json() if hasattr(result, "model_dump_json") else json.dumps(result, sort_keys=True)
            )

        return agent

    def _goal(self, run_id: str) -> GoalContract:
        run = self.store.get_object("run", run_id, RunRecord)
        task = self.store.get_object("task", run.task_id, TaskRecord)
        loop = self.store.get_object("loop", task.loop_id, LoopRecord)
        return self.store.get_object("goal", loop.goal_id, GoalContract)

    def _classify(self, tool_name: str, args: dict[str, Any]) -> EffectClass:
        del args
        return _ALPHA_FILE_EFFECTS.get(
            tool_name,
            {"run_check": EffectClass.EXTERNAL_READ_ONLY, "load_capability": EffectClass.READ_ONLY}.get(
                tool_name, EffectClass.FORBIDDEN
            ),
        )

    def _authorized(self, tool_name: str, args: dict[str, Any]) -> bool:
        if self._authorization_run_id is None:
            return False
        goal = self._goal(self._authorization_run_id)
        if tool_name in {"read_file", "list_directory", "find_files", "search_files", "file_info"}:
            return self._permit("workspace_read" in goal.authorization, tool_name, "workspace_read_required")
        if tool_name == "load_capability":
            return self._permit(
                "workspace_read" in goal.authorization and args.get("id") == "repo-task",
                tool_name,
                "capability_not_allowed",
            )
        if tool_name in {"write_file", "edit_file", "create_directory"}:
            if "workspace_write" not in goal.authorization:
                return self._deny(tool_name, "workspace_write_required")
            try:
                self._projected_write(tool_name, args)
            except Exception:
                return self._deny(tool_name, "write_projection_denied")
            return True
        if tool_name == "run_check":
            spec = _round(self.config)
            return self._permit(
                "isolated_check_execution" in goal.authorization
                and isinstance(args.get("check_id"), str)
                and args["check_id"] in spec.public_check_ids,
                tool_name,
                "check_not_allowed",
            )
        return self._deny(tool_name, "tool_not_allowed")

    def _permit(self, allowed: bool, tool_name: str, reason_code: str) -> bool:
        return allowed or self._deny(tool_name, reason_code)

    def _deny(self, tool_name: str, reason_code: str) -> bool:
        assert self._authorization_run_id is not None
        self.store.append_event(
            self._authorization_run_id,
            "alpha_authorization_denied",
            {"tool_name": tool_name, "reason_code": reason_code},
        )
        return False

    def _projected_write(self, tool_name: str, args: dict[str, Any]) -> TreeSnapshot:
        return project_file_action(
            self.config.workspace,
            self._baseline,
            self.config.bundle.task,
            tool_name,
            args,
        )

    def _unknown_check_actions(self, run_id: str) -> tuple[str, ...]:
        return tuple(
            action.action_id
            for action in self.store.list_actions(run_id)
            if action.tool_name == "run_check" and action.status is ActionStatus.UNKNOWN
        )

    def _validate_manifest(self, run: RunRecord, prompt: str | None = None) -> None:
        manifest = run.manifest
        if manifest.schema_version != "2":
            raise StateConflict("alpha runtime requires v2 run manifest")
        if manifest.pydantic_ai_version != version("pydantic-ai-slim") or manifest.harness_version != version(
            "pydantic-ai-harness"
        ):
            raise StateConflict("runtime version does not match run manifest")
        if manifest.model_id != model_identity(self.model, schema_version="2"):
            raise StateConflict("model does not match run manifest")
        if prompt is not None and manifest.prompt_digest != content_digest(prompt):
            raise StateConflict("prompt does not match run manifest")
        if (manifest.trial_id, manifest.round_id, manifest.trial_manifest_digest) != (
            self.config.paths.trial_id,
            self.config.round_id,
            self.config.trial_manifest_digest,
        ):
            raise StateConflict("alpha trial binding does not match run manifest")
        trial_manifest = self._trial_manifest()
        if content_digest(trial_manifest) != manifest.trial_manifest_digest:
            raise StateConflict("trial manifest digest does not match run manifest")
        expected_trial_bindings = {
            "task_bundle_digest": self.config.bundle.task_bundle_digest,
            "model_input_digest": self.config.bundle.model_input_digest,
            "image_manifest_digest": self.config.bundle.image_lock.manifest_digest,
            "image_platform_digest": self.config.bundle.image_lock.platform_digest,
            "named_checks_snapshot": {
                check.check_id: check.model_dump(mode="json") for check in self.config.bundle.task.named_checks
            },
        }
        verifier = self.config.bundle.task.final_verifier.model_dump(mode="json")
        expected_trial_bindings["named_checks_digest"] = content_digest(
            expected_trial_bindings["named_checks_snapshot"]
        )
        expected_trial_bindings["verifier_snapshot"] = verifier
        expected_trial_bindings["verifier_digest"] = content_digest(verifier)
        container = {
            "image_manifest_digest": self.config.bundle.image_lock.manifest_digest,
            "image_platform_digest": self.config.bundle.image_lock.platform_digest,
        }
        expected_trial_bindings["container_config_snapshot"] = container
        expected_trial_bindings["container_config_digest"] = content_digest(container)
        if any(trial_manifest.get(field) != value for field, value in expected_trial_bindings.items()):
            raise StateConflict("trial manifest does not bind current alpha authority")
        skill = self.config.skill_dir / "repo-task" / "SKILL.md"
        if manifest.skill_digests.get("repo_task") != content_digest(skill.read_text(encoding="utf-8")):
            raise StateConflict("repo_task skill does not match run manifest")
        for field, digest in alpha_runtime_manifest_digests(self.config).items():
            if getattr(manifest, field) != digest:
                raise StateConflict(f"{field.removesuffix('_digest').replace('_', ' ')} does not match run manifest")

    def _trial_manifest(self) -> dict[str, Any]:
        try:
            raw = self.config.paths.trial_manifest_json.read_bytes()
            value = json.loads(raw.decode("utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise StateConflict("trial manifest is unreadable") from error
        if not isinstance(value, dict):
            raise StateConflict("trial manifest is invalid")
        return value

    def _save_initial_checkpoint(self, run: RunRecord, prompt: str) -> CheckpointRecord:
        latest = self.store.latest_checkpoint(run.run_id)
        if latest is not None:
            return latest
        return self._save_alpha_checkpoint(run, "[]", {}, prompt, [])

    def _save_alpha_checkpoint(
        self,
        run: RunRecord,
        messages_json: str,
        action_to_tool_call: dict[str, str],
        initial_prompt: str,
        reconciled_results: list[str],
    ) -> CheckpointRecord:
        events = self.store.list_events(run.run_id)
        state = {
            "messages_json": messages_json,
            "action_to_tool_call": action_to_tool_call,
            "initial_prompt": initial_prompt,
            "reconciled_results": reconciled_results,
        }
        checkpoint = CheckpointRecord(
            checkpoint_id=f"checkpoint:{self._lease_owner()}",
            run_id=run.run_id,
            event_sequence=events[-1].sequence if events else 0,
            state_digest=content_digest(state),
            state=state,
        )
        self.store.save_checkpoint(checkpoint)
        return checkpoint

    def _save_checkpoint(
        self, run: RunRecord, messages_json: bytes, action_to_tool_call: dict[str, str]
    ) -> CheckpointRecord:
        latest = self.store.latest_checkpoint(run.run_id)
        initial_prompt = latest.state["initial_prompt"] if latest else ""
        reconciled = latest.state.get("reconciled_results", []) if latest else []
        return self._save_alpha_checkpoint(
            run, messages_json.decode("utf-8"), action_to_tool_call, initial_prompt, reconciled
        )
