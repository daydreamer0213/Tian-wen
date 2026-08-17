from __future__ import annotations

import json
import sqlite3
from collections.abc import Sequence
from pathlib import Path
from typing import Literal

from pydantic import Field, JsonValue, ValidationError, model_validator

from tianwen.alpha import (
    AlphaTrialConditionSnapshot,
    AlphaTrialRunner,
    AlphaTrialState,
    PreparedTrial,
    TrialManifest,
    TrialResult,
    TrialUsage,
)
from tianwen.domain import ArtifactStatus, ArtifactVersion, FrozenModel, content_digest
from tianwen.evaluation import ActivePointer
from tianwen.store import StateConflict, StateStore

PairRole = Literal["champion", "challenger"]
PairStatus = Literal["PASS", "FAIL", "INCONCLUSIVE"]
DescriptiveComparison = Literal["champion_better", "challenger_better", "tie"]


class AlphaComparisonError(RuntimeError):
    """A pair cannot be compared under the requested frozen authority."""


class PairedComparisonLeg(FrozenModel):
    role: PairRole
    trial_id: str
    workspace_identity: str
    store_path: str
    store_identity: str
    skill_version_id: str
    skill_digest: str
    artifact_status: Literal["active", "candidate"]
    parent_version_id: str | None

    @model_validator(mode="after")
    def validate_store_binding(self) -> PairedComparisonLeg:
        if self.store_identity != content_digest(str(Path(self.store_path).resolve())):
            raise ValueError("pair leg store identity does not match its path")
        return self


class PairedComparisonManifest(FrozenModel):
    schema_version: Literal["tianwen.alpha_b_pair_manifest.v1"] = "tianwen.alpha_b_pair_manifest.v1"
    pair_id: str
    repeat_index: int = Field(gt=0)
    execution_order: tuple[PairRole, PairRole]
    common_condition: AlphaTrialConditionSnapshot
    common_condition_digest: str
    champion: PairedComparisonLeg
    challenger: PairedComparisonLeg

    @model_validator(mode="after")
    def validate_content_bindings(self) -> PairedComparisonManifest:
        if self.execution_order not in {
            ("champion", "challenger"),
            ("challenger", "champion"),
        }:
            raise ValueError("pair execution order must contain each role exactly once")
        if self.champion.role != "champion" or self.challenger.role != "challenger":
            raise ValueError("pair leg roles do not match their bindings")
        if self.champion.trial_id == self.challenger.trial_id:
            raise ValueError("pair trials must be distinct")
        if self.champion.workspace_identity == self.challenger.workspace_identity:
            raise ValueError("pair workspaces must be isolated")
        if self.champion.store_identity == self.challenger.store_identity:
            raise ValueError("pair durable stores must be isolated")
        if (
            self.champion.skill_version_id == self.challenger.skill_version_id
            or self.champion.skill_digest == self.challenger.skill_digest
        ):
            raise ValueError("pair Skill bindings must be different")
        if self.common_condition_digest != content_digest(self.common_condition):
            raise ValueError("pair common condition digest does not match its snapshot")
        if self.pair_id != _pair_id(
            self.repeat_index,
            self.execution_order,
            self.common_condition_digest,
            self.champion,
            self.challenger,
        ):
            raise ValueError("pair id does not match its authority")
        return self


class PairedArmProjection(FrozenModel):
    role: PairRole
    trial_id: str
    manifest_digest: str
    result_digest: str
    goal_id: str
    store_identity: str
    skill_version_id: str
    skill_digest: str
    verdict: Literal["met", "not_met", "inconclusive"]
    failure_categories: tuple[str, ...]
    execution_status: Literal["completed", "stopped", "failed"]
    verification_status: Literal["completed", "unavailable", "invalid"]
    boundary_status: Literal["passed", "violated", "unknown"]
    usage: TrialUsage
    user_interruptions: Literal[0] = 0


class PairedComparisonResult(FrozenModel):
    schema_version: Literal["tianwen.alpha_b_pair_result.v1"] = "tianwen.alpha_b_pair_result.v1"
    pair_id: str
    repeat_index: int = Field(gt=0)
    status: PairStatus
    reason_codes: tuple[str, ...]
    comparison: DescriptiveComparison | None
    champion: PairedArmProjection | None
    challenger: PairedArmProjection | None

    @model_validator(mode="after")
    def validate_truthful_projection(self) -> PairedComparisonResult:
        if self.champion is not None and self.champion.role != "champion":
            raise ValueError("Champion projection has the wrong role")
        if self.challenger is not None and self.challenger.role != "challenger":
            raise ValueError("Challenger projection has the wrong role")
        if self.champion is not None and self.challenger is not None and (
            self.champion.trial_id == self.challenger.trial_id
            or self.champion.store_identity == self.challenger.store_identity
        ):
            raise ValueError("pair result projections are not isolated")
        if self.status == "PASS":
            if self.comparison is None or self.champion is None or self.challenger is None:
                raise ValueError("a passing pair requires two arms and a descriptive comparison")
            if self.reason_codes:
                raise ValueError("a passing pair cannot claim failure reasons")
            champion_rank = (
                self.champion.boundary_status == "passed",
                self.champion.verdict == "met",
            )
            challenger_rank = (
                self.challenger.boundary_status == "passed",
                self.challenger.verdict == "met",
            )
            expected: DescriptiveComparison = (
                "champion_better"
                if champion_rank > challenger_rank
                else "challenger_better"
                if challenger_rank > champion_rank
                else "tie"
            )
            if self.comparison != expected:
                raise ValueError("pair descriptive comparison does not match its projections")
        elif self.comparison is not None:
            raise ValueError("a non-passing pair cannot claim a descriptive comparison")
        elif not self.reason_codes:
            raise ValueError("a non-passing pair requires reason codes")
        return self


class PairedComparisonAggregate(FrozenModel):
    schema_version: Literal["tianwen.alpha_b_pair_aggregate.v1"] = "tianwen.alpha_b_pair_aggregate.v1"
    aggregate_id: str
    status: PairStatus
    pair_ids: tuple[str, ...]
    pair_results: tuple[PairedComparisonResult, ...]
    comparison_counts: dict[str, int]
    champion_usage: TrialUsage | None
    challenger_usage: TrialUsage | None
    champion_user_interruptions: int | None = Field(ge=0)
    challenger_user_interruptions: int | None = Field(ge=0)

    @model_validator(mode="after")
    def validate_derived_fields(self) -> PairedComparisonAggregate:
        try:
            pair_results = tuple(
                PairedComparisonResult.model_validate(item.model_dump(mode="python"), strict=True)
                for item in self.pair_results
            )
            expected = _aggregate_fields(pair_results)
        except (AlphaComparisonError, TypeError, ValueError, ValidationError) as error:
            raise ValueError("aggregate nested pair receipts are invalid") from error
        actual = {
            "aggregate_id": self.aggregate_id,
            "status": self.status,
            "pair_ids": self.pair_ids,
            "comparison_counts": self.comparison_counts,
            "champion_usage": self.champion_usage,
            "challenger_usage": self.challenger_usage,
            "champion_user_interruptions": self.champion_user_interruptions,
            "challenger_user_interruptions": self.challenger_user_interruptions,
        }
        if actual != expected:
            raise ValueError("aggregate derived fields do not match nested pair receipts")
        return self


def _pair_id(
    repeat_index: int,
    execution_order: tuple[PairRole, PairRole],
    common_condition_digest: str,
    champion: PairedComparisonLeg,
    challenger: PairedComparisonLeg,
) -> str:
    return content_digest(
        {
            "schema_version": "tianwen.alpha_b_pair_manifest.v1",
            "repeat_index": repeat_index,
            "execution_order": execution_order,
            "common_condition_digest": common_condition_digest,
            "champion": champion.model_dump(mode="json"),
            "challenger": challenger.model_dump(mode="json"),
        }
    )


def _leg(
    role: PairRole,
    prepared: PreparedTrial,
    artifact: ArtifactVersion,
) -> PairedComparisonLeg:
    return PairedComparisonLeg(
        role=role,
        trial_id=prepared.preview.trial_id,
        workspace_identity=content_digest(str(prepared.paths.workspace.resolve())),
        store_path=str(prepared._app.store.database.resolve()),
        store_identity=content_digest(str(prepared._app.store.database.resolve())),
        skill_version_id=prepared.champion_version_id,
        skill_digest=prepared.champion_digest,
        artifact_status=artifact.status.value,
        parent_version_id=artifact.parent_version_id,
    )


def _prepared_state(prepared: PreparedTrial) -> AlphaTrialState:
    store = prepared._app.store
    try:
        state = store.get_object("alpha_trial_state", prepared.preview.trial_id, AlphaTrialState)
    except (StateConflict, TypeError, ValueError, ValidationError) as error:
        raise AlphaComparisonError("pair Trial store state is missing or invalid") from error
    if (
        state.stage != "prepared"
        or state.preview_digest != content_digest(prepared.preview)
        or state.trial_manifest_digest is not None
        or state.goal_id is not None
        or state.run_ids
        or state.completed_round_ids
        or state.result_digest is not None
        or prepared.champion_version_id != prepared.preview.champion_version_id
        or prepared.champion_digest != prepared.preview.champion_digest
    ):
        raise AlphaComparisonError("pair Trial state must still be fresh and prepared")
    for kind, model in (("alpha_trial_manifest", TrialManifest), ("alpha_trial_result", TrialResult)):
        try:
            store.get_object(kind, state.trial_id, model)
        except StateConflict:
            continue
        except (TypeError, ValueError, ValidationError) as error:
            raise AlphaComparisonError(f"pair prepared Trial has invalid {kind}") from error
        raise AlphaComparisonError(f"pair prepared Trial already has {kind}")
    return state


def _prepared_artifact(prepared: PreparedTrial) -> ArtifactVersion:
    try:
        artifact = prepared._app.artifact(prepared.champion_version_id)
    except (StateConflict, TypeError, ValueError, ValidationError) as error:
        raise AlphaComparisonError("pair Trial artifact is missing or invalid") from error
    if (
        artifact.artifact_id != "repo-task"
        or artifact.artifact_type != "repo_task_skill"
        or artifact.version_id != prepared.champion_version_id
        or artifact.content_digest != prepared.champion_digest
        or artifact.content_digest != content_digest(artifact.content)
    ):
        raise AlphaComparisonError("pair Trial artifact binding is invalid")
    return artifact


def _persist_pair_authority(
    authority: PairedComparisonManifest,
    prepared_trials: tuple[PreparedTrial, PreparedTrial],
) -> None:
    for prepared in prepared_trials:
        try:
            existing = prepared._app.store.get_object(
                "alpha_pair_authority", prepared.preview.trial_id, PairedComparisonManifest
            )
        except StateConflict:
            continue
        except (TypeError, ValueError, ValidationError) as error:
            raise AlphaComparisonError("pair authority replay is unreadable") from error
        if existing != authority:
            raise AlphaComparisonError("pair authority replay conflicts with the prepared Trial")
    for prepared in prepared_trials:
        try:
            prepared._app.store.put_immutable_object(
                "alpha_pair_authority",
                prepared.preview.trial_id,
                authority.pair_id,
                "prepared",
                authority,
            )
        except StateConflict as error:
            raise AlphaComparisonError("pair authority replay conflicts with the prepared Trial") from error


def prepare_pair_authority(
    champion_runner: AlphaTrialRunner,
    champion_prepared: PreparedTrial,
    challenger_runner: AlphaTrialRunner,
    challenger_prepared: PreparedTrial,
    *,
    repeat_index: int,
    execution_order: tuple[PairRole, PairRole],
) -> PairedComparisonManifest:
    """Freeze a fair pair before either trial is allowed to send a model request."""

    if repeat_index <= 0:
        raise AlphaComparisonError("pair repeat index must be positive")
    if execution_order not in {
        ("champion", "challenger"),
        ("challenger", "champion"),
    }:
        raise AlphaComparisonError("pair execution order must contain each role exactly once")
    _prepared_state(champion_prepared)
    _prepared_state(challenger_prepared)
    champion_artifact = _prepared_artifact(champion_prepared)
    challenger_artifact = _prepared_artifact(challenger_prepared)
    try:
        champion_active = champion_prepared._app.active_version("repo-task")
        challenger_active = challenger_prepared._app.active_version("repo-task")
        challenger_store_champion = challenger_prepared._app.artifact(challenger_active)
    except (StateConflict, TypeError, ValueError, ValidationError) as error:
        raise AlphaComparisonError("pair active artifact pointer is missing or invalid") from error
    if champion_artifact.status is not ArtifactStatus.ACTIVE or champion_active != champion_artifact.version_id:
        raise AlphaComparisonError("pair Champion must be the current ACTIVE artifact")
    if (
        challenger_artifact.status is not ArtifactStatus.CANDIDATE
        or challenger_artifact.parent_version_id != champion_artifact.version_id
        or challenger_active != champion_artifact.version_id
        or challenger_store_champion.status is not ArtifactStatus.ACTIVE
        or challenger_store_champion.version_id != champion_artifact.version_id
    ):
        raise AlphaComparisonError("pair Challenger must be a Candidate of the current Champion")
    champion = _leg("champion", champion_prepared, champion_artifact)
    challenger = _leg("challenger", challenger_prepared, challenger_artifact)
    if champion.trial_id == challenger.trial_id:
        raise AlphaComparisonError("pair trial ids must be distinct")
    if champion.workspace_identity == challenger.workspace_identity:
        raise AlphaComparisonError("pair workspace isolation is required")
    if champion.store_identity == challenger.store_identity:
        raise AlphaComparisonError("pair durable store isolation is required")
    if (
        champion.skill_version_id == challenger.skill_version_id
        or champion.skill_digest == challenger.skill_digest
    ):
        raise AlphaComparisonError("pair Skill bindings must be different")
    champion_condition = champion_runner.condition_snapshot(champion_prepared)
    challenger_condition = challenger_runner.condition_snapshot(challenger_prepared)
    if champion_condition != challenger_condition:
        raise AlphaComparisonError("pair common conditions do not match")
    common_condition_digest = content_digest(champion_condition)
    authority = PairedComparisonManifest(
        pair_id=_pair_id(
            repeat_index,
            execution_order,
            common_condition_digest,
            champion,
            challenger,
        ),
        repeat_index=repeat_index,
        execution_order=execution_order,
        common_condition=champion_condition,
        common_condition_digest=common_condition_digest,
        champion=champion,
        challenger=challenger,
    )
    _persist_pair_authority(authority, (champion_prepared, challenger_prepared))
    return authority


def _stable_policy(manifest: TrialManifest) -> dict[str, JsonValue]:
    rounds = manifest.runtime_policy_snapshot.get("rounds")
    if not isinstance(rounds, dict):
        return {}
    stable_rounds: dict[str, JsonValue] = {}
    for round_id, authority in rounds.items():
        if not isinstance(authority, dict):
            return {}
        stable_rounds[round_id] = {
            "policy": authority.get("policy"),
            "policy_digest": authority.get("policy_digest"),
        }
    return {"schema": "tianwen.alpha_trial_condition_policy.v1", "rounds": stable_rounds}


def _stable_tools(manifest: TrialManifest) -> dict[str, JsonValue]:
    rounds = manifest.tool_contract_snapshot.get("rounds")
    if not isinstance(rounds, dict):
        return {}
    stable_rounds: dict[str, JsonValue] = {}
    for round_id, authority in rounds.items():
        if not isinstance(authority, dict):
            return {}
        stable_rounds[round_id] = {
            "tool_contract": authority.get("tool_contract"),
            "tool_contract_digest": authority.get("tool_contract_digest"),
        }
    return {"schema": "tianwen.alpha_trial_condition_tools.v1", "rounds": stable_rounds}


def _manifest_condition_errors(
    manifest: TrialManifest,
    condition: AlphaTrialConditionSnapshot,
) -> list[str]:
    errors: list[str] = []
    expected = {
        "task_id": condition.task_id,
        "task_version": condition.task_version,
        "task_bundle_digest": condition.task_bundle_digest,
        "model_input_digest": condition.model_input_digest,
        "model_id": condition.model_id,
        "model_settings_snapshot": condition.model_settings_snapshot,
        "model_settings_digest": condition.model_settings_digest,
        "provider_name": condition.provider_name,
        "provider_base_url": condition.provider_base_url,
        "provider_config_digest": content_digest(
            {
                "provider_name": condition.provider_name,
                "provider_base_url": condition.provider_base_url,
                "model_id": condition.model_id,
            }
        ),
        "pydantic_ai_version": condition.pydantic_ai_version,
        "harness_version": condition.harness_version,
        "image_manifest_digest": condition.image_manifest_digest,
        "image_platform_digest": condition.image_platform_digest,
        "container_config_snapshot": {
            "image_manifest_digest": condition.image_manifest_digest,
            "image_platform_digest": condition.image_platform_digest,
        },
        "container_config_digest": content_digest(
            {
                "image_manifest_digest": condition.image_manifest_digest,
                "image_platform_digest": condition.image_platform_digest,
            }
        ),
        "named_checks_snapshot": condition.named_checks_snapshot,
        "named_checks_digest": condition.named_checks_digest,
        "verifier_snapshot": condition.verifier_snapshot,
        "verifier_digest": condition.verifier_digest,
        "baseline_tree_digest": condition.baseline_tree_digest,
        "budget": condition.budget,
    }
    for field, value in expected.items():
        if getattr(manifest, field) != value:
            errors.append(f"manifest_{field}_mismatch")
    expected_round_digest = content_digest(json.dumps(list(condition.round_order)))
    if manifest.round_order_digest != expected_round_digest:
        errors.append("manifest_round_order_mismatch")
    if _stable_policy(manifest) != condition.runtime_policy_snapshot:
        errors.append("manifest_runtime_policy_mismatch")
    if _stable_tools(manifest) != condition.tool_contract_snapshot:
        errors.append("manifest_tool_contract_mismatch")
    return errors


def _binding_errors(
    role: PairRole,
    leg: PairedComparisonLeg,
    condition: AlphaTrialConditionSnapshot,
    manifest: TrialManifest,
    result: TrialResult,
) -> list[str]:
    errors: list[str] = []
    errors.extend(f"{role}_{item}" for item in _manifest_condition_errors(manifest, condition))
    if manifest.trial_id != leg.trial_id:
        errors.append(f"{role}_trial_binding_mismatch")
    if manifest.champion_version_id != leg.skill_version_id or manifest.champion_digest != leg.skill_digest:
        errors.append(f"{role}_skill_binding_mismatch")
    if manifest.workspace_identity != leg.workspace_identity:
        errors.append(f"{role}_workspace_binding_mismatch")
    if result.trial_manifest_digest != content_digest(manifest):
        errors.append(f"{role}_manifest_result_digest_mismatch")
    result_expected = {
        "trial_id": manifest.trial_id,
        "task_id": manifest.task_id,
        "task_version": manifest.task_version,
        "model_id": manifest.model_id,
        "champion_version_id": manifest.champion_version_id,
        "champion_digest": manifest.champion_digest,
        "baseline_tree_digest": manifest.baseline_tree_digest,
        "verifier_digest": manifest.verifier_snapshot.get("digest"),
    }
    for field, value in result_expected.items():
        if getattr(result, field) != value:
            errors.append(f"{role}_result_{field}_mismatch")
    if content_digest(str(Path(result.workspace_path).resolve())) != manifest.workspace_identity:
        errors.append(f"{role}_result_workspace_mismatch")
    if _store_identity(result.workspace_path) != leg.store_identity:
        errors.append(f"{role}_result_store_mismatch")
    return errors


def _store_identity(workspace_path: str) -> str:
    database = Path(workspace_path).resolve().parent / "state" / "tianwen.db"
    return content_digest(str(database.resolve()))


def _strict_manifest(value: object) -> TrialManifest | None:
    try:
        payload = value.model_dump(mode="python") if isinstance(value, TrialManifest) else value
        return TrialManifest.model_validate(payload, strict=True)
    except (TypeError, ValueError, ValidationError):
        return None


def _strict_result(value: object) -> TrialResult | None:
    try:
        payload = value.model_dump(mode="python") if isinstance(value, TrialResult) else value
        return TrialResult.model_validate(payload, strict=True)
    except (TypeError, ValueError, ValidationError):
        return None


def _projection(
    role: PairRole,
    leg: PairedComparisonLeg,
    manifest: TrialManifest,
    result: TrialResult,
) -> PairedArmProjection:
    return PairedArmProjection(
        role=role,
        trial_id=result.trial_id,
        manifest_digest=content_digest(manifest),
        result_digest=content_digest(result),
        goal_id=result.goal_id,
        store_identity=leg.store_identity,
        skill_version_id=result.champion_version_id,
        skill_digest=result.champion_digest,
        verdict=result.verdict,
        failure_categories=result.failure_categories,
        execution_status=result.execution_status,
        verification_status=result.verification_status,
        boundary_status=result.boundary_status,
        usage=result.usage,
        user_interruptions=0,
    )


def _result(
    authority: PairedComparisonManifest,
    status: PairStatus,
    reason_codes: tuple[str, ...],
    *,
    comparison: DescriptiveComparison | None = None,
    champion: PairedArmProjection | None = None,
    challenger: PairedArmProjection | None = None,
) -> PairedComparisonResult:
    return PairedComparisonResult(
        pair_id=authority.pair_id,
        repeat_index=authority.repeat_index,
        status=status,
        reason_codes=reason_codes,
        comparison=comparison,
        champion=champion,
        challenger=challenger,
    )


def _load_durable(
    store: StateStore,
    kind: str,
    object_id: str,
    model: type[FrozenModel],
    reason: str,
) -> tuple[FrozenModel | None, str | None]:
    try:
        return store.get_object(kind, object_id, model), None
    except StateConflict:
        return None, f"{reason}_missing"
    except (OSError, sqlite3.Error, TypeError, ValueError, ValidationError):
        return None, f"{reason}_unreadable"


def _durable_arm(
    authority: PairedComparisonManifest,
    role: PairRole,
    leg: PairedComparisonLeg,
    supplied_manifest: object,
    supplied_result: object,
) -> tuple[
    PairedArmProjection | None,
    TrialManifest | None,
    TrialResult | None,
    list[str],
    list[str],
]:
    failures: list[str] = []
    unknowns: list[str] = []
    database = Path(leg.store_path)
    if not database.is_file():
        return None, None, None, failures, [f"{role}_durable_store_missing"]
    store = StateStore(database)

    durable_authority, reason = _load_durable(
        store,
        "alpha_pair_authority",
        leg.trial_id,
        PairedComparisonManifest,
        f"{role}_durable_authority",
    )
    state, state_reason = _load_durable(
        store,
        "alpha_trial_state",
        leg.trial_id,
        AlphaTrialState,
        f"{role}_durable_state",
    )
    manifest, manifest_reason = _load_durable(
        store,
        "alpha_trial_manifest",
        leg.trial_id,
        TrialManifest,
        f"{role}_durable_manifest",
    )
    result, result_reason = _load_durable(
        store,
        "alpha_trial_result",
        leg.trial_id,
        TrialResult,
        f"{role}_durable_result",
    )
    artifact, artifact_reason = _load_durable(
        store,
        "artifact",
        leg.skill_version_id,
        ArtifactVersion,
        f"{role}_durable_artifact",
    )
    pointer, pointer_reason = _load_durable(
        store,
        "active_pointer",
        "repo-task",
        ActivePointer,
        f"{role}_active_pointer",
    )
    unknowns.extend(
        item
        for item in (
            reason,
            state_reason,
            manifest_reason,
            result_reason,
            artifact_reason,
            pointer_reason,
        )
        if item is not None
    )

    if durable_authority is not None and durable_authority != authority:
        failures.append(f"{role}_durable_authority_mismatch")
    if isinstance(artifact, ArtifactVersion):
        if (
            artifact.artifact_id != "repo-task"
            or artifact.artifact_type != "repo_task_skill"
            or artifact.version_id != leg.skill_version_id
            or artifact.content_digest != leg.skill_digest
            or artifact.content_digest != content_digest(artifact.content)
            or artifact.status.value != leg.artifact_status
            or artifact.parent_version_id != leg.parent_version_id
        ):
            failures.append(f"{role}_artifact_binding_mismatch")
    if isinstance(pointer, ActivePointer):
        expected_active = (
            authority.champion.skill_version_id if role == "challenger" else leg.skill_version_id
        )
        if pointer.artifact_id != "repo-task" or pointer.current_version_id != expected_active:
            failures.append(f"{role}_active_pointer_mismatch")
        active_artifact, active_reason = _load_durable(
            store,
            "artifact",
            pointer.current_version_id,
            ArtifactVersion,
            f"{role}_active_artifact",
        )
        if active_reason is not None:
            unknowns.append(active_reason)
        elif isinstance(active_artifact, ArtifactVersion) and active_artifact.status is not ArtifactStatus.ACTIVE:
            failures.append(f"{role}_active_artifact_status_mismatch")

    durable_manifest = manifest if isinstance(manifest, TrialManifest) else None
    durable_result = result if isinstance(result, TrialResult) else None
    durable_state = state if isinstance(state, AlphaTrialState) else None
    if durable_state is not None:
        if durable_state.trial_id != leg.trial_id:
            failures.append(f"{role}_state_trial_binding_mismatch")
        if durable_state.stage != "finished":
            unknowns.append(f"{role}_trial_{durable_state.stage}")
        if durable_manifest is not None and durable_state.trial_manifest_digest != content_digest(
            durable_manifest
        ):
            failures.append(f"{role}_state_manifest_digest_mismatch")
        if durable_result is not None:
            if durable_state.result_digest != content_digest(durable_result):
                failures.append(f"{role}_state_result_digest_mismatch")
            if durable_state.goal_id != durable_result.goal_id:
                failures.append(f"{role}_state_goal_binding_mismatch")
            if durable_state.run_ids != durable_result.run_ids:
                failures.append(f"{role}_state_run_binding_mismatch")

    strict_manifest = None if supplied_manifest is None else _strict_manifest(supplied_manifest)
    strict_result = None if supplied_result is None else _strict_result(supplied_result)
    if supplied_manifest is None:
        unknowns.append(f"{role}_manifest_missing")
    elif strict_manifest is None:
        unknowns.append(f"{role}_manifest_malformed")
    elif durable_manifest is not None and strict_manifest != durable_manifest:
        failures.append(f"{role}_supplied_manifest_durable_mismatch")
    if supplied_result is None:
        unknowns.append(f"{role}_result_missing")
    elif strict_result is None:
        unknowns.append(f"{role}_result_malformed")
    elif durable_result is not None and strict_result != durable_result:
        failures.append(f"{role}_supplied_result_durable_mismatch")

    if (
        failures
        or unknowns
        or strict_manifest is None
        or strict_result is None
        or durable_manifest is None
        or durable_result is None
    ):
        return None, durable_manifest, durable_result, failures, unknowns
    binding_errors = _binding_errors(
        role,
        leg,
        authority.common_condition,
        durable_manifest,
        durable_result,
    )
    if binding_errors:
        failures.extend(binding_errors)
        return None, durable_manifest, durable_result, failures, unknowns
    return (
        _projection(role, leg, durable_manifest, durable_result),
        durable_manifest,
        durable_result,
        failures,
        unknowns,
    )


def compare_pair(
    authority: PairedComparisonManifest,
    *,
    champion_manifest: TrialManifest | None,
    champion_result: TrialResult | None,
    challenger_manifest: TrialManifest | None,
    challenger_result: TrialResult | None,
) -> PairedComparisonResult:
    """Project two immutable Alpha Trial receipts without mutating governance state."""
    try:
        authority = PairedComparisonManifest.model_validate(authority.model_dump(mode="python"), strict=True)
    except (TypeError, ValueError, ValidationError):
        return _result(authority, "FAIL", ("pair_authority_invalid",))
    champion, durable_champion_manifest, champion_durable_result, champion_errors, champion_unknowns = (
        _durable_arm(
            authority,
            "champion",
            authority.champion,
            champion_manifest,
            champion_result,
        )
    )
    challenger, durable_challenger_manifest, challenger_durable_result, challenger_errors, challenger_unknowns = (
        _durable_arm(
            authority,
            "challenger",
            authority.challenger,
            challenger_manifest,
            challenger_result,
        )
    )
    errors = [*champion_errors, *challenger_errors]
    unknowns = [*champion_unknowns, *challenger_unknowns]
    if (
        durable_champion_manifest is not None
        and durable_challenger_manifest is not None
        and durable_champion_manifest.workspace_identity
        == durable_challenger_manifest.workspace_identity
    ):
        errors.append("manifest_workspace_isolation_mismatch")
    if (
        champion_durable_result is not None
        and challenger_durable_result is not None
        and _store_identity(champion_durable_result.workspace_path)
        == _store_identity(challenger_durable_result.workspace_path)
    ):
        errors.append("result_store_isolation_mismatch")
    if errors:
        return _result(
            authority,
            "FAIL",
            tuple(dict.fromkeys(errors)),
            champion=champion,
            challenger=challenger,
        )
    if unknowns:
        return _result(
            authority,
            "INCONCLUSIVE",
            tuple(dict.fromkeys(unknowns)),
            champion=champion,
            challenger=challenger,
        )
    assert champion_durable_result is not None and challenger_durable_result is not None
    uncertain: list[str] = []
    for role, result in (
        ("champion", champion_durable_result),
        ("challenger", challenger_durable_result),
    ):
        if result.execution_status != "completed":
            uncertain.append(f"{role}_execution_{result.execution_status}")
        if result.verification_status != "completed":
            uncertain.append(f"{role}_verification_{result.verification_status}")
        if result.verdict == "inconclusive":
            uncertain.append(f"{role}_verdict_inconclusive")
        if result.boundary_status == "unknown":
            uncertain.append(f"{role}_boundary_unknown")
    if uncertain:
        return _result(
            authority,
            "INCONCLUSIVE",
            tuple(uncertain),
            champion=champion,
            challenger=challenger,
        )
    assert champion is not None and challenger is not None
    champion_rank = (champion.boundary_status == "passed", champion.verdict == "met")
    challenger_rank = (challenger.boundary_status == "passed", challenger.verdict == "met")
    comparison: DescriptiveComparison = (
        "champion_better"
        if champion_rank > challenger_rank
        else "challenger_better"
        if challenger_rank > champion_rank
        else "tie"
    )
    return _result(
        authority,
        "PASS",
        (),
        comparison=comparison,
        champion=champion,
        challenger=challenger,
    )


def _role_totals(
    results: tuple[PairedComparisonResult, ...],
    role: PairRole,
) -> tuple[TrialUsage | None, int | None]:
    arms = tuple(getattr(result, role) for result in results)
    if any(arm is None for arm in arms):
        return None, None
    complete_arms = tuple(arm for arm in arms if arm is not None)
    return (
        TrialUsage(
            model_requests=sum(arm.usage.model_requests for arm in complete_arms),
            tokens=sum(arm.usage.tokens for arm in complete_arms),
            tool_calls=sum(arm.usage.tool_calls for arm in complete_arms),
            action_effects=sum(arm.usage.action_effects for arm in complete_arms),
            wall_seconds=sum(arm.usage.wall_seconds for arm in complete_arms),
        ),
        sum(arm.user_interruptions for arm in complete_arms),
    )


def _aggregate_fields(
    pair_results: tuple[PairedComparisonResult, ...],
) -> dict[str, object]:
    if not pair_results:
        raise AlphaComparisonError("at least one pair result is required")
    pair_ids = tuple(result.pair_id for result in pair_results)
    if len(set(pair_ids)) != len(pair_ids):
        raise AlphaComparisonError("pair ids must be unique")
    repeat_indexes = tuple(result.repeat_index for result in pair_results)
    if repeat_indexes != tuple(range(1, len(pair_results) + 1)):
        raise AlphaComparisonError("pair repeat indexes must be ordered and contiguous from 1")
    status: PairStatus = (
        "FAIL"
        if any(result.status == "FAIL" for result in pair_results)
        else "INCONCLUSIVE"
        if any(result.status == "INCONCLUSIVE" for result in pair_results)
        else "PASS"
    )
    comparison_counts = {
        comparison: sum(result.comparison == comparison for result in pair_results)
        for comparison in ("champion_better", "challenger_better", "tie")
    }
    champion_usage, champion_user_interruptions = _role_totals(pair_results, "champion")
    challenger_usage, challenger_user_interruptions = _role_totals(pair_results, "challenger")
    payload = {
        "schema_version": "tianwen.alpha_b_pair_aggregate.v1",
        "status": status,
        "pair_ids": pair_ids,
        "pair_results": [result.model_dump(mode="json") for result in pair_results],
        "comparison_counts": comparison_counts,
        "champion_usage": champion_usage.model_dump(mode="json") if champion_usage else None,
        "challenger_usage": challenger_usage.model_dump(mode="json") if challenger_usage else None,
        "champion_user_interruptions": champion_user_interruptions,
        "challenger_user_interruptions": challenger_user_interruptions,
    }
    return {
        "aggregate_id": content_digest(payload),
        "status": status,
        "pair_ids": pair_ids,
        "comparison_counts": comparison_counts,
        "champion_usage": champion_usage,
        "challenger_usage": challenger_usage,
        "champion_user_interruptions": champion_user_interruptions,
        "challenger_user_interruptions": challenger_user_interruptions,
    }


def aggregate_pair_results(
    results: Sequence[PairedComparisonResult],
) -> PairedComparisonAggregate:
    """Aggregate ordered pair receipts without inferring improvement or promotion authority."""

    pair_results = tuple(results)
    fields = _aggregate_fields(pair_results)
    return PairedComparisonAggregate(
        aggregate_id=str(fields["aggregate_id"]),
        status=fields["status"],
        pair_ids=fields["pair_ids"],
        pair_results=pair_results,
        comparison_counts=fields["comparison_counts"],
        champion_usage=fields["champion_usage"],
        challenger_usage=fields["challenger_usage"],
        champion_user_interruptions=fields["champion_user_interruptions"],
        challenger_user_interruptions=fields["challenger_user_interruptions"],
    )
