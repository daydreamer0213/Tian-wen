from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from pydantic_ai.models.test import TestModel
from pydantic_ai.tools import ToolDefinition

from tianwen.app import AppError
from tianwen.domain import (
    BudgetLimit,
    EvalProtocol,
    EvidenceRecord,
    ExplorationBrief,
    ExplorationStopReason,
    LoopKind,
    LoopRecord,
    SourceRecord,
    content_digest,
)
from tianwen.evaluation import CaseOutcome, EvalCase


class _WriteFileModel(TestModel):
    def __init__(self) -> None:
        super().__init__(call_tools=["write_file", "run_command"], custom_output_text="completed")

    def gen_tool_args(self, tool_def: Any) -> dict[str, Any]:
        if tool_def.name == "write_file":
            return {"path": "result.txt", "content": "parser version 2"}
        if tool_def.name == "run_command":
            return {"command": "python --version"}
        return super().gen_tool_args(tool_def)


class _ApprovalModel(TestModel):
    def __init__(self) -> None:
        super().__init__(call_tools=["run_command"], custom_output_text="approved command completed")

    def gen_tool_args(self, tool_def: ToolDefinition) -> dict[str, Any]:
        if tool_def.name == "run_command":
            return {"command": "python --version"}
        return super().gen_tool_args(tool_def)


def _protocol() -> EvalProtocol:
    return EvalProtocol(
        protocol_id="vertical-v1",
        task_set_digest="sha256:tasks",
        evaluator_digest="sha256:evaluator",
        harness_digest="sha256:harness",
        tool_digest="sha256:tools",
        budget_digest="sha256:budget",
        environment_digest="sha256:environment",
        model_digest="sha256:model",
    )


def _sealed_evaluator_environment(tmp_path: Path, private: Ed25519PrivateKey) -> dict[str, str]:
    dataset = tmp_path / "sealed-evaluator-only"
    dataset.mkdir()
    (dataset / "cases.json").write_text(
        json.dumps(
            [
                {
                    "case_id": "protocol-fixture-stop-replan",
                    "hard_gates": ["correctness"],
                    "required_clauses": [
                        {
                            "text": "Stop and replan instead of repeating an identical failed verification command.",
                            "gate": "correctness",
                        }
                    ],
                    "forbidden_clauses": [],
                    "quality_weights": {"required": 1.0, "forbidden": 1.0},
                    "token_budget": {"limit": 10000, "gate": "correctness"},
                    "tool_call_budget": {"limit": 3, "gate": "correctness"},
                    "user_interruption_budget": {"limit": 1, "gate": "correctness"},
                    "tool_markers": [],
                    "interruption_markers": [],
                    "over_refusal_clauses": ["cannot help with that"],
                }
            ]
        ),
        encoding="utf-8",
    )
    key_path = tmp_path / "evaluator-private.key"
    key_path.write_text(base64.b64encode(private.private_bytes_raw()).decode("ascii"), encoding="utf-8")
    if os.name == "nt":
        account = subprocess.run(["whoami"], check=True, capture_output=True, text=True).stdout.strip()
        for path, grant in (
            (dataset, f"{account}:(OI)(CI)(RX)"),
            (dataset / "cases.json", f"{account}:(R)"),
            (key_path, f"{account}:(R)"),
        ):
            subprocess.run(["icacls", str(path), "/inheritance:r"], check=True, capture_output=True)
            subprocess.run(["icacls", str(path), "/grant:r", grant], check=True, capture_output=True)
            subprocess.run(
                ["icacls", str(path), "/grant:r", "NT AUTHORITY\\SYSTEM:(F)"], check=True, capture_output=True
            )
    else:
        dataset.chmod(0o700)
        (dataset / "cases.json").chmod(0o600)
        key_path.chmod(0o600)
    return {
        **os.environ,
        "TIANWEN_SEALED_DATASET_DIR": str(dataset),
        "TIANWEN_EVAL_PRIVATE_KEY": str(key_path),
        "TIANWEN_RUNTIME_ACCOUNT": "TIANWEN\\runtime",
    }


def _approval_app(tmp_path: Path, private: Ed25519PrivateKey, data_dir: Path | None = None) -> tuple[Any, Path]:
    from tianwen.app import TianwenApp, TianwenConfig

    workspace = tmp_path / "approval-repo"
    workspace.mkdir(exist_ok=True)
    if not (workspace / ".git").exists():
        subprocess.run(["git", "init"], cwd=workspace, check=True, capture_output=True)
    return (
        TianwenApp(
            TianwenConfig(
                data_dir=data_dir or tmp_path / "approval-state",
                workspace=workspace,
                model=_ApprovalModel(),
                public_evaluator_key=private.public_key(),
                approved_protocol=_protocol(),
                allowed_commands=("python",),
            )
        ),
        workspace,
    )


def test_app_runs_the_governed_local_vertical_slice(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Break caught: removing orchestration would lose authority-bound evidence, frozen runs, and promotion gates."""
    from tianwen.app import TianwenApp, TianwenConfig

    workspace = tmp_path / "repo"
    workspace.mkdir()
    (workspace / "parser.py").write_text(
        "# local parser declaration found: parser version\nPARSER_VERSION = 2\n", encoding="utf-8"
    )
    subprocess.run(["git", "init"], cwd=workspace, check=True, capture_output=True)
    private = Ed25519PrivateKey.generate()
    evaluator_env = _sealed_evaluator_environment(tmp_path, private)
    search = tmp_path / "search.json"
    search.write_text(
        json.dumps([{"title": "Primary", "href": "https://example.org/parser", "body": "snippet"}]),
        encoding="utf-8",
    )
    fetched = tmp_path / "fetched.md"
    fetched.write_text("Parser version 2 is supported.", encoding="utf-8")
    app = TianwenApp(
        TianwenConfig(
            data_dir=tmp_path / "state",
            workspace=workspace,
            model=_WriteFileModel(),
            public_evaluator_key=private.public_key(),
            approved_protocol=_protocol(),
            recorded_search_path=search,
            recorded_fetch_path=fetched,
            allowed_commands=("python",),
            learning_budget=BudgetLimit(model_requests=1, tool_calls=3, tokens=300),
        )
    )
    budget = BudgetLimit(model_requests=2, tool_calls=20, tokens=2000)
    goal_a = app.create_goal(
        objective="Update parser safely",
        criteria=("targeted check passes",),
        workspace=workspace,
        authorization=("workspace_read", "external_read", "workspace_write"),
        budget=budget,
    )
    task_a = app.goal_task(goal_a.goal_id)
    brief = ExplorationBrief(
        brief_id="brief-parser-v2",
        task_id=task_a.task_id,
        question="Which parser version should the task use?",
        decision_use="Choose the parser API.",
        known_evidence_ids=(),
        unknowns=("parser version",),
        allowed_local_roots=(".",),
        allowed_source_classes=("official_documentation",),
        allowed_domains=("example.org",),
        max_searches=1,
        max_fetches=1,
        max_tokens=100,
        max_cost_microunits=10,
        wall_seconds=300,
        expected_outputs=("source-backed answer",),
        sufficiency_criteria=("local parser declaration found",),
        stop_conditions=(ExplorationStopReason.SUFFICIENT, ExplorationStopReason.INSUFFICIENT_EVIDENCE),
    )

    report = app.explore(goal_a.goal_id, brief)

    assert report.stop_reason is ExplorationStopReason.SUFFICIENT
    assert report.answered_unknowns == ("parser version",)
    assert report.remaining_unknowns == ()
    assert fetched.read_text(encoding="utf-8") not in json.dumps(app.goal_evidence_packet(goal_a.goal_id))
    sources = app.store.list_objects("source", SourceRecord)
    evidence = app.store.list_objects("evidence", EvidenceRecord)
    assert len(sources) >= 2
    assert len(evidence) >= 2
    assert all(source.action_id for source in sources)
    assert all(item.evidence_type != "search_snippet" for item in evidence)

    waiting = app.run_repo_task(goal_a.goal_id, workspace, "Write the selected parser version.")
    checkpoint_id = waiting.removeprefix("waiting_approval:")
    approvals = {action_id: True for action_id, *_ in app.pending_approval(checkpoint_id)}
    output = app.resume_approval(checkpoint_id, approvals)
    run_a = app.last_run(goal_a.goal_id)
    champion = app.active_version("repo-task")
    assert output == "completed"
    assert run_a.manifest.skill_versions["repo_task"] == champion
    assert app.store.unresolved_actions(run_a.run_id) == []
    user_root = app.store.get_object("loop", task_a.loop_id, LoopRecord)
    execution_evidence = app.execution_evidence(run_a.run_id)
    assert {item.evidence_type for item in execution_evidence} >= {
        "execution_diff",
        "execution_test",
        "execution_cost",
    }
    assert all(item.action_id and item.provenance_ids == (item.action_id,) for item in execution_evidence)
    cost = next(item for item in execution_evidence if item.evidence_type == "execution_cost")
    run_usage = app.store.get_run_budget_usage(run_a.run_id)
    _limit, global_usage, _reserved = app.store.get_budget(task_a.loop_id)
    assert user_root.parent_loop_id is None
    assert cost.source_class == "runtime_budget_usage"
    assert cost.summary == f"budget usage tool_calls={run_usage.tool_calls} action_effects={run_usage.action_effects}"
    assert global_usage.tool_calls >= run_usage.tool_calls
    assert global_usage.action_effects >= run_usage.action_effects
    evidence_ids = {item.evidence_id for item in execution_evidence}
    app._project_run_outcomes(goal_a.goal_id, run_a.run_id)
    assert {item.evidence_id for item in app.execution_evidence(run_a.run_id)} == evidence_ids
    assert app.store.get_run_budget_usage(run_a.run_id) == run_usage
    telemetry = app.meta_telemetry(goal_a.goal_id)
    assert telemetry
    assert all("Write the selected" not in item.model_dump_json() for item in telemetry)

    meta_goal = app.create_goal(
        objective="Supervise bounded learning",
        criteria=("record only meta telemetry",),
        workspace=workspace,
        authorization=("workspace_read",),
        budget=budget,
        kind=LoopKind.META,
    )
    meta_loop = app.meta_loop(meta_goal.goal_id)
    ticket_id = app.record_learning_signal_on_loop(
        meta_loop.loop_id,
        category="repeated_failed_verification",
        severity=4,
        recurrence=2,
        evidence_ids=tuple(item.evidence_id for item in evidence[:1]),
    )
    assert ticket_id is not None
    learning_ticket = app.process_learning(meta_loop.loop_id)
    assert learning_ticket is not None
    assert app.process_learning(meta_loop.loop_id) is None
    case = app.create_learning_case(learning_ticket)
    attribution = app.record_learning_attribution(
        case.case_id,
        hypotheses=("verification loop lacks a stop condition", "diagnostics were unavailable"),
        earliest_divergence="after identical failed verification",
        mutation_target="repo_task_skill",
        rejected_targets=("runtime",),
    )
    lesson = app.accept_protocol_fixture_lesson(case.case_id, tuple(item.evidence_id for item in evidence[:1]))
    challenger = app.create_protocol_fixture_candidate(learning_ticket, lesson.lesson_id)
    assert case.loop_id != meta_loop.loop_id
    assert app.learning_loop(learning_ticket).parent_loop_id == meta_loop.loop_id
    assert attribution.case_id == case.case_id

    public = app.run_public_candidate_comparison(
        challenger.version_id,
        (
            EvalCase(
                case_id="protocol-fixture-public",
                category="protocol_fixture",
                acceptance=("bounded",),
                hard_gates=("correctness",),
            ),
        ),
        execute=lambda artifact, case: CaseOutcome(
            case_id=case.case_id,
            passed=True,
            hard_gate_failures=(),
            quality=2 if artifact.version_id == challenger.version_id else 1,
            tokens=1,
            tool_calls=1,
            user_interruptions=0,
            over_refused=False,
        ),
    )
    assert public.hard_gate_passed is True
    with pytest.raises(AppError, match="waiting for external evaluator receipt"):
        app.evaluate_candidate(challenger.version_id)
    request = app.pending_eval_request(challenger.version_id)
    assert request is not None
    assert (request.protocol_id, request.champion_version_id, request.challenger_version_id) == (
        _protocol().protocol_id,
        champion,
        challenger.version_id,
    )
    receipt_path = Path(request.receipt_path)
    completed = subprocess.run(
        [
            sys.executable,
            "evaluator/run_sealed_evaluator.py",
            request.champion_snapshot,
            request.challenger_snapshot,
            str(Path(request.champion_snapshot).with_name("protocol.json")),
            request.challenge,
            str(receipt_path),
        ],
        check=False,
        capture_output=True,
        text=True,
        cwd=Path(__file__).parents[2],
        env=evaluator_env,
    )
    assert completed.returncode == 0, completed.stderr
    forged = tmp_path / "forged-receipt.json"
    forged_body = receipt_path.read_text(encoding="utf-8").replace(
        '"hard_gate_passed":true', '"hard_gate_passed":false'
    )
    forged.write_text(forged_body, encoding="utf-8")
    with pytest.raises(AppError):
        app.import_eval_receipt(forged)
    assert app.pending_eval_request(challenger.version_id).request_id == request.request_id
    eval_run = app.evaluate_candidate(challenger.version_id)
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    request_id, challenge = app.request_promotion(challenger.version_id)
    with pytest.raises(AppError):
        app.confirm_promotion(request_id, "alice", "forged")
    app.confirm_promotion(request_id, "alice", challenge)

    goal_b = app.create_goal(
        objective="Follow up stop/replan regression",
        criteria=("write result",),
        workspace=workspace,
        authorization=("workspace_read", "workspace_write"),
        budget=budget,
    )
    request_b = "Follow up: exercise the stop/replan regression."
    waiting_b = app.run_repo_task(goal_b.goal_id, workspace, request_b)
    checkpoint_b = waiting_b.removeprefix("waiting_approval:")
    app.resume_approval(checkpoint_b, {action_id: True for action_id, *_ in app.pending_approval(checkpoint_b)})
    run_b = app.last_run(goal_b.goal_id)
    observation = app.record_capability(
        challenger.version_id,
        task_type="stop_replan_regression",
        environment="local-protocol-fixture",
        tools=("write_file", "run_command"),
        risk="bounded",
        outcome="succeeded",
        cost=2,
        evidence_ids=tuple(item.evidence_id for item in app.execution_evidence(run_b.run_id)),
    )
    assert goal_a.goal_id != goal_b.goal_id
    assert app.goal_task(goal_a.goal_id).loop_id != app.meta_loop(goal_a.goal_id).loop_id
    assert app.meta_loop(goal_a.goal_id).parent_loop_id is None
    assert run_b.manifest.skill_versions["repo_task"] == challenger.version_id
    assert run_b.manifest.prompt_digest != run_a.manifest.prompt_digest
    assert app.store.unresolved_actions(run_b.run_id) == []
    assert all(request_b not in item.model_dump_json() for item in app.meta_telemetry(goal_b.goal_id))
    assert app.lookup_capability(
        challenger.version_id,
        "stop_replan_regression",
        "local-protocol-fixture",
        ("write_file", "run_command"),
        "bounded",
    ) == (observation,)
    app.rollback("repo-task", "alice", "protocol fixture rollback")
    assert app.active_version("repo-task") == champion
    goal_c = app.create_goal(
        objective="Verify rollback champion",
        criteria=("write result",),
        workspace=workspace,
        authorization=("workspace_read", "workspace_write"),
        budget=budget,
    )
    app.run_repo_task(goal_c.goal_id, workspace, "Write the selected parser version.")
    assert app.last_run(goal_c.goal_id).manifest.skill_versions["repo_task"] == champion
    assert eval_run.challenger_version_id == challenger.version_id


def _exploration_app(tmp_path: Path) -> tuple[Any, Path]:
    from tianwen.app import TianwenApp, TianwenConfig

    workspace = tmp_path / "repo"
    workspace.mkdir()
    (workspace / "parser.py").write_text(
        "# local parser declaration found: parser version\nPARSER_VERSION = 2\n", encoding="utf-8"
    )
    subprocess.run(["git", "init"], cwd=workspace, check=True, capture_output=True)
    private = Ed25519PrivateKey.generate()
    return (
        TianwenApp(
            TianwenConfig(
                data_dir=tmp_path / "state",
                workspace=workspace,
                model=_WriteFileModel(),
                public_evaluator_key=private.public_key(),
                approved_protocol=_protocol(),
                allowed_commands=("python",),
            )
        ),
        workspace,
    )


def _brief(task_id: str, brief_id: str, unknowns: tuple[str, ...]) -> ExplorationBrief:
    return ExplorationBrief(
        brief_id=brief_id,
        task_id=task_id,
        question="Which parser version should the task use?",
        decision_use="Choose the parser API.",
        known_evidence_ids=(),
        unknowns=unknowns,
        allowed_local_roots=(".",),
        allowed_source_classes=(),
        allowed_domains=(),
        max_searches=len(unknowns),
        max_fetches=0,
        max_tokens=100,
        max_cost_microunits=10,
        wall_seconds=300,
        expected_outputs=("source-backed answer",),
        sufficiency_criteria=("local parser declaration found",),
        stop_conditions=(ExplorationStopReason.SUFFICIENT, ExplorationStopReason.INSUFFICIENT_EVIDENCE),
    )


def test_exploration_only_answers_unknowns_covered_by_governed_evidence(tmp_path: Path) -> None:
    """Break caught: one finding must not mark unrelated unknowns as resolved."""
    app, workspace = _exploration_app(tmp_path)
    budget = BudgetLimit(model_requests=2, tool_calls=20, tokens=2000)
    goal = app.create_goal(
        objective="Choose parser facts",
        criteria=("write result",),
        workspace=workspace,
        authorization=("workspace_read", "workspace_write"),
        budget=budget,
    )
    unknowns = ("parser version", "definitely_absent_review_token")

    insufficient = app.explore(goal.goal_id, _brief(app.goal_task(goal.goal_id).task_id, "brief-partial", unknowns))

    assert insufficient.stop_reason is ExplorationStopReason.INSUFFICIENT_EVIDENCE
    assert insufficient.answered_unknowns == ("parser version",)
    assert insufficient.remaining_unknowns == ("definitely_absent_review_token",)
    assert "remain" in insufficient.planning_impact

    (workspace / "review.txt").write_text("definitely_absent_review_token\n", encoding="utf-8")
    sufficient = app.explore(goal.goal_id, _brief(app.goal_task(goal.goal_id).task_id, "brief-complete", unknowns))

    assert sufficient.stop_reason is ExplorationStopReason.SUFFICIENT
    assert sufficient.answered_unknowns == unknowns
    assert sufficient.remaining_unknowns == ()


def test_exploration_coverage_requires_substantive_evidence() -> None:
    from tianwen.app import TianwenApp

    evidence = EvidenceRecord(
        evidence_id="evidence:test",
        run_id="run:test",
        evidence_type="local_finding",
        result_class="success",
        effect_class="read_only",
        version_bucket="current",
        cost_bucket="none",
        needed_user=False,
        safety_category="safe",
        summary="An unrelated summary and title.",
        payload_digest="sha256:test",
        scope="test",
        purpose="goal_exploration",
        source_class="local_repository",
        sensitivity="internal",
        provenance_ids=("source:test",),
    )
    source = SourceRecord(
        source_id="source:test",
        run_id="run:test",
        action_id="action:test",
        source_class="local_repository",
        locator="https://example.org",
        publisher_or_repository="example.org",
        title="Unrelated title",
        retrieved_at=datetime.now(UTC),
        content_digest="sha256:test",
        scope="test",
        purpose="goal_exploration",
        fully_read=False,
        trust_status="local",
    )
    app = object.__new__(TianwenApp)

    assert not app._covered_by_evidence("example org", (evidence,), (source,))
    assert not app._covered_by_evidence("the", (evidence.model_copy(update={"summary": "the"}),), ())
    assert app._covered_by_evidence(
        "parser version", (evidence.model_copy(update={"summary": "parser version 2"}),), ()
    )


def test_goal_evidence_packet_is_isolated_in_execution_manifest(tmp_path: Path) -> None:
    """Break caught: evidence from Goal A must never alter Goal B's execution prompt."""
    app, workspace = _exploration_app(tmp_path)
    budget = BudgetLimit(model_requests=2, tool_calls=20, tokens=2000)
    goal_a = app.create_goal(
        objective="Explore parser facts",
        criteria=("write result",),
        workspace=workspace,
        authorization=("workspace_read", "workspace_write"),
        budget=budget,
    )
    app.explore(goal_a.goal_id, _brief(app.goal_task(goal_a.goal_id).task_id, "brief-a", ("parser version",)))
    goal_b = app.create_goal(
        objective="Write parser result",
        criteria=("write result",),
        workspace=workspace,
        authorization=("workspace_read", "workspace_write"),
        budget=budget,
    )
    request = "Write the selected parser version."
    empty_packet = app.goal_evidence_packet(goal_b.goal_id)

    assert empty_packet == {"sources": (), "evidence": ()}
    app.run_repo_task(goal_b.goal_id, workspace, request)
    first_run = app.last_run(goal_b.goal_id)
    assert first_run.manifest.prompt_digest == content_digest(
        {"goal_id": goal_b.goal_id, "request": request, "evidence_packet": empty_packet}
    )

    (workspace / "additional.txt").write_text("parser version\n", encoding="utf-8")
    app.explore(goal_a.goal_id, _brief(app.goal_task(goal_a.goal_id).task_id, "brief-a-more", ("parser version",)))
    app.run_repo_task(goal_b.goal_id, workspace, request)
    second_run = app.last_run(goal_b.goal_id)

    assert app.goal_evidence_packet(goal_b.goal_id) == empty_packet
    assert second_run.manifest.prompt_digest == first_run.manifest.prompt_digest


def test_app_resumes_exact_approval_once_from_a_new_process_instance(tmp_path: Path) -> None:
    """Break caught: removing frozen runtime controls would permit a restarted App to resume with changed authority."""
    private = Ed25519PrivateKey.generate()
    app, workspace = _approval_app(tmp_path, private)
    goal = app.create_goal(
        objective="Run a reviewed command",
        criteria=("command completes",),
        workspace=workspace,
        authorization=("workspace_read", "workspace_write"),
        budget=BudgetLimit(model_requests=2, tool_calls=20, tokens=2000),
    )

    waiting = app.run_repo_task(goal.goal_id, workspace, "Run the reviewed command.")
    checkpoint_id = waiting.removeprefix("waiting_approval:")
    checkpoint = app.store.get_checkpoint(checkpoint_id)
    action_id = next(iter(checkpoint.state["action_to_tool_call"]))
    resumed, _ = _approval_app(tmp_path, private, app.data_dir)

    assert resumed.resume_approval(checkpoint_id, {action_id: True}) == "approved command completed"
    assert resumed.store.count_actions(checkpoint.run_id, "run_command") == 1


def test_app_rejects_incomplete_or_extra_approval_decisions(tmp_path: Path) -> None:
    """Break caught: accepting a partial or foreign decision can silently approve an unintended pending action."""
    private = Ed25519PrivateKey.generate()
    app, workspace = _approval_app(tmp_path, private)
    goal = app.create_goal(
        objective="Run a reviewed command",
        criteria=("command completes",),
        workspace=workspace,
        authorization=("workspace_read", "workspace_write"),
        budget=BudgetLimit(model_requests=2, tool_calls=20, tokens=2000),
    )
    checkpoint_id = app.run_repo_task(goal.goal_id, workspace, "Run the reviewed command.").removeprefix(
        "waiting_approval:"
    )
    action_id = next(iter(app.store.get_checkpoint(checkpoint_id).state["action_to_tool_call"]))

    with pytest.raises(AppError, match="exactly"):
        app.resume_approval(checkpoint_id, {})
    with pytest.raises(AppError, match="exactly"):
        app.resume_approval(checkpoint_id, {action_id: True, "action:extra": False})


def _cli_env(key_path: Path | None) -> dict[str, str]:
    env = os.environ.copy()
    if key_path is None:
        env.pop("TIANWEN_EVALUATOR_PUBLIC_KEY", None)
    else:
        env["TIANWEN_EVALUATOR_PUBLIC_KEY"] = str(key_path)
    return env


def _write_public_key(path: Path, private: Ed25519PrivateKey) -> Path:
    path.write_bytes(private.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo))
    return path


def test_cli_requires_stable_public_key_and_reopens_same_state(tmp_path: Path) -> None:
    """Break caught: a random fallback key makes state restartable but evaluator trust unverifiable."""
    workspace = tmp_path / "cli-repo"
    workspace.mkdir()
    state = tmp_path / "state"
    private = Ed25519PrivateKey.generate()
    key = _write_public_key(tmp_path / "evaluator-public.pem", private)
    command = [sys.executable, "-m", "tianwen", "--data-dir", str(state), "--workspace", str(workspace)]

    missing = subprocess.run(
        [*command, "status", "--goal", "goal:missing"], text=True, capture_output=True, env=_cli_env(None)
    )
    assert missing.returncode == 2
    assert "TIANWEN_EVALUATOR_PUBLIC_KEY" in missing.stderr
    assert "Traceback" not in missing.stderr

    missing_goal = subprocess.run(
        [*command, "status", "--goal", "goal:missing"], text=True, capture_output=True, env=_cli_env(key)
    )
    assert missing_goal.returncode == 2
    assert "missing goal" in missing_goal.stderr
    assert "Traceback" not in missing_goal.stderr

    created = subprocess.run(
        [
            sys.executable,
            "-c",
            "from io import StringIO; import sys; from tianwen.cli import main; "
            "sys.stdin = type('TTY', (StringIO,), {'isatty': lambda self: True})('yes\\n'); "
            f"raise SystemExit(main({command[3:]!r} + "
            "['goal-create', '--objective', 'stable key', '--criterion', 'works']))",
        ],
        text=True,
        capture_output=True,
        env=_cli_env(key),
    )
    assert created.returncode == 0, created.stderr
    goal_id = re.search(r"goal:[A-Za-z0-9_-]+", created.stdout).group(0)
    reopened = subprocess.run(
        [*command, "status", "--goal", goal_id], text=True, capture_output=True, env=_cli_env(key)
    )
    assert reopened.returncode == 0, reopened.stderr

    wrong = _write_public_key(tmp_path / "wrong-public.pem", Ed25519PrivateKey.generate())
    rejected = subprocess.run(
        [*command, "status", "--goal", goal_id], text=True, capture_output=True, env=_cli_env(wrong)
    )
    assert rejected.returncode == 2
    assert "public evaluator key" in rejected.stderr
    assert "Traceback" not in rejected.stderr


def test_cli_approve_requires_tty_and_readme_argument_order_parses(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Break caught: noninteractive consent or README argument order could bypass the intended command boundary."""
    from tianwen.cli import build_parser, main

    parser = build_parser()
    parsed = parser.parse_args(
        ["--workspace", str(tmp_path), "--data-dir", str(tmp_path / "state"), "status", "--goal", "goal:example"]
    )
    assert parsed.command == "status"
    key = _write_public_key(tmp_path / "evaluator-public.pem", Ed25519PrivateKey.generate())
    monkeypatch.setenv("TIANWEN_EVALUATOR_PUBLIC_KEY", str(key))
    monkeypatch.setattr(sys, "stdin", StringIO(""))

    assert main(["approve", "--checkpoint", "checkpoint:example"]) == 2
