from __future__ import annotations

import asyncio
import json
import math
import os
import secrets
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from importlib.metadata import version
from pathlib import Path
from typing import Any, Literal

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from pydantic import Field, JsonValue, model_validator
from pydantic_ai.models import KnownModelName, Model
from pydantic_ai_harness.step_persistence import SqliteStepStore

from tianwen.alpha_docker import DockerCheckExecutor, DockerExecutionError, DockerPreflight, VerifierResult
from tianwen.alpha_public_key import alpha_public_evaluator_key
from tianwen.alpha_runtime import AlphaRuntime, AlphaRuntimeConfig, alpha_runtime_manifest_digests
from tianwen.alpha_tasks import AlphaTaskBundle, load_task_bundle
from tianwen.alpha_workspace import (
    AlphaTrialPaths,
    ArtifactEntry,
    TreeSnapshot,
    _create_trial_workspace,
    artifact_entries,
    capture_git_evidence,
    scan_for_credential_value,
    write_bounded_artifact,
)
from tianwen.app import TianwenApp, TianwenConfig, default_eval_protocol
from tianwen.domain import (
    BudgetLimit,
    EvidenceRecord,
    ExplorationBrief,
    ExplorationStopReason,
    FrozenModel,
    GoalContract,
    RunManifest,
    RunRecord,
    RunStatus,
    content_digest,
    utc_now,
)
from tianwen.gateway import EffectClass, execute_action, proposal_action_id
from tianwen.runtime import model_identity
from tianwen.store import BudgetExceeded, StateConflict, StateStore


class AlphaTrialError(RuntimeError):
    """A trial cannot safely advance its durable controller state."""


class PreviewRound(FrozenModel):
    round_id: str
    instruction: str
    feedback: str | None
    public_check_ids: tuple[str, ...]


class TrialPreview(FrozenModel):
    schema_version: Literal["tianwen.alpha_trial_preview.v1"] = "tianwen.alpha_trial_preview.v1"
    trial_id: str
    previous_trial_id: str | None
    task_id: str
    task_version: str
    task_bundle_digest: str
    objective: str
    acceptance: tuple[str, ...]
    rounds: tuple[PreviewRound, ...]
    authorizations: tuple[str, ...]
    budget: BudgetLimit
    model_id: str
    provider_name: str
    champion_version_id: str
    champion_digest: str
    image_digest: str
    data_root: str
    paid_request_warning: str


class TrialConfirmation(FrozenModel):
    schema_version: Literal["tianwen.alpha_trial_confirmation.v1"] = "tianwen.alpha_trial_confirmation.v1"
    trial_id: str
    preview_digest: str
    confirmed_via: Literal["local_tty"]
    confirmed_at: datetime = Field(default_factory=utc_now)


class TrialManifest(FrozenModel):
    schema_version: Literal["tianwen.alpha_trial_manifest.v1"] = "tianwen.alpha_trial_manifest.v1"
    trial_id: str
    previous_trial_id: str | None
    task_id: str
    task_version: str
    task_bundle_digest: str
    model_input_digest: str
    round_order_digest: str
    goal_contract_digest: str
    confirmation_digest: str
    evidence_packet_digest: str
    model_id: str
    model_settings_snapshot: dict[str, JsonValue]
    model_settings_digest: str
    provider_name: str
    provider_base_url: str
    provider_config_digest: str
    pydantic_ai_version: str
    harness_version: str
    champion_version_id: str
    champion_digest: str
    runtime_policy_snapshot: dict[str, JsonValue]
    runtime_policy_digest: str
    tool_contract_snapshot: dict[str, JsonValue]
    tool_contract_digest: str
    image_manifest_digest: str
    image_platform_digest: str
    container_config_snapshot: dict[str, JsonValue]
    container_config_digest: str
    named_checks_snapshot: dict[str, JsonValue]
    named_checks_digest: str
    verifier_snapshot: dict[str, JsonValue]
    verifier_digest: str
    baseline_tree_digest: str
    budget: BudgetLimit
    workspace_identity: str
    created_at: datetime = Field(default_factory=utc_now)


class AlphaTrialState(FrozenModel):
    schema_version: Literal["tianwen.alpha_trial_state.v1"] = "tianwen.alpha_trial_state.v1"
    trial_id: str
    stage: Literal["prepared", "running", "settling", "finished"]
    preview_digest: str
    trial_manifest_digest: str | None
    goal_id: str | None
    run_ids: tuple[str, ...]
    completed_round_ids: tuple[str, ...]
    started_at: datetime
    wall_deadline: datetime
    result_digest: str | None = None


class TrialUsage(FrozenModel):
    model_requests: int = Field(ge=0)
    tokens: int = Field(ge=0)
    tool_calls: int = Field(ge=0)
    action_effects: int = Field(ge=0)
    wall_seconds: int = Field(ge=0)


class TrialResult(FrozenModel):
    schema_version: Literal["tianwen.alpha_trial_result.v1"] = "tianwen.alpha_trial_result.v1"
    trial_id: str
    previous_trial_id: str | None
    trial_manifest_digest: str
    goal_id: str
    run_ids: tuple[str, ...]
    exploration_run_ids: tuple[str, ...]
    checkpoint_ids: tuple[str, ...]
    task_id: str
    task_version: str
    model_id: str
    champion_version_id: str
    champion_digest: str
    baseline_tree_digest: str
    final_tree_digest: str
    diff_digest: str
    verifier_digest: str
    verdict: Literal["met", "not_met", "inconclusive"]
    failure_categories: tuple[str, ...]
    execution_status: Literal["completed", "stopped", "failed"]
    verification_status: Literal["completed", "unavailable", "invalid"]
    boundary_status: Literal["passed", "violated", "unknown"]
    action_ids: tuple[str, ...]
    evidence_ids: tuple[str, ...]
    usage: TrialUsage
    run_stop_reasons: tuple[str, ...]
    workspace_path: str
    artifacts: tuple[ArtifactEntry, ...]
    qualifies_as_real_model_trial: bool
    started_at: datetime
    finished_at: datetime

    @model_validator(mode="after")
    def validate_truthful_statuses(self) -> TrialResult:
        if self.verification_status != "completed" and self.verdict != "inconclusive":
            raise ValueError("non-completed verification requires inconclusive verdict")
        if "unresolved_action" in self.failure_categories and self.boundary_status != "unknown":
            raise ValueError("unresolved action requires unknown boundary")
        if self.qualifies_as_real_model_trial and (not self.usage.model_requests or self.execution_status == "stopped"):
            raise ValueError("real model trial requires a completed model request")
        return self


@dataclass(frozen=True)
class PreparedTrial:
    _bundle: AlphaTaskBundle
    paths: AlphaTrialPaths
    baseline: TreeSnapshot
    preflight: DockerPreflight
    seed_verifier: VerifierResult
    champion_version_id: str
    champion_digest: str
    preview: TrialPreview
    _app: TianwenApp


def _json_value(value: Any, *, key: str = "") -> JsonValue:
    sensitive = ("key", "token", "secret", "password", "cookie", "authorization", "header", "account")
    if any(token in key.casefold() for token in sensitive):
        raise AlphaTrialError("model settings contain a credential-like key")
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise AlphaTrialError("model settings contain a non-finite float")
        return value
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if isinstance(value, dict):
        if not all(isinstance(item, str) for item in value):
            raise AlphaTrialError("model settings keys must be strings")
        return {item: _json_value(value[item], key=item) for item in sorted(value)}
    raise AlphaTrialError("model settings must be JSON values")


def sanitize_model_settings(model: Model | KnownModelName) -> dict[str, JsonValue]:
    if isinstance(model, str):
        return {}
    settings = getattr(model, "settings", None)
    if settings is None:
        return {}
    raw = settings.model_dump(mode="json") if hasattr(settings, "model_dump") else settings
    value = _json_value(raw)
    if not isinstance(value, dict):
        raise AlphaTrialError("model settings must be an object")
    return value


def sanitize_provider(model: Model | KnownModelName) -> tuple[str, str, str]:
    if isinstance(model, str):
        return model.split(":", 1)[0], "", model
    provider = getattr(model, "provider", None)
    return (
        str(getattr(provider, "name", "test")) if provider is not None else "test",
        str(getattr(provider, "base_url", "")) if provider is not None else "",
        str(model.model_id),
    )


class AlphaTrialRunner:
    """One serial, durable coordinator for a single local Alpha trial."""

    def __init__(
        self,
        *,
        task_root: Path,
        image_lock_path: Path,
        data_root: Path,
        model: Model | KnownModelName,
        public_evaluator_key: Ed25519PublicKey | None = None,
        docker_factory: Callable[[AlphaTrialPaths, AlphaTaskBundle, StateStore], Any] = DockerCheckExecutor,
        allowed_drive: str = "D:",
    ) -> None:
        self.task_root, self.image_lock_path, self.data_root = task_root, image_lock_path, data_root
        self.model, self.public_evaluator_key, self.docker_factory, self.allowed_drive = (
            model,
            public_evaluator_key or alpha_public_evaluator_key(),
            docker_factory,
            allowed_drive,
        )
        self.store: StateStore | None = None
        self.app: TianwenApp | None = None
        self.exploration_finished_at = utc_now()

    def prepare(self, task_id: str, *, budget: BudgetLimit, previous_trial_id: str | None = None) -> PreparedTrial:
        if budget.model_requests <= 0 or budget.tokens <= 0 or budget.wall_seconds <= 0:
            raise AlphaTrialError("trial requires a nonzero request, token, and wall budget")
        bundle = load_task_bundle(self.task_root / task_id, self.image_lock_path)
        trial_id = f"trial-{secrets.token_hex(16)}"
        paths, baseline = _create_trial_workspace(self.data_root, trial_id, bundle, allowed_drive=self.allowed_drive)
        app = TianwenApp(
            TianwenConfig(
                data_dir=paths.state,
                workspace=paths.workspace,
                model=self.model,
                public_evaluator_key=self.public_evaluator_key,
                approved_protocol=default_eval_protocol(),
                recorded_search_path=(bundle.root / bundle.task.sources[0].search_results_path)
                if bundle.task.sources
                else None,
                recorded_fetch_path=(bundle.root / bundle.task.sources[0].fetched_content_path)
                if bundle.task.sources
                else None,
                allowed_commands=(),
            )
        )
        self.store, self.app = app.store, app
        champion = app.artifact(app.active_version("repo-task"))
        app.materialize_skill(champion.version_id)
        docker = self.docker_factory(paths, bundle, app.store)
        preflight = docker.preflight()
        seed = self._run(docker.run_seed_preflight())
        if seed.verdict != "not_met":
            raise AlphaTrialError("seed verifier must be valid not_met")
        sanitize_model_settings(self.model)
        provider_name, _provider_url, model_id = sanitize_provider(self.model)
        if not model_id or ":" not in model_id:
            raise AlphaTrialError("model identity must be fully qualified")
        authorizations = ("workspace_read", "workspace_write", "isolated_check_execution") + (
            ("external_read",) if task_id == "A3" else ()
        )
        preview = TrialPreview(
            trial_id=trial_id,
            previous_trial_id=previous_trial_id,
            task_id=task_id,
            task_version=bundle.task.task_version,
            task_bundle_digest=bundle.task_bundle_digest,
            objective=bundle.task.title,
            acceptance=bundle.task.public_acceptance,
            rounds=tuple(
                PreviewRound(
                    round_id=round_spec.round_id,
                    instruction=bundle.instruction,
                    feedback=bundle.feedback_by_round.get(round_spec.round_id),
                    public_check_ids=round_spec.public_check_ids,
                )
                for round_spec in bundle.task.rounds
            ),
            authorizations=authorizations,
            budget=budget,
            model_id=model_id,
            provider_name=provider_name,
            champion_version_id=champion.version_id,
            champion_digest=champion.content_digest,
            image_digest=bundle.image_lock.manifest_digest,
            data_root=str(paths.data_root),
            paid_request_warning="Real API fees may be incurred after confirmation.",
        )
        app.store.put_immutable_object("alpha_trial_preview", trial_id, None, "prepared", preview)
        write_bounded_artifact(
            paths,
            bundle.task,
            "trial-preview.json",
            preview.model_dump_json().encode("utf-8"),
            reserve_bytes=1024 * 1024,
        )
        now = utc_now()
        self._put_state(
            app.store,
            AlphaTrialState(
                trial_id=trial_id,
                stage="prepared",
                preview_digest=content_digest(preview),
                trial_manifest_digest=None,
                goal_id=None,
                run_ids=(),
                completed_round_ids=(),
                started_at=now,
                wall_deadline=now + timedelta(seconds=budget.wall_seconds),
            ),
        )
        return PreparedTrial(
            bundle, paths, baseline, preflight, seed, champion.version_id, champion.content_digest, preview, app
        )

    async def execute(self, prepared: PreparedTrial, confirmation: TrialConfirmation) -> TrialResult:
        if confirmation.trial_id != prepared.preview.trial_id or confirmation.preview_digest != content_digest(
            prepared.preview
        ):
            raise AlphaTrialError("confirmation does not match preview")
        app, store, bundle = prepared._app, prepared._app.store, prepared._bundle
        self.app, self.store = app, store
        state = store.get_object("alpha_trial_state", prepared.preview.trial_id, AlphaTrialState)
        if state.stage == "finished":
            return store.get_object("alpha_trial_result", state.trial_id, TrialResult)
        store.put_immutable_object("alpha_trial_confirmation", state.trial_id, None, "confirmed", confirmation)
        if utc_now() > state.wall_deadline:
            raise AlphaTrialError("trial budget deadline elapsed before execution")
        goal = app.create_goal(
            objective=prepared.preview.objective,
            criteria=prepared.preview.acceptance,
            workspace=prepared.paths.workspace,
            authorization=prepared.preview.authorizations,
            budget=prepared.preview.budget,
        )
        exploration_run_ids: tuple[str, ...] = ()
        stop_reasons: list[str] = []
        if bundle.task.task_id == "A3":
            report = await asyncio.to_thread(
                app.explore, goal.goal_id, self._a3_brief(state.trial_id, app.goal_task(goal.goal_id).task_id)
            )
            exploration_run_ids = tuple(
                run.run_id
                for run in store.list_objects("run", RunRecord)
                if run.task_id == app.goal_task(goal.goal_id).task_id and run.run_id.startswith("explore:")
            )
            self.exploration_finished_at = utc_now()
            if report.stop_reason is not ExplorationStopReason.SUFFICIENT:
                stop_reasons.append("exploration_insufficient")
        manifest = self._manifest(prepared, goal, confirmation)
        manifest_digest = content_digest(manifest)
        store.put_immutable_object("alpha_trial_manifest", state.trial_id, goal.goal_id, "active", manifest)
        raw_manifest = manifest.model_dump_json().encode("utf-8")
        write_bounded_artifact(prepared.paths, bundle.task, "trial-manifest.json", raw_manifest)
        if (
            content_digest(TrialManifest.model_validate_json(prepared.paths.trial_manifest_json.read_bytes()))
            != manifest_digest
        ):
            raise AlphaTrialError("trial manifest mirror digest mismatch")
        self._put_state(
            store,
            state.model_copy(
                update={"stage": "running", "trial_manifest_digest": manifest_digest, "goal_id": goal.goal_id}
            ),
        )
        run_ids: list[str] = []
        if not stop_reasons:
            for round_spec in bundle.task.rounds:
                if utc_now() > state.wall_deadline:
                    stop_reasons.append("wall_deadline")
                    break
                run = await self._run_round(prepared, goal, manifest_digest, round_spec.round_id)
                run_ids.append(run.run_id)
                current = store.get_object("alpha_trial_state", state.trial_id, AlphaTrialState)
                self._put_state(
                    store,
                    current.model_copy(
                        update={
                            "run_ids": tuple(run_ids),
                            "completed_round_ids": current.completed_round_ids
                            + ((run.manifest.round_id,) if run.status is RunStatus.COMPLETED else ()),
                        }
                    ),
                )
                if run.status is not RunStatus.COMPLETED:
                    stop_reasons.append(run.status_reason or run.status.value)
                    break
        return await self._settle(prepared, goal, manifest, tuple(run_ids), exploration_run_ids, stop_reasons)

    async def resume(self, trial_id: str) -> TrialResult:
        if self.store is None:
            database = self.data_root / "runs" / trial_id / "state" / "tianwen.db"
            self.store = StateStore(database)
            self.store.initialize()
        state = self.store.get_object("alpha_trial_state", trial_id, AlphaTrialState)
        if state.stage != "finished":
            raise AlphaTrialError("resume requires recovery of the exact unfinished durable stage")
        return self.store.get_object("alpha_trial_result", trial_id, TrialResult)

    def _manifest(self, prepared: PreparedTrial, goal: GoalContract, confirmation: TrialConfirmation) -> TrialManifest:
        app, bundle = prepared._app, prepared._bundle
        settings = sanitize_model_settings(self.model)
        provider_name, provider_url, model_id = sanitize_provider(self.model)
        packet = app.goal_evidence_packet(goal.goal_id)
        runtime_config = AlphaRuntimeConfig(
            prepared.paths.workspace,
            app.materialize_skill(prepared.champion_version_id),
            bundle,
            prepared.paths,
            bundle.task.rounds[0].round_id,
            "sha256:pending",
        )
        runtime_digests = alpha_runtime_manifest_digests(runtime_config)
        named_checks = {item.check_id: item.model_dump(mode="json") for item in bundle.task.named_checks}
        verifier = bundle.task.final_verifier.model_dump(mode="json")
        container = {
            "image_manifest_digest": bundle.image_lock.manifest_digest,
            "image_platform_digest": bundle.image_lock.platform_digest,
        }
        return TrialManifest(
            trial_id=prepared.preview.trial_id,
            previous_trial_id=prepared.preview.previous_trial_id,
            task_id=bundle.task.task_id,
            task_version=bundle.task.task_version,
            task_bundle_digest=bundle.task_bundle_digest,
            model_input_digest=bundle.model_input_digest,
            round_order_digest=content_digest(json.dumps([item.round_id for item in bundle.task.rounds])),
            goal_contract_digest=content_digest(goal),
            confirmation_digest=content_digest(confirmation),
            evidence_packet_digest=content_digest(packet),
            model_id=model_id,
            model_settings_snapshot=settings,
            model_settings_digest=content_digest(settings),
            provider_name=provider_name,
            provider_base_url=provider_url,
            provider_config_digest=content_digest(
                {"provider_name": provider_name, "provider_base_url": provider_url, "model_id": model_id}
            ),
            pydantic_ai_version=version("pydantic-ai-slim"),
            harness_version=version("pydantic-ai-harness"),
            champion_version_id=prepared.champion_version_id,
            champion_digest=prepared.champion_digest,
            runtime_policy_snapshot={},
            runtime_policy_digest=runtime_digests["policy_digest"],
            tool_contract_snapshot={},
            tool_contract_digest=runtime_digests["tool_contract_digest"],
            image_manifest_digest=bundle.image_lock.manifest_digest,
            image_platform_digest=bundle.image_lock.platform_digest,
            container_config_snapshot=container,
            container_config_digest=content_digest(container),
            named_checks_snapshot=named_checks,
            named_checks_digest=content_digest(named_checks),
            verifier_snapshot=verifier,
            verifier_digest=content_digest(verifier),
            baseline_tree_digest=prepared.baseline.digest,
            budget=prepared.preview.budget,
            workspace_identity=content_digest(str(prepared.paths.workspace.resolve())),
        )

    async def _run_round(
        self, prepared: PreparedTrial, goal: GoalContract, manifest_digest: str, round_id: str
    ) -> RunRecord:
        app, bundle, store = prepared._app, prepared._bundle, prepared._app.store
        round_spec = next(item for item in bundle.task.rounds if item.round_id == round_id)
        prompt = json.dumps(
            {
                "goal_id": goal.goal_id,
                "goal_contract_digest": content_digest(goal),
                "round_id": round_id,
                "instruction": bundle.instruction,
                "public_check_ids": round_spec.public_check_ids,
                "feedback": bundle.feedback_by_round.get(round_id),
                "evidence_packet": app.goal_evidence_packet(goal.goal_id),
                "boundaries": "workspace only; no shell",
            },
            ensure_ascii=False,
            sort_keys=True,
        )
        config = AlphaRuntimeConfig(
            prepared.paths.workspace,
            app.materialize_skill(prepared.champion_version_id),
            bundle,
            prepared.paths,
            round_id,
            manifest_digest,
        )
        digests = alpha_runtime_manifest_digests(config)
        run = RunRecord(
            run_id=f"alpha:{prepared.preview.trial_id}:{round_id}",
            task_id=app.goal_task(goal.goal_id).task_id,
            status=RunStatus.QUEUED,
            manifest=RunManifest(
                workflow_version="tianwen-alpha-v1",
                schema_version="2",
                pydantic_ai_version=version("pydantic-ai-slim"),
                harness_version=version("pydantic-ai-harness"),
                model_id=model_identity(self.model, schema_version="2"),
                prompt_digest=content_digest(prompt),
                skill_versions={"repo_task": prepared.champion_version_id},
                skill_digests={"repo_task": prepared.champion_digest},
                policy_digest=digests["policy_digest"],
                tool_contract_digest=digests["tool_contract_digest"],
                goal_contract_digest=content_digest(goal),
                workspace_digest=digests["workspace_digest"],
                trial_id=prepared.preview.trial_id,
                round_id=round_id,
                trial_manifest_digest=manifest_digest,
            ),
        )
        store.put_object("run", run.run_id, run.task_id, run.status.value, run)
        runtime = AlphaRuntime(
            store,
            SqliteStepStore(database=store.database),
            self.model,
            config,
            self.docker_factory(prepared.paths, bundle, store),
        )
        try:
            outcome = await runtime.run(run, prompt)
            if outcome.output is not None:
                write_bounded_artifact(
                    prepared.paths,
                    bundle.task,
                    f"outputs/{run.run_id.replace(':', '-')}.txt",
                    outcome.output.encode("utf-8"),
                )
            app.project_run_outcomes(goal.goal_id, run.run_id)
        except (BudgetExceeded, TimeoutError, Exception):
            pass
        return store.get_object("run", run.run_id, RunRecord)

    async def _settle(
        self,
        prepared: PreparedTrial,
        goal: GoalContract,
        manifest: TrialManifest,
        run_ids: tuple[str, ...],
        exploration_run_ids: tuple[str, ...],
        stop_reasons: list[str],
    ) -> TrialResult:
        store, bundle = prepared._app.store, prepared._bundle
        state = store.get_object("alpha_trial_state", prepared.preview.trial_id, AlphaTrialState)
        self._put_state(store, state.model_copy(update={"stage": "settling", "run_ids": run_ids}))
        evidence = capture_git_evidence(prepared.paths)
        final_run_id = run_ids[-1] if run_ids else exploration_run_ids[-1]
        result: VerifierResult | None = None
        verification_status: Literal["completed", "unavailable", "invalid"] = "completed"
        final_action_id = ""
        try:
            args = {"verifier_id": "final", "verifier_digest": bundle.task.final_verifier.digest}
            action_id = proposal_action_id(
                final_run_id, f"alpha-final-{prepared.preview.trial_id}", "final_verify", args
            )
            action, result = await execute_action(
                store,
                final_run_id,
                f"alpha-final-{prepared.preview.trial_id}",
                "final_verify",
                args,
                EffectClass.EXTERNAL_READ_ONLY,
                "isolated_check_execution" in goal.authorization,
                lambda _args: self.docker_factory(prepared.paths, bundle, store).run_final(action_id),
            )
            final_action_id = action.action_id
            if result is None:
                raise AlphaTrialError("final verifier has no result")
        except DockerExecutionError:
            verification_status = "unavailable"
        except (ValueError, AlphaTrialError):
            verification_status = "invalid"
        if result is not None and final_action_id:
            record = EvidenceRecord(
                evidence_id=content_digest({"action": final_action_id, "result": result.model_dump(mode="json")}),
                run_id=final_run_id,
                action_id=final_action_id,
                evidence_type="alpha_final_verification",
                result_class=result.verdict,
                effect_class=EffectClass.EXTERNAL_READ_ONLY.value,
                version_bucket="frozen",
                cost_bucket="controller",
                needed_user=False,
                safety_category="final_verifier",
                summary="controller final verifier result",
                payload_digest=content_digest(result),
                scope=f"trial:{prepared.preview.trial_id}",
                purpose="alpha_final_verification",
                source_class="docker_verifier",
                sensitivity="internal",
                provenance_ids=(final_action_id,),
            )
            store.put_immutable_object("evidence", record.evidence_id, final_run_id, "recorded", record)
        runs = [store.get_object("run", run_id, RunRecord) for run_id in run_ids]
        execution_status: Literal["completed", "stopped", "failed"] = (
            "completed"
            if len(runs) == len(bundle.task.rounds) and all(run.status is RunStatus.COMPLETED for run in runs)
            else "failed"
            if any(run.status is RunStatus.FAILED for run in runs)
            else "stopped"
        )
        if stop_reasons:
            execution_status = "stopped" if stop_reasons == ["exploration_insufficient"] else execution_status
        unresolved = any(store.unresolved_actions(run_id) for run_id in (*run_ids, *exploration_run_ids))
        credentials = tuple(
            value for name, value in os.environ.items() if name.endswith(("_API_KEY", "_TOKEN", "_SECRET")) and value
        )
        credential_hit = any(scan_for_credential_value(prepared.paths, value) for value in credentials)
        boundary_status: Literal["passed", "violated", "unknown"] = (
            "violated" if credential_hit else "unknown" if unresolved else "passed"
        )
        verdict: Literal["met", "not_met", "inconclusive"] = (
            result.verdict if result is not None and verification_status == "completed" else "inconclusive"
        )
        paths = ["trial-preview.json", "trial-manifest.json", "diff.patch"]
        paths.extend(
            f"outputs/{run_id.replace(':', '-')}.txt"
            for run_id in run_ids
            if (prepared.paths.trial_dir / "outputs" / f"{run_id.replace(':', '-')}.txt").exists()
        )
        artifacts = artifact_entries(prepared.paths, paths)
        loop = prepared._app.goal_task(goal.goal_id).loop_id
        _limit, usage, _reserved = store.get_budget(loop)
        finished = utc_now()
        result_model = TrialResult(
            trial_id=prepared.preview.trial_id,
            previous_trial_id=prepared.preview.previous_trial_id,
            trial_manifest_digest=content_digest(manifest),
            goal_id=goal.goal_id,
            run_ids=run_ids,
            exploration_run_ids=exploration_run_ids,
            checkpoint_ids=tuple(
                filter(
                    None,
                    (
                        store.latest_checkpoint(run_id).checkpoint_id if store.latest_checkpoint(run_id) else None
                        for run_id in run_ids
                    ),
                )
            ),
            task_id=bundle.task.task_id,
            task_version=bundle.task.task_version,
            model_id=prepared.preview.model_id,
            champion_version_id=prepared.champion_version_id,
            champion_digest=prepared.champion_digest,
            baseline_tree_digest=prepared.baseline.digest,
            final_tree_digest=evidence.final_tree_digest,
            diff_digest=evidence.patch_digest,
            verifier_digest=bundle.task.final_verifier.digest,
            verdict=verdict,
            failure_categories=("unresolved_action",)
            if unresolved
            else (() if result is None else result.failure_categories),
            execution_status=execution_status,
            verification_status=verification_status,
            boundary_status=boundary_status,
            action_ids=tuple(
                action.action_id for run_id in (*run_ids, *exploration_run_ids) for action in store.list_actions(run_id)
            ),
            evidence_ids=tuple(
                record.evidence_id
                for record in store.list_objects("evidence", EvidenceRecord)
                if record.purpose in {"alpha_final_verification", "execution_evidence"}
            ),
            usage=TrialUsage(
                model_requests=usage.model_requests,
                tokens=usage.tokens,
                tool_calls=usage.tool_calls,
                action_effects=usage.action_effects,
                wall_seconds=max(0, int((finished - state.started_at).total_seconds())),
            ),
            run_stop_reasons=tuple(stop_reasons),
            workspace_path=str(prepared.paths.workspace),
            artifacts=artifacts,
            qualifies_as_real_model_trial=usage.model_requests > 0 and execution_status != "stopped",
            started_at=state.started_at,
            finished_at=finished,
        )
        store.put_immutable_object("alpha_trial_result", result_model.trial_id, goal.goal_id, "finished", result_model)
        write_bounded_artifact(
            prepared.paths,
            bundle.task,
            "trial-result.json",
            result_model.model_dump_json().encode("utf-8"),
            reserve_bytes=0,
        )
        self._put_state(
            store,
            store.get_object("alpha_trial_state", state.trial_id, AlphaTrialState).model_copy(
                update={"stage": "finished", "result_digest": content_digest(result_model)}
            ),
        )
        return result_model

    @staticmethod
    def _a3_brief(trial_id: str, task_id: str) -> ExplorationBrief:
        return ExplorationBrief(
            brief_id=f"brief:{trial_id}:urlencode-doseq",
            task_id=task_id,
            question="How should urllib.parse.urlencode encode sequence-valued query parameters?",
            decision_use="Choose the compatible query encoding option.",
            known_evidence_ids=(),
            unknowns=("urlencode doseq sequence",),
            allowed_local_roots=(".",),
            allowed_source_classes=("official_documentation",),
            allowed_domains=("docs.python.org",),
            max_searches=1,
            max_fetches=1,
            max_tokens=250,
            max_cost_microunits=2,
            wall_seconds=60,
            expected_outputs=("source-backed urlencode compatibility fact",),
            sufficiency_criteria=("urlencode doseq sequence",),
            stop_conditions=(ExplorationStopReason.SUFFICIENT, ExplorationStopReason.INSUFFICIENT_EVIDENCE),
        )

    @staticmethod
    def _put_state(store: StateStore, state: AlphaTrialState) -> None:
        try:
            old = store.get_object("alpha_trial_state", state.trial_id, AlphaTrialState)
        except StateConflict:
            store.put_object("alpha_trial_state", state.trial_id, None, state.stage, state)
            return
        stages = ("prepared", "running", "settling", "finished")
        if (
            stages.index(state.stage) < stages.index(old.stage)
            or any(
                getattr(old, key) != getattr(state, key)
                for key in ("trial_id", "preview_digest", "started_at", "wall_deadline")
            )
            or not state.run_ids[: len(old.run_ids)] == old.run_ids
            or not state.completed_round_ids[: len(old.completed_round_ids)] == old.completed_round_ids
        ):
            raise AlphaTrialError("invalid Alpha state transition")
        store.put_object("alpha_trial_state", state.trial_id, None, state.stage, state)

    @staticmethod
    def _run(awaitable: Any) -> Any:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(awaitable)
        result: list[Any] = []
        error: list[BaseException] = []

        def run() -> None:
            try:
                result.append(asyncio.run(awaitable))
            except BaseException as exc:  # pragma: no cover - re-raised on the caller thread
                error.append(exc)

        thread = threading.Thread(target=run)
        thread.start()
        thread.join()
        if error:
            raise error[0]
        return result[0]
