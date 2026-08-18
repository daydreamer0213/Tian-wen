from __future__ import annotations

import asyncio
import importlib
import secrets
import sys
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from tianwen.alpha import AlphaTrialConditionSnapshot, TrialPreview
from tianwen.domain import BudgetLimit


def test_real_evidence_runner_has_a_stage_local_entry() -> None:
    """Break caught: the approved real-evidence stage has no executable entry."""
    sys.path.insert(0, str(Path(__file__).parents[2]))
    module = importlib.import_module("scripts.run_alpha_c_real_evidence")

    assert callable(module.main)


@dataclass
class _Result:
    trial_id: str
    qualifies_as_real_model_trial: bool
    verdict: str
    execution_status: str = "completed"
    verification_status: str = "completed"
    boundary_status: str = "passed"
    failure_categories: tuple[str, ...] = ()
    usage: Any = field(default_factory=lambda: SimpleNamespace(model_requests=1, tokens=100))


class _Store:
    def __init__(self) -> None:
        self.result: _Result | None = None

    def list_objects(self, _kind: str, _model: Any) -> list[Any]:
        return []

    def get_object(self, _kind: str, _object_id: str, _model: Any) -> _Result:
        assert self.result is not None
        return self.result


class _Model:
    def __init__(self) -> None:
        self.model_id = "deepseek:deepseek-v4-pro"
        self.provider = SimpleNamespace(name="deepseek", base_url="https://api.deepseek.com")
        self.settings = {"max_tokens": 4096}
        self.request_count = 0


class _Prepared:
    def __init__(self, trial_id: str, condition: object, champion: str) -> None:
        self.preview = TrialPreview.model_construct(
            trial_id=trial_id,
            task_id="A1",
            model_id="deepseek:deepseek-v4-pro",
            provider_name="deepseek",
            budget=BudgetLimit(model_requests=4, tool_calls=8, tokens=40_000, wall_seconds=300, action_effects=8),
        )
        self.champion_version_id = champion
        self.champion_digest = f"digest-{champion}"
        self.paths = SimpleNamespace(
            workspace=Path(f"D:/DevData/alpha-c-real-evidence-tests/{trial_id}/workspace"),
            state=Path(f"D:/DevData/alpha-c-real-evidence-tests/{trial_id}/state"),
        )
        self._app = SimpleNamespace(
            store=_Store(),
            config=SimpleNamespace(learning_budget=SimpleNamespace()),
        )
        self.condition = condition


class _Runner:
    def __init__(
        self, results: list[_Result], *, second_condition: object = "same", second_champion: str = "champion"
    ) -> None:
        self.results = results
        self.second_condition = second_condition
        self.second_champion = second_champion
        self.prepared: list[_Prepared] = []
        self.executed: list[str] = []
        self.store = _Store()

    def prepare(self, task_id: str, *, budget: Any, previous_trial_id: str | None) -> _Prepared:
        assert task_id == "A1"
        assert previous_trial_id is None
        index = len(self.prepared)
        condition = "same" if index == 0 else self.second_condition
        champion = "champion" if index == 0 else self.second_champion
        item = _Prepared(f"trial-{index + 1}", condition, champion)
        assert item.preview.budget == budget
        self.prepared.append(item)
        return item

    def condition_snapshot(self, prepared: _Prepared) -> object:
        return AlphaTrialConditionSnapshot.model_construct(task_id=prepared.condition)

    async def execute(self, prepared: _Prepared, _confirmation: Any) -> _Result:
        self.executed.append(prepared.preview.trial_id)
        result = self.results[len(self.executed) - 1]
        prepared._app.store.result = result
        self.store = prepared._app.store
        return result


class _Tty:
    def __init__(self, *lines: str, tty: bool = True) -> None:
        self.lines = list(lines)
        self.tty = tty

    def isatty(self) -> bool:
        return self.tty

    def readline(self) -> str:
        return self.lines.pop(0) if self.lines else "\n"


class _Intake:
    def __init__(self, *, second_fingerprint: str = "fingerprint") -> None:
        self.second_fingerprint = second_fingerprint
        self.projected: list[str] = []
        self.triages: list[tuple[str, ...]] = []

    def record_trial_outcome(self, result: _Result, *, trial_store: _Store) -> Any:
        assert trial_store.result is result
        self.projected.append(result.trial_id)
        fingerprint = "fingerprint" if len(self.projected) == 1 else self.second_fingerprint
        return SimpleNamespace(
            outcome_id=f"outcome-{result.trial_id}", capability_scope="scope", problem_fingerprint=fingerprint
        )

    def triage(self, outcomes: tuple[Any, ...]) -> Any:
        self.triages.append(tuple(item.outcome_id for item in outcomes))
        return SimpleNamespace(
            disposition="learning_case" if len(outcomes) == 2 else "observe",
            case_id="case-1" if len(outcomes) == 2 else None,
        )


def _module() -> Any:
    sys.path.insert(0, str(Path(__file__).parents[2]))
    return importlib.import_module("scripts.run_alpha_c_real_evidence")


def _root() -> Path:
    return Path("D:/DevData/alpha-c-real-evidence-tests") / secrets.token_hex(8)


def _dependencies(module: Any, runner: _Runner, stdin: _Tty, intake: _Intake | None = None, **kwargs: Any) -> Any:
    model = _Model()
    return module.StageDependencies(
        stage_root=kwargs.pop("stage_root", _root()),
        environment={"DEEPSEEK_API_KEY": "configured"},
        stdin=stdin,
        stdout=SimpleNamespace(write=lambda _text: None, flush=lambda: None),
        model_factory=lambda: model,
        runner_factory=lambda _model, _root: runner,
        intake_factory=None if intake is None else lambda _store, _budget: intake,
        **kwargs,
    )


def test_missing_credential_stops_before_model_or_prepare() -> None:
    """Break caught: a missing credential could construct a provider or create Trial state."""
    module = _module()
    called = False

    def model_factory() -> Any:
        nonlocal called
        called = True
        return _Model()

    result = asyncio.run(
        module.run_stage(module.StageDependencies(stage_root=_root(), environment={}, model_factory=model_factory))
    )

    assert result == {"stop": "missing_credential", "model_requests": 0, "candidate_version_id": None}
    assert called is False


def test_budget_ceiling_stops_before_model_or_prepare() -> None:
    """Break caught: an already exhausted Alpha-C ledger could still reserve a paid Trial."""
    module = _module()
    called = False

    def model_factory() -> Any:
        nonlocal called
        called = True
        return _Model()

    result = asyncio.run(
        module.run_stage(
            module.StageDependencies(
                stage_root=_root(),
                environment={"DEEPSEEK_API_KEY": "configured"},
                model_factory=model_factory,
                prior_charge_microunits=module.MAX_STAGE_CNY_MICROUNITS,
            )
        )
    )

    assert result == {"stop": "budget_exhausted", "model_requests": 0, "candidate_version_id": None}
    assert called is False


def test_provider_mismatch_stops_before_prepare() -> None:
    """Break caught: a different Provider could enter the fixed A1 authority without a Trial gate."""
    module = _module()
    runner_called = False
    model = _Model()
    model.provider = SimpleNamespace(name="other", base_url="https://example.invalid")

    def runner_factory(_model: Any, _root: Path) -> Any:
        nonlocal runner_called
        runner_called = True
        return _Runner([])

    with pytest.raises(module.StageError, match="provider identity"):
        asyncio.run(
            module.run_stage(
                module.StageDependencies(
                    stage_root=_root(),
                    environment={"DEEPSEEK_API_KEY": "configured"},
                    model_factory=lambda: model,
                    runner_factory=runner_factory,
                )
            )
        )

    assert runner_called is False
    assert model.request_count == 0


def test_non_tty_stops_after_zero_paid_preflight_without_execute() -> None:
    """Break caught: a pipe could start a paid Trial without a local TTY confirmation."""
    module = _module()
    runner = _Runner([_Result("trial-1", True, "met")])
    model = _Model()
    result = asyncio.run(
        module.run_stage(
            module.StageDependencies(
                stage_root=_root(),
                environment={"DEEPSEEK_API_KEY": "configured"},
                stdin=_Tty(tty=False),
                stdout=SimpleNamespace(write=lambda _text: None, flush=lambda: None),
                model_factory=lambda: model,
                runner_factory=lambda _model, _root: runner,
            )
        )
    )

    assert result["stop"] == "confirmation_not_granted"
    assert runner.executed == []
    assert model.request_count == 0


def test_wrong_tty_confirmation_stops_without_execute() -> None:
    """Break caught: any text other than the exact trial confirmation could start a paid Trial."""
    module, runner = _module(), _Runner([_Result("trial-1", True, "met")])

    result = asyncio.run(module.run_stage(_dependencies(module, runner, _Tty("CONFIRM another-trial\n"))))

    assert result["stop"] == "confirmation_not_granted"
    assert runner.executed == []


def test_preflight_receipt_collision_stops_before_execute() -> None:
    """Break caught: a rerun could overwrite a preflight authority receipt and hide its earlier boundary."""
    module, root = _module(), _root()
    first = _Runner([_Result("trial-1", True, "met")])
    asyncio.run(module.run_stage(_dependencies(module, first, _Tty(tty=False), stage_root=root)))
    second = _Runner([_Result("trial-1", True, "met")])

    with pytest.raises(module.StageError, match="receipt already exists"):
        asyncio.run(module.run_stage(_dependencies(module, second, _Tty(tty=False), stage_root=root)))

    assert second.executed == []


def test_first_real_success_projects_once_and_never_prepares_retry() -> None:
    """Break caught: a successful natural sample could spend a second Trial or create a Case."""
    module, runner, intake = _module(), _Runner([_Result("trial-1", True, "met")]), _Intake()

    result = asyncio.run(module.run_stage(_dependencies(module, runner, _Tty("CONFIRM trial-1\n"), intake)))

    assert result["stop"] == "no_case_success"
    assert runner.executed == ["trial-1"]
    assert len(runner.prepared) == 1
    assert intake.projected == ["trial-1"]
    assert intake.triages == [("outcome-trial-1",)]
    assert result["case_id"] is None


def test_non_real_result_never_enters_learning_intake() -> None:
    """Break caught: an operational or unmetered result could be projected as learning evidence."""
    module, runner, intake = (
        _module(),
        _Runner([_Result("trial-1", False, "not_met", failure_categories=("usage",))]),
        _Intake(),
    )

    result = asyncio.run(module.run_stage(_dependencies(module, runner, _Tty("CONFIRM trial-1\n"), intake)))

    assert result["stop"] == "non_real_or_operational"
    assert intake.projected == []
    assert runner.executed == ["trial-1"]


@pytest.mark.parametrize(
    ("second_condition", "second_champion"),
    [("drift", "champion"), ("same", "different-champion")],
)
def test_retry_authority_drift_stops_before_second_execute(second_condition: str, second_champion: str) -> None:
    """Break caught: a changed condition or Champion could contaminate a paired repeat."""
    module = _module()
    runner = _Runner(
        [_Result("trial-1", True, "not_met", failure_categories=("correctness",))],
        second_condition=second_condition,
        second_champion=second_champion,
    )
    intake = _Intake()

    result = asyncio.run(module.run_stage(_dependencies(module, runner, _Tty("CONFIRM trial-1\n"), intake)))

    assert result["stop"] == "retry_authority_drift"
    assert runner.executed == ["trial-1"]
    assert len(runner.prepared) == 2
    assert intake.triages == [("outcome-trial-1",)]


def test_two_matching_real_failures_form_one_case_and_stop() -> None:
    """Break caught: matching repeated verifier failures could be dropped before the existing Case gate."""
    module = _module()
    runner = _Runner(
        [
            _Result("trial-1", True, "not_met", failure_categories=("correctness",)),
            _Result("trial-2", True, "not_met", failure_categories=("correctness",)),
        ]
    )
    intake = _Intake()

    result = asyncio.run(
        module.run_stage(_dependencies(module, runner, _Tty("CONFIRM trial-1\n", "CONFIRM trial-2\n"), intake))
    )

    assert result["stop"] == "case_requires_attribution"
    assert result["case_id"] == "case-1"
    assert runner.executed == ["trial-1", "trial-2"]
    assert len(runner.prepared) == 2
    assert intake.triages == [("outcome-trial-1",), ("outcome-trial-1", "outcome-trial-2")]


def test_mismatched_repeat_stops_without_case_or_third_trial() -> None:
    """Break caught: unrelated failures could be mixed into a Case or trigger an unbounded third Trial."""
    module = _module()
    runner = _Runner(
        [
            _Result("trial-1", True, "not_met", failure_categories=("correctness",)),
            _Result("trial-2", True, "not_met", failure_categories=("correctness",)),
            _Result("trial-3", True, "not_met", failure_categories=("correctness",)),
        ]
    )
    intake = _Intake(second_fingerprint="different")

    result = asyncio.run(
        module.run_stage(_dependencies(module, runner, _Tty("CONFIRM trial-1\n", "CONFIRM trial-2\n"), intake))
    )

    assert result["stop"] == "retry_fingerprint_mismatch"
    assert result["case_id"] is None
    assert runner.executed == ["trial-1", "trial-2"]
    assert len(runner.prepared) == 2
    assert intake.triages == [("outcome-trial-1",)]
