"""Run the one-shot, bounded Alpha-C A1 live sample."""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic_ai.models import Model, infer_model
from pydantic_ai.models.wrapper import WrapperModel

from tianwen.alpha import AlphaTrialRunner, PreparedTrial, TrialConfirmation, TrialManifest, TrialResult
from tianwen.domain import BudgetLimit, EvidenceRecord, content_digest
from tianwen.learning import LearningEngine
from tianwen.learning_intake import LearningIntake, LearningTriageReceipt, OutcomeObservation

TASK_ID = "A1"
MODEL_ID = "deepseek:deepseek-v4-pro"
PROVIDER_NAME = "deepseek"
PROVIDER_BASE_URL = "https://api.deepseek.com"
MAX_OUTPUT_TOKENS = 4096
MAX_TRIALS = 2
MAX_STAGE_CNY = 20.0
CNY_PER_MILLION_TOKENS = 27.0
BUDGET = BudgetLimit(model_requests=4, tool_calls=8, tokens=40_000, wall_seconds=300, action_effects=8)
ZERO_RESOURCE_LEARNING_BUDGET = BudgetLimit(
    model_requests=0, tool_calls=0, tokens=0, wall_seconds=0, child_loops=0, action_effects=0
)
STAGE_ROOT = Path("D:/DevData/tianwen-alpha-c-live-sample")
PROJECT_ROOT = Path(__file__).resolve().parents[1]


class StageError(RuntimeError):
    """The fixed live sample cannot advance truthfully."""


class _OutputLimitedModel(WrapperModel):
    @property
    def settings(self) -> Any:
        return {**dict(self.wrapped.settings or {}), "max_tokens": MAX_OUTPUT_TOKENS}

    async def request(self, messages: Any, model_settings: Any, model_request_parameters: Any) -> Any:
        settings = {**dict(model_settings or {}), "max_tokens": MAX_OUTPUT_TOKENS}
        return await self.wrapped.request(messages, settings, model_request_parameters)


@dataclass(frozen=True)
class StageDependencies:
    stage_root: Path = STAGE_ROOT
    environment: Mapping[str, str] | None = None
    model_factory: Callable[[], Any] | None = None
    runner_factory: Callable[[Any, Path], Any] | None = None
    intake_factory: Callable[[Any, BudgetLimit], LearningIntake] | None = None


def _native_model() -> Model:
    return _OutputLimitedModel(infer_model(MODEL_ID))


def _native_runner(model: Any, data_root: Path) -> AlphaTrialRunner:
    return AlphaTrialRunner(
        task_root=PROJECT_ROOT / "alpha" / "tasks",
        image_lock_path=PROJECT_ROOT / "alpha" / "environment" / "image.lock",
        data_root=data_root,
        model=model,
    )


def _validate_model(model: Any) -> None:
    provider = getattr(model, "provider", None)
    settings = dict(getattr(model, "settings", None) or {})
    if (
        getattr(model, "model_id", None) != MODEL_ID
        or getattr(provider, "name", None) != PROVIDER_NAME
        or str(getattr(provider, "base_url", "")).rstrip("/") != PROVIDER_BASE_URL
        or settings.get("max_tokens") != MAX_OUTPUT_TOKENS
    ):
        raise StageError("fixed model/provider identity does not match")


def _estimate_cny(tokens: int) -> float:
    return tokens * CNY_PER_MILLION_TOKENS / 1_000_000


def _receipt(
    root: Path,
    *,
    stop: str,
    trials: list[dict[str, Any]] | None = None,
    outcomes: list[OutcomeObservation] | None = None,
    triages: list[LearningTriageReceipt] | None = None,
    case_id: str | None = None,
) -> dict[str, Any]:
    trials, outcomes, triages = trials or [], outcomes or [], triages or []
    requests = sum(item["result"].usage.model_requests for item in trials)
    tokens = sum(item["result"].usage.tokens for item in trials)
    estimated = _estimate_cny(tokens)
    value = {
        "stop": stop,
        "trial_ids": [item["result"].trial_id for item in trials],
        "request_usage": requests,
        "token_usage": tokens,
        "estimated_cny": estimated,
        "remaining_budget": MAX_STAGE_CNY - estimated,
        "outcome_ids": [item.outcome_id for item in outcomes],
        "triage": [{"triage_id": item.triage_id, "disposition": item.disposition} for item in triages],
        "case_id": case_id,
        "candidate_version_id": None,
        "durable": [
            {
                "trial_id": item["result"].trial_id,
                "result_digest": content_digest(item["result"]),
                "manifest_digest": content_digest(item["manifest"]),
                "final_evidence_digest": (content_digest(item["evidence"]) if item["evidence"] is not None else None),
            }
            for item in trials
        ],
    }
    (root / "final-receipt.json").write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2), encoding="utf-8"
    )
    return value


def _durable_trial(runner: Any, supplied: TrialResult) -> dict[str, Any]:
    store, app = getattr(runner, "store", None), getattr(runner, "app", None)
    if store is None or app is None:
        raise StageError("runner did not expose its durable authority")
    result = store.get_object("alpha_trial_result", supplied.trial_id, TrialResult)
    if result != supplied:
        raise StageError("in-memory and durable TrialResult differ")
    manifest = store.get_object("alpha_trial_manifest", result.trial_id, TrialManifest)
    verifier_authority = manifest.verifier_snapshot.get("digest")
    if (
        result.trial_manifest_digest != content_digest(manifest)
        or result.task_id != manifest.task_id
        or result.task_version != manifest.task_version
        or result.model_id != manifest.model_id
        or result.champion_version_id != manifest.champion_version_id
        or result.champion_digest != manifest.champion_digest
        or result.verifier_digest != verifier_authority
    ):
        raise StageError("durable TrialResult and Manifest bindings differ")
    evidence = tuple(store.get_object("evidence", evidence_id, EvidenceRecord) for evidence_id in result.evidence_ids)
    finals = tuple(
        item
        for item in evidence
        if item.evidence_type == "alpha_final_verification"
        and item.purpose == "alpha_final_verification"
        and item.source_class == "docker_verifier"
    )
    expected_runs = {*result.run_ids, *result.exploration_run_ids}
    if not expected_runs:
        expected_runs.add(f"alpha:{result.trial_id}:settlement")
    completed_final = (
        len(finals) == 1
        and finals[0].scope == f"trial:{result.trial_id}"
        and finals[0].run_id in expected_runs
        and finals[0].result_class == result.verdict
        and finals[0].action_id in result.action_ids
    )
    if (result.verification_status == "completed" and not completed_final) or (
        result.verification_status != "completed" and finals
    ):
        raise StageError("final verifier Evidence does not bind the durable TrialResult")
    loop_id = app.goal_task(result.goal_id).loop_id
    _limit, usage, _reserved = store.get_budget(loop_id)
    if (
        usage.model_requests,
        usage.tokens,
        usage.tool_calls,
        usage.action_effects,
    ) != (
        result.usage.model_requests,
        result.usage.tokens,
        result.usage.tool_calls,
        result.usage.action_effects,
    ):
        raise StageError("durable Goal budget usage differs from TrialResult")
    return {
        "result": result,
        "manifest": manifest,
        "evidence": finals[0] if finals else None,
        "store": store,
    }


def _classification(result: TrialResult) -> str | None:
    common = (
        result.qualifies_as_real_model_trial
        and result.execution_status == "completed"
        and result.verification_status == "completed"
        and result.boundary_status == "passed"
    )
    if common and result.verdict == "met" and not result.failure_categories:
        return "success"
    if common and result.verdict == "not_met" and bool(result.failure_categories):
        return "failure"
    return None


def _intake(store: Any, factory: Callable[[Any, BudgetLimit], LearningIntake] | None) -> LearningIntake:
    return (
        factory(store, ZERO_RESOURCE_LEARNING_BUDGET)
        if factory is not None
        else LearningIntake(LearningEngine(store, ZERO_RESOURCE_LEARNING_BUDGET))
    )


async def _execute_prepared(runner: Any, prepared: PreparedTrial) -> dict[str, Any]:
    confirmation = TrialConfirmation(
        trial_id=prepared.preview.trial_id,
        preview_digest=content_digest(prepared.preview),
        confirmed_via="approved_goal_budget",
    )
    try:
        supplied = await runner.execute(prepared, confirmation)
    except (asyncio.CancelledError, Exception) as error:
        raise StageError(
            f"Trial {prepared.preview.trial_id} execution interrupted; inspect its durable store"
        ) from error
    return _durable_trial(runner, supplied)


async def _execute(runner: Any, previous_trial_id: str | None = None) -> tuple[PreparedTrial, dict[str, Any]]:
    prepared = runner.prepare(TASK_ID, budget=BUDGET, previous_trial_id=previous_trial_id)
    if prepared.seed_verifier.verdict != "not_met":
        raise StageError("A1 seed verifier must be not_met")
    return prepared, await _execute_prepared(runner, prepared)


def _independent(first: tuple[Any, dict[str, Any]], second: tuple[Any, dict[str, Any]]) -> bool:
    first_prepared, first_trial = first
    second_prepared, second_trial = second
    first_result, second_result = first_trial["result"], second_trial["result"]
    return (
        first_result.trial_id != second_result.trial_id
        and Path(first_prepared.paths.workspace).resolve() != Path(second_prepared.paths.workspace).resolve()
        and Path(first_trial["store"].database).resolve() != Path(second_trial["store"].database).resolve()
        and first_result.goal_id != second_result.goal_id
        and set(first_result.run_ids).isdisjoint(second_result.run_ids)
    )


async def run_stage(dependencies: StageDependencies | None = None) -> dict[str, Any]:
    dependencies = dependencies or StageDependencies()
    root = dependencies.stage_root
    if root.exists():
        raise StageError("fixed stage root already exists")
    root.mkdir()
    environment = os.environ if dependencies.environment is None else dependencies.environment
    if not bool(environment.get("DEEPSEEK_API_KEY", "").strip()):
        return _receipt(root, stop="missing_credential")
    if _estimate_cny(MAX_TRIALS * BUDGET.tokens) > MAX_STAGE_CNY:
        return _receipt(root, stop="budget_preflight_failed")
    try:
        model = (dependencies.model_factory or _native_model)()
        _validate_model(model)
    except Exception:
        return _receipt(root, stop="model_preflight_failed")
    try:
        runner_factory = dependencies.runner_factory or _native_runner
        first_runner = runner_factory(model, root / "trial-1")
        first = await _execute(first_runner)
    except Exception as error:
        if isinstance(error, StageError):
            raise
        return _receipt(root, stop="infrastructure_preflight_failed")
    trials = [first[1]]
    first_kind = _classification(first[1]["result"])
    if first_kind is None:
        return _receipt(root, stop="non_qualifying_trial", trials=trials)
    intake = _intake(first[1]["store"], dependencies.intake_factory)
    first_outcome = intake.record_trial_outcome(first[1]["result"], trial_store=first[1]["store"])
    first_triage = intake.triage((first_outcome,))
    outcomes, triages = [first_outcome], [first_triage]
    if first_kind == "success":
        return _receipt(root, stop="no_case_success", trials=trials, outcomes=outcomes, triages=triages)
    if first_triage.disposition != "observe" or first_triage.candidate_version_id is not None:
        raise StageError("one qualifying failure must only collect more evidence")
    try:
        second_runner = runner_factory(model, root / "trial-2")
        second_prepared = second_runner.prepare(TASK_ID, budget=BUDGET, previous_trial_id=first[1]["result"].trial_id)
    except Exception:
        return _receipt(
            root,
            stop="second_infrastructure_preflight_failed",
            trials=trials,
            outcomes=outcomes,
            triages=triages,
        )
    if second_prepared.seed_verifier.verdict != "not_met":
        return _receipt(root, stop="second_seed_invalid", trials=trials, outcomes=outcomes, triages=triages)
    if (
        first_runner.condition_snapshot(first[0]) != second_runner.condition_snapshot(second_prepared)
        or first[0].champion_version_id != second_prepared.champion_version_id
        or first[0].champion_digest != second_prepared.champion_digest
    ):
        return _receipt(root, stop="condition_drift", trials=trials, outcomes=outcomes, triages=triages)
    second = (
        second_prepared,
        await _execute_prepared(second_runner, second_prepared),
    )
    trials.append(second[1])
    if not _independent(first, second):
        raise StageError("repeated Trials are not independent")
    second_kind = _classification(second[1]["result"])
    if second_kind is None:
        return _receipt(root, stop="no_case_second_non_qualifying", trials=trials, outcomes=outcomes, triages=triages)
    second_outcome = intake.record_trial_outcome(second[1]["result"], trial_store=second[1]["store"])
    outcomes.append(second_outcome)
    if second_kind == "success":
        triages.append(intake.triage((second_outcome,)))
        return _receipt(root, stop="no_case_second_success", trials=trials, outcomes=outcomes, triages=triages)
    if (
        first_outcome.capability_scope != second_outcome.capability_scope
        or first_outcome.problem_fingerprint != second_outcome.problem_fingerprint
    ):
        triages.append(intake.triage((second_outcome,)))
        return _receipt(root, stop="no_case_different_failure", trials=trials, outcomes=outcomes, triages=triages)
    final_triage = intake.triage((first_outcome, second_outcome))
    if final_triage.disposition != "learning_case" or final_triage.candidate_version_id is not None:
        raise StageError("matching repeated failures did not produce exactly one learning Case")
    triages.append(final_triage)
    return _receipt(
        root,
        stop="requires_attribution",
        trials=trials,
        outcomes=outcomes,
        triages=triages,
        case_id=final_triage.case_id,
    )


if __name__ == "__main__":
    print(json.dumps(asyncio.run(run_stage()), ensure_ascii=False, sort_keys=True))
