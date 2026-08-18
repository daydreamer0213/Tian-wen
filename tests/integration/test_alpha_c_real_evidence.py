from __future__ import annotations

import asyncio
import importlib
import json
import secrets
import sqlite3
import sys
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import BaseModel, Field

from tianwen.alpha import AlphaTrialConditionSnapshot, TrialManifest, TrialPreview, TrialUsage
from tianwen.domain import ArtifactStatus, ArtifactVersion, BudgetLimit, BudgetUsage, content_digest
from tianwen.evaluation import ActivePointer


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

    async def execute(self, prepared: _Prepared, _confirmation: Any) -> _Result:
        self.executed.append(prepared.preview.trial_id)
        result = self.results[len(self.executed) - 1]
        prepared._app.store.result = result
        self.store, self.app = prepared._app.store, prepared._app
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
        environment={"DEEPSEEK_API_KEY": "configured"},
        stdin=stdin,
        stdout=SimpleNamespace(write=lambda _text: None, flush=lambda: None),
        model_factory=lambda: model,
        runner_factory=lambda _model, _root: runner,
        intake_factory=None if intake is None else lambda _store, _budget: intake,
        price_snapshot=kwargs.pop("price_snapshot", price),
        checkout_audit=kwargs.pop("checkout_audit", lambda: audit),
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

    with pytest.raises(module.StageError, match="exceeds Alpha-C budget"):
        asyncio.run(
            module.run_stage(
                module.StageDependencies(
                    stage_root=_root(),
                    environment={"DEEPSEEK_API_KEY": "configured"},
                    model_factory=model_factory,
                    price_snapshot=module.PriceSnapshot(
                        source_url=module.PRICE_SOURCE_URL,
                        model_id=module.MODEL_ID,
                        observed_at=datetime.now(UTC),
                        rates_cny_per_million={"peak_output": 300},
                    ),
                    checkout_audit=lambda: _dependencies(module, _Runner([]), _Tty()).checkout_audit(),
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
        _dependencies(module, _Runner([]), _Tty()), model_factory=lambda: model, runner_factory=runner_factory
    )
    with pytest.raises(module.StageError, match="provider identity"):
        asyncio.run(module.run_stage(dependencies))

    assert runner_called is False
    assert model.request_count == 0


def test_non_tty_stops_after_zero_paid_preflight_without_execute() -> None:
    """Break caught: a pipe could start a paid Trial without a local TTY confirmation."""
    module = _module()
    runner = _Runner([_Result("trial-1", True, "met")])
    model = _Model()
    result = asyncio.run(
        module.run_stage(replace(_dependencies(module, runner, _Tty(tty=False)), model_factory=lambda: model))
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

    with pytest.raises(module.StageError, match="stage root is already initialized"):
        asyncio.run(module.run_stage(_dependencies(module, second, _Tty(tty=False), stage_root=root)))

    assert second.executed == []


def test_initialized_stage_root_blocks_restart_before_new_random_trial_prepare() -> None:
    """Break caught: restarting the process could create a second paid batch under a reused stage root."""
    module, root = _module(), _root()
    first = _Runner([_Result("random-first", True, "met")])
    asyncio.run(module.run_stage(_dependencies(module, first, _Tty(tty=False), stage_root=root)))
    second = _Runner([_Result("random-second", True, "met")])
    model = _Model()

    with pytest.raises(module.StageError, match="stage root is already initialized"):
        asyncio.run(
            module.run_stage(
                replace(_dependencies(module, second, _Tty(tty=False), stage_root=root), model_factory=lambda: model)
            )
        )

    assert second.prepared == []
    assert second.executed == []
    assert model.request_count == 0


@pytest.mark.parametrize(
    "snapshot",
    [
        lambda module: module.PriceSnapshot(
            source_url=module.PRICE_SOURCE_URL,
            model_id=module.MODEL_ID,
            observed_at=datetime(2026, 8, 16, tzinfo=UTC),
            rates_cny_per_million={"peak_output": 27},
        ),
        lambda module: module.PriceSnapshot(
            source_url=module.PRICE_SOURCE_URL,
            model_id=module.MODEL_ID,
            observed_at=datetime.now(UTC),
            rates_cny_per_million={"peak_output": 26},
        ),
    ],
)
def test_invalid_price_snapshot_stops_before_root_or_model(snapshot: Any) -> None:
    """Break caught: stale or understated pricing could create a stage lock or Provider before validation."""
    module, root, model = _module(), _root(), _Model()

    with pytest.raises(module.StageError, match="price snapshot"):
        asyncio.run(
            module.run_stage(
                replace(
                    _dependencies(module, _Runner([]), _Tty(), stage_root=root),
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

    if second_champion != "champion":
        with pytest.raises(module.StageError, match="prepared Champion"):
            asyncio.run(module.run_stage(_dependencies(module, runner, _Tty("CONFIRM trial-1\n"), intake)))
    else:
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

    result = asyncio.run(
        module.run_stage(_dependencies(module, runner, _Tty("CONFIRM trial-1\n", "CONFIRM trial-2\n"), intake))
    )

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

    result = asyncio.run(
        module.run_stage(_dependencies(module, runner, _Tty("CONFIRM trial-1\n", "CONFIRM trial-2\n"), intake))
    )

    assert result["stop"] == "retry_fingerprint_mismatch"
    assert result["case_id"] is None
    assert runner.executed == ["trial-1", "trial-2"]
    assert len(runner.prepared) == 2
    assert intake.triages == [("outcome-trial-1",)]


def test_stage_uses_a_fresh_price_snapshot_and_zero_resource_learning_budget() -> None:
    """Break caught: stale pricing or a nonzero learning child budget could authorize unbounded paid work."""
    module = _module()

    assert module.ZERO_RESOURCE_LEARNING_BUDGET == BudgetLimit(
        model_requests=0, tool_calls=0, tokens=0, wall_seconds=0, child_loops=0, action_effects=0
    )
    assert callable(module.load_price_snapshot)


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


def test_price_snapshot_freshness_is_limited_to_ten_minutes() -> None:
    """Break caught: an old price snapshot could reserve paid work with stale authority."""
    module = _module()

    assert module.PRICE_SNAPSHOT_MAX_AGE == timedelta(minutes=10)


def test_load_price_snapshot_uses_the_canonical_local_json_path(tmp_path: Path) -> None:
    """Break caught: the native preflight could ignore or misread its fixed local price authority."""
    module = _module()
    path = tmp_path / "price.json"
    path.write_text(
        json.dumps(
            {
                "source_url": module.PRICE_SOURCE_URL,
                "model_id": module.MODEL_ID,
                "observed_at": datetime.now(UTC).isoformat(),
                "rates_cny_per_million": {"off_peak_output": 6, "peak_output": 27},
            }
        ),
        encoding="utf-8",
    )

    snapshot = module.load_price_snapshot(path)

    assert snapshot.authority()["max_cny_per_million"] == 27


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {
            "source_url": "https://wrong.invalid",
            "model_id": "wrong",
            "observed_at": datetime.now(UTC).isoformat(),
            "rates_cny_per_million": {"peak_output": 27},
        },
        {
            "source_url": "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/",
            "model_id": "deepseek:deepseek-v4-pro",
            "observed_at": (datetime.now(UTC) - timedelta(minutes=10, seconds=1)).isoformat(),
            "rates_cny_per_million": {"peak_output": 27},
        },
        {
            "source_url": "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/",
            "model_id": "deepseek:deepseek-v4-pro",
            "observed_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
            "rates_cny_per_million": {"peak_output": 27},
        },
    ],
)
def test_load_price_snapshot_rejects_malformed_or_outside_ten_minute_window(
    tmp_path: Path, payload: dict[str, Any]
) -> None:
    """Break caught: malformed, mismatched, or stale local pricing could authorize a Trial."""
    module = _module()
    path = tmp_path / "price.json"
    path.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(module.StageError, match="price snapshot"):
        module.load_price_snapshot(path)


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
