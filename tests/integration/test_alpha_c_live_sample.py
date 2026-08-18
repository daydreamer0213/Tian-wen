from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from pydantic_ai.messages import ModelRequest, UserPromptPart
from pydantic_ai.models import ModelRequestParameters

from tianwen.alpha_docker import VerifierResult
from tianwen.domain import BudgetLimit, BudgetUsage, content_digest
from tianwen.learning_intake import LearningTriageReceipt, OutcomeObservation
from tianwen.store import StateConflict

SCRIPT = Path(__file__).parents[2] / "scripts" / "run_alpha_c_live_sample.py"
BUDGET = BudgetLimit(
    model_requests=8,
    tool_calls=12,
    tokens=40_000,
    wall_seconds=300,
    action_effects=12,
)
PRIOR_RECEIPT_SHA256 = "55cc4e97115061f4d81c5c28de254962e577da8871f92f182475ebfc6a41e835"
PRIOR_DATABASE_SHA256 = "ccb26569d3cb5a9fd5278fb3551b538eb92f44bdae3f981a70a00137cf994162"
PRIOR_AUDIT_UPPER_CNY = 13.307382
PRIOR_RECEIPT = {
    "candidate_version_id": None,
    "case_id": None,
    "cumulative_estimated_cny": 13.307382,
    "current_estimated_cny": 0.401787,
    "durable": [
        {
            "final_evidence_digest": "sha256:a229c308c1d3186481637e8acf726c381cb177c6839befcdea37264bee80b4fc",
            "manifest_digest": "sha256:0995357809b44f4ebe0c9b9e8b4e29f3681ecc48b71ebbf26670241b93f2ec10",
            "result_digest": "sha256:1a677294efeb8da81c44f4eed91803db2a3db5b953e8902ea1a987a510b7ea9e",
            "trial_id": "trial-7c8b76c735ca9cb0c978de047f5049a5",
        }
    ],
    "outcome_ids": ["sha256:53c2f7e92a4050c93721fa6948d5aa9563dfaf31478249ec53ff127aa941787d"],
    "prior_audit_upper_cny": 12.905595,
    "prior_database_digest": "sha256:4d5ef26371add49f1b709ffa5da2e7b2961771cfe13559da5a1e6223d3b0b525",
    "prior_receipt_digest": "sha256:8e5db61e4d07578c490941ccc3c26e1e105e48cfb1ed539017e231a0b0546164",
    "remaining_budget": 6.6926179999999995,
    "request_usage": 6,
    "stop": "no_case_success",
    "token_usage": 14881,
    "triage": [
        {
            "disposition": "observe",
            "triage_id": "sha256:19d79829866a18ac004b3202b953a5f9f9630833a2546bd18cac19c81774c8e7",
        }
    ],
    "trial_ids": ["trial-7c8b76c735ca9cb0c978de047f5049a5"],
}


class _Record(dict[str, Any]):
    __getattr__ = dict.__getitem__


class _Model:
    model_id = "deepseek:deepseek-v4-pro"
    settings = {
        "extra_body": {"thinking": {"type": "disabled"}},
        "max_tokens": 4096,
    }
    provider = SimpleNamespace(name="deepseek", base_url="https://api.deepseek.com")


class _Store:
    def __init__(self, database: Path, fingerprint: str) -> None:
        self.database = database
        self.fingerprint = fingerprint
        self.objects: dict[tuple[str, str], Any] = {}
        self.usage = BudgetUsage()
        self.reserved = BudgetUsage()

    def get_object(self, kind: str, object_id: str, _model: type[Any]) -> Any:
        try:
            return self.objects[(kind, object_id)]
        except KeyError as error:
            raise StateConflict(f"missing {kind}:{object_id}") from error

    def get_budget(self, _loop_id: str) -> tuple[BudgetLimit, BudgetUsage, BudgetUsage]:
        return BUDGET, self.usage, self.reserved

    def list_objects(self, kind: str, _model: type[Any]) -> list[Any]:
        if kind != "goal" or not (self.usage.model_requests or self.reserved.model_requests):
            return []
        return [SimpleNamespace(goal_id=self.database.parent.name.replace("trial-", "goal-"))]


class _Runner:
    def __init__(self, root: Path, ordinal: int, mode: str, drift: str, fingerprint: str) -> None:
        self.ordinal = ordinal
        self.mode = mode
        self.drift = drift
        self.store = _Store(root / "state.db", fingerprint)
        self.app = SimpleNamespace(goal_task=lambda goal_id: SimpleNamespace(loop_id=f"loop:{goal_id}"))
        self.executions = 0
        self.confirmations: list[Any] = []
        self.prepared: Any = None

    def prepare(self, task_id: str, *, budget: BudgetLimit, previous_trial_id: str | None = None) -> Any:
        assert task_id == "A2" and budget == BUDGET
        if self.mode == "prepare_error":
            raise RuntimeError("zero-paid preflight failure")
        trial_id = f"trial-{self.ordinal}"
        version = "champion-drift" if self.drift == "champion_version" else "champion"
        digest = "sha256:champion-drift" if self.drift == "champion_digest" else "sha256:champion"
        preview = _Record(
            trial_id=trial_id,
            previous_trial_id=previous_trial_id,
            task_id="A2",
            task_version="1.0.0",
            budget=budget.model_dump(mode="json"),
            model_id=_Model.model_id,
            champion_version_id=version,
            champion_digest=digest,
        )
        seed = VerifierResult(
            verdict="not_met",
            passed_checks=("ordinary_fields",),
            failed_checks=("quoted_separator",),
            failure_categories=("behavior_mismatch",),
            summary="1/7 checks passed",
        )
        durable_seed = seed.model_copy(update={"summary": "mismatch"}) if self.mode == "seed_mismatch" else seed
        if self.mode != "seed_missing":
            self.store.objects[("check_execution", "seed-preflight")] = _Record(
                result_type="seed_preflight",
                status="finished",
                exit_code=0,
                result_json=durable_seed.model_dump_json(),
            )
        self.prepared = SimpleNamespace(
            preview=preview,
            seed_verifier=seed,
            champion_version_id=version,
            champion_digest=digest,
            paths=SimpleNamespace(workspace=self.store.database.parent / "workspace"),
        )
        return self.prepared

    def condition_snapshot(self, _prepared: Any) -> dict[str, str]:
        return {"condition": "drift" if self.drift == "condition" else "fixed"}

    async def execute(self, prepared: Any, confirmation: Any) -> Any:
        self.executions += 1
        self.confirmations.append(confirmation)
        if self.mode == "interrupt":
            self.store.usage = BudgetUsage(model_requests=1, tokens=1000)
            self.store.reserved = BudgetUsage(model_requests=1, tokens=500)
            raise RuntimeError("paid interruption")
        real = self.mode != "operational"
        completed = self.mode != "operational"
        verdict = "met" if self.mode == "success" else "not_met" if completed else "inconclusive"
        trial_id = prepared.preview.trial_id
        run_id = f"alpha:{trial_id}:round-1"
        verifier = {"verifier_id": "final", "digest": "sha256:verifier-spec"}
        manifest = _Record(
            trial_id=trial_id,
            task_id="A2",
            task_version="1.0.0",
            model_id=_Model.model_id,
            champion_version_id=prepared.champion_version_id,
            champion_digest=prepared.champion_digest,
            verifier_snapshot=verifier,
            verifier_digest=content_digest(verifier),
        )
        evidence = _Record(
            evidence_id=f"evidence-{trial_id}",
            run_id=run_id,
            action_id=f"action-{trial_id}",
            evidence_type="alpha_final_verification",
            result_class=verdict,
            scope=f"trial:{trial_id}",
            purpose="alpha_final_verification",
            source_class="docker_verifier",
        )
        usage = _Record(
            model_requests=1 if real else 0,
            tokens=210_000 if self.mode == "high_usage_failure" else 1000 if real else 0,
            tool_calls=1 if real else 0,
            action_effects=1 if real else 0,
            wall_seconds=1,
        )
        result = _Record(
            trial_id=trial_id,
            previous_trial_id=prepared.preview.previous_trial_id,
            trial_manifest_digest=content_digest(manifest),
            goal_id=f"goal-{self.ordinal}",
            run_ids=(run_id,),
            exploration_run_ids=(),
            checkpoint_ids=(),
            task_id="A2",
            task_version="1.0.0",
            model_id=_Model.model_id,
            champion_version_id=prepared.champion_version_id,
            champion_digest=prepared.champion_digest,
            baseline_tree_digest="sha256:baseline",
            final_tree_digest="sha256:final",
            diff_digest="sha256:diff",
            verifier_digest=str(verifier["digest"]),
            verdict=verdict,
            failure_categories=("correctness",)
            if self.mode in {"failure", "high_usage_failure"}
            else (),
            execution_status="completed" if completed else "stopped",
            verification_status="completed" if completed else "unavailable",
            boundary_status="passed" if completed else "unknown",
            action_ids=(evidence.action_id,) if completed else (),
            evidence_ids=(evidence.evidence_id,) if completed else (),
            usage=usage,
            run_stop_reasons=() if completed else ("provider_unavailable",),
            workspace_path=str(prepared.paths.workspace),
            artifacts=(),
            qualifies_as_real_model_trial=real and completed,
            started_at="2026-08-18T00:00:00Z",
            finished_at="2026-08-18T00:00:01Z",
        )
        self.store.objects[("alpha_trial_manifest", trial_id)] = manifest
        self.store.objects[("alpha_trial_result", trial_id)] = result
        if completed:
            self.store.objects[("evidence", evidence.evidence_id)] = evidence
        self.store.usage = BudgetUsage(
            model_requests=usage.model_requests,
            tokens=usage.tokens,
            tool_calls=usage.tool_calls,
            action_effects=usage.action_effects,
        )
        return result


class _Intake:
    def __init__(self) -> None:
        self.recorded: list[Any] = []

    def record_trial_outcome(self, result: Any, *, trial_store: _Store) -> OutcomeObservation:
        assert trial_store.get_object("alpha_trial_result", result.trial_id, object) == result
        self.recorded.append(result)
        failed = result.verdict == "not_met"
        return OutcomeObservation(
            outcome_id=f"outcome-{result.trial_id}",
            source_kind="trial_verifier",
            source_id=result.trial_id,
            source_digest=content_digest(result),
            outcome_kind="verified_failure" if failed else "verified_success",
            capability_scope="repo_task_skill/champion/task/A2@1.0.0",
            task_id="A2",
            goal_id=result.goal_id,
            run_id=result.run_ids[-1],
            trial_id=result.trial_id,
            problem_fingerprint=f"sha256:{trial_store.fingerprint}",
            evidence_ids=result.evidence_ids,
            authority_id=f"authority-{result.trial_id}",
        )

    def triage(self, outcomes: tuple[OutcomeObservation, ...]) -> LearningTriageReceipt:
        case = len(outcomes) == 2
        return LearningTriageReceipt(
            triage_id=f"triage-{len(outcomes)}-{outcomes[-1].outcome_id}",
            gap_id="gap" if case else None,
            outcome_ids=tuple(item.outcome_id for item in outcomes),
            disposition="learning_case" if case else "observe",
            reason="repeated" if case else "observe",
            signal_id="signal" if case else None,
            ticket_id="ticket" if case else None,
            case_id="case" if case else None,
        )


def _module() -> Any:
    assert SCRIPT.is_file(), "the clean live-sample entry point is missing"
    spec = importlib.util.spec_from_file_location("run_alpha_c_live_sample", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _write_prior_receipt(tmp_path: Path) -> Path:
    path = tmp_path / "prior-final-receipt.json"
    path.write_text(
        json.dumps(PRIOR_RECEIPT, ensure_ascii=False, sort_keys=True, indent=2), encoding="utf-8"
    )
    return path


def _dependencies(
    module: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    modes: list[str],
    *,
    drifts: list[str] | None = None,
    fingerprints: list[str] | None = None,
    intake_factory: Any = _Intake,
    prior_receipt: Path | None = None,
    prior_database: Path | None = None,
) -> tuple[Any, list[_Runner]]:
    runners: list[_Runner] = []
    drifts = drifts or ["none"] * len(modes)
    fingerprints = fingerprints or ["same"] * len(modes)

    def runner_factory(_model: Any, root: Path) -> _Runner:
        index = len(runners)
        runner = _Runner(root, index + 1, modes[index], drifts[index], fingerprints[index])
        runners.append(runner)
        return runner

    database = prior_database or tmp_path / "prior-tianwen.db"
    if not database.exists():
        database.write_bytes(b"request-8-database-authority")
    monkeypatch.setattr(module, "PRIOR_DATABASE_SHA256", hashlib.sha256(database.read_bytes()).hexdigest())

    return (
        module.StageDependencies(
            stage_root=tmp_path / "stage",
            prior_receipt=prior_receipt or _write_prior_receipt(tmp_path),
            prior_database=database,
            environment={"DEEPSEEK_API_KEY": "configured-only"},
            model_factory=_Model,
            runner_factory=runner_factory,
            intake_factory=lambda *_args: intake_factory(),
        ),
        runners,
    )


def test_confirmation_uses_approved_budget_and_exact_preview_digest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = _module()
    dependencies, runners = _dependencies(module, tmp_path, monkeypatch, ["success"])
    asyncio.run(module.run_stage(dependencies))

    confirmation = runners[0].confirmations[0]
    assert confirmation.confirmed_via == "approved_goal_budget"
    assert confirmation.preview_digest == content_digest(runners[0].prepared.preview)


@pytest.mark.anyio
async def test_native_model_sends_max_tokens_and_disables_thinking_through_deepseek_mapping(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _module()
    requests: list[dict[str, object]] = []

    async def send(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(
            200,
            request=request,
            json={
                "id": "offline-response",
                "object": "chat.completion",
                "created": 0,
                "model": "deepseek-v4-pro",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "done"},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            },
        )

    monkeypatch.setenv("DEEPSEEK_API_KEY", "offline-contract-key")
    async with httpx.AsyncClient(transport=httpx.MockTransport(send)) as client:
        model = module._native_model(http_client=client)
        await model.request(
            [ModelRequest(parts=[UserPromptPart(content="hello")])],
            None,
            ModelRequestParameters(),
        )

    assert requests == [
        {
            "messages": [{"role": "user", "content": "hello"}],
            "model": "deepseek-v4-pro",
            "max_tokens": 4_096,
            "thinking": {"type": "disabled"},
            "stream": False,
        }
    ]
    assert model.model_id == "deepseek:deepseek-v4-pro"
    assert model.settings == _Model.settings


def test_stage_rejects_a_model_without_the_frozen_nonthinking_mode() -> None:
    module = _module()
    model = SimpleNamespace(
        model_id=_Model.model_id,
        settings={"max_tokens": 4096},
        provider=_Model.provider,
    )

    with pytest.raises(module.StageError, match="fixed model/provider identity"):
        module._validate_model(model)


def test_success_projects_once_without_repeat_or_candidate(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = _module()
    dependencies, runners = _dependencies(module, tmp_path, monkeypatch, ["success"])
    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "no_case_success"
    assert receipt["trial_ids"] == ["trial-1"]
    assert receipt["case_id"] is receipt["candidate_version_id"] is None
    assert receipt["prior_receipt_digest"] == f"sha256:{PRIOR_RECEIPT_SHA256}"
    database_digest = hashlib.sha256(dependencies.prior_database.read_bytes()).hexdigest()
    assert receipt["prior_database_digest"] == f"sha256:{database_digest}"
    assert receipt["prior_audit_upper_cny"] == PRIOR_AUDIT_UPPER_CNY
    assert receipt["current_estimated_cny"] == pytest.approx(0.027)
    assert receipt["cumulative_estimated_cny"] == pytest.approx(PRIOR_AUDIT_UPPER_CNY + 0.027)
    assert receipt["remaining_budget"] == pytest.approx(20.0 - PRIOR_AUDIT_UPPER_CNY - 0.027)
    assert [runner.executions for runner in runners] == [1]


def test_operational_result_never_enters_intake(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = _module()
    dependencies, runners = _dependencies(
        module,
        tmp_path,
        monkeypatch,
        ["operational"],
        intake_factory=lambda: pytest.fail("operational result must not enter Intake"),
    )
    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "non_qualifying_trial"
    assert receipt["outcome_ids"] == []
    assert len(runners) == 1


def test_first_qualifying_failure_is_the_only_path_to_one_independent_repeat(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = _module()
    dependencies, runners = _dependencies(
        module, tmp_path, monkeypatch, ["failure", "success"]
    )
    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "no_case_second_success"
    assert receipt["trial_ids"] == ["trial-1", "trial-2"]
    assert runners[0].store.database != runners[1].store.database
    assert receipt["case_id"] is None


def test_matching_failures_form_at_most_one_case_and_never_a_candidate(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = _module()
    dependencies, runners = _dependencies(
        module, tmp_path, monkeypatch, ["failure", "failure"]
    )
    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "requires_attribution"
    assert receipt["case_id"] == "case"
    assert receipt["candidate_version_id"] is None
    assert len(runners) == 2
    assert receipt["current_estimated_cny"] == pytest.approx(0.054)
    assert receipt["cumulative_estimated_cny"] == pytest.approx(PRIOR_AUDIT_UPPER_CNY + 0.054)


def test_different_failure_fingerprint_stops_without_a_case(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = _module()
    dependencies, runners = _dependencies(
        module,
        tmp_path,
        monkeypatch,
        ["failure", "failure"],
        fingerprints=["first", "second"],
    )

    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "no_case_different_failure"
    assert len(receipt["outcome_ids"]) == 2
    assert receipt["case_id"] is receipt["candidate_version_id"] is None
    assert [runner.executions for runner in runners] == [1, 1]


def test_actual_first_usage_is_repriced_before_admitting_the_second_trial(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = _module()
    dependencies, runners = _dependencies(
        module, tmp_path, monkeypatch, ["high_usage_failure", "success"]
    )

    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "cumulative_budget_prevents_second_trial"
    assert receipt["token_usage"] == 210_000
    assert receipt["cumulative_estimated_cny"] == pytest.approx(PRIOR_AUDIT_UPPER_CNY + 5.67)
    assert len(receipt["outcome_ids"]) == 1
    assert receipt["candidate_version_id"] is None
    assert [runner.executions for runner in runners] == [1]


@pytest.mark.parametrize("drift", ("condition", "champion_version", "champion_digest"))
def test_condition_or_champion_drift_stops_before_second_execute(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, drift: str
) -> None:
    module = _module()
    dependencies, runners = _dependencies(
        module, tmp_path, monkeypatch, ["failure", "failure"], drifts=["none", drift]
    )
    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "condition_drift"
    assert [runner.executions for runner in runners] == [1, 0]


@pytest.mark.parametrize(
    ("mode", "max_cny", "stop", "requests", "tokens"),
    (
        ("prepare_error", 20.0, "infrastructure_preflight_failed", 0, 0),
        ("seed_missing", 20.0, "infrastructure_preflight_failed", 0, 0),
        ("seed_mismatch", 20.0, "infrastructure_preflight_failed", 0, 0),
        ("interrupt", 20.0, "trial_execution_interrupted", 1, 1000),
        ("success", 15.0, "budget_preflight_failed", 0, 0),
    ),
)
def test_budget_and_interruption_bounds_always_write_a_final_receipt(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    max_cny: float,
    stop: str,
    requests: int,
    tokens: int,
) -> None:
    module = _module()
    dependencies, runners = _dependencies(module, tmp_path, monkeypatch, [mode])
    monkeypatch.setattr(module, "MAX_STAGE_CNY", max_cny)
    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == stop
    assert receipt["request_usage"] == requests
    assert receipt["token_usage"] == tokens
    assert receipt["candidate_version_id"] is None
    assert json.loads((dependencies.stage_root / "final-receipt.json").read_text(encoding="utf-8")) == receipt
    assert len(runners) <= 1
    if stop == "infrastructure_preflight_failed":
        assert [runner.executions for runner in runners] == [0]
    elif stop == "budget_preflight_failed":
        assert runners == []
    else:
        assert [runner.executions for runner in runners] == [1]


def test_second_trial_interruption_accounts_for_settled_and_reserved_usage(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = _module()
    dependencies, runners = _dependencies(
        module, tmp_path, monkeypatch, ["failure", "interrupt"]
    )

    receipt = asyncio.run(module.run_stage(dependencies))

    assert receipt["stop"] == "trial_execution_interrupted"
    assert receipt["trial_ids"] == ["trial-1", "trial-2"]
    assert (receipt["request_usage"], receipt["token_usage"]) == (2, 2000)
    assert (receipt["reserved_request_usage"], receipt["reserved_tokens"]) == (1, 500)
    assert receipt["candidate_version_id"] is None
    assert [runner.executions for runner in runners] == [1, 1]


@pytest.mark.parametrize("tamper", ("receipt", "database"))
def test_prior_authority_is_bound_before_the_new_root_is_consumed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, tamper: str
) -> None:
    module = _module()
    prior = _write_prior_receipt(tmp_path)
    database = tmp_path / "prior-tianwen.db"
    database.write_bytes(b"request-8-database-authority")
    dependencies, runners = _dependencies(
        module,
        tmp_path,
        monkeypatch,
        ["success"],
        prior_receipt=prior,
        prior_database=database,
    )
    if tamper == "receipt":
        prior.write_bytes(prior.read_bytes() + b"\n")
    else:
        database.write_bytes(database.read_bytes() + b"tampered")

    with pytest.raises(module.StageError, match="prior Alpha-C audit authority"):
        asyncio.run(module.run_stage(dependencies))

    assert not dependencies.stage_root.exists()
    assert runners == []


def test_prior_fixture_is_the_exact_consumed_receipt(tmp_path: Path) -> None:
    prior = _write_prior_receipt(tmp_path)

    assert hashlib.sha256(prior.read_bytes()).hexdigest() == PRIOR_RECEIPT_SHA256


def test_prior_database_digest_is_the_exact_consumed_authority() -> None:
    module = _module()

    assert module.PRIOR_DATABASE_SHA256 == PRIOR_DATABASE_SHA256
    assert module.PRIOR_RECEIPT_SHA256 == PRIOR_RECEIPT_SHA256
    assert module.PRIOR_AUDIT_UPPER_CNY == PRIOR_AUDIT_UPPER_CNY
    assert module.STAGE_ROOT == Path("D:/DevData/tianwen-alpha-c-live-sample-a2-nonthinking")
