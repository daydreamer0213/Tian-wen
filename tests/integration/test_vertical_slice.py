from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from pydantic_ai.models.test import TestModel

from tianwen.app import AppError
from tianwen.domain import (
    BudgetLimit,
    EvalProtocol,
    EvidenceRecord,
    ExplorationBrief,
    ExplorationStopReason,
    SourceRecord,
)
from tianwen.evaluation import CaseOutcome, EvalCase, run_public_comparison


class _WriteFileModel(TestModel):
    def gen_tool_args(self, tool_def: Any) -> dict[str, Any]:
        if tool_def.name == "write_file":
            return {"path": "result.txt", "content": "parser version 2"}
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


def _receipt_script(path: Path) -> Path:
    script = path / "sealed_evaluator.py"
    script.write_text(
        """import base64, json, os, sys
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from tianwen.domain import EvalReceipt, utc_now
from tianwen.evaluation import receipt_canonical_bytes
request = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
key = Ed25519PrivateKey.from_private_bytes(Path(os.environ['TEST_EVALUATOR_KEY_PATH']).read_bytes())
receipt = EvalReceipt(
    receipt_id='sealed-receipt', request_id=request['request_id'], protocol_id=request['protocol_id'],
    champion_digest=request['champion_digest'], challenger_digest=request['challenger_digest'],
    challenge=request['challenge'], hard_gate_passed=True,
    metrics={'correctness': 1.0, 'safety': 0.0, 'over_refusal': 0.0, 'quality': 1.0,
             'tokens': 0.0, 'tool_calls': 0.0, 'user_interruptions': 0.0,
             'quality_delta': 1.0, 'safety_delta': 0.0, 'over_refusal_delta': 0.0},
    failure_categories=(), issued_at=utc_now(), signature_b64='',
)
signature = base64.b64encode(key.sign(receipt_canonical_bytes(receipt))).decode('ascii')
receipt = receipt.model_copy(update={'signature_b64': signature})
Path(sys.argv[2]).write_text(receipt.model_dump_json(), encoding='utf-8')
""",
        encoding="utf-8",
    )
    return script


def test_app_runs_the_governed_local_vertical_slice(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Break caught: removing orchestration would lose authority-bound evidence, frozen runs, and promotion gates."""
    from tianwen.app import TianwenApp, TianwenConfig

    workspace = tmp_path / "repo"
    workspace.mkdir()
    (workspace / "parser.py").write_text("# parser version\nPARSER_VERSION = 2\n", encoding="utf-8")
    subprocess.run(["git", "init"], cwd=workspace, check=True, capture_output=True)
    private = Ed25519PrivateKey.generate()
    sealed = tmp_path / "sealed-evaluator-only"
    sealed.mkdir()
    key_path = sealed / "private.key"
    key_path.write_bytes(private.private_bytes_raw())
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
            model=_WriteFileModel(call_tools=["write_file"], custom_output_text="completed"),
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
    sources = app.store.list_objects("source", SourceRecord)
    evidence = app.store.list_objects("evidence", EvidenceRecord)
    assert len(sources) >= 2
    assert len(evidence) >= 2
    assert all(source.action_id for source in sources)
    assert all(item.evidence_type != "search_snippet" for item in evidence)

    output = app.run_repo_task(goal_a.goal_id, workspace, "Write the selected parser version.")
    run_a = app.last_run(goal_a.goal_id)
    champion = app.active_version("repo-task")
    assert output == "completed"
    assert run_a.manifest.skill_versions["repo_task"] == champion
    assert app.store.unresolved_actions(run_a.run_id) == []
    with app.store._connect() as connection:
        telemetry = connection.execute("SELECT body_json FROM tw_objects WHERE kind = 'meta_telemetry'").fetchall()
    assert telemetry
    assert all("Write the selected" not in row["body_json"] for row in telemetry)

    ticket_id = app.record_learning_signal(
        goal_a.goal_id,
        category="repeated_failed_verification",
        severity=4,
        recurrence=2,
        evidence_ids=tuple(item.evidence_id for item in evidence[:1]),
    )
    assert ticket_id is not None
    learning_ticket = app.process_learning(app.meta_loop(goal_a.goal_id).loop_id)
    assert learning_ticket is not None
    assert app.process_learning(app.meta_loop(goal_a.goal_id).loop_id) is None
    case = app.create_learning_case(learning_ticket)
    lesson = app.accept_protocol_fixture_lesson(case.case_id, tuple(item.evidence_id for item in evidence[:1]))
    challenger = app.create_protocol_fixture_candidate(learning_ticket, lesson.lesson_id)

    champion_artifact = app.artifact(champion)
    challenger_artifact = app.artifact(challenger.version_id)
    public = run_public_comparison(
        _protocol(),
        champion_artifact,
        challenger_artifact,
        (EvalCase(case_id="public", category="recovery", acceptance=("bounded",), hard_gates=("correctness",)),),
        lambda _artifact, _case: CaseOutcome(
            case_id=_case.case_id,
            passed=True,
            hard_gate_failures=(),
            quality=2 if _artifact.version_id == challenger.version_id else 1,
            tokens=1,
            tool_calls=1,
            user_interruptions=0,
            over_refused=False,
        ),
    )
    assert public.hard_gate_passed is True
    request = app.create_eval_request(challenger.version_id)
    receipt_path = tmp_path / "receipt.json"
    script = _receipt_script(tmp_path)
    evaluator_env = {**os.environ, "TEST_EVALUATOR_KEY_PATH": str(key_path)}
    subprocess.run(
        [
            sys.executable,
            str(script),
            str(app.eval_request_path(request.request_id)),
            str(receipt_path),
        ],
        check=True,
        capture_output=True,
        env=evaluator_env,
    )
    forged = tmp_path / "forged-receipt.json"
    forged_body = receipt_path.read_text(encoding="utf-8").replace("sealed-receipt", "forged-receipt")
    forged.write_text(forged_body, encoding="utf-8")
    with pytest.raises(AppError):
        app.import_eval_receipt(forged)
    eval_run = app.import_eval_receipt(receipt_path)
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    request_id, challenge = app.request_promotion(challenger.version_id)
    with pytest.raises(AppError):
        app.confirm_promotion(request_id, "alice", "forged")
    app.confirm_promotion(request_id, "alice", challenge)

    goal_b = app.create_goal(
        objective="Verify a second parser change",
        criteria=("write result",),
        workspace=workspace,
        authorization=("workspace_read", "workspace_write"),
        budget=budget,
    )
    app.run_repo_task(goal_b.goal_id, workspace, "Write the selected parser version.")
    run_b = app.last_run(goal_b.goal_id)
    assert goal_a.goal_id != goal_b.goal_id
    assert app.goal_task(goal_a.goal_id).loop_id != app.meta_loop(goal_a.goal_id).loop_id
    assert app.meta_loop(goal_a.goal_id).parent_loop_id is None
    assert run_b.manifest.skill_versions["repo_task"] == challenger.version_id
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
