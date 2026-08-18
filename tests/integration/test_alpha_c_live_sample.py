from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from tianwen.alpha import TrialManifest, TrialPreview, TrialResult, TrialUsage
from tianwen.alpha_docker import VerifierResult
from tianwen.domain import BudgetLimit, BudgetUsage, EvidenceRecord, content_digest, utc_now
from tianwen.learning_intake import LearningTriageReceipt, OutcomeObservation

SCRIPT = Path(__file__).parents[2] / "scripts" / "run_alpha_c_live_sample.py"
BUDGET = BudgetLimit(model_requests=4, tool_calls=8, tokens=40_000, wall_seconds=300, action_effects=8)


def _module() -> Any:
    assert SCRIPT.is_file(), "the approved clean live-sample entry point is missing"
    spec = importlib.util.spec_from_file_location("run_alpha_c_live_sample", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class _Model:
    model_id = "deepseek:deepseek-v4-pro"
    settings = {"max_tokens": 4096}
    provider = SimpleNamespace(name="deepseek", base_url="https://api.deepseek.com")


class _Store:
    def __init__(self, database: Path) -> None:
        self.database = database
        self.objects: dict[tuple[str, str], object] = {}
        self.usage = BudgetUsage()

    def get_object(self, kind: str, object_id: str, _model: type[Any]) -> Any:
        return self.objects[(kind, object_id)]

    def get_budget(self, loop_id: str) -> tuple[BudgetLimit, BudgetUsage, BudgetUsage]:
        assert loop_id.startswith("loop-")
        return BUDGET, self.usage, BudgetUsage()


class _Runner:
    def __init__(self, root: Path, ordinal: int, kind: str, fingerprint: str = "same") -> None:
        self.ordinal, self.kind, self.fingerprint = ordinal, kind, fingerprint
        self.store = _Store(root / f"trial-{ordinal}.db")
        self.app = SimpleNamespace(goal_task=lambda goal_id: SimpleNamespace(loop_id=f"loop-{goal_id}"))
        self.executions = 0
        self.prepared: Any = None

    def prepare(self, task_id: str, *, budget: BudgetLimit, previous_trial_id: str | None = None) -> Any:
        assert task_id == "A1" and budget == BUDGET
        if self.kind == "prepare_error":
            raise RuntimeError("simulated zero-paid Docker preflight failure")
        trial_id = f"trial-{self.ordinal}"
        preview = TrialPreview(
            trial_id=trial_id,
            previous_trial_id=previous_trial_id,
            task_id="A1",
            task_version="1",
            task_bundle_digest="sha256:bundle",
            objective="A1",
            acceptance=("passes",),
            rounds=(),
            authorizations=("workspace_read", "workspace_write", "isolated_check_execution"),
            budget=BUDGET,
            model_id=_Model.model_id,
            provider_name="deepseek",
            champion_version_id="champion",
            champion_digest="sha256:champion",
            image_digest="sha256:image",
            data_root=str(self.store.database.parent),
            paid_request_warning="approved bounded Trial may incur real API fees",
        )
        self.prepared = SimpleNamespace(
            preview=preview,
            seed_verifier=VerifierResult(
                verdict="not_met",
                passed_checks=(),
                failed_checks=("final",),
                failure_categories=("correctness",),
                summary="seed",
            ),
            champion_version_id="champion",
            champion_digest="sha256:champion",
            paths=SimpleNamespace(workspace=self.store.database.parent / f"workspace-{self.ordinal}"),
        )
        return self.prepared

    def condition_snapshot(self, _prepared: Any) -> dict[str, str]:
        return {"condition": self.fingerprint}

    async def execute(self, prepared: Any, confirmation: Any) -> TrialResult:
        self.executions += 1
        assert confirmation.trial_id == prepared.preview.trial_id
        assert confirmation.preview_digest == content_digest(prepared.preview)
        assert confirmation.confirmed_via == "approved_goal_budget"
        trial_id, goal_id = prepared.preview.trial_id, f"goal-{self.ordinal}"
        manifest = TrialManifest.model_construct(
            trial_id=trial_id,
            task_id="A1",
            task_version="1",
            task_bundle_digest="sha256:bundle",
            model_input_digest="sha256:input",
            model_id=_Model.model_id,
            champion_version_id="champion",
            champion_digest="sha256:champion",
            verifier_snapshot={"digest": "sha256:verifier"},
            verifier_digest="sha256:verifier",
        )
        run_id = f"alpha:{trial_id}:round-1"
        verdict = "met" if self.kind == "success" else "not_met"
        completed = self.kind in {"success", "failure"}
        real = self.kind != "operational"
        categories = ("correctness",) if self.kind == "failure" else ()
        evidence = EvidenceRecord(
            evidence_id=f"evidence-{trial_id}",
            run_id=run_id,
            action_id=f"action-{trial_id}",
            evidence_type="alpha_final_verification",
            result_class=verdict,
            effect_class="external_read_only",
            version_bucket="frozen",
            cost_bucket="controller",
            needed_user=False,
            safety_category="final_verifier",
            summary="final verifier",
            payload_digest=f"sha256:payload-{trial_id}",
            scope=f"trial:{trial_id}",
            purpose="alpha_final_verification",
            source_class="docker_verifier",
            sensitivity="internal",
            provenance_ids=(f"action-{trial_id}",),
        )
        usage = TrialUsage(
            model_requests=1 if real else 0,
            tokens=1000 if real else 0,
            tool_calls=1 if real else 0,
            action_effects=1 if real else 0,
            wall_seconds=1,
        )
        result = TrialResult(
            trial_id=trial_id,
            previous_trial_id=prepared.preview.previous_trial_id,
            trial_manifest_digest=content_digest(manifest),
            goal_id=goal_id,
            run_ids=(run_id,),
            exploration_run_ids=(),
            checkpoint_ids=(),
            task_id="A1",
            task_version="1",
            model_id=_Model.model_id,
            champion_version_id="champion",
            champion_digest="sha256:champion",
            baseline_tree_digest="sha256:baseline",
            final_tree_digest="sha256:final",
            diff_digest="sha256:diff",
            verifier_digest="sha256:verifier",
            verdict=verdict if completed else "inconclusive",
            failure_categories=categories,
            execution_status="completed" if completed else "stopped",
            verification_status="completed" if completed else "unavailable",
            boundary_status="passed" if completed else "unknown",
            action_ids=(evidence.action_id,),
            evidence_ids=(evidence.evidence_id,) if completed else (),
            usage=usage,
            run_stop_reasons=() if completed else ("provider_unavailable",),
            workspace_path=str(prepared.paths.workspace),
            artifacts=(),
            qualifies_as_real_model_trial=real and completed,
            started_at=utc_now(),
            finished_at=utc_now(),
        )
        self.store.objects.update(
            {
                ("alpha_trial_result", trial_id): result,
                ("alpha_trial_manifest", trial_id): manifest,
                **({("evidence", evidence.evidence_id): evidence} if completed else {}),
            }
        )
        self.store.usage = BudgetUsage(
            model_requests=usage.model_requests,
            tokens=usage.tokens,
            tool_calls=usage.tool_calls,
            action_effects=usage.action_effects,
        )
        if self.kind == "interrupt":
            raise RuntimeError("simulated interruption after paid usage")
        return result


class _Intake:
    def record_trial_outcome(self, result: TrialResult, *, trial_store: _Store) -> OutcomeObservation:
        assert trial_store.get_object("alpha_trial_result", result.trial_id, TrialResult) == result
        kind = "verified_failure" if result.verdict == "not_met" else "verified_success"
        fingerprint = f"sha256:{getattr(trial_store, 'fingerprint', 'same')}"
        return OutcomeObservation(
            outcome_id=f"outcome-{result.trial_id}",
            source_kind="trial_verifier",
            source_id=result.trial_id,
            source_digest=content_digest(result),
            outcome_kind=kind,
            capability_scope="repo_task_skill/champion/task/A1@1",
            task_id="A1",
            goal_id=result.goal_id,
            run_id=result.run_ids[-1],
            trial_id=result.trial_id,
            problem_fingerprint=fingerprint,
            evidence_ids=result.evidence_ids,
            authority_id=f"authority-{result.trial_id}",
        )

    def triage(self, outcomes: tuple[OutcomeObservation, ...]) -> LearningTriageReceipt:
        learning_case = len(outcomes) == 2
        return LearningTriageReceipt(
            triage_id=f"triage-{len(outcomes)}-{outcomes[-1].outcome_id}",
            gap_id="gap" if learning_case else None,
            outcome_ids=tuple(item.outcome_id for item in outcomes),
            disposition="learning_case" if learning_case else "observe",
            reason="repeated" if learning_case else "observe",
            signal_id="signal" if learning_case else None,
            ticket_id="ticket" if learning_case else None,
            case_id="case" if learning_case else None,
        )


def _dependencies(tmp_path: Path, kinds: list[str], fingerprints: list[str] | None = None) -> tuple[Any, list[_Runner]]:
    module, runners = _module(), []
    fingerprints = fingerprints or ["same"] * len(kinds)

    def runner_factory(_model: Any, root: Path) -> _Runner:
        runner = _Runner(root, len(runners) + 1, kinds[len(runners)], fingerprints[len(runners)])
        runner.store.fingerprint = fingerprints[len(runners)]
        runners.append(runner)
        return runner

    dependencies = module.StageDependencies(
        stage_root=tmp_path / "stage",
        environment={"DEEPSEEK_API_KEY": "configured-not-persisted"},
        model_factory=_Model,
        runner_factory=runner_factory,
        intake_factory=lambda _store, _budget: _Intake(),
    )
    return dependencies, runners


def test_approved_goal_budget_confirmation_binds_exact_preview() -> None:
    from tianwen.alpha import TrialConfirmation

    confirmation = TrialConfirmation(
        trial_id="trial-1", preview_digest="sha256:preview", confirmed_via="approved_goal_budget"
    )

    assert confirmation.confirmed_via == "approved_goal_budget"


def test_verified_success_projects_once_and_does_not_repeat(tmp_path: Path) -> None:
    module = _module()
    dependencies, runners = _dependencies(tmp_path, ["success"])

    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "no_case_success"
    assert receipt["trial_ids"] == ["trial-1"]
    assert receipt["outcome_ids"] == ["outcome-trial-1"]
    assert receipt["case_id"] is None
    assert receipt["candidate_version_id"] is None
    assert [item.executions for item in runners] == [1]


def test_operational_result_never_enters_intake(tmp_path: Path) -> None:
    module = _module()
    dependencies, runners = _dependencies(tmp_path, ["operational"])
    dependencies = dependencies.__class__(
        **{**dependencies.__dict__, "intake_factory": lambda *_args: pytest.fail("Intake must not run")}
    )

    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "non_qualifying_trial"
    assert receipt["outcome_ids"] == []
    assert len(runners) == 1


def test_first_qualifying_failure_alone_triggers_one_independent_repeat(tmp_path: Path) -> None:
    module = _module()
    dependencies, runners = _dependencies(tmp_path, ["failure", "success"])

    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "no_case_second_success"
    assert receipt["trial_ids"] == ["trial-1", "trial-2"]
    assert receipt["outcome_ids"] == ["outcome-trial-1", "outcome-trial-2"]
    assert receipt["case_id"] is None
    assert len(runners) == 2
    assert runners[0].store.database != runners[1].store.database
    assert receipt["request_usage"] == 2
    assert receipt["token_usage"] == 2000


def test_two_matching_failures_form_at_most_one_case(tmp_path: Path) -> None:
    module = _module()
    dependencies, runners = _dependencies(tmp_path, ["failure", "failure"])

    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "requires_attribution"
    assert receipt["case_id"] == "case"
    assert receipt["candidate_version_id"] is None
    assert len(runners) == 2
    assert receipt["estimated_cny"] == pytest.approx(0.054)
    assert receipt["remaining_budget"] == pytest.approx(19.946)


def test_condition_drift_rejects_second_trial_before_execution(tmp_path: Path) -> None:
    module = _module()
    dependencies, runners = _dependencies(tmp_path, ["failure", "failure"], ["first", "drifted"])

    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "condition_drift"
    assert [item.executions for item in runners] == [1, 0]


def test_stage_budget_reservation_fails_closed_before_trials(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    module = _module()
    dependencies, runners = _dependencies(tmp_path, ["success"])
    monkeypatch.setattr(module, "MAX_STAGE_CNY", 2.0)

    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "budget_preflight_failed"
    assert receipt["trial_ids"] == []
    assert runners == []


def test_invalid_provider_identity_writes_zero_paid_stop_receipt(tmp_path: Path) -> None:
    module = _module()
    dependencies, runners = _dependencies(tmp_path, ["success"])
    dependencies = dependencies.__class__(
        **{
            **dependencies.__dict__,
            "model_factory": lambda: SimpleNamespace(
                model_id="deepseek:wrong",
                provider=SimpleNamespace(name="deepseek", base_url="https://api.deepseek.com"),
                settings={"max_tokens": 4096},
            ),
        }
    )

    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "model_preflight_failed"
    assert receipt["request_usage"] == receipt["token_usage"] == 0
    assert runners == []


def test_paid_interruption_reports_durable_trial_id_instead_of_zero_receipt(tmp_path: Path) -> None:
    module = _module()
    dependencies, runners = _dependencies(tmp_path, ["interrupt"])

    with pytest.raises(module.StageError, match="trial-1"):
        asyncio.run(module.run_stage(dependencies))

    assert runners[0].store.usage.model_requests == 1


def test_second_zero_paid_preflight_failure_stops_with_first_trial_receipt(tmp_path: Path) -> None:
    module = _module()
    dependencies, runners = _dependencies(tmp_path, ["failure", "prepare_error"])

    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "second_infrastructure_preflight_failed"
    assert receipt["trial_ids"] == ["trial-1"]
    assert receipt["request_usage"] == 1
    assert [item.executions for item in runners] == [1, 0]
