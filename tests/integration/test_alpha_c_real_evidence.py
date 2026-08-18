from __future__ import annotations

import asyncio
import importlib
import json
import secrets
import sqlite3
import sys
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import BaseModel, Field

from tianwen.alpha import AlphaTrialConditionSnapshot, TrialManifest, TrialPreview, TrialUsage
from tianwen.domain import ArtifactStatus, ArtifactVersion, BudgetLimit, BudgetUsage, content_digest
from tianwen.evaluation import ActivePointer

_OLD_TRIAL_ID = "trial-633752d776238190a9411a1cd8b7c71a"
_RECOVERY_1_TRIAL_ID = "trial-81c53da1ea42cc4330854a9e4182c2e5"


def test_real_evidence_runner_has_a_stage_local_entry() -> None:
    """Break caught: the approved real-evidence stage has no executable entry."""
    sys.path.insert(0, str(Path(__file__).parents[2]))
    module = importlib.import_module("scripts.run_alpha_c_real_evidence")

    assert callable(module.main)


class _Result(BaseModel):
    trial_id: str
    qualifies_as_real_model_trial: bool
    verdict: str
    execution_status: str = "completed"
    verification_status: str = "completed"
    boundary_status: str = "passed"
    failure_categories: tuple[str, ...] = ()
    usage: Any = Field(
        default_factory=lambda: TrialUsage(model_requests=1, tokens=100, tool_calls=0, action_effects=0, wall_seconds=0)
    )
    goal_id: str | None = None
    run_ids: tuple[str, ...] = ()
    evidence_ids: tuple[str, ...] = ()
    trial_manifest_digest: str | None = None
    manifest: TrialManifest | None = None

    def __init__(self, trial_id: str, qualifies_as_real_model_trial: bool, verdict: str, **values: Any) -> None:
        super().__init__(
            trial_id=trial_id,
            qualifies_as_real_model_trial=qualifies_as_real_model_trial,
            verdict=verdict,
            **values,
        )

    def model_post_init(self, _context: Any) -> None:
        self.goal_id = self.goal_id or f"goal-{self.trial_id}"
        self.run_ids = self.run_ids or (f"run-{self.trial_id}",)
        self.evidence_ids = self.evidence_ids or (f"evidence-{self.trial_id}",)
        self.manifest = self.manifest or TrialManifest.model_construct(trial_id=self.trial_id)
        self.trial_manifest_digest = self.trial_manifest_digest or content_digest(self.manifest)


class _Store:
    def __init__(self) -> None:
        self.result: _Result | None = None

    def list_objects(self, _kind: str, _model: Any) -> list[Any]:
        return []

    def get_object(self, kind: str, _object_id: str, _model: Any) -> Any:
        assert self.result is not None
        if kind == "alpha_trial_result":
            return self.result
        if kind == "alpha_trial_manifest":
            return self.result.manifest
        if kind == "evidence":
            return SimpleNamespace(
                evidence_id=self.result.evidence_ids[0],
                evidence_type="alpha_final_verification",
                purpose="alpha_final_verification",
                source_class="docker_verifier",
                scope=f"trial:{self.result.trial_id}",
                run_id=f"alpha:{self.result.trial_id}:settlement",
            )
        raise AssertionError(kind)

    def get_budget(self, _loop_id: str) -> tuple[Any, BudgetUsage, Any]:
        assert self.result is not None
        return (
            None,
            BudgetUsage(
                model_requests=self.result.usage.model_requests,
                tokens=self.result.usage.tokens,
                tool_calls=self.result.usage.tool_calls,
                action_effects=self.result.usage.action_effects,
            ),
            None,
        )


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
            goal_task=lambda _goal_id: SimpleNamespace(loop_id="loop"),
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
        self.confirmations: list[Any] = []
        self.store = _Store()
        self.app: Any = None

    def prepare(self, task_id: str, *, budget: Any, previous_trial_id: str | None) -> _Prepared:
        assert task_id == "A1"
        assert previous_trial_id is None
        index = len(self.prepared)
        condition = "same" if index == 0 else self.second_condition
        champion = "champion" if index == 0 else self.second_champion
        item = _Prepared(f"trial-{index + 1}", condition, champion)
        assert item.preview.budget == budget
        self.prepared.append(item)
        self.store, self.app = item._app.store, item._app
        return item

    def condition_snapshot(self, prepared: _Prepared) -> object:
        return AlphaTrialConditionSnapshot.model_construct(task_id=prepared.condition)

    async def execute(self, prepared: _Prepared, confirmation: Any) -> _Result:
        self.executed.append(prepared.preview.trial_id)
        self.confirmations.append(confirmation)
        result = self.results[len(self.executed) - 1]
        prepared._app.store.result = result
        self.store, self.app = prepared._app.store, prepared._app
        return result


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


def _dependencies(module: Any, runner: _Runner, intake: _Intake | None = None, **kwargs: Any) -> Any:
    model = _Model()
    price = module.PriceSnapshot(
        source_url=module.PRICE_SOURCE_URL,
        model_id=module.MODEL_ID,
        observed_at=datetime.now(UTC),
        rates_cny_per_million={"peak_output": 27},
    )
    audit = module.CheckoutAudit(
        branch=module.STAGE_BRANCH,
        head="head",
        main=module.BASE_SHA,
        origin_main=module.BASE_SHA,
        base=module.BASE_SHA,
        champion_version_id="champion",
        champion_digest="digest-champion",
        skill_digest="digest-champion",
        object_counts={},
    )
    return module.StageDependencies(
        stage_root=kwargs.pop("stage_root", _root()),
        recovery_of_root=kwargs.pop("recovery_of_root", None),
        environment={"DEEPSEEK_API_KEY": "configured"},
        stdout=SimpleNamespace(write=lambda _text: None, flush=lambda: None),
        model_factory=lambda: model,
        runner_factory=lambda _model, _root: runner,
        intake_factory=None if intake is None else lambda _store, _budget: intake,
        price_snapshot=kwargs.pop("price_snapshot", price),
        checkout_audit=kwargs.pop("checkout_audit", lambda: audit),
        **kwargs,
    )


def _old_zero_paid_root(
    module: Any, *, nonzero: str | None = None, trial_id: str = _OLD_TRIAL_ID
) -> Path:
    root = _root() / "original"
    authority_path = root / "receipts" / "stage-authority.json"
    authority_path.parent.mkdir(parents=True)
    authority_path.write_text(
        json.dumps(
            {
                "schema": "tianwen.alpha_c.real_evidence.stage_authority.v1",
                "task_id": module.TASK_ID,
                "model_id": module.MODEL_ID,
                "budget": module.BUDGET.model_dump(mode="json"),
                "max_trials": 2,
                "candidate_version_id": None,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    database = root / "runs" / trial_id / "state" / "tianwen.db"
    database.parent.mkdir(parents=True)
    with sqlite3.connect(database) as connection:
        connection.executescript(
            """
            CREATE TABLE tw_objects (kind TEXT NOT NULL);
            CREATE TABLE tw_budgets (usage_json TEXT NOT NULL, reserved_json TEXT NOT NULL);
            CREATE TABLE tw_model_request_reservations (request_id TEXT NOT NULL);
            CREATE TABLE tw_action_budget_reservations (action_id TEXT NOT NULL);
            """
        )
        if nonzero in {"goal", "run", "alpha_trial_result"}:
            connection.execute("INSERT INTO tw_objects VALUES (?)", (nonzero,))
        if nonzero in {"budget_usage", "budget_reserved"}:
            zero = BudgetUsage().model_dump_json()
            used = BudgetUsage(tokens=1).model_dump_json()
            connection.execute(
                "INSERT INTO tw_budgets VALUES (?, ?)",
                (used if nonzero == "budget_usage" else zero, used if nonzero == "budget_reserved" else zero),
            )
        if nonzero == "model_request":
            connection.execute("INSERT INTO tw_model_request_reservations VALUES ('request-old')")
        if nonzero == "action_reservation":
            connection.execute("INSERT INTO tw_action_budget_reservations VALUES ('action-old')")
    return root


def _recovery_dependencies(module: Any, runner: _Runner, old_root: Path, recovery_root: Path) -> Any:
    dependencies = _dependencies(module, runner, _Intake(), stage_root=recovery_root)
    return replace(dependencies, recovery_of_root=old_root, recovery_1_root=None)


def _recovery_1_zero_paid_root(module: Any, *, nonzero: str | None = None) -> Path:
    root = _old_zero_paid_root(module, nonzero=nonzero, trial_id=_RECOVERY_1_TRIAL_ID)
    receipt = {
        "schema": "tianwen.alpha_c.real_evidence.preflight_stop.v1",
        "stop": "preflight_failure",
        "phase": "prepare",
        "failure_class": "DockerExecutionError",
        "model_requests": 0,
        "tokens": 0,
        "conservative_charge_microunits": 0,
        "remaining_cny_microunits": 20_000_000,
        "case_id": None,
        "lesson_id": None,
        "candidate_version_id": None,
    }
    (root / "receipts" / "stop-preflight.json").write_text(
        json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    return root


def _docker_ready(module: Any, monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, ...]]:
    calls: list[tuple[str, ...]] = []

    def fake_run(argv: list[str], **_kwargs: Any) -> Any:
        calls.append(tuple(argv))
        if argv[1:2] == ["version"]:
            value = {"Server": {"Os": "linux", "Arch": "amd64"}}
        else:
            value = {
                "Id": module.LOCKED_IMAGE_ID,
                "RepoDigests": [module.LOCKED_IMAGE_REFERENCE],
            }
        return SimpleNamespace(returncode=0, stdout=json.dumps(value).encode("utf-8"), stderr=b"")

    monkeypatch.setattr(module.subprocess, "run", fake_run)
    return calls


def test_cli_defaults_to_the_one_fixed_recovery_root() -> None:
    """Break caught: production could reuse the immutable first-launch evidence root."""
    module = _module()

    dependencies = module.StageDependencies()

    assert dependencies.stage_root == Path("D:/DevData/tianwen-alpha-c-real-evidence-recovery-2")
    assert dependencies.recovery_of_root == module.STAGE_ROOT
    assert getattr(dependencies, "recovery_1_root", None) == module.RECOVERY_1_STAGE_ROOT


def test_recovery_2_readiness_failure_stops_before_root_model_or_runner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Break caught: a missing locked Docker image could consume the final recovery root."""
    module = _module()
    original = _old_zero_paid_root(module)
    recovery_1 = _recovery_1_zero_paid_root(module)
    recovery_2 = _root() / "tianwen-alpha-c-real-evidence-recovery-2"
    runner = _Runner([_Result("trial-1", True, "met")])
    model_constructed = runner_constructed = False

    def model_factory() -> Any:
        nonlocal model_constructed
        model_constructed = True
        return _Model()

    def runner_factory(_model: Any, _root: Path) -> Any:
        nonlocal runner_constructed
        runner_constructed = True
        return runner

    monkeypatch.setattr(
        module.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=1, stdout=b"", stderr=b"missing"),
    )
    dependencies = replace(
        _dependencies(module, runner, _Intake(), stage_root=recovery_2),
        recovery_of_root=original,
        recovery_1_root=recovery_1,
        model_factory=model_factory,
        runner_factory=runner_factory,
    )

    with pytest.raises(module.StageError, match="Docker readiness"):
        asyncio.run(module.run_stage(dependencies))

    assert not recovery_2.exists()
    assert model_constructed is False
    assert runner_constructed is False


def test_recovery_2_binds_both_zero_paid_prior_authorities_and_recovery_1_stop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Break caught: final recovery could omit either consumed stage or its durable stop boundary."""
    module = _module()
    original = _old_zero_paid_root(module)
    recovery_1 = _recovery_1_zero_paid_root(module)
    recovery_2 = _root() / "tianwen-alpha-c-real-evidence-recovery-2"
    calls = _docker_ready(module, monkeypatch)
    runner = _Runner([_Result("trial-1", True, "met")])

    result = asyncio.run(
        module.run_stage(
            replace(
                _dependencies(module, runner, _Intake(), stage_root=recovery_2),
                recovery_of_root=original,
                recovery_1_root=recovery_1,
            )
        )
    )

    assert result["stop"] == "no_case_success"
    authority = json.loads((recovery_2 / "receipts" / "stage-authority.json").read_text(encoding="utf-8"))
    original_authority = (original / "receipts" / "stage-authority.json").read_bytes()
    recovery_1_authority = (recovery_1 / "receipts" / "stage-authority.json").read_bytes()
    recovery_1_stop = (recovery_1 / "receipts" / "stop-preflight.json").read_bytes()
    assert authority["recovery_of"] == [
        {
            "authority_path": str((original / "receipts" / "stage-authority.json").resolve()),
            "authority_digest": content_digest(original_authority),
            "trial_id": _OLD_TRIAL_ID,
            "stop_receipt_path": None,
            "stop_receipt_digest": None,
        },
        {
            "authority_path": str((recovery_1 / "receipts" / "stage-authority.json").resolve()),
            "authority_digest": content_digest(recovery_1_authority),
            "trial_id": _RECOVERY_1_TRIAL_ID,
            "stop_receipt_path": str((recovery_1 / "receipts" / "stop-preflight.json").resolve()),
            "stop_receipt_digest": content_digest(recovery_1_stop),
        },
    ]
    assert calls == [
        ("docker", "version", "--format", "{{json .}}"),
        ("docker", "image", "inspect", module.LOCKED_IMAGE_REFERENCE),
    ]


@pytest.mark.parametrize(
    "nonzero", ["goal", "budget_usage", "alpha_trial_result", "model_request", "action_reservation"]
)
def test_recovery_2_rejects_nonzero_recovery_1_store_before_root_or_model(
    monkeypatch: pytest.MonkeyPatch, nonzero: str
) -> None:
    """Break caught: final recovery could treat the second consumed store as zero-paid without reading it."""
    module = _module()
    original = _old_zero_paid_root(module)
    recovery_1 = _recovery_1_zero_paid_root(module, nonzero=nonzero)
    recovery_2 = _root() / "tianwen-alpha-c-real-evidence-recovery-2"
    _docker_ready(module, monkeypatch)
    model_constructed = False

    def model_factory() -> Any:
        nonlocal model_constructed
        model_constructed = True
        return _Model()

    with pytest.raises(module.StageError, match="zero-paid"):
        asyncio.run(
            module.run_stage(
                replace(
                    _dependencies(module, _Runner([]), stage_root=recovery_2),
                    recovery_of_root=original,
                    recovery_1_root=recovery_1,
                    model_factory=model_factory,
                )
            )
        )

    assert not recovery_2.exists()
    assert model_constructed is False


def test_exact_zero_paid_old_stage_authorizes_only_the_fixed_recovery() -> None:
    """Break caught: a proven zero-paid Docker stop could not authorize its one replacement batch."""
    module = _module()
    old_root = _old_zero_paid_root(module)
    recovery_root = old_root.parent / "tianwen-alpha-c-real-evidence-recovery-1"
    old_authority = (old_root / "receipts" / "stage-authority.json").read_bytes()
    old_database = (old_root / "runs" / _OLD_TRIAL_ID / "state" / "tianwen.db").read_bytes()
    runner = _Runner([_Result("trial-1", True, "met")])

    result = asyncio.run(module.run_stage(_recovery_dependencies(module, runner, old_root, recovery_root)))

    assert result["stop"] == "no_case_success"
    authority = json.loads((recovery_root / "receipts" / "stage-authority.json").read_text(encoding="utf-8"))
    assert authority["recovery_of"] == {
        "authority_path": str((old_root / "receipts" / "stage-authority.json").resolve()),
        "authority_digest": content_digest(old_authority),
        "trial_id": _OLD_TRIAL_ID,
    }
    assert (old_root / "receipts" / "stage-authority.json").read_bytes() == old_authority
    assert (old_root / "runs" / _OLD_TRIAL_ID / "state" / "tianwen.db").read_bytes() == old_database
    assert runner.executed == ["trial-1"]


@pytest.mark.parametrize(
    "nonzero",
    ["goal", "run", "budget_usage", "budget_reserved", "alpha_trial_result", "model_request", "action_reservation"],
)
def test_any_nonzero_old_stage_state_rejects_before_model_or_prepare(nonzero: str) -> None:
    """Break caught: prior paid or formal Trial state could be replayed as a zero-paid recovery."""
    module = _module()
    old_root = _old_zero_paid_root(module, nonzero=nonzero)
    recovery_root = old_root.parent / "tianwen-alpha-c-real-evidence-recovery-1"
    runner = _Runner([_Result("trial-1", True, "met")])
    model_constructed = False

    def model_factory() -> Any:
        nonlocal model_constructed
        model_constructed = True
        return _Model()

    dependencies = replace(
        _recovery_dependencies(module, runner, old_root, recovery_root),
        model_factory=model_factory,
    )
    with pytest.raises(module.StageError, match="zero-paid"):
        asyncio.run(module.run_stage(dependencies))

    assert not recovery_root.exists()
    assert model_constructed is False
    assert runner.prepared == []


def test_existing_fixed_recovery_root_rejects_before_model_or_prepare() -> None:
    """Break caught: the fixed recovery root could be reused for another paid batch."""
    module = _module()
    old_root = _old_zero_paid_root(module)
    recovery_root = old_root.parent / "tianwen-alpha-c-real-evidence-recovery-1"
    recovery_root.mkdir()
    runner = _Runner([])
    model_constructed = False

    def model_factory() -> Any:
        nonlocal model_constructed
        model_constructed = True
        return _Model()

    dependencies = replace(
        _recovery_dependencies(module, runner, old_root, recovery_root),
        model_factory=model_factory,
    )
    with pytest.raises(module.StageError, match="already initialized"):
        asyncio.run(module.run_stage(dependencies))

    assert model_constructed is False
    assert runner.prepared == []


def test_wrong_old_trial_id_rejects_before_recovery_root_or_model() -> None:
    """Break caught: an unrelated empty Trial store could impersonate the one supervised Docker stop."""
    module = _module()
    old_root = _old_zero_paid_root(module, trial_id="trial-unrelated-zero-paid")
    recovery_root = old_root.parent / "tianwen-alpha-c-real-evidence-recovery-1"
    runner = _Runner([_Result("trial-1", True, "met")])
    model_constructed = False

    def model_factory() -> Any:
        nonlocal model_constructed
        model_constructed = True
        return _Model()

    dependencies = replace(
        _recovery_dependencies(module, runner, old_root, recovery_root),
        model_factory=model_factory,
    )
    with pytest.raises(module.StageError, match="zero-paid"):
        asyncio.run(module.run_stage(dependencies))

    assert not recovery_root.exists()
    assert model_constructed is False
    assert runner.prepared == []


def test_even_zero_usage_old_budget_row_rejects_before_recovery_root_or_model() -> None:
    """Break caught: a created old budget could be mistaken for the exact untouched zero-row store."""
    module = _module()
    old_root = _old_zero_paid_root(module)
    database = old_root / "runs" / _OLD_TRIAL_ID / "state" / "tianwen.db"
    with sqlite3.connect(database) as connection:
        zero = BudgetUsage().model_dump_json()
        connection.execute("INSERT INTO tw_budgets VALUES (?, ?)", (zero, zero))
    recovery_root = old_root.parent / "tianwen-alpha-c-real-evidence-recovery-1"
    runner = _Runner([_Result("trial-1", True, "met")])
    model_constructed = False

    def model_factory() -> Any:
        nonlocal model_constructed
        model_constructed = True
        return _Model()

    dependencies = replace(
        _recovery_dependencies(module, runner, old_root, recovery_root),
        model_factory=model_factory,
    )
    with pytest.raises(module.StageError, match="zero-paid"):
        asyncio.run(module.run_stage(dependencies))

    assert not recovery_root.exists()
    assert model_constructed is False
    assert runner.prepared == []


def test_prepare_exception_writes_bounded_zero_paid_final_stop_receipt() -> None:
    """Break caught: a Docker preflight failure could consume the root without a durable zero-paid stop."""
    module = _module()
    old_root = _old_zero_paid_root(module)
    recovery_root = old_root.parent / "tianwen-alpha-c-real-evidence-recovery-1"

    class PrepareFailureRunner(_Runner):
        def prepare(self, task_id: str, *, budget: Any, previous_trial_id: str | None) -> _Prepared:
            raise RuntimeError("PRIVATE docker failure detail")

    runner = PrepareFailureRunner([])

    result = asyncio.run(module.run_stage(_recovery_dependencies(module, runner, old_root, recovery_root)))

    assert result == {
        "schema": "tianwen.alpha_c.real_evidence.preflight_stop.v1",
        "stop": "preflight_failure",
        "phase": "prepare",
        "failure_class": "RuntimeError",
        "model_requests": 0,
        "tokens": 0,
        "conservative_charge_microunits": 0,
        "remaining_cny_microunits": 20_000_000,
        "case_id": None,
        "lesson_id": None,
        "candidate_version_id": None,
    }
    receipt = recovery_root / "receipts" / "stop-preflight.json"
    assert json.loads(receipt.read_text(encoding="utf-8")) == result
    assert "PRIVATE" not in receipt.read_text(encoding="utf-8")
    assert not (old_root / "receipts" / "stop-preflight.json").exists()
    assert runner.executed == []


def test_missing_credential_stops_before_model_or_prepare() -> None:
    """Break caught: a missing credential could construct a provider or create Trial state."""
    module = _module()
    called = False

    def model_factory() -> Any:
        nonlocal called
        called = True
        return _Model()

    result = asyncio.run(
        module.run_stage(
            module.StageDependencies(
                stage_root=_root(), recovery_of_root=None, environment={}, model_factory=model_factory
            )
        )
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

    with pytest.raises(module.StageError, match="exceeds Alpha-C budget"):
        asyncio.run(
            module.run_stage(
                module.StageDependencies(
                    stage_root=_root(),
                    recovery_of_root=None,
                    environment={"DEEPSEEK_API_KEY": "configured"},
                    model_factory=model_factory,
                    price_snapshot=module.PriceSnapshot(
                        source_url=module.PRICE_SOURCE_URL,
                        model_id=module.MODEL_ID,
                        observed_at=datetime.now(UTC),
                        rates_cny_per_million={"peak_output": 300},
                    ),
                    checkout_audit=lambda: _dependencies(module, _Runner([])).checkout_audit(),
                )
            )
        )
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

    dependencies = replace(
        _dependencies(module, _Runner([])), model_factory=lambda: model, runner_factory=runner_factory
    )
    with pytest.raises(module.StageError, match="provider identity"):
        asyncio.run(module.run_stage(dependencies))

    assert runner_called is False
    assert model.request_count == 0


def test_legal_non_tty_process_executes_first_prepared_trial_exactly_once() -> None:
    """Break caught: a legal non-TTY process could stop before its approved bounded Trial."""
    module = _module()
    runner = _Runner([_Result("trial-1", True, "met")])
    result = asyncio.run(module.run_stage(_dependencies(module, runner, _Intake())))

    assert result["stop"] == "no_case_success"
    assert runner.executed == ["trial-1"]
    assert len(runner.confirmations) == 1
    assert runner.confirmations[0].confirmed_via == "approved_goal_budget"
    assert runner.confirmations[0].trial_id == runner.prepared[0].preview.trial_id
    assert runner.confirmations[0].preview_digest == content_digest(runner.prepared[0].preview)


def test_preflight_receipt_collision_stops_before_execute() -> None:
    """Break caught: a rerun could overwrite a preflight authority receipt and hide its earlier boundary."""
    module, root = _module(), _root()
    first = _Runner([_Result("trial-1", True, "met")])
    asyncio.run(module.run_stage(_dependencies(module, first, _Intake(), stage_root=root)))
    second = _Runner([_Result("trial-1", True, "met")])

    with pytest.raises(module.StageError, match="stage root is already initialized"):
        asyncio.run(module.run_stage(_dependencies(module, second, stage_root=root)))

    assert second.executed == []


def test_initialized_stage_root_blocks_restart_before_new_random_trial_prepare() -> None:
    """Break caught: restarting the process could create a second paid batch under a reused stage root."""
    module, root = _module(), _root()
    first = _Runner([_Result("random-first", True, "met")])
    asyncio.run(module.run_stage(_dependencies(module, first, _Intake(), stage_root=root)))
    second = _Runner([_Result("random-second", True, "met")])
    model = _Model()

    with pytest.raises(module.StageError, match="stage root is already initialized"):
        asyncio.run(
            module.run_stage(
                replace(_dependencies(module, second, stage_root=root), model_factory=lambda: model)
            )
        )

    assert second.prepared == []
    assert second.executed == []
    assert model.request_count == 0


@pytest.mark.parametrize(
    "snapshot",
    [
        lambda module: module.PriceSnapshot(
            source_url="https://wrong.invalid",
            model_id=module.MODEL_ID,
            observed_at=datetime.now(UTC),
            rates_cny_per_million={"peak_output": 27},
        ),
        lambda module: module.PriceSnapshot(
            source_url=module.PRICE_SOURCE_URL,
            model_id="deepseek:wrong-model",
            observed_at=datetime.now(UTC),
            rates_cny_per_million={"peak_output": 27},
        ),
        lambda module: module.PriceSnapshot(
            source_url=module.PRICE_SOURCE_URL,
            model_id=module.MODEL_ID,
            observed_at=datetime.now(),
            rates_cny_per_million={"peak_output": 27},
        ),
        lambda module: module.PriceSnapshot(
            source_url=module.PRICE_SOURCE_URL,
            model_id=module.MODEL_ID,
            observed_at=datetime.now(UTC),
            rates_cny_per_million={"peak_output": 0},
        ),
    ],
)
def test_invalid_price_snapshot_stops_before_root_or_model(snapshot: Any) -> None:
    """Break caught: malformed price identity or rate could create a stage lock before validation."""
    module, root, model = _module(), _root(), _Model()

    with pytest.raises(module.StageError, match="price snapshot"):
        asyncio.run(
            module.run_stage(
                replace(
                    _dependencies(module, _Runner([]), stage_root=root),
                    price_snapshot=snapshot(module),
                    model_factory=lambda: model,
                )
            )
        )

    assert not root.exists()
    assert model.request_count == 0


def test_first_real_success_projects_once_and_never_prepares_retry() -> None:
    """Break caught: a successful natural sample could spend a second Trial or create a Case."""
    module, runner, intake = _module(), _Runner([_Result("trial-1", True, "met")]), _Intake()

    result = asyncio.run(module.run_stage(_dependencies(module, runner, intake)))

    assert result["stop"] == "no_case_success"
    assert runner.executed == ["trial-1"]
    assert len(runner.prepared) == 1
    assert intake.projected == ["trial-1"]
    assert intake.triages == [("outcome-trial-1",)]
    assert result["case_id"] is None


def test_non_real_unsettled_result_charges_full_token_reservation() -> None:
    """Break caught: zero settled usage could erase the conservative charge after a provider failure."""
    module, runner, intake = (
        _module(),
        _Runner(
            [
                _Result(
                    "trial-1",
                    False,
                    "not_met",
                    failure_categories=("usage",),
                    usage=TrialUsage(
                        model_requests=0,
                        tokens=0,
                        tool_calls=0,
                        action_effects=0,
                        wall_seconds=0,
                    ),
                )
            ]
        ),
        _Intake(),
    )

    result = asyncio.run(module.run_stage(_dependencies(module, runner, intake)))

    assert result["stop"] == "non_real_or_operational"
    assert result["tokens"] == 0
    assert result["conservative_charge_microunits"] == 1_080_000
    assert result["remaining_cny_microunits"] == 18_920_000
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

    if second_champion != "champion":
        with pytest.raises(module.StageError, match="prepared Champion"):
            asyncio.run(module.run_stage(_dependencies(module, runner, intake)))
    else:
        result = asyncio.run(module.run_stage(_dependencies(module, runner, intake)))
        assert result["stop"] == "retry_authority_drift"
    assert runner.executed == ["trial-1"]
    assert len(runner.prepared) == 2
    assert intake.triages == [("outcome-trial-1",)]


def test_qualifying_first_failure_executes_at_most_one_independent_repeat_without_stdin() -> None:
    """Break caught: matching repeated verifier failures could be dropped before the existing Case gate."""
    module = _module()
    runner = _Runner(
        [
            _Result("trial-1", True, "not_met", failure_categories=("correctness",)),
            _Result("trial-2", True, "not_met", failure_categories=("correctness",)),
            _Result("trial-3", True, "not_met", failure_categories=("correctness",)),
        ]
    )
    intake = _Intake()

    result = asyncio.run(module.run_stage(_dependencies(module, runner, intake)))

    assert result["stop"] == "case_requires_attribution"
    assert result["case_id"] == "case-1"
    assert runner.executed == ["trial-1", "trial-2"]
    assert [item.confirmed_via for item in runner.confirmations] == [
        "approved_goal_budget",
        "approved_goal_budget",
    ]
    assert len(runner.prepared) == 2
    assert intake.triages == [("outcome-trial-1",), ("outcome-trial-1", "outcome-trial-2")]


def test_retry_receipt_binds_both_prepared_trial_authorities() -> None:
    """Break caught: retry audit could omit the second frozen workspace/store/condition authority."""
    module, root = _module(), _root()
    runner = _Runner(
        [
            _Result("trial-1", True, "not_met", failure_categories=("correctness",)),
            _Result("trial-2", True, "met"),
        ]
    )

    result = asyncio.run(module.run_stage(_dependencies(module, runner, _Intake(), stage_root=root)))

    assert result["stop"] == "retry_success_observe"
    [path] = (root / "receipts").glob("retry-*.json")
    receipt = json.loads(path.read_text(encoding="utf-8"))
    first, second = runner.prepared
    expected_condition_digest = content_digest(runner.condition_snapshot(first))
    assert receipt["first_prepared"] == {
        "trial_id": "trial-1",
        "condition_digest": expected_condition_digest,
        "champion_version_id": "champion",
        "champion_digest": "digest-champion",
        "workspace": str(first.paths.workspace),
        "store": str(first.paths.state),
    }
    assert receipt["second_prepared"] == {
        "trial_id": "trial-2",
        "condition_digest": expected_condition_digest,
        "champion_version_id": "champion",
        "champion_digest": "digest-champion",
        "workspace": str(second.paths.workspace),
        "store": str(second.paths.state),
    }


def test_second_success_is_observed_alone_not_mixed_with_first_failure() -> None:
    """Break caught: a successful repeat could be mixed with the first failure to manufacture a Case."""
    module = _module()
    runner = _Runner(
        [
            _Result("trial-1", True, "not_met", failure_categories=("correctness",)),
            _Result("trial-2", True, "met"),
        ]
    )
    intake = _Intake()

    result = asyncio.run(module.run_stage(_dependencies(module, runner, intake)))

    assert result["stop"] == "retry_success_observe"
    assert result["case_id"] is None
    assert intake.triages == [("outcome-trial-1",), ("outcome-trial-2",)]


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

    result = asyncio.run(module.run_stage(_dependencies(module, runner, intake)))

    assert result["stop"] == "retry_fingerprint_mismatch"
    assert result["case_id"] is None
    assert runner.executed == ["trial-1", "trial-2"]
    assert len(runner.prepared) == 2
    assert intake.triages == [("outcome-trial-1",)]


def test_stage_uses_recorded_official_price_without_a_local_file() -> None:
    """Break caught: missing local price data could stop the approved recorded estimate from running."""
    module, runner, intake = _module(), _Runner([_Result("trial-1", True, "met")]), _Intake()

    result = asyncio.run(
        module.run_stage(replace(_dependencies(module, runner, intake), price_snapshot=None))
    )

    assert result["stop"] == "no_case_success"
    assert result["price"]["source_url"] == module.PRICE_SOURCE_URL
    assert result["price"]["model_id"] == module.MODEL_ID
    assert result["price"]["observed_at"] == "2026-08-18T00:00:00+00:00"
    assert result["price"]["max_cny_per_million"] == 27
    assert module.ZERO_RESOURCE_LEARNING_BUDGET == BudgetLimit(
        model_requests=0, tool_calls=0, tokens=0, wall_seconds=0, child_loops=0, action_effects=0
    )


def test_old_price_observation_does_not_block_a_legal_trial() -> None:
    """Break caught: price age could become a second approval gate after bounded preflight."""
    module, runner, intake = _module(), _Runner([_Result("trial-1", True, "met")]), _Intake()
    price = module.PriceSnapshot(
        source_url=module.PRICE_SOURCE_URL,
        model_id=module.MODEL_ID,
        observed_at=datetime(2020, 1, 1, tzinfo=UTC),
        rates_cny_per_million={"maximum_published": 27},
    )

    result = asyncio.run(module.run_stage(_dependencies(module, runner, intake, price_snapshot=price)))

    assert result["stop"] == "no_case_success"
    assert runner.executed == ["trial-1"]
    assert result["price"]["observed_at"] == "2020-01-01T00:00:00+00:00"


def test_existing_intake_forms_case_with_zero_resource_child_budget(tmp_path: Path) -> None:
    """Break caught: a real repeated Case could exceed the Alpha parent budget while being persisted."""
    sys.path.insert(0, str(Path(__file__).parent))
    import test_alpha_c_learning_intake as fixtures

    module = _module()
    _unused_intake, aggregate = fixtures._intake(tmp_path)
    intake = module._intake(aggregate, None)
    first_store, first, _ = fixtures._failed_trial(tmp_path, "first")
    second_store, second, _ = fixtures._failed_trial(tmp_path, "second")

    receipt = intake.triage(
        (
            intake.record_trial_outcome(first, trial_store=first_store),
            intake.record_trial_outcome(second, trial_store=second_store),
        )
    )

    assert receipt.disposition == "learning_case"
    assert receipt.case_id is not None
    ticket = intake.engine.get_ticket(receipt.ticket_id)
    assert ticket.learning_budget == module.ZERO_RESOURCE_LEARNING_BUDGET
    _limit, usage, _reserved = aggregate.get_budget(ticket.loop_id)
    assert usage == BudgetUsage()


def _native_audit_root(tmp_path: Path, *, pointer_drift: bool = False, bad_digest: bool = False) -> Path:
    root = tmp_path / "repo"
    skill = "---\nname: repo-task\n---\n# Offline champion\n"
    skill_path = root / "skills" / "repo-task" / "SKILL.md"
    skill_path.parent.mkdir(parents=True)
    skill_path.write_text(skill, encoding="utf-8")
    database = root / ".tianwen" / "tianwen.db"
    database.parent.mkdir()
    champion = ArtifactVersion(
        artifact_id="repo-task",
        artifact_type="repo_task_skill",
        version_id=content_digest(skill),
        parent_version_id=None,
        content_digest=content_digest(skill),
        content=skill,
        evidence_ids=(),
        status=ArtifactStatus.ACTIVE,
    )
    pointer = ActivePointer(
        artifact_id="repo-task",
        current_version_id="sha256:pointer-drift" if pointer_drift else champion.version_id,
        generation=1,
    )
    with sqlite3.connect(database) as connection:
        connection.execute(
            "CREATE TABLE tw_objects (kind TEXT, object_id TEXT, status TEXT, body_json TEXT, body_digest TEXT)"
        )
        for kind, object_id, status, model in (
            ("artifact", champion.version_id, "active", champion),
            ("active_pointer", "repo-task", "active", pointer),
        ):
            body = model.model_dump(mode="json")
            connection.execute(
                "INSERT INTO tw_objects VALUES (?, ?, ?, ?, ?)",
                (
                    kind,
                    object_id,
                    status,
                    json.dumps(body),
                    "sha256:bad" if bad_digest and kind == "artifact" else content_digest(body),
                ),
            )
    return root


def _native_git(module: Any) -> Any:
    return lambda *args: {
        ("branch", "--show-current"): module.STAGE_BRANCH,
        ("rev-parse", "HEAD"): "head",
        ("rev-parse", "main"): module.BASE_SHA,
        ("rev-parse", "origin/main"): module.BASE_SHA,
        ("merge-base", "HEAD", module.BASE_SHA): module.BASE_SHA,
        ("status", "--porcelain"): "",
    }[args]


def test_native_checkout_and_governance_audit_accepts_minimal_baseline(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Break caught: the native SQLite audit could reject the approved empty Champion baseline."""
    module = _module()
    monkeypatch.setattr(module, "PROJECT_ROOT", _native_audit_root(tmp_path))
    monkeypatch.setattr(module, "_git", _native_git(module))

    audit = module.audit_checkout_and_governance()

    assert audit.champion_version_id == audit.champion_digest
    assert audit.object_counts == {"active_pointer": 1, "artifact": 1}


@pytest.mark.parametrize(
    ("pointer_drift", "bad_digest", "match"),
    [(True, False, "baseline"), (False, True, "digest")],
)
def test_native_checkout_and_governance_audit_rejects_drift_or_digest_tamper(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, pointer_drift: bool, bad_digest: bool, match: str
) -> None:
    """Break caught: native preflight could trust a split Champion pointer or tampered governance row."""
    module = _module()
    monkeypatch.setattr(
        module, "PROJECT_ROOT", _native_audit_root(tmp_path, pointer_drift=pointer_drift, bad_digest=bad_digest)
    )
    monkeypatch.setattr(module, "_git", _native_git(module))

    with pytest.raises(module.StageError, match=match):
        module.audit_checkout_and_governance()
