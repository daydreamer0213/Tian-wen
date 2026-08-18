"""Run the one approved Alpha-C A1 natural-evidence sample.

This is deliberately an operations entry point, not a reusable controller.  It
only ever prepares A1 and, after a local-TTY confirmation, may execute it once
and repeat it once after a qualifying verifier failure.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TextIO

from pydantic_ai.models import Model, infer_model
from pydantic_ai.models.wrapper import WrapperModel

from tianwen.alpha import AlphaTrialConditionSnapshot, AlphaTrialRunner, TrialConfirmation, TrialResult
from tianwen.domain import BudgetLimit, GoalContract, RunRecord, content_digest
from tianwen.learning import LearningEngine
from tianwen.learning_intake import LearningIntake, LearningTriageReceipt, OutcomeObservation

TASK_ID = "A1"
MODEL_ID = "deepseek:deepseek-v4-pro"
PROVIDER_NAME = "deepseek"
PROVIDER_BASE_URL = "https://api.deepseek.com"
MAX_OUTPUT_TOKENS = 4096
MAX_PRICE_CNY_PER_MILLION_TOKENS = 27
MAX_STAGE_CNY_MICROUNITS = 20_000_000
BUDGET = BudgetLimit(model_requests=4, tool_calls=8, tokens=40_000, wall_seconds=300, action_effects=8)
STAGE_ROOT = Path("D:/DevData/tianwen-alpha-c-real-evidence")
PROJECT_ROOT = Path(__file__).resolve().parents[1]


class StageError(RuntimeError):
    """The bounded sampling stage cannot safely advance."""


class _OutputLimitedModel(WrapperModel):
    """Keep the approved provider request ceiling local to this one operator."""

    @property
    def settings(self) -> Any:
        values = dict(self.wrapped.settings or {})
        values["max_tokens"] = MAX_OUTPUT_TOKENS
        return values

    async def request(self, messages: Any, model_settings: Any, model_request_parameters: Any) -> Any:
        values = dict(model_settings or {})
        values["max_tokens"] = MAX_OUTPUT_TOKENS
        return await self.wrapped.request(messages, values, model_request_parameters)


@dataclass(frozen=True)
class StageDependencies:
    """Small seam for offline tests; the CLI itself supplies no mutable choices."""

    stage_root: Path = STAGE_ROOT
    environment: Mapping[str, str] | None = None
    stdin: TextIO = sys.stdin
    stdout: TextIO = sys.stdout
    model_factory: Callable[[], Model] | None = None
    runner_factory: Callable[[Model, Path], AlphaTrialRunner] | None = None
    intake_factory: Callable[[Any, BudgetLimit], LearningIntake] | None = None
    prior_charge_microunits: int = 0


def _native_model() -> Model:
    return _OutputLimitedModel(infer_model(MODEL_ID))


def _native_runner(model: Model, stage_root: Path) -> AlphaTrialRunner:
    return AlphaTrialRunner(
        task_root=PROJECT_ROOT / "alpha" / "tasks",
        image_lock_path=PROJECT_ROOT / "alpha" / "environment" / "image.lock",
        data_root=stage_root,
        model=model,
        allowed_drive="D:",
    )


def _receipt(root: Path, name: str, values: Mapping[str, Any]) -> Path:
    receipts = root / "receipts"
    receipts.mkdir(parents=True, exist_ok=True)
    path = receipts / name
    try:
        with path.open("x", encoding="utf-8") as handle:
            json.dump(values, handle, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            handle.write("\n")
    except FileExistsError as error:
        raise StageError(f"receipt already exists: {path.name}") from error
    return path


def _under_devdata(path: Path) -> Path:
    root, value = Path("D:/DevData").resolve(), path.resolve()
    if value == root or not value.is_relative_to(root):
        raise StageError("stage data root must be a new child of D:\\DevData")
    return value


def _micro_cny(tokens: int) -> int:
    return tokens * MAX_PRICE_CNY_PER_MILLION_TOKENS


def _validate_model(model: Model) -> None:
    provider = getattr(model, "provider", None)
    if (
        getattr(model, "model_id", None) != MODEL_ID
        or getattr(provider, "name", None) != PROVIDER_NAME
        or str(getattr(provider, "base_url", "")).rstrip("/") != PROVIDER_BASE_URL
    ):
        raise StageError("fixed DeepSeek provider identity does not match")
    if dict(getattr(model, "settings", None) or {}).get("max_tokens") != MAX_OUTPUT_TOKENS:
        raise StageError("fixed provider max_tokens does not match")


def _assert_zero_paid_preflight(prepared: Any) -> None:
    store = prepared._app.store
    if store.list_objects("goal", GoalContract) or store.list_objects("run", RunRecord):
        raise StageError("prepare created a Goal or Run before confirmation")


def _prepared_authority(runner: Any, prepared: Any) -> dict[str, Any]:
    condition = runner.condition_snapshot(prepared)
    if not isinstance(condition, AlphaTrialConditionSnapshot):
        raise StageError("runner did not return an Alpha condition snapshot")
    return {
        "trial_id": prepared.preview.trial_id,
        "condition": condition,
        "condition_digest": content_digest(condition),
        "champion_version_id": prepared.champion_version_id,
        "champion_digest": prepared.champion_digest,
        "workspace": str(prepared.paths.workspace),
        "store": str(prepared.paths.state),
    }


def _prepare(runner: Any) -> tuple[Any, dict[str, Any]]:
    prepared = runner.prepare(TASK_ID, budget=BUDGET, previous_trial_id=None)
    preview = prepared.preview
    if (
        preview.task_id != TASK_ID
        or preview.model_id != MODEL_ID
        or preview.provider_name != PROVIDER_NAME
        or preview.budget != BUDGET
    ):
        raise StageError("prepared trial diverges from the fixed stage authority")
    _assert_zero_paid_preflight(prepared)
    return prepared, _prepared_authority(runner, prepared)


def _confirm(stdin: TextIO, stdout: TextIO, prepared: Any) -> TrialConfirmation | None:
    if not stdin.isatty():
        return None
    expected = f"CONFIRM {prepared.preview.trial_id}"
    print(f"Type exactly: {expected}", file=stdout)
    if stdin.readline().strip() != expected:
        return None
    return TrialConfirmation(
        trial_id=prepared.preview.trial_id,
        preview_digest=content_digest(prepared.preview),
        confirmed_via="local_tty",
    )


def _qualifying_failure(result: TrialResult) -> bool:
    return (
        result.qualifies_as_real_model_trial
        and result.execution_status == "completed"
        and result.verification_status == "completed"
        and result.boundary_status == "passed"
        and result.verdict == "not_met"
        and bool(result.failure_categories)
    )


def _qualifying_success(result: TrialResult) -> bool:
    return (
        result.qualifies_as_real_model_trial
        and result.execution_status == "completed"
        and result.verification_status == "completed"
        and result.boundary_status == "passed"
        and result.verdict == "met"
    )


def _result_charge(result: TrialResult) -> int:
    return _micro_cny(result.usage.tokens)


def _load_result(runner: Any, result: TrialResult) -> TrialResult:
    durable = runner.store.get_object("alpha_trial_result", result.trial_id, TrialResult)
    if durable != result:
        raise StageError("executed trial result does not match its durable receipt")
    return durable


def _intake(prepared: Any, factory: Callable[[Any, BudgetLimit], LearningIntake] | None) -> LearningIntake:
    if factory is not None:
        return factory(prepared._app.store, prepared._app.config.learning_budget)
    return LearningIntake(LearningEngine(prepared._app.store, prepared._app.config.learning_budget))


def _project(intake: LearningIntake, result: TrialResult, trial_store: Any) -> OutcomeObservation:
    return intake.record_trial_outcome(result, trial_store=trial_store)


def _final_receipt(
    root: Path,
    first: TrialResult,
    *,
    stop: str,
    charged_microunits: int,
    second: TrialResult | None = None,
    triage: LearningTriageReceipt | None = None,
) -> dict[str, Any]:
    values: dict[str, Any] = {
        "schema": "tianwen.alpha_c.real_evidence.stop.v1",
        "stop": stop,
        "trial_ids": [first.trial_id, *(() if second is None else (second.trial_id,))],
        "model_requests": first.usage.model_requests + (0 if second is None else second.usage.model_requests),
        "tokens": first.usage.tokens + (0 if second is None else second.usage.tokens),
        "conservative_charge_microunits": charged_microunits,
        "candidate_version_id": None,
        "case_id": None if triage is None else triage.case_id,
        "triage": None if triage is None else triage.disposition,
    }
    _receipt(root, f"stop-{first.trial_id}.json", values)
    return values


async def run_stage(dependencies: StageDependencies | None = None) -> dict[str, Any]:
    """Prepare and, only after local confirmation, run the fixed bounded sample."""
    dependencies = dependencies or StageDependencies()
    root = _under_devdata(dependencies.stage_root)
    environment = os.environ if dependencies.environment is None else dependencies.environment
    if not bool(environment.get("DEEPSEEK_API_KEY", "").strip()):
        return {"stop": "missing_credential", "model_requests": 0, "candidate_version_id": None}
    if dependencies.prior_charge_microunits < 0:
        raise StageError("prior charge must be non-negative")
    reserve = _micro_cny(BUDGET.tokens)
    if dependencies.prior_charge_microunits + reserve > MAX_STAGE_CNY_MICROUNITS:
        return {"stop": "budget_exhausted", "model_requests": 0, "candidate_version_id": None}
    model = (dependencies.model_factory or _native_model)()
    _validate_model(model)
    runner = (dependencies.runner_factory or _native_runner)(model, root)
    first_prepared, first_authority = _prepare(runner)
    _receipt(
        root,
        f"preflight-{first_authority['trial_id']}.json",
        {
            "schema": "tianwen.alpha_c.real_evidence.preflight.v1",
            "trial_id": first_authority["trial_id"],
            "task_id": TASK_ID,
            "model_id": MODEL_ID,
            "condition_digest": first_authority["condition_digest"],
            "champion_version_id": first_authority["champion_version_id"],
            "champion_digest": first_authority["champion_digest"],
            "reserved_cny_microunits": reserve,
            "paid_execution_not_started": True,
        },
    )
    confirmation = _confirm(dependencies.stdin, dependencies.stdout, first_prepared)
    if confirmation is None:
        return {"stop": "confirmation_not_granted", "model_requests": 0, "candidate_version_id": None}
    first = _load_result(runner, await runner.execute(first_prepared, confirmation))
    first_charge = _result_charge(first)
    if not first.qualifies_as_real_model_trial:
        return _final_receipt(root, first, stop="non_real_or_operational", charged_microunits=first_charge)
    intake = _intake(first_prepared, dependencies.intake_factory)
    if _qualifying_success(first):
        receipt = intake.triage((_project(intake, first, runner.store),))
        return _final_receipt(root, first, stop="no_case_success", charged_microunits=first_charge, triage=receipt)
    if not _qualifying_failure(first):
        return _final_receipt(root, first, stop="non_qualifying_result", charged_microunits=first_charge)
    first_outcome = _project(intake, first, runner.store)
    observe = intake.triage((first_outcome,))
    if dependencies.prior_charge_microunits + first_charge + reserve > MAX_STAGE_CNY_MICROUNITS:
        return _final_receipt(
            root, first, stop="retry_budget_exhausted", charged_microunits=first_charge, triage=observe
        )
    second_prepared, second_authority = _prepare(runner)
    comparable = (
        first_authority["condition"] == second_authority["condition"]
        and first_authority["champion_version_id"] == second_authority["champion_version_id"]
        and first_authority["champion_digest"] == second_authority["champion_digest"]
        and first_authority["trial_id"] != second_authority["trial_id"]
        and first_authority["workspace"] != second_authority["workspace"]
        and first_authority["store"] != second_authority["store"]
    )
    if not comparable:
        return _final_receipt(
            root, first, stop="retry_authority_drift", charged_microunits=first_charge, triage=observe
        )
    _receipt(
        root,
        f"retry-{first.trial_id}-{second_authority['trial_id']}.json",
        {
            "schema": "tianwen.alpha_c.real_evidence.retry_authority.v1",
            "first_trial_id": first.trial_id,
            "second_trial_id": second_authority["trial_id"],
            "condition_digest": first_authority["condition_digest"],
            "champion_version_id": first_authority["champion_version_id"],
            "champion_digest": first_authority["champion_digest"],
            "reserved_cny_microunits": reserve,
        },
    )
    second_confirmation = _confirm(dependencies.stdin, dependencies.stdout, second_prepared)
    if second_confirmation is None:
        return _final_receipt(
            root, first, stop="retry_confirmation_not_granted", charged_microunits=first_charge, triage=observe
        )
    second = _load_result(runner, await runner.execute(second_prepared, second_confirmation))
    charged = first_charge + _result_charge(second)
    if not _qualifying_failure(second):
        return _final_receipt(
            root, first, second=second, stop="retry_non_qualifying", charged_microunits=charged, triage=observe
        )
    second_outcome = _project(intake, second, runner.store)
    if (
        second_outcome.capability_scope != first_outcome.capability_scope
        or second_outcome.problem_fingerprint != first_outcome.problem_fingerprint
    ):
        return _final_receipt(
            root,
            first,
            second=second,
            stop="retry_fingerprint_mismatch",
            charged_microunits=charged,
            triage=observe,
        )
    case = intake.triage((first_outcome, second_outcome))
    return _final_receipt(
        root, first, second=second, stop="case_requires_attribution", charged_microunits=charged, triage=case
    )


def main() -> int:
    try:
        result = asyncio.run(run_stage())
    except StageError as error:
        print(f"Alpha-C real-evidence stop: {error}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
